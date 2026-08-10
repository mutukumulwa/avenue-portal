import { z } from "zod";
import type { ActionFailure } from "@/lib/action-result";
import { money } from "./money";

/**
 * SP-1 — canonical validation for the Scheme entity (Prisma `model Group`).
 * S-phase hardening (WP-S1). The single source of truth for scheme create/edit +
 * benefit-tier rules, imported by BOTH doors to the same tables:
 *   - the server actions (`enrollGroupAction`, `updateGroupAction`, the tier
 *     actions, the individual-enrol action), and
 *   - the tRPC procedure (`groups.create`).
 *
 * Kills the run's S-phase gaps at `39bb24e`:
 *   - Blank / duplicate (case+space) name: `nameField` trims + collapses so the
 *     stored name and its derived `nameNormalized` key agree; the CLIENT-scoped
 *     duplicate rule lives in `GroupsService` (needs a DB query) backed by the
 *     `@@unique([clientId, nameNormalized])` DB unique.
 *   - `new Date(...)` → Invalid Date reaching Prisma: dates are `z.coerce.date()`
 *     with an explicit sane horizon, so an unparseable / absurd date is rejected
 *     at the boundary.
 *   - Renewal-before-start: the edit schema's cross-field rule enforces
 *     `effectiveDate < renewalDate` (create derives renewal = effective + 1y, so
 *     the inversion is only reachable on edit).
 *   - Free-text registration number: `registrationField` bounds format + length.
 *   - paymentFrequency free-text: closed enum.
 *   - Tier `Number(formData.get(...))` NaN into Decimal: `tierSchema` routes the
 *     contribution rate through the shared `money` (rejects NaN/Infinity/negatives).
 */

/** Human field labels so every consumer renders errors consistently. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Scheme name",
  industry: "Industry",
  registrationNumber: "Registration number",
  address: "Address",
  county: "County",
  contactPersonName: "Contact person",
  contactPersonPhone: "Contact phone",
  contactPersonEmail: "Contact email",
  packageId: "Package",
  effectiveDate: "Effective date",
  renewalDate: "Renewal date",
  paymentFrequency: "Payment frequency",
  status: "Status",
  reason: "Reason",
  // tier fields
  tierName: "Tier name",
  contributionRate: "Contribution rate",
};

export const PAYMENT_FREQUENCY_VALUES = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
] as const;

/** Sane date horizon: no scheme dates before 2000, none absurdly far ahead. The
 *  max is computed relative to "now" at parse time (not module load). */
const MIN_SCHEME_DATE = new Date("2000-01-01T00:00:00.000Z");
const MAX_YEARS_AHEAD = 5;
function maxSchemeDate(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() + MAX_YEARS_AHEAD);
  return d;
}

/** Required scheme name: trim → collapse internal whitespace → 1..160 chars. The
 *  collapse happens here so the stored `name` and the derived `nameNormalized`
 *  agree, catching S-002 case/space-padded duplicates. */
const nameField = z
  .string({ required_error: `${FIELD_LABELS.name} is required.` })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1, { message: `${FIELD_LABELS.name} is required.` })
  .refine((s) => s.length <= 160, {
    message: `${FIELD_LABELS.name} must be at most 160 characters.`,
  });

/** Optional free-ish text that must still be bounded (industry, address, county,
 *  contact name). Absent/blank → undefined. */
function optionalText(label: string, max: number) {
  return z
    .union([z.string(), z.undefined(), z.null()])
    .transform((s) => (s == null || s.trim() === "" ? undefined : s.replace(/\s+/g, " ").trim()))
    .refine((s) => s === undefined || s.length <= max, {
      message: `${label} must be at most ${max} characters.`,
    });
}

/** Optional registration number. When present: 2..40 chars, and only letters,
 *  digits and the punctuation real registration numbers use (`/ - . space`).
 *  Rejects the unsafe categories (emoji, formula-like `=…`, control chars). */
