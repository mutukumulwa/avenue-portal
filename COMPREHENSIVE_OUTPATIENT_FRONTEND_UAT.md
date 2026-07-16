# Comprehensive Outpatient Front-End UAT Runbook

## Purpose

Run a deeper outpatient UAT on the Vercel deployment using only the front end. Every actor involved in the end-to-end outpatient process must log in with their own account and perform their own part of the workflow.

This runbook supersedes the earlier National Water outpatient script for the next UAT pass. It intentionally includes provider portal participation, member portal checks, HR visibility, TPA adjudication, medical review, finance settlement, provider settlement visibility, reporting, role access checks, and ledger/balance verification.

## Hard Rules

- Test against the Vercel deployment URL only. Do not use localhost.
- Do not make database edits, database injections, seed scripts, direct Prisma calls, or API shortcuts during the UAT flow.
- If a required account does not exist, the admin logs in through the front end and creates that account from the UI.
- Every action must be performed by the user who would do it in real life.
- Capture evidence for every material step: screenshot, claim number, visit/check-in reference if available, settlement batch, report export, or audit log row.
- Record all defects with exact user, route, data entered, expected result, actual result, timestamp, and screenshot.

## Deployment Under Test

| Item | Value |
|---|---|
| Vercel URL |  |
| Test date |  |
| Browser | Chrome latest, plus one secondary browser if time allows |
| Tester / agent |  |
| Build / commit shown in UI, if visible |  |
| Environment | UAT / staging |

## Primary Story

A National Water principal member attends an outpatient visit at Nakasero Hospital. The provider portal user checks eligibility and files the claim. The TPA claims officer adjudicates it. A medical officer reviews any clinical exception or override if needed. Finance settles the approved claim. The provider portal user confirms the settlement is visible. The member and National Water HR user confirm utilisation and employer visibility.

The same flow is repeated for a dependant at International Hospital Kampala with a partial approval or decline, so the rejection path, reason codes, balances, and reports are tested.

## Users Required

Create missing users from the Vercel front end: admin logs in, opens Settings, uses Invite User, selects the correct role and scope, sets a temporary password, logs out, and verifies the new user can log in.

| Actor | Role | Example Email | Scope / Assignment | Required Portal |
|---|---|---|---|---|
| Admin setup user | SUPER_ADMIN | `admin.uat@test.local` | Full tenant | `/dashboard`, `/settings` |
| National Water HR | HR_MANAGER | `hr.nwsc.uat@test.local` | National Water group | `/hr/dashboard` |
| Principal member | MEMBER_USER | `daniel.kato.nwsc@test.local` | Daniel Kato member profile | `/member/dashboard` |
| Optional dependant user | MEMBER_USER | `sarah.kato.nwsc@test.local` | Sarah Kato member profile, if supported | `/member/dashboard` |
| Nakasero provider user | PROVIDER_USER | `provider.nakasero.uat@test.local` | Nakasero Hospital | `/provider/dashboard` |
| IHK provider user | PROVIDER_USER | `provider.ihk.uat@test.local` | International Hospital Kampala | `/provider/dashboard` |
| TPA claims officer | CLAIMS_OFFICER | `claims.uat@test.local` | Claims capture/adjudication | `/dashboard`, `/claims` |
| TPA medical officer | MEDICAL_OFFICER | `medical.uat@test.local` | Clinical review, exceptions, overrides | `/dashboard`, `/claims`, `/fraud` or review queue |
| TPA finance maker | FINANCE_OFFICER | `finance.maker.uat@test.local` | Settlement creation | `/dashboard`, `/settlement`, `/billing/gl` |
| TPA finance checker | FINANCE_OFFICER | `finance.checker.uat@test.local` | Settlement approval | `/dashboard`, `/settlement`, `/billing/gl` |
| Reports viewer | REPORTS_VIEWER | `reports.uat@test.local` | Read-only reports | `/dashboard`, `/reports` |
| Fund admin, if National Water is self-funded | FUND_ADMINISTRATOR | `fund.nwsc.uat@test.local` | National Water fund | `/fund/dashboard` |

## Test Data

