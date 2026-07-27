import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Banknote, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { ProviderRemittanceService, isProviderRemittanceError } from "@/server/services/provider-remittance/service";
import type { RemittanceClaim } from "@/server/services/provider-remittance/projection";

/**
 * PNOS F6.4 — provider settlement detail (§8.9 remittance advice).
 *
 * The FIRST provider-facing remittance surface. It renders ONLY the provider-safe
 * read model from ProviderRemittanceService.getBatchRemittance (no admin/GL/
 * internal/bank fields exist on that shape, F6.2/F6.3), and it is gated behind the
 * `providerRemittanceV2` flag (§11.1) — OFF until the F6.1 §12 finance sign-off, so
 * the route 404s for a provider until the tenant/provider is switched on.
 *
 * Authorization authority is the service itself (strict provider.settlement.read +
 * provider scope, non-enumerating). Stop (F6.4): no export, no payment-query submit.
 */
export default async function ProviderSettlementDetail({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await ProviderAccessService.resolveUserContext();

  // Gate: the provider-facing surface is live only after the finance sign-off.
  if (!(await ProviderAccessSettingsService.isRemittanceV2Enabled(ctx.tenantId, ctx.providerId))) notFound();

  const { id } = await params;
  let remittance;
  try {
    // The service is the single authority: strict provider.settlement.read + provider
    // scope, non-enumerating. pageSize renders every claim of a realistic batch.
    remittance = await ProviderRemittanceService.getBatchRemittance(ctx, id, { pageSize: 1000 });
  } catch (e) {
    if (isProviderAccessError(e) && e.code === "FORBIDDEN_PERMISSION") redirect("/unauthorized");
    if (isProviderRemittanceError(e)) notFound(); // absent OR another provider's — identical 404
    throw e;
  }

  const { batch, claims, conservation, page } = remittance;
  const fmt = (amount: string) =>
    `${batch.currency} ${Number(amount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (v: Date | string | null) =>
    v ? new Date(v).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const cycle = `${MONTHS[batch.cycleMonth] ?? batch.cycleMonth} ${batch.cycleYear}${batch.sequence > 1 ? ` · Run ${batch.sequence}` : ""}`;
  const claimsCapped = claims.length < page.totalClaims;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/provider/settlements" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to settlements">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <Banknote size={22} /> Remittance — {cycle}
          </h1>
          <p className="text-sm text-brand-text-muted mt-0.5">
            Status: <span className="font-semibold">{batch.status.replace(/_/g, " ")}</span>
            {batch.settledAt ? ` · settled ${fmtDate(batch.settledAt)}` : ""}
          </p>
        </div>
      </div>

      {/* Summary: total / voucher / payment facts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Total payable</p>
          <p className="text-lg font-bold text-brand-indigo mt-0.5">{fmt(batch.totalAmount)}</p>
          <p className="text-xs text-brand-text-muted">{batch.claimCount} claim(s)</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <p className="text-[11px] font-bold uppercase text-brand-text-muted flex items-center gap-1"><FileText size={12} /> Payment voucher</p>
          {batch.voucher ? (
            <>
              <p className="font-mono font-semibold text-brand-text-heading mt-0.5">{batch.voucher.voucherNumber}</p>
              <p className="text-xs text-brand-text-muted">{fmt(batch.voucher.totalAmount)} · {batch.voucher.status}{batch.voucher.processedAt ? ` · ${fmtDate(batch.voucher.processedAt)}` : ""}</p>
            </>
          ) : (
            <p className="text-sm text-brand-text-muted mt-0.5">Issued when the batch is paid.</p>
          )}
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <p className="text-[11px] font-bold uppercase text-brand-text-muted">Payment facts</p>
          {/* D-7 / D16: actual disbursement facts do not exist yet — say so honestly. */}
          <p className="text-sm text-brand-text-muted mt-0.5">{batch.paymentFactsNote}</p>
        </div>
      </div>

      {/* Conservation (support state) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-brand-text-muted" role="status">
        <span className="font-bold uppercase">Conservation</span>
        <span>lines {fmt(conservation.sumLinePayable)}</span>
        <span aria-hidden>=</span>
        <span>claims {fmt(conservation.sumClaimPayable)}</span>
        <span aria-hidden>=</span>
        <span>batch {fmt(conservation.batchTotal)}</span>
        {conservation.voucherTotal && (<><span aria-hidden>=</span><span>voucher {fmt(conservation.voucherTotal)}</span></>)}
        {conservation.i5Holds ? (
          <span className="text-[#28A745] font-semibold flex items-center gap-1"><CheckCircle2 size={12} /> balances</span>
        ) : (
          <span className="text-[#DC3545] font-semibold flex items-center gap-1"><AlertTriangle size={12} /> under review</span>
        )}
      </div>

      {/* Per-claim remittance detail */}
      <div className="space-y-4">
        {claims.length === 0 ? (
          <div className="bg-white border border-[#EEEEEE] rounded-lg px-5 py-12 text-center text-brand-text-muted text-sm">No claims on this statement.</div>
        ) : (
          claims.map((c) => <ClaimBlock key={c.id} claim={c} fmt={fmt} fmtDate={fmtDate} />)
        )}
      </div>

      {claimsCapped && (
        <p className="text-[11px] text-brand-text-muted">Showing {claims.length} of {page.totalClaims} claims.</p>
      )}
    </div>
  );
}

function ClaimBlock({
  claim,
  fmt,
  fmtDate,
}: {
  claim: RemittanceClaim;
  fmt: (a: string) => string;
  fmtDate: (v: Date | string | null) => string;
}) {
  return (
    <section className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-[#EEEEEE]">
        <div className="min-w-0">
          <Link href={`/provider/claims/${claim.id}`} className="font-mono text-sm font-semibold text-brand-indigo hover:underline">
            {claim.claimNumber}
          </Link>
          <span className="text-xs text-brand-text-muted"> · {claim.member?.name}{claim.member?.memberNumber ? ` (${claim.member.memberNumber})` : ""} · {fmtDate(claim.dateOfService)}</span>
          {claim.lineage.isSupplemental && (
            <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand-indigo/10 text-brand-indigo">
              {claim.lineage.submissionType}
              {claim.lineage.chainRootClaimId && (
                <> · <Link href={`/provider/claims/${claim.lineage.chainRootClaimId}`} className="underline">original</Link></>
              )}
            </span>
          )}
        </div>
        <div className="text-right text-xs">
          <span className="text-brand-text-muted">Approved </span>
          <span className="font-mono font-semibold">{fmt(claim.approved)}</span>
          <span className="text-brand-text-muted"> · Paid </span>
          <span className="font-mono font-semibold">{fmt(claim.paid)}</span>
        </div>
      </div>

      {claim.declineReason && (
        <p className="px-5 py-2 text-xs text-[#856404] bg-[#FFF3CD] border-b border-[#EEEEEE]">
          {claim.declineReason.text}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left min-w-[46rem]">
          <caption className="sr-only">Line items for claim {claim.claimNumber}</caption>
          <thead>
            <tr className="bg-[#F8F9FA] text-[#6C757D] text-[11px] font-semibold border-b border-[#EEEEEE]">
              <th scope="col" className="px-4 py-2">Service</th>
              <th scope="col" className="px-4 py-2 text-right">Billed</th>
              <th scope="col" className="px-4 py-2 text-right">Allowed</th>
              <th scope="col" className="px-4 py-2 text-right">Disallowed</th>
              <th scope="col" className="px-4 py-2 text-right">Member</th>
              <th scope="col" className="px-4 py-2 text-right">Write-off</th>
              <th scope="col" className="px-4 py-2 text-right">Approved</th>
              <th scope="col" className="px-4 py-2 text-right">Paid</th>
              <th scope="col" className="px-4 py-2">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F4F4F4]">
            {claim.lines.map((l) => (
              <tr key={l.id}>
                <th scope="row" className="px-4 py-2 font-normal text-brand-text-heading">
                  {l.description}
                  {l.cptCode ? <span className="text-brand-text-muted text-xs"> · {l.cptCode}</span> : null}
                </th>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(l.billed)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{l.contractedAllowed == null ? "—" : fmt(l.contractedAllowed)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(l.disallowed)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(l.memberShare)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{fmt(l.providerWriteoff)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{fmt(l.approvedPayable)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs font-semibold">{fmt(l.paid)}</td>
                <td className="px-4 py-2 text-xs text-brand-text-muted">
                  {l.reason ? <span title={l.reason.remedy ?? undefined}>{l.reason.text}</span> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!claim.linesReconciled && (
        <p className="px-5 py-2 text-[11px] text-brand-text-muted border-t border-[#EEEEEE]">
          Line totals differ from the claim total by {fmt(claim.lineResidual)}; the claim total ({fmt(claim.approved)}) is the settled amount.
        </p>
      )}
    </section>
  );
}
