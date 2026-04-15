import { requireRole, ROLES } from "@/lib/rbac";
import { GLService } from "@/server/services/gl.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

export default async function AccountLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; from?: string; to?: string }>;
}) {
  const session = await requireRole(ROLES.FINANCE);

  const tenantId = session.user.tenantId;
  const { account: accountCode, from, to } = await searchParams;

  // Get available accounts for the selector
  const accounts = await prisma.chartOfAccount.findMany({
    where:   { tenantId, isActive: true },
    orderBy: { code: "asc" },
  });

  const ledger = accountCode
    ? await GLService.getAccountLedger(tenantId, accountCode, {
        from: from ? new Date(from) : undefined,
        to:   to   ? new Date(to)   : undefined,
      })
    : null;

  const sourceTypeLabel: Record<string, string> = {
    INVOICE_ISSUED:   "Invoice",
    PREMIUM_RECEIVED: "Premium",
    CLAIM_APPROVED:   "Claim",
    CLAIM_PAID:       "Payment",
    COMMISSION_EARNED:"Commission",
    MANUAL:           "Manual",
  };

  const openingBalance = 0; // Would be computed from prior period in a full implementation

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/billing/gl" className="text-avenue-text-muted hover:text-avenue-indigo transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            <BookOpen size={20} className="text-avenue-indigo" />
            Account Ledger
          </h1>
          <p className="text-sm text-avenue-text-body mt-0.5">
            Line-by-line transaction history with running balance for a single account.
          </p>
        </div>
      </div>

      {/* Filters */}
      <form method="GET" className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-48">
          <label className="text-[10px] font-bold uppercase text-avenue-text-muted block mb-1">Account</label>
          <select
            name="account"
            defaultValue={accountCode ?? ""}
            className="w-full border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo"
          >
            <option value="">— Select account —</option>
            {accounts.map(a => (
              <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-avenue-text-muted block mb-1">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold uppercase text-avenue-text-muted block mb-1">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="border border-[#EEEEEE] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-avenue-indigo"
          />
        </div>
        <button
          type="submit"
          className="bg-avenue-indigo hover:bg-avenue-secondary text-white px-6 py-2 rounded-full font-semibold text-sm transition-colors"
        >
          View Ledger
        </button>
      </form>

      {/* No account selected */}
      {!ledger && (
        <div className="bg-white border border-[#EEEEEE] rounded-lg p-10 text-center text-sm text-avenue-text-muted shadow-sm">
          Select an account above to view its transaction history.
        </div>
      )}

      {/* Ledger table */}
      {ledger && (
        <>
          {/* Account summary card */}
          <div className="bg-white border border-[#EEEEEE] rounded-lg p-5 shadow-sm flex items-start justify-between">
            <div>
              <p className="font-mono text-xs text-avenue-text-muted">{ledger.account.code}</p>
              <p className="font-bold text-xl text-avenue-text-heading mt-0.5">{ledger.account.name}</p>
              <p className="text-xs text-avenue-text-muted mt-1">
                {ledger.account.type} · {ledger.account.subtype ?? "—"} · Normal balance: {ledger.account.normalBalance}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-avenue-text-muted">Closing Balance</p>
              <p className={`text-2xl font-bold mt-1 ${
                (ledger.lines.at(-1)?.balance ?? 0) < 0 ? "text-[#DC3545]" : "text-avenue-indigo"
              }`}>
                KES {(ledger.lines.at(-1)?.balance ?? openingBalance).toLocaleString("en-KE")}
              </p>
              <p className="text-xs text-avenue-text-muted mt-0.5">{ledger.lines.length} transaction{ledger.lines.length !== 1 ? "s" : ""}</p>
            </div>
          </div>

          <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                  <th className="px-5 py-2.5 text-left">Date</th>
                  <th className="px-5 py-2.5 text-left">Entry No.</th>
                  <th className="px-5 py-2.5 text-left">Description</th>
                  <th className="px-5 py-2.5 text-left">Source</th>
                  <th className="px-5 py-2.5 text-right">Debit (KES)</th>
                  <th className="px-5 py-2.5 text-right">Credit (KES)</th>
                  <th className="px-5 py-2.5 text-right">Balance (KES)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEEEEE]">
                {/* Opening balance row */}
                <tr className="bg-[#F8F9FA] text-avenue-text-muted">
                  <td colSpan={6} className="px-5 py-2 text-xs font-semibold">Opening Balance</td>
                  <td className="px-5 py-2 text-right text-xs font-bold">{openingBalance.toLocaleString("en-KE")}</td>
                </tr>

                {ledger.lines.map((line, i) => (
                  <tr key={i} className="hover:bg-[#F8F9FA]">
                    <td className="px-5 py-2.5 text-avenue-text-muted text-xs whitespace-nowrap">
                      {new Date(line.journalEntry.entryDate).toLocaleDateString("en-KE")}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-xs text-avenue-indigo">
                      {line.journalEntry.entryNumber}
                    </td>
                    <td className="px-5 py-2.5 text-avenue-text-heading max-w-xs">
                      {line.description ?? line.journalEntry.description}
                      {line.journalEntry.reference && (
                        <span className="ml-1 text-[10px] font-mono text-avenue-text-muted">· {line.journalEntry.reference}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className="text-[10px] font-bold uppercase bg-[#E6E7E8] text-[#6C757D] px-2 py-0.5 rounded-full">
                        {sourceTypeLabel[line.journalEntry.sourceType] ?? line.journalEntry.sourceType}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">
                      {line.debit > 0 ? line.debit.toLocaleString("en-KE") : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">
                      {line.credit > 0 ? line.credit.toLocaleString("en-KE") : "—"}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-bold font-mono ${line.balance < 0 ? "text-[#DC3545]" : "text-avenue-text-heading"}`}>
                      {line.balance.toLocaleString("en-KE")}
                    </td>
                  </tr>
                ))}

                {ledger.lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-avenue-text-muted">
                      No transactions in this account for the selected period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
