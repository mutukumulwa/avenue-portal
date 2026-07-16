# Inpatient Journey E2E UAT Test Document

**Created:** 2026-07-07  
**Target environment:** Vercel UAT / production-like deployment  
**Primary objective:** Prove the complete inpatient journey across long-stay, surgical, oncology, maternity, ICU, emergency, transfer, case-management, pre-authorisation, letter-of-undertaking, HMS-batch, adjudication, settlement, GL, benefit, fund, portal, report, fraud, and negative-control scenarios.

## 1. Scope and Code Basis

This plan is intentionally broader than the outpatient pass. It must prove not just that an inpatient claim can be filed, but that a real admission episode can run for multiple days, accrue daily and episodic charges, change clinical shape mid-stay, discharge into a consolidated bill, and settle without paying excluded, duplicate, ineligible, unauthorised, or wrongly-priced amounts.

| Area | Supported by | What must be proven |
|---|---|---|
| Admission pre-authorisation | `/preauth`, `/preauth/new`, member preauth routes, `PreAuthorization` | Inpatient pre-admission, emergency retrospective approval, GOP issue, estimated components, SLA, approval/decline, holds, amendments, utilisation. |
| Clinical case management | `/cases`, `/cases/new`, `ClinicalCase`, `CaseServiceEntry`, `LetterOfUndertaking` | Open admission case, accrue day-by-day charges, add/void service entries, issue LOU, close case, file exactly one claim, make closed case read-only. |
| Direct inpatient claim | `/claims/new`, `/provider/claims/new`, `Claim` | Legacy/direct claim path with admission/discharge dates, length of stay, diagnosis, procedures, line items, PA attachment, and inpatient benefit category. |
| HMS/provider billing | `/api/v1/hms-batch`, manual HMS batch upload, `CaseServiceEntry.source = HMS_BATCH` | Daily hospital feeds append valid services idempotently, reject unmatched/duplicate/future/wrong-case lines, and preserve source references. |
| Contract pricing | Provider tariffs, diagnosis tariffs, contract packages, pricing rules | Ward/ICU per-day rates, per-admission fees, theatre/professional fees, surgical packages, maternity packages, chemo sessions, caps, carve-outs, external offsets, quantity/frequency limits. |
| Claim decision | `ClaimDecisionService.decide` and approval matrix | Full, partial, decline, over-ceiling block, PA/LOU cover check, multi-level approvals, fraud gate, cost share, benefit usage, GL and fund side effects. |
| Settlement and finance | `/settlement`, vouchers, GL, fund transactions, reports | Maker/checker settlement, voucher, PAID propagation, balanced GL, self-funded drawdown, provider statement, report exports, no duplicate payment. |
| Portal visibility and RBAC | Member, provider, HR, fund, reports, admin roles | Each actor sees the right episode status, utilisation, notifications, statements, and nothing outside scope. |

If a route is hidden by role configuration, record the scenario as `BLOCKED - ACCESS/CONFIG`, not as pass.

## 2. UAT Rules

- Run functional UAT through the front end unless the scenario explicitly covers HMS/API/offline intake.
- Each actor must log in as themselves: member, provider, medical reviewer, claims officer, underwriter, finance maker, finance checker, HR, fund admin, reports viewer, and admin.
- Do not use direct database edits to create admission, PA, case, service entry, LOU, claim, decision, settlement, notification, GL, or benefit usage outcomes.
- For every material step, capture evidence: PA number, GOP number, case number, LOU number, admission/discharge dates, service entry IDs where visible, claim number, settlement batch, voucher, GL journal, fund transaction, report export, notification, and screenshots.
- Confirm every blocked or declined negative case leaves no financial side effects: no approved amount, no benefit usage, no hold conversion, no fund drawdown, no GL journal, no settlement eligibility, no paid notification.
- For long-stay money testing, keep a manual control sheet outside the app: expected daily charges, package inclusions, excluded charges, member share, payer share, settlement total, GL total, and report total.

## 3. Test Data Requirements

