import { ArrowLeft, CheckCircle, Calculator, Building, XCircle, AlertTriangle, GitCompareArrows, PlayCircle } from "lucide-react";
import Link from "next/link";
import { approveEndorsementAction, rejectEndorsementAction } from "./actions";
import { amendmentService } from "@/server/services/amendment.service";
import {
  computeProRataAction, approveAmendmentAction, applyAmendmentAction,
  rejectAmendmentAction, submitAmendmentAction,
} from "./amendment-actions";
import { EndorsementsService } from "@/server/services/endorsement.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";

const STATUS_STYLE: Record<string, string> = {
  DRAFT:        "bg-[#6C757D]/10 text-[#6C757D]",
  SUBMITTED:    "bg-[#17A2B8]/10 text-[#17A2B8]",
  UNDER_REVIEW: "bg-[#FFC107]/10 text-[#856404]",
  APPROVED:     "bg-[#28A745]/10 text-[#28A745]",
  REJECTED:     "bg-[#DC3545]/10 text-[#DC3545]",
  APPLIED:      "bg-brand-indigo/10 text-brand-indigo",
  CANCELLED:    "bg-[#6C757D]/10 text-[#6C757D]",
};

// Human-readable labels for change detail keys
const KEY_LABELS: Record<string, string> = {
  firstName: "First Name", lastName: "Last Name", dateOfBirth: "Date of Birth",
  gender: "Gender", idNumber: "ID / Passport", relationship: "Relationship",
  phone: "Phone", email: "Email", memberId: "Member ID", dependentId: "Dependent ID",
  reason: "Reason", lastDay: "Last Day of Cover", refundEligible: "Refund Eligible",
  newPackageId: "New Package ID", oldSalary: "Old Salary (KES)", newSalary: "New Salary (KES)",
  newContribution: "New Contribution (KES)", modificationType: "Modification Type",
  benefitCategory: "Benefit Category", newLimit: "New Sub-Limit (KES)",
  contactPersonName: "New Contact Name", contactPersonPhone: "New Contact Phone",
  contactPersonEmail: "New Contact Email", paymentFrequency: "Payment Frequency",
  address: "New Address", fieldName: "Field Corrected", oldValue: "Old Value",
  newValue: "New Value", docRef: "Document Reference", notes: "Notes",
};

