"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PlusCircle, Trash2, AlertTriangle } from "lucide-react";
import { submitReimbursementClaimAction } from "../actions";

const BENEFIT_CATEGORIES = [
  "OUTPATIENT","INPATIENT","MATERNITY","DENTAL","OPTICAL",
  "MENTAL_HEALTH","CHRONIC_DISEASE","SURGICAL","AMBULANCE_EMERGENCY",
  "LAST_EXPENSE","WELLNESS_PREVENTIVE","REHABILITATION","CUSTOM",
];

const LINE_CATEGORIES = ["CONSULTATION","LABORATORY","PHARMACY","IMAGING","PROCEDURE","OTHER"];

interface Member { id: string; name: string; memberNumber: string; group: string; package: string }
interface Provider { id: string; name: string; type: string; county: string }

interface LineItem {
  serviceCategory: string;
  cptCode: string;
  description: string;
  icdCode: string;
  quantity: number;
  unitCost: number;
  billedAmount: number;
}

const emptyLine = (): LineItem => ({
  serviceCategory: "CONSULTATION", cptCode: "", description: "",
  icdCode: "", quantity: 1, unitCost: 0, billedAmount: 0,
});

export function ReimbursementClaimForm({ members, providers }: { members: Member[]; providers: Provider[] }) {
  const [lines, setLines]         = useState<LineItem[]>([emptyLine()]);
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTrans]   = useTransition();
  const [payMethod, setPayMethod] = useState<"bank" | "mpesa">("mpesa");

  function updateLine(i: number, field: keyof LineItem, value: string | number) {
    setLines(prev => {
      const next = [...prev];
      const line = { ...next[i]!, [field]: value };
      if (field === "quantity" || field === "unitCost") {
        line.billedAmount = Number(line.quantity) * Number(line.unitCost);
      }
      next[i] = line;
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);

    const diagnoses = [{
      code: fd.get("diagnosisCode") as string,
      description: fd.get("diagnosisDesc") as string,
      standardCharge: null,
      isPrimary: true,
    }];

    startTrans(async () => {
      try {
        await submitReimbursementClaimAction({
          memberId:                fd.get("memberId") as string,
          providerId:              fd.get("providerId") as string,
          benefitCategory:         fd.get("benefitCategory") as never,
          dateOfService:           fd.get("dateOfService") as string,
          attendingDoctor:         (fd.get("attendingDoctor") as string) || undefined,
          invoiceNumber:           (fd.get("invoiceNumber") as string) || undefined,
          diagnoses,
          lineItems:               lines as never,
          reimbursementBankName:   payMethod === "bank" ? (fd.get("bankName") as string) || undefined : undefined,
          reimbursementAccountNo:  payMethod === "bank" ? (fd.get("accountNo") as string) || undefined : undefined,
          reimbursementMpesaPhone: payMethod === "mpesa" ? (fd.get("mpesaPhone") as string) || undefined : undefined,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submission failed.");
      }
    });
  }

  const total = lines.reduce((s, l) => s + l.billedAmount, 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Notice */}
      <div className="flex items-start gap-3 bg-[#FFF8E1] border border-[#FFC107]/40 rounded-lg px-4 py-3">
        <AlertTriangle size={16} className="text-[#856404] mt-0.5 shrink-0" />
        <p className="text-xs text-[#856404]">
          Reimbursement claims are for expenses the member already paid out of pocket.
          The insurer will reimburse the member — <strong>not</strong> the provider.
          Attach the original receipt or invoice from the provider.
        </p>
      </div>

      {error && (
        <div className="bg-[#DC3545]/5 border border-[#DC3545]/20 rounded-lg px-4 py-3 text-sm text-[#DC3545]">{error}</div>
      )}

      {/* Core details */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-avenue-text-heading text-sm">Encounter Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Member</label>
            <select name="memberId" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">Select member…</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name} — {m.memberNumber} ({m.group})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Provider (where member was treated)</label>
            <select name="providerId" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">Select provider…</option>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.county}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Date of Service</label>
            <input name="dateOfService" type="date" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Benefit Category</label>
            <select name="benefitCategory" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="">Select…</option>
              {BENEFIT_CATEGORIES.map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Attending Doctor</label>
            <input name="attendingDoctor" type="text" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Provider Invoice No.</label>
            <input name="invoiceNumber" type="text" placeholder="e.g. INV-2025-00123" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Primary Diagnosis Code</label>
            <input name="diagnosisCode" type="text" placeholder="e.g. J18.9" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Diagnosis Description</label>
            <input name="diagnosisDesc" type="text" required placeholder="e.g. Pneumonia" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
        </div>
      </div>

      {/* Service lines */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-3">
        <h3 className="font-bold text-avenue-text-heading text-sm">Service Lines (from provider receipt)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                <th className="pb-2 text-left">Category</th>
                <th className="pb-2 text-left">Description</th>
                <th className="pb-2 text-left w-24">Qty</th>
                <th className="pb-2 text-left w-28">Unit Cost</th>
                <th className="pb-2 text-right w-28">Total</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2">
                    <select value={line.serviceCategory} onChange={e => updateLine(i, "serviceCategory", e.target.value)}
                      className="w-full border border-[#EEEEEE] rounded px-2 py-1.5 text-xs outline-none focus:border-avenue-indigo">
                      {LINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input value={line.description} onChange={e => updateLine(i, "description", e.target.value)}
                      required placeholder="Service description"
                      className="w-full border border-[#EEEEEE] rounded px-2 py-1.5 text-xs outline-none focus:border-avenue-indigo" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="1" value={line.quantity} onChange={e => updateLine(i, "quantity", Number(e.target.value))}
                      className="w-full border border-[#EEEEEE] rounded px-2 py-1.5 text-xs outline-none focus:border-avenue-indigo" />
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min="0" step="0.01" value={line.unitCost} onChange={e => updateLine(i, "unitCost", Number(e.target.value))}
                      className="w-full border border-[#EEEEEE] rounded px-2 py-1.5 text-xs outline-none focus:border-avenue-indigo" />
                  </td>
                  <td className="py-2 text-right font-mono text-xs font-semibold text-avenue-text-heading pr-2">
                    {line.billedAmount.toLocaleString()}
                  </td>
                  <td className="py-2">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines(prev => prev.filter((_, j) => j !== i))}
                        className="text-avenue-text-muted hover:text-[#DC3545] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between pt-1">
          <button type="button" onClick={() => setLines(prev => [...prev, emptyLine()])}
            className="flex items-center gap-1 text-xs text-avenue-indigo hover:text-avenue-secondary transition-colors">
            <PlusCircle size={13} /> Add line
          </button>
          <p className="text-sm font-bold text-avenue-text-heading">
            Total: <span className="font-mono">KES {total.toLocaleString()}</span>
          </p>
        </div>
      </div>

      {/* Reimbursement payment details */}
      <div className="bg-white border border-[#EEEEEE] rounded-[8px] p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-avenue-text-heading text-sm">Reimbursement Payment Details</h3>
        <p className="text-xs text-avenue-text-muted">Where should the insurer send the reimbursement?</p>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="payMethod" value="mpesa" checked={payMethod === "mpesa"} onChange={() => setPayMethod("mpesa")} />
            M-Pesa
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="radio" name="payMethod" value="bank" checked={payMethod === "bank"} onChange={() => setPayMethod("bank")} />
            Bank Transfer
          </label>
        </div>
        {payMethod === "mpesa" ? (
          <div className="space-y-1 max-w-xs">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">M-Pesa Phone Number</label>
            <input name="mpesaPhone" type="tel" required placeholder="e.g. 0712345678" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Bank Name</label>
              <input name="bankName" type="text" required placeholder="e.g. Equity Bank" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Account Number</label>
              <input name="accountNo" type="text" required placeholder="e.g. 1234567890" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo" />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Link href="/claims" className="px-6 py-2.5 rounded-full border border-[#EEEEEE] text-sm text-avenue-text-body hover:bg-[#F8F9FA] transition-colors">
          Cancel
        </Link>
        <button type="submit" disabled={isPending || total === 0}
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-8 py-2.5 rounded-full font-semibold text-sm transition-colors shadow-sm disabled:opacity-50">
          {isPending ? "Submitting…" : "Submit Reimbursement Claim"}
        </button>
      </div>
    </form>
  );
}
