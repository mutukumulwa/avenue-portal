import Link from "next/link";
import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ProviderEligibilityService } from "@/server/services/provider-eligibility.service";
import { parseValidDate } from "@/lib/dates";
import { UserCheck, Search, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

/**
 * F1.11: eligibility runs through the canonical ProviderEligibilityService
 * (entitlement-scoped, PRIVACY-S1-A). Input safety (ELIG-GAP-007/008/010/011/012)
 * and accessibility (ELIG-GAP-013) are handled here before any business lookup.
 */
// ELIG-GAP-008: the allow-list of benefit categories the UI offers AND accepts.
// A value outside this list is rejected before lookup (never displayed as "Any"
// while a raw value is persisted).
const BENEFIT_OPTIONS = [
  "OUTPATIENT", "INPATIENT", "MATERNITY", "DENTAL", "OPTICAL", "MENTAL_HEALTH",
  "CHRONIC_DISEASE", "SURGICAL", "AMBULANCE_EMERGENCY", "REHABILITATION",
  "LAST_EXPENSE", "WELLNESS_PREVENTIVE",
];
const MAX_MEMBER_LEN = 64;

export default async function ProviderEligibility({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; serviceDate?: string; benefit?: string }>;
}) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  // ELIG-GAP-020 / Phase 2: require the eligibility read permission (fail-closed).
  if (!providerPermits(ctx.permissions, "provider.eligibility.read")) redirect("/unauthorized");

  const params = await searchParams;
  const submitted = params.q !== undefined; // a GET submit always carries q, even blank
  const rawQ = params.q ?? "";
  const query = rawQ.trim();
  const serviceDateParam = params.serviceDate ?? "";
  const benefitRaw = (params.benefit ?? "").trim();

  // ── Input validation (ELIG-GAP-007/008/010/011/012) ──────────────────────
  const serviceDate = parseValidDate(serviceDateParam) ?? undefined;
  const dateInvalid = serviceDateParam !== "" && serviceDate === undefined;          // 007
  const benefitInvalid = benefitRaw !== "" && !BENEFIT_OPTIONS.includes(benefitRaw); // 008
  const benefitCategory = benefitInvalid ? undefined : (benefitRaw || undefined);
  const blankSubmit = submitted && query === "";                                     // 010
  const tooLong = query.length > MAX_MEMBER_LEN;                                      // 011
  const hasControlChars = Array.from(query).some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);                        // 011
  const looksLikeName = query !== "" && /\s/.test(query);                             // 012

  const inputError =
    blankSubmit ? "Enter the member or card number to check."
    : tooLong ? `Member number is too long (maximum ${MAX_MEMBER_LEN} characters).`
    : hasControlChars ? "Member number contains characters that aren't allowed."
    : looksLikeName ? "Enter the member or card number, not a name."
    : dateInvalid ? "Enter a valid service date (YYYY-MM-DD), or leave it blank for today."
    : benefitInvalid ? "Select a benefit from the list."
    : null;

  // Only run the point-of-care check when the input is clean.
  const result = query && !inputError
    ? await ProviderEligibilityService.check({ ctx, memberNumber: query, serviceDate, benefitCategory })
    : null;
  const eligible = result?.resultCode === "ELIGIBLE";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
          <UserCheck size={22} /> Member eligibility
        </h1>
        <p className="text-brand-text-muted text-sm mt-1">Enter the member/card number to confirm cover before treating.</p>
      </div>

      <form method="GET" className="flex flex-wrap gap-2 items-end" noValidate>
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="elig-q" className="block text-[11px] uppercase font-bold text-brand-text-muted mb-1">Member / card number</label>
          <Search size={16} className="absolute left-3 top-[34px] -translate-y-1/2 text-brand-text-muted" aria-hidden="true" />
          <input
            id="elig-q"
            name="q"
            defaultValue={query}
            required
            aria-required="true"
            maxLength={MAX_MEMBER_LEN}
            aria-invalid={inputError ? true : undefined}
            aria-describedby={inputError ? "elig-error" : undefined}
            placeholder="e.g. NWSC-2026-00001"
            className="w-full border border-[#EEEEEE] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
          />
        </div>
        <div>
          <label htmlFor="elig-date" className="block text-[11px] uppercase font-bold text-brand-text-muted mb-1">Service date</label>
          <input
            id="elig-date"
            name="serviceDate"
            type="date"
            defaultValue={serviceDateParam}
            className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
          />
        </div>
        <div>
          <label htmlFor="elig-benefit" className="block text-[11px] uppercase font-bold text-brand-text-muted mb-1">Benefit</label>
          <select
            id="elig-benefit"
            name="benefit"
            defaultValue={benefitInvalid ? "" : (benefitCategory ?? "")}
            className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
          >
            <option value="">Any</option>
            {BENEFIT_OPTIONS.map((b) => (
              <option key={b} value={b}>{b.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">Check</button>
      </form>

      {/* ELIG-GAP-013: an error summary announced to assistive tech. */}
      {inputError && (
        <div id="elig-error" role="alert" className="rounded-lg bg-[#DC3545]/5 border border-[#DC3545]/30 px-4 py-3 text-sm text-[#DC3545] font-semibold flex items-center gap-2">
          <AlertCircle size={16} aria-hidden="true" /> {inputError}
        </div>
      )}

      {!inputError && query && result && !result.found && (
        <div role="status" className="rounded-lg bg-[#DC3545]/5 border border-[#DC3545]/30 px-4 py-3 text-sm text-[#DC3545] font-semibold">
          No eligible member found for “{query}”. Check the card number and try again.
        </div>
      )}

      {!inputError && result && result.found && (
        <div role="status" aria-live="polite" className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
          <div className={`px-5 py-4 flex items-center gap-3 ${eligible ? "bg-[#28A745]/5" : "bg-[#DC3545]/5"}`}>
            {eligible ? <CheckCircle2 className="text-[#28A745]" size={28} aria-hidden="true" /> : <XCircle className="text-[#DC3545]" size={28} aria-hidden="true" />}
            <div>
              <p className="text-lg font-bold text-brand-text-heading">
                {result.member!.firstName} {result.member!.lastName}{" "}
                <span className="font-mono text-sm text-brand-text-muted">{result.member!.memberNumber}</span>
              </p>
              <p className={`text-sm font-semibold ${eligible ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                {eligible ? "ELIGIBLE — cover is active" : "NOT ELIGIBLE"}
              </p>
              {result.safeExplanation && (
                <p className="text-xs text-brand-text-muted mt-0.5">{result.safeExplanation}</p>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 px-5 py-5 text-sm">
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Scheme</dt><dd className="mt-0.5">{result.schemeName ?? "—"}</dd></div>
            <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Package</dt><dd className="mt-0.5">{result.packageName ?? "—"}</dd></div>
            {result.requiresPreauth && (
              <div><dt className="text-[11px] uppercase font-bold text-brand-text-muted">Pre-auth</dt><dd className="mt-0.5 font-semibold text-[#856404]">Required</dd></div>
            )}
          </dl>
          <div className="px-5 pb-4 text-xs text-brand-text-muted">{result.disclaimer}</div>
          {eligible && result.memberId && (
            <div className="px-5 pb-5">
              <Link
                href={`/provider/claims/new?memberId=${result.memberId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary"
              >
                File a claim for this member →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
