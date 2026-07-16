# Inpatient Journey — GO / NO-GO Readiness

**Target:** https://avenue-portal.vercel.app (Vercel prod-like) · **Method:** front-end, Chrome, actors as themselves, no DB edits · **Date:** 2026-07-07 · **Runbook:** INPATIENT_E2E_SCENARIO_UAT_TEST_DOCUMENT.md

## VERDICT: **NO-GO** (money-spine mechanics proven, but a CRITICAL benefit-ceiling gap + 3 High defects + untested breadth)

The inpatient build has a **genuinely strong clinical/financial backbone** — the case→claim model, contract-tariff ceiling, PA hold, and the approval-matrix / separation-of-duties enforcement are among the most robust controls seen. With a second underwriter provisioned (user-authorized, since reverted), the headline 5-day admission was driven **all the way through: approved contract-capped payer share UGX 1,300,000 → settlement → maker/checker SoD → SETTLED/PAID → balanced GL (Dr Claims Payable / Cr Cash 1,300,000)** — a clean tie-out, with SoD holding at every gate, and the HMS rail is idempotent. **But a CRITICAL control gap now anchors the verdict: the member annual benefit sub-limit is not enforced** (IP-DEF-06) — a claim for a fully-exhausted member was approved in full with zero member liability, pushing usage past the ceiling. That is exactly the "can money leave beyond what the contract allows?" spine question answering **wrong**. On top of it sit three **High** defects on core paths — PA approval crash + raw-schema leak (IP-DEF-01), future-dated charges accrue to billable (IP-DEF-02), and an intermittent HTTP 503 on settlement/approval POSTs (IP-DEF-03) — plus untested families (oncology, maternity, transfers, FX). Firmly **NO-GO**.

