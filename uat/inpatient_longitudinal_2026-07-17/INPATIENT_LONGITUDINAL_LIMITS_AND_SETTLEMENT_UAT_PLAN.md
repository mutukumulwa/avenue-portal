# Inpatient Longitudinal Limits, Case Evolution, and Periodic Settlement UAT Plan

**Campaign:** Deep inpatient, high-cost, multi-day TPA UAT  
**Created:** 2026-07-17  
**Primary environment:** Disposable local, production-like clone with controlled time  
**Business timezone:** Africa/Kampala  
**Currency:** UGX unless a scenario explicitly tests FX  
**Predecessors:** `uat/inpatient_vercel/INPATIENT_E2E_SCENARIO_UAT_TEST_DOCUMENT.md` and `uat/outpatient_vercel/BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_UAT_TEST_PLAN.md`

## 1. Outcome This Campaign Must Prove

This campaign must prove that a facility, TPA, payer, member, and finance team can run a real inpatient episode over many days without losing control of clinical authorisation or money.

At every point in an admission, the facility must be able to distinguish:

1. what the provider has billed;
2. what the provider contract allows;
3. what has been pre-authorised or guaranteed;
4. what has already consumed the member's benefit;
5. what remains available under every applicable category, overall, shared-member, and shared-family limit;
6. what has been approved but not yet paid;
7. what has actually been settled;
8. what the member may lawfully owe; and
9. what the provider must write off.

The campaign is not a demonstration. It is a financial-control and operational-gap hunt. A journey is not a pass merely because it reaches `PAID`; all amounts, dates, roles, reasons, reports, holds, fund movements, journals, and audit events must reconcile.

The clinical stories and amounts in this document are fictional UAT fixtures, not treatment guidance or negotiated NWSC terms.

## 2. Non-Negotiable Rules

1. **Report gaps; do not fix them during the campaign.** Do not patch code, edit data directly, change a rule to make a test pass, or repair a failed record out of band. Preserve evidence and continue only where safe.
2. **Use a disposable environment.** Never manipulate the clock or run destructive financial scenarios against Vercel, production, a shared client tenant, or a database containing non-test records.
3. **Every actor acts as themselves.** Provider staff, medical reviewers, claims officers, finance makers/checkers, HR, fund administrators, members, and reports users use their own scoped accounts.
4. **No super-admin substitution.** If a facility step cannot be completed by a provider-scoped user, record an actor/workflow gap. The narrowest authorised operations user may continue only to preserve the rest of the test, and the workaround must be recorded.
5. **No direct DB mutation or verification after baseline.** Setup may use the approved local seed/import process before the run. Once the baseline is signed, all clinical and financial actions and all verification must use supported UI, API, reports, exports, audit views, or provider/HMS interfaces.
6. **API/HMS use is allowed only when that rail is under test.** It is not a shortcut for UI work. Every accepted API/HMS effect must be confirmed in the UI.
7. **Do not retry an uncertain money action immediately.** After a timeout on approval, closure, batch creation, or Mark Paid, inspect authoritative lists, history, vouchers, GL, fund, and provider statement before one controlled retry.
8. **One input, one disposition.** Every service entry, batch row, PA request, claim slice, and payment attempt must end as created, duplicate, voided, conflicted, rejected, or blocked. Nothing may disappear.
9. **No silent capping.** When a requested approval exceeds availability, the system must identify the binding constraint and require an explicit partial decision, decline, or authorised override.
10. **A payment message is not clinical advice.** A financial authorisation screen must never imply that emergency stabilisation should be withheld. The test assesses cover and payment control, not clinical necessity.
11. **Capture small gaps.** Missing labels, stale balances, ambiguous wording, unavailable filters, hidden reasons, awkward handoffs, and missing evidence fields are findings even when the final money is correct.
12. **Stop when impact is proven.** Do not pay a deliberately inflated or foreign-scope claim merely to strengthen an already proven Critical defect.

## 3. The Seven-Ledger Model

Maintain these values independently. A single generic “balance” is unacceptable for inpatient work.

| Symbol | Ledger | Definition | Changes when |
|---|---|---|---|
| `B` | Gross billed | Sum of non-void provider charges | A valid service entry is added or voided |
| `C` | Contract allowable | Amount payable after tariff, package, frequency, exclusion, and documentation rules, before benefit limits | Contract evaluation runs |
| `H` | Active hold / guarantee | Approved PA/GOP amount not yet consumed or released | PA approved, amended, consumed, cancelled, or expired |
| `U` | Benefit used | Final approved payer liability posted to the benefit period | Claim or interim claim is decided, not when cash is paid |
| `A` | Available for a new commitment | Minimum remaining amount across all applicable constraints after used amounts and active holds | Any claim decision, hold, reversal, expiry, or family claim changes a constraint |
| `P` | Provider payable | Approved payer liability not yet settled, net of provider write-off and member share | Claim is approved/partially approved, voided, appealed, or batched |
| `S` | Cash settled | Provider payment completed exactly once | Checker-approved batch is marked paid |

Core equations at every checkpoint:

- `B = C + contract shortfall + excluded/unpriced amount`, allowing only documented rounding.
- `C = payer-approved + benefit shortfall + member liability + provider write-off + pending/manual amount`.
- `A = min(per-visit remaining, category remaining, overall remaining, shared-member remaining, shared-family remaining)`.
- `category remaining = category limit - category used - category active holds`.
- `episode guaranteed remaining = episode PA/GOP approved - episode PA/GOP utilised - episode hold released`.
- `unsecured accrued exposure = max(0, cumulative contract allowable - episode approved to date - episode active hold)`.
- `P = sum(final approved payer liability not yet settled)`.
- `S = sum(settled voucher amounts)`.
- `settlement batch = sum(eligible approved payer liabilities included once)`.
- `GL debits = GL credits` for every journal and for the trial balance.

An episode's own active hold must be credited exactly once when its claim is decided. The same hold must not both reduce availability and block the claim it was created to secure.

## 4. What the Facility Must See Before Financially Clearing a Procedure

For every planned procedure, the provider user or facility case manager must be able to answer all of the following from a supported facility-facing workflow:

| Question | Minimum acceptable answer |
|---|---|
| Is the member eligible on the service date? | Active/inactive with coverage dates and reason |
| Is this facility and branch contracted? | Contract and branch status |
| Is the service covered? | Benefit category and covered/excluded status |
| What price/rule applies? | Tariff/package/rule, rate, quantity/frequency cap, effective version |
| Is PA, referral, or documentation required? | Requirement, status, missing item, validity |
| How much is guaranteed for this episode? | Approved, utilised, remaining, expiry, currency |
| What limits bind? | Category, overall, shared-member, shared-family, per-visit, each with limit/used/held/available |
| Is the new amount financially clear? | `Covered`, `covered up to X`, `amendment required`, `excluded`, or `manual review`, with reason |
| Who carries a shortfall? | Payer, member with lawful consent, or provider write-off |
| When will the provider be paid? | Contractual cadence and current payable/settled state |

If this information exists only in an internal TPA screen, is spread across unrelated screens, omits holds/shared limits, or cannot be accessed by a facility actor, log a gap.

## 5. Environment and Controlled-Time Protocol

### 5.1 Required Topology

Use a disposable local VM or isolated local stack containing the web application, worker, database, Redis/queues, object storage, and email/SMS test sinks. All components must use `Africa/Kampala` and the same controlled clock.

Record before execution:

