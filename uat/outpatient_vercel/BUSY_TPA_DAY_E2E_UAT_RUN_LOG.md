# Busy TPA Day E2E UAT — Run Log

Executes `BUSY_TPA_DAY_E2E_UAT_TEST_PLAN.md`. Vercel UI only. No DB/API mutation.

## RESUME POINTER
- **Last updated:** 2026-07-08 (pass paused by login outage)
- **Status:** **VERDICT: NO-GO** (see `BUSY_TPA_DAY_GO_NO_GO.md`, `BUSY_TPA_DAY_DEFECT_REGISTER.md`). Money spine PROVEN; blocked by BD-03 (login outage), BD-04/BD-05 (High), and unverified IDOR.
- **Completed:** SET, CHK, OP intake (+adversarial), full ADJ (ceiling/partial/decline/duplicate), full FIN spine (batch→maker/checker→settle→balanced GL).
- **BLOCKED (untested risk):** all VIS/IDOR, fraud gate, inpatient, preauth, ops — `/post-login` 503 blocked all logins mid-run. Re-run per "FINAL RESUME POINTER" below.
- **Active persona/tab:** (session ended on /login, outage) Chrome tabId 80909515.

## Environment Facts
- **Target (ONLY):** https://avenue-portal.vercel.app — Vercel production. Code = origin/main @ `97b2478` (today's D02/D04 IDOR + de-KES remediation committed & pushed).
- **Browser:** Chrome MCP tabId 80909515, tabGroupId 2026164265.
- **Admin:** `admin@medvex.co.ug` / `MedvexAdmin2024!` (SUPER_ADMIN) → /dashboard. WORKS.
- **Seeded-user pw convention (to re-verify):** `MedvexAdmin2024!`
- **Rules:** Vercel UI only; no DB reads/writes; no API/curl mutation; every actor logs in as themselves; missing users created via admin /settings Invite User.

## Baseline @ admin login (2026-07-08)
- Total active members: **2,997**
- Active corporate groups: **7**
- Pending claims: **12**
- Pending pre-auths: **3**
- Claims this month: **275**
- Overdue invoices: **1**
- Loss ratio: **88% (HIGH RISK)**
- Currency: **UGX** (de-KES sweep verified live on dashboard).

## Personas known from prior runs (to re-verify on this pass)
| Persona | Login | Role | Notes |
|---|---|---|---|
| Admin | admin@medvex.co.ug | SUPER_ADMIN | verified |
| Provider A | provider.agakhan.uat@ | PROVIDER_USER | Aga Khan |
| Provider B | provider.ihk.uat@ | PROVIDER_USER | IHK |
| Finance checker | finance.checker.uat@ | FINANCE_OFFICER | |
| Reports viewer | reports.uat@ | REPORTS_VIEWER | |
| HR manager | hr.nwsc.uat@ | HR_MANAGER | NWSC |
| Member principal | mark.kato2593@nwsc-scheme.example | MEMBER_USER | Mark Kato NWSC-2026-01768 |

## SET-01 — Persona inventory (all 12 exist, from /settings; no Invite needed)
| Plan persona | Login | Role | Status |
|---|---|---|---|
| Admin | admin@medvex.co.ug | SUPER ADMIN | ACTIVE ✓ verified |
| Provider desk A | provider.agakhan.uat@test.local | PROVIDER USER (Aga Khan) | ACTIVE |
| Provider desk B | provider.ihk.uat@test.local | PROVIDER USER (IHK) | ACTIVE |
| Claims officer 1 | claims@medvex.co.ug (Grace Wanjiku) | CLAIMS OFFICER | ACTIVE |
| Claims officer 2 / Medical | medical@medvex.co.ug (Dr Sarah Achieng) | MEDICAL OFFICER | ACTIVE |
| Medical reviewer | medical@medvex.co.ug | MEDICAL OFFICER | ACTIVE |
| Finance maker | finance@medvex.co.ug (Peter Ochieng) | FINANCE OFFICER | ACTIVE |
| Finance checker | finance.checker.uat@test.local | FINANCE OFFICER | ACTIVE (distinct from maker ✓) |
| HR manager | hr.nwsc.uat@test.local | HR MANAGER (NWSC) | ACTIVE |
| Fund admin | fund.nwsc.uat@test.local | FUND ADMINISTRATOR (NWSC) | ACTIVE |
| Reports viewer | reports.uat@test.local | REPORTS VIEWER | ACTIVE |
| Member principal | mark.kato2593@nwsc-scheme.example (Mark Kato) | MEMBER USER | ACTIVE |
| Broker (optional) | broker@kaib.co.ke (John Mutua) | BROKER USER | ACTIVE (never logged in) |

