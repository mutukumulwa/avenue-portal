"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondChangeAction, withdrawChangeAction } from "../actions";

/**
 * PNOS F7.6 — the provider's own actions on a change request: respond to an
 * information request, or withdraw. Server-computed availability (the page only
 * renders the controls the current status allows); stale/replay safe via the
 * version token + a refresh on conflict.
 */
export function ChangeRequestActions({ id, version, canRespond, canWithdraw }: { id: string; version: number; canRespond: boolean; canWithdraw: boolean }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "respond" | "withdraw">(null);
  const router = useRouter();

  async function respond(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) { setError("Enter a response."); return; }
    setError(null); setPending("respond");
    const res = await respondChangeAction({ id, expectedVersion: version, body });
    if (res?.error) { setError(res.error); setPending(null); if (res.refresh) router.refresh(); }
  }
  async function withdraw() {
    setError(null); setPending("withdraw");
    const res = await withdrawChangeAction({ id, expectedVersion: version });
    if (res?.error) { setError(res.error); setPending(null); if (res.refresh) router.refresh(); }
  }

  return (
    <section className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-3">
      {canRespond && (
        <form onSubmit={respond} className="space-y-2">
          <label className="block text-sm font-semibold text-brand-text-heading" htmlFor="mdc-respond">Respond to the information request</label>
          <textarea id="mdc-respond" value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="block w-full rounded-lg border border-[#DDDDDD] px-3 py-2 text-sm" />
          <button type="submit" disabled={pending !== null} className="text-sm font-semibold text-white bg-brand-indigo rounded-lg px-4 py-2 disabled:opacity-50">{pending === "respond" ? "Sending…" : "Send response"}</button>
        </form>
      )}
      {canWithdraw && (
        <button onClick={withdraw} disabled={pending !== null} className="text-sm font-semibold text-brand-error border border-brand-error/30 rounded-lg px-4 py-2 disabled:opacity-50">{pending === "withdraw" ? "Withdrawing…" : "Withdraw request"}</button>
      )}
      {error && <p className="text-sm text-brand-error" role="alert">{error}</p>}
    </section>
  );
}
