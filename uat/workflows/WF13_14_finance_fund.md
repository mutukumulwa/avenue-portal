# Workflows W13 (Finance/GL) + W14 (Self-Funded Fund) — LIVE, local seeded instance

Environment: `http://localhost:3000` · 2026-06-25 · roles: SUPER_ADMIN / FUND_ADMINISTRATOR (admin switched to Fund portal).

## W14 — Self-Funded Fund Management

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 14.1 | `/fund/dashboard` | KPIs render (not all 0) | TOTAL FUND BALANCE **KES 34,928,000**, TOTAL DEPOSITS 44,000,000, **TOTAL CLAIMS PAID 8,022,000**, low-balance alerts 1; 2 schemes (Bamburi, EABL) with balances | ✅ PASS — **DEFECT-015 resolved** (claims-paid no longer 0) |
| 14.2 | Open Bamburi → **Record Deposit / Top-Up** → KES 1,000,000 → Record Receipt | persists; balance updates | **No crash.** Balance **3,800,000 → 4,800,000**; `FundTransaction` (DEPOSIT, 1,000,000, balanceAfter 4,800,000, ref UAT-DEP-001, postedBy set); `SelfFundedAccount.balance=4,800,000` in DB | ✅ PASS — 🟢 **DEFECT-016 RESOLVED (Critical blocker cleared)** |
| 14.4 | Statement page | renders (not 404) | "Fund Statement" for Bamburi with transactions incl. the new deposit | ✅ PASS — **DEFECT-014 not reproduced** (was prod stale-deploy) |
| 14.4 | Statement **export** | CSV downloads, matches | `GET /api/fund/<id>/statement/export` → **200 text/csv**, Closing Balance **4,800,000** (matches deposit), Total Deposited 13,000,000 | ✅ PASS |

## W13 — Finance / GL

| Step | Action | Expected | Actual | Status |
|---|---|---|---|---|
| 13.1 | `/billing` | invoices/finance hub renders | "Billing & Finance" with Billing/GL/Account-Ledger/Self-Funded/Brokers/Quotations | ✅ PASS |
| 13.5 | General Ledger → Trial Balance | 24 accounts; **balances** | `/billing/gl`: **24 accounts**, Trial Balance flagged **"Balanced"**, double-entry (Cash at Bank 915,000; Premium Receivables 1,065,000…); P&L + Chart of Accounts tabs. DB cross-check: Σdebit = Σcredit = 3,048,700 (diff 0) | ✅ PASS |

## Phase 5 summary
- 🟢 **DEFECT-016 (fund deposit crash) RESOLVED** — the last untested Critical blocker now works end-to-end (deposit persists, FundTransaction + balanceAfter + posting user recorded).
- 🟢 **DEFECT-015 (fund KPI mismatch) resolved** — dashboard shows real claims-paid + balances.
- 🟢 **DEFECT-014 (fund statement/export 404)** not reproduced locally — it was a production stale-deploy artifact; page + CSV export both work.
- ✅ GL trial balance is **Balanced** (24 accounts) in UI and DB.

## Remaining (not tested this pass)
W13 billing run, record-payment, bank reconciliation, taxes/levies (Stamp Duty/Training Levy/PHCF) calc; W14 admin-fee statement calc; deposit edge cases (negative/zero/over-withdraw). Carry forward.

## Cross-reference
DEF-008 (settlement posts no GL JournalEntry) — note the GL header claims "auto-posted from claims, invoices, payments", yet provider settlement did not post a journal (see [WF09](WF09_adjudication_settlement.md)); confirm which events auto-post.
