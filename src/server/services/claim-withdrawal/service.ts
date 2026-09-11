import { prisma } from "@/lib/prisma";
import { ClaimStatus } from "@prisma/client";
import { inSerializableTx } from "@/lib/serializable-tx";
import {
  ProviderAccessService,
  ProviderAccessError,
  type ProviderAccessContext,
} from "../provider-access.service";
import { assertClaimTransition } from "../claim-lifecycle";
import { auditChainService } from "../audit-chain.service";
import { NotificationOutboxService } from "../notifications/outbox";
import { ROLES, type UserRole } from "@/lib/authz/roles";
import {
  CLAIM_WITHDRAWAL_REASONS,
  OPERATOR_WITHDRAWAL_REASONS,
  normalizeOperatorWithdrawalReason,
  normalizeWithdrawalReason,
  type ClaimWithdrawalReasonCode,
  type OperatorWithdrawalReasonCode,
} from "./catalog";
import { CLAIM_WITHDRAWABLE_STATUSES, WITHDRAW_PERMISSION } from "./policy";

// Re-exported for callers that imported the withdrawable set from the service (F5.5).
export { CLAIM_WITHDRAWABLE_STATUSES };

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

export type ClaimWithdrawalErrorCode =
  | "INVALID_REASON"
  | "NOT_FOUND" // absent OR out-of-boundary — indistinguishable (§9.1)
  | "NOT_WITHDRAWABLE" // decided / settled / superseded / already terminal
  | "HAS_FINANCIAL_EFFECT" // a money record exists — must go through void/reconsideration
  | "OPERATOR_REQUIRED"; // withdrawAsOperator: the actor is not an active TPA claims operator

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

export interface OperatorWithdrawClaimCommand {
  claimId: string;
  /** A code from OPERATOR_WITHDRAWAL_REASONS. */
  reasonCode: string;
  /** Optional short operational note (PHI-free; stored on the log). */
  note?: string;
}

export interface OperatorWithdrawClaimResult {
  claimId: string;
  claimNumber: string;
  providerId: string;
  /** The status the claim had when this call found it. */
  fromStatus: ClaimStatus;
  status: "WITHDRAWN";
  reasonCode: OperatorWithdrawalReasonCode;
  alreadyWithdrawn: boolean;
}

const WITHDRAWAL_CLAIM_SELECT = {
  id: true,
  claimNumber: true,
  status: true,
  providerId: true,
  providerBranchId: true,
  decidedAt: true,
  paidAt: true,
  paymentVoucherId: true,
  settlementBatchId: true,
} as const;

type WithdrawalClaim = {
  id: string;
  claimNumber: string;
  status: ClaimStatus;
  providerId: string;
  providerBranchId: string | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentVoucherId: string | null;
  settlementBatchId: string | null;
};

/**
 * The friendly pre-transaction guards both paths share (the transaction
 * re-checks atomically):
 *  - a decided/settled/superseded claim can never be withdrawn — it must go through
 *    void / reconsideration (F5.11+), preserving posted GL/settlement integrity.
 *  - defense-in-depth: a pre-decision claim carries no money facts. If any exist, refuse.
 */
function assertWithdrawable(claim: WithdrawalClaim): void {
  if (!CLAIM_WITHDRAWABLE_STATUSES.includes(claim.status)) {
    throw new ClaimWithdrawalError(
      "NOT_WITHDRAWABLE",
      `A ${claim.status.replace(/_/g, " ").toLowerCase()} claim cannot be withdrawn.`,
    );
  }
  if (claim.decidedAt || claim.paidAt || claim.paymentVoucherId || claim.settlementBatchId) {
    throw new ClaimWithdrawalError(
      "HAS_FINANCIAL_EFFECT",
      "This claim already carries a financial record and cannot be withdrawn.",
    );
  }
}

/**
 * The one withdrawal move, shared by the provider and operator paths: the in-tx
 * money re-check, the lifecycle authority, the status-guarded compare-and-swap,
 * the lifecycle log and the provider's outbox event in ONE serializable
 * transaction; the hash-chained audit after commit. Only the wording and the
 * audit payload differ between the two paths.
 */
