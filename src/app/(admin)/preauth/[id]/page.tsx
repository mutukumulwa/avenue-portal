import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { prisma } from "@/lib/prisma";
import { convertToClaimAction } from "./actions";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import {
  runAutoDecisionAction,
  releaseBenefitHoldAction, cancelPreAuthAction,
} from "./preauth-process8-actions";
import { PreAuthAdjudicationForm } from "./PreAuthAdjudicationForm";
import { ArrowLeft, CheckCircle2, XCircle, Info, ArrowRightCircle, FileText, NotebookPen, AlertTriangle, Clock, Shield, PlusCircle } from "lucide-react";
import Link from "next/link";
import { PreAuthDocuments } from "./PreAuthDocuments";

function formatCategory(value: string) {
  return value.replace(/_/g, " ").toLowerCase();
}

function formatDate(value: Date | null) {
  if (!value) return "Not set";
  return new Date(value).toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
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

  // Process 8 enriched data
  const enriched = await preauthAdjudicationService.getEnrichedDetail(id, tenantId);

  const canAdjudicate = ["SUBMITTED", "UNDER_REVIEW"].includes(pa.status);
  const canConvert = pa.status === "APPROVED";
  const diagnoses = pa.diagnoses as { icdCode?: string; description: string; isPrimary?: boolean }[];
  const procedures = pa.procedures as { cptCode?: string; description: string; quantity?: number; unitCost?: number; total?: number }[];

  const isEmergency   = enriched?.isEmergency ?? false;
  const autoLog       = enriched?.autoDecisionLog as Array<{ gate: string; outcome: string; reason?: string }> | null;
  const hold          = enriched?.hold;
  const benefitBalance = enriched?.benefitBalance;
  const slaDeadline   = enriched?.slaDeadlineAt;
  const slaBreached   = enriched?.slaBreachedAt;
  const parentPreAuth = enriched?.parentPreAuthId
    ? await prisma.preAuthorization.findUnique({ where: { id: enriched.parentPreAuthId }, select: { preauthNumber: true } })
    : null;

  const now = new Date();
  const slaMinutesLeft = slaDeadline ? Math.max(0, Math.floor((slaDeadline.getTime() - now.getTime()) / 60000)) : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/preauth" className="text-brand-text-body hover:text-brand-text-heading transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-brand-text-heading font-heading">
            Pre-Authorization {pa.preauthNumber}
          </h1>
          <p className="text-brand-text-body font-body mt-1">Review and decide on this pre-authorization request.</p>
        </div>
        <span className={`px-4 py-2 text-xs font-bold uppercase rounded-full ${
          pa.status === "APPROVED" ? "bg-[#28A745]/10 text-[#28A745]" :
          pa.status === "DECLINED" ? "bg-[#DC3545]/10 text-[#DC3545]" :
          ["ATTACHED", "UTILISED", "CONVERTED_TO_CLAIM"].includes(pa.status) ? "bg-brand-indigo/10 text-brand-indigo" :
          "bg-[#17A2B8]/10 text-[#17A2B8]"
        }`}>
          {pa.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-brand-text-muted font-bold uppercase tracking-wide">Member</p>
          <p className="text-lg font-bold text-brand-text-heading mt-1">{pa.member.firstName} {pa.member.lastName}</p>
          <p className="text-sm text-brand-text-body">{pa.member.memberNumber}</p>
          <p className="text-xs text-brand-text-muted mt-2">Group: {pa.member.group.name}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-brand-text-muted font-bold uppercase tracking-wide">Provider</p>
          <p className="text-lg font-bold text-brand-text-heading mt-1">{pa.provider.name}</p>
          <p className="text-sm text-brand-text-body capitalize">{pa.provider.type.toLowerCase()} · {pa.provider.tier}</p>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <p className="text-xs text-brand-text-muted font-bold uppercase tracking-wide">Financials</p>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-brand-text-body">Estimated Cost</span><span className="font-bold text-brand-text-heading">UGX {Number(pa.estimatedCost).toLocaleString()}</span></div>
            {pa.approvedAmount && (
              <div className="flex justify-between"><span className="text-brand-text-body">Approved</span><span className="font-bold text-[#28A745]">UGX {Number(pa.approvedAmount).toLocaleString()}</span></div>
            )}
            {pa.validUntil && (
              <div className="flex justify-between"><span className="text-brand-text-body">Valid Until</span><span className="font-semibold text-brand-text-heading">{new Date(pa.validUntil).toLocaleDateString()}</span></div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-3 flex items-center gap-2">
            <Info size={16} className="text-brand-indigo" /> Diagnoses
          </h3>
          <ul className="space-y-2">
            {Array.isArray(diagnoses) && diagnoses.map((d, i) => (
              <li key={i} className="flex justify-between items-start text-sm border-b border-[#EEEEEE] pb-2 last:border-0">
                <span className="text-brand-text-body">{d.description}</span>
                {d.icdCode && <span className="text-xs font-mono bg-[#F8F9FA] px-2 py-1 rounded">{d.icdCode}</span>}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-3 flex items-center gap-2">
            <Info size={16} className="text-brand-indigo" /> Planned Procedures
          </h3>
          <ul className="space-y-2">
            {Array.isArray(procedures) && procedures.map((p, i) => (
              <li key={i} className="flex justify-between items-start text-sm border-b border-[#EEEEEE] pb-2 last:border-0">
                <span className="text-brand-text-body">{p.description}</span>
                <span className="font-semibold text-brand-text-heading">UGX {(p.total ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {pa.clinicalNotes && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide mb-2">Clinical Notes</h3>
          <p className="text-sm text-brand-text-body whitespace-pre-wrap">{pa.clinicalNotes}</p>
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
            <h3 className="text-sm font-bold text-brand-text-heading uppercase tracking-wide">Member-shared Health Vault records</h3>
            <p className="text-sm text-brand-text-body mt-1">Only records explicitly shared by the member appear here.</p>
          </div>
          <span className="rounded-full bg-brand-indigo/10 px-2.5 py-1 text-xs font-bold text-brand-indigo">{healthShares.length}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {healthShares.map((share) => (
            <article key={share.id} className="rounded-lg border border-[#EEEEEE] p-4">
              <p className="mb-3 text-xs font-semibold text-brand-text-body">
                Shared {formatDate(share.createdAt)}
                {share.expiresAt ? ` · expires ${formatDate(share.expiresAt)}` : " · until revoked"}
              </p>
              {share.healthFile && (
                <>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-indigo/10 text-brand-indigo">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-brand-text-heading">{share.healthFile.title}</p>
                      <p className="mt-1 text-sm text-brand-text-body">
                        {formatCategory(share.healthFile.category)} · {formatBytes(share.healthFile.fileSize)} · {formatDate(share.healthFile.capturedAt)}
                      </p>
                    </div>
                  </div>
                  {share.healthFile.notes && <p className="mt-3 text-sm text-brand-text-body">{share.healthFile.notes}</p>}
                  <Link href={share.healthFile.fileUrl} className="mt-3 inline-flex text-sm font-semibold text-brand-indigo hover:underline">
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
                      <p className="font-bold text-brand-text-heading">{formatCategory(share.journalEntry.entryType)}</p>
                      <p className="mt-1 text-sm text-brand-text-body">{formatDate(share.journalEntry.recordedAt)}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-brand-text-body whitespace-pre-wrap">{share.journalEntry.noteText}</p>
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
            <div className="rounded-lg border border-dashed border-[#D6DCE5] p-6 text-center text-sm text-brand-text-muted md:col-span-2">
              No Health Vault records have been shared for this pre-authorization.
            </div>
          )}
        </div>
      </div>

      {/* Attach workflow for approved preauths (WP-C3): a PA attaches to a
          claim that also carries BAU services — it rarely becomes a claim on
          its own. Attaching happens from the claim screen; this CTA covers
          the case where no claim exists yet. */}
      {canConvert && (
        <div className="bg-brand-indigo/5 border-2 border-brand-indigo/20 rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-brand-text-heading flex items-center gap-2">
                <ArrowRightCircle size={20} className="text-brand-indigo" />
                Approved — ready to attach
              </h3>
              <p className="text-sm text-brand-text-body mt-1">
                Attach this pre-auth from the member&apos;s claim screen (it appears in the
                claim&apos;s Pre-Authorizations panel), or start a claim with it attached if
                none exists yet.
              </p>
            </div>
            <form action={convertToClaimAction}>
              <input type="hidden" name="preauthId" value={pa.id} />
              <button type="submit" className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2.5 rounded-full font-semibold transition-colors shadow-sm flex items-center gap-2">
                <ArrowRightCircle size={18} />
                Start claim with this PA
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
          {pa.declineReasonCode && <p className="text-sm font-semibold text-brand-text-heading mt-2">Reason: {pa.declineReasonCode.replace(/_/g, " ")}</p>}
          {pa.declineNotes && <p className="text-sm text-brand-text-body mt-1">{pa.declineNotes}</p>}
        </div>
      )}

      {["ATTACHED", "UTILISED", "CONVERTED_TO_CLAIM"].includes(pa.status) && pa.claim && (
        <div className="bg-brand-indigo/5 border border-brand-indigo/20 rounded-lg p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-brand-indigo uppercase tracking-wide">
            <CheckCircle2 size={16} />
            {pa.status === "UTILISED" ? "Utilised by claim decision" : "Attached to claim"}
          </h3>
          <Link href={`/claims/${pa.claim.id}`} className="text-brand-indigo hover:text-brand-secondary font-semibold mt-2 inline-block">
            View Claim →
          </Link>
        </div>
      )}

      {/* ── Process 8: Emergency banner ─────────────────────── */}
      {isEmergency && (
        <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-[8px] p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-[#DC3545] shrink-0" />
          <p className="font-bold text-[#DC3545] text-sm">EMERGENCY pre-authorization — expedited handling required</p>
        </div>
      )}

      {/* ── Process 8: SLA timer ────────────────────────────── */}
      {slaDeadline && canAdjudicate && (
        <div className={`rounded-[8px] p-4 flex items-center gap-3 border ${slaBreached ? "bg-[#DC3545]/10 border-[#DC3545]/30" : slaMinutesLeft !== null && slaMinutesLeft < 30 ? "bg-[#FFC107]/10 border-[#FFC107]/30" : "bg-[#28A745]/10 border-[#28A745]/30"}`}>
          <Clock size={16} className={slaBreached ? "text-[#DC3545]" : "text-current"} />
          <div>
            <p className="font-semibold text-sm">
              {slaBreached
                ? "SLA breached — escalate immediately"
                : slaMinutesLeft !== null
                ? `SLA: ${slaMinutesLeft}m remaining`
                : "SLA active"}
            </p>
            <p className="text-xs text-brand-text-muted mt-0.5">
              Deadline: {new Date(slaDeadline).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}
              {" · "}Type: {enriched?.slaType?.replace(/_/g," ") ?? "—"}
            </p>
          </div>
        </div>
      )}

      {/* ── Process 8: Benefit hold panel ───────────────────── */}
      {(hold || benefitBalance) && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
          <h2 className="font-bold text-brand-text-heading text-sm font-heading border-b border-[#EEEEEE] pb-2 flex items-center gap-2">
            <Shield size={15} className="text-brand-indigo" /> Benefit Balance &amp; Hold
          </h2>
          {benefitBalance && (
            <div className="grid grid-cols-4 gap-3 text-sm">
              {[
                // OBS-IP-1: name the limit's basis — this is the PA category's
                // annual sub-limit, not the package's overall annual cover.
                { label: `Annual Limit — ${String(benefitBalance.category ?? "").replace(/_/g, " ") || "category"}`, value: `UGX ${Number(benefitBalance.limit).toLocaleString("en-UG")}`, color: "text-brand-text-heading" },
                { label: "Consumed",       value: `UGX ${Number(benefitBalance.used).toLocaleString("en-UG")}`,      color: "text-[#DC3545]" },
                { label: "Active Holds",   value: `UGX ${Number(benefitBalance.held).toLocaleString("en-UG")}`,      color: "text-[#856404]" },
                { label: "Available",      value: `UGX ${Number(benefitBalance.remaining).toLocaleString("en-UG")}`, color: "text-[#28A745] font-bold" },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p className="text-xs text-brand-text-muted">{label}</p>
                  <p className={`font-semibold mt-0.5 ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          )}
          {hold && (
            <div className="flex items-center justify-between bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[6px] p-3">
              <div>
                <p className="text-sm font-semibold text-[#856404]">
                  Pending Authorization Hold: UGX {Number(hold.heldAmount).toLocaleString("en-UG")}
                </p>
                <p className="text-xs text-brand-text-muted mt-0.5">
                  Expires: {new Date(hold.expiresAt).toLocaleDateString("en-UG")}
                  {" · "}Status: {hold.status}
                </p>
              </div>
              {hold.status === "ACTIVE" && (
                <form action={releaseBenefitHoldAction}>
                  <input type="hidden" name="preAuthId" value={id} />
                  <button type="submit"
                    className="text-xs font-semibold text-[#DC3545] border border-[#DC3545]/30 px-3 py-1 rounded-full hover:bg-[#DC3545]/10 transition-colors">
                    Release Hold
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Process 8: Auto-decision log ─────────────────────── */}
      {autoLog && autoLog.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-brand-text-heading text-sm font-heading border-b border-[#EEEEEE] pb-2">
            Auto-Decision Gate Log
          </h2>
          <div className="space-y-1.5">
            {autoLog.map((gate, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                {gate.outcome === "PASS"
                  ? <CheckCircle2 size={13} className="text-[#28A745] mt-0.5 shrink-0" />
                  : gate.outcome === "FAIL"
                  ? <XCircle size={13} className="text-[#DC3545] mt-0.5 shrink-0" />
                  : <AlertTriangle size={13} className="text-[#856404] mt-0.5 shrink-0" />}
                <div>
                  <span className="font-mono font-semibold text-brand-text-heading">{gate.gate.replace(/_/g," ")}</span>
                  {gate.reason && <span className="text-brand-text-muted ml-2">{gate.reason}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Process 8: Mid-treatment parent link ─────────────── */}
      {parentPreAuth && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <PlusCircle size={15} className="text-brand-indigo" />
            <span className="text-brand-text-muted">Mid-treatment amendment of</span>
            <Link href={`/preauth/${enriched?.parentPreAuthId}`} className="text-brand-indigo font-semibold hover:underline">
              {parentPreAuth.preauthNumber}
            </Link>
          </div>
        </div>
      )}

      {/* ── Process 8: auto-decision + cancel ─────────────────── */}
      {/* W1.1: the approve/decline forms that lived here were a SECOND decision
          surface wired to the same PA; the single decision path is the
          Adjudication form above (canonical service, always places the hold). */}
      {canAdjudicate && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-brand-text-heading text-sm font-heading">Review Tools</h2>
            {!autoLog && (
              <form action={runAutoDecisionAction}>
                <input type="hidden" name="preAuthId" value={id} />
                <button type="submit"
                  className="text-xs font-semibold text-brand-indigo border border-brand-indigo/30 px-3 py-1 rounded-full hover:bg-brand-indigo/5 transition-colors">
                  Run Auto-Decision
                </button>
              </form>
            )}
          </div>

          {/* Cancel */}
          <form action={cancelPreAuthAction} className="flex gap-2 items-center">
            <input type="hidden" name="preAuthId" value={id} />
            <input name="reason" type="text" placeholder="Cancellation reason"
              className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm" />
            <button type="submit"
              className="border border-[#6C757D] text-[#6C757D] px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#6C757D]/10 transition-colors whitespace-nowrap shrink-0">
              Cancel PA
            </button>
          </form>
        </div>
      )}

      {/* Link to create mid-treatment amendment */}
      {pa.status === "APPROVED" && (
        <div className="text-center">
          <Link href={`/preauth/new?parentPreAuthId=${id}`}
            className="text-xs text-brand-indigo font-semibold hover:underline inline-flex items-center gap-1">
            <PlusCircle size={13} /> Create mid-treatment amendment
          </Link>
        </div>
      )}
    </div>
  );
}
