# Outpatient Journey E2E UAT — Execution Log

**Test document:** `OUTPATIENT_E2E_SCENARIO_UAT_TEST_DOCUMENT.md` (13-step spine + Scenario families A–K)
**Target:** https://avenue-portal.vercel.app — deployment `dpl_5iwgBAkszDHG2NLrZ1mdFPripPjP` = commit **c11294d** (latest, READY, production)
**Started:** 2026-07-07
**Method:** 100% front-end via Chrome MCP (Browser 1, deviceId 03aa4fc8…). Each actor logs in as themselves. No DB/API/Prisma shortcuts for the functional flow (API/HMS/offline scenarios excepted per doc §2). DB/logs only to verify side effects.

## RESUME POINTER
- **Last updated:** 2026-07-07 (spine + A/C/D-API/E/F/J done; **TWO Critical API scope blockers found → NO-GO**; B/H/offline/HMS/I + live HR/fund/reports/member visibility pending)
- **Status:** VERDICT **NO-GO**. Money spine proven (Spine-Q1 & Q2 = YES) but **Spine-Q3 (hard data scope) = NO on the API**. Blockers: **E2E-D02** (Critical — API GET eligibility/claims read cross-scope, LIVE-verified; fixed in code by the fix-session worktree, **NOT yet redeployed/re-verified**) and **E2E-D04** (Critical — POST /api/v1/preauth create cross-scope, deployed-source-verified, live write not executed). Front-end tranche PASS: spine OP-00.1-11, A01/A03, C02/C04-06/C08/C10, E03, F01/F02/F04/F06/F07, D01-D05 (API functional), J01/J03-J08. Re-verified OBS-4/OBS-5/PR-V01/PR-V02. Low/med: E2E-D01, E2E-OBS-CUR, E2E-OBS-MEMSEL.
- **Next step (Phase R when fix redeploys):** re-verify E2E-D02 live (facility-A key must 404 on facility-B claim + not resolve cross-tenant member) AND confirm E2E-D04 preauth fix; then resume PENDING families: Scenario H (pre-auth H01-13 — /preauth/new exposed to MEDICAL OFFICER), B (secure check-in /check-ins + /member/check-in), D offline/HMS (D06-10), I FX/mixed (BLOCKED on KES FX config), live HR/fund/reports visibility (re-provision or existing @test.local pw recovery), member portal (blocked by E2E-OBS-MEMSEL), remainder A/C/E/F/J.
- **Next step (remaining coverage — all PENDING = untested risk):**
  1. **Member/HR/fund/reports visibility (OP-00.12/00.13, K01–K08)** — needs re-provisioned logins (member/reports/HR/fund `@…` passwords unknown; re-provision via admin Invite as done for provider/finance-checker). NOTE MEMBER_USER invite may create an unlinked portal user — verify it links to Mark Kato's record. Member notifications 0→3 already FIXED-VERIFIED in the prior CLOSURE pass.
  2. **Scenario B** secure check-in (OP-B01–B09) — /check-ins + /member/check-in.
  3. **Scenario D** alternate rails — provider API (/api/v1/claims via API Keys), offline sync, HMS batch.
  4. **Scenario G** fraud gate (re-run OP-G01–G06; gate currently default OFF — outstanding-conditions pass already proved block+clearance+dual-approval; OBS-7 = policy).
  5. **Scenario H** pre-auth/holds (OP-H01–H13).
  6. **Scenario I** currency/FX (OP-I02/I03 non-base FX, I04/I05 mixed-currency batch) — BLOCKED without a KES FX rate + KES claim path (per outstanding-conditions pass).
  7. **Remainder of A** (A02 dependant, A03 unknown, A04/A05 ineligible member/group, A06/A07/A08 scope/inactive/branch), **C** (C03 adjacent benefits, C04–C09 validation/qty/future-date/double-submit), **E** (E01/E02/E04–E10 auto-adj routing), **F** (F02 partial, F03 decline, F04 zero, F05 terminal, F06 over-ceiling, F07 override, F11–F13 matrix, F14 cost-share, F15 self-funded, F16 void), **J** (J02 no-eligible, J09 reports tie-out, J10 large batch), **K** RBAC sweep.
