# GO / NO-GO — Comprehensive Outpatient Front-End UAT (Vercel)

**Verdict: NO-GO** for outpatient go-live (as of 2026-07-07).
Driven by one Critical blocker: the outpatient claim **cannot be paid end-to-end through the front end** — settlement "Mark Paid" fails deterministically.

- **Target:** https://avenue-portal.vercel.app (Vercel production deployment `dpl_4rP7…`, READY)
- **Method:** 100% browser-driven via Chrome, every actor logging in as themselves, front-end only, no DB/API shortcuts (per runbook). Missing users created by admin through the UI.
- **Scope tested:** Setup (all users), Scenario A (full-approval principal), Scenario B (dependant decline), Scenario C (provider/member RBAC scoping), Scenario D (partial validation). GL reviewed.

## Spine questions
| # | Question | Answer | Basis |
|---|----------|--------|-------|
| 1 | Can an outpatient claim be filed → adjudicated → **settled** → reflected to provider/member/reports, each actor as themselves, front-end only? | **NO** | File ✓ (provider portal), adjudicate ✓ (APPROVED 16,500), member/reports reflect ✓ — but **settle FAILS (PR-V02)**: "Mark Paid" times out; batch stranded at CHECKER APPROVED. |
| 2 | Does money/benefit leave only per contract (maker≠checker, payable ceiling, GL balanced, rejected excluded)? | **PARTIAL** | Maker/checker enforced ✓, payable ceiling + "pay-above-ceiling" override ✓, GL trial balance ✓ balanced, decline carries no payable ✓. Caveats: a single claims officer approved a fraud-flagged claim in full with no 2nd approval (OBS-7); settlement itself can't complete. |
| 3 | Is data scope hard — provider sees only own facility, member only self, forbidden routes denied? | **YES** | Provider hard-scoped (Aga Khan vs IHK isolation), member IDOR to admin routes denied, branded "Access Denied" across claims-officer/member/provider. |

## Blocker scoreboard
| ID | Sev | Blocks | Status |
|----|-----|--------|--------|
| PR-V02 | **Critical** | Provider settlement "Mark Paid" fails (Prisma 5s interactive-transaction timeout on 46-claim batch); raw DB error leaked to UI; batch stranded CHECKER APPROVED; money-out cannot complete | **FIXED IN CODE — pending Phase R re-test on Vercel** |

> **Remediation landed (2026-07-07)** — see `07_Production_Readiness/Remediation_Plan.md` § EXECUTION STATUS. PR-V02 (settlement set-based writes + raised timeout + safe error handling), OBS-5 (variance like-for-like), PR-V01 (server-side provider search), OBS-4/OBS-6/OBS-1, and a partial OBS-2 currency fix are all in the working tree; `tsc` clean; 468 unit tests green. **The verdict stays NO-GO until an independent front-end re-test on Vercel proves a settlement batch reaches SETTLED/PAID end-to-end.** A code fix and passing unit tests do not lift a blocker.

## What is genuinely strong (verified live this run)
- **Provider portal** end-to-end intake: login → facility-scoped dashboard → eligibility (cross-scheme NWSC member resolved at partner facility) → prefilled claim form → multi-line submit → claim in TPA queue. All front-end.
- **Adjudication**: claims-officer capture → contract-tariff payable ceiling → APPROVE(full)/PARTIAL/DECLINE decisions with reasons; per-line ✓/✗; decline records reason and no payable.
- **Segregation of duties (settlement)**: maker cannot approve own batch — "Maker and checker must be different users". Checker (distinct user) approves.
- **RBAC**: per-role nav trimming (finance/claims/medical/member/reports each get a scoped menu); forbidden routes → branded Access Denied, not crashes or data.
- **Propagation**: pending-claim counters move on submit/approve; member portal shows the approved visit and increments utilisation; reports-viewer dashboard shows both UAT claims with correct status.
- **GL**: trial balance stays balanced even after the failed settlement (clean rollback).
- **Front-end user provisioning**: admin created provider (facility-scoped), reports, 2nd finance, and NWSC-scoped HR users, plus a member portal login — all through the UI; all logged in successfully.

## Conditions that persist even if PR-V02 is fixed
1. **OBS-7 (control):** A single claims officer approved a 371%-variance fraud-flagged claim to full billed with no second approval / no fraud-alert clearance. Decide whether the approval matrix / fraud sign-off must gate this.
2. **Currency inconsistency (OBS-2):** same claim labelled KES in some panels, UGX in others; amounts not FX-converted. For a Ugandan client this must be resolved before money moves.
3. **Fraud routing over-fires (OBS-5):** essentially every provider claim routes to manual review with a fraud flag (incl. an at-tariff 6,000 claim), and variance compares whole-claim billed to a single line's contracted rate — auto-adjudication provides little relief.
4. **Contract-engine preview contradicts adjudication (OBS-4):** "no contract matched / payable 0" preview vs a correct computed ceiling — misleading to adjudicators.
5. **Provider search miss (PR-V01):** /providers search returns "no match" for facilities that exist (Nakasero, IHK).
6. **GL coverage:** GL revenue/claims figures look small vs system claim volume — confirm auto-posting captures all claim/settlement activity.
7. **Scale unproven:** 2,997 members / large claim history present, but no concurrent-load test. The settlement timeout is itself a scale symptom.

## Untested / not-yet-verified (risk register)
- Settlement re-test after PR-V02 fix (whole money-out leg).
- Live HR NWSC-only scope (A6.5 / C6) — mechanism verified at setup (ASSIGN TO GROUP), not exercised end-to-end.
- Fund-admin fund-balance impact (A5.7).
- Report exports (CSV/PDF) tie-out and totals (A6.6 export step).
- Scenario D remainder: double-submit dedupe (D6), future-DOS block (D5), zero-amount line (D4), duplicate settlement (D8), decide-before-compute (D7).
- Partial-approval (not just decline) money math and its settlement exclusion.
- Notifications to member (A6.4).

## Deliverables
- `TEST_RUN_LOG.md` — per-step results with evidence (screenshot IDs).
- `DEFECT_REGISTER.md` — PR-V01, **PR-V02 (Critical)**, OBS-1…OBS-7.
- `MASTER_RUN_LOG.md` — environment facts, personas, IDs, resume pointer.
