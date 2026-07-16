# Outstanding Conditions UAT Test Plan - Outpatient Vercel

**Created:** 2026-07-07  
**Target:** `https://avenue-portal.vercel.app`  
**Scope:** Remaining go-live conditions from `GO_NO_GO_READINESS.md`: OBS-7, OBS-2 broad, GL coverage, and scale/load proof.  
**Primary rule:** Functional UAT remains front-end led. Use each actor's real login for workflow steps. Do not use direct database edits, direct Prisma calls, seed scripts, or API-only shortcuts to create claim, approval, settlement, or GL outcomes.

## 1. Purpose

This plan proves whether the remaining money-control and multi-currency risks are acceptable for production go-live. It is not a repeat of the completed closure pass. It targets the four outstanding conditions that still need product, finance, or performance confidence:

1. Fraud-flagged claim approval gate behind a tenant setting.
2. App-wide currency cleanup plus FX normalisation for non-base-currency claims and mixed-currency settlement batches.
3. GL auto-posting coverage across claim and settlement activity.
4. Concurrent-use and batch-size scale proof after the settlement timeout fix.

## 2. Test Governance

| Area | Requirement |
|---|---|
| Environment | Use Vercel production-like deployment. Prefer a dedicated UAT tenant if destructive load or FX scenarios could pollute production evidence. |
| Evidence | Capture screenshots, claim numbers, batch IDs, GL journal IDs, report export filenames, browser console/network errors where relevant, and tester notes in `TEST_RUN_LOG.md` or a new execution log. |
| Defects | Confirmed failures go to `DEFECT_REGISTER.md` with severity, route, observed vs expected, evidence, and re-test result. |
| Financial tie-out | Do not rely on screenshots alone. Record source claim totals, approved totals, paid totals, settlement totals, GL debits/credits, and report/export totals. |
| Product decisions | OBS-7 tenant setting behavior and FX policy must be signed off before final execution. If product policy is undecided, mark the affected tests `BLOCKED - POLICY`. |
| Test data cleanup | Prefer clearly named disposable claims/batches with a `UAT-OC-YYYYMMDD-*` reference in notes where the UI supports notes. Do not delete financial evidence. |

## 3. Entry Criteria

| Gate | Owner | Required Before Testing |
|---|---|---|
| Product sign-off for OBS-7 | Product / Claims Ops | Confirm whether open fraud alerts block approval, require second approval, require fraud clearance, or allow override with reason. Confirm tenant setting name/default. |
| FX policy sign-off | Product / Finance | Confirm base currency, supported claim currencies, rate source, rate date, rounding, settlement currency rules, and whether mixed-currency settlement batches are allowed or split. |
| Test personas active | Admin | Admin, provider users, claims officer, medical/fraud reviewer, finance maker, finance checker, reports viewer, member, fund admin. |
| Test currencies configured | Admin / Finance | UGX base confirmed. At least one non-base currency test path available, preferably KES. FX rate visible or documented. |
| GL accounts mapped | Finance | Claims expense, claims payable, cash/bank, revenue/premium, FX gain/loss if applicable, member/provider/fund ledgers. |
| Load test window approved | Product / Ops | Confirm time window, target URL, user mix, maximum concurrency, rollback/stop criteria, and monitoring contacts. |

## 4. Exit Criteria

| Condition | Exit Requirement |
|---|---|
| OBS-7 | Tenant setting behavior verified both OFF and ON; open fraud alert cannot be paid without required clearance/second approval when ON; audit trail captures the control action. |
| OBS-2 broad | No remaining hardcoded KES labels in tested money screens for UGX tenant; non-base-currency claims are converted to base currency correctly; mixed-currency batches are either blocked/split or settled with explicit FX normalisation and balanced GL. |
| GL coverage | Fresh UI-created claims and settlements reconcile from claim detail to settlement to GL to reports. Historical/seed discrepancy is either explained with evidence or logged as a defect/data-migration risk. |
| Scale | Agreed concurrent workflows complete within thresholds, no duplicate claims/payments, no raw errors, no stranded settlement batches, and monitoring shows acceptable server/database behavior. |

## 5. Personas and Responsibilities

