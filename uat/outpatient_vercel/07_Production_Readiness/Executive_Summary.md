# Executive Summary — Outpatient Front-End UAT (Vercel)

**Date:** 2026-07-07 · **System:** Medvex, https://avenue-portal.vercel.app (Vercel production) · **Method:** 100% browser-driven, each actor logging in as themselves, front-end only.

## Verdict: NO-GO for outpatient go-live

The outpatient claim journey works **right up to the point money must leave the system** — and then it fails. A provider can log in, check a member's eligibility, file a multi-line outpatient claim, and a TPA officer can adjudicate and approve it; the member and reports see the result; the general ledger stays balanced. But the **final settlement step ("Mark Paid") fails every time** with a database transaction timeout, leaving the payment batch stranded and exposing a raw internal error to the user. A claim that cannot be paid end-to-end is not production-ready.

## The one blocker
- **PR-V02 (Critical) — Settlement cannot complete.** Approving a monthly provider settlement batch (46 claims) then clicking "Mark Paid" throws `prisma.claim.update ... transaction … 5000 ms` and stops. The batch is stuck at "Checker Approved"; nothing gets marked paid. Reproduced twice. It won't scale to normal batch sizes, and it leaks the internal error to the operator.

## What's strong (verified live)
- Real provider portal: eligibility → claim capture → submission, hard-scoped to the provider's own facility.
- Adjudication with contract-tariff ceiling, and Approve / Partial / Decline decisions with recorded reasons.
- **Segregation of duties holds** on settlement: a maker cannot approve their own batch ("maker and checker must be different users").
- **Access control holds**: every role gets a trimmed menu; forbidden routes return a branded "Access Denied", and a member cannot reach another scope's data.
- **Propagation is real**: counters move, the member portal shows the approved visit and updated usage, and the reports view lists the new claims with correct statuses.
- Admin created all missing users (provider, finance checker, reports, employer-scoped HR) and a member login **entirely through the UI**.

## Must-fix before re-test (beyond PR-V02)
1. **Approval control gap:** one officer approved a claim the system had fraud-flagged (371% variance) to the full amount, with no second approval and no fraud-alert clearance.
2. **Currency confusion:** the same claim shows KES on some screens and UGX on others, with no conversion — unacceptable for a Ugandan client before money moves.
3. **Fraud routing over-fires:** effectively every provider claim (even one billed exactly at tariff) is routed to manual review, so auto-adjudication saves no effort.
4. **Misleading contract preview** on the claim screen ("no contract matched, payable 0") contradicts the correct ceiling the adjudicator actually uses.

## Bottom line
Strong bones — the workflow, the controls, and the access model are largely right. The go-live is blocked by a single but decisive failure in the money-out step, plus a short list of controls and data-quality issues to settle. Re-test the settlement leg and the approval-gate decision once fixed; the untested items (HR scope live, fund impact, exports, remaining validations, scale/load) remain named risks.
