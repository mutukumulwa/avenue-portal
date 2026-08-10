import { z } from "zod";
import { BENEFIT_CATEGORY_VALUES } from "./package";
import { codeField, memberSafeField, codeArraysIntersect, windowsOverlap } from "./rule-scope";

/**
 * SP-1 — canonical validation for structured treatment exclusions (WP-2.3 /
 * DEF-023). The single source of truth imported by BOTH doors to the
 * `TreatmentExclusionRule` table: the server action
 * (`createTreatmentExclusionAction`) and the tRPC procedure
 * (`packages.createTreatmentExclusion`).
 *
 * Replaces the read-only `BenefitConfig.exclusions[]` string array (enforced
 * nowhere). Rules: required fields, effective-date order, at-least-one scope
 * dimension, ABSOLUTE/CONDITIONAL ↔ exceptionLogic consistency, and overlap/
 * conflict detection among rules of the same category+scope.
 */

export const TREATMENT_EXCLUSION_CATEGORY_VALUES = [
  "COSMETIC",
  "EXPERIMENTAL",
  "CONGENITAL",
  "ELECTIVE",
  "LIFESTYLE",
  "DENTAL_ELECTIVE",
  "OTHER",
] as const;
export type TreatmentExclusionCategory = (typeof TREATMENT_EXCLUSION_CATEGORY_VALUES)[number];

export const TREATMENT_EXCLUSION_TYPE_VALUES = ["ABSOLUTE", "CONDITIONAL"] as const;
export type TreatmentExclusionType = (typeof TREATMENT_EXCLUSION_TYPE_VALUES)[number];

/** Human field labels so every consumer renders errors consistently. */
export const FIELD_LABELS: Record<string, string> = {
  ruleCategory: "Exclusion category",
  exclusionType: "Exclusion type",
  benefitCategories: "Benefit categories",
  serviceCodes: "Service codes",
  diagnosisCodes: "Diagnosis codes",
  procedureCodes: "Procedure codes",
  exceptionLogic: "Exception rule",
  effectiveFrom: "Effective from",
  effectiveTo: "Effective to",
  memberSafeExplanation: "Member-safe explanation",
};

/**
 * Structured exception for CONDITIONAL rules — matches the discriminated union in
 * `src/server/services/eligibility/rules/exclusion.ts` (kept in sync by hand; the
 * two layers must not cross-import — validation is bundled client-side).
 */
export const exclusionExceptionLogicSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NONE") }),
  z.object({
    type: z.literal("RECONSTRUCTIVE_AFTER_TRAUMA"),
    triggerProcedureCodes: z.array(codeField).optional(),
    triggerDiagnosisCodes: z.array(codeField).optional(),
    requiresPriorCoveredTrauma: z.boolean().optional(),
  }),
  z.object({ type: z.literal("DIAGNOSIS_PRESENT"), diagnosisCodes: z.array(codeField).min(1) }),
  z.object({ type: z.literal("PROCEDURE_PRESENT"), procedureCodes: z.array(codeField).min(1) }),
]);
export type ExclusionExceptionLogicInput = z.infer<typeof exclusionExceptionLogicSchema>;

/**
 * Base object WITHOUT the cross-field rules (so the tRPC door can `.extend()`
 * with the owner id and re-attach `treatmentExclusionRefinement`).
 */
export const treatmentExclusionBaseSchema = z.object({
  ruleCategory: z.enum(TREATMENT_EXCLUSION_CATEGORY_VALUES, {
    errorMap: () => ({ message: `${FIELD_LABELS.ruleCategory} is required.` }),
  }),
  exclusionType: z.enum(TREATMENT_EXCLUSION_TYPE_VALUES, {
    errorMap: () => ({ message: `${FIELD_LABELS.exclusionType} is required.` }),
  }),
  benefitCategories: z.array(z.enum(BENEFIT_CATEGORY_VALUES)).default([]),
  serviceCodes: z.array(codeField).default([]),
  diagnosisCodes: z.array(codeField).default([]),
  procedureCodes: z.array(codeField).default([]),
  exceptionLogic: exclusionExceptionLogicSchema.nullable().optional(),
  effectiveFrom: z.coerce.date({ errorMap: () => ({ message: `${FIELD_LABELS.effectiveFrom} is required.` }) }),
  effectiveTo: z.coerce.date().nullable().optional(),
  sourceClause: z.string().max(500).optional().nullable(),
  internalNote: z.string().max(2000).optional().nullable(),
  memberSafeExplanation: memberSafeField,
});