export default async function EndorsementReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole(ROLES.OPS);

  const { id } = await params;
  const endorsement = await EndorsementsService.getEndorsementById(session.user.tenantId, id);
  if (!endorsement) notFound();

  // Load enriched amendment data (Process 7 extensions)
  const richEndorsement = await amendmentService.getWithProRata(id, session.user.tenantId);

  const details = endorsement.changeDetails as Record<string, string>;
  const amount = Number(endorsement.proratedAmount ?? 0);
  const isCredit = amount < 0;
  const hasFinancialImpact = amount !== 0;
  const canAction = ["SUBMITTED", "UNDER_REVIEW"].includes(endorsement.status);

  // Process 7 derived state
  const proRata         = richEndorsement?.proRataCalculation;
  const isBackDated     = richEndorsement?.backDated ?? false;
  const isMaker         = richEndorsement?.makerId === session.user.id;
  const isDraft         = endorsement.status === "DRAFT";
  const isApproved      = endorsement.status === "APPROVED";
  const beforeSnap      = richEndorsement?.beforeSnapshot as Record<string, unknown> | null;
  const afterSnap       = richEndorsement?.afterSnapshot  as Record<string, unknown> | null;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/endorsements" className="text-brand-text-muted hover:text-brand-indigo transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-brand-text-heading font-heading">
                {endorsement.type.replace(/_/g, " ")}
              </h1>
              <span className="font-mono text-xs bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded">
                {endorsement.endorsementNumber}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLE[endorsement.status] ?? STATUS_STYLE.DRAFT}`}>
                {endorsement.status.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-brand-text-muted">
                Effective {new Date(endorsement.effectiveDate).toLocaleDateString("en-KE")}
              </span>
            </div>
          </div>
        </div>

        {canAction && (
          <div className="flex gap-2">
            <form action={rejectEndorsementAction}>
              <input type="hidden" name="endorsementId" value={endorsement.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border border-[#DC3545] text-[#DC3545] hover:bg-[#DC3545]/10 transition-colors">
                <XCircle size={15} /> Reject
              </button>
            </form>
            <form action={approveEndorsementAction}>
              <input type="hidden" name="endorsementId" value={endorsement.id} />
              <button type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-[#28A745] hover:bg-[#218838] text-white transition-colors">
                <CheckCircle size={15} /> Approve & Apply
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Scope */}
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
          <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 flex items-center gap-2">
            <Building size={16} className="text-brand-indigo" /> Policy Scope
          </h2>
          {[
            { label: "Target Group", value: <Link href={`/groups/${endorsement.group.id}`} className="text-brand-indigo hover:underline font-semibold">{endorsement.group.name}</Link> },
            { label: "Change Type", value: endorsement.type.replace(/_/g, " ") },
            { label: "Effective Date", value: new Date(endorsement.effectiveDate).toLocaleDateString("en-KE") },
            { label: "Requested", value: new Date(endorsement.requestedDate).toLocaleDateString("en-KE") },
            { label: "Affected Member", value: endorsement.member ? `${endorsement.member.firstName} ${endorsement.member.lastName}` : "Group-level" },
          ].map(f => (
            <div key={f.label} className="flex justify-between text-sm py-1 border-b border-[#EEEEEE]/50 last:border-0">
              <span className="text-brand-text-muted">{f.label}</span>
              <span className="font-semibold text-brand-text-heading">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Financial impact */}
        {hasFinancialImpact ? (
          <div className="rounded-[8px] p-5 shadow-sm space-y-4 relative overflow-hidden text-white"
            style={{ backgroundColor: "#0B1437" }}>
            <div className="absolute opacity-10 right-[-20px] top-[-20px]">
              <Calculator size={120} />
            </div>
            <h2 className="font-bold font-heading relative z-10">Financial Impact (Pro-Rata)</h2>
            <div className="bg-black/20 rounded-[8px] p-4 relative z-10">
              <p className="text-xs uppercase font-bold text-white/70 mb-1">Calculated Adjustment</p>
              <p className="text-3xl font-mono font-bold">
                {isCredit ? "−" : "+"}KES {Math.abs(amount).toLocaleString("en-KE")}
              </p>
              <p className="text-xs text-white/70 mt-1">
                {isCredit ? "Credit — reduces next invoice" : "Debit — added to next invoice"}
              </p>
            </div>
            <p className="text-xs text-white/80 leading-relaxed relative z-10">
              Daily rate × days remaining to policy renewal.
              Upon approval this {isCredit ? "credit" : "debit"} is applied to the group&apos;s billing run.
            </p>
          </div>
        ) : (
          <div className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm flex items-center justify-center text-center">
            <div>
              <Calculator size={32} className="mx-auto mb-2 text-brand-text-muted opacity-40" />
              <p className="text-sm text-brand-text-muted">No financial impact for this endorsement type.</p>
            </div>
          </div>
        )}
      </div>

      {/* Change details — human-readable */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2">
          Change Details
        </h2>
        {Object.entries(details).filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="flex justify-between text-sm py-1.5 border-b border-[#EEEEEE]/50 last:border-0">
            <span className="text-brand-text-muted">{KEY_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").trim()}</span>
            <span className="font-semibold text-brand-text-heading max-w-xs text-right">{v}</span>
          </div>
        ))}
        {Object.keys(details).length === 0 && (
          <p className="text-sm text-brand-text-muted">No change details recorded.</p>
        )}
      </div>

      {/* ── Process 7: Back-date warning ─────────────────────── */}
      {isBackDated && (
        <div className="bg-[#FFC107]/10 border border-[#FFC107]/30 rounded-[8px] p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-[#856404] mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-[#856404] text-sm">Back-dated amendment</p>
            <p className="text-xs text-brand-text-muted mt-1">
              Effective date is in the past. A <strong>BACK_DATED_AMENDMENT</strong> override record
              {richEndorsement?.overrideRecordId
                ? <span className="text-[#28A745]"> is linked ({richEndorsement.overrideRecordId.slice(0,8)}…)</span>
                : <span className="text-[#DC3545]"> has not been linked yet</span>}.
            </p>
          </div>
        </div>
      )}

      {/* ── Process 7: Pro-rata detail breakdown ─────────────── */}
      {proRata && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-brand-text-heading text-sm font-heading border-b border-[#EEEEEE] pb-2 flex items-center gap-2">
            <Calculator size={15} className="text-brand-indigo" />
            Pro-Rata Calculation (Day-Count)
          </h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {[
              { label: "Days remaining", value: proRata.daysRemaining.toString() },
              { label: "Total days in period", value: proRata.totalDaysInPeriod.toString() },
              { label: "Pro-rata factor", value: `${(Number(proRata.prorataFactor) * 100).toFixed(2)}%` },
              { label: "Prev contribution", value: `KES ${Number(proRata.previousContribution).toLocaleString("en-KE")}` },
              { label: "New contribution",  value: `KES ${Number(proRata.newContribution).toLocaleString("en-KE")}` },
              { label: "Adjustment",        value: <strong className={proRata.adjustmentType === "CREDIT" ? "text-[#28A745]" : "text-[#C4500A]"}>
                {proRata.adjustmentType === "CREDIT" ? "−" : "+"} KES {Math.abs(Number(proRata.adjustmentAmount)).toLocaleString("en-KE")}
              </strong> },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-brand-text-muted">{label}</p>
                <p className="font-semibold text-brand-text-heading mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Process 7: Before/After snapshot diff ────────────── */}
      {(beforeSnap || afterSnap) && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-3">
          <h2 className="font-bold text-brand-text-heading text-sm font-heading border-b border-[#EEEEEE] pb-2 flex items-center gap-2">
            <GitCompareArrows size={15} className="text-brand-indigo" />
            Before / After Snapshot
          </h2>
          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div>
              <p className="font-bold text-brand-text-muted mb-2 uppercase tracking-wide">Before</p>
              {beforeSnap ? Object.entries(beforeSnap).filter(([k]) => k !== "snapshotAt").map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-[#EEEEEE]/50 py-1">
                  <span className="text-brand-text-muted">{k}</span>
                  <span className="text-brand-text-heading">{String(v ?? "—")}</span>
                </div>
              )) : <p className="text-brand-text-muted italic">Not captured</p>}
            </div>
            <div>
              <p className="font-bold text-brand-text-muted mb-2 uppercase tracking-wide">After</p>
              {afterSnap ? Object.entries(afterSnap).filter(([k]) => k !== "snapshotAt").map(([k, v]) => {
                const changed = beforeSnap && beforeSnap[k] !== v;
                return (
                  <div key={k} className={`flex justify-between border-b border-[#EEEEEE]/50 py-1 ${changed ? "bg-[#28A745]/5" : ""}`}>
                    <span className="text-brand-text-muted">{k}</span>
                    <span className={`${changed ? "text-[#28A745] font-bold" : "text-brand-text-heading"}`}>{String(v ?? "—")}</span>
                  </div>
                );
              }) : <p className="text-brand-text-muted italic">Populated on apply</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Process 7: Maker-checker & workflow actions ───────── */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-5 space-y-4">
        <h2 className="font-bold text-brand-text-heading text-sm font-heading border-b border-[#EEEEEE] pb-2">
          Workflow Actions
        </h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-brand-text-muted">Maker</p>
            <p className="font-semibold text-brand-text-heading mt-0.5">
              {richEndorsement?.maker ? `${richEndorsement.maker.firstName} ${richEndorsement.maker.lastName}` : (endorsement.requestedBy ?? "—")}
            </p>
          </div>
          <div>
            <p className="text-xs text-brand-text-muted">Checker / Approver</p>
            <p className="font-semibold text-brand-text-heading mt-0.5">
              {richEndorsement?.approver ? `${richEndorsement.approver.firstName} ${richEndorsement.approver.lastName}` : "Pending"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Compute / refresh pro-rata */}
          {canAction && (
            <form action={computeProRataAction}>
              <input type="hidden" name="endorsementId" value={id} />
              <button type="submit"
                className="border border-brand-indigo text-brand-indigo px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-brand-indigo hover:text-white transition-colors flex items-center gap-1">
                <Calculator size={12} /> Compute Pro-Rata
              </button>
            </form>
          )}

          {/* Submit (DRAFT → SUBMITTED) */}
          {isDraft && (
            <form action={submitAmendmentAction}>
              <input type="hidden" name="endorsementId" value={id} />
              <button type="submit"
                className="bg-[#17A2B8] text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-[#138496] transition-colors">
                Submit for Approval
              </button>
            </form>
          )}

          {/* Approve (SUBMITTED → APPROVED) — only non-maker */}
          {canAction && !isMaker && (
            <form action={approveAmendmentAction}>
              <input type="hidden" name="endorsementId" value={id} />
              <button type="submit"
                className="bg-[#28A745] text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-[#218838] transition-colors flex items-center gap-1">
                <CheckCircle size={12} /> Approve
              </button>
            </form>
          )}

          {/* Apply (APPROVED → APPLIED) */}
          {isApproved && (
            <form action={applyAmendmentAction}>
              <input type="hidden" name="endorsementId" value={id} />
              <button type="submit"
                className="bg-brand-indigo text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-brand-secondary transition-colors flex items-center gap-1">
                <PlayCircle size={12} /> Apply Amendment
              </button>
            </form>
          )}

          {/* Reject */}
          {canAction && (
            <form action={rejectAmendmentAction} className="flex gap-2">
              <input type="hidden" name="endorsementId" value={id} />
              <input name="reason" type="text" required placeholder="Rejection reason"
                className="border border-[#DC3545]/40 text-brand-text-heading px-3 py-1.5 rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#DC3545]" />
              <button type="submit"
                className="border border-[#DC3545] text-[#DC3545] px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-[#DC3545]/10 transition-colors flex items-center gap-1">
                <XCircle size={12} /> Reject
              </button>
            </form>
          )}

          {isMaker && canAction && (
            <p className="text-xs text-[#856404] flex items-center gap-1 self-center">
              <AlertTriangle size={11} /> You initiated this amendment. A different user must approve.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
