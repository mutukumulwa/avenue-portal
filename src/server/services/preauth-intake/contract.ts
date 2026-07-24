import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import type { BenefitCategory, ServiceType } from "@prisma/client";

/**
 * PNOS F3.1 — versioned canonical PA submission contract (v1).
 *
 * Covers the union of every existing submitter (B2B API, provider portal, admin
 * portal, admin tRPC, member app, amendment) WITHOUT changing behaviour: this
 * module only defines the shape, normalization, per-channel validation, request
 * hash, and safe error codes. Nothing is persisted here (F3.2/F3.3 do that).
 *
 * The hard split (D1): TRUSTED context comes from the session/credential;
 * UNTRUSTED submission comes from the request payload. tenantId is ALWAYS
 * trusted. providerId is trusted for provider channels (a body-supplied
 * provider that disagrees is a forgery attempt); admin/member channels legitimately
 * choose a facility in the payload, which the service then validates in-tenant.
 */

export const PREAUTH_CONTRACT_VERSION = "v1" as const;

export type PreauthChannel =
  | "PROVIDER_PORTAL"
  | "PROVIDER_API"
  | "ADMIN_PORTAL"
  | "ADMIN_TRPC"
  | "MEMBER_APP"
  | "AMENDMENT";

/** Channels where the provider identity is fixed by the credential/session. */
export const PROVIDER_BOUND_CHANNELS: readonly PreauthChannel[] = ["PROVIDER_PORTAL", "PROVIDER_API"] as const;

/** TRUSTED — never populated from the request body. */
export interface PreauthCallerContext {
  channel: PreauthChannel;
  tenantId: string;
  /** present (and authoritative) for provider-bound channels */
  providerId?: string | null;
  providerBranchId?: string | null;
  actorType: "USER" | "API_KEY" | "SYSTEM";
  actorId: string;
  requestId?: string;
}

/** UNTRUSTED — straight from the caller's payload. */
export interface PreauthSubmissionV1 {
  memberId?: string;
  memberNumber?: string;
  /** honoured ONLY for admin/member channels; a mismatch on provider channels is a forgery */
  providerId?: string;
  providerCode?: string;
  serviceType?: ServiceType;
  expectedDateOfService?: string | Date;
  benefitCategory?: BenefitCategory;
  diagnoses?: Array<{ code?: string; icdCode?: string; description?: string; isPrimary?: boolean }>;
  procedures?: Array<{ cptCode?: string; description?: string; quantity?: number | string; unitCost?: number | string; total?: number | string }>;
  estimatedCost?: number | string;
  clinicalNotes?: string;
  idempotencyKey?: string;
  parentPreAuthId?: string;
}

export interface NormalizedDiagnosis { code: string | null; description: string; isPrimary: boolean }
export interface NormalizedProcedure { cptCode: string | null; description: string; quantity: number; unitCost: string; total: string }

export interface NormalizedPreauthV1 {
  contractVersion: typeof PREAUTH_CONTRACT_VERSION;
  memberId: string | null;
  memberNumber: string | null;
  providerId: string | null;
  providerCode: string | null;
  serviceType: ServiceType | null;
  expectedDateOfService: string | null; // YYYY-MM-DD (date-level, timezone-free)
  benefitCategory: BenefitCategory | null;
  diagnoses: NormalizedDiagnosis[];
  procedures: NormalizedProcedure[];
  estimatedCost: string; // exact decimal string — never a float
  clinicalNotes: string | null;
  parentPreAuthId: string | null;
}

export type PreauthErrorCode =
  | "MISSING_MEMBER_IDENTIFIER"
  | "MEMBER_ID_NOT_ACCEPTED"
  | "MISSING_PROVIDER"
  | "PROVIDER_FORGERY"
  | "MISSING_BENEFIT_CATEGORY"
  | "MISSING_DIAGNOSES"
  | "INVALID_ESTIMATE"
  | "INVALID_DATE"
  | "MISSING_SERVICE_TYPE"
  | "MISSING_PARENT_PREAUTH"
  | "BENEFIT_NOT_IN_PACKAGE";

