# Outpatient Journey E2E UAT Test Document

**Created:** 2026-07-07  
**Target environment:** Vercel UAT / production-like outpatient deployment  
**Primary objective:** Prove the complete outpatient journey across every scenario family currently supported by the code: eligibility, secure check-in, provider intake, alternate intake rails, adjudication, auto-routing, pre-auth attachment, fraud and approval controls, settlement, GL, member/provider/HR/fund/report visibility, notifications, offline sync, API intake, and negative controls.

## 1. Scope and Code Basis

This test document is based on the current implementation paths below. If any route is hidden by role configuration, record the scenario as `BLOCKED - ACCESS/CONFIG`, not as pass.

| Area | Supported by | What must be proven |
|---|---|---|
| Provider eligibility | `/provider/eligibility` | Member/card lookup, active/inactive eligibility, family context, limits and remaining balance, provider-scoped claim start. |
| Provider outpatient claim form | `/provider/claims/new` and `runClaimIntake` | Service type, benefit category, diagnosis, multi-line claim submission, provider forced to logged-in facility, validation failures. |
| Shared claim intake gates | `src/server/services/claim-intake.ts` | Future date block, member/group status block, provider status block, branch validation, benefit-in-package block, pre-auth-required block, fraud scan, auto-adjudication. |
| Claim decision | `ClaimDecisionService.decide` | Approve, partial approve, decline, ceiling enforcement, PA cover confirmation, benefit usage, cost share, GL, self-funded drawdown, notifications, audit. |
| Auto-adjudication | `AutoAdjudicationService.processIntake` | Clean auto-approval, routed claims with named failing gate, excluded-drug partial path, reimbursement/manual-review routing. |
| Fraud approval gate | `ClaimControlService.enforceFraudGate` | Tenant-controlled block or fraud-clearance approval before payable finalisation. |
| Pre-authorisation | `/preauth`, `/preauth/new`, member preauth routes, `preauthAdjudicationService` | PA request, auto decision/manual review, GOP/hold creation, attach to claim, partial PA consumption, PA over-cover confirmation, detach/decline reuse. |
| Settlement | `/settlement`, `/settlement/[id]`, `claim-adjudication.service.ts` | Maker/checker, single-currency batch, Mark Paid, voucher, claim PAID, GL balanced, duplicate settlement block. |
| Secure check-in | `/check-ins`, `/member/check-in` and secure check-in service | In-app challenge, visit code, expiry, failed attempts, knowledge fallback, emergency override, audit events. |
| Offline sync | `/offline-capture`, `/offline-auth`, `/api/v1/sync` | Work-code validation, idempotent sync, conflict handling, no duplicate claim creation. |
| Facility API intake | `/api/v1/claims`, `/api/v1/eligibility`, `/api/v1/hms-batch` | API-key attribution, facility scoping, eligibility rejection, claim creation, HMS duplicate/unmatched handling. |
| Portals and reporting | Member, provider, HR, fund, reports, GL | Status, utilisation, paid amounts, notifications, reports/export tie-out, route scoping. |

## 2. UAT Rules

- Run functional UAT through the front end unless the scenario explicitly covers provider API, HMS batch, or offline sync.
- Each actor must log in as themselves: provider, member, claims officer, medical/fraud reviewer, finance maker, finance checker, HR, fund admin, reports viewer, and admin.
- Do not use direct database edits to create claim, decision, settlement, notification, GL, or benefit usage outcomes.
- Capture evidence for every material step: screenshot, claim number, PA number, visit verification ID, settlement batch ID, voucher number, GL journal, report export, notification, and any friendly error message.
- Confirm negative cases leave no financial side effects: no approved amount, no benefit usage, no settlement eligibility, no GL journal, no member paid notification unless the expected outcome says otherwise.

## 3. Test Data Requirements

