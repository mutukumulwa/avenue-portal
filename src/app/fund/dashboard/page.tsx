import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Wallet, TrendingDown, AlertTriangle, CheckCircle, ArrowRight, Clock } from "lucide-react";

function burnRate(transactions: { type: string; amount: number; postedAt: Date }[]): number {
  // Average monthly CLAIM_DEDUCTION over the last 3 months
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const recent = transactions.filter(t => t.type === "CLAIM_DEDUCTION" && t.postedAt >= threeMonthsAgo);
  const total  = recent.reduce((s, t) => s + t.amount, 0);
  return total / 3; // monthly average
}

function daysToDepletion(balance: number, monthlyBurn: number): number | null {
  if (monthlyBurn <= 0) return null;
  return Math.floor((balance / monthlyBurn) * 30);
}

export default async function FundDashboardPage() {
  const session = await requireRole(ROLES.FUND);
  const tenantId = session.user.tenantId;

  const groups = await prisma.group.findMany({
    where: {
      tenantId,
      fundingMode: "SELF_FUNDED",
      ...(session.user.role === "SUPER_ADMIN"
        ? {}
        : { fundAdministrators: { some: { id: session.user.id } } }),
    },
    include: {
      selfFundedAccount: {
        include: {
          transactions: {
            orderBy: { postedAt: "desc" },
            take: 100,
            select: { type: true, amount: true, postedAt: true, description: true, claimId: true },
          },
        },
      },
      members: { where: { status: "ACTIVE" }, select: { id: true } },
    },
    orderBy: { name: "asc" },
  });

  // Recent large claims across all funds (>50k)
  const recentClaims = await prisma.claim.findMany({
    where: {
      tenantId,
      status: { in: ["APPROVED", "PARTIALLY_APPROVED"] },
      member: { group: { fundingMode: "SELF_FUNDED" } },
      approvedAmount: { gte: 50000 },
    },
    select: {
      id: true, claimNumber: true, approvedAmount: true, dateOfService: true,
      benefitCategory: true,
      member: { select: { firstName: true, lastName: true, group: { select: { id: true, name: true } } } },
    },
    orderBy: { decidedAt: "desc" },
    take: 8,
  });

  const totalBalance = groups.reduce((s, g) => s + Number(g.selfFundedAccount?.balance ?? 0), 0);
  const totalDeposited = groups.reduce((s, g) => s + Number(g.selfFundedAccount?.totalDeposited ?? 0), 0);
  const totalClaims = groups.reduce((s, g) => s + Number(g.selfFundedAccount?.totalClaims ?? 0), 0);
  const alertCount = groups.filter(g => {
    const acc = g.selfFundedAccount;
    return acc && Number(acc.balance) < Number(acc.minimumBalance);
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Fund Administrator Dashboard</h1>
        <p className="text-avenue-text-body text-sm mt-1">
          Overseeing {groups.length} self-funded scheme{groups.length !== 1 ? "s" : ""}.
        </p>
      </div>

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Fund Balance",    value: `KES ${totalBalance.toLocaleString("en-KE")}`,    color: "text-[#28A745]",    icon: Wallet       },
          { label: "Total Deposited",       value: `KES ${totalDeposited.toLocaleString("en-KE")}`,  color: "text-avenue-indigo",icon: TrendingDown  },
          { label: "Total Claims Paid",     value: `KES ${totalClaims.toLocaleString("en-KE")}`,    color: "text-[#DC3545]",    icon: TrendingDown  },
          { label: "Low-Balance Alerts",    value: alertCount.toString(),                             color: alertCount > 0 ? "text-[#DC3545]" : "text-[#28A745]", icon: AlertTriangle },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={15} className={k.color} />
                <p className="text-xs font-bold uppercase text-avenue-text-muted">{k.label}</p>
              </div>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          );
        })}
      </div>

      {/* Per-scheme cards */}
      <div className="space-y-4">
        {groups.map(g => {
          const acc = g.selfFundedAccount;
          if (!acc) return null;
          const balance    = Number(acc.balance);
          const minBalance = Number(acc.minimumBalance);
          const deposited  = Number(acc.totalDeposited);
          const claimed    = Number(acc.totalClaims);
          const utilPct    = deposited > 0 ? Math.min(100, (claimed / deposited) * 100) : 0;
          const isLow      = balance < minBalance;

          const txns = acc.transactions.map(t => ({ ...t, amount: Number(t.amount) }));
          const monthly = burnRate(txns);
          const days    = daysToDepletion(balance, monthly);

          const barColor = utilPct >= 90 ? "bg-[#DC3545]" : utilPct >= 70 ? "bg-[#FFC107]" : "bg-[#28A745]";

          return (
            <div key={g.id} className={`bg-white border rounded-[8px] shadow-sm overflow-hidden ${isLow ? "border-[#DC3545]/30" : "border-[#EEEEEE]"}`}>
              {/* Header */}
              <div className={`px-5 py-4 flex items-center justify-between ${isLow ? "bg-[#FFF5F5]" : "bg-white"} border-b border-[#EEEEEE]`}>
                <div className="flex items-center gap-3">
                  {isLow
                    ? <AlertTriangle size={18} className="text-[#DC3545]" />
                    : <CheckCircle size={18} className="text-[#28A745]" />}
                  <div>
                    <h2 className="font-bold text-avenue-text-heading font-heading">{g.name}</h2>
                    <p className="text-xs text-avenue-text-muted mt-0.5">
                      {g.members.length} active members · Period: {new Date(acc.periodStartDate).toLocaleDateString("en-KE", { month: "short", year: "numeric" })} – {new Date(acc.periodEndDate).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
                    </p>
                  </div>
                </div>
                <Link href={`/fund/${g.id}`}
                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#28A745]/10 text-[#28A745] hover:bg-[#28A745]/20 transition-colors">
                  Manage <ArrowRight size={12} />
                </Link>
              </div>

              <div className="px-5 py-4 grid md:grid-cols-4 gap-6">
                {/* Balance */}
                <div>
                  <p className="text-xs font-bold uppercase text-avenue-text-muted mb-1">Current Balance</p>
                  <p className={`text-2xl font-bold font-mono ${isLow ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                    KES {balance.toLocaleString("en-KE")}
                  </p>
                  {isLow && (
                    <p className="text-xs text-[#DC3545] mt-0.5">
                      Below minimum (KES {minBalance.toLocaleString("en-KE")})
                    </p>
                  )}
                </div>

                {/* Burn rate & days */}
                <div>
                  <p className="text-xs font-bold uppercase text-avenue-text-muted mb-1">Monthly Burn Rate</p>
                  <p className="text-lg font-bold text-avenue-text-heading font-mono">
                    KES {Math.round(monthly).toLocaleString("en-KE")}
                  </p>
                  {days !== null && (
                    <p className={`text-xs mt-0.5 flex items-center gap-1 ${days < 30 ? "text-[#DC3545]" : days < 90 ? "text-[#856404]" : "text-[#28A745]"}`}>
                      <Clock size={11} />
                      ~{days} days to depletion
                    </p>
                  )}
                </div>

                {/* Utilisation */}
                <div className="md:col-span-2">
                  <div className="flex justify-between text-xs font-semibold text-avenue-text-muted mb-1">
                    <span>Utilisation</span>
                    <span>{utilPct.toFixed(1)}% of fund consumed</span>
                  </div>
                  <div className="h-2 bg-[#EEEEEE] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${utilPct}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-avenue-text-muted mt-1">
                    <span>KES {claimed.toLocaleString("en-KE")} paid</span>
                    <span>KES {deposited.toLocaleString("en-KE")} deposited</span>
                  </div>
                </div>
              </div>

              {/* Recent transactions mini-ledger */}
              {txns.length > 0 && (
                <div className="border-t border-[#EEEEEE] px-5 py-3">
                  <p className="text-[10px] font-bold uppercase text-avenue-text-muted mb-2">Recent Activity</p>
                  <div className="space-y-1">
                    {txns.slice(0, 3).map((t, i) => (
                      <div key={i} className="flex justify-between text-xs text-avenue-text-body">
                        <span className="truncate max-w-xs">{t.description}</span>
                        <span className={`font-mono font-semibold ml-4 ${["DEPOSIT","TOP_UP","REFUND"].includes(t.type) ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                          {["DEPOSIT","TOP_UP","REFUND"].includes(t.type) ? "+" : "−"}KES {t.amount.toLocaleString("en-KE")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-12 text-center text-avenue-text-muted">
            No self-funded schemes assigned to your account.
          </div>
        )}
      </div>

      {/* Recent large claims across all funds */}
      {recentClaims.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
            <AlertTriangle size={15} className="text-[#856404]" />
            <h2 className="font-bold text-avenue-text-heading font-heading">Large Claims (≥ KES 50,000)</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                <th className="px-4 py-2 text-left">Claim</th>
                <th className="px-4 py-2 text-left">Member</th>
                <th className="px-4 py-2 text-left">Scheme</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Approved (KES)</th>
                <th className="px-4 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {recentClaims.map(c => (
                <tr key={c.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2.5 font-mono text-xs text-avenue-indigo">{c.claimNumber}</td>
                  <td className="px-4 py-2.5">{c.member.firstName} {c.member.lastName}</td>
                  <td className="px-4 py-2.5 text-avenue-text-muted">{c.member.group.name}</td>
                  <td className="px-4 py-2.5 text-avenue-text-muted">{c.benefitCategory.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-[#DC3545]">
                    {Number(c.approvedAmount).toLocaleString("en-KE")}
                  </td>
                  <td className="px-4 py-2.5 text-avenue-text-muted text-xs">
                    {new Date(c.dateOfService).toLocaleDateString("en-KE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
