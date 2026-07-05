# MASTER RUN LOG — Medvex TPA Production-Readiness UAT

> Canonical chronological log for the engagement. Detailed phase logs live in
> `03_Progress_Logs/` (Current_Status.md, Testing_Checkpoint_Log.md CP-001..006,
> Pending_Workflows.md). First-pass artifacts are unchanged; this file carries
> the **W5 re-verification pass** onward.

---

## ⏯ RESUME POINTER (session closed 2026-07-04 ~17:45 — W5 pass substantially complete)

- **Pass:** W5 independent re-verification — **DONE for all 5 blockers + E3/C3/F3/E8/D1**. Verdict: **NO-GO confirmed** (see GO_NO_GO_READINESS.md final determination).
- **Defect state:** PR-001..020 re-tested (13 fixed-verified, see DEFECT_REGISTER.md); **17 NEW defects PR-021..PR-037** (1 Critical: PR-026; 8 High: PR-021/022/023/025/027/033/036/037).
- **Records created this pass:** PA-2026-00010/11 (UTILISED), PA-2026-00012 (phantom hold ACTIVE — PR-024 exhibit), PA-2026-00013 (UTIL-pending); CLM-2026-00761 (auto-APPROVED 1,000), 762 (APPROVED 86,000), 763 (CAPTURED dead-end), 764 (APPROVED 5,000), 765 (stuck — PR-025 exhibit), 766 (case-filed, RECEIVED); CASE-2026-00001 (CLOSED), LOU-2026-00001 (UTILISED); END-2026-00007 (APPLIED) → member MVX-2026-00254; provider "UAT W5 Retest Clinic" (`cmr6fpc4i0017wmvq5gxcppyz`, ACTIVE, branch Westlands Annex); QUO-2026-00004 (stuck ACCEPTED — PR-037 exhibit); City Eye Jul-2026 batch SETTLED (PV-2026-00001); Bamburi fund deposit +250,000 (W5-DEP-001); offline op SYNCED-but-lost (PR-036 exhibit).
- **NEXT AGENT — remaining untested (in priority order):**
  1. HR-initiated endorsement via /hr/roster (emily.wambui@safaricom.co.ke) + endorsement invoice impact
  2. Member portal walk (member@medvex.co.ug): benefits, documents (June DEFECT-017), wallet/M-Pesa stub safety, WebAuthn page, preauth self-service
  3. Reports sweep (~30 types render/filter/export; use system Chrome for PDF)
  4. Fraud lifecycle, overrides console + CONTRACT_BACKDATE, appeals/VOID/reimbursement (VOID also re-tests PR-018 CLAIM_VOID JE)
  5. HMS batch JSON upload on /cases; B2B API series (API key in .env); billing run + admin fees; cross-border/LOU standalone; complaints/service desk; USSD/SMS stubs
  6. Enterprise-volume proof: bulk CSV import at scale (10k lives), roster pagination/search, 2k providers — still an unproven scalability gap
  7. Cleanup: decline CLM-2026-00763 (note PR-024), release PA-2026-00012 phantom hold, decide/void 765 if PR-025 fixed
- **Environment on exit:** app :3000 via preview `aicare-dev` (RUNNING), worker RUNNING (old workaround process; PR-002 now fixed so plain `npm run worker` also works), DB aicare_uat, logins `MedvexAdmin2024!`, harness `uat/w5lib.mjs` (system Chrome, pointer-click + keyboard combobox helpers, download capture to 04_Evidence/Downloads).
- **Blockers for resumption:** none.
- **Env/credentials:** app :3000 (preview "aicare-dev"); worker running w/ env workaround; DB aicare_uat; all logins `MedvexAdmin2024!`; system Chrome for Puppeteer; do NOT run prisma migrate

---

## Chronological log — W5 pass (2026-07-04, afternoon)

### W5-000 — Environment resumption
- Persona: implementer. Services verified: postgresql@16 / redis / minio running; worker (PID 7459) running with env-export workaround (PR-002 residual); dev server restarted via preview `aicare-dev` → :3000 OK. Build `05e3fa7` (remediation `7e5dfc0` + deploy index fix).
- Reproducible: yes. Resume: begin W5-B1.

### W5-001 — PR-003 login page credential exposure — RE-TEST → **FIXED (VERIFIED)**
- Persona: anonymous → SUPER_ADMIN. URL: /login
- Actions & results:
  1. Anonymous /login render: **no credential/demo list**; shows "Authorized users only… monitored and logged" notice; email + password + optional 2FA authenticator-code field (new). ✅
  2. Served HTML source (28,487 bytes saved): only benign matches — `name@medvex.co.ug` input placeholder, "Forgot password?" link, CSS class. **No passwords, no seeded emails.** ✅ Evidence: `04_Evidence/login-page-2026-07-04-retest.html`
  3. Empty-field submit → native "Please fill in this field." ✅
  4. Invalid password → generic "Invalid email or password. Please try again." (no enumeration, branded, stays on /login) ✅
  5. Logout → /login; browser Back → remains on /login, no cached dashboard ✅
  6. Valid login admin@medvex.co.ug → /dashboard, 0 console errors ✅
