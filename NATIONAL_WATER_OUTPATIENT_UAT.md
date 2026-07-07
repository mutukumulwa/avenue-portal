# National Water Outpatient UAT Runbook

## Purpose

Validate the most typical outpatient encounter for National Water staff and dependants: member eligibility, facility visit opening, diagnosis, claim filing, adjudication, approval/rejection, settlement, utilisation, balances, ledgers, reporting, and audit trail.

After the required user accounts, members, dependants, hospital/provider records, benefits, contracts, and opening balances are created, every action in this test must be performed through the system by a logged-in user. Do not use database injections or manual database edits during the actual UAT flow.

## Scope

This runbook covers two outpatient journeys:

1. An approved outpatient visit for a National Water principal member.
2. A declined or partially declined outpatient visit for a dependant.

The test should prove that:

- Members and dependants can be found and eligibility-checked at the facility.
- A hospital staff account opens the visit.
- Diagnosis and claim details flow from visit to claim.
- TPA users adjudicate the claim and record acceptance/rejection reasons.
- Finance users settle only approved payable amounts.
- Member utilisation, provider balances, scheme/fund balances, and GL ledgers update correctly.
- Audit logs identify the logged-in actor for each significant action.

## Test Parties

### Employer / Scheme

National Water and Sewerage Corporation, `National Water Staff Medical Scheme`.

### Members

| Person | Relationship | Test Role |
|---|---|---|
| Daniel Kato | Principal member | Approved outpatient visit |
| Sarah Kato | Spouse dependant | Declined or partially declined outpatient visit |
| Miriam Kato | Child dependant | Optional dependant eligibility check |

### Facilities

| Facility | Use |
|---|---|
| Nakasero Hospital | Approved outpatient consultation and claim |
| International Hospital Kampala | Declined or partially declined dependant claim |

### Required Logged-In Users

| User Type | Example Account | Purpose |
|---|---|---|
| National Water HR user | `hr.nwsc.uat@test.local` | Verify employer roster and utilisation view |
| Principal member | `daniel.kato.nwsc@test.local` | Member portal, benefits, visit notification, utilisation |
| Dependant portal user, if supported | `sarah.kato.nwsc@test.local` | Dependant/self-service checks, if applicable |
| Nakasero reception/provider user | `reception.nakasero.uat@test.local` | Open Daniel's visit/check-in |
| Nakasero clinician/provider user | `clinician.nakasero.uat@test.local` | Record diagnosis/services, if supported |
| IHK reception/provider user | `reception.ihk.uat@test.local` | Open Sarah's visit/check-in |
| IHK clinician/provider user | `clinician.ihk.uat@test.local` | Record diagnosis/services, if supported |
| TPA claims officer | `claims.uat@test.local` | Review and adjudicate claim |
| TPA medical officer | `medical.uat@test.local` | Clinical review/override where needed |
| TPA finance officer | `finance.uat@test.local` | Settlement, ledger, GL/fund checks |
| Second finance approver | `finance.approver.uat@test.local` | Maker-checker settlement approval |

If provider-specific logins are not supported in the current system, record this as a UAT finding and run the provider steps with the narrowest available facility-scoped or claims-capture account. Do not use an unrestricted super-admin account for facility actions unless no other option exists, and record the gap.

## Preconditions

Complete these through the system UI before running the main UAT flow.

| # | Logged-In User | Action | Expected Result | Evidence |
|---|---|---|---|---|
| P1 | TPA admin/super admin | Confirm or create National Water scheme | Scheme exists and is ACTIVE | Screenshot, scheme reference |
| P2 | TPA admin/super admin | Configure benefit tier/package | Outpatient consultation, laboratory, pharmacy, and co-pay/co-contribution rules are configured | Screenshot |
| P3 | TPA admin/super admin | Confirm or create Daniel Kato as principal | Daniel is ACTIVE under National Water | Member number |
| P4 | TPA admin/super admin | Add Sarah Kato and Miriam Kato as dependants | Dependants are ACTIVE and linked to Daniel | Screenshot |
| P5 | TPA admin/super admin | Create member portal login for Daniel | Daniel can log in and sees only his family | Screenshot |
| P6 | TPA admin/super admin | Confirm Nakasero Hospital and IHK are ACTIVE contracted providers | Providers have active contracts/tariffs | Screenshot |
| P7 | TPA admin/super admin | Configure relevant outpatient tariffs | Consultation, CBC/malaria test, pharmacy item, and excluded/non-covered test item exist | Screenshot |
| P8 | TPA admin/super admin | Create required TPA, HR, member, and provider users | Each user can log in and lands in the correct portal | Screenshot per role |
| P9 | Finance officer | Record opening balances | Member outpatient balance, provider balance, scheme/fund balance, and GL/trial balance are captured | Screenshot/export |

## Opening Balance Capture

Before Scenario A, record the following values:

