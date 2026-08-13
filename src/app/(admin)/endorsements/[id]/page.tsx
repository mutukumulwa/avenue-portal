import { ArrowLeft, CheckCircle, Calculator, Building, XCircle, AlertTriangle, GitCompareArrows, PlayCircle } from "lucide-react";
import Link from "next/link";
import { amendmentService } from "@/server/services/amendment.service";
import {
  computeProRataAction, approveAmendmentAction, applyAmendmentAction,
  rejectAmendmentAction, submitAmendmentAction, supplyEndorsementEvidenceAction,
} from "./amendment-actions";
import {
  EVIDENCE_PLACEHOLDER, MAX_EVIDENCE_LEN, readEvidence, requiresEvidence,
} from "@/lib/endorsement-evidence";
import { EndorsementsService } from "@/server/services/endorsement.service";
import { requireRole, ROLES } from "@/lib/rbac";
import { notFound } from "next/navigation";
// DEF-047: the run saw "+UGX 1,130,958.904" — three decimals on a currency
// with no minor unit in practice. formatMoney rounds to whole units by default.
import { formatMoney } from "@/lib/utils";

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
  newPackageId: "New Package ID", oldSalary: "Old Salary (UGX)", newSalary: "New Salary (UGX)",
  newContribution: "New Contribution (UGX)", modificationType: "Modification Type",
  benefitCategory: "Benefit Category", newLimit: "New Sub-Limit (UGX)",
  contactPersonName: "New Contact Name", contactPersonPhone: "New Contact Phone",
  contactPersonEmail: "New Contact Email", paymentFrequency: "Payment Frequency",
  address: "New Address", fieldName: "Field Corrected", oldValue: "Old Value",
  newValue: "New Value", docRef: "Document Reference", notes: "Notes",
  modificationNotes: "Modification Notes",
  sourceReference: "Authorising Document", documentReference: "Document Reference",
};