Password strategy: @medvex.co.ug seeded = `MedvexAdmin2024!`; @test.local/.uat = try `MedvexAdmin2024!`, re-invite via admin if it fails.

## Test data anchors (prior)
- Principal: Mark Kato (NWSC-2026-01768); Dependant: Prossy Kato (NWSC-2026-02891)
- Positive facility: Aga Khan; Negative facility: IHK

---

## Execution Log
(chronological; scenario IDs from the plan)

### SET — Environment & personas
- **SET-ENV** PASS — Admin login on Vercel; dashboard populated; UGX currency confirmed. Evidence: ss_9273zjzbz. Baseline counts recorded above.
- **SET-01** PASS — All 12 personas exist (table above). No Invite needed.
- **SET-02** PASS — /providers: 195 providers (2 own, 51 partner, 142 panel). Aga Khan University Hospital ACTIVE (91 claims). All rows ACTIVE.
- **SET-04a Claim Money Controls** — Fraud gate currently **OFF** (advisory only; default). Severity threshold Medium; satisfaction "clear OR fraud-clearance approval". Will enable later to prove ADJ-12. Evidence ss_3052icfjw.
- **SET-04b FX Rates** — Base UGX. KES→UGX **29**, USD→UGX 3,800, EUR→UGX 4,100, GBP→UGX 4,800, all ACTIVE (seed 02/07). Aga Khan = Nairobi facility → watch cross-border currency in money spine.
- **SET-04c Approval Matrix** (UGX-normalised): 50k–149,999 All/All → Claims Officer (single); 150k–199,999 All/SURGICAL → Medical Officer (single); 200k+ INPATIENT/All → Underwriter (**dual**). ⚠ OBSERVATION: no explicit rule for OUTPATIENT >200k UGX — watch adjudication routing/default.
- **SET-05** PASS — /members: 2,999 members. Full-name search "Mark Kato" → 1 exact hit (E2E-D01 token search fix LIVE). Principal **Mark Kato NWSC-2026-01768** ACTIVE, package **NWSC Officer Care (Silver)**, group NWSC Staff Medical Scheme, **annual limit UGX 30,000,000 / utilised 1,350,000 / remaining 28,650,000 / 8 claims**. Dependant **Prossy Kato NWSC-2026-02891** (Parent, 75y). Member portal login ACTIVE. Evidence ss_3309fnwbh.
- **SET-06 GL baseline** (Trial Balance ✓ **Balanced**, total 9,266,180 ea. side): Cash at Bank(1010) net -3,704,980; Claims Payable(2010) net -2,868,780 (DR 4,619,980/CR 1,751,200); Net Claims Incurred(5010) DR 1,751,200; GWP(4010) CR 915,000. Gross rev 915,000 / expenses 1,751,200 / net -836,200. **This is the pre-test opening balance for reconciliation.**
- **SET-06b** PENDING — settlement baseline: prior run left a **stranded batch "Aga Khan Jul 2026" CHECKER APPROVED, KES 3,288,480**. Confirm during FIN phase (possible stuck-batch defect).

**SET phase verdict:** environment healthy, all personas present, money-control config captured. No SET-level blocker. Proceeding to money spine.

### SET — Persona access recovery (passwords)
- @medvex.co.ug seeded staff = `MedvexAdmin2024!` (admin confirmed; claims@/medical@/finance@ to test at first use).
- @test.local/.uat accounts: temp pw unrecorded → **NOT** `MedvexAdmin2024!` (provider.agakhan.uat login FAILED "Invalid email or password"). No staff password-reset control in /settings (only role + active/inactive + Save). Recovery = admin **Invite User** creates user with an admin-set temp password. Invite dialog: First/Last/Email/Role/TempPassword; selecting **Provider (Facility)** reveals a **FACILITY** selector ("This user will only see this facility's eligibility, claims and settlements").
- **Created BusyDay ProviderA** = `provider.busyday.agakhan@test.local` / `BusyDay2026!`, role PROVIDER USER, facility **Aga Khan University Hospital**. ACTIVE. (UAT artifact.)

