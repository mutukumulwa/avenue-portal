"use client";

import { useActionState } from "react";
import { Save, AlertCircle, AlertTriangle } from "lucide-react";
import { submitPreAuthAction } from "./actions";

const inputCls = "w-full border border-[#EEEEEE] rounded-md px-4 py-2 text-sm outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-sm font-semibold text-avenue-text-heading block mb-1";

interface Member   { id: string; firstName: string; lastName: string; memberNumber: string; }
interface Provider { id: string; name: string; type: string; }

interface Props {
  members: Member[];
  providers: Provider[];
}

export function PreAuthNewForm({ members, providers }: Props) {
  const [state, action, pending] = useActionState(submitPreAuthAction, null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm p-6 relative">
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}
      {state?.warnings && state.warnings.length > 0 && (
        <div className="mb-5 bg-[#FFC107]/5 border border-[#FFC107]/40 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-[#856404]">
            <AlertTriangle size={15} className="shrink-0" />
            <p className="text-sm font-bold">Pre-authorization submitted with fraud risk flags</p>
          </div>
          <ul className="space-y-1 pl-5 list-disc">
            {state.warnings.map((w, i) => (
              <li key={i} className="text-xs text-[#856404]">{w}</li>
            ))}
          </ul>
          <p className="text-xs text-[#856404] mt-1">The pre-authorization has been submitted. A reviewer should assess these flags before approval.</p>
        </div>
      )}

      <form action={action} className="space-y-6">
        <div className="border-b border-[#EEEEEE] pb-6 space-y-4">
          <h3 className="text-lg font-bold text-avenue-text-heading font-heading">Member &amp; Provider</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#F8F9FA] p-4 rounded-lg border border-[#EEEEEE]">
            <div>
              <label className={labelCls}>Member</label>
              <select required name="memberId" className={inputCls}>
                <option value="">Select member…</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.memberNumber})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Provider / Facility</label>
              <select required name="providerId" className={inputCls}>
                <option value="">Select provider…</option>
                {providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="border-b border-[#EEEEEE] pb-6 space-y-4">
          <h3 className="text-lg font-bold text-avenue-text-heading font-heading">Procedure Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className={labelCls}>Service Type</label>
              <select required name="serviceType" className={inputCls}>
                <option value="OUTPATIENT">Outpatient</option>
                <option value="INPATIENT">Inpatient</option>
                <option value="DAY_CASE">Day Case</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Benefit Category</label>
              <select required name="benefitCategory" className={inputCls}>
                <option value="OUTPATIENT">Outpatient</option>
                <option value="INPATIENT">Inpatient</option>
                <option value="MATERNITY">Maternity</option>
                <option value="DENTAL">Dental</option>
                <option value="OPTICAL">Optical</option>
                <option value="SURGICAL">Surgical</option>
                <option value="AMBULANCE_EMERGENCY">Emergency / Ambulance</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Expected Date of Service</label>
              <input name="expectedDateOfService" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Estimated Cost (KES)</label>
              <input required name="estimatedCost" type="number" min="0" step="0.01" className={inputCls} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold text-avenue-text-heading font-heading">Clinical Information</h3>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Primary Diagnosis</label>
              <input required name="diagnosis" type="text" className={inputCls} placeholder="e.g. Appendicitis (K35)" />
            </div>
            <div>
              <label className={labelCls}>Planned Procedure</label>
              <input name="procedure" type="text" className={inputCls} placeholder="e.g. Appendectomy" />
            </div>
            <div>
              <label className={labelCls}>Clinical Notes</label>
              <textarea name="clinicalNotes" rows={3} className={inputCls + " resize-none"} placeholder="Additional clinical information…" />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-3 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {pending ? "Submitting…" : "Submit Pre-Authorization"}
          </button>
        </div>
      </form>
    </div>
  );
}
