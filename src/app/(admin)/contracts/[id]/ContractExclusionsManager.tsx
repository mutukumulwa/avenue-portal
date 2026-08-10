"use client";

import { useState, useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, X, ShieldOff } from "lucide-react";
// WP-N6: the SAME owner-agnostic actions the package-version manager uses. They
// already resolve a `providerContractId` owner (N-012), tenant-verify it, run
// overlap detection, and audit — so this contract UI reuses them verbatim, one
// evaluation + write path over both owners.
import {
  createTreatmentExclusionAction,
  deleteTreatmentExclusionAction,
} from "@/app/(admin)/packages/[id]/edit/actions";
import type { ActionResult } from "@/lib/action-result";
import {
  TREATMENT_EXCLUSION_CATEGORY_VALUES,
  TREATMENT_EXCLUSION_TYPE_VALUES,
} from "@/lib/validation/exclusion";
import { BENEFIT_CATEGORY_VALUES } from "@/lib/validation/package";

export type ContractExclusionListItem = {
  id: string;
  ruleCategory: string;
  exclusionType: string;
  benefitCategories: string[];
  serviceCodes: string[];
  diagnosisCodes: string[];
  procedureCodes: string[];
  exceptionType: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  memberSafeExplanation: string;
};

const splitCodes = (s: string): string[] =>
  s
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