| Data set | Minimum requirement |
|---|---|
| Active principal | Active member in an active group with an outpatient benefit. |
| Active dependant | Dependant tied to the principal, same group/package unless testing dependant-specific rules. |
| Ineligible members | At least one suspended/lapsed/terminated member or group. |
| Providers | Two active contracted outpatient providers; one inactive/suspended/expired provider for negative tests. |
| Provider branch | A multi-branch provider with one active and one inactive branch if branch capture is enabled. |
| Benefits | OUTPATIENT plus at least two outpatient-adjacent categories: DENTAL, OPTICAL, CHRONIC_DISEASE, MENTAL_HEALTH, WELLNESS_PREVENTIVE, or CUSTOM. |
| Tariffs/contracts | Contracted rate for a clean consultation, one over-ceiling line, one quantity-limited line, one service requiring pre-auth if available, one excluded service/drug if configured. |
| Financial setup | Approval matrix, GL accounts, settlement bank/cash account, self-funded account where applicable. |
| Currency setup | UGX base. If KES/non-base contracts are enabled, have a current FX rate and one test with the rate intentionally missing. |
| Security setup | Member portal login, secure check-in device/notification path, fallback questions, offline work code for one provider. |

## 4. End-to-End Happy Path Spine

| ID | Actor | Route | Action | Expected result | Evidence |
|---|---|---|---|---|---|
| OP-00.1 | Admin | `/settings`, `/providers`, `/members`, `/packages` | Confirm all personas, member, provider, package, benefit, tariff, GL, and report access exist. | All preconditions active and scoped. | Setup screenshots |
| OP-00.2 | Member | `/member/dashboard` | Log in as principal and capture baseline benefits, utilisation, notifications, and documents. | Member sees only own/family data allowed by privacy rules. | Baseline screenshots |
| OP-00.3 | Provider | `/provider/eligibility` | Search active principal by member/card number. | Member is found and marked eligible. Remaining limit is visible. | Eligibility screenshot |
| OP-00.4 | Provider + Member | `/check-ins` and `/member/check-in` | Start secure check-in; member approves; provider confirms visit code. | Visit verification opens and audit event records success. | Visit ID/screenshots |
| OP-00.5 | Provider | `/provider/claims/new` | File OUTPATIENT claim with consultation, lab, and pharmacy lines. | Claim submits under logged-in provider only; status RECEIVED unless auto-approved. | Claim number |
| OP-00.6 | Claims officer | `/claims` | Open claim, review eligibility, fraud, duplicate, contract, and tariff panels. | Data matches provider submission; no unexpected warnings. | Claim detail screenshot |
| OP-00.7 | Claims officer | Claim detail | Compute/submit APPROVED within contract ceiling. | Claim becomes APPROVED or auto-approved; benefit usage, GL, audit, and member decision notification are created. | Decision + GL |
| OP-00.8 | Finance maker | `/settlement` | Create provider settlement batch for the provider/cycle. | Batch created as MAKER_SUBMITTED with correct claim count and single currency. | Batch ID |
| OP-00.9 | Finance maker | `/settlement` | Try to approve own batch. | Blocked: maker and checker must differ. | Error screenshot |
| OP-00.10 | Finance checker | `/settlement` | Approve batch, then Mark Paid. | Batch SETTLED, voucher created, claim PAID, paid amount = approved amount, GL balanced. | Voucher + GL |
| OP-00.11 | Provider | `/provider/claims`, `/provider/settlements` | Confirm claim and settlement visibility. | Provider sees own paid claim/batch only. | Provider screenshots |
| OP-00.12 | Member | `/member/utilization`, `/member/notifications` | Confirm utilisation and notifications. | Claim lifecycle visible; notifications include visit recorded, decision, and paid where configured. | Member screenshots |
| OP-00.13 | HR / Fund / Reports | HR, fund, reports, GL pages | Confirm scoped utilisation, self-funded balance impact, reports/export tie-out. | Totals reconcile to approved payer share and settlement; GL remains balanced. | Export + screenshots |

## 5. Scenario Catalogue

