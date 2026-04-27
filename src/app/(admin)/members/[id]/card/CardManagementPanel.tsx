"use client";

import { useState, useTransition, useActionState } from "react";
import { CreditCard, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { issueCardAction, requestCardReplacementAction } from "./actions";

interface Log { id: string; action: string; description: string; createdAt: string }

interface Props {
  memberId: string;
  currentCardNumber: string | null;
  activityLogs: Log[];
}

const ACTION_ICON: Record<string, React.ReactNode> = {
  CARD_ISSUED:                 <CheckCircle size={13} className="text-[#28A745]" />,
  CARD_REISSUED:               <CheckCircle size={13} className="text-[#17A2B8]" />,
  CARD_REPLACEMENT_REQUESTED:  <AlertTriangle size={13} className="text-[#856404]" />,
};

export function CardManagementPanel({ memberId, currentCardNumber, activityLogs }: Props) {
  const [mode, setMode]    = useState<"idle" | "issue" | "replace">("idle");
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceDone, setReplaceDone]   = useState<string | null>(null); // invoiceId
  const [isPending, start] = useTransition();

  const boundIssue = issueCardAction.bind(null, memberId);
  const [issueState, issueAction] = useActionState(boundIssue, null);

  function handleReplace(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("memberId", memberId);
    setReplaceError(null);
    start(async () => {
      const res = await requestCardReplacementAction(fd);
      if (res.error) setReplaceError(res.error);
      else { setReplaceDone(res.invoiceId ?? "done"); setMode("idle"); }
    });
  }

  return (
    <div className="space-y-5">
      {/* Current card status */}
      <div className={`flex items-center gap-4 p-5 rounded-[8px] border shadow-sm ${currentCardNumber ? "bg-[#28A745]/5 border-[#28A745]/20" : "bg-[#FFF8E1] border-[#FFC107]/30"}`}>
        <CreditCard size={32} className={currentCardNumber ? "text-[#28A745]" : "text-[#856404]"} />
        <div>
          <p className="text-xs font-bold uppercase text-avenue-text-muted">Current Card Number</p>
          {currentCardNumber
            ? <p className="text-xl font-bold font-mono text-[#28A745] mt-0.5">{currentCardNumber}</p>
            : <p className="text-sm text-[#856404] font-semibold mt-0.5">No card issued yet</p>}
        </div>
      </div>

      {/* Success banners */}
      {issueState?.success && (
        <div className="flex items-center gap-2 bg-[#28A745]/5 border border-[#28A745]/20 rounded-lg px-4 py-3 text-sm text-[#28A745]">
          <CheckCircle size={15} /> Card issued successfully.
        </div>
      )}
      {replaceDone && (
        <div className="bg-[#FFF8E1] border border-[#FFC107]/40 rounded-lg px-4 py-3 text-sm text-[#856404]">
          <p className="font-bold">Replacement fee invoice raised.</p>
          <p className="text-xs mt-0.5">Once payment is confirmed, use <strong>Issue / Re-issue Card</strong> below to assign the new card number.</p>
        </div>
      )}

      {/* Action buttons */}
      {mode === "idle" && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMode("issue")}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary transition-colors">
            <CreditCard size={13} /> {currentCardNumber ? "Re-issue Card" : "Issue Card"}
          </button>
          {currentCardNumber && (
            <button onClick={() => setMode("replace")}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border border-[#FFC107]/50 text-[#856404] hover:bg-[#FFF8E1] transition-colors">
              <AlertTriangle size={13} /> Report Lost / Request Replacement
            </button>
          )}
        </div>
      )}

      {/* Issue / Re-issue form */}
      {mode === "issue" && (
        <form action={issueAction} className="bg-[#F8FAFF] border border-avenue-indigo/20 rounded-lg p-4 space-y-3">
          <p className="text-sm font-bold text-avenue-text-heading">{currentCardNumber ? "Re-issue Card" : "Issue New Card"}</p>
          {issueState?.error && <p className="text-xs text-[#DC3545]">{issueState.error}</p>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">New Card Number</label>
            <input name="cardNumber" type="text" required placeholder="e.g. AV-2025-00123"
              className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" className="text-xs font-bold px-5 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary transition-colors">
              Confirm Issuance
            </button>
          </div>
        </form>
      )}

      {/* Replacement request form */}
      {mode === "replace" && (
        <form onSubmit={handleReplace} className="bg-[#FFF8E1] border border-[#FFC107]/30 rounded-lg p-4 space-y-3">
          <p className="text-sm font-bold text-avenue-text-heading flex items-center gap-2">
            <AlertTriangle size={14} className="text-[#856404]" /> Report Lost / Damaged Card
          </p>
          <p className="text-xs text-[#856404]">
            A KES 500 replacement fee invoice will be raised on the member&apos;s group.
            Once paid, use &ldquo;Re-issue Card&rdquo; to assign the new card number.
          </p>
          {replaceError && <p className="text-xs text-[#DC3545]">{replaceError}</p>}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Reason</label>
            <select name="reason" className="w-full border border-[#FFC107]/30 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFC107] bg-white">
              <option value="Lost card">Lost card</option>
              <option value="Damaged card">Damaged card</option>
              <option value="Stolen card">Stolen card</option>
              <option value="Name change">Name change</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="text-xs font-bold px-5 py-2 rounded-full bg-[#856404] text-white hover:bg-[#6d5204] disabled:opacity-50 transition-colors">
              {isPending ? "Raising Invoice…" : "Confirm — Raise Fee Invoice"}
            </button>
          </div>
        </form>
      )}

      {/* Card history */}
      {activityLogs.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEEEEE]">
            <p className="text-xs font-bold uppercase text-avenue-text-muted">Card History</p>
          </div>
          <div className="divide-y divide-[#EEEEEE]">
            {activityLogs.map(l => (
              <div key={l.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <div className="mt-0.5">{ACTION_ICON[l.action] ?? <Clock size={13} className="text-avenue-text-muted" />}</div>
                <div className="flex-1">
                  <p className="text-avenue-text-body">{l.description}</p>
                  <p className="text-xs text-avenue-text-muted mt-0.5">{new Date(l.createdAt).toLocaleString("en-KE")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
