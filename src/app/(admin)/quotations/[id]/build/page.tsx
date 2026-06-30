import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft, Calculator, FileText, Send, RefreshCw } from "lucide-react";
import Link from "next/link";
import { buildQuoteAction, issueQuoteAction } from "./actions";

const LINE_TYPE_LABEL: Record<string, string> = {
  BASE_CONTRIBUTION:        "Base Contribution",
  LOADING_PER_LIFE:         "Loading",
  LOADING_SCHEME:           "Scheme Loading",
  DISCOUNT_GROUP_SIZE:      "Group Size Discount",
  DISCOUNT_LOYALTY:         "Loyalty Discount",
  DISCOUNT_CUSTOM:          "Custom Discount",
  STAMP_DUTY:               "Stamp Duty",
  TRAINING_LEVY:            "Training Levy",
  PHCF:                     "PHCF",
  CARD_ISSUANCE_FEE:        "Card Issuance Fee",
  SMART_CARD_FEE:           "Smart Card Fee",
  WELCOME_PACK_FEE:         "Welcome Pack Fee",
  CO_CONTRIBUTION_PROVISION:"Co-Contribution Provision",
  CUSTOM:                   "Other",
};

const LINE_TYPE_STYLE: Record<string, string> = {
  STAMP_DUTY:    "text-[#6C757D] text-xs",
  TRAINING_LEVY: "text-[#6C757D] text-xs",
  PHCF:          "text-[#6C757D] text-xs",
};