| Item | Required evidence |
|---|---|
| Git commit/build | Commit hash and UI build identifier |
| Database | Fresh migration/seed result and snapshot name |
| Web and worker | Start time, timezone, health status |
| Browser profiles | One isolated profile per persona |
| Queue state | No unexplained pending jobs |
| Object/email/SMS sinks | Reachable or explicitly disabled with honest UI status |
| Clock method | VM clock or process-scoped virtual clock; exact command/config stored outside screenshots if sensitive |
| Opening snapshot | Read-only backup before Day 0 |

### 5.2 Clock Canary

On a throwaway clock-canary snapshot, set the campaign clock to `2026-07-31 06:00 EAT` and create a harmless test event through the UI. Confirm the same logical time appears in:

- UI activity/audit history;
- a PA creation timestamp and its calculated SLA deadline;
- a notification timestamp;
- a worker-generated event; and
- a settlement cycle/default date where visible.

Advance to `2026-08-01 06:00 EAT` and confirm a scheduled or SLA event advances once. If web, worker, database, or browser disagree, log `BLOCKED - TEST CLOCK INCONSISTENT`; do not trust expiry, SLA, LOS, or cycle results. If it passes, restore the pristine pre-canary snapshot, set the clock to `2026-08-01 06:00 EAT`, and begin the Boda admission. Do not rewind the mutated canary database.

### 5.3 Advancement Rules

1. Complete and evidence the day's actions.
2. Confirm no approval, closure, or payment is in flight.
3. Stop web and worker cleanly if the chosen clock mechanism requires it.
4. Snapshot the disposable database and record the queue count.
5. Advance forward only; never rewind the same database.
6. Restart all components and perform the clock canary.
7. Execute the next day's events.

Use a new snapshot branch to repeat a past day. Do not move the clock backwards on an already mutated ledger.

### 5.4 Fallback Without Time Travel

If a safe controlled clock cannot be established, use historical service dates for manual accrual and date validation. Mark PA expiry, SLA, month crossing, scheduled release, and contractual cadence tests `BLOCKED - ENVIRONMENT`. Do not mark them pass by reasoning from code or by changing only the browser date.

## 6. Required Personas and Duties

| Persona | Scope | Must perform |
|---|---|---|
| Admin setup | Tenant/client | Create only missing test users/config; freeze baseline |
| Provider reception | One facility/branch | Eligibility, admission notification, member identification |
| Provider ward billing clerk | Same facility/branch | Daily manual charges, corrections, interim bill close |
| Provider clinician/case manager | Same facility/branch | Diagnosis/procedure update, clinical documents, PA amendment request |
| Provider finance/HMS operator | Same facility/branch | HMS batch, interim invoice, remittance reconciliation |
| TPA customer service | Client/group | Member/family queries and communication |
| TPA medical officer A | Clinical | PA/GOP decision, medical review, amendment |
| TPA medical officer B | Clinical | Independent high-value/exception decision |
| Claims officer A | Claims | Intake, line adjudication, first decision |
| Claims officer B | Claims | Concurrent/stale-state and second-person tests |
| Underwriter/senior approver | Client | High-value matrix step and limit override decision |
| Fraud analyst | Tenant/client | Bed-day, duplication, variance, and unusual-frequency clearance |
| Finance maker A | Finance | Weekly/supplementary settlement creation |
| Finance maker B | Finance | Concurrent batch creation test |
| Finance checker | Finance | Independent approval and Mark Paid |
| Fund administrator | NWSC fund only | Fund balance, threshold, statement, alerts |
| NWSC HR | NWSC group only | Roster and approved utilisation view |
| Principal/member | Own family | Benefits, holds, utilisation, claim/payment notifications |
| Reports viewer | Read-only | Admissions, utilisation, provider, fund, settlement, GL exports |
| Audit/compliance viewer | Read-only | Actor/reason/time/version trace |
| System worker | System actor | SLA, hold expiry, alerts, scheduled jobs |

No user may make and check the same settlement, approve their own high-value exception, or review their own appeal.

## 7. Controlled Contract and Benefit Book

Use an explicitly labelled local-only contract book. If the UI cannot configure or display a required rule, record a configuration/product gap instead of inventing expected behaviour after the fact.

### 7.1 Core Tariffs and Rules

| Code | Service/rule | Test contract position |
|---|---|---|
| `ADM-001` | Admission fee | UGX 250,000 once per admission |
| `WARD-GEN` | General ward bed-day | UGX 250,000 per occupied day |
| `HDU-DAY` | HDU bed-day | UGX 650,000 per occupied day |
| `ICU-DAY` | ICU bed-day | UGX 1,200,000 per occupied day under V1 |
| `VENT-DAY` | Mechanical ventilation | UGX 450,000/day; separate only where contract permits |
| `ROUND-CONS` | Consultant round | UGX 150,000; maximum one payable round/day unless authorised |
| `CBC` | Full blood count | UGX 45,000; one/day without medical exception |
| `U-E` | Urea/electrolytes/creatinine | UGX 70,000; one/day without exception |
| `LFT` | Liver function tests | UGX 65,000; one/day without exception |
| `CULT-BLD` | Blood culture | UGX 120,000 per set; repeat requires clinical reason |
| `MAL-SMEAR` | Malaria microscopy | UGX 35,000; repeat permitted for response where documented |
| `CT-HEAD` | CT head | UGX 500,000; referral/PA required except emergency |
| `MRI-BRAIN` | MRI brain | UGX 1,200,000; PA required |
| `AMB-EMERG` | Emergency ambulance | UGX 800,000 per transfer; ambulance benefit |
| `CS-PKG` | Caesarean package | UGX 6,500,000; includes theatre, surgeon, anaesthesia, three routine ward days, routine newborn care for 48 hours |
| `CS-CARVE` | C-section carve-outs | ICU/HDU, transfusion, NICU, and unrelated care price separately with authorisation |
| `ORIF-FEMUR` | Femur ORIF package | Package with stated implant cap; included theatre/professional items must not unbundle |
| `BURN-GRAFT` | Burn excision/graft | Per staged procedure with quantity/date and PA amendment |
| `PHYSIO-IP` | Inpatient physiotherapy | UGX 100,000/session; frequency cap per contract |

Contract-wide controls:

- planned inpatient, maternity, surgery, MRI, and high-cost care require PA;
- emergency stabilisation is PA-exempt initially but requires retrospective notification within 24 hours;
- balance billing is prohibited unless the contract expressly permits it and written member consent is captured;
- excluded/unpriced lines do not become payable merely because the claim total is approved;
- provider contract version V1 applies to admissions starting before `2026-09-01`; V2 begins `2026-09-01` and changes at least one bed-day rate;
- the signed rule must say whether an inpatient episode is priced by admission-date version or individual line service date; the system must show which version won;
- weekly inpatient interim billing closes each Friday; the final bill closes on discharge;
- payment still requires finance maker/checker and Mark Paid;
- settled and unsettled claim slices must remain linked to one admission episode.

### 7.2 Benefit Constraints

Use separate synthetic members so scenarios do not contaminate each other except where family/concurrency is intentional.

| Fixture | Tier/overall | Key sublimit and baseline | Intended binding test |
|---|---:|---|---|
| `IP-UAT-MAT` | Management / 60M | Maternity 18M; maternity used 2M; overall used 4M | Maternity sublimit after complicated delivery |
| `IP-UAT-BODA` | Executive / 120M | Inpatient 100M used 6M; Surgical 60M used 4M; Ambulance 3M; Rehab 12M | Multi-benefit allocation and weekly claims |
| `IP-UAT-STROKE` | Management / 60M | Inpatient 50M; used 5M | Category exhaustion during a 40-day stay |
| `IP-UAT-MALARIA` | Staff / 13M | Inpatient 10M; used 1M; overall used 2M | Exact exhaustion after diagnostic admission |
| `IP-UAT-BURNS` | Executive / 120M | Overall used 20M; IP used 10M; Surgical used 5M | Overall limit binds before contract allowable |
| `IP-UAT-FOOT` | Officer / 30M | Overall used 8M; IP used 2M; Chronic used 3M | Readmission with only 4M overall remaining |

