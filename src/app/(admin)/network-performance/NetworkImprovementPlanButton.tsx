"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createImprovementPlanFromWorkspaceAction } from "./actions";

/**
 * PNOS F8.6 — open a HUMAN improvement plan for a provider (F7.7). This is the only
 * mutation in the workspace; it never touches a rate/tier/status.
 */
export function NetworkImprovementPlanButton({ providerId, providerName, metricKey }: { providerId: string; providerName: string; metricKey: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`Improve ${metricKey.replace(/^[A-Z]\d+_/, "").replace(/_/g, " ")}`);
  const [objective, setObjective] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    const res = await createImprovementPlanFromWorkspaceAction({ providerId, title, objective, targetDate, baselineMetricRef: metricKey });
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setOpen(false); router.refresh();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="text-xs font-semibold text-brand-indigo underline">Improvement plan</button>;

  return (
    <form onSubmit={submit} className="space-y-1.5 min-w-[16rem]" aria-label={`Improvement plan for ${providerName}`}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Plan title" className="block w-full rounded border border-[#DDDDDD] px-2 py-1 text-xs" />
      <input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="objective" aria-label="Objective" className="block w-full rounded border border-[#DDDDDD] px-2 py-1 text-xs" />
      <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} aria-label="Target date" className="block w-full rounded border border-[#DDDDDD] px-2 py-1 text-xs" />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="text-xs font-semibold text-white bg-brand-indigo rounded px-2 py-1 disabled:opacity-50">{busy ? "…" : "Create"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-brand-text-muted">Cancel</button>
      </div>
      {error && <p className="text-xs text-brand-error" role="alert">{error}</p>}
    </form>
  );
}