- **Active persona / tab:** Provider (Aga Khan, provider.agakhan.e2e). Chrome tabId 80909500.
- **Working credentials created this run:** provider **provider.agakhan.e2e@test.local** / MedvexAdmin2024! (Aga Khan); finance checker **finance.checker.e2e@test.local** / MedvexAdmin2024!.

## ⚠️ ENV FACT — persona passwords
- The old UAT `@test.local` accounts (provider.agakhan.uat, provider.ihk.uat, finance.checker.uat, reports.uat, hr.nwsc.uat, fund.nwsc.uat) were created in prior sessions with temp passwords **that were never durably recorded** — `MedvexAdmin2024!` does NOT work for them.
- Seeded medvex.co.ug accounts (admin/claims/finance/medical/underwriter/cs) DO use `MedvexAdmin2024!`.
- **Recovery:** admin → /settings → Invite User sets a **temporary password** (Provider role reveals a Facility selector). Re-provision any needed persona with a known password.
- **Working provider (created this run):** `provider.agakhan.e2e@test.local` / `MedvexAdmin2024!` (PROVIDER USER, facility = Aga Khan University Hospital).

## Personas & credentials (from prior passes — re-verify on login)
| Role | Login | Password |
|---|---|---|
| Super admin | admin@medvex.co.ug | MedvexAdmin2024! |
| Claims officer | claims@medvex.co.ug | MedvexAdmin2024! |
| Medical/fraud reviewer | medical@medvex.co.ug | MedvexAdmin2024! |
| Finance maker | finance@medvex.co.ug | MedvexAdmin2024! |
| Finance checker | finance.checker.uat@… | MedvexAdmin2024! |
| Reports viewer | reports.uat@… | MedvexAdmin2024! |
| HR (NWSC) | hr.nwsc.uat@… | MedvexAdmin2024! |
| Provider (Aga Khan) | provider.agakhan.uat@… | MedvexAdmin2024! |
| Provider (IHK) | provider.ihk.uat@… | MedvexAdmin2024! |
| Member (principal) | mark.kato2593@nwsc-scheme.example | (member pw) |

## Test data (from prior passes)
- Principal: **Mark Kato** (NWSC-2026-01768), NWSC self-funded scheme.
- Dependant: **Prossy Kato** (NWSC-2026-02891).
- Positive facility: **Aga Khan**; negative facility: **IHK**.
- Fraud trigger: claim billed > 150,000 with no linked PA ⇒ HIGH alert (FraudService.evaluateClaim).

## Confirmed persona logins (from /settings, all ACTIVE, pw MedvexAdmin2024! unless noted)
| Role | Login |
|---|---|
| Super admin | admin@medvex.co.ug (James Kamau) |
| Claims officer | claims@medvex.co.ug (Grace Wanjiku) |
| Medical/fraud reviewer | medical@medvex.co.ug (Dr. Sarah Achieng) |
| Finance maker | finance@medvex.co.ug (Peter Ochieng) |
| Finance checker | finance.checker.uat@test.local |
| Reports viewer | reports.uat@test.local |
| HR (NWSC) | hr.nwsc.uat@test.local |
| Fund admin (NWSC) | fund.nwsc.uat@test.local |
| Provider (Aga Khan) | provider.agakhan.uat@test.local (Reception AgaKhan) |
| Provider (IHK) | provider.ihk.uat@test.local (Reception IHK) |
| Member principal | mark.kato2593@nwsc-scheme.example (member pw) |