### A. Eligibility and Provider Scope

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-A01 | Active principal eligible | Provider searches active principal by member number. | Eligible status, group/package, limit, used, remaining; File claim link appears. |
| OP-A02 | Active dependant eligible | Provider searches dependant. | Dependant found; principal/family context visible where supported; claim can be filed for dependant. |
| OP-A03 | Unknown member | Search fake member/card number. | Friendly no-member message; no claim start. |
| OP-A04 | Suspended/lapsed/terminated member | Search or attempt claim for blocked member. | Eligibility shows not eligible or intake blocks; no claim created. |
| OP-A05 | Suspended/lapsed/terminated group | Attempt claim for member under blocked group. | Intake blocks with group-status message; no claim created. |
| OP-A06 | Provider hard scope | Provider A submits/searches own data, then tries Provider B claim URL. | Provider A cannot see Provider B claim or settlement data. |
| OP-A07 | Inactive provider | Attempt claim/API intake for suspended/expired/pending provider. | Intake blocks; no claim, no financial side effects. |
| OP-A08 | Branch validation | Submit with active branch, inactive branch, and branch from another provider if UI/API allows. | Active branch allowed; inactive/wrong-provider branch blocked. |

### B. Secure Check-In and Visit Verification

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-B01 | In-app confirmation success | Provider initiates challenge; member confirms; provider enters visit code. | VisitVerification created; challenge CODE_CONFIRMED; audit SUCCESS. |
| OP-B02 | Challenge reuse | Start a second challenge while one is pending. | Existing challenge is reused or duplicate blocked. |
| OP-B03 | Expired challenge | Let challenge expire, then try member/provider action. | Expired message; restart required; notification expires. |
| OP-B04 | Wrong visit code | Enter wrong code three times. | First attempts fail cleanly; third marks challenge FAILED; no visit opens. |
| OP-B05 | Cancel and restart | Provider cancels pending challenge, then restarts. | Old challenge CANCELLED; new challenge created; audit records cancellation. |
| OP-B06 | Knowledge fallback success | Complete fallback questions, with photo URL if supported. | VisitVerification created with PHOTO_KNOWLEDGE flow and reviewRequired. |
| OP-B07 | Knowledge fallback failure | Submit incorrect fallback answers. | Friendly failure; no visit opens; emergency override remains separate. |
| OP-B08 | Emergency override | Provider records emergency override with a detailed reason. | Visit opens with EMERGENCY_OVERRIDE flow, reviewRequired, reason in audit. |
| OP-B09 | Override reason too short | Submit override reason under 10 characters. | Blocked with validation; no visit opens. |

### C. Provider Claim Intake Variants

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-C01 | Clean outpatient claim | OUTPATIENT benefit, valid diagnosis, consultation line. | Claim RECEIVED or auto-approved; member visit notification created. |
| OP-C02 | Multi-line claim | Consultation + lab + pharmacy + imaging/procedure. | Line totals sum to billed amount; all lines visible to TPA. |
| OP-C03 | Dental/optical/chronic/mental/wellness outpatient-adjacent benefit | Submit a claim for each configured category. | Configured benefits accepted; unconfigured categories blocked by benefit-in-package gate. |
| OP-C04 | Missing member number | Submit blank member. | Friendly validation: enter member/card number. |
| OP-C05 | Missing diagnosis | Submit without primary diagnosis. | Friendly validation; no claim. |
| OP-C06 | No positive service line | Submit empty or zero-value lines. | Friendly validation; no claim. |
| OP-C07 | Quantity and total calculation | Submit quantity > 1. | Billed line = quantity x unit cost; total reconciles. |
| OP-C08 | Future date of service | Attempt tomorrow or later. | UI/server blocks future date; no claim. |
| OP-C09 | Double-click submit/retry | Double-submit same form or browser retry. | No duplicate claim for same action; if duplicate is possible, log Critical defect. |
| OP-C10 | Provider cannot spoof facility | Try to file claim against another provider if any hidden field/API allows. | Logged-in provider is forced server-side; spoof blocked. |

