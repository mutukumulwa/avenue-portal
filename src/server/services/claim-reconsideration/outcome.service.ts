import { prisma } from "@/lib/prisma";
import { Prisma, ClaimLineCategory, type ReconsiderationStatus } from "@prisma/client";
import Decimal from "decimal.js";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import { ClaimIntakeService } from "@/server/services/claim-intake/intake.service";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { resolveIntakeContext } from "@/server/services/claim-intake/context";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { IntakeError } from "@/server/services/claim-intake/errors";
import type { IntakeDiagnosis, IntakeLineItem } from "@/server/services/claim-intake";
import { getSystemActorId } from "@/server/services/system-actor.service";
import { buildReplacementSubmission, MAX_TX_ATTEMPTS, isRetryableWrite, sleep } from "@/server/services/claim-replacement/submission";
import { appendReconsiderationEvent } from "./events";
import { ReconsiderationCalculationService, type ReconsiderationRepricer } from "./calculation.service";
import {
  RECONSIDERATION_REVIEWER_ROLES,
  ReconsiderationReviewError,
  type ReconsiderationReviewerActor,
} from "./review.service";

/**
 * PNOS F5.16 — execute the reconsideration outcome (the case's FIRST money path).
 *
 * A reviewer records a frozen, capped outcome on a reconsideration case:
 *   • UPHELD (or a zero award): the case closes with NO financial child — the original stands.
 *   • ACCEPTED / PARTIALLY_ACCEPTED: a linked CANONICAL child claim is created through the Claims
 *     Autopilot intake (D5 — never a second intake engine) on the CASE_FINAL channel, billing
 *     ONLY the awarded positive per-line deltas (submissionType RECONSIDERATION). The child then
 *     runs through the canonical approval/benefit/GL/fund/settlement owners like any claim — this
 *     service does NOT re-implement settlement.
 *
 * Invariants: the ORIGINAL claim is never touched (D13); each awarded increment is hard-capped to
 * the F5.15 maximum (Σ child lines = the award, never above the ceiling); a zero/negative award
 * creates no financial child; the case-status CAS makes a concurrent double-outcome resolve to
 * exactly ONE child; the child intake is idempotent on a stable outcome key. The child is created
 * RECEIVED (not settled inline) — its settlement is the canonical pipeline's exactly-once concern
 * (mirrors F5.10). Notifications fire only after a consistent commit.
 */

/** Terminal outcomes — a case already here is decided; re-execution replays. */
const TERMINAL_OUTCOME_STATUSES: ReconsiderationStatus[] = ["ACCEPTED", "PARTIALLY_ACCEPTED", "UPHELD", "WITHDRAWN", "CLOSED"];
/** A reviewer may record an outcome only from an actively-reviewed state. */
const OUTCOME_FROM: ReconsiderationStatus[] = ["TRIAGE", "UNDER_REVIEW", "PROVIDER_RESPONDED"];

export type ReconsiderationDisposition = "UPHELD" | "ACCEPTED" | "PARTIALLY_ACCEPTED";

export interface ReconsiderationOutcomeDecision {
  disposition: ReconsiderationDisposition;
  expectedVersion: number;
  /** Safe outcome reason code + provider-facing explanation; internalNotes stays internal (§9). */
  reasonCode: string;
  safeExplanation: string;
  internalNotes?: string;
  /** Per-line awarded increments (only positive ones bill the child). */
  lineAwards: Array<{ reconsiderationLineId: string; awardedIncrement: number }>;
}

export interface ReconsiderationOutcomeResult {
  reconsiderationId: string;
  disposition: ReconsiderationDisposition;
  totalAward: string;
  supplementalClaimId: string | null;
  supplementalClaimNumber: string | null;
  /** true ⇒ idempotent replay returned the already-recorded outcome. */
  replayed: boolean;
}

function assertReviewer(actor: ReconsiderationReviewerActor): void {
  if (!(RECONSIDERATION_REVIEWER_ROLES as readonly string[]).includes(actor.role)) {
    throw new ReconsiderationReviewError("FORBIDDEN", "You do not have permission to review reconsiderations.");
  }
}

const dec = (v: unknown): Decimal => new Decimal((v as { toString(): string }).toString());

function originalDiagnoses(raw: unknown): IntakeDiagnosis[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d): IntakeDiagnosis | null => {
      const o = d as { icdCode?: string; code?: string; description?: string; isPrimary?: boolean };
      const code = (o.icdCode ?? o.code ?? "").trim();
      return code ? { code, description: o.description?.trim() ?? "", standardCharge: null, isPrimary: !!o.isPrimary } : null;
    })
    .filter((d): d is IntakeDiagnosis => d !== null);
}

