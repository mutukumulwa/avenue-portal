"use client";

import { useActionState, useTransition } from "react";
import { resolveComplaintAction, dismissComplaintAction, moveToInvestigatingAction } from "./actions";
import { CheckCircle2, XCircle, Search, Loader2 } from "lucide-react";

export function ComplaintDetailActions({
  complaintId,
  status,
  resolution,
}: {
  complaintId: string;
  status:      string;
  resolution:  string | null;
}) {
  const boundResolve  = resolveComplaintAction.bind(null, complaintId);
  const boundDismiss  = dismissComplaintAction.bind(null, complaintId);

  const [resolveState,  resolveAction,  resolvePending]  = useActionState(boundResolve,  null);
  const [dismissState,  dismissAction,  dismissPending]  = useActionState(boundDismiss,  null);
  const [investigatePending, startInvestigate] = useTransition();

  if (status === "RESOLVED" || status === "DISMISSED") {
    return (
      <div className={`rounded-lg p-5 border ${status === "RESOLVED" ? "bg-[#28A745]/5 border-[#28A745]/20" : "bg-[#6C757D]/5 border-[#6C757D]/20"}`}>
        <div className="flex items-center gap-2 mb-2">
          {status === "RESOLVED"
            ? <CheckCircle2 size={16} className="text-[#28A745]" />
            : <XCircle size={16} className="text-[#6C757D]" />}
          <p className={`font-bold text-sm ${status === "RESOLVED" ? "text-[#28A745]" : "text-[#6C757D]"}`}>
            Complaint {status === "RESOLVED" ? "Resolved" : "Dismissed"}
          </p>
        </div>
        {resolution && <p className="text-sm text-avenue-text-body leading-relaxed">{resolution}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {status === "OPEN" && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Search size={15} className="text-[#856404]" />
            <h3 className="font-bold text-avenue-text-heading text-sm">Begin Investigation</h3>
          </div>
          <p className="text-xs text-avenue-text-muted mb-3">
            Move the complaint to INVESTIGATING to assign ownership and track progress.
          </p>
          <button
            onClick={() => startInvestigate(() => moveToInvestigatingAction(complaintId))}
            disabled={investigatePending}
            className="w-full border border-[#FFC107] text-[#856404] text-sm font-bold py-2 rounded-full hover:bg-[#FFC107]/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {investigatePending ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {investigatePending ? "Updating…" : "Mark as Investigating"}
          </button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Resolve */}
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-[#28A745]" />
            <h3 className="font-bold text-avenue-text-heading text-sm">Mark Resolved</h3>
          </div>
          <p className="text-xs text-avenue-text-muted">Complaint has been investigated and a resolution reached.</p>
          {resolveState?.error && <p className="text-xs text-[#DC3545] font-semibold">{resolveState.error}</p>}
          <form action={resolveAction} className="space-y-3">
            <textarea
              name="resolution"
              required
              rows={3}
              placeholder="Describe the resolution and outcome…"
              className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#28A745] resize-none text-avenue-text-heading"
            />
            <button
              type="submit"
              disabled={resolvePending}
              className="w-full bg-[#28A745] text-white text-sm font-bold py-2 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {resolvePending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {resolvePending ? "Saving…" : "Mark Resolved"}
            </button>
          </form>
        </div>

        {/* Dismiss */}
        <div className="bg-white border border-[#6C757D]/20 rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <XCircle size={15} className="text-[#6C757D]" />
            <h3 className="font-bold text-avenue-text-heading text-sm">Dismiss</h3>
          </div>
          <p className="text-xs text-avenue-text-muted">Complaint is unfounded or outside scope. Provide a reason.</p>
          {dismissState?.error && <p className="text-xs text-[#DC3545] font-semibold">{dismissState.error}</p>}
          <form action={dismissAction} className="space-y-3">
            <textarea
              name="resolution"
              required
              rows={3}
              placeholder="Reason for dismissal…"
              className="w-full text-sm border border-[#EEEEEE] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6C757D] resize-none text-avenue-text-heading"
            />
            <button
              type="submit"
              disabled={dismissPending}
              className="w-full bg-[#6C757D] text-white text-sm font-bold py-2 rounded-full hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {dismissPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {dismissPending ? "Saving…" : "Dismiss Complaint"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