For at least one family, configure an inpatient/surgical/maternity shared-family pool and create a dependant claim while the principal has an active hold. This is the concurrency pack in Section 18.

### 7.3 Approval Matrix

| Action/value | Required path |
|---|---|
| PA/GOP up to 5M | Medical officer |
| PA/GOP 5M–20M | Medical officer + independent senior/underwriter |
| PA/GOP above 20M | Medical officer + two configured high-value steps |
| Claim approval up to configured low band | Claims officer |
| High-value or exception claim | Claims + required independent matrix steps |
| Limit override | Explicit override request; maker cannot approve |
| Settlement | Finance maker -> different finance checker -> Mark Paid |

If the configured matrix differs, record the signed configuration and calculate expected actors before execution. A UI role name alone is not proof that the server enforced the step.

## 8. Baseline Capture

Capture before Day 0 for each member and provider:

| Area | Values |
|---|---|
| Member | Status, cover dates, group, tier, principal/family links |
| Benefit | Per category: limit, used, held, available; overall and all shared pools |
| PA/GOP | None or explicitly listed pre-existing PAs/holds |
| Provider | Contract/branch status, currency, tariffs/packages, outstanding payable, settled total |
| Fund | Opening balance, minimum threshold, claims total, pending liabilities if exposed |
| Finance | Relevant GL account balances, trial balance, voucher count |
| Reports | Admission, open case, claims, utilisation, outstanding, rejected, settlement counts/totals |
| Audit | Last event/hash or equivalent reference |

Do not begin if the shadow ledger and application baseline disagree. Log the discrepancy before any scenario makes it harder to isolate.

## 9. Campaign Calendar

The controlled date mapping is deliberate: multiple admissions overlap, the month changes, a contract version changes, settlements recur, and one case is readmitted.

| Controlled date | Main events |
|---|---|
| Sat 2026-08-01 | Boda emergency admission |
| Mon 2026-08-03 | Maternity admission; planned PA/GOP and LOU |
| Fri 2026-08-07 | First interim billing/settlement checkpoint |
| Sat 2026-08-08 | Malaria diagnostic admission and stroke/cardiac-arrest admission |
| Mon 2026-08-10 | Maternity discharge/final bill |
| Sat 2026-08-15 | Major burns admission |
| Every Friday | Close interim bill slices, adjudicate, settle eligible amounts, reconcile all ledgers |
| Wed 2026-08-19 | Boda discharge/final bill |
| Sat 2026-08-22 | Diabetic-foot admission |
| Mon 2026-08-31 | Month-end open-case and outstanding exposure snapshot |
| Tue 2026-09-01 | Contract V2 effective; existing and new admissions must resolve correctly |
| Tue 2026-09-08 | Diabetic-foot first discharge |
| Tue 2026-09-15 | Diabetic-foot readmission |
| Fri 2026-09-18 | Stroke discharge/final bill |
| Wed 2026-09-30 | Burns discharge/final bill and campaign financial close |

## 10. Standard Daily Case Script

Repeat this for every case day, even when the only care is bed-day, round, medication, and monitoring.

| Step | Actor | Action | Required result |
|---|---|---|---|
| D1 | Provider reception/case manager | Re-check member, facility, benefit, PA/GOP, LOU, and available limits | Current values; no stale snapshot |
| D2 | Clinician/case manager | Record diagnosis/procedure/level-of-care change and supporting documents | Timeline retains prior and new clinical state |
| D3 | Ward billing/HMS | Enter each service with actual date, code, quantity, unit, and source reference | Correct case; no future/post-discharge entry |
| D4 | System | Recalculate gross accrued and contract-allowable exposure | Void/duplicate/excluded/package logic visible |
| D5 | Provider case manager | Review guarantee remaining and unsecured exposure | Clear amendment warning before guarantee is exceeded |
| D6 | TPA medical/claims | Review exceptions and any amendment request | Actor, reason, amount, validity, SLA and decision logged |
| D7 | Member/HR/fund/provider | Verify only permitted visibility | No privacy/scope leakage |
| D8 | Tester | Record shadow-ledger row and evidence | All seven ledgers captured |

An entry range such as “D9–D13 ward” in the scenario tables means five separately dated entries, not quantity five on one date. This is required to test daily rate, overlap, time zone, and contract-version behavior.

## 11. Standard Friday Interim Billing and Settlement Script

The intended business outcome is periodic settlement without closing the clinical episode.

1. Provider finance freezes a Friday cut-off and creates an immutable interim bill slice for services not previously billed.
2. The case remains open; future services continue to accrue without changing the frozen slice.
3. The slice retains admission/case linkage, its own invoice reference, service dates, benefit allocation, PA/LOU linkage, and prior-slice references.
4. Claims officer adjudicates the slice line-by-line against the contract version and available limits.
5. The decision converts only the amount of hold consumed by that slice. Residual episode hold remains visible and usable; unrelated holds are untouched.
6. Benefit `used` increases on decision. Cash settlement must not consume benefit a second time.
7. Finance maker creates the weekly/supplementary provider batch. It includes only eligible approved payer liabilities once.
8. A different checker approves and marks paid. Exactly one voucher and one settlement journal are created.
9. Provider portal shows billed-to-date, approved-to-date, paid-to-date, outstanding, disallowed, member share, write-off, and remaining guarantee.
10. Member benefit, fund, GL, provider statement, reports, and audit are reconciled.

If the product supports only a single final claim from a case, only monthly cycle fields, or no interim bill linked to an open case, record the gap. Do not create unlinked direct claims as a workaround and call the periodic path passed.

## 12. Scenario 1 — Complicated Maternity, Emergency C-Section, and Newborn Jaundice

**Fixture:** `IP-UAT-MAT`  
**Admission:** 2026-08-03  
**Mother discharge:** 2026-08-10  
**Opening maternity:** limit 18M, used 2M, available 16M; overall used 4M  
**Initial PA/GOP:** 12M maternity  
**Initial LOU:** 12M  
**Expected mother totals:** gross billed 17.4M; contract allowable 14.2M; payer 14.2M; post-claim maternity used 16.2M; remaining 1.8M  
**Newborn complication:** separate gross/allowed fixture, expected allowed 2.4M under the signed newborn rule

| Day/date | Clinical/billing event | Gross increment | Contract allowable | Cumulative gross / allowable | Authorisation/control |
|---|---|---:|---:|---:|---|
| D0 · Aug 03 | Admission, obstetric review, CTG, CBC, blood group/crossmatch, first ward day | 1.2M | 1.0M | 1.2M / 1.0M | Planned PA approved before admission; hold 12M |
| D1 · Aug 04 | Induction, monitoring, consultant round, medication | 0.8M | 0.7M | 2.0M / 1.7M | Normal-delivery plan still active |
| D2 · Aug 05 | Obstructed labour -> emergency C-section package | 8.4M | 6.5M | 10.4M / 8.2M | Amend procedure/diagnosis; prevent package unbundling |
| D3 · Aug 06 | Postpartum haemorrhage, transfusion, repeat CBC/U&E, HDU review | 3.2M | 2.7M | 13.6M / 10.9M | Complication carve-out, documentation and quantity checks |
| D4 · Aug 07 | HDU/ICU monitoring and consultant care | 1.8M | 1.6M | 15.4M / 12.5M | Existing 12M guarantee exceeded; request top-up before further non-emergency financial clearance |
| D5 · Aug 08 | Step-down ward, medication, repeat labs | 0.9M | 0.8M | 16.3M / 13.3M | PA/GOP total becomes 14.2M after independent approval |
| D6 · Aug 09 | Ward, lactation review, discharge planning | 0.6M | 0.5M | 16.9M / 13.8M | No duplicate routine newborn charge inside package |
| D7 · Aug 10 | Final round, discharge medication and summary | 0.5M | 0.4M | 17.4M / 14.2M | Final slice; close mother case only after discharge data complete |

