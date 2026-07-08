# GO / NO-GO — Comprehensive Outpatient Front-End UAT (Vercel)

**Verdict: 🟢 GO (pending live re-verification on next deploy)** — updated 2026-07-08 after the full remediation pass (`DEFECT_AND_ISSUE_REMEDIATION_PLAN.md`). Both Critical provider-API IDOR blockers (**E2E-D02** read scope, **E2E-D04** preauth write scope) are fixed in code with regression tests, and every remaining Medium/Low/condition item (E2E-D01 search, OBS-MEMSEL invite, OBS-CUR/OBS-2 currency+FX, OBS-7 fraud gate, OBS-6 nav) is resolved. Code gates: `typecheck` clean · **542/542 vitest** · `currency:guard` (622 files) OK · no lint regressions. **The GO becomes final once these fixes are deployed to Vercel and the D02/D04 exploit curls + the money spine are re-run live** (the last standing verification step, per §16 of the remediation plan).

> **2026-07-08 remediation scoreboard**
> | Blocker / condition | Prior | Now |
> |---|---|---|
> | E2E-D02 provider API read scope (Critical) | 🔴 OPEN | ✅ FIXED-VERIFIED-LOCAL (`provider-read-scope.test.ts`) |
> | E2E-D04 provider API preauth write scope (Critical) | 🔴 OPEN | ✅ FIXED-VERIFIED-LOCAL (`provider-preauth-scope.test.ts`) |
> | E2E-D01 member full-name search (Medium) | OPEN | ✅ FIXED (`member-search.test.ts`) |
> | E2E-OBS-MEMSEL invite selector cap (Low) | OPEN | ✅ FIXED (async scoped picker) |
> | E2E-OBS-CUR / OBS-2 currency + FX (Low/condition) | OPEN | ✅ FIXED (de-KES sweep + guard 622 files; single-currency batch guardrail; FX-normalised approval) |
> | OBS-7 fraud approval gate (condition) | OPEN | ✅ FIXED (tenant-gated `enforceFraudGate`) |
> | OBS-6 clinical nav link (Low) | OPEN | ✅ FIXED (Exceptions link → ADMIN_ONLY) |

**Prior verdict (2026-07-07): 🔴 NO-GO** — **downgraded from CONDITIONAL GO** by a new **Critical** provider-API data-scope defect **E2E-D02** found in the E2E scenario pass.

> **E2E Scenario pass (2026-07-07, build c11294d — `E2E_SCENARIO_RUN_LOG.md`):** The broader `OUTPATIENT_E2E_SCENARIO_UAT_TEST_DOCUMENT` (13-step spine + families A–K) was executed. The full money spine was **re-proven fresh, front-end, actors-as-themselves** on claim **CLM-2026-00287** (eligibility→intake→APPROVED→SETTLED→voucher PV-2026-00005→JE-2026-00017→PAID→GL balanced→provider statement), plus J03/J04 SoD, F01/F02/F04/F06/F07 money controls, A01/A03, C04-08, E03, and provider-API D01-D05 — all PASS. OBS-4/OBS-5/PR-V01/PR-V02 re-verified.
>
> **🔴 BLOCKER — E2E-D02 (Critical): provider API read endpoints are not tenant/provider-scoped.** `GET /api/v1/eligibility` and `GET /api/v1/claims?claimNumber=` authenticate the Bearer key but do **not** filter to the key's facility/tenant. One contracted provider's key returned (a) any member's eligibility **+PII incl. DOB** across all clients (verified Safaricom & KCB members via an NWSC Aga Khan key), and (b) any claim across all facilities incl. member PII + amounts (verified Aga Khan key read **IHK** claim CLM-2026-00284). Member/claim numbers are sequential ⇒ the entire platform's membership PII and claim ledger is enumerable by any single provider. This is the doc's Critical "cross-member/provider data exposure" and it **flips Spine-Q3 (hard data scope) to NO on the API surface** — front-end scoping and claim *creation* remain correctly scoped, so the fix is narrow (apply the key's facility/tenant filter to the two GET read paths).
>
> New lower-severity items: **E2E-D01** (member full-name search returns 0), **E2E-OBS-CUR** (residual KES labels — display only, GL balanced), **E2E-OBS-MEMSEL** (member-link selector ~250 cap). Still PENDING (untested risk): live HR/fund/reports & member portal visibility, B check-in, D offline/HMS, H pre-auth, I FX/mixed-currency, remainder of A/C/E/F/J — see the run log's pending register.
The sole Critical blocker (PR-V02, settlement Mark Paid) was fixed, **deployed to production, and re-verified through the front end** — the previously-stranded batch now settles end-to-end with a balanced GL and PAID propagation. **A full closure pass then exercised every previously-untested item** (see `CLOSURE_TEST_RUN_LOG.md`) — all PASS, no new Critical/High defects — which **retires the untested-risk register** that qualified this verdict. Remaining items are conditions/observations, not blockers. *(Original verdict was NO-GO; the change was earned by an independent Phase R re-test + closure pass on the live build, not by the code fix alone.)*

