/**
 * Claims Autopilot — canonical normalization (F1.2).
 *
 * Turns a schema-VALID `ClaimSubmissionV1` into ONE canonical object so that
 * semantically-identical inputs from any rail (API number money vs UI string
 * money, extra whitespace, lowercase codes, different line order when source
 * refs exist) normalize to the SAME structure. That canonical object is what
 * F1.3 hashes and F3.3 persists. See §7.4, §7.5, §8.2.
 *
 * Rules:
 *   - Money via `Decimal` only (parse/multiply/sum/round) — never binary float.
 *   - Line billed and claim total are RECOMPUTED from quantity × unit cost and
 *     rounded to the money-posting scale (2dp); a supplied billed is not trusted.
 *   - Unit cost keeps its given precision (≤4dp) as a canonical no-trailing-zero
 *     decimal string, so `1500`, `1500.00` and `"1500.0"` all canonicalize equal.
 *   - Dates: calendar-date fields → `YYYY-MM-DD`; instant fields → ISO `…Z`.
 *   - Codes → trimmed + uppercased (never invented). Text → trimmed + collapsed
 *     whitespace. Optional-absent → `null` for a stable canonical shape.
 *   - Line order: when every line has a source ref, order canonically by that
 *     ref (order-independent); otherwise preserve input order. Stable
 *     1-based `lineNumber` assigned after ordering.
 *
 * No DB access, no clock (the "service date not in the future" business rule is
 * enforced in context, F3.1, where system time and a tolerance exist).
 */
import Decimal from "decimal.js";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";
import type { ClaimSubmissionV1 } from "./schema";
import { toSafeMoneyString } from "./schema";

/** Scale (decimal places) at which billed line amounts and totals post to ledgers. */
export const MONEY_SCALE = 2;

export interface NormalizedLine {
  lineNumber: number;
  sourceLineRef: string | null;
  serviceCategory: ClaimLineCategory;
  cptCode: string | null;
  drugCode: string | null;
  icdCode: string | null;
  description: string;
  quantity: number;
  unitCost: string; // canonical decimal string (no trailing zeros, ≤4dp)
  billedAmount: string; // canonical decimal string, recomputed = round(qty × unit, 2dp)
}

export interface NormalizedSubmission {
  schemaVersion: "1";
  idempotencyKey: string;
  externalClaimRef: string | null;
  externalEncounterRef: string | null;
  invoiceNumber: string | null;
  submittedAt: string | null; // ISO instant
  sourceUpdatedAt: string | null; // ISO instant
  member: { memberId: string | null; memberNumber: string | null };
  provider: { providerId: string | null; branchId: string | null; practitionerRef: string | null };
  encounter: {
    serviceType: ServiceType;
    benefitCategory: BenefitCategory;
    serviceFrom: string; // YYYY-MM-DD
    serviceTo: string | null;
    admissionDate: string | null;
    dischargeDate: string | null;
    attendingDoctor: string | null;
  };
  diagnoses: Array<{ code: string; description: string | null; isPrimary: boolean }>;
  lines: NormalizedLine[];
  currency: string | null;
  preauthRefs: string[];
  attachmentRefs: Array<{ documentId: string | null; externalRef: string | null; category: string; sha256: string | null }>;
  origin: {
    batchId: string | null;
    rowNumber: number | null;
    deviceId: string | null;
    caseId: string | null;
    caseSliceSeq: number | null;
    reimbursementRequestId: string | null;
  } | null;
  replacementOfClaimRef: string | null;
  correctionReason: string | null;
  totalBilled: string; // canonical decimal string
}

// ── Field normalizers ─────────────────────────────────────────────────────────

const orNull = (v: string | undefined | null): string | null => (v == null ? null : v);
const trimOrNull = (v: string | undefined | null): string | null => {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
};

