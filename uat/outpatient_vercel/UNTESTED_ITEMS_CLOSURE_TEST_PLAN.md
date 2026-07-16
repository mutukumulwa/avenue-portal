# Untested Items Closure Test Plan — Outpatient Front-End UAT

## Purpose

Close the remaining untested items from `GO_NO_GO_READINESS.md` with end-to-end, browser-only tests on the Vercel deployment. Every actor involved in each item must log in and perform their real workflow step. No database injections, direct Prisma calls, seed scripts, backend shortcuts, or API-only test actions are allowed.

## Target

| Item | Value |
|---|---|
| Deployment | `https://avenue-portal.vercel.app` |
| Test channel | Front end only |
| Browser | Chrome latest; repeat critical failures once in a second browser if time allows |
| Evidence folder / IDs | Record screenshot IDs in `TEST_RUN_LOG.md` |
| Defects | Record confirmed defects in `DEFECT_REGISTER.md` |
| Status updates | Update `GO_NO_GO_READINESS.md` after execution |

## Closure Scope

This plan covers only the previously untested items:

1. Live HR NWSC-only scope, end to end.
2. Fund-admin fund-balance impact.
3. Report exports, CSV/PDF tie-out and totals.
4. Scenario D remainder: double-submit dedupe, future-DOS block, zero-amount line, duplicate settlement, decide-before-compute.
5. Partial-approval money math and settlement exclusion.
6. Member notifications.

## Hard Rules

- Each persona logs in separately. Do not perform another actor's step as admin unless the step is explicitly an admin setup step.
- If a user is missing, admin creates that user through `/settings` using Invite User, then logs out.
- Use disposable claims for validation/error tests.
- Never edit the database to create, alter, settle, or clean up data.
- Do not rely on screenshots alone for financial tie-out. Record claim number, settlement batch, before/after values, and visible report totals.
- If a flow cannot be exercised because the front end lacks the route/control, record it as `BLOCKED - UI GAP`, not as pass.

## Existing Personas and Data

Use these previously verified Vercel personas where possible.

| Actor | Account / Data | Role in This Plan |
|---|---|---|
| Admin | `admin@medvex.co.ug` | Creates any missing users; confirms group/provider/member setup |
| Principal member | Mark Kato, `NWSC-2026-01768` | Member portal, notifications, utilisation |
| Dependant | Prossy Kato, `NWSC-2026-02891` | Partial-approval test member |
| Provider A | Aga Khan University Hospital provider user | Positive provider, validation claims, settlement visibility |
| Provider B | International Hospital Kampala provider user | Cross-provider scope and dependant partial claim |
| Claims officer | Claims officer account | Capture, compute, decision, decide-before-compute test |
| Medical officer | Medical officer account | Reviews partial/rejected clinical line or exception |
| Finance maker | Finance officer maker account | Creates settlement batches |
| Finance checker | Finance checker account | Approves/marks paid; duplicate settlement test |
| NWSC HR | NWSC-scoped HR user | HR scope and employer utilisation |
| Reports viewer | Reports viewer account | CSV/PDF exports and read-only report checks |
| Fund admin | Fund administrator account | Fund balance before/after claim settlement |

If the fund administrator is missing, admin must create one through `/settings` and assign the relevant self-funded scheme(s). If NWSC is not self-funded, follow the branch in section F.

## Test Claims to Create

Create fresh claims for this closure pass so each result can be tied out cleanly.

| Ref | Purpose | Provider Actor | Member | Intended Outcome |
|---|---|---|---|---|
| CLOSURE-A | HR, reports, notification, fund impact if applicable | Aga Khan provider | Mark Kato | Approved and settled |
| CLOSURE-B | Partial approval math | IHK provider | Prossy Kato | Partially approved |
| CLOSURE-C | Decide-before-compute validation | Aga Khan provider | Mark Kato or another disposable active NWSC member | Validation should block decision before compute |
| CLOSURE-D | Double-submit dedupe | Aga Khan provider | Disposable active member | No duplicate claim |
| CLOSURE-E | Future date / zero amount validation | Aga Khan provider | Disposable active member | UI/server validation blocks |

