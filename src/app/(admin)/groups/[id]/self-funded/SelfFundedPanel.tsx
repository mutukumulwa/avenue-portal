"use client";

import { useState, useTransition } from "react";
import { PlusCircle, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { recordFundDepositAction } from "./actions";
import type { SelfFundedAccount, FundTransaction } from "@prisma/client";

interface Props {
  groupId: string;
  account: (SelfFundedAccount & { transactions: FundTransaction[] }) | null;
  minimumBalance: number;
}

const TYPE_COLOR: Record<string, string> = {
  DEPOSIT:         "text-[#28A745]",
  TOP_UP:          "text-[#28A745]",
  CLAIM_DEDUCTION: "text-[#DC3545]",
  ADMIN_FEE:       "text-[#DC3545]",
  REFUND:          "text-[#17A2B8]",
  ADJUSTMENT:      "text-[#6C757D]",
};

const TYPE_SIGN: Record<string, string> = {
  DEPOSIT: "+", TOP_UP: "+", REFUND: "+",
  CLAIM_DEDUCTION: "−", ADMIN_FEE: "−", ADJUSTMENT: "±",
};

export function SelfFundedPanel({ groupId, account, minimumBalance }: Props) {
  const [showForm, setShowForm]  = useState(false);
  const [error, setError]        = useState<string | null>(null);
  const [isPending, start]       = useTransition();

  const balance = account ? Number(account.balance) : 0;
  const isLow   = balance > 0 && balance < minimumBalance;
  const isEmpty = balance <= 0;

  function handleDeposit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("groupId", groupId);
    setError(null);
    start(async () => {
      const res = await recordFundDepositAction(fd);
      if (res.error) setError(res.error);
      else { setShowForm(false); (e.target as HTMLFormElement).reset(); }
    });
  }

  return (
    <div className="space-y-4">
      {/* Balance summary */}
      <div className={`flex items-center justify-between p-4 rounded-lg border ${isEmpty ? "border-[#DC3545]/30 bg-[#DC3545]/5" : isLow ? "border-[#FFC107]/40 bg-[#FFF8E1]" : "border-[#28A745]/20 bg-[#28A745]/5"}`}>
        <div className="flex items-center gap-3">
          <Wallet size={20} className={isEmpty ? "text-[#DC3545]" : isLow ? "text-[#856404]" : "text-[#28A745]"} />
          <div>
            <p className="text-xs font-bold uppercase text-avenue-text-muted">Fund Balance</p>
            <p className={`text-2xl font-bold font-mono ${isEmpty ? "text-[#DC3545]" : isLow ? "text-[#856404]" : "text-[#28A745]"}`}>
              KES {balance.toLocaleString("en-KE")}
            </p>
            {isLow && <p className="text-xs text-[#856404] mt-0.5">Below minimum balance of KES {minimumBalance.toLocaleString()}</p>}
          </div>
        </div>
        {account && (
          <div className="text-right text-sm space-y-1">
            <div className="flex items-center gap-1.5 text-[#28A745]"><TrendingUp size={13} /> KES {Number(account.totalDeposited).toLocaleString()} deposited</div>
            <div className="flex items-center gap-1.5 text-[#DC3545]"><TrendingDown size={13} /> KES {Number(account.totalClaims).toLocaleString()} claims</div>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-[#DC3545] bg-[#DC3545]/5 border border-[#DC3545]/20 rounded px-3 py-2">{error}</p>}

      {/* Deposit / Top-up form */}
      {showForm ? (
        <form onSubmit={handleDeposit} className="bg-[#F8FAFF] border border-avenue-indigo/20 rounded-lg p-4 space-y-3">
          <p className="text-sm font-bold text-avenue-text-heading">Record Fund Receipt</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Type</label>
              <select name="type" className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white">
                <option value="DEPOSIT">Initial Deposit</option>
                <option value="TOP_UP">Top-Up</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Amount (KES)</label>
              <input name="amount" type="number" min="1" step="0.01" required
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-avenue-text-muted uppercase">Cheque / EFT / M-Pesa Ref</label>
              <input name="referenceNumber" type="text" placeholder="optional"
                className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-avenue-text-muted uppercase">Notes</label>
            <input name="description" type="text" placeholder="e.g. Q2 top-up from client"
              className="w-full border border-[#EEEEEE] rounded-md px-3 py-2 text-sm outline-none focus:border-avenue-indigo bg-white" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="text-xs px-4 py-2 rounded-full border border-[#EEEEEE] hover:bg-[#EEEEEE] transition-colors">Cancel</button>
            <button type="submit" disabled={isPending}
              className="text-xs font-bold px-5 py-2 rounded-full bg-avenue-indigo text-white hover:bg-avenue-secondary disabled:opacity-50 transition-colors">
              {isPending ? "Recording…" : "Record Receipt"}
            </button>
          </div>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-full border-2 border-dashed border-avenue-indigo/30 text-avenue-indigo hover:bg-avenue-indigo/5 transition-colors">
          <PlusCircle size={13} /> Record Deposit / Top-Up
        </button>
      )}

      {/* Transaction ledger */}
      {account && account.transactions.length > 0 && (
        <div className="bg-white border border-[#EEEEEE] rounded-[8px] shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EEEEEE]">
            <p className="text-xs font-bold uppercase text-avenue-text-muted">Fund Ledger</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">Ref</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEEEEE]">
              {account.transactions.map(t => (
                <tr key={t.id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2.5 text-avenue-text-muted text-xs">{new Date(t.postedAt).toLocaleDateString("en-KE")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-bold ${TYPE_COLOR[t.type] ?? "text-avenue-text-muted"}`}>
                      {t.type.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-avenue-text-body text-xs">{t.description}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-avenue-text-muted">{t.referenceNumber ?? "—"}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold text-xs ${TYPE_COLOR[t.type]}`}>
                    {TYPE_SIGN[t.type]}{Number(t.amount).toLocaleString("en-KE")}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-avenue-text-heading">
                    {Number(t.balanceAfter).toLocaleString("en-KE")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {account && account.transactions.length === 0 && (
        <p className="text-sm text-avenue-text-muted">No fund transactions recorded yet.</p>
      )}
    </div>
  );
}