const REGISTRATION_RE = /^[A-Za-z0-9][A-Za-z0-9/.\- ]{1,39}$/;
const registrationField = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim()))
  .refine((s) => s === undefined || REGISTRATION_RE.test(s), {
    message: `${FIELD_LABELS.registrationNumber} must be 2–40 characters: letters, digits, and / - . only.`,
  });

const contactNameField = z
  .string({ required_error: `${FIELD_LABELS.contactPersonName} is required.` })
  .transform((s) => s.replace(/\s+/g, " ").trim())
  .refine((s) => s.length >= 1, { message: `${FIELD_LABELS.contactPersonName} is required.` })
  .refine((s) => s.length <= 120, {
    message: `${FIELD_LABELS.contactPersonName} must be at most 120 characters.`,
  });

const PHONE_RE = /^[+0-9][0-9 ()\-]{4,29}$/;
const contactPhoneField = z
  .string({ required_error: `${FIELD_LABELS.contactPersonPhone} is required.` })
  .transform((s) => s.trim())
  .refine((s) => PHONE_RE.test(s), {
    message: `${FIELD_LABELS.contactPersonPhone} must be a valid phone number.`,
  });

const contactEmailField = z
  .string({ required_error: `${FIELD_LABELS.contactPersonEmail} is required.` })
  .transform((s) => s.trim())
  .pipe(z.string().email({ message: `${FIELD_LABELS.contactPersonEmail} must be a valid email.` }));

const packageIdField = z
  .string({ required_error: `${FIELD_LABELS.packageId} is required.` })
  .min(1, { message: `${FIELD_LABELS.packageId} is required.` });

const paymentFrequencyField = z.enum(PAYMENT_FREQUENCY_VALUES, {
  errorMap: () => ({ message: `${FIELD_LABELS.paymentFrequency} is invalid.` }),
});

/** A single coercible, in-horizon date field. `z.coerce.date()` turns "" and any
 *  unparseable string into an Invalid Date that fails `invalid_date` — so a blank
 *  or garbage date can never reach Prisma. */
function schemeDateField(label: string) {
  return z.coerce
    .date({
      errorMap: () => ({ message: `${label} is required and must be a valid date.` }),
    })
    .refine((d) => d >= MIN_SCHEME_DATE, {
      message: `${label} is unreasonably far in the past.`,
    })
    .refine((d) => d <= maxSchemeDate(), {
      message: `${label} is too far in the future.`,
    });
}

/**
 * CREATE schema — the fields `GroupsService.createGroup` needs. Renewal is
 * DERIVED (effective + 1 year) so it is not accepted here; the horizon guard on
 * `effectiveDate` is the only date check the create path needs.
 */
export const groupCreateSchema = z.object({
  name: nameField,
  industry: optionalText(FIELD_LABELS.industry, 120),
  registrationNumber: registrationField,
  contactPersonName: contactNameField,
  contactPersonPhone: contactPhoneField,
  contactPersonEmail: contactEmailField,
  packageId: packageIdField,
  effectiveDate: schemeDateField(FIELD_LABELS.effectiveDate),
});

/**
 * EDIT schema — profile + policy-window fields. Status is NOT here: lifecycle
 * transitions are governed (WP-S2) and never ride the general edit form. Both
 * dates are user-supplied on edit, so the cross-field rule guards
 * renewal-before-start and an over-long policy window (S-006 date validations).
 */