- **Residual risk (env, not page):** seeded password `MedvexAdmin2024!` still live on aicare_uat (rotation script exists, run deferred until exposed deployment — per remediation notes). Carry as condition in readiness doc.
- Reproducible: yes.

### W5-002 — PA creation + 2-stage approval + benefit hold (PR-011) → **FIXED (VERIFIED)**
- Personas: SUPER_ADMIN (create), MEDICAL_OFFICER (approve). URLs: /preauth/new, /preauth/cmr6djj0i000096vqaae6yvx0
- PA-2026-00010: Ursula MVX-2026-00250 @ LifeCare, DAY_CASE/INPATIENT, est 85,000, K42.9, expected DOS 2026-07-06 → SUBMITTED with proper redirect + list feedback ✅
- Stage 1 "Send for Medical Review" → UNDER REVIEW; Stage 2 Approve (Full) 85,000, 30d validity → APPROVED, valid until 8/3/2026 ✅ (screenshots w5-03-*, w5-04-pa-approved)
- **Hold verified in UI (PA detail "Benefit Balance & Hold"):** Annual Limit 500,000 · Consumed 0 · Active Holds **85,000** · Available **415,000**; "Pending Authorization Hold: KES 85,000, Expires 03/08/2026, ACTIVE" + Release Hold action ✅ (w5-06-pa-hold-panel.png)
- Observation (minor, logged): member-360 Benefits tab does NOT display holds (Used —, Remaining unchanged) — hold only visible on PA detail. Ops visibility gap, Low.
- Reproducible: yes.

### W5-003 — Claim wizard + auto-adjudication observation (PR-013 verified; NEW PR-021/PR-022)
- Persona: MEDICAL_OFFICER. URL: /claims/new (4-step wizard)
- Step 1 member/provider search comboboxes work (keyboard + click); Step 2: **future DOS 2026-07-06 BLOCKED — "Date of service cannot be in the future." (PR-013 FIXED-VERIFIED**, w5-12-step2-future-blocked.png)
- Step 3 ICD lookup K42.9 w/ standard charge display ✅; Step 4 line-item builder (category buttons); wizard UX hiccup: refilling a line's description via CPT-search box replaced my Procedure line — operator error-prone but not a defect per se; submitted with single line 1,000
- **CLM-2026-00761 was AUTO-ADJUDICATED to APPROVED 1,000 instantly** (timeline: "Auto-adjudicated (policy cmr60buzs0005swvq8o7bhk9l)"), despite contract engine preview: UNDER REVIEW · SERVICE NOT MAPPED, line PENDED (UNLISTED refer, SVC-002), payable 0.00 → **NEW DEFECT PR-021 (High)**
- PA/hold side-effects of the decision (front-end proof of remediated mechanics): PA-2026-00010 → **UTILISED**; hold → **CONVERTED**; Benefit panel: Consumed 1,000, Active Holds 0, Available 499,000 — usage IS written, holds ARE converted (PR-011/PR-016 machinery works) **but full 85,000 hold consumed by a 1,000 claim → NEW DEFECT PR-022 (High)**
- Evidence: w5-13-*.png, w5-14-claim-761.png, w5-14-pa-after-761.png
- Reproducible: yes.

### W5-004 — PA-2026-00011 + CLM-2026-00762 (86,000, over-PA gate, matrix fail-open)
- PA-2026-00011 approved; hold panel cumulative arithmetic correct (Consumed 1,000 | Holds 85,000 | Available 414,000). CLM-2026-00762 (86,000) → RECEIVED (routed: ABOVE_CEILING vs auto UGX 100,000 ceiling — **FX display correct: "KES 86,000 (≈ UGX 2,494,000)"**). Duplicate detection referenced the OTHER claim (CLM-2026-00761) — **PR-012 FIXED-VERIFIED**.
- Decision panel (unlisted line): "No contract ceiling — reviewer judgement". Over-PA gate: submit w/o confirmation → refused (stays CAPTURED); with confirmation checkbox + note → APPROVED 86,000; note recorded in timeline — **PR-015 FIXED-VERIFIED**. Double-click during flight absorbed (button disabled).
- **No ApprovalRequest for 2.49M UGX DAY_CASE** (queue empty; matrix bands cover DAY_CASE only 50k–149,999) → **NEW DEFECT PR-023 (High, fail-open)**.
- Usage propagation verified: member header UTILISED 87,000 / REMAINING 628,000; PA-11 UTILISED; hold CONVERTED — **PR-016 FIXED-VERIFIED**; **PR-011 FIXED-VERIFIED**.

### W5-005 — CLM-2026-00763 (SURGICAL) — benefit-package check + phantom hold (PR-024)
- Wizard blocked SURGICAL claim without PA ("Surgical claims require an approved pre-authorization" — good branded gate). PA-2026-00012 (SURGICAL) approved + hold placed although Peter's package has no SURGICAL benefit. Claim accepted at intake, then decision refused: "Benefit 'SURGICAL' is not in the member's package…". Claim stuck CAPTURED; hold ACTIVE forever → **NEW DEFECT PR-024 (Med)**.
- Decision rejection is server-side (POST → 303, state unchanged) with a clear banner.

