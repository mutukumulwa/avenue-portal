"use client";

import { useState, useTransition } from "react";
import { PlusCircle, AlertCircle } from "lucide-react";
import { amendProviderPreauthAction } from "./actions";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo";
const labelCls = "text-[11px] font-bold text-brand-text-muted uppercase block mb-1";

export function AmendPreauthForm({ parentPreAuthId }: { parentPreAuthId: string }) {
  const [open, setOpen] = useState(false);
  const [procCode, setProcCode] = useState("");
  const [procDesc, setProcDesc] = useState("");
  const [additionalCost, setAdditionalCost] = useState(0);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const res = await amendProviderPreauthAction({
        parentPreAuthId,
        additionalCost,
        additionalProcedureCode: procCode,
        additionalProcedureDescription: procDesc,
        clinicalNotes,
      });
      if (res?.error) setError(res.error);
      // success redirects server-side to the amendment
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-brand-indigo/40 px-3 py-1.5 text-xs font-semibold text-brand-indigo hover:bg-brand-indigo/5"
      >
        <PlusCircle size={14} /> Amend (request more)
      </button>
    );
  }

  return (
    <div className="w-full bg-brand-indigo/5 border border-brand-indigo/30 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-brand-indigo">Request additional cover on this approved pre-authorization</p>
      {error && (
        <div className="flex items-start gap-2 text-sm text-[#DC3545]" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>CPT (optional)</label>
          <input className={inputCls} value={procCode} onChange={(e) => setProcCode(e.target.value)} placeholder="CPT code" />
        </div>
        <div>
          <label className={labelCls}>Additional service</label>
          <input className={inputCls} value={procDesc} onChange={(e) => setProcDesc(e.target.value)} placeholder="e.g. Extra physiotherapy sessions" />
        </div>
        <div>
          <label className={labelCls}>Additional cost (UGX)</label>
          <input type="number" min={0} className={inputCls} value={additionalCost || ""} onChange={(e) => setAdditionalCost(Number(e.target.value))} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Clinical justification (optional)</label>
        <textarea className={`${inputCls} min-h-[70px]`} value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={() => { setOpen(false); setError(null); }} className="rounded-full px-3 py-1.5 text-xs font-semibold text-brand-text-body hover:bg-white">
          Dismiss
        </button>
        <button onClick={submit} disabled={pending} className="rounded-full bg-brand-indigo px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-secondary disabled:opacity-60">
          {pending ? "Submitting…" : "Submit amendment"}
        </button>
      </div>
    </div>
  );
}
