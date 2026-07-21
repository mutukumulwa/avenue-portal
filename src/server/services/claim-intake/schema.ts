/**
 * Claims Autopilot — canonical claim submission contract (F1.1).
 *
 * ONE versioned Zod schema validates the STRUCTURAL shape for every rail
 * (admin, provider, API, tRPC, CSV, offline, reimbursement, pre-auth, case).
 * See CLAIMS_AUTOPILOT_EXECUTION_PLAN.md §7.
 *
 * Boundaries this file OWNS (structural, deterministic, no clock, no DB):
 *   - supported schema version;
 *   - safe idempotency-key shape and length;
 *   - field/array/string size limits (named constants below);
 *   - ≥1 line; positive integer quantity; finite positive money with bounded scale;
 *   - billed == quantity × unit cost within tolerance (structural rejection, CA-007);
 *   - date FORMAT and ordering (serviceFrom ≤ serviceTo, admission ≤ discharge);
 *   - exactly one primary diagnosis when diagnoses are present;
 *   - code/ref/text character constraints and anti-HTML text guard;
 *   - rejection of caller-supplied privilege/security fields via `.strict()` (§7.2).
 *
 * Boundaries this file DOES NOT own (deliberately):
 *   - "service date not in the future" — needs a clock; enforced in normalization/
 *     context (F1.2/F3.1) where a tolerance and system time exist.
 *   - currency EXISTENCE / FX — validated against data in context (F3.1).
 *   - service-category mapping, pricing, benefit, PA, fraud — later stages.
 *   - canonical normalization/recompute — normalize.ts (F1.2). This schema only
 *     VALIDATES; it does not transform values.
 */
import { z } from "zod";
import Decimal from "decimal.js";
import { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

export const SUPPORTED_SCHEMA_VERSION = "1" as const;

/** Bounded maxima — named so route body-size guards and tests can reuse them. */
export const LIMITS = {
  IDEMPOTENCY_KEY_MIN: 8,
  IDEMPOTENCY_KEY_MAX: 128,
  MAX_LINES: 200,
  MAX_DIAGNOSES: 50,
  MAX_ATTACHMENTS: 50,
  MAX_PREAUTH_REFS: 20,
  MAX_DESCRIPTION: 500,
  MAX_CODE: 32,
  MAX_REF: 100,
  MAX_TEXT: 200,
  MAX_QUANTITY: 100_000,
  /** money: up to 15 integer digits and 4 fractional digits, no sign, no exponent. */
  MONEY_INT_DIGITS: 15,
  MONEY_FRACTION_DIGITS: 4,
  /** Suggested transport body cap for route handlers (bytes). Enforced at the edge. */
  MAX_BODY_BYTES: 1_000_000,
} as const;

const MONEY_RE = new RegExp(`^\\d{1,${LIMITS.MONEY_INT_DIGITS}}(\\.\\d{1,${LIMITS.MONEY_FRACTION_DIGITS}})?$`);
const MONEY_TOLERANCE = new Decimal("0.01");

// ── Primitive field builders ──────────────────────────────────────────────────

/** A code such as ICD/CPT/drug — alphanumerics plus dot/hyphen, bounded. */
const codeField = z
  .string()
  .max(LIMITS.MAX_CODE)
  .regex(/^[A-Za-z0-9.\-]+$/, "code may contain only letters, digits, dot and hyphen");

/** A short business reference — word chars plus dot/hyphen/colon, bounded. */
const refField = z
  .string()
  .max(LIMITS.MAX_REF)
  .regex(/^[\w.\-:]+$/, "reference may contain only letters, digits, dot, hyphen, underscore and colon");

/** Free-ish text that will be displayed later — bounded, non-blank, no HTML tags. */
function textField(max: number) {
  return z
    .string()
    .max(max)
    .refine((s) => s.trim().length > 0, "must not be blank")
    .refine((s) => !/<\s*[a-zA-Z/!]/.test(s), "must not contain HTML/script markup")
    .refine((s) => !/javascript:/i.test(s), "must not contain a javascript: scheme");
}

/** ISO date (YYYY-MM-DD) or ISO datetime; must be a real parseable instant. */
const dateField = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/,
    "must be an ISO date or date-time",
  )
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be a real calendar date");