Mandatory probes:

- convert the planned normal-delivery request to emergency C-section without losing the earlier clinical trail;
- ensure normal-delivery and C-section packages are not both paid;
- enforce package inclusions while pricing haemorrhage/HDU carve-outs correctly;
- verify the facility sees the maternity, overall, and family constraints before PA top-up;
- attempt a 4M top-up when only 4M was newly available before the episode's own hold is credited; verify no double-count or false block;
- create/register the newborn through the supported membership path, never by charging newborn care to the mother merely because no newborn member exists;
- separate routine newborn care included in the mother package from neonatal jaundice/phototherapy;
- prove mother and newborn cases/claims are linked where the policy requires, while benefits and privacy remain distinct;
- after final approval, release any unused residual episode hold unless the signed rule explicitly keeps it for a defined postpartum period;
- confirm a maternity waiting-period and non-eligible-member negative case leaves no money side effects.

## 13. Scenario 2 — Boda-Boda Polytrauma With Multiple Surgeries and Transfer Through ICU/HDU/Ward

**Fixture:** `IP-UAT-BODA`  
**Admission:** 2026-08-01  
**Discharge:** 2026-08-19  
**Expected totals:** gross billed 61.1M; contract allowable 49.6M  
**Expected allocation:** ambulance 0.8M; surgical 19.6M; inpatient 27.4M; rehabilitation 1.8M  
**Expected interim slices:** 34.4M, 10.1M, 5.1M

| Day/date | Event | Gross | Allowable | Cumulative gross / allowable | Control focus |
|---|---|---:|---:|---:|---|
| D0 · Aug 01 | Ambulance, resuscitation, trauma labs, CT/X-rays, chest tube, ICU admission | 10.0M | 8.5M | 10.0M / 8.5M | Emergency PA exemption; notification within 24h; ambulance bucket |
| D1 · Aug 02 | ORIF femur, theatre, anaesthesia, implant, ICU/ventilation | 14.0M | 11.5M | 24.0M / 20.0M | Package inclusions and implant cap |
| D2 · Aug 03 | ICU, ventilation, labs, consultant round | 4.0M | 3.2M | 28.0M / 23.2M | Daily caps; no duplicate round |
| D3 · Aug 04 | ORIF radius/ulna or second staged fixation, ICU | 8.0M | 6.5M | 36.0M / 29.7M | Second procedure needs amendment; separate date/package |
| D4 · Aug 05 | ICU-to-HDU transfer | 2.5M | 2.0M | 38.5M / 31.7M | Same-day ICU/HDU overlap must flag and require transfer evidence |
| D5 · Aug 06 | HDU, medication, labs | 1.8M | 1.5M | 40.3M / 33.2M | Bed-day and frequency rules |
| D6 · Aug 07 | Ward, drugs, labs, consultant round | 1.5M | 1.2M | 41.8M / 34.4M | **Friday interim slice 1** |
| D7 · Aug 08 | Ward and wound review | 1.3M | 1.1M | 43.1M / 35.5M | New slice; prior slice immutable |
| D8 · Aug 09 | Wound debridement/theatre | 4.5M | 3.6M | 47.6M / 39.1M | Amendment, documentation, unbundling |
| D9 · Aug 10 | Ward, antibiotics, CBC | 1.4M | 1.1M | 49.0M / 40.2M | Lab frequency and drug coverage |
| D10 · Aug 11 | Follow-up imaging | 1.6M | 1.2M | 50.6M / 41.4M | Referral/PA and tariff |
| D11 · Aug 12 | Ward, labs, drugs | 1.4M | 1.1M | 52.0M / 42.5M | Available limits rechecked |
| D12 · Aug 13 | Ward and physiotherapy | 1.3M | 1.0M | 53.3M / 43.5M | Rehab allocation/frequency |
| D13 · Aug 14 | Ward and physiotherapy | 1.3M | 1.0M | 54.6M / 44.5M | **Friday interim slice 2 = 10.1M** |
| D14 · Aug 15 | Ward and wound care | 1.3M | 1.0M | 55.9M / 45.5M | No reused invoice line |
| D15 · Aug 16 | Ward and physiotherapy | 1.4M | 1.1M | 57.3M / 46.6M | Rehab cap |
| D16 · Aug 17 | Brace, medication, ward | 2.0M | 1.6M | 59.3M / 48.2M | Durable item cap/document |
| D17 · Aug 18 | Ward and discharge planning | 1.0M | 0.8M | 60.3M / 49.0M | Remaining guarantee |
| D18 · Aug 19 | Final review, medicine, discharge | 0.8M | 0.6M | 61.1M / 49.6M | **Final slice 3 = 5.1M** |

Mandatory probes:

- provider submits emergency notification, not a fabricated pre-admission PA;
- separate PA/GOP components and benefit allocations for ambulance, surgery, inpatient, and rehabilitation remain visible;
- a case-level “INPATIENT” choice must not charge the entire 49.6M to inpatient if the signed benefit book allocates 22.2M elsewhere;
- same-day ICU-to-HDU transition requires timestamps/transfer evidence and must not silently pay two full bed days;
- the week-1 slice settles while the clinical case stays open; week-2 and final slices must not rebill week-1 services;
- provider sees paid-to-date 34.4M after run 1, then 44.5M, then 49.6M, with outstanding and disallowed amounts separately;
- a direct duplicate claim for one already sliced service must be detected across the case/direct-claim rails;
- each weekly settlement has an independent invoice reference, claim reference, voucher, and case link;
- final close reconciles all slices to the complete case without creating a second all-inclusive 61.1M claim.

## 14. Scenario 3 — Massive Stroke With Cardiac Arrest, Ventilation, ICU, HDU, Ward, and Limit Exhaustion

**Fixture:** `IP-UAT-STROKE`  
**Admission:** 2026-08-08  
**Discharge:** 2026-09-18  
**Opening inpatient limit:** 50M; used 5M; available 45M  
**Expected totals:** gross 76M; contract allowable 59M; payer 45M; benefit shortfall 14M; contract shortfall 17M  
**Expected payer by slice:** 20M, 15M, 9M, 1M, 0, 0

| Period | Required separately dated clinical entries | Gross | Allowable | Authorisation and limit checkpoint |
|---|---|---:|---:|---|
| W1 · Aug 08–14 | Resuscitation, CT, thrombolysis decision record where applicable, ICU days, ventilation, arterial line, daily labs, medication | 25M | 20M | Initial PA/GOP 25M; first Friday slice consumes 20M; residual hold 5M; used becomes 25M |
| W2 · Aug 15–21 | Continued ICU/ventilation, aspiration pneumonia workup, cultures, tracheostomy, renal monitoring/dialysis if documented | 18M | 15M | Amend by 10M; Friday slice consumes remaining 15M guarantee; used becomes 40M |
| W3 · Aug 22–28 | ICU-to-HDU, weaning, feeding support, imaging, daily reviews | 12M | 9M | Approve 9M; used becomes 49M; available becomes 1M |
| W4 · Aug 29–Sep 04 | HDU-to-ward, complications review, physiotherapy, speech/swallow care | 10M | 7M | 7M request must disclose only 1M benefit headroom; explicit 1M partial or decline; used becomes 50M |
| W5 · Sep 05–11 | Ward nursing, rehabilitation, nutrition, pressure-area care | 8M | 6M | Benefit exhausted; no new payer guarantee; record non-payable disposition without hiding care |
| W6 · Sep 12–18 | Ward, caregiver training, final rehabilitation/discharge | 3M | 2M | Zero payer settlement; final reconciliation and discharge |

