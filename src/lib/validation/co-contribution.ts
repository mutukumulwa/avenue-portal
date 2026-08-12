import { z } from "zod";
import { money, percent } from "./money";

/**
 * SP-1 — canonical validation for annual co-contribution caps (DEF-027).
 *
 * The single source of truth for the cap write rules, imported by BOTH doors to
 * the same table: the server action (`upsertAnnualCapAction`) and the tRPC
 * procedure (`coContribution.upsertCap`). Previously each door validated
 * separately (or not at all), so a family cap below the individual cap could be
 * persisted from either one — the run-03 stop-line.
 *
 * Decisions applied:
 *   D4 — family cap is OPTIONAL (null = no family cap); when present it must be
 *        >= the individual cap.
 *   D5 — money is Decimal(12,2): finite, positive, at most 2 decimal places.
 */

/** Human labels so every consumer renders field errors consistently. */
export const FIELD_LABELS: Record<string, string> = {
  individualCap: "Individual annual cap",
  familyCap: "Family annual cap",
};

/**
 * Base object WITHOUT the cross-field rule. Exported on its own because a
 * `.superRefine()` returns a `ZodEffects`, which has no `.extend()` — the tRPC
 * procedure needs to add `packageId` and then re-attach the shared refinement
 * (see `capsRefinement`). Keeping the object and the refinement separate lets
 * both doors share the exact same field + cross-field rules.
 */
export const capsBaseSchema = z.object({
  individualCap: money.positive(),
  familyCap: money.positive().nullable(),
});

/**
 * Cross-field invariant (D4): a present family cap must be >= the individual
 * cap. Attaches the error to the `familyCap` field so the form can render it
 * next to the offending input.
 */
export const capsRefinement = (
  data: { individualCap: number; familyCap: number | null },
  ctx: z.RefinementCtx,
): void => {
  if (data.familyCap != null && data.familyCap < data.individualCap) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["familyCap"],
      message: `${FIELD_LABELS.familyCap} cannot be below the ${FIELD_LABELS.individualCap.toLowerCase()}.`,
    });
  }
};

/** The action's schema: caps only, with the cross-field rule applied. */
export const capsSchema = capsBaseSchema.superRefine(capsRefinement);

export type CapsInput = z.infer<typeof capsSchema>;

// ── Co-contribution RULES (WP-2.0) ──────────────────────────────────────────
//
// Distinct from the annual caps above: these are the per-tier copay/coinsurance
// rules. Before Wave 2 both doors (`createCoContributionRuleAction`, the tRPC
// `coContribution.createRule`) let `percentage = 500` and a negative
// `fixedAmount`/`perVisitCap` persist (consumed unclamped at
// claim-decision.service.ts). D5: percent is 0–100; money is finite, ≥ 0, ≤ 2dp.

export const CO_CONTRIBUTION_TYPES = ["FIXED_AMOUNT", "PERCENTAGE", "HYBRID", "NONE"] as const;
export const NETWORK_TIER_VALUES = ["TIER_1", "TIER_2", "TIER_3"] as const;

export const RULE_FIELD_LABELS: Record<string, string> = {
  networkTier: "Network tier",
  type: "Rule type",
  fixedAmount: "Fixed amount",
  percentage: "Percentage",
  perVisitCap: "Per-visit cap",
};

/**
 * Base object WITHOUT the cross-field rule (so the tRPC door can `.extend()`
 * before re-attaching the refinement). Money fields are optional+nullable
 * (absent = not set); when present they must be finite, ≥ 0, ≤ 2 dp. Percentage
 * is bounded 0–100.
 */
export const coContributionRuleBaseSchema = z.object({
  benefitCategory: z.string().optional().nullable(),
  networkTier: z.enum(NETWORK_TIER_VALUES, {
    errorMap: () => ({ message: `${RULE_FIELD_LABELS.networkTier} is required.` }),
  }),
  type: z.enum(CO_CONTRIBUTION_TYPES, {
    errorMap: () => ({ message: `${RULE_FIELD_LABELS.type} is required.` }),
  }),
  fixedAmount: money.nullable().optional(),
  percentage: percent.nullable().optional(),
  perVisitCap: money.positive().nullable().optional(),
});

/**
 * Cross-field: a FIXED_AMOUNT rule needs a fixed amount; a PERCENTAGE/HYBRID
 * rule needs a percentage. Mirrors the two engines' expectations so neither door
 * can persist a rule that charges nonsense.
 *
 * ── UAT-HF P09.02 — DEF-021 ────────────────────────────────────────────────
 *
 * "The percentage input declares min='0' and max='100' and the browser treats 0
 * as valid, but attempting to save a 0% rule is refused server-side with
 * 'Percentage is required for a percentage or hybrid rule.' Zero is conflated
 * with empty. The effective accepted range is therefore greater-than-0 to 100
 * while the advertised range is 0 to 100 ... the message points the underwriter
 * at the wrong cause — it says a value is required when one was supplied."
 *
 * The check was `== null || <= 0`. Zero is a **supplied value**, and a 0%
 * co-contribution is a real configuration: the plan covers everything for that
 * category and network tier. It is now a nullish check only, so the accepted
 * range is the advertised range.
 *
 * A negative value is still refused — but as a *negative*, not as a missing
 * one. Telling somebody a value is required when they gave you one is what sent
 * the run's underwriter looking in the wrong place.
 */
export const coContributionRuleRefinement = (
  data: { type: string; fixedAmount?: number | null; percentage?: number | null },
  ctx: z.RefinementCtx,
): void => {
  if (data.type === "FIXED_AMOUNT") {
    if (data.fixedAmount == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fixedAmount"],
        message: `${RULE_FIELD_LABELS.fixedAmount} is required for a fixed-amount rule.`,
      });
    } else if (data.fixedAmount < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fixedAmount"],
        message: `${RULE_FIELD_LABELS.fixedAmount} cannot be negative. Use 0 if the member pays nothing.`,
      });
    }
  }
  if (data.type === "PERCENTAGE" || data.type === "HYBRID") {
    if (data.percentage == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["percentage"],
        message: `${RULE_FIELD_LABELS.percentage} is required for a percentage or hybrid rule. Enter 0 if the member pays nothing.`,
      });
    } else if (data.percentage < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["percentage"],
        message: `${RULE_FIELD_LABELS.percentage} cannot be negative.`,
      });
    }
  }
};

/** The action/router schema: rule fields with the cross-field rule applied. */
export const coContributionRuleSchema = coContributionRuleBaseSchema.superRefine(
  coContributionRuleRefinement,
);

export type CoContributionRuleInput = z.infer<typeof coContributionRuleSchema>;
