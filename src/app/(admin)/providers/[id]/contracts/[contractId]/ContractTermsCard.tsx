"use client";

import { useState } from "react";
import { updateContractTermsAction } from "../actions";
import { FileText } from "lucide-react";

const lbl = "text-[10px] font-bold text-brand-text-muted uppercase block mb-1";
const inp = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-indigo transition-colors";

const RULE_LABELS: Record<string, string> = {
  PAY_AS_BILLED: "Pay as billed",
  DISCOUNT_OFF_BILLED: "Discount off billed charges",
  REFER_FOR_REVIEW: "Refer for manual review",
  REJECT: "Not payable",
};

const RULE_HELP: Record<string, string> = {
  PAY_AS_BILLED: "Unlisted services are honoured at whatever the provider bills. Highest leakage risk — only for fully trusted facilities.",
  DISCOUNT_OFF_BILLED: "Unlisted services pay billed charges minus the agreed discount. The standard arrangement for fee-for-service contracts.",
  REFER_FOR_REVIEW: "Unlisted services have no automatic ceiling and are flagged for an adjudicator to decide.",
  REJECT: "Anything not on the tariff schedule is not payable. Strictest — requires a complete schedule.",
};

export interface ContractTerms {
  id: string;
  title: string;
  status: string;
  startDate: string;
  endDate: string;
  signedDate: string | null;
  autoRenew: boolean;
  paymentTermDays: number;
  creditLimit: number | null;
  invoiceDiscountPct: number | null;
  unlistedServiceRule: string;
  unlistedDiscountPct: number | null;
  documentUrl: string | null;
  notes: string | null;
}

