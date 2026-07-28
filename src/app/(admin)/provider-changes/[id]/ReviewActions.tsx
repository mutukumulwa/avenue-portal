"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startReviewAction, requestInfoAction, approveAction, rejectAction, verifyBankAction, activateBankAction } from "../actions";

/**
 * PNOS F7.6 — TPA operator controls. Which controls render is server-computed from
 * the request status/category (a control the status doesn't allow is never shown);
 * the service still enforces maker≠checker, the independent verify, and the freeze,
 * so a hand-crafted call cannot bypass a control. Version token ⇒ stale-safe.
 */
const TERMINAL = ["APPROVED", "REJECTED", "WITHDRAWN"];

export function ReviewActions({ id, version, status, isBank, verified, activated }: { id: string; version: number; status: string; isBank: boolean; verified: boolean; activated: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const router = useRouter();

  async function run(fn: () => Promise<{ ok?: true; error?: string; refresh?: boolean }>) {
    setError(null); setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res?.error) { setError(res.error); if (res.refresh) router.refresh(); return; }
    router.refresh();
  }

  const canStart = ["SUBMITTED", "PROVIDER_RESPONDED"].includes(status);
  const canRequestInfo = ["SUBMITTED", "UNDER_REVIEW", "PROVIDER_RESPONDED"].includes(status);
  const canApprove = ["UNDER_REVIEW", "PROVIDER_RESPONDED", "PENDING_CHECKER"].includes(status);
  const canReject = !TERMINAL.includes(status);
  const canVerify = isBank && status === "APPROVED" && !verified;
  const canActivate = isBank && status === "APPROVED" && verified && !activated;

  return (
    <section className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-3">
      <h2 className="text-[11px] font-bold uppercase text-brand-text-muted">Review actions</h2>
      <div className="flex flex-wrap gap-2">
        {canStart && <button onClick={() => run(() => startReviewAction({ id, expectedVersion: version }))} disabled={busy} className="text-sm font-semibold text-brand-indigo border border-brand-indigo/30 rounded-lg px-3 py-1.5 disabled:opacity-50">Start review</button>}
        {canApprove && <button onClick={() => run(() => approveAction({ id, expectedVersion: version }))} disabled={busy} className="text-sm font-semibold text-white bg-[#28A745] rounded-lg px-3 py-1.5 disabled:opacity-50">{status === "PENDING_CHECKER" ? "Approve (checker)" : "Approve"}</button>}
        {canActivate && <button onClick={() => run(() => activateBankAction({ id, expectedVersion: version }))} disabled={busy} className="text-sm font-semibold text-white bg-brand-indigo rounded-lg px-3 py-1.5 disabled:opacity-50">Activate bank change</button>}
      </div>

      {canRequestInfo && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => requestInfoAction({ id, expectedVersion: version, prompt })); }} className="space-y-1.5">
          <label className="text-xs font-semibold text-brand-text-heading" htmlFor="mdc-info">Request information</label>
          <div className="flex gap-2">
            <input id="mdc-info" value={prompt} onChange={(e) => setPrompt(e.target.value)} className="flex-1 rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-sm" />
            <button type="submit" disabled={busy || !prompt.trim()} className="text-sm font-semibold text-brand-text-body border border-[#DDDDDD] rounded-lg px-3 py-1.5 disabled:opacity-50">Ask</button>
          </div>
        </form>
      )}

      {canVerify && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => verifyBankAction({ id, expectedVersion: version, method, reference })); }} className="space-y-1.5 border-t border-[#F4F4F4] pt-3">
          <p className="text-xs font-semibold text-brand-text-heading">Independent verification (out-of-band)</p>
          <div className="flex flex-wrap gap-2">
            <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="method (e.g. PHONE_CALLBACK)" aria-label="Verification method" className="flex-1 min-w-[10rem] rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-sm" />
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="reference" aria-label="Verification reference" className="flex-1 min-w-[10rem] rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-sm" />
            <button type="submit" disabled={busy || !method.trim() || !reference.trim()} className="text-sm font-semibold text-white bg-[#6f42c1] rounded-lg px-3 py-1.5 disabled:opacity-50">Record verification</button>
          </div>
          <p className="text-[11px] text-brand-text-muted">Record only the verification method + reference. Never enter the full account number.</p>
        </form>
      )}

      {canReject && (
        <form onSubmit={(e) => { e.preventDefault(); run(() => rejectAction({ id, expectedVersion: version, explanation: rejectReason })); }} className="space-y-1.5 border-t border-[#F4F4F4] pt-3">
          <label className="text-xs font-semibold text-brand-text-heading" htmlFor="mdc-reject">Reject</label>
          <div className="flex gap-2">
            <input id="mdc-reject" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="reason" className="flex-1 rounded-lg border border-[#DDDDDD] px-3 py-1.5 text-sm" />
            <button type="submit" disabled={busy || !rejectReason.trim()} className="text-sm font-semibold text-brand-error border border-brand-error/30 rounded-lg px-3 py-1.5 disabled:opacity-50">Reject</button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-brand-error" role="alert">{error}</p>}
    </section>
  );
}