### D. Alternate Intake Rails

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-D01 | Provider API claim | Submit `/api/v1/claims` with provider API key and active member. | 201 success, claim number returned, source SMART, same fraud/auto pipeline runs. |
| OP-D02 | API key facility scoping | Use provider key with another facility code/member tenant. | Provider key cannot spoof another provider; cross-tenant mismatch blocked. |
| OP-D03 | API missing fields/future DOS | Omit required fields or use future date. | 400/422 friendly JSON; no claim. |
| OP-D04 | API ineligible member/provider | Use blocked member/group/provider. | 403/404 response; no claim. |
| OP-D05 | API claim status lookup | Query claim by number. | Returns status, billed/approved/copay, member/provider, date. |
| OP-D06 | Offline claim sync success | Capture offline claim under valid work code and reconnect. | SyncOperation SYNCED; claim source OFFLINE_SYNC; no duplicate on retry. |
| OP-D07 | Offline missing/expired/exhausted work code | Sync without valid offline auth. | Operation CONFLICT with reason; visible in exception register; no silent loss. |
| OP-D08 | Offline stale eligibility/balance conflict | Member becomes inactive or balance insufficient before sync. | CONFLICT with reason; no claim approval/payment. |
| OP-D09 | HMS batch apply | Push valid HMS batch against open case/member where supported. | Service entries applied; duplicates skipped idempotently. |
| OP-D10 | HMS unmatched line | Push line with unknown/ambiguous case/member. | ExceptionLog `HMS_BATCH_UNMATCHED`; batch continues for valid lines. |

### E. Auto-Adjudication and Manual Routing

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-E01 | Clean deterministic auto-approve | Submit low-value claim passing hard gates, no fraud, within auto policy, contract-priced. | Auto decision AUTO_APPROVE; claim APPROVED/PARTIALLY_APPROVED through canonical decision stack; GL/usage/notification created. |
| OP-E02 | Auto disabled | Disable policy for client/operator, then submit clean claim. | Claim ROUTE with `AUTO_ADJ_DISABLED`; status remains reviewable. |
| OP-E03 | Duplicate invoice/double capture | Submit duplicate provider invoice or same provider/member/date/category. | ROUTE with named hard gate; no auto approval. |
| OP-E04 | Open fraud alert | Submit claim that creates unresolved fraud alert. | ROUTE with `FRAUD_FLAG`; manual claim cannot approve if fraud gate setting requires clearance. |
| OP-E05 | No contract/tariff price | Submit unpriced service. | ROUTE with `NO_ENFORCEABLE_PRICE`, `PRICING_COMPLETE`, or equivalent named gate. |
| OP-E06 | Engine decline/exclusion | Submit all-excluded or contract-declined lines. | ROUTE for human confirmation; fully excluded claim not silently paid. |
| OP-E07 | Above auto ceiling | Submit payable above auto policy ceiling. | ROUTE with `ABOVE_CEILING`; no auto approval. |
| OP-E08 | Missing FX for non-base auto comparison | Submit non-base claim with no FX rate. | ROUTE with `FX_RATE_MISSING`; no raw cross-currency approval. |
| OP-E09 | Reimbursement route | Submit reimbursement claim where available. | ROUTE with reimbursement manual-review reason. |
| OP-E10 | Pipeline failure fails safe | Force recoverable pipeline error in test environment if feasible. | Claim remains available for manual review with `PIPELINE_ERROR`; no lost claim. |

