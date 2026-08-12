import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderPaymentQueryService } from "@/server/services/provider-payment-query/service";

/**
 * F6.11 — provider payment-query list. Gated behind providerRemittanceV2. Shows the
 * provider's own queries + their status; the detail carries the SHARED collaboration.
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

export default async function ProviderPaymentQueries() {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!(await ProviderAccessSettingsService.isRemittanceV2Enabled(ctx.tenantId, ctx.providerId))) notFound();
  const queries = await ProviderPaymentQueryService.listForProvider(ctx);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
        <MessageSquareWarning size={22} /> Payment queries
      </h1>

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        {queries.length === 0 ? (
          <div className="px-5 py-12 text-center text-brand-text-muted text-sm">
            No payment queries. Raise one from a settlement statement if a payment looks wrong.
          </div>
        ) : (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[40rem]">
              <caption className="sr-only">Your payment queries</caption>
              <thead>
                <tr className="text-[11px] uppercase text-brand-text-muted border-b border-[#EEEEEE]">
                  <th scope="col" className="text-left px-5 py-2 font-bold">Category</th>
                  <th scope="col" className="text-left px-5 py-2 font-bold">Batch</th>
                  <th scope="col" className="text-right px-5 py-2 font-bold">Discrepancy</th>
                  <th scope="col" className="text-left px-5 py-2 font-bold">Status</th>
                  <th scope="col" className="text-left px-5 py-2 font-bold">Raised</th>
                </tr>
              </thead>
              <tbody>
                {queries.map((q) => (
                  <tr key={q.id} className="border-b border-[#F4F4F4] last:border-0 hover:bg-[#F8F9FA]">
                    <td className="px-5 py-2.5 font-semibold">
                      <Link href={`/provider/payment-queries/${q.id}`} className="text-brand-indigo hover:underline">{q.category.replace(/_/g, " ")}</Link>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs">
                      <Link href={`/provider/settlements/${q.settlementBatchId}`} className="hover:underline">{q.settlementBatchId.slice(0, 8)}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs">{q.discrepancyAmount ? `${q.discrepancyCurrency ?? ""} ${Number(q.discrepancyAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
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