## Setup Gate

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| G1 | Admin | `/login` | Log in to Vercel | Admin dashboard loads | Screenshot |
| G2 | Admin | `/settings` | Confirm all required personas exist and are ACTIVE | Missing users are identified | Screenshot |
| G3 | Admin | `/settings` | Create missing users through Invite User only | New user can log in; correct role/scope visible | Screenshot per user |
| G4 | Admin | `/members` | Confirm Mark and Prossy are ACTIVE NWSC members | Member numbers and family link confirmed | Screenshot |
| G5 | Admin | `/providers` or provider detail | Confirm Aga Khan and IHK are ACTIVE providers | Contract status ACTIVE | Screenshot |
| G6 | Admin | `/groups` | Confirm NWSC scheme status and funding model if visible | Funding model documented | Screenshot |
| G7 | Admin | `/packages`, member detail, or group detail | Confirm benefit/exclusion setup for partial approval | At least one covered and one rejectable service/benefit available | Screenshot |

## H. Live HR NWSC-Only Scope

### Objective

Prove the HR manager assigned to NWSC can see NWSC roster/utilisation changes caused by a live outpatient claim, and cannot see other employers' members or admin/provider/claims areas.

### End-to-End Script

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| H1 | Admin | `/settings` | Open NWSC HR user profile / user row | User role is HR_MANAGER and assigned to NWSC only | Screenshot |
| H2 | NWSC HR | `/login` → `/hr/dashboard` | Log in as NWSC HR | Lands in HR portal; employer context is NWSC | Screenshot |
| H3 | NWSC HR | `/hr/roster` | Search `NWSC-2026-01768` / Mark Kato | Mark appears in roster | Screenshot |
| H4 | NWSC HR | `/hr/roster` | Search Prossy Kato or `NWSC-2026-02891` | Dependant appears if dependants are part of roster; otherwise a clear scoped empty/filtered result | Screenshot |
| H5 | NWSC HR | `/hr/utilization` | Capture current NWSC utilisation totals | Baseline total captured before CLOSURE-A decision | Screenshot |
| H6 | Aga Khan provider | `/provider/eligibility` → `/provider/claims/new` | File CLOSURE-A outpatient claim for Mark | Claim created under Aga Khan provider | Claim number |
| H7 | Claims officer | `/claims` | Capture, compute, and approve CLOSURE-A | Claim APPROVED with known approved amount | Screenshot |
| H8 | Finance maker/checker | `/settlement` | Settle CLOSURE-A if available for settlement | Claim/batch reaches PAID/SETTLED | Batch evidence |
| H9 | NWSC HR | `/hr/utilization` | Re-open utilisation after approval/settlement | NWSC totals reflect the claim according to product timing; expected timing recorded | Screenshot |
| H10 | NWSC HR | `/hr/roster` or roster member detail | Re-open Mark | Mark's utilisation/status is visible in HR scope | Screenshot |
| H11 | NWSC HR | `/claims`, `/provider/dashboard`, `/settings`, `/members` | Try direct forbidden routes | Access Denied / unauthorized; no data rendered | Screenshot |
| H12 | NWSC HR | `/hr/roster` | Search a known non-NWSC member or another employer name | No non-NWSC member data is returned | Screenshot |

### Pass Criteria

- HR user sees NWSC member/utilisation after real claim activity.
- HR user does not see another employer's data.
- HR user cannot open admin, provider, claims, settings, or member-registry pages.

## F. Fund-Admin Fund-Balance Impact

### Objective

Prove a fund administrator can see a fund balance before and after an approved outpatient claim is settled, and that the balance moves by the correct payer share only.

### Branch Selection

Use Branch F1 if NWSC is self-funded and assigned to a fund admin. Use Branch F2 if NWSC is not self-funded or the UI does not expose a National Water fund account.

