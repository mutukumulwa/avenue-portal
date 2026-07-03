import { requireRole, ROLES } from "@/lib/rbac";
import Link from "next/link";
import { ArrowLeft, BarChart3, AlertTriangle } from "lucide-react";
import { ContractAnalyticsService } from "@/server/services/contract-analytics.service";
import { ContractReconciliationService } from "@/server/services/contract-reconciliation.service";

export const dynamic = "force-dynamic";

function money(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-[#000523] mb-3">{title}</h2>
      {children}
    </section>
  );
}

export default async function ContractAnalyticsPage() {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const [claimsByContract, shortPaid, backlog, expiring, rateVariance, turnaround, queueLoad, overrides, leakage, reconciliations] = await Promise.all([
    ContractAnalyticsService.claimsByContract(tenantId),
    ContractAnalyticsService.shortPaidSummary(tenantId),
    ContractAnalyticsService.amendmentBacklog(tenantId),
    ContractAnalyticsService.expiringContracts(tenantId),
    ContractAnalyticsService.rateVariance(tenantId),
    ContractAnalyticsService.turnaround(tenantId),
    ContractAnalyticsService.queueLoad(tenantId),
    ContractAnalyticsService.overridesSummary(tenantId),
    ContractAnalyticsService.providerLeakage(tenantId),
    ContractReconciliationService.list(tenantId),
  ]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/contracts" className="inline-flex items-center gap-1 text-sm text-[#6C757D] hover:text-[#06B9AB] mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to contracts
      </Link>
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-[#000523] mb-1">
        <BarChart3 className="w-6 h-6 text-[#06B9AB]" /> Contract analytics
      </h1>
      <p className="text-sm text-[#6C757D] mb-6">Datasets keyed to per-line contract provenance (spec §15).</p>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-[#6C757D]">Auto-adjudicated</div>
          <div className="text-2xl font-semibold text-[#28A745]">{turnaround.autoApprovedPct}%</div>
          <div className="text-xs text-[#6C757D]">{turnaround.autoApproved}/{turnaround.totalClaims} claims</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-[#6C757D]">Avg turnaround</div>
          <div className="text-2xl font-semibold text-[#000523]">{turnaround.avgTurnaroundDays ?? "—"}</div>
          <div className="text-xs text-[#6C757D]">days</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-[#6C757D]">Short-paid (PRC-001)</div>
          <div className="text-2xl font-semibold text-[#856404]">{money(shortPaid.shortfallTotal)}</div>
          <div className="text-xs text-[#6C757D]">{shortPaid.lines} lines</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-xs text-[#6C757D]">Amendment backlog</div>
          <div className="text-2xl font-semibold text-[#000523]">{backlog.length}</div>
          <div className="text-xs text-[#6C757D]">unmapped services</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Claims by contract (dataset 1)">
          {claimsByContract.length === 0 ? (
            <p className="text-xs text-[#6C757D]">No priced claims yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[#6C757D]">
                <tr><th className="py-1">Contract</th><th className="py-1 text-right">Billed</th><th className="py-1 text-right">Payable</th><th className="py-1 text-right">Shortfall</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {claimsByContract.slice(0, 10).map(c => (
                  <tr key={c.contractId}>
                    <td className="py-1"><Link href={`/contracts/${c.contractId}`} className="text-[#06B9AB]">{c.contractNumber}</Link></td>
                    <td className="py-1 text-right">{money(c.billed)}</td>
                    <td className="py-1 text-right text-[#28A745]">{money(c.payable)}</td>
                    <td className="py-1 text-right text-[#856404]">{money(c.shortfall)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Amendment backlog — unmapped services (dataset 5)">
          {backlog.length === 0 ? (
            <p className="text-xs text-[#6C757D]">No unmapped-service clusters.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[#6C757D]"><tr><th className="py-1">Service</th><th className="py-1 text-right">Occurrences</th><th className="py-1 text-right">At risk</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {backlog.slice(0, 10).map((b, i) => (
                  <tr key={i}><td className="py-1">{b.description}</td><td className="py-1 text-right">{b.count}</td><td className="py-1 text-right">{money(b.billedAtRisk)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Rate variance across providers (dataset 11)">
          {rateVariance.length === 0 ? (
            <p className="text-xs text-[#6C757D]">Need ≥2 providers with the same service.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[#6C757D]"><tr><th className="py-1">Service</th><th className="py-1 text-right">Min</th><th className="py-1 text-right">Max</th><th className="py-1 text-right">Spread</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rateVariance.slice(0, 10).map((v, i) => (
                  <tr key={i}><td className="py-1">{v.service}</td><td className="py-1 text-right">{money(v.min)}</td><td className="py-1 text-right">{money(v.max)}</td><td className="py-1 text-right text-[#DC3545]">{v.spreadPct}%</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Expiring & review-due (dataset 6)">
          {expiring.length === 0 ? (
            <p className="text-xs text-[#6C757D]">Nothing due within 60 days.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {expiring.slice(0, 10).map(c => (
                <li key={c.id} className="flex items-center justify-between">
                  <Link href={`/contracts/${c.id}`} className="text-[#06B9AB]">{c.contractNumber}</Link>
                  <span className="text-[#6C757D] inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> ends {c.endDate.toISOString().slice(0, 10)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Manual-review queue load (§8.5)">
          {queueLoad.length === 0 ? (
            <p className="text-xs text-[#6C757D]">No queued claims.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {queueLoad.map((q, i) => (
                <li key={i} className="flex justify-between"><span>{q.queue?.replace(/_/g, " ")}</span><span className="text-[#6C757D]">{q.count}</span></li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Overrides by type (dataset 4)">
          {overrides.length === 0 ? (
            <p className="text-xs text-[#6C757D]">No overrides recorded.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[#6C757D]"><tr><th className="py-1">Type</th><th className="py-1 text-right">Total</th><th className="py-1 text-right">Approved</th><th className="py-1 text-right">Pending</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {overrides.slice(0, 10).map((o, i) => (
                  <tr key={i}><td className="py-1">{o.type.replace(/_/g, " ")}</td><td className="py-1 text-right">{o.total}</td><td className="py-1 text-right text-[#28A745]">{o.approved}</td><td className="py-1 text-right text-[#856404]">{o.pending}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Provider leakage — unlisted spend (dataset 8)">
          <div className="text-sm">
            <div className="text-2xl font-semibold text-[#DC3545]">{money(leakage.unlistedSpend)}</div>
            <div className="text-xs text-[#6C757D]">{leakage.lines} line(s) paid as billed with no contracted ceiling</div>
          </div>
        </Card>

        <Card title="Average-cost reconciliations (dataset 12)">
          {reconciliations.length === 0 ? (
            <p className="text-xs text-[#6C757D]">No reconciliations computed. Recovery is finance-approved, never auto-posted.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-[#6C757D]"><tr><th className="py-1">Pool</th><th className="py-1 text-right">Recovery</th><th className="py-1">Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {reconciliations.slice(0, 10).map(r => (
                  <tr key={r.id}><td className="py-1">{r.poolId}</td><td className="py-1 text-right">{money(Number(r.recovery))}</td><td className="py-1">{r.status}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
