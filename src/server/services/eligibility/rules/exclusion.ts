/**
 * WP-2.3 (DEF-023) — treatment-exclusion evaluation.
 *
 * `evaluateExclusions` is a STANDALONE PURE FUNCTION: no Prisma, no I/O. It is
 * wired into the existing preauth gate now (so CT-023/CT-024 are enforceable) and
 * is exported so the coming SP-6 evaluator and the claims path call the SAME
 * function — the logic must never be re-implemented inline where it can't be
 * reused.
 *
 * Both a package-version-owned and a provider-contract-owned rule (N-012) project
 * to `ExclusionRuleView`, so one evaluation path covers both owners.
 *
 * Contract truth:
 *   CT-023 — cosmetic excluded UNLESS reconstructive after a covered trauma.
 *   CT-024 — experimental excluded (absolute).
 */

import type { EligibilityReasonCode } from "../reason-codes";
import { codeSetsIntersect, isRuleEffective, byEffectiveThenId } from "./util";

/** The minimal projection of a `TreatmentExclusionRule` the evaluator needs. */
export interface ExclusionRuleView {
  id: string;
  ruleCategory: string; // TreatmentExclusionCategory
  exclusionType: "ABSOLUTE" | "CONDITIONAL";
  benefitCategories: string[];
  serviceCodes: string[];
  diagnosisCodes: string[];
  procedureCodes: string[];
  exceptionLogic: ExclusionExceptionLogic | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  memberSafeExplanation: string;
  isActive?: boolean;
}

/**
 * Structured exception for CONDITIONAL rules. Kept a small, closed discriminated
 * union so it is testable and stable. The validation module (SP-1) validates the
 * same shape at write time.
 */
export type ExclusionExceptionLogic =
  | { type: "NONE" }
  | {
      type: "RECONSTRUCTIVE_AFTER_TRAUMA";
      /** Procedure codes that mark reconstructive intent (optional). */
      triggerProcedureCodes?: string[];
      /** Trauma diagnosis codes that mark the qualifying event (optional). */
      triggerDiagnosisCodes?: string[];
      /** Require evidence of a prior COVERED trauma episode (ctx.priorCoveredTrauma). */
      requiresPriorCoveredTrauma?: boolean;
    }
  | { type: "DIAGNOSIS_PRESENT"; diagnosisCodes: string[] }
  | { type: "PROCEDURE_PRESENT"; procedureCodes: string[] };

/** The clinical context a claim/PA presents to the exclusion evaluator. */
export interface ExclusionContext {
  serviceDate: Date;
  benefitCategory?: string | null;
  diagnosisCodes?: string[];
  procedureCodes?: string[];
  serviceCodes?: string[];
  /** Reconstructive intent asserted by the caller (claims / manual review). */
  isReconstructive?: boolean;
  /** The member has a prior COVERED trauma episode (CT-023 exception evidence). */
  priorCoveredTrauma?: boolean;
}

export interface ExclusionEvaluation {
  excluded: boolean;
  reasonCode: EligibilityReasonCode | null;
  memberSafeExplanation: string | null;
  matchedRuleId: string | null;
}

const NOT_EXCLUDED: ExclusionEvaluation = {
  excluded: false,
  reasonCode: null,
  memberSafeExplanation: null,
  matchedRuleId: null,
};

/**
 * A rule matches when EVERY specified (non-empty) scope dimension intersects the
 * context (AND across dimensions, OR within a dimension). Empty dimensions are
 * ignored; a rule with no scope at all matches nothing (guards against a
 * catch-all that would exclude everything — validation also forbids it).
 */
function ruleMatches(rule: ExclusionRuleView, ctx: ExclusionContext): boolean {
  const dims: boolean[] = [];
  if (rule.benefitCategories.length > 0) {
    dims.push(!!ctx.benefitCategory && rule.benefitCategories.includes(ctx.benefitCategory));
  }
  if (rule.diagnosisCodes.length > 0) dims.push(codeSetsIntersect(ctx.diagnosisCodes, rule.diagnosisCodes));
  if (rule.procedureCodes.length > 0) dims.push(codeSetsIntersect(ctx.procedureCodes, rule.procedureCodes));
  if (rule.serviceCodes.length > 0) dims.push(codeSetsIntersect(ctx.serviceCodes, rule.serviceCodes));
  if (dims.length === 0) return false;
  return dims.every(Boolean);
}

/** Does the CONDITIONAL rule's exception apply, lifting the exclusion? */
export function exclusionExceptionSatisfied(
  logic: ExclusionExceptionLogic | null,
  ctx: ExclusionContext,
): boolean {
  if (!logic || logic.type === "NONE") return false;
  switch (logic.type) {
    case "RECONSTRUCTIVE_AFTER_TRAUMA": {
      const reconstructiveIntent =
        ctx.isReconstructive === true ||
        codeSetsIntersect(ctx.procedureCodes, logic.triggerProcedureCodes ?? []) ||
        codeSetsIntersect(ctx.diagnosisCodes, logic.triggerDiagnosisCodes ?? []);
      if (!reconstructiveIntent) return false;
      if (logic.requiresPriorCoveredTrauma) return ctx.priorCoveredTrauma === true;
      return true;
    }
    case "DIAGNOSIS_PRESENT":
      return codeSetsIntersect(ctx.diagnosisCodes, logic.diagnosisCodes);
    case "PROCEDURE_PRESENT":
      return codeSetsIntersect(ctx.procedureCodes, logic.procedureCodes);
    default:
      return false;
  }
}

function reasonForCategory(ruleCategory: string): EligibilityReasonCode {
  return ruleCategory === "EXPERIMENTAL" ? "EXPERIMENTAL_EXCLUDED" : "TREATMENT_EXCLUDED";
}

/**
 * Evaluate a member's exclusion rules against a service context. Returns the
 * first effective, matching rule that actually excludes (deterministic order);
 * a CONDITIONAL rule whose exception is satisfied does NOT exclude.
 */
export function evaluateExclusions(
  rules: ExclusionRuleView[],
  ctx: ExclusionContext,
): ExclusionEvaluation {
  const effective = rules
    .filter((r) => isRuleEffective(r, ctx.serviceDate))
    .sort(byEffectiveThenId);

  for (const rule of effective) {
    if (!ruleMatches(rule, ctx)) continue;
    if (rule.exclusionType === "CONDITIONAL" && exclusionExceptionSatisfied(rule.exceptionLogic, ctx)) {
      continue; // exception applies — this rule does not exclude
    }
    return {
      excluded: true,
      reasonCode: reasonForCategory(rule.ruleCategory),
      memberSafeExplanation: rule.memberSafeExplanation,
      matchedRuleId: rule.id,
    };
  }
  return NOT_EXCLUDED;
}

/**
 * Member/provider-facing projection — the ONLY fields safe to display outside
 * internal underwriting surfaces. NEVER exposes `internalNote` / `sourceClause`.
 */
export function memberSafeExclusionView(rule: ExclusionRuleView & { ruleCategory: string }): {
  ruleCategory: string;
  memberSafeExplanation: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
} {
  return {
    ruleCategory: rule.ruleCategory,
    memberSafeExplanation: rule.memberSafeExplanation,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  };
}