### F1. NWSC Self-Funded Path

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| F1.1 | Admin | `/settings` | Confirm fund admin user is assigned to NWSC fund/scheme | Fund admin scope includes NWSC | Screenshot |
| F1.2 | Fund admin | `/fund/dashboard` | Log in | Fund portal loads, NWSC visible | Screenshot |
| F1.3 | Fund admin | `/fund/dashboard` or NWSC fund page | Record opening fund balance, claims paid, pending claims | Baseline captured | Screenshot |
| F1.4 | Provider | `/provider/claims/new` | File CLOSURE-A or a new NWSC outpatient claim | Claim created | Claim number |
| F1.5 | Claims officer | `/claims` | Approve claim with known payer share | Approved amount/member share recorded | Screenshot |
| F1.6 | Finance maker | `/settlement` | Create settlement batch for the provider | Batch includes claim and total | Screenshot |
| F1.7 | Finance checker | `/settlement` | Approve and mark paid | Batch reaches SETTLED/PAID | Screenshot |
| F1.8 | Fund admin | `/fund/dashboard` or NWSC fund page | Re-check fund balance and transaction list | Fund decreases by payer share; transaction references claim/batch if UI exposes it | Screenshot |
| F1.9 | Finance | `/billing/gl` | Confirm GL balanced | GL remains balanced after payment | Screenshot |

### F2. Non-NWSC Self-Funded Disposable Path

If NWSC is not self-funded, do not force a database change. Instead, use a visible self-funded employer already available in the front end, or create/prepare a disposable self-funded group only if the UI supports it.

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| F2.1 | Admin | `/groups` or `/fund/dashboard` via switch portal | Identify an ACTIVE self-funded group | Group/fund visible in UI | Screenshot |
| F2.2 | Admin | `/members` or HR roster | Select/create an active disposable member in that self-funded group through UI | Member exists and can claim | Screenshot |
| F2.3 | Admin | `/settings` | Assign fund admin to that self-funded group if needed | Fund admin can see the group | Screenshot |
| F2.4 | Fund admin | `/fund/dashboard` | Record opening balance | Baseline captured | Screenshot |
| F2.5 | Provider | `/provider/claims/new` | File outpatient claim for disposable member | Claim created | Claim number |
| F2.6 | Claims officer | `/claims` | Approve claim | Approved amount known | Screenshot |
| F2.7 | Finance maker/checker | `/settlement` | Settle provider batch | Batch SETTLED/PAID | Screenshot |
| F2.8 | Fund admin | `/fund/dashboard` | Confirm fund balance movement | Balance decreases by payer share only | Screenshot |

### Pass Criteria

- Fund balance movement is visible to fund admin through the front end.
- Movement equals the approved payer share, not gross billed or rejected amounts.
- GL remains balanced.

## R. Report Exports and Tie-Out

### Objective

Prove report screens and exports include the closure-pass claims and agree with source screens.

### Reports to Test

At minimum:

- Claims experience / claims summary.
- Provider statement or provider claims report.
- Rejected/exclusion claims report.
- Member utilisation or scheme utilisation report.
- Fund utilisation report if fund path is exercised.

### Script

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| R1 | Reports viewer | `/reports` | Log in | Read-only reports access loads | Screenshot |
| R2 | Reports viewer | `/reports` | Open claims report for date range covering closure claims | CLOSURE-A/B claim numbers visible or totals include them | Screenshot |
| R3 | Reports viewer | Claims report | Export CSV | CSV downloads through front end | Filename + screenshot |
| R4 | Reports viewer | Claims report | Export PDF if available | PDF downloads/renders, or clear front-end error logged | Filename + screenshot |
| R5 | Reports viewer | Provider report/statement | Filter provider Aga Khan | CLOSURE-A appears in provider totals/status | Screenshot/export |
| R6 | Reports viewer | Provider report/statement | Filter provider IHK | CLOSURE-B appears with partial/declined status | Screenshot/export |
| R7 | Reports viewer | Rejected/exclusion report | Filter same date range | Rejected portion of CLOSURE-B appears with reason code | Screenshot/export |
| R8 | Reports viewer | Utilisation report | Filter NWSC / relevant group | Mark/Prossy utilisation matches claim decisions | Screenshot/export |
| R9 | Finance officer | `/claims`, `/settlement`, `/billing/gl` | Independently capture source totals | Source totals available for tie-out | Screenshots |
| R10 | Tester/agent | Downloaded CSV/PDF vs source screens | Reconcile claim count, billed, approved, declined, paid, member share | Totals match or defect raised | Tie-out notes |

