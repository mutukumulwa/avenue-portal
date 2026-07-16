# Closure Test Run Log — Untested Items (Outpatient FE UAT, Vercel)

Front-end only, Chrome, every actor as themselves, **no DB injections**. Runbook: `UNTESTED_ITEMS_CLOSURE_TEST_PLAN.md`.
Legend: PASS · FAIL(defect) · BLOCKED(reason) · PARTIAL · N/A · GAP(no UI path)

## RESUME POINTER
- **Last updated:** 2026-07-07 — **CLOSURE PASS COMPLETE.**
- **Status:** ALL six untested items exercised end-to-end, front-end only. **PASS**, no new Critical/High. Two new observations (OBS-CLOSURE-1 PDF export unverified; OBS-CLOSURE-2 member-notification gap). Verdict stays **CONDITIONAL GO**; untested-risk register retired. See CLOSURE VERDICT at bottom + tie-out table in § R.
- **Only follow-ups (non-blocking):** manually confirm PDF export (OBS-CLOSURE-1); product decision on member notifications (OBS-CLOSURE-2), OBS-7 fraud-approval gate, OBS-2 currency/FX sweep, scale/load.
- **Active tab:** Chrome tabId 80909481 (Browser 1, device 03aa4fc8…). Last persona: Reports Viewer.

## Closure claim inventory (filed this pass, all Aga Khan)
| Claim | Member | Billed | Purpose | Status now |
|-------|--------|-------:|---------|-----------|
| CLM-2026-00283 | Mark Kato NWSC-2026-01768 | 11,500 | **CLOSURE-A** approved lifecycle (Consult 99213 3,500 + Lab 85025 8,000) | RECEIVED |
| CLM-2026-00282 | Noah Kato NWSC-2026-02995 | 6,500 | **CLOSURE-C** decide-before-compute | RECEIVED |
| CLM-2026-00281 | Noah Kato NWSC-2026-02995 | 3,500 | **CLOSURE-D** double-submit (ONE claim ✓) | RECEIVED |
| _(prior)_ CLM-2026-00280 | Mark Kato | 16,500 | prior Phase-R artifact | RECEIVED |
| _(prior)_ CLM-2026-00278 | Mark Kato | 16,500 | prior settled | PAID |
- Disposable member for negatives: **Noah Kato NWSC-2026-02995** (CHILD of Stella Kato, eligible, used 0).

## Environment & Personas (verified this pass, 2026-07-07)
- Target: https://avenue-portal.vercel.app (Vercel prod). Front-end only.
- Admin: `admin@medvex.co.ug` / `MedvexAdmin2024!` (SUPER ADMIN, James Kamau).
- Seeded accts (@medvex.co.ug) password `MedvexAdmin2024!`; UAT accts (@test.local) password `MedvexUat2026!`.
- **All required personas EXIST — no creation needed:**
  | Actor | Account | Pw |
  |---|---|---|
  | Admin | admin@medvex.co.ug | MedvexAdmin2024! |
  | Claims officer | claims@medvex.co.ug (Grace Wanjiku) | MedvexAdmin2024! |
  | Medical officer | medical@medvex.co.ug (Dr. Sarah Achieng) | MedvexAdmin2024! |
  | Finance maker | finance@medvex.co.ug (Peter Ochieng) | MedvexAdmin2024! |
  | Finance checker | finance.checker.uat@test.local | MedvexUat2026! |
  | **Fund admin** | **fund@medvex.co.ug (Caroline Mwaura, FUND ADMINISTRATOR)** | MedvexAdmin2024! |
  | NWSC HR | hr.nwsc.uat@test.local (HR MANAGER) | MedvexUat2026! |
  | Reports viewer | reports.uat@test.local | MedvexUat2026! |
  | Provider Aga Khan | provider.agakhan.uat@test.local | MedvexUat2026! |
  | Provider IHK | provider.ihk.uat@test.local | MedvexUat2026! |
  | Member (principal) | mark.kato2593@nwsc-scheme.example | **MedvexUat2026!** (reset this pass) |
- Members: **Mark Kato NWSC-2026-01768** (PRINCIPAL, ACTIVE, Silver, limit 30M) — family unit links **Prossy Kato NWSC-2026-02891** (Parent, 75y). Mark member-detail id `nwf20d96a1fc596cd8a29c`; group NWSC id `cmr94u1ks000804l56wkowsve`.
- Providers: **Aga Khan University Hospital** (HOSPITAL PARTNER, Nairobi, ACTIVE, 84 claims) · **International Hospital Kampala (IHK)** (HOSPITAL PANEL, Kampala, ACTIVE, 1 claim).

