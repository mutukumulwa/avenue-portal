# A5 — Full day-by-day scenario narratives (§12–17) — EXECUTED 2026-07-21

**Env:** disposable Lima VM `uat-inpatient`, rebuilt to latest `main` (`c2a3146`), controlled clock ~2026-08-03,
DB `aicare_uat`. Driven via the service layer + `getCaseReconciliation` seven-ledger read-model (the sanctioned
scenario-exec path); evidence is fresh from this run.

**Verdict: PASS.** All six scenarios walked to final close; the seven ledgers conserve for all six.

## Final seven-ledger reconciliation (all six CLOSED_FILED)

| Case | Scenario | Slices | Billed | Approved | Paid | Outstanding | Conserved |
|---|---|---|---|---|---|---|---|
| CASE-2026-00002 | Boda (trauma) | 1 | 3,435,000 | 0 | 0 | 0 | ✓ |
| CASE-2026-00003 | Stroke (limit-exhaustion) | 2 | 3,560,000 | 3,560,000 | 3,560,000 | 0 | ✓ |
| CASE-2026-00004 | Malaria (partial) | 1 | 12,000,000 | 9,000,000 | 9,000,000 | 0 | ✓ |
| CASE-2026-00005 | Burns (package) | 1 | 105,600,000 | 100,000,000 | 100,000,000 | 0 | ✓ |
| CASE-2026-00007 | Foot (readmission) | 1 | 9,600,000 | 4,000,000 | 4,000,000 | 0 | ✓ |
| CASE-2026-00008 | Maternity | 1 | 10,000,000 | 0 | 0 | 0 | ✓ |

Conservation asserted per case: `billed = onSlices + residual`, `approved = paid + outstanding`,
`approved ≤ billed`, `paid ≤ approved` → **6/6 PASS**.

## What each leg proves

- **Stroke = the complete day-by-day exemplar:** 24 service entries accrued across 07-25→08-01, cut into
  2 weekly interim slices (CLM-…762 1.78M + CLM-…763 1.335M) + a FINAL residual bill (CLM-…764 445k), all
  approved, case CLOSED_FILED; billed = approved = paid = 3,560,000 after settlement.
- **Interim slicing + final close:** every case reached `CLOSED_FILED`; residual-only closes correctly filed
  no empty final claim.
- **Settlement (the PAID ledger):** one real maker≠checker run — maker `admin@medvex.co.ug`,
  checker `finance@medvex.co.ug` (SoD gate passed), batch `cmsdb0wem…` = 102 claims / UGX 143,046,022 →
  approve → mark paid (payment voucher + balanced GL posted) → outstanding driven to 0 on all settled cases.
  (This also confirms **A3 settlement maker≠checker** live.)
- **Limit-binding partial approvals:** Malaria 9M of 12M (category), Burns 100M of 105.6M (OVERALL cap),
  Foot 4M of 9.6M (overall-exhausted readmission) — the availability gate caps and never silent-pays.
- **Adjudication controls fire in-narrative:** re-adjudicating the two un-approved slices was correctly
  BLOCKED — Boda's slice by the **PA-required gate** (`Contract PC-UAT-IP-2026 requires pre-authorization
  for: CT-HEAD`, the IPL-PA-01 control) and Maternity's by the **contract ceiling** (`approved 10,000,000
  exceeds the payable ceiling`). Both close with approved=0 (still conserved) — correct enforcement, not a gap.

## Honest scope note

Two scenarios (Boda, Maternity) close with a single RECEIVED slice held un-approved by the contract controls
above — their day-by-day accrual + slice + close is walked and conserved, but the paid cycle is not completed
(it is blocked by design). The full billed→approved→paid cycle is proven end-to-end on the other four plus
the Stroke exemplar. Clock advanced/aligned to the scenario dates; controlled-clock mechanics per
`notes/CLOCK_CANARY.md`.
