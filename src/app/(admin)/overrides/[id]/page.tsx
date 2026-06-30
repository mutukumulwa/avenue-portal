import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Shield, Clock } from "lucide-react";
import Link from "next/link";
import { overrideService, OVERRIDE_APPROVER_ROLES } from "@/server/services/override.service";
import { revalidatePath } from "next/cache";
import { OverrideReasonCode } from "@prisma/client";

const TYPE_LABEL: Record<string, string> = {
  BACK_DATED_AMENDMENT:            "Back-dated Amendment",
  BACK_DATED_COVER_START:          "Back-dated Cover Start",
  RATE_DEVIATION_EXCEED:           "Rate Deviation > 15%",
  PRE_AUTH_OVER_BENEFIT_CAP:       "Pre-Auth Over Benefit Cap",
  CLAIM_EXCLUDED_DIAGNOSIS:        "Claim for Excluded Diagnosis",
  FORCE_APPROVE_FRAUD_CLAIM:       "Force-Approve Fraud-Flagged Claim",
  WAIVE_CO_CONTRIBUTION:           "Waive Co-Contribution",
  EXTEND_GRACE_PERIOD:             "Extend Grace Period",
  MID_TERM_RATE_CHANGE:            "Mid-term Scheme Rate Change",
  FRAUD_RULE_THRESHOLD_ADJUSTMENT: "Fraud Rule Threshold Adjustment",
  RESTORE_TERMINATED_MEMBERSHIP:   "Restore Terminated Membership",
  PRIVILEGE_ESCALATION:            "Privilege Escalation",
  CUSTOM:                          "Custom Override",
};

async function approveOverrideAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const session    = await requireRole(ROLES.OPS);
  const overrideId = formData.get("overrideId") as string;
  const notes      = (formData.get("notes") as string) || undefined;
  await overrideService.approve({
    overrideId, checkerId: session.user.id, tenantId: session.user.tenantId,
    notes,
  });
  revalidatePath(`/overrides/${overrideId}`);
}

async function rejectOverrideAction(formData: FormData) {
  "use server";
  const { requireRole, ROLES } = await import("@/lib/rbac");
  const session    = await requireRole(ROLES.OPS);
  const overrideId = formData.get("overrideId") as string;
  const reason     = formData.get("reason") as string;
  await overrideService.reject({
    overrideId, checkerId: session.user.id, tenantId: session.user.tenantId, reason,
  });
  revalidatePath(`/overrides/${overrideId}`);
}

