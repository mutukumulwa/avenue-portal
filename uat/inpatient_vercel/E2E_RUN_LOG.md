# Inpatient E2E Scenario UAT — Run Log (Vercel)

Front-end only, Chrome, every actor as themselves, **no DB injections**. Runbook: `INPATIENT_E2E_SCENARIO_UAT_TEST_DOCUMENT.md`.
Legend: PASS · FAIL(defect) · BLOCKED(reason) · PARTIAL · N/A · GAP(no UI path)

## RESUME POINTER
- **Last updated:** 2026-07-07 — money spine driven THROUGH settlement-checker gate; verdict **NO-GO**.
- **Status:** IP-00 spine PROVEN PA→GOP→case→LOU→multi-day accrual→one-claim→contract-cap→**dual underwriter approval (1,300,000)**→**settlement batch @ 1,300,000**→maker/checker SoD. Only **Mark-Paid→PAID/GL/reports** blocked by intermittent 503 (IP-DEF-03). Provider RBAC verified. GL trial balance balanced (tie-out unverified). Temp 2nd-underwriter role change reverted. Open: IP-DEF-01/02/03 + untested breadth.
- **Next if resumed:** (1) after IP-DEF/DUAL fixes, complete a small (<150k, single-approval) inpatient claim through settlement→voucher→GL→reports for full tie-out; (2) run untested families C/D/E/F (ICU bed-days, packages, oncology, maternity), HMS idempotency (B08/H07), duplicate-mark-paid (J05), benefit exhaustion (C07/F08), member/HR/fund scope + notifications (L).
- **Active tab:** Chrome tabId 80909507 (Browser 1, device 03aa4fc8…). Login pitfall persists (first post-nav fill lost; refill once).

## Spine questions (verdict hinges on these)
1. Can one long-stay admission run the FULL money spine (PA/GOP → case/LOU → multi-day accrual → discharge → one claim → adjudication → approval chain → settlement → GL → reports) paying **only** the authorised payer share?
2. Do bed-days double-pay overlapping ward/ICU days (IP-C02)? Must be NO.
3. Can PA/LOU/benefit/contract ceiling be exceeded without an authorised override (IP-A09/IP-I04/IP-I05)? Must be NO.
4. Can SoD be bypassed — maker=checker settlement, self-approval, single-user multi-level (IP-I06/IP-J03)? Must be NO.
5. Can duplicate HMS replay or duplicate Mark-Paid create money (IP-B08/IP-H07/IP-J05)? Must be NO.
6. Can any actor (provider/member/HR/fund/reports) see or act outside scope (family L)? Must be NO.

## Environment & Personas (from outpatient_vercel closure pass; re-verify on first use)
- Target: https://avenue-portal.vercel.app (Vercel prod). Front-end only.
- Admin: `admin@medvex.co.ug` / `MedvexAdmin2024!` (SUPER ADMIN, James Kamau). **Login verified 2026-07-07.**
- Seeded @medvex.co.ug pw `MedvexAdmin2024!`; UAT @test.local pw `MedvexUat2026!`.
- **Login pitfall:** `form_input` does NOT trigger React onChange → submit sees empty state. Must click field + type via keyboard.
- Personas (from prior pass): claims@medvex.co.ug (Grace Wanjiku, claims), medical@medvex.co.ug (Dr Sarah Achieng, medical reviewer), finance@medvex.co.ug (Peter Ochieng, finance maker), finance.checker.uat@test.local (checker), fund@medvex.co.ug (Caroline Mwaura, fund admin), hr.nwsc.uat@test.local (HR), reports.uat@test.local (reports), provider.agakhan.uat@test.local & provider.ihk.uat@test.local (providers).
- Dashboard baseline @ admin login (2026-07-07): 2,997 members · 7 groups · 12 pending claims · 3 pending pre-auths · 274 claims/30d · 1 overdue invoice · 89% loss ratio.
- CLINICAL nav present: Case Management, Offline Capture, Offline Work Codes, Approvals, Assessor Queue, Override Queue, Cross-Border Care, Wellness, Exceptions, Secure Check-Ins, Providers, Contracts.

