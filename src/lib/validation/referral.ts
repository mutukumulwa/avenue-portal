import { z } from "zod";
import { BENEFIT_CATEGORY_VALUES } from "./package";
import { codeField, memberSafeField, codeArraysIntersect, windowsOverlap } from "./rule-scope";

/**
 * SP-1 — canonical validation for structured referral rules (WP-2.4 / DEF-024).
 * The single source of truth imported by BOTH doors to the `ReferralRule` table:
 * the server action (`createReferralRuleAction`) and the tRPC procedure
 * (`packages.createReferralRule`).
 *
 * Package-version-owned only — NOT a reuse of the provider INCLUDE/EXCLUDE rules.
 * Rules: required fields, effective-date order, at-least-one scope dimension,
 * overlap/conflict detection among rules of the same scope.
 */

/** A specialty label (e.g. "Cardiology"). Trim → collapse → 1–60 chars. */
const specialtyField = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1 && s.length <= 60, { message: "Each specialty must be 1–60 characters." });

export const FIELD_LABELS: Record<string, string> = {
  benefitCategories: "Benefit categories",
  serviceCodes: "Service codes",
  providerSpecialties: "Provider specialties",
  requiresReferral: "Requires referral",
  emergencyException: "Emergency exception",
  effectiveFrom: "Effective from",
  effectiveTo: "Effective to",
  memberSafeExplanation: "Member-safe explanation",
};

/**
 * Base object WITHOUT the cross-field rules (so the tRPC door can `.extend()`
 * with `packageVersionId` and re-attach `referralRuleRefinement`).
 */
export const referralRuleBaseSchema = z.object({
  benefitCategories: z.array(z.enum(BENEFIT_CATEGORY_VALUES)).default([]),
  serviceCodes: z.array(codeField).default([]),
  providerSpecialties: z.array(specialtyField).default([]),
  requiresReferral: z.coerce.boolean().default(true),
  emergencyException: z.coerce.boolean().default(true),
  effectiveFrom: z.coerce.date({ errorMap: () => ({ message: `${FIELD_LABELS.effectiveFrom} is required.` }) }),
  effectiveTo: z.coerce.date().nullable().optional(),
  sourceClause: z.string().max(500).optional().nullable(),
  memberSafeExplanation: memberSafeField,
});

/** Cross-field invariants shared by both doors. */
export const referralRuleRefinement = (
  data: z.infer<typeof referralRuleBaseSchema>,
  ctx: z.RefinementCtx,
): void => {
  if (data.effectiveTo && data.effectiveTo.getTime() <= data.effectiveFrom.getTime()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: `${FIELD_LABELS.effectiveTo} must be after ${FIELD_LABELS.effectiveFrom.toLowerCase()}.`,
    });
  }
  const hasScope =
    data.benefitCategories.length > 0 || data.serviceCodes.length > 0 || data.providerSpecialties.length > 0;
  if (!hasScope) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["benefitCategories"],
      message:
        "Specify at least one benefit category, service code, or provider specialty for the referral scope.",
    });
  }
};

/** The action/router schema: referral fields with the cross-field rules. */
export const referralRuleSchema = referralRuleBaseSchema.superRefine(referralRuleRefinement);
export type ReferralRuleInput = z.infer<typeof referralRuleSchema>;

// ── Overlap / conflict detection (write-time) ───────────────────────────────

export interface ReferralOverlapView {
  id?: string;
  benefitCategories: string[];
  serviceCodes: string[];
  providerSpecialties: string[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive?: boolean;
}

function scopesOverlap(a: ReferralOverlapView, b: ReferralOverlapView): boolean {
  return (
    codeArraysIntersect(a.benefitCategories, b.benefitCategories) ||
    codeArraysIntersect(a.serviceCodes, b.serviceCodes) ||
    codeArraysIntersect(a.providerSpecialties, b.providerSpecialties)
  );
}

/**
 * Returns the first EXISTING referral rule whose scope AND effective window
 * overlap `candidate`, or null. Two rules over the same ground (whether a
 * duplicate or a requiresReferral yes/no contradiction) are rejected at write.
 */
export function detectReferralOverlap(
  existing: ReferralOverlapView[],
  candidate: ReferralOverlapView,
): ReferralOverlapView | null {
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (e.isActive === false) continue;
    if (!scopesOverlap(e, candidate)) continue;
    if (!windowsOverlap(e.effectiveFrom, e.effectiveTo, candidate.effectiveFrom, candidate.effectiveTo)) continue;
    return e;
  }
  return null;
}
