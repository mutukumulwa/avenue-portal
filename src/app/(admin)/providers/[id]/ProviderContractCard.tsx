"use client";

import { useState } from "react";
import { updateContractAction } from "./actions";
import { FileText } from "lucide-react";

interface Props {
  providerId: string;
  contractStatus: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  paymentTermDays: number;
  creditLimit: number | null;
  contractNotes: string | null;
}

const CONTRACT_STATUSES = ["ACTIVE", "PENDING", "EXPIRED", "SUSPENDED", "TERMINATED"];
const lbl = "text-[10px] font-bold text-avenue-text-muted uppercase block mb-1";
const inp = "w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo transition-colors";

export function ProviderContractCard(props: Props) {
  const [editing, setEditing] = useState(false);

  const statusColor = (s: string | null) => {
    switch (s) {
      case "ACTIVE":     return "bg-[#28A745]/10 text-[#28A745]";
      case "PENDING":    return "bg-[#FFC107]/10 text-[#856404]";
      case "EXPIRED":    return "bg-[#6C757D]/10 text-[#6C757D]";
      case "SUSPENDED":  return "bg-[#DC3545]/10 text-[#DC3545]";
      case "TERMINATED": return "bg-[#DC3545]/10 text-[#DC3545]";
      default:           return "bg-[#6C757D]/10 text-[#6C757D]";
    }
  };

  if (!editing) {
    return (
      <div className="bg-white border border-[#EEEEEE] rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3 mb-4">
          <h2 className="font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            <FileText size={15} className="text-avenue-indigo" /> Contract Details
          </h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-avenue-indigo hover:text-avenue-secondary transition-colors"
          >
            Edit
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-avenue-text-muted">Status</span>
            <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full ${statusColor(props.contractStatus)}`}>
              {props.contractStatus ?? "Not Set"}
            </span>
          </div>
          {[
            { label: "Contract Start", value: props.contractStartDate ? new Date(props.contractStartDate).toLocaleDateString("en-KE") : "—" },
            { label: "Contract End",   value: props.contractEndDate   ? new Date(props.contractEndDate).toLocaleDateString("en-KE")   : "—" },
            { label: "Payment Terms",  value: `Net ${props.paymentTermDays} days` },
            { label: "Credit Limit",   value: props.creditLimit != null ? `KES ${Number(props.creditLimit).toLocaleString("en-KE")}` : "—" },
          ].map(f => (
            <div key={f.label} className="flex justify-between">
              <span className="text-avenue-text-muted">{f.label}</span>
              <span className="font-semibold text-avenue-text-heading">{f.value}</span>
            </div>
          ))}
          {props.contractNotes && (
            <div className="pt-3 border-t border-[#EEEEEE]">
              <p className="text-[10px] font-bold uppercase text-avenue-text-muted mb-1">Notes</p>
              <p className="text-avenue-text-body text-sm leading-relaxed">{props.contractNotes}</p>
            </div>
          )}
          {!props.contractNotes && !props.contractStatus && (
            <p className="text-xs text-avenue-text-muted italic pt-1">No contract details set — click Edit to configure.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-avenue-indigo/20 rounded-lg p-6 shadow-sm">
      <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3 mb-4">
        <h2 className="font-bold text-avenue-text-heading font-heading">Edit Contract</h2>
        <button onClick={() => setEditing(false)} className="text-sm text-avenue-text-muted hover:text-avenue-text-heading transition-colors">
          Cancel
        </button>
      </div>

      <form
        action={async (fd) => { await updateContractAction(fd); setEditing(false); }}
        className="space-y-4"
      >
        <input type="hidden" name="providerId" value={props.providerId} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Contract Status</label>
            <select name="contractStatus" defaultValue={props.contractStatus ?? ""} className={inp}>
              <option value="">— None —</option>
              {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={lbl}>Payment Term (days)</label>
            <input type="number" name="paymentTermDays" defaultValue={props.paymentTermDays} min={1} className={inp} />
          </div>
          <div>
            <label className={lbl}>Contract Start</label>
            <input type="date" name="contractStartDate" defaultValue={props.contractStartDate?.slice(0, 10) ?? ""} className={inp} />
          </div>
          <div>
            <label className={lbl}>Contract End</label>
            <input type="date" name="contractEndDate" defaultValue={props.contractEndDate?.slice(0, 10) ?? ""} className={inp} />
          </div>
          <div className="col-span-2">
            <label className={lbl}>Credit Limit (KES)</label>
            <input type="number" step="0.01" name="creditLimit" defaultValue={props.creditLimit ?? ""} className={inp} placeholder="Leave blank for unlimited" />
          </div>
        </div>

        <div>
          <label className={lbl}>Contract Notes</label>
          <textarea name="contractNotes" rows={3} defaultValue={props.contractNotes ?? ""} className={`${inp} resize-none`} placeholder="Special terms, exclusions, conditions…" />
        </div>

        <div className="flex justify-end pt-1">
          <button type="submit" className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-7 py-2.5 rounded-full font-semibold text-sm transition-colors shadow-sm">
            Save Contract
          </button>
        </div>
      </form>
    </div>
  );
}