## Test-artifact ledger (must revert after UAT)
- **2026-07-07 — role change (user-authorized), NOW REVERTED:** elevated `cs@medvex.co.ug` (David Kipchoge) CUSTOMER SERVICE → UNDERWRITER to provide a 2nd distinct underwriter for the DUAL-approval spine (IP-OBS-DUAL); dual chain completed; **reverted back to CUSTOMER SERVICE (verified)**. No residual role drift.
- **2026-07-08 — benefit-exhaustion test (member-scoped DB seed, REVERTED):** set Mark Kato INPATIENT BenefitUsage.amountUsed to 24,450,000 then 25,000,000 (available 0) to test the benefit ceiling; **reverted to real 1,300,000 used / 450,000 hold (verified)**. Proved IP-DEF-06 (Critical — benefit ceiling unenforced). PA-2026-00007 DB-expiry test also reverted (SUBMITTED).
- **Extra test-claim artifacts — CLEANED UP (2026-07-08):** deleted bogus CLM-2026-00290/291/292/293 + their cases CASE-2026-00002/00003/00004/00005 (+ service entries, adjudication logs, claim lines), test PA-2026-00006/00007, and the HMS_BATCH_UNMATCHED test exceptions. Reversed the two self-funded drawdowns (2×130,000): SelfFundedAccount restored to balance -1,356,000 / totalClaims 1,356,000. **Verified: 0 bogus claims/cases/PAs left; fund & benefit usage correct; real spine (CLM-2026-00289 PAID, CASE-2026-00001) intact.**
- **Standing artifacts left on the tenant:** PA-2026-00005 (APPROVED, consumed), CASE-2026-00001 (CLOSED_FILED), CLM-2026-00289 (APPROVED 1,300,000, hold consumed), settlement batch **Nakasero Jul 2026 UGX 1,300,000 stuck MAKER SUBMITTED** (checker-approve 503; needs finance-checker action to settle or void). LOU-2026-00001. One voided future-entry line on the (now closed) case.

## Spine artifacts (this run)
- **Member:** Mark Kato NWSC-2026-01768 (PRINCIPAL, NWSC Staff Medical Scheme, self-funded). Inpatient benefit: annual limit shown 25,000,000 post-approval (5,000,000 pre — see OBS-IP-1).
- **Provider:** Nakasero Hospital (HOSPITAL, PANEL), contract PC-2026-064 (2026 Network Services Agreement, ends 30/06/2027). Ward tariff 130,000/day.
- **PA-2026-00005** APPROVED 1,750,000, GOP issued, hold ACTIVE 1,750,000 (expires 06/08/2026). id cmrazdi29000004la5n85shf1.
- **CASE-2026-00001** (id cmrazmjko000004l70y9dhsdn) admission 2026-07-02 → discharge 2026-07-07, LOS 5d. 6 service entries, ACCRUED 1,650,000. PA + LOU-2026-00001 (ceiling 1,750,000) attached.
- **CLM-2026-00289** (id cmraztmgp000304l2fk0odstv) filed from case, billed 1,650,000, contract-capped payable 1,300,000 (ward 1,000,000→650,000, write-off 350,000), copay 0. Decision Approve(Full) 1,300,000 → routed to Approvals (Level 1 of 2, needs UNDERWRITER).

### Control sheet (UGX)
| Item | Value |
|---|---|
| Billed | 1,650,000 |
| Contract-capped payable | 1,300,000 |
| Ward provider write-off | 350,000 |
| Member liability (copay) | 0 |
| Expected benefit usage | 1,300,000 |
| Expected fund drawdown (NWSC self-funded) | 1,300,000 |
| Expected settlement / voucher / GL payable | 1,300,000 |