Mandatory probes:

- the facility's available limit falls as earlier slices are approved even though later cash settlement may still be pending;
- PA top-up approval must not exceed the category/overall/shared constraint;
- at 1M remaining, a 7M request identifies `INPATIENT annual sublimit` as binding and offers only an explicit partial path;
- after exhaustion, eligibility must not continue showing the original annual amount or ignore used/held values;
- emergency care remains clinically recorded while the financial status clearly states no additional guarantee;
- member liability versus provider write-off follows the signed balance-billing policy and written consent requirements;
- a contract rate change on Sep 1 resolves using the signed inpatient effective-date rule, with the winning V1/V2 version visible on each relevant line/slice;
- ICU/HDU/ward days are mutually reconciled; transfer days are explained, not automatically double-paid;
- repeat imaging, labs, and rounds meet frequency/documentation rules;
- reports show the admission as open at Aug month-end, with 44M/45M or the correct approved-to-date position—not the final 59M allowable;
- final close releases any unusable residual hold and does not restore already consumed benefit.

## 15. Scenario 4 — Severe Febrile Illness, Diagnostic Uncertainty, and Confirmed Falciparum Malaria

**Fixture:** `IP-UAT-MALARIA`  
**Admission:** 2026-08-08  
**Discharge:** 2026-08-19  
**Opening inpatient:** 10M limit, 1M used, 9M available  
**Expected totals:** gross 12.6M; contract allowable 9M; payer 9M; post-claim inpatient exhausted

| Day | Clinical investigation/treatment entry set | Gross | Allowable | Cumulative gross / allowable |
|---|---|---:|---:|---:|
| D0 | Admission, CBC, U&E, LFT, malaria RDT/smear, blood cultures, urinalysis, IV access, first medication | 2.2M | 1.7M | 2.2M / 1.7M |
| D1 | Review, CBC/U&E, lactate, repeat smear if justified, fluids/antimalarial | 1.5M | 1.1M | 3.7M / 2.8M |
| D2 | Persistent fever: chest X-ray, cultures review, CBC, medication | 1.4M | 1.0M | 5.1M / 3.8M |
| D3 | AKI monitoring: U&E, urine output, consultant round, drugs | 1.1M | 0.8M | 6.2M / 4.6M |
| D4 | Liver/renal monitoring, smear response, ward care | 1.0M | 0.7M | 7.2M / 5.3M |
| D5 | CBC/U&E, medication, ward and round | 0.9M | 0.6M | 8.1M / 5.9M |
| D6 | Ultrasound or targeted imaging, ward and medication | 1.0M | 0.7M | 9.1M / 6.6M |
| D7 | Ward, CBC, medication | 0.8M | 0.55M | 9.9M / 7.15M |
| D8 | Ward, renal monitoring, medication | 0.8M | 0.55M | 10.7M / 7.70M |
| D9 | Ward and review | 0.7M | 0.45M | 11.4M / 8.15M |
| D10 | Ward and discharge planning | 0.6M | 0.40M | 12.0M / 8.55M |
| D11 | Final review, discharge medication/summary | 0.6M | 0.45M | 12.6M / 9.0M |

Mandatory probes:

- initial diagnosis is fever/sepsis under investigation; final diagnosis becomes severe falciparum malaria with complications without erasing the earlier differential;
- provider and TPA can see which tests are covered, frequency-capped, duplicated, or awaiting medical justification;
- replay one entire HMS batch; no lab or ward charge doubles;
- submit one same-day duplicate CBC with a different description and one legitimate next-day CBC; the first is flagged/shortfalled, the second is eligible under the rule;
- submit an unmatched/unsupported test; it routes with a named reason and never inherits the claim's overall approval;
- first guarantee covers 6.5M; amendment before the next slice covers only the remaining 2.5M;
- the final 9M approval exhausts inpatient exactly—no negative balance, rounding drift, or residual hold;
- member, provider, and reports explain why 3.6M gross did not become payer liability.

## 16. Scenario 5 — Major Burns With Serial Debridement, Grafting, Infection, and Rehabilitation

**Fixture:** `IP-UAT-BURNS`  
**Admission:** 2026-08-15  
**Discharge:** 2026-09-30  
**Opening overall:** 120M limit, 20M used, 100M available  
**Expected totals:** gross 145M; contract allowable 108M; payer maximum 100M; limit shortfall 8M  
**Expected payer by week:** 22M, 18M, 20M, 16M, 14M, 10M, 0

| Period | Major events; still enter every bed-day/round separately | Gross | Allowable | Control focus |
|---|---|---:|---:|---|
| W1 · Aug 15–21 | Emergency stabilisation, burn assessment, ICU/ventilation, first debridement, fluids, labs, dressings | 30M | 22M | Initial 30M PA/LOU; emergency notification; consumable quantities |
| W2 · Aug 22–28 | Tangential excision and first graft, ICU, blood products, cultures | 25M | 18M | Staged procedure amendment; package/FFS rule; unbundling |
| W3 · Aug 29–Sep 04 | Infection/sepsis treatment, repeat debridement, ICU/HDU transfer | 27M | 20M | New procedure, culture/drug justification; bed overlap |
| W4 · Sep 05–11 | Second graft, HDU, high-cost dressings, nutrition | 22M | 16M | Quantity caps and documentation |
| W5 · Sep 12–18 | Ward, graft review, dressing changes, physiotherapy | 18M | 14M | Episode approved reaches 90M; overall used reaches 110M; 10M remains |
| W6 · Sep 19–25 | Ward and rehabilitation | 15M | 12M | Only 10M overall remains; explicit 10M partial; limit now exhausted |
| W7 · Sep 26–30 | Final ward/rehab/discharge | 8M | 6M | No payer guarantee; correct shortfall/write-off disposition |

Mandatory probes:

- multiple staged procedures require dated authorisation changes, not one vague evergreen PA;
- consumable/dressing quantities are auditable and cannot be multiplied by batch replay;
- procedure packages do not absorb unrelated ICU or infection care unless the contract says so;
- overall annual limit binds even while IP and surgical category sublimits each appear to have room;
- at W6, the system returns the overall constraint and permits only an explicit 10M payer decision;
- W7 cannot enter settlement, but remains visible as a complete, reasoned financial disposition;
- an approved spouse/dependant claim during the burn admission updates a configured shared-family pool immediately and cannot double-spend with the burn PA amendment;
- the admission spans the Sep 1 contract change and month-end reporting;
- a 100+ line final episode remains usable, paginated, exportable, and performant.

## 17. Scenario 6 — Diabetic Foot Osteomyelitis, Serial Debridement/Amputation, and Readmission

**Fixture:** `IP-UAT-FOOT`  
**First admission:** 2026-08-22 to 2026-09-08  
**Readmission:** 2026-09-15 onward  
**Opening overall:** 30M limit, 8M used, 22M available  
**Expected first admission:** gross 23M; contract allowable/payer 18M  
**Expected readmission:** gross 10M; contract allowable 8M; payer only 4M because 4M overall remains

