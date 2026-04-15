"use client";

import { useActionState, useState } from "react";
import { createInvoiceAction } from "./actions";
import { X } from "lucide-react";

type Group = { id: string; name: string };

export function NewInvoiceModal({ groups }: { groups: Group[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createInvoiceAction, null);

  // Default period to current month
  const defaultPeriod = new Date().toISOString().slice(0, 7);
  const defaultDue = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 shadow-sm"
      >
        + New Invoice
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-avenue-text-muted hover:text-avenue-text-heading"
            >
              <X size={18} />
            </button>

            <h2 className="text-lg font-bold text-avenue-text-heading font-heading mb-4">New Invoice</h2>

            {state?.error && (
              <div className="mb-4 px-4 py-2.5 bg-[#DC3545]/10 text-[#DC3545] text-sm rounded-lg">
                {state.error}
              </div>
            )}

            <form action={action} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Group</label>
                <select name="groupId" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo bg-white">
                  <option value="">Select group…</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Period (YYYY-MM)</label>
                  <input name="period" type="month" defaultValue={defaultPeriod} required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Due Date</label>
                  <input name="dueDate" type="date" defaultValue={defaultDue} required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Member Count</label>
                  <input name="memberCount" type="number" min="1" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Rate / Member (KES)</label>
                  <input name="ratePerMember" type="number" min="0" step="0.01" required className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-avenue-text-muted uppercase mb-1">Notes (optional)</label>
                <textarea name="notes" rows={2} className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo resize-none" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-avenue-text-body border border-[#EEEEEE] rounded-full hover:bg-[#F8F9FA] transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="px-5 py-2 text-sm font-semibold bg-avenue-indigo hover:bg-avenue-secondary text-white rounded-full transition-colors disabled:opacity-60">
                  {pending ? "Creating…" : "Create Draft"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
