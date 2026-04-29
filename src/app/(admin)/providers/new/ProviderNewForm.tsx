"use client";

import { useActionState, useState } from "react";
import { Save, AlertCircle } from "lucide-react";
import { addProviderAction } from "./actions";
import { LocationPicker } from "@/components/ui/LocationPicker";

const inputCls = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";
const labelCls = "text-xs font-bold text-avenue-text-muted uppercase block mb-1";

const SERVICES = [
  "Inpatient", "Outpatient", "Maternity", "Surgery", "Pharmacy",
  "ICU", "Laboratory", "Dental", "Optical", "Rehabilitation", "Emergency",
];

export function ProviderNewForm() {
  const [state, action, pending] = useActionState(addProviderAction, null);
  const [geoPosition, setGeoPosition] = useState<{ lat: number; lng: number } | null>(null);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm p-6">
      {state?.error && (
        <div className="mb-5 flex items-start gap-2 bg-[#DC3545]/5 border border-[#DC3545]/30 text-[#DC3545] rounded-lg px-4 py-3 text-sm">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}

      <form action={action} className="space-y-6">
        {/* Basic Info */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Provider Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Provider Name *</label>
              <input required name="name" type="text" placeholder="e.g. Nairobi Hospital" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <select required name="type" className={inputCls}>
                <option value="HOSPITAL">Hospital</option>
                <option value="CLINIC">Clinic</option>
                <option value="PHARMACY">Pharmacy</option>
                <option value="LABORATORY">Laboratory</option>
                <option value="DENTAL">Dental</option>
                <option value="OPTICAL">Optical</option>
                <option value="REHABILITATION">Rehabilitation</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Tier *</label>
              <select required name="tier" className={inputCls}>
                <option value="OWN">Own</option>
                <option value="PARTNER">Partner</option>
                <option value="PANEL">Panel</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input name="address" type="text" placeholder="e.g. P.O. Box 30026, Nairobi" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>County</label>
              <input name="county" type="text" placeholder="e.g. Nairobi" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Location (Drop Pin)</label>
              <input type="hidden" name="geoLatitude" value={geoPosition?.lat || ""} />
              <input type="hidden" name="geoLongitude" value={geoPosition?.lng || ""} />
              <LocationPicker onPositionChange={setGeoPosition} />
            </div>
          </div>
        </div>

        {/* Contact */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contact <span className="font-normal text-avenue-text-muted">(optional)</span></h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contact Person</label>
              <input name="contactPerson" type="text" placeholder="e.g. Dr. Jane Mwangi" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input name="phone" type="text" placeholder="+254 700 000000" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Email</label>
              <input name="email" type="email" placeholder="provider@example.com" className={inputCls} />
            </div>
          </div>
        </div>

        {/* Services offered */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Services Offered</h3>
          <div className="grid grid-cols-3 gap-2">
            {SERVICES.map(s => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" name="servicesOffered" value={s} className="accent-avenue-indigo w-4 h-4" />
                {s}
              </label>
            ))}
          </div>
        </div>

        {/* Contract */}
        <div>
          <h3 className="font-bold text-avenue-text-heading font-heading border-b border-[#EEEEEE] pb-2 mb-4">Contract</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Contract Status *</label>
              <select required name="contractStatus" className={inputCls}>
                <option value="ACTIVE">Active</option>
                <option value="PENDING">Pending</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Payment Terms (days)</label>
              <input name="paymentTermDays" type="number" min="1" defaultValue="30" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contract Start Date</label>
              <input name="contractStartDate" type="date" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Contract End Date</label>
              <input name="contractEndDate" type="date" className={inputCls} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Contract Notes</label>
              <textarea name="contractNotes" rows={3} className={inputCls + " resize-none"} placeholder="Special terms, co-payment arrangements…" />
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
            {pending ? "Saving…" : "Add Provider"}
          </button>
        </div>
      </form>
    </div>
  );
}
