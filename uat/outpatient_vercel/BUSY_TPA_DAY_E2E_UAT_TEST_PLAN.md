# Busy TPA Day End-to-End UAT Test Plan

**Created:** 2026-07-08  
**Target:** Vercel UI only, production-like UAT run  
**Purpose:** Stress the system like a real third-party administrator handling a busy mixed day: members arriving at facilities, doctors seeing patients, pharmacy/lab/imaging charges accumulating, outpatient claims of several types, inpatient cases opening and closing, pre-authorizations, fraud alerts, claims decisions, finance settlement, provider/member/HR/fund/report visibility, and routine operational exceptions.

This plan is intentionally written like a bug bounty. Testers should try to break money, identity, provider scope, member scope, status transitions, approvals, calculations, and reporting. The bigger the financial or privacy consequence, the more important the bug.

## 1. Non-Negotiable Execution Rules

1. **No database entries or direct database reads.** Do not insert, update, delete, query, seed, backfill, patch, or verify anything through the database.
2. **Everything is manipulated from the Vercel UI.** Use browser screens, UI forms, UI uploads/imports, UI exports, and normal actor logins only.
3. **User creation is allowed only through an admin login.** If a user is missing, log in as admin, open `/settings`, use Invite User, assign the correct role and scope, then log in as that user.
4. **No manual API mutation.** Do not create claims, preauths, HMS batches, check-ins, settlements, notifications, or GL effects by curl/Postman/scripts. Read-only browser devtools observation is allowed, but pass/fail evidence must come from the UI or UI export.
5. **Every actor logs in as themselves.** Do not let admin complete provider, claims, medical, finance, HR, fund, reports, broker, or member work unless the scenario is explicitly an admin scenario.
6. **No silent setup shortcuts.** If a provider, member, package, contract, branch, tariff, fund admin, HR user, reports user, or finance checker is missing, create or repair it through the UI and record each click.
7. **Capture evidence before and after every money-changing action.** At minimum capture claim number, PA number, case number, settlement batch, voucher, claim status, approved amount, paid amount, GL balance, report/export total, and portal view.
8. **Blocked negative cases must leave no side effects.** Confirm through UI screens and reports that no claim, approval, usage, fund drawdown, settlement row, voucher, GL journal, or paid notification was created.

## 2. Bug Bounty Severity Model

| Severity | Treat as | Examples |
|---|---|---|
| Critical | Stop-the-line release blocker | Cross-member/provider/client data exposure; ineligible member paid; wrong provider paid; rejected/declined/member-liability line paid; duplicate claim or payment; unbalanced GL; finance maker can approve own money-out; database/internal error exposed during core workflow. |
| High | Release blocker unless waived by operations and finance | Claim cannot be submitted/adjudicated/settled through UI; inpatient case cannot close/file claim; preauth/LOU ceiling ignored; fund balance wrong; report/export materially disagrees with claim/voucher/GL; provider cannot see own paid statement. |
| Medium | Must be owned before go-live | Confusing validation, missing operational notification, recoverable export issue, awkward but workable workflow, incomplete audit trail, role sees menu link that ends in denial. |
| Low | Fix opportunistically | Copy, layout, sorting, minor label/currency display issue with no financial or privacy impact. |

## 3. Required Personas

Create or confirm these through `/settings` only. Record username, role, scope, facility/group/member link, and evidence that login succeeds.