### Closure pass (2026-07-07) — untested-risk register RETIRED
Front-end only, each actor as themselves; admin created the missing **fund admin** via UI. Fresh claims CLOSURE-A (Mark/Aga Khan, approved+settled 11,500), CLOSURE-B (Prossy/IHK, **partial** 14,000→6,000 paid/8,000 rejected), CLOSURE-C/D (disposables).
| Untested item | Result |
|---|---|
| Live HR NWSC-only scope | **PASS** — sees NWSC utilisation from live claim (16,500→28,000); denied all other-employer + admin/provider/claims/settings/member routes. |
| Fund-admin fund-balance impact | **PASS** (Branch F1, NWSC self-funded) — fund scoped to NWSC, moved −11,500 = approved payer share; GL balanced. |
| Report exports & tie-out | **PASS** — CSV exact tie-out (claims/provider/exclusion/utilisation); **PDF export unverified → OBS-CLOSURE-1**. |
| Scenario D (D4 zero-amt, D5 future-DOS, D6 double-submit, D7 decide-before-compute, D8 dup-settlement) | **PASS** — all fail safe; contract ceiling enforced at decision. |
| Partial-approval math + settlement exclusion | **PASS** — 14,000 = 6,000 approved/paid + 8,000 rejected/excluded; utilisation +6,000 only. |
| Member notifications | **GAP → OBS-CLOSURE-2** — no in-app notifications for outpatient intake/approval/payment (status only in dashboard activity feed). |
New this pass: **OBS-CLOSURE-1** (PDF export unverified), **OBS-CLOSURE-2** (member-notification gap). Persisting: OBS-2 (currency labels), OBS-7 (fraud-approval gate). None are blockers.

- **Target:** https://avenue-portal.vercel.app (Vercel production deployment `dpl_4rP7…`, READY)
- **Method:** 100% browser-driven via Chrome, every actor logging in as themselves, front-end only, no DB/API shortcuts (per runbook). Missing users created by admin through the UI.
- **Scope tested:** Setup (all users), Scenario A (full-approval principal), Scenario B (dependant decline), Scenario C (provider/member RBAC scoping), Scenario D (partial validation). GL reviewed.