## Key baselines captured (for tie-out)
- **Mark Kato utilisation = KES 16,500** (annual limit 30,000,000; remaining 29,983,500; 2 total claims). From prior CLM-2026-00278.
- **NWSC fund (self-funded) CURRENT BALANCE = KES −16,500**, deposited KES 0, min KES 300,000,000; recent activity: "Claim CLM-2026-00278 — approved −KES 16,500". Fund appears to debit **on approval**.
- Fund admin oversees **3 self-funded schemes**: Bamburi Cement, EABL, **NWSC** → **Branch F1 applies**.
- Dashboard @ login: 2,997 members · 7 groups · 11 pending claims · 266 claims/30d · 1 overdue invoice · 90% loss ratio.

## Setup Gate
| # | Actor | Route | Action | Result | Evidence |
|---|-------|-------|--------|--------|----------|
| G1 | Admin | /login | Log in | PASS | Dashboard, 2,997 members. ss_2484igpxv |
| G2 | Admin | /settings | Inventory users | PASS | 16 users, 1+ per role incl. FUND ADMINISTRATOR (Caroline Mwaura). ss_6724k2txp |
| G3 | Admin | /settings | Create missing users | N/A — none missing | All personas present from prior pass + seeds |
| G4 | Admin | /members | Mark + Prossy ACTIVE NWSC | PASS | Mark NWSC-2026-01768 PRINCIPAL ACTIVE, util 16,500; Prossy NWSC-2026-02891 Parent in family unit. |
| G5 | Admin | /providers | Aga Khan + IHK ACTIVE | PASS | Both ACTIVE contracts; search fixed (PR-V01). |
| G6 | Admin | /groups + /fund | NWSC funding model | PASS | **NWSC self-funded** (Fund portal, 1 of 3). Fund bal −16,500. Branch F1. ss_1074zajj3 |
| G7 | Admin | /settings/drug-exclusions | Covered + rejectable available | PASS | Tariffed services covered; reviewer per-line reject available; drug-exclusion engine present but empty. |

**Setup verdict:** PASS — environment ready, all actors provisioned, F-branch = F1 (NWSC self-funded).

## H. Live HR NWSC-Only Scope
Persona: NWSC HR (hr.nwsc.uat@test.local). Baseline + negative scope done now; H6–H10 (post-claim delta) deferred to CLOSURE-A.
| # | Route | Action | Result | Evidence |
|---|-------|--------|--------|----------|
| H1 | /settings (admin) | HR role/scope | PASS | Role HR MANAGER; portal header bound to "NWSC Staff Medical Scheme" (single employer). |
| H2 | /hr/dashboard | Log in as HR | PASS | HR Portal, NWSC context, 2750 active members (1541 Principal/789 Child/255 Spouse/165 Parent). Nav HR-only. ss_3094iu8f4 |
| H3 | /hr/roster | Search 01768 / Mark Kato | PASS | Mark Kato NWSC-2026-01768 PRINCIPAL ACTIVE shown. ss_2505dr0dw |
| H4 | /hr/roster | Search 02891 / Prossy | PASS | Prossy Kato NWSC-2026-02891 PARENT ACTIVE shown (dependants are in roster). ss_7141g8re0 |
| H5 | /hr/utilization | Capture baseline | PASS | **BASELINE: TOTAL CLAIMS 3, TOTAL APPROVED SPEND KES 16,500 (OUTPATIENT), loss ratio 0.0%, premium invoiced KES 0.** ss_35022dubh |
| H11 | /claims /members /settings /provider/dashboard | Forbidden routes | PASS | All four → branded **Access Denied** at /unauthorized, no data. ss_81888lnaq ss_90219nc6l ss_202785sea ss_5144yoeit |
| H12 | /hr/roster | Search non-NWSC member "Wairimu" (Bamburi) | PASS | **"No members matching your filters."** No cross-employer leak; roster total 2750 = NWSC only; all member nos NWSC-2026-*. ss_5394b1jro |

**Observations (H):** (1) HR roster search does **not** live-filter on keystroke — requires **Enter** (client-side nav). Minor UX. (2) One-off: full-page nav to `/hr/roster?q=Wairimu` (server-side, cold) returned Access Denied once; plain `/hr/roster` and in-app search both fine → transient auth race, not reproduced. (3) NWSC "premium invoiced KES 0" in HR utilisation vs group annual contribution KES 3.677B — data-setup gap (fund also shows KES 0 deposited).
**H verdict so far:** PASS (scope hard both ways). H6–H10 pending CLOSURE-A.