| Period | Events | Gross | Allowable | Expected payer |
|---|---|---:|---:|---:|
| First W1 · Aug 22–28 | Infection workup, MRI/vascular studies, IV antibiotics, first debridement, ward | 10M | 8M | 8M |
| First W2 · Aug 29–Sep 04 | Repeat debridement or limited amputation, cultures, drugs, ward | 8M | 6M | 6M |
| First W3/final · Sep 05–08 | Wound care, physiotherapy, discharge medication | 5M | 4M | 4M |
| Readmission | Recurrent infection/wound breakdown, procedure, ward | 10M | 8M | 4M explicit partial |

Mandatory probes:

- contract/benefit allocation across chronic disease, surgical, inpatient, imaging, and rehabilitation follows the signed policy rather than the case header alone;
- the readmission is not rejected as a duplicate merely because diagnosis/provider are the same;
- it is linked as a readmission/new episode with its own dates, PA, LOU, claim slices, and audit trail;
- prior admission payment is never reversed or rebilled merely by opening the readmission;
- only 4M overall headroom remains after the first 18M, even if the readmission's chosen category shows 8M+ room;
- a same-day duplicate invoice and a corrected resubmission after decline are distinguishable;
- reports identify 7/30-day readmission, total episode cost, payer share, and remaining limit without exposing excessive diagnosis detail to HR.

## 18. Adversarial Limit and Concurrency Pack

Run these on snapshot branches so one failure does not contaminate the other scenarios.

| ID | Probe | Expected result |
|---|---|---|
| LIM-01 | Two medical officers approve PAs that each fit the same remaining 10M, within one second | At most one consumes the last amount; loser receives conflict/recomputed availability; no 20M combined hold |
| LIM-02 | PA approval and unrelated claim decision race for the same member/category | Serializable outcome; combined used+held never exceeds limit |
| LIM-03 | Principal burn amendment and dependant inpatient claim race against a shared-family pool | One deterministic winner/partial path; family pool never overspent |
| LIM-04 | Open two browser tabs with stale 10M available; approve 8M in tab A then 8M in tab B | Tab B rechecks current balance server-side and cannot use stale UI |
| LIM-05 | A PA's own 8M hold exists; decide its 8M claim when displayed new availability is 0 | Claim passes by converting its own hold exactly once; no false exhaustion |
| LIM-06 | Attach two PAs totaling 12M to a 10M claim | Consume only 10M in documented order; residual 2M remains or releases per policy; no extra usage |
| LIM-07 | Expire a PA while worker is stopped, then query availability | Read path excludes provably expired hold; no worker-dependent over-reservation; audit/worker later reconciles once |
| LIM-08 | Cancel case with active PA/LOU | Holds and attachment states follow policy; no used amount or payable created |
| LIM-09 | Void approved-not-settled slice | Usage, payable, fund/GL effects reverse once; hold disposition is explicit |
| LIM-10 | Attempt void after settlement | Controlled recovery/offset path required; no destructive erasure |
| LIM-11 | Benefit period renews during a long stay | Signed service-date/admission-date policy selects period; no arbitrary use of decision/settlement date |
| LIM-12 | Per-visit limit is lower than category and overall remaining | Per-visit is named binding; category balance is not misleadingly presented as spendable for the claim |

Any negative available balance, silent cap, lost hold, double conversion, stale approval, or over-limit payment is Critical.

## 19. Contract, Package, and Procedure Controls

| ID | Probe | Expected result |
|---|---|---|
| CON-01 | Bill included C-section theatre/surgeon/anaesthesia separately | Included lines are absorbed/shortfalled; not paid on top of package |
| CON-02 | Bill ICU/HDU complication excluded from package | Prices separately only with required PA/documentation |
| CON-03 | Bill ward and ICU full day on transfer date | Flag/block pending authorised transfer-day decision; no silent double-pay |
| CON-04 | Two consultant rounds same day | Frequency cap or medical exception with reason/actor |
| CON-05 | Unknown CPT with familiar description | Manual/unpriced route; claim header approval cannot make it payable |
| CON-06 | Correct CPT with misleading description | Code/description mismatch warning; human review |
| CON-07 | Implant above cap | Payable cap, provider write-off/member rule visible |
| CON-08 | Excluded drug mixed with covered lines | Excluded line remains zero payer liability and out of settlement |
| CON-09 | Missing referral/document | Named pending/reject reason; remediation path; no silent full approval |
| CON-10 | Contract suspended mid-stay | Historical service/admission rule applied; new services route exactly as signed |
| CON-11 | Contract V2 starts Sep 1 while case remains open | Correct version pinned/resolved and visible; no repricing of settled slices without adjustment workflow |
| CON-12 | Backdated tariff amendment after two slices settled | Impact report/adjustment proposal; no silent rewrite of paid claims |
| CON-13 | Balance-billing prohibited | Shortfall maps to provider write-off unless explicit permitted member liability and consent |
| CON-14 | PA approved above tariff/package | Guarantee is a ceiling, not permission to pay above contract |

## 20. Case Accrual, HMS, and Data-Integrity Pack

| ID | Probe | Expected result |
|---|---|---|
| CASE-01 | Provider actor opens and updates own inpatient case | Supported within facility scope; otherwise actor gap logged |
| CASE-02 | Open case with diagnosis, branch, admission, expected discharge, estimate | All fields persist and remain updateable with history |
| CASE-03 | Add entry before admission, after discharge, and future to server clock | Each blocked/quarantined; no accrual |
| CASE-04 | Legitimate back-entry inside stay with reason | Allowed/audited per policy; not confused with future fraud |
| CASE-05 | Void line with entered reason | Amount leaves accrued total; original remains visible; reason required |
| CASE-06 | Correct quantity/price without delete | Version/void-and-replace trail; no invisible rewrite |
| CASE-07 | Manual and HMS add same service | Cross-source duplicate warning; no double amount |
| CASE-08 | Replay exact HMS batch | Idempotent; applied+duplicate+conflict+rejected=input count |
| CASE-09 | HMS batch contains valid, unmatched, malformed, and closed-case lines | Valid survives; each other row has reviewable disposition; no whole-batch crash |
| CASE-10 | Facility A key submits Facility B code/case | Rejected before case lookup; no cross-facility write |
| CASE-11 | Member fallback has two open cases at facility | Ambiguous exception; no arbitrary case selection |
| CASE-12 | Late HMS line arrives after interim slice and after final close | Exception/adjustment workflow; no mutation of paid slice |
| CASE-13 | Close case from two tabs | Exactly one final close; no duplicate final claim |
| CASE-14 | Reopen/modify closed case | Controlled adjustment only; financial facts immutable |
| CASE-15 | Diagnosis evolves during stay | Timeline/history preserved; final claim receives correct diagnoses |
| CASE-16 | Documents and activity | Case shows uploads, PA/LOU decisions, voids, transfers, amendments, and actors |

## 21. Periodic Settlement and Finance Pack

