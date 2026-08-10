"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X } from "lucide-react";
import { createSharedLimitAction, deleteSharedLimitAction } from "./actions";
import type { ActionResult } from "@/lib/action-result";
import {
  sharedLimitMinBenefits,
  sharedLimitRuleText,
  type LimitScope,
} from "@/lib/validation/shared-limit";
import { BASE_CURRENCY, formatMoney } from "@/lib/utils";

type BenefitRef = { id: string; category: string; customCategoryName: string | null };

type SharedLimit = {
  id: string;
  name: string;
  limitAmount: number;
  appliesTo: LimitScope;
  benefitConfigs: { benefitConfigId: string; category: string }[];
};

const initialForm: { name: string; limitAmount: number; appliesTo: LimitScope; benefitConfigIds: string[] } =
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

  const [state, formAction, creating] = useActionState<ActionResult, FormData>(
    async (_prev, fd) => {
      const result = await createSharedLimitAction(_prev, fd);
      if (result.ok) {
        setAdding(false);
        setForm(initialForm);
        startTransition(() => router.refresh());
      }
      return result;
    },
    { ok: true },
  );

  const fieldErrors = state.ok ? {} : state.fieldErrors ?? {};
  const formError = state.ok ? undefined : state.formError;
  const err = (f: string) => (fieldErrors[f] ? fieldErrors[f][0] : undefined);

  // D1 rule for the currently-selected scope — surfaced as visible helper text
  // and mirrored on the submit gate (the server schema is the actual control).
  const minBenefits = sharedLimitMinBenefits(form.appliesTo);
  const meetsMin = form.benefitConfigIds.length >= minBenefits;

  const handleDelete = (id: string) => {
    if (!confirm("Remove this shared limit group?")) return;
    startTransition(async () => {
      await deleteSharedLimitAction(id);
      router.refresh();
    });
  };

  const toggleBenefit = (id: string) =>
    setForm((prev) => ({
      ...prev,
      benefitConfigIds: prev.benefitConfigIds.includes(id)
        ? prev.benefitConfigIds.filter((b) => b !== id)
        : [...prev.benefitConfigIds, id],
    }));

  const noBenefits = availableBenefits.length < 1;

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4 mt-6">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Shared Limits</h2>
        <button
          type="button"
          onClick={() => { setAdding(true); setForm(initialForm); }}
          disabled={adding || noBenefits}
          className="text-xs bg-[#0B1437]/10 text-brand-indigo px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
        >
          <Plus size={14} /> Add Shared Limit
        </button>
      </div>

      <p className="text-xs text-brand-text-muted">
        Shared limits apply an aggregate cap across one or more benefit categories. Claims are rejected once the combined
        usage exceeds this limit.
      </p>
      {noBenefits && (
        <p className="text-xs text-[#856404] bg-[#FFF8E1] border border-[#FFECB3] rounded px-3 py-2">
          Add at least one benefit to the schedule above (and save) before configuring a shared limit.
        </p>
      )}

      {adding && (
        <form action={formAction} className="bg-gray-50 border border-gray-200 rounded p-4 space-y-4">
          <input type="hidden" name="packageVersionId" value={packageVersionId} />
          {form.benefitConfigIds.map((id) => (
            <input key={id} type="hidden" name="benefitConfigIds" value={id} />
          ))}

          {formError && <p role="alert" className="text-xs text-red-600 font-semibold">{formError}</p>}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Group Name</label>
              <input
                type="text" name="name" placeholder="e.g. Maternity family pool"
                className="w-full border p-2 rounded text-sm"
                aria-invalid={err("name") ? true : undefined}
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {err("name") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("name")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Limit ({BASE_CURRENCY})</label>
              <input
                type="number" name="limitAmount" min="0" step="0.01"
                className="w-full border p-2 rounded text-sm"
                aria-invalid={err("limitAmount") ? true : undefined}
                value={form.limitAmount} onChange={(e) => setForm({ ...form, limitAmount: Number(e.target.value) })}
              />
              {err("limitAmount") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("limitAmount")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Applies To</label>
              <select
                name="appliesTo"
                className="w-full border p-2 rounded text-sm"
                value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value as LimitScope })}
              >
                <option value="FAMILY">Family (all dependents)</option>
                <option value="MEMBER">Member (individual / combined)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Benefits Sharing This Limit</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {availableBenefits.map((b) => (
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
            <p className="text-[11px] text-brand-text-muted mt-2">{sharedLimitRuleText(form.appliesTo)}</p>
            {err("benefitConfigIds") && (
              <p role="alert" className="text-[11px] text-red-600 mt-1">{err("benefitConfigIds")}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={creating || !meetsMin}
              title={meetsMin ? undefined : `Select at least ${minBenefits} benefit${minBenefits > 1 ? "s" : ""} for a ${form.appliesTo.toLowerCase()} pool`}
              className="px-3 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold hover:bg-blue-800 flex items-center gap-1 disabled:opacity-60">
              <Save size={14} /> {creating ? "Saving…" : "Save Group"}
            </button>
          </div>
        </form>
      )}

      {initialLimits.length > 0 && (
        <div className="grid gap-3">
          {initialLimits.map((sl) => (
            <div key={sl.id} className="border border-gray-200 rounded p-4 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-brand-text-heading">{sl.name}</h3>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                  <span className="font-semibold text-gray-700">{formatMoney(sl.limitAmount)}</span>
                  <span>•</span>
                  <span>Applies to {sl.appliesTo}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sl.benefitConfigs.map((bc) => (
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
