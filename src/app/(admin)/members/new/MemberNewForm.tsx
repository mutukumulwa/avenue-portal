"use client";

import { useActionState } from "react";
import { addMemberAction } from "./actions";
import { Save, AlertCircle, AlertTriangle } from "lucide-react";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

interface Props {
  groups: { id: string; name: string }[];
}

export function MemberNewForm({ groups }: Props) {
  const [state, action, pending] = useActionState(addMemberAction, null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
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
            <p className="text-sm font-bold">Member enrolled — enrollment risk flags detected</p>
          </div>
          <ul className="space-y-1 pl-5 list-disc">
            {state.warnings.map((w, i) => (
              <li key={i} className="text-xs text-[#856404]">{w}</li>
            ))}
          </ul>
          <p className="text-xs text-[#856404]">The member has been added. Please review these flags before proceeding.</p>
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Group & Relationship */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy & Group</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Group *</label>
              <select required name="groupId" className={inputCls}>
                <option value="">Select group…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Relationship *</label>
              <select required name="relationship" className={inputCls}>
                <option value="PRINCIPAL">Principal</option>
                <option value="SPOUSE">Spouse</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
              </select>
            </div>
          </div>
        </div>

        {/* Personal Information */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First Name *</label>
              <input required name="firstName" type="text" placeholder="e.g. John" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Name *</label>
              <input required name="lastName" type="text" placeholder="e.g. Doe" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date of Birth *</label>
              <input required name="dateOfBirth" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Gender *</label>
              <select required name="gender" className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>National ID / Passport</label>
              <input name="idNumber" type="text" placeholder="e.g. 12345678" className={inputCls} />
              <p className="text-[10px] text-avenue-text-muted mt-1">Used for duplicate detection — must be unique across all members.</p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Information <span className="font-normal text-avenue-text-muted">(optional)</span></h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone Number</label>
              <input name="phone" type="text" placeholder="+254 700 000000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email Address</label>
              <input name="email" type="email" placeholder="user@example.com" className={inputCls} />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {pending ? "Registering…" : "Register Member"}
          </button>
        </div>
      </form>
    </div>
  );
}