### ⚠ DEFECT CANDIDATE BD-01 (to verify safely) — Update Access role dropdown cannot represent PROVIDER_USER → shows SUPER ADMIN
- **/settings → Users & Access.** The per-row "Update Access" role dropdown's option list omits **PROVIDER USER**. For the two provider users (BusyDay ProviderA, AgaKhan Reception2) the dropdown therefore renders **"SUPER ADMIN"** (first option) as its selected value, not their real role.
- **Risk:** an admin toggling a provider row's status and clicking **Save** may submit role=SUPER_ADMIN, silently escalating a facility user to full admin. Potential **privilege escalation / Critical**.
- **Status:** NOT yet confirmed — must verify what Save actually posts, WITHOUT escalating a live user. Verify on a throwaway during VIS/OPS. Evidence ss_7142d1x33.

### Working persona credentials (this run)
| Persona | Login | Password | Notes |
|---|---|---|---|
| Admin | admin@medvex.co.ug | MedvexAdmin2024! | ✓ |
| Provider A | provider.busyday.agakhan@test.local | BusyDay2026! | @ Aga Khan (created) |
| Provider B | provider.busyday.ihk@test.local | BusyDay2026! | @ IHK (created) |
| Finance checker | finance.busyday.checker@test.local | BusyDay2026! | created (distinct from maker) |
| Finance maker | finance@medvex.co.ug | MedvexAdmin2024! (test) | Peter Ochieng |
| Claims officer | claims@medvex.co.ug | MedvexAdmin2024! (test) | Grace Wanjiku |
| Medical | medical@medvex.co.ug | MedvexAdmin2024! (test) | Dr Sarah Achieng |
| HR / Fund / Reports | create in VIS phase | BusyDay2026! | check group linkage in invite |
| Member | mark.kato2593@nwsc-scheme.example | reset via /members profile | Mark Kato |

### SET-artifact ledger (records I create this run — for cleanup/accounting)
- User: BusyDay ProviderA (provider.busyday.agakhan@test.local) — PROVIDER_USER @ Aga Khan.
- User: BusyDay ProviderB (provider.busyday.ihk@test.local) — PROVIDER_USER @ IHK.
- User: BusyDay FinanceChecker (finance.busyday.checker@test.local) — FINANCE_OFFICER.

**BD-01 reconfirmed:** all 3 provider users show "SUPER ADMIN" in Update Access; FINANCE OFFICER row shows correct role. Defect is PROVIDER_USER-specific. Evidence ss_4901b96xa.

### CHK — Check-in, eligibility & member scope (Provider A = Aga Khan)
- **CHK-02** PASS — /provider/eligibility "NWSC-2026-01768" → ELIGIBLE, NWSC Staff Medical Scheme, NWSC Officer Care (Silver), PRINCIPAL, limit 30,000,000 / used 1,350,000 / remaining 28,650,000. Matches admin exactly. No other member leaked. Evidence ss_3977uz63t.
- **CHK-06 (fake)** PASS — "ZZZZ-9999-00000" → "No member found… Check the card number and try again." No crash, no claim-start, no side effect.
- **CHK-03** PASS — "File a claim for this member →" → /provider/claims/new?memberId=… with Mark Kato prefilled (member-locked). **PCL-01** PASS: header fixed to "Aga Khan University Hospital"; NO facility selector — Provider A cannot choose Provider B.
- **Provider A user scope** PASS — dashboard/claims list show ONLY Aga Khan claims (Mark & Noah Kato). Facility-scoped user works; BD-01 dropdown glitch did NOT escalate stored role.
- PENDING: CHK-04 check-in challenge/replay; CHK-05 Provider B isolation; entitlement-scope eligibility (non-NWSC member at Aga Khan — need a cross-client member number).
- Currency note: all provider amounts render **UGX** (de-KES live). ⚠ Historical claims show tiny values (3,500/10,500/16,500 "UGX") that look like un-converted KES relabelled to UGX — data-integrity observation on legacy rows (my fresh claims use explicit UGX so spine math stays clean).

