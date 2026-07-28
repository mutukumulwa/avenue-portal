import { prisma } from "@/lib/prisma";
import { createHash } from "node:crypto";
import { CaseService } from "@/server/services/case.service";
import { looksLowLevel } from "@/lib/safe-action-error";
import {
  parseCaseServiceBatchV1,
  mapCaseServiceRecordV1,
  recordHashV1,
  CASE_SERVICE_MAPPING_VERSION,
  type CaseServiceRecordV1,
} from "./mappers/case-service-v1";

/**
 * PNOS F9.5 — route an ACCEPTED inbound delivery's records through the CANONICAL
 * domain service (CASE_SERVICE → CaseService.addServiceEntry). NO direct domain
 * table writes: every applied record goes through the canonical service, exactly
 * as the legacy hms-batch did — but now each record gets its own durable
 * ProviderIntegrationRecordResult and the delivery aggregate conserves row/amount
 * totals. Reprocessing is idempotent (effects once) and a mixed batch produces a
 * partial outcome without a poison record aborting the good rows.
 *
 * Stop (F9.5): one object type only (CASE_SERVICE). PA/claim/case-activity add the
 * same way behind their own versioned mapper.
 */

const PROCESSABLE = new Set(["ACCEPTED", "PARTIAL", "RETRYING"]);
const OBJECT_TYPE = "CASE_SERVICE";

type DeliveryScope = {
  id: string;
  tenantId: string;
  providerId: string;
  providerBranchId: string;
  businessObjectType: string;
  status: string;
  normalizedPayloadHash: string;
};

type RecordOutcome = "APPLIED" | "REPLAYED" | "UNMATCHED" | "REJECTED" | "QUARANTINED" | "RETRYING";

export interface ProcessReport {
  deliveryId: string;
  mappingVersion: string;
  total: number;
  applied: number;
  replayed: number;
  unmatched: number;
  rejected: number;
  quarantined: number;
  retrying: number;
  appliedAmount: string; // 2dp Decimal string — the conserved applied total
  status: string;
}

export class DeliveryProcessError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "DeliveryProcessError";
  }
}

async function matchOpenCase(delivery: DeliveryScope, match: { caseNumber?: string; memberNumber?: string }) {
  // provider (+ optional branch) scope is server-derived from the delivery.
  const branch = delivery.providerBranchId ? { providerBranchId: delivery.providerBranchId } : {};
  if (match.caseNumber) {
    return prisma.clinicalCase.findFirst({
      where: { tenantId: delivery.tenantId, caseNumber: match.caseNumber, providerId: delivery.providerId, status: { in: ["OPEN", "PENDING_CLOSURE"] }, ...branch },
      select: { id: true },
    });
  }
  if (match.memberNumber) {
    const open = await prisma.clinicalCase.findMany({
      where: { tenantId: delivery.tenantId, providerId: delivery.providerId, status: { in: ["OPEN", "PENDING_CLOSURE"] }, member: { memberNumber: match.memberNumber }, ...branch },
      select: { id: true },
      take: 2,
    });
    return open.length === 1 ? open[0] : null; // ambiguous ⇒ unmatched, never guessed
  }
  return null;
}

async function recordResult(
  delivery: DeliveryScope,
  recordHash: string,
  index: number,
  res: { outcome: RecordOutcome; canonicalEntityId?: string; amount?: number; safeReason?: string },
) {
  await prisma.providerIntegrationRecordResult.upsert({
    where: { deliveryId_recordHash: { deliveryId: delivery.id, recordHash } },
    create: {
      tenantId: delivery.tenantId,
      deliveryId: delivery.id,
      recordIndex: index,
      recordHash,
      businessObjectType: OBJECT_TYPE,
      outcome: res.outcome,
      canonicalEntityType: res.canonicalEntityId ? "CaseServiceEntry" : null,
      canonicalEntityId: res.canonicalEntityId ?? null,
      amount: res.amount !== undefined ? res.amount.toFixed(2) : null,
      safeReason: res.safeReason ?? null,
    },
    update: {
      outcome: res.outcome,
      canonicalEntityType: res.canonicalEntityId ? "CaseServiceEntry" : null,
      canonicalEntityId: res.canonicalEntityId ?? null,
      amount: res.amount !== undefined ? res.amount.toFixed(2) : null,
      safeReason: res.safeReason ?? null,
    },
  });
}

