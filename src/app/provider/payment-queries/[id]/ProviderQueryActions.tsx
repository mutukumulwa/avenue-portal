"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondPaymentQueryAction, withdrawPaymentQueryAction } from "../actions";

/**
 * F6.11 — provider actions on a payment query: respond to an information request
 * (only while INFORMATION_REQUIRED) and withdraw (only before resolution). Both are
 * version-guarded server-side; a stale action refreshes the page.
 */
export function ProviderQueryActions({ id, version, canRespond, canWithdraw }: { id: string; version: number; canRespond: boolean; canWithdraw: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<{ error?: string; refresh?: boolean } | void>) {
    setError(null);
    setPending(true);
    const res = await fn();
    if (res?.error) {
      setError(res.error);
      setPending(false);
      if (res.refresh) router.refresh();
    }
  }

  if (!canRespond && !canWithdraw) return null;
  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-3">
      {canRespond && (
        <form
          onSubmit={(e) => { e.preventDefault(); run(() => respondPaymentQueryAction({ id, expectedVersion: version, body })); }}
          className="space-y-2"
        >
          <label htmlFor="pq-response" className="block text-[11px] font-bold uppercase text-brand-text-muted">Respond to the information request</label>
          <textarea id="pq-response" required value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="w-full border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={pending || !body.trim()} className="rounded-lg bg-brand-indigo px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Sending…" : "Send response"}
          </button>
        </form>
      )}
      {canWithdraw && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => withdrawPaymentQueryAction({ id, expectedVersion: version }))}
          className="rounded-lg border border-[#DC3545]/40 px-4 py-2 text-sm font-semibold text-[#DC3545] hover:bg-[#DC3545]/5 disabled:opacity-60"
        >
          Withdraw query
        </button>
      )}
      {error && <p role="alert" className="text-sm text-[#DC3545]">{error}</p>}
    </div>
  );
}
