"use client";

import { useState, useTransition } from "react";
import { PlusCircle } from "lucide-react";
import { recordDepositAction } from "./actions";

export function DepositForm({ groupId }: { groupId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, start] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("groupId", groupId);
    setError(null);
    start(async () => {
      const res = await recordDepositAction(fd);
      if (res.error) setError(res.error);
      else { setOpen(false); (e.target as HTMLFormElement).reset(); }
    });
  }

  return (
    <div>
      {error && <p className="text-xs text-[#DC3545] mb-2">{error}</p>}
      {open ? (
        <form onSubmit={handleSubmit} className="bg-[#F8FAFF] border border-[#28A745]/20 rounded-lg p-4 space-y-3">
          <p className="text-sm font-bold text-avenue-text-heading">Record Fund Receipt</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Type</label>
              <select name="type" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-[#28A745] bg-white">
                <option value="DEPOSIT">Initial Deposit</option>
                <option value="TOP_UP">Top-Up</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Amount (KES)</label>
              <input name="amount" type="number" min="1" step="0.01" required
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-[#28A745] bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Cheque / EFT / M-Pesa Ref</label>
              <input name="referenceNumber" type="text" placeholder="optional"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-[#28A745] bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Notes</label>
              <input name="description" type="text" placeholder="e.g. Q2 top-up"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-[#28A745] bg-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE]">Cancel</button>
            <button type="submit" disabled={isPending}
              className="text-xs font-bold px-5 py-2 rounded-full bg-[#28A745] text-white hover:bg-[#1e7e34] disabled:opacity-50">
              {isPending ? "Recording…" : "Record Receipt"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border-2 border-dashed border-[#28A745]/40 text-[#28A745] hover:bg-[#28A745]/5 transition-colors">
          <PlusCircle size={13} /> Record Deposit / Top-Up
        </button>
      )}
    </div>
  );
}
