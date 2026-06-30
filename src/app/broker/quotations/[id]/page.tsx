import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { sendBrokerQuotationAction, withdrawBrokerQuotationAction } from "./actions";

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-[#6C757D]/10 text-[#6C757D]",
  SENT: "bg-[#17A2B8]/10 text-[#17A2B8]",
  ACCEPTED: "bg-[#28A745]/10 text-[#28A745]",
  DECLINED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#FFC107]/10 text-[#856404]",
  WITHDRAWN_BY_SUBMITTER: "bg-[#6C757D]/10 text-[#6C757D]",
};

export default async function BrokerQuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });
  if (!user?.brokerId) redirect("/broker/quotations");

  const { id } = await params;
  const quotation = await prisma.quotation.findFirst({
    where: { id, tenantId: session.user.tenantId, brokerId: user.brokerId },
    include: {
      group: { select: { id: true, name: true } },
    },
  });
  if (!quotation) notFound();

  const totalLives = quotation.memberCount + quotation.dependentCount;
  const canSend = quotation.status === "DRAFT";
  const canWithdraw = ["DRAFT", "SENT"].includes(quotation.status);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/broker/quotations" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold font-heading text-brand-text-heading">
            {quotation.prospectName ?? quotation.group?.name ?? "Quotation"}
          </h1>
          <p className="text-sm text-brand-text-muted mt-1">{quotation.quoteNumber}</p>
        </div>
        <span className={`px-3 py-1 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLE[quotation.status] ?? STATUS_STYLE.DRAFT}`}>
          {quotation.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-bold uppercase text-brand-text-muted">Prospect / Group</p>
            <p className="font-bold text-brand-text-heading mt-1">{quotation.group?.name ?? quotation.prospectName ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-text-muted">Contact Email</p>
            <p className="font-bold text-brand-text-heading mt-1">{quotation.prospectEmail ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-text-muted">Lives</p>
            <p className="font-bold text-brand-text-heading mt-1">
              {totalLives.toLocaleString("en-KE")} ({quotation.memberCount} principal, {quotation.dependentCount} dependant)
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-text-muted">Final Premium</p>
            <p className="font-bold text-brand-indigo mt-1">
              KES {Number(quotation.finalPremium ?? 0).toLocaleString("en-KE")}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-text-muted">Valid Until</p>
            <p className="font-bold text-brand-text-heading mt-1">
              {quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString("en-KE") : "-"}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-text-muted">Industry</p>
            <p className="font-bold text-brand-text-heading mt-1">{quotation.prospectIndustry ?? "-"}</p>
          </div>
        </div>

        {quotation.pricingNotes && (
          <div className="border-t border-[#EEEEEE] pt-4">
            <p className="text-xs font-bold uppercase text-brand-text-muted">Pricing Notes</p>
            <p className="text-sm text-brand-text-body whitespace-pre-line mt-1">{quotation.pricingNotes}</p>
          </div>
        )}
      </div>

      {(canSend || canWithdraw) && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 flex flex-wrap justify-end gap-3">
          {canWithdraw && (
            <form action={withdrawBrokerQuotationAction}>
              <input type="hidden" name="quotationId" value={quotation.id} />
              <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-[#DC3545] text-[#DC3545] text-sm font-bold hover:bg-[#DC3545]/10 transition-colors">
                <XCircle size={15} /> Withdraw
              </button>
            </form>
          )}
          {canSend && (
            <form action={sendBrokerQuotationAction}>
              <input type="hidden" name="quotationId" value={quotation.id} />
              <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-brand-indigo text-white text-sm font-bold hover:bg-brand-secondary transition-colors">
                <CheckCircle size={15} /> Mark Sent
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