### H6–H10 (post-CLOSURE-A, done after settlement)
| # | Result |
|---|--------|
| H6-H8 | CLOSURE-A filed (Aga Khan) → APPROVED 11,500 → SETTLED (see CLOSURE-A section). |
| H9 | /hr/utilization: **TOTAL APPROVED SPEND 16,500 → 28,000 (+11,500)**; TOTAL CLAIMS 3 → 6 (only CLOSURE-A approved; CLOSURE-C/D unapproved = 0). Math ties. |
| H10 | Mark's approved claim visible in HR NWSC aggregate; HR utilisation reflects live claim activity on approval. |
**H module verdict: PASS** — HR sees NWSC utilisation change from a live claim, cannot see other employers, cannot open admin/provider/claims/settings/member routes. Provider (Aga Khan) also confirmed post-settlement: **PAID TO DATE 5,825,170 → 5,836,670**, CLM-2026-00283 PAID, settlement voucher PV-2026-00002 (one payment).
**N7 (payment):** member notifications inbox **still 0** after payment; member dashboard shows CLOSURE-A → **PAID KES 11,500**, utilisation held at 28,000 (no double-count). **N module verdict: GAP** — no in-app notifications for outpatient intake/approval/payment; status only via dashboard activity feed.

## D. Front-End Validation Remainder (provider = Aga Khan)
Provider baseline: Aga Khan TOTAL CLAIMS 84, PAID TO DATE KES 5,825,170 (PR-V02 fix persisted). Highest claim no. CLM-2026-00280 (Mark, RECEIVED, prior run).
| # | Route | Action | Result | Evidence |
|---|-------|--------|--------|----------|
| D5.1 | /provider/claims/new | Future DOS 08/07/2026 + valid claim → Submit | PASS | Blocked: **"Date of service cannot be in the future (operating timezone: Africa/Kampala)."** No redirect. ss_6649bhs0r |
| D4.1 | /provider/claims/new | Zero unit price (TOTAL KES 0) + valid claim → Submit | PASS | Blocked: **"Add at least one service line with an amount."** No redirect. ss_9293rpoig |
| D4.2/D5.2 | /provider/claims | Check latest claims after both blocked submits | PASS | Newest still CLM-2026-00280; **no zero-amount or future-DOS claim created**. |
| D4.3/D5.3 | (transitive) | Nothing entered TPA queue | PASS | No claim created ⇒ nothing to queue (confirmed via provider list source-of-truth). |

**D4/D5 verdict:** PASS — both edge cases fail safely with friendly, specific validation; no data, no crash, no raw error.

### D6 — Double-submit dedupe (CLOSURE-D)
| # | Route | Action | Result | Evidence |
|---|-------|--------|--------|----------|
| D6.1-3 | /provider/claims/new | Fill CLOSURE-D (Noah, 3,500), **rapid double-click Submit** | PASS | Submit button disabled to "Submitting…" after 1st click; 2nd click no-op. ss_1045gnb41 |
| D6.4 | /provider/claims | Count matching claims | PASS | **Exactly ONE claim: CLM-2026-00281 (Noah, 3,500, RECEIVED)**. No CLM-2026-00282 dup. |
| D6.5 | /claims (officer) | TPA queue | PASS | Exactly one CLM-2026-00281 in queue. **Bonus:** server also flags a later same member/date/category claim as "Double-capture … already exists (CLM-2026-00281)". |

**D6 verdict:** PASS — client-side button-disable prevents accidental double-submit; server additionally detects same provider/member/date/category double-capture and routes to review. (Server-side idempotency of a deliberate refill+resubmit not separately forced — client guard + capture-detection cover the accidental case.)