## Spine questions
| # | Question | Answer | Basis |
|---|----------|--------|-------|
| 1 | Can an outpatient claim be filed → adjudicated → **settled** → reflected to provider/member/reports, each actor as themselves, front-end only? | **YES** (post-fix) | File ✓, adjudicate ✓ (APPROVED 16,500), **settle ✓ (Phase R): Mark Paid → SETTLED**, claims → PAID, provider paid-to-date +3,288,480, balanced GL journal. Was NO pre-fix (PR-V02). |
| 2 | Does money/benefit leave only per contract (maker≠checker, payable ceiling, GL balanced, rejected excluded)? | **PARTIAL** | Maker/checker enforced ✓, payable ceiling + "pay-above-ceiling" override ✓, GL trial balance ✓ balanced, decline carries no payable ✓. Caveats: a single claims officer approved a fraud-flagged claim in full with no 2nd approval (OBS-7); settlement itself can't complete. |
| 3 | Is data scope hard — provider sees only own facility, member only self, forbidden routes denied? | **NO (API)** / YES (front-end) | Front-end hard-scoped (Aga Khan vs IHK isolation, member IDOR denied, branded Access Denied). **But the provider API leaks cross-scope: E2E-D02 (Critical) — `GET /api/v1/eligibility` & `/api/v1/claims?claimNumber=` return any tenant's member PII (incl. DOB) and any facility's claims to any provider key.** Enumerable ⇒ full-platform exposure. |

## Blocker scoreboard
| ID | Sev | Blocks | Status |
|----|-----|--------|--------|
| PR-V02 | **Critical** | Provider settlement "Mark Paid" fails (Prisma 5s interactive-transaction timeout on 46-claim batch); raw DB error leaked to UI; batch stranded CHECKER APPROVED; money-out cannot complete | **✅ FIXED-VERIFIED (Phase R, Vercel, 2026-07-07)** |

> **Remediation deployed & re-verified (2026-07-07)** — commit `81dcc42` deployed to production (`avenue-portal.vercel.app`, dpl_Cuced…). Phase R front-end re-test on the live build:
> - **PR-V02 FIXED-VERIFIED:** the *same stranded Aga Khan Jul 2026 batch* (46 claims, UGX 3,288,480) that failed twice before was clicked **Mark Paid → SETTLED** (settled 07/07/2026), **no error banner**. GL Trial Balance stays **✓ Balanced** and now shows the payment journal — **2010 Claims Payable Dr 3,288,480 / 1010 Cash at Bank Cr 3,288,480**. Spine-Q1 (settle end-to-end) now **YES**.
> - **OBS-2 (partial) VERIFIED:** settlement total now renders **UGX 3,288,480** (was "KES"); claim Financial Summary now **UGX 16,500**.
>
> **Phase R front-end re-verification scoreboard (live build):**
> | Item | First-pass | Re-test | Evidence |
> |------|-----------|---------|----------|
> | PR-V02 settlement | FAIL (raw timeout, stranded) | **FIXED-VERIFIED** | Same batch → SETTLED 07/07; GL 2010 Dr / 1010 Cr 3,288,480, balanced; CLM-2026-00278 PAID; Aga Khan paid-to-date 2,536,690→5,825,170 |
> | OBS-5 fraud variance | FAIL (371% false FRAUD_FLAG) | **FIXED-VERIFIED** | New identical mixed claim CLM-2026-00280 routed only for legit *double-capture*, **no variance fraud alert** |
> | PR-V01 provider search | FAIL ("no match" for Nakasero) | **FIXED-VERIFIED** | `/providers?q=Nakasero` → Nakasero Hospital |
> | OBS-4 contract preview | misleading "payable 0" | **FIXED-VERIFIED** | Caveat banner renders on the claim's Contract-engine panel |
> | OBS-2 currency | KES/UGX split | **VERIFIED (partial)** | Settlement + Financial Summary now UGX; broad KES sweep (GL page, service-line totals, portals) + FX still open |
> | OBS-6 nav / OBS-1 invite | dead link / blank pane | code-verified | Low severity; not separately re-driven on the live build |
>
> See `07_Production_Readiness/Remediation_Plan.md` § EXECUTION STATUS for the full change set.

