import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PAYMENT_QUERY_PERMISSION } from "@/server/services/provider-payment-query/service";
import { RaiseQueryForm } from "./RaiseQueryForm";

/**
 * F6.11 — raise a payment query about a settlement. The batch is prefilled from
 * the query string and re-scoped to the provider here; the immutable facts are the
 * batch/claim references (the service re-validates them on submit).
 */
export default async function NewPaymentQuery({ searchParams }: { searchParams: Promise<{ batch?: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!(await ProviderAccessSettingsService.isRemittanceV2Enabled(ctx.tenantId, ctx.providerId))) notFound();
  if (!providerPermits(ctx.permissions, PAYMENT_QUERY_PERMISSION)) notFound();

  const { batch: batchId } = await searchParams;
  if (!batchId) notFound();
  const batch = await prisma.providerSettlementBatch.findFirst({ where: { id: batchId, tenantId: ctx.tenantId, providerId: ctx.providerId }, select: { id: true, currency: true } });
  if (!batch) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/provider/settlements/${batch.id}`} className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to statement">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Raise a payment query</h1>
          <p className="text-sm text-brand-text-muted mt-0.5">On settlement <span className="font-mono">{batch.id.slice(0, 8)}</span>. This does not change any claim decision.</p>
        </div>
      </div>
      <RaiseQueryForm settlementBatchId={batch.id} currency={batch.currency} />
    </div>
  );
}