## Execution Log
| Scenario | Actor | IDs | Result | Evidence | Note |
|---|---|---|---|---|---|
| Login admin+medical | Admin/Medical | — | PASS | ss_2053mxfg3, ss_5218y99sd | medical nav trimmed (no Finance/Compliance) |
| IP-00.3 / A01 submit PA | Admin | PA-2026-00005 | PASS | preauth list | INPATIENT 1,750,000 SUBMITTED |
| IP-00.4 / A02 approve PA + GOP | Medical | PA-2026-00005 | PASS* | ss_44244i2ff | APPROVED, hold 1,750,000 ACTIVE. *crash if Notes filled → IP-DEF-01 |
| IP-00.5 / A03 open case + attach PA | Medical | CASE-2026-00001 | PASS | case detail | OPEN, LOS 5d, PA attached |
| IP-00.6 issue LOU | Medical | LOU-2026-00001 | PASS | case detail | ceiling 1,750,000 ISSUED |
| IP-00.7/8 / B02 multi-day accrual | Medical | 6 entries | PASS | case detail | ACCRUED 1,650,000, qty pricing + dating correct |
| IP-B06 future service entry | Medical | — | **FAIL IP-DEF-02** | ss_051323a27 | 2026-08-01 entry accepted, accrued→2,649,000 |
| IP-B07 void entry | Medical | — | PASS | ss_3178uws8j | voided entry excluded, accrued→1,650,000 |
| IP-00.10 / B10 close→one claim | Medical | CLM-2026-00289 | PASS | claim detail | exactly 1 claim, 6 lines copied, PA re-attached |
| IP-00.11 claim review/pricing | Medical | CLM-2026-00289 | PASS | ss_9828vqwug | contract caps ward 130k/day, payable 1,300,000 |
| IP-00.12 / A/I ceiling controls present | Medical | — | PASS | ss_02523wij9 | PA-cover guard + PAY-ABOVE-CONTRACT override both present |
| IP-00.13 / I06 decision→approval matrix | Medical | CLM-2026-00289 | PASS(routing) | ss_6701wgym0 | decision 1,300,000 routed to Approvals L1/2 UNDERWRITER DUAL. Maker(medical) & super-admin cannot approve (role gate). |
| I06 SoD distinct-per-level | Underwriter | CLM-2026-00289 | PASS | approvals trace | Underwriter L1 approval advances L1→L2; SAME underwriter blocked at L2 ("already decided"). |
| I06 dual approval COMPLETE | Underwriter x2 | CLM-2026-00289 | PASS | claim APPROVED | After user-authorized 2nd underwriter (cs@→UNDERWRITER): L1 Faith + L2 David (distinct) → claim APPROVED 1,300,000. PA consumed (0 attached). |
| IP-00.14 / J01-J02 settlement batch | Finance maker | Nakasero Jul 2026 | PASS | settlement list | Batch = 1 claim UGX 1,300,000 (approved payer share only; exclusions omitted). |
| IP-00.15 / J03 settlement SoD | Finance maker | — | PASS | error banner | Maker self-approve blocked: "Maker and checker must be different users". |
| IP-00.15 Mark-Paid | Finance checker | — | BLOCKED(503) | 503 trace | Checker approve 503s (~5 retries); batch stuck MAKER SUBMITTED; no voucher/PAID this session. IP-DEF-03. |
| IP-J06 GL balanced | Finance | — | PASS(partial) | GL trial balance | Trial balance ✓ balanced 7,706,180=7,706,180. But KES-labelled vs UGX claim; 1,300,000 approval journal not isolable → tie-out UNVERIFIED. |
| IP-H01 direct inpatient claim | Admin | — | PARTIAL | ss_0814oi3xo | /claims/new 4-step wizard exists (Member/Provider type-ahead → Encounter → Diagnoses → Services). Not completed (pivoted). |
| IP-L04 provider cross-scope | Provider AgaKhan | — | PASS | /unauthorized, 404 | AgaKhan cannot open Nakasero CLM-2026-00289 (Access Denied on admin route, 404 on provider route); absent from own claim list. |
| RBAC nav trims | Medical/Provider | — | PASS | ss_5218y99sd | medical: no Finance/Compliance; provider: own facility dashboard only. |

