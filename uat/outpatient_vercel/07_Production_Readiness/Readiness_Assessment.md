# Readiness Assessment — Outpatient Front-End UAT (Vercel)

Full verdict, spine-question answers, and blocker scoreboard: see `../GO_NO_GO_READINESS.md`.
Per-step evidence: `../TEST_RUN_LOG.md`. Defects: `../DEFECT_REGISTER.md`.

## Scope caveat (up front)
Workflows exercised end-to-end this run: provider intake, TPA adjudication (approve + decline), settlement maker/checker (up to the failing settle step), GL trial balance, member portal, reports-viewer propagation, and RBAC scoping across five roles. **Not** exercised: full settlement/payment (blocked by PR-V02), partial-approval money math + settlement, fund-admin impact, live HR employer-scope, report exports, notifications, and the remaining Scenario D validations (double-submit, future date, zero line, duplicate settlement, decide-before-compute). Those are named risks, not passes.

## Systemic patterns (predict where the next defects live)
1. **Server-side controls are real, but the money-out execution is fragile.** The design has genuine guardrails (maker≠checker, payable ceiling, pay-above override, branded RBAC denials). Yet the actual settle operation isn't engineered for realistic batch sizes — it updates each claim inside one 5-second interactive transaction (PR-V02). Expect similar timeout/scale fragility anywhere a single request mutates many rows (bulk approvals, bulk endorsements, large imports).
2. **Raw errors leak to the UI.** The settlement failure surfaced a Prisma stack-style message (table/method, transaction internals) to the operator and into the URL query string. This is both a UX and information-disclosure smell; audit other mutating endpoints for un-wrapped errors.
3. **Auto-adjudication/fraud routing is effectively "route everything to manual".** Every provider claim tested — including one billed exactly at contract tariff — was routed to manual review with a fraud flag, and the variance metric compares whole-claim billed against a single line's contracted rate. Net effect: no automation relief and a "fraud flag" that carries little signal.
4. **Two sources of truth on the claim screen disagree.** The read-only "contract engine (digital contract)" preview says "no contract matched / payable 0" while the adjudication panel computes the correct ceiling. Operators may trust the wrong one.
5. **Currency is labelled inconsistently (KES vs UGX) and never converted.** Amounts are numerically identical across labels — fine only if there is exactly one real currency. For a Ugandan client this must be pinned down before payments.

## Remediation priorities
| Priority | Item | Why |
|----------|------|-----|
| P0 | **PR-V02** — re-architect settle to batch/queue the claim updates (avoid one long interactive transaction) or chunk + raise timeout; wrap errors in friendly messages; ensure a stranded CHECKER-APPROVED batch is recoverable | Unblocks money-out; core path |
| P0 | **OBS-7** — decide & enforce whether fraud-flagged / high-variance approvals require a 2nd approval and/or fraud-alert clearance | Money-leakage control |
| P1 | **OBS-2** — resolve KES/UGX labelling and confirm single settlement currency / FX handling | Correct payments |
| P1 | **OBS-5** — fix variance basis (per-line vs whole-claim) and calibrate fraud routing so at-tariff claims auto-clear | Operational load + signal |
| P2 | **OBS-4** — reconcile contract-engine preview with the adjudication ceiling (or relabel preview) | Adjudicator accuracy |
| P2 | **PR-V01** — provider list search should match existing facilities | Findability |
| P3 | OBS-1 (blank users pane after invite), OBS-3 (inline role dropdown), OBS-6 (nav shows a link that denies for the role) | Polish |

## Re-test plan (Phase R)
Re-run **through the front end, as the original personas, on a fresh session**:
1. Create a fresh settlement batch → checker approve → **Mark Paid → SETTLED**; confirm provider "paid to date" and member/reports reflect PAID; GL posts a balanced provider-payment journal.
2. Re-drive an approval on a fraud-flagged claim and confirm the (now-defined) approval gate fires.
3. Complete the untested register above.
Only fresh front-end evidence lifts PR-V02 and the NO-GO — a code fix or passing unit test does not.
