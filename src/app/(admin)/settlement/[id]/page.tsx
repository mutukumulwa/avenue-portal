import { requireRole, ROLES } from "@/lib/rbac";
import { ProviderRemittanceService } from "@/server/services/provider-remittance/service";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Landmark } from "lucide-react";
import { PrintButton } from "../PrintButton";

/**
 * PR-029 / F6.3: settlement batch detail — the provider statement / remittance
 * advice. Now consumes the canonical ProviderRemittanceService read model
 * (operator entry) instead of duplicating batch/claim/voucher selects and
 * arithmetic. The provider-safe model is shared with the provider view; the
 * admin extension (maker/checker, notes, provider contact, GL journal) is the
 * authorized operator-only overlay. Printable.
 */
export default async function SettlementBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.FINANCE);
  const { id } = await params;

  // One canonical read model; MAX_PAGE_SIZE renders every claim for any realistic
  // batch in a single statement (a larger batch shows an explicit "first N of M").
  const remittance = await ProviderRemittanceService.getBatchRemittanceForOperator(
    { tenantId: session.user.tenantId },
    id,
    { pageSize: 1000 },
  );
  if (!remittance) notFound();

  const { batch, claims, conservation, admin, page } = remittance;
  const fmt = (amount: string) =>
    `${batch.currency} ${Number(amount).toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const cycle = new Date(batch.cycleYear, batch.cycleMonth - 1).toLocaleString("en-UG", { month: "long", year: "numeric" })
    + (batch.sequence > 1 ? ` · Run ${batch.sequence}` : "");
  const claimsShown = claims.length < page.totalClaims;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/settlement" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-brand-text-heading font-heading">
              Settlement — {admin.provider.name} · {cycle}
            </h1>
            <p className="text-sm text-brand-text-muted mt-0.5">
              Provider statement / remittance advice
            </p>
          </div>
        </div>
        <PrintButton />
      </div>

      {/* Statement header */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase text-brand-text-muted">Provider</p>
          <p className="font-semibold text-brand-text-heading">{admin.provider.name}</p>
          <p className="text-xs text-brand-text-muted">{admin.provider.address ?? ""}</p>
          <p className="text-xs text-brand-text-muted">{admin.provider.email ?? ""} {admin.provider.phone ? `· ${admin.provider.phone}` : ""}</p>
        </div>
        <div className="text-right space-y-1">
          <p className="text-[10px] font-bold uppercase text-brand-text-muted">Settlement cycle</p>
          <p className="font-semibold text-brand-text-heading">{cycle}</p>
          <p className="text-xs text-brand-text-muted">
            Status: <span className="font-semibold">{batch.status.replace(/_/g, " ")}</span>
            {batch.settledAt ? ` · settled ${new Date(batch.settledAt).toLocaleDateString("en-UG")}` : ""}
          </p>
        </div>
      </div>

      {/* Voucher + GL cross-links */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5">
          <h2 className="font-semibold text-brand-text-heading text-sm flex items-center gap-2 mb-2">
            <FileText size={15} /> Payment Voucher
          </h2>
          {batch.voucher ? (
            <div className="space-y-1 text-sm">
              <p className="font-mono font-semibold text-brand-indigo">{batch.voucher.voucherNumber}</p>
              <p className="text-brand-text-muted text-xs">
                {fmt(batch.voucher.totalAmount)} · {batch.claimCount} claim(s) · {batch.voucher.status}
              </p>
              {batch.voucher.processedAt && (
                <p className="text-brand-text-muted text-xs">
                  Processed {new Date(batch.voucher.processedAt).toLocaleString("en-UG")}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-brand-text-muted">
              Issued when the batch is marked paid (Mark Paid creates the voucher and posts the journal entry in one transaction).
            </p>
          )}
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5">
          <h2 className="font-semibold text-brand-text-heading text-sm flex items-center gap-2 mb-2">
            <Landmark size={15} /> Journal Entry
          </h2>
          {admin.journalEntry ? (
            <div className="space-y-1 text-sm">
              <p className="font-mono font-semibold text-brand-indigo">{admin.journalEntry.entryNumber}</p>
              <p className="text-brand-text-muted text-xs">{admin.journalEntry.description}</p>
              <p className="text-brand-text-muted text-xs">
                Posted {new Date(admin.journalEntry.entryDate).toLocaleDateString("en-UG")} ·{" "}
                <Link href="/billing/gl/ledger" className="text-brand-indigo hover:underline print:no-underline">Account Ledger</Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-brand-text-muted">Posted at Mark Paid (Dr Claims Payable / Cr Bank).</p>
          )}
        </div>
      </div>

      {/* Claims paid by this batch */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
              <th className="px-5 py-3">Claim No.</th>
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Service Date</th>
              <th className="px-5 py-3 text-right">Billed</th>
              <th className="px-5 py-3 text-right">Approved / Paid</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEEEEE]">
            {claims.map((c) => (
              <tr key={c.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-2.5 font-mono text-xs font-semibold text-brand-indigo">
                  <Link href={`/claims/${c.id}`} className="hover:underline print:no-underline">{c.claimNumber}</Link>
                </td>
                <td className="px-5 py-2.5 text-brand-text-heading">
                  {c.member?.name}
                  {c.member?.memberNumber && <span className="text-brand-text-muted text-xs"> · {c.member.memberNumber}</span>}
                </td>
                <td className="px-5 py-2.5 text-brand-text-muted text-xs">
                  {c.dateOfService ? new Date(c.dateOfService).toLocaleDateString("en-UG") : "—"}
                </td>
                <td className="px-5 py-2.5 text-right font-mono text-xs">{fmt(c.billed)}</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs font-semibold">{fmt(c.approved)}</td>
                <td className="px-5 py-2.5">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-brand-indigo/10 text-brand-indigo">
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#F8F9FA] border-t border-[#EEEEEE]">
              <td colSpan={4} className="px-5 py-3 text-xs font-bold uppercase text-brand-text-muted">
                Total payable to provider
              </td>
              <td className="px-5 py-3 text-right font-mono font-bold text-brand-text-heading">
                {fmt(batch.totalAmount)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
        {claimsShown && (
          <p className="px-5 py-2 text-[11px] text-brand-text-muted border-t border-[#EEEEEE] print:hidden">
            Showing {claims.length} of {page.totalClaims} claims. Use the export for the full set.
          </p>
        )}
      </div>

      {/* Conservation (finance-only): line = claim = batch = voucher */}
      <div className="text-[11px] text-brand-text-muted flex flex-wrap items-center gap-x-3 gap-y-1 print:hidden">
        <span className="font-bold uppercase">Conservation</span>
        <span>lines {fmt(conservation.sumLinePayable)}</span>
        <span>= claims {fmt(conservation.sumClaimPayable)}</span>
        <span>= batch {fmt(conservation.batchTotal)}</span>
        {conservation.voucherTotal && <span>= voucher {fmt(conservation.voucherTotal)}</span>}
        <span className={conservation.i5Holds ? "text-[#28A745] font-semibold" : "text-[#DC3545] font-semibold"}>
          {conservation.i5Holds ? "✓ balances" : "⚠ review"}
        </span>
      </div>

      <p className="text-[10px] text-brand-text-muted flex items-center gap-1">
        <CheckCircle2 size={11} />
        Maker-checker enforced{admin.maker?.name ? ` — created by ${admin.maker.name}` : ""}{admin.checker?.name ? `, approved by ${admin.checker.name}` : ""}. Paid with voucher + balanced journal entry.
      </p>
    </div>
  );
}
