"use client";

import { useActionState } from "react";
import { AlertCircle, AlertTriangle, Send } from "lucide-react";
import { submitMemberPreAuthAction } from "../actions";

type RequestOptions = {
  members: Array<{ id: string; name: string; memberNumber: string; relationship: string; status: string }>;
  providers: Array<{ id: string; name: string; type: string; tier: string; servicesOffered: string[] }>;
  procedures: Array<{ label: string; cptCode: string; benefitCategory: string; fallbackCost: number }>;
};

const input = "w-full rounded-[8px] border border-[#EEEEEE] bg-white px-3 py-2 text-sm outline-none focus:border-avenue-indigo";
const label = "text-[13px] font-bold uppercase text-avenue-text-muted";

export function MemberPreAuthForm({ options }: { options: RequestOptions }) {
  const [state, action, pending] = useActionState(submitMemberPreAuthAction, null);

  return (
    <div className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm font-ui">
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 rounded-[8px] border border-[#DC3545]/30 bg-[#DC3545]/5 px-4 py-3 text-sm text-[#DC3545]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      )}
      {state?.warnings && state.warnings.length > 0 && (
        <div className="mb-5 rounded-[8px] border border-[#FFC107]/40 bg-[#FFC107]/5 px-4 py-3">
          <div className="flex items-center gap-2 text-[#856404]">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-bold">Request submitted for review</p>
          </div>
          <p className="mt-1 text-sm text-[#856404]">A clinical reviewer will check this request before a decision is issued.</p>
        </div>
      )}

      <form action={action} className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className={label}>Covered member</span>
            <select required name="memberId" className={input}>
              {options.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.memberNumber})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Facility</span>
            <select required name="providerId" className={input}>
              <option value="">Select facility...</option>
              {options.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.tier.replace(/_/g, " ")})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className={label}>Planned service</span>
            <select required name="procedureCode" className={input}>
              {options.procedures.map((procedure) => (
                <option key={procedure.cptCode} value={procedure.cptCode}>
                  {procedure.label} - {procedure.benefitCategory.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className={label}>Expected date</span>
            <input name="expectedDateOfService" type="date" className={input} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className={label}>Reason for visit</span>
          <input required name="diagnosis" className={input} placeholder="Briefly describe the reason for care" />
        </label>

        <label className="block space-y-1">
          <span className={label}>Additional notes</span>
          <textarea name="clinicalNotes" rows={4} className={`${input} resize-none`} placeholder="Anything else the reviewer should know?" />
        </label>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-[8px] bg-avenue-indigo px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-avenue-indigo-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {pending ? "Submitting..." : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}
