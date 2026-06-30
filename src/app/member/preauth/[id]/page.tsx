import { DocumentList } from "@/components/ui/DocumentList";
import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPreAuthService } from "@/server/services/member-preauth.service";
import { ArrowLeft, Building2, CalendarClock, CheckCircle2, CircleDot, FileText, NotebookPen, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function formatMoney(value: number | null) {
  if (value === null) return "Pending";
  if (value >= 1_000_000) return `KES ${(value / 1_000_000).toFixed(1)}M`;
  return `KES ${Math.round(value).toLocaleString("en-UG")}`;
}

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function formatBytes(value: number | null) {
  if (!value) return "File";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
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
        <Link href="/member/preauth" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-brand-indigo hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to pre-authorizations
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold text-brand-text-heading">Pre-Authorization Detail</h1>
            <p className="mt-1 text-brand-text-muted">{detail.provider.name} · {detail.serviceType.replace(/_/g, " ")}</p>
            <p className="mt-2 font-mono text-[13px] text-brand-text-muted">{detail.preauthNumber}</p>
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
            <p className="font-bold text-brand-text-heading">
              {approved ? "Approved for care" : declined ? "Request declined" : "Under review"}
            </p>
            <p className="mt-1 text-sm text-brand-text-muted">
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
          <FileText className="h-5 w-5 text-brand-indigo" />
          <p className="mt-3 text-[13px] font-bold uppercase text-brand-text-muted">Estimated cost</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-text-heading">{formatMoney(detail.estimatedCost)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-[#28A745]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-brand-text-muted">Approved amount</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[#28A745]">{formatMoney(detail.approvedAmount)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CircleDot className="h-5 w-5 text-[#FFC107]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-brand-text-muted">Member share</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-text-heading">{formatMoney(detail.memberShare)}</p>
        </div>
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <CalendarClock className="h-5 w-5 text-[#17A2B8]" />
          <p className="mt-3 text-[13px] font-bold uppercase text-brand-text-muted">Expected date</p>
          <p className="mt-1 text-xl font-bold text-brand-text-heading">{formatDate(detail.expectedDateOfService)}</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-brand-indigo" />
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Facility</h2>
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
            <div>
              <p className="text-[13px] text-brand-text-muted">Covered member</p>
              <p className="font-semibold text-brand-text-heading">{detail.memberName}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
          <h2 className="font-heading text-lg font-bold text-brand-text-heading">Request notes</h2>
          <p className="mt-3 text-sm text-brand-text-muted">{detail.clinicalNotes || "No additional notes were provided."}</p>
          {detail.claim && (
            <Link href={`/member/utilization/${detail.claim.id}`} className="mt-4 inline-flex text-sm font-semibold text-brand-indigo hover:underline">
              View converted care event {detail.claim.claimNumber}
            </Link>
          )}
        </div>
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-brand-text-heading">Status timeline</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-[8px] border border-[#28A745]/25 bg-[#28A745]/5 p-4">
            <p className="text-sm font-bold text-brand-text-heading">Submitted</p>
            <p className="mt-1 text-xs text-brand-text-muted">{formatDate(detail.createdAt)}</p>
          </div>
          <div className={`rounded-[8px] border p-4 ${inReview ? "border-[#17A2B8]/25 bg-[#17A2B8]/5" : approved || declined ? "border-[#28A745]/25 bg-[#28A745]/5" : "border-[#EEEEEE] bg-white"}`}>
            <p className="text-sm font-bold text-brand-text-heading">{inReview ? "Reviewer queue" : "Decision"}</p>
            <p className="mt-1 text-xs text-brand-text-muted">
              {inReview ? "Clinical review in progress" : approved ? "Approved" : declined ? "Declined" : "Pending update"}
            </p>
          </div>
          <div className={`rounded-[8px] border p-4 ${approved ? "border-[#28A745]/25 bg-[#28A745]/5" : "border-[#EEEEEE] bg-white"}`}>
            <p className="text-sm font-bold text-brand-text-heading">Validity</p>
            <p className="mt-1 text-xs text-brand-text-muted">
              {approved ? `${formatDate(detail.validFrom)} to ${formatDate(detail.validUntil)}` : "Issued after approval"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <h2 className="font-heading text-lg font-bold text-brand-text-heading">Documents</h2>
        <DocumentList documents={detail.documents} />
      </section>

      <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-brand-text-heading">Shared health records</h2>
            <p className="mt-1 text-sm text-brand-text-muted">Only records you explicitly shared from Health Vault appear here.</p>
          </div>
          <Link href="/member/health-vault" className="text-sm font-semibold text-brand-indigo hover:underline">
            Manage
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {detail.sharedHealthRecords.map((share) => (
            <article key={share.id} className="rounded-[8px] border border-[#EEEEEE] p-4">
              <p className="mb-3 text-xs font-semibold text-brand-text-muted">
                Shared {formatDate(share.createdAt)}
                {share.expiresAt ? ` · expires ${formatDate(share.expiresAt)}` : " · until revoked"}
              </p>
              {share.file && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-brand-indigo/10 text-brand-indigo">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-brand-text-heading">{share.file.title}</p>
                      <p className="mt-1 text-sm text-brand-text-muted">
                        {formatCategory(share.file.category)} · {formatBytes(share.file.fileSize)} · {formatDate(share.file.capturedAt)}
                      </p>
                    </div>
                  </div>
                  {share.file.notes && <p className="mt-3 text-sm text-brand-text-muted">{share.file.notes}</p>}
                  <Link href={share.file.fileUrl} className="mt-3 inline-flex text-sm font-semibold text-brand-indigo hover:underline">
                    Open shared file
                  </Link>
                </>
              )}
              {share.journalEntry && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#17A2B8]/10 text-[#0F6F7D]">
                      <NotebookPen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-brand-text-heading">{formatCategory(share.journalEntry.entryType)}</p>
                      <p className="mt-1 text-sm text-brand-text-muted">{formatDate(share.journalEntry.recordedAt)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-brand-text-heading">{share.journalEntry.noteText}</p>
                  {share.journalEntry.audioUrl && (
                    <audio controls src={share.journalEntry.audioUrl} className="mt-3 w-full">
                      <track kind="captions" />
                    </audio>
                  )}
                  {share.journalEntry.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {share.journalEntry.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-[#F8F9FA] px-2 py-0.5 text-[11px] text-brand-text-muted">{tag}</span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
          {detail.sharedHealthRecords.length === 0 && (
            <div className="rounded-[8px] border border-dashed border-[#D6DCE5] p-6 text-center text-sm text-brand-text-muted md:col-span-2">
              No Health Vault records have been shared with this pre-authorization yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