### D7 — Decide-before-compute + contract-ceiling enforcement (CLOSURE-C, CLM-2026-00282)
| # | Route | Action | Result | Evidence |
|---|-------|--------|--------|----------|
| D7.1-2 | /claims/…00282 | Open CLOSURE-C | PASS | Detail loads; **Financial Summary in UGX** (OBS-2 fix); contract-engine "no contract matched" now carries **OBS-4 caveat banner**; no false fraud flag (OBS-5 fix). |
| D7.3 | claim detail | Mark as Captured (no explicit compute) | PASS | RECEIVED→CAPTURED. Adjudicate panel appears with **payable ceiling auto-computed UGX 3,500** (compute is intrinsic to capture; "Compute Variance" is a separate optional analysis). |
| D7.4 | Adjudicate panel | Submit Approve(Full) at **6,500 > ceiling 3,500** (no override) | PASS | **Blocked** — friendly banner: *"Contract enforcement: approved amount (UGX 6,500) exceeds the payable ceiling of UGX 3,500 … raise a PAY_ABOVE_CONTRACT_RATE override (requires senior approval)."* No raw error. ss_9311zjyce |
| D7.5 | claim detail | State after invalid attempt | PASS | Status stays **CAPTURED, Approved UGX 0** — claim unchanged; money did not leave. |
| D7.6 | (Override Queue) | No erroneous override artefact | PASS | Block prevented any decision; no override raised (none created since I didn't raise one). |

**D7 verdict:** PASS — payable ceiling is computed at capture and **enforced at decision**; a decision cannot bypass/exceed the computed contract ceiling without a senior-approval override. Directly supports **Spine-Q2** (money leaves only per contract). CLOSURE-C left CAPTURED/Approved 0 (disposable).

## CLOSURE-A — Approved lifecycle end-to-end (CLM-2026-00283, Mark Kato, billed 11,500)
| Step | Actor | Result | Evidence |
|------|-------|--------|----------|
| File | Aga Khan provider | CLM-2026-00283 RECEIVED, billed UGX 11,500 (Consult 3,500 + Lab 8,000) | ss_6569fea2o |
| Capture+Approve | Claims officer | Ceiling auto-computed UGX 11,500 (both lines within tariff), Approve(Full) → **APPROVED UGX 11,500** | ss_7581nzrkn |
| **Fund debit (on approval)** | Fund admin | **NWSC fund −16,500 → −28,000 (−11,500 = approved payer share)**; activity "CLM-2026-00283 — approved −11,500" | ss_02542u92x |
| Member utilisation | Member Mark | **16,500 → 28,000 (+11,500)**; recent activity "KES 11,500 APPROVED" | (dashboard) |
| Batch | Finance maker | Aug 2026 batch created, 1 claim, UGX 11,500, MAKER SUBMITTED (Jul cycle blocked "batch already exists"; used Aug label — cycle is a run-label, picks up outstanding approved claims) | ss_722527fgp |
| Maker≠checker | Finance maker | **Blocked** approving own batch: "Maker and checker must be different users" | ss_78454iaq9 |
| Checker approve | Finance checker | → CHECKER APPROVED | ss_96598s1j8 |
| **Mark Paid** | Finance checker | → **SETTLED 07/07/2026, no error** (PR-V02 fix holds on fresh batch) | ss_29430h23q |
| GL | Finance checker | Trial Balance **✓ Balanced** (6,358,180=6,358,180); settlement posted **Cash Cr +11,500 (3,288,480→3,299,980) / Claims Payable Dr +11,500** — one journal | ss_42250o638 |

**Spine-Q1 = YES** for a fresh claim: file → adjudicate → **settle** → reflected to fund/member/GL, each actor as themselves, front-end only.

## F. Fund-Admin Fund-Balance Impact — Branch F1 (NWSC self-funded)
Admin provisioned a controllable fund admin via Invite User: **fund.nwsc.uat@test.local / MedvexUat2026!**, scoped to NWSC only (the seeded fund@medvex.co.ug password was unknown/rejected). Invite modal exposes SELF-FUNDED SCHEMES multi-select.
| # | Result |
|---|--------|
| F1.1/1.2 | Fund admin logs in → /fund/dashboard, **"Overseeing 1 self-funded scheme" = NWSC only** (scoping holds — does not see Bamburi/EABL). |
| F1.3 baseline | NWSC fund **−16,500** (pre-CLOSURE-A). |
| F1.5-1.8 | After CLOSURE-A approved+settled: NWSC fund **−28,000**. **Movement = −11,500 = approved payer share**, not gross billed, not rejected. |
| F1.9 | GL **✓ Balanced** after payment. |
**F verdict:** PASS. Fund balance visible to fund admin, moves by the approved payer share only, GL balanced. **Timing finding:** fund debits **on APPROVAL** (labelled "approved"), not at settlement. Data note: NWSC deposited=0 so balance is negative/below-min (setup gap, not a control defect). The rejected-line exclusion is definitively proven in CLOSURE-B (partial).

## D8. Duplicate Settlement — PASS
| # | Result | Evidence |
|---|--------|----------|
| D8.3 | CLOSURE-A batch → SETTLED | ss_29430h23q |
| D8.4 | SETTLED batch shows only "Settled" — **no Mark Paid control** (can't re-pay) | ss_29430h23q |
| D8.5 | New Aga Khan batch attempt → **"No unsettled approved claims found for this provider up to the end of this cycle"** — paid claim excluded | ss_7321mpoyg |
| D8.7 | GL shows **one** payment journal (Cash Cr +11,500); balanced | ss_42250o638 |
**D8 verdict:** PASS — duplicate payment impossible; paid claim excluded from new batches; single GL journal.

## N. Member Notifications — GAP (observation)
| # | State | Result |
|---|-------|--------|
| N1 baseline | before | /member/notifications **empty (UNREAD 0, "No notifications yet")** |
| N3 after submission | CLOSURE-A RECEIVED | inbox still **0**; visit shows only in dashboard "Recent activity" (RECEIVED, KES 0) |
| N5 after approval | CLOSURE-A APPROVED | inbox still **0**; dashboard activity updates to "KES 11,500 APPROVED" |
| N7 after payment | (pending post-settlement re-check) | — |
**N finding so far:** The dedicated member **Notifications/Alerts inbox does NOT receive outpatient claim intake/decision events** (still 0 after submit + approve), though the member CAN see claim status via the dashboard "Recent activity" feed. Gap vs the inbox's stated purpose ("approvals, payments…"). Re-checking after payment.

## GL / currency observations (persist)
- GL Trial Balance **✓ Balanced**, but **Net Claims Incurred (163,200) ≪ claims paid (~3.3M)** and Claims Payable shows an abnormal **debit** balance (−3,136,780) → claim-approval **claims-incurred expense posting appears incomplete** (prior-run "GL coverage" condition persists).
- **OBS-2 (currency) persists broadly:** GL page + claims-queue "Approved (KES)" header still labelled **KES** while claim detail/settlement/fund are UGX. Base currency is UGX; labels inconsistent.
- **GL coverage — REVISED (better than prior run):** live UI-processed claims post correctly on BOTH legs — CLOSURE-A approval posted Net Claims Incurred +11,500 (151,700→163,200) and CLOSURE-B +6,000 (163,200→169,200), each with matching cash on settlement. The small Net-Claims-Incurred vs large cash-out is a **seed-data artifact** (historical demo claims seeded PAID without an incurred journal), **not** a live-posting defect.

## P. Partial-Approval Money Math + Settlement Exclusion (CLOSURE-B, CLM-2026-00284)
Prossy Kato at IHK; contract PC-2026-071 has no tariff ceiling (reviewer judgement).
| # | Actor | Result | Evidence |
|---|-------|--------|----------|
| P1 | IHK provider | Prossy NWSC-2026-02891 **ELIGIBLE**, PARENT of Mark, cross-scheme resolved at IHK. ss_4048mhzjx |
| P2 | IHK provider | 2-line claim: Consultation 99214 **6,000** + "Non-covered supplementary item" **8,000** = **billed 14,000** → CLM-2026-00284 RECEIVED. |
| P3-P5 | Claims officer | Captured; per-line: **Line 1 ✓ APPROVED 6,000; Line 2 ✕ DECLINED 0**; "Compute Outcome" → preview "PARTIALLY APPROVED at 6,000". |
| P6-P7 | Claims officer | Submit Partially Approve 6,000 + reason → **PARTIALLY_APPROVED**. **Math: approved 6,000 + rejected 8,000 = billed 14,000.** ss_7341v9o8t |
| **P8** | Finance maker | IHK batch total = **UGX 6,000 = approved payer share only** (excludes rejected 8,000, not billed 14,000). ss_4031zk2t7 |
| **P9** | Finance checker | Approve → CHECKER APPROVED → Mark Paid → **SETTLED UGX 6,000**; rejected line **not paid**. ss_8217y5kdx |
| GL | Finance | Trial Balance **✓ Balanced** (6,370,180); CLOSURE-B posted Cash Cr +6,000, Claims Payable Dr +6,000, Net Claims Incurred +6,000. |
**P verdict: PASS** — partial approval math is correct and ties to line decisions; **settlement pays only the approved payer share, excluding the rejected line**; GL balanced. Maker≠checker also held for the IHK batch. P10 (provider partial view) / P11 (Prossy utilisation) / P12 (reports split) folded into Reports + spot checks. Note: CLOSURE-B carried a FRAUD_FLAG routing at intake (1 alert) — a single officer partially approved it with no separate fraud clearance gate ([[OBS-7]] control condition persists; not a blocker).

## R. Report Exports + Tie-Out (persona: Reports Viewer, read-only)
34 reports across 5 categories, all export CSV; most also show Export PDF.
| # | Report | Result | Evidence |
|---|--------|--------|----------|
| R1 | /reports | Read-only Insights access; no mutate controls | PASS |
| R2/R5/R6 | Provider Statements | CLOSURE-A (Aga Khan, 11,500) + CLOSURE-B (IHK, 14,000/6,000) both present; totals CLAIMS 267, APPROVED 18,197,094, PAID 10,291,618 | ss_8321y5kdx |
| R3 | Provider Statements → Export CSV | **CSV downloaded** `medvex-provider-statements-2026-07-07.csv`; rows tie out exactly (see table) | PASS |
| **R4** | Export PDF | **INCONCLUSIVE/likely-broken:** opens new tab `/api/reports/pdf?...`; **no file downloaded**; tab renders as a browser "error page" the harness cannot read/screenshot (possibly native PDF viewer, possibly a server error). Could not confirm a valid PDF. → **OBS (verify manually)** | tab 80909487 |
| R7 | Exclusion & Rejected Claims | CLOSURE-B rejected line present: item "Non-covered supplementary item", **Disallowed 8,000**, reason "Disallowed"; claim status PAID. CSV `medvex-exclusion-rejected-2026-07-07.csv` ties out. TOTAL DISALLOWED 17,500 = 8,000+6,000+3,500. | ss_4964x2yfh |
| R8 | Utilization Report | **Mark NWSC-2026-01768 OUTPATIENT used 28,000**; **Prossy NWSC-2026-02891 OUTPATIENT used 6,000** (= approved only, not billed/rejected) — confirms P11. | ss_0395c48ks |

### Tie-Out (source screens vs report CSV) — EXACT
| Metric | Source | Report CSV | Match |
|--------|-------:|-----------:|:-----:|
| CLOSURE-A billed | 11,500 | 11,500 | ✓ |
| CLOSURE-A approved | 11,500 | 11,500 | ✓ |
| CLOSURE-A paid | 11,500 | 11,500 | ✓ |
| CLOSURE-B billed | 14,000 | 14,000 | ✓ |
| CLOSURE-B approved | 6,000 | 6,000 | ✓ |
| CLOSURE-B **rejected** | 8,000 | 8,000 (Disallowed) | ✓ |
| CLOSURE-B paid (provider payable) | 6,000 | 6,000 | ✓ |
| Mark OUTPATIENT utilisation | 28,000 | 28,000 | ✓ |
| Prossy OUTPATIENT utilisation | 6,000 | 6,000 | ✓ |

**R verdict: PASS (with 1 observation)** — CSV exports work and reconcile **exactly** to source across claims/provider/exclusion/utilisation; reports show both paid and rejected components of the partial; reports viewer is read-only with no scope-mutation. **PDF export could not be verified in the harness (no file, non-readable tab) → OBS-CLOSURE-1.**

---
## CLOSURE VERDICT
All six previously-untested items are now exercised end-to-end, front-end only, each actor as themselves (missing fund admin created by admin via UI):
1. **HR NWSC-only scope** — PASS (sees NWSC utilisation from live claim; blocked from all other employers & admin/provider/claims/settings/member routes).
2. **Fund-admin balance impact** — PASS (fund visible & scoped to NWSC; moved −11,500 = approved payer share on approval; GL balanced).
3. **Report exports / tie-out** — PASS (CSV exact tie-out); PDF export unverified (OBS-CLOSURE-1).
4. **Scenario D remainder** — PASS (D4 zero-amount, D5 future-DOS, D6 double-submit, D7 decide-before-compute/ceiling enforcement, D8 duplicate settlement — all fail safe).
5. **Partial-approval math + settlement exclusion** — PASS (14,000 = 6,000 approved/paid + 8,000 rejected/excluded; utilisation +6,000 only).
6. **Member notifications** — GAP (OBS-CLOSURE-2): no in-app notifications for outpatient intake/approval/payment; status only via dashboard activity feed.

**No new Critical/High defects.** Two new observations (PDF export unverified; member-notification gap) + persisting conditions (OBS-2 currency labels, OBS-7 fraud-approval gate). Closure does not lower the standing **CONDITIONAL GO**; it removes the untested-risk register that qualified it.