| Data set | Minimum requirement |
|---|---|
| Members | Active principal, active spouse, child dependant, newborn/maternity-dependent path if supported, one suspended/lapsed/terminated member, one member near annual/family limit. |
| Groups/packages | At least one insured group and one self-funded group with inpatient, surgical, maternity, oncology/cancer, ambulance/emergency, rehabilitation, and pharmacy/consumable coverage where configured. |
| Providers | Tertiary hospital with inpatient/ICU/surgery/maternity/oncology, secondary hospital with inpatient/ward, oncology facility or oncology-capable hospital, and one inactive/suspended provider. |
| Branches | Multi-branch provider with branch-scoped rates if available; one inactive branch for negative testing. |
| Contracts/tariffs | Ward per day, HDU/ICU per day, nursing, admission, doctor rounds, theatre, surgeon, anaesthetist, implants, consumables, lab, imaging, pharmacy, oxygen per hour/day, ambulance, chemo session/drug, maternity normal delivery, C-section, neonatal care. |
| Packages | Appendectomy or hernia surgical package, C-section package, normal delivery package, chemo cycle/session pricing, package inclusions/exclusions, LOS caps, complication rule, and at least one unbundling-not-allowed package. |
| Pre-auth/LOU | Admission-required rule, amount threshold rule, LOS-beyond rule, emergency retrospective window, required documents, validity window, and one LOU ceiling. |
| Finance | GL accounts, payment voucher flow, approval matrix thresholds, self-funded fund balance, FX rates if non-base currencies are enabled. |
| Reports | Admissions report, claims report, provider statement, member utilisation, outstanding bills, exceeded limits, GL, fund statement, CSV/PDF exports. |

## 4. End-to-End Long-Stay Spine

| ID | Actor | Route | Action | Expected result | Evidence |
|---|---|---|---|---|---|
| IP-00.1 | Admin | Settings/providers/packages/contracts | Confirm all personas, benefit categories, provider contracts, PA rules, LOU, GL, reports, and fund setup exist. | Preconditions active and scoped. | Setup screenshots |
| IP-00.2 | Member | Member portal | Capture baseline benefits, utilisation, notifications, documents, and dependants. | Member sees only permitted own/family data. | Baseline |
| IP-00.3 | Provider/admin | `/preauth/new` | Submit planned inpatient PA with estimated components: ward 5 days, labs, imaging, pharmacy, doctors, procedure risk. | PA SUBMITTED/UNDER_REVIEW with inpatient SLA and component estimate. | PA number |
| IP-00.4 | Medical reviewer | `/preauth/[id]` | Review and approve PA; issue GOP where supported. | PA APPROVED, GOP issued, benefit hold active, validity set, member/provider notified. | GOP/hold evidence |
| IP-00.5 | Claims/medical | `/cases/new` | Open `INPATIENT_ADMISSION` case linked to PA, provider, branch, diagnosis, expected discharge, estimated cost. | Case OPEN, PA linked to case, admission timeline visible. | Case number |
| IP-00.6 | Claims/medical | Case detail | Issue LOU with amount ceiling and validity. | LOU ISSUED and attached to case; ceiling visible. | LOU number |
| IP-00.7 | Provider/HMS | Case detail or HMS batch | Post day 1 ward, admission fee, labs, imaging, drugs. | Service entries accrue; case accrued amount updates. | Entry list |
| IP-00.8 | Provider/HMS | Case detail or HMS batch | Post days 2-5 including ward daily charges, doctor rounds, repeat labs, pharmacy, consumables. | Daily charges are additive, dated correctly, non-duplicate, and within admission window. | Daily evidence |
| IP-00.9 | Medical reviewer | PA/case | Amend PA/LOU because estimate rises above original ceiling. | Amendment routed/approved per matrix; old and new ceilings auditable. | Amendment evidence |
| IP-00.10 | Claims/medical | Case detail | Enter discharge date and close case. | Case goes PENDING_CLOSURE then CLOSED_FILED; exactly one claim is filed; closed case read-only. | Claim number |
| IP-00.11 | Claims officer | `/claims/[id]` | Capture/review inpatient claim: dates, LOS, diagnoses, procedures, PA/LOU, service lines, contract panel. | Claim matches case/service entries; LOS and total reconcile; no missing PA/LOU warnings. | Claim detail |
| IP-00.12 | Claims officer | Claim detail | Attempt over-ceiling approval. | Blocked before usage/GL/fund; friendly message. | Negative evidence |
| IP-00.13 | Claims/underwriter | Claim detail + `/approvals` | Submit valid partial/full decision requiring multi-level approval. | Approval matrix routes; same-user checker blocked; final approval applies once authorised. | Approval chain |
| IP-00.14 | Finance maker | `/settlement` | Create provider batch for admitted provider/month. | Approved inpatient claim picked up once; declined/member-share/excluded amounts excluded. | Batch ID |
| IP-00.15 | Finance maker/checker | `/settlement/[id]` | Maker self-approval blocked; distinct checker approves and marks paid. | Batch SETTLED, voucher created, claim PAID, GL balanced, no duplicate payment. | Voucher/GL |
| IP-00.16 | Provider/member/HR/fund/reports | Portals and reports | Verify claim, statement, utilisation, fund, notifications, admissions report, claims report, GL, exports. | All totals reconcile to payer share; each actor scoped correctly. | Exports/screens |