| Entity | Value |
|---|---|
| Employer / group | National Water and Sewerage Corporation |
| Scheme | National Water Staff Medical Scheme |
| Principal | Daniel Kato |
| Principal member number |  |
| Dependant | Sarah Kato |
| Dependant member number |  |
| Optional child dependant | Miriam Kato |
| Positive facility | Nakasero Hospital |
| Negative / partial facility | International Hospital Kampala |
| Primary positive diagnosis | Acute upper respiratory infection |
| Positive ICD-10 | `J06.9`, or nearest available diagnosis in the UI |
| Positive service type | OUTPATIENT |
| Positive benefit | OUTPATIENT |
| Positive lines | Consultation, laboratory, pharmacy |
| Negative / partial benefit | DENTAL, OPTICAL, OUTPATIENT over-limit, or another configured exclusion |

## Setup Through Front End

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| S1 | Admin | Vercel URL `/login` | Log in as admin | Lands on admin dashboard | Screenshot |  |
| S2 | Admin | `/settings` | Confirm all required users exist | Existing users are active and scoped correctly | Screenshot |  |
| S3 | Admin | `/settings` | Create missing HR user and assign National Water group | HR user can log in and sees only National Water | Screenshot |  |
| S4 | Admin | `/settings` | Create missing provider users with role Provider (Facility), assigning Nakasero and IHK respectively | Each provider user lands on its own provider dashboard | Screenshot |  |
| S5 | Admin | `/settings` | Create missing claims, medical, finance maker/checker, reports, and fund users | Each role logs in successfully and lands in correct portal | Screenshot per role |  |
| S6 | Admin | `/groups` and group detail | Confirm National Water scheme is ACTIVE | Group/scheme active | Screenshot |  |
| S7 | Admin | `/members` | Confirm Daniel, Sarah, and Miriam exist, are ACTIVE, and are linked as a family | Family relationship correct | Screenshot |  |
| S8 | Admin | Member detail | Create missing member portal login for Daniel, and Sarah if needed | Member user can log in | Screenshot |  |
| S9 | Admin | `/providers` | Confirm Nakasero and IHK are ACTIVE and contracted | Contract status ACTIVE | Screenshot |  |
| S10 | Admin | Provider detail | Confirm outpatient tariffs and diagnosis/CPT tariffs exist | Tariffs usable by provider claim form | Screenshot |  |
| S11 | Admin | `/packages` or member/group benefit page | Confirm outpatient, lab, pharmacy, dental/optical, co-pay, shared limit, and exclusion configuration | Rules are visible and match test design | Screenshot |  |

## Baseline Balances

Capture these before the first provider claim is filed.

| Area | User | Route | Before Value | Evidence |
|---|---|---|---:|---|
| Daniel outpatient annual limit | Member or admin | `/member/benefits` or member detail |  |  |
| Daniel outpatient used | Member or admin | `/member/utilization` or member detail |  |  |
| Daniel outpatient remaining | Member or admin | `/member/benefits` |  |  |
| Sarah outpatient/dental/optical used | Member/admin | Member detail or utilisation |  |  |
| Nakasero provider claim totals | Nakasero provider | `/provider/dashboard` |  |  |
| IHK provider claim totals | IHK provider | `/provider/dashboard` |  |  |
| National Water fund balance, if applicable | Fund admin | `/fund/dashboard` |  |  |
| TPA GL trial balance | Finance | `/billing/gl` | Balanced?  |  |
| Provider settlement total | Provider user | `/provider/settlements` |  |  |
| Rejected claims report count | Reports viewer | `/reports` |  |  |

## Scenario A: Full Approval, Principal Outpatient Claim

### A1. Member Pre-Visit Checks

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| A1.1 | Daniel Kato | `/member/dashboard` | Log in | Daniel sees own member dashboard only | Screenshot |  |
| A1.2 | Daniel Kato | `/member/benefits` | Review outpatient benefit | Outpatient limit, used, and remaining match baseline | Screenshot |  |
| A1.3 | Daniel Kato | `/member/dependents` | Review family | Sarah and Miriam appear as dependants | Screenshot |  |
| A1.4 | Daniel Kato | `/member/facilities` | Search for Nakasero Hospital | Nakasero appears as available/contracted, if facility search is wired | Screenshot |  |
| A1.5 | Daniel Kato | `/member/check-in` | Attempt member-side check-in if supported | Check-in starts or gracefully explains required device/flow | Screenshot |  |

### A2. Provider Eligibility and Outpatient Encounter

