import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Download } from "lucide-react";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderDocumentService } from "@/server/services/provider-document.service";
import { providerCanWithdraw } from "@/server/services/claim-withdrawal/policy";
import { listWithdrawalReasons } from "@/server/services/claim-withdrawal/catalog";
import { prisma } from "@/lib/prisma";
import { WithdrawClaimButton } from "./WithdrawClaimButton";

function money(n: number, ccy = "KES") {
  return `${ccy} ${Math.round(n).toLocaleString("en-UG")}`;
}

const LINE_TONE: Record<string, string> = {
  APPROVED: "bg-[#28A745]/10 text-[#28A745]",
  APPROVED_WITH_ADJUSTMENT: "bg-[#FFC107]/10 text-[#856404]",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
};

export default async function ProviderClaimDetail({ params }: { params: Promise<{ id: string }> }) {
  // F2.8: resolve the canonical access context so the documents section can be
  // authorized through ProviderDocumentService (never a direct fileUrl).
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  const tenantId = ctx.tenantId;
  const { id } = await params;

  const claim = await prisma.claim.findFirst({
    // Hard provider scope: a facility can only ever open its own claims.
    where: { id, tenantId, providerId: provider.id },
    select: {
      id: true, claimNumber: true, status: true, currency: true, benefitCategory: true, serviceType: true,
      billedAmount: true, approvedAmount: true, paidAmount: true, copayAmount: true,
      dateOfService: true, attendingDoctor: true, diagnoses: true,
      // F5.6: fields the withdrawal allowed-action predicate reads (server-computed).
      providerBranchId: true, decidedAt: true, paidAt: true, paymentVoucherId: true, settlementBatchId: true,
      member: { select: { firstName: true, lastName: true, memberNumber: true } },
      claimLines: {
        select: { id: true, lineNumber: true, description: true, cptCode: true, billedAmount: true, approvedAmount: true, disallowedAmount: true, adjudicationDecision: true, declineReason: true },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!claim) notFound();

  // F5.6: the server computes whether THIS actor may withdraw THIS claim (the exact
  // predicate the service enforces) — the client only ever consumes an allowed action.
  const canWithdraw = providerCanWithdraw(ctx, claim);

  const diagnoses = (claim.diagnoses as unknown as Array<{ code: string; description: string }>) ?? [];

  // F2.8 consumer: authorized document list. A caller without provider.claim.read
  // (e.g. a legacy user not yet migrated to the provider RBAC) simply gets no
  // documents section — exactly today's page, never a broken one.
  const documents = await ProviderDocumentService
    .listTargetDocuments(ctx, { targetType: "CLAIM", targetId: claim.id })
    .catch(() => null);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/claims" className="text-brand-text-muted hover:text-brand-text-heading"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Claim {claim.claimNumber}</h1>
          <p className="text-brand-text-muted text-sm">{claim.member.firstName} {claim.member.lastName} ({claim.member.memberNumber}) · {claim.benefitCategory.replace(/_/g, " ")} · {new Date(claim.dateOfService).toLocaleDateString("en-UG")}</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-brand-indigo/10 text-brand-indigo">{claim.status.replace(/_/g, " ")}</span>
          {canWithdraw && (
            <WithdrawClaimButton claimId={claim.id} claimNumber={claim.claimNumber} reasons={listWithdrawalReasons()} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Billed", value: money(Number(claim.billedAmount), claim.currency) },
          { label: "Approved", value: money(Number(claim.approvedAmount), claim.currency) },
          { label: "Paid", value: money(Number(claim.paidAmount), claim.currency) },
          { label: "Member copay", value: money(Number(claim.copayAmount), claim.currency) },
        ].map((k) => (
          <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4">
            <p className="text-[11px] font-bold uppercase text-brand-text-muted">{k.label}</p>
            <p className="text-lg font-bold text-brand-text-heading mt-1">{k.value}</p>
          </div>
        ))}
      </div>

      {diagnoses.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-4">
          <p className="text-[11px] font-bold uppercase text-brand-text-muted mb-2">Diagnoses</p>
          <div className="flex flex-wrap gap-2">
            {diagnoses.map((d) => (
              <span key={d.code} className="text-xs bg-[#E6E7E8] text-[#495057] rounded-full px-2.5 py-0.5">{d.code} — {d.description}</span>
            ))}
          </div>
        </div>
      )}

      {documents && documents.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[#EEEEEE]">
            <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2"><FileText size={16} /> Documents</h2>
          </div>
          <div className="divide-y divide-[#F4F4F4]">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-text-heading truncate">{d.fileName}</p>
                  <p className="text-xs text-brand-text-muted">
                    {d.category.replace(/_/g, " ")} · {new Date(d.createdAt).toLocaleDateString("en-UG")}
                  </p>
                </div>
                {d.usable && d.downloadHref ? (
                  <Link href={d.downloadHref} className="shrink-0 flex items-center gap-1 text-xs font-bold text-brand-indigo hover:text-brand-secondary">
                    <Download size={13} /> Download
                  </Link>
                ) : (
                  <span className="shrink-0 text-xs font-semibold text-brand-text-muted">{d.statusLabel}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white border border-[#EEEEEE] rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEEEEE]"><h2 className="font-bold text-brand-text-heading font-heading">Service lines</h2></div>
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-brand-text-muted">
            <tr className="border-b border-[#EEEEEE]">
              <th className="text-left px-5 py-2 font-bold">Service</th>
              <th className="text-right px-5 py-2 font-bold">Billed</th>
              <th className="text-right px-5 py-2 font-bold">Approved</th>
              <th className="text-right px-5 py-2 font-bold">Disallowed</th>
              <th className="text-left px-5 py-2 font-bold">Decision / reason</th>
            </tr>
          </thead>
          <tbody>
            {claim.claimLines.map((l) => (
              <tr key={l.id} className="border-b border-[#F4F4F4] last:border-0 align-top">
                <td className="px-5 py-2.5">{l.description}{l.cptCode ? <span className="text-brand-text-muted text-xs font-mono"> · {l.cptCode}</span> : ""}</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(l.billedAmount), claim.currency)}</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs">{money(Number(l.approvedAmount), claim.currency)}</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs">{Number(l.disallowedAmount) > 0 ? money(Number(l.disallowedAmount), claim.currency) : "—"}</td>
                <td className="px-5 py-2.5">
                  {l.adjudicationDecision ? (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${LINE_TONE[l.adjudicationDecision] ?? "bg-[#E6E7E8] text-[#6C757D]"}`}>{l.adjudicationDecision.replace(/_/g, " ")}</span>
                  ) : (
                    <span className="text-xs text-brand-text-muted">Pending review</span>
                  )}
                  {l.declineReason && <p className="text-xs text-[#DC3545] mt-1">{l.declineReason}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
