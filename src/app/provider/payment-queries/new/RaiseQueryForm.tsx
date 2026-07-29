"use client";

import { useState } from "react";
import { raisePaymentQueryAction } from "../actions";

const CATEGORIES = ["MISSING_PAYMENT", "SHORT_PAYMENT", "WRONG_AMOUNT", "WRONG_REFERENCE", "DUPLICATE_PAYMENT", "UNIDENTIFIED_PAYMENT", "OTHER"] as const;

export function RaiseQueryForm({ settlementBatchId, currency }: { settlementBatchId: string; currency: string }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("SHORT_PAYMENT");
  const [amount, setAmount] = useState("");
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const res = await raisePaymentQueryAction({
      settlementBatchId,
      category,
      discrepancyAmount: amount ? Number(amount) : undefined,
      discrepancyCurrency: amount ? currency : undefined,
      narrative,
      idempotencyKey,
    });
    if (res?.error) {
      setError(res.error);
      setPending(false);
    }
    // success ⇒ the action redirects to the new query
  }

  return (
    <form onSubmit={submit} className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-4 max-w-xl">
      <div>
        <label htmlFor="pq-category" className="block text-[11px] font-bold uppercase text-brand-text-muted mb-1">Category</label>
        <select id="pq-category" value={category} onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])} className="w-full border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="pq-amount" className="block text-[11px] font-bold uppercase text-brand-text-muted mb-1">Discrepancy amount ({currency}) — optional</label>
        <input id="pq-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label htmlFor="pq-narrative" className="block text-[11px] font-bold uppercase text-brand-text-muted mb-1">Describe the discrepancy</label>
        <textarea id="pq-narrative" required value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={4} className="w-full border border-[#DDDDDD] rounded-lg px-3 py-2 text-sm" />
      </div>
      {error && <p role="alert" className="text-sm text-[#DC3545]">{error}</p>}
      <button type="submit" disabled={pending || !narrative.trim()} className="rounded-lg bg-brand-indigo px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Raising…" : "Raise query"}
      </button>
    </form>
  );
}