| Persona | Responsibility |
|---|---|
| Admin | Tenant settings, user setup, group/provider/member setup, access checks. |
| Provider user | Eligibility check, claim intake, provider claim visibility, provider statement checks. |
| Claims officer | Capture, compute, approve/partial/decline decisions. |
| Medical/fraud reviewer | Fraud alert review, clearance, second approval if policy requires it. |
| Finance maker | Settlement batch creation and finance review. |
| Finance checker | Settlement approval, mark paid, duplicate-payment checks. |
| Reports viewer | Claims, provider, utilisation, GL/report export checks. |
| Member | Member portal financial/status visibility for tested claims. |
| Fund admin | Fund balance movement where applicable. |

## 6. Test Data Set

Create fresh claims through the front end. Use small values for functional tests and realistic values for settlement/load tests.

| Ref | Currency | Provider | Member / Group | Purpose | Expected Outcome |
|---|---|---|---|---|---|
| UAT-OC-FRAUD-1 | UGX | Aga Khan or IHK | Active NWSC member | Fraud gate with setting OFF | Existing behavior allowed, but audit note visible if available. |
| UAT-OC-FRAUD-2 | UGX | Same provider | Active NWSC member | Fraud gate with setting ON and alert open | Approval blocked or routed to required second approval/clearance. |
| UAT-OC-FRAUD-3 | UGX | Same provider | Active NWSC member | Fraud clearance then approval | Approval succeeds only after required control step. |
| UAT-OC-UGX-1 | UGX | Aga Khan | Active NWSC member | Base-currency baseline | UGX labels and UGX GL values across all screens. |
| UAT-OC-KES-1 | KES | KES-enabled provider/member path | Non-base or cross-currency test member | FX normalisation | Claim shows transaction currency and base currency; GL posts in base. |
| UAT-OC-MIX-1A | UGX | Same settlement provider if supported | Active member | Mixed-batch test component | Used to test split/block/normalise behavior. |
| UAT-OC-MIX-1B | KES | Same settlement provider if supported | Active member | Mixed-batch test component | Used to test split/block/normalise behavior. |
| UAT-OC-GL-PARTIAL | UGX | IHK | Active dependant/member | Partial approval GL coverage | Rejected amount excluded from payable, settlement, utilisation, and GL liability. |
| UAT-OC-LOAD-* | UGX/KES as approved | Multiple providers | Existing large-member population | Concurrent load and batch-size proof | No duplicates, no timeouts, no stranded states. |

## 7. Test Suite A - OBS-7 Fraud Approval Gate

### A1. Tenant Setting Visibility and Default

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| A1.1 | Admin | `/settings` or tenant configuration page | Locate fraud approval gate setting | Setting is visible only to authorised admin roles, or documented as hidden/config-managed | Screenshot |
| A1.2 | Admin | Same | Record default value | Default matches product sign-off | Screenshot / config note |
| A1.3 | Claims officer | Claim decision route | Open a claim with no fraud alert | Normal approval path remains unchanged | Claim ID + screenshot |

### A2. Setting OFF - Backward Compatibility

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| A2.1 | Admin | Tenant setting | Set fraud gate OFF | Setting saved and reflected after reload | Screenshot |
| A2.2 | Provider | Provider claim intake | Submit UAT-OC-FRAUD-1 with data that creates a legitimate fraud alert | Claim enters queue with open fraud alert | Claim number |
| A2.3 | Claims officer | Claim adjudication | Compute and approve within payable ceiling | Approval succeeds under setting OFF | Screenshot |
| A2.4 | Claims officer | Claim detail | Review fraud alert panel/audit trail | Alert remains visible; approval history records actor/time | Screenshot |
| A2.5 | Finance maker/checker | Settlement | Attempt to settle approved claim | Settlement behavior follows current policy; no duplicate or raw error | Batch ID |

### A3. Setting ON - Open Alert Blocks or Routes Approval

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| A3.1 | Admin | Tenant setting | Set fraud gate ON | Setting saved and reflected after reload | Screenshot |
| A3.2 | Provider | Provider claim intake | Submit UAT-OC-FRAUD-2 with legitimate fraud alert | Claim has open fraud alert | Claim number |
| A3.3 | Claims officer | Claim adjudication | Compute and attempt APPROVE/PARTIAL with open alert | Approval is blocked or routed to second approval/clearance per product policy | Screenshot / message |
| A3.4 | Claims officer | Claim detail | Check status after blocked attempt | Claim is not final approved/paid; no payable/settlement exposure created prematurely | Screenshot |
| A3.5 | Finance maker | Settlement | Search/select provider batch | Claim is unavailable for settlement until fraud gate is satisfied | Screenshot |
| A3.6 | Reports viewer | Reports | Check pending/fraud report if available | Claim is visible as pending fraud review, not approved/paid | Screenshot/export |