/** Trim and collapse internal whitespace runs to single spaces. */
export function normalizeText(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

/** Trim + uppercase a code; never invents a missing code. */
export function normalizeCode(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.trim().toUpperCase();
  return t.length === 0 ? null : t;
}

/** Calendar-date field → YYYY-MM-DD (schema guarantees the leading date shape). */
export function normalizeCalendarDate(v: string): string {
  return v.slice(0, 10);
}

/** Instant field → ISO 8601 UTC (…Z). */
export function normalizeInstant(v: string | undefined | null): string | null {
  if (v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Canonical decimal string with no trailing zeros and no exponent. */
export function canonicalDecimal(v: string | number): string {
  const s = toSafeMoneyString(v);
  if (s === null) throw new Error("normalize received non-canonical money — validate with the schema first");
  return new Decimal(s).toFixed();
}

/** round(value, MONEY_SCALE) as a canonical decimal string. */
function roundMoney(d: Decimal): string {
  return d.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP).toFixed();
}

// ── The normalizer ────────────────────────────────────────────────────────────

export function normalizeSubmission(sub: ClaimSubmissionV1): NormalizedSubmission {
  // Lines: canonicalize money, recompute billed, order, number.
  const prepared = sub.lines.map((l) => {
    const unit = canonicalDecimal(l.unitCost);
    const billed = roundMoney(new Decimal(l.quantity).times(unit));
    return {
      sourceLineRef: trimOrNull(l.sourceLineRef),
      serviceCategory: l.serviceCategory,
      cptCode: normalizeCode(l.cptCode),
      drugCode: normalizeCode(l.drugCode),
      icdCode: normalizeCode(l.icdCode),
      description: normalizeText(l.description),
      quantity: l.quantity,
      unitCost: unit,
      billedAmount: billed,
    };
  });

  // Canonical order: by source ref when EVERY line has one (order-independent);
  // otherwise preserve input order.
  const everyHasRef = prepared.every((l) => l.sourceLineRef !== null);
  const ordered = everyHasRef
    ? [...prepared].sort((a, b) => (a.sourceLineRef! < b.sourceLineRef! ? -1 : a.sourceLineRef! > b.sourceLineRef! ? 1 : 0))
    : prepared;

  const lines: NormalizedLine[] = ordered.map((l, i) => ({ lineNumber: i + 1, ...l }));

  const totalBilled = roundMoney(
    lines.reduce((sum, l) => sum.plus(new Decimal(l.billedAmount)), new Decimal(0)),
  );

  return {
    schemaVersion: "1",
    idempotencyKey: sub.idempotencyKey,
    externalClaimRef: trimOrNull(sub.externalClaimRef),
    externalEncounterRef: trimOrNull(sub.externalEncounterRef),
    invoiceNumber: trimOrNull(sub.invoiceNumber),
    submittedAt: normalizeInstant(sub.submittedAt),
    sourceUpdatedAt: normalizeInstant(sub.sourceUpdatedAt),
    member: {
      memberId: trimOrNull(sub.member.memberId),
      memberNumber: trimOrNull(sub.member.memberNumber),
    },
    provider: {
      providerId: trimOrNull(sub.provider.providerId),
      branchId: trimOrNull(sub.provider.branchId),
      practitionerRef: trimOrNull(sub.provider.practitionerRef),
    },
    encounter: {
      serviceType: sub.encounter.serviceType,
      benefitCategory: sub.encounter.benefitCategory,
      serviceFrom: normalizeCalendarDate(sub.encounter.serviceFrom),
      serviceTo: sub.encounter.serviceTo ? normalizeCalendarDate(sub.encounter.serviceTo) : null,
      admissionDate: sub.encounter.admissionDate ? normalizeCalendarDate(sub.encounter.admissionDate) : null,
      dischargeDate: sub.encounter.dischargeDate ? normalizeCalendarDate(sub.encounter.dischargeDate) : null,
      attendingDoctor: sub.encounter.attendingDoctor ? normalizeText(sub.encounter.attendingDoctor) : null,
    },
    diagnoses: sub.diagnoses.map((d) => ({
      code: normalizeCode(d.code)!,
      description: d.description ? normalizeText(d.description) : null,
      isPrimary: d.isPrimary,
    })),
    lines,
    currency: sub.currency ? sub.currency.toUpperCase() : null,
    // PA refs are order-insensitive → sort for a stable canonical form.
    preauthRefs: (sub.preauthRefs ?? []).map((r) => r.trim()).filter((r) => r.length > 0).sort(),
    attachmentRefs: (sub.attachmentRefs ?? []).map((a) => ({
      documentId: trimOrNull(a.documentId),
      externalRef: trimOrNull(a.externalRef),
      category: normalizeText(a.category),
      sha256: a.sha256 ? a.sha256.toLowerCase() : null,
    })),
    origin: sub.origin
      ? {
          batchId: trimOrNull(sub.origin.batchId),
          rowNumber: sub.origin.rowNumber ?? null,
          deviceId: trimOrNull(sub.origin.deviceId),
          caseId: trimOrNull(sub.origin.caseId),
          caseSliceSeq: sub.origin.caseSliceSeq ?? null,
          reimbursementRequestId: trimOrNull(sub.origin.reimbursementRequestId),
        }
      : null,
    replacementOfClaimRef: trimOrNull(sub.replacementOfClaimRef),
    correctionReason: sub.correctionReason ? normalizeText(sub.correctionReason) : null,
    totalBilled,
  };
}

/** Convenience for `orNull` re-export in case callers want the same null policy. */
export { orNull };