async function commitWithdrawal(input: {
  tenantId: string;
  actorId: string;
  claim: WithdrawalClaim;
  reasonCode: string;
  /** Names the move in a lifecycle-authority refusal. */
  transitionLabel: string;
  logNote: string;
  auditPayload: Record<string, string>;
  auditDescription: string;
}): Promise<{ alreadyWithdrawn: boolean }> {
  const { tenantId, actorId, claim, reasonCode } = input;

  // Atomic transition under the money-path serializable regime. The status-guarded CAS
  // is the concurrency point; nothing here mutates money.
  const outcome = await inSerializableTx(
    prisma,
    async (tx) => {
      // In-tx money re-check (defense-in-depth vs a concurrent fund write).
      const fundTxCount = await tx.fundTransaction.count({ where: { tenantId, claimId: claim.id } });
      if (fundTxCount > 0) {
        throw new ClaimWithdrawalError("HAS_FINANCIAL_EFFECT", "This claim already carries a fund movement and cannot be withdrawn.");
      }

      // Honor the ONE lifecycle authority explicitly (the CAS below enforces it atomically).
      assertClaimTransition(claim.status, ClaimStatus.WITHDRAWN, input.transitionLabel);

      // Compare-and-swap: only a claim STILL in a withdrawable status flips. A decision
      // that committed first has moved the status out of the set ⇒ 0 rows ⇒ we lost the race.
      const res = await tx.claim.updateMany({
        where: { id: claim.id, tenantId, status: { in: CLAIM_WITHDRAWABLE_STATUSES } },
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
          userId: actorId,
          action: "WITHDRAWN",
          fromStatus: claim.status,
          toStatus: ClaimStatus.WITHDRAWN,
          amount: 0,
          notes: input.logNote,
        },
      });

      // Outbox (F4.8) — durable CLAIM_WITHDRAWN event, enqueued in the SAME tx
      // (exactly-once). dedupeKey collapses any same-claim replay defensively.
      await NotificationOutboxService.enqueue(
        {
          tenantId,
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
      actorId,
      action: "CLAIM:WITHDRAW",
      module: "CLAIMS",
      entityType: "Claim",
      entityId: claim.id,
      payload: input.auditPayload,
      tenantId,
      description: input.auditDescription,
    });
  }

  return outcome;
}

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
      select: WITHDRAWAL_CLAIM_SELECT,
    });
    if (!claim) throw new ClaimWithdrawalError("NOT_FOUND", "Claim not found.");

    // Branch scope: a branch-stamped claim requires the actor to hold that branch
    // (empty branch set denies — §6.5). Legacy/single-branch claims (null) are provider-scoped only.
    if (claim.providerBranchId) ProviderAccessService.requireBranch(ctx, claim.providerBranchId);

    // Idempotent fast-path: an already-withdrawn claim is a safe replay (no new effect).
    if (claim.status === ClaimStatus.WITHDRAWN) {
      return { claimId: claim.id, claimNumber: claim.claimNumber, status: "WITHDRAWN", reasonCode, alreadyWithdrawn: true };
    }

    assertWithdrawable(claim);

    const outcome = await commitWithdrawal({
      tenantId: ctx.tenantId,
      actorId: ctx.actorId,
      claim,
      reasonCode,
      transitionLabel: "provider withdrawal",
      logNote: `Provider withdrawal — ${CLAIM_WITHDRAWAL_REASONS[reasonCode]}${command.note ? `: ${command.note.trim()}` : ""}`,
      auditPayload: { reasonCode, fromStatus: claim.status },
      auditDescription: `Claim ${claim.claimNumber} withdrawn by provider (${CLAIM_WITHDRAWAL_REASONS[reasonCode]}).`,
    });

    return {
      claimId: claim.id,
      claimNumber: claim.claimNumber,
      status: "WITHDRAWN",
      reasonCode,
      alreadyWithdrawn: outcome.alreadyWithdrawn,
    };
  },

  /**
   * Family Hospital UAT plan P07.01 (DEC-FH-04) — a TPA claims operator withdraws
   * an UNDECIDED claim on the provider's behalf, e.g. a trial record priced from
   * the wrong tariff. Lifecycle, compare-and-swap, log, outbox and audit are the
   * provider path's (`commitWithdrawal`); what differs is who may do it and what
   * the record says:
   *
   *  - the actor must be an ACTIVE user of the tenant holding a TPA claims-operations
   *    role (ROLES.CLAIMS_OPS) — never a provider user — and is re-read here from
   *    the database, not taken from the caller;
   *  - the reason must be an OPERATOR_WITHDRAWAL_REASONS code, a set never offered
   *    to providers;
   *  - the claim is found within the tenant (an operator is not provider-scoped);
   *  - the log says "Operator withdrawal" and the audit payload carries
   *    `initiatedBy: "OPERATOR"`.
   *
   * It exists because a RECEIVED claim has no operator void (VOID is reachable
   * only from INCURRED or a decided status) and the only other ways out of
   * RECEIVED are decisions, which trial data must not receive.
   */
  async withdrawAsOperator(
    actor: { tenantId: string; actorId: string },
    command: OperatorWithdrawClaimCommand,
  ): Promise<OperatorWithdrawClaimResult> {
    const operator = await prisma.user.findFirst({
      where: { id: actor.actorId, tenantId: actor.tenantId, isActive: true },
      select: { role: true },
    });
    if (!operator || !(ROLES.CLAIMS_OPS as readonly UserRole[]).includes(operator.role as UserRole)) {
      throw new ClaimWithdrawalError("OPERATOR_REQUIRED", "Only an active TPA claims operator may withdraw a claim on a provider's behalf.");
    }

    const reasonCode = normalizeOperatorWithdrawalReason(command.reasonCode);
    if (!reasonCode) {
      throw new ClaimWithdrawalError("INVALID_REASON", `Unknown operator withdrawal reason "${String(command.reasonCode)}".`);
    }

    const claim = await prisma.claim.findFirst({
      where: { id: command.claimId, tenantId: actor.tenantId },
      select: WITHDRAWAL_CLAIM_SELECT,
    });
    if (!claim) throw new ClaimWithdrawalError("NOT_FOUND", "Claim not found.");

    const base = { claimId: claim.id, claimNumber: claim.claimNumber, providerId: claim.providerId, fromStatus: claim.status, status: "WITHDRAWN" as const, reasonCode };
    if (claim.status === ClaimStatus.WITHDRAWN) return { ...base, alreadyWithdrawn: true };

    assertWithdrawable(claim);

    const label = OPERATOR_WITHDRAWAL_REASONS[reasonCode];
    const outcome = await commitWithdrawal({
      tenantId: actor.tenantId,
      actorId: actor.actorId,
      claim,
      reasonCode,
      transitionLabel: "operator withdrawal",
      logNote: `Operator withdrawal — ${label}${command.note ? `: ${command.note.trim()}` : ""}`,
      auditPayload: { reasonCode, fromStatus: claim.status, initiatedBy: "OPERATOR" },
      auditDescription: `Claim ${claim.claimNumber} withdrawn by an operator (${label}).`,
    });
    return { ...base, alreadyWithdrawn: outcome.alreadyWithdrawn };
  },
} as const;

// Re-export the ProviderAccessError guard so callers (F5.6) can distinguish an
// authorization failure from a withdrawal-domain failure without a second import.
export { ProviderAccessError };