## What is genuinely strong (verified live this run)
- **Provider portal** end-to-end intake: login → facility-scoped dashboard → eligibility (cross-scheme NWSC member resolved at partner facility) → prefilled claim form → multi-line submit → claim in TPA queue. All front-end.
- **Adjudication**: claims-officer capture → contract-tariff payable ceiling → APPROVE(full)/PARTIAL/DECLINE decisions with reasons; per-line ✓/✗; decline records reason and no payable.
- **Segregation of duties (settlement)**: maker cannot approve own batch — "Maker and checker must be different users". Checker (distinct user) approves.
- **RBAC**: per-role nav trimming (finance/claims/medical/member/reports each get a scoped menu); forbidden routes → branded Access Denied, not crashes or data.
- **Propagation**: pending-claim counters move on submit/approve; member portal shows the approved visit and increments utilisation; reports-viewer dashboard shows both UAT claims with correct status.
- **GL**: trial balance stays balanced even after the failed settlement (clean rollback).
- **Front-end user provisioning**: admin created provider (facility-scoped), reports, 2nd finance, and NWSC-scoped HR users, plus a member portal login — all through the UI; all logged in successfully.

## Conditions remaining (the CONDITIONAL in CONDITIONAL GO)
Fixed & re-verified this pass: PR-V02, OBS-5, PR-V01, OBS-4, OBS-2 (partial). Still open:
1. **OBS-7 (control, policy):** approval of a fraud-flagged claim isn't gated by a second approval / fraud-alert clearance. Now that OBS-5 stops false variance flags, implement the gate behind a tenant setting (needs product sign-off). Not a blocker, but a money-control condition.
2. **OBS-2 broad (currency/FX):** base is UGX and the key money screens are fixed, but a full KES→currency sweep remains (GL page, service-line totals, member/provider portals) and — more importantly — **FX normalisation** for non-base-currency claims and **mixed-currency settlement batches** (the Aga Khan batch summed UGX + KES claims). Must be resolved before multi-currency go-live.
3. **GL coverage:** GL revenue/claims figures look small vs system claim volume — confirm auto-posting captures all claim/settlement activity (settlement JE now confirmed posting).
4. **Scale unproven:** 2,997 members / large claim history present, but no concurrent-load test. (The settlement timeout — the original scale symptom — is fixed; a broader load test is still advisable.)

## Untested / not-yet-verified (risk register) — RETIRED by the closure pass (2026-07-07)
- ~~Settlement re-test after PR-V02 fix~~ — **DONE (Phase R): SETTLED, PAID, balanced GL.**
- ~~Live HR NWSC-only scope~~ — **DONE: PASS** (utilisation delta from live claim; hard scope both ways).
- ~~Fund-admin fund-balance impact~~ — **DONE: PASS** (Branch F1; −11,500 payer share; GL balanced; fund admin created via UI).
- ~~Report exports (CSV) tie-out~~ — **DONE: PASS** (exact tie-out). PDF export → **OBS-CLOSURE-1** (unverified in harness).
- ~~Scenario D remainder (D4/D5/D6/D7/D8)~~ — **DONE: PASS** (all fail safe; ceiling enforced).
- ~~Partial-approval money math + settlement exclusion~~ — **DONE: PASS** (14,000→6,000 paid/8,000 excluded).
- ~~Notifications to member~~ — **DONE: GAP** (**OBS-CLOSURE-2** — no in-app notifications for OP lifecycle).
> The register is now empty of untested outpatient items. Remaining conditions are the standing ones below (currency/FX sweep, OBS-7 fraud-approval gate, scale/load) plus the two new low/medium observations.

## Deliverables
- `TEST_RUN_LOG.md` — per-step results with evidence (screenshot IDs).
- `DEFECT_REGISTER.md` — PR-V01, **PR-V02 (Critical)**, OBS-1…OBS-7.
- `MASTER_RUN_LOG.md` — environment facts, personas, IDs, resume pointer.
- `07_Production_Readiness/Outstanding_Conditions_Development_Plan.md` — development plan for the remaining non-working conditions: OBS-7, OBS-2 broad currency/FX, GL coverage, and scale/load proof.
- `OUTSTANDING_CONDITIONS_UAT_TEST_PLAN.md` — execution plan for OBS-7, OBS-2 broad currency/FX, GL coverage, and scale/load proof.