### W5-006 — CLM-2026-00764 (OUTPATIENT 5,000) — **ceiling NOT enforced → PR-026 (Critical; PR-014 re-opened)**
- Even OUTPATIENT/OUTPATIENT consult maps UNLISTED (engine: SERVICE NOT MAPPED, payable 0.00; contract has 0 tariff lines and whole-contract "Per-visit case rate KES 3,600" rule that the mapper never applies). Medical officer approved **5,000 vs contracted 3,600** with no warning. Auto-adjudication settings show gates = ceiling+fraud only (PR-021 evidence).

### W5-007..009 — CLM-2026-00765 (INPATIENT 10,000) — matrix FX/routing PROVEN, completion BROKEN
- Inpatient claims require PA (gate ✓). Decision at 10,000 KES routed to **"Level 1 of 2 — needs UNDERWRITER"** — 10,000 KES only reaches the ≥200,000-UGX band if FX-converted (×29 = 290,000) → **PR-017 FIXED-VERIFIED (FX + routing)**.
- Same-user L2 blocked: "You have already decided on this request" ✓ distinct-approver rule.
- L1 (underwriter) + L2 (admin) approved → queue emptied → **claim still CAPTURED; usage unchanged; re-submission (medical AND underwriter) opens a NEW 2-level chain** → **NEW DEFECT PR-025 (High — endless loop; dual-band claims unpayable)**.

### W5-010..011 — GL + settlement (PR-018) → FIXED-VERIFIED
- /billing/gl trial balance ✓ Balanced; account-2010 ledger: JE-2026-00008/09/10 credit 1,000/86,000/5,000 for CLM-761/762/764 (source CLAIM) — decision-time GL real.
- Settlement: one batch per provider+cycle enforced; **LifeCare Aug batch finds no claims → PR-027 (late-approved claims stranded)**. City Eye Jul batch (3 claims, 176,046): maker self-approve blocked ("Maker and checker must be different users") → checker approved → **Mark Paid → JE-2026-00011 SETTLEMENT_PAID → PV-2026-00001** (2010 −176,046 / 1010 −176,046); batch claims → PAID. No voucher register/provider statement surface anywhere (PR-029); finance dashboard quick-links hit Access Denied (PR-028, RBAC itself correct).

### W5-012..013 — provider lifecycle, contract header, HR, audit, worker, brand
- Provider create → redirect + "registered — PENDING until activated" (PR-005 ✓); Activate w/ reason → ACTIVE (PR-006 ✓); branch Westlands Annex created (PR-007 ✓); silent fail on missing inputs (PR-030). Audit log: full chain incl. PROVIDER CREATED + approval L1/L2 + settlement (PR-020 ✓). PC-2026-001 DRAFT header editable (PR-010 ✓). HR lands on scoped dashboard (PR-019 ✓). Brand scan clean (PR-004 ✓). `npm run worker` starts w/o env export (PR-002 ✓).

### W5-014 — E3 cases: PASS w/ PR-031 (UGX display) + PR-032 (empty-close exception)
- CASE-2026-00001: open → empty-close attempt throws raw server exception (guard exists, surfaced as crash) → 2 service entries (4,000) → LOU-2026-00001 issued → Close & file → CLOSED read-only, LOU UTILISED, filed CLM-2026-00766 (KES 4,000, RECEIVED, 24h SLA).

### W5-015 — C3 endorsements (admin): PASS w/ **PR-033 (no maker-checker, High)** + PR-034
- END-2026-00007 ADD_MEMBER (UAT Lifecare) → pro-rata +91,356.164 explained → same admin Approve & Apply → APPLIED → member Wanjiku UAT-Endorsement **MVX-2026-00254** ACTIVE; group count 4→5. HR-initiated path + invoice impact not yet tested.

### W5-016 — F3 fund: PASS w/ PR-035
- Bamburi: Record Deposit +250,000 (W5-DEP-001) → statement totals reconcile (12,250,000) → **Export CSV downloaded** w/ deposit row (June DEFECT-016 fix confirmed). Category Hold Manager + admin-fee generator present (untested).

### W5-017 — E8 offline: PARTIAL w/ **PR-036 (High)**
- OWA-UG7YED unlock → pack 121 members/115 tariffs → capture → duplicate absorbed (idempotency) → SYNCED, ops-counter 1 — but op never appears as claim/queue-item/exception (3+ min, worker running). "Never lost" promise broken.

### W5-018 — D1 quote→bind: **FAIL — PR-037 (High)**
- Broker QUO-2026-00004 (100 lives, 950,000) DRAFT→SENT ✓; UW Record Acceptance ✓ → 4-step bind wizard; **Step 2 "Create Memberships" → server exception** (binding.service.ts:149 `group.create` missing `tenant` relation; digest 3011118319). No partial state. Steps 3–4 unreachable. Broker scope confirmed own-book only (Safaricom, own commissions).
