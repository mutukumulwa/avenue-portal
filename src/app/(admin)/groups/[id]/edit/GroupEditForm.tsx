"use client";

import { useActionState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { updateGroupAction } from "./actions";
import type { GroupActionState } from "@/lib/validation/group";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";
const labelCls = "text-xs font-bold text-brand-text-muted uppercase block mb-1";

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

function fieldErrors(state: GroupActionState | null, field: string): string[] | undefined {
  if (state && !state.ok) return state.fieldErrors?.[field];
  return undefined;
}

function FieldError({ msgs }: { msgs?: string[] }) {
  if (!msgs || msgs.length === 0) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-[#DC3545]">
      {msgs[0]}
    </p>
  );
}

export function GroupEditForm({ group }: { group: Group }) {
  const boundAction = updateGroupAction.bind(null, group.id);
  const [state, action, pending] = useActionState<GroupActionState, FormData>(boundAction, { ok: true });

  const toDateInput = (iso: string) => iso.slice(0, 10);
  const err = (f: string) => fieldErrors(state, f);
  const invalid = (f: string) => (err(f) ? "true" : "false");

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {state && !state.ok && state.formError && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.formError}</span>
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Organisation */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Organisation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Scheme Name *</label>
              <input required name="name" type="text" defaultValue={group.name} aria-invalid={invalid("name")} className={inputCls} />
              <FieldError msgs={err("name")} />
            </div>
            <div>
              <label className={labelCls}>Industry</label>
              <input name="industry" type="text" defaultValue={group.industry ?? ""} placeholder="e.g. Finance" aria-invalid={invalid("industry")} className={inputCls} />
              <FieldError msgs={err("industry")} />
            </div>
            <div>
              <label className={labelCls}>Registration Number</label>
              <input name="registrationNumber" type="text" defaultValue={group.registrationNumber ?? ""} placeholder="e.g. CPR/2023/12345" aria-invalid={invalid("registrationNumber")} className={inputCls} />
              <FieldError msgs={err("registrationNumber")} />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input name="address" type="text" defaultValue={group.address ?? ""} placeholder="e.g. P.O. Box 1234, Nairobi" className={inputCls} />
              <FieldError msgs={err("address")} />
            </div>
            <div>
              <label className={labelCls}>County</label>
              <input name="county" type="text" defaultValue={group.county ?? ""} placeholder="e.g. Nairobi" className={inputCls} />
              <FieldError msgs={err("county")} />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact Person</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Name *</label>
              <input required name="contactPersonName" type="text" defaultValue={group.contactPersonName} aria-invalid={invalid("contactPersonName")} className={inputCls} />
              <FieldError msgs={err("contactPersonName")} />
            </div>
            <div>
              <label className={labelCls}>Phone *</label>
              <input required name="contactPersonPhone" type="text" defaultValue={group.contactPersonPhone} placeholder="+254 700 000000" aria-invalid={invalid("contactPersonPhone")} className={inputCls} />
              <FieldError msgs={err("contactPersonPhone")} />
            </div>
            <div>
              <label className={labelCls}>Email *</label>
              <input required name="contactPersonEmail" type="email" defaultValue={group.contactPersonEmail} aria-invalid={invalid("contactPersonEmail")} className={inputCls} />
              <FieldError msgs={err("contactPersonEmail")} />
            </div>
          </div>
        </div>

        {/* Policy */}
        <div>
          <h3 className="font-bold text-brand-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Policy Details</h3>
          <p className="text-xs text-brand-text-muted -mt-2 mb-4">
            Lifecycle status (suspend / reactivate / terminate) is changed from the scheme page — those are governed transitions with a reason and member-eligibility cascade, so they are not editable here.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Payment Frequency *</label>
              <select required name="paymentFrequency" defaultValue={group.paymentFrequency} aria-invalid={invalid("paymentFrequency")} className={inputCls}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="SEMI_ANNUAL">Semi-Annual</option>
                <option value="ANNUAL">Annual</option>
              </select>
              <FieldError msgs={err("paymentFrequency")} />
            </div>
            <div />
            <div>
              <label className={labelCls}>Effective Date *</label>
              <input required name="effectiveDate" type="date" defaultValue={toDateInput(group.effectiveDate)} aria-invalid={invalid("effectiveDate")} className={inputCls} />
              <FieldError msgs={err("effectiveDate")} />
            </div>
            <div>
              <label className={labelCls}>Renewal Date *</label>
              <input required name="renewalDate" type="date" defaultValue={toDateInput(group.renewalDate)} aria-invalid={invalid("renewalDate")} className={inputCls} />
              <FieldError msgs={err("renewalDate")} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Notes</label>
              <textarea name="notes" rows={3} defaultValue={group.notes ?? ""} className={inputCls + " resize-none"} placeholder="Internal notes…" />
              <FieldError msgs={err("notes")} />
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