/** Money accepted as a decimal string or a number; validated to a safe positive value. */
export function toSafeMoneyString(v: string | number): string | null {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : null) : v.trim();
  if (s === null || !MONEY_RE.test(s)) return null; // rejects NaN/Infinity/exponent/sign/overflow/excess scale
  return s;
}

const moneyField = z.union([z.string(), z.number()]).superRefine((v, ctx) => {
  const s = toSafeMoneyString(v);
  if (s === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `must be a positive amount with ≤ ${LIMITS.MONEY_INT_DIGITS} integer and ≤ ${LIMITS.MONEY_FRACTION_DIGITS} fractional digits, no exponent`,
    });
    return;
  }
  if (new Decimal(s).lte(0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be greater than zero" });
  }
});

const currencyField = z.string().regex(/^[A-Z]{3}$/, "must be a 3-letter uppercase ISO-4217 code");

/** 64-char lowercase hex SHA-256, when an attachment declares one. */
const sha256Field = z.string().regex(/^[a-f0-9]{64}$/, "must be a 64-char lowercase hex SHA-256");

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const memberSchema = z
  .object({
    memberId: refField.optional(),
    memberNumber: z.string().max(LIMITS.MAX_REF).optional(),
  })
  .strict();

const providerSchema = z
  .object({
    // providerId is DERIVED for provider sessions/keys (§7.2). It is permitted in
    // the envelope (operator rail may select one), but context (F3.1) rejects a
    // supplied id that conflicts with a provider credential.
    providerId: refField.optional(),
    branchId: refField.optional(),
    practitionerRef: z.string().max(LIMITS.MAX_TEXT).optional(),
  })
  .strict();

const encounterSchema = z
  .object({
    serviceType: z.nativeEnum(ServiceType),
    benefitCategory: z.nativeEnum(BenefitCategory),
    serviceFrom: dateField,
    serviceTo: dateField.optional(),
    admissionDate: dateField.optional(),
    dischargeDate: dateField.optional(),
    attendingDoctor: textField(LIMITS.MAX_TEXT).optional(),
  })
  .strict();

const diagnosisSchema = z
  .object({
    code: codeField,
    description: textField(LIMITS.MAX_DESCRIPTION).optional(),
    isPrimary: z.boolean(),
  })
  .strict();

const lineSchema = z
  .object({
    sourceLineRef: refField.optional(),
    serviceCategory: z.nativeEnum(ClaimLineCategory),
    cptCode: codeField.optional(),
    drugCode: codeField.optional(),
    icdCode: codeField.optional(),
    description: textField(LIMITS.MAX_DESCRIPTION),
    quantity: z.number().int().positive().max(LIMITS.MAX_QUANTITY),
    unitCost: moneyField,
    billedAmount: moneyField,
  })
  .strict()
  .superRefine((line, ctx) => {
    const unit = toSafeMoneyString(line.unitCost);
    const billed = toSafeMoneyString(line.billedAmount);
    if (unit === null || billed === null) return; // per-field money issues already raised
    const expected = new Decimal(line.quantity).times(unit);
    if (expected.minus(billed).abs().gt(MONEY_TOLERANCE)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billedAmount"],
        message: `billed amount must equal quantity × unit cost (expected ${expected.toFixed()}, got ${billed})`,
      });
    }
  });

const attachmentSchema = z
  .object({
    documentId: refField.optional(),
    externalRef: z.string().max(LIMITS.MAX_REF).optional(),
    category: textField(LIMITS.MAX_TEXT),
    sha256: sha256Field.optional(),
  })
  .strict();

