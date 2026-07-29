import { prisma } from "@/lib/prisma";
import { ProviderAccessError, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { auditChainService } from "@/server/services/audit-chain.service";
import { NotificationOutboxService } from "@/server/services/notifications/outbox";
import { ClaimIntakeService } from "@/server/services/claim-intake/intake.service";
import { parseClaimSubmissionV1 } from "@/server/services/claim-intake/schema";
import { normalizeSubmission } from "@/server/services/claim-intake/normalize";
import { resolveIntakeContext, type CallerIdentity } from "@/server/services/claim-intake/context";
import { computeRequestHash, computeSuspectedDuplicateFingerprint } from "@/server/services/claim-intake/fingerprint";
import { reserveReceipt } from "@/server/services/claim-intake/receipt";
import { IntakeError } from "@/server/services/claim-intake/errors";
import { type ReplaceClaimCommand, buildReplacementSubmission, MAX_TX_ATTEMPTS, isRetryableWrite, sleep } from "@/server/services/claim-replacement/submission";
import { ClaimResubmissionEligibilityService, type ResubmissionEligibilityCode } from "./eligibility.service";

/**
 * PNOS F5.10 — submit a linked post-decline resubmission.
 *
 * An ELIGIBLE decline (F5.9) produces a FULL new canonical claim through the Claims Autopilot
 * intake (D5 — never a second intake engine) as a RESUBMISSION, linked into the F5.2 chain.
 * Unlike a correction (F5.7), the original is NOT superseded in status — it STAYS DECLINED
 * (its decision + money are immutable); only the chain-head pointer advances to the new claim.
 * The resubmission is a fresh claim that runs full adjudication — NO automatic inheritance of
 * the original's pricing/approval/decline.
 *
 * Reuses the F5.7 "replacement full-form contract" (ReplaceClaimCommand + buildReplacementSubmission)
 * and the F5.9 eligibility. Concurrency-safe: idempotency is resolved (reserveReceipt) before
 * eligibility (a same-key replay returns the child); the chain pointer is claimed with a CAS
 * (updateMany WHERE supersededByClaimId IS NULL) inside the intake tx, so two concurrent
 * resubmissions yield exactly ONE current child. This writes NO claim status.
 */

export type ResubmitClaimCommand = ReplaceClaimCommand;

export type ClaimResubmissionErrorCode =
  | Exclude<ResubmissionEligibilityCode, "ELIGIBLE">
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_RESUBMISSION";

export class ClaimResubmissionError extends Error {
  constructor(public code: ClaimResubmissionErrorCode, message: string) {
    super(message);
    this.name = "ClaimResubmissionError";
  }
}

export function isClaimResubmissionError(e: unknown): e is ClaimResubmissionError {
  return e instanceof ClaimResubmissionError;
}

export interface ResubmitClaimResult {
  originalClaimId: string;
  claimId: string;
  claimNumber: string | null;
  chainRootClaimId: string;
  /** true ⇒ idempotent replay returned the existing resubmission (no new link). */
  replayed: boolean;
}

export const ClaimResubmissionService = {
  async submit(ctx: ProviderAccessContext, command: ResubmitClaimCommand): Promise<ResubmitClaimResult> {
    if (command.tenantId !== ctx.tenantId) throw new ClaimResubmissionError("NOT_FOUND", "Claim not found.");

    // 1. Load the original SCOPED to this provider (for the submission builder + NOT_FOUND).
    const original = await prisma.claim.findFirst({
      where: { id: command.predecessorClaimId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: { id: true, claimNumber: true, memberId: true, providerId: true, providerBranchId: true, chainRootClaimId: true },
    });
    if (!original) throw new ClaimResubmissionError("NOT_FOUND", "Claim not found.");
    const chainRootClaimId = original.chainRootClaimId ?? original.id;

    // 2. Build + validate the FULL resubmission via the ONE canonical schema (not a patch).
    const raw = buildReplacementSubmission(original, command);
    const parsed = parseClaimSubmissionV1(raw);
    if (!parsed.success) {
      const e = IntakeError.fromZod(parsed.error);
      throw new ClaimResubmissionError("INVALID_RESUBMISSION", e.issues?.map((i) => i.message).join("; ") || e.message);
    }
    const normalized = normalizeSubmission(parsed.data);

    // 3. Derived intake context (provider portal channel).
    const caller: CallerIdentity = { kind: "providerUser", tenantId: ctx.tenantId, userId: ctx.actorId, providerId: ctx.providerId };
    let context;
    try {
      context = await resolveIntakeContext(caller, parsed.data);
    } catch (err) {
      throw new ClaimResubmissionError("INVALID_RESUBMISSION", IntakeError.from(err).message);
    }

    // 4. Reserve the receipt — idempotency BEFORE eligibility so a same-key replay returns the child.
    const requestHash = computeRequestHash(normalized);
    const suspect = computeSuspectedDuplicateFingerprint({
      tenantId: context.tenantId, providerId: context.providerId, branchId: context.providerBranchId,
      memberKey: context.memberId, normalized,
    });
    const reservation = await reserveReceipt(prisma, {
      tenantId: ctx.tenantId, scopeKey: context.scopeKey, channel: context.channel,
      idempotencyKey: command.idempotencyKey, schemaVersion: "1", requestHash,
      strongEventFingerprint: null, suspectedDuplicateFingerprint: suspect, correlationId: `resubmit:${original.id}`,
    });
    if (reservation.kind === "CONFLICT") {
      throw new ClaimResubmissionError("IDEMPOTENCY_CONFLICT", "A resubmission with this key already exists with different content — reopen it or start a new one.");
    }
    if (reservation.kind === "REPLAY" && reservation.receipt.claimId) {
      const child = await prisma.claim.findUnique({
        where: { id: reservation.receipt.claimId },
        select: { id: true, claimNumber: true, chainRootClaimId: true },
      });
      if (child) {
        return { originalClaimId: original.id, claimId: child.id, claimNumber: child.claimNumber, chainRootClaimId: child.chainRootClaimId ?? child.id, replayed: true };
      }
    }
    const receiptId = reservation.receipt.id;

    // 5. Eligibility (F5.9) — AFTER idempotency. Permission/branch/status=DECLINED/not-already-
    //    resubmitted/reason-permits/within-deadline. A safe reason is surfaced on denial.
    const eligibility = await ClaimResubmissionEligibilityService.check(ctx, original.id);
    if (!eligibility.eligible) throw new ClaimResubmissionError(eligibility.code as ClaimResubmissionErrorCode, eligibility.reason);

    // 6. Atomic: create the linked resubmission + advance the chain pointer, leaving the DECLINED
    //    decision untouched. Retry a claim-number/serialization collision; an ALREADY_RESUBMITTED
    //    race is a domain outcome and is NOT retried.
    let created: { claimId: string; claimNumber: string } | null = null;
    for (let attempt = 1; ; attempt++) {
      try {
        created = await prisma.$transaction(async (tx) => {
          // 6a. In-tx recheck of the only race-able condition: still DECLINED and not yet resubmitted.
          const fresh = await tx.claim.findUnique({ where: { id: original.id }, select: { status: true, supersededByClaimId: true } });
          if (!fresh || fresh.status !== "DECLINED" || fresh.supersededByClaimId) {
            throw new ClaimResubmissionError("ALREADY_RESUBMITTED", "This claim was resubmitted or changed before this submission could complete.");
          }

          // 6b. Create the resubmission through the canonical intake — a FULL new adjudication
          //     (fresh RECEIVED claim + processing run; NO inheritance of pricing/approval/decline).
          const result = await ClaimIntakeService.submitWithinTransaction(tx, { context, normalized, receiptId, requestHash, origin: {} });
          if (result.kind !== "CREATED") {
            throw new ClaimResubmissionError("IDEMPOTENCY_CONFLICT", "This resubmission resolved to an existing claim — reopen it instead.");
          }

          // 6c. Advance the chain-head pointer — CAS on supersededByClaimId IS NULL. This sets ONLY
          //     the pointer; the original's DECLINED status is never changed (no status write).
          const advanced = await tx.claim.updateMany({
            where: { id: original.id, tenantId: ctx.tenantId, supersededByClaimId: null },
            data: { supersededByClaimId: result.claimId },
          });
          if (advanced.count === 0) {
            throw new ClaimResubmissionError("ALREADY_RESUBMITTED", "A resubmission of this claim already exists.");
          }

          // 6d. Wire the chain: child ← original, rooted at the chain root, RESUBMISSION.
          await tx.claim.update({
            where: { id: result.claimId },
            data: { supersedesClaimId: original.id, chainRootClaimId, submissionType: "RESUBMISSION" },
          });

          // 6e. Immutable lifecycle logs (the original's DECLINED decision is untouched).
          await tx.adjudicationLog.create({
            data: {
              claimId: original.id, userId: ctx.actorId, action: "RESUBMITTED",
              fromStatus: "DECLINED", toStatus: "DECLINED", amount: 0,
              notes: `Resubmitted as ${result.claimNumber}${command.reason?.trim() ? ` — ${command.reason.trim()}` : ""}`,
            },
          });
          await tx.adjudicationLog.create({
            data: {
              claimId: result.claimId, userId: ctx.actorId, action: "RECEIVED", toStatus: "RECEIVED",
              notes: `Resubmission of declined claim ${original.claimNumber}${command.reason?.trim() ? ` — ${command.reason.trim()}` : ""}`,
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

    // 7. Emit events/outbox after a consistent commit.
    await auditChainService.append({
      actorId: ctx.actorId, action: "CLAIM:RESUBMIT", module: "CLAIMS",
      entityType: "Claim", entityId: created.claimId, tenantId: ctx.tenantId,
      payload: { originalClaimId: original.id, originalNumber: original.claimNumber, chainRootClaimId },
      description: `Declined claim ${original.claimNumber} resubmitted → ${created.claimNumber}.`,
    });
    await NotificationOutboxService.enqueue({
      tenantId: ctx.tenantId, providerId: original.providerId, channel: "IN_APP",
      eventType: "CLAIM_RESUBMITTED", priority: "LOW", title: "Claim resubmitted",
      body: `Declined claim ${original.claimNumber} was resubmitted as ${created.claimNumber}.`,
      href: `/provider/claims/${created.claimId}`,
      metadata: { originalClaimId: original.id, claimId: created.claimId },
      dedupeKey: `claim-resubmitted:${created.claimId}`,
    }).catch(() => undefined);

    return { originalClaimId: original.id, claimId: created.claimId, claimNumber: created.claimNumber, chainRootClaimId, replayed: false };
  },
} as const;

export { ProviderAccessError };