export default async function OverrideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);
  const { id } = await params;
  const tenantId = session.user.tenantId;

  const record = await prisma.overrideRecord.findUnique({
    where: { id, tenantId },
    include: {
      maker:   { select: { id: true, firstName: true, lastName: true, email: true } },
      checker: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!record) notFound();

  const isPending     = record.status === "PENDING";
  const isMaker       = record.makerId === session.user.id;
  const requiredRoles = OVERRIDE_APPROVER_ROLES[record.overrideType];
  const isDualApproval = requiredRoles.length > 1;

  const now = new Date();
  const slaMs = record.slaDeadlineAt ? record.slaDeadlineAt.getTime() - now.getTime() : null;
  const slaBreached = slaMs !== null && slaMs < 0;
  const slaMinutesLeft = slaMs !== null && slaMs > 0 ? Math.floor(slaMs / 60000) : 0;

  // Maker's override history (for pattern surfacing to the checker)
  const makerHistory = await prisma.overrideRecord.findMany({
    where: { tenantId, makerId: record.makerId, id: { not: id } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, overrideType: true, status: true, createdAt: true },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/overrides" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-brand-text-heading font-heading">
            {TYPE_LABEL[record.overrideType] ?? record.overrideType}
          </h1>
          <p className="text-xs text-brand-text-muted mt-0.5">
            {record.entityType} · <span className="font-mono">{record.entityId.slice(0, 16)}…</span>
          </p>
        </div>
        <span className={`text-[10px] font-bold uppercase px-3 py-1 rounded-full ${
          record.status === "PENDING"  ? "bg-[#FFC107]/10 text-[#856404]" :
          record.status === "APPROVED" ? "bg-[#28A745]/10 text-[#28A745]" :
          "bg-[#DC3545]/10 text-[#DC3545]"
        }`}>
          {record.status}
        </span>
      </div>

      {/* SLA */}
      {isPending && record.slaDeadlineAt && (
        <div className={`rounded-[8px] p-3 flex items-center gap-2 border ${slaBreached ? "bg-[#DC3545]/10 border-[#DC3545]/30" : "bg-[#28A745]/10 border-[#28A745]/30"}`}>
          <Clock size={14} className={slaBreached ? "text-[#DC3545]" : "text-[#28A745]"} />
          <p className="text-xs font-semibold">
            {slaBreached
              ? "SLA breached — action required immediately"
              : `SLA: ${slaMinutesLeft} minutes remaining`}
          </p>
          <span className="ml-auto text-xs text-brand-text-muted">
            Deadline: {record.slaDeadlineAt.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {/* Core details */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-semibold text-brand-text-heading text-sm border-b border-[#EEEEEE] pb-2">Override Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: "Maker",          value: `${record.maker.firstName} ${record.maker.lastName} (${record.maker.email})` },
            { label: "Checker",        value: record.checker ? `${record.checker.firstName} ${record.checker.lastName}` : "Awaiting approval" },
            { label: "Reason code",    value: (record.reasonCode as string).replace(/_/g, " ") },
            { label: "Required approver", value: requiredRoles.join(isDualApproval ? " + " : "") },
            { label: "Requested at",   value: new Date(record.createdAt).toLocaleString("en-KE") },
            { label: "Resolved at",    value: record.resolvedAt ? new Date(record.resolvedAt).toLocaleString("en-KE") : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs text-brand-text-muted">{label}</p>
              <p className="font-semibold text-brand-text-heading mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <div>
          <p className="text-xs text-brand-text-muted">Justification</p>
          <p className="text-sm text-brand-text-body mt-1 whitespace-pre-wrap">{record.justification}</p>
        </div>
      </div>

      {/* Pre-state / post-state */}
      {(record.preState || record.postState) && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-brand-text-heading text-sm border-b border-[#EEEEEE] pb-2">State Snapshot</h2>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="font-bold text-brand-text-muted mb-1 uppercase text-[10px]">Before</p>
              <pre className="bg-[#F8F9FA] rounded p-2 overflow-x-auto text-[10px]">
                {record.preState ? JSON.stringify(record.preState, null, 2) : "—"}
              </pre>
            </div>
            <div>
              <p className="font-bold text-brand-text-muted mb-1 uppercase text-[10px]">After</p>
              <pre className="bg-[#F8F9FA] rounded p-2 overflow-x-auto text-[10px]">
                {record.postState ? JSON.stringify(record.postState, null, 2) : "Pending application"}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Maker's recent override history — shown to checker to detect patterns */}
      {makerHistory.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-brand-indigo" />
            <h2 className="font-semibold text-brand-text-heading text-sm">
              {record.maker.firstName}&apos;s Recent Override History
            </h2>
            <span className="text-[10px] text-brand-text-muted ml-auto">Shown for pattern detection</span>
          </div>
          <div className="space-y-1.5">
            {makerHistory.map((h) => (
              <div key={h.id} className="flex items-center gap-3 text-xs">
                {h.status === "APPROVED" ? <CheckCircle2 size={11} className="text-[#28A745]" /> :
                 h.status === "REJECTED" ? <XCircle size={11} className="text-[#DC3545]" /> :
                 <Clock size={11} className="text-[#856404]" />}
                <span className="text-brand-text-body">{TYPE_LABEL[h.overrideType] ?? h.overrideType}</span>
                <span className="text-brand-text-muted ml-auto">{new Date(h.createdAt).toLocaleDateString("en-KE")}</span>
                <Link href={`/overrides/${h.id}`} className="text-brand-indigo hover:underline">→</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approve / reject actions */}
      {isPending && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
          <h2 className="font-semibold text-brand-text-heading text-sm border-b border-[#EEEEEE] pb-2">
            Decision
          </h2>

          {isMaker ? (
            <div className="flex items-start gap-2 bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-3">
              <AlertTriangle size={14} className="text-[#856404] mt-0.5 shrink-0" />
              <p className="text-xs text-[#856404]">
                You requested this override. A <strong>different user</strong> holding one of{" "}
                <strong>{requiredRoles.join(", ")}</strong> must approve it.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <form action={approveOverrideAction} className="flex gap-2 items-center">
                <input type="hidden" name="overrideId" value={id} />
                <input name="notes" type="text" placeholder="Approval notes (optional)"
                  className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
                <button type="submit"
                  className="bg-[#28A745] text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#218838] transition-colors flex items-center gap-2 whitespace-nowrap">
                  <CheckCircle2 size={14} /> Approve
                  {isDualApproval && <span className="text-[10px] opacity-75">(1 of 2)</span>}
                </button>
              </form>
              <form action={rejectOverrideAction} className="flex gap-2 items-center">
                <input type="hidden" name="overrideId" value={id} />
                <input name="reason" type="text" required placeholder="Rejection reason"
                  className="flex-1 border border-[#EEEEEE] rounded-[6px] px-3 py-2 text-sm focus:ring-1 focus:ring-brand-indigo focus:outline-none" />
                <button type="submit"
                  className="border border-[#DC3545] text-[#DC3545] px-5 py-2 rounded-full text-sm font-semibold hover:bg-[#DC3545]/10 transition-colors flex items-center gap-2 whitespace-nowrap">
                  <XCircle size={14} /> Reject
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