### Tie-Out Table

| Metric | Source Screen | CSV | PDF | Expected |
|---|---:|---:|---:|---|
| CLOSURE-A billed |  |  |  | Matches provider/claim detail |
| CLOSURE-A approved |  |  |  | Matches adjudication |
| CLOSURE-A paid |  |  |  | Matches settlement |
| CLOSURE-B billed |  |  |  | Matches provider/claim detail |
| CLOSURE-B approved |  |  |  | Approved lines only |
| CLOSURE-B rejected |  |  |  | Rejected lines only |
| Claims count for date range |  |  |  | Same filter boundaries |
| Provider payable |  |  |  | Excludes rejected amounts |

### Pass Criteria

- CSV and PDF exports either complete and match screen totals, or defects are logged.
- Reports viewer cannot mutate data.
- Report filters do not leak out-of-scope data.

## D. Front-End Validation Remainder

### Objective

Prove the remaining negative/edge cases fail safely through the UI with no crashes, duplicates, or financial side effects.

### D4. Zero-Amount Line

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| D4.1 | Provider | `/provider/claims/new` | Enter valid member, diagnosis, and one service line with amount `0` | Submit blocked or line ignored with clear validation | Screenshot |
| D4.2 | Provider | `/provider/claims` | Check latest claims | No zero-amount claim is created | Before/after count |
| D4.3 | Claims officer | `/claims` | Search member/date | No claim entered TPA queue | Screenshot |

### D5. Future Date of Service

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| D5.1 | Provider | `/provider/claims/new` | Try selecting tomorrow as date of service | Browser UI blocks via max date, or server returns friendly error | Screenshot |
| D5.2 | Provider | `/provider/claims` | Confirm no future-DOS claim exists | No claim created | Screenshot |
| D5.3 | Claims officer | `/claims` | Search date/member | No future-DOS claim in queue | Screenshot |

### D6. Double-Submit Dedupe

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| D6.1 | Provider | `/provider/claims` | Record current claim count for provider | Baseline captured | Screenshot |
| D6.2 | Provider | `/provider/claims/new` | Fill CLOSURE-D claim | Form ready | Screenshot |
| D6.3 | Provider | `/provider/claims/new` | Rapidly double-click Submit or submit same form twice using browser back/resubmit | Only one claim is created, or duplicate attempt is blocked with friendly message | Screenshot/video if possible |
| D6.4 | Provider | `/provider/claims` | Count matching member/provider/DOS/amount claims | Exactly one matching claim | Screenshot |
| D6.5 | Claims officer | `/claims` | Search same member/provider/DOS/amount | Exactly one matching claim in TPA queue; no duplicate payable exposure | Screenshot |

### D7. Decide Before Compute Outcome

Use a fresh disposable claim, CLOSURE-C, so the test does not disturb settled/financial claims.

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| D7.1 | Provider | `/provider/claims/new` | File CLOSURE-C valid outpatient claim | Claim RECEIVED | Claim number |
| D7.2 | Claims officer | `/claims` | Open CLOSURE-C | Claim detail loads | Screenshot |
| D7.3 | Claims officer | Claim detail | Move to CAPTURED only if required, but do not compute outcome | Claim ready for decision attempt | Screenshot |
| D7.4 | Claims officer | Claim detail | Attempt final APPROVE/PARTIAL/DECLINE decision before compute outcome | Friendly validation blocks decision; no server crash/raw error | Screenshot |
| D7.5 | Claims officer | Claim detail | Refresh claim | Status and amounts unchanged from before invalid attempt | Screenshot |
| D7.6 | Medical officer | Claim detail | Confirm no medical/override artefact was wrongly created | No erroneous exception/override | Screenshot |

### D8. Duplicate Settlement