## Execution table
| Scenario ID | Actor | Claim/PA/Batch/Visit ID | Result | Evidence | Defect/Obs | Date/time |
|---|---|---|---|---|---|---|
| OP-00.1 preconditions | Admin | — | **PASS** | Providers Aga Khan (ACTIVE, 89 claims) + IHK (ACTIVE, 2 claims); member Mark Kato NWSC-2026-01768 ACTIVE PRINCIPAL; all 11 personas ACTIVE in /settings; Setup exposes Approval Matrix/Auto-Adj/Claim Money Controls/Drug Exclusions/Pricing Models/FX Rates | E2E-D01 (member name search) | 2026-07-07 |
| OP-00.3 / OP-A01 eligibility | Provider (Aga Khan) | NWSC-2026-01768 | **PASS** | Mark Kato ELIGIBLE—cover active; Scheme NWSC Staff Medical, Pkg NWSC Officer Care (Silver), PRINCIPAL; Limit 30,000,000 / Used 31,500 / Remaining 29,968,500; "File a claim" CTA. ss_89901nhzs | OBS-2 residual: KES labels on provider portal (UGX tenant) | 2026-07-07 |
| OP-00.5 / OP-C02 intake (multi-line) | Provider (Aga Khan) | **CLM-2026-00287** | **PASS** | 3-line OP claim (consultation 3,500 + lab 4,500 + pharmacy 2,500 = 10,500), dx J06.9; submitted under logged-in provider only; status **RECEIVED**, approved/paid 0. Line totals sum to billed. ss_9771axvxb | — | 2026-07-07 |
| OP-C10 facility spoof | Provider (Aga Khan) | CLM-2026-00287 | **PASS (implicit)** | Claim form has no facility field; provider is forced server-side to Aga Khan (portal header + claim attribution). Explicit API spoof deferred to OP-D02. | — | 2026-07-07 |
| OP-00.6 review panels | Claims officer | CLM-2026-00287 | **PASS** | Detail matches provider submission (Mark Kato/Aga Khan/10,500/J06.9); Financial Summary UGX; PA(0) note; **OBS-4 caveat banner** renders ("no digital contract linked… priced from tariff schedule… use Adjudicate panel") — fix confirmed; contract preview read-only NO CONTRACT. ss_2928a2ol6 | OBS-4 FIXED-VERIFIED | 2026-07-07 |
| OP-E03 duplicate/double-capture | Claims officer | CLM-2026-00287 | **PASS** | Auto-engine **ROUTED** to manual review, named hard gate **Double-capture** (same provider/member/date/category vs 00278/00280/00283/00285/00286). No auto-approval. ss_9452bgpvn | — | 2026-07-07 |
| OP-00.7 / OP-F01 full approval | Claims officer | CLM-2026-00287 | **PASS** | Adjudicate panel: Payable ceiling UGX 10,500 (PC-2026-128 tariff), Delta vs billed 0; Approve (Full) 10,500; Submit Decision → claim **APPROVED, UGX 10,500** in list. All money UGX. ss_21945zkms | PAY_ABOVE_CONTRACT override control present (OP-F07 candidate) | 2026-07-07 |
| OP-00.8 / OP-J01 batch create | Finance maker | Aga Khan Oct 2026 batch | **PASS** | Created batch scooping exactly the 1 unsettled approved claim (CLM-2026-00287), **UGX 10,500**, single currency, MAKER SUBMITTED. ss_6182ub745 | — | 2026-07-07 |
| OP-J03 duplicate batch | Finance maker | Aga Khan Jul 2026 | **PASS** | "Settlement batch already exists for this provider and cycle" friendly banner, no dup, no raw error (PR-V02b). ss_35744zbs2 | — | 2026-07-07 |
| OP-00.9 / OP-J04 self-approval | Finance maker | Aga Khan Oct batch | **PASS** | Maker's own Approve → "Maker and checker must be different users"; batch stays MAKER SUBMITTED. ss_8559sf3uu | — | 2026-07-07 |
| OP-00.10 / OP-J05 approve+MarkPaid | Finance checker (e2e) | Aga Khan Oct batch | **PASS** | Distinct checker Approve → CHECKER APPROVED → **Mark Paid → SETTLED** (settled 07/07), no error. Fresh **PR-V02 re-verify**. ss_9791k0q0s | — | 2026-07-07 |
| OP-J05/J07 side effects | Finance checker | PV-2026-00005 / JE-2026-00017 | **PASS** | Voucher **PV-2026-00005 PROCESSED** (1 claim, 10,500); **JE-2026-00017** "Provider settlement paid" posted → Account Ledger; **CLM-2026-00287 → PAID**, Approved/Paid=10,500=approved; footer "maker-checker enforced… balanced journal entry". ss_0073uzf6h | **OBS-2 residual (settlement detail/voucher render KES vs list UGX)** | 2026-07-07 |
| OP-J06 duplicate Mark Paid | Finance checker | Aga Khan Oct batch | **PASS** | SETTLED batch shows no Mark-Paid control (only "Settled") → no duplicate voucher/cash possible via UI. | — | 2026-07-07 |
| OP-J07 GL balanced | Finance checker | GL trial balance | **PASS** | /billing/gl Trial Balance **✓ Balanced** after settlement; Cash/Claims-Payable reflect postings; 24 accounts. ss_2826zs4ny | GL page labels "(KES)" — display residual | 2026-07-07 |
| OP-00.11 / OP-J08 provider visibility | Provider (Aga Khan) | PV-2026-00005 | **PASS** | Provider Settlements shows own **Oct 2026 · 1 · UGX 10,500 · PV-2026-00005 · SETTLED**; TOTAL SETTLED **UGX 3,313,980**; hard-scoped to own facility; statement = voucher. ss_1768x1spp | provider settlements page UGX (but dashboard/eligibility KES — inconsistent) | 2026-07-07 |
| OP-A03 unknown member | Provider (Aga Khan) | — | **PASS** | Eligibility search NWSC-2026-99999 → "No member found… Check the card number" friendly, no claim start. ss_5311bh52q | — | 2026-07-07 |
| OP-C04/C05/C06 validations | Provider (Aga Khan) | — | **PASS** | Empty claim form (no member/diagnosis/description, zero line, total 0) does not submit; no claim created. Required-field + positive-line validation. ss_5257jvx8f | — | 2026-07-07 |
| OP-C08 future DOS | Provider (Aga Khan) | — | **PASS** | Valid claim with DOS 2026-08-15 → "Date of service cannot be in the future (operating timezone: Africa/Kampala)"; no claim. ss_183951xgp | — | 2026-07-07 |
| OBS-5 fraud variance re-verify | Claims officer | CLM-2026-00280 | **FIXED-VERIFIED** | Contracted Rate Analysis: Billed 16,500 vs Contracted (tariffed lines) 3,500 = **Variance 0.0%** (like-for-like), not the old 371% false flag. ss_08184o7lr | — | 2026-07-07 |
| OP-F04 zero approved | Claims officer | CLM-2026-00280 | **PASS** | Submit with approved=0 → "Approved amount must be greater than zero." (URL error); no approval. | — | 2026-07-07 |
| OP-F06 over-ceiling + F07 override | Claims officer | CLM-2026-00280 | **PASS** | Submit approved 20,000 > 16,500 ceiling → "Contract enforcement: approved amount (UGX 20,000) exceeds the payable ceiling of UGX 16,500 under PC-2026-128… raise a PAY_ABOVE_CONTRACT_RATE override (requires senior approval)." Claim stays CAPTURED, Approved UGX 0. Override path present. ss_9097egei4 | — | 2026-07-07 |
| OP-F02 partial approval | Claims officer | CLM-2026-00280 | **PASS** | Decision "Partially Approve" 8,000 of billed 16,500 → **PARTIALLY APPROVED**, Approved **UGX 8,000** only (8,500 shortfall not payable); APPROVED counter 121→122. ss_243442laj | — | 2026-07-07 |
| OP-D01 API claim create | Provider API (Aga Khan key) | CLM-2026-00288 | **PASS** | `POST /api/v1/claims` (Bearer key) → 201 `{claimNumber:CLM-2026-00288,status:RECEIVED,billedAmount:3500}`; appears in Aga Khan TPA/provider queue RECEIVED; same intake pipeline. | — | 2026-07-07 |
| OP-D02 API facility scoping (create) | Provider API | CLM-2026-00288 | **PASS** | POST with spoofed `providerCode:"IHK-KAMPALA-001"` still attributed to **Aga Khan** (key's facility) — write path forces own facility; cross-facility create-spoof blocked. | — | 2026-07-07 |
| OP-D03 API missing fields / future DOS | Provider API | — | **PASS** | Empty body → 400 "Missing required fields: memberNumber, providerCode, serviceType, dateOfService, diagnoses, lineItems"; future DOS → 422 "Date of service cannot be in the future (Africa/Kampala)". No claim. | — | 2026-07-07 |
| OP-D04 API ineligible/unknown member | Provider API | — | **PASS** | POST/GET for NWSC-2026-99999 → 404 "Member not found"; no auth → 401. | — | 2026-07-07 |
| OP-D05 API claim status lookup | Provider API | — | **PASS (functional)** | `GET /api/v1/claims?claimNumber=` → 200 with claimNumber/status/member/provider/dateOfService/billed/approved/copay/submittedAt (RECEIVED 00288, PAID 00287). Missing param → 400. **BUT not provider-scoped → see E2E-D02 Critical.** | **E2E-D02 (Critical)** | 2026-07-07 |
| **OP-D02/A06/K07 API DATA-SCOPE** | Provider API (Aga Khan key) | — | **FAIL (Critical)** | **API read endpoints not tenant/provider-scoped.** Aga Khan key read IHK claim CLM-2026-00284 (Prossy Kato, billed 14,000/approved 6,000, HTTP 200) and any-tenant member eligibility incl. **DOB** (Safaricom Amina Naliaka DOB 1977-03-03; KCB Agnes Mwangi DOB 1983-04-14). Garbage key → 401 (auth ok, scoping absent). Enumerable member/claim numbers ⇒ full-platform PII + claims scrape by any one provider. **Spine-Q3 = NO on API.** | **E2E-D02 (Critical)** | 2026-07-07 |
| OP-H01 PA form exposed | Medical Officer | — | **PARTIAL** | `/preauth/new` renders as MEDICAL OFFICER: Member+Provider selects, Service Type/Benefit, Expected DOS, **Estimated Cost (KES)** [residual KES — E2E-OBS-CUR], Primary Diagnosis, Planned Procedure, Clinical Notes. PA create/decision (H02-H13) not executed — member selector is the same large-list component (E2E-OBS-MEMSEL cap risk) and session context limit reached. ss_5292dja0k | E2E-OBS-CUR (PA form KES) | 2026-07-07 |
| OP-00.12 member visibility | Member | — | **DEFERRED** | Member-portal login couldn't be re-provisioned to Mark Kato: the Invite→MEMBER_USER "Member Profile" selector only loads ~250 members (alphabetical, stops ~"Angela Kato") so Mark Kato (M) isn't selectable (E2E-OBS-MEMSEL). Member notifications 0→3 + utilisation already FIXED-VERIFIED for a fresh claim in the prior CLOSURE pass (OBS-CLOSURE-2). | E2E-OBS-MEMSEL | 2026-07-07 |

## Defects / observations found this pass
| ID | Sev | Persona | Route | Summary | Observed vs Expected | Evidence |
|----|-----|---------|-------|---------|----------------------|----------|
| **E2E-D02** | **CRITICAL** | Provider API (any facility key) | `GET /api/v1/eligibility`, `GET /api/v1/claims?claimNumber=` | **Provider API read endpoints are not tenant/provider-scoped — cross-provider & cross-tenant data exposure (IDOR).** A single contracted provider's API key returns (a) **any member's eligibility+PII** across ALL clients by member number — incl. full name, **date of birth**, gender, group, package (verified: Safaricom "Amina Naliaka" DOB 1977-03-03; KCB "Agnes Mwangi" DOB 1983-04-14 — both returned to an NWSC-facility Aga Khan key); and (b) **any claim** by number across ALL facilities — claimNumber/status/member(name+number)/provider/billed/approved/copay (verified: Aga Khan key read **IHK** claim CLM-2026-00284, "Prossy Kato", billed 14,000/approved 6,000). Member numbers (NWSC-2026-NNNNN, AVH-…-NNNN) and claim numbers (CLM-2026-NNNNN) are sequential ⇒ the whole platform's membership PII + claim ledger is enumerable by any one provider. Auth works (garbage key → 401) and **claim creation IS scoped** (spoofed providerCode forced to own facility) — the scoping was simply never applied to the two GET read paths. | Expected: a provider key resolves only its own facility's claims and its own contracted members (or is otherwise tenant-scoped). Observed: 200 + full cross-tenant/cross-provider PII & financials. | curl: elig AVH-DEMO-SAF-0023-S/AVH-2024-00010 (DOB PII), claims CLM-2026-00284 (IHK) via Aga Khan key mvxk_0295c8c0…; control garbage-key 401 |
| **E2E-D04** | **CRITICAL** | Provider API (any facility key) | `POST /api/v1/preauth` | **Pre-auth create path is not scoped to the API key — cross-tenant / cross-facility write (IDOR).** Verified against the **deployed** handler `src/app/api/v1/preauth/route.ts`: member resolved by `prisma.member.findFirst({where:{memberNumber}})` with **no tenant filter** (line 14), provider resolved by caller-supplied `providerCode` via `slade360ProviderId` with **no key match** (line 27), and the PA is created under `member.tenantId` + `provider.id` — the authenticated key's identity is never used for scoping. So any provider key can create pre-authorizations for **arbitrary members in other tenants, attributed to arbitrary facilities**. Live route confirmed active (empty→400 "Missing required clinical parameters"; no-auth→401). Same `withApiKey` pattern & class as the live-proven E2E-D02. **Live write intentionally NOT executed** to avoid creating spurious PA records against other clients' members on production. Same-day fix session flagged this too (its worktree). | Expected key-scoped member+provider resolution (own tenant/facility only). Observed unscoped resolution ⇒ cross-tenant write. | deployed route.ts L14/L27/L39-52; live 400/401 probes | OPEN — BLOCKER |
| E2E-D01 | Medium | Admin | /members?q= | Member registry search fails on full-name "First Last" queries. `q=Mark` → 28 hits, `q=Kato` → 50 hits, but `q=Mark Kato` → **0 of 2999** although member "Mark Kato" (NWSC-2026-01768) exists with that exact display name; found only by member number. Multi-token name (firstName+lastName) not matched. Same class as the fixed provider-search PR-V01, still open for members. | Expected: "Mark Kato" returns the member. Observed: 0 results. Workaround: search by member number or single token. | ss_4678y56we (0 results), ss_04552df5b (by number), ss_12052dcpa (Kato=50), ss_50095prfl (Mark=28) |
| E2E-OBS-MEMSEL | Low | Admin | /settings Invite User → Member User | The "Member Profile" link selector on the member-invite form only loads ~250 members (alphabetical, cuts off around "Angela Kato"). Members past that (e.g. Mark Kato, NWSC-2026-01768) can't be linked to a new portal login via the UI. Blocks creating/repairing a member-portal login for most of the 2,999-member roster. | Expected: searchable/full member list; observed: ~250-option cap. | form_input option dump (stops at Angela Kato); ss_4673ynhgp |
| E2E-OBS-CUR | Low/Med | All | multiple | **Residual KES currency labels on the UGX (NWSC) tenant — broader than the c11294d "authoritative surfaces" claim, and internally inconsistent for the SAME record.** Same claim CLM-2026-00287 shows **UGX** on the TPA claims list/detail & settlement list, but **KES** on: provider portal dashboard (paid-to-date) & eligibility limit, **settlement detail / voucher / provider statement** (PV-2026-00005 "KES 10,500"), GL page ("DEBIT (KES)/CREDIT (KES)"), and the admin dashboard "Premium Billed vs Claims Approved (KES)" chart. Stored amounts + GL are correct base UGX (trial balance balanced) — display-label only. | Expected: consistent UGX on a UGX tenant. Observed: mixed KES/UGX across surfaces. | ss_5101gcr23 (provider KES), ss_89901nhzs (eligibility KES), ss_0073uzf6h (voucher KES), ss_2826zs4ny (GL KES), ss_1768x1spp (provider settlements UGX), ss_1162q7sm2 (TPA list UGX) |
</content>
</invoke>
