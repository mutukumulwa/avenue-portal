import { requireRole, ROLES } from "@/lib/rbac";
import { AnalyticsService } from "@/server/services/analytics.service";
import { Shield, ArrowLeft } from "lucide-react";
import Link from "next/link";

/**
 * Parity Compliance Dashboard — Process 14 §14 spec
 * Internal (Medvex own facilities) vs external provider cost comparison.
 * Access-gated to ADMIN_ONLY (maps to COMPLIANCE_OFFICER in the new RBAC system).
 */

function fmt(n: number) {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `UGX ${(n / 1_000).toFixed(0)}K`;
  return `UGX ${Math.round(n).toLocaleString("en-UG")}`;
}

const TIER_STYLE: Record<string, string> = {
  OWN:     "bg-brand-indigo/10 text-brand-indigo",
  PARTNER: "bg-[#17A2B8]/10 text-[#17A2B8]",
  PANEL:   "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function ParityDashboardPage() {
  // Compliance-gated — ADMIN_ONLY until full RBAC role grants are wired per-tenant
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const parity = await AnalyticsService.getParityDashboard(tenantId);

  const internalAvg = parity.internal.avgCostPerVisit;
  const externalAvg = parity.external.avgCostPerVisit;
  const parityRatio = externalAvg > 0 && internalAvg > 0
    ? externalAvg / internalAvg
    : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/analytics" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <Shield size={20} className="text-brand-indigo" />
            Parity Compliance Dashboard
          </h1>
          <p className="text-brand-text-muted text-sm mt-0.5">
            Internal (Medvex own) vs external provider cost comparison — YTD
          </p>
        </div>
        <span className="ml-auto text-[10px] font-bold uppercase px-3 py-1 rounded-full bg-brand-indigo/10 text-brand-indigo">
          Compliance Only
        </span>
      </div>

      {/* Parity ratio headline */}
      {parityRatio !== null && (
        <div className={`rounded-[8px] p-5 border text-center ${
          parityRatio > 1.3 ? "bg-[#DC3545]/10 border-[#DC3545]/30" :
          parityRatio > 1.1 ? "bg-[#FFC107]/10 border-[#FFC107]/30" :
          "bg-[#28A745]/10 border-[#28A745]/30"
        }`}>
          <p className="text-sm text-brand-text-muted">External avg cost per visit is</p>
          <p className={`text-4xl font-bold font-heading mt-1 ${
            parityRatio > 1.3 ? "text-[#DC3545]" :
            parityRatio > 1.1 ? "text-[#856404]" : "text-[#28A745]"
          }`}>
            {parityRatio > 1 ? `${((parityRatio - 1) * 100).toFixed(0)}% higher` : `${((1 - parityRatio) * 100).toFixed(0)}% lower`}
          </p>
          <p className="text-xs text-brand-text-muted mt-1">than internal provider average</p>
        </div>
      )}

      {/* Internal vs External side-by-side */}
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: "Internal (Medvex Own)", data: parity.internal, color: "text-brand-indigo", bg: "bg-brand-indigo/5 border-brand-indigo/20" },
          { label: "External Providers",    data: parity.external, color: "text-[#17A2B8]",     bg: "bg-[#17A2B8]/5 border-[#17A2B8]/20" },
        ].map(({ label, data, color, bg }) => (
          <div key={label} className={`border rounded-[8px] p-5 ${bg} space-y-4`}>
            <h2 className={`font-bold text-sm font-heading ${color}`}>{label}</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { l: "Encounters",          v: data.encounterCount.toLocaleString("en-UG") },
                { l: "Total Cost",          v: fmt(data.totalCost) },
                { l: "Benefit Paid",        v: fmt(data.benefitPaid) },
                { l: "Avg Cost / Visit",    v: fmt(data.avgCostPerVisit) },
              ].map(({ l, v }) => (
                <div key={l}>
                  <p className="text-xs text-brand-text-muted">{l}</p>
                  <p className={`font-semibold mt-0.5 ${color}`}>{v}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Provider breakdown table */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEEEEE]">
          <h2 className="font-bold text-brand-text-heading text-sm">Top 20 Providers by Cost — YTD</h2>
        </div>
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold">
              <th className="px-5 py-3">Provider</th>
              <th className="px-5 py-3">Tier</th>
              <th className="px-5 py-3 text-right">Encounters</th>
              <th className="px-5 py-3 text-right">Total Cost</th>
              <th className="px-5 py-3 text-right">Avg / Visit</th>
              <th className="px-5 py-3 text-right">vs Overall Avg</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {parity.breakdown.map((p) => {
              const overallAvg = parity.internal.encounterCount + parity.external.encounterCount > 0
                ? (parity.internal.totalCost + parity.external.totalCost) /
                  (parity.internal.encounterCount + parity.external.encounterCount)
                : 0;
              const variancePct = overallAvg > 0 ? (p.avgCostPerVisit - overallAvg) / overallAvg : 0;
              return (
                <tr key={p.providerId} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-brand-text-heading">{p.providerName}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${TIER_STYLE[p.tier] ?? TIER_STYLE.PANEL}`}>
                      {p.tier}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{p.encounterCount.toLocaleString("en-UG")}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{fmt(p.totalCost)}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{fmt(p.avgCostPerVisit)}</td>
                  <td className={`px-5 py-3 text-right text-xs font-semibold ${variancePct > 0.15 ? "text-[#DC3545]" : variancePct > 0.05 ? "text-[#856404]" : "text-[#28A745]"}`}>
                    {variancePct >= 0 ? "+" : ""}{(variancePct * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