The current provider portal starts from eligibility and claim filing. If the Vercel deployment also exposes a separate visit/check-in screen, use it before filing the claim and record the visit reference.

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| A2.1 | Nakasero provider user | `/provider/dashboard` | Log in | Dashboard shows Nakasero Hospital only | Screenshot |  |
| A2.2 | Nakasero provider user | `/provider/eligibility` | Search Daniel by member/card number | Daniel is found and marked ELIGIBLE, with scheme, package, used, and remaining amounts | Screenshot |  |
| A2.3 | Nakasero provider user | `/provider/eligibility` | Click File a claim for this member | Claim form opens with Daniel prefilled | Screenshot |  |
| A2.4 | Nakasero provider user | `/provider/claims/new` | Enter service type OUTPATIENT, benefit OUTPATIENT, date of service today | Encounter fields accepted | Screenshot |  |
| A2.5 | Nakasero provider user | `/provider/claims/new` | Enter attending clinician | Clinician stored on submission, if displayed later | Screenshot |  |
| A2.6 | Nakasero provider user | `/provider/claims/new` | Select primary diagnosis `J06.9` or nearest available diagnosis | Diagnosis selected | Screenshot |  |
| A2.7 | Nakasero provider user | `/provider/claims/new` | Add consultation line | Consultation line accepted | Screenshot |  |
| A2.8 | Nakasero provider user | `/provider/claims/new` | Add laboratory line | Laboratory line accepted | Screenshot |  |
| A2.9 | Nakasero provider user | `/provider/claims/new` | Add pharmacy line | Pharmacy line accepted | Screenshot |  |
| A2.10 | Nakasero provider user | `/provider/claims/new` | Submit claim | Redirects to provider claims list; new claim appears under Nakasero only | Claim number, screenshot |  |
| A2.11 | Nakasero provider user | `/provider/claims` | Open claim detail | Provider can see its own claim detail and current status | Screenshot |  |

### A3. TPA Claims Adjudication

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| A3.1 | Claims officer | `/claims` | Log in and find the Nakasero claim | Claim appears with provider, member, billed amount, and intake status | Screenshot |  |
| A3.2 | Claims officer | Claim detail | Review diagnoses and service lines | Provider-entered data is complete and unaltered | Screenshot |  |
| A3.3 | Claims officer | Claim detail | Review eligibility, benefit balance, contract/tariff panel, and duplicate indicators | No unexpected warnings for clean claim | Screenshot |  |
| A3.4 | Claims officer | Claim detail | Compute outcome/adjudication | Approved/member share/payable amounts calculate correctly | Screenshot |  |
| A3.5 | Claims officer | Claim detail | Submit final decision APPROVED | Claim status becomes APPROVED or equivalent final approved state | Screenshot |  |
| A3.6 | Claims officer | Claim detail or audit area | Verify adjudication log | Decision, actor, timestamp, and amounts are logged | Screenshot |  |

### A4. Medical Review / Exception Path

If the positive claim triggers a clinical exception, the medical officer must handle it. If it does not trigger one, the medical officer still performs a view-only clinical review and records that no exception was required.

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| A4.1 | Medical officer | `/claims` or assigned review queue | Open the claim | Medical officer can view clinical fields but cannot perform finance-only actions | Screenshot |  |
| A4.2 | Medical officer | Claim detail | Review diagnosis/service fit | Clinical review is possible | Screenshot |  |
| A4.3 | Medical officer | Exception/override area, if triggered | Approve/decline override with reason | Override decision is logged with actor and reason | Screenshot |  |

### A5. Finance Settlement and GL

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| A5.1 | Finance maker | `/settlement` | Find approved Nakasero claim | Claim is available for settlement | Screenshot |  |
| A5.2 | Finance maker | `/settlement` | Create provider settlement batch | Batch is created with correct provider, claim count, cycle, and total | Batch reference |  |
| A5.3 | Finance maker | Settlement detail | Attempt to approve own batch, if UI allows attempt | Self-approval is blocked if maker-checker applies | Screenshot |  |
| A5.4 | Finance checker | `/settlement` | Log in separately and open batch | Checker can see pending batch | Screenshot |  |
| A5.5 | Finance checker | Settlement detail | Approve/settle batch | Batch reaches APPROVED/SETTLED and voucher/payment reference appears if implemented | Screenshot |  |
| A5.6 | Finance checker | `/billing/gl` | Review GL/trial balance | Debits equal credits; claim/settlement journals are visible if implemented | Screenshot |  |
| A5.7 | Fund admin, if applicable | `/fund/dashboard` or scheme fund page | Confirm fund impact | Fund balance decreases by payer share only | Screenshot |  |

