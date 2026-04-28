import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

const TXN_COLOR: Record<string, string> = {
  DEPOSIT: "text-[#28A745]", TOP_UP: "text-[#28A745]", REFUND: "text-[#17A2B8]",
  CLAIM_DEDUCTION: "text-[#DC3545]", ADMIN_FEE: "text-[#DC3545]", ADJUSTMENT: "text-[#6C757D]",
};
const TXN_SIGN: Record<string, string> = {
  DEPOSIT: "+", TOP_UP: "+", REFUND: "+",
  CLAIM_DEDUCTION: "−", ADMIN_FEE: "−", ADJUSTMENT: "±",
};

export default async function FundStatementPage({ params }: { params: Promise<{ groupId: string }> }) {
  const session = await requireRole(ROLES.FUND);
  const { groupId } = await params;
  const tenantId = session.user.tenantId;

  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId, fundingMode: "SELF_FUNDED" },
    include: {
      selfFundedAccount: {
        include: {
          transactions: { orderBy: { postedAt: "asc" } },
        },
      },
      members: { where: { status: "ACTIVE" }, select: { id: true } },
    },
  });
  if (!group) notFound();

  const acc = group.selfFundedAccount;
  if (!acc) notFound();

  const txns     = acc.transactions;
  const deposits = txns.filter(t => ["DEPOSIT","TOP_UP","REFUND"].includes(t.type));
  const debits   = txns.filter(t => ["CLAIM_DEDUCTION","ADMIN_FEE","ADJUSTMENT"].includes(t.type));

  const totalIn    = deposits.reduce((s, t) => s + Number(t.amount), 0);
  const totalOut   = debits.reduce((s, t) => s + Number(t.amount), 0);
  const openingBal = txns.length > 0 ? Number(txns[0].balanceAfter) - (deposits[0] ? Number(deposits[0].amount) : 0) : 0;
  const closingBal = Number(acc.balance);

  // Category breakdown
  const claimTxns = txns.filter(t => t.type === "CLAIM_DEDUCTION" && t.claimId);
  const claims    = await prisma.claim.findMany({
    where: { id: { in: claimTxns.map(t => t.claimId!).filter(Boolean) } },
    select: { id: true, benefitCategory: true, approvedAmount: true },
  });
  const byCategory = new Map<string, number>();
  for (const c of claims) byCategory.set(c.benefitCategory, (byCategory.get(c.benefitCategory) ?? 0) + Number(c.approvedAmount));
  const catBreakdown = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/fund/${groupId}`} className="text-avenue-text-muted hover:text-avenue-indigo">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Fund Statement</h1>
            <p className="text-avenue-text-body text-sm mt-0.5">{group.name}</p>
          </div>
        </div>
        <a href={`/api/fund/${groupId}/statement/export`}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-avenue-indigo border border-avenue-indigo/30 rounded-full hover:bg-avenue-indigo hover:text-white transition-colors">
          <Download size={14} /> Export CSV
        </a>
      </div>

      {/* Statement header card */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-6 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div>
            <p className="text-xs font-bold uppercase text-avenue-text-muted">Scheme</p>
            <p className="text-lg font-bold text-avenue-text-heading mt-0.5">{group.name}</p>
            <p className="text-xs text-avenue-text-muted mt-0.5">{group.members.length} active insured members</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-bold uppercase text-avenue-text-muted">Period</p>
            <p className="font-semibold text-avenue-text-heading mt-0.5">
              {new Date(acc.periodStartDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })} –
            </p>
            <p className="font-semibold text-avenue-text-heading">
              {new Date(acc.periodEndDate).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Summary reconciliation */}
        <div className="border-t border-[#EEEEEE] pt-4 space-y-2">
          {[
            { label: "Opening Balance",          value: openingBal, sign: "",  bold: false },
            { label: "Total Deposits & Top-ups", value: totalIn,    sign: "+", bold: false, color: "text-[#28A745]" },
            { label: "Total Claims Deducted",    value: Number(acc.totalClaims),sign: "−", bold: false, color: "text-[#DC3545]" },
            { label: "Admin Fees Charged",       value: Number(acc.totalAdminFees), sign: "−", bold: false, color: "text-[#DC3545]" },
            { label: "Closing Balance",          value: closingBal, sign: "",  bold: true  },
          ].map(r => (
            <div key={r.label} className={`flex justify-between text-sm ${r.bold ? "font-bold border-t border-[#EEEEEE] pt-2 mt-2" : ""}`}>
              <span className={r.bold ? "text-avenue-text-heading" : "text-avenue-text-body"}>{r.label}</span>
              <span className={`font-mono ${r.color ?? (r.bold ? "text-avenue-text-heading" : "text-avenue-text-body")}`}>
                {r.sign}KES {r.value.toLocaleString("en-KE")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Claims by category */}
      {catBreakdown.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <h3 className="font-bold text-avenue-text-heading text-sm mb-4">Claims Breakdown by Category</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                <th className="pb-2 text-left">Benefit Category</th>
                <th className="pb-2 text-right">Amount (KES)</th>
                <th className="pb-2 text-right">% of Claims</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {catBreakdown.map(([cat, amt]) => (
                <tr key={cat} className="hover:bg-[#F8F9FA]">
                  <td className="py-2.5 font-semibold text-avenue-text-heading">{cat.replace(/_/g, " ")}</td>
                  <td className="py-2.5 text-right font-mono text-[#DC3545] font-semibold">{amt.toLocaleString("en-KE")}</td>
                  <td className="py-2.5 text-right text-avenue-text-muted">
                    {Number(acc.totalClaims) > 0 ? ((amt / Number(acc.totalClaims)) * 100).toFixed(1) : "0"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full transaction ledger */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#EEEEEE]">
          <h3 className="font-bold text-avenue-text-heading text-sm">Full Transaction Ledger</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-left">Reference</th>
              <th className="px-4 py-2 text-right">Amount (KES)</th>
              <th className="px-4 py-2 text-right">Balance (KES)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {txns.map(t => (
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
            {txns.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-avenue-text-muted text-sm">No transactions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
