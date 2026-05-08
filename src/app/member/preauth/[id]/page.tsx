import { DocumentList } from "@/components/ui/DocumentList";
import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPreAuthService } from "@/server/services/member-preauth.service";
import { ArrowLeft, Building2, CalendarClock, CheckCircle2, CircleDot, FileText, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatMoney(value: number | null) {
  if (value === null) return "Pending";
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  return `KES ${Math.round(value).toLocaleString("en-KE")}`;
}

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "CONVERTED_TO_CLAIM") return "bg-[#28A745]/10 text-[#28A745]";
  if (status === "SUBMITTED" || status === "UNDER_REVIEW") return "bg-[#17A2B8]/10 text-[#17A2B8]";
  if (status === "DECLINED" || status === "CANCELLED") return "bg-[#DC3545]/10 text-[#DC3545]";
  return "bg-[#6C757D]/10 text-[#6C757D]";
}

export default async function MemberPreAuthDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER);
  const { id } = await params;
  const detail = await MemberPreAuthService.getDetail(session.user.id, session.user.tenantId, id);

  if (!detail) notFound();

  const approved = detail.status === "APPROVED" || detail.status === "CONVERTED_TO_CLAIM";
  const declined = detail.status === "DECLINED";
  const inReview = detail.status === "SUBMITTED" || detail.status === "UNDER_REVIEW";

  return (
    <div className="space-y-6 font-ui">
      <div>
        <Link href="/member/preauth" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-avenue-indigo hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to pre-authorizations
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-avenue-text-heading">Pre-Authorization Detail</h1>
            <p className="mt-1 text-avenue-text-muted">{detail.provider.name} · {detail.serviceType.replace(/_/g, " ")}</p>
            <p className="mt-2 font-mono text-[13px] text-avenue-text-muted">{detail.preauthNumber}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-[13px] font-bold ${statusTone(detail.status)}`}>
            {detail.status.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <section className={`rounded-[8px] border p-4 ${approved ? "border-[#28A745]/30 bg-[#28A745]/5" : declined ? "border-[#DC3545]/30 bg-[#DC3545]/5" : "border-[#17A2B8]/30 bg-[#17A2B8]/5"}`}>
        <div className="flex items-start gap-3">
          {approved ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#28A745]" /> : declined ? <XCircle className="mt-0.5 h-5 w-5 text-[#DC3545]" /> : <CalendarClock className="mt-0.5 h-5 w-5 text-[#17A2B8]" />}
          <div>
            <p className="font-bold text-avenue-text-heading">
              {approved ? "Approved for care" : declined ? "Request declined" : "Under review"}
            </p>
            <p className="mt-1 text-sm text-avenue-text-muted">
              {approved
                ? `Valid until ${formatDate(detail.validUntil)}. Show this authorization at the facility.`
                : declined
                  ? detail.declineNotes ?? "This request could not be approved automatically."
                  : "A reviewer will issue a decision and update this page."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <FileText className="h-5 w-5 text-avenue-indigo" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Estimated cost</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-avenue-text-heading">{formatMoney(detail.estimatedCost)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-[#28A745]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Approved amount</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#28A745]">{formatMoney(detail.approvedAmount)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CircleDot className="h-5 w-5 text-[#FFC107]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Member share</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-avenue-text-heading">{formatMoney(detail.memberShare)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CalendarClock className="h-5 w-5 text-[#17A2B8]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-avenue-text-muted">Expected date</p>
          <p className="mt-1 text-xl font-bold text-avenue-text-heading">{formatDate(detail.expectedDateOfService)}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-avenue-indigo" />
            <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Facility</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-[13px] text-avenue-text-muted">Provider</p>
              <p className="font-semibold text-avenue-text-heading">{detail.provider.name}</p>
            </div>
            <div>
              <p className="text-[13px] text-avenue-text-muted">Type</p>
              <p className="font-semibold text-avenue-text-heading">{detail.provider.type.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="text-[13px] text-avenue-text-muted">Covered member</p>
              <p className="font-semibold text-avenue-text-heading">{detail.memberName}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Request notes</h2>
          <p className="mt-3 text-sm text-avenue-text-muted">{detail.clinicalNotes || "No additional notes were provided."}</p>
          {detail.claim && (
            <Link href={`/member/utilization/${detail.claim.id}`} className="mt-4 inline-flex text-sm font-semibold text-avenue-indigo hover:underline">
              View converted care event {detail.claim.claimNumber}
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Status timeline</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[8px] border border-[#28A745]/25 bg-[#28A745]/5 p-4">
            <p className="text-sm font-bold text-avenue-text-heading">Submitted</p>
            <p className="mt-1 text-xs text-avenue-text-muted">{formatDate(detail.createdAt)}</p>
          </div>
          <div className={`rounded-[8px] border p-4 ${inReview ? "border-[#17A2B8]/25 bg-[#17A2B8]/5" : approved || declined ? "border-[#28A745]/25 bg-[#28A745]/5" : "border-[#EEEEEE] bg-white"}`}>
            <p className="text-sm font-bold text-avenue-text-heading">{inReview ? "Reviewer queue" : "Decision"}</p>
            <p className="mt-1 text-xs text-avenue-text-muted">
              {inReview ? "Clinical review in progress" : approved ? "Approved" : declined ? "Declined" : "Pending update"}
            </p>
          </div>
          <div className={`rounded-[8px] border p-4 ${approved ? "border-[#28A745]/25 bg-[#28A745]/5" : "border-[#EEEEEE] bg-white"}`}>
            <p className="text-sm font-bold text-avenue-text-heading">Validity</p>
            <p className="mt-1 text-xs text-avenue-text-muted">
              {approved ? `${formatDate(detail.validFrom)} to ${formatDate(detail.validUntil)}` : "Issued after approval"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Documents</h2>
        <DocumentList documents={detail.documents} />
      </section>
    </div>
  );
}