| Persona | Role | Scope required |
|---|---|---|
| Admin | SUPER_ADMIN | Can invite users, inspect setup, create providers/contracts/packages/users where UI allows. |
| Provider desk A | PROVIDER_USER | Facility A, outpatient and inpatient-capable. |
| Provider desk B | PROVIDER_USER | Facility B, used for provider isolation and transfer tests. |
| Claims officer 1 | CLAIMS_OFFICER | Captures, reviews, adjudicates routine claims. |
| Claims officer 2 | CLAIMS_OFFICER or MEDICAL_OFFICER | Separate reviewer/checker for controls and fraud/medical routing. |
| Medical reviewer | MEDICAL_OFFICER | Preauth, clinical case, fraud/medical review, high-value adjudication. |
| Finance maker | FINANCE_OFFICER | Creates settlement batches. |
| Finance checker | FINANCE_OFFICER | Approves/marks paid; must be distinct from maker. |
| HR manager | HR_MANAGER | One employer/group only. |
| Fund admin | FUND_ADMINISTRATOR | One self-funded group only. |
| Reports viewer | REPORTS_VIEWER | Reports/export read-only. |
| Member principal | MEMBER_USER | Active principal with dependants. |
| Optional broker | BROKER_USER | Only if testing service/support or portfolio visibility for broker-originated group. |

## 4. Daily Test Portfolio

Use a control sheet outside the app to record expected totals. The control sheet is not a database shortcut; it is the tester's calculator.

| Track | Minimum daily volume | Purpose |
|---|---:|---|
| OP-1 clean outpatient consultation | 1 | Prove simple end-to-end money spine. |
| OP-2 outpatient with lab/pharmacy | 1 | Prove multi-line totals, provider billing, claim decision. |
| OP-3 outpatient with imaging/procedure | 1 | Prove high-cost ancillary routing and contract ceiling. |
| OP-4 dental or optical | 1 | Prove outpatient-adjacent category acceptance/blocking. |
| OP-5 chronic/mental/wellness | 1 | Prove non-standard benefit category handling. |
| OP-6 partial approval | 1 | Prove rejected amount excluded from usage, settlement, fund, GL. |
| OP-7 declined claim | 1 | Prove decline has no payable side effects. |
| OP-8 duplicate/double-submit attempt | 1 | Prove duplicate claim/payment resistance. |
| PA-1 outpatient or day-case preauth | 1 | Prove request, review, approval/decline, claim attachment where supported. |
| IP-1 inpatient admission opens | 1 | Prove case creation, LOU, service accrual, inpatient claim later. |
| IP-2 inpatient case closes | 1 | Prove case-to-claim, read-only closure, adjudication, settlement. |
| X-1 transfer/cross-provider scenario | 1 if supported | Prove each facility is scoped and settled separately. |
| FIN-1 settlement batch | 1 per provider with approved claims | Prove maker/checker, voucher, GL, provider statement. |
| OPS-1 service request/complaint | 1 | Prove routine operational workload does not leak or corrupt claim data. |

## 5. Setup Walkthrough - UI Only

| Step | Actor | Click path | Required checks |
|---|---|---|---|
| SET-01 | Admin | Login -> `/settings` -> Invite User | Create missing users only through Invite User. Assign role. For provider user select facility. For member user link member profile. For HR/fund roles select correct group/fund scope if shown. |
| SET-02 | Admin | `/providers` | Confirm Facility A and B are active/contracted. If creating a provider through UI, fill provider details, save, confirm provider detail opens. |
| SET-03 | Admin | `/providers/[id]` | Confirm branches, tariff/contract information, claims tab, active status. Try search by exact and partial provider name. |
| SET-04 | Admin/Underwriter | `/contracts`, `/packages`, `/settings/approval-matrix`, `/settings/claim-controls`, `/settings/fx-rates` | Confirm pricing, benefit limits, preauth requirements, approval thresholds, fraud gate setting, and currency setup. Record screenshots. |
| SET-05 | Admin/Claims | `/members` | Confirm active principal, dependant, suspended/lapsed test member, near-limit member, and self-funded group member. Search by member number, first name, last name, full name. |
| SET-06 | Finance | `/billing/gl`, `/billing/gl/ledger`, `/settlement` | Capture opening trial balance, claims payable ledger, cash/bank ledger, and no pre-existing batch conflict for the test cycle. |
| SET-07 | Member/Provider/HR/Fund/Reports | Their portals | Capture baseline dashboard, notifications, utilisation, fund balance, provider settlements, report totals. |