### F. Manual Adjudication Outcomes

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-F01 | Full approval at or below ceiling | Approve amount within deterministic ceiling. | Claim APPROVED; line/tariff stamps, usage, GL, fund, notification, audit created. |
| OP-F02 | Partial approval | Approve below billed amount with reason/notes. | Claim PARTIALLY_APPROVED; approved amount only goes to usage, settlement, GL, fund; rejected/shortfall excluded. |
| OP-F03 | Full decline | Decline with reason code and notes. | Claim DECLINED; no payable/settlement/GL cash movement; member/provider see decline reason as allowed. |
| OP-F04 | Zero approved amount | Try approve/partial with 0. | Blocked: approved amount must be greater than zero. |
| OP-F05 | Decision from terminal status | Try to decide APPROVED/PAID/DECLINED/VOID claim again. | Blocked by status-transition guard; no duplicate side effects. |
| OP-F06 | Over contract ceiling | Approve above ceiling without override. | Blocked with contract enforcement message; no usage/GL/fund side effects. |
| OP-F07 | Pay-above-contract override | Raise and approve PAY_ABOVE_CONTRACT_RATE override, then approve above ceiling. | Approval allowed only after senior override; audit notes ceiling override. |
| OP-F08 | Quantity limit exceeded | Submit/approve quantity above contract max. | Decision blocked or routed with quantity-limit message. |
| OP-F09 | Practitioner credential gate | Use expired/uncredentialed attending clinician where provider registry supports it. | Approval blocked until credential is renewed or clinician corrected. |
| OP-F10 | Benefit not in package at decision | Change/submit benefit not configured for member. | Approval blocked; decline remains possible. |
| OP-F11 | Approval matrix role gate | Lower-authority user approves amount requiring higher role. | Routed/blocked; approval request created where configured. |
| OP-F12 | Matrix multi-level approval | Complete required approval chain. | Final level applies stored decision automatically once approved; no resubmission duplicate. |
| OP-F13 | Matrix same-user segregation | Same maker tries final checker role where SoD applies. | Blocked. |
| OP-F14 | Cost share | Claim with deductible/co-insurance/copay configured. | Member liability, deductible met, co-insurance, plan pays, and GL co-contribution split reconcile. |
| OP-F15 | Self-funded drawdown | Approve claim for self-funded group. | Fund balance reduces by base approved payer share; fund transaction created. |
| OP-F16 | Void approved not-settled claim | Void approved claim with reason before settlement. | Status VOID; usage, GL, and fund drawdown reverse; cannot void settled/queued claim. |

### G. Fraud Gate and Fraud Review

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-G01 | Fraud gate OFF | Submit fraud-flagged claim with tenant gate disabled. | Current policy behavior allowed; alert remains visible/audited. |
| OP-G02 | Fraud gate ON, clear-alert mode | Try approve claim with unresolved alert at/above threshold. | Approval blocked before GL/usage/fund/notification; settlement cannot pick it up. |
| OP-G03 | Clear fraud alert | Fraud/medical reviewer resolves alert with reason, then claim is approved. | Approval succeeds after clearance; audit shows blocked attempt and clearance. |
| OP-G04 | Dual approval mode | Gate mode permits clear alert or dual approval; claims officer attempts approval. | Fraud-clearance approval request opens; final approval proceeds only after approval request is approved. |
| OP-G05 | Decline fraud-flagged claim | Decline claim with unresolved fraud alert. | Decline is allowed; no payable side effects. |
| OP-G06 | Provider/member access to fraud routes | Provider/member attempts direct fraud clearance URL. | Access denied/no data leak. |