async function processRecord(delivery: DeliveryScope, record: CaseServiceRecordV1, index: number): Promise<{ outcome: RecordOutcome; amount?: number }> {
  const recordHash = recordHashV1(record);
  const ref = `${delivery.id}#${recordHash}`;

  // Idempotency: a terminal result already exists ⇒ replay (canonical effect once).
  const existing = await prisma.providerIntegrationRecordResult.findFirst({
    where: { deliveryId: delivery.id, recordHash },
    select: { outcome: true, amount: true },
  });
  if (existing && existing.outcome !== "RETRYING") {
    return { outcome: "REPLAYED", amount: existing.amount ? Number(existing.amount) : 0 };
  }

  const mapped = mapCaseServiceRecordV1(record);
  if ("error" in mapped) {
    await recordResult(delivery, recordHash, index, { outcome: "REJECTED", safeReason: mapped.error });
    return { outcome: "REJECTED" };
  }

  const openCase = await matchOpenCase(delivery, mapped.match);
  if (!openCase) {
    await recordResult(delivery, recordHash, index, { outcome: "UNMATCHED", safeReason: "no single open case at this facility" });
    return { outcome: "UNMATCHED" };
  }

  // Crash recovery: the canonical entry was already created for this ref (a crash
  // between apply and result) ⇒ adopt it, never apply twice.
  const prior = await prisma.caseServiceEntry.findFirst({ where: { hmsBatchRef: ref }, select: { id: true, totalAmount: true } });
  if (prior) {
    const amount = Number(prior.totalAmount);
    await recordResult(delivery, recordHash, index, { outcome: "APPLIED", canonicalEntityId: prior.id, amount });
    return { outcome: "APPLIED", amount };
  }

  try {
    const entry = await CaseService.addServiceEntry({
      tenantId: delivery.tenantId,
      caseId: openCase.id,
      entryDate: mapped.canonical.entryDate,
      category: mapped.canonical.category,
      serviceCode: mapped.canonical.serviceCode,
      description: mapped.canonical.description,
      quantity: mapped.canonical.quantity,
      unitAmount: mapped.canonical.unitAmount,
      source: "HMS_BATCH",
      hmsBatchRef: ref,
    });
    const amount = Number(entry.totalAmount);
    await recordResult(delivery, recordHash, index, { outcome: "APPLIED", canonicalEntityId: entry.id, amount });
    return { outcome: "APPLIED", amount };
  } catch (e) {
    // Classify: transient/infra ⇒ retryable (leave non-terminal for the F9.6
    // sweeper); a deterministic data/business failure ⇒ poison ⇒ quarantine.
    if (e instanceof Error && looksLowLevel(e)) {
      await recordResult(delivery, recordHash, index, { outcome: "RETRYING", safeReason: "transient error — will retry" });
      return { outcome: "RETRYING" };
    }
    await recordResult(delivery, recordHash, index, { outcome: "QUARANTINED", safeReason: e instanceof Error ? e.message : "apply failed" });
    return { outcome: "QUARANTINED" };
  }
}

export const CaseServiceDeliveryProcessor = {
  MAPPING_VERSION: CASE_SERVICE_MAPPING_VERSION,
  OBJECT_TYPE,

  /**
   * Process an ACCEPTED CASE_SERVICE delivery. `rawBody` must be the exact body the
   * F9.4 receipt hashed (integrity-checked). Returns a conserved per-outcome report.
   */
  async process(deliveryId: string, rawBody: string): Promise<ProcessReport> {
    const delivery = await prisma.providerIntegrationDelivery.findFirst({
      where: { id: deliveryId },
      select: { id: true, tenantId: true, providerId: true, providerBranchId: true, businessObjectType: true, status: true, normalizedPayloadHash: true },
    });
    if (!delivery) throw new DeliveryProcessError("NOT_FOUND", "No such delivery");
    if (delivery.businessObjectType !== OBJECT_TYPE) throw new DeliveryProcessError("WRONG_TYPE", `This processor handles ${OBJECT_TYPE}, not ${delivery.businessObjectType}`);
    if (!PROCESSABLE.has(delivery.status)) throw new DeliveryProcessError("NOT_PROCESSABLE", `Delivery is ${delivery.status}; only ${[...PROCESSABLE].join("/")} are processable`);

    // Integrity: the body must be exactly the one the receipt committed to.
    const hash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    if (hash !== delivery.normalizedPayloadHash) throw new DeliveryProcessError("HASH_MISMATCH", "Body does not match the delivery receipt hash");

    let records: CaseServiceRecordV1[];
    try {
      records = parseCaseServiceBatchV1(JSON.parse(rawBody));
    } catch (e) {
      // A structural envelope failure rejects the WHOLE delivery — nothing applied.
      await prisma.providerIntegrationDelivery.update({
        where: { id: delivery.id },
        data: { status: "REJECTED", quarantineReason: e instanceof Error ? e.message : "unparseable batch", completedAt: new Date() },
      });
      throw new DeliveryProcessError("SCHEMA", e instanceof Error ? e.message : "unparseable batch");
    }

    let applied = 0, replayed = 0, unmatched = 0, rejected = 0, quarantined = 0, retrying = 0;
    let appliedAmount = 0;
    for (let i = 0; i < records.length; i++) {
      const r = await processRecord(delivery, records[i], i);
      switch (r.outcome) {
        case "APPLIED": applied++; appliedAmount += r.amount ?? 0; break;
        case "REPLAYED": replayed++; appliedAmount += r.amount ?? 0; break;
        case "UNMATCHED": unmatched++; break;
        case "REJECTED": rejected++; break;
        case "QUARANTINED": quarantined++; break;
        case "RETRYING": retrying++; break;
      }
    }

    const total = records.length;
    const status = retrying > 0 ? "RETRYING" : unmatched + rejected + quarantined === 0 ? "COMPLETED" : "PARTIAL";

    await prisma.providerIntegrationDelivery.update({
      where: { id: delivery.id },
      data: {
        appliedCount: applied,
        replayedCount: replayed,
        // No unmatchedCount column — unmatched + rejected are both "terminal, not applied".
        rejectedCount: rejected + unmatched,
        quarantinedCount: quarantined,
        status,
        nextAttemptAt: retrying > 0 ? new Date() : null,
        completedAt: retrying > 0 ? null : new Date(),
      },
    });

    return { deliveryId: delivery.id, mappingVersion: CASE_SERVICE_MAPPING_VERSION, total, applied, replayed, unmatched, rejected, quarantined, retrying, appliedAmount: appliedAmount.toFixed(2), status };
  },
} as const;
