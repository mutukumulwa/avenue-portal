"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle } from "lucide-react";
import { reconsiderProviderClaimAction } from "./actions";

export interface ReconsiderLineView {
  id: string;
  description: string;
  cptCode: string | null;
  billed: number;
  allowed: number;
  payable: number;
  disallowed: number;
  safeReason: string | null;
}
interface ReasonOption { code: string; label: string; providerDescription: string }
interface LineState { selected: boolean; requested: number }

const money = (n: number, ccy: string) => `${ccy} ${n.toLocaleString("en-UG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * F5.13 — provider reconsideration form. Shows each line's FROZEN original economics + the
 * safe decline reason; the provider selects lines and enters a requested corrected allowed
 * amount; the total requested delta is computed EXACTLY; a reason + narrative + an explicit
 * declaration are required. Submits via the F5.12 service (which re-checks eligibility, so a
 * stale form is refused). No internal data is shown. Evidence upload is a follow-up (F2 flow).
 */
export function ReconsiderClaimForm({
  claimId,
  claimNumber,
  currency,
  filingDeadline,
  lines,
  reasons,
}: {
  claimId: string;
  claimNumber: string;
  currency: string;
  filingDeadline: string | null;
  lines: ReconsiderLineView[];
  reasons: ReasonOption[];
}) {
  const [rows, setRows] = useState<Record<string, LineState>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, { selected: false, requested: l.allowed }])),
  );
  const [reasonCode, setReasonCode] = useState("");
  const [narrative, setNarrative] = useState("");
  const [declared, setDeclared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [draftId] = useState(() => crypto.randomUUID());

  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);
  // The total requested delta = Σ over selected lines of max(0, requested − original allowed). Exact (2dp).
  const totalDelta = useMemo(() => {
    let t = 0;
    for (const l of lines) {
      const r = rows[l.id];
      if (r?.selected) t += Math.max(0, round2(r.requested - l.allowed));
    }
    return round2(t);
  }, [rows, lines]);

  const anySelected = lines.some((l) => rows[l.id]?.selected);
  const canSubmit = anySelected && totalDelta > 0 && !!reasonCode && narrative.trim().length > 0 && declared && !pending;
  const selectedReason = reasons.find((r) => r.code === reasonCode);

  function setRow(id: string, patch: Partial<LineState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function submit() {
    if (!canSubmit) return;
    setError(null);
    const selectedLines = lines
      .filter((l) => rows[l.id]?.selected)
      .map((l) => ({ claimLineId: l.id, requestedAllowed: round2(rows[l.id].requested) }));
    start(async () => {
      const res = await reconsiderProviderClaimAction({
        claimId,
        idempotencyKey: draftId,
        reasonCode,
        providerNarrative: narrative.trim(),
        requestedAmount: totalDelta,
        lines: selectedLines,
      });
      if (res?.error) {
        setError(res.error);
        if (res.refresh) router.refresh();
      }
    });
  }

  const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo";
  const labelCls = "text-[11px] font-bold text-brand-text-muted uppercase block mb-1";

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 space-y-6">
      <div className="rounded-lg bg-[#FFF8E1] border border-[#FFC107]/40 px-4 py-3 text-xs text-[#856404]">
        You are asking the payer to <strong>reconsider</strong> the decision on claim <strong>{claimNumber}</strong>. This does not
        change the original claim — it opens a review case. The original decision and payment remain as recorded.
        {filingDeadline && <> Filing deadline: <strong>{new Date(filingDeadline).toLocaleDateString("en-UG")}</strong>.</>}
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm" role="alert">
          <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <div>
        <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-3">Disputed lines</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Select the claim lines to reconsider and enter the corrected allowed amount for each.</caption>
            <thead className="text-[11px] uppercase text-brand-text-muted">
              <tr className="border-b border-[#EEEEEE]">
                <th scope="col" className="text-left px-2 py-2 font-bold">Dispute</th>
                <th scope="col" className="text-left px-2 py-2 font-bold">Service</th>
                <th scope="col" className="text-right px-2 py-2 font-bold">Billed</th>
                <th scope="col" className="text-right px-2 py-2 font-bold">Allowed</th>
                <th scope="col" className="text-left px-2 py-2 font-bold">Original reason</th>
                <th scope="col" className="text-right px-2 py-2 font-bold">Requested allowed</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const r = rows[l.id];
                return (
                  <tr key={l.id} className="border-b border-[#F4F4F4] last:border-0 align-top">
                    <td className="px-2 py-2.5">
                      <input type="checkbox" aria-label={`Dispute ${l.description}`} checked={r?.selected ?? false} onChange={(e) => setRow(l.id, { selected: e.target.checked })} />
                    </td>
                    <td className="px-2 py-2.5">{l.description}{l.cptCode ? <span className="text-brand-text-muted text-xs font-mono"> · {l.cptCode}</span> : ""}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs">{money(l.billed, currency)}</td>
                    <td className="px-2 py-2.5 text-right font-mono text-xs">{money(l.allowed, currency)}</td>
                    <td className="px-2 py-2.5 text-xs text-brand-text-muted">{l.safeReason ?? "—"}</td>
                    <td className="px-2 py-2.5 text-right">
                      <input
                        type="number" min={l.allowed} step="0.01"
                        aria-label={`Requested allowed for ${l.description}`}
                        disabled={!r?.selected}
                        value={r?.requested ?? l.allowed}
                        onChange={(e) => setRow(l.id, { requested: parseFloat(e.target.value) || 0 })}
                        className={`${inputCls} text-right w-28 disabled:bg-[#F7F7F7] disabled:text-brand-text-muted`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center pt-3 mt-2 border-t border-[#EEEEEE]">
          <span className="text-xs font-bold uppercase text-brand-text-muted">Total additional requested</span>
          <span className="text-lg font-bold text-brand-indigo" data-testid="total-delta">{money(totalDelta, currency)}</span>
        </div>
      </div>

      <div>
        <label htmlFor="rc-reason" className={labelCls}>Reason *</label>
        <select id="rc-reason" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} className={inputCls}>
          <option value="">Select a reason…</option>
          {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        {selectedReason && <p className="text-[11px] text-brand-text-muted mt-1">{selectedReason.providerDescription}</p>}
      </div>

      <div>
        <label htmlFor="rc-narrative" className={labelCls}>Narrative *</label>
        <textarea id="rc-narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3} maxLength={2000} placeholder="Explain why the decision should be reconsidered (no member-identifying clinical detail beyond what is needed)." className={`${inputCls} resize-none`} />
      </div>

      <label className="flex items-start gap-2 text-sm text-brand-text-body">
        <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5" />
        <span>I declare the information provided is accurate and that this claim was correctly rendered.</span>
      </label>

      <div className="flex justify-end">
        <button type="button" onClick={submit} disabled={!canSubmit} className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2.5 rounded-full font-semibold disabled:opacity-50">
          <Save size={16} /> {pending ? "Submitting…" : "Submit reconsideration"}
        </button>
      </div>
    </div>
  );
}
