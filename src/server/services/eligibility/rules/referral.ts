/**
 * WP-2.4 (DEF-024) — referral-rule evaluation.
 *
 * `evaluateReferral` is a STANDALONE PURE FUNCTION: no Prisma, no I/O. Wired into
 * the existing preauth gate now (so CT-025 is enforceable) and exported so SP-6
 * and the claims path call the SAME function.
 *
 * Package-version-owned only — NOT a reuse of the provider INCLUDE/EXCLUDE rules
 * (PackageProviderEligibility).
 *
 * Contract truth:
 *   CT-025 — specialist-outpatient referral required EXCEPT in an emergency.
 *   EO-021 — missing referral → MISSING_REFERRAL (blocked).
 *   EO-022 — emergency → EMERGENCY_REFERRAL_EXCEPTION (allowed; auditable).
 */

import type { EligibilityReasonCode } from "../reason-codes";
import { codeSetsIntersect, valueInSet, isRuleEffective, byEffectiveThenId } from "./util";

/** The minimal projection of a `ReferralRule` the evaluator needs. */
export interface ReferralRuleView {
  id: string;
  benefitCategories: string[];
  serviceCodes: string[];
  providerSpecialties: string[];
  requiresReferral: boolean;
  emergencyException: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  memberSafeExplanation: string;
  isActive?: boolean;
}

/** The context a claim/PA presents to the referral evaluator. */
export interface ReferralContext {
  serviceDate: Date;
  benefitCategory?: string | null;
  serviceCodes?: string[];
  providerSpecialty?: string | null;
  /** The visit is an emergency (bypasses the referral requirement). */
  isEmergency?: boolean;
  /** A valid referral is on file for this service. */
  hasReferral?: boolean;
}

export interface ReferralEvaluation {
  blocked: boolean;
  reasonCode: EligibilityReasonCode | null; // MISSING_REFERRAL | EMERGENCY_REFERRAL_EXCEPTION | null
  memberSafeExplanation: string | null;
  /** True when an emergency lifted the referral requirement (EO-022) — audit this. */
  emergencyExceptionApplied: boolean;
  matchedRuleId: string | null;
}

const NOT_BLOCKED: ReferralEvaluation = {
  blocked: false,
  reasonCode: null,
  memberSafeExplanation: null,
  emergencyExceptionApplied: false,
  matchedRuleId: null,
};

/**
 * A rule applies when EVERY specified (non-empty) scope dimension matches the
 * context (AND across dimensions). A rule with no scope narrowing applies to
 * everything the version covers (validation still requires at least one
 * dimension at write time, so this is the defensive default).
 */
function ruleApplies(rule: ReferralRuleView, ctx: ReferralContext): boolean {
  const dims: boolean[] = [];
  if (rule.benefitCategories.length > 0) {
    dims.push(!!ctx.benefitCategory && rule.benefitCategories.includes(ctx.benefitCategory));
  }
  if (rule.serviceCodes.length > 0) dims.push(codeSetsIntersect(ctx.serviceCodes, rule.serviceCodes));
  if (rule.providerSpecialties.length > 0) dims.push(valueInSet(ctx.providerSpecialty, rule.providerSpecialties));
  if (dims.length === 0) return true;
  return dims.every(Boolean);
}

/**
 * Evaluate a member's referral rules against a service context. Returns the
 * first effective, applicable, referral-requiring rule that is not satisfied.
 * A present referral satisfies the rule; an emergency lifts it (surfaced as
 * EMERGENCY_REFERRAL_EXCEPTION, not blocked); otherwise the visit is blocked
 * (MISSING_REFERRAL).
 */
export function evaluateReferral(
  rules: ReferralRuleView[],
  ctx: ReferralContext,
): ReferralEvaluation {
  const effective = rules
    .filter((r) => r.requiresReferral && isRuleEffective(r, ctx.serviceDate))
    .sort(byEffectiveThenId);

  for (const rule of effective) {
    if (!ruleApplies(rule, ctx)) continue;
    if (ctx.hasReferral === true) continue; // a valid referral satisfies the rule

    if (rule.emergencyException && ctx.isEmergency === true) {
      return {
        blocked: false,
        reasonCode: "EMERGENCY_REFERRAL_EXCEPTION",
        memberSafeExplanation: rule.memberSafeExplanation,
        emergencyExceptionApplied: true,
        matchedRuleId: rule.id,
      };
    }
    return {
      blocked: true,
      reasonCode: "MISSING_REFERRAL",
      memberSafeExplanation: rule.memberSafeExplanation,
      emergencyExceptionApplied: false,
      matchedRuleId: rule.id,
    };
  }
  return NOT_BLOCKED;
}

/**
 * Member/provider-facing projection — NEVER exposes `sourceClause`.
 */
export function memberSafeReferralView(rule: ReferralRuleView): {
  memberSafeExplanation: string;
  requiresReferral: boolean;
  emergencyException: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
} {
  return {
    memberSafeExplanation: rule.memberSafeExplanation,
    requiresReferral: rule.requiresReferral,
    emergencyException: rule.emergencyException,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  };
}
