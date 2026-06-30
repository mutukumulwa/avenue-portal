import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { Droplets, AlertTriangle, TrendingDown, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const DEFAULT_MIN_BALANCE_PCT = 0.20; // flag when below 20% of total deposited

export default async function FundOverviewPage() {
  const session = await requireRole(ROLES.FINANCE);
  const tenantId = session.user.tenantId;

  const accounts = await prisma.selfFundedAccount.findMany({
    where: { group: { tenantId } },
    include: {
      group: { select: { id: true, name: true, renewalDate: true, _count: { select: { members: { where: { status: "ACTIVE" } } } } } },
      transactions: {
        orderBy: { postedAt: "desc" },
        take: 5,
        select: { type: true, amount: true, postedAt: true, description: true },
      },
    },
    orderBy: { balance: "asc" }, // lowest balance first (most urgent)
  });

  const fmt = (n: number) => {
    if (Math.abs(n) >= 1_000_000) return `KES ${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000)     return `KES ${(n / 1_000).toFixed(0)}K`;
    return `KES ${Math.round(n).toLocaleString("en-UG")}`;
  };

  const totalBalance  = accounts.reduce((s, a) => s + Number(a.balance), 0);
  const totalDeposited = accounts.reduce((s, a) => s + Number(a.totalDeposited), 0);
  const totalClaims   = accounts.reduce((s, a) => s + Number(a.totalClaims), 0);

  const critical = accounts.filter((a) => Number(a.balance) <= 0).length;
  const low      = accounts.filter((a) => {
    const bal = Number(a.balance);
    const dep = Number(a.totalDeposited);
    return bal > 0 && dep > 0 && bal / dep < DEFAULT_MIN_BALANCE_PCT;
  }).length;

  function balanceStatus(a: typeof accounts[0]) {
    const bal = Number(a.balance);
    const dep = Number(a.totalDeposited);
    if (bal <= 0) return { label: "Depleted", color: "bg-[#DC3545]/10 text-[#DC3545]", dot: "bg-[#DC3545]" };
    if (dep > 0 && bal / dep < DEFAULT_MIN_BALANCE_PCT) return { label: "Low", color: "bg-[#FFC107]/10 text-[#856404]", dot: "bg-[#FFC107]" };
    return { label: "Healthy", color: "bg-[#28A745]/10 text-[#28A745]", dot: "bg-[#28A745]" };
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
          <Droplets size={22} className="text-brand-indigo" />
          Self-Funded Schemes — Fund Overview
        </h1>
        <p className="text-brand-text-muted text-sm mt-1">
          Cross-scheme fund health dashboard for all self-funded clients.
        </p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Total Fund Balance",  value: fmt(totalBalance),   color: totalBalance < 0 ? "text-[#DC3545]" : "text-brand-indigo" },
          { label: "Total Deposited",     value: fmt(totalDeposited), color: "text-brand-text-heading" },
          { label: "Total Claims Paid",   value: fmt(totalClaims),    color: "text-[#DC3545]" },
          { label: "Schemes Needing Attention", value: `${critical + low}`, color: critical + low > 0 ? "text-[#856404] font-bold" : "text-[#28A745]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4">
            <p className="text-xs text-brand-text-muted">{label}</p>
            <p className={`text-xl font-bold font-heading mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Alert banners */}
      {critical > 0 && (
        <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-[8px] p-4 flex items-center gap-3">
          <TrendingDown size={16} className="text-[#DC3545] shrink-0" />
          <p className="text-sm text-[#DC3545] font-semibold">
            {critical} scheme{critical !== 1 ? "s" : ""} have a depleted fund balance — immediate top-up required.
          </p>
        </div>
      )}
      {low > 0 && (
        <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-[#856404] shrink-0" />
          <p className="text-sm text-[#856404]">
            {low} scheme{low !== 1 ? "s" : ""} {low !== 1 ? "are" : "is"} below 20% fund threshold — top-up recommended.
          </p>
        </div>
      )}
      {critical === 0 && low === 0 && accounts.length > 0 && (
        <div className="bg-[#28A745]/10 border border-[#28A745]/30 rounded-[8px] p-4 flex items-center gap-2">
          <CheckCircle2 size={15} className="text-[#28A745]" />
          <p className="text-sm text-[#28A745] font-semibold">All self-funded schemes have healthy balances.</p>
        </div>
      )}

      {/* Scheme list */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Scheme</th>
              <th className="px-5 py-3 text-center">Members</th>
              <th className="px-5 py-3 text-right">Balance</th>
              <th className="px-5 py-3 text-right">Deposited</th>
              <th className="px-5 py-3 text-right">Claims Paid</th>
              <th className="px-5 py-3 text-right">Utilisation</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Renewal</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {accounts.map((a) => {
              const utilisation = Number(a.totalDeposited) > 0
                ? Number(a.totalClaims) / Number(a.totalDeposited)
                : 0;
              const status = balanceStatus(a);
              return (
                <tr key={a.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-5 py-3 font-semibold text-brand-text-heading">{a.group.name}</td>
                  <td className="px-5 py-3 text-center font-mono text-brand-text-muted">{a.group._count.members}</td>
                  <td className={`px-5 py-3 text-right font-mono font-semibold ${Number(a.balance) <= 0 ? "text-[#DC3545]" : "text-brand-text-heading"}`}>
                    {fmt(Number(a.balance))}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-brand-text-muted">{fmt(Number(a.totalDeposited))}</td>
                  <td className="px-5 py-3 text-right font-mono text-[#DC3545]">{fmt(Number(a.totalClaims))}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-[#EEEEEE] rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${utilisation > 0.8 ? "bg-[#DC3545]" : utilisation > 0.6 ? "bg-[#FFC107]" : "bg-[#28A745]"}`}
                          style={{ width: `${Math.min(100, utilisation * 100).toFixed(0)}%` }} />
                      </div>
                      <span className="text-xs text-brand-text-muted w-10 text-right">{(utilisation * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-brand-text-muted">
                    {new Date(a.group.renewalDate).toLocaleDateString("en-UG")}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={`/fund/${a.group.id}`}
                      className="text-brand-indigo hover:text-brand-secondary font-semibold text-xs">
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr><td colSpan={9} className="px-5 py-8 text-center text-brand-text-muted text-sm">No self-funded schemes found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
