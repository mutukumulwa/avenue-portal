"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgePaymentQueryAction, requestInfoPaymentQueryAction, resolvePaymentQueryAction, rejectPaymentQueryAction } from "../actions";

/**
 * F6.11 — finance actions on a payment query. Shows only the transitions legal from
 * the current status; each is version-guarded server-side (a stale action refreshes).
 * None changes a claim decision (D17).
 */
export function FinanceQueryActions({ id, status, version }: { id: string; status: string; version: number }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [explanation, setExplanation] = useState("");
  const [code, setCode] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canAck = ["OPEN", "PROVIDER_RESPONDED"].includes(status);
  const canInfo = ["OPEN", "ACKNOWLEDGED", "PROVIDER_RESPONDED"].includes(status);
  const canResolve = ["ACKNOWLEDGED", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"].includes(status);
  const canReject = ["OPEN", "ACKNOWLEDGED", "INFORMATION_REQUIRED", "PROVIDER_RESPONDED"].includes(status);
  if (!canAck && !canInfo && !canResolve && !canReject) return null;

  async function run(fn: () => Promise<{ ok?: true; error?: string; refresh?: boolean }>) {
    setError(null);
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res?.ok || res?.refresh) router.refresh();
    if (res?.error) setError(res.error);
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-4">
      <h2 className="text-sm font-bold text-brand-text-heading">Actions</h2>
      <div className="flex flex-wrap gap-2">
        {canAck && (
          <button type="button" disabled={pending} onClick={() => run(() => acknowledgePaymentQueryAction({ id, expectedVersion: version }))} className="rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-sm font-semibold hover:bg-[#F8F9FA] disabled:opacity-60">Acknowledge</button>
        )}
      </div>

      {canInfo && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => requestInfoPaymentQueryAction({ id, expectedVersion: version, prompt })); }} className="space-y-2">
          <label htmlFor="pq-info" className="block text-[11px] font-bold uppercase text-brand-text-muted">Request information</label>
          <input id="pq-info" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="w-full border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" placeholder="What do you need from the provider?" />
          <button type="submit" disabled={pending || !prompt.trim()} className="rounded-lg bg-[#FFC107] px-3 py-1.5 text-sm font-semibold text-[#333] disabled:opacity-60">Request info</button>
        </form>
      )}

      {(canResolve || canReject) && (
        <div className="space-y-2 border-t border-[#EEEEEE] pt-3">
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value)} className="border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" placeholder="Resolution code (optional)" aria-label="Resolution code" />
            <input value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className="border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" placeholder="Internal note (not shown to provider)" aria-label="Internal note" />
          </div>
          <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} className="w-full border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" placeholder="Explanation shown to the provider" aria-label="Explanation" />
          <div className="flex flex-wrap gap-2">
            {canResolve && <button type="button" disabled={pending || !explanation.trim()} onClick={() => run(() => resolvePaymentQueryAction({ id, expectedVersion: version, code, explanation, internalNote }))} className="rounded-lg bg-[#28A745] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">Resolve</button>}
            {canReject && <button type="button" disabled={pending || !explanation.trim()} onClick={() => run(() => rejectPaymentQueryAction({ id, expectedVersion: version, code, explanation }))} className="rounded-lg border border-[#DC3545]/40 px-3 py-1.5 text-sm font-semibold text-[#DC3545] hover:bg-[#DC3545]/5 disabled:opacity-60">Reject</button>}
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-[#DC3545]">{error}</p>}
    </div>
  );
}
