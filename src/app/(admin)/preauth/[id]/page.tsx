import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { prisma } from "@/lib/prisma";
import { convertToClaimAction } from "./actions";
import { PreAuthAdjudicationForm } from "./PreAuthAdjudicationForm";
import { ArrowLeft, CheckCircle2, XCircle, Info, ArrowRightCircle, FileText, NotebookPen } from "lucide-react";
import Link from "next/link";
import { PreAuthDocuments } from "./PreAuthDocuments";

function formatCategory(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBytes(value: number | null) {
  if (!value) return "File";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

export default async function PreAuthDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.CLINICAL);

  const { id } = await params;
  const tenantId = session.user.tenantId;
  const pa = await ClaimsService.getPreAuthById(tenantId, id);

  if (!pa) notFound();

  const healthShares = await prisma.memberHealthShare.findMany({
    where: {
      tenantId,
      memberId: pa.memberId,
      preauthId: pa.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: { healthFile: true, journalEntry: true },
    orderBy: { createdAt: "desc" },
  });

  const canAdjudicate = ["SUBMITTED", "UNDER_REVIEW"].includes(pa.status);
  const canConvert = pa.status === "APPROVED";
  const diagnoses = pa.diagnoses as { icdCode?: string; description: string; isPrimary?: boolean }[];
  const procedures = pa.procedures as { cptCode?: string; description: string; quantity?: number; unitCost?: number; total?: number }[];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/preauth" className="text-avenue-text-body hover:text-avenue-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading">
            Pre-Authorization {pa.preauthNumber}
          </h1>
          <p className="text-avenue-text-body font-body mt-1">Review and decide on this pre-authorization request.</p>
        </div>
        <span className={`px-4 py-2 text-xs font-bold uppercase rounded-full ${
          pa.status === "APPROVED" ? "bg-[#28A745]/10 text-[#28A745]" :
          pa.status === "DECLINED" ? "bg-[#DC3545]/10 text-[#DC3545]" :
          pa.status === "CONVERTED_TO_CLAIM" ? "bg-avenue-indigo/10 text-avenue-indigo" :
          "bg-[#17A2B8]/10 text-[#17A2B8]"
        }`}>
          {pa.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-avenue-text-muted font-bold uppercase tracking-wide">Member</p>
          <p className="text-lg font-bold text-avenue-text-heading mt-1">{pa.member.firstName} {pa.member.lastName}</p>
          <p className="text-sm text-avenue-text-body">{pa.member.memberNumber}</p>
          <p className="text-xs text-avenue-text-muted mt-2">Group: {pa.member.group.name}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-avenue-text-muted font-bold uppercase tracking-wide">Provider</p>
          <p className="text-lg font-bold text-avenue-text-heading mt-1">{pa.provider.name}</p>
          <p className="text-sm text-avenue-text-body capitalize">{pa.provider.type.toLowerCase()} · {pa.provider.tier}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-avenue-text-muted font-bold uppercase tracking-wide">Financials</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-avenue-text-body">Estimated Cost</span><span className="font-bold text-avenue-text-heading">KES {Number(pa.estimatedCost).toLocaleString()}</span></div>
            {pa.approvedAmount && (
              <div className="flex justify-between"><span className="text-avenue-text-body">Approved</span><span className="font-bold text-[#28A745]">KES {Number(pa.approvedAmount).toLocaleString()}</span></div>
            )}
            {pa.validUntil && (
              <div className="flex justify-between"><span className="text-avenue-text-body">Valid Until</span><span className="font-semibold text-avenue-text-heading">{new Date(pa.validUntil).toLocaleDateString()}</span></div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-3 flex items-center gap-2">
            <Info size={16} className="text-avenue-indigo" /> Diagnoses
          </h3>
          <ul className="space-y-2">
            {Array.isArray(diagnoses) && diagnoses.map((d, i) => (
              <li key={i} className="flex justify-between items-start text-sm border-b border-[#EEEEEE] pb-2 last:border-0">
                <span className="text-avenue-text-body">{d.description}</span>
                {d.icdCode && <span className="text-xs font-mono bg-[#F8F9FA] px-2 py-1 rounded">{d.icdCode}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-3 flex items-center gap-2">
            <Info size={16} className="text-avenue-indigo" /> Planned Procedures
          </h3>
          <ul className="space-y-2">
            {Array.isArray(procedures) && procedures.map((p, i) => (
              <li key={i} className="flex justify-between items-start text-sm border-b border-[#EEEEEE] pb-2 last:border-0">
                <span className="text-avenue-text-body">{p.description}</span>
                <span className="font-semibold text-avenue-text-heading">KES {(p.total ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {pa.clinicalNotes && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide mb-2">Clinical Notes</h3>
          <p className="text-sm text-avenue-text-body whitespace-pre-wrap">{pa.clinicalNotes}</p>
        </div>
      )}

      {/* Supporting documents */}
      <PreAuthDocuments
        preauthId={pa.id}
        initialDocuments={pa.documents.map((d) => ({
          ...d,
          fileSize: d.fileSize ?? null,
          mimeType: d.mimeType ?? null,
        }))}
      />

      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-avenue-text-heading uppercase tracking-wide">Member-shared Health Vault records</h3>
            <p className="text-sm text-avenue-text-body mt-1">Only records explicitly shared by the member appear here.</p>
          </div>
          <span className="rounded-full bg-avenue-indigo/10 px-2.5 py-1 text-xs font-bold text-avenue-indigo">{healthShares.length}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {healthShares.map((share) => (
            <article key={share.id} className="rounded-lg border border-[#EEEEEE] p-4">
              <p className="mb-3 text-xs font-semibold text-avenue-text-body">
                Shared {formatDate(share.createdAt)}
                {share.expiresAt ? ` · expires ${formatDate(share.expiresAt)}` : " · until revoked"}
              </p>
              {share.healthFile && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-avenue-indigo/10 text-avenue-indigo">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-avenue-text-heading">{share.healthFile.title}</p>
                      <p className="mt-1 text-sm text-avenue-text-body">
                        {formatCategory(share.healthFile.category)} · {formatBytes(share.healthFile.fileSize)} · {formatDate(share.healthFile.capturedAt)}
                      </p>
                    </div>
                  </div>
                  {share.healthFile.notes && <p className="mt-3 text-sm text-avenue-text-body">{share.healthFile.notes}</p>}
                  <Link href={share.healthFile.fileUrl} className="mt-3 inline-flex text-sm font-semibold text-avenue-indigo hover:underline">
                    Open shared file
                  </Link>
                </>
              )}
              {share.journalEntry && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#17A2B8]/10 text-[#0F6F7D]">
                      <NotebookPen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-avenue-text-heading">{formatCategory(share.journalEntry.entryType)}</p>
                      <p className="mt-1 text-sm text-avenue-text-body">{formatDate(share.journalEntry.recordedAt)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-avenue-text-body whitespace-pre-wrap">{share.journalEntry.noteText}</p>
                  {share.journalEntry.audioUrl && (
                    <audio controls src={share.journalEntry.audioUrl} className="mt-3 w-full">
                      <track kind="captions" />
                    </audio>
                  )}
                </>
              )}
            </article>
          ))}
          {healthShares.length === 0 && (
            <div className="rounded-lg border border-dashed border-[#D6DCE5] p-6 text-center text-sm text-avenue-text-muted md:col-span-2">
              No Health Vault records have been shared for this pre-authorization.
            </div>
          )}
        </div>
      </div>

      {/* Convert to claim CTA for approved preauths */}
      {canConvert && (
        <div className="bg-avenue-indigo/5 border-2 border-avenue-indigo/20 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-avenue-text-heading flex items-center gap-2">
                <ArrowRightCircle size={20} className="text-avenue-indigo" />
                Convert to Claim
              </h3>
              <p className="text-sm text-avenue-text-body mt-1">This pre-authorization is approved. Convert it to a claim for payment processing.</p>
            </div>
            <form action={convertToClaimAction}>
              <input type="hidden" name="preauthId" value={pa.id} />
              <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2.5 rounded-full font-semibold transition-colors shadow-sm flex items-center gap-2">
                <ArrowRightCircle size={18} />
                Convert to Claim
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Adjudication form */}
      {canAdjudicate && (
        <PreAuthAdjudicationForm
          preauthId={pa.id}
          estimatedCost={Number(pa.estimatedCost)}
          serviceType={pa.serviceType}
          currentStatus={pa.status}
        />
      )}

      {/* Declined info */}
      {pa.status === "DECLINED" && (
        <div className="bg-[#DC3545]/5 border border-[#DC3545]/20 rounded-lg p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-[#DC3545] uppercase tracking-wide">
            <XCircle size={16} /> Declined
          </h3>
          {pa.declineReasonCode && <p className="text-sm font-semibold text-avenue-text-heading mt-2">Reason: {pa.declineReasonCode.replace(/_/g, " ")}</p>}
          {pa.declineNotes && <p className="text-sm text-avenue-text-body mt-1">{pa.declineNotes}</p>}
        </div>
      )}

      {pa.status === "CONVERTED_TO_CLAIM" && pa.claim && (
        <div className="bg-avenue-indigo/5 border border-avenue-indigo/20 rounded-lg p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-avenue-indigo uppercase tracking-wide">
            <CheckCircle2 size={16} /> Converted to Claim
          </h3>
          <Link href={`/claims/${pa.claim.id}`} className="text-avenue-indigo hover:text-avenue-secondary font-semibold mt-2 inline-block">
            View Claim →
          </Link>
        </div>
      )}
    </div>
  );
}
