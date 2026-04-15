"use client";

import { useActionState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { updateGroupAction } from "./actions";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

interface Group {
  id: string;
  name: string;
  industry: string | null;
  registrationNumber: string | null;
  address: string | null;
  county: string | null;
  contactPersonName: string;
  contactPersonPhone: string;
  contactPersonEmail: string;
  paymentFrequency: string;
  effectiveDate: string; // ISO string
  renewalDate: string;   // ISO string
  status: string;
  notes: string | null;
}

export function GroupEditForm({ group }: { group: Group }) {
  const boundAction = updateGroupAction.bind(null, group.id);
  const [state, action, pending] = useActionState(boundAction, null);

  const toDateInput = (iso: string) => iso.slice(0, 10);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Organisation */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Organisation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Group Name *</label>
              <input required name="name" type="text" defaultValue={group.name} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Industry</label>
              <input name="industry" type="text" defaultValue={group.industry ?? ""} placeholder="e.g. Finance" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Registration Number</label>
              <input name="registrationNumber" type="text" defaultValue={group.registrationNumber ?? ""} placeholder="e.g. CPR/2023/12345" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input name="address" type="text" defaultValue={group.address ?? ""} placeholder="e.g. P.O. Box 1234, Nairobi" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>County</label>
              <input name="county" type="text" defaultValue={group.county ?? ""} placeholder="e.g. Nairobi" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Person</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Name *</label>
              <input required name="contactPersonName" type="text" defaultValue={group.contactPersonName} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone *</label>
              <input required name="contactPersonPhone" type="text" defaultValue={group.contactPersonPhone} placeholder="+254 700 000000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Email *</label>
              <input required name="contactPersonEmail" type="email" defaultValue={group.contactPersonEmail} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Policy */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Status *</label>
              <select required name="status" defaultValue={group.status} className={inputCls}>
                <option value="PENDING">Pending</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
                <option value="LAPSED">Lapsed</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Payment Frequency *</label>
              <select required name="paymentFrequency" defaultValue={group.paymentFrequency} className={inputCls}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="SEMI_ANNUAL">Semi-Annual</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Effective Date *</label>
              <input required name="effectiveDate" type="date" defaultValue={toDateInput(group.effectiveDate)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Renewal Date *</label>
              <input required name="renewalDate" type="date" defaultValue={toDateInput(group.renewalDate)} className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea name="notes" rows={3} defaultValue={group.notes ?? ""} className={inputCls + " resize-none"} placeholder="Internal notes…" />
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