Pass condition: all preconditions exist through UI. If any precondition cannot be created or verified through UI, log `BLOCKED - UI SETUP GAP`.

## 6. Morning Arrival and Check-In Flow

Run this for the principal at Facility A and for one dependant if family/dependant handling is in scope.

| ID | Actor | Click-by-click action | Computation/check |
|---|---|---|---|
| CHK-01 | Member | Login -> `/member/dashboard`; capture benefits, utilisation, notifications count, dependants. | Baseline usage and remaining benefit recorded before care. |
| CHK-02 | Provider A | Login -> `/provider/eligibility`; enter member/card number; submit/search. | Member shown eligible; group/package/remaining benefit are correct; no other member appears. |
| CHK-03 | Provider A | From eligibility, use any "file claim" or claim-start action if shown. | Claim form prefills the same member only. |
| CHK-04 | Member + Provider | Member opens `/member/check-in`; provider/admin opens `/check-ins` if available; initiate challenge, member approves, provider confirms code. | Visit verification succeeds once; expired/wrong code cannot be reused. |
| CHK-05 | Provider B | Search same member if contracted access is not expected, and try known Provider A claim/settlement URL after one exists. | Provider B must not see Provider A-only claim/settlement. If member eligibility is network-wide by product design, claim/settlement records must still be facility-scoped. |
| CHK-06 | Provider A | Search fake, suspended/lapsed, or terminated member. | Friendly no-member/not-eligible message; no claim start; no notification or utilisation side effect. |

Bug hunt focus: IDOR by URL guessing, stale member eligibility, member selector leakage, repeated check-in challenge, wrong code replay, expired visit code, and raw server errors.

## 7. Doctor Encounter and Provider Claim Intake

Use `/provider/claims/new` for provider-submitted claims. Use `/claims/new` for TPA-captured or hospital-submitted paper claims. For every claim, record the claim number immediately after submit.

### 7.1 Provider Portal Claim - Exact UI Steps

| Step | Actor | UI action | Expected result |
|---|---|---|---|
| PCL-01 | Provider A | Open `/provider/claims/new`. | Facility name/session is Provider A; no facility selector lets Provider A choose Provider B. |
| PCL-02 | Provider A | Enter `Member / card number`. | Use active principal for OP-1, dependant for OP-2, suspended member for negative run. |
| PCL-03 | Provider A | Set `Date of service` to today. Then attempt tomorrow. | Today allowed. Tomorrow blocked by date max/server validation; no claim. |
| PCL-04 | Provider A | Select `Service type`: OUTPATIENT, then repeat variants for DAY_CASE, EMERGENCY, INPATIENT if portal allows. | Unsupported/PA-required types block with clear message; supported type submits correctly. |
| PCL-05 | Provider A | Select `Benefit`: OUTPATIENT, DENTAL, OPTICAL, CHRONIC_DISEASE, MENTAL_HEALTH, WELLNESS_PREVENTIVE as configured. | Configured category accepted; missing benefit blocked before money. |
| PCL-06 | Provider A | Enter `Attending clinician`. | Saved to claim detail or safely optional. |
| PCL-07 | Provider A | Select `Primary diagnosis (ICD-10)`. | Diagnosis appears on TPA claim detail. Missing diagnosis is blocked. |
| PCL-08 | Provider A | Add consultation line: category CONSULTATION, description, CPT if known, quantity 1, unit amount. | Displayed line total = quantity x unit amount. |
| PCL-09 | Provider A | Add lab line: category LABORATORY, quantity 2, unit amount. | Total increases by `2 x unit`; line category persists. |
| PCL-10 | Provider A | Add pharmacy line: category PHARMACY. | Total includes pharmacy; excluded-drug rules later route/reject if configured. |
| PCL-11 | Provider A | Add imaging/procedure line for OP-3. | High-cost item routes or prices according to contract/preauth rules. |
| PCL-12 | Provider A | Delete one line, re-add it, change quantity and unit amount. | Total recalculates immediately and does not retain deleted amount. |
| PCL-13 | Provider A | Submit claim once. | Success message/redirect; claim appears in provider claims and TPA claims queue. |
| PCL-14 | Provider A | Double-click Submit or browser Back/resubmit if possible. | Only one claim/invoice created. Duplicate is Critical unless clearly blocked. |

