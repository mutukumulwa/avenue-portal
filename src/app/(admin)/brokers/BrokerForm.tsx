"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createBrokerAction, updateBrokerAction } from "./actions";

interface BrokerFormProps {
  broker?: {
    id: string;
    name: string;
    brokerCode: string | null;
    legalName: string | null;
    tradingName: string | null;
    brokerType: string;
    intermediaryCategory: string;
    requiresIraRegistration: boolean;
    canReceiveCommission: boolean;
    commissionBasis: string;
    referralFeeAmount: number | null;
    sourceDescription: string | null;
    parentBrokerId: string | null;
    contactPerson: string;
    phone: string;
    email: string;
    address: string | null;
    licenseNumber: string | null;
    iraExpiryDate: Date | null;
    kraPin: string | null;
    vatRegistered: boolean;
    vatNumber: string | null;
    bankAccountReference: string | null;
    mpesaPaybillNumber: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    status: string;
    firstYearCommissionPct: number;
    renewalCommissionPct: number;
    flatFeePerMember: number | null;
  };
  parentBrokers?: Array<{ id: string; name: string; brokerCode: string | null }>;
}

function dateInputValue(date: Date | null | undefined) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function BrokerForm({ broker, parentBrokers = [] }: BrokerFormProps) {
  const action = broker ? updateBrokerAction.bind(null, broker.id) : createBrokerAction;
  const [state, formAction, pending] = useActionState(action, null);
  const input = "w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white";

  return (
    <form action={formAction} className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
      {state?.error && <p className="text-sm text-[#DC3545] bg-[#DC3545]/10 rounded-md px-3 py-2">{state.error}</p>}
      <div className="grid md:grid-cols-2 gap-4">
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Business Source Name</span>
          <input name="name" required defaultValue={broker?.name ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Source Code</span>
          <input name="brokerCode" defaultValue={broker?.brokerCode ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Legal Name</span>
          <input name="legalName" defaultValue={broker?.legalName ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Trading Name</span>
          <input name="tradingName" defaultValue={broker?.tradingName ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Hierarchy Type</span>
          <select name="brokerType" defaultValue={broker?.brokerType ?? "MASTER_BROKER"} className={input}>
            <option value="MASTER_BROKER">Master Broker</option>
            <option value="SUB_AGENT">Sub Agent</option>
            <option value="TIED_AGENT">Tied Agent</option>
            <option value="INDIVIDUAL_PRODUCER">Individual Producer</option>
            <option value="BANCASSURANCE">Bancassurance</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Intermediary Category</span>
          <select name="intermediaryCategory" defaultValue={broker?.intermediaryCategory ?? "REGULATED_BROKER"} className={input}>
            <option value="REGULATED_BROKER">Regulated Broker</option>
            <option value="REGULATED_AGENT">Regulated Agent</option>
            <option value="INTRODUCER">Independent Introducer</option>
            <option value="REFERRAL_PARTNER">Referral Partner</option>
            <option value="INTERNAL_SALES">Internal Sales</option>
            <option value="CORPORATE_AFFINITY">Corporate Affinity</option>
            <option value="BANCASSURANCE">Bancassurance</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Parent Source</span>
          <select name="parentBrokerId" defaultValue={broker?.parentBrokerId ?? ""} className={input}>
            <option value="">None</option>
            {parentBrokers.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}{parent.brokerCode ? ` (${parent.brokerCode})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">IRA License</span>
          <input name="licenseNumber" defaultValue={broker?.licenseNumber ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">IRA Expiry Date</span>
          <input name="iraExpiryDate" type="date" defaultValue={dateInputValue(broker?.iraExpiryDate)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">KRA PIN</span>
          <input name="kraPin" defaultValue={broker?.kraPin ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Payout Basis</span>
          <select name="commissionBasis" defaultValue={broker?.commissionBasis ?? "COMMISSION"} className={input}>
            <option value="COMMISSION">Commission</option>
            <option value="REFERRAL_FEE">Referral Fee</option>
            <option value="ATTRIBUTION_ONLY">Attribution Only</option>
            <option value="NONE">None</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Referral Fee Amount</span>
          <input name="referralFeeAmount" type="number" min="0" step="0.01" defaultValue={broker?.referralFeeAmount ?? ""} className={input} />
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
          <span className="text-xs font-bold uppercase text-avenue-text-muted">VAT Number</span>
          <input name="vatNumber" defaultValue={broker?.vatNumber ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Bank Account Reference</span>
          <input name="bankAccountReference" defaultValue={broker?.bankAccountReference ?? ""} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">M-Pesa Paybill</span>
          <input name="mpesaPaybillNumber" defaultValue={broker?.mpesaPaybillNumber ?? ""} className={input} />
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
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Effective From</span>
          <input name="effectiveFrom" type="date" defaultValue={dateInputValue(broker?.effectiveFrom) || dateInputValue(new Date())} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Effective To</span>
          <input name="effectiveTo" type="date" defaultValue={dateInputValue(broker?.effectiveTo)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Status</span>
          <select name="status" defaultValue={broker?.status ?? "ACTIVE"} className={input}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-avenue-text-heading">
          <input name="vatRegistered" type="checkbox" defaultChecked={broker?.vatRegistered ?? false} className="h-4 w-4 rounded border-[#EEEEEE] accent-avenue-indigo" />
          VAT registered
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-avenue-text-heading">
          <input name="requiresIraRegistration" type="checkbox" defaultChecked={broker?.requiresIraRegistration ?? true} className="h-4 w-4 rounded border-[#EEEEEE] accent-avenue-indigo" />
          IRA registration required
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-avenue-text-heading">
          <input name="canReceiveCommission" type="checkbox" defaultChecked={broker?.canReceiveCommission ?? true} className="h-4 w-4 rounded border-[#EEEEEE] accent-avenue-indigo" />
          Eligible for payout
        </label>
        <label className="space-y-1 md:col-span-2">
          <span className="text-xs font-bold uppercase text-avenue-text-muted">Business Source Notes</span>
          <textarea name="sourceDescription" rows={3} defaultValue={broker?.sourceDescription ?? ""} className={input} />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <Link href={broker ? `/brokers/${broker.id}` : "/brokers"} className="px-5 py-2 rounded-full border border-[#EEEEEE] text-sm font-semibold hover:bg-[#F8F9FA]">
          Cancel
        </Link>
        <button disabled={pending} className="px-5 py-2 rounded-full bg-avenue-indigo text-white text-sm font-bold hover:bg-avenue-secondary disabled:opacity-50">
          {pending ? "Saving..." : broker ? "Save Source" : "Create Source"}
        </button>
      </div>
    </form>
  );
}
