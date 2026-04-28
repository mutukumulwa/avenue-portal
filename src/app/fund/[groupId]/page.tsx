import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Wallet, TrendingDown, Users, PauseCircle, FileText, BarChart2 } from "lucide-react";
import { DepositForm } from "./DepositForm";
import { CategoryHoldManager } from "./CategoryHoldManager";
import { AdminFeeButton } from "./AdminFeeButton";

const TXN_SIGN: Record<string, string> = {
  DEPOSIT: "+", TOP_UP: "+", REFUND: "+",
  CLAIM_DEDUCTION: "−", ADMIN_FEE: "−", ADJUSTMENT: "±",
};
const TXN_COLOR: Record<string, string> = {
  DEPOSIT: "text-[#28A745]", TOP_UP: "text-[#28A745]", REFUND: "text-[#17A2B8]",
  CLAIM_DEDUCTION: "text-[#DC3545]", ADMIN_FEE: "text-[#DC3545]", ADJUSTMENT: "text-[#6C757D]",
};

export default async function FundSchemePage({ params }: { params: Promise<{ groupId: string }> }) {
  const session = await requireRole(ROLES.FUND);
  const { groupId } = await params;
  const tenantId = session.user.tenantId;

  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId, fundingMode: "SELF_FUNDED" },
    include: {
      selfFundedAccount: {
        include: {
          transactions: { orderBy: { postedAt: "desc" }, take: 50 },
        },
      },
      members: { where: { status: "ACTIVE" }, select: { id: true } },
    },
  });
  if (!group) notFound();
  if (session.user.role !== "SUPER_ADMIN") {
    const isAdmin = await prisma.group.findFirst({
      where: { id: groupId, fundAdministrators: { some: { id: session.user.id } } },
    });
    if (!isAdmin) notFound();
  }

  const acc = group.selfFundedAccount;
  if (!acc) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{group.name}</h1>
        <p className="text-avenue-text-muted">No fund account initialised yet. Record the first deposit to create the account.</p>
        <DepositForm groupId={groupId} />
      </div>
    );
  }

  const balance    = Number(acc.balance);
  const minBalance = Number(acc.minimumBalance);
  const deposited  = Number(acc.totalDeposited);
  const claimed    = Number(acc.totalClaims);
  const fees       = Number(acc.totalAdminFees);
  const isLow      = balance < minBalance;
  const heldCats   = acc.heldCategories as string[];

  // Category breakdown from fund transactions
  const claimTxns = acc.transactions.filter(t => t.type === "CLAIM_DEDUCTION" && t.claimId);
  const claims = await prisma.claim.findMany({
    where: { id: { in: claimTxns.map(t => t.claimId!).filter(Boolean) } },
    select: { id: true, benefitCategory: true, approvedAmount: true },
  });
  const byCategory = new Map<string, number>();
  for (const c of claims) {
    byCategory.set(c.benefitCategory, (byCategory.get(c.benefitCategory) ?? 0) + Number(c.approvedAmount));
  }
  const categoryBreakdown = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">{group.name}</h1>
          <p className="text-avenue-text-muted text-sm mt-0.5">
            Self-Funded Scheme · {group.members.length} active members ·
            Period: {new Date(acc.periodStartDate).toLocaleDateString("en-KE", { month: "short", year: "numeric" })} – {new Date(acc.periodEndDate).toLocaleDateString("en-KE", { month: "short", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/fund/${groupId}/claims`}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-avenue-indigo/30 text-avenue-indigo hover:bg-avenue-indigo/5">
            <FileText size={12} /> Claims
          </Link>
          <Link href={`/fund/${groupId}/statement`}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-avenue-indigo/30 text-avenue-indigo hover:bg-avenue-indigo/5">
            <BarChart2 size={12} /> Statement
          </Link>
        </div>
      </div>

      {/* Balance banner */}
      <div className={`rounded-[8px] border p-5 ${isLow ? "bg-[#FFF5F5] border-[#DC3545]/30" : "bg-[#F0FDF4] border-[#28A745]/20"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet size={24} className={isLow ? "text-[#DC3545]" : "text-[#28A745]"} />
            <div>
              <p className="text-xs font-bold uppercase text-avenue-text-muted">Current Fund Balance</p>
              <p className={`text-3xl font-bold font-mono mt-0.5 ${isLow ? "text-[#DC3545]" : "text-[#28A745]"}`}>
                KES {balance.toLocaleString("en-KE")}
              </p>
              {isLow && (
                <p className="text-xs text-[#DC3545] mt-1">
                  ⚠ Below minimum balance of KES {minBalance.toLocaleString("en-KE")} — top up required
                </p>
              )}
            </div>
          </div>
          <DepositForm groupId={groupId} />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Deposited",  value: deposited.toLocaleString("en-KE"), icon: Wallet,       color: "text-avenue-indigo" },
          { label: "Claims Deducted",  value: claimed.toLocaleString("en-KE"),   icon: TrendingDown, color: "text-[#DC3545]"    },
          { label: "Admin Fees",       value: fees.toLocaleString("en-KE"),      icon: FileText,     color: "text-[#856404]"    },
          { label: "Active Members",   value: group.members.length.toString(),   icon: Users,        color: "text-[#17A2B8]"    },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className={k.color} />
                <p className="text-xs font-bold uppercase text-avenue-text-muted">{k.label}</p>
              </div>
              <p className={`text-xl font-bold font-mono ${k.color}`}>KES {k.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <h3 className="font-bold text-avenue-text-heading text-sm mb-4">Claims by Benefit Category</h3>
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-avenue-text-muted">No claims deducted yet.</p>
          ) : (
            <div className="space-y-3">
              {categoryBreakdown.map(([cat, amt]) => {
                const pct = claimed > 0 ? (amt / claimed) * 100 : 0;
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-avenue-text-heading">{cat.replace(/_/g, " ")}</span>
                      <span className="text-avenue-text-muted font-mono">KES {amt.toLocaleString("en-KE")} ({pct.toFixed(1)}%)</span>
                    </div>
                    <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                      <div className="h-full bg-avenue-indigo rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Category hold manager */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <PauseCircle size={15} className="text-[#DC3545]" />
            <h3 className="font-bold text-avenue-text-heading text-sm">Category Hold Manager</h3>
          </div>
          <p className="text-xs text-avenue-text-muted">
            Hold a category to pause new claim approvals from this fund for that benefit type.
            Red = currently on hold. Claims already approved are not affected.
          </p>
          {heldCats.length > 0 && (
            <p className="text-xs font-bold text-[#DC3545]">
              {heldCats.length} categor{heldCats.length === 1 ? "y" : "ies"} on hold
            </p>
          )}
          <CategoryHoldManager groupId={groupId} heldCategories={heldCats} />
        </div>
      </div>

      {/* Admin fee invoicing */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
        <h3 className="font-bold text-avenue-text-heading text-sm">Period-End Admin Fee</h3>
        <AdminFeeButton
          groupId={groupId}
          alreadyInvoiced={!!acc.adminFeeInvoiceId}
          adminFeeMethod={group.adminFeeMethod ?? null}
        />
      </div>

      {/* Full ledger */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE]">
          <h3 className="font-bold text-avenue-text-heading text-sm">Fund Ledger</h3>
        </div>
        {acc.transactions.length === 0 ? (
          <p className="px-5 py-8 text-sm text-avenue-text-muted text-center">No transactions yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">Ref</th>
                <th className="px-4 py-2 text-right">Amount (KES)</th>
                <th className="px-4 py-2 text-right">Balance After (KES)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {acc.transactions.map(t => (
                <tr key={t.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2.5 text-xs text-avenue-text-muted">{new Date(t.postedAt).toLocaleDateString("en-KE")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold ${TXN_COLOR[t.type] ?? "text-avenue-text-muted"}`}>
                      {t.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-avenue-text-body">{t.description}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-avenue-text-muted">{t.referenceNumber ?? "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold text-xs ${TXN_COLOR[t.type]}`}>
                    {TXN_SIGN[t.type]}{Number(t.amount).toLocaleString("en-KE")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-avenue-text-heading">
                    {Number(t.balanceAfter).toLocaleString("en-KE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
