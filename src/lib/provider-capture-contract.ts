/**
 * Family Hospital UAT plan P02 / P03 — the shapes that cross the boundary
 * between the provider capture forms (client) and their server actions.
 *
 * Deliberately a plain module: a `"use server"` file may export async functions
 * only (AGENTS.md), so every type, constant and label the forms and actions
 * share lives here.
 *
 * Minimum necessary (plan §4 rule 5, P02.01 step 5): nothing here carries a
 * date of birth, phone, email, address, diagnosis history, or a raw member
 * number beyond what the user typed. The member is referred to by an opaque
 * reference once resolved.
 */
import type { BenefitCategory, ClaimLineCategory, ServiceType } from "@prisma/client";
import type { MutationFailure } from "@/lib/mutation-contract";

/** Which capture a request serves — it decides the permission required. */
export type CapturePurpose = "CLAIM" | "CLAIM_CORRECTION" | "PREAUTH" | "ELIGIBILITY";

export const CAPTURE_PURPOSES: readonly CapturePurpose[] = ["CLAIM", "CLAIM_CORRECTION", "PREAUTH", "ELIGIBILITY"] as const;

/** The permission each purpose requires (provider RBAC catalogue codes). */
export const CAPTURE_PERMISSION: Readonly<Record<CapturePurpose, string>> = {
  CLAIM: "provider.claim.create",
  CLAIM_CORRECTION: "provider.claim.correct",
  PREAUTH: "provider.preauth.create",
  ELIGIBILITY: "provider.eligibility.read",
};

/** What the form sends to resolve (or re-resolve) the case. */
export interface CaseContextRequest {
  purpose: CapturePurpose;
  /** Typed by the user. Sent in a POST body only — never in a URL. */
  memberNumber?: string;
  /** Opaque reference from an earlier resolution (or the eligibility hand-off). */
  memberRef?: string;
  branchId?: string | null;
  /** Kampala calendar date, YYYY-MM-DD. */
  serviceDate: string;
  benefitCategory: BenefitCategory;
}

/** A resolved case, as the form keeps it. Every field is re-derived on the server at submit. */
export interface CaseContextRef {
  purpose: CapturePurpose;
  memberRef: string;
  branchId: string;
  serviceDate: string;
  benefitCategory: BenefitCategory;
}

export type CaseContextOutcome =
  | "RESOLVED"
  | "INELIGIBLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NO_ACTIVE_CONTRACT"
  | "AMBIGUOUS_CONTRACT"
  | "BRANCH_REQUIRED"
  | "INVALID"
  | "UNAVAILABLE";

export interface UnlistedPolicy {
  /** May a service that is not in the contracted tariff be captured at all? */
  allowed: boolean;
  /** The contract's rule, e.g. REFER_FOR_REVIEW. */
  rule: string;
  /** What the form shows beside such a line. */
  label: string;
}

/** Minimal member + coverage context (plan P02.01 step 5). */
export interface CaseContextDTO {
  memberRef: string;
  displayName: string;
  maskedMemberNumber: string;
  eligibility: { eligible: boolean; reasonCode: string; message: string };
  schemeName: string | null;
  packageName: string | null;
  branch: { id: string; name: string };
  contract: { id: string; number: string; versionId: string | null } | null;
  /** The one currency for this case — the contract's. */
  currency: string | null;
  serviceDate: string;
  benefitCategory: BenefitCategory;
  /** Whether this facility may search and price from its contracted tariff. */
  catalogueEnabled: boolean;
  unlisted: UnlistedPolicy;
}

export type CaseContextResult =
  | { outcome: "RESOLVED"; context: CaseContextDTO; correlationId: string }
  | { outcome: "INELIGIBLE" | "NO_ACTIVE_CONTRACT" | "AMBIGUOUS_CONTRACT"; context: CaseContextDTO; message: string; correlationId: string }
  | {
      outcome: "NOT_FOUND" | "FORBIDDEN" | "BRANCH_REQUIRED" | "INVALID" | "UNAVAILABLE";
      message: string;
      fieldErrors?: Record<string, string>;
      branches?: Array<{ id: string; name: string }>;
      correlationId: string;
    };

export function contextRefFrom(purpose: CapturePurpose, dto: CaseContextDTO): CaseContextRef {
  return { purpose, memberRef: dto.memberRef, branchId: dto.branch.id, serviceDate: dto.serviceDate, benefitCategory: dto.benefitCategory };
}

// ─── Service catalogue ───────────────────────────────────────────────────────

export const CATALOGUE_MIN_QUERY = 2;
export const CATALOGUE_DEFAULT_LIMIT = 20;
export const CATALOGUE_MAX_LIMIT = 50;

export interface ServiceSearchRequest {
  context: CaseContextRef;
  category: ClaimLineCategory;
  query: string;
  limit?: number;
  offset?: number;
}

