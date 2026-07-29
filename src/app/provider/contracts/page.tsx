import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderContractViewService } from "@/server/services/provider-contract-view/service";

/**
 * PNOS F7.3 — provider contracts list.
 *
 * The FIRST provider-facing contract surface. It renders ONLY the provider-safe
 * headers from ProviderContractViewService.list (F7.2 allow-list — no internal /
 * extraction / ownership fields exist on that shape) and is gated behind the
 * `providerContractView` flag (§11.1) — OFF until the F7.1 §10 network/legal/
 * security sign-off, so the route 404s for a provider until switched on.
 *
 * The service is the single authority (strict provider.contract.read + provider
 * scope, non-enumerating). Stop (F7.3): no active contract editing.
 */
const LABEL_TONE: Record<string, string> = {
  CURRENT: "bg-[#28A745]/10 text-[#28A745]",
  FUTURE: "bg-brand-indigo/10 text-brand-indigo",
  EXPIRED: "bg-[#E6E7E8] text-[#6C757D]",
};

export default async function ProviderContractsList() {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!(await ProviderAccessSettingsService.isContractViewEnabled(ctx.tenantId, ctx.providerId))) notFound();

  let contracts;
  try {
    contracts = await ProviderContractViewService.list(ctx);
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    throw e;
  }

  const fmtDate = (v: Date | string | null) =>
    v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
          <ScrollText size={22} /> Contracts
        </h1>
        <p className="text-sm text-brand-text-muted">Your agreements and rate schedules with this payer network.</p>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {contracts.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">No contracts on file for your facility.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[44rem]">
              <thead className="text-[11px] uppercase text-brand-text-muted">
                <tr className="border-b border-[#EEEEEE]">
                  <th className="text-left px-5 py-2 font-bold">Contract</th>
                  <th className="text-left px-5 py-2 font-bold">Type</th>
                  <th className="text-left px-5 py-2 font-bold">Status</th>
                  <th className="text-left px-5 py-2 font-bold">Effective</th>
                  <th className="text-left px-5 py-2 font-bold">Currency</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-b border-[#F4F4F4] last:border-0">
                    <td className="px-5 py-2.5">
                      <Link href={`/provider/contracts/${c.id}`} className="font-semibold text-brand-indigo hover:underline">
                        {c.contractNumber}
                      </Link>
                      <span className="block text-xs text-brand-text-muted">{c.title}</span>
                    </td>
                    <td className="px-5 py-2.5 text-xs">{c.contractType.replace(/_/g, " ")}</td>
                    <td className="px-5 py-2.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LABEL_TONE[c.effectiveLabel] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>
                        {c.effectiveLabel}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-xs text-brand-text-muted">{fmtDate(c.startDate)} – {fmtDate(c.endDate)}</td>
                    <td className="px-5 py-2.5 text-xs font-mono">{c.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