Manual computation for each provider claim:

`billed amount = sum(line quantity x line unit amount)`  
`expected payer ceiling = contract/package/tariff payable before member share`  
`expected member share = copay + deductible + coinsurance + non-covered/excess`  
`expected provider payable = approved payer share only`

### 7.2 Admin/Claims Claim Wizard - Exact UI Steps

| Step | Actor | UI action | Expected result |
|---|---|---|---|
| ACL-01 | Claims officer | Open `/claims/new`. | Four-step wizard opens. |
| ACL-02 | Claims officer | Step 1: search member by name, member number, and group; select member. | Member card shows group, package, member number. Full-name search must work. |
| ACL-03 | Claims officer | Step 1: search provider; select Facility A; if branch selector appears, choose active branch. | Inactive/non-operational providers and branches are not selectable. |
| ACL-04 | Claims officer | Step 2: select service type and benefit; set date of service. | Future date prevents Next. Inpatient/surgical/maternity shows preauth warning. |
| ACL-05 | Claims officer | Step 2: for inpatient/day-case enter admission and discharge dates. Try discharge before admission. | LOS displayed consistently; invalid range must block by submit or decision. |
| ACL-06 | Claims officer | Step 3: search ICD-10; add at least one diagnosis; change primary if UI permits. | At least one diagnosis required. Primary diagnosis displayed on claim. |
| ACL-07 | Claims officer | Step 4: add service lines using CPT search; edit quantity/unit; confirm summary total. | Summary total equals manual control sheet. |
| ACL-08 | Claims officer | Submit. | Claim number created; status RECEIVED/CAPTURED/UNDER_REVIEW as designed; source visible if shown. |

## 8. Outpatient Daily Variants

| ID | Scenario | UI path | Expected result |
|---|---|---|---|
| OP-1 | Clean consultation | Provider claim: consultation only, in-contract, low value. | Auto-approve or manual approve cleanly; no fraud; settlement eligible after approval. |
| OP-2 | Consultation + lab + pharmacy | Provider claim with 3 lines. | Claim detail groups lines by category; total and contract ceiling correct. |
| OP-3 | Imaging/procedure | Provider claim with imaging/procedure line above routine value. | Routes for medical review, preauth, or ceiling control as configured; no silent overpayment. |
| OP-4 | Dental or optical | Provider or admin claim using DENTAL/OPTICAL benefit. | Accepted only if package has benefit; otherwise blocked without side effects. |
| OP-5 | Chronic/mental/wellness | Claim using CHRONIC_DISEASE, MENTAL_HEALTH, or WELLNESS_PREVENTIVE. | Correct benefit bucket and privacy/reporting behavior. |
| OP-6 | Partial approval | Claim includes one allowed and one excluded/over-ceiling line. | PARTIALLY_APPROVED; settlement only includes approved payer share. |
| OP-7 | Full decline | Claim for excluded/not-covered scenario. | DECLINED with reason; no usage, fund, settlement, GL payable, or paid notification. |
| OP-8 | Duplicate | Same provider/member/date/service/invoice if invoice field exists, or double-submit UI. | Duplicate blocked/routed; no duplicate payment path. |
| OP-9 | Reimbursement/manual path if UI exposed | Use `/claims/new` reimbursement option if present. | Member-paid reimbursement does not appear in provider settlement unless designed. |
| OP-10 | Ineligible member | Suspended/lapsed/terminated member. | No claim created or claim cannot be approved; no money side effect. |

## 9. Preauthorization, Pharmacy, Imaging, and Procedure Controls

