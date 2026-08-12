"use server";

/**
 * UAT-HF P03.05 — the eligibility check moves off the URL.
 *
 * DEF-079/DEF-057: the check was a `<form method="GET">`, so every member number
 * anyone typed was written into the query string — and therefore into browser
 * history, the server access log, the `Referer` header of anything the page
 * subsequently linked to, and any analytics pixel on the page. A shared
 * front-desk browser then carries a list of members in its address-bar history.
 *
 * A Server Action posts the value in the request body instead. Nothing about the
 * lookup changes; only where the identifier travels.
 *
 * All the input safety the GET page carried (ELIG-GAP-007/008/010/011/012) moves
 * here unchanged — it must live server-side regardless, because an action can be
 * invoked directly.
 */
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ProviderEligibilityService, type EligibilitySafeResult } from "@/server/services/provider-eligibility.service";
import { parseValidDate } from "@/lib/dates";
import { COLLAPSED_NOT_FOUND_MESSAGE } from "@/server/services/eligibility/decision-contract";

export const MAX_MEMBER_LEN = 64;

/** The allow-list the UI offers AND accepts (ELIG-GAP-008). */
export const BENEFIT_OPTIONS = [
  "OUTPATIENT",
  "INPATIENT",
  "MATERNITY",
  "DENTAL",
  "OPTICAL",
  "MENTAL_HEALTH",
  "LAST_EXPENSE",
  "WELLNESS_PREVENTIVE",
] as const;

export interface EligibilityCheckState {
  /** Field-level input problem; the lookup did not run. */
  inputError: string | null;
  /** Present when the lookup ran. */
  result: EligibilitySafeResult | null;
  /** What the operator asked, echoed back so the form can be re-rendered. */
  submitted: { serviceDate: string; benefit: string } | null;
  /** Set when the service itself failed — NOT an ineligibility (P03.02). */
  unavailable: boolean;
}

export const EMPTY_ELIGIBILITY_STATE: EligibilityCheckState = {
  inputError: null,
  result: null,
  submitted: null,
  unavailable: false,
};

export async function checkEligibilityAction(
  _previous: EligibilityCheckState | null,
  formData: FormData,
): Promise<EligibilityCheckState> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.eligibility.read")) {
    return { ...EMPTY_ELIGIBILITY_STATE, inputError: "You do not have permission to check eligibility." };
  }

  const rawQuery = String(formData.get("q") ?? "");
  const query = rawQuery.trim();
  const serviceDateParam = String(formData.get("serviceDate") ?? "");
  const benefitRaw = String(formData.get("benefit") ?? "").trim();
  const submitted = { serviceDate: serviceDateParam, benefit: benefitRaw };

  const serviceDate = parseValidDate(serviceDateParam) ?? undefined;
  const dateInvalid = serviceDateParam !== "" && serviceDate === undefined;
  const benefitInvalid = benefitRaw !== "" && !BENEFIT_OPTIONS.includes(benefitRaw as (typeof BENEFIT_OPTIONS)[number]);
  const benefitCategory = benefitInvalid ? undefined : benefitRaw || undefined;
  const tooLong = query.length > MAX_MEMBER_LEN;
  const hasControlChars = Array.from(query).some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
  const looksLikeName = query !== "" && /\s/.test(query);

  const inputError =
    query === ""
      ? "Enter the member or card number to check."
      : tooLong
        ? `Member number is too long (maximum ${MAX_MEMBER_LEN} characters).`
        : hasControlChars
          ? "Member number contains characters that aren't allowed."
          : looksLikeName
            ? "Enter the member or card number, not a name."
            : dateInvalid
              ? "Enter a valid service date (YYYY-MM-DD), or leave it blank for today."
              : benefitInvalid
                ? "Select a benefit from the list."
                : null;

  if (inputError) return { inputError, result: null, submitted, unavailable: false };

  try {
    const result = await ProviderEligibilityService.check({ ctx, memberNumber: query, serviceDate, benefitCategory });
    return { inputError: null, result, submitted, unavailable: false };
  } catch (err) {
    // P03.02's distinction: an outage is NOT a refusal of cover. Reporting it as
    // "not eligible" is what DEF-053 called indistinguishable from an outage.
    console.error("[eligibility] check failed", { providerId: ctx.providerId, error: err });
    return { inputError: null, result: null, submitted, unavailable: true };
  }
}

/** Re-exported so the client component and the action agree on one string. */
export const NOT_FOUND_MESSAGE = COLLAPSED_NOT_FOUND_MESSAGE;
