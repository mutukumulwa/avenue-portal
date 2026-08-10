import { z } from "zod";
import { money, percent } from "./money";

/**
 * SP-1 — canonical validation for the package / benefit-config entity
 * (Wave 2: DEF-021..026 and the DEF-027 invariant class repeated across the
 * package surface).
 *
 * The single source of truth for package create/edit rules, imported by BOTH
 * doors to the same tables: the server actions (`createPackageAction`,
 * `updatePackageAction`) and the tRPC procedures (`packages.create`). Previously
 * every door used bare `Number(formData.get())` / `z.number().min(0)`, so
 * NaN / negative / `minAge > maxAge` / `sublimit > annualLimit` / `copay = 500%`
 * all persisted from whichever door was reached.
 *
 * Decisions applied:
 *   D5 — money is Decimal(…,2): finite, non-negative, ≤ 2 dp. Percent is the
 *        whole-number 0–100 scale ("10 means 10%"), never a 0–1 fraction.
 *
 * Field-level building blocks (money / percent / ageField / benefit shape) are
 * exported so the FormData server actions can validate field-by-field and key
 * their errors to the actual form input names, while the tRPC door validates the
 * already-structured object in one pass — one rule set, both doors.
 */

/** The 13 BenefitCategory enum values (as-const tuple → z.enum literal union). */
export const BENEFIT_CATEGORY_VALUES = [
  "INPATIENT",
  "OUTPATIENT",
  "MATERNITY",
  "DENTAL",
  "OPTICAL",
  "MENTAL_HEALTH",
  "CHRONIC_DISEASE",
  "SURGICAL",
  "AMBULANCE_EMERGENCY",
  "LAST_EXPENSE",
  "WELLNESS_PREVENTIVE",
  "REHABILITATION",
  "CUSTOM",
] as const;

export const PACKAGE_TYPE_VALUES = ["INDIVIDUAL", "FAMILY", "GROUP", "CORPORATE"] as const;
export const PACKAGE_STATUS_VALUES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

/** Human field labels so every consumer renders errors consistently. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Package name",
  type: "Package type",
  status: "Status",
  annualLimit: "Annual limit",
  contributionAmount: "Contribution amount",
  minAge: "Minimum age",
  maxAge: "Maximum age",
  dependentMaxAge: "Dependent maximum age",
  annualSubLimit: "Annual sub-limit",
  copayPercentage: "Co-pay %",
  waitingPeriodDays: "Waiting period",
  perVisitLimit: "Per-visit limit",
};

/** Required name: trim → collapse internal whitespace → 1–160 chars. */
export const packageNameField = z
  .string({ required_error: `${FIELD_LABELS.name} is required.` })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1, { message: `${FIELD_LABELS.name} is required.` })
  .refine((s) => s.length <= 160, {
    message: `${FIELD_LABELS.name} must be at most 160 characters.`,
  });

/** Age fields: whole years, 0–120 (D3-adjacent age zod for WP-3.5D reuse). */
export const ageField = z.coerce
  .number({ invalid_type_error: "Enter a whole number of years." })
  .int("Enter a whole number of years.")
  .min(0, "Age cannot be negative.")
  .max(120, "Age cannot exceed 120.");

/** Waiting period: whole days, 0–3650 (10 years). */
export const waitingField = z.coerce
  .number({ invalid_type_error: "Enter a whole number of days." })
  .int("Enter a whole number of days.")
  .min(0, "Waiting period cannot be negative.")
  .max(3650, "Waiting period cannot exceed 3650 days.");

/**
 * One benefit row. `annualSubLimit` is money (finite, ≥ 0, ≤ 2 dp);
 * `copayPercentage` is 0–100; `perVisitLimit` is optional money > 0 (null =
 * no per-visit cap — DEF-022 write path). The cross-field
 * `annualSubLimit ≤ annualLimit` lives on the package-level schema because it
 * needs the sibling `annualLimit`.
 */
export const packageBenefitInputSchema = z.object({
  category: z.enum(BENEFIT_CATEGORY_VALUES, {
    errorMap: () => ({ message: "Choose a valid benefit category." }),
  }),
  annualSubLimit: money,
  copayPercentage: percent.optional(),
  waitingPeriodDays: waitingField.optional(),
  perVisitLimit: money.positive().nullable().optional(),
});

export type PackageBenefitInput = z.infer<typeof packageBenefitInputSchema>;

/** Package-level fields shared by create and edit. */
export const packageCoreShape = {
  name: packageNameField,
  type: z.enum(PACKAGE_TYPE_VALUES, {
    errorMap: () => ({ message: `${FIELD_LABELS.type} is invalid.` }),
  }),
  annualLimit: money.positive(),
  // A fully employer-subsidised package legitimately charges the member 0, so
  // contribution is non-negative (not strictly positive) — but never NaN/neg.
  contributionAmount: money,
  minAge: ageField,
  maxAge: ageField,
} as const;

/**
 * Cross-field: minimum age must be strictly below the maximum age. Attaches to
 * `minAge` so the form renders it next to that input.
 */
export const ageOrderRefinement = (
  data: { minAge: number; maxAge: number },
  ctx: z.RefinementCtx,
): void => {
  if (data.minAge >= data.maxAge) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minAge"],
      message: `${FIELD_LABELS.minAge} must be below the ${FIELD_LABELS.maxAge.toLowerCase()}.`,
    });
  }
};

/**
 * Package create schema — the tRPC `packages.create` door validates against
 * this in one pass. Benefits carry the `annualSubLimit ≤ annualLimit` and age
 * invariants via `.superRefine`.
 */
export const packageCreateSchema = z
  .object({
    ...packageCoreShape,
    description: z.string().optional().nullable(),
    dependentMaxAge: ageField.optional(),
    status: z.enum(PACKAGE_STATUS_VALUES).optional(),
    exclusions: z.array(z.string()).optional(),
    benefits: z.array(packageBenefitInputSchema).min(1, "At least one benefit is required."),
  })
  .superRefine((data, ctx) => {
    ageOrderRefinement(data, ctx);
    data.benefits.forEach((b, i) => {
      if (b.annualSubLimit > data.annualLimit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["benefits", i, "annualSubLimit"],
          message: `${FIELD_LABELS.annualSubLimit} cannot exceed the package ${FIELD_LABELS.annualLimit.toLowerCase()}.`,
        });
      }
    });
  });

export type PackageCreateInput = z.infer<typeof packageCreateSchema>;

/** Package core-fields schema for the edit action (status required; benefits are
 *  validated row-by-row by the action so errors key to per-category inputs). */
export const packageCoreSchema = z
  .object({
    ...packageCoreShape,
    description: z.string().optional().nullable(),
    status: z.enum(PACKAGE_STATUS_VALUES, {
      errorMap: () => ({ message: `${FIELD_LABELS.status} is invalid.` }),
    }),
    dependentMaxAge: ageField,
  })
  .superRefine(ageOrderRefinement);

export type PackageCoreInput = z.infer<typeof packageCoreSchema>;