### OP / PCL — Provider claim intake (Provider A)
- **OP-1 / PCL-08/13** PASS — consultation-only clean claim. Member NWSC-2026-01768, DOS today, OUTPATIENT/OUTPATIENT, dx J06.9, line CONSULTATION "GP consultation" CPT 99213 qty 1 × UGX 60,000. Live total recompute = **UGX 60,000** (= qty×unit ✓). Submit once → **CLM-2026-00290**, status **RECEIVED**, appears in provider + (expected) TPA queue. Evidence ss_9187zpyqn, ss_1756m80xl.
  - Control sheet OP-1: billed 60,000; band = Claims Officer single (50k–149,999); expected approved payer share = 60,000 − copay (copay TBD at adjudication).
- **OP-2 / PCL-09/10/12** PASS — multi-line (CONSULTATION 40,000 + LABORATORY 2×15,000 + PHARMACY 20,000). Live total = **UGX 90,000** (qty×unit per line ✓). PCL-12: deleted pharmacy line → total recalced to 70,000 (no lingering amount); re-added → 90,000. Submit → **CLM-2026-00291**, RECEIVED. Evidence ss_94597bpxq, ss_69243co2x.
- **OP-6 (partial candidate)** intake PASS — CONSULTATION 50,000 + PHARMACY "Cough syrup (non-formulary)" 30,000 = **UGX 80,000**. Submit → **CLM-2026-00292**, RECEIVED. Plan: reject the 30,000 pharmacy line at adjudication → approved 50,000 (prove rejected amount excluded from settlement/usage/GL).
- **OP-7 (decline candidate)** intake PASS — PROCEDURE "Cosmetic mole removal" 120,000, dx Z00.00. Submit → **CLM-2026-00293**, RECEIVED. Plan: full decline at adjudication (prove no payable side effects).
- **OP-8 DUPLICATE** — ⚠ **FINDING BD-02.** Filed a claim identical to OP-1 (member NWSC-2026-01768, DOS 08/07/2026, OUTPATIENT, CONSULTATION UGX 60,000). It was **created as a NEW claim CLM-2026-00294 (RECEIVED)** — NOT blocked or flagged at intake. Duplicate-payment risk **pending adjudication-time dedup check**: if 00294 raises no duplicate/fraud alert and can be approved+paid alongside 00290, that is a duplicate payment path (**Critical**). Evidence ss_061940vz4.
- **⚠ FINDING BD-03 (reliability): intermittent HTTP 503** on Vercel provider routes. POST `/provider/claims/new` returned **503** yet still created CLM-2026-00294; RSC prefetches `/provider/settlements` and `/provider/api-keys` returned 503; an earlier claim-detail prefetch returned 503. The submit UI gave no success/redirect on the 503 path, so a real provider would likely **re-click Submit → generate more duplicates**. Severity TBD (Medium if transient infra; higher if reproducible). Evidence: network log this turn.

### Claims filed as Provider A (day portfolio) — control sheet
| Claim | Scenario | Billed (UGX) | Plan | Status |
|---|---|---:|---|---|
| CLM-2026-00290 | OP-1 clean consult | 60,000 | approve full → settle | RECEIVED |
| CLM-2026-00291 | OP-2 multi-line | 90,000 | approve → settle | RECEIVED |
| CLM-2026-00292 | OP-6 partial | 80,000 | approve 50,000 (reject 30,000 pharmacy) | RECEIVED |
| CLM-2026-00293 | OP-7 decline | 120,000 | decline (no payable) | RECEIVED |
| CLM-2026-00294 | OP-8 duplicate of OP-1 | 60,000 | check dedup; must not double-pay | RECEIVED |

- **PCL-03** PASS — future DOS (09/07/2026) blocked server-side with banner *"Date of service cannot be in the future (operating timezone: Africa/Kampala)."* No claim created. Confirms Uganda operating TZ. Evidence ss_0880x35tw.
- PENDING provider negatives: OP-10 ineligible/suspended member (need a suspended member number), PCL-04 unsupported service type, PCL-05 missing-benefit block.