export interface ServiceSearchRow {
  tariffId: string;
  serviceName: string;
  providerServiceCode: string | null;
  cptCode: string | null;
  category: ClaimLineCategory;
  /** The facility's own grouping, e.g. "Drugs / Medication". */
  taxonomyName: string | null;
  /** Contracted unit rate as a canonical decimal string. */
  unitRate: string;
  currency: string;
  /** e.g. "per item · Vial" — display only. */
  unitLabel: string | null;
  requiresPreauth: boolean;
  effectiveFrom: string;
  /** False when the engine could not price this row unambiguously. */
  selectable: boolean;
  unavailableReason: string | null;
}

export type ServiceSearchResult =
  | {
      ok: true;
      rows: ServiceSearchRow[];
      total: number;
      hasMore: boolean;
      /** When nothing matched in the chosen category, where the text did match. */
      otherCategoryMatches: Array<{ category: ClaimLineCategory; count: number }>;
    }
  | {
      ok: false;
      code: "TOO_SHORT" | "CATALOGUE_DISABLED" | "CONTEXT_INVALID" | "THROTTLED" | "FORBIDDEN" | "UNAVAILABLE";
      message: string;
      correlationId: string;
    };

// ─── Diagnosis search ────────────────────────────────────────────────────────

export const DIAGNOSIS_MIN_QUERY = 2;

/** Code, description, category — and deliberately NO charge of any kind (P03.02). */
export interface DiagnosisOption {
  code: string;
  description: string;
  category: string;
}

export type DiagnosisSearchResult =
  | { ok: true; options: DiagnosisOption[] }
  | { ok: false; code: "TOO_SHORT" | "FORBIDDEN" | "THROTTLED" | "UNAVAILABLE"; message: string; correlationId: string };

// ─── Capture lines ───────────────────────────────────────────────────────────

/**
 * A captured line as the form submits it. The selected tariff id is the only
 * pricing input the server accepts; the contracted rate, service name,
 * category, codes and currency are re-read from that tariff row (P02.04).
 */
export interface CaptureLineInput {
  selectedProviderTariffId?: string | null;
  serviceCategory: ClaimLineCategory;
  /** Required only for an unlisted line; ignored when a tariff is selected. */
  description?: string;
  quantity: number | string;
  /** What the facility bills per unit — canonical decimal text. */
  billedUnitPrice: string;
  /**
   * P04.02 — this is line N of the earlier claim, not linked to the price list
   * and (the form says) unchanged. The server checks that against the stored
   * line; only a line that really is unchanged is carried as it was.
   */
  historicalLineNumber?: number;
}

/** Field-level error keys, so forms can focus the right control. */
export const lineFieldKey = (index: number, field: "service" | "quantity" | "billedUnitPrice" | "description" | "category") =>
  `lines.${index}.${field}`;

// ─── Claim capture submissions (P04.01 / P04.02) ─────────────────────────────

/**
 * What a provider claim form submits. Nothing here is authority: the server
 * re-resolves the case from `context`, re-reads every selected tariff and the
 * diagnosis, and derives tenant, provider, actor and currency itself.
 */
export interface ClaimCaptureSubmission {
  /** The form's draft id — the intake idempotency key (letters, digits, `._:-`). */
  idempotencyKey: string;
  context: CaseContextRef;
  /**
   * The contract version the form was priced against. When the fresh
   * resolution finds another one, the case is stale and the claim is refused.
   */
  expectedContractVersionId: string | null;
  serviceType: ServiceType;
  attendingDoctor?: string;
  diagnosisCode: string;
  lines: CaptureLineInput[];
}

/** A correction (F5.8) or resubmission (F5.10) of an earlier claim of this facility. */
export interface ClaimReplacementCaptureSubmission extends ClaimCaptureSubmission {
  predecessorClaimId: string;
  reason?: string;
}

/**
 * What a correction or resubmission action returns when it does not redirect:
 * a refusal, with `refresh` when the earlier claim changed state underneath
 * the form (decided, replaced, past its deadline) so the page re-evaluates.
 */
export type ReplacementSubmitResult = (MutationFailure & { refresh?: boolean }) | void;

/** Top-level field keys of the claim forms (line keys come from `lineFieldKey`). */
export const CLAIM_FIELDS = ["member", "serviceDate", "benefitCategory", "serviceType", "attendingDoctor", "diagnosis", "lines"] as const;
export type ClaimField = (typeof CLAIM_FIELDS)[number];

// ─── Pre-authorisation capture submissions (P04.03) ──────────────────────────

/**
 * A new pre-authorisation request. Each line's `billedUnitPrice` is the
 * facility's ESTIMATED unit cost — suggested from the contracted rate, always
 * editable, and stored apart from it (P04.03 step 3).
 */
export interface PreauthCaptureSubmission {
  idempotencyKey: string;
  context: CaseContextRef;
  expectedContractVersionId: string | null;
  serviceType: ServiceType;
  diagnosisCode: string;
  lines: CaptureLineInput[];
  clinicalNotes?: string;
}

/**
 * Additional services on an APPROVED pre-authorisation. The member, date,
 * benefit, service type and diagnoses are the parent's — the server fixes them;
 * `context` only carries the branch and lets the server check it is current.
 */
export interface PreauthAmendmentCaptureSubmission {
  parentPreAuthId: string;
  context: CaseContextRef;
  expectedContractVersionId: string | null;
  lines: CaptureLineInput[];
  clinicalNotes?: string;
}
