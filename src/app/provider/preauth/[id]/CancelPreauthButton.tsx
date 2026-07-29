"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle, AlertCircle } from "lucide-react";
import { cancelProviderPreauthAction } from "./actions";

export function CancelPreauthButton({ preAuthId }: { preAuthId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function confirm() {
    setError(null);
    start(async () => {
      const res = await cancelProviderPreauthAction({ preAuthId, reason });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-[#DC3545]/40 px-3 py-1.5 text-xs font-semibold text-[#DC3545] hover:bg-[#FDECEA]"
      >
        <XCircle size={14} /> Cancel
      </button>
    );
  }

  return (
    <div className="w-full bg-[#FDECEA] border border-[#DC3545]/30 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-[#DC3545]">Cancel this pre-authorization?</p>
      {error && (
        <div className="flex items-start gap-2 text-sm text-[#DC3545]" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      <textarea
        className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo"
        placeholder="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2 justify-end">
        <button onClick={() => { setOpen(false); setError(null); }} className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-text-body hover:bg-white">
          Keep it
        </button>
        <button onClick={confirm} disabled={pending} className="rounded-full bg-[#DC3545] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {pending ? "Cancelling…" : "Confirm cancellation"}
        </button>
      </div>
    </div>
  );
}