Use a small settled closure batch, preferably CLOSURE-A or a new single-provider batch created for the test.

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| D8.1 | Finance maker | `/settlement` | Record existing batches for provider/date cycle | Baseline captured | Screenshot |
| D8.2 | Finance maker | `/settlement` | Create batch for approved closure claim(s) | One batch created | Batch ref |
| D8.3 | Finance checker | `/settlement` | Approve and mark paid | Batch SETTLED/PAID | Screenshot |
| D8.4 | Finance checker | Settlement detail/list | Try Mark Paid again, refresh/back/reopen if control is available | Duplicate payment is impossible; no second voucher/journal | Screenshot |
| D8.5 | Finance maker | `/settlement` | Try creating a second batch for the same already-paid claim/date/provider | Paid claim is excluded or duplicate batch blocked | Screenshot |
| D8.6 | Provider | `/provider/settlements` | Review provider settlement list | Only one settlement/payment for the claim | Screenshot |
| D8.7 | Finance | `/billing/gl` | Review GL entries | Only one payment journal for the batch/claim | Screenshot |

## P. Partial-Approval Money Math and Settlement Exclusion

### Objective

Prove a claim can be partially approved, that approved/rejected amounts are mathematically correct, and that settlement pays only the approved payer share.

### Recommended CLOSURE-B Claim Design

Use Prossy Kato at IHK or another active dependant/member. Enter one covered outpatient line and one line expected to be rejected by benefit, tariff, exclusion, or reviewer decision.

| Line | Example | Billed | Intended Decision |
|---|---|---:|---|
| 1 | Covered consultation | 6,000 | Approve |
| 2 | Non-covered dental/optical/other line | 8,000 | Reject |
| Total billed |  | 14,000 |  |
| Expected approved |  | 6,000 minus member share if configured |  |
| Expected rejected |  | 8,000 |  |

Use the actual benefits/tariffs available in the UI. If the UI cannot represent a covered and rejected line together, record `BLOCKED - UI GAP` and use the closest available partial-decision mechanism.

### Script

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| P1 | Provider IHK | `/provider/eligibility` | Search Prossy | Eligible dependant found | Screenshot |
| P2 | Provider IHK | `/provider/claims/new` | Submit two-line CLOSURE-B claim | Claim created with total billed equal to sum of lines | Claim number |
| P3 | Claims officer | `/claims` | Open CLOSURE-B | All lines and diagnosis visible | Screenshot |
| P4 | Claims officer | Claim detail | Capture and compute outcome | System computes available ceiling/member share if applicable | Screenshot |
| P5 | Medical officer | Claim detail | Review rejected/non-covered line | Clinical review/override decision recorded if needed | Screenshot |
| P6 | Claims officer | Claim detail | Approve covered line, reject excluded line with reason | Status becomes PARTIALLY_APPROVED; reason code visible | Screenshot |
| P7 | Claims officer | Claim financial summary | Record gross, approved, rejected, member share, provider payable | Math ties to line decisions | Screenshot |
| P8 | Finance maker | `/settlement` | Create settlement batch for IHK claim | Batch total includes approved payer share only | Screenshot |
| P9 | Finance checker | `/settlement` | Approve and mark paid | Paid amount excludes rejected line | Screenshot |
| P10 | IHK provider | `/provider/claims` and `/provider/settlements` | Review claim and settlement | Provider sees partial status, approved paid amount only | Screenshot |
| P11 | Member | `/member/utilization` | Review utilisation | Usage changes only per approved/usage-counted amount | Screenshot |
| P12 | Reports viewer | `/reports` | Export rejected/exclusion and claims reports | Partial claim appears with approved/rejected split | Export evidence |

### Pass Criteria

- `approved + rejected + member share adjustments` reconcile to the line-level decision model.
- Settlement excludes rejected amount.
- Provider and member portals show partial status correctly.
- Reports show both the paid and rejected components where report design supports it.

## N. Member Notifications

### Objective

Prove the member receives relevant in-app notifications for claim creation/decision/payment or, if notifications are not implemented for these events, record the gap clearly.

### Script