## Spine questions
| # | Question | Answer | Basis |
|---|----------|--------|-------|
| 1 | Can ONE long-stay admission run the full money spine paying only the authorised payer share? | **YES — COMPLETE** | PA→GOP→case→LOU→5-day accrual→one-claim→contract-cap→dual approval→**APPROVED 1,300,000**→settlement→maker/checker SoD→**SETTLED/PAID 1,300,000**→**GL Dr Claims Payable/Cr Cash 1,300,000 (balanced)**. Tie-out reconciles: approved = batch = paid = GL = 1,300,000 (not billed 1,650,000). Reports export not separately verified. |
| 2 | Do overlapping ward/ICU bed-days double-pay? | **NO GUARD (IP-DEF-04)** | Same-date ward + ICU beds both price payable; no automated overlap guard (tariff-only provider). |
| 3 | Can the PA/LOU/contract/**benefit** ceiling be exceeded without authorised override? | **YES — benefit ceiling NOT enforced (CRITICAL IP-DEF-06)** | Contract-tariff cap works (ward 200k→130k) + PA-cover guard present, BUT the **member annual benefit sub-limit is not enforced**: a claim for a fully-exhausted member (0 remaining) was approved in full, member liability 0, usage pushed over the annual sub-limit. |
| 4 | Can Separation-of-Duties be bypassed? | **NO (strong)** | Maker (medical) can't approve; super-admin doesn't satisfy the role gate; the same underwriter can't do both L1 & L2 ("already decided"). |
| 5 | Can duplicate HMS replay / duplicate Mark-Paid create money? | **NO (good)** | HMS duplicate replay proven idempotent (0 applied·1 duplicate, no double; DB-verified). Duplicate Mark-Paid not separately retried (batch SETTLED, button gone). |
| 6 | Can any actor act outside scope? | **Mostly NO** | Provider portal scope hard (Access Denied/404 for another provider's claim); medical nav trimmed. Member/HR/fund scope inherited from outpatient pass, not re-proven for inpatient. |

## What is genuinely strong (verified live)
- **Case → single-claim model.** Opening an `INPATIENT_ADMISSION` case, attaching an approved PA, issuing an LOU, accruing 6 multi-day service entries (qty pricing + dating correct, ACCRUED 1,650,000 exact), then "Close & file claim" produced **exactly one** claim with all lines copied and PA re-attached. Void correctly excludes an entry from the accrued total.
- **Contract-tariff ceiling.** The adjudication engine priced the ward line at the contracted 130,000/day, capping payable to **UGX 1,300,000** vs billed 1,650,000 (350,000 provider write-off), and surfaced a clear "1 line billed above contracted rate" warning + a PAY-ABOVE-CONTRACT override.
- **PA lifecycle + hold.** Two-stage inpatient PA (mandatory medical review → adjudication), GOP issued on approval, benefit **hold of 1,750,000 placed and shown ACTIVE** with expiry; fails closed (no side effects) when the approval txn errored.
- **Approval matrix / SoD.** Decisions above threshold route to the Approvals console instead of self-applying; per-level distinct-approver enforcement is real and strict (even super-admin can't shortcut it).
- **Provider RBAC.** A provider cannot open another provider's claim by URL (Access Denied / 404) and sees only its own claims.

## Blocking issues
| ID | Sev | Why it blocks |
|----|-----|---------------|
| **IP-DEF-06** | **Critical** | **Member annual benefit sub-limit is not enforced** at claim decision — a claim for a fully-exhausted member was approved in full (member liability 0), pushing usage past the sub-limit. Unbounded payer leakage beyond the contracted benefit ceiling; applies to all benefit categories (incl. maternity/oncology sublimits). |
| IP-DEF-01 | High | Entering the optional Notes on **PA approval** crashes the approval and **dumps the raw Prisma error + full schema** to the browser (info disclosure; the reviewer-notes control is unusable). A core clinical-approval action fails on a normal input. |
| IP-DEF-02 | High | A **future / post-discharge service entry** is accepted with no validation and inflates the billable case total (§7 Critical-class: "future service creates payable money"). |
| IP-DEF-03 | High | Every settlement/approval POST returns **HTTP 503** (mutation still lands) — intermittently blocks completion and looks broken to operators; needed multiple retries to settle. |
| IP-OBS-DUAL | Blocker (config) | INPATIENT ≥200k requires DUAL underwriter approval but the tenant seeds only one underwriter → deadlock until a 2nd is added (no in-app guard). Worked around (user-authorized) to complete the spine; still a go-live gap. |

## Also open
- **IP-DEF-04 (Medium):** no automated ward/ICU **bed-day overlap guard** — same-date ward + ICU beds both price payable (tested on a tariff-only provider).
- **IP-DEF-05 (Medium):** **HMS batch intake** crashes with an unhandled server exception on a batch missing `facilityCode` (money logic is safe — replay is idempotent, verified). Plus **IP-GAP-HMS**: the facilityCode isn't discoverable in the UI (smartProviderId null for all 195 providers; only the exact provider name works).
- **OBS-IP-GL:** Claims Payable carries a large net **debit** balance (payments >> accruals) — verify the approval-time accrual journal posts.
- **OBS-IP-PA-HOLD:** residual PA hold (450k) lingers after a single-claim episode consumes less than authorised.
- **OBS-IP-CONTRACT-CONFIG:** package/digital-contract engine present in code but not exercisable in this seed (0 package-provider eligibility, contracts unlinked) → Family D packages/bundling/contract-ceiling untestable.
- **OBS-IP-1:** benefit-balance panel shows a different limit basis pre- vs post-approval (5,000,000/consumed 50,000 → 25,000,000/consumed 0).
- **OBS-IP-CUR:** currency labels inconsistent for the *same* Nakasero episode — PA shows **KES**, case/claim show **UGX**, dashboard shows **KES**. Tenant is Uganda-first (UGX).

## Untested-risk register (could hide further blockers)
Family A eligibility negatives (emergency retrospective window, admission-requires-PA, wrong-member/expired-PA, decline); ICU bed-day overlap (C02); oxygen/rounds frequency caps; benefit exhaustion & self-funded fund drawdown (C07/C08); surgical packages / unbundling / implant cap (D); oncology & chemo (E); maternity / newborn / NICU / waiting-period (F); transfers / ambulance / out-of-network / inactive branch (G); HMS batch valid/unmatched/duplicate-replay idempotency (H05-07); API facility spoofing & offline (H08-10); partial/decline/void/appeal/fraud-gate/cost-share (I); settlement / duplicate-mark-paid / GL / fund / reports tie-out (J); FX / missing-FX / mixed-currency (K); member/HR/fund scope, sensitive-diagnosis privacy, notifications (L).

## Conditions to lift the verdict (independent re-verification required)
1. Fix IP-DEF-01, IP-DEF-02, IP-DEF-03.
2. Resolve IP-OBS-DUAL (provision ≥2 underwriters, or add a config-time guard that a DUAL rule has ≥2 active role-holders), and **complete one long-stay admission through settlement → voucher → PAID → balanced GL → provider statement/reports** with a zero (or fully explained) tie-out.
3. Clear the untested-risk families to PASS / PASS-WITH-OBSERVATION / NOT-APPLICABLE, with no new Critical/High.