## 5. Scenario Catalogue

### A. Admission Eligibility, PA, GOP, and LOU

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-A01 | Planned admission PA | Submit inpatient PA before admission with diagnosis, procedure, expected date, estimated components, provider, and required documents. | PA enters correct status/SLA; benefit remaining and estimate visible. |
| IP-A02 | GOP issue | Approve PA within cover and validity. | GOP number issued; approved amount and validity visible; hold placed. |
| IP-A03 | LOU issue | Open case and issue LOU against provider. | LOU ISSUED with ceiling, dates, case link, and audit trail. |
| IP-A04 | Emergency admission retrospective PA | Admit first, then submit emergency PA inside retrospective window. | Allowed and flagged emergency; SLA uses emergency policy. |
| IP-A05 | Retrospective window missed | Submit emergency PA outside allowed window. | Routed/manual or rejected per rule; no silent approval. |
| IP-A06 | Admission requires PA | Submit inpatient claim/case without PA where contract requires it. | Intake or decision blocks/routs with AUTH reason; no payable side effects. |
| IP-A07 | PA wrong member/provider/benefit | Attach PA from another member/provider/category. | Attach blocked; original PA remains unconsumed. |
| IP-A08 | PA validity expired | Attach or approve claim after validUntil. | Blocked/routed; no hold conversion. |
| IP-A09 | LOU ceiling exceeded | Accrue case above LOU ceiling. | Warning/routing appears; approval cannot exceed cover without authorised amendment/override. |
| IP-A10 | PA amendment mid-stay | Increase approved amount or extend validity because stay is longer than expected. | Parent/child amendment or updated PA is auditable; approval authority enforced. |
| IP-A11 | PA partial consumption | First claim consumes part of PA if multi-claim path is enabled; otherwise one case one claim consumes at closure. | Utilised amount is correct; remaining hold stays active only when intended. |
| IP-A12 | PA decline | Decline admission PA with reason. | No GOP, no LOU, no hold, member/provider see permitted decline reason. |

### B. Clinical Case and Multi-Day Charge Accrual

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-B01 | Open inpatient case | Create `INPATIENT_ADMISSION` case with admission date, expected discharge, diagnosis, provider branch, estimated cost. | Case OPEN and searchable by member/provider/status. |
| IP-B02 | Ward bed charges per day | Add 5 separate ward-day entries or one quantity 5 entry, depending UI support. | Total = daily rate x days; dates inside stay; accrued amount updates. |
| IP-B03 | Day-boundary LOS | Admission Monday, discharge Friday. | LOS calculation follows product rule and is consistent across claim, reports, and billing. |
| IP-B04 | Same-day admission/discharge | Admit and discharge same day. | LOS is not negative/zero-priced accidentally; configured same-day/day-case rule applies. |
| IP-B05 | Discharge before admission | Enter discharge before admission. | Blocked with friendly validation; no case closure/claim filing. |
| IP-B06 | Future service entry | Add service entry dated after discharge or in the future. | Blocked or routed as exception; no financial side effect. |
| IP-B07 | Void service entry | Void one pharmacy/ward entry with reason. | Entry remains visible as voided; accrued amount excludes it; audit records reason. |
| IP-B08 | Duplicate HMS line | Submit same hmsBatchRef/service/date/amount twice. | Idempotent skip or duplicate exception; total not doubled. |
| IP-B09 | Empty case closure | Try close case with no service entries. | Friendly blocked state; no raw exception; no claim filed. |
| IP-B10 | Close and file claim | Close case after valid entries. | Case CLOSED_FILED; exactly one claim created; service entries copied to claim lines. |
| IP-B11 | Closed case read-only | Try add/void/issue LOU after closure. | Mutating controls hidden or blocked; audit preserved. |
| IP-B12 | Cancel case | Cancel admission before services or after voiding all services. | Case CANCELLED; no claim/settlement eligibility. |