### ADJ — Adjudication (Claims Officer = claims@medvex.co.ug / MedvexAdmin2024!)
RBAC: Claims Officer nav trimmed (no Finance/Compliance/Setup groups). Sees whole claim book (all facilities) — correct (TPA adjudicators not facility-scoped, unlike providers). Claim-detail routes use internal ID, not CLM number (CLM number 404s — display-only).
- **Key money-control discovery — contract ceiling enforced.** OP-1 (CLM-2026-00290) detail: digital-contract engine "no contract matched" → priced from provider tariff. Contracted rate for CPT 99213 @ Aga Khan = **UGX 3,500**; billed 60,000 flagged **"+1614% above contracted rate."** Adjudicate panel shows **Payable ceiling UGX 3,500**, Approved Amount pre-filled to ceiling, and a "PAY ABOVE CONTRACT RATE override (requires senior approval)" to exceed it.
- **ADJ-04** PASS — RECEIVED → "Mark as Captured — Forward for Review" → status **CAPTURED**. Timeline logs CAPTURED + earlier ROUTED.
- **⭐ ADJ-10 PASS (contract ceiling enforced, fail-CLOSED).** Set Approved Amount = 60,000 (>ceiling 3,500), Submit → **BLOCKED** with banner: *"Contract enforcement: approved amount (UGX 60,000) exceeds the payable ceiling of UGX 3,500 under Contract PC-2026-128… Reduce the amount, or raise a PAY_ABOVE_CONTRACT_RATE override (requires senior approval)."* Status stayed CAPTURED, Approved UGX 0 — **no side effect**. Strong money control. Evidence ss_9787a6t3e. (Minor obs: error surfaced via `?error=` URL param — display-only, no PII.)
- **ADJ-07 PASS** — Approve (Full) at ceiling **UGX 3,500** → CLM-2026-00290 **APPROVED**, Approved UGX 3,500, approved count 122→123. Fraud alerts advisory (gate OFF) so non-blocking (correct per config). Evidence ss_6147lufov.
  - **OP-1 control sheet FINAL:** billed 60,000 · approved payer share **3,500** · expect member usage +3,500, settlement 3,500, GL payable +3,500.
- **Fraud detection is live** — OP-1 timeline: *"ROUTED to manual review — FRAUD_FLAG: 3 open fraud alert(s)"* (likely over-billing + duplicate + velocity). Gate currently OFF so advisory. Will test gate ON on the duplicate (OP-8/00294).
- **Contracted-rate data issue (observation):** all Aga Khan tariff rates are KES-magnitude numbers now labelled UGX (consultation "UGX 3,500" ≈ real KES 3,500). Legacy de-KES relabel without conversion. Not blocking my spine (I track approved amounts precisely) but a data-integrity item for cross-border/Kenya-facility tariffs.
- **⭐ Duplicate DETECTION exists (updates BD-02).** OP-7 (00293) timeline: *"Routed to manual review — Double-capture: claim for same provider/member/date/category already exists (CLM-2026-00290, CLM-2026-00291, CLM-2026-00292)."* So same provider+member+date+category claims are flagged as double-capture and **routed to manual review** with the specific duplicate claim numbers surfaced — NOT silently allowed. So BD-02 is **mitigated to a routed-not-blocked control** (plan accepts "duplicate blocked/routed"). Still must confirm at OP-8 that the officer can't approve-and-pay both duplicates without the warning; and that it's not a hard block either. Net: not the feared silent duplicate; severity **Low/Medium** pending OP-8 confirmation.
- **ADJ-09 PASS (decline)** — OP-7 (00293): captured → Decision **Decline** + reason → status **DECLINED**, Approved UGX 0, Copay 0. Note: uncontracted PROCEDURE showed "No contract ceiling — reviewer judgement applies" (no auto-cap for unlisted services — reviewer must judge; expected but a manual-control dependency). Negative side-effects (no usage/fund/GL/paid-notification) to confirm in propagation. Evidence ss_53357ljf0.
- **ADJ-08 PASS (partial approval)** — OP-6 (00292): captured → Line-by-Line Adjudication: **approve** Consultation (50,000), **reject** Cough syrup non-formulary (30,000) → **Outcome: PARTIALLY APPROVED, Net approved UGX 50,000.** Void/Appeal controls appear (Void reverses usage+GL). Evidence ss_1607e6q56, ss_2184erin1.
  - **OP-6 control sheet FINAL:** billed 80,000 · approved payer share **50,000** · rejected/excluded **30,000** (pharmacy). Expect member usage +50,000, settlement 50,000, GL payable +50,000; the 30,000 must NOT settle/draw fund/post GL.
  - ADJ-05 confirmed: claim-level "Partially Approve" submit did NOT take while lines were "Pending"; the engine required **line decisions first**. Good control.