### H. Pre-Auth and Hold Scenarios

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-H01 | Outpatient PA request | Member/admin/provider creates OUTPATIENT PA if exposed by UI. | PA SUBMITTED, auto decision or UNDER_REVIEW with SLA. |
| OP-H02 | PA auto-approve | Low-value, covered, active member/provider, no exclusions/fraud. | PA APPROVED; GOP number issued; benefit hold created with validity window. |
| OP-H03 | PA auto-decline | Excluded diagnosis, waiting period, inactive member/provider. | PA DECLINED with gate reason; no hold. |
| OP-H04 | PA route to human | Above ceiling, never-auto procedure, provider eligibility uncertain, fraud alert. | PA UNDER_REVIEW with gate log and SLA. |
| OP-H05 | Human approve PA | Medical reviewer approves PA with approved amount. | PA APPROVED; hold active; GOP/validity visible. |
| OP-H06 | Human decline PA | Medical reviewer declines with reason. | PA DECLINED; no active hold. |
| OP-H07 | Claim requires PA | Submit benefit configured as PA-required without approved PA. | Intake blocks with approved-PA-required message. |
| OP-H08 | Attach approved PA to claim | Submit claim at same member/provider/benefit with approved PA. | PA becomes ATTACHED; claim proceeds. |
| OP-H09 | PA wrong member/provider/status/expired | Try attach PA from another member/provider, non-approved, used, or expired. | Attach blocked; no claim side effect. |
| OP-H10 | PA cover exact/full consumption | Approve claim equal to remaining PA cover. | Hold CONVERTED; PA UTILISED; usage reflects approved amount. |
| OP-H11 | PA partial consumption | Approve less than PA cover. | Hold reduces; PA returns to APPROVED with utilisedAmount advanced and remaining cover available. |
| OP-H12 | PA over-cover without confirmation | Approve above remaining PA cover. | Blocked until explicit over-cover confirmation note is supplied. |
| OP-H13 | Declined PA-attached claim | Decline claim attached to PA. | PA detaches/back to APPROVED; hold remains available for resubmission. |

### I. Currency, FX, and Settlement Currency

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-I01 | UGX base claim | File, approve, settle UGX claim. | Claim, settlement, voucher, GL, reports use UGX/base amounts consistently. |
| OP-I02 | Non-base claim with FX rate | File claim under non-base provider/client currency with current rate. | Approval snapshots approvedBaseAmount, billedBaseAmount, fxRateToBase, fxRateDate; GL posts base UGX. |
| OP-I03 | Non-base claim missing FX | Remove/expire rate in UAT settings, then approve. | Approval fails closed before usage/GL/fund/notification. |
| OP-I04 | Mixed-currency settlement candidate | Same provider has unsettled approved UGX and KES claims in same cycle. | Batch creation blocks mixed-currency raw summing or requires separate single-currency batches. |
| OP-I05 | Legacy mixed batch pay attempt | If a mixed legacy batch exists, try Mark Paid. | Mark Paid blocks mixed currencies; no voucher/GL/PAID update. |
| OP-I06 | Currency label sweep | Inspect eligibility, claim form, claim detail, settlement, GL, provider/member/fund portals, CSV/PDF. | No incorrect hardcoded currency labels for the tenant/currency under test. |

### J. Settlement, Voucher, GL, and Reporting

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-J01 | Batch creation with approved claims | Finance maker creates batch for provider/cycle. | Picks all unsettled approved/partial claims up to cycle end; excludes declined/reimbursement/unapproved. |
| OP-J02 | No eligible claims | Create batch where no unsettled approved claims exist. | Friendly no-claims message; no empty batch. |
| OP-J03 | Duplicate batch | Create same provider/cycle batch twice. | Conflict blocked. |
| OP-J04 | Maker/checker | Maker tries own approval; separate checker approves. | Self-approval blocked; separate checker moves batch to CHECKER_APPROVED. |
| OP-J05 | Mark Paid | Checker marks approved batch paid. | Batch SETTLED, voucher PROCESSED, claims PAID, paidAt set, paidAmount=approvedAmount. |
| OP-J06 | Duplicate Mark Paid | Try Mark Paid again on SETTLED batch. | Blocked; no duplicate voucher or cash GL. |
| OP-J07 | GL posting | Review journal. | Dr Claims Payable / Cr Cash or configured equivalent in base currency; debits equal credits. |
| OP-J08 | Provider statement | Provider opens paid batch. | Own remittance visible; claim rows and total match voucher. |
| OP-J09 | Reports tie-out | Export claims/provider/utilisation/exclusions/GL for test date range. | Reports reconcile to claim, settlement, voucher, usage, and GL. |
| OP-J10 | Large batch | Settle provider batch with realistic monthly claim count. | No timeout; set-based update completes; no stranded CHECKER_APPROVED batch. |

