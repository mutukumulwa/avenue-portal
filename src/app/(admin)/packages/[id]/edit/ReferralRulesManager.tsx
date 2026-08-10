"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, GitBranch } from "lucide-react";
import { createReferralRuleAction, deleteReferralRuleAction } from "./actions";
import type { ActionResult } from "@/lib/action-result";
import { BENEFIT_CATEGORY_VALUES } from "@/lib/validation/package";

export type ReferralListItem = {
  id: string;
  benefitCategories: string[];
  serviceCodes: string[];
  providerSpecialties: string[];
  requiresReferral: boolean;
  emergencyException: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceClause: string | null;
  memberSafeExplanation: string;
};

const splitList = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

export function ReferralRulesManager({
  packageVersionId,
  initialRules,
}: {
  packageVersionId: string;
  initialRules: ReferralListItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [benefitCategories, setBenefitCategories] = useState<string[]>([]);
  const [svcText, setSvcText] = useState("");
  const [specText, setSpecText] = useState("");
  const [requiresReferral, setRequiresReferral] = useState(true);
  const [emergencyException, setEmergencyException] = useState(true);

  const reset = () => {
    setBenefitCategories([]);
    setSvcText("");
    setSpecText("");
    setRequiresReferral(true);
    setEmergencyException(true);
  };

  const [state, formAction, creating] = useActionState<ActionResult, FormData>(
    async (_prev, fd) => {
      const result = await createReferralRuleAction(_prev, fd);
      if (result.ok) {
        setAdding(false);
        reset();
        startTransition(() => router.refresh());
      }
      return result;
    },
    { ok: true },
  );

  const fieldErrors = state.ok ? {} : state.fieldErrors ?? {};
  const formError = state.ok ? undefined : state.formError;
  const err = (f: string) => (fieldErrors[f] ? fieldErrors[f][0] : undefined);

  const svcCodes = splitList(svcText);
  const specialties = splitList(specText);

  const toggleCat = (c: string) =>
    setBenefitCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const handleDelete = (id: string) => {
    if (!confirm("Remove this referral rule?")) return;
    startTransition(async () => {
      await deleteReferralRuleAction(id);
      router.refresh();
    });
  };

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4 mt-6">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Referral Rules</h2>
        <button
          type="button"
          onClick={() => { setAdding(true); reset(); }}
          disabled={adding}
          className="text-xs bg-[#0B1437]/10 text-brand-indigo px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
        >
          <Plus size={14} /> Add Referral Rule
        </button>
      </div>

      <p className="text-xs text-brand-text-muted">
        Scope a referral requirement to a benefit, service, or provider specialty (e.g. specialist outpatient requires a
        referral). An emergency exception waives the requirement for emergency visits. Members and providers see only the
        member-safe explanation.
      </p>

      {adding && (
        <form action={formAction} className="bg-gray-50 border border-gray-200 rounded p-4 space-y-4">
          <input type="hidden" name="packageVersionId" value={packageVersionId} />
          {benefitCategories.map((c) => (
            <input key={c} type="hidden" name="benefitCategories" value={c} />
          ))}
          {svcCodes.map((c, i) => <input key={`s${i}`} type="hidden" name="serviceCodes" value={c} />)}
          {specialties.map((c, i) => <input key={`sp${i}`} type="hidden" name="providerSpecialties" value={c} />)}
          {requiresReferral && <input type="hidden" name="requiresReferral" value="on" />}
          {emergencyException && <input type="hidden" name="emergencyException" value="on" />}

          {formError && <p role="alert" className="text-xs text-red-600 font-semibold">{formError}</p>}

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Benefit Categories (scope)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {BENEFIT_CATEGORY_VALUES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm bg-white p-2 border rounded cursor-pointer">
                  <input type="checkbox" checked={benefitCategories.includes(c)} onChange={() => toggleCat(c)} />
                  {c.replace(/_/g, " ")}
                </label>
              ))}
            </div>
            {err("benefitCategories") && (
              <p role="alert" className="text-[11px] text-red-600 mt-1">{err("benefitCategories")}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Service codes (optional)</label>
              <input type="text" value={svcText} onChange={(e) => setSvcText(e.target.value)} placeholder="Comma-separated"
                className="w-full border p-2 rounded text-sm" />
              {err("serviceCodes") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("serviceCodes")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Provider specialties (optional)</label>
              <input type="text" value={specText} onChange={(e) => setSpecText(e.target.value)} placeholder="Cardiology, Oncology"
                className="w-full border p-2 rounded text-sm" />
              {err("providerSpecialties") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("providerSpecialties")}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={requiresReferral} onChange={(e) => setRequiresReferral(e.target.checked)} />
              Requires referral
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={emergencyException} onChange={(e) => setEmergencyException(e.target.checked)} />
              Emergency exception (waive for emergencies)
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Effective from</label>
              <input type="date" name="effectiveFrom" className="w-full border p-2 rounded text-sm"
                aria-invalid={err("effectiveFrom") ? true : undefined} />
              {err("effectiveFrom") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("effectiveFrom")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Effective to (optional)</label>
              <input type="date" name="effectiveTo" className="w-full border p-2 rounded text-sm"
                aria-invalid={err("effectiveTo") ? true : undefined} />
              {err("effectiveTo") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("effectiveTo")}</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Member-safe explanation (shown to members / providers)</label>
            <textarea name="memberSafeExplanation" rows={2} className="w-full border p-2 rounded text-sm"
              placeholder="Specialist outpatient visits require a referral from your primary provider, except in an emergency."
              aria-invalid={err("memberSafeExplanation") ? true : undefined} />
            {err("memberSafeExplanation") && (
              <p role="alert" className="text-[11px] text-red-600 mt-1">{err("memberSafeExplanation")}</p>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 font-semibold">Internal (never shown to members)</summary>
            <div className="mt-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Source clause</label>
              <input type="text" name="sourceClause" className="w-full border p-2 rounded text-sm" placeholder="Policy §9.1" />
            </div>
          </details>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={creating}
              className="px-3 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold hover:bg-blue-800 flex items-center gap-1 disabled:opacity-60">
              <Save size={14} /> {creating ? "Saving…" : "Save Rule"}
            </button>
          </div>
        </form>
      )}

      {initialRules.length > 0 && (
        <div className="grid gap-3">
          {initialRules.map((r) => (
            <div key={r.id} className="border border-gray-200 rounded p-4 flex justify-between items-start">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <GitBranch size={14} className="text-brand-indigo" />
                  <span className="text-[10px] font-bold uppercase bg-[#0B1437]/10 text-brand-indigo px-2 py-0.5 rounded">
                    {r.requiresReferral ? "Referral required" : "No referral"}
                  </span>
                  {r.emergencyException && (
                    <span className="text-[10px] font-bold uppercase bg-[#FFF8E1] text-[#856404] px-2 py-0.5 rounded">emergency waived</span>
                  )}
                </div>
                <p className="text-sm text-brand-text-heading">{r.memberSafeExplanation}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.benefitCategories.map((c) => (
                    <span key={c} className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded">{c.replace(/_/g, " ")}</span>
                  ))}
                  {r.providerSpecialties.length > 0 && <span className="text-[11px] text-gray-500">Specialties: {r.providerSpecialties.join(", ")}</span>}
                  {r.serviceCodes.length > 0 && <span className="text-[11px] text-gray-500">Svc: {r.serviceCodes.join(", ")}</span>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Effective {fmt(r.effectiveFrom)} → {fmt(r.effectiveTo)}</p>
              </div>
              <button type="button" onClick={() => handleDelete(r.id)} disabled={isPending}
                className="text-red-500 hover:bg-red-50 p-2 rounded disabled:opacity-50">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {initialRules.length === 0 && !adding && (
        <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-200 rounded">
          No referral rules configured for this package version.
        </div>
      )}
    </div>
  );
}