| Balance / Ledger | Before Value | Evidence |
|---|---:|---|
| Daniel outpatient annual limit |  |  |
| Daniel outpatient used amount |  |  |
| Daniel outpatient remaining amount |  |  |
| Sarah outpatient annual limit |  |  |
| Sarah outpatient used amount |  |  |
| Sarah outpatient remaining amount |  |  |
| National Water scheme/fund balance, if applicable |  |  |
| Nakasero provider outstanding/payable balance |  |  |
| IHK provider outstanding/payable balance |  |  |
| GL/trial balance status |  |  |

## Scenario A: Approved Outpatient Visit for Principal Member

### Test Data

| Field | Value |
|---|---|
| Member | Daniel Kato |
| Relationship | Principal |
| Facility | Nakasero Hospital |
| Service type | Outpatient |
| Diagnosis | Acute upper respiratory infection |
| ICD-10 | `J06.9` |
| Consultation | UGX 50,000 |
| Laboratory, CBC | UGX 35,000 |
| Pharmacy | UGX 45,000 |
| Expected gross claim | UGX 130,000 |

### Steps

| # | Logged-In User | Action | Expected Result | Evidence | Pass/Fail |
|---|---|---|---|---|---|
| A1 | Daniel Kato | Log in to member portal and open benefits/utilisation | Daniel sees National Water cover, dependants, outpatient balance, QR/member number | Screenshot |  |
| A2 | Nakasero reception/provider user | Search Daniel by member number/card/phone | System finds Daniel and shows ACTIVE eligibility | Screenshot |  |
| A3 | Nakasero reception/provider user | Open outpatient visit/check-in | Visit is created with facility, member, date/time, and status OPEN/ACTIVE | Visit reference |  |
| A4 | Daniel Kato | Confirm visit if member confirmation is supported | Visit is confirmed or notification appears in member portal | Screenshot |  |
| A5 | Nakasero clinician/provider user | Record diagnosis `J06.9` | Diagnosis is attached to Daniel's visit | Screenshot |  |
| A6 | Nakasero clinician/provider user | Add consultation, CBC, and pharmacy services | Visit bill/claim draft totals UGX 130,000 | Screenshot |  |
| A7 | Nakasero provider user | Submit claim from visit | Claim is created against Daniel, Nakasero, outpatient benefit | Claim number |  |
| A8 | TPA claims officer | Open claim detail | Claim shows member, provider, diagnosis, lines, tariffs, and benefit balances | Screenshot |  |
| A9 | TPA claims officer | Run adjudication / compute outcome | Eligible lines are approved; member share/co-pay is calculated if configured | Screenshot |  |
| A10 | TPA claims officer | Submit final decision as APPROVED | Claim status becomes APPROVED and an adjudication log is written | Screenshot |  |
| A11 | TPA finance officer | Add approved claim to provider settlement batch | Batch includes Nakasero claim and correct payable amount | Batch reference |  |
| A12 | Second finance approver | Approve settlement batch | Settlement reaches APPROVED/SETTLED; maker cannot self-approve | Screenshot |  |
| A13 | TPA finance officer | Verify balances and ledgers | Provider payable/fund/GL movements match approved claim and GL balances | Ledger screenshots |  |
| A14 | Daniel Kato | View utilisation/claim history | Outpatient used amount increases; remaining limit decreases; claim appears in history | Screenshot |  |
| A15 | National Water HR user | View roster/utilisation summary | Daniel appears under National Water with updated utilisation | Screenshot |  |

### Expected Financial Result

| Item | Expected Result |
|---|---|
| Gross claim | UGX 130,000 |
| Approved amount | UGX 130,000, unless a configured co-pay or rule reduces payable |
| Member share | Per configured co-pay/co-contribution rule |
| Provider payable | Approved amount minus member share |
| Member utilisation | Outpatient used amount increases according to configured product rule |
| Scheme/fund balance | Decreases by payer share if National Water is self-funded |
| Provider ledger | Reflects approved payable and settlement |
| GL | Debits equal credits after posting/settlement |

## Scenario B: Declined or Partially Declined Dependant Visit

### Test Data

| Field | Value |
|---|---|
| Member | Sarah Kato |
| Relationship | Spouse dependant |
| Facility | International Hospital Kampala |
| Service type | Outpatient |
| Diagnosis option 1 | Dental scaling / routine dental cleaning |
| Diagnosis option 2 | Optical review |
| Rejection basis | Benefit not covered, excluded provider/service, over-limit, or missing pre-authorisation |

Choose a rejection basis that is actually configured in the UAT environment. Do not invent a rejection rule that the product configuration cannot enforce.

### Steps

