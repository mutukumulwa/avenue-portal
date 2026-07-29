import { ClaimStatus } from "@prisma/client";
import { canTransitionClaim } from "../claim-lifecycle";

/**
 * PNOS F5.5/F5.6 — pure claim-withdrawal policy (no I/O, no server deps).
 *
 * Split out of the service so the SAME allowed-action predicate can be computed
 * server-side for the F5.6 UI (button visibility = "server-computed allowed
 * action") without importing the service's Prisma/auth graph, and unit-tested in
 * isolation. The service and the page therefore agree by construction.
 */

/** The provider permission that gates a withdrawal (F1.1 catalog). */
export const WITHDRAW_PERMISSION = "provider.claim.withdraw";

/**
 * Pre-decision statuses from which WITHDRAWN is a legal move — DERIVED from the
 * single lifecycle authority (claim-lifecycle TRANSITIONS) so it can never drift
 * from the graph. Today: INCURRED, RECEIVED, CAPTURED, UNDER_REVIEW.
 */
export const CLAIM_WITHDRAWABLE_STATUSES: ClaimStatus[] = (Object.values(ClaimStatus) as ClaimStatus[])
  .filter((s) => s !== ClaimStatus.WITHDRAWN && canTransitionClaim(s, ClaimStatus.WITHDRAWN));

/** The claim facts a withdrawal decision depends on (a subset of the claim row). */
export interface WithdrawableClaimFacts {
  status: ClaimStatus;
  providerBranchId: string | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentVoucherId: string | null;
  settlementBatchId: string | null;
}

/**
 * Whether THIS actor may withdraw THIS claim — the exact predicate the service
 * enforces, evaluated purely for UI gating. Strict permission (a NEW capability
 * requires the explicit permission — no legacy full-access fallback), pre-decision
 * status, branch scope (a branch-stamped claim needs the branch), and no money fact.
 */
export function providerCanWithdraw(
  ctx: { permissions: string[]; allowedProviderBranchIds: string[] },
  claim: WithdrawableClaimFacts,
): boolean {
  if (!ctx.permissions.includes(WITHDRAW_PERMISSION)) return false;
  if (!CLAIM_WITHDRAWABLE_STATUSES.includes(claim.status)) return false;
  if (claim.providerBranchId && !ctx.allowedProviderBranchIds.includes(claim.providerBranchId)) return false;
  if (claim.decidedAt || claim.paidAt || claim.paymentVoucherId || claim.settlementBatchId) return false;
  return true;
}