export function ContractTermsCard({ contract }: { contract: ContractTerms }) {
  const [editing, setEditing] = useState(false);
  const [rule, setRule] = useState(contract.unlistedServiceRule);

  if (!editing) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3 mb-4">
          <h2 className="font-bold text-brand-text-heading font-heading flex items-center gap-2">
            <FileText size={15} className="text-brand-indigo" /> Commercial Terms & Billing Rules
          </h2>
          <button onClick={() => setEditing(true)} className="text-sm font-semibold text-brand-indigo hover:text-brand-secondary transition-colors">
            Edit
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-x-10 gap-y-3 text-sm">
          {[
            { label: "Signed", value: contract.signedDate ? new Date(contract.signedDate).toLocaleDateString("en-UG") : "Not recorded" },
            { label: "Auto-renew", value: contract.autoRenew ? "Yes" : "No" },
            { label: "Payment Terms", value: `Net ${contract.paymentTermDays} days` },
            { label: "Credit Limit", value: contract.creditLimit != null ? `KES ${contract.creditLimit.toLocaleString("en-UG")}` : "Unlimited" },
            { label: "Invoice Discount", value: contract.invoiceDiscountPct != null ? `${contract.invoiceDiscountPct}% off invoice total` : "—" },
            {
              label: "Unlisted Services",
              value: `${RULE_LABELS[contract.unlistedServiceRule] ?? contract.unlistedServiceRule}${contract.unlistedServiceRule === "DISCOUNT_OFF_BILLED" && contract.unlistedDiscountPct != null ? ` (−${contract.unlistedDiscountPct}%)` : ""}`,
            },
          ].map(f => (
            <div key={f.label} className="flex justify-between">
              <span className="text-brand-text-muted">{f.label}</span>
              <span className="font-semibold text-brand-text-heading text-right">{f.value}</span>
            </div>
          ))}
        </div>

        <p className="mt-4 text-xs text-brand-text-muted bg-[#F8F9FA] rounded-lg px-3 py-2">
          {RULE_HELP[contract.unlistedServiceRule]}
        </p>

        {contract.documentUrl && (
          <p className="mt-3 text-sm">
            <span className="text-brand-text-muted">Signed document: </span>
            <a href={contract.documentUrl} target="_blank" rel="noopener noreferrer" className="text-brand-indigo font-semibold hover:underline">
              open agreement
            </a>
          </p>
        )}
        {contract.notes && (
          <div className="pt-3 mt-3 border-t border-[#EEEEEE]">
            <p className="text-[10px] font-bold uppercase text-brand-text-muted mb-1">Special Terms / Notes</p>
            <p className="text-brand-text-body text-sm leading-relaxed whitespace-pre-wrap">{contract.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-brand-indigo/20 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3 mb-4">
        <h2 className="font-bold text-brand-text-heading font-heading">Edit Terms</h2>
        <button onClick={() => setEditing(false)} className="text-sm text-brand-text-muted hover:text-brand-text-heading transition-colors">
          Cancel
        </button>
      </div>

      <form action={async fd => { await updateContractTermsAction(fd); setEditing(false); }} className="space-y-4">
        <input type="hidden" name="contractId" value={contract.id} />

        <div>
          <label className={lbl}>Contract Title *</label>
          <input name="title" required defaultValue={contract.title} className={inp} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={lbl}>Start Date *</label>
            <input type="date" name="startDate" required defaultValue={contract.startDate.slice(0, 10)} className={inp} />
          </div>
          <div>
            <label className={lbl}>End Date *</label>
            <input type="date" name="endDate" required defaultValue={contract.endDate.slice(0, 10)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Signed Date</label>
            <input type="date" name="signedDate" defaultValue={contract.signedDate?.slice(0, 10) ?? ""} className={inp} />
          </div>
          <div>
            <label className={lbl}>Payment Term (days)</label>
            <input type="number" name="paymentTermDays" min={1} defaultValue={contract.paymentTermDays} className={inp} />
          </div>
          <div>
            <label className={lbl}>Credit Limit (KES)</label>
            <input type="number" step="0.01" name="creditLimit" defaultValue={contract.creditLimit ?? ""} className={inp} placeholder="Blank = unlimited" />
          </div>
          <div>
            <label className={lbl}>Invoice Discount %</label>
            <input type="number" step="0.1" min={0} max={100} name="invoiceDiscountPct" defaultValue={contract.invoiceDiscountPct ?? ""} className={inp} placeholder="e.g. 10" />
          </div>
        </div>

        <div className="bg-brand-indigo/5 rounded-lg p-4 space-y-3">
          <p className="text-xs font-bold text-brand-text-heading uppercase">Unlisted services — how are codes NOT on the schedule paid?</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Rule *</label>
              <select name="unlistedServiceRule" value={rule} onChange={e => setRule(e.target.value)} className={inp}>
                {Object.entries(RULE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {rule === "DISCOUNT_OFF_BILLED" && (
              <div>
                <label className={lbl}>Discount off billed % *</label>
                <input type="number" step="0.1" min={0.1} max={99} name="unlistedDiscountPct" required defaultValue={contract.unlistedDiscountPct ?? ""} className={inp} placeholder="e.g. 15" />
              </div>
            )}
          </div>
          <p className="text-xs text-brand-text-muted">{RULE_HELP[rule]}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 items-end">
          <div>
            <label className={lbl}>Signed Document URL</label>
            <input type="url" name="documentUrl" defaultValue={contract.documentUrl ?? ""} className={inp} placeholder="https://…" />
          </div>
          <label className="flex items-center gap-2 text-sm text-brand-text-body pb-2">
            <input type="checkbox" name="autoRenew" defaultChecked={contract.autoRenew} className="accent-brand-indigo" />
            Flag for auto-renewal at expiry
          </label>
        </div>

        <div>
          <label className={lbl}>Special Terms / Notes</label>
          <textarea name="notes" rows={3} defaultValue={contract.notes ?? ""} className={`${inp} resize-none`} placeholder="Bed entitlements, ward classes, escalation contacts…" />
        </div>

        <div className="flex justify-end">
          <button type="submit" className="bg-brand-indigo hover:bg-brand-secondary text-white px-7 py-2.5 rounded-full font-semibold text-sm transition-colors shadow-sm">
            Save Terms
          </button>
        </div>
      </form>
    </div>
  );
}
