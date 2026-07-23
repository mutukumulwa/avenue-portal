"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { reprocessClaimAction } from "./automation-actions";

/** F6.3: authorized reprocess — new run, never edits old history. */
export function ReprocessButton({ claimId }: { claimId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      {msg && <span className="text-[11px] text-brand-text-muted">{msg}</span>}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const res = await reprocessClaimAction(claimId, "MANUAL_REPROCESS");
            setMsg(res.ok ? (res.reused ? "Existing run resumed." : "Reprocessed.") : res.error);
          })
        }
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-indigo border border-brand-indigo/40 rounded-full px-3 py-1 hover:bg-brand-indigo/5 disabled:opacity-50"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} /> Reprocess
      </button>
    </span>
  );
}
