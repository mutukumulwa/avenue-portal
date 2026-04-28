import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  APPROVED:           "bg-[#28A745]/10 text-[#28A745]",
  PARTIALLY_APPROVED: "bg-[#FFC107]/10 text-[#856404]",
  PAID:               "bg-[#28A745]/10 text-[#28A745]",
  RECEIVED:           "bg-[#17A2B8]/10 text-[#17A2B8]",
  CAPTURED:           "bg-[#17A2B8]/10 text-[#17A2B8]",
  INCURRED:           "bg-[#6C757D]/10 text-[#6C757D]",
  UNDER_REVIEW:       "bg-[#17A2B8]/10 text-[#17A2B8]",
  DECLINED:           "bg-[#DC3545]/10 text-[#DC3545]",
};

export default async function FundClaimsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const session = await requireRole(ROLES.FUND);
  const { groupId } = await params;
  const tenantId = session.user.tenantId;

  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId, fundingMode: "SELF_FUNDED" },
    select: { name: true, selfFundedAccount: { select: { balance: true, totalClaims: true } } },
  });
  if (!group) notFound();

  const claims = await prisma.claim.findMany({
    where: { tenantId, member: { groupId } },
    select: {
      id: true, claimNumber: true, dateOfService: true, status: true,
      billedAmount: true, approvedAmount: true, paidAmount: true,
      benefitCategory: true, serviceType: true, isReimbursement: true,
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      provider: { select: { name: true } },
      fundTransactions: { select: { amount: true, postedAt: true } },
    },
    orderBy: { dateOfService: "desc" },
  });

  const totalApproved = claims.filter(c => ["APPROVED","PARTIALLY_APPROVED","PAID"].includes(c.status))
    .reduce((s, c) => s + Number(c.approvedAmount), 0);
  const totalPending  = claims.filter(c => ["RECEIVED","CAPTURED","UNDER_REVIEW","INCURRED"].includes(c.status))
    .reduce((s, c) => s + Number(c.billedAmount), 0);
  const declined      = claims.filter(c => c.status === "DECLINED").length;

  // Identify categories on hold
  const heldCats = (group.selfFundedAccount as { balance: unknown } & { heldCategories?: string[] } | null)
    ?.heldCategories ?? [] as string[];

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Link href={`/fund/${groupId}`} className="text-avenue-text-muted hover:text-avenue-indigo">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">Claims — {group.name}</h1>
          <p className="text-avenue-text-body text-sm mt-0.5">All claims submitted by members of this self-funded scheme.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Claims",         value: claims.length.toString(),             color: "text-avenue-indigo" },
          { label: "Paid from Fund (KES)", value: totalApproved.toLocaleString("en-KE"),color: "text-[#DC3545]"    },
          { label: "Pending (KES)",        value: totalPending.toLocaleString("en-KE"), color: "text-[#856404]"    },
          { label: "Declined",             value: declined.toString(),                  color: "text-[#6C757D]"    },
        ].map(k => (
          <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <p className="text-xs font-bold uppercase text-avenue-text-muted">{k.label}</p>
            <p className={`text-xl font-bold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Claims table */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#E6E7E8] text-[10px] font-bold uppercase text-[#6C757D] border-b border-[#EEEEEE]">
              <th className="px-4 py-3 text-left">Claim</th>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Provider</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-right">Billed (KES)</th>
              <th className="px-4 py-3 text-right">Approved (KES)</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Fund Deducted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE] text-avenue-text-body">
            {claims.map(c => {
              const isOnHold = heldCats.includes(c.benefitCategory);
              const fundDeducted = c.fundTransactions.length > 0;
              return (
                <tr key={c.id} className={`hover:bg-[#F8F9FA] ${isOnHold ? "bg-[#FFF8E1]" : ""}`}>
                  <td className="px-4 py-3">
                    <p className="font-mono text-xs text-avenue-indigo">{c.claimNumber}</p>
                    {c.isReimbursement && (
                      <span className="text-[10px] font-bold text-[#17A2B8] uppercase">Reimburse</span>
                    )}
                    {isOnHold && (
                      <span className="text-[10px] font-bold text-[#856404] uppercase block">⏸ Category on hold</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-avenue-text-heading">{c.member.firstName} {c.member.lastName}</p>
                    <p className="text-xs text-avenue-text-muted font-mono">{c.member.memberNumber}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">{c.provider.name}</td>
                  <td className="px-4 py-3 text-xs">{c.benefitCategory.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-xs text-avenue-text-muted">
                    {new Date(c.dateOfService).toLocaleDateString("en-KE")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {Number(c.billedAmount).toLocaleString("en-KE")}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-[#28A745]">
                    {Number(c.approvedAmount) > 0 ? Number(c.approvedAmount).toLocaleString("en-KE") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_COLOR[c.status] ?? "bg-[#6C757D]/10 text-[#6C757D]"}`}>
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {fundDeducted
                      ? <span className="text-[#28A745] font-bold">✓ KES {c.fundTransactions.reduce((s, t) => s + Number(t.amount), 0).toLocaleString("en-KE")}</span>
                      : <span className="text-avenue-text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
            {claims.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-avenue-text-muted">No claims for this scheme yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
