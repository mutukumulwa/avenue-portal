/**
 * UAT-HF P03.02 — the one eligibility decision contract.
 *
 * DEF-053 (S1), and the sentence that matters most in it: *"Because the same
 * string is produced for an unknown member, a malformed input and a real ACTIVE
 * member, out-of-network, not-yet-active and does-not-exist are indistinguishable
 * from each other and from an outage. That indistinguishability is itself part of
 * the defect."*
 *
 * The run's other eligibility findings are all facets of the same thing:
 *
 *   DEF-058  a status-only verdict, with no benefit or network decision
 *   DEF-060  referral rules authored but never surfaced to member or provider
 *   DEF-061  waiting periods shown as "270d wait" with no eligible-from date
 *   DEF-062  no freshness — a cached answer cannot be told from a live one
 *
 * So a decision has to carry **why**, for **whom**, **as of when** — not a single
 * string. This module defines that shape and the reason catalogue behind it.
 *
 * ── What this is NOT ────────────────────────────────────────────────────────
 * It is not a new evaluator. `evaluator-core.ts` already decides member-life
 * status against a published oracle (EO-001..024) with a closed reason enum, and
 * that stays the authority. This wraps its output, adds the network/benefit/
 * freshness dimensions it does not model, and defines how each reason is spoken
 * to each audience.
 */
import type { EligibilityReasonCode } from "./reason-codes";
import { ELIGIBILITY_REASON_CODES } from "./reason-codes";

/**
 * Reasons the base evaluator cannot produce, because they are not about the
 * member's life-cycle at all.
 *
 * `SYSTEM_UNAVAILABLE` is the important one. The existing conclusion set has no
 * way to say "we could not tell", so an outage was reported with the same words
 * as a genuine ineligibility — a provider cannot act on that difference, and at
 * the point of care the difference is the whole decision.
 */
export const ELIGIBILITY_NETWORK_REASON_CODES = [
  /** The provider is not in the member's package network. */
  "OUT_OF_NETWORK",
  /** This facility has no effective entitlement at all — the DEF-053 mechanism. */
  "PROVIDER_NOT_ENTITLED",
  /** We could not reach the data needed to decide. NOT an ineligibility. */
  "SYSTEM_UNAVAILABLE",
] as const;

export type EligibilityNetworkReasonCode = (typeof ELIGIBILITY_NETWORK_REASON_CODES)[number];

export type EligibilityDecisionReason = EligibilityReasonCode | EligibilityNetworkReasonCode;

export const ALL_ELIGIBILITY_DECISION_REASONS = [
  ...ELIGIBILITY_REASON_CODES,
  ...ELIGIBILITY_NETWORK_REASON_CODES,
] as const;

/**
 * The verdict. Deliberately separate from the reason: two different reasons can
 * share a verdict, and a UI must be able to branch on either.
 */
export type EligibilityVerdict =
  | "ELIGIBLE"
  | "ELIGIBLE_WITH_CONDITIONS"
  | "BENEFIT_BLOCKED"
  | "NOT_ELIGIBLE"
  | "PENDING_RENEWAL"
  /** We could not determine it. Never presented as a "no". */
  | "NOT_DETERMINED";

/** How a reason may be spoken to somebody who is not authorised to know more. */
export type AudienceDisclosure =
  /** Safe to state plainly. */
  | "PLAIN"
  /**
   * Must collapse outward into one indistinguishable string. Whether a given
   * card number exists is itself disclosure — the run recorded this as the one
   * property worth preserving about the old message.
   */
  | "COLLAPSE";

export interface ReasonCatalogueEntry {
  /** Shown to the member, or to a provider about the member. No internal terms. */
  memberSafe: string;
  /** What the person at the desk should DO. Absent when there is nothing to do. */
  operatorGuidance: string;
  disclosure: AudienceDisclosure;
  /** True when the member's cover is fine and only this benefit is blocked. */
  memberStillCovered: boolean;
}

/** The single string every collapsed reason presents outward. */
export const COLLAPSED_NOT_FOUND_MESSAGE =
  "We could not confirm cover for that number at this facility. Check the number, or contact the scheme administrator.";

/**
 * Every reason, in the words each audience gets.
 *
 * Two rules encoded here, both from the run:
 *   * a member whose BENEFIT is blocked is still a covered member — DEF-058
 *     found status-only verdicts, and E-003 was blocked precisely because the
 *     copy could not distinguish "exhausted" from "not a member";
 *   * identity-revealing reasons collapse to one string, so the desk cannot
 *     enumerate members by trying numbers.
 */
