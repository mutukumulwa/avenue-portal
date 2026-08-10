import { z } from "zod";
import { money } from "./money";

/**
 * SP-1 — canonical validation for shared-limit groups (DEF-026 / WP-2.5).
 *
 * The single source of truth imported by BOTH doors: the server action
 * (`createSharedLimitAction`) and the tRPC procedure (`packages.createSharedLimit`).
 *
 * Decision applied:
 *   D1 — a FAMILY-scope pool may cover a SINGLE category (the CT-015 maternity
 *        family pool). A MEMBER-scope pool is a cross-benefit *combined* cap, so
 *        it still needs ≥ 2 categories to be meaningful. The rule is exported as
 *        helpers so the UI mirrors the exact server rule (min count + rule text).
 */

export const LIMIT_SCOPE_VALUES = ["MEMBER", "FAMILY"] as const;
export type LimitScope = (typeof LIMIT_SCOPE_VALUES)[number];

export const FIELD_LABELS: Record<string, string> = {
  name: "Group name",
  limitAmount: "Shared limit",
  appliesTo: "Applies to",
  benefitConfigIds: "Benefits",
};

/** D1: minimum benefit categories a pool of the given scope must cover. */
export function sharedLimitMinBenefits(appliesTo: LimitScope): number {
  return appliesTo === "FAMILY" ? 1 : 2;
}

/** Human rule text for the given scope — rendered as visible helper text so the
 *  rule is never hidden inside a `disabled=` condition (SP-2 / C4). */
export function sharedLimitRuleText(appliesTo: LimitScope): string {
  return appliesTo === "FAMILY"
    ? "Family pools apply an aggregate cap across the whole family and may cover a single benefit (e.g. a maternity family pool)."
    : "Member (combined) pools share one cap across at least two benefit categories.";
}

const nameField = z
  .string({ required_error: `${FIELD_LABELS.name} is required.` })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1, { message: `${FIELD_LABELS.name} is required.` })
  .refine((s) => s.length <= 120, {
    message: `${FIELD_LABELS.name} must be at most 120 characters.`,
  });

/**
 * Base object WITHOUT the cross-field rules (so the tRPC door can `.extend()`
 * with `packageVersionId` and re-attach the shared refinement — a superRefined
 * schema is a ZodEffects with no `.extend()`).
 */
export const sharedLimitBaseSchema = z.object({
  name: nameField,
  limitAmount: money.positive(),
  appliesTo: z.enum(LIMIT_SCOPE_VALUES, {
    errorMap: () => ({ message: `${FIELD_LABELS.appliesTo} must be MEMBER or FAMILY.` }),
  }),
  benefitConfigIds: z.array(z.string().min(1)),
});

/**
 * The shared-limit cross-field rules. `limitAmount` must be > 0 (base). Here:
 * the scope-dependent minimum count (D1) and the duplicate-membership guard
 * (P-011) so every door gets both.
 */
export const sharedLimitRefinement = (
  data: { appliesTo: LimitScope; benefitConfigIds: string[] },
  ctx: z.RefinementCtx,
): void => {
  const min = sharedLimitMinBenefits(data.appliesTo);
  if (data.benefitConfigIds.length < min) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["benefitConfigIds"],
      message:
        min === 1
          ? "Select at least one benefit for this pool."
          : "Select at least two benefits for a combined member pool.",
    });
  }
  if (new Set(data.benefitConfigIds).size !== data.benefitConfigIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["benefitConfigIds"],
      message: "A benefit can only be added to the pool once.",
    });
  }
};

/** The action's schema: shared-limit fields with the cross-field rules applied. */
export const sharedLimitSchema = sharedLimitBaseSchema.superRefine(sharedLimitRefinement);

export type SharedLimitInput = z.infer<typeof sharedLimitSchema>;
