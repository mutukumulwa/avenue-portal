import { prisma } from "@/lib/prisma";
import { ClaimStatus } from "@prisma/client";
import { assertClaimTransition } from "@/server/services/claim-lifecycle";
import {
  ProviderAccessService,
  ProviderAccessError,
  type ProviderAccessContext,
} from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import { ClaimIntakeService } from "@/server/services/claim-intake/intake.service";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { resolveIntakeContext, type CallerIdentity } from "@/server/services/claim-intake/context";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { IntakeError } from "@/server/services/claim-intake/errors";
import { CLAIM_SUPERSEDABLE_STATUSES, CORRECT_PERMISSION } from "./policy";
import { type ReplaceClaimCommand, buildReplacementSubmission, MAX_TX_ATTEMPTS, isRetryableWrite, sleep } from "./submission";

// Re-exported so existing callers keep their import paths (F5.7).
export { CLAIM_SUPERSEDABLE_STATUSES };
export type { ReplaceClaimCommand };

/**
 * PNOS F5.7 — atomic claim replacement (correction) service. The FIRST SUPERSEDED writer.
 *
 * A provider corrects an UNDECIDED claim: this creates ONE new canonical claim through
 * the Claims Autopilot intake (D5 — never a second intake engine) and atomically marks
 * the predecessor SUPERSEDED, linking the two into a submission chain (F5.2). The original
 * is never mutated beyond the supersession pointers (no money touched — a pre-decision
 * claim has none), so any already-posted fact on it would be preserved (there is none).
 *
 * Invariants (spec §13 F5.7 + Gate D):
 *  - Authorization is server-derived (F1.3): provider.claim.correct + the predecessor
 *    belongs to the context's provider (+ branch). An out-of-scope predecessor is a
 *    non-enumerating NOT_FOUND (§9.1).
 *  - The correction is a FULL claim input, not a patch — it is validated by the ONE
 *    canonical submission schema (≥1 line, exactly one primary diagnosis, money integrity…).
 *  - member/provider/branch are DERIVED from the predecessor (a correction fixes CONTENT,
 *    never re-identifies the claim) so the chain's versions share tenant+provider+member (F5.2).
 *  - Explicit replacement reference, NO reused authoritative identity: the correction carries
 *    replacementOfClaimRef (the predecessor number) and NO invoice number, so its strong event
 *    fingerprint is null — a NEW linked claim, never a strong-link/conflict against the
 *    predecessor (autopilot plan §"correction rules must use an explicit replacement reference").
 *  - Atomic + concurrency-safe: the predecessor is superseded via a status-guarded CAS inside
 *    the intake transaction, so two concurrent replacements yield exactly ONE current child and
 *    the loser leaves the predecessor active. Idempotent: a same-key replay returns the existing
 *    child; a same-key/changed-payload is a CONFLICT.
 *  - Sanctioned lineage WITHOUT a blanket bypass: the predecessor going SUPERSEDED is what
 *    removes it from the duplicate evaluator's candidate set (F5.3 notIn) — the child is NOT
 *    exempted from duplicate detection against unrelated claims.
 *
 * Service only (F5.7 stop: no provider correction page — that is F5.8).
 */

export type ClaimReplacementErrorCode =
  | "NOT_FOUND" // absent OR out-of-boundary predecessor (§9.1)
  | "NOT_CORRECTABLE" // decided / settled / already superseded — cannot be replaced
  | "HAS_FINANCIAL_EFFECT" // a money record exists — go through void/reconsideration
  | "IDEMPOTENCY_CONFLICT" // same idempotency key, changed payload
  | "INVALID_CORRECTION"; // structural failure in the corrected claim (from the canonical schema)

export class ClaimReplacementError extends Error {
  constructor(public code: ClaimReplacementErrorCode, message: string) {
    super(message);
    this.name = "ClaimReplacementError";
  }
}

export function isClaimReplacementError(e: unknown): e is ClaimReplacementError {
  return e instanceof ClaimReplacementError;
}

export interface ReplaceClaimResult {
  predecessorClaimId: string;
  claimId: string;
  claimNumber: string | null;
  chainRootClaimId: string;
  /** true ⇒ idempotent replay returned the existing successor (no new supersession). */
  replayed: boolean;
}

