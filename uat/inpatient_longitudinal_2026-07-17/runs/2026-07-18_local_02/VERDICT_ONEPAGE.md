# Inpatient Interim-Settlement UAT — Verdict (one page)

**Run 2026-07-18_local_02 · build `e314de8` · 2026-07-18 · controlled-clock disposable VM**

---
## ▶ REMEDIATION UPDATE — 2026-07-19 (branch `fix/inpatient-slice-case-pa`, not yet merged)

The one High and all five open Lows have been **fixed in code and gated green** (tsc clean; vitest **775**
pass, +13; brand+currency guards green). **IPL-PA-01 is FIXED-VERIFIED live on the VM** against the real
PC-UAT-IP-2026 contract: a slice with a PA-required line (MRI-BRAIN) that previously threw now adjudicates
by reading the case's PA through — no-PA case still blocks (gate intact), the case hold is credited (150k
residual), the PA is partially consumed and stays usable (`caseId` intact, not re-pointed).
Evidence: `evidence/IPL-PA-01_fix_proof.txt`. Fixes: IPL-PA-01 (`3f655ed`), CFG-01 WEEKLY (`4fcb608`),
OBS-COPY-01/OBS-A11Y-01/OBS-UI-02 (`c1fc571`), WP-B hermetic test (`9733aa1`), SETUP-OBS-01 (stale — `npm ci`
passes at e314de8). SCN-OBS-01 confirmed in code → decision memo `notes/SCN-OBS-01_DECISION.md` (⭐ Option B)
**awaiting sponsor sign-off**. New Low observations logged: OBS-PA-LINK-01/EXP-01/VOID-01.

**§25 prior-defect gate — COMPLETE (2026-07-19, all PASS/FIXED-VERIFIED):** IP-DEF-01 (PA approve w/ notes,
no crash, note persists, GOP issued), IP-DEF-02 (future/pre-admit/post-discharge all blocked, accrued 0),
IP-DEF-03 (2nd decide blocked — apply exactly once), IP-DEF-04 (bed-day HIGH alert + timeline warning;
fraud-gate-enabled decide HARD-BLOCKS, tenant setting restored), IP-DEF-05 (malformed/unknown-facility HMS
errors friendly, valid rows conserved, unmatched→Exception Register), OBS-IP-GL (trial balance balanced),
OBS-IP-TARIFF (V1/V2 resolve, Sep-1 step-up, source/version, UGX). IP-DEF-06 + IPL-001 already
FIXED-VERIFIED (run 02). **This clears the §29.12 automatic-NO-GO exposure** (no un-retested prior
Critical/High inpatient finding). Evidence: `evidence/IP-DEF-01-05_gate_proof.txt`,
`PRIOR_DEFECT_RETEST_MATRIX.csv`. **Deployed to prod** (`ef912cf`, Vercel READY, /api/health green).

**Still required for a clean unconditional GO (NOT done):** the §9.4 breadth — privacy/RBAC (§23),
reporting + GL/trial-balance tie-out to reports/exports (§24), maker/checker SoD via distinct finance
personas (SET-09), family-pool concurrency (LIM-01/03), and the full day-by-day scenario narratives
(§12–17). Remaining OBS-IP observations (OBS-IP-1 benefit-panel basis, OBS-IP-CUR full screen-walk,
OBS-IP-PA-HOLD final-close residual, OBS-IP-CONTRACT-CONFIG) are UI-render / prior-run-covered. The
original run-02 verdict below stands as the baseline.

---

## VERDICT: CONDITIONAL GO

The fix works. The predecessor run was **NO-GO** because the platform could not settle a long inpatient
admission periodically — it filed one claim at discharge. That capability has been **built and, in this run,
independently verified end-to-end.** The core money controls around it are proven. One High defect and an
unfinished retest gate stand between this and a clean GO. **No Critical.**

## What is proven (fresh evidence this run)
- **Interim/periodic settlement works** — a case emits ≥3 immutable linked slices, **stays open** across the
  interim cuts, bills only new lines each time (no rebilling), and the seven ledgers conserve
  (Σslice-billed = billed-to-date). *This is the headline Exit criterion; it is met.*
- **Cannot pay above the limit** — over-limit approvals are blocked at the category **and** the overall limit
  (distinct error codes), never silently capped; the reviewer must make an explicit partial decision.
- **Package unbundling** — a surgical package absorbs its included components (pays the package price, not the
  parts on top).
- **Readmission** — treated as a new linked episode (not a duplicate), the prior payment is untouched, and it
  is correctly bound by the remaining overall headroom.
- **Contract V1→V2** switch prices correctly across the Sept-1 boundary. **Controlled clock** verified.

## The one High defect — must fix
**IPL-PA-01:** interim slices don't carry the case's pre-authorisations, so **PA-required lines (CT, MRI,
high-cost surgery) cannot be interim-settled**, and PA/GOP holds aren't credited to slices. This blocks
interim settlement for exactly the expensive, PA-secured care that inpatient episodes revolve around.

## Conditions before a clean GO
1. Fix **IPL-PA-01** (slices must honour case PAs).
2. Finish the **prior-defect retest gate** (IP-DEF-01..05 not yet independently re-run this pass — IPL-001 and
   IP-DEF-06 are done).
3. Cover the remaining breadth: privacy/RBAC, reporting/GL reconciliation, maker/checker segregation via
   distinct users, family-pool concurrency, and the full day-by-day scenario narratives.

## Findings: 0 Critical · **1 High (IPL-PA-01)** · 1 Medium · 6 Low (1 resolved)

Full detail: `outputs/EXECUTIVE_GO_NO_GO_SUMMARY.md` · `outputs/GAP_REGISTER.csv` ·
`outputs/PRIOR_DEFECT_RETEST_MATRIX.csv` · `outputs/SCENARIO_RESULT_MATRIX.csv` ·
`outputs/INTERIM_SETTLEMENT_RECON.csv` · `evidence/`
