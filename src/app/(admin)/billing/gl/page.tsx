import React from "react";
import { GLService, STANDARD_ACCOUNTS } from "@/server/services/gl.service";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { BookOpen, TrendingUp, TrendingDown, DollarSign, Settings } from "lucide-react";
import { seedChartOfAccountsAction } from "./actions";
import { requireRole, ROLES } from "@/lib/rbac";

export default async function GLPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireRole(ROLES.FINANCE);

  const tenantId = session.user.tenantId;
  const { tab = "trial-balance" } = await searchParams;

  // Check if CoA is seeded
  const accountCount = await prisma.chartOfAccount.count({ where: { tenantId } });
  const coaReady = accountCount > 0;

  const [trialBalance, pl] = coaReady
    ? await Promise.all([
        GLService.getTrialBalance(tenantId),
        GLService.getPLSummary(tenantId),
      ])
    : [[], { revenue: [], expenses: [], totalRevenue: 0, totalExpenses: 0, netProfit: 0 }];

  const totalDebits  = trialBalance.reduce((s, a) => s + a.totalDebit,  0);
  const totalCredits = trialBalance.reduce((s, a) => s + a.totalCredit, 0);

  const tabs = [
    { key: "trial-balance", label: "Trial Balance" },
    { key: "pl",            label: "P&L Summary"   },
    { key: "accounts",      label: "Chart of Accounts" },
  ];

  const typeOrder = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
  const typeColor: Record<string, string> = {
    ASSET:     "text-avenue-indigo",
    LIABILITY: "text-[#DC3545]",
    EQUITY:    "text-[#6C757D]",
    REVENUE:   "text-[#28A745]",
    EXPENSE:   "text-[#FFC107]",
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-avenue-text-heading font-heading flex items-center gap-2">
            <BookOpen size={22} className="text-avenue-indigo" /> General Ledger
          </h1>
          <p className="text-avenue-text-body mt-1 text-sm">
            Double-entry accounting records — auto-posted from claims, invoices and payments.
          </p>
        </div>
        <Link
          href="/billing/gl/ledger"
          className="flex items-center gap-2 px-5 py-2 rounded-full border border-avenue-indigo text-avenue-indigo text-sm font-semibold hover:bg-avenue-indigo hover:text-white transition-colors"
        >
          Account Ledger
        </Link>
      </div>

      {/* CoA not seeded — setup prompt */}
      {!coaReady && (
        <div className="bg-[#FFF8E1] border border-[#FFC107]/50 rounded-lg p-6 flex items-start gap-4">
          <Settings size={22} className="text-[#856404] shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-[#856404]">Chart of Accounts not yet initialised</p>
            <p className="text-sm text-[#856404]/80 mt-1">
              Click below to load the standard health-insurer chart of accounts ({STANDARD_ACCOUNTS.length} accounts).
              This is a one-time setup — accounts can be customised afterwards.
            </p>
            <form action={seedChartOfAccountsAction} className="mt-3">
              <button
                type="submit"
                className="bg-[#FFC107] hover:bg-[#E0A800] text-[#3D2B00] px-6 py-2 rounded-full font-bold text-sm transition-colors"
              >
                Initialise Chart of Accounts
              </button>
            </form>
          </div>
        </div>
      )}

      {/* KPI strip */}
      {coaReady && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Accounts",   value: accountCount,                             color: "text-avenue-indigo",  Icon: BookOpen     },
            { label: "Gross Revenue",    value: `KES ${pl.totalRevenue.toLocaleString("en-KE")}`,   color: "text-[#28A745]",    Icon: TrendingUp   },
            { label: "Total Expenses",   value: `KES ${pl.totalExpenses.toLocaleString("en-KE")}`,  color: "text-[#DC3545]",    Icon: TrendingDown },
            { label: "Net Profit/(Loss)",value: `KES ${pl.netProfit.toLocaleString("en-KE")}`,      color: pl.netProfit >= 0 ? "text-[#28A745]" : "text-[#DC3545]", Icon: DollarSign },
          ].map(s => (
            <div key={s.label} className="bg-white border border-[#EEEEEE] rounded-lg p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-avenue-text-muted flex items-center gap-1">
                <s.Icon size={11} /> {s.label}
              </p>
              <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab nav */}
      {coaReady && (
        <>
          <div className="flex gap-1 bg-[#F8F9FA] rounded-lg p-1 w-fit">
            {tabs.map(t => (
              <Link
                key={t.key}
                href={`/billing/gl?tab=${t.key}`}
                className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  tab === t.key
                    ? "bg-white text-avenue-indigo shadow-sm"
                    : "text-avenue-text-muted hover:text-avenue-text-heading"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>

          {/* ── Trial Balance ── */}
          {tab === "trial-balance" && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#EEEEEE] flex justify-between items-center">
                <h2 className="font-bold text-avenue-text-heading font-heading">Trial Balance</h2>
                <span className={`text-xs font-semibold ${Math.abs(totalDebits - totalCredits) < 0.01 ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                  {Math.abs(totalDebits - totalCredits) < 0.01 ? "✓ Balanced" : `⚠ Out of balance by KES ${Math.abs(totalDebits - totalCredits).toLocaleString("en-KE")}`}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                    <th className="px-5 py-2.5 text-left w-16">Code</th>
                    <th className="px-5 py-2.5 text-left">Account</th>
                    <th className="px-5 py-2.5 text-left">Type</th>
                    <th className="px-5 py-2.5 text-right">Debit (KES)</th>
                    <th className="px-5 py-2.5 text-right">Credit (KES)</th>
                    <th className="px-5 py-2.5 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {typeOrder.map(type => {
                    const rows = trialBalance.filter(a => a.type === type);
                    if (rows.length === 0) return null;
                    const groupDebit  = rows.reduce((s, a) => s + a.totalDebit,  0);
                    const groupCredit = rows.reduce((s, a) => s + a.totalCredit, 0);
                    const groupNet    = rows.reduce((s, a) => s + a.netBalance,  0);
                    return (
                      <React.Fragment key={type}>
                        <tr className="bg-[#F8F9FA]">
                          <td colSpan={3} className={`px-5 py-1.5 text-[10px] font-bold uppercase ${typeColor[type]}`}>{type}</td>
                          <td className="px-5 py-1.5 text-right text-[10px] font-bold text-avenue-text-muted">{groupDebit.toLocaleString("en-KE")}</td>
                          <td className="px-5 py-1.5 text-right text-[10px] font-bold text-avenue-text-muted">{groupCredit.toLocaleString("en-KE")}</td>
                          <td className="px-5 py-1.5 text-right text-[10px] font-bold text-avenue-text-muted">{groupNet.toLocaleString("en-KE")}</td>
                        </tr>
                        {rows.map(a => (
                          <tr key={a.id} className="hover:bg-[#F8F9FA]">
                            <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted">{a.code}</td>
                            <td className="px-5 py-2.5">
                              <Link href={`/billing/gl/ledger?account=${a.code}`} className="text-avenue-text-heading hover:text-avenue-indigo transition-colors">
                                {a.name}
                              </Link>
                            </td>
                            <td className="px-5 py-2.5">
                              <span className={`text-[10px] font-bold uppercase ${typeColor[a.type]}`}>{a.type}</span>
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-sm">
                              {a.totalDebit > 0 ? a.totalDebit.toLocaleString("en-KE") : "—"}
                            </td>
                            <td className="px-5 py-2.5 text-right font-mono text-sm">
                              {a.totalCredit > 0 ? a.totalCredit.toLocaleString("en-KE") : "—"}
                            </td>
                            <td className={`px-5 py-2.5 text-right font-bold font-mono text-sm ${a.netBalance < 0 ? "text-[#DC3545]" : "text-avenue-text-heading"}`}>
                              {a.netBalance !== 0 ? a.netBalance.toLocaleString("en-KE") : "—"}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-avenue-indigo/20 bg-avenue-indigo/5">
                  <tr>
                    <td colSpan={3} className="px-5 py-3 font-bold text-avenue-text-heading text-sm">TOTAL</td>
                    <td className="px-5 py-3 text-right font-bold font-mono">{totalDebits.toLocaleString("en-KE")}</td>
                    <td className="px-5 py-3 text-right font-bold font-mono">{totalCredits.toLocaleString("en-KE")}</td>
                    <td className="px-5 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── P&L Summary ── */}
          {tab === "pl" && (
            <div className="space-y-4">
              {/* Revenue */}
              <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-[#EEEEEE] bg-[#28A745]/5 flex justify-between items-center">
                  <h3 className="font-bold text-[#28A745] font-heading flex items-center gap-2"><TrendingUp size={15} /> Revenue</h3>
                  <span className="font-bold text-[#28A745]">KES {pl.totalRevenue.toLocaleString("en-KE")}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-[#EEEEEE]">
                    {pl.revenue.map(a => (
                      <tr key={a.id} className="hover:bg-[#F8F9FA]">
                        <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted w-16">{a.code}</td>
                        <td className="px-5 py-2.5 text-avenue-text-heading">{a.name}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-[#28A745]">
                          {a.netBalance !== 0 ? `KES ${a.netBalance.toLocaleString("en-KE")}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Expenses */}
              <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
                <div className="px-6 py-3 border-b border-[#EEEEEE] bg-[#DC3545]/5 flex justify-between items-center">
                  <h3 className="font-bold text-[#DC3545] font-heading flex items-center gap-2"><TrendingDown size={15} /> Expenses</h3>
                  <span className="font-bold text-[#DC3545]">KES {pl.totalExpenses.toLocaleString("en-KE")}</span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-[#EEEEEE]">
                    {pl.expenses.map(a => (
                      <tr key={a.id} className="hover:bg-[#F8F9FA]">
                        <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted w-16">{a.code}</td>
                        <td className="px-5 py-2.5 text-avenue-text-heading">{a.name}</td>
                        <td className="px-5 py-2.5 text-right font-semibold text-[#DC3545]">
                          {a.netBalance !== 0 ? `KES ${a.netBalance.toLocaleString("en-KE")}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Net profit */}
              <div className={`rounded-lg p-5 border-2 ${pl.netProfit >= 0 ? "border-[#28A745]/30 bg-[#28A745]/5" : "border-[#DC3545]/30 bg-[#DC3545]/5"}`}>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-avenue-text-heading font-heading text-lg">Net Profit / (Loss)</span>
                  <span className={`text-2xl font-bold ${pl.netProfit >= 0 ? "text-[#28A745]" : "text-[#DC3545]"}`}>
                    {pl.netProfit < 0 ? "(" : ""}KES {Math.abs(pl.netProfit).toLocaleString("en-KE")}{pl.netProfit < 0 ? ")" : ""}
                  </span>
                </div>
                <p className="text-xs text-avenue-text-muted mt-1">Based on all posted journal entries to date. Excludes manual adjustments not yet entered.</p>
              </div>
            </div>
          )}

          {/* ── Chart of Accounts ── */}
          {tab === "accounts" && (
            <div className="bg-white border border-[#EEEEEE] rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#EEEEEE]">
                <h2 className="font-bold text-avenue-text-heading font-heading">Chart of Accounts</h2>
                <p className="text-xs text-avenue-text-muted mt-0.5">{accountCount} accounts · click any account name to view its ledger</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F8F9FA] text-[10px] font-bold uppercase text-avenue-text-muted border-b border-[#EEEEEE]">
                    <th className="px-5 py-2.5 text-left w-16">Code</th>
                    <th className="px-5 py-2.5 text-left">Name</th>
                    <th className="px-5 py-2.5 text-left">Type</th>
                    <th className="px-5 py-2.5 text-left">Subtype</th>
                    <th className="px-5 py-2.5 text-left">Normal Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEEEEE]">
                  {trialBalance.map(a => (
                    <tr key={a.id} className="hover:bg-[#F8F9FA]">
                      <td className="px-5 py-2.5 font-mono text-xs text-avenue-text-muted">{a.code}</td>
                      <td className="px-5 py-2.5">
                        <Link href={`/billing/gl/ledger?account=${a.code}`} className="text-avenue-text-heading hover:text-avenue-indigo transition-colors font-medium">
                          {a.name}
                        </Link>
                        {a.description && <p className="text-[10px] text-avenue-text-muted mt-0.5">{a.description}</p>}
                      </td>
                      <td className="px-5 py-2.5">
                        <span className={`text-[10px] font-bold uppercase ${typeColor[a.type]}`}>{a.type}</span>
                      </td>
                      <td className="px-5 py-2.5 text-avenue-text-muted text-xs">{a.subtype ?? "—"}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          a.normalBalance === "DEBIT"
                            ? "bg-avenue-indigo/10 text-avenue-indigo"
                            : "bg-[#28A745]/10 text-[#28A745]"
                        }`}>
                          {a.normalBalance}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