| ID | Actor | UI steps | Expected result |
|---|---|---|---|
| PA-01 | Member | `/member/preauth/new`; submit planned procedure if member UI supports it. | Request appears in member and staff preauth list with correct status. |
| PA-02 | Claims/medical | `/preauth/new`; select member, provider, service type, benefit, expected DOS, estimated cost, diagnosis, planned procedure, notes; submit. | PA number created. Fraud/risk warnings are visible if triggered. |
| PA-03 | Medical reviewer | `/preauth/[id]`; approve within amount. | PA APPROVED; GOP/hold/approved amount visible where supported. |
| PA-04 | Medical reviewer | Decline a second PA with reason. | PA DECLINED; no hold; reason visible to permitted actors. |
| PA-05 | Claims/provider | Submit claim requiring preauth without approved PA. | Intake or adjudication blocks/routs with missing-preauth reason. |
| PA-06 | Claims/provider | Attach approved PA to claim/case where UI allows. | Wrong member/provider/status/expired PA cannot attach. Correct PA attaches and is consumed only by approved payer share. |
| PA-07 | Claims | Approve above remaining PA/LOU cover. | Blocked unless explicit authorised override/amendment exists. |
| PA-08 | Member/provider | Inspect member notifications/provider visibility. | PA status changes visible once, no duplicate or premature paid messages. |

Pharmacy and imaging bug hunt:

- Excluded drug must not be paid to provider.
- Quantity-limited drug/procedure must cap or route excess.
- Imaging requiring referral/preauth must not auto-pay without it.
- Non-covered pharmacy/imaging line must be rejected/shortfalled, not hidden inside approved amount.

## 10. Inpatient Opening, Daily Updates, Closure, and Claim

Use `/cases/new` and `/cases/[id]` for real inpatient operational day testing. This covers hospital entries and updates between admission and discharge.

| Step | Actor | UI action | Expected result |
|---|---|---|---|
| IPD-01 | Claims/medical | Open `/cases/new`. | Open a Case form appears. |
| IPD-02 | Claims/medical | Enter member number; select Facility A; set Case type `INPATIENT_ADMISSION`; benefit `INPATIENT`. | Active member and operational provider accepted. |
| IPD-03 | Claims/medical | Enter admission date, expected discharge, attending doctor, estimated cost; click `Open case`. | Case number created with status OPEN; accrued amount starts at 0. |
| IPD-04 | Claims/medical | On case detail, issue LOU with amount ceiling and validity days. | LOU number appears; ceiling visible. |
| IPD-05 | Claims/medical | Attach approved PA if candidate appears. | Only same member/provider approved unattached PA is selectable. |
| IPD-06 | Hospital/claims | Add day 1 service: date, category, description "Admission fee", code, quantity, unit amount. | Entry appears; accrued amount increases by quantity x unit. |
| IPD-07 | Hospital/claims | Add ward day, doctor rounds, lab, imaging, pharmacy, procedure/ICU transfer entries across several dates. | All entries listed with date/category/source; accrued total equals non-void entries. |
| IPD-08 | Claims/medical | Void one mistaken service entry. | Voided row remains visible but struck/excluded; accrued total reduces; audit-friendly behavior. |
| IPD-09 | Claims/medical | Attempt future service entry or invalid date after discharge if discharge is known. | Blocked/routed; no side effect. |
| IPD-10 | Claims/medical | Click `Close & file claim`. | Exactly one claim is created; case becomes CLOSED_FILED/read-only; claim lines equal non-void services. |
| IPD-11 | Claims/medical | Try adding another service or closing again after closure. | Mutations blocked/hidden; no duplicate claim. |
| IPD-12 | Claims officer | Open filed claim from case banner. | Claim shows inpatient service, provider, member, billed amount, PA/LOU panel, lines, contract panel. |
| IPD-13 | Claims officer | Adjudicate full/partial. | Approved payer share respects contract, benefit, PA, LOU, member share, and fraud gate. |

