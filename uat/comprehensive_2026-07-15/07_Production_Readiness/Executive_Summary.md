# Executive Summary — Comprehensive UAT (2026-07-15)

**System:** Medvex TPA portal · **Target:** live `https://avenue-portal.vercel.app` (build `db60142`)
**Method:** rigorous, evidence-backed UAT through the real UI/API. **No database injects** (DB read-only,
once, to confirm an export's row count). **Verdict: 🟡 CONDITIONAL GO.**

## Bottom line
The two questions a TPA lives or dies by — **can it pay only what the contract allows, exactly once?**
and **can only the entitled read a member's data?** — both answer **YES with fresh live evidence.**
**No Critical or High defect was found** in everything exercised. One **Medium** reporting defect
(CU-001) and a set of launch conditions remain, and a meaningful breadth of workflows is still untested
(register in `GO_NO_GO_READINESS.md`). Hence **conditional**, not full, GO.

## What was proven strong (live, this pass)
- **Money out is correct and exactly-once.** An uncoded service line is capped at ceiling **0** and a
  full-billed approval is **refused** server-side; a settlement paid **once** produces exactly **one
  voucher + one balanced journal entry**, and a stale/retried "Mark Paid" is **refused** (FG-C7) — the
  double-pay race is closed. GL trial balance reads **Balanced**.
- **Data isolation holds.** Every role lands on its own surface with a **branded** access-denied on
  forbidden routes; a member cannot open another member's claim (404), a provider cannot open another
  facility's claim (404), and **all seven B2B API rails reject** missing/bogus/retired keys (401) — the
  historically dangerous default operator key is dead.
- **Adjudication controls are real, not hollow.** Approval matrix (amount-band, dual approval ≥200k),
  auto-adjudication (clean-fraud-required, ceiling), duplicate-claim detection, and point-in-time
  coverage all enforce. Fraud detection is active (88 alerts: after-hours, over-tariff, duplicates).

## What holds the verdict back
1. **CU-001 (Medium):** the on-screen Reports view caps at 100 rows and its summary counts undercount
   (shows 100 for a 2,999-member tenant); the **CSV export is correct**. Likely systemic to all reports.
2. **Fraud approval gate is OFF** by default — 88 open fraud alerts are advisory for the *manual*
   approval path (auto-approval is still fraud-gated). A go-live configuration decision.
3. **The environment is seeded demo data**, not a clean production load (a self-funded fund shows a
   negative balance; analytics are unpopulated). Conservation tie-out cannot pass on this data.
4. **N3 cross-employer exposure** (shared "Default Client" pooling 6 employers) remains an open
   business decision, not a regression.
5. **Breadth untested:** the remaining fork-B concurrency fixes (FG-C6/C8/C9/C10/C11) were not each
   individually re-driven live (they share the FG-C7 pattern that *was* proven); and many workflows —
   quote→bind, endorsements, cases/LOU, member check-in (Family-F), tenant onboarding, most settings,
   injection-boundary depth — are pending.

## Recommendation
Proceed toward go-live on the strength of the verified spine, **conditioned on**: (a) fix or accept
CU-001; (b) decide the fraud-gate configuration; (c) a clean production data load + conservation
tie-out at cutover; (d) resolve the N3 business decision; and (e) complete the untested-risk register
(a re-test leg — these routinely surface new defects behind the fixes). No blocker stands today.