export interface PreauthValidationError { code: PreauthErrorCode; field?: string; message: string }

// ── normalization helpers (deterministic) ───────────────────────────────────

function normCode(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toUpperCase();
  return s.length ? s : null;
}
function normText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/\s+/g, " ");
  return s.length ? s : null;
}
/** Exact decimal string, 2dp. Invalid/absent ⇒ null so validation can flag it. */
function normMoney(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    const d = new Prisma.Decimal(typeof v === "number" ? v.toString() : String(v).trim());
    if (!d.isFinite() || d.isNegative()) return null;
    return d.toFixed(2);
  } catch {
    return null;
  }
}
function normQuantity(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v ?? "1"), 10);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
/** Date-level normalization (YYYY-MM-DD) — no timezone drift on a service date. */
function normDate(v: unknown): string | null | "INVALID" {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "INVALID";
  return d.toISOString().slice(0, 10);
}

/** Deterministic: the same submission always yields the same normalized value. */
export function normalizePreauth(sub: PreauthSubmissionV1): { normalized: NormalizedPreauthV1; dateInvalid: boolean } {
  const dateResult = normDate(sub.expectedDateOfService);
  const dateInvalid = dateResult === "INVALID";

  const diagnoses: NormalizedDiagnosis[] = (sub.diagnoses ?? [])
    .map((d) => ({
      code: normCode(d.code ?? d.icdCode),
      description: normText(d.description) ?? "",
      isPrimary: d.isPrimary === true,
    }))
    .filter((d) => d.code !== null || d.description.length > 0);

  const procedures: NormalizedProcedure[] = (sub.procedures ?? [])
    .map((p) => {
      const quantity = normQuantity(p.quantity);
      const unitCost = normMoney(p.unitCost) ?? "0.00";
      const total = normMoney(p.total) ?? new Prisma.Decimal(unitCost).mul(quantity).toFixed(2);
      return { cptCode: normCode(p.cptCode), description: normText(p.description) ?? "", quantity, unitCost, total };
    })
    .filter((p) => p.cptCode !== null || p.description.length > 0);

  return {
    dateInvalid,
    normalized: {
      contractVersion: PREAUTH_CONTRACT_VERSION,
      memberId: normText(sub.memberId),
      memberNumber: sub.memberNumber ? sub.memberNumber.trim().toUpperCase() : null,
      providerId: normText(sub.providerId),
      providerCode: normCode(sub.providerCode),
      serviceType: (sub.serviceType ?? null) as ServiceType | null,
      expectedDateOfService: dateInvalid ? null : (dateResult as string | null),
      benefitCategory: (sub.benefitCategory ?? null) as BenefitCategory | null,
      diagnoses,
      procedures,
      estimatedCost: normMoney(sub.estimatedCost) ?? "",
      clinicalNotes: normText(sub.clinicalNotes),
      parentPreAuthId: normText(sub.parentPreAuthId),
    },
  };
}

/**
 * Resolve the authoritative provider. Provider-bound channels take it from the
 * trusted context and REJECT a conflicting body value (D1 anti-forgery);
 * admin/member channels legitimately supply it (service validates in-tenant).
 */
export function resolveProviderId(ctx: PreauthCallerContext, n: NormalizedPreauthV1): { providerId: string | null; error?: PreauthValidationError } {
  if (PROVIDER_BOUND_CHANNELS.includes(ctx.channel)) {
    if (!ctx.providerId) return { providerId: null, error: { code: "MISSING_PROVIDER", message: "No provider bound to this credential/session" } };
    if (n.providerId && n.providerId !== ctx.providerId) {
      return { providerId: null, error: { code: "PROVIDER_FORGERY", field: "providerId", message: "Provider cannot be supplied by the caller on this channel" } };
    }
    return { providerId: ctx.providerId };
  }
  const chosen = n.providerId ?? ctx.providerId ?? null;
  if (!chosen) return { providerId: null, error: { code: "MISSING_PROVIDER", field: "providerId", message: "Select a facility" } };
  return { providerId: chosen };
}

