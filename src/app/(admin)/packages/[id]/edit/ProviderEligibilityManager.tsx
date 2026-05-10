"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ShieldCheck, ShieldOff, X } from "lucide-react";
import { createProviderEligibilityAction, deleteProviderEligibilityAction } from "./actions";

type EligibilityRule = {
  id: string;
  inclusionType: "INCLUDE" | "EXCLUDE";
  providerId: string | null;
  providerTier: string | null;
  providerName?: string | null;
};

type ProviderRef = { id: string; name: string; tier: string };

const TIERS = ["OWN", "PARTNER", "PANEL"] as const;

export function ProviderEligibilityManager({
  packageVersionId,
  initialRules,
  availableProviders,
}: {
  packageVersionId: string;
  initialRules: EligibilityRule[];
  availableProviders: ProviderRef[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [ruleType, setRuleType] = useState<"provider" | "tier">("provider");
  const [isPending, startTransition] = useTransition();

  const [state, formAction, creating] = useActionState(
    async (_prev: unknown, fd: FormData) => {
      const result = await createProviderEligibilityAction(_prev, fd);
      if (!result?.error) {
        setAdding(false);
        startTransition(() => router.refresh());
      }
      return result;
    },
    null,
  );

  const handleDelete = (id: string) => {
    if (!confirm("Remove this eligibility rule?")) return;
    startTransition(async () => {
      await deleteProviderEligibilityAction(id);
      router.refresh();
    });
  };

  const includes = initialRules.filter(r => r.inclusionType === "INCLUDE");
  const excludes = initialRules.filter(r => r.inclusionType === "EXCLUDE");

  const ruleLabel = (r: EligibilityRule) =>
    r.providerName ?? (r.providerTier ? `All ${r.providerTier} tier providers` : r.providerId ?? "—");

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4 mt-6">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-avenue-text-heading font-heading">Provider Eligibility</h2>
        <button
          type="button"
          onClick={() => { setAdding(true); }}
          disabled={adding}
          className="text-xs bg-[#292A83]/10 text-avenue-indigo px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
        >
          <Plus size={14} /> Add Rule
        </button>
      </div>

      <p className="text-xs text-avenue-text-muted">
        INCLUDE rules whitelist specific providers or tiers. EXCLUDE rules block them. If no INCLUDE rules exist, all active providers are allowed (subject to EXCLUDE rules).
      </p>

      {adding && (
        <form action={formAction} className="bg-gray-50 border border-gray-200 rounded p-4 space-y-4">
          <input type="hidden" name="packageVersionId" value={packageVersionId} />

          {state?.error && <p className="text-xs text-red-600 font-semibold">{state.error}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Rule Type</label>
              <select name="inclusionType" className="w-full border p-2 rounded text-sm">
                <option value="INCLUDE">INCLUDE — allow this provider/tier</option>
                <option value="EXCLUDE">EXCLUDE — block this provider/tier</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Target</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => setRuleType("provider")}
                  className={`flex-1 py-1.5 text-xs rounded font-bold border transition-colors ${ruleType === "provider" ? "bg-avenue-indigo text-white border-avenue-indigo" : "border-gray-200 text-gray-500"}`}>
                  Specific Provider
                </button>
                <button type="button" onClick={() => setRuleType("tier")}
                  className={`flex-1 py-1.5 text-xs rounded font-bold border transition-colors ${ruleType === "tier" ? "bg-avenue-indigo text-white border-avenue-indigo" : "border-gray-200 text-gray-500"}`}>
                  Provider Tier
                </button>
              </div>
            </div>
          </div>

          {ruleType === "provider" ? (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Provider</label>
              <select name="providerId" className="w-full border p-2 rounded text-sm">
                <option value="">Select provider…</option>
                {availableProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.tier})</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Provider Tier</label>
              <select name="providerTier" className="w-full border p-2 rounded text-sm">
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={creating}
              className="px-3 py-1.5 text-sm bg-avenue-indigo text-white rounded font-bold hover:bg-blue-800 disabled:opacity-60">
              {creating ? "Saving…" : "Save Rule"}
            </button>
          </div>
        </form>
      )}

      {includes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-[#28A745]">Included (whitelist)</p>
          {includes.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-[#28A745]/5 border border-[#28A745]/20 rounded px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck size={14} className="text-[#28A745]" />
                <span className="font-semibold text-avenue-text-heading">{ruleLabel(r)}</span>
              </div>
              <button type="button" onClick={() => handleDelete(r.id)} disabled={isPending}
                className="text-red-400 hover:bg-red-50 p-1.5 rounded disabled:opacity-40">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {excludes.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase text-[#DC3545]">Excluded (blocklist)</p>
          {excludes.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <ShieldOff size={14} className="text-[#DC3545]" />
                <span className="font-semibold text-avenue-text-heading">{ruleLabel(r)}</span>
              </div>
              <button type="button" onClick={() => handleDelete(r.id)} disabled={isPending}
                className="text-red-400 hover:bg-red-50 p-1.5 rounded disabled:opacity-40">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {initialRules.length === 0 && !adding && (
        <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-200 rounded">
          No eligibility rules — all active providers are allowed.
        </div>
      )}
    </div>
  );
}
