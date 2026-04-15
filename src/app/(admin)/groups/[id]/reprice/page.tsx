import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";

export default async function RepricingWorkbenchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(ROLES.ANY_STAFF);
  const { id } = await params;

  const group = await prisma.group.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      invoices: {
        select: { totalAmount: true, paidAmount: true, period: true, memberCount: true },
        orderBy: { createdAt: "desc" },
        take: 24, // Up to 24 months
      },
      members: {
        where: { status: "ACTIVE" },
        select: { id: true },
      },
    },
  });

  if (!group) notFound();

  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  // Prior-year claims
  const claims = await prisma.claim.findMany({
    where: {
      member: { groupId: id },
      createdAt: { gte: oneYearAgo },
      status: { in: ["APPROVED", "PAID", "PARTIALLY_APPROVED"] },
    },
    select: { approvedAmount: true, createdAt: true, benefitCategory: true },
  });

  // Aggregate by month
  const byMonth = new Map<string, number>();
  for (const c of claims) {
    const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, "0")}`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(c.approvedAmount));
  }
  const monthlyTrend = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }));

  // Aggregate by benefit category
  const byCategory = new Map<string, number>();
  for (const c of claims) {
    byCategory.set(c.benefitCategory, (byCategory.get(c.benefitCategory) ?? 0) + Number(c.approvedAmount));
  }
  const topCategories = Array.from(byCategory.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Prior-year contribution (invoices)
  const priorYearContribution = group.invoices
    .filter((inv) => {
      const parts = inv.period.split("-");
      const year = parts[0] ? parseInt(parts[0]) : 0;
      return year >= now.getFullYear() - 1;
    })
    .reduce((s, inv) => s + Number(inv.totalAmount), 0);

  const totalClaims    = claims.reduce((s, c) => s + Number(c.approvedAmount), 0);
  const lossRatio      = priorYearContribution > 0 ? (totalClaims / priorYearContribution) * 100 : 0;
  const activeLives    = group.members.length;

  // Trend: compare H1 vs H2 of the prior year
  const sortedMonths = monthlyTrend;
  const half         = Math.ceil(sortedMonths.length / 2);
  const h1Total      = sortedMonths.slice(0, half).reduce((s, m) => s + m.amount, 0);
  const h2Total      = sortedMonths.slice(half).reduce((s, m) => s + m.amount, 0);
  const trendPct     = h1Total > 0 ? ((h2Total - h1Total) / h1Total) * 100 : 0;

  // Suggested rate: actuarial repricing
  // Base = prior-year claims / active lives
  // Trend adjustment = trendPct projected forward
  // Margin = 15% admin + profit loading
  const baseRatePerLife   = activeLives > 0 ? totalClaims / activeLives : 0;
  const trendedRate       = baseRatePerLife * (1 + Math.max(0, trendPct / 100));
  const suggestedRate     = Math.round(trendedRate * 1.15); // 15% margin
  const suggestedAnnual   = suggestedRate * activeLives;

  // Current rate (from most recent invoice)
  const latestInvoice     = group.invoices[0];
  const currentRate       = latestInvoice && latestInvoice.memberCount > 0
    ? Number(latestInvoice.totalAmount) / latestInvoice.memberCount
    : 0;
  const rateChange        = currentRate > 0 ? ((suggestedRate - currentRate) / currentRate) * 100 : 0;

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
  const lossRatioColor = lossRatio > 85 ? "text-[#DC3545]" : lossRatio > 70 ? "text-[#856404]" : "text-[#28A745]";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/groups/${id}`} className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Renewal Repricing Workbench</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">{group.name} — Prior 12-month actuarial analysis</p>
        </div>
        <Link
          href={`/quotations/calculator`}
          className="ml-auto flex items-center gap-2 px-5 py-2 bg-avenue-indigo text-white rounded-full text-sm font-semibold hover:bg-avenue-secondary transition-colors"
        >
          <RefreshCw size={14} /> Start Renewal Quote
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Lives",             value: activeLives.toLocaleString(),           sub: "enrolled members" },
          { label: "Prior-Year Claims",         value: fmt(totalClaims),                       sub: `${claims.length} approved claims` },
          { label: "Prior-Year Contributions",  value: fmt(priorYearContribution),             sub: "invoiced amount" },
          { label: "Loss Ratio",                value: `${lossRatio.toFixed(1)}%`,             sub: lossRatio > 85 ? "High — recommend repricing" : lossRatio > 70 ? "Watch" : "Healthy", color: lossRatioColor },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
            <p className="text-xs font-bold text-avenue-text-muted uppercase">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.color ?? "text-avenue-indigo"}`}>{k.value}</p>
            <p className="text-xs text-avenue-text-muted mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Suggested repricing */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-avenue-text-heading font-heading">Suggested Renewal Rate</h2>
          <div className="space-y-2 text-sm">
            {[
              { label: "Base claims per life",          value: fmt(baseRatePerLife) },
              { label: `Claim trend (H1→H2)`,           value: `${trendPct >= 0 ? "+" : ""}${trendPct.toFixed(1)}%` },
              { label: "Trended rate per life",          value: fmt(trendedRate) },
              { label: "Admin & margin loading (15%)",   value: fmt(trendedRate * 0.15) },
              { label: "Current rate per life/yr",       value: currentRate > 0 ? fmt(currentRate) : "—" },
            ].map((r) => (
              <div key={r.label} className="flex justify-between border-b border-[#F8F9FA] pb-1">
                <span className="text-avenue-text-muted">{r.label}</span>
                <span className="font-semibold text-avenue-text-heading">{r.value}</span>
              </div>
            ))}
          </div>
          <div className={`rounded-lg p-4 ${rateChange > 15 ? "bg-[#DC3545]/5 border border-[#DC3545]/20" : rateChange > 0 ? "bg-[#FFC107]/10 border border-[#FFC107]/30" : "bg-[#28A745]/5 border border-[#28A745]/20"}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-avenue-text-muted uppercase">Suggested Rate / Life / Year</p>
                <p className="text-3xl font-bold text-avenue-indigo mt-1">{fmt(suggestedRate)}</p>
                <p className="text-xs text-avenue-text-muted mt-0.5">Annual group total: {fmt(suggestedAnnual)}</p>
              </div>
              <div className="text-right">
                {rateChange >= 0
                  ? <TrendingUp size={32} className={rateChange > 15 ? "text-[#DC3545]" : "text-[#856404]"} />
                  : <TrendingDown size={32} className="text-[#28A745]" />
                }
                <p className={`text-sm font-bold mt-1 ${rateChange > 15 ? "text-[#DC3545]" : rateChange > 0 ? "text-[#856404]" : "text-[#28A745]"}`}>
                  {rateChange >= 0 ? "+" : ""}{rateChange.toFixed(1)}% vs current
                </p>
              </div>
            </div>
          </div>
          {lossRatio > 85 && (
            <div className="flex items-start gap-2 bg-[#FFF8E1] border border-[#FFC107]/40 rounded-lg px-3 py-2 text-xs text-[#856404]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Loss ratio exceeds 85%. Consider benefit redesign — reducing sublimits or adding copay — alongside rate increase.
            </div>
          )}
        </div>

        {/* Claims by category */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-avenue-text-heading font-heading">Claims by Benefit Category</h2>
          {topCategories.length > 0 ? (
            <div className="space-y-3">
              {topCategories.map(([cat, amount]) => {
                const pct = totalClaims > 0 ? (amount / totalClaims) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-semibold text-avenue-text-heading">{cat.replace(/_/g, " ")}</span>
                      <span className="text-avenue-text-muted">{fmt(amount)} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-[#F8F9FA] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-avenue-indigo rounded-full"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-avenue-text-muted">No approved claims in the prior 12 months.</p>
          )}

          {/* Monthly trend */}
          {monthlyTrend.length > 0 && (
            <div className="pt-4 border-t border-[#EEEEEE]">
              <p className="text-xs font-bold text-avenue-text-muted uppercase mb-3">Monthly Claims Trend</p>
              <div className="flex items-end gap-1 h-20">
                {monthlyTrend.map(({ month, amount }) => {
                  const max = Math.max(...monthlyTrend.map((m) => m.amount));
                  const h   = max > 0 ? Math.round((amount / max) * 100) : 0;
                  return (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1" title={`${month}: ${fmt(amount)}`}>
                      <div
                        className="w-full bg-avenue-indigo/70 rounded-t"
                        style={{ height: `${h}%` }}
                      />
                      <span className="text-[8px] text-avenue-text-muted rotate-45 origin-left">
                        {month.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Benefit redesign suggestions */}
      {lossRatio > 70 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h2 className="font-bold text-avenue-text-heading font-heading mb-3">Benefit Redesign Recommendations</h2>
          <ul className="space-y-2 text-sm text-avenue-text-body">
            {lossRatio > 85 && (
              <>
                <li className="flex items-start gap-2"><span className="text-[#DC3545] font-bold shrink-0">•</span> Introduce or increase inpatient copay (10–20%) to manage high-cost admissions.</li>
                <li className="flex items-start gap-2"><span className="text-[#DC3545] font-bold shrink-0">•</span> Add a pre-authorization requirement for all inpatient and surgical benefits.</li>
              </>
            )}
            {topCategories[0] && Number(topCategories[0][1]) / totalClaims > 0.4 && (
              <li className="flex items-start gap-2"><span className="text-[#FFC107] font-bold shrink-0">•</span>
                {topCategories[0][0].replace(/_/g, " ")} accounts for over 40% of claims — consider a per-visit sub-limit or preferred provider network restriction.
              </li>
            )}
            <li className="flex items-start gap-2"><span className="text-avenue-indigo font-bold shrink-0">•</span> Consider wellness benefits (dental check-ups, eye tests) to encourage early detection and reduce future inpatient spend.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
