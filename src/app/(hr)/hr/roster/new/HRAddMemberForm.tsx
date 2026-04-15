"use client";

import { useActionState } from "react";
import { addMemberEndorsementAction } from "@/app/(hr)/hr/roster/new/actions";
import type { ActionState } from "@/app/(hr)/hr/roster/new/types";
import { Send, AlertCircle, CheckCircle } from "lucide-react";
import Link from "next/link";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

export function HRAddMemberForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMemberEndorsementAction, null);

  if (state?.success) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-8 text-center max-w-lg mx-auto mt-10">
        <div className="w-16 h-16 bg-[#28A745]/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-[#28A745]" />
        </div>
        <h2 className="text-xl font-bold text-avenue-text-heading font-heading mb-2">Request Submitted</h2>
        <p className="text-sm text-avenue-text-body mb-6">
          Your endorsement request <strong>{state.endorsementNumber}</strong> has been successfully submitted to Avenue Healthcare for processing.
        </p>
        <Link 
          href="/hr/endorsements" 
          className="inline-block px-6 py-2.5 bg-avenue-indigo text-white font-semibold rounded-full hover:bg-avenue-secondary transition-colors"
        >
          Track Endorsements
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Relationship */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Relationship</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Role *</label>
              <select required name="relationship" className={inputCls}>
                <option value="PRINCIPAL">Principal</option>
                <option value="SPOUSE">Spouse</option>
                <option value="CHILD">Child</option>
                <option value="PARENT">Parent</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Effective Date *</label>
              <input required name="effectiveDate" type="date" className={inputCls} />
              <p className="text-[10px] text-avenue-text-muted mt-1">When this coverage should begin.</p>
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
              <p className="text-[10px] text-avenue-text-muted mt-1">If the dependant is a child without an ID, leave this blank.</p>
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
            <Send size={16} />
            {pending ? "Submitting Request…" : "Submit Addition Request"}
          </button>
        </div>
      </form>
    </div>
  );
}