/** Cross-field invariants shared by both doors. */
export const treatmentExclusionRefinement = (
  data: z.infer<typeof treatmentExclusionBaseSchema>,
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
    data.benefitCategories.length > 0 ||
    data.serviceCodes.length > 0 ||
    data.diagnosisCodes.length > 0 ||
    data.procedureCodes.length > 0;
  if (!hasScope) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["benefitCategories"],
      message:
        "Specify at least one benefit category, or a diagnosis / procedure / service code, for the exclusion scope.",
    });
  }
  const exType = data.exceptionLogic?.type;
  if (data.exclusionType === "CONDITIONAL" && (!exType || exType === "NONE")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exceptionLogic"],
      message: "A conditional exclusion needs an exception rule (e.g. reconstructive after a covered trauma).",
    });
  }
  if (data.exclusionType === "ABSOLUTE" && exType && exType !== "NONE") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exceptionLogic"],
      message: "An absolute exclusion cannot carry an exception rule.",
    });
  }
};

/** The action/router schema: exclusion fields with the cross-field rules. */
export const treatmentExclusionSchema = treatmentExclusionBaseSchema.superRefine(treatmentExclusionRefinement);
export type TreatmentExclusionInput = z.infer<typeof treatmentExclusionSchema>;

// ── Ownership (N-012) ───────────────────────────────────────────────────────

/** Resolve the single owner of an exclusion (XOR of the two owner ids). */
export function resolveExclusionOwner(input: {
  packageVersionId?: string | null;
  providerContractId?: string | null;
}):
  | { ok: true; owner: { packageVersionId: string } | { providerContractId: string } }
  | { ok: false; message: string } {
  const hasPv = !!input.packageVersionId;
  const hasPc = !!input.providerContractId;
  if (hasPv === hasPc) {
    return {
      ok: false,
      message: "An exclusion must be owned by exactly one of a package version or a provider contract.",
    };
  }
  return hasPv
    ? { ok: true, owner: { packageVersionId: input.packageVersionId! } }
    : { ok: true, owner: { providerContractId: input.providerContractId! } };
}

// ── Overlap / conflict detection (write-time) ───────────────────────────────

export interface ExclusionOverlapView {
  id?: string;
  ruleCategory: string;
  benefitCategories: string[];
  serviceCodes: string[];
  diagnosisCodes: string[];
  procedureCodes: string[];
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isActive?: boolean;
}

function scopesOverlap(a: ExclusionOverlapView, b: ExclusionOverlapView): boolean {
  return (
    codeArraysIntersect(a.benefitCategories, b.benefitCategories) ||
    codeArraysIntersect(a.serviceCodes, b.serviceCodes) ||
    codeArraysIntersect(a.diagnosisCodes, b.diagnosisCodes) ||
    codeArraysIntersect(a.procedureCodes, b.procedureCodes)
  );
}

/**
 * Returns the first EXISTING rule that conflicts with `candidate`, or null. A
 * conflict is a rule of the SAME category whose scope overlaps AND whose
 * effective window overlaps — i.e. a duplicate or a contradictory (absolute vs
 * conditional) rule over the same ground. The write is rejected on a conflict.
 */
export function detectExclusionOverlap(
  existing: ExclusionOverlapView[],
  candidate: ExclusionOverlapView,
): ExclusionOverlapView | null {
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (e.isActive === false) continue;
    if (e.ruleCategory !== candidate.ruleCategory) continue;
    if (!scopesOverlap(e, candidate)) continue;
    if (!windowsOverlap(e.effectiveFrom, e.effectiveTo, candidate.effectiveFrom, candidate.effectiveTo)) continue;
    return e;
  }
  return null;
}