### K. Portal Visibility, Notifications, and RBAC

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| OP-K01 | Member own claim | Member views utilisation and claim detail. | Member sees own/family permitted claim status, amounts, member share, paid status. |
| OP-K02 | Member notifications | Check notification inbox after intake, decision, settlement. | Visit recorded, decision, and paid notifications appear where enabled; no duplicates. |
| OP-K03 | Principal sees dependant notification | File dependant claim. | Principal/login-holder receives permitted dependant lifecycle notification. |
| OP-K04 | Member IDOR | Member tries another member's detail/utilisation URL. | Access denied or own-scope data only. |
| OP-K05 | HR scope | HR user checks group roster/utilisation and attempts other group/admin routes. | HR sees only assigned group; forbidden routes denied. |
| OP-K06 | Fund admin scope | Fund admin checks balance/claims and attempts unrelated fund/group. | Fund-scoped data only; balance reconciles to approved payer share. |
| OP-K07 | Provider portal scope | Provider A cannot see Provider B claims, settlements, API keys, or statements. | Access denied/not found outside own provider. |
| OP-K08 | Reports viewer scope | Reports viewer can export reports but not mutate claims/settlement/settings. | Read-only access enforced. |
| OP-K09 | Claims/medical/finance route scoping | Each operational role attempts out-of-role routes. | Branded access denied; no data leak or crash. |

## 6. Negative Financial Side-Effect Checklist

For every blocked or declined scenario, confirm:

| Check | Expected |
|---|---|
| Claim status | Not APPROVED/PARTIALLY_APPROVED/PAID unless explicitly expected. |
| Benefit usage | No increment for blocked/declined amount. |
| PA hold | No new hold unless PA is approved; no hold conversion unless claim approval consumes it. |
| Fund balance | No drawdown for blocked/declined claims. |
| GL | No approval/settlement journal for blocked/declined claims. |
| Settlement | Claim unavailable for settlement unless approved/partial and unsettled. |
| Notifications | No misleading approved/paid notification before final decision/payment. |
| Audit | Blocked attempt, override, fraud clearance, fallback, or conflict reason is recorded. |

## 7. Exit Criteria

The outpatient journey passes UAT when:

- At least one clean outpatient claim completes eligibility -> check-in -> intake -> decision -> settlement -> provider/member/report/GL visibility.
- Every scenario family above is `PASS`, `PASS WITH OBSERVATION`, or explicitly `NOT APPLICABLE - CONFIG NOT ENABLED`.
- No Critical or High defect remains open for claim intake, approval, settlement, GL balance, route scoping, duplicate claim/payment, rejected-line payment, ineligible member payment, or cross-provider/cross-member data exposure.
- Financial tie-out is zero or fully explained: approved payer share = settlement paid amount = voucher total = GL payable cleared = provider report paid total, with rejected/member-share amounts excluded as designed.
- All blocked negative scenarios leave no financial side effects.
- Remaining observations are accepted by product/finance/operations with named owner and target date.

## 8. Execution Log Template

| Scenario ID | Actor | Claim/PA/Batch/Visit ID | Result | Evidence | Defect/Observation | Tester | Date/time |
|---|---|---|---|---|---|---|---|
| OP-00.1 |  |  |  |  |  |  |  |

## 9. Defect Severity Guide

| Severity | Examples |
|---|---|
| Critical | Ineligible member paid, rejected amount paid, duplicate payment, unbalanced GL, cross-member/provider data exposure, settlement cannot complete, raw sensitive internal error on core money flow. |
| High | Claim cannot be submitted/adjudicated/settled through supported channel, approved/paid/utilisation totals wrong, PA hold consumed incorrectly, fraud/approval control bypassed when enabled. |
| Medium | Missing notification, unclear validation, export mismatch, routed claim lacks reason, recoverable workflow dead-end. |
| Low | Copy, layout, minor label issue that does not affect decision, money movement, privacy, or auditability. |
