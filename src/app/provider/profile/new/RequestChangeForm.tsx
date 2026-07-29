"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { submitChangeAction } from "../actions";

interface CatPolicy {
  allowedFields: string[];
  sensitiveFields: string[];
  requiresEvidence: boolean;
  risk: string;
  scope: "PROVIDER" | "BRANCH";
}

const CATEGORY_LABELS: Record<string, string> = {
  CONTACT: "Contact details", BRANCH: "Branch details", PRACTITIONER: "Practitioner", CREDENTIAL: "Credential / licensing", BANK: "Bank destination", INTEGRATION: "Integration", OTHER: "Other",
};

function fieldLabel(f: string): string {
  return f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export function RequestChangeForm({ policy, branches }: { policy: Record<string, CatPolicy>; branches: { id: string; name: string }[] }) {
  const [category, setCategory] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [branchId, setBranchId] = useState("");
  const [narrative, setNarrative] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idem = useMemo(() => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `mdc-${Date.now()}`), []);

  const cat = category ? policy[category] : null;
  const categories = Object.keys(policy).filter((k) => policy[k].allowedFields.length > 0 || k === "OTHER");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cat) return;
    setError(null);
    setPending(true);
    const proposed: Record<string, unknown> = {};
    for (const f of cat.allowedFields) if (values[f]?.trim()) proposed[f] = values[f].trim();
    const evidenceIds = evidence.trim() ? evidence.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    const res = await submitChangeAction({
      category: category as never,
      proposed,
      providerBranchId: cat.scope === "BRANCH" ? branchId || undefined : undefined,
      narrative: narrative.trim() || undefined,
      evidenceDocumentIds: evidenceIds,
      idempotencyKey: idem,
    });
    if (res?.error) {
      setError(res.error);
      setPending(false);
    }
    // success → the action redirects to the new request
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/provider/profile" className="text-brand-text-muted hover:text-brand-indigo transition-colors" aria-label="Back to profile"><ArrowLeft size={20} /></Link>
        <h1 className="text-2xl font-bold text-brand-text-heading font-heading">Request a change</h1>
      </div>

      <form onSubmit={onSubmit} className="bg-white border border-[#EEEEEE] rounded-lg p-5 space-y-4">
        <label className="block text-sm">
          <span className="font-semibold text-brand-text-heading">What are you changing?</span>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setValues({}); }} className="mt-1 block w-full rounded-lg border border-[#DDDDDD] px-3 py-2" required>
            <option value="">Choose a category…</option>
            {categories.map((k) => <option key={k} value={k}>{CATEGORY_LABELS[k] ?? k}</option>)}
          </select>
        </label>

        {cat?.risk === "HIGH" && (
          <p className="text-xs text-[#856404] bg-[#FFF3CD] border border-[#FFE58F] rounded-lg px-3 py-2" role="note">
            This is a sensitive change. It needs supporting evidence and passes maker/checker review plus an independent verification before it takes effect. Do not enter a full account number here — enter the destination details your TPA will verify out-of-band.
          </p>
        )}

        {cat && cat.scope === "BRANCH" && (
          <label className="block text-sm">
            <span className="font-semibold text-brand-text-heading">Branch</span>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-1 block w-full rounded-lg border border-[#DDDDDD] px-3 py-2" required>
              <option value="">Choose a branch…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        )}

        {cat && cat.allowedFields.length > 0 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-brand-text-heading">Proposed values</legend>
            {cat.allowedFields.map((f) => (
              <label key={f} className="block text-sm">
                <span className="text-xs text-brand-text-muted">{fieldLabel(f)}{cat.sensitiveFields.includes(f) ? " (sensitive)" : ""}</span>
                <input
                  value={values[f] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                  className="mt-0.5 block w-full rounded-lg border border-[#DDDDDD] px-3 py-2"
                  aria-label={fieldLabel(f)}
                />
              </label>
            ))}
          </fieldset>
        )}

        {cat?.requiresEvidence && (
          <label className="block text-sm">
            <span className="font-semibold text-brand-text-heading">Evidence document reference(s)</span>
            <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="document id(s), comma-separated" className="mt-1 block w-full rounded-lg border border-[#DDDDDD] px-3 py-2" required />
            <span className="text-[11px] text-brand-text-muted">Upload the supporting document first, then reference it here.</span>
          </label>
        )}

        <label className="block text-sm">
          <span className="font-semibold text-brand-text-heading">Note (optional)</span>
          <textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-[#DDDDDD] px-3 py-2" />
        </label>

        {error && <p className="text-sm text-brand-error" role="alert">{error}</p>}

        <div className="flex items-center gap-2">
          <button type="submit" disabled={!cat || pending} className="inline-flex items-center gap-1.5 text-sm font-semibold text-white bg-brand-indigo rounded-lg px-4 py-2 disabled:opacity-50">
            {pending ? "Submitting…" : "Submit request"}
          </button>
          <Link href="/provider/profile" className="text-sm text-brand-text-muted underline">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