Inpatient computation:

`case accrued = sum(non-void service entry quantity x unit amount)`  
`claim billed = case accrued at closure`  
`LOS = discharge date - admission date per product rule; must not be negative`  
`approved payer share <= contract ceiling, benefit remaining, PA amount, and LOU ceiling unless authorised override/amendment exists`  
`settlement payable = approved payer share only`

Critical inpatient bugs:

- Case closes twice or files two claims.
- Closed case remains editable and changes claim money.
- Voided service remains payable.
- Discharge before admission creates payable money.
- LOU/PA/benefit ceiling exceeded without authorised approval.
- Ward and ICU days overlap and both pay without a rule.

## 11. Claims Staff Adjudication Script

Run for every outpatient and inpatient claim created above.

| Step | Actor | UI action | Expected result |
|---|---|---|---|
| ADJ-01 | Claims officer | `/claims`; filter/search by claim number, provider, member, status. | Claim is findable; unrelated provider/member data not exposed to wrong roles. |
| ADJ-02 | Claims officer | Open claim detail. | Header status, member, provider, billed/approved/copay, diagnoses, preauth panel, contract panel, service lines all match intake. |
| ADJ-03 | Claims officer | Inspect contract/tariff variance and digital contract panel. | Contract number, pricing caveats, ceiling, and variance are coherent. |
| ADJ-04 | Claims officer | If claim is RECEIVED/INCURRED, click capture/mark captured if shown. | Status changes once; duplicate capture blocked. |
| ADJ-05 | Claims officer | Decide each line if line-level decision controls are shown. | All lines must be decided before compute outcome. |
| ADJ-06 | Claims officer | Compute outcome. | Engine payable/shortfall/reason codes appear before final submission. |
| ADJ-07 | Claims officer | Submit APPROVED within ceiling. | Claim APPROVED; approved amount, usage, notifications, GL/fund pending effects appear. |
| ADJ-08 | Claims officer | Submit PARTIAL with reason. | Only approved amount flows to usage and settlement. Rejected amount visible as shortfall/exclusion. |
| ADJ-09 | Claims officer | Submit DECLINED with reason. | No payable side effect; member/provider see permitted reason. |
| ADJ-10 | Claims officer | Try approve above contract/PA/LOU/benefit ceiling. | Blocked or routed for override before any side effect. |
| ADJ-11 | Claims officer | Try re-decide terminal claim. | Blocked; no duplicate usage, GL, fund, notification. |
| ADJ-12 | Claims officer | If fraud flag exists, try approval before fraud clearance. | Behavior follows claim-control setting; if gate is ON, approval blocked before side effects. |
| ADJ-13 | Medical/fraud reviewer | Resolve fraud alert or approve required approval request. | Audit trail visible; final approval only after distinct authorised action. |
| ADJ-14 | Claims officer | Void approved not-settled claim if UI supports it. | Usage, fund, GL payable reversed; claim unavailable for settlement. Settled claim cannot be voided casually. |

## 12. Finance Settlement, Voucher, GL, and Provider Statement

Run after at least two approved claims exist for Facility A and one approved claim exists for Facility B.