const originSchema = z
  .object({
    batchId: refField.optional(),
    rowNumber: z.number().int().nonnegative().optional(),
    deviceId: refField.optional(),
    caseId: refField.optional(),
    caseSliceSeq: z.number().int().positive().optional(),
    reimbursementRequestId: refField.optional(),
  })
  .strict();

// ── The versioned envelope ────────────────────────────────────────────────────

export const ClaimSubmissionV1Schema = z
  .object({
    schemaVersion: z.literal(SUPPORTED_SCHEMA_VERSION),
    idempotencyKey: z
      .string()
      .min(LIMITS.IDEMPOTENCY_KEY_MIN)
      .max(LIMITS.IDEMPOTENCY_KEY_MAX)
      .regex(/^[A-Za-z0-9._:\-]+$/, "idempotency key may contain only letters, digits, dot, underscore, colon and hyphen"),
    externalClaimRef: z.string().max(LIMITS.MAX_REF).optional(),
    externalEncounterRef: z.string().max(LIMITS.MAX_REF).optional(),
    invoiceNumber: z.string().max(LIMITS.MAX_REF).optional(),
    submittedAt: dateField.optional(),
    sourceUpdatedAt: dateField.optional(),
    member: memberSchema,
    provider: providerSchema,
    encounter: encounterSchema,
    diagnoses: z.array(diagnosisSchema).max(LIMITS.MAX_DIAGNOSES),
    lines: z.array(lineSchema).min(1, "at least one line is required").max(LIMITS.MAX_LINES),
    currency: currencyField.optional(),
    preauthRefs: z.array(z.string().max(LIMITS.MAX_REF)).max(LIMITS.MAX_PREAUTH_REFS).optional(),
    attachmentRefs: z.array(attachmentSchema).max(LIMITS.MAX_ATTACHMENTS).optional(),
    origin: originSchema.optional(),
    replacementOfClaimRef: z.string().max(LIMITS.MAX_REF).optional(),
    correctionReason: textField(LIMITS.MAX_DESCRIPTION).optional(),
  })
  .strict() // rejects caller-supplied tenantId/clientId/decision/payableAmount/… (§7.2)
  .superRefine((sub, ctx) => {
    // Member must be identifiable by at least one of id / number.
    if (!sub.member.memberId && !sub.member.memberNumber) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["member"], message: "member id or member number is required" });
    }
    // Exactly one primary diagnosis when diagnoses are present (§7.3).
    if (sub.diagnoses.length > 0) {
      const primaries = sub.diagnoses.filter((d) => d.isPrimary).length;
      if (primaries !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["diagnoses"], message: `exactly one primary diagnosis is required (found ${primaries})` });
      }
    }
    // Date ordering (§7.3). FORMAT is validated per-field; here we order them.
    const { serviceFrom, serviceTo, admissionDate, dischargeDate } = sub.encounter;
    if (serviceTo && Date.parse(serviceTo) < Date.parse(serviceFrom)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["encounter", "serviceTo"], message: "service end cannot precede service start" });
    }
    if (admissionDate && dischargeDate && Date.parse(dischargeDate) < Date.parse(admissionDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["encounter", "dischargeDate"], message: "discharge cannot precede admission" });
    }
  });

// ── Inferred types ────────────────────────────────────────────────────────────
export type ClaimSubmissionV1 = z.infer<typeof ClaimSubmissionV1Schema>;
export type ClaimSubmissionLine = z.infer<typeof lineSchema>;
export type ClaimSubmissionDiagnosis = z.infer<typeof diagnosisSchema>;
export type ClaimSubmissionAttachment = z.infer<typeof attachmentSchema>;

/**
 * Structural validation entry point. Returns Zod's SafeParse result; the stable
 * issue mapping onto safe transport codes lives in errors.ts (F1.4). This module
 * performs NO database access and NO value transformation.
 */
export function parseClaimSubmissionV1(raw: unknown) {
  return ClaimSubmissionV1Schema.safeParse(raw);
}