| ID | Probe | Expected result |
|---|---|---|
| SET-01 | Create first Friday slice while case remains open | Immutable slice linked to open case; future accrual remains possible |
| SET-02 | Create second slice | Contains only new unbilled lines; prior lines excluded by identity, not description guess |
| SET-03 | Final close after two paid slices | Final claim/bill includes only residual payable or reconciles prior slices without double billing |
| SET-04 | Finance batch cadence | Contractual weekly cycle visible and enforceable; monthly-only UI is a gap |
| SET-05 | Batch mixes outpatient and inpatient | Separation follows contract/cadence/report policy; tester can reconcile each class |
| SET-06 | Two makers create same provider/cut-off batch concurrently | Claims enter one batch only; loser gets current-state message |
| SET-07 | Claim approved just after cut-off | Deterministic next/supplementary run; not stranded |
| SET-08 | Claim changes/fraud flag after batching | Batch revalidates or blocks; checker sees changed amount/status |
| SET-09 | Maker self-approves | Server blocks; no status/money side effect |
| SET-10 | Checker approves but payment response is interrupted | Inspect first; one controlled retry yields exactly one settlement/voucher/GL posting |
| SET-11 | Mark Paid twice/concurrently | One winner; no duplicate voucher, bank credit, or notification |
| SET-12 | Reject batch | Claims release to correct payable state; replacement batch totals match |
| SET-13 | Mixed currencies | Separate batches or fail closed; no raw sum |
| SET-14 | Fund below threshold/insufficient | Signed policy enforced; alert and decision clear; no negative unexplained fund |
| SET-15 | 250 claims / high line count | Completes without timeout/stranded status; totals exactly reconcile |

Accounting timing must be signed before execution. The application may recognise benefit usage and claim liability at approval while cash settles later, but it must not label a liability-reserved fund value as cash paid or deduct the same amount again at settlement.

## 22. Effective-Date, Expiry, and Worker Pack

| ID | Clock event | Expected result |
|---|---|---|
| TIME-01 | PA SLA passes without decision | Escalates once to correct role; original request intact |
| TIME-02 | PA `validUntil` passes unused | PA expires; hold no longer reduces live availability; notifications/audit correct |
| TIME-03 | LOU validity passes during open stay | Facility and TPA see expiry before new clearance; amendment path required |
| TIME-04 | Midnight EAT service entry | Correct date across browser/server/database; no prior/next-day drift |
| TIME-05 | Friday cut-off at 23:59:59 and Saturday 00:00 | Deterministic slice inclusion |
| TIME-06 | Aug month-end | Open cases, approved-to-date, outstanding, fund, and GL report correctly |
| TIME-07 | Sep contract effective date | New versus existing admission follows signed version rule |
| TIME-08 | Worker down across hold expiry | Read surface remains safe; restart reconciles idempotently |
| TIME-09 | Run expiry/escalation jobs twice | No duplicate release, alert, notification, or audit side effect |
| TIME-10 | Benefit anniversary during stay | Correct period and no double annual benefit |

## 23. Portal, Privacy, and Communication Pack

For every created PA, case, claim slice, batch, and report, test list visibility and direct URL access.

| Actor | Must see | Must not see |
|---|---|---|
| Provider | Own member financial-clearance data, own cases/claims/settlements | Other providers, unrelated members, internal fraud notes, fund/GL secrets |
| Member/principal | Own/family benefits, holds, decisions, permitted reasons | Provider write-off negotiation, internal fraud/medical notes, other families |
| HR | Own group roster and policy-approved utilisation | Detailed diagnoses/notes, other groups/clients |
| Fund admin | Assigned fund balance, claims and statements | Other funds, provider credentials, unnecessary clinical detail |
| Reports viewer | Approved read-only reports | Mutation controls, secrets, health-vault/private documents |
| Claims/medical | Required clinical/financial work | Settlement/bank actions outside permission |
| Finance | Payment facts and minimum claim context | Unnecessary clinical notes/health-vault data |

Communication probes:

- PA submitted, approved, partially approved, declined, amended, expired;
- limit nearing threshold and exhausted;
- interim claim approved/declined and final claim;
- payment completed;
- dependant/newborn event routed to the correct policy holder;
- missing document or provider action required;
- fund threshold alert;
- no duplicate message on retry;
- deep links remain scoped after sign-out/sign-in as another actor;
- SMS/email stubs or delivery failures are shown honestly and never fake success.

## 24. Reporting and Audit Reconciliation

Run after every Friday and final close:

| Output | Must reconcile to |
|---|---|
| Open admissions/cases | Current cases, admission dates, LOS, current level of care |
| Accrued exposure | Gross and contract-allowable to date, not merely final claims |
| PA/GOP/LOU register | Approved, utilised, residual, expiry, case/member/provider |
| Benefit utilisation | Used by category/overall/shared pool; holds separate |
| Exceeded limits | Requested, binding constraint, partial/declined amount, disposition |
| Provider outstanding | Approved unpaid payer liability only |
| Provider remittance | Settled slices and voucher references once |
| Fund statement | Signed liability/cash timing and exact base amounts |
| GL/trial balance | Approval and settlement journals, balanced |
| Claims/admissions | Case and all interim/final claim links; no double episode total |
| Readmission | Prior/new episode relationship and costs |
| Rejected/excluded | Reasons and amounts absent from settlement |
| Productivity/SLA | Correct actor and time under controlled clock |
| Audit | Actor, role, old/new state, amount, reason, contract/matrix version, timestamp |

CSV and PDF exports must match on-screen totals and preserve currency, full precision, filters, and period boundaries. Formula-like text beginning `=`, `+`, `-`, or `@` must not become an active spreadsheet formula where exports may be opened in office software.

## 25. Mandatory Retest of Prior Inpatient Findings

Do not infer closure from code changes. Re-run each on the deployment of record and link new evidence to the old ID.

| Prior ID/observation | Retest |
|---|---|
| `IP-DEF-01` | Approve PA with reviewer notes; no crash or raw schema leak; note persists/audits |
| `IP-DEF-02` | Future, pre-admission and post-discharge entries blocked without accrual |
| `IP-DEF-03` | Approval and settlement mutations return a truthful response, refresh, and apply once |
| `IP-DEF-04` | Same-day ward/ICU or ICU/HDU double bed-day hard-flags/blocks pending authorised resolution |
| `IP-DEF-05` | Malformed/unknown-facility HMS batches show friendly row/batch errors; valid rows conserved |
| `IP-DEF-06` | Exhausted and near-limit members cannot be paid above the binding limit; explicit partial path works |
| `OBS-IP-1` | Pre/post PA benefit panel uses a consistent named constraint basis |
| `OBS-IP-CUR` | PA, case, claim, settlement, member, provider, fund, GL all show UGX consistently |
| `OBS-IP-PA-HOLD` | Residual hold after final episode follows signed release policy and is visible |
| `OBS-IP-GL` | Claim approval accrual and settlement clearing reconcile; payable account has explainable balance |
| `OBS-IP-TARIFF` | ICU/ward/procedure tariffs match reliably and expose source/version |
| `OBS-IP-CONTRACT-CONFIG` | Package-provider eligibility and digital-contract linkage are actually configured and exercisable |

## 26. Current-Build Mandatory Probes

These are source-informed watchpoints, not pre-declared UAT failures. Execute them through the product and log the observed result.

1. Can a provider-scoped user open and manage an inpatient case, or is case work restricted to a broad operations role?
2. Does provider eligibility show category, overall, family/shared limits and active holds, or only a gross annual figure?
3. Can the facility see contract coverage, tariffs, required PA, exclusions, and guarantee remaining before adding a service?
4. Can a case's diagnosis, expected discharge, discharge date, branch, estimate, and care level evolve with history?
5. Are daily service-entry dates preserved through the filed claim and contract trace?
6. Can one admission produce linked interim claims/slices while remaining open, or only one final claim?
7. Can mixed benefit categories be allocated line-by-line inside one episode?
8. Does PA attachment enforce validity window, member, facility, branch, benefit, service/component, and residual amount?
9. Does the LOU show utilised and remaining ceiling, enforce expiry, and prevent over-commitment?
10. Is inpatient settlement cadence genuinely weekly/contract-driven, or only a monthly cycle selector with supplementary runs?
11. Can provider statements separate billed, allowable, approved, member share, write-off, outstanding, and settled-to-date?
12. Are documents and the full activity timeline visible on the open case?
13. Do closed cases remain immutable while late bills enter a controlled adjustment path?
14. Is fund movement labelled as approval-time liability versus settlement-time cash consistently?
15. Does settlement selection avoid silently mixing outpatient and inpatient contractual cadences?
16. Do provider claim/case forms expose all configured inpatient, surgical, ambulance, maternity, chronic, and rehabilitation benefit choices and reject impossible service/benefit combinations?

