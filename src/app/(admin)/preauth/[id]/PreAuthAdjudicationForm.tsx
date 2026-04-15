"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, Stethoscope } from "lucide-react";
import { adjudicatePreAuthAction, requestMedicalReviewAction } from "./actions";

const inputCls = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-sm font-semibold text-avenue-text-heading block mb-1";

// Service types that require two-stage medical review before final approval
const MEDICAL_REVIEW_TYPES = ["INPATIENT", "DAY_CASE", "EMERGENCY"];

const DECLINE_REASONS = [
  { value: "PREEXISTING",            label: "Pre-existing condition" },
  { value: "EXCLUSION",              label: "Benefit exclusion" },
  { value: "BENEFIT_EXHAUSTED",      label: "Benefit limit exhausted" },
  { value: "WAITING_PERIOD",         label: "Still within waiting period" },
  { value: "INVALID_DOCS",           label: "Insufficient / invalid documentation" },
  { value: "NON_COVERED_FACILITY",   label: "Non-covered facility" },
  { value: "FRAUD_SUSPECTED",        label: "Fraud suspected" },
  { value: "OTHER",                  label: "Other (see notes)" },
];

interface Props {
  preauthId: string;
  estimatedCost: number;
  serviceType: string;
  currentStatus: string;
}

export function PreAuthAdjudicationForm({ preauthId, estimatedCost, serviceType, currentStatus }: Props) {
  const [state, action, pending] = useActionState(adjudicatePreAuthAction, null);
  const [decision, setDecision] = useState<"APPROVE_FULL" | "APPROVE_PARTIAL" | "DECLINE">("APPROVE_FULL");

  const isApprove   = decision !== "DECLINE";
  const isPartial   = decision === "APPROVE_PARTIAL";

  // Stage 1: inpatient pre-auths in SUBMITTED state require medical review first
  const needsMedicalReview =
    MEDICAL_REVIEW_TYPES.includes(serviceType) && currentStatus === "SUBMITTED";

  // If in Stage 1, render the medical review escalation UI
  if (needsMedicalReview) {
    return (
      <div className="bg-white border-2 border-[#17A2B8]/30 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-bold text-avenue-text-heading font-heading flex items-center gap-2 mb-3">
          <Stethoscope size={20} className="text-[#17A2B8]" />
          Stage 1 — Medical Review Required
        </h3>
        <p className="text-sm text-avenue-text-body mb-5">
          This is an <strong>{serviceType.replace(/_/g, " ").toLowerCase()}</strong> pre-authorization.
          It requires a clinical medical review before a final approval or decline decision can be made.
          Send it for medical review first, then a clinician will complete Stage 2.
        </p>
        <div className="flex gap-3">
          <form action={requestMedicalReviewAction}>
            <input type="hidden" name="preauthId" value={preauthId} />
            <button
              type="submit"
              className="flex items-center gap-2 bg-[#17A2B8] hover:bg-[#138496] text-white px-6 py-2.5 rounded-full font-semibold transition-colors shadow-sm"
            >
              <Stethoscope size={16} />
              Send for Medical Review
            </button>
          </form>
          <p className="text-xs text-avenue-text-muted self-center">
            Status will change to <strong>Under Review</strong> and Stage 2 adjudication will become available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-avenue-indigo/20 rounded-lg p-6 shadow-sm">
      <h3 className="text-lg font-bold text-avenue-text-heading font-heading flex items-center gap-2 mb-2">
        <ChevronDown size={20} className="text-avenue-indigo" />
        {MEDICAL_REVIEW_TYPES.includes(serviceType) ? "Stage 2 — Final Adjudication" : "Adjudicate Pre-Authorization"}
      </h3>
      {MEDICAL_REVIEW_TYPES.includes(serviceType) && (
        <p className="text-xs text-avenue-text-muted mb-4">
          Medical review complete. Submit the final approval or decline decision below.
        </p>
      )}

      {state?.error && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={action} className="space-y-5">
        <input type="hidden" name="preauthId" value={preauthId} />
        <input type="hidden" name="decision"  value={decision} />

        {/* Decision selector */}
        <div>
          <label className={labelCls}>Decision *</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "APPROVE_FULL",    label: "Approve (Full)",    icon: CheckCircle2, color: "text-[#28A745]", ring: "border-[#28A745]/40 bg-[#28A745]/5" },
              { id: "APPROVE_PARTIAL", label: "Approve (Partial)", icon: CheckCircle2, color: "text-[#FFC107]", ring: "border-[#FFC107]/50 bg-[#FFC107]/5" },
              { id: "DECLINE",         label: "Decline",           icon: XCircle,      color: "text-[#DC3545]", ring: "border-[#DC3545]/40 bg-[#DC3545]/5" },
            ].map(opt => {
              const Icon = opt.icon;
              const active = decision === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDecision(opt.id as typeof decision)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-semibold transition-colors ${
                    active ? `${opt.ring} ${opt.color}` : "border-[#EEEEEE] text-avenue-text-muted hover:border-[#CCCCCC]"
                  }`}
                >
                  <Icon size={16} className={active ? opt.color : "text-[#CCCCCC]"} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Approve fields */}
        {isApprove && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                Approved Amount (KES) {isPartial && <span className="text-[#FFC107] font-normal">— partial</span>}
              </label>
              <input
                name="approvedAmount"
                type="number"
                step="0.01"
                min="1"
                required
                defaultValue={estimatedCost}
                readOnly={!isPartial}
                className={inputCls + (isPartial ? "" : " bg-[#F8F9FA] cursor-not-allowed")}
              />
              {!isPartial && (
                <p className="text-[10px] text-avenue-text-muted mt-1">Full estimated amount will be approved.</p>
              )}
            </div>
            <div>
              <label className={labelCls}>Validity Period (days)</label>
              <input
                name="validDays"
                type="number"
                min="1"
                max="365"
                defaultValue={30}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {/* Decline fields */}
        {!isApprove && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Decline Reason *</label>
              <select required name="declineReasonCode" className={inputCls}>
                <option value="">Select reason…</option>
                {DECLINE_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Notes — always visible */}
        <div>
          <label className={labelCls}>
            {isApprove ? "Notes (optional)" : "Additional Notes"}
          </label>
          <textarea
            name="declineNotes"
            rows={3}
            className={inputCls + " resize-none"}
            placeholder={isApprove ? "Any conditions or instructions for the provider…" : "Explain the decline reason in detail…"}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-full font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-white ${
              decision === "DECLINE"
                ? "bg-[#DC3545] hover:bg-[#C82333]"
                : decision === "APPROVE_PARTIAL"
                ? "bg-[#856404] hover:bg-[#705407]"
                : "bg-[#28A745] hover:bg-[#218838]"
            }`}
          >
            {pending ? "Submitting…" : decision === "DECLINE" ? "Submit Decline" : "Submit Approval"}
          </button>
        </div>
      </form>
    </div>
  );
}
