import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole, ROLES } from "@/lib/rbac";
import { Network, Download, AlertTriangle } from "lucide-react";
import { NetworkPerformanceService, NETWORK_ANALYTICS_PERMISSION } from "@/server/services/provider-performance/network.service";
import { NetworkImprovementPlanButton } from "./NetworkImprovementPlanButton";

/**
 * PNOS F8.6 — TPA network performance workspace (§8.13 TPA view; D21 advisory).
 *
 * An authorized network manager compares NAMED providers on a metric, spots outliers,
 * exports (audited), and opens a HUMAN improvement plan (F7.7). It shows aggregate
 * scores only — no clinical detail — and NEVER mutates a rate, tier, or provider
 * status. Gated on the explicit network-analytics permission (beyond the role).
 */
export default async function NetworkPerformanceWorkspace({ searchParams }: { searchParams: Promise<{ metric?: string; period?: string }> }) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const actor = { userId: session.user.id, tenantId: session.user.tenantId, permissions: (session.user.permissions ?? []) as string[] };
  if (!actor.permissions.includes(NETWORK_ANALYTICS_PERMISSION)) redirect("/unauthorized");

  const { metrics, periods } = await NetworkPerformanceService.listAvailable(actor);
  const { metric, period } = await searchParams;
  const selMetric = metric || metrics[0] || "";
  const selPeriod = period || periods[0] || "";
  const rows = selMetric && selPeriod ? await NetworkPerformanceService.listComparison(actor, { metricKey: selMetric, period: selPeriod }) : [];
  const fmt = (v: string | null, unit: string) => (v == null ? "—" : unit === "RATE" ? `${(Number(v) * 100).toFixed(1)}%` : Number(v).toLocaleString());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><Network size={22} /> Network performance</h1>
        {selMetric && selPeriod && (
          <a href={`/network-performance/export?metric=${encodeURIComponent(selMetric)}&period=${encodeURIComponent(selPeriod)}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-indigo border border-brand-indigo/30 rounded-lg px-3 py-1.5 hover:bg-brand-indigo/5"><Download size={15} /> Export CSV</a>
        )}
      </div>

      <p className="text-xs text-brand-text-muted">Scores are advisory (§8.13 / D21) — this workspace never changes a rate, tier, or provider status. See the <Link href="#" className="underline">metric catalog (PNMC-1.0)</Link> for each definition.</p>

      <form method="GET" className="flex flex-wrap items-end gap-2 bg-white border border-[#EEEEEE] rounded-lg px-4 py-3">
        <label className="text-xs text-brand-text-muted">Metric<select name="metric" defaultValue={selMetric} className="block mt-0.5 rounded-lg border border-[#DDDDDD] px-2.5 py-1.5 text-sm min-w-[16rem]">{metrics.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        <label className="text-xs text-brand-text-muted">Period<select name="period" defaultValue={selPeriod} className="block mt-0.5 rounded-lg border border-[#DDDDDD] px-2.5 py-1.5 text-sm">{periods.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
        <button type="submit" className="text-sm font-semibold text-white bg-brand-indigo rounded-lg px-3 py-1.5">Apply</button>
      </form>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-brand-text-muted text-sm">No scores for this metric and period.</p>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="w-full text-sm min-w-[44rem]">
              <thead className="text-[11px] uppercase text-brand-text-muted"><tr className="border-b border-[#EEEEEE]">
                <th className="text-left px-5 py-2 font-bold">Provider</th><th className="text-right px-5 py-2 font-bold">Value</th><th className="text-right px-5 py-2 font-bold">Sample</th><th className="text-left px-5 py-2 font-bold">Flag</th><th className="text-left px-5 py-2 font-bold">Action</th>
              </tr></thead>
              <tbody className="divide-y divide-[#F4F4F4]">
                {rows.map((r) => (
                  <tr key={r.providerId}>
                    <td className="px-5 py-2.5 font-semibold text-brand-text-heading">{r.providerName}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{fmt(r.value, r.unit)} <span className="text-brand-text-muted">({r.numerator}/{r.denominator})</span></td>
                    <td className="px-5 py-2.5 text-right text-xs">{r.sampleSize}{!r.meetsMinimumSample && <span className="text-brand-text-muted"> (low)</span>}</td>
                    <td className="px-5 py-2.5">{r.isOutlier && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF3CD] text-[#856404]"><AlertTriangle size={11} /> outlier</span>}</td>
                    <td className="px-5 py-2.5"><NetworkImprovementPlanButton providerId={r.providerId} providerName={r.providerName} metricKey={selMetric} /></td>
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
