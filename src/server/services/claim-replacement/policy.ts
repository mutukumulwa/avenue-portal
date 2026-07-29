import { ClaimStatus } from "@prisma/client";
import { canTransitionClaim } from "../claim-lifecycle";

/**
 * PNOS F5.7/F5.8 — pure claim-correction policy (no I/O, no server deps).
 *
 * Split out of the replacement service so the SAME allowed-action predicate can be
 * computed server-side for the F5.8 UI (the "Correct claim" entry point) without
 * importing the service's Prisma/intake graph, and unit-tested in isolation. The
 * service and the page therefore agree by construction.
 */

/** The provider permission that gates a correction (F1.1 catalog). */
export const CORRECT_PERMISSION = "provider.claim.correct";

/**
 * Pre-decision statuses a claim can be superseded FROM — DERIVED from the single
 * lifecycle authority so it can never drift from the graph. Today: RECEIVED,
 * CAPTURED, UNDER_REVIEW (SUPERSEDED is not reachable from INCURRED).
 */
export const CLAIM_SUPERSEDABLE_STATUSES: ClaimStatus[] = (Object.values(ClaimStatus) as ClaimStatus[])
  .filter((s) => s !== ClaimStatus.SUPERSEDED && canTransitionClaim(s, ClaimStatus.SUPERSEDED));

/** The claim facts a correction decision depends on (a subset of the claim row). */
export interface CorrectableClaimFacts {
  status: ClaimStatus;
  providerBranchId: string | null;
  supersededByClaimId: string | null;
  decidedAt: Date | null;
  paidAt: Date | null;
  paymentVoucherId: string | null;
  settlementBatchId: string | null;
}

/**
 * Whether THIS actor may correct THIS claim — the exact predicate the service
 * enforces, evaluated purely for UI gating. Strict permission (a NEW capability
 * requires the explicit permission — no legacy fallback), not already superseded,
 * a pre-decision status, branch scope, and no money fact.
 */
export function providerCanCorrect(
  ctx: { permissions: string[]; allowedProviderBranchIds: string[] },
  claim: CorrectableClaimFacts,
): boolean {
  if (!ctx.permissions.includes(CORRECT_PERMISSION)) return false;
  if (claim.supersededByClaimId) return false;
  if (!CLAIM_SUPERSEDABLE_STATUSES.includes(claim.status)) return false;
  if (claim.providerBranchId && !ctx.allowedProviderBranchIds.includes(claim.providerBranchId)) return false;
  if (claim.decidedAt || claim.paidAt || claim.paymentVoucherId || claim.settlementBatchId) return false;
  return true;
}