### A6. Post-Settlement Visibility

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| A6.1 | Nakasero provider user | `/provider/claims` | Re-open claim | Claim status and approved/paid amounts reflect TPA decision | Screenshot |  |
| A6.2 | Nakasero provider user | `/provider/settlements` | Review settlements | Settlement batch/voucher is visible to Nakasero only | Screenshot |  |
| A6.3 | Daniel Kato | `/member/utilization` | Review utilisation | Claim appears; outpatient used and remaining changed correctly | Screenshot |  |
| A6.4 | Daniel Kato | `/member/notifications` | Check notifications | Claim decision notification appears if configured | Screenshot |  |
| A6.5 | National Water HR | `/hr/utilization` or roster | Review group utilisation | Daniel usage visible within HR scope | Screenshot |  |
| A6.6 | Reports viewer | `/reports` | Open claims/utilisation/provider report | Report totals include the approved claim | Screenshot/export |  |

## Scenario B: Partial Approval or Decline, Dependant Outpatient Claim

Use Sarah Kato at International Hospital Kampala. Select a rejection basis that is genuinely configured in the UAT deployment.

### B1. Provider Files Dependant Claim

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| B1.1 | IHK provider user | `/provider/dashboard` | Log in | Dashboard shows IHK only | Screenshot |  |
| B1.2 | IHK provider user | `/provider/eligibility` | Search Sarah by member/card number | Sarah is found as ACTIVE dependant; principal/family context appears if supported | Screenshot |  |
| B1.3 | IHK provider user | `/provider/claims/new` | File outpatient, dental, optical, or configured excluded claim | Claim form accepts Sarah's member number | Screenshot |  |
| B1.4 | IHK provider user | `/provider/claims/new` | Add at least one covered line and one expected rejected line | Claim total includes both lines | Screenshot |  |
| B1.5 | IHK provider user | `/provider/claims/new` | Submit claim | Claim appears under IHK provider claims only | Claim number |  |

### B2. Claims and Medical Decision

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| B2.1 | Claims officer | `/claims` | Find Sarah/IHK claim | Claim appears in TPA claims list | Screenshot |  |
| B2.2 | Claims officer | Claim detail | Compute outcome | Covered lines approve; excluded/over-limit lines reject | Screenshot |  |
| B2.3 | Medical officer | Claim detail or review queue | Review rejected clinical/service line | Medical decision is recorded if required | Screenshot |  |
| B2.4 | Claims officer | Claim detail | Submit PARTIALLY_APPROVED or DECLINED decision | Final status and rejection reason are clear | Screenshot |  |
| B2.5 | Claims officer | Claim detail/audit | Confirm decision log | Rejection reason, actor, and timestamp are recorded | Screenshot |  |

### B3. Finance and Visibility

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| B3.1 | Finance maker | `/settlement` | Check whether Sarah claim is available for settlement | Only approved payable amount appears; fully declined claim does not appear for payment | Screenshot |  |
| B3.2 | Finance maker/checker | `/settlement` | Settle approved amount if partial | Settlement excludes rejected amount | Screenshot |  |
| B3.3 | IHK provider user | `/provider/claims` | Re-open claim | Provider sees partial/declined status, approved amount, paid amount | Screenshot |  |
| B3.4 | IHK provider user | `/provider/settlements` | Review settlement | Only payable amount appears; no payment for fully declined claim | Screenshot |  |
| B3.5 | Daniel or Sarah member user | `/member/utilization` | Review claim outcome | Claim shows status/reason; usage changes only for approved/usage-counted amount | Screenshot |  |
| B3.6 | Reports viewer | `/reports` | Check rejected claims/exclusions report | Sarah claim appears with reason code | Screenshot/export |  |