## 27. Gap and Defect Classification

| Severity | Use when | Examples in this campaign |
|---|---|---|
| **Critical** | Direct overpayment, double-spend, privacy breach, financial ledger corruption, unauthorised approval/payment, or future/duplicate/excluded care becomes payable | Over-limit claim paid; two concurrent holds exceed limit; same slice paid twice; cross-provider case write; GL unbalanced |
| **High** | Core inpatient control or handoff is unavailable/unsafe and creates material leakage or operational uncertainty | Facility cannot see usable limits/holds; no interim billing for required cadence; PA/LOU ceiling not enforced; valid case work lost; payment timeout has unknown outcome |
| **Medium** | Recoverable but material ambiguity, stale information, reporting/notification gap, or manual reconciliation burden | Stale case accrued total; missing audit detail; wrong outstanding classification; unclear shortfall owner |
| **Low** | Small copy, layout, filter, evidence, or usability issue without immediate money/privacy risk | Missing tooltip, poor column label, awkward date formatting |
| **Observation** | Behaviour needs a signed business decision but no expected rule exists yet | Admission-date versus line-date contract version not contractually decided |
| **Blocked** | Environment/config/access prevents execution | No safe test clock; package-provider linkage missing; actor cannot reach workflow |

A missing feature is still a gap. Do not mark `NOT APPLICABLE` merely because the current product cannot perform a required TPA operation.

## 28. Finding Record — One Row Per Gap

Every gap, however small, gets its own row in `GAP_REGISTER_TEMPLATE.csv` with:

- unique ID and scenario/step;
- observed date/time and controlled clock;
- environment/build;
- actor, role, client/group, provider/branch;
- member fixture and case/PA/LOU/claim/batch/voucher references;
- exact input and pre-state;
- expected result and source of expectation (contract, benefit book, SOP, signed decision, or plan);
- actual result and post-state;
- financial exposure: gross, allowable, hold, used, available, payable, settled, fund, GL delta;
- privacy/clinical/operational impact;
- reproducibility and retry count;
- screenshot/export/audit/network evidence;
- severity, stop decision, and current status;
- workaround used only to continue testing, never presented as a fix.

If a single root cause produces distinct user impacts—wrong provider view, wrong member balance, and wrong settlement—log linked findings rather than hiding the breadth in one sentence.

## 29. Automatic NO-GO Conditions

The inpatient control environment is NO-GO if any of the following is observed or remains untested because the product cannot support it:

1. an ineligible, exhausted, excluded, unpriced, future, duplicate, or unauthorised amount becomes payable;
2. used plus active holds can exceed an applicable limit without authorised override;
3. a facility cannot obtain a truthful, current financial-clearance position for a high-cost procedure;
4. one episode or interim slice can be claimed/paid twice;
5. periodic settlement cannot retain episode linkage and prevent rebilling;
6. PA/GOP/LOU amounts, expiry, or residuals are unenforced or invisible;
7. maker/checker, high-value approval, fraud clearance, or appeal separation can be bypassed;
8. case accrual, claim, benefit, fund, voucher, provider statement, report, and GL cannot reconcile;
9. provider/member/HR/fund/report users can access foreign-scope or excessive clinical data;
10. date manipulation is inconsistent across components, making time-based results unreliable;
11. package/digital-contract rules needed for the tested client are not configured or cannot be exercised;
12. a Critical or High prior inpatient finding has no independent evidence-based retest.

## 30. Exit Criteria

Pass requires all of the following:

- all six longitudinal scenarios executed with signed daily and weekly shadow ledgers;
- at least one open admission settled across three or more interim cycles without closing the case or rebilling prior services;
- facility-facing available limits and procedure coverage are current and explain every binding constraint;
- maternity/newborn, multi-trauma, ICU/HDU/ward, evolving diagnosis/labs, serial surgery, and readmission paths are proven;
- category, overall, shared-member, shared-family, per-visit, PA/GOP, LOU, package, tariff, and funding constraints are tested positively and negatively;
- benefit usage changes at the signed recognition event, while settlement does not consume it twice;
- provider payable, fund, voucher, cash settlement, GL, provider statement, and reports reconcile with zero unexplained difference;
- concurrent approvals, batch creation, Mark Paid, retries, expiry, worker reruns, and late HMS entries are idempotent and fail safe;
- each actor completes their real duties under correct scope;
- every prior inpatient finding is independently re-run;
- every gap, including Low and blocked-capability gaps, is recorded with evidence;
- no open Critical or High finding remains; Medium/Low observations have named acceptance owners and dates.

## 31. Execution Order

1. Freeze build, create local snapshot, establish shared clock.
2. Configure and evidence contract, benefits, provider linkage, approval matrix, roles, and finance.
3. Capture all baselines and sign the accounting/date policies.
4. Run prior-defect entry gate.
5. Start the six scenarios on the campaign calendar.
6. Execute the daily case script at each clock advance.
7. Execute Friday interim billing/settlement and full reconciliation.
8. Run adversarial limit/concurrency tests on snapshot branches.
9. Run contract, HMS, correction, privacy, reporting, worker, and performance packs.
10. Complete final discharge/settlement, closing balances, gap register, and NO-GO decision.

## 32. Required Campaign Outputs

- completed `DAILY_FINANCIAL_CONTROL_TEMPLATE.csv`, one row per case checkpoint;
- completed `PROCEDURE_FINANCIAL_CLEARANCE_TEMPLATE.csv`, one row per planned high-cost procedure or material service change;
- completed `INTERIM_SETTLEMENT_RECON_TEMPLATE.csv`, one row per cut-off/slice;
- completed `GAP_REGISTER_TEMPLATE.csv`, one row per finding;
- completed `ACTOR_RUN_LOG_TEMPLATE.csv`, one row per actor action/handoff;
- completed `SCENARIO_RESULT_MATRIX_TEMPLATE.csv`, one row per scenario or adversarial pack;
- evidence index linking screenshots, exports, audit events, and network traces;
- weekly reconciliation signed by provider finance, TPA claims/medical, TPA finance, and fund admin;
- final scenario result matrix;
- prior-defect retest matrix;
- executive GO/NO-GO summary containing no claim of closure without evidence.

## Appendix A — Control Totals

| Scenario | Gross billed | Contract allowable | Benefit payer maximum | Key difference |
|---|---:|---:|---:|---|
| Complicated maternity — mother | 17.4M | 14.2M | 14.2M | 3.2M contract/package shortfall |
| Boda polytrauma | 61.1M | 49.6M | 49.6M | 11.5M contract/package shortfall; four benefit buckets |
| Stroke/cardiac arrest | 76.0M | 59.0M | 45.0M | 17M contract shortfall + 14M benefit shortfall |
| Severe malaria | 12.6M | 9.0M | 9.0M | Exact inpatient exhaustion |
| Major burns | 145.0M | 108.0M | 100.0M | Overall annual limit binds; 8M benefit shortfall |
| Diabetic foot + readmission | 33.0M | 26.0M | 22.0M | Readmission allowed 8M but only 4M overall headroom |

These are shadow-ledger controls. If configured tariffs differ, update the signed contract book and recalculate expected values before Day 0—not after seeing the application's result.