### A4. Clearance / Second Approval Path

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| A4.1 | Medical/fraud reviewer | Fraud review / claim detail | Open UAT-OC-FRAUD-2 | Reviewer can see alert detail, claim lines, provider, member, and prior decision attempt | Screenshot |
| A4.2 | Medical/fraud reviewer | Same | Clear alert with reason, or provide second approval | Action requires reason/comment where product requires it | Screenshot |
| A4.3 | Claims officer or reviewer | Claim adjudication | Complete approval after control step | Approval succeeds only after clearance/second approval | Screenshot |
| A4.4 | Claim detail | Audit/history | Review full history | Initial block, clearance/second approval, final approval, actors, timestamps, and reasons are visible | Screenshot |
| A4.5 | Finance maker/checker | Settlement | Settle approved claim | Settlement succeeds and GL remains balanced | Batch + GL screenshot |

### A5. Negative and Access Tests

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| A5.1 | Same claims officer | Claim detail | Try to both approve and second-approve own fraud-gated decision if maker/checker separation is required | Blocked with friendly message | Screenshot |
| A5.2 | Provider user | Direct fraud/approval routes | Attempt to access fraud clearance route | Access denied; no claim data leak | Screenshot |
| A5.3 | Member | Member portal | View claim before clearance | Status does not imply paid/approved before control completed | Screenshot |
| A5.4 | Admin | Tenant setting | Toggle setting ON to OFF after a blocked claim exists | Existing blocked claim behavior follows product policy; no silent bypass unless explicitly allowed | Screenshot |

### OBS-7 Pass Criteria

- Open fraud alerts are materially controlled when the tenant setting is ON.
- The control cannot be bypassed by the original claims officer if segregation is required.
- Settlement cannot include fraud-gated claims before the required control is complete.
- Audit trail is sufficient for compliance review.
- Setting OFF preserves current behavior for tenants that have not opted in.

## 8. Test Suite B - OBS-2 Broad Currency and FX

### B1. Currency Label Sweep

Inspect and exercise the following screens with a UGX-base claim. Any visible KES label on UGX money is a failure unless it is explicitly a transaction-currency field for a KES item.

| Screen / Route | Money Fields to Check | Expected Result |
|---|---|---|
| Claim detail / financial summary | Billed, approved, rejected, member share, payer share, paid | UGX for UGX claim |
| Claim adjudication lines | Tariff, billed, payable, variance, totals | UGX for UGX claim |
| Settlement list/detail | Batch total, claim rows, provider totals, voucher amount | UGX for UGX batch |
| GL / trial balance | Account balances, journal lines, period totals | Tenant base currency UGX, or clearly labelled base currency |
| Provider portal | Claim amounts, paid-to-date, statement totals | UGX for UGX provider activity |
| Member portal | Annual limit, utilisation, claim amount, remaining balance | UGX for UGX scheme/member |
| Fund portal | Fund balance, claims paid, pending claims | UGX for UGX fund |
| Reports | Claims, provider, utilisation, exclusions, GL exports | UGX or explicit base/transaction currency labels |
| CSV/PDF exports | Headers and amount columns | Currency label not hardcoded to KES |

### B2. Static Hardcoded Currency Sweep

| # | Actor | Route / Area | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| B2.1 | Tester/dev | Codebase | Search for user-facing hardcoded `KES`, `KSh`, and currency format helpers | Every occurrence is either removed, tenant-driven, or justified as test fixture/sample data | Search summary |
| B2.2 | Tester/dev | Codebase | Search reports, portals, GL, settlement, claim components | No user-facing hardcoded KES remains on UGX tenant paths | File list / notes |
| B2.3 | Tester/dev | Automated checks | Run relevant unit/component tests where available | Tests pass; new assertions cover currency labels for GL/portal/report surfaces | Test output |

### B3. Non-Base Currency Claim Normalisation

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| B3.1 | Admin/Finance | Currency settings if exposed | Confirm base UGX and KES FX rate/rate date | Rate source/date documented | Screenshot |
| B3.2 | Provider | Claim intake | Submit UAT-OC-KES-1 in KES if UI supports claim currency | Claim stores/display transaction currency KES | Claim number |
| B3.3 | Claims officer | Claim adjudication | Compute payable | UI shows transaction currency and base-currency equivalent, or clearly documents single-currency behavior | Screenshot |
| B3.4 | Claims officer | Claim adjudication | Approve claim | Approved amount in KES and base UGX equivalent reconcile to signed-off FX formula | Calculation notes |
| B3.5 | Member/provider portals | Claim detail | View approved claim | Portals do not mislabel KES as UGX or UGX as KES | Screenshot |
| B3.6 | Finance | GL | Review approval journal | GL posts in base currency UGX; FX rate/date/reference visible if required | Journal ID |
| B3.7 | Reports viewer | Reports/export | Export claim/provider report | Export includes currency fields and base amounts correctly | CSV/PDF |