## Scenario C: Provider Portal Scoping and Security

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| C1 | Nakasero provider user | `/provider/claims` | Confirm only Nakasero claims show | IHK claim is not listed | Screenshot |  |
| C2 | IHK provider user | `/provider/claims` | Confirm only IHK claims show | Nakasero claim is not listed | Screenshot |  |
| C3 | Nakasero provider user | Manually open IHK claim URL if known | Access denied or not found | Screenshot |  |
| C4 | Provider user | `/settlement`, `/billing/gl`, `/settings`, `/members` | Try direct admin routes | Access denied / redirect; no data rendered | Screenshot |  |
| C5 | Claims officer | `/provider/dashboard` | Try provider route | Access denied unless specifically provider-scoped | Screenshot |  |
| C6 | HR user | `/provider/dashboard` and `/claims` | Try provider/admin routes | Access denied | Screenshot |  |
| C7 | Member user | Another member's utilisation/detail URL if obtainable | Try IDOR access | Access denied or own-scope only | Screenshot |  |

## Scenario D: Front-End Validation and Failure Handling

Run these in the provider portal unless noted.

| # | Logged-In User | Route | Action | Expected Result | Evidence | P/F |
|---|---|---|---|---|---|---|
| D1 | Provider user | `/provider/eligibility` | Search fake member number | Friendly "No member found" message | Screenshot |  |
| D2 | Provider user | `/provider/claims/new` | Submit without member number | Inline/friendly validation, no crash | Screenshot |  |
| D3 | Provider user | `/provider/claims/new` | Submit without diagnosis | Inline/friendly validation, no crash | Screenshot |  |
| D4 | Provider user | `/provider/claims/new` | Submit line with zero amount | Validation blocks or ignores invalid line with clear message | Screenshot |  |
| D5 | Provider user | `/provider/claims/new` | Use future date of service | Future date blocked by UI or server validation | Screenshot |  |
| D6 | Provider user | `/provider/claims/new` | Double-click submit | No duplicate claims are created | Claim list before/after |  |
| D7 | Claims officer | Claim detail | Try submit decision before compute outcome on a disposable claim | Friendly validation, no server crash | Screenshot |  |
| D8 | Finance maker/checker | Settlement | Try duplicate settlement or repeat approval | Duplicate settlement is blocked | Screenshot |  |

## Closing Reconciliation

Capture after all scenarios are complete.

| Area | Before | After | Expected Change | Evidence | P/F |
|---|---:|---:|---|---|---|
| Daniel outpatient used |  |  | Increased by approved usage | Screenshot |  |
| Daniel outpatient remaining |  |  | Decreased by approved usage | Screenshot |  |
| Sarah relevant benefit used |  |  | Changed only for approved/usage-counted lines | Screenshot |  |
| Nakasero approved claims total |  |  | Increased by approved claim | Screenshot |  |
| Nakasero paid total |  |  | Increased after settlement | Screenshot |  |
| IHK approved/declined totals |  |  | Reflect partial/declined result | Screenshot |  |
| National Water fund balance, if applicable |  |  | Decreased by payer share only | Screenshot |  |
| GL/trial balance |  |  | Still balanced | Screenshot |  |
| Rejected claims report count |  |  | Increased for declined/partial rejected claim | Screenshot/export |  |

## Defect Severity Guide

| Severity | Use When |
|---|---|
| Critical | Member/provider/HR role can see another scope's data; ineligible member can claim; rejected line is paid; settlement/GL breaks; front-end action crashes a core workflow; duplicate claim/payment is created |
| High | Claim cannot be submitted/adjudicated/settled through front end; provider portal cannot access own claims; balances or utilisation update incorrectly; rejection reason missing |
| Medium | Report/export mismatch, unclear validation, missing notification, awkward but recoverable workflow |
| Low | Copy, layout, minor table/filter issue with no financial/security impact |

## Final Pass Criteria

The outpatient process passes only if:

1. All required users log in through the Vercel front end and perform their own steps.
2. Provider users file claims from the provider portal and are hard-scoped to their own facilities.
3. The positive principal outpatient claim is approved, settled, visible to the provider, visible to the member, and reflected in reports.
4. The dependant partial/declined claim records clear rejection reasons and excludes rejected amounts from settlement.
5. Member utilisation, provider totals, fund/scheme balances, and GL remain consistent.
6. HR sees National Water data only.
7. Reports tie back to the claims created during the test.
8. No database edits or backend shortcuts are used after front-end setup.
9. Every defect has evidence and an assigned severity.