### C. Long-Stay Medical Admission

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-C01 | 5-day pneumonia admission | PA -> case -> ward, labs, imaging, oxygen, pharmacy, doctor rounds -> discharge -> claim. | Full money spine completes; all day charges reconcile. |
| IP-C02 | ICU transfer | Days 1-2 ward, days 3-4 ICU/HDU, day 5 ward. | Ward and ICU rates apply to correct dates; no overlapping bed-day double payment unless configured. |
| IP-C03 | Oxygen per hour/day | Add oxygen with configured unit. | Quantity and unit of measure priced correctly; caps enforced. |
| IP-C04 | Doctor rounds frequency limit | Add multiple consultant rounds in one day. | Frequency cap blocks or shortfalls excess rounds with reason. |
| IP-C05 | High-cost imaging | Add CT/MRI during admission requiring referral/preauth. | Priced only if referral/auth rule satisfied; otherwise routed/shortfalled. |
| IP-C06 | Excluded drug during admission | Add excluded drug. | Line rejected/shortfalled; payer share excludes it; member/provider messaging correct. |
| IP-C07 | Benefit near exhaustion | Admit member with remaining inpatient benefit below final bill. | Approved payer share capped; excess/member liability computed and excluded from settlement. |
| IP-C08 | Self-funded long stay | Use self-funded group. | Fund drawdown equals approved payer base amount; fund statement and GL tie out. |

### D. Surgical Admission and Packages

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-D01 | Appendectomy/package happy path | Submit surgical PA, open case, add theatre, surgeon, anaesthetist, ward, labs, drugs, discharge. | Package triggers; included components zero-priced/absorbed; package price is payer ceiling. |
| IP-D02 | Package LOS cap | Add ward days beyond package LOS cap. | Extra days priced by configured rule or routed; not silently included if cap exceeded. |
| IP-D03 | Unbundling attempt | Bill included theatre/professional components separately on top of package. | Duplicate/unbundled components shortfalled or rejected. |
| IP-D04 | Complication excluded bill separately | Add ICU complication where package complication rule says bill separately. | ICU priced FFS/per-diem or routed per rule, with trace. |
| IP-D05 | Complication included | Same complication under included package rule. | No separate payer amount above package. |
| IP-D06 | Implant/prosthesis cap | Add implant above contract cap. | Payable capped; excess/member/provider write-off clear. |
| IP-D07 | Emergency surgery no prior PA | Emergency admission then surgery. | Retrospective path allowed only inside configured window; otherwise manual/routing outcome. |
| IP-D08 | Wrong-gender/wrong-age surgical tariff | Attempt gender/age-restricted package mismatch where configured. | Pricing/approval blocked or routed with reason. |

### E. Oncology and Chemotherapy

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-E01 | Chemo day-care or inpatient cycle | Submit oncology PA with chemo drug, infusion session, labs, antiemetics. | PA/claim uses cancer/oncology benefit; session and drug amounts reconcile. |
| IP-E02 | Multi-cycle treatment | Submit cycle 1, then cycle 2 under same annual benefit. | Benefit usage accumulates; PA/hold consumption does not double-count. |
| IP-E03 | Chemo drug not covered/excluded | Add non-formulary or excluded oncology drug. | Routed/rejected/shortfalled with clear reason; no payer settlement for excluded amount. |
| IP-E04 | Dose/quantity variance | Bill unusually high quantity or repeated chemo same day. | Fraud/variance alert or frequency cap triggers; approval gate behaves per setting. |
| IP-E05 | Inpatient complication after chemo | Patient admitted for neutropenic fever after chemo. | Separate inpatient case/benefit or linked episode is handled without duplicate benefit use. |
| IP-E06 | Preauth amount exhausted mid-cycle | Chemo costs exceed PA approved amount. | Amendment/override required before additional payer approval. |