### B4. Mixed-Currency Settlement Batch

Run the product-approved behavior below. If product decides mixed-currency batches are not allowed, B4.1-B4.4 are the primary expected behavior. If product allows mixed-currency batches, B4.5-B4.9 are mandatory.

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| B4.1 | Provider/Claims | Claim intake/adjudication | Create and approve UAT-OC-MIX-1A in UGX and UAT-OC-MIX-1B in KES for the same settlement candidate | Two approved claims exist with different currencies | Claim IDs |
| B4.2 | Finance maker | Settlement creation | Try to create one batch containing both currencies | If mixed batches are disallowed: UI blocks or auto-splits by currency with clear message | Screenshot |
| B4.3 | Finance maker | Settlement creation | Review generated batch(es) | Separate batches have correct totals and labels | Batch IDs |
| B4.4 | Finance checker | Mark paid | Settle allowed batch(es) | No arithmetic summing of raw UGX + KES transaction amounts | GL evidence |
| B4.5 | Finance maker | Settlement creation | If mixed batches are allowed, create mixed batch | Batch shows transaction-currency lines and base-currency settlement total | Screenshot |
| B4.6 | Finance checker | Batch approval | Review totals before approval | Base total equals sum of converted line base amounts; rounding matches policy | Calculation notes |
| B4.7 | Finance checker | Mark paid | Settle mixed batch | Voucher and GL post base amount, with FX treatment if needed | Voucher + GL |
| B4.8 | Provider portal | Statement | View paid batch | Provider statement clearly separates transaction/base amounts | Screenshot/export |
| B4.9 | Reports viewer | Reports/export | Export settlement/provider/GL reports | Reports reconcile transaction and base totals | CSV/PDF |

### B5. Rounding, Reversal, and Edge Cases

| # | Scenario | Expected Result |
|---|---|---|
| B5.1 | FX conversion creates decimal base amount | Rounding follows signed-off policy and is consistent across claim, settlement, GL, and reports. |
| B5.2 | Partial approval of KES claim | Rejected amount excluded; approved KES converts to base correctly. |
| B5.3 | Rate missing for non-base currency | Claim/settlement is blocked with friendly error; no GL posting. |
| B5.4 | Rate changes between claim date and settlement date | System uses the signed-off rate date policy and displays enough evidence to audit. |
| B5.5 | PDF/CSV export of mixed data | Exports include currency columns; totals do not hide mixed-currency arithmetic. |

### OBS-2 Pass Criteria

- UGX tenant screens no longer display incorrect KES labels.
- Non-base claims never rely on raw numeric addition across currencies.
- Mixed-currency settlement behavior matches product/finance policy.
- GL posts base-currency journals that balance.
- Reports and exports reconcile to claim, settlement, and GL evidence.

## 9. Test Suite C - GL Coverage

### C1. Fresh Transaction Coverage Matrix

For each scenario, record claim number, approved amount, settlement batch, GL journal, and report/export totals.

| Scenario | Expected GL / Financial Behavior |
|---|---|
| Full approval, UGX | Claims expense/payable posted on approval if that is the accounting policy; payable cleared against cash/bank on settlement. |
| Partial approval, UGX | Only approved payer share becomes payable; rejected amount creates no payable/cash movement. |
| Decline, UGX | No payable/cash movement; decline reason visible in claim/report. |
| Fraud-gated claim before clearance | No final approval/settlement posting until required control completes. |
| Fraud-gated claim after clearance | Normal approval/settlement posting with audit trail. |
| Non-base currency approval | GL posts base currency using approved FX policy. |
| Mixed-currency settlement | Split/blocked/normalised behavior reflected in GL; no raw cross-currency sum. |
| Duplicate settlement attempt | No second cash/bank posting, no second voucher, friendly message. |