export const ClaimReplacementService = {
  /**
   * Correct (replace) an undecided claim. Authorization comes from `ctx` (F1.3); the
   * command carries the predecessor id + the FULL corrected content + an idempotency key.
   */
  async replace(ctx: ProviderAccessContext, command: ReplaceClaimCommand): Promise<ReplaceClaimResult> {
    if (command.tenantId !== ctx.tenantId) throw new ClaimReplacementError("NOT_FOUND", "Claim not found.");
    ProviderAccessService.requirePermission(ctx, CORRECT_PERMISSION);

    // 1. Load the predecessor SCOPED to this provider — absent/foreign ⇒ non-enumerating NOT_FOUND.
    const predecessor = await prisma.claim.findFirst({
      where: { id: command.predecessorClaimId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: {
        id: true, claimNumber: true, status: true, memberId: true, providerId: true, providerBranchId: true,
        chainRootClaimId: true, supersededByClaimId: true,
        decidedAt: true, paidAt: true, paymentVoucherId: true, settlementBatchId: true,
      },
    });
    if (!predecessor) throw new ClaimReplacementError("NOT_FOUND", "Claim not found.");
    if (predecessor.providerBranchId) ProviderAccessService.requireBranch(ctx, predecessor.providerBranchId);
    const chainRootClaimId = predecessor.chainRootClaimId ?? predecessor.id;

    // 2. Structural validation via the ONE canonical schema (full claim input, not a patch).
    const raw = buildReplacementSubmission(predecessor, command);
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) {
      const e = IntakeError.fromZod(parsed.error);
      throw new ClaimReplacementError("INVALID_CORRECTION", e.issues?.map((i) => i.message).join("; ") || e.message);
    }
    const normalized = normalizeSubmission(parsed.data);

    // 4. Derived intake context (provider portal channel). resolveIntakeContext also re-checks
    //    the derived provider matches the predecessor's provider and the member is accessible.
    const caller: CallerIdentity = { kind: "providerUser", tenantId: ctx.tenantId, userId: ctx.actorId, providerId: ctx.providerId };
    let context;
    try {
      context = await resolveIntakeContext(caller, parsed.data);
    } catch (err) {
      const e = IntakeError.from(err);
      throw new ClaimReplacementError("INVALID_CORRECTION", e.message);
    }

    // 5. Reserve the receipt — resolves idempotency BEFORE any write (replay/conflict).
    const requestHash = computeRequestHash(normalized);
    const suspect = computeSuspectedDuplicateFingerprint({
      tenantId: context.tenantId, providerId: context.providerId, branchId: context.providerBranchId,
      memberKey: context.memberId, normalized,
    });
    const reservation = await reserveReceipt(prisma, {
      tenantId: ctx.tenantId, scopeKey: context.scopeKey, channel: context.channel,
      idempotencyKey: command.idempotencyKey, schemaVersion: "1", requestHash,
      strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `replace:${predecessor.id}`,
    });
    if (reservation.kind === "CONFLICT") {
      throw new ClaimReplacementError("IDEMPOTENCY_CONFLICT", "A correction with this key already exists with different content — reopen it or start a new correction.");
    }
    if (reservation.kind === "REPLAY" && reservation.receipt.claimId) {
      const child = await prisma.claim.findUnique({
        where: { id: reservation.receipt.claimId },
        select: { id: true, claimNumber: true, chainRootClaimId: true },
      });
      if (child) {
        return {
          predecessorClaimId: predecessor.id, claimId: child.id, claimNumber: child.claimNumber,
          chainRootClaimId: child.chainRootClaimId ?? child.id, replayed: true,
        };
      }
    }
    const receiptId = reservation.receipt.id;

    // Correction eligibility — checked AFTER idempotency so a same-key replay of an
    // already-superseded predecessor returns its child above rather than failing here.
    // Friendly early-out only; the in-tx CAS is authoritative against races.
    if (predecessor.supersededByClaimId || predecessor.status === ClaimStatus.SUPERSEDED) {
      throw new ClaimReplacementError("NOT_CORRECTABLE", "This claim has already been replaced.");
    }
    if (!CLAIM_SUPERSEDABLE_STATUSES.includes(predecessor.status)) {
      throw new ClaimReplacementError(
        "NOT_CORRECTABLE",
        `A ${predecessor.status.replace(/_/g, " ").toLowerCase()} claim cannot be corrected — void or file a reconsideration instead.`,
      );
    }
    if (predecessor.decidedAt || predecessor.paidAt || predecessor.paymentVoucherId || predecessor.settlementBatchId) {
      throw new ClaimReplacementError("HAS_FINANCIAL_EFFECT", "This claim already carries a financial record and cannot be corrected.");
    }

    // 6–7. Atomic: supersede the predecessor (CAS) + create the linked child, one transaction.
    //      Retry a claim-number / serialization collision (persist has no retry within a caller tx);
    //      a NOT_CORRECTABLE race is a domain outcome and is NOT retried.
    let created: { claimId: string; claimNumber: string } | null = null;
    for (let attempt = 1; ; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          // 6a. Status-guarded CAS: claim the supersession slot FIRST. A concurrent replacement
          //     (or a decision) that moved the predecessor out of the supersedable set ⇒ count 0.
          assertClaimTransition(predecessor.status, ClaimStatus.SUPERSEDED, "provider correction");
          const cas = await tx.claim.updateMany({
            where: { id: predecessor.id, tenantId: ctx.tenantId, status: { in: CLAIM_SUPERSEDABLE_STATUSES }, supersededByClaimId: null },
            data: { status: ClaimStatus.SUPERSEDED, supersededAt: new Date() },
          });
          if (cas.count === 0) {
            throw new ClaimReplacementError("NOT_CORRECTABLE", "The claim was decided or replaced before this correction could be filed.");
          }

          // 6b. Create the corrected claim through the canonical intake (transaction-aware).
          const result = await ClaimIntakeService.submitWithinTransaction(tx, { context, normalized, receiptId, requestHash, origin: {} });
          if (result.kind !== "CREATED") {
            // A null-strong-fingerprint correction cannot legitimately strong-link; treat as a conflict.
            throw new ClaimReplacementError("IDEMPOTENCY_CONFLICT", "This correction resolved to an existing claim — reopen it instead.");
          }

          // 6c. Wire the submission chain (F5.2): child ← predecessor, rooted at the chain root.
          await tx.claim.update({
            where: { id: result.claimId },
            data: { supersedesClaimId: predecessor.id, chainRootClaimId, submissionType: "CORRECTION" },
          });
          await tx.claim.update({ where: { id: predecessor.id }, data: { supersededByClaimId: result.claimId } });

          // 6d. Immutable lifecycle logs on both ends.
          await tx.adjudicationLog.create({
            data: {
              claimId: predecessor.id, userId: ctx.actorId, action: "SUPERSEDED",
              fromStatus: predecessor.status, toStatus: ClaimStatus.SUPERSEDED, amount: 0,
              notes: `Superseded by correction ${result.claimNumber}${command.reason?.trim() ? ` — ${command.reason.trim()}` : ""}`,
            },
          });
          await tx.adjudicationLog.create({
            data: {
              claimId: result.claimId, userId: ctx.actorId, action: "RECEIVED", toStatus: "RECEIVED",
              notes: `Correction of ${predecessor.claimNumber}${command.reason?.trim() ? ` — ${command.reason.trim()}` : ""}`,
            },
          });

          return { claimId: result.claimId, claimNumber: result.claimNumber };
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

    // 9. Emit events/outbox AFTER a consistent commit (never inside the money-adjacent tx).
    await auditChainService.append({
      actorId: ctx.actorId, action: "CLAIM:REPLACE", module: "CLAIMS",
      entityType: "Claim", entityId: created.claimId, tenantId: ctx.tenantId,
      payload: { predecessorClaimId: predecessor.id, predecessorNumber: predecessor.claimNumber, chainRootClaimId, hasReason: !!command.reason?.trim() },
      description: `Claim ${predecessor.claimNumber} corrected → ${created.claimNumber} (superseded).`,
    });
    await NotificationOutboxService.enqueue({
      tenantId: ctx.tenantId, providerId: predecessor.providerId, channel: "IN_APP",
      eventType: "CLAIM_CORRECTED", priority: "LOW", title: "Claim corrected",
      body: `Claim ${predecessor.claimNumber} was replaced by a corrected claim ${created.claimNumber}.`,
      href: `/provider/claims/${created.claimId}`,
      metadata: { predecessorClaimId: predecessor.id, claimId: created.claimId },
      dedupeKey: `claim-corrected:${created.claimId}`,
    }).catch(() => undefined);

    return {
      predecessorClaimId: predecessor.id, claimId: created.claimId, claimNumber: created.claimNumber,
      chainRootClaimId, replayed: false,
    };
  },
} as const;

export { ProviderAccessError };
