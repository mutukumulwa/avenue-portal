"use client";

import { useState } from "react";
import { AlertCircle, Undo2 } from "lucide-react";
import { withdrawLeaverRequestAction, type LeaverResult } from "../../roster/[memberId]/leaver/actions";

/**
 * UAT-HF P08.01 (DEF-004) — "cancel/withdraw before approval".
 *
 * Without this, an HR manager who reports the wrong person has to ask the TPA to
 * reject their own request. That works, but it reads in the audit trail as the
 * administrator refusing the employer rather than the employer correcting
 * themselves — and it costs a round trip for something the employer knows first.
 *
 * Two-step by design: withdrawing is not destructive, but it is visible to the
 * administrator, and a reason is what makes the trail legible later.
 */
export function WithdrawRequest({ endorsementId }: { endorsementId: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<LeaverResult>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const error = result?.ok === false ? result.error : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(undefined);
    setSubmitting(true);
    try {
      const r = await withdrawLeaverRequestAction(new FormData(e.currentTarget));
      setResult(r);
      if (r === undefined) setOpen(false);
    } catch {
      setResult({ ok: false, error: "The request could not be withdrawn. Try again when the connection is stable." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-text-muted border border-[#EEEEEE] px-4 py-2 rounded-full hover:bg-[#F8F9FA] hover:text-brand-text-heading transition-colors"
      >
        <Undo2 size={14} /> Withdraw this request
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#F8F9FA] border border-[#EEEEEE] rounded-[8px] p-4 space-y-3">
      <input type="hidden" name="endorsementId" value={endorsementId} />
      <div>
        <label htmlFor="withdraw-reason" className="block text-xs font-bold text-brand-text-muted uppercase mb-1">
          Why are you withdrawing this? *
        </label>
        <input
          id="withdraw-reason"
          name="reason"
          type="text"
          required
          maxLength={200}
          placeholder="e.g. Resignation retracted, wrong employee selected"
          className="w-full border border-[#EEEEEE] rounded-[8px] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo focus:border-brand-indigo bg-white"
        />
        <p className="text-[11px] text-brand-text-muted mt-1">
          Your scheme administrator sees this. Nothing about the member&apos;s cover changes either way.
        </p>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-[#DC3545]">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(undefined); }}
          className="px-4 py-1.5 text-sm font-semibold text-brand-text-muted hover:text-brand-text-heading transition-colors"
        >
          Keep it
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-1.5 text-sm font-bold text-white bg-brand-indigo rounded-full hover:bg-brand-secondary transition-colors disabled:opacity-60"
        >
          {submitting ? "Withdrawing…" : "Withdraw request"}
        </button>
      </div>
    </form>
  );
}
