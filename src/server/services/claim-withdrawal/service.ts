import { prisma } from "@/lib/prisma";
import { ClaimStatus } from "@prisma/client";
import { inSerializableTx } from "@/lib/serializable-tx";
import {
  ProviderAccessService,
  ProviderAccessError,
  type ProviderAccessContext,
} from "../provider-access.service";
import { assertClaimTransition, canTransitionClaim } from "../claim-lifecycle";
import { auditChainService } from "../audit-chain.service";
import { NotificationOutboxService } from "../notifications/outbox";
import {
  CLAIM_WITHDRAWAL_REASONS,
  normalizeWithdrawalReason,
  type ClaimWithdrawalReasonCode,
} from "./catalog";

/**
 * PNOS F5.5 — simple provider claim-withdrawal service (the FIRST F5 status writer).
 *
 * An entitled provider abandons an UNDECIDED claim it owns. "Simple" = pre-decision:
 * there is no posted GL, benefit usage, hold, voucher or settlement to reverse (a
 * hold is a PA concept, never placed on a claim at intake), so this only marks the
 * claim terminal WITHDRAWN — it mutates ZERO money.
 *
 * The invariants (spec §13 F5.5 + Gate D):
 *  - Authorization is server-derived (F1.3 ProviderAccessContext): the actor holds
 *    provider.claim.withdraw, the claim belongs to the context's provider, and — when
 *    the claim is branch-stamped — the actor holds that branch. An out-of-scope claim
 *    is a non-enumerating NOT_FOUND (§9.1).
 *  - The move goes through the ONE lifecycle authority (assertClaimTransition), and the
 *    actual status flip is a status-guarded compare-and-swap (updateMany WHERE status IN
 *    the withdrawable set): a decision that commits first moves the status out of the
 *    set, so the withdrawal matches 0 rows and refuses — a decision and a withdrawal can
 *    never both take effect (no double effect / no money on a withdrawn claim).
 *  - Idempotent: an already-withdrawn claim (or a same-moment replay that lost the CAS)
 *    returns success with alreadyWithdrawn=true — no second log/outbox/audit row.
 *  - Pending jobs are ignored SAFELY, not force-cancelled: every decision path re-checks
 *    status and WITHDRAWN is terminal + excluded from AUTO_DECIDABLE_STATUSES and the
 *    duplicate evaluator (F5.3), so a queued auto/human decision on a withdrawn claim
 *    no-ops rather than acting. There is no per-claim job row to cancel.
 *
 * This is the service only (F5.5 stop: no UI, no replacement). F5.6 wires the provider UI.
 */

/**
 * Pre-decision statuses from which WITHDRAWN is a legal move — DERIVED from the single
 * lifecycle authority (claim-lifecycle TRANSITIONS) so it can never drift from the graph.
 * Today: INCURRED, RECEIVED, CAPTURED, UNDER_REVIEW.
 */
export const CLAIM_WITHDRAWABLE_STATUSES: ClaimStatus[] = (Object.values(ClaimStatus) as ClaimStatus[])
  .filter((s) => s !== ClaimStatus.WITHDRAWN && canTransitionClaim(s, ClaimStatus.WITHDRAWN));

export type ClaimWithdrawalErrorCode =
  | "INVALID_REASON"
  | "NOT_FOUND" // absent OR out-of-boundary — indistinguishable (§9.1)
  | "NOT_WITHDRAWABLE" // decided / settled / superseded / already terminal
  | "HAS_FINANCIAL_EFFECT"; // a money record exists — must go through void/reconsideration

export class ClaimWithdrawalError extends Error {
  constructor(public code: ClaimWithdrawalErrorCode, message: string) {
    super(message);
    this.name = "ClaimWithdrawalError";
  }
}

export function isClaimWithdrawalError(e: unknown): e is ClaimWithdrawalError {
  return e instanceof ClaimWithdrawalError;
}