### F. Maternity, Newborn, and Related Complications

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-F01 | Normal delivery package | Submit maternity PA/case, add delivery, ward, drugs, labs, discharge. | Normal-delivery package or maternity tariff applies; report shows maternity admission. |
| IP-F02 | C-section package | Submit C-section case with theatre and professional fees. | C-section package triggers; included lines not double-paid. |
| IP-F03 | Normal delivery converts to emergency C-section | Start normal delivery, add C-section complication/amendment. | Package/PA amendment/routing is correct; no stale normal-only ceiling. |
| IP-F04 | Newborn nursery charges | Add newborn-related entries where supported. | Correct member/dependant policy behavior: included in maternity, newborn dependant, or blocked if unsupported. |
| IP-F05 | Neonatal ICU | Add NICU days after delivery. | Correct benefit/category/rule applies; package complication rule respected. |
| IP-F06 | Maternity waiting period | Use member still inside waiting period. | PA/claim blocked or declined; no payable side effects. |
| IP-F07 | Gender restriction | Try maternity claim for non-eligible gender/member. | Blocked/routed with clear validation. |
| IP-F08 | Maternity sublimit exhaustion | Maternity bill exceeds sublimit. | Payer share capped; excess/member liability excluded from settlement. |

### G. Transfers, Referrals, Ambulance, and Cross-Facility Episodes

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-G01 | Transfer between providers | Admit at Provider A, transfer to Provider B for ICU/surgery. | Either two linked cases/claims or configured transfer workflow; provider scopes remain separate. |
| IP-G02 | Ambulance/emergency line | Add ambulance referral/transfer charge. | Ambulance benefit/rate/cap applies; not paid from wrong inpatient bucket unless designed. |
| IP-G03 | Cross-provider settlement | Settle Provider A and Provider B claims separately. | Each provider sees and is paid only own services. |
| IP-G04 | Referral-required service | Add referred specialist/imaging. | Missing referral blocks/routs; valid referral permits pricing. |
| IP-G05 | Out-of-network provider | Attempt admission at non-covered provider. | Eligibility/claim decision blocks or applies out-of-network rule. |
| IP-G06 | Inactive branch admission | Open case or claim against inactive/wrong branch. | Blocked; no claim/LOU/settlement side effect. |

### H. Direct Claim, Provider Claim, API, HMS, and Offline Rails

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-H01 | Direct admin inpatient claim | File `/claims/new` with admission/discharge dates, INPATIENT service, valid PA, multi-line bill. | Claim RECEIVED/CAPTURED with correct LOS and lines. |
| IP-H02 | Provider inpatient claim | Provider files inpatient claim if portal supports category. | Provider forced to own facility; cannot spoof provider/branch. |
| IP-H03 | Claim missing admission date | Submit inpatient claim without admission date where required. | Friendly validation; no claim. |
| IP-H04 | Claim discharge before admission | Submit invalid date range. | Blocked; no claim. |
| IP-H05 | HMS batch valid daily feed | Push day-by-day entries into open case. | Valid lines append; case accrued amount updates. |
| IP-H06 | HMS unmatched case/member | Push line with unknown case/member/provider. | Exception created; valid lines still process. |
| IP-H07 | HMS duplicate batch replay | Replay same batch. | Idempotent; no duplicated charges. |
| IP-H08 | API inpatient claim create | Submit API claim with active member, active provider, serviceType INPATIENT. | Auth/scoping/pass-through gates work; claim source set appropriately. |
| IP-H09 | API facility spoofing | Use provider API key for another provider/tenant. | Blocked. |
| IP-H10 | Offline inpatient capture | Capture inpatient service offline, then sync. | Either supported and creates claim/exception, or clearly blocked as unsupported; no silent loss. |

