import "server-only";

/**
 * Family Hospital UAT plan P04.03 — the pre-authorisation side of the provider
 * capture contract: new requests and amendments.
 *
 * The lines are prepared exactly as for a claim (`ProviderClaimCaptureService`):
 * case re-resolved, tariffs re-read, estimated unit costs parsed as decimals —
 * "600,000" is 600000 (FH-10). This module turns them into the pre-auth intake's
 * procedure shape and the SERVER-built provenance (selected tariff, contracted
 * unit rate, currency; P02.04 step 5), and maps the intake's refusals onto form
 * fields.
 */
import { mutationFail, type MutationFailure } from "@/lib/mutation-contract";
import { normalizePreauth, withProcedureProvenance, type NormalizedProcedure, type PreauthProcedureProvenance, type PreauthValidationError } from "./preauth-intake/contract";
import type { CanonicalLine } from "./provider-service-catalog.service";

const NOTES_MAX = 2000;

/** Clinical notes: optional plain text, bounded. */
export function clinicalNotesOf(raw: unknown): { ok: true; value: string | undefined } | { ok: false; failure: MutationFailure } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: undefined };
  if (typeof raw !== "string" || raw.length > NOTES_MAX) {
    return { ok: false, failure: mutationFail("VALIDATION", { message: "The request was not submitted. Correct the items listed.", fieldErrors: { clinicalNotes: [`Use up to ${NOTES_MAX} characters.`] } }) };
  }
  return { ok: true, value: raw.trim() || undefined };
}

/** The intake's submission procedures, in line order (decimal text, never floats). */
export function procedureSubmissions(lines: CanonicalLine[]) {
  return lines.map((l) => ({
    ...(l.cptCode ? { cptCode: l.cptCode } : {}),
    description: l.description,
    quantity: l.quantity,
    unitCost: l.unitCost,
    total: l.billedAmount,
  }));
}

/** Server-built provenance, one per procedure, in the same order. */
export function procedureProvenance(lines: CanonicalLine[]): PreauthProcedureProvenance[] {
  return lines.map((l) => ({ selectedProviderTariffId: l.selectedProviderTariffId, contractedUnitRate: l.tariffRate, currency: l.currency }));
}

/**
 * An amendment's stored procedures: normalised EXACTLY as the intake
 * normalises a new request's, with the same provenance — one shape for every
 * pre-authorisation (the old amendment writer stored `{ code, description }`).
 */
export function amendmentProcedures(lines: CanonicalLine[]): NormalizedProcedure[] {
  const { normalized } = normalizePreauth({ procedures: procedureSubmissions(lines) });
  return withProcedureProvenance(normalized, procedureProvenance(lines)).procedures;
}

const FIELD_OF: Partial<Record<PreauthValidationError["code"], string>> = {
  MISSING_MEMBER_IDENTIFIER: "member",
  MEMBER_ID_NOT_ACCEPTED: "member",
  BENEFIT_NOT_IN_PACKAGE: "benefitCategory",
  MISSING_BENEFIT_CATEGORY: "benefitCategory",
  MISSING_DIAGNOSES: "diagnosis",
  INVALID_ESTIMATE: "lines",
  INVALID_DATE: "serviceDate",
  MISSING_SERVICE_TYPE: "serviceType",
};

/** The intake's refusal, on the form's fields. Provider-scope refusals are FORBIDDEN. */
export function preauthRefusal(errors: PreauthValidationError[] | undefined): MutationFailure {
  const list = errors ?? [];
  if (list.some((e) => e.code === "PROVIDER_FORGERY" || e.code === "MISSING_PROVIDER")) {
    const e = list.find((x) => x.code === "PROVIDER_FORGERY" || x.code === "MISSING_PROVIDER")!;
    return mutationFail("FORBIDDEN", { message: e.message === "Provider is not active" ? "This facility's contract is not active, so pre-authorisations cannot be requested." : "You cannot request a pre-authorisation for this facility." });
  }
  if (list.length === 0) {
    // A replay of a request that was already refused: nothing new happened.
    return mutationFail("VALIDATION", { message: "This request was already refused. Change the details and submit again." });
  }
  const fieldErrors: Record<string, string[]> = {};
  for (const e of list) {
    const field = FIELD_OF[e.code] ?? "form";
    (fieldErrors[field] ??= []).push(e.message);
  }
  const { form, ...rest } = fieldErrors;
  return mutationFail("VALIDATION", {
    message: form?.[0] ?? "The pre-authorisation was not submitted. Correct the items listed.",
    ...(Object.keys(rest).length ? { fieldErrors: rest } : {}),
  });
}