export const ELIGIBILITY_REASON_CATALOGUE: Record<EligibilityDecisionReason, ReasonCatalogueEntry> = {
  ACTIVE: {
    memberSafe: "Cover is active for this service date.",
    operatorGuidance: "Proceed. Confirm identity against the member's card or ID.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  ACTIVE_DEPENDANT: {
    memberSafe: "Cover is active for this dependant on this service date.",
    operatorGuidance: "Proceed. Confirm the dependant's identity and their principal's cover.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  ACTIVE_AS_OF_SERVICE_DATE: {
    memberSafe: "Cover was active on the service date entered.",
    operatorGuidance: "Proceed for that date. Cover today may differ — re-check for a later visit.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  POLICY_NOT_STARTED: {
    memberSafe: "Cover has not started yet.",
    operatorGuidance: "Do not treat as covered. The member's cover begins on a later date.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  NOT_YET_ENROLLED: {
    memberSafe: "This person was not enrolled on the service date entered.",
    operatorGuidance: "Check the service date. Enrolment may have begun after that day.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  WAITING_PERIOD: {
    memberSafe: "This benefit is still within its waiting period.",
    operatorGuidance: "Do not treat as covered under this benefit until the eligible-from date shown.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  SUSPENDED: {
    memberSafe: "Cover is currently suspended.",
    operatorGuidance: "Do not treat as covered. The member must contact the scheme administrator.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  TERMINATED: {
    memberSafe: "Cover has ended.",
    operatorGuidance: "Do not treat as covered. Cover ended before this service date.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  LAPSED: {
    memberSafe: "Cover has lapsed.",
    operatorGuidance: "Do not treat as covered. The scheme administrator can confirm reinstatement.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  COVERAGE_GAP: {
    memberSafe: "There is a gap in cover across this service date.",
    operatorGuidance: "Do not treat as covered for this date. Cover exists either side of the gap.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  REINSTATED: {
    memberSafe: "Cover has been reinstated and is active for this service date.",
    operatorGuidance: "Proceed. Waiting periods may have restarted on reinstatement.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  AGE_BOUNDARY: {
    memberSafe: "This benefit is not available at the member's age on the service date.",
    operatorGuidance: "Do not treat as covered under this benefit. Check the package age limits.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  OVER_AGE_DEPENDANT: {
    memberSafe: "This dependant is above the age the package covers.",
    operatorGuidance: "Do not treat as covered. The principal may need to update the family cover.",
    disclosure: "PLAIN",
    memberStillCovered: false,
  },
  LIMIT_EXHAUSTED: {
    // DEF-058 / E-003: the member is STILL COVERED — only the money is gone.
    memberSafe: "The available limit for this benefit has been used up.",
    operatorGuidance: "Cover is active, but this benefit has no remaining limit. Discuss self-payment or another benefit.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  PROVIDER_EXCLUDED: {
    memberSafe: "This facility is not covered under the member's package.",
    operatorGuidance: "Cover is active elsewhere. Direct the member to an in-network facility.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  MISSING_REFERRAL: {
    // DEF-060: referral rules were authored with member-safe copy that no
    // surface rendered.
    memberSafe: "This visit needs a referral from the member's primary provider.",
    operatorGuidance: "Obtain a referral before treating, unless this is an emergency.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  EMERGENCY_REFERRAL_EXCEPTION: {
    memberSafe: "A referral is normally required, but the emergency exception applies.",
    operatorGuidance: "Proceed as an emergency. Record why the exception was used.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  TREATMENT_EXCLUDED: {
    memberSafe: "This treatment is not covered under the member's package.",
    operatorGuidance: "Do not treat as covered for this service. Other benefits may still apply.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  EXPERIMENTAL_EXCLUDED: {
    memberSafe: "Experimental treatment is not covered.",
    operatorGuidance: "Do not treat as covered for this service. Other benefits may still apply.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  RENEWAL_VERSION: {
    memberSafe: "The scheme is being renewed, so cover for this date is not yet confirmed.",
    operatorGuidance: "Do not assume cover. Confirm with the scheme administrator before treating.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
  NOT_FOUND: {
    memberSafe: COLLAPSED_NOT_FOUND_MESSAGE,
    operatorGuidance: "Check the number entered. If it is correct, contact the scheme administrator.",
    disclosure: "COLLAPSE",
    memberStillCovered: false,
  },
  OUT_OF_NETWORK: {
    // Collapsed outward: telling an arbitrary desk that a number is real but
    // "not yours" still confirms the number exists.
    memberSafe: COLLAPSED_NOT_FOUND_MESSAGE,
    operatorGuidance: "This member is not covered at this facility. They may be covered elsewhere.",
    disclosure: "COLLAPSE",
    memberStillCovered: true,
  },
  PROVIDER_NOT_ENTITLED: {
    memberSafe: COLLAPSED_NOT_FOUND_MESSAGE,
    // The operator must be told this is a FACILITY problem, not a card problem —
    // DEF-053's message blamed the card for what was a data gap.
    operatorGuidance:
      "This facility has no active cover agreement, so no member can be confirmed here. Contact the scheme administrator — this is not a problem with the member's card.",
    disclosure: "COLLAPSE",
    memberStillCovered: true,
  },
  SYSTEM_UNAVAILABLE: {
    memberSafe: "We could not check cover just now. This is a temporary problem on our side.",
    operatorGuidance:
      "This is NOT a refusal of cover. Try again shortly; if it is urgent, follow the manual verification process.",
    disclosure: "PLAIN",
    memberStillCovered: true,
  },
};

/** The network/benefit decision, kept apart from the member's life-cycle status. */
export interface NetworkDecision {
  inNetwork: boolean;
  /** Named tier when known, e.g. "Tier 1". */
  networkTier: string | null;
  providerName: string | null;
  providerBranchName: string | null;
}

export interface BenefitDecision {
  benefitCategory: string | null;
  /** Whether this specific benefit may be used, independent of member status. */
  usable: boolean;
  /** Only when the caller is authorised to see money (D2/§8.1). */
  remainingLimit: number | null;
  currency: string | null;
  /** DEF-061: the DATE, not "270d wait". */
  waitingEligibleFrom: string | null;
  /** DEF-060: whether a referral is needed, and whether one is on file. */
  referralRequired: boolean;
  referralOnFile: boolean;
}

/**
 * The canonical decision. Every eligibility surface reports this shape, so the
 * same fixture and date produce the same reason code in the provider UI, the
 * API, the claim/preauth gate and the member surface — audience copy differing
 * only where privacy requires.
 */
export interface EligibilityDecisionV2 {
  verdict: EligibilityVerdict;
  /** Stable, machine-readable. The thing consumers branch on. */
  reasonCode: EligibilityDecisionReason;
  /** Safe for the member, and for a provider talking about the member. */
  memberSafeExplanation: string;
  /** What the person at the desk should do next. */
  operatorGuidance: string;

  /** The date the decision was evaluated FOR. */
  serviceDate: string;
  /** When the underlying data was read — DEF-062's missing freshness. */
  dataAsOf: string;
  /** After this, the answer must be re-checked rather than relied on. */
  validUntil: string;

  packageName: string | null;
  packageVersionId: string | null;
  schemeName: string | null;

  network: NetworkDecision;
  /** Member life-cycle status, separate from the benefit outcome (DEF-058). */
  coverStatus: { covered: boolean; reasonCode: EligibilityDecisionReason };
  benefit: BenefitDecision;

  /** Quotable, non-PII. Ties the answer to the server log. */
  correlationId: string;
  /** The stored evidence row, when one was written. */
  checkId: string | null;

  disclaimer: string;
}

export const ELIGIBILITY_DISCLAIMER =
  "This is a point-in-time eligibility check, not a guarantee of payment. Final payment depends on the actual service, a complete claim, the contract, any pre-authorisation, benefit limits, and policy.";

/** Verdicts that mean "the system answered", as opposed to "it could not". */
export function isDetermined(verdict: EligibilityVerdict): boolean {
  return verdict !== "NOT_DETERMINED";
}

/**
 * True when this reason must not be stated plainly to an unauthenticated or
 * un-entitled audience.
 */
export function collapsesOutward(reason: EligibilityDecisionReason): boolean {
  return ELIGIBILITY_REASON_CATALOGUE[reason].disclosure === "COLLAPSE";
}

/**
 * The member-facing sentence for a reason, honouring the privacy collapse.
 *
 * The INTERNAL reason code is always retained on the decision and in the
 * evidence row — collapsing is about what is *said*, never about what is
 * *recorded*. DEF-053 noted the collapse is also what stops the search
 * enumerating members, so it is preserved deliberately, not worked around.
 */
export function memberSafeText(reason: EligibilityDecisionReason): string {
  return ELIGIBILITY_REASON_CATALOGUE[reason].memberSafe;
}

export function operatorGuidanceText(reason: EligibilityDecisionReason): string {
  return ELIGIBILITY_REASON_CATALOGUE[reason].operatorGuidance;
}

/** Map a reason to its verdict. One place, so no surface invents its own. */
export function verdictForReason(reason: EligibilityDecisionReason): EligibilityVerdict {
  switch (reason) {
    case "ACTIVE":
    case "ACTIVE_DEPENDANT":
    case "ACTIVE_AS_OF_SERVICE_DATE":
    case "REINSTATED":
      return "ELIGIBLE";
    case "EMERGENCY_REFERRAL_EXCEPTION":
      return "ELIGIBLE_WITH_CONDITIONS";
    case "SYSTEM_UNAVAILABLE":
      // Never a "no". This is the distinction DEF-053 said was missing.
      return "NOT_DETERMINED";
    case "RENEWAL_VERSION":
      return "PENDING_RENEWAL";
    // The member is covered; only this benefit is unusable.
    case "WAITING_PERIOD":
    case "LIMIT_EXHAUSTED":
    case "AGE_BOUNDARY":
    case "MISSING_REFERRAL":
    case "TREATMENT_EXCLUDED":
    case "EXPERIMENTAL_EXCLUDED":
    case "PROVIDER_EXCLUDED":
    case "OUT_OF_NETWORK":
    case "PROVIDER_NOT_ENTITLED":
      return "BENEFIT_BLOCKED";
    default:
      return "NOT_ELIGIBLE";
  }
}
