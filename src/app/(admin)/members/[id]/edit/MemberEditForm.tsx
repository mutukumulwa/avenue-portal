"use client";

import { useActionState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { updateMemberAction } from "./actions";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

interface MemberSnap {
  id: string;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  idNumber: string | null;
  dateOfBirth: string; // ISO
  gender: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  status: string;
}

export function MemberEditForm({ member }: { member: MemberSnap }) {
  const boundAction = updateMemberAction.bind(null, member.id);
  const [state, action, pending] = useActionState(boundAction, null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Personal */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Personal Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>First Name *</label>
              <input required name="firstName" type="text" defaultValue={member.firstName} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Last Name *</label>
              <input required name="lastName" type="text" defaultValue={member.lastName} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Other Names</label>
              <input name="otherNames" type="text" defaultValue={member.otherNames ?? ""} placeholder="Middle name(s)" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Date of Birth *</label>
              <input required name="dateOfBirth" type="date" defaultValue={member.dateOfBirth.slice(0, 10)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Gender *</label>
              <select required name="gender" defaultValue={member.gender} className={inputCls}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>National ID / Passport</label>
              <input name="idNumber" type="text" defaultValue={member.idNumber ?? ""} placeholder="e.g. 12345678" className={inputCls} />
              <p className="text-[10px] text-avenue-text-muted mt-1">Must be unique across all members.</p>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Information</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Phone Number</label>
              <input name="phone" type="text" defaultValue={member.phone ?? ""} placeholder="+254 700 000000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email Address</label>
              <input name="email" type="email" defaultValue={member.email ?? ""} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Policy */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Relationship *</label>
              <select required name="relationship" defaultValue={member.relationship} className={inputCls}>
                <option value="PRINCIPAL">Principal</option>
                <option value="SPOUSE">Spouse</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Status *</label>
              <select required name="status" defaultValue={member.status} className={inputCls}>
                <option value="PENDING_ACTIVATION">Pending Activation</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="LAPSED">Lapsed</option>
                <option value="TERMINATED">Terminated</option>
              </select>
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
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
