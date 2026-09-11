import "server-only";

/**
 * Family Hospital UAT plan P04.01 / P04.02 — ONE preparation step for every
 * provider-captured claim: new, correction and resubmission.
 *
 * The claim forms send a case reference, a diagnosis code and lines that carry
 * either a tariff id or an unlisted description. None of it is authority (plan
 * §4 rule 3). Here, on the server, in order:
 *
 *   1. the case is resolved AGAIN, in full — member, eligibility, branch,
 *      contract, currency (P02.01) — and anything but an eligible, current case
 *      is refused: an ineligible member, a member the facility can no longer
 *      see, or a contract version other than the one the form priced against
 *      (§8.2 item 4, "submission repeats resolution and refuses an
 *      ineligible/stale context");
 *   2. the diagnosis is re-read from the catalogue: the code must exist and the
 *      catalogue's description is the one stored (P03.02 step 6);
 *   3. every line is canonicalised against the freshly resolved contract
 *      (P02.04): tariff rows re-read by id, the name, category, codes,
 *      contracted rate and currency taken from the row, the billed quantity and
 *      unit price validated as decimals and kept as billed.
 *
 * The result maps straight onto the canonical intake input and the
 * server-built line provenance; the three actions differ only in which intake
 * service they hand it to.
 */
import type { BenefitCategory, ServiceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { isServiceType } from "@/lib/provider-benefit-options";
import type { CaptureLineInput, CaseContextResult } from "@/lib/provider-capture-contract";
import type { IntakeLineItem } from "./claim-intake";
import type { PersistOrigin } from "./claim-intake/persist";
import type { ProviderAccessContext } from "./provider-access.service";
import { ProviderCaseContextService, type TrustedCaseContext } from "./provider-case-context.service";
import { ProviderDiagnosisSearchService } from "./provider-diagnosis-search.service";
import { ProviderServiceCatalogService, type CanonicalLine, type CarriedLine } from "./provider-service-catalog.service";

export interface PreparedClaimCapture {
  trusted: TrustedCaseContext;
  serviceType: ServiceType;
  attendingDoctor: string | undefined;
  diagnosis: { code: string; description: string };
  lines: CanonicalLine[];
  /** Canonical decimal text. */
  totalBilled: string;
  correlationId: string;
}

export type PrepareClaimResult = { ok: true; prepared: PreparedClaimCapture } | { ok: false; failure: MutationFailure };

/** The intake's own idempotency-key grammar (claim-intake/schema.ts). */
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const HTML_RE = /<\s*[a-zA-Z/!]/;
type Subject = "claim" | "pre-authorisation";
const notSubmitted = (subject: Subject) => `The ${subject} was not submitted. Correct the items listed.`;
const subjectOf = (purpose: CaseOptions["purpose"]): Subject => (purpose === "PREAUTH" ? "pre-authorisation" : "claim");

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Every resolver outcome other than RESOLVED, in terms a claim form can act on. */
export function caseFailure(result: Exclude<CaseContextResult, { outcome: "RESOLVED" }>, subject: Subject = "claim"): MutationFailure {
  const base = { correlationId: result.correlationId };
  const NOT_SUBMITTED = notSubmitted(subject);
  switch (result.outcome) {
    case "FORBIDDEN":
      return mutationFail("FORBIDDEN", { ...base, message: result.message });
    case "UNAVAILABLE":
      return mutationFail("UNAVAILABLE", { ...base, message: result.message });
    case "INELIGIBLE":
      return mutationFail("VALIDATION", {
        ...base,
        message: NOT_SUBMITTED,
        fieldErrors: { member: [`Not eligible on this date — a ${subject} cannot be filed. ${result.message}`.trim()] },
      });
    case "NO_ACTIVE_CONTRACT":
    case "AMBIGUOUS_CONTRACT":
      return mutationFail("VALIDATION", { ...base, message: NOT_SUBMITTED, fieldErrors: { member: [result.message] } });
    case "NOT_FOUND":
      return mutationFail("VALIDATION", { ...base, message: NOT_SUBMITTED, fieldErrors: { member: [result.message] } });
    case "BRANCH_REQUIRED":
      return mutationFail("VALIDATION", { ...base, message: NOT_SUBMITTED, fieldErrors: { member: [result.message] } });
    case "INVALID": {
      const fe = result.fieldErrors ?? {};
      const fieldErrors: Record<string, string[]> = {};
      if (fe.serviceDate) fieldErrors.serviceDate = [fe.serviceDate];
      if (fe.benefitCategory) fieldErrors.benefitCategory = [fe.benefitCategory];
      const memberProblem = fe.memberNumber ?? fe.branchId;
      if (memberProblem) fieldErrors.member = [memberProblem];
      if (Object.keys(fieldErrors).length === 0) fieldErrors.member = [result.message];
      return mutationFail("VALIDATION", { ...base, message: NOT_SUBMITTED, fieldErrors });
    }
  }
}

/**
 * The canonical intake's error codes (claim-intake/errors.ts), as outcomes.
 * Only `INTERNAL_ERROR` cannot say whether a claim was written — the intake
 * wraps anything unexpected in it, including a failure after commit — so it is
 * the one UNKNOWN_OUTCOME, and the form keeps its key so a retry replays.
 */
export function intakeFailure(code: string, message: string): MutationFailure {
  switch (code) {
    case "UNAUTHENTICATED":
    case "FORBIDDEN_SCOPE":
      return mutationFail("FORBIDDEN", { message });
    case "IDEMPOTENCY_KEY_REUSED":
      return mutationFail("CONFLICT", {
        message: "These details differ from an earlier submission made from this form, so nothing new was saved. Submit again to file them as a new claim.",
      });
    case "RETRYABLE_UNAVAILABLE":
      return mutationFail("UNAVAILABLE", { message: "Claims could not be received just now, and nothing was saved. Try again shortly." });
    case "INTERNAL_ERROR":
      return mutationFail("UNKNOWN_OUTCOME", {
        message: "We could not confirm whether the claim was received. Check your claims list before submitting again.",
      });
    default:
      return mutationFail("VALIDATION", { message });
  }
}

/** Where the case comes from: the form's reference, with server-fixed parts. */
interface CaseOptions {
  purpose: "CLAIM" | "CLAIM_CORRECTION" | "PREAUTH";
  /**
   * Server-fixed parts of the case. A correction/resubmission pins the member
   * (and, when the earlier claim has one, the branch) to the earlier claim; a
   * pre-auth amendment also pins the date and benefit to its parent.
   */
  fixed?: { memberId: string; branchId: string | null; serviceDate?: string; benefitCategory?: BenefitCategory };
  /** P04.02 — the earlier claim's stored lines and currency, read by the server. */
  carried?: { currency: string | null; lines: CarriedLine[] };
}

export interface PreparedLines {
  trusted: TrustedCaseContext;
  lines: CanonicalLine[];
  /** Canonical decimal text. */
  totalBilled: string;
  correlationId: string;
}

/**
 * Steps 1 and 3 — the case, resolved again in full and checked against the
 * contract version the form priced with; then every line against it. Field
 * problems are added to `fieldErrors`; a case that cannot be used is a failure.
 */
async function caseAndLines(
  ctx: ProviderAccessContext,
  input: Record<string, unknown>,
  opts: CaseOptions,
  fieldErrors: Record<string, string[]>,
): Promise<{ ok: true; value: PreparedLines | null } | { ok: false; failure: MutationFailure }> {
  const context = asObject(input.context);
  const { result, trusted } = await ProviderCaseContextService.resolve(ctx, {
    purpose: opts.purpose,
    memberRef: opts.fixed?.memberId ?? (typeof context.memberRef === "string" ? context.memberRef : undefined),
    branchId: opts.fixed?.branchId ?? (typeof context.branchId === "string" ? context.branchId : null),
    serviceDate: opts.fixed?.serviceDate ?? (typeof context.serviceDate === "string" ? context.serviceDate : ""),
    benefitCategory: opts.fixed?.benefitCategory ?? (context.benefitCategory as BenefitCategory),
  });
  if (result.outcome !== "RESOLVED") return { ok: false, failure: caseFailure(result, subjectOf(opts.purpose)) };
  if (!trusted) return { ok: false, failure: mutationFail("UNAVAILABLE", { correlationId: result.correlationId }) };

  // A form priced against another contract version is looking at old prices.
  const expected = input.expectedContractVersionId;
  if ((typeof expected !== "string" && expected !== null) || expected !== trusted.contractVersionId) {
    return {
      ok: false,
      failure: mutationFail("CONFLICT", {
        correlationId: result.correlationId,
        message: "The contract for this patient changed while you were working. Find the member again and re-select the services — nothing was saved.",
      }),
    };
  }

  const canon = await ProviderServiceCatalogService.canonicalizeLines(
    trusted,
    Array.isArray(input.lines) ? (input.lines as CaptureLineInput[]) : [],
    opts.carried ? { carried: opts.carried } : {},
  );
  if (!canon.ok) {
    for (const [key, message] of Object.entries(canon.fieldErrors)) fieldErrors[key] = [message];
    return { ok: true, value: null };
  }
  return { ok: true, value: { trusted, lines: canon.lines, totalBilled: canon.totalBilled, correlationId: result.correlationId } };
}

export const ProviderClaimCaptureService = {
  /**
   * A new claim, a correction/resubmission, or a new pre-authorisation: the
   * encounter (service type, clinician, primary diagnosis) plus the lines.
   */
  async prepare(ctx: ProviderAccessContext, raw: unknown, opts: CaseOptions): Promise<PrepareClaimResult> {
    const input = asObject(raw);

    if (typeof input.idempotencyKey !== "string" || !IDEMPOTENCY_KEY_RE.test(input.idempotencyKey)) {
      return { ok: false, failure: mutationFail("VALIDATION", { message: "This form has expired. Reload the page and enter the details again." }) };
    }

    const fieldErrors: Record<string, string[]> = {};
    const serviceType = isServiceType(input.serviceType) ? input.serviceType : null;
    if (!serviceType) fieldErrors.serviceType = ["Choose a service type."];
    let attendingDoctor: string | undefined;
    if (input.attendingDoctor !== undefined && input.attendingDoctor !== null) {
      const text = typeof input.attendingDoctor === "string" ? input.attendingDoctor.trim().replace(/\s+/g, " ") : null;
      if (text === null || text.length > 200 || HTML_RE.test(text)) fieldErrors.attendingDoctor = ["Use plain text of up to 200 characters."];
      else attendingDoctor = text || undefined;
    }

    // 1 + 3. The case, resolved again in full — never the browser's copy — and
    // every line against the contract just resolved.
    const cl = await caseAndLines(ctx, input, opts, fieldErrors);
    if (!cl.ok) return cl;

    // 2. The diagnosis, from the catalogue.
    const diagnosis = await ProviderDiagnosisSearchService.canonical(input.diagnosisCode);
    if (!diagnosis) fieldErrors.diagnosis = ["Choose the primary diagnosis from the list."];

    const correlationId = cl.value?.correlationId;
    if (Object.keys(fieldErrors).length > 0 || !cl.value || !diagnosis || !serviceType) {
      return { ok: false, failure: mutationFail("VALIDATION", { correlationId, message: notSubmitted(subjectOf(opts.purpose)), fieldErrors }) };
    }
    return { ok: true, prepared: { ...cl.value, serviceType, attendingDoctor, diagnosis } };
  },

  /**
   * A pre-authorisation amendment: lines only — the service type, diagnosis,
   * member, date and benefit are the parent's (the server passes them as
   * `fixed`).
   */
  async prepareLines(ctx: ProviderAccessContext, raw: unknown, opts: CaseOptions): Promise<{ ok: true; prepared: PreparedLines } | { ok: false; failure: MutationFailure }> {
    const input = asObject(raw);
    const fieldErrors: Record<string, string[]> = {};
    const cl = await caseAndLines(ctx, input, opts, fieldErrors);
    if (!cl.ok) return cl;
    if (!cl.value || Object.keys(fieldErrors).length > 0) {
      return { ok: false, failure: mutationFail("VALIDATION", { correlationId: cl.value?.correlationId, message: notSubmitted(subjectOf(opts.purpose)), fieldErrors }) };
    }
    return { ok: true, prepared: cl.value };
  },

  /**
   * P04.02 — what a correction or resubmission needs to know about the earlier
   * claim, read under the caller's tenant and provider (a foreign id is simply
   * not found). The replacement services load and authorise it again.
   */
  async predecessor(ctx: ProviderAccessContext, claimId: unknown) {
    if (typeof claimId !== "string" || !claimId.trim()) return null;
    const claim = await prisma.claim.findFirst({
      where: { id: claimId.trim(), tenantId: ctx.tenantId, providerId: ctx.providerId },
      select: {
        id: true,
        memberId: true,
        providerBranchId: true,
        currency: true,
        claimLines: {
          select: { lineNumber: true, serviceCategory: true, description: true, cptCode: true, quantity: true, unitCost: true, selectedProviderTariffId: true },
          orderBy: { lineNumber: "asc" },
        },
      },
    });
    if (!claim) return null;
    const lines: CarriedLine[] = claim.claimLines.map((l) => ({
      lineNumber: l.lineNumber,
      serviceCategory: l.serviceCategory,
      description: l.description,
      cptCode: l.cptCode,
      quantity: l.quantity,
      unitCost: l.unitCost,
      selectedProviderTariffId: l.selectedProviderTariffId,
    }));
    return { id: claim.id, memberId: claim.memberId, providerBranchId: claim.providerBranchId, currency: claim.currency, lines };
  },

  /** The canonical intake's line shape. Every line carries the primary diagnosis. */
  intakeLines(p: PreparedClaimCapture): IntakeLineItem[] {
    return p.lines.map((l) => ({
      serviceCategory: l.serviceCategory,
      cptCode: l.cptCode ?? "",
      description: l.description,
      icdCode: p.diagnosis.code,
      quantity: l.quantity,
      unitCost: l.unitCost,
      billedAmount: l.billedAmount,
    }));
  },

  /**
   * Server-built capture provenance, by the 1-based line number intake assigns
   * (input order is kept when lines carry no source reference — normalize.ts).
   */
  lineProvenance(p: PreparedClaimCapture): NonNullable<PersistOrigin["lineProvenance"]> {
    return p.lines.map((l, i) => ({ lineNumber: i + 1, selectedProviderTariffId: l.selectedProviderTariffId, tariffRate: l.tariffRate }));
  },
} as const;