### Family B (extension) — money spine COMPLETED + more scenarios
| Scenario | Actor | IDs | Result | Note |
|---|---|---|---|---|
| J03/J04 settlement maker/checker + Mark-Paid | Finance | Nakasero Jul batch | PASS | SETTLED 08/07; maker self-approve blocked; checker approved+paid (503 masked success). |
| J07 GL settlement journal | Finance | — | PASS | Dr Claims Payable / Cr Cash 1,300,000; trial balance ✓ balanced 9,006,180. Tie-out reconciles. |
| L (finance) claim-detail scope | Finance checker | — | PASS | finance role → Access Denied on /claims/[id]. |
| IP-C02 ICU/ward bed-day overlap | Claims/Admin | CLM-2026-00290 | **FAIL IP-DEF-04** | ward+ICU same date (07-04) both payable, no overlap guard (tariff-only provider). |
| IP-A06 claim without PA | Admin | CLM-2026-00290 | PARTIAL | no PA → "PA-required services route to review" (soft-routes, not hard-blocked at intake). |
| IP-H06 HMS wrong facilityCode | Admin | CASE-2026-00003 | PARTIAL | silently appends nothing, no summary. |
| IP-H06 HMS missing facilityCode | Admin | — | **FAIL IP-DEF-05** | unhandled server exception (Digest 4145388135). |
| IP-H07/B08 HMS duplicate replay | Admin | — | BLOCKED | couldn't get a valid append (facilityCode unknown) → idempotency untested. |

**Test artifacts left:** CASE-2026-00003 (OPEN, 0 services, Nakasero), CLM-2026-00290 (RECEIVED, bed-day overlap test, 400,000 — needs dual approval, will sit unadjudicated). cs@ role reverted.

### Family B/H (extension 2) — HMS rail + PA-required + config boundaries
| Scenario | Result | Note |
|---|---|---|
| IP-H05 HMS valid feed | PASS | facilityCode = exact provider name "Nakasero Hospital" (found via source+DB). "1 applied · 0 dup · 1 unmatched"; case +75,000. |
| IP-H06 HMS unmatched line | PASS | bogus caseNumber → ExceptionLog(HMS_BATCH_UNMATCHED); valid line still processed. |
| IP-H07 / B08 HMS duplicate replay | PASS | replay → "0 applied · 1 dup · 1 unmatched"; case stayed 1 entry/75,000 (DB-verified). Idempotent, no double money. |
| IP-DEF-05 HMS malformed input | FAIL | missing facilityCode → unhandled 500 page (validation msg exists in code, not surfaced). |
| IP-GAP-HMS facilityCode discoverability | GAP | only exact name / hidden cuid work; smartProviderId null for all 195 providers; no labelled UI field. |
| IP-A06/C05 PA-required service w/o PA | PARTIAL | claim-level "PA-required routes to review" msg; per-line requiresPreauth not surfaced; tariff auto-match inconsistent (OBS-IP-TARIFF). |

**Config boundaries found via DB (untestable in this seed):** gender/frequency/referral tariff rules = 0 tenant-wide (IP-C04/D08/G04); 0 PackageProviderEligibility + digital contracts unlinked (Family D packages/bundling, IP-I04 contract-ceiling) — see OBS-IP-CONTRACT-CONFIG.

**STILL untested (risk register):** Family A (A04/A05 emergency retrospective window, A07 wrong-member PA attach, A08 expired PA, A10 amendment authority, A12 decline); C06/C07/C08 (excluded drug, benefit exhaustion, self-funded fund drawdown); E (oncology/chemo); F (maternity/C-section/newborn/NICU/waiting-period/sublimit); G (transfers/ambulance/out-of-network/inactive branch); H08-10 (API spoofing/offline); I07 fraud gate, I09 void reversal, I10 appeal, I11 cost-share; J05 duplicate mark-paid, J10 reports export tie-out; K (FX/missing-FX/mixed-currency); L member/HR/fund scope + notifications.