### I. Manual Adjudication, Controls, and Approvals

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-I01 | Full approval within PA/contract | Approve payer share exactly within package/tariff/PA/benefit. | Claim APPROVED; usage, GL, fund, notification created. |
| IP-I02 | Partial approval | Approve only allowed lines; reject excluded/duplicate/uncovered lines. | PARTIALLY_APPROVED; settlement pays approved payer share only. |
| IP-I03 | Full decline | Decline with reason. | No usage, GL payable, fund drawdown, settlement eligibility, or paid notification. |
| IP-I04 | Over contract ceiling | Attempt above package/per-diem/tariff ceiling. | Blocked unless authorised override exists. |
| IP-I05 | Over PA/LOU ceiling | Attempt above approved PA/LOU. | Amendment/override required; no side effects before approval. |
| IP-I06 | Multi-level approval threshold | Approve high-value admission above matrix threshold. | Routes to underwriter/senior roles; same-user approval blocked. |
| IP-I07 | Fraud-flagged admission | Trigger duplicate/high-variance/long-stay fraud alert. | Fraud gate blocks or routes per tenant policy; settlement cannot pick unresolved blocked claim. |
| IP-I08 | Decision from terminal status | Try decide paid/declined/void claim again. | Blocked; no duplicate usage/GL/fund. |
| IP-I09 | Void approved not-settled claim | Void approved inpatient claim before settlement. | Usage, GL, hold, and fund effects reverse; claim unavailable for settlement. |
| IP-I10 | Appeal | Appeal declined/partial inpatient claim. | Appeal reviewer differs from adjudicator; approved appeal posts correct incremental effects. |
| IP-I11 | Cost share | Apply deductible/co-insurance/copay inpatient design. | Member liability components reconcile and are excluded from provider settlement unless balance-billing design says otherwise. |
| IP-I12 | Capitation/hybrid funding | Include capitated lines and FFS carve-outs. | Capitated lines not paid per line; carve-outs priced correctly; reports tag funding model. |

### J. Settlement, Voucher, GL, Fund, and Reports

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-J01 | Settlement batch includes inpatient claim | Create provider batch after approval. | Batch includes approved/partial inpatient claim once. |
| IP-J02 | Exclusions omitted from settlement | Confirm declined/excess/member-share/shortfall lines. | Provider payable = approved payer liability only. |
| IP-J03 | Maker/checker | Maker self-approval blocked; checker approves. | SoD enforced. |
| IP-J04 | Mark paid | Checker marks paid. | Voucher, claim PAID, paidAt/paidAmount, provider statement, and balanced GL created. |
| IP-J05 | Duplicate Mark Paid | Try Mark Paid twice. | Blocked; no duplicate voucher or cash journal. |
| IP-J06 | GL approval posting | Review approval journal. | Claims incurred/payable postings balanced in base currency. |
| IP-J07 | GL settlement posting | Review settlement journal. | Dr Claims Payable / Cr Cash or configured equivalent; debits equal credits. |
| IP-J08 | Self-funded drawdown | Approve and settle self-funded inpatient claim. | Fund balance/statement equals approved payer share; GL balanced. |
| IP-J09 | Provider statement | Provider views statement/remittance. | Only own claim lines and settlement totals visible; total equals voucher. |
| IP-J10 | Reports tie-out | Export admissions, claims, provider statement, utilisation, outstanding bills, exceeded limits, fund, GL. | Exports reconcile to claim/settlement/voucher/usage/GL. |
| IP-J11 | Large inpatient batch | Settle realistic monthly inpatient batch with high line counts. | No timeout/stranded batch; set-based settlement completes. |
| IP-J12 | Outstanding bills before settlement | Review reports after approval before payment. | Claim appears outstanding/payable until paid, then moves to paid/settled. |

### K. Currency and FX

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-K01 | UGX base admission | Run long-stay spine in UGX. | All screens, reports, voucher, GL, and exports show UGX consistently. |
| IP-K02 | Non-base admission with FX | Use non-base provider/client currency with valid rate. | Approved/billed base amounts, rate, and rate date snapshot at decision; GL posts base. |
| IP-K03 | Missing FX | Approve non-base claim without current FX. | Fails closed before usage/GL/fund/notification. |
| IP-K04 | Mixed-currency same provider | Provider has approved UGX and KES inpatient claims in same cycle. | Settlement blocks raw mixed-currency batch or requires separate currency batches. |
| IP-K05 | Currency label sweep | Inspect case, PA, claim, settlement, voucher, GL, portals, CSV/PDF. | No residual wrong currency labels. |

### L. Portal Visibility, Notifications, RBAC, and Privacy

