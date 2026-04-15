"use client";

import { useActionState } from "react";
import { submitComplaintAction } from "./actions";
import { CheckCircle } from "lucide-react";

const COMPLAINT_TYPES = [
  { value: "SERVICE",   label: "Avenue Service" },
  { value: "FACILITY",  label: "Network Facility" },
  { value: "BILLING",   label: "Billing / Invoice Dispute" },
  { value: "CLINICAL",  label: "Clinical Care" },
  { value: "GENERAL",   label: "General Enquiry" },
];

export function ComplaintForm() {
  const [result, action, isPending] = useActionState(submitComplaintAction, null);

  if (result?.success) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle size={36} className="text-[#28A745]" />
        <p className="font-bold text-avenue-text-heading">Grievance submitted</p>
        <p className="text-sm text-avenue-text-muted">
          Your reference number is{" "}
          <span className="font-mono font-bold text-avenue-indigo">{result.reference}</span>.
          Our team will respond within 2 business days.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3">
      {result?.error && (
        <div className="px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
          {result.error}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Category</label>
        <select
          name="type"
          required
          className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo bg-white"
        >
          <option value="">Select category…</option>
          {COMPLAINT_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Subject</label>
        <input
          name="subject"
          type="text"
          required
          maxLength={120}
          placeholder="Brief summary of your grievance"
          className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Details</label>
        <textarea
          name="description"
          required
          rows={4}
          placeholder="Describe the issue, including dates, facility names, or staff involved where relevant…"
          className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-avenue-indigo resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-avenue-indigo hover:bg-avenue-secondary text-white py-2.5 rounded-full font-semibold text-sm transition-colors disabled:opacity-60"
      >
        {isPending ? "Submitting…" : "Submit Grievance"}
      </button>
    </form>
  );
}
