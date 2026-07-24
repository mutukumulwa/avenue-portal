"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle, AlertTriangle } from "lucide-react";
import { withdrawProviderClaimAction } from "./actions";

interface ReasonOption {
  code: string;
  label: string;
}

/**
 * F5.6 — guarded provider claim-withdrawal control. Rendered by the claim detail
 * page ONLY when the server computed the action is allowed (server-computed allowed
 * action). Confirmation is an accessible alert dialog stating the permanent,
 * immutable-history consequence; a catalog reason is required; the confirm is
 * disabled until a reason is chosen and while the request is in flight (double-click
 * safe — the service is idempotent as a backstop). A stale/decided claim surfaces the
 * server's message and refreshes so the actor sees the current state.
 */
export function WithdrawClaimButton({
  claimId,
  claimNumber,
  reasons,
}: {
  claimId: string;
  claimNumber: string;
  reasons: ReasonOption[];
}) {
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const selectRef = useRef<HTMLSelectElement>(null);
  const titleId = useId();
  const descId = useId();

  function close() {
    setOpen(false);
    setError(null);
    setReasonCode("");
    setNote("");
  }

  // Move focus into the dialog when it opens; close on Escape (ignored mid-request).
  useEffect(() => {
    if (!open) return;
    selectRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, pending]);

  function confirm() {
    if (!reasonCode || pending) return;
    setError(null);
    start(async () => {
      const res = await withdrawProviderClaimAction({ claimId, reasonCode, note: note.trim() || undefined });
      if (res?.error) {
        setError(res.error);
        if (res.refresh) router.refresh(); // stale — resync to the current claim state
        return;
      }
      close();
      router.refresh(); // reflect the WITHDRAWN status and drop the action
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-[#DC3545]/40 px-3 py-1.5 text-xs font-semibold text-[#DC3545] hover:bg-[#FDECEA]"
      >
        <XCircle size={14} /> Withdraw claim
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => { if (!pending) close(); }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[#EEEEEE] bg-[#FDECEA] px-6 py-4">
              <AlertTriangle size={18} className="text-[#DC3545]" />
              <h2 id={titleId} className="font-heading font-bold text-brand-text-heading">Withdraw claim {claimNumber}?</h2>
            </div>

            <div className="space-y-4 px-6 py-5">
              <p id={descId} className="text-sm text-brand-text-body">
                Withdrawing marks this claim <strong>WITHDRAWN</strong> — it will not be adjudicated or paid.
                This is permanent: the claim stays in your history and cannot be reinstated. If you need to refile,
                submit a corrected claim instead.
              </p>

              {error && (
                <div className="flex items-start gap-2 text-sm text-[#DC3545]" role="alert">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor={`${titleId}-reason`} className="mb-1 block text-xs font-bold uppercase text-brand-text-muted">Reason *</label>
                <select
                  id={`${titleId}-reason`}
                  ref={selectRef}
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  className="w-full rounded-lg border border-[#EEEEEE] px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none"
                >
                  <option value="">Select a reason…</option>
                  {reasons.map((r) => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${titleId}-note`} className="mb-1 block text-xs font-bold uppercase text-brand-text-muted">Note (optional)</label>
                <textarea
                  id={`${titleId}-note`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={280}
                  placeholder="Brief context (no clinical details)."
                  className="w-full resize-none rounded-lg border border-[#EEEEEE] px-3 py-2 text-sm focus:border-brand-indigo focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-brand-text-body hover:bg-[#F4F4F4] disabled:opacity-60"
                >
                  Keep claim
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || !reasonCode}
                  className="rounded-full bg-[#DC3545] px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Withdrawing…" : "Withdraw claim"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