### C2. GL to Operational Reconciliation

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| C2.1 | Reports viewer | Claims report | Export claims for test date range | Claim count, billed, approved, rejected, paid available | CSV |
| C2.2 | Finance | Settlement | Export or record settled batches for same range | Paid amounts by provider/batch available | Screenshot/export |
| C2.3 | Finance | GL/trial balance | Export GL journals/accounts for same range | Claims expense/payable/cash entries available | Screenshot/export |
| C2.4 | Tester/Finance | Reconciliation workbook/notes | Tie claims approved to payable postings | Difference is zero or explained by timing/member share/exclusions | Tie-out |
| C2.5 | Tester/Finance | Same | Tie settled amounts to cash/payable-clearing postings | Difference is zero | Tie-out |
| C2.6 | Reports viewer | Provider/member/fund reports | Compare operational reports with GL-supported totals | Reports agree or documented timing difference exists | Screenshots/export |

### C3. Historical / Seed Data Coverage

The readiness note observed that GL figures looked small versus total claim volume, while the defect register later confirmed fresh UI-processed claims posted correctly. This suite separates live workflow behavior from historical/imported data coverage.

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|---|
| C3.1 | Finance | Claims / reports | Record total historical claim count and total approved/paid amount visible in app | System operational volume established | Screenshot/export |
| C3.2 | Finance | GL | Record GL claims expense/payable/cash totals for comparable period | GL accounting volume established | Screenshot/export |
| C3.3 | Finance/tester | Reconciliation | Compare operational totals to GL totals by period/source/status | Difference categorised as seed/import artifact, unposted historical claims, timing, member share, or defect | Reconciliation notes |
| C3.4 | Finance/tester | Drilldown | Sample 10 historical claims across statuses/providers | Each sampled claim has expected GL journal or documented reason no journal exists | Sample table |
| C3.5 | Finance/tester | Drilldown | Sample 10 fresh UI-created claims from closure and outstanding-condition tests | Each fresh claim has expected GL coverage | Sample table |

### C4. GL Coverage Pass Criteria

- Every fresh UI-created claim scenario produces the expected accounting outcome.
- Settlement postings clear payables exactly once.
- Reports agree with GL after known timing and scope differences.
- Historical/seed under-coverage is explained and accepted, or logged as a go-live defect/data-migration task.

## 10. Test Suite D - Scale and Concurrent Load

### D1. Load Test Principles

Functional UAT should stay browser-led, but scale proof may use an approved load tool because concurrency cannot be credibly proven by a single manual browser. Load testing must run only in an approved window and tenant/environment.

| Rule | Requirement |
|---|---|
| No production disruption | Use a dedicated UAT tenant/environment where possible. Stop immediately if error rate, latency, database load, or queue depth exceeds agreed limits. |
| Realistic workflows | Exercise login, eligibility, claim intake, claim search, adjudication, settlement batch review, reports, and portals. |
| Financial safety | Load-generated claims must be clearly identifiable and must not be mixed into real finance batches unless approved. |
| Observability | Capture Vercel logs, database metrics, response times, browser errors, failed requests, and settlement job timings. |

### D2. Load Profiles

| Profile | Duration | Concurrent Users | Workflow Mix | Purpose |
|---|---:|---:|---|---|
| Smoke load | 10 minutes | 10 | Login, search, claim detail, provider/member dashboard | Confirm harness and monitoring. |
| Normal clinic hour | 30 minutes | 25-50 | 45% provider intake/eligibility, 25% claims review, 15% portals, 10% reports, 5% finance | Expected ordinary concurrent use. |
| Peak outpatient hour | 45 minutes | 75-100 | Same mix, heavier provider intake and claims search | Prove high but plausible traffic. |
| Settlement batch stress | Until complete | 1-3 finance users plus background read traffic | Create/review/mark paid batches of 50, 100, 250, and agreed maximum claims | Prove PR-V02 fix scales beyond original 46-claim timeout. |
| Soak | 2-4 hours if approved | 25-50 | Low-intensity mixed workflows | Detect slow leaks, timeouts, session expiry issues. |

### D3. Critical User Journeys Under Load

| Journey | Success Criteria |
|---|---|
| Provider eligibility search | Correct member returned; no cross-scope data leak; p95 under agreed threshold. |
| Provider claim submit | One claim created per submit; no duplicates on retry/double-click; friendly validation for failures. |
| Claims officer queue/search | Queue loads and filters; claim detail opens; compute/decision completes without raw errors. |
| Fraud-gated approval | Control behavior remains enforced under concurrency. |
| Finance settlement | Batch totals stable; maker/checker enforced; mark paid completes; no stranded CHECKER_APPROVED state. |
| Member/provider portals | Status and paid amounts update after approval/settlement; no stale wrong totals after refresh. |
| Reports/export | CSV/PDF generation works for agreed date ranges; failures are friendly and logged. |
| GL review | Trial balance remains balanced after concurrent approvals and settlements. |

