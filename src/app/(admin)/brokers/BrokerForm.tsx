"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createBrokerAction, updateBrokerAction } from "./actions";

interface BrokerFormProps {
  broker?: {
    id: string;
    name: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string | null;
    licenseNumber: string | null;
    status: string;
    firstYearCommissionPct: number;
    renewalCommissionPct: number;
    flatFeePerMember: number | null;
  };
}

export function BrokerForm({ broker }: BrokerFormProps) {
  const action = broker ? updateBrokerAction.bind(null, broker.id) : createBrokerAction;
  const [state, formAction, pending] = useActionState(action, null);
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <form action={formAction} className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
      {state?.error && <p className="text-sm text-[#DC3545] bg-[#DC3545]/10 rounded-md px-3 py-2">{state.error}</p>}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Broker Name</span>
          <input name="name" required defaultValue={broker?.name ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">IRA License</span>
          <input name="licenseNumber" defaultValue={broker?.licenseNumber ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Contact Person</span>
          <input name="contactPerson" required defaultValue={broker?.contactPerson ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Email</span>
          <input name="email" type="email" required defaultValue={broker?.email ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Phone</span>
          <input name="phone" required defaultValue={broker?.phone ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Address</span>
          <input name="address" defaultValue={broker?.address ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">First-Year Commission %</span>
          <input name="firstYearCommissionPct" type="number" min="0" max="100" step="0.01" defaultValue={broker?.firstYearCommissionPct ?? 0} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Renewal Commission %</span>
          <input name="renewalCommissionPct" type="number" min="0" max="100" step="0.01" defaultValue={broker?.renewalCommissionPct ?? 0} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Flat Fee / Member</span>
          <input name="flatFeePerMember" type="number" min="0" step="0.01" defaultValue={broker?.flatFeePerMember ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Status</span>
          <select name="status" defaultValue={broker?.status ?? "ACTIVE"} className={input}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Link href={broker ? `/brokers/${broker.id}` : "/brokers"} className="px-5 py-2 rounded-full border border-[#EEEEEE] text-sm font-semibold hover:bg-[#F8F9FA]">
          Cancel
        </Link>
        <button disabled={pending} className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary disabled:opacity-50">
          {pending ? "Saving..." : broker ? "Save Broker" : "Create Broker"}
        </button>
      </div>
    </form>
  );
}