| ID | Scenario | Steps | Expected result |
|---|---|---|---|
| IP-L01 | Member admission visibility | Member views PA, notifications, utilisation, claim detail. | Admission lifecycle and amounts visible at permitted level only. |
| IP-L02 | Dependant admission | File dependant inpatient case. | Principal/login-holder visibility follows family privacy rules. |
| IP-L03 | Sensitive diagnosis privacy | Oncology/maternity/mental-health admission. | HR/provider/reports views do not expose more clinical detail than role permits. |
| IP-L04 | Provider scope | Provider A attempts Provider B inpatient case/claim/settlement URL. | Access denied/not found. |
| IP-L05 | HR scope | HR sees own group utilisation/admission aggregates only. | No other group/member data. |
| IP-L06 | Fund admin scope | Fund admin sees own fund claims/balance only. | No unrelated fund/group data. |
| IP-L07 | Reports viewer read-only | Reports viewer exports but cannot mutate claims/cases/settlement/settings. | Read-only enforced. |
| IP-L08 | Clinical role boundaries | Claims, medical, underwriter, finance attempt out-of-role routes. | Branded access denied; no crash/data leak. |
| IP-L09 | Notifications | Intake/admission, PA approval, claim decision, payment, extra-doc request. | Correct notifications created once; no premature paid/approved messages. |

## 6. Money Control Sheets Required

Maintain a control sheet per major admission. At minimum:

| Control | Expected reconciliation |
|---|---|
| Admission dates | Admission, discharge, LOS, and daily bed charges align. |
| Case accrued amount | Sum of non-void service entries equals case accrued amount. |
| Claim billed amount | Sum of claim lines equals case accrued amount or direct bill total. |
| Contract payable | Per-diem/package/tariff/cap/discount logic explains every line. |
| PA/LOU cover | Approved payer amount does not exceed PA/LOU unless authorised amendment/override exists. |
| Benefit usage | Usage increases by approved payer share only. |
| Member liability | Copay, deductible, co-insurance, excess, excluded amounts are separated. |
| Fund balance | Self-funded drawdown equals approved payer base share. |
| Settlement | Batch/voucher/provider statement equals approved payer share only. |
| GL | Approval and settlement journals are balanced and equal expected base amounts. |
| Reports | Claims, admissions, provider statement, utilisation, fund, GL exports tie out. |

## 7. Critical Defect Triggers

Log as Critical unless product/finance has explicitly accepted the behavior in writing:

- Ineligible, suspended, lapsed, terminated, wrong-provider, wrong-branch, or expired-PA admission is paid.
- Discharge before admission, future service, duplicate HMS replay, or duplicate provider invoice creates payable money.
- Excluded, declined, member-liability, or package-included line is paid to provider.
- Bed charges double-pay overlapping ward/ICU days without an approved rule.
- PA/LOU/benefit ceiling can be exceeded without authorised approval/override.
- Same user can complete maker/checker or multi-level approval where SoD is required.
- Settlement pays the same claim twice or creates duplicate vouchers/journals.
- GL is unbalanced or settlement/payment does not reconcile to voucher/provider statement.
- Provider, member, HR, fund, or reports user can see another provider/member/group/fund outside scope.
- Raw internal errors leak to users during admission, closure, adjudication, settlement, or exports.

## 8. Exit Criteria

The inpatient journey passes UAT when:

- At least one long-stay inpatient admission completes PA/GOP -> case/LOU -> multi-day accrual -> discharge -> claim -> adjudication -> approval chain -> settlement -> GL -> reports/portals.
- Surgical, oncology/chemo, maternity, ICU/complication, transfer, and direct-claim/API/HMS scenario families are each `PASS`, `PASS WITH OBSERVATION`, or explicitly `NOT APPLICABLE - CONFIG NOT ENABLED`.
- No Critical or High defect remains open for admission eligibility, PA/LOU enforcement, bed/day charging, package pricing, duplicate billing/payment, rejected-line payment, benefit/fund/GL side effects, settlement, or RBAC scoping.
- Financial tie-out is zero or fully explained: approved payer share = benefit usage = fund drawdown where applicable = settlement paid = voucher total = GL payable cleared = provider statement/report total.
- All blocked negative scenarios leave no financial side effects.
- Remaining observations are accepted by product, medical, finance, and operations with named owner and target date.

## 9. Execution Log Template

| Scenario ID | Actor | PA/GOP/Case/LOU/Claim/Batch ID | Result | Evidence | Defect/Observation | Tester | Date/time |
|---|---|---|---|---|---|---|---|