### FIN — Settlement, GL, provider statement (Finance maker = finance@medvex.co.ug)
RBAC: Finance Officer nav trimmed to Finance/Insights only (correct). Prior "stranded" Aga Khan Jul-2026 batch (46 claims, 3,288,480) now **SETTLED** in UGX → prior blocker PR-V02 (Mark Paid fails) appears **resolved** in passing.
- **⚠ FINDING BD-05 (High, settlement workflow): cannot create a 2nd batch for same provider+cycle → later-approved claims stranded; failure is SILENT.** Selected Aga Khan + July 2026 → Create Batch → **no batch created, no visible banner**; only the URL carried `?error=Settlement batch already exists for this provider and cycle`. Since a settled Jul-2026 Aga Khan batch already exists, my July-DOS approved claims (00290, 00292) **cannot be settled in the July cycle at all**. In a busy TPA, claims approve continuously; once a month's batch is run, later approvals in that month are un-settleable until a different cycle. Workaround: use a free cycle month. **Severity High** (a class of approved claims can't be paid in-cycle) + Medium UX (silent failure, no maker feedback).
- **⚠ FINDING BD-03 reinforced (reliability): intermittent HTTP 503 + React #419.** Settlement RSC prefetches returned 503; browser console threw **"Minified React error #419"** (server Suspense/SSR abort) ×2 on this page. Vercel deployment intermittently fails server render on provider/settlement routes. Combined with silent submit failures, operationally risky.
- **FIN-01 PASS (batch scope)** — created Aga Khan **Nov 2026** batch (free cycle) = **3 claims, UGX 61,500, MAKER SUBMITTED**: OP-1 (3,500) + OP-6 (50,000) + pre-existing unsettled partial CLM-2026-00280 (8,000). Correctly EXCLUDES declined OP-7(00293), un-adjudicated OP-2(00291)/OP-8(00294), and Provider-B/IHK claims. Cycle = payment-run label; batch sweeps all approved-unsettled claims for the provider. Evidence ss_8433cjxa7.
- **FIN-02 PASS (batch total)** — 3,500 + 50,000 + 8,000 = **61,500** = batch total ✓.
- **⭐ FIN-03 PASS (maker/checker segregation)** — maker (finance@medvex.co.ug, batch creator) clicked Approve on own batch → **BLOCKED**, `?error=Maker and checker must be different users`. Strong money control. (UX caveat: error via URL param + page blanked; no friendly on-page banner — same silent-failure pattern as BD-05.)
- Batch detail (as checker) confirmed 3 lines: 00280 (8,000), 00290 (3,500), 00292 (**50,000** — OP-6 rejected 30,000 pharmacy EXCLUDED ✓). "Maker-checker enforced… paid with voucher + balanced journal entry." Evidence get_page_text batch detail.
- **FIN-04 PASS** — Finance CHECKER (finance.busyday.checker@test.local, distinct user) approved → status **CHECKER APPROVED**.
- **FIN-05 PASS** — Checker Mark Paid → batch **SETTLED** (settled 08/07/2026), voucher+journal posted.
- **FIN-06 PASS (no duplicate settle)** — settled batch exposes NO Mark Paid action (button gone). Duplicate-pay path not reachable via UI.
- **⭐ FIN-07 & FIN-08 PASS — GL reconciles, trial balance ✓ BALANCED (9,381,180 = 9,381,180).** vs SET-06 baseline:
  - Net Claims Incurred(5010) DR +53,500; Claims Payable(2010) CR +53,500 → **approval journal Dr Expense / Cr Payable = 53,500** = approved amounts (OP-1 3,500 + OP-6 50,000).
  - Claims Payable(2010) DR +61,500; Cash at Bank(1010) CR +61,500 → **settlement journal Dr Payable / Cr Bank = 61,500** exactly once (batch total incl. pre-existing 8,000).
  - **Rejected 30,000 (OP-6 pharmacy) and OP-1 over-ceiling 56,500 did NOT post to GL** — only approved amounts hit expense/payable. Money control holds end-to-end. No mixed-currency summing (all UGX, balanced).
  - **Spine exit criteria #1, #2, #3, #6 PROVEN at GL level.** Evidence: GL text this turn.

