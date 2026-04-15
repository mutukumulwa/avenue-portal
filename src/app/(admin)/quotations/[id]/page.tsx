import { requireRole, ROLES } from "@/lib/rbac";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  ArrowLeft, Send, CheckCircle, XCircle, Clock,
  Building2, Calculator, FileText, TrendingUp, TrendingDown,
  Users, Calendar, BadgeCheck,
} from "lucide-react";
import {
  sendQuotationAction,
  acceptQuotationAction,
  declineQuotationAction,
  expireQuotationAction,
} from "./actions";

const STATUS_STYLE: Record<string, string> = {
  DRAFT:    "bg-[#6C757D]/10 text-[#6C757D]",
  SENT:     "bg-[#17A2B8]/10 text-[#17A2B8]",
  ACCEPTED: "bg-[#28A745]/10 text-[#28A745]",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED:  "bg-[#FFC107]/10 text-[#856404]",
};

const FLOW = ["DRAFT", "SENT", "ACCEPTED"];

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const { id } = await params;
  const q = await prisma.quotation.findUnique({
    where: { id, tenantId: session.user.tenantId },
    include: {
      group:  { select: { id: true, name: true, status: true } },
      broker: { select: { id: true, name: true } },
    },
  });
  if (!q) notFound();

  const isExpired = new Date(q.validUntil) < new Date() && q.status === "SENT";
  const status = isExpired ? "EXPIRED" : q.status;

  const finalPremium    = Number(q.finalPremium);
  const annualPremium   = Number(q.annualPremium);
  const ratePerMember   = Number(q.ratePerMember);
  const totalLives      = q.memberCount + q.dependentCount;

  const loadings  = (q.loadings  as Record<string, number> | null) ?? {};
  const discounts = (q.discounts as Record<string, number> | null) ?? {};
  const totalLoadingPct  = Object.values(loadings).reduce((s, v) => s + (v || 0), 0);
  const totalDiscountPct = Object.values(discounts).reduce((s, v) => s + (v || 0), 0);
  const loadingAmt  = annualPremium * totalLoadingPct  / 100;
  const discountAmt = annualPremium * totalDiscountPct / 100;

  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString("en-KE")}`;
  const canSend    = q.status === "DRAFT";
  const canAction  = q.status === "SENT";
  const canExpire  = q.status === "DRAFT" || q.status === "SENT";
  const canConvert = q.status === "ACCEPTED" && !q.groupId && !!q.packageId;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/quotations" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-avenue-text-heading font-heading">
                {q.group?.name ?? q.prospectName ?? "Unnamed Prospect"}
              </h1>
              <span className="font-mono text-xs bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded">
                {q.quoteNumber}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT}`}>
                {status}
              </span>
              {q.broker && (
                <span className="text-xs text-avenue-text-muted">via {q.broker.name}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canSend && (
            <form action={sendQuotationAction}>
              <input type="hidden" name="quotationId" value={q.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-[#17A2B8] hover:bg-[#138496] text-white transition-colors">
                <Send size={14} /> Send to Client
              </button>
            </form>
          )}
          {canAction && (
            <>
              <form action={declineQuotationAction}>
                <input type="hidden" name="quotationId" value={q.id} />
                <button type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border border-[#DC3545] text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors">
                  <XCircle size={14} /> Decline
                </button>
              </form>
              <form action={acceptQuotationAction}>
                <input type="hidden" name="quotationId" value={q.id} />
                <button type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-[#28A745] hover:bg-[#218838] text-white transition-colors">
                  <CheckCircle size={14} /> Accept & Convert
                </button>
              </form>
            </>
          )}
          {canConvert && (
            <form action={acceptQuotationAction}>
              <input type="hidden" name="quotationId" value={q.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-avenue-indigo hover:bg-avenue-secondary text-white transition-colors">
                <Building2 size={14} /> Create Group
              </button>
            </form>
          )}
          {canExpire && (
            <form action={expireQuotationAction}>
              <input type="hidden" name="quotationId" value={q.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border border-[#6C757D] text-[#6C757D] hover:bg-[#6C757D]/10 transition-colors">
                <Clock size={14} /> Mark Expired
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Accepted + group created banner */}
      {q.status === "ACCEPTED" && q.group && (
        <div className="bg-[#28A745]/10 border border-[#28A745]/30 rounded-[8px] p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BadgeCheck size={20} className="text-[#28A745]" />
            <div>
              <p className="font-bold text-[#28A745] text-sm">Quotation Accepted</p>
              <p className="text-xs text-avenue-text-muted">Group created and ready for member onboarding.</p>
            </div>
          </div>
          <Link href={`/groups/${q.group.id}`}
            className="text-sm font-bold text-[#28A745] hover:underline flex items-center gap-1">
            View Group →
          </Link>
        </div>
      )}

      {/* Declined banner */}
      {q.status === "DECLINED" && (
        <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-[8px] p-4 flex items-center gap-3">
          <XCircle size={20} className="text-[#DC3545]" />
          <div>
            <p className="font-bold text-[#DC3545] text-sm">Quotation Declined</p>
            <p className="text-xs text-avenue-text-muted">The prospect did not proceed with this quotation.</p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Final Annual Premium", value: fmt(finalPremium), color: "text-avenue-indigo", icon: <Calculator size={16} className="text-avenue-indigo" /> },
          { label: "Rate per Member", value: fmt(ratePerMember), color: "text-[#28A745]", icon: <Users size={16} className="text-[#28A745]" /> },
          { label: "Total Lives Covered", value: totalLives.toLocaleString(), color: "text-[#17A2B8]", icon: <Users size={16} className="text-[#17A2B8]" /> },
          { label: "Valid Until", value: new Date(q.validUntil).toLocaleDateString("en-KE"), color: new Date(q.validUntil) < new Date() ? "text-[#DC3545]" : "text-[#856404]", icon: <Calendar size={16} /> },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-[8px] p-4 shadow-sm">
            <div className="flex justify-between items-center mb-1">
              <p className="text-xs text-avenue-text-muted font-bold uppercase">{s.label}</p>
              {s.icon}
            </div>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Client / Prospect info */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 flex items-center gap-2">
            <Building2 size={16} className="text-avenue-indigo" />
            {q.group ? "Group Details" : "Prospect Details"}
          </h2>
          {q.group ? (
            <>
              {[
                { label: "Group", value: <Link href={`/groups/${q.group.id}`} className="text-avenue-indigo hover:underline font-semibold">{q.group.name}</Link> },
                { label: "Group Status", value: q.group.status },
                { label: "Type", value: "Renewal" },
              ].map(f => (
                <div key={f.label} className="flex justify-between text-sm py-1 border-b border-[#EEEEEE]/60 last:border-0">
                  <span className="text-avenue-text-muted">{f.label}</span>
                  <span className="font-semibold text-avenue-text-heading">{f.value}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              {[
                { label: "Prospect Name", value: q.prospectName ?? "—" },
                { label: "Industry", value: q.prospectIndustry ?? "—" },
                { label: "Contact Email", value: q.prospectEmail ?? "—" },
                { label: "Contact Person", value: q.prospectContact ?? "—" },
                { label: "Type", value: "New Prospect" },
              ].map(f => (
                <div key={f.label} className="flex justify-between text-sm py-1 border-b border-[#EEEEEE]/60 last:border-0">
                  <span className="text-avenue-text-muted">{f.label}</span>
                  <span className="font-semibold text-avenue-text-heading">{f.value}</span>
                </div>
              ))}
            </>
          )}
          {q.broker && (
            <div className="flex justify-between text-sm py-1 border-t border-[#EEEEEE]">
              <span className="text-avenue-text-muted">Broker</span>
              <Link href={`/brokers/${q.broker.id}`} className="text-avenue-indigo hover:underline font-semibold">
                {q.broker.name}
              </Link>
            </div>
          )}
          <div className="flex justify-between text-sm py-1">
            <span className="text-avenue-text-muted">Principal Members</span>
            <span className="font-semibold text-avenue-text-heading">{q.memberCount}</span>
          </div>
          <div className="flex justify-between text-sm py-1">
            <span className="text-avenue-text-muted">Dependents</span>
            <span className="font-semibold text-avenue-text-heading">{q.dependentCount}</span>
          </div>
        </div>

        {/* Pricing breakdown */}
        <div className="rounded-[8px] p-5 shadow-sm space-y-4 relative overflow-hidden text-white"
          style={{ backgroundColor: "#292A83" }}>
          <div className="absolute opacity-10 right-[-20px] top-[-20px]">
            <Calculator size={120} />
          </div>
          <h2 className="font-bold font-heading relative z-10">Pricing Breakdown</h2>

          <div className="space-y-2 relative z-10 text-sm">
            <div className="flex justify-between">
              <span className="text-white/70">Base Annual Premium</span>
              <span className="font-semibold">{fmt(annualPremium)}</span>
            </div>
            {totalLoadingPct > 0 && (
              <div className="flex justify-between text-orange-300">
                <span className="flex items-center gap-1"><TrendingUp size={13} /> Loadings (+{totalLoadingPct}%)</span>
                <span>+ {fmt(loadingAmt)}</span>
              </div>
            )}
            {Object.entries(loadings).filter(([,v]) => v > 0).map(([k, v]) => (
              <div key={k} className="flex justify-between pl-4 text-xs text-white/60">
                <span>{k.replace(/([A-Z])/g, " $1").trim()}</span>
                <span>{v}%</span>
              </div>
            ))}
            {totalDiscountPct > 0 && (
              <div className="flex justify-between text-green-300">
                <span className="flex items-center gap-1"><TrendingDown size={13} /> Discounts (−{totalDiscountPct}%)</span>
                <span>− {fmt(discountAmt)}</span>
              </div>
            )}
            {Object.entries(discounts).filter(([,v]) => v > 0).map(([k, v]) => (
              <div key={k} className="flex justify-between pl-4 text-xs text-white/60">
                <span>{k.replace(/([A-Z])/g, " $1").trim()}</span>
                <span>{v}%</span>
              </div>
            ))}
            <div className="border-t border-white/20 pt-2 flex justify-between font-bold text-base">
              <span>Final Premium</span>
              <span className="text-[#F5C6B6]">{fmt(finalPremium)}</span>
            </div>
            <div className="flex justify-between text-xs text-white/60">
              <span>Per member / year</span>
              <span>{fmt(ratePerMember)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status flow */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
        <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">
          Status Timeline
        </h2>
        <div className="flex items-center gap-0">
          {FLOW.map((s, i) => {
            const flowStatuses = ["DRAFT","SENT","ACCEPTED"];
            const currentIdx = flowStatuses.indexOf(q.status === "DECLINED" || q.status === "EXPIRED" ? "SENT" : q.status);
            const isDone = i < currentIdx || (i === currentIdx && ["ACCEPTED"].includes(q.status));
            const isActive = i === currentIdx && !["ACCEPTED"].includes(q.status);
            const isFinal = q.status === "DECLINED" && s === "SENT";
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    isDone ? "bg-[#28A745] text-white" :
                    isActive ? "bg-avenue-indigo text-white" :
                    isFinal ? "bg-[#DC3545] text-white" :
                    "bg-[#E6E7E8] text-[#6C757D]"
                  }`}>
                    {isDone ? "✓" : i + 1}
                  </div>
                  <span className="text-xs font-semibold mt-1 text-avenue-text-muted">{s}</span>
                </div>
                {i < FLOW.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${isDone ? "bg-[#28A745]" : "bg-[#EEEEEE]"}`} />
                )}
              </div>
            );
          })}
          {(q.status === "DECLINED" || q.status === "EXPIRED") && (
            <div className="flex items-center flex-1">
              <div className="h-px flex-1 mx-2 bg-[#EEEEEE]" />
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  q.status === "DECLINED" ? "bg-[#DC3545] text-white" : "bg-[#856404] text-white"
                }`}>
                  ✕
                </div>
                <span className="text-xs font-semibold mt-1 text-avenue-text-muted">{q.status}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      {q.pricingNotes && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm">
          <h2 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-3 flex items-center gap-2">
            <FileText size={15} className="text-avenue-indigo" /> Pricing Notes
          </h2>
          <p className="text-sm text-avenue-text-body whitespace-pre-line">{q.pricingNotes}</p>
        </div>
      )}
    </div>
  );
}
