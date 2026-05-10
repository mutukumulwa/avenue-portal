"use client";

import { useActionState, useState } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { approveReinstatementAction, declineReinstatementAction } from "./actions";

export function ReinstatementDecisionPanel({ requestId }: { requestId: string }) {
  const [mode, setMode] = useState<"idle" | "approve" | "decline">("idle");

  const [approveState, approveAction, approving] = useActionState(approveReinstatementAction, null);
  const [declineState, declineAction, declining] = useActionState(declineReinstatementAction, null);

  if (approveState?.success || declineState?.success) {
    return (
      <span className="text-xs font-bold text-[#28A745]">Done — page will refresh.</span>
    );
  }

  if (mode === "idle") {
    return (
      <div className="flex gap-2">
        <button onClick={() => setMode("approve")}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-[#28A745]/10 text-[#28A745] rounded-full hover:bg-[#28A745] hover:text-white transition-colors">
          <CheckCircle size={12} /> Approve
        </button>
        <button onClick={() => setMode("decline")}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-[#DC3545]/10 text-[#DC3545] rounded-full hover:bg-[#DC3545] hover:text-white transition-colors">
          <XCircle size={12} /> Decline
        </button>
      </div>
    );
  }

  if (mode === "approve") {
    return (
      <form action={approveAction} className="flex flex-col gap-2 pt-1">
        <input type="hidden" name="requestId" value={requestId} />
        {approveState?.error && <p className="text-xs text-[#DC3545]">{approveState.error}</p>}
        <label className="flex items-center gap-2 text-xs text-avenue-text-body">
          <input type="checkbox" name="resetWaitingPeriod" />
          Reset waiting period from today
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={approving}
            className="px-3 py-1.5 text-xs font-bold bg-[#28A745] text-white rounded-full disabled:opacity-60">
            {approving ? "Approving…" : "Confirm Approve"}
          </button>
          <button type="button" onClick={() => setMode("idle")} className="text-xs text-avenue-text-muted hover:underline">Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <form action={declineAction} className="flex flex-col gap-2 pt-1">
      <input type="hidden" name="requestId" value={requestId} />
      {declineState?.error && <p className="text-xs text-[#DC3545]">{declineState.error}</p>}
      <input
        name="declineReason" required placeholder="Reason for declining…"
        className="border border-[#EEEEEE] rounded px-2 py-1 text-xs focus:outline-none focus:border-avenue-indigo"
      />
      <div className="flex gap-2">
        <button type="submit" disabled={declining}
          className="px-3 py-1.5 text-xs font-bold bg-[#DC3545] text-white rounded-full disabled:opacity-60">
          {declining ? "Declining…" : "Confirm Decline"}
        </button>
        <button type="button" onClick={() => setMode("idle")} className="text-xs text-avenue-text-muted hover:underline">Cancel</button>
      </div>
    </form>
  );
}
