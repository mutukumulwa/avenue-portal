"use client";

import { useState } from "react";
import Link from "next/link";
import { createContractAction } from "./contracts/actions";
import { FileSignature, Plus, AlertTriangle } from "lucide-react";

const lbl = "text-[10px] font-bold text-brand-text-muted uppercase block mb-1";
const inp = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[#FFC107]/10 text-[#856404]",
  ACTIVE: "bg-[#28A745]/10 text-[#28A745]",
  SUSPENDED: "bg-[#DC3545]/10 text-[#DC3545]",
  EXPIRED: "bg-[#6C757D]/10 text-[#6C757D]",
  TERMINATED: "bg-[#DC3545]/10 text-[#DC3545]",
};

const RULE_LABELS: Record<string, string> = {
  PAY_AS_BILLED: "unlisted: pay as billed",
  DISCOUNT_OFF_BILLED: "unlisted: discount off billed",
  REFER_FOR_REVIEW: "unlisted: manual review",
  REJECT: "unlisted: not payable",
};

export interface ContractListRow {
  id: string;
  contractNumber: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  unlistedServiceRule: string;
  tariffCount: number;
  exclusionCount: number;
}

export function ProviderContractsCard({
  providerId,
  contracts,
}: {
  providerId: string;
  contracts: ContractListRow[];
}) {
  const [creating, setCreating] = useState(false);
  const [rule, setRule] = useState("REFER_FOR_REVIEW");

  const [now] = useState(() => Date.now());
  const hasActive = contracts.some(c => c.status === "ACTIVE" && new Date(c.endDate).getTime() >= now);

  return (
    <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
        <div>
          <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <FileSignature size={15} className="text-brand-indigo" /> Contracts
          </h2>
          <p className="text-xs text-brand-text-muted mt-0.5">
            The active agreement governs rates, exclusions and billing rules during claim adjudication.
          </p>
        </div>
        <button
          onClick={() => setCreating(c => !c)}
          className="flex items-center gap-1 text-brand-indigo text-sm font-semibold hover:text-brand-secondary transition-colors"
        >
          <Plus size={14} /> {creating ? "Cancel" : "New Contract"}
        </button>
      </div>

      {!hasActive && (
        <div className="flex items-start gap-2.5 px-6 py-3 bg-[#FFF8E1] border-b border-[#FFC107]/40 text-xs text-[#856404]">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          No active contract. Claims from this provider have <strong>no payable ceiling</strong> — every line is left to reviewer judgement. Create and activate an agreement to enforce negotiated rates.
        </div>
      )}

      {creating && (
        <form action={createContractAction} className="px-6 py-5 bg-brand-indigo/5 border-b border-[#EEEEEE] space-y-4">
          <input type="hidden" name="providerId" value={providerId} />
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3">
              <label className={lbl}>Contract Title *</label>
              <input name="title" required className={inp} placeholder={`e.g. ${new Date().getFullYear()} Master Services Agreement`} />
            </div>
            <div>
              <label className={lbl}>Start Date *</label>
              <input type="date" name="startDate" required className={inp} />
            </div>
            <div>
              <label className={lbl}>End Date *</label>
              <input type="date" name="endDate" required className={inp} />
            </div>
            <div>
              <label className={lbl}>Payment Term (days)</label>
              <input type="number" name="paymentTermDays" min={1} defaultValue={30} className={inp} />
            </div>
            <div>
              <label className={lbl}>Unlisted Services Rule *</label>
              <select name="unlistedServiceRule" value={rule} onChange={e => setRule(e.target.value)} className={inp}>
                <option value="REFER_FOR_REVIEW">Refer for manual review</option>
                <option value="DISCOUNT_OFF_BILLED">Discount off billed charges</option>
                <option value="PAY_AS_BILLED">Pay as billed</option>
                <option value="REJECT">Not payable</option>
              </select>
            </div>
            {rule === "DISCOUNT_OFF_BILLED" && (
              <div>
                <label className={lbl}>Discount off billed % *</label>
                <input type="number" name="unlistedDiscountPct" step="0.1" min={0.1} max={99} required className={inp} placeholder="e.g. 15" />
              </div>
            )}
            <div>
              <label className={lbl}>Invoice Discount %</label>
              <input type="number" name="invoiceDiscountPct" step="0.1" min={0} max={100} className={inp} placeholder="Optional" />
            </div>
          </div>
          <p className="text-xs text-brand-text-muted">
            The contract is created as a <strong>DRAFT</strong>. Load the rate schedule and exclusions in the contract workspace, then activate it.
          </p>
          <div className="flex justify-end">
            <button type="submit" className="bg-brand-indigo hover:bg-brand-secondary text-white px-6 py-2.5 rounded-full font-semibold text-sm transition-colors shadow-sm">
              Create Draft & Open Workspace
            </button>
          </div>
        </form>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-brand-text-muted border-b border-[#EEEEEE]">
            <th className="px-5 py-2.5 text-left">Contract</th>
            <th className="px-5 py-2.5 text-left">Period</th>
            <th className="px-5 py-2.5 text-center">Tariff Lines</th>
            <th className="px-5 py-2.5 text-center">Exclusions</th>
            <th className="px-5 py-2.5 text-left">Billing Rule</th>
            <th className="px-5 py-2.5 text-left">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEEEEE]">
          {contracts.map(c => {
            const past = new Date(c.endDate).getTime() < now;
            const display = c.status === "ACTIVE" && past ? "EXPIRED" : c.status;
            const daysLeft = Math.ceil((new Date(c.endDate).getTime() - now) / 86_400_000);
            return (
              <tr key={c.id} className="hover:bg-[#F8F9FA]">
                <td className="px-5 py-3">
                  <Link href={`/providers/${providerId}/contracts/${c.id}`} className="font-semibold text-brand-indigo hover:underline">
                    {c.contractNumber}
                  </Link>
                  <p className="text-xs text-brand-text-muted mt-0.5">{c.title}</p>
                </td>
                <td className="px-5 py-3 text-brand-text-muted text-xs">
                  {new Date(c.startDate).toLocaleDateString("en-UG")} → {new Date(c.endDate).toLocaleDateString("en-UG")}
                  {display === "ACTIVE" && daysLeft <= 60 && (
                    <span className="block text-[10px] font-bold text-[#856404] mt-0.5">expires in {daysLeft}d</span>
                  )}
                </td>
                <td className="px-5 py-3 text-center font-semibold">{c.tariffCount}</td>
                <td className="px-5 py-3 text-center font-semibold">{c.exclusionCount}</td>
                <td className="px-5 py-3 text-xs text-brand-text-muted">{RULE_LABELS[c.unlistedServiceRule] ?? "—"}</td>
                <td className="px-5 py-3">
                  <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${STATUS_STYLES[display] ?? STATUS_STYLES.DRAFT}`}>
                    {display}
                  </span>
                </td>
              </tr>
            );
          })}
          {contracts.length === 0 && !creating && (
            <tr>
              <td colSpan={6} className="px-5 py-8 text-center text-sm text-brand-text-muted">
                No contracts on file for this provider yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