| Step | Actor | UI action | Expected result |
|---|---|---|---|
| FIN-01 | Finance maker | `/settlement`; create batch for Facility A and test period. | Batch includes approved/partial unsettled claims only; excludes declined, blocked, void, reimbursement where not payable to provider, and Provider B claims. |
| FIN-02 | Finance maker | Compare batch claim count/total to control sheet. | Batch total = sum approved payer share for included claims. |
| FIN-03 | Finance maker | Attempt to approve own batch. | Blocked with friendly maker/checker message. |
| FIN-04 | Finance checker | Login separately; open batch; approve. | Status moves to approved/checker-approved. |
| FIN-05 | Finance checker | Click Mark Paid/Settle. | Batch SETTLED; voucher created; all included claims become PAID with paid amount = approved amount. |
| FIN-06 | Finance checker | Try Mark Paid again. | Blocked; no duplicate voucher, no duplicate journal. |
| FIN-07 | Finance | `/billing/gl`; inspect trial balance. | Trial balance balanced. Approval and settlement journals reconcile. |
| FIN-08 | Finance | `/billing/gl/ledger`; inspect claims payable and cash/bank ledgers. | Approval posts payable; settlement clears payable/cash exactly once. |
| FIN-09 | Provider A | `/provider/settlements`; open statement/remittance. | Provider sees own settled batch only; total equals voucher. |
| FIN-10 | Provider B | Attempt Facility A batch/claim URL. | Access denied/not found. |
| FIN-11 | Reports viewer | `/reports`; export claims/provider statements/utilisation/GL for date range. | CSV/PDF totals tie to claim, settlement, voucher, GL, and provider portal. |

Finance equations:

`approved payer share total = settlement batch total = voucher total = provider statement paid total`  
`approval GL debit/credit are balanced`  
`settlement GL clears claims payable exactly once`  
`fund drawdown, if self-funded, equals approved payer base amount`

## 13. HR, Fund, Member, Provider, Reports, and Privacy Checks

| ID | Actor | UI action | Expected result |
|---|---|---|---|
| VIS-01 | Member principal | `/member/utilization`, `/member/notifications`, `/member/preauth`, claim drill-down. | Own/family permitted claims visible; lifecycle notifications for intake/decision/payment appear once. |
| VIS-02 | Member principal | Try another member claim/utilisation URL. | Access denied/not found; no data leakage. |
| VIS-03 | HR manager | `/hr/dashboard`, `/hr/roster`, `/hr/utilization`, `/hr/support`. | Only assigned group aggregate/member data visible; cannot mutate claims/settlement/settings. |
| VIS-04 | HR manager | Try another group/member/admin route. | Access denied/not found. |
| VIS-05 | Fund admin | `/fund/dashboard`, fund group detail, claims, statement. | Own self-funded balance and claim drawdowns only; drawdown equals approved payer share. |
| VIS-06 | Fund admin | Try unrelated fund/group. | Access denied/not found. |
| VIS-07 | Reports viewer | `/reports`, analytics pages if visible. | Exports allowed; claim/settlement/settings mutation blocked. |
| VIS-08 | Provider A | `/provider/claims`, `/provider/settlements`, `/provider/api-keys`. | Own facility only. No Provider B data, no other tenants/members. |
| VIS-09 | Claims/medical/finance | Attempt out-of-role routes. | Branded access denied, not a crash or data leak. |

Privacy bug hunt:

- HR should not see sensitive diagnosis detail beyond product-approved level.
- Provider should not see other facility admissions, claims, settlements, API keys, or statements.
- Member should not see another member by changing URL.
- Reports viewer should not mutate operational records.
- Error pages should not reveal stack traces, Prisma messages, secrets, SQL, internal IDs beyond what product accepts.

## 14. Routine Operational Workload

Run these during the same day so claims are not tested in isolation.

| ID | Actor | UI path | Expected result |
|---|---|---|---|
| OPS-01 | HR or member | `/service-requests` or `/member/support` | Create support/service request; status visible to ops; no claim money side effect. |
| OPS-02 | Claims/customer service | `/complaints` | Open complaint linked to provider/member if UI allows; investigate/resolve. |
| OPS-03 | Claims/medical | `/fraud` | Open fraud desk; dismiss/resolve one relevant alert with reason using correct role. |
| OPS-04 | Claims/medical | `/overrides` | Request approved override for over-ceiling claim, then use it once. |
| OPS-05 | Admin | `/settings/audit-log` | Verify mutations from setup, claim, case, settlement, fraud, override, and user invite are auditable. |
| OPS-06 | Admin/finance | `/billing/reconciliation` if configured | Import/upload via UI only; confirm no effect on claim settlement unless matched through workflow. |
| OPS-07 | Claims | `/claims/queues`, `/assessor-queue`, `/approvals` | SLA lanes and approval queues update as claims move through the day. |