export default async function EndorsementReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const { id } = await params;
  const { error } = await searchParams;
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

  // UAT-HF P08.03 (DEF-046). The run could not approve anything and the page
  // gave no clue why: E-015's requirement was invisible until the moment it
  // refused. Surface the evidence a checker is relying on, and — when it is
  // missing — say so BEFORE they press Approve.
  const evidence        = readEvidence(endorsement.changeDetails);
  const needsEvidence   = requiresEvidence(endorsement.type);
  const evidenceMissing = needsEvidence && !evidence && canAction;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* PR-033/PR-009: control violations surface here, never as a crash */}
      {error && (
        <div className="bg-[#DC3545]/10 border border-[#DC3545]/30 rounded-[8px] p-3 flex items-start gap-2">
          <AlertTriangle size={15} className="text-[#DC3545] mt-0.5 shrink-0" />
          <p className="text-sm text-[#842029]">{error}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <Link href="/endorsements" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to endorsements">
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
                Effective {new Date(endorsement.effectiveDate).toLocaleDateString("en-UG")}
              </span>
            </div>
          </div>
        </div>

        {/* UAT-HF P08.02 (DEF-047) — this header carried a SECOND pair of
            Approve/Reject controls. "One endorsement screen presents five
            overlapping action controls with no stated difference ... 'Approve'
            and the header's apply variant were never distinguished, so a checker could not
            tell which one applies the change."

            The duplicates are gone. Every transition now has exactly one
            control, in the Workflow Actions block below, on the governed
            amendment engine. A checker who has to choose between two buttons
            that look equivalent is a checker who has not been told what they
            are doing. */}
        {canAction && (
          <p className="text-xs text-brand-text-muted max-w-xs text-right">
            Review the change below, then approve or reject it in Workflow Actions.
          </p>
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
            { label: "Effective Date", value: new Date(endorsement.effectiveDate).toLocaleDateString("en-UG") },
            { label: "Requested", value: new Date(endorsement.requestedDate).toLocaleDateString("en-UG") },
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
                {isCredit ? "−" : "+"}{formatMoney(Math.abs(amount))}
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

      {/* ── E-015 authorising document (UAT-HF P08.03 / DEF-046) ──────────
          The run pressed Approve and was refused by a control it had no way to
          see beforehand. Its state is now stated up front, on the page where
          the decision is made. */}
      {needsEvidence && (
        <div className={`rounded-[8px] p-4 flex items-start gap-3 border ${
          evidence
            ? "bg-[#28A745]/5 border-[#28A745]/30"
            : "bg-[#FFC107]/10 border-[#FFC107]/40"
        }`}>
          <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${evidence ? "text-[#28A745]" : "text-[#856404]"}`} />
          <div className="min-w-0">
            <p className={`font-semibold text-sm ${evidence ? "text-[#28A745]" : "text-[#856404]"}`}>
              {evidence ? "Authorising document recorded" : "No authorising document yet"}
            </p>
            {evidence ? (
              <p className="text-xs text-brand-text-muted mt-1 break-words">{evidence}</p>
            ) : (
              <p className="text-xs text-brand-text-muted mt-1">
                This change moves money or eligibility, so it cannot be approved
                until the person who raised it records what authorises it.
                Notes are not a source reference.
              </p>
            )}
          </div>
        </div>
      )}

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
              { label: "Prev contribution", value: formatMoney(Number(proRata.previousContribution)) },
              { label: "New contribution",  value: formatMoney(Number(proRata.newContribution)) },
              { label: "Adjustment",        value: <strong className={proRata.adjustmentType === "CREDIT" ? "text-[#28A745]" : "text-[#C4500A]"}>
                {proRata.adjustmentType === "CREDIT" ? "−" : "+"} {formatMoney(Math.abs(Number(proRata.adjustmentAmount)))}
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

        {/* UAT-HF P08.02 (DEF-047): "No version of the affected object is
            identified anywhere." A checker was asked to approve a change to
            something the screen never named. State the object, its reference and
            the version the change was raised against. */}
        <div className="rounded-[6px] border border-[#EEEEEE] bg-[#F8F9FA] px-3 py-2 text-xs">
          <span className="text-brand-text-muted">You are approving </span>
          <span className="font-semibold text-brand-text-heading">
            {endorsement.type.replace(/_/g, " ").toLowerCase()}
          </span>
          <span className="text-brand-text-muted"> on </span>
          <span className="font-semibold text-brand-text-heading">{endorsement.group.name}</span>
          {richEndorsement?.member && (
            <>
              <span className="text-brand-text-muted"> for </span>
              <span className="font-semibold text-brand-text-heading">
                {richEndorsement.member.firstName} {richEndorsement.member.lastName} ({richEndorsement.member.memberNumber})
              </span>
            </>
          )}
          <span className="text-brand-text-muted">, reference </span>
          <span className="font-mono font-semibold text-brand-text-heading">{endorsement.endorsementNumber}</span>
          <span className="text-brand-text-muted">, raised {new Date(endorsement.createdAt).toLocaleDateString("en-UG")}.</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-brand-text-muted">Maker</p>
            <p className="font-semibold text-brand-text-heading mt-0.5">
              {/* DEF-047: this fell back to the raw id, which is how the run
                  saw "Maker cmsoxn5j0002tbpvqg8gomey4". An internal identifier
                  is not a counterparty; when the user cannot be resolved, say
                  so in words. */}
              {richEndorsement?.maker
                ? `${richEndorsement.maker.firstName} ${richEndorsement.maker.lastName}`
                : "No longer a user"}
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

          {/* Approve (SUBMITTED → APPROVED) — only non-maker, and only once
              E-015 can actually be satisfied. Offering a control that is
              guaranteed to be refused is what the run spent three endorsements
              discovering (DEF-046). */}
          {canAction && !isMaker && !evidenceMissing && (
            <form action={approveAmendmentAction}>
              <input type="hidden" name="endorsementId" value={id} />
              <button type="submit"
                className="bg-[#28A745] text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-[#218838] transition-colors flex items-center gap-1">
                <CheckCircle size={12} /> Approve
              </button>
            </form>
          )}

          {canAction && !isMaker && evidenceMissing && (
            <p className="text-xs text-[#856404] flex items-center gap-1 self-center max-w-md">
              <AlertTriangle size={11} className="shrink-0" />
              This change cannot be approved until the person who raised it records
              the document authorising it. You cannot add it yourself — supplying
              the evidence and then approving on it is not a review.
            </p>
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

          {/* UAT-HF P08.03 (DEF-046) — the way out for an endorsement raised
              before the creation form asked for a source reference. Seven were
              stuck this way at the end of the run: unapprovable, and rejecting
              them would have discarded correct work. Maker only, by design. */}
          {isMaker && evidenceMissing && (
            <form action={supplyEndorsementEvidenceAction} className="w-full space-y-2 border-t border-[#EEEEEE] pt-3">
              <label htmlFor="supply-evidence" className="block text-xs font-bold text-brand-text-heading">
                Record the document authorising this change
              </label>
              <p className="text-[11px] text-brand-text-muted">
                This endorsement was raised before the form asked for one, so no
                checker can approve it yet. Adding it here does not change what
                you requested — it records what authorises it.
              </p>
              <input type="hidden" name="endorsementId" value={id} />
              <div className="flex gap-2">
                <input
                  id="supply-evidence"
                  name="sourceReference"
                  type="text"
                  required
                  maxLength={MAX_EVIDENCE_LEN}
                  placeholder={EVIDENCE_PLACEHOLDER}
                  className="flex-1 border border-[#EEEEEE] px-3 py-1.5 rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-brand-indigo"
                />
                <button type="submit"
                  className="bg-brand-indigo text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:bg-brand-secondary transition-colors">
                  Record reference
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
