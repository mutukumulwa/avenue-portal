/**
 * Structured-rule evaluators (WP-2.3 exclusions / WP-2.4 referral).
 *
 * One import site for the pure evaluation functions so preauth, the coming SP-6
 * evaluator, and the claims path all consume the same logic.
 */
export {
  evaluateExclusions,
  exclusionExceptionSatisfied,
  memberSafeExclusionView,
  type ExclusionRuleView,
  type ExclusionExceptionLogic,
  type ExclusionContext,
  type ExclusionEvaluation,
} from "./exclusion";

export {
  evaluateReferral,
  memberSafeReferralView,
  type ReferralRuleView,
  type ReferralContext,
  type ReferralEvaluation,
} from "./referral";