/** Per-channel required-field matrix (§F3.1 step 4). */
export function validatePreauth(ctx: PreauthCallerContext, n: NormalizedPreauthV1, opts: { dateInvalid?: boolean } = {}): PreauthValidationError[] {
  const errors: PreauthValidationError[] = [];

  // member identity — the API channel identifies by member NUMBER; internal ids
  // are not accepted from an external caller.
  if (ctx.channel === "PROVIDER_API") {
    if (n.memberId) errors.push({ code: "MEMBER_ID_NOT_ACCEPTED", field: "memberId", message: "Identify the member by memberNumber" });
    if (!n.memberNumber) errors.push({ code: "MISSING_MEMBER_IDENTIFIER", field: "memberNumber", message: "memberNumber is required" });
  } else if (!n.memberId && !n.memberNumber) {
    errors.push({ code: "MISSING_MEMBER_IDENTIFIER", message: "A member must be identified" });
  }

  const provider = resolveProviderId(ctx, n);
  if (provider.error) errors.push(provider.error);

  if (!n.benefitCategory) errors.push({ code: "MISSING_BENEFIT_CATEGORY", field: "benefitCategory", message: "Benefit category is required" });
  if (n.diagnoses.length === 0) errors.push({ code: "MISSING_DIAGNOSES", field: "diagnoses", message: "At least one diagnosis is required" });
  if (!n.estimatedCost) errors.push({ code: "INVALID_ESTIMATE", field: "estimatedCost", message: "A valid non-negative estimated cost is required" });
  if (opts.dateInvalid) errors.push({ code: "INVALID_DATE", field: "expectedDateOfService", message: "Expected date of service is not a valid date" });

  // serviceType is required where the downstream clinical rail needs it
  if ((ctx.channel === "PROVIDER_PORTAL" || ctx.channel === "ADMIN_PORTAL" || ctx.channel === "ADMIN_TRPC") && !n.serviceType) {
    errors.push({ code: "MISSING_SERVICE_TYPE", field: "serviceType", message: "Service type is required" });
  }
  if (ctx.channel === "AMENDMENT" && !n.parentPreAuthId) {
    errors.push({ code: "MISSING_PARENT_PREAUTH", field: "parentPreAuthId", message: "An amendment must reference its parent pre-authorisation" });
  }
  return errors;
}

/**
 * Canonical request hash — stable for an equivalent submission, and scoped by
 * tenant + resolved provider so the same payload from a different facility is a
 * different request. Backs same-key/same-request replay vs conflict (D26).
 */
export function preauthRequestHash(ctx: PreauthCallerContext, n: NormalizedPreauthV1): string {
  const providerId = resolveProviderId(ctx, n).providerId;
  const canonical = JSON.stringify({
    v: n.contractVersion,
    tenantId: ctx.tenantId,
    providerId,
    memberId: n.memberId,
    memberNumber: n.memberNumber,
    serviceType: n.serviceType,
    expectedDateOfService: n.expectedDateOfService,
    benefitCategory: n.benefitCategory,
    diagnoses: n.diagnoses,
    procedures: n.procedures,
    estimatedCost: n.estimatedCost,
    clinicalNotes: n.clinicalNotes,
    parentPreAuthId: n.parentPreAuthId,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Receipt shape returned to every channel (§7.5). */
export interface PreauthIntakeResult {
  receiptId: string;
  status: "ACCEPTED" | "REJECTED";
  replayed: boolean;
  preauthId?: string;
  errors?: PreauthValidationError[];
}

/**
 * Handoff contract (step 5): after a receipt + PA row are committed, intake
 * invokes the EXISTING adjudication owner — preauthAdjudicationService
 * (runAutoDecision/executeAutoDecision, or human approve/decline) — which alone
 * places/releases the BenefitHold. Intake never decides and never touches holds.
 */
export const PREAUTH_DECISION_OWNER = "preauthAdjudicationService" as const;