export function ContractExclusionsManager({
  contractId,
  editable,
  initialRules,
}: {
  contractId: string;
  editable: boolean;
  initialRules: ContractExclusionListItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [category, setCategory] = useState<string>(TREATMENT_EXCLUSION_CATEGORY_VALUES[0]);
  const [exclusionType, setExclusionType] = useState<"ABSOLUTE" | "CONDITIONAL">("ABSOLUTE");
  const [benefitCategories, setBenefitCategories] = useState<string[]>([]);
  const [diagText, setDiagText] = useState("");
  const [procText, setProcText] = useState("");
  const [svcText, setSvcText] = useState("");
  const [reqPriorTrauma, setReqPriorTrauma] = useState(true);
  const [triggerProcText, setTriggerProcText] = useState("");

  const reset = () => {
    setCategory(TREATMENT_EXCLUSION_CATEGORY_VALUES[0]);
    setExclusionType("ABSOLUTE");
    setBenefitCategories([]);
    setDiagText("");
    setProcText("");
    setSvcText("");
    setReqPriorTrauma(true);
    setTriggerProcText("");
  };

  const [state, formAction, creating] = useActionState<ActionResult, FormData>(
    async (_prev, fd) => {
      const result = await createTreatmentExclusionAction(_prev, fd);
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

  const diagCodes = splitCodes(diagText);
  const procCodes = splitCodes(procText);
  const svcCodes = splitCodes(svcText);
  const triggerProcCodes = splitCodes(triggerProcText);

  const toggleCat = (c: string) =>
    setBenefitCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const handleDelete = (id: string) => {
    if (!confirm("Remove this contract exclusion?")) return;
    startTransition(async () => {
      await deleteTreatmentExclusionAction(id);
      router.refresh();
    });
  };

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4 mt-6">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-2">
        <h2 className="font-bold text-brand-text-heading font-heading">Contract Treatment Exclusions</h2>
        {editable && (
          <button
            type="button"
            onClick={() => { setAdding(true); reset(); }}
            disabled={adding}
            className="text-xs bg-[#0B1437]/10 text-brand-indigo px-3 py-1.5 rounded flex items-center gap-1 font-bold disabled:opacity-50"
          >
            <Plus size={14} /> Add Exclusion
          </button>
        )}
      </div>

      <p className="text-xs text-brand-text-muted">
        Structured exclusions owned by THIS provider contract (N-012). They are evaluated over the same path as
        package-version exclusions — absolute rules always exclude; conditional rules exclude unless their exception
        applies. Members and providers see only the member-safe explanation.
      </p>

      {adding && editable && (
        <form action={formAction} className="bg-gray-50 border border-gray-200 rounded p-4 space-y-4">
          <input type="hidden" name="providerContractId" value={contractId} />
          {benefitCategories.map((c) => (
            <input key={c} type="hidden" name="benefitCategories" value={c} />
          ))}
          {diagCodes.map((c, i) => <input key={`d${i}`} type="hidden" name="diagnosisCodes" value={c} />)}
          {procCodes.map((c, i) => <input key={`p${i}`} type="hidden" name="procedureCodes" value={c} />)}
          {svcCodes.map((c, i) => <input key={`s${i}`} type="hidden" name="serviceCodes" value={c} />)}
          {exclusionType === "CONDITIONAL" && (
            <>
              <input type="hidden" name="exceptionType" value="RECONSTRUCTIVE_AFTER_TRAUMA" />
              {reqPriorTrauma && <input type="hidden" name="exceptionRequiresPriorTrauma" value="on" />}
              {triggerProcCodes.map((c, i) => (
                <input key={`tp${i}`} type="hidden" name="exceptionTriggerProcedureCodes" value={c} />
              ))}
            </>
          )}

          {formError && <p role="alert" className="text-xs text-red-600 font-semibold">{formError}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Category</label>
              <select name="ruleCategory" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full border p-2 rounded text-sm">
                {TREATMENT_EXCLUSION_CATEGORY_VALUES.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
              {err("ruleCategory") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("ruleCategory")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
              <select name="exclusionType" value={exclusionType}
                onChange={(e) => setExclusionType(e.target.value as "ABSOLUTE" | "CONDITIONAL")}
                className="w-full border p-2 rounded text-sm">
                {TREATMENT_EXCLUSION_TYPE_VALUES.map((t) => (
                  <option key={t} value={t}>{t === "ABSOLUTE" ? "Absolute (always excluded)" : "Conditional (excluded unless exception)"}</option>
                ))}
              </select>
            </div>
          </div>

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

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Diagnosis codes</label>
              <input type="text" value={diagText} onChange={(e) => setDiagText(e.target.value)} placeholder="Z41.1, Q80"
                className="w-full border p-2 rounded text-sm" />
              {err("diagnosisCodes") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("diagnosisCodes")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Procedure codes</label>
              <input type="text" value={procText} onChange={(e) => setProcText(e.target.value)} placeholder="15788, 15792"
                className="w-full border p-2 rounded text-sm" />
              {err("procedureCodes") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("procedureCodes")}</p>}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Service codes</label>
              <input type="text" value={svcText} onChange={(e) => setSvcText(e.target.value)} placeholder="Comma-separated"
                className="w-full border p-2 rounded text-sm" />
              {err("serviceCodes") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("serviceCodes")}</p>}
            </div>
          </div>
          <p className="text-[11px] text-brand-text-muted">Enter one or more codes (comma-separated). Leave a field blank to omit that scope dimension.</p>

          {exclusionType === "CONDITIONAL" && (
            <div className="bg-white border border-dashed border-gray-300 rounded p-3 space-y-3">
              <p className="text-xs font-bold text-gray-600">Exception: reconstructive after a covered trauma (CT-023)</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={reqPriorTrauma} onChange={(e) => setReqPriorTrauma(e.target.checked)} />
                Require evidence of a prior covered trauma episode
              </label>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Reconstructive procedure codes (optional)</label>
                <input type="text" value={triggerProcText} onChange={(e) => setTriggerProcText(e.target.value)}
                  placeholder="15788, 15792" className="w-full border p-2 rounded text-sm" />
              </div>
              {err("exceptionLogic") && <p role="alert" className="text-[11px] text-red-600 mt-1">{err("exceptionLogic")}</p>}
            </div>
          )}

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
              placeholder="This service is not covered at this facility under the contracted terms."
              aria-invalid={err("memberSafeExplanation") ? true : undefined} />
            {err("memberSafeExplanation") && (
              <p role="alert" className="text-[11px] text-red-600 mt-1">{err("memberSafeExplanation")}</p>
            )}
          </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-gray-500 font-semibold">Internal (never shown to members)</summary>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Source clause</label>
                <input type="text" name="sourceClause" className="w-full border p-2 rounded text-sm" placeholder="Contract §7.3(b)" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Internal note</label>
                <input type="text" name="internalNote" className="w-full border p-2 rounded text-sm" />
              </div>
            </div>
          </details>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-200 rounded flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={creating}
              className="px-3 py-1.5 text-sm bg-brand-indigo text-white rounded font-bold hover:bg-blue-800 flex items-center gap-1 disabled:opacity-60">
              <Save size={14} /> {creating ? "Saving…" : "Save Exclusion"}
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
                  <ShieldOff size={14} className="text-[#DC3545]" />
                  <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{r.ruleCategory.replace(/_/g, " ")}</span>
                  <span className="text-[10px] font-bold uppercase bg-[#0B1437]/10 text-brand-indigo px-2 py-0.5 rounded">{r.exclusionType}</span>
                  {r.exceptionType && (
                    <span className="text-[10px] font-bold uppercase bg-[#FFF8E1] text-[#856404] px-2 py-0.5 rounded">exception</span>
                  )}
                </div>
                <p className="text-sm text-brand-text-heading">{r.memberSafeExplanation}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.benefitCategories.map((c) => (
                    <span key={c} className="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded">{c.replace(/_/g, " ")}</span>
                  ))}
                  {r.diagnosisCodes.length > 0 && <span className="text-[11px] text-gray-500">Dx: {r.diagnosisCodes.join(", ")}</span>}
                  {r.procedureCodes.length > 0 && <span className="text-[11px] text-gray-500">Px: {r.procedureCodes.join(", ")}</span>}
                  {r.serviceCodes.length > 0 && <span className="text-[11px] text-gray-500">Svc: {r.serviceCodes.join(", ")}</span>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Effective {fmt(r.effectiveFrom)} → {fmt(r.effectiveTo)}</p>
              </div>
              {editable && (
                <button type="button" onClick={() => handleDelete(r.id)} disabled={isPending}
                  className="text-red-500 hover:bg-red-50 p-2 rounded disabled:opacity-50">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {initialRules.length === 0 && !adding && (
        <div className="text-center p-6 text-gray-500 border-2 border-dashed border-gray-200 rounded">
          No contract-owned treatment exclusions configured.
        </div>
      )}
    </div>
  );
}
