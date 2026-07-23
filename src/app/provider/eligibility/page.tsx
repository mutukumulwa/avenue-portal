import Link from "next/link";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderEligibilityService } from "@/server/services/provider-eligibility.service";
import { UserCheck, Search, CheckCircle2, XCircle } from "lucide-react";

/**
 * F1.11: eligibility now runs through the canonical ProviderEligibilityService.
 * Behavior with the (default OFF) entitlement flag is the same permissive member
 * resolution as before + a point-in-time evidence record + shadow logging. The
 * display is MINIMISED per D2/§8.1 — the tenant-wide annual limit / used /
 * remaining figures are no longer shown by default (that was over-exposure).
 * When the D3 gate flips enforcement ON per provider, out-of-scope members
 * safely resolve as not-eligible with no enumeration.
 */
export default async function ProviderEligibility({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  const { q } = await searchParams;
  const query = (q ?? "").trim();

  const result = query ? await ProviderEligibilityService.check({ ctx, memberNumber: query }) : null;
  const eligible = result?.resultCode === "ELIGIBLE";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
          <UserCheck size={22} /> Member eligibility
        </h1>
        <p className="text-brand-text-muted text-sm mt-1">Enter the member/card number to confirm cover before treating.</p>
      </div>

      <form method="GET" className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            name="q"
            defaultValue={query}
            placeholder="e.g. NWSC-2026-00001"
            className="w-full border border-[#EEEEEE] rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
          />
        </div>
        <button type="submit" className="rounded-lg bg-brand-indigo px-5 py-2 text-sm font-semibold text-white hover:bg-brand-secondary">Check</button>
      </form>

      {query && result && !result.found && (
        <div className="rounded-lg bg-[#DC3545]/5 border border-[#DC3545]/30 px-4 py-3 text-sm text-[#DC3545] font-semibold">
          No eligible member found for “{query}”. Check the card number and try again.
        </div>
      )}

      {result && result.found && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
          <div className={`px-5 py-4 flex items-center gap-3 ${eligible ? "bg-[#28A745]/5" : "bg-[#DC3545]/5"}`}>
            {eligible ? <CheckCircle2 className="text-[#28A745]" size={28} /> : <XCircle className="text-[#DC3545]" size={28} />}
            <div>
              <p className="text-lg font-bold text-brand-text-heading">
                {result.member!.firstName} {result.member!.lastName}{" "}
                <span className="font-mono text-sm text-brand-text-muted">{result.member!.memberNumber}</span>
              </p>
              <p className={`text-sm font-semibold ${eligible ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                {eligible ? "ELIGIBLE — cover is active" : "NOT ELIGIBLE"}
              </p>
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