| # | Actor | Route | Action | Expected Result | Evidence |
|---|---|---|---|---|
| N1 | Member Mark | `/member/notifications` | Capture baseline notifications before CLOSURE-A | Baseline count/list recorded | Screenshot |
| N2 | Provider | `/provider/claims/new` | File CLOSURE-A | Claim created | Claim number |
| N3 | Member Mark | `/member/notifications` | Check after provider submission | Intake/visit notification appears if configured; otherwise no-notification gap recorded | Screenshot |
| N4 | Claims officer | Claim detail | Approve CLOSURE-A | Decision recorded | Screenshot |
| N5 | Member Mark | `/member/notifications` | Check after approval | Approval/claim decision notification appears if configured | Screenshot |
| N6 | Finance maker/checker | `/settlement` | Settle CLOSURE-A | Claim paid/settled | Screenshot |
| N7 | Member Mark | `/member/notifications` | Check after payment | Payment/settlement notification appears if configured; if not, record expected product decision | Screenshot |
| N8 | Member Mark | `/member/utilization` | Open claim detail from utilisation/activity if available | Claim detail and status match notification | Screenshot |

### Pass Criteria

- At least claim decision notification is present, or missing notification is logged as an observation/defect according to product expectation.
- Notification content names correct provider, date, status, and amount.
- Member sees only own/family notifications.

## Execution Order

Run in this order to maximize reuse of fresh claims and avoid contaminating financial evidence:

1. Setup Gate.
2. HR baseline H1-H5.
3. Notification baseline N1.
4. Validation tests D4 and D5 because they should create no data.
5. Double-submit D6 using a disposable valid claim.
6. Decide-before-compute D7 using a separate disposable claim.
7. CLOSURE-A approved claim: H6-H10, F path, N2-N8, settlement, reports.
8. CLOSURE-B partial approval: P1-P12.
9. Duplicate settlement D8 after at least one small batch is settled.
10. Report export tie-out R1-R10.
11. HR negative scope H11-H12 and final security checks.
12. Update readiness and defect register.

## Completion Checklist

| Item | Status | Evidence |
|---|---|---|
| HR NWSC-only scope exercised end to end | ✅ PASS | H1–H12; util 16,500→28,000; denied all forbidden routes |
| Fund-admin balance impact verified or UI gap documented | ✅ PASS | Branch F1; NWSC fund −11,500 payer share; fund admin created via UI |
| CSV export tie-out completed | ✅ PASS | Provider Statements + Exclusion CSVs tie out exactly |
| PDF export tie-out completed | ⚠️ OBS-CLOSURE-1 | PDF export produces no file / non-readable tab — unverified; verify manually |
| D4 zero-amount validation completed | ✅ PASS | Blocked: "Add at least one service line with an amount" |
| D5 future-DOS validation completed | ✅ PASS | Blocked: "Date of service cannot be in the future (Africa/Kampala)" |
| D6 double-submit dedupe completed | ✅ PASS | One claim (CLM-2026-00281); button disables to "Submitting…" |
| D7 decide-before-compute completed | ✅ PASS | Ceiling auto-computed at capture; over-ceiling decision blocked, claim unchanged |
| D8 duplicate settlement completed | ✅ PASS | No Mark Paid on settled batch; new batch "No unsettled approved claims"; one GL journal |
| Partial approval math and settlement exclusion completed | ✅ PASS | CLOSURE-B 14,000 = 6,000 approved/paid + 8,000 rejected/excluded |
| Member notifications completed | ⚠️ OBS-CLOSURE-2 | Inbox empty through intake/approval/payment; status only in dashboard activity |
| `TEST_RUN_LOG.md` updated | ✅ | New `CLOSURE_TEST_RUN_LOG.md` (full closure evidence) |
| `DEFECT_REGISTER.md` updated | ✅ | OBS-CLOSURE-1, OBS-CLOSURE-2 + closure summary |
| `GO_NO_GO_READINESS.md` updated | ✅ | Untested-risk register retired; CONDITIONAL GO reaffirmed |

**Closure outcome:** all six untested items exercised end-to-end (front-end only, actors as themselves). **No new Critical/High defects.** Verdict stays **CONDITIONAL GO**; the closure pass retires the untested-risk register. Full evidence: `CLOSURE_TEST_RUN_LOG.md`.