export const groupEditSchema = z
  .object({
    name: nameField,
    industry: optionalText(FIELD_LABELS.industry, 120),
    registrationNumber: registrationField,
    address: optionalText(FIELD_LABELS.address, 200),
    county: optionalText(FIELD_LABELS.county, 120),
    contactPersonName: contactNameField,
    contactPersonPhone: contactPhoneField,
    contactPersonEmail: contactEmailField,
    paymentFrequency: paymentFrequencyField,
    effectiveDate: schemeDateField(FIELD_LABELS.effectiveDate),
    renewalDate: schemeDateField(FIELD_LABELS.renewalDate),
    notes: optionalText("Notes", 2000),
  })
  .superRefine((data, ctx) => {
    if (!(data.effectiveDate < data.renewalDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["renewalDate"],
        message: `${FIELD_LABELS.renewalDate} must be after the ${FIELD_LABELS.effectiveDate.toLowerCase()}.`,
      });
      return;
    }
    const maxRenewal = new Date(data.effectiveDate);
    maxRenewal.setFullYear(maxRenewal.getFullYear() + MAX_YEARS_AHEAD);
    if (data.renewalDate > maxRenewal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["renewalDate"],
        message: `${FIELD_LABELS.renewalDate} is more than ${MAX_YEARS_AHEAD} years after the ${FIELD_LABELS.effectiveDate.toLowerCase()}.`,
      });
    }
  });

export type GroupCreateInput = z.infer<typeof groupCreateSchema>;
export type GroupEditInput = z.infer<typeof groupEditSchema>;

// ── Benefit tiers (WP-S3) ───────────────────────────────────────────────────
//
// The tier write doors previously did `Number(formData.get("contributionRate"))`
// (NaN → Decimal) with no bounds. Route the rate through the shared `money`
// (finite, ≥ 0, ≤ 2dp) so neither create nor update can persist a NaN/negative.

export const TIER_FIELD_LABELS: Record<string, string> = {
  name: "Tier name",
  packageId: "Package",
  contributionRate: "Contribution rate",
};

export const tierSchema = z.object({
  name: z
    .string({ required_error: `${TIER_FIELD_LABELS.name} is required.` })
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .refine((s) => s.length >= 1, { message: `${TIER_FIELD_LABELS.name} is required.` })
    .refine((s) => s.length <= 80, {
      message: `${TIER_FIELD_LABELS.name} must be at most 80 characters.`,
    }),
  packageId: z
    .string({ required_error: `${TIER_FIELD_LABELS.packageId} is required.` })
    .min(1, { message: `${TIER_FIELD_LABELS.packageId} is required.` }),
  contributionRate: money,
  description: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((s) => (s == null || s.trim() === "" ? null : s.trim())),
  isDefault: z.boolean(),
});

export type TierInput = z.infer<typeof tierSchema>;

// ── Governed status change (WP-S2) ──────────────────────────────────────────

export const GROUP_STATUS_VALUES = [
  "PROSPECT",
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "LAPSED",
  "TERMINATED",
] as const;

/**
 * Schema for the governed status-change action. A reason is REQUIRED for the
 * transitions that end/hold cover or that reinstate a terminal scheme; the
 * service enforces this too (defence — a direct caller can't skip it).
 */
export const groupStatusChangeSchema = z.object({
  targetStatus: z.enum(GROUP_STATUS_VALUES, {
    errorMap: () => ({ message: `${FIELD_LABELS.status} is invalid.` }),
  }),
  reason: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((s) => (s == null || s.trim() === "" ? undefined : s.trim()))
    .refine((s) => s === undefined || s.length <= 500, {
      message: `${FIELD_LABELS.reason} must be at most 500 characters.`,
    }),
  effectiveDate: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((s) => (s == null || s.trim() === "" ? undefined : s))
    .pipe(schemeDateField(FIELD_LABELS.effectiveDate).optional()),
  override: z.boolean().optional(),
});

export type GroupStatusChangeInput = z.infer<typeof groupStatusChangeSchema>;

/**
 * The scheme actions' return type — SP-2 `ActionResult` plus a UI-only `values`
 * carrier so an uncontrolled form re-renders with the user's input preserved on
 * a validation failure. Success carries no data (the action redirects/revalidates).
 */
export type GroupActionState =
  | { ok: true }
  | (ActionFailure & { values?: Record<string, string> });
