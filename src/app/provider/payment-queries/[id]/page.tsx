import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderPaymentQueryService } from "@/server/services/provider-payment-query/service";
import { PROVIDER_WITHDRAWABLE } from "@/server/services/provider-payment-query/policy";
import { ProviderQueryActions } from "./ProviderQueryActions";

/**
 * F6.11 — provider payment-query detail. Shows the immutable facts (batch/claim),
 * the SHARED collaboration timeline (internal messages never reach here), the
 * status/resolution, and the permitted provider actions.
 */
export default async function ProviderPaymentQueryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!(await ProviderAccessSettingsService.isRemittanceV2Enabled(ctx.tenantId, ctx.providerId))) notFound();
  const { id } = await params;
  const view = await ProviderPaymentQueryService.getForProvider(ctx, id);
  if (!view) notFound();
  const { query, version, timeline } = view;
  const canRespond = query.status === "INFORMATION_REQUIRED";
  const canWithdraw = PROVIDER_WITHDRAWABLE.includes(query.status);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/payment-queries" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to payment queries">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{query.category.replace(/_/g, " ")}</h1>
          <p className="text-sm text-brand-text-muted mt-0.5">
            Settlement <Link href={`/provider/settlements/${query.settlementBatchId}`} className="font-mono text-brand-indigo hover:underline">{query.settlementBatchId.slice(0, 8)}</Link>
            {query.claimId ? ` · claim ${query.claimId.slice(0, 8)}` : ""} · <span className="font-semibold">{query.status.replace(/_/g, " ")}</span>
          </p>
        </div>
      </div>

      {query.discrepancyAmount && (
        <p className="text-sm text-brand-text-muted">Discrepancy: <span className="font-mono">{query.discrepancyCurrency} {Number(query.discrepancyAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
      )}

      {(query.resolutionExplanation || query.resolutionCode) && (
        <div className="bg-[#F0F0F8] border border-[#EEEEEE] rounded-lg p-4">
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Resolution{query.resolutionCode ? ` · ${query.resolutionCode}` : ""}</p>
          <p className="text-sm text-brand-text-heading mt-1">{query.resolutionExplanation}</p>
        </div>
      )}

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
        <h2 className="text-sm font-bold text-brand-text-heading mb-3">Conversation</h2>
        <ol className="space-y-3">
          {timeline.map((m, i) => (
            <li key={i} className="text-sm">
              <span className="text-[10px] font-bold uppercase text-brand-text-muted">{m.eventType.replace(/_/g, " ")} · {new Date(m.at).toLocaleString("en-UG")}</span>
              {m.body && <p className="text-brand-text-heading mt-0.5">{m.body}</p>}
            </li>
          ))}
        </ol>
      </div>

      <ProviderQueryActions id={query.id} version={version} canRespond={canRespond} canWithdraw={canWithdraw} />
    </div>
  );
}
