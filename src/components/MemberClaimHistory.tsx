import { prisma } from "@/lib/prisma";
import { History } from "lucide-react";

interface Props {
  memberId: string;
  /** How many recent claims to show — defaults to 5 */
  limit?: number;
}

const STATUS_COLOR: Record<string, string> = {
  APPROVED:           "text-[#28A745]",
  PARTIALLY_APPROVED: "text-[#856404]",
  PAID:               "text-[#28A745]",
  DECLINED:           "text-[#DC3545]",
  VOID:               "text-[#DC3545]",
  UNDER_REVIEW:       "text-[#17A2B8]",
  CAPTURED:           "text-[#17A2B8]",
  RECEIVED:           "text-[#6C757D]",
  INCURRED:           "text-[#6C757D]",
};

export async function MemberClaimHistory({ memberId, limit = 5 }: Props) {
  const [claims, usage] = await Promise.all([
    prisma.claim.findMany({
      where: { memberId },
      orderBy: { dateOfService: "desc" },
      take: limit,
      select: {
        id: true,
        claimNumber: true,
        dateOfService: true,
        billedAmount: true,
        approvedAmount: true,
        status: true,
        benefitCategory: true,
        isReimbursement: true,
        provider: { select: { name: true } },
      },
    }),
    prisma.benefitUsage.findMany({
      where: { memberId },
      select: {
        amountUsed: true,
        benefitConfig: { select: { category: true, annualSubLimit: true } },
      },
    }),
  ]);

  if (claims.length === 0 && usage.length === 0) return null;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEEEEE] flex items-center gap-2">
        <History size={15} className="text-avenue-indigo" />
        <h3 className="font-bold text-avenue-text-heading text-sm font-heading">Member Claim History</h3>
      </div>

      {/* Benefit utilisation summary */}
      {usage.length > 0 && (
        <div className="px-5 py-3 border-b border-[#EEEEEE] grid grid-cols-2 md:grid-cols-4 gap-3">
          {usage.map((u, i) => {
            const limit = Number(u.benefitConfig.annualSubLimit);
            const used  = Number(u.amountUsed);
            const pct   = limit ? Math.min(100, (used / limit) * 100) : 0;
            const barColor = pct >= 90 ? "bg-[#DC3545]" : pct >= 70 ? "bg-[#FFC107]" : "bg-[#28A745]";
            return (
              <div key={i} className="space-y-1">
                <p className="text-[10px] font-bold uppercase text-avenue-text-muted">{u.benefitConfig.category.replace(/_/g, " ")}</p>
                <p className="text-xs font-semibold text-avenue-text-heading">
                  KES {used.toLocaleString()} / {limit.toLocaleString()}
                </p>
                <div className="h-1.5 bg-[#EEEEEE] rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-avenue-text-muted">
                  KES {(limit - used).toLocaleString()} remaining
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent claims */}
      <div className="divide-y divide-[#EEEEEE]">
        {claims.map(c => (
          <div key={c.id} className="px-5 py-3 flex items-center justify-between text-sm">
            <div>
              <p className="font-mono text-[10px] text-avenue-text-muted">{c.claimNumber}</p>
              <p className="font-semibold text-avenue-text-heading mt-0.5">
                {c.provider.name}
                {c.isReimbursement && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase bg-[#17A2B8]/10 text-[#17A2B8] px-1.5 py-0.5 rounded">Reimbursement</span>
                )}
              </p>
              <p className="text-[11px] text-avenue-text-muted mt-0.5">
                {new Date(c.dateOfService).toLocaleDateString("en-KE")} · {c.benefitCategory.replace(/_/g, " ")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-bold text-avenue-text-heading font-mono">KES {Number(c.billedAmount).toLocaleString()}</p>
              {Number(c.approvedAmount) > 0 && (
                <p className="text-[11px] text-[#28A745]">Approved: KES {Number(c.approvedAmount).toLocaleString()}</p>
              )}
              <p className={`text-[10px] font-bold uppercase mt-0.5 ${STATUS_COLOR[c.status] ?? "text-avenue-text-muted"}`}>
                {c.status.replace(/_/g, " ")}
              </p>
            </div>
          </div>
        ))}
        {claims.length === 0 && (
          <p className="px-5 py-4 text-sm text-avenue-text-muted">No prior claims on record.</p>
        )}
      </div>
    </div>
  );
}
