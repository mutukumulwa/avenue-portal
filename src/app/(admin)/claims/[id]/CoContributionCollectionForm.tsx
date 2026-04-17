"use client";

import { useState, useTransition } from "react";
import { collectCoContributionAction, waiveCoContributionAction } from "./actions";
import type { CoContributionTransaction } from "@prisma/client";

interface Props {
  transaction: CoContributionTransaction;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING:    "bg-[#FFC107]/10 text-[#856404]",
  COLLECTED:  "bg-[#28A745]/10 text-[#28A745]",
  PARTIAL:    "bg-[#17A2B8]/10 text-[#17A2B8]",
  WAIVED:     "bg-[#6C757D]/10 text-[#6C757D]",
  DEFERRED:   "bg-[#6C757D]/10 text-[#6C757D]",
  WRITTEN_OFF:"bg-[#DC3545]/10 text-[#DC3545]",
  REFUNDED:   "bg-[#DC3545]/10 text-[#DC3545]",
};

export function CoContributionCollectionForm({ transaction }: Props) {
  const [mode, setMode] = useState<"idle" | "collect" | "waive">("idle");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const finalAmount = Number(transaction.finalAmount);
  const isDone = ["COLLECTED", "WAIVED", "WRITTEN_OFF"].includes(transaction.collectionStatus);

  function handleCollect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await collectCoContributionAction(fd);
      if (res?.error) setError(res.error);
      else setMode("idle");
    });
  }

  function handleWaive(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await waiveCoContributionAction(fd);
      if (res?.error) setError(res.error);
      else setMode("idle");
    });
  }

  return (
    <div className="mt-4 border-t border-[#EEEEEE] pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1 text-sm">
          <div className="flex gap-6">
            <span className="text-avenue-text-muted">Member share</span>
            <span className="font-bold text-avenue-text-heading font-mono">
              KES {finalAmount.toLocaleString("en-KE")}
            </span>
          </div>
          <div className="flex gap-6">
            <span className="text-avenue-text-muted">Plan share</span>
            <span className="font-bold text-[#28A745] font-mono">
              KES {Number(transaction.planShare).toLocaleString("en-KE")}
            </span>
          </div>
          {Number(transaction.amountCollected ?? 0) > 0 && (
            <div className="flex gap-6">
              <span className="text-avenue-text-muted">Collected</span>
              <span className="font-bold text-[#17A2B8] font-mono">
                KES {Number(transaction.amountCollected).toLocaleString("en-KE")}
              </span>
            </div>
          )}
          {transaction.capsApplied && (transaction.capsApplied as string[]).length > 0 && (
            <p className="text-xs text-avenue-text-muted">
              Caps applied: {(transaction.capsApplied as string[]).join(", ")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${STATUS_COLOR[transaction.collectionStatus] ?? ""}`}>
            {transaction.collectionStatus}
          </span>
          {!isDone && (
            <>
              <button
                onClick={() => setMode(mode === "collect" ? "idle" : "collect")}
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-avenue-indigo/10 text-avenue-indigo hover:bg-avenue-indigo/20 transition-colors"
              >
                Record Payment
              </button>
              <button
                onClick={() => setMode(mode === "waive" ? "idle" : "waive")}
                className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#6C757D]/10 text-[#6C757D] hover:bg-[#6C757D]/20 transition-colors"
              >
                Waive
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">{error}</p>
      )}

      {mode === "collect" && (
        <form onSubmit={handleCollect} className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#F8F9FA] rounded-lg p-4">
          <input type="hidden" name="transactionId" value={transaction.id} />
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Amount (KES)</label>
            <input
              name="amountCollected"
              type="number"
              step="0.01"
              defaultValue={finalAmount}
              required
              className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Payment Method</label>
            <select name="paymentMethod" required className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo">
              <option value="CASH">Cash</option>
              <option value="MPESA">M-Pesa</option>
              <option value="CARD">Card</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="OFFSET">Offset</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">M-Pesa Ref (optional)</label>
            <input
              name="mpesaRef"
              type="text"
              placeholder="e.g. QHX1234ABC"
              className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo"
            />
          </div>
          <div className="md:col-span-3 flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="text-xs font-bold px-5 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Confirm Collection"}
            </button>
          </div>
        </form>
      )}

      {mode === "waive" && (
        <form onSubmit={handleWaive} className="bg-[#FFF8E1] border border-[#FFC107]/30 rounded-lg p-4 space-y-3">
          <input type="hidden" name="transactionId" value={transaction.id} />
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Waiver Reason (min 10 chars)</label>
            <textarea
              name="reason"
              required
              minLength={10}
              rows={2}
              placeholder="Document the reason for waiving the co-contribution…"
              className="w-full border border-[#FFC107]/40 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFC107] resize-none bg-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Approved By (name or staff ID)</label>
            <input
              name="approvedBy"
              type="text"
              required
              className="w-full border border-[#FFC107]/40 rounded-md px-3 py-2 text-sm outline-none focus:border-[#FFC107] bg-white"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setMode("idle")} className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending} className="text-xs font-bold px-5 py-2 rounded-full bg-[#856404] text-white hover:bg-[#6d5204] disabled:opacity-50 transition-colors">
              {isPending ? "Saving…" : "Confirm Waiver"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