export interface WithdrawClaimCommand {
  tenantId: string;
  claimId: string;
  /** A code from CLAIM_WITHDRAWAL_REASONS — validated against the catalog. */
  reasonCode: string;
  /** Optional short operational note (expected PHI-free; stored on the log). */
  note?: string;
}

export interface WithdrawClaimResult {
  claimId: string;
  claimNumber: string;
  status: "WITHDRAWN";
  reasonCode: ClaimWithdrawalReasonCode;
  /** true ⇒ idempotent replay — the claim was already withdrawn, no new effect. */
  alreadyWithdrawn: boolean;
}

const WITHDRAW_PERMISSION = "provider.claim.withdraw";

export const ClaimWithdrawalService = {
  /**
   * Withdraw an undecided claim. Authorization comes from `ctx` (server-derived,
   * F1.3); the command carries only ids + a catalog reason and never establishes scope.
   */
  async withdraw(ctx: ProviderAccessContext, command: WithdrawClaimCommand): Promise<WithdrawClaimResult> {
    // The context and command must agree on tenant; a mismatch is a safe NOT_FOUND
    // (never trust a command-supplied tenant to widen scope).
    if (command.tenantId !== ctx.tenantId) throw new ClaimWithdrawalError("NOT_FOUND", "Claim not found.");

    // Authorize the ACTION. Provider/branch ownership is checked against the loaded row.
    ProviderAccessService.requirePermission(ctx, WITHDRAW_PERMISSION);

    // Reason must resolve to a catalog code — no free-form/blank reason is persisted.
    const reasonCode = normalizeWithdrawalReason(command.reasonCode);
    if (!reasonCode) {
      throw new ClaimWithdrawalError("INVALID_REASON", `Unknown withdrawal reason "${String(command.reasonCode)}".`);
    }

    // Load the claim SCOPED to this provider — absent or another provider's claim is an
    // indistinguishable NOT_FOUND (no cross-provider probing). Scope is server-derived.
    const claim = await prisma.claim.findFirst({
      where: { id: command.claimId, tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        providerId: true,
        providerBranchId: true,
        decidedAt: true,
        paidAt: true,
        paymentVoucherId: true,
        settlementBatchId: true,
      },
    });
    if (!claim) throw new ClaimWithdrawalError("NOT_FOUND", "Claim not found.");

    // Branch scope: a branch-stamped claim requires the actor to hold that branch
    // (empty branch set denies — §6.5). Legacy/single-branch claims (null) are provider-scoped only.
    if (claim.providerBranchId) ProviderAccessService.requireBranch(ctx, claim.providerBranchId);

    // Idempotent fast-path: an already-withdrawn claim is a safe replay (no new effect).
    if (claim.status === ClaimStatus.WITHDRAWN) {
      return { claimId: claim.id, claimNumber: claim.claimNumber, status: "WITHDRAWN", reasonCode, alreadyWithdrawn: true };
    }

    // Friendly pre-tx guards (the tx re-checks atomically):
    //  - a decided/settled/superseded claim can never be withdrawn — it must go through
    //    void / reconsideration (F5.11+), preserving posted GL/settlement integrity.
    if (!CLAIM_WITHDRAWABLE_STATUSES.includes(claim.status)) {
      throw new ClaimWithdrawalError(
        "NOT_WITHDRAWABLE",
        `A ${claim.status.replace(/_/g, " ").toLowerCase()} claim cannot be withdrawn.`,
      );
    }
    //  - defense-in-depth: a pre-decision claim carries no money facts. If any exist, refuse.
    if (claim.decidedAt || claim.paidAt || claim.paymentVoucherId || claim.settlementBatchId) {
      throw new ClaimWithdrawalError(
        "HAS_FINANCIAL_EFFECT",
        "This claim already carries a financial record and cannot be withdrawn.",
      );
    }

    // Atomic transition under the money-path serializable regime. The status-guarded CAS
    // is the concurrency point; nothing here mutates money.
    const outcome = await inSerializableTx(
      prisma,
      async (tx) => {
        // In-tx money re-check (defense-in-depth vs a concurrent fund write).
        const fundTxCount = await tx.fundTransaction.count({ where: { tenantId: ctx.tenantId, claimId: claim.id } });
        if (fundTxCount > 0) {
          throw new ClaimWithdrawalError("HAS_FINANCIAL_EFFECT", "This claim already carries a fund movement and cannot be withdrawn.");
        }

        // Honor the ONE lifecycle authority explicitly (the CAS below enforces it atomically).
        assertClaimTransition(claim.status, ClaimStatus.WITHDRAWN, "provider withdrawal");

        // Compare-and-swap: only a claim STILL in a withdrawable status flips. A decision
        // that committed first has moved the status out of the set ⇒ 0 rows ⇒ we lost the race.
        const res = await tx.claim.updateMany({
          where: { id: claim.id, tenantId: ctx.tenantId, status: { in: CLAIM_WITHDRAWABLE_STATUSES } },
          data: { status: ClaimStatus.WITHDRAWN },
        });
        if (res.count === 0) {
          const fresh = await tx.claim.findUnique({ where: { id: claim.id }, select: { status: true } });
          if (fresh?.status === ClaimStatus.WITHDRAWN) return { alreadyWithdrawn: true as const };
          throw new ClaimWithdrawalError(
            "NOT_WITHDRAWABLE",
            `The claim became ${String(fresh?.status).replace(/_/g, " ").toLowerCase()} before it could be withdrawn.`,
          );
        }

        // Lifecycle log (immutable history of WHO withdrew and why — PHI-free reason).
        await tx.adjudicationLog.create({
          data: {
            claimId: claim.id,
            userId: ctx.actorId,
            action: "WITHDRAWN",
            fromStatus: claim.status,
            toStatus: ClaimStatus.WITHDRAWN,
            amount: 0,
            notes: `Provider withdrawal — ${CLAIM_WITHDRAWAL_REASONS[reasonCode]}${command.note ? `: ${command.note.trim()}` : ""}`,
          },
        });

        // Outbox (F4.8) — durable CLAIM_WITHDRAWN event, enqueued in the SAME tx
        // (exactly-once). dedupeKey collapses any same-claim replay defensively.
        await NotificationOutboxService.enqueue(
          {
            tenantId: ctx.tenantId,
            providerId: claim.providerId,
            channel: "IN_APP",
            eventType: "CLAIM_WITHDRAWN",
            priority: "LOW",
            title: "Claim withdrawn",
            body: `Claim ${claim.claimNumber} was withdrawn and will not be adjudicated.`,
            href: `/provider/claims/${claim.id}`,
            metadata: { claimId: claim.id, reasonCode },
            dedupeKey: `claim-withdrawn:${claim.id}`,
          },
          tx,
        );

        return { alreadyWithdrawn: false as const };
      },
      { label: `claim ${claim.claimNumber} withdrawal` },
    );

    // Hash-chained audit (post-commit, mirroring voidClaim). PHI-free payload.
    if (!outcome.alreadyWithdrawn) {
      await auditChainService.append({
        actorId: ctx.actorId,
        action: "CLAIM:WITHDRAW",
        module: "CLAIMS",
        entityType: "Claim",
        entityId: claim.id,
        payload: { reasonCode, fromStatus: claim.status },
        tenantId: ctx.tenantId,
        description: `Claim ${claim.claimNumber} withdrawn by provider (${CLAIM_WITHDRAWAL_REASONS[reasonCode]}).`,
      });
    }

    return {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      status: "WITHDRAWN",
      reasonCode,
      alreadyWithdrawn: outcome.alreadyWithdrawn,
    };
  },
} as const;

// Re-export the ProviderAccessError guard so callers (F5.6) can distinguish an
// authorization failure from a withdrawal-domain failure without a second import.
export { ProviderAccessError };
