"use client";

import { useActionState } from "react";
import { dismissCaseAction, escalateCaseAction } from "./actions";
import { ShieldCheck, ArrowUpCircle, Loader2, AlertTriangle } from "lucide-react";

export function FraudCaseActions({
  alertId,
  claimId,
  isResolved,
  existingNotes,
}: {
  alertId:       string;
  claimId:       string;
  isResolved:    boolean;
  existingNotes: string | null;
}) {
  const boundDismiss   = dismissCaseAction.bind(null, alertId);
  const boundEscalate  = escalateCaseAction.bind(null, alertId, claimId);

  const [dismissState,  dismissAction,  dismissPending]  = useActionState(boundDismiss,  null);
  const [escalateState, escalateAction, escalatePending] = useActionState(boundEscalate, null);

  if (isResolved) {
    return (
      <div className="flex items-center gap-2 bg-[#28A745]/5 border border-[#28A745]/20 rounded-lg px-4 py-3">
        <ShieldCheck size={16} className="text-[#28A745] shrink-0" />
        <div>
          <p className="text-sm font-bold text-[#28A745]">Alert resolved</p>
          {existingNotes && <p className="text-xs text-avenue-text-muted mt-0.5">{existingNotes}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Dismiss */}
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#28A745]" />
          <h3 className="font-bold text-avenue-text-heading text-sm">Dismiss — False Positive</h3>
        </div>
        <p className="text-xs text-avenue-text-muted">
          Mark this alert as a false positive. The claim will continue processing normally.
        </p>
        {dismissState?.error && (
          <p className="text-xs text-[#DC3545] font-semibold">{dismissState.error}</p>
        )}
        <form action={dismissAction} className="space-y-3">
          <textarea
            name="reason"
            required
            rows={3}
            placeholder="Explain why this alert is a false positive…"
            className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-avenue-indigo resize-none text-avenue-text-heading"
          />
          <button
            type="submit"
            disabled={dismissPending}
            className="w-full bg-[#28A745] text-white text-sm font-bold py-2 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {dismissPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            {dismissPending ? "Saving…" : "Dismiss Alert"}
          </button>
        </form>
      </div>

      {/* Escalate */}
      <div className="bg-white border border-[#DC3545]/20 rounded-lg p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <ArrowUpCircle size={16} className="text-[#DC3545]" />
          <h3 className="font-bold text-avenue-text-heading text-sm">Escalate to Fraud Review</h3>
        </div>
        <p className="text-xs text-avenue-text-muted">
          Place the claim on hold and route it to formal fraud investigation. Payment will be blocked until resolved.
        </p>
        {escalateState?.error && (
          <p className="text-xs text-[#DC3545] font-semibold">{escalateState.error}</p>
        )}
        <form action={escalateAction} className="space-y-3">
          <textarea
            name="notes"
            required
            rows={3}
            placeholder="Investigation notes — what supports escalation?…"
            className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#DC3545] resize-none text-avenue-text-heading"
          />
          <div className="flex items-start gap-2 bg-[#FFF8E1] border border-[#FFC107]/30 rounded-lg px-3 py-2">
            <AlertTriangle size={13} className="text-[#856404] mt-0.5 shrink-0" />
            <p className="text-[11px] text-[#856404]">This will move the claim to UNDER_REVIEW and block payment until a fraud officer closes the case.</p>
          </div>
          <button
            type="submit"
            disabled={escalatePending}
            className="w-full bg-[#DC3545] text-white text-sm font-bold py-2 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {escalatePending ? <Loader2 size={14} className="animate-spin" /> : <ArrowUpCircle size={14} />}
            {escalatePending ? "Escalating…" : "Escalate & Block Payment"}
          </button>
        </form>
      </div>
    </div>
  );
}
