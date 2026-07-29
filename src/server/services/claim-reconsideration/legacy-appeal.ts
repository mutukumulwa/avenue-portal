/**
 * PNOS F5.17 — legacy same-claim appeal → reconsideration consolidation (pure, read-only).
 *
 * The historic appeal path flipped the ORIGINAL claim to `APPEALED` (and, in a never-completed
 * flow, to `APPEAL_APPROVED` / `APPEAL_DECLINED`). That path is RETIRED — `initiateAppeal` throws,
 * the admin form is removed, and an architecture guard bans any new APPEALED-status write.
 * New disputes on a decided claim use the reconsideration workflow (F5.11–F5.16), which never
 * mutates the original (D13).
 *
 * This module only DEFINES the safe mapping + the unambiguous-fact predicate for a possible
 * migration; it NEVER touches a claim. The actual migration is gated on product/claims/finance
 * sign-off (docs/provider-network-os/LEGACY_APPEAL_CONSOLIDATION.md) — a decided migration would
 * create reconsideration cases for the mapped records, leaving each original claim's decision and
 * money exactly as they are.
 */

export const LEGACY_APPEAL_STATUSES = ["APPEALED", "APPEAL_APPROVED", "APPEAL_DECLINED"] as const;
export type LegacyAppealStatus = (typeof LEGACY_APPEAL_STATUSES)[number];

/**
 * Historic appeal state → the reconsideration case status it maps to. `APPEALED` was "filed, not
 * yet resolved" (the resolve targets were never reachable), so it maps to an open UNDER_REVIEW;
 * the two terminal outcomes map to the reconsideration terminals. Approved by product/claims/
 * finance before any migration runs.
 */
export const LEGACY_APPEAL_TO_RECONSIDERATION: Record<LegacyAppealStatus, "UNDER_REVIEW" | "ACCEPTED" | "UPHELD"> = {
  APPEALED: "UNDER_REVIEW",
  APPEAL_APPROVED: "ACCEPTED",
  APPEAL_DECLINED: "UPHELD",
};

export function isLegacyAppealStatus(status: string): status is LegacyAppealStatus {
  return (LEGACY_APPEAL_STATUSES as readonly string[]).includes(status);
}

export interface LegacyAppealClaim {
  id: string;
  status: string;
  currency: string;
  providerId: string;
  providerBranchId: string | null;
  chainRootClaimId: string | null;
  adjudicatorId: string | null;
  appealNotes: string | null;
  appealReviewerId: string | null;
  appealDate: Date | null;
}

export interface MappedReconsideration {
  claimId: string;
  chainRootClaimId: string;
  providerId: string;
  providerBranchId: string | null;
  currency: string;
  reasonCode: "LEGACY_APPEAL";
  providerNarrative: string;
  status: "UNDER_REVIEW" | "ACCEPTED" | "UPHELD";
  originalAdjudicatorId: string | null;
  filedAt: Date | null;
  /** true only when the record carries unambiguous facts (notes + a distinct reviewer) — a
   *  migration migrates ONLY these (§5) and routes the rest to human review. */
  migratable: boolean;
}

/**
 * Map a legacy appealed claim to the reconsideration case it would become. Pure: reads only, and
 * the original claim's decision/money is never touched (D13). Returns null for a non-appeal status.
 */
export function mapLegacyAppealToReconsideration(claim: LegacyAppealClaim): MappedReconsideration | null {
  if (!isLegacyAppealStatus(claim.status)) return null;
  const narrative = (claim.appealNotes ?? "").trim();
  const distinctReviewer = claim.appealReviewerId != null && claim.appealReviewerId !== claim.adjudicatorId;
  return {
    claimId: claim.id,
    chainRootClaimId: claim.chainRootClaimId ?? claim.id,
    providerId: claim.providerId,
    providerBranchId: claim.providerBranchId,
    currency: claim.currency,
    reasonCode: "LEGACY_APPEAL",
    providerNarrative: narrative || "Migrated from a legacy appeal (no notes recorded).",
    status: LEGACY_APPEAL_TO_RECONSIDERATION[claim.status],
    originalAdjudicatorId: claim.adjudicatorId,
    filedAt: claim.appealDate,
    migratable: narrative.length > 0 && distinctReviewer,
  };
}