export const ReconsiderationOutcomeService = {
  /**
   * Record the reviewer's outcome. `opts.reprice` overrides the canonical engine port (passed
   * through to the F5.15 calculation) so the accepted paths are testable without a tariff fixture.
   */
  async execute(
    actor: ReconsiderationReviewerActor,
    reconsiderationId: string,
    decision: ReconsiderationOutcomeDecision,
    opts: { reprice?: ReconsiderationRepricer } = {},
  ): Promise<ReconsiderationOutcomeResult> {
    assertReviewer(actor);
    const reasonCode = (decision.reasonCode ?? "").trim();
    const safeExplanation = (decision.safeExplanation ?? "").trim();
    if (!reasonCode) throw new ReconsiderationReviewError("INVALID", "An outcome reason is required.");
    if (!safeExplanation) throw new ReconsiderationReviewError("INVALID", "A provider-facing explanation is required.");

    // 1. Load the case + disputed lines, tenant-scoped.
    const rc = await prisma.claimReconsideration.findFirst({
      where: { id: reconsiderationId, tenantId: actor.tenantId },
      select: {
        id: true, claimId: true, providerId: true, status: true, currency: true, supplementalClaimId: true,
        lines: { select: { id: true, claimLineId: true } },
      },
    });
    if (!rc) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");

    // 2. Replay: a case already decided returns its recorded outcome (idempotent, no re-write).
    if (TERMINAL_OUTCOME_STATUSES.includes(rc.status)) {
      const child = rc.supplementalClaimId
        ? await prisma.claim.findUnique({ where: { id: rc.supplementalClaimId }, select: { id: true, claimNumber: true } })
        : null;
      return {
        reconsiderationId: rc.id, disposition: rc.status as ReconsiderationDisposition,
        totalAward: "0.00", supplementalClaimId: child?.id ?? null, supplementalClaimNumber: child?.claimNumber ?? null, replayed: true,
      };
    }

    // 3. Validate awards against the F5.15 maximum (hard cap) — the canonical calculation.
    const lineById = new Map(rc.lines.map((l) => [l.id, l]));
    const awardByReconLine = new Map<string, Decimal>();
    for (const a of decision.lineAwards) {
      if (!lineById.has(a.reconsiderationLineId)) throw new ReconsiderationReviewError("INVALID", "An awarded line does not belong to this reconsideration.");
      const amt = new Decimal(a.awardedIncrement ?? 0);
      if (amt.isNeg()) throw new ReconsiderationReviewError("INVALID", "An awarded increment cannot be negative.");
      awardByReconLine.set(a.reconsiderationLineId, amt);
    }
    const delta = await ReconsiderationCalculationService.computeMaxDelta(actor, rc.id, { reprice: opts.reprice });
    const maxByReconLine = new Map(delta.lines.map((l) => [l.reconsiderationLineId, new Decimal(l.maxIncrement)]));
    let totalAward = new Decimal(0);
    for (const [reconLineId, amt] of awardByReconLine) {
      const max = maxByReconLine.get(reconLineId) ?? new Decimal(0);
      if (amt.gt(max)) throw new ReconsiderationReviewError("INVALID", "An awarded increment exceeds the calculated maximum for that line.");
      totalAward = totalAward.plus(amt);
    }

    // 4. Disposition ↔ award consistency.
    const wantsChild = decision.disposition !== "UPHELD";
    if (decision.disposition === "UPHELD" && !totalAward.isZero()) {
      throw new ReconsiderationReviewError("INVALID", "An upheld outcome cannot award an increment — use accepted/partially accepted.");
    }
    if (wantsChild && !totalAward.gt(0)) {
      throw new ReconsiderationReviewError("INVALID", "An accepted outcome must award a positive increment — otherwise uphold.");
    }

    // 5. Prepare the linked child (only when there is money to move). Build the canonical
    //    submission from the ORIGINAL claim + the awarded positive deltas, and reserve the
    //    idempotent receipt BEFORE the tx (a same-outcome retry resolves to the same child).
    let prepared: { context: Awaited<ReturnType<typeof resolveIntakeContext>>; normalized: ReturnType<typeof normalizeSubmission>; receiptId: string; requestHash: string } | null = null;
    let chainRootClaimId: string | null = null;
    if (wantsChild) {
      const claim = await prisma.claim.findFirst({
        where: { id: rc.claimId, tenantId: actor.tenantId, providerId: rc.providerId },
        select: {
          id: true, claimNumber: true, memberId: true, providerId: true, providerBranchId: true, chainRootClaimId: true,
          serviceType: true, benefitCategory: true, dateOfService: true, diagnoses: true,
          claimLines: { select: { id: true, serviceCategory: true, description: true, cptCode: true, icdCode: true } },
        },
      });
      if (!claim) throw new ReconsiderationReviewError("NOT_FOUND", "Claim not found.");
      chainRootClaimId = claim.chainRootClaimId ?? claim.id;
      const origLineById = new Map(claim.claimLines.map((l) => [l.id, l]));

      const lineItems: IntakeLineItem[] = [];
      for (const rl of rc.lines) {
        const awarded = awardByReconLine.get(rl.id) ?? new Decimal(0);
        if (!awarded.gt(0)) continue;
        const ol = origLineById.get(rl.claimLineId);
        if (!ol) throw new ReconsiderationReviewError("INVALID", "An awarded line has no matching original claim line.");
        const amount = Number(awarded.toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
        lineItems.push({
          serviceCategory: ol.serviceCategory as ClaimLineCategory,
          cptCode: ol.cptCode ?? "",
          icdCode: ol.icdCode ?? "",
          description: `Reconsideration award — ${ol.description ?? "line"}`.slice(0, 200),
          quantity: 1,
          unitCost: amount,
          billedAmount: amount,
        });
      }
      if (lineItems.length === 0) throw new ReconsiderationReviewError("INVALID", "No positive awarded line to bill.");
      const diagnoses = originalDiagnoses(claim.diagnoses);
      if (diagnoses.length === 0) throw new ReconsiderationReviewError("INVALID", "The original claim has no diagnosis to carry onto the supplemental.");

      const raw = buildReplacementSubmission(
        { memberId: claim.memberId, providerId: claim.providerId, providerBranchId: claim.providerBranchId, claimNumber: claim.claimNumber },
        {
          tenantId: actor.tenantId, predecessorClaimId: claim.id, idempotencyKey: `recon-outcome:${rc.id}`,
          reason: safeExplanation, serviceType: claim.serviceType, benefitCategory: claim.benefitCategory,
          dateOfService: claim.dateOfService.toISOString().slice(0, 10), diagnoses, lineItems,
        },
      );
      const parsed = parseClaimSubmissionV1(raw);
      if (!parsed.success) throw new ReconsiderationReviewError("INVALID", IntakeError.fromZod(parsed.error).message);
      const normalized = normalizeSubmission(parsed.data);
      const systemActorId = await getSystemActorId(actor.tenantId);
      let context;
      try {
        context = await resolveIntakeContext(
          { kind: "caseSystem", tenantId: actor.tenantId, caseId: rc.id, isFinal: true, providerId: claim.providerId, systemActorId, sourceHint: "MANUAL" },
          parsed.data,
        );
      } catch (err) {
        throw new ReconsiderationReviewError("INVALID", IntakeError.from(err).message);
      }
      const requestHash = computeRequestHash(normalized);
      const suspect = computeSuspectedDuplicateFingerprint({
        tenantId: context.tenantId, providerId: context.providerId, branchId: context.providerBranchId,
        memberKey: context.memberId, normalized,
      });
      const reservation = await reserveReceipt(prisma, {
        tenantId: actor.tenantId, scopeKey: context.scopeKey, channel: context.channel,
        idempotencyKey: `recon-outcome:${rc.id}`, schemaVersion: "1", requestHash,
        strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `recon-outcome:${rc.id}`,
      });
      if (reservation.kind === "CONFLICT") throw new ReconsiderationReviewError("INVALID", "An outcome for this case is already in flight with different content.");
      prepared = { context, normalized, receiptId: reservation.receipt.id, requestHash };
    }

    // 6. Atomic outcome: CAS the case (one-outcome), freeze line awards, create + link the child,
    //    append the outcome event. The ORIGINAL claim is never written (D13). Retry a claim-number
    //    / serialization collision; an INVALID_STATE/STALE race is a domain result (not retried).
    let committed: { supplementalClaimId: string | null; supplementalClaimNumber: string | null } | null = null;
    for (let attempt = 1; ; attempt++) {
      try {
        committed = await prisma.$transaction(async (tx) => {
          const cas = await tx.claimReconsideration.updateMany({
            where: { id: rc.id, tenantId: actor.tenantId, version: decision.expectedVersion, status: { in: OUTCOME_FROM } },
            data: {
              status: decision.disposition, version: { increment: 1 },
              outcomeReasonCode: reasonCode, outcomeSafeExplanation: safeExplanation,
              outcomeInternalNotes: decision.internalNotes?.trim() || null,
            },
          });
          if (cas.count === 0) {
            const cur = await tx.claimReconsideration.findFirst({ where: { id: rc.id, tenantId: actor.tenantId }, select: { status: true, version: true } });
            if (!cur) throw new ReconsiderationReviewError("NOT_FOUND", "Reconsideration not found.");
            if (cur.version !== decision.expectedVersion) throw new ReconsiderationReviewError("STALE", "This reconsideration changed since you loaded it — refresh and retry.");
            throw new ReconsiderationReviewError("INVALID_STATE", `A ${cur.status.toLowerCase().replace(/_/g, " ")} reconsideration cannot take an outcome.`);
          }

          // Freeze the per-line outcome (awardedIncrement + maxIncrement + corrected + reason).
          for (const rl of rc.lines) {
            const awarded = awardByReconLine.get(rl.id) ?? new Decimal(0);
            const d = delta.lines.find((x) => x.reconsiderationLineId === rl.id);
            await tx.claimReconsiderationLine.update({
              where: { id: rl.id },
              data: {
                awardedIncrement: awarded.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
                maxIncrement: d ? new Prisma.Decimal(d.maxIncrement) : undefined,
                reviewerCorrectedEntitlement: d?.correctedEntitlement ? new Prisma.Decimal(d.correctedEntitlement) : undefined,
                outcomeReasonCode: reasonCode,
              },
            });
          }

          let supplementalClaimId: string | null = null;
          let supplementalClaimNumber: string | null = null;
          if (prepared) {
            const result = await ClaimIntakeService.submitWithinTransaction(tx, { context: prepared.context, normalized: prepared.normalized, receiptId: prepared.receiptId, requestHash: prepared.requestHash, origin: {} });
            if (result.kind !== "CREATED") throw new ReconsiderationReviewError("INVALID", "The supplemental resolved to an existing claim.");
            await tx.claim.update({ where: { id: result.claimId }, data: { submissionType: "RECONSIDERATION", chainRootClaimId: chainRootClaimId ?? result.claimId } });
            await tx.claimReconsideration.update({ where: { id: rc.id }, data: { supplementalClaimId: result.claimId } });
            await tx.adjudicationLog.create({ data: { claimId: result.claimId, userId: actor.userId, action: "RECEIVED", toStatus: "RECEIVED", notes: `Reconsideration supplemental for claim ${rc.claimId} — ${reasonCode}` } });
            supplementalClaimId = result.claimId;
            supplementalClaimNumber = result.claimNumber;
          }

          await appendReconsiderationEvent(
            {
              tenantId: actor.tenantId, reconsiderationId: rc.id,
              eventType: decision.disposition === "UPHELD" ? "UPHELD" : decision.disposition === "ACCEPTED" ? "ACCEPTED" : "PARTIALLY_ACCEPTED",
              priorStatus: rc.status, newStatus: decision.disposition, safeReasonCode: reasonCode, message: safeExplanation,
              actorType: "USER", actorId: actor.userId,
              metadata: { award: totalAward.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2), ...(supplementalClaimId ? { supplemental: true } : {}) },
            },
            tx,
          );

          return { supplementalClaimId, supplementalClaimNumber };
        });
        break;
      } catch (err) {
        if (isRetryableWrite(err) && attempt < MAX_TX_ATTEMPTS) {
          await sleep(5 + Math.floor(Math.random() * 20 * attempt));
          continue;
        }
        throw err;
      }
    }

    // 7. Notify after a consistent commit (safe outcome only).
    await auditChainService.append({
      actorId: actor.userId, action: "RECONSIDERATION:OUTCOME", module: "CLAIMS",
      entityType: "ClaimReconsideration", entityId: rc.id, tenantId: actor.tenantId,
      payload: { claimId: rc.claimId, disposition: decision.disposition, award: totalAward.toFixed(2), supplementalClaimId: committed.supplementalClaimId },
      description: `Reconsideration ${decision.disposition.toLowerCase().replace(/_/g, " ")} on claim ${rc.claimId}${committed.supplementalClaimNumber ? ` → supplemental ${committed.supplementalClaimNumber}` : ""}.`,
    });
    await NotificationOutboxService.enqueue({
      tenantId: actor.tenantId, providerId: rc.providerId, channel: "IN_APP",
      eventType: "RECONSIDERATION_DECIDED", priority: "NORMAL",
      title: decision.disposition === "UPHELD" ? "Reconsideration decided" : "Reconsideration accepted",
      body: safeExplanation,
      href: `/provider/claims/${rc.claimId}`,
      metadata: { reconsiderationId: rc.id, claimId: rc.claimId, ...(committed.supplementalClaimId ? { supplementalClaimId: committed.supplementalClaimId } : {}) },
      dedupeKey: `reconsideration-decided:${rc.id}`,
    }).catch(() => undefined);

    return {
      reconsiderationId: rc.id, disposition: decision.disposition, totalAward: totalAward.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
      supplementalClaimId: committed.supplementalClaimId, supplementalClaimNumber: committed.supplementalClaimNumber, replayed: false,
    };
  },
} as const;