### D4. Performance Thresholds

Confirm exact thresholds with product/engineering before execution. Suggested minimum thresholds:

| Metric | Target |
|---|---:|
| Page/dashboard p95 load time | <= 3 seconds for cached/simple pages, <= 5 seconds for heavy reports |
| Claim submit p95 | <= 5 seconds |
| Claim compute/decision p95 | <= 8 seconds |
| Settlement mark paid for 50-claim batch | <= 15 seconds |
| Settlement mark paid for 250-claim batch | <= 60 seconds, or product-approved async behavior |
| Error rate | < 1% non-validation failures |
| Duplicate claim/payment rate | 0 |
| Raw/internal error exposure | 0 |
| Stranded financial states | 0 |
| GL imbalance | 0 |

### D5. Scale Evidence to Capture

| Evidence | Source |
|---|---|
| Load profile, start/end time, virtual users, workflow mix | Load test report |
| Response time percentiles and error rate | Load test report / monitoring |
| Server logs for failed requests | Vercel logs |
| Database CPU/connections/slow queries/timeouts | Database monitoring |
| Settlement batch duration by size | UI screenshots + logs |
| Duplicate check for generated claim references | Provider/claims reports |
| GL trial balance after load | Finance UI/report |
| Open/stranded batch and claim status review | Settlement and claims screens |

### D6. Scale Pass Criteria

- Normal and peak profiles complete within agreed latency/error thresholds.
- Settlement handles batch sizes above the original 46-claim failure case.
- No duplicate claims, duplicate vouchers, duplicate payments, or stranded settlement batches.
- Financial reports and GL remain coherent after load.
- Any degraded heavy report behavior has an agreed mitigation before go-live.

## 11. Execution Order

Run in this order to avoid confusing financial evidence:

1. Product/finance sign-off gates for fraud and FX policy.
2. Static currency sweep and tenant setting verification.
3. OBS-7 fraud gate functional tests.
4. OBS-2 UGX label sweep functional tests.
5. OBS-2 non-base and mixed-currency FX tests.
6. GL coverage fresh-flow tests.
7. Historical/seed GL reconciliation.
8. Scale smoke load.
9. Peak/load and settlement batch stress.
10. Final go/no-go evidence pack and defect register update.

## 12. Execution Tracking Matrix

| Suite | Status | Lead | Evidence Location | Defects Raised | Re-test Status |
|---|---|---|---|---|---|
| A. OBS-7 fraud approval gate | Not started |  |  |  |  |
| B1-B2. Currency label sweep | Not started |  |  |  |  |
| B3-B5. FX and mixed-currency settlement | Not started |  |  |  |  |
| C. GL coverage and reconciliation | Not started |  |  |  |  |
| D. Scale/load proof | Not started |  |  |  |  |

## 13. Go / No-Go Decision Rules

| Result | Decision Impact |
|---|---|
| OBS-7 fails with gate ON | No-go for tenants requiring fraud-control enforcement; conditional go only if setting remains OFF and product accepts risk in writing. |
| Any mixed-currency raw summing remains possible | No-go for multi-currency go-live. |
| Incorrect currency labels remain on core money screens | No-go for affected tenant/currency if users can make or approve financial decisions from the misleading screen. |
| Fresh UI-created claims do not post expected GL | No-go for money-out workflows. |
| Historical GL gap unexplained | Conditional go only with signed migration/reconciliation plan and documented scope. |
| Settlement batch stress recreates timeout/stranding | No-go for settlement at real monthly volume. |
| Load test shows high latency but no financial risk | Conditional go with capacity mitigation and monitoring plan. |
| Raw internal errors or data leakage appear | No-go until fixed and re-tested. |

## 14. Final Evidence Pack

Before updating the go/no-go verdict, assemble:

- Completed tracking matrix with PASS/FAIL/BLOCKED statuses.
- Claim and batch inventory for all test records.
- Fraud gate screenshots and audit trail evidence.
- Currency/FX reconciliation calculations.
- GL reconciliation table for fresh and historical samples.
- Load test report and monitoring extracts.
- Updated `DEFECT_REGISTER.md`.
- Updated `GO_NO_GO_READINESS.md` conditions section with final status and residual risks.