### ⚠ FINDING BD-03 ELEVATED (High → Critical if frequent): `/post-login` 503 intermittently BLOCKS login
- After entering correct Provider A credentials, the button hung on "Signing in…"; network shows **`GET /post-login?_rsc=… → 503`** repeated, console **React #419** (SSR abort). Auth accepted but post-login routing 503s → user stranded on /login; direct nav to /provider/dashboard → branded **Access Denied** (session not established). Blocked my Provider A re-login for several minutes this session. Earlier logins (admin/claims/finance) succeeded → **intermittent**, but when it fires it fully blocks entry. Branded /unauthorized denial is otherwise correct. **Availability blocker candidate.**

### VIS/OPS — Role scope, privacy & operational workload
**BLOCKED by BD-03 login outage.** After completing the finance spine, `/post-login` began 503'ing for **all** accounts (provider AND admin), sustained across ~10 login attempts over several minutes incl. a 15s serverless-recovery wait. Could not establish provider/admin/member sessions to run the remaining tests. What this blocked (all → UNTESTED RISK, not pass):
- FIN-09 provider statement view (Aga Khan sees own settled batch = voucher 61,500) — *note: batch remittance-advice content already seen from finance side (3 claims, 61,500)*.
- FIN-10 / CHK-05 / VIS-08 Provider-B (IHK) IDOR probes on Aga Khan batch/claim URLs — **the exact prior-D02 Critical area; NOT re-verified this run.**
- VIS-01 member usage/notifications reflection; VIS-02 member IDOR (other-member URL).
- VIS-03/04 HR scope; VIS-05/06 fund scope + drawdown; VIS-07 reports viewer; FIN-11 reports export tie-out.
- ADJ-12 fraud gate ON (turn gate on as admin, confirm fraud-flagged claim approval blocked).
- BD-01 verification (does saving a provider row escalate role to SUPER_ADMIN?).
- IP-* inpatient lifecycle; PA-* preauth; OPS-* operational workload; OP-10 ineligible member.

**RBAC evidence that WAS captured (positive):** nav trimmed correctly per role — Claims Officer (no Finance/Setup), Finance Officer (Finance/Insights only), Provider (facility portal only, facility-scoped to its own claims). Branded /unauthorized "Access Denied" page renders for unauthorized/unauthenticated provider-route access (not a crash/leak). Finance maker/checker segregation enforced (FIN-03).

## FINAL RESUME POINTER (for re-test after fixes)
- **Verdict:** NO-GO (spine strong; blocked by availability + 2 High money/workflow defects + untested IDOR).
- **Next step when /post-login recovers:** log in as Provider B (provider.busyday.ihk@test.local / BusyDay2026!) → attempt Aga Khan batch URL `/settlement/cmrbnno9n000004lijweufy86` and claim `/provider/claims/<agakhan-claim-id>` → must be denied (FIN-10/VIS-08). Then member (mark.kato2593 — reset pw via admin /members) → VIS-01/02. Then admin → BD-01 verify + fraud gate ADJ-12. Then HR/Fund/Reports (create via admin invite; check group linkage).
- **Artifacts this run:** claims CLM-2026-00290 (OP-1, APPROVED 3,500), 00291 (OP-2, RECEIVED — un-adjudicated), 00292 (OP-6, PARTIAL 50,000), 00293 (OP-7, DECLINED), 00294 (OP-8 duplicate, RECEIVED). Settlement batch Aga Khan **Nov 2026 SETTLED, UGX 61,500** (voucher+journal). Users created: provider.busyday.agakhan@, provider.busyday.ihk@, finance.busyday.checker@ (all BusyDay2026!).

- **⚠ FINDING BD-04 (control design): contract ceiling is CPT-gated → CPT-less/unlisted lines escape the cap and pre-fill approved = FULL billed.** OP-1's consultation had **CPT 99213** → matched tariff → hard ceiling **UGX 3,500** (over-ceiling approval blocked, ADJ-10). OP-6's consultation had **no CPT** → "No contract ceiling — reviewer judgement applies", Approved Amount **pre-filled to full 80,000**, decision defaulted to **Approve (Full)**. A provider omitting/altering the CPT (or using an unlisted code) removes the automated ceiling; the only backstop is manual-review routing + reviewer diligence, and the *dangerous default* is full-billed approval. **Severity: High** (contract-ceiling control bypassable via CPT; fail-toward-overpay default). Mitigation present: double-capture/fraud routing to manual review. Verify whether a reviewer clicking Approve(Full) on a no-CPT claim can pay full billed without any senior override.
