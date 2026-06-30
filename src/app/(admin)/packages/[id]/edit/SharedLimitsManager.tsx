"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X } from "lucide-react";
import { createSharedLimitAction, deleteSharedLimitAction } from "./actions";

type BenefitRef = { id: string; category: string; customCategoryName: string | null };

type SharedLimit = {
  id: string;
  name: string;
  limitAmount: number;
  appliesTo: "MEMBER" | "FAMILY";
  benefitConfigs: { benefitConfigId: string; category: string }[];
};

const initialForm: { name: string; limitAmount: number; appliesTo: "MEMBER" | "FAMILY"; benefitConfigIds: string[] } =
  { name: "", limitAmount: 0, appliesTo: "FAMILY", benefitConfigIds: [] };

export function SharedLimitsManager({
  packageVersionId,
  availableBenefits,
  initialLimits,
}: {
  packageVersionId: string;
  availableBenefits: BenefitRef[];
  initialLimits: SharedLimit[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [isPending, startTransition] = useTransition();

  const [state, formAction, creating] = useActionState(
    async (_prev: unknown, fd: FormData) => {
      const result = await createSharedLimitAction(_prev, fd);
      if (!result?.error) {
        setAdding(false);
        setForm(initialForm);
        startTransition(() => router.refresh());
      }
      return result;
    },
    null,
  );

  const handleDelete = (id: string) => {
    if (!confirm("Remove this shared limit group?")) return;
    startTransition(async () => {
      await deleteSharedLimitAction(id);
      router.refresh();
    });
  };

  const toggleBenefit = (id: string) =>
    setForm(prev => ({
      ...prev,
      benefitConfigIds: prev.benefitConfigIds.includes(id)
        ? prev.benefitConfigIds.filter(b => b !== id)
        : [...prev.benefitConfigIds, id],
    }));

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4 mt-6">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Shared Limits</h2>
        <button
          type="button"
          onClick={() => { setAdding(true); setForm(initialForm); }}
          disabled={adding || availableBenefits.length < 2}
          className="text-xs bg-[#0B1437]/10 text-brand-indigo px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
        >
          <Plus size={14} /> Add Shared Limit
        </button>
      </div>

      <p className="text-xs text-brand-text-muted">
        Shared limits apply an aggregate cap across multiple benefit categories. Claims will be rejected once the combined usage exceeds this limit.
      </p>

      {adding && (
        <form action={formAction} className="bg-gray-50 border border-gray-200 rounded p-4 space-y-4">
          <input type="hidden" name="packageVersionId" value={packageVersionId} />
          {form.benefitConfigIds.map(id => (
            <input key={id} type="hidden" name="benefitConfigIds" value={id} />
          ))}

          {state?.error && (
            <p className="text-xs text-red-600 font-semibold">{state.error}</p>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Group Name</label>
              <input
                type="text" name="name" placeholder="e.g. Shared Diagnostics"
                className="w-full border p-2 rounded text-sm"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Limit (KES)</label>
              <input
                type="number" name="limitAmount" min="0"
                className="w-full border p-2 rounded text-sm"
                value={form.limitAmount} onChange={e => setForm({ ...form, limitAmount: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Applies To</label>
              <select
                name="appliesTo"
                className="w-full border p-2 rounded text-sm"
                value={form.appliesTo} onChange={e => setForm({ ...form, appliesTo: e.target.value as "MEMBER" | "FAMILY" })}
              >
                <option value="FAMILY">Family (all dependents)</option>
                <option value="MEMBER">Member (individual cap)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Benefits Sharing This Limit</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableBenefits.map(b => (
                <label key={b.id} className="flex items-center gap-2 text-sm bg-white p-2 border rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.benefitConfigIds.includes(b.id)}
                    onChange={() => toggleBenefit(b.id)}
                  />
                  {b.category.replace(/_/g, " ")}
                  {b.customCategoryName ? ` (${b.customCategoryName})` : ""}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={creating} className="px-3 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold hover:bg-blue-800 flex items-center gap-1 disabled:opacity-60">
              <Save size={14} /> {creating ? "Saving…" : "Save Group"}
            </button>
          </div>
        </form>
      )}

      {initialLimits.length > 0 && (
        <div className="grid gap-3">
          {initialLimits.map(sl => (
            <div key={sl.id} className="border border-gray-200 rounded p-4 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-brand-text-heading">{sl.name}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <span className="font-semibold text-gray-700">KES {sl.limitAmount.toLocaleString()}</span>
                  <span>•</span>
                  <span>Applies to {sl.appliesTo}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sl.benefitConfigs.map(bc => (
                    <span key={bc.benefitConfigId} className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded">
                      {bc.category.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(sl.id)}
                disabled={isPending}
                className="text-red-500 hover:bg-red-50 p-2 rounded disabled:opacity-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {initialLimits.length === 0 && !adding && (
        <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-200 rounded">
          No shared limits configured for this package version.
        </div>
      )}
    </div>
  );
}
