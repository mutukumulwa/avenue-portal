import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Landmark } from "lucide-react";
import { PrintButton } from "../PrintButton";

/**
 * PR-029: settlement batch detail — the provider statement / remittance
 * advice. Shows the batch header, every claim it pays, and (once SETTLED)
 * the payment voucher and journal entry it posted. Printable.
 */
export default async function SettlementBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.FINANCE);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const batch = await prisma.providerSettlementBatch.findFirst({
    where: { id, tenantId },
    include: { provider: { select: { name: true, type: true, email: true, phone: true, address: true } } },
  });
  if (!batch) notFound();

  const claims = await prisma.claim.findMany({
    where: { tenantId, settlementBatchId: id },
    select: {
      id: true, claimNumber: true, dateOfService: true, billedAmount: true,
      approvedAmount: true, status: true, currency: true, paidAt: true,
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
    },
    orderBy: { claimNumber: "asc" },
  });

  const voucher = await prisma.paymentVoucher.findFirst({
    where: { settlementBatchId: id },
    orderBy: { createdAt: "desc" },
  });
  const journal = voucher?.journalEntryId
    ? await prisma.journalEntry.findUnique({
        where: { id: voucher.journalEntryId },
        select: { entryNumber: true, entryDate: true, description: true },
      })
    : null;

  const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString("en-UG")}`;
  const cycle = new Date(batch.cycleYear, batch.cycleMonth - 1).toLocaleString("en-UG", { month: "long", year: "numeric" })
    + (batch.sequence > 1 ? ` · Run ${batch.sequence}` : "");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Link href="/settlement" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-brand-text-heading font-heading">
              Settlement — {batch.provider.name} · {cycle}
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
          <p className="font-semibold text-brand-text-heading">{batch.provider.name}</p>
          <p className="text-xs text-brand-text-muted">{batch.provider.address ?? ""}</p>
          <p className="text-xs text-brand-text-muted">{batch.provider.email ?? ""} {batch.provider.phone ? `· ${batch.provider.phone}` : ""}</p>
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
          {voucher ? (
            <div className="space-y-1 text-sm">
              <p className="font-mono font-semibold text-brand-indigo">{voucher.voucherNumber}</p>
              <p className="text-brand-text-muted text-xs">
                {fmt(Number(voucher.totalAmount))} · {voucher.claimCount} claim(s) · {voucher.status}
              </p>
              <p className="text-brand-text-muted text-xs">
                Issued {new Date(voucher.createdAt).toLocaleString("en-UG")}
              </p>
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
          {journal ? (
            <div className="space-y-1 text-sm">
              <p className="font-mono font-semibold text-brand-indigo">{journal.entryNumber}</p>
              <p className="text-brand-text-muted text-xs">{journal.description}</p>
              <p className="text-brand-text-muted text-xs">
                Posted {new Date(journal.entryDate).toLocaleDateString("en-UG")} ·{" "}
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
                  {c.member.firstName} {c.member.lastName}
                  <span className="text-brand-text-muted text-xs"> · {c.member.memberNumber}</span>
                </td>
                <td className="px-5 py-2.5 text-brand-text-muted text-xs">
                  {new Date(c.dateOfService).toLocaleDateString("en-UG")}
                </td>
                <td className="px-5 py-2.5 text-right font-mono text-xs">{fmt(Number(c.billedAmount))}</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs font-semibold">{fmt(Number(c.approvedAmount))}</td>
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
                {fmt(Number(batch.totalAmount))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-[10px] text-brand-text-muted flex items-center gap-1">
        <CheckCircle2 size={11} />
        Maker-checker enforced: created by the maker, approved by a different checker, paid with voucher + balanced journal entry.
      </p>
    </div>
  );
}