| # | Logged-In User | Action | Expected Result | Evidence | Pass/Fail |
|---|---|---|---|---|---|
| B1 | IHK reception/provider user | Search Sarah Kato | Sarah resolves as ACTIVE dependant under Daniel's family | Screenshot |  |
| B2 | IHK reception/provider user | Open outpatient visit/check-in | Visit is created for Sarah, not Daniel | Visit reference |  |
| B3 | IHK clinician/provider user | Record diagnosis/service basis | Diagnosis/service is attached to Sarah's visit | Screenshot |  |
| B4 | IHK clinician/provider user | Add covered and non-covered/over-limit line items | Claim draft includes at least one line expected to reject | Screenshot |  |
| B5 | IHK provider user | Submit claim from visit | Claim enters RECEIVED/CAPTURED status | Claim number |  |
| B6 | TPA claims officer | Open claim and adjudicate | Covered lines approve; excluded/over-limit lines reject with reason | Screenshot |  |
| B7 | TPA medical officer, if required | Review rejection or override request | Override is denied or approved with documented reason | Audit evidence |  |
| B8 | TPA claims officer | Submit final decision | Claim becomes DECLINED or PARTIALLY_APPROVED | Screenshot |  |
| B9 | TPA finance officer | Confirm settlement impact | Rejected amount is not settled; only approved payable, if any, enters settlement | Settlement screenshot |  |
| B10 | Daniel/Sarah member portal | View claim outcome | Claim shows declined/partial status and reason; balances reflect only valid usage | Screenshot |  |
| B11 | Claims officer/reports viewer | Check rejected claims report | Rejected claim appears with reason code | Screenshot/export |  |

### Acceptable Rejection Reasons

Use the actual system reason code that best fits the configured product rule:

- Benefit not covered under outpatient package.
- Annual outpatient limit exhausted.
- Provider/service excluded by contract.
- Missing required pre-authorisation.
- Invalid or unsupported tariff/service code.

## Audit and Controls Checklist

| Control | Expected Result | Evidence | Pass/Fail |
|---|---|---|---|
| Actor traceability | Every major action shows the correct logged-in user | Audit/activity log |  |
| Facility access | Provider users cannot access unrelated TPA finance/settings areas | Screenshot |  |
| Member privacy | Daniel cannot see claims for another unrelated member | Screenshot |  |
| Dependant linkage | Sarah appears as Daniel's dependant, not as an unrelated principal | Screenshot |  |
| Employer scope | National Water HR sees only National Water members | Screenshot |  |
| Claims/finance separation | Claims officer cannot settle unless role permits it | Screenshot |  |
| Maker-checker | Settlement maker cannot approve own batch, if maker-checker applies | Screenshot |  |
| Claim status transitions | Invalid transitions are blocked; valid transitions are logged | Screenshot/log |  |
| Rejection reason | Declined line/claim has a clear reason code | Screenshot |  |
| Ledger integrity | GL debits equal credits after settlement | GL/trial balance |  |

## Closing Balance Capture

After both scenarios, record the following values:

| Balance / Ledger | Before Value | After Value | Expected Change | Evidence |
|---|---:|---:|---:|---|
| Daniel outpatient used amount |  |  | Increase by approved utilisation amount |  |
| Daniel outpatient remaining amount |  |  | Decrease by approved utilisation amount |  |
| Sarah outpatient used amount |  |  | Increase only for approved lines, if any |  |
| Sarah outpatient remaining amount |  |  | Decrease only for approved/usage-counted lines, if any |  |
| National Water scheme/fund balance, if applicable |  |  | Decrease by payer share only |  |
| Nakasero provider payable/settled balance |  |  | Reflect approved/settled claim |  |
| IHK provider payable/settled balance |  |  | Reflect approved amount only, or zero if declined |  |
| GL/trial balance status |  |  | Still balanced |  |

## Defect Triggers

Log a UAT defect immediately if any of the following occurs:

- A visit or claim can be opened for an inactive, suspended, lapsed, or terminated member.
- A member can see another unrelated member's claims, documents, or utilisation.
- National Water HR can see another employer's members.
- Provider staff can see claims or finance areas outside their facility scope.
- A rejected line is included in settlement.
- A declined claim reduces benefit balance incorrectly.
- Claim approval does not update member utilisation.
- Settlement does not update provider payable, scheme/fund balance, or GL as expected.
- GL does not balance after settlement.
- Maker-checker can be self-approved where maker-checker is required.
- The system crashes instead of showing a validation error.
- Any test step requires direct database edits after setup.

## Final Acceptance Criteria

This UAT passes only if:

1. Daniel's approved outpatient visit completes end to end.
2. Sarah's rejected or partially rejected visit shows a clear reason and does not incorrectly pay excluded amounts.
3. Member, provider, scheme/fund, and GL balances update correctly.
4. Member utilisation reflects only valid covered usage.
5. Provider settlement matches approved payable only.
6. Rejected claim appears in the rejected claims report.
7. All actions are performed through logged-in accounts.
8. No database edits are used after setup.
9. Screenshots/references are captured for every major step.
10. Any missing provider-user workflow, ledger mismatch, role leakage, or failed settlement is logged as a UAT defect.