export default async function BuildQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const quotation = await prisma.quotation.findUnique({
    where: { id, tenantId },
    include: {
      lineItems: { orderBy: { displayOrder: "asc" } },
      versions:  { orderBy: { versionNumber: "desc" }, take: 5 },
      broker:    { select: { name: true } },
      lives:     { select: { id: true } },
    },
  });
  if (!quotation) notFound();

  const fmt = (n: number) =>
    `KES ${Math.round(n).toLocaleString("en-KE", { minimumFractionDigits: 0 })}`;

  const hasLineItems = quotation.lineItems.length > 0;
  const canIssue = quotation.status === "DRAFT" && hasLineItems;
  const totalContribution = Number(quotation.finalPremium ?? 0);

  // Separate line categories for display
  const baseLines     = quotation.lineItems.filter((l) => l.lineType === "BASE_CONTRIBUTION");
  const loadingLines  = quotation.lineItems.filter((l) => l.lineType.startsWith("LOADING"));
  const discountLines = quotation.lineItems.filter((l) => l.lineType.startsWith("DISCOUNT"));
  const taxLines      = quotation.lineItems.filter((l) => ["STAMP_DUTY","TRAINING_LEVY","PHCF"].includes(l.lineType));
  const feeLines      = quotation.lineItems.filter((l) => ["CARD_ISSUANCE_FEE","SMART_CARD_FEE","WELCOME_PACK_FEE"].includes(l.lineType));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/quotations/${id}`} className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-brand-text-heading font-heading">
              Quote Builder — {quotation.quoteNumber}
            </h1>
            <p className="text-sm text-brand-text-muted mt-0.5">
              {quotation.legalName ?? quotation.prospectName ?? "—"} ·{" "}
              {quotation.lives.length} lives · status: {quotation.status}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* PDF preview */}
          {hasLineItems && (
            <a href={`/api/quotations/${id}/pdf`} target="_blank" rel="noopener noreferrer"
              className="border border-brand-indigo text-brand-indigo px-4 py-2 rounded-full text-sm font-semibold hover:bg-brand-indigo hover:text-white transition-colors flex items-center gap-2">
              <FileText size={15} />
              Preview PDF
            </a>
          )}

          {/* Issue quote */}
          {canIssue && (
            <form action={issueQuoteAction}>
              <input type="hidden" name="quotationId" value={id} />
              <button type="submit"
                className="bg-brand-indigo hover:bg-brand-secondary text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors flex items-center gap-2 shadow-sm">
                <Send size={15} />
                Issue Quotation
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Build controls */}
        <div className="space-y-4">
          <form action={buildQuoteAction} className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
            <input type="hidden" name="quotationId" value={id} />
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-brand-text-heading text-sm">Pricing Parameters</h2>
              {hasLineItems && (
                <span className="text-[10px] font-bold uppercase text-[#28A745] bg-[#28A745]/10 px-2 py-0.5 rounded-full">
                  Built
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Group size discount (%)</label>
              <input name="groupSizeDiscountPct" type="number" min={0} max={50} step={0.5}
                placeholder="Auto-computed if blank"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
              <p className="text-[11px] text-brand-text-muted mt-0.5">&gt;100 lives = 5%, &gt;200 = 10%</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Loyalty discount (%)</label>
              <input name="loyaltyDiscountPct" type="number" min={0} max={20} step={0.5}
                placeholder="0"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Custom discount (%)</label>
              <input name="customDiscountPct" type="number" min={0} max={50} step={0.5}
                placeholder="0"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
              <input name="customDiscountDescription" type="text"
                placeholder="Reason for custom discount"
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm mt-1 focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
            </div>

            <div className="border-t border-[#EEEEEE] pt-3 space-y-2">
              <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide">Ancillary Fees</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-brand-text-muted mb-1">Card fee / life (KES)</label>
                  <input name="cardIssuanceFeePerLife" type="number" min={0} placeholder="0"
                    className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] text-brand-text-muted mb-1">Welcome pack / life (KES)</label>
                  <input name="welcomePackFeePerLife" type="number" min={0} placeholder="0"
                    className="w-full border border-[#EEEEEE] rounded-[6px] px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-brand-text-muted mb-1">Quote validity (days)</label>
              <input name="validityDays" type="number" min={1} max={180} defaultValue={30}
                className="w-full border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
            </div>

            <button type="submit"
              className="w-full flex items-center justify-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white py-2.5 rounded-[8px] text-sm font-semibold transition-colors">
              <RefreshCw size={15} />
              {hasLineItems ? "Rebuild Pricing" : "Build Pricing"}
            </button>
          </form>

          {/* Version history */}
          {quotation.versions.length > 0 && (
            <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5">
              <h2 className="font-semibold text-brand-text-heading text-sm mb-3">Version History</h2>
              <div className="space-y-2">
                {quotation.versions.map((v) => (
                  <div key={v.id} className="flex items-center justify-between text-xs">
                    <span className="text-brand-text-muted">v{v.versionNumber} — {v.status}</span>
                    <span className="text-brand-text-muted">
                      {v.issuedAt ? new Date(v.issuedAt).toLocaleDateString("en-KE") : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Line item breakdown */}
        <div className="col-span-2 space-y-4">
          {!hasLineItems ? (
            <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-12 text-center">
              <Calculator size={36} className="mx-auto mb-3 text-brand-text-muted opacity-30" />
              <p className="text-brand-text-muted text-sm">Fill in the pricing parameters on the left and click <strong>Build Pricing</strong> to generate the contribution schedule.</p>
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Total Contribution",   value: fmt(totalContribution),                               color: "text-brand-indigo" },
                  { label: "Per Life",              value: quotation.lives.length > 0 ? fmt(totalContribution / quotation.lives.length) : "—", color: "text-[#28A745]" },
                  { label: "Valid Until",           value: quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("en-KE") : "—", color: "text-[#856404]" },
                ].map((k) => (
                  <div key={k.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
                    <p className="text-[11px] text-brand-text-muted font-bold uppercase">{k.label}</p>
                    <p className={`text-xl font-bold mt-1 font-heading ${k.color}`}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* Full line-item table */}
              <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-[#E6E7E8] text-[#6C757D] text-xs font-semibold border-b border-[#EEEEEE]">
                      <th className="px-5 py-3">Description</th>
                      <th className="px-5 py-3 text-right">Amount (KES)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EEEEEE]">

                    {/* Base contributions */}
                    {baseLines.map((l) => (
                      <tr key={l.id} className="hover:bg-[#F8F9FA]">
                        <td className="px-5 py-3 text-brand-text-body">
                          {l.lifeName && <span className="text-[10px] font-mono text-brand-text-muted mr-2">{l.lifeName}</span>}
                          {LINE_TYPE_LABEL[l.lineType]}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-brand-text-heading">
                          {fmt(Number(l.netAmount))}
                        </td>
                      </tr>
                    ))}

                    {/* Loadings */}
                    {loadingLines.map((l) => (
                      <tr key={l.id} className="hover:bg-[#FFF8F5]">
                        <td className="px-5 py-3 text-[#C4500A]">
                          {l.lifeName && <span className="text-[10px] font-mono mr-2">{l.lifeName}</span>}
                          {l.description}
                        </td>
                        <td className="px-5 py-3 text-right font-semibold text-[#C4500A]">
                          +{fmt(Number(l.netAmount))}
                        </td>
                      </tr>
                    ))}

                    {/* Sub-total post-loadings */}
                    {loadingLines.length > 0 && (
                      <tr className="bg-[#f8f9ff] border-y border-brand-indigo/20">
                        <td className="px-5 py-2.5 font-semibold text-brand-indigo text-xs uppercase tracking-wide">Sub-total (post-loadings)</td>
                        <td className="px-5 py-2.5 text-right font-bold text-brand-indigo">
                          {fmt(baseLines.reduce((s, l) => s + Number(l.netAmount), 0) + loadingLines.reduce((s, l) => s + Number(l.netAmount), 0))}
                        </td>
                      </tr>
                    )}

                    {/* Discounts */}
                    {discountLines.map((l) => (
                      <tr key={l.id} className="hover:bg-[#F0FFF4]">
                        <td className="px-5 py-3 text-[#28A745]">{l.description}</td>
                        <td className="px-5 py-3 text-right font-semibold text-[#28A745]">
                          {fmt(Number(l.netAmount))}
                        </td>
                      </tr>
                    ))}

                    {/* Spacer row before taxes */}
                    <tr className="bg-[#F8F9FA]">
                      <td colSpan={2} className="px-5 py-1.5 text-[11px] font-bold uppercase text-brand-text-muted tracking-wide">
                        Statutory Levies (mandatory — displayed separately)
                      </td>
                    </tr>

                    {/* Taxes */}
                    {taxLines.map((l) => (
                      <tr key={l.id} className="hover:bg-[#F8F9FA]">
                        <td className={`px-5 py-3 ${LINE_TYPE_STYLE[l.lineType] ?? ""}`}>{l.description}</td>
                        <td className={`px-5 py-3 text-right ${LINE_TYPE_STYLE[l.lineType] ?? ""}`}>
                          {fmt(Number(l.netAmount))}
                        </td>
                      </tr>
                    ))}

                    {/* Ancillary fees */}
                    {feeLines.length > 0 && (
                      <tr className="bg-[#F8F9FA]">
                        <td colSpan={2} className="px-5 py-1.5 text-[11px] font-bold uppercase text-brand-text-muted tracking-wide">
                          Ancillary Charges
                        </td>
                      </tr>
                    )}
                    {feeLines.map((l) => (
                      <tr key={l.id} className="hover:bg-[#F8F9FA]">
                        <td className="px-5 py-3 text-brand-text-body">{l.description}</td>
                        <td className="px-5 py-3 text-right font-semibold text-brand-text-heading">
                          {fmt(Number(l.netAmount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Grand total */}
                  <tfoot>
                    <tr className="bg-brand-indigo text-white">
                      <td className="px-5 py-4 font-bold text-base font-heading">Total Annual Contribution</td>
                      <td className="px-5 py-4 text-right font-bold text-xl font-heading">
                        {fmt(totalContribution)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
