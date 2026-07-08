import { DocumentList } from "@/components/ui/DocumentList";
import { requireRole, ROLES } from "@/lib/rbac";
import { MemberAppService } from "@/server/services/member-app.service";
import { ArrowLeft, Building2, FileText, HeartPulse, Phone, ReceiptText, WalletCards } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatMoney(value: number) {
  if (value >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}M`;
  return `UGX ${Math.round(value).toLocaleString("en-UG")}`;
}

function formatDate(value: Date) {
  return new Date(value).toLocaleDateString("en-UG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized.includes("APPROVED") || normalized.includes("PAID")) return "bg-[#28A745]/10 text-[#28A745]";
  if (normalized.includes("REVIEW") || normalized.includes("RECEIVED") || normalized.includes("CAPTURED")) return "bg-[#17A2B8]/10 text-[#17A2B8]";
  if (normalized.includes("PARTIAL")) return "bg-[#FFC107]/15 text-[#856404]";
  if (normalized.includes("DECLINED") || normalized.includes("VOID")) return "bg-[#DC3545]/10 text-[#DC3545]";
  return "bg-[#6C757D]/10 text-[#6C757D]";
}

export default async function MemberEncounterDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER);
  const { claimId } = await params;
  const detail = await MemberAppService.getEncounterDetailForUser(session.user.id, session.user.tenantId, claimId);

  if (!detail) notFound();

  const memberShareOutstanding = Math.max(0, detail.amounts.memberShare - detail.amounts.memberShareCollected);

  return (
    <div className="space-y-6 font-ui">
      <div>
        <Link href="/member/utilization" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-indigo hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to care history
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Care Cost Detail</h1>
            <p className="mt-1 text-brand-text-muted">
              {detail.provider.name} · {detail.serviceType.replace(/_/g, " ")} · {formatDate(detail.dateOfService)}
            </p>
            <p className="mt-2 font-mono text-[13px] text-brand-text-muted">{detail.claimNumber}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-[13px] font-bold ${statusTone(detail.status)}`}>
            {detail.status}
          </span>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Provider bill", value: formatMoney(detail.amounts.billed), icon: ReceiptText, tone: "text-brand-indigo" },
          { label: "Plan approved", value: formatMoney(detail.amounts.planApproved), icon: HeartPulse, tone: "text-[#28A745]" },
          { label: "Plan paid", value: formatMoney(detail.amounts.planPaid), icon: FileText, tone: "text-[#17A2B8]" },
          { label: "Your share", value: formatMoney(detail.amounts.memberShare), icon: WalletCards, tone: "text-[#856404]" },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-[8px] border border-[#EEEEEE] bg-white p-4 shadow-sm">
              <Icon className={`h-5 w-5 ${metric.tone}`} />
              <p className="mt-3 text-[13px] font-bold uppercase text-brand-text-muted">{metric.label}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${metric.tone}`}>{metric.value}</p>
            </div>
          );
        })}
      </section>

      {memberShareOutstanding > 0 && (
        <section className="rounded-[8px] border border-[#FFC107]/40 bg-[#FFC107]/10 p-4">
          <p className="font-bold text-brand-text-heading">Member share still pending</p>
          <p className="mt-1 text-sm text-brand-text-muted">
            {formatMoney(memberShareOutstanding)} is still awaiting collection or payment confirmation.
          </p>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-indigo" />
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Care provider</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-[13px] text-brand-text-muted">Provider</p>
              <p className="font-semibold text-brand-text-heading">{detail.provider.name}</p>
            </div>
            <div>
              <p className="text-[13px] text-brand-text-muted">Type</p>
              <p className="font-semibold text-brand-text-heading">{detail.provider.type.replace(/_/g, " ")}</p>
            </div>
            {detail.provider.phone && (
              <a href={`tel:${detail.provider.phone}`} className="inline-flex items-center gap-2 font-semibold text-brand-indigo hover:underline">
                <Phone className="h-4 w-4" /> {detail.provider.phone}
              </a>
            )}
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white shadow-sm">
          <div className="border-b border-[#EEEEEE] px-5 py-4">
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Services included</h2>
            <p className="text-sm text-brand-text-muted">Simplified service costs from this care event.</p>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {detail.services.map((service) => (
              <div key={service.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="font-semibold text-brand-text-heading">{service.description}</p>
                  <p className="text-[13px] text-brand-text-muted">
                    {service.category.replace(/_/g, " ")} · Quantity {service.quantity.toLocaleString("en-UG")}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm sm:text-right">
                  <div>
                    <p className="text-[13px] text-brand-text-muted">Bill</p>
                    <p className="font-bold tabular-nums text-brand-text-heading">{formatMoney(service.billedAmount)}</p>
                  </div>
                  <div>
                    <p className="text-[13px] text-brand-text-muted">Plan approved</p>
                    <p className="font-bold tabular-nums text-[#28A745]">{formatMoney(service.planApprovedAmount)}</p>
                  </div>
                </div>
              </div>
            ))}
            {detail.services.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-brand-text-muted">No service line detail is available for this care event.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-brand-text-heading">Documents</h2>
        <DocumentList documents={detail.documents} />
      </section>
    </div>
  );
}
