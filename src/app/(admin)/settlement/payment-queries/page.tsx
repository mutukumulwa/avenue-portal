import Link from "next/link";
import { ArrowLeft, MessageSquareWarning } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { ProviderPaymentQueryService } from "@/server/services/provider-payment-query/service";

/**
 * F6.11 — finance payment-query queue. Operator (FINANCE) view of every provider
 * payment query in the tenant, ordered active-first.
 */
const TONE: Record<string, string> = {
  OPEN: "bg-[#17A2B8]/10 text-[#17A2B8]",
  ACKNOWLEDGED: "bg-[#FFC107]/10 text-[#856404]",
  INFORMATION_REQUIRED: "bg-[#DC3545]/10 text-[#DC3545]",
  PROVIDER_RESPONDED: "bg-brand-indigo/10 text-brand-indigo",
  RESOLVED: "bg-[#28A745]/10 text-[#28A745]",
  REJECTED: "bg-[#6C757D]/10 text-[#6C757D]",
  WITHDRAWN: "bg-[#6C757D]/10 text-[#6C757D]",
  CLOSED: "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function FinancePaymentQueue() {
  const session = await requireRole(ROLES.FINANCE);
  const queries = await ProviderPaymentQueryService.listForFinance({ userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/settlement" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to settlements"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2"><MessageSquareWarning size={22} /> Payment queries</h1>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {queries.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">No payment queries.</div>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[46rem]">
              <caption className="sr-only">Provider payment queries</caption>
              <thead>
                <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                  <th scope="col" className="px-5 py-3">Category</th>
                  <th scope="col" className="px-5 py-3">Batch</th>
                  <th scope="col" className="px-5 py-3 text-right">Discrepancy</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3">Raised</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {queries.map((q) => (
                  <tr key={q.id} className="hover:bg-[#F8F9FA]">
                    <th scope="row" className="px-5 py-2.5 font-normal">
                      <Link href={`/settlement/payment-queries/${q.id}`} className="font-semibold text-brand-indigo hover:underline">{q.category.replace(/_/g, " ")}</Link>
                    </th>
                    <td className="px-5 py-2.5 font-mono text-xs"><Link href={`/settlement/${q.settlementBatchId}`} className="hover:underline">{q.settlementBatchId.slice(0, 8)}</Link></td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{q.discrepancyAmount != null ? `${q.discrepancyCurrency ?? ""} ${Number(q.discrepancyAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                    <td className="px-5 py-2.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${TONE[q.status] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{q.status.replace(/_/g, " ")}</span></td>
                    <td className="px-5 py-2.5 text-brand-text-muted text-xs">{new Date(q.createdAt).toLocaleDateString("en-UG")}</td>
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
