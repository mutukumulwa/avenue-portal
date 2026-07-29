import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole, ROLES } from "@/lib/rbac";
import { ProviderPaymentQueryService } from "@/server/services/provider-payment-query/service";
import { FinanceQueryActions } from "./FinanceQueryActions";

/**
 * F6.11 — finance payment-query detail. Full operator view (incl. INTERNAL messages
 * + the internal resolution note) and the legal lifecycle actions. Never changes a
 * claim decision (D17) — a decision dispute is an explicit reconsideration (F6.12).
 */
export default async function FinancePaymentQueryDetail({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.FINANCE);
  const { id } = await params;
  const q = await ProviderPaymentQueryService.getForFinance({ userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string }, id);
  if (!q) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/settlement/payment-queries" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to queue"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">{q.category.replace(/_/g, " ")}</h1>
          <p className="text-sm text-brand-text-muted mt-0.5">
            Settlement <Link href={`/settlement/${q.settlementBatchId}`} className="font-mono text-brand-indigo hover:underline">{q.settlementBatchId.slice(0, 8)}</Link>
            {q.claimId ? ` · claim ${q.claimId.slice(0, 8)}` : ""} · <span className="font-semibold">{q.status.replace(/_/g, " ")}</span>
          </p>
        </div>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-1 text-sm">
        <p><span className="text-brand-text-muted">Provider narrative:</span> {q.providerNarrative}</p>
        {q.discrepancyAmount != null && <p><span className="text-brand-text-muted">Discrepancy:</span> <span className="font-mono">{q.discrepancyCurrency} {Number(q.discrepancyAmount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>}
        {q.resolutionExplanation && <p><span className="text-brand-text-muted">Resolution:</span> {q.resolutionCode ? `[${q.resolutionCode}] ` : ""}{q.resolutionExplanation}</p>}
        {q.resolutionInternalNote && <p className="text-[#856404]"><span className="text-brand-text-muted">Internal note:</span> {q.resolutionInternalNote}</p>}
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5">
        <h2 className="text-sm font-bold text-brand-text-heading mb-3">Conversation</h2>
        <ol className="space-y-3">
          {q.messages.map((m) => (
            <li key={m.id} className="text-sm">
              <span className="text-[10px] font-bold uppercase text-brand-text-muted">
                {m.eventType.replace(/_/g, " ")} · {new Date(m.createdAt).toLocaleString("en-UG")}
                {m.audience === "INTERNAL" ? <span className="ml-1 text-[#856404]">· internal</span> : null}
              </span>
              {m.body && <p className="text-brand-text-heading mt-0.5">{m.body}</p>}
            </li>
          ))}
        </ol>
      </div>

      <FinanceQueryActions id={q.id} status={q.status} version={q.version} />
    </div>
  );
}
