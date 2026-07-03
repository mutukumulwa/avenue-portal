import { prisma } from "@/lib/prisma";
import { CaseService } from "./case.service";
import { getSystemActorId } from "./system-actor.service";
import { createHash } from "node:crypto";
import type { ClaimLineCategory } from "@prisma/client";

// ─── HMS DAILY BATCH INGESTION (WP-D4, TPA_FEEDBACK_WORKPLAN.md §D) ──────────
// Facilities push (or we poll) a daily batch of services rendered against open
// cases. Format (version 1):
//   {
//     "formatVersion": 1,
//     "facilityCode": "AGA-001",          // Provider.code — or providerId
//     "batchRef": "AGA-2026-07-03",       // unique per facility per day
//     "entries": [{
//       "caseNumber": "CASE-2026-00001",  // OR memberNumber + admissionDate
//       "memberNumber": "MVX-...",         // fallback case match
//       "entryDate": "2026-07-03",
//       "category": "PHARMACY",            // ClaimLineCategory; default OTHER
//       "serviceCode": "SER001",
//       "description": "IV antibiotics",
//       "quantity": 2,
//       "unitAmount": 5000
//     }]
//   }
// Idempotent: each applied line carries hmsBatchRef = `${batchRef}#${lineHash}`;
// re-posting the same batch creates nothing new. Unmatched/invalid entries are
// raised as ExceptionLog rows (HMS_BATCH_UNMATCHED) — reviewable, never lost.

export interface HmsBatchEntry {
  caseNumber?: string;
  memberNumber?: string;
  entryDate: string;
  category?: string;
  serviceCode?: string;
  description: string;
  quantity?: number;
  unitAmount: number;
}

export interface HmsBatch {
  formatVersion: number;
  facilityCode: string;
  batchRef: string;
  entries: HmsBatchEntry[];
}

const CATEGORIES = new Set(["CONSULTATION", "LABORATORY", "PHARMACY", "IMAGING", "PROCEDURE", "OTHER"]);

function lineHash(e: HmsBatchEntry): string {
  return createHash("sha256")
    .update([e.caseNumber ?? "", e.memberNumber ?? "", e.entryDate, e.serviceCode ?? "", e.description, e.quantity ?? 1, e.unitAmount].join("|"))
    .digest("hex")
    .slice(0, 16);
}

export class HmsBatchService {
  static validate(body: unknown): asserts body is HmsBatch {
    const b = body as Partial<HmsBatch>;
    if (b?.formatVersion !== 1) throw new Error("Unsupported formatVersion — expected 1");
    if (!b.facilityCode) throw new Error("facilityCode is required");
    if (!b.batchRef) throw new Error("batchRef is required");
    if (!Array.isArray(b.entries) || b.entries.length === 0) throw new Error("entries[] is required");
    for (const [i, e] of b.entries.entries()) {
      if (!e.description) throw new Error(`entries[${i}]: description is required`);
      if (!e.entryDate || Number.isNaN(Date.parse(e.entryDate))) throw new Error(`entries[${i}]: valid entryDate is required`);
      if (typeof e.unitAmount !== "number" || e.unitAmount < 0) throw new Error(`entries[${i}]: unitAmount must be a non-negative number`);
      if (!e.caseNumber && !e.memberNumber) throw new Error(`entries[${i}]: caseNumber or memberNumber is required`);
    }
  }

  /**
   * Apply a validated batch. Idempotent by (batchRef, line hash). Returns a
   * per-batch report; unmatched lines become ExceptionLog rows.
   */
  static async apply(tenantId: string, batch: HmsBatch) {
    const provider = await prisma.provider.findFirst({
      // facilityCode = provider id, exact name, or the HMS/SMART provider code.
      where: {
        tenantId,
        OR: [
          { id: batch.facilityCode },
          { name: batch.facilityCode },
          { smartProviderId: batch.facilityCode },
        ],
      },
      select: { id: true, name: true },
    });
    if (!provider) throw new Error(`Unknown facility "${batch.facilityCode}"`);

    const systemActorId = await getSystemActorId(tenantId);
    let applied = 0;
    let duplicates = 0;
    let unmatched = 0;

    for (const entry of batch.entries) {
      const ref = `${batch.batchRef}#${lineHash(entry)}`;

      // Idempotency: this exact line already applied?
      const existing = await prisma.caseServiceEntry.findFirst({
        where: { hmsBatchRef: ref },
        select: { id: true },
      });
      if (existing) {
        duplicates++;
        continue;
      }

      // Match the open case: by caseNumber, else member's single open case at
      // this facility.
      let targetCase: { id: string } | null = null;
      if (entry.caseNumber) {
        targetCase = await prisma.clinicalCase.findFirst({
          where: { tenantId, caseNumber: entry.caseNumber, providerId: provider.id, status: { in: ["OPEN", "PENDING_CLOSURE"] } },
          select: { id: true },
        });
      } else if (entry.memberNumber) {
        const openCases = await prisma.clinicalCase.findMany({
          where: {
            tenantId, providerId: provider.id,
            status: { in: ["OPEN", "PENDING_CLOSURE"] },
            member: { memberNumber: entry.memberNumber },
          },
          select: { id: true },
          take: 2,
        });
        targetCase = openCases.length === 1 ? openCases[0] : null; // ambiguous ⇒ unmatched
      }

      if (!targetCase) {
        unmatched++;
        await prisma.exceptionLog.create({
          data: {
            tenantId,
            entityType: "CASE",
            entityId: ref,
            entityRef: entry.caseNumber ?? entry.memberNumber ?? "unknown",
            exceptionCode: "OTHER",
            reason: "HMS_BATCH_UNMATCHED",
            notes:
              `Batch ${batch.batchRef} @ ${provider.name}: could not match "${entry.description}" ` +
              `(${entry.caseNumber ?? entry.memberNumber ?? "no ref"}, ${entry.entryDate}, ${entry.unitAmount}) to a single open case.`,
            raisedById: systemActorId,
          },
        });
        continue;
      }

      const category = CATEGORIES.has(entry.category ?? "") ? (entry.category as ClaimLineCategory) : "OTHER";
      await CaseService.addServiceEntry({
        tenantId,
        caseId: targetCase.id,
        entryDate: new Date(entry.entryDate),
        category,
        serviceCode: entry.serviceCode ?? null,
        description: entry.description,
        quantity: entry.quantity ?? 1,
        unitAmount: entry.unitAmount,
        source: "HMS_BATCH",
        hmsBatchRef: ref,
      });
      applied++;
    }

    return { batchRef: batch.batchRef, facility: provider.name, total: batch.entries.length, applied, duplicates, unmatched };
  }

  /**
   * Daily poll slot (WP-D4): fetches batches from HMS endpoints configured in
   * IntegrationConfig (type HMS_BATCH). Connector transport is a stub until a
   * real facility HMS integration lands — the scheduler + apply pipeline are
   * production-ready and shared with the push API route.
   */
  static async pollConfiguredEndpoints() {
    const configs = await prisma.integrationConfig.findMany({
      where: { provider: "HMS", isEnabled: true },
    });
    if (configs.length === 0) {
      return { polled: 0, note: "no enabled HMS integration configs" };
    }
    // TODO(WP-D4 follow-up): per-config HTTP fetch + HmsBatchService.apply once
    // a facility HMS endpoint contract exists.
    return { polled: configs.length, note: "connector transport not yet implemented — push API is live" };
  }
}