## 15. Negative Side-Effect Checklist

For every blocked, declined, duplicate, fraud-gated, over-ceiling, expired, wrong-provider, wrong-member, wrong-branch, future-date, or invalid-date scenario, verify through UI only:

| Area | Expected |
|---|---|
| Claim list/detail | No approved/partial/paid status unless explicitly expected. |
| Service/case | No duplicate case claim; no payable voided service; closed case read-only. |
| Preauth/LOU | No hold/consumption unless PA/LOU approval and claim approval require it. |
| Member utilisation | No increment for blocked, declined, rejected, excess, or member-liability amount. |
| Fund | No drawdown for blocked/declined/rejected amount. |
| Settlement | Claim not selectable for settlement unless approved/partial and unsettled. |
| Voucher | No voucher for blocked/duplicate payment attempt. |
| GL | No unbalanced or duplicate journal; no raw mixed-currency summing. |
| Reports/export | Totals match expected eligible outcomes only. |
| Notifications | No premature "approved" or "paid" notification. |
| Audit | Blocked attempt or decision reason is visible through audit/log UI where exposed. |

## 16. Daily Control Sheet Columns

Maintain one row per claim/case/PA/settlement. These values must be manually computed and then matched to UI totals.

| Field | Meaning |
|---|---|
| Scenario ID | OP-1, OP-2, IP-1, PA-1, etc. |
| Actor and route | Who performed the action and which Vercel page. |
| Member/group/package | Member number, group, package, self-funded flag. |
| Provider/branch | Facility and branch, if selected. |
| Date(s) | DOS, admission, discharge, expected discharge, settlement cycle. |
| Lines/entries | Category, description, CPT/code, quantity, unit, line total. |
| Billed total | Sum of all active lines or case entries. |
| Expected ceiling | Contract/package/tariff/benefit/PA/LOU limit. |
| Member share | Copay, deductible, coinsurance, excess, excluded lines. |
| Expected approved payer share | Amount that should affect usage, fund, settlement, GL. |
| Actual approved | UI approved amount. |
| Actual paid | Settlement/voucher/provider statement amount. |
| Difference | Actual minus expected. Any unexplained difference is a defect candidate. |
| Evidence | Screenshot/export IDs. |
| Defect | Defect ID, severity, status. |

## 17. Exit Criteria

The busy-day UAT passes only when all of the following are true:

1. A clean outpatient claim runs from eligibility/check-in to provider claim to adjudication to settlement to provider statement, member utilisation/notifications, reports, and balanced GL.
2. A multi-line outpatient claim with consultation, lab, pharmacy, and imaging/procedure reconciles at every screen and export.
3. At least one partial approval proves rejected/excluded/member-share amounts do not settle or draw down funds.
4. At least one full decline proves no payable side effects.
5. At least one inpatient case opens, accrues hospital entries, issues/attaches PA or LOU where applicable, closes into exactly one claim, adjudicates, settles, and reconciles.
6. Finance maker/checker segregation is enforced, duplicate settlement/payment is blocked, voucher and GL tie out.
7. Provider, member, HR, fund, reports, claims, medical, and finance role boundaries are hard-scoped by UI and direct URL.
8. All setup and execution happened through Vercel UI. Any scenario requiring DB/API/manual mutation is marked `BLOCKED - UI GAP`, not passed.
9. No Critical or High defect remains open.
10. All Medium observations have owner, target date, and business acceptance before go-live.

## 18. Execution Log Template

| Scenario | Actor | Route | UI steps completed | IDs created | Expected amount | Actual amount | Result | Evidence | Defect |
|---|---|---|---|---|---:|---:|---|---|---|
| OP-1 | Provider A -> Claims -> Finance | `/provider/claims/new`, `/claims/[id]`, `/settlement` |  |  |  |  |  |  |  |

