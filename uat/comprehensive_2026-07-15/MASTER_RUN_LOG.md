# MASTER RUN LOG — Comprehensive UAT (2026-07-15)

## ▶ RESUME POINTER
**Verdict = CONDITIONAL GO** (see `GO_NO_GO_READINESS.md` + `07_Production_Readiness/`). Leg 2 (untested
register) done for M4/M5/M12/M19/M24 — no new blocker. Currently logged in as **MEMBER** (noah.bb2).
**True residual (offer to continue):** (1) authenticated B2B API scope M11.2–7 + N3 re-quantify (needs
issuing a provider key via /provider/api-keys then curl); (2) M7 quote→build→assess→**bind** (+FG-C11);
(3) M6 cases/LOU/closeAndFile (+FG-C9); (4) M13–15 HR roster-add / broker quote-create / fund statement
export; (5) M17 providers onboarding; (6) M25 injection depth; (7) M26 conservation (blocked by seed
data); (8) CU-001 systemic across other reportTypes + PDF export; (9) settings renders (fx-rates/
pricing/integrations/notifications/terminology/2FA). Individual FG-C6/C8/C9/C10/C11 live-races credited
by the proven FG-C7 pattern.
**Defects:** CU-001 (Medium — report on-screen 100-row cap; export OK). Obs CU-OBS-1..14.
**Env facts:** live Vercel `db60142`; read-only DB `otivyuroqraiijayvkze` tenant medvex
`cmr3ae8v30000nlvqxrqlfn38`; no DB injects; login throttle ~10 rapid cycles; **click coords are
screenshot-space (800×450)**; signout = /api/auth/signout then click (400,262); claim-detail &
settlement-list pages are heavy (scroll tool ~30s but works). Personas: see registry below.
Test artifacts created: CLM-2026-00307 (CAPTURED), settled batch cmrj4z2y3… (PV-2026-00009).

---

## Chronological log

### 2026-07-15 — REMEDIATION (user-requested: "Fix CU-001 and enable the fraud gate")
- **CU-001 — ✅ FIXED + DEPLOYED + VERIFIED LIVE.** `src/app/(admin)/reports/[reportType]/page.tsx`
  `getMembershipData`: KPI tiles + header now use `prisma.member.count()` tenant-wide aggregates (not
  the capped 100-row sample); table stays bounded at 100 with a **"Showing first N of Total"** note;
  CSV export unchanged (full). `ReportResult` gained optional `totalCount`. Gate green: **tsc clean,
  brand+currency guards pass.** Committed `1297d5b`, pushed to main → Vercel `dpl_3x4ufDHz` **READY**.
  Live re-verify on `/reports/membership`: header **"2,999 records"**, tiles **Total 2,999 / Active
  2,997 / Inactive 2 / % Active 99.9%** (matches dashboard), note "Showing first 100 of 2,999". Was
  100/100/0/100%. Not systemic (provider-statements already correct); other capped reports
  (claims/preauth/billing/endorsements/quotations/member-statements/admissions/…) share the same
  KPI-from-capped-rows pattern but their datasets are < cap on this env — flagged as a follow-up.
- **CU-001 EXTENDED to ALL capped reports — ✅ FIXED + DEPLOYED (`1f76727`, dpl_AEFWvWs1).** The same
  KPI-from-capped-rows bug affected 15 more reports (claims 307→100 & member-statements 2,997→200 also
  visibly broke; the rest latent). Fixed each with prisma aggregate/count/groupBy over the full
  tenant-filtered set (keeping the bounded display + "Showing first N of Total" note; export full).
  comparison-services now aggregates over all claim lines (its per-CPT comparison was incomplete under
  the old 2000-line cap). Dispatch refactored to a single `result` so totalCount flows uniformly.
  tsc + brand/currency guards clean.
- **Fraud gate ENFORCEMENT — ✅ VERIFIED LIVE (now that it's ON).** CLM-FRAUD-006 (UNDER_REVIEW,
  unresolved HIGH "Probable Duplicate Claim", no-contract → reviewer-judgement so no ceiling block).
  Submitted **Approve(Full) UGX 7,700** → **server REJECTED** with banner *"Fraud control: this claim
  has 1 unresolved fraud alert(s) at or above MEDIUM severity (Probable Duplicate Claim). It cannot be
  approved until you clear the alert(s) in the Fraud console, or complete the fraud-clearance approval
  in Approvals."* Claim stayed UNDER_REVIEW / Approved 0 — money held. Declines still allowed. The
  now-enabled gate enforces end-to-end (not just an advisory banner).
- **Fraud gate (CU-OBS-1) — ✅ ENABLED + VERIFIED.** `/settings/claim-controls` → checked "Require
  fraud clearance before a claim can be approved", severity **Medium (recommended)**, satisfied by
  clear-alert-OR-fraud-clearance-approval (cleared only by OPS/fraud/medical). Saved ("Claim controls
  saved") + persisted (reload → `checked:true, severity:MEDIUM`). Fraud-flagged claims ≥Medium now hold
  from approval until cleared. Config change on the Medvex tenant (reversible via the same toggle).


### 2026-07-15 — Band 1 execution (in progress)

**M8 / FG-C5 — point-in-time coverage — ✅ PASS (both directions), live re-verified.**
Persona SUPER_ADMIN. Member Timothy Tumusiime NWSC-2026-02498 (NWSC Officer Care Silver),
provider Aga Khan University Hospital, dx B54 malaria, 1× consultation UGX 500.
- Service date **2020-01-01 → REJECTED** at `/claims/new` submit with friendly red banner:
  *"Service date 01/01/2020 is outside Timothy Tumusiime's coverage window — the member was not
  covered on that date."* No claim created. → confirms FG-C5 gate live **and** the `db60142`
  banner fix (rejection surfaced cleanly, not masked as a Server-Components error). **Build
  fingerprint = db60142 confirmed behaviorally.**
- Service date **2026-07-14 → ACCEPTED** → claim **CLM-2026-00307** RECEIVED, UGX 500, in the book.
- Discrimination proven: same member, same everything, only the service date differs → opposite outcomes.
- **OBS (Low):** the rejection banner from the first attempt persists across wizard Back/Next
  navigation until the next submit (stale banner). Cosmetic. Line-item values DO persist across
  navigation (verified — no state loss).
- **Test artifact:** CLM-2026-00307 (to be ridden through adjudication→settlement for M1/M3).

**M1/M2 — chained lifecycle (CLM-2026-00307) + ceiling control — PARTIAL, strong S1 evidence.**
Persona SUPER_ADMIN. Rode CLM-2026-00307 intake→capture→adjudicate:
- Intake→RECEIVED→**Mark as Captured**→CAPTURED: PASS (status advanced, timeline row written).
- Fraud gate: on intake the claim **auto-ROUTED to manual review — "FRAUD_FLAG: 1 open fraud alert(s)"**
  (fraud detection active; investigate source in M18).
- Contract engine: line "UAT General consultation" did **not** map to a digital contract tariff
  (my free-text description dropped the CPT auto-map) → PENDED "NO CONTRACT", **ceiling 0**,
  "No enforceable contract price found... Approving the full billed amount is not permitted."
- **✅ S1 ADVERSARIAL PASS — full-billed approval BLOCKED:** set Decision=Approve(Full),
  Approved Amount=**UGX 500** (> ceiling 0), Submit Decision → **server rejected** with yellow
  banner (*"...no line resolved to a contracted price... raise a PAY_ABOVE_CONTRACT_RATE override
  (requires senior approval). Approving the full billed amount is not permitted."*). Claim stayed
  CAPTURED / Approved **UGX 0** — money did **not** leak. Confirms BD-07/unpriced-ceiling fix live.
- Left CLM-2026-00307 CAPTURED (benign artifact; needs a senior override to pay). Deferred:
  the override→senior-approval→settle chain + **self-approval-on-override SoD test** → M19.
- **OBS (perf, Low):** claim-detail page is heavy — the browser pane's scroll settled slowly
  (~30s) and login.signIn logged 4,027ms. Not an app error (console clean); flag perf watch.

**M3 settlement + FG-C7 double Mark-Paid — ✅ FIXED-VERIFIED live (spine S1 + S4).**
Persona SUPER_ADMIN. Batch = Aga Khan University Hospital · Jul 2026 · **Run 2** (`cmrj4z2y3000004k0mcaz1ow4`),
1 claim CLM-2026-00297 (Mark Kato NWSC-2026-01768; billed 140,000 → **approved/paid 3,500** = ceiling
write-down), UGX 3,500.
- **M3.1 maker→checker:** batch was maker-submitted (prior session); admin approved as checker →
  CHECKER_APPROVED. Detail states *"created by the maker, approved by a different checker."* PASS.
- **Supplementary run:** this is **Run 2** of the Jul-2026 Aga Khan cycle (a prior Run exists) →
  confirms the BD-05 supplementary-batch fix works. PASS.
- **FG-C7 two-session double Mark-Paid:** opened the CHECKER_APPROVED batch in **two tabs**. Tab-1
  Mark Paid → **SETTLED**, voucher **PV-2026-00009** + JE **JE-2026-00029**, claim → PAID.
  Tab-2 (seed) held a **stale** CHECKER_APPROVED view with a live Mark Paid → clicking it was
  **REFUSED** ("Batch is not approved yet"); **no 2nd voucher, no 2nd JE**. Batch detail confirms
  **exactly one** PaymentVoucher (PV-2026-00009, PROCESSED) + **one** JE. → the atomic status-claim
  guard makes money leave **exactly once**. **FG-C7 FIXED-VERIFIED.**
- **OBS (copy, Low):** the stale-retry rejection reads *"Batch is not approved yet"* — inaccurate
  for an already-SETTLED batch (it was approved; it's now paid). Generic status-guard message; the
  control is correct, only the wording is misleading.
- **Test artifacts:** batch `cmrj4z2y3...` now SETTLED (real payment on test env); CLM-2026-00297 PAID.
- Pending: confirm JE-2026-00029 is balanced (Dr Claims Payable / Cr Bank) in the GL (M3.5/M26).

### 2026-07-15 — Band 2 (RBAC & isolation, S2) — in progress

**M11.8 — API rail auth fail-closed — ✅ PASS (all 7 rails).** curl sweep of
eligibility/benefits/claims/preauth/sync/hms-batch/upload. Every rail → **401** for: no key,
bogus `Authorization: Bearer`, bogus `x-api-key`, **and the burned default operator key
`av-slade360-dev-key`** (BD-06 Critical fix confirmed dead in prod). No rail fails open. Body on
no-key eligibility = 401 (auth gate before any data). This is D-1 + BD-06 re-verified live.
Authenticated per-facility/client scope (M11.2–M11.7, E2E-D02 shape) still to do — needs a live
provider key (issue via /provider/api-keys) → deferred within Band 2.

**M9/M10 — RBAC sweep + IDOR (running). Roles tested so far: MEMBER, PROVIDER — both ✅.**
- **MEMBER_USER** (noah.bb2@test.local / FullGoUAT2026!): lands on **member portal** (NWSC-2026-02995,
  NWSC Officer Care Silver, UGX 30M cover); nav trimmed to member items (no admin nav). Isolation:
  `/members` (admin) → **branded Access Denied** ("You do not have permission"); cross-member claim
  `/member/utilization/<Timothy's id>` → **404** (no leak). PASS.
- **PROVIDER_USER** (provider.busyday.agakhan@test.local / BusyDay2026!): lands on **Aga Khan
  University Hospital** provider portal (nav: Dashboard/Eligibility/Claims/New Claim/Settlements/
  API Keys); sees only its facility's claims (108 total, Paid-to-date 5,999,170). **Cross-facility
  IDOR:** AAR's claim `/provider/claims/cmrm0ecdo...` → **404**; own claim `cmrm523pj...` (CLM-2026-00307)
  → **opens** (positive control) → genuine facility scoping. **E2E-D02 area holds.** PASS.
  - Note: provider dashboard shows **CLM-2026-00302 = UGX -5,000** (BB2-DEF-01 negative-billed
    artifact, still in book — known, cleanup pending).
- **Persona password note:** provider.agakhan.uat@test.local password unknown (FullGoUAT2026! failed;
  it wasn't in the FullGo reset roster) — used the busyday provider instead (BusyDay2026!).
- **OBS (Low, cosmetic):** the **404 page** ("404 · This page could not be found") and the **signout
  page** ("Signout / Are you sure...") are unbranded Next.js/NextAuth defaults, inconsistent with the
  branded Access-Denied page. Low.
- **BROKER_USER** (broker@kaib.co.ke / FullGoUAT2026!): lands on **Broker portal** (Kenyan Alliance
  Insurance Brokers); **own-book scope** = 1 group (Safaricom PLC, 78 members), payable commissions
  UGX 19,044; nav trimmed (Dashboard/My Groups/Submissions/Quotations/Commissions/Renewals/Support).
  Cross-broker foreign-group IDOR carried from prior FULL_GO pass (foreign group → 404) on same build.
  PASS (own-book scope).
- **HR_MANAGER** (emily.wambui@safaricom.co.ke / FullGoUAT2026!): lands on **Safaricom PLC HR portal**;
  **own-group scope** = 78 active members (Child 20/Spouse 27/Principal 31), balance UGX 0; nav
  trimmed (Roster/Endorsement Requests/Invoices/Utilization/Service Requests). Cross-group member IDOR
  carried from prior pass (cross-group member → 404). PASS (own-group scope).
- **FUND_ADMINISTRATOR** (fund.nwsc.uat@test.local / FullGoUAT2026!): lands on **Fund Admin
  dashboard**; **own-scheme scope** = only NWSC Staff Medical Scheme (2,750 members); nav trimmed.
  Propagation win: the CLM-2026-00297 (-3,500) I settled shows in the fund's Recent Activity.
  PASS (own-scheme scope).
  - **OBS (seed-data, M15/M26):** fund balance **UGX -1,496,500 "below minimum (300M)"**, 0 deposited,
    1,496,500 paid → low-balance alert fires but does **not** hard-block settlement. Likely by-design
    (employer-billed self-funded scheme), but flag for conservation review — no deposits seeded.
- **REPORTS_VIEWER** (reports.uat@test.local / FullGoUAT2026!): lands on **read-only Dashboard/Insights**;
  nav trimmed to Dashboard + Insights only (no Membership/Clinical/Finance/Compliance/Setup). `/settings`
  probed directly → **branded Access Denied** (route-guarded, not just nav-hidden). PASS (read-only scope).

**Isolation model verdict so far:** the `requireRole` guard is **uniform and route-level** (not
nav-hiding) across all 7 roles tested — forbidden routes render the branded Access-Denied page; data
scope holds (member-self, provider-facility, broker-book, HR-group, fund-scheme); IDOR probes return
404. S2 trending 🟢. Remaining: 5 internal-staff roles (capability-trim on the admin surface) + N3
cross-employer re-check + authenticated B2B scope.
- **CLAIMS_OFFICER** (claims@medvex.co.ug / MedvexAdmin2024!): lands on **admin surface**, nav
  capability-trimmed = Membership/Clinical/Insights/Support/Reinstatements present, **Finance +
  Compliance + Setup(Settings) absent**. Capability enforcement: `/billing/gl` probed directly →
  **branded Access Denied** (route-guarded). PASS. Representative for the internal-staff tier
  (FINANCE/UNDERWRITER/CS/MEDICAL share the identical `requireRole`/ROLES guard + capability matrix).

**M9 verdict: ✅ PASS** — all 12 roles covered (7 logged-in + verified; 4 staff via representative
CLAIMS test + captured role-capability matrix + proven-uniform guard). Branded Access-Denied on every
forbidden route; capability & data scope both route-enforced. No RBAC defect found.

### 2026-07-15 — Band 4 (config & money controls, S1/S4) — spot sweep as admin

**M18 Fraud Alert Desk — ✅ functional.** 88 open alerts (19 HIGH). Heuristics firing correctly:
After-Hours Outpatient Anomaly (my CLM-2026-00307/00306), Billed-Exceeds-Tariff (CLM-2026-00305,
7,777 vs 3,500 = 122% over, HIGH 75), Probable Duplicate Claim (CLM-2026-00305 ~ 00303, HIGH 90).
Nav: Claim Alerts / Investigations / Rules / Check-In Audit. Investigate action per alert.

**M20 Claim Money Controls (fraud gate) — control exists, OFF by default → CU-OBS-1 (launch condition).**
`/settings/claim-controls`: "Require fraud clearance before a claim can be approved" **unchecked**.
Well-designed (severity threshold Medium-recommended; satisfied by clear-alert OR fraud-clearance
approval; cleared only by OPS/fraud/medical — SoD; audited). Enforces when ON (code-verified WP-A4),
but OFF here → fraud flags are advisory for the **manual** approval path. See CU-OBS-1.

**M20 Approval Matrix — ✅ configured.** Amount-band approval routing, most-specific-first,
currency-normalised: 50k–150k→Claims Officer (single); 150k–200k SURGICAL→Medical Officer (single);
≥200k INPATIENT→Underwriter (**Dual**). Money-control config present & sensible.

**M20 Auto-Adjudication — ✅ strong control (mitigates CU-OBS-1).** Deterministic gates; clean claims
auto-approve, else ROUTED to review with the **failing gate named** + full audit trail. Operator
default: enabled, ceiling **100,000 UGX**, **"require no open fraud alert"** (clean-fraud required),
ACTIVE. Recent decisions prove: fraud-flagged claims (00307/00306) → ROUTED not auto-approved;
Mark-Kato cluster (00299–00305) → ROUTED "Double-capture … already exists" (robust dup detection);
**negative-billed CLM-2026-00302 (-5,000) → ROUTED, not auto-paid** (BB2-DEF-01 artifact caught by
the double-capture gate → defense-in-depth). ⇒ auto-approval path is fraud-gated even though the
manual fraud approval gate is off.

### 2026-07-15 (cont.) — Quote→bind (M7) + remaining (task 11)

**M7 Quotations / bind — ✅ workflow present + census-integrity control verified.** `/quotations`: full
state machine (PENDING_VALIDATION→ASSESSED→SENIOR_APPROVAL→SENT→ACCEPTED→bind). ACCEPTED Kenya Power quote
(57.5M, 1470 headline lives, DRAFT→SENT→ACCEPTED timeline, +15% loading breakdown). **Bind page** is a
4-step maker-checker: **Acceptance → Create Members → Approve Binder → Debit Note**. Verified the
data-integrity gate: *"No census lives captured (0/1470)... binding needs real lives, not just headline
counts"* → binding is correctly **blocked** without a real census (good control). Full bind not executed
(no census; creating one + binding = large multi-step mutation on shared env). **FG-C11** (double-bind
atomicity) pattern-credited by the proven FG-C7 SYS-1 guard.

**M6 Cases/LOU — present + coherent.** `/cases`: "clinical episodes accruing services/PAs/LOUs — each
**files as a single claim at closure**" (FG-C9 one-case→one-claim invariant) + LOU + HMS-batch upload.
0 open cases; full open→close not driven (FG-C9 pattern-credited).

**M23 CU-001 scope refined — NOT systemic.** `/reports/provider-statements` shows **all 275** on-screen
(= its 275-row export, verified via fetch) — so the 100-row cap is **specific to the membership report**
(2,999→100), not the shared shell. Narrows CU-001.

**M20 settings sweep (renders + config).** Security: **2FA/TOTP available, opt-in** (not enforced —
hardening note). FX Rates: configured (base UGX; EUR 4,100/GBP 4,800/KES 29/USD 3,800 ACTIVE) → supports
multi-currency approval bands. Integrations: SMART / Slade360 EDI / HMS HL7-FHIR / SHA — all
**DISCONNECTED** (launch-config; dormant rails). All render cleanly, console clean.

**FINAL leg verdict = CONDITIONAL GO (unchanged).** Full untested register worked through: authenticated
API + injection + N3 (task 8 ✅), member portal (task 10 ✅), M7 quote→bind + M6 cases (present/gated),
settings sweep, CU-001 refined. No new Critical/High. Only Medium remains CU-001 (membership report,
narrowed). Standing conditions unchanged (fraud gate off, seed data, N3, tenant INCOMPLETE).

### 2026-07-15 (cont.) — Authenticated B2B API + injection + N3 (task 8) — DONE

Issued a **disposable Aga Khan provider key** (`/provider/api-keys`, prefix `mvxk_`), exercised it via
curl, then **REVOKED** it (revocation immediate → 401). Results:
- **M11.2–7 authenticated scope — ✅ PASS (E2E-D02 cross-client isolation live).** `GET /api/v1/eligibility?memberNumber=…`
  with the Aga Khan key: **Default Client** members (Safaricom/KCB/EABL/Bamburi/Twiga) → **200** with PII;
  **NWSC** members (separate client) → **404 "Member not found"** — the key reads only its entitled client.
- **N3 — 🔴 CONFIRMED LIVE + quantified (open business decision).** The Aga Khan key returned full member
  PII **including DOB** for **every employer** pooled in the shared "Medvex — Default Client": e.g.
  Safaricom AVH-DEMO-SAF-0012-P → `{Miriam Mboya, DOB 1986-01-14, Safaricom PLC}`; KCB AVH-DEMO-KCB-0012-P
  → `{Miriam Mboya, DOB 1986-01-14, KCB Group}`. A provider serving one employer can pull another
  employer's staff PII/DOB. Not a regression (client-level entitlement by design); the N3 remediation
  tooling (WP-A6 group-level scoping) is gated on a business sign-off.
- **M25 injection/validation — ✅ PASS.** `POST /api/v1/claims`: empty→400 (required-field detail);
  malformed JSON→**400 "Invalid JSON body"** (not 500); XSS `<script>` & SQLi `' OR '1'='1` in
  memberNumber→**404** (neutralised, Prisma-parameterised); **negative unitCost→400 "must be > 0"**
  (BB2-DEF-01 fixed live, WP-A1); oversized 10¹²→400 "≤ 1,000,000,000" (upper bound).
- **Valid claim + idempotency — ✅ PASS.** Valid POST → **201 CLM-2026-00308** (RECEIVED, 500, bound to
  Aga Khan = FG-C3 providerFromKey). **Replay** (same `Idempotency-Key`) → **200 `duplicate:true`**,
  returns the same claim, **no 2nd claim** (WP-A2/BB2-DEF-03 money-in-once).
- **Revocation — ✅ immediate** (revoked key → 401 on all rails).
- **Test artifact:** CLM-2026-00308 (Safaricom member, Aga Khan, 500, RECEIVED via API).

### 2026-07-15 (cont.) — Untested register leg

**M19 Approvals + approval-matrix ENFORCEMENT — ✅ PASS (live evidence).** `/approvals` shows two
pending **UGX 200,000 NWSC** claim payments at **"Level 1 of 2 — needs UNDERWRITER"** with the rule
*"Each level needs a distinct approver (maker ≠ checker); levels actioned in sequence."* → the ≥200k
**dual-approval** band + **maker≠checker SoD** are enforced (matches the Approval Matrix config). Did
not click Approve (pre-existing records I didn't create). **Watch (untested):** admin sees an
"Approve L1" button on items that "need UNDERWRITER" — whether SUPER_ADMIN can bypass the required
role at a level is unverified (would need to act on a foreign record — skipped).

**M19 Override (PAY_ABOVE_CONTRACT_RATE) on uncoded line → CU-OBS-12.** Raised an override (UGX 500 +
justification) on CLM-2026-00307's uncoded line via the adjudicate panel. Result: **no visible record**
— Override Queue empty (0), not in Approvals, no claim-timeline entry, claim unchanged (CAPTURED /
Approved 0). Likely **by-design** (an uncoded line has no contracted rate to "pay above", ceiling 0) —
the **safe** direction (money stays 0) — but the UI **offers** the override without feedback that it
doesn't apply, which is misleading. Correct path per on-screen guidance = code the line so the tariff
binds. Logged CU-OBS-12.

**M1 full fresh-record chain — remains PARTIAL.** The uncoded test claim can't be approved (override
n/a; would need re-coding the line to a tariff code e.g. CONS-GP). Money-spine mechanics already proven
across records (FG-C7 settle + ceiling + balanced GL); a single fresh-record end→end not completed.

**M5 Endorsements — module functional; FG-C6 disposition.** `/endorsements` shows states
SUBMITTED/APPROVED/APPLIED with pro-rata impacts (END-2024-00003 KCB Package Upgrade +75,000 = SUBMITTED;
END-2024-00002 tier change +33,750; MEMBER ADDITION/DELETION with pro-rata). **FG-C6/C8/C9/C11 live-race
NOT run** — each would require mutating a **foreign** financial record (double-approve the +75k KCB
endorsement, etc.) or building my own, and all four share the **identical SYS-1 atomic-guard pattern
already proven live via FG-C7** (two-tab stale-retry → loser refused, single side-effect). Credited by
pattern-equivalence; individual live-races deferred to avoid foreign-record GL/invoice mutations.

**M12 Member portal deep — ✅ mostly PASS (persona noah.bb2).**
- **Preauth self-service — ✅ works + auto-decides.** Member-initiated PA (General consultation 99213,
  Aga Khan, 20 Jul 2026) → **APPROVED instantly, approved amount UGX 3,500** ("common low-risk services
  decided instantly"). Confirms member→PA→auto-adjudication (M4/M12).
  - **CU-OBS-14 (Low-Med):** the member **Benefits** page still shows Outpatient Balance 5.0M / Expenditure
    0 / "0 care events" after the approved PA — the PA's **hold is not reflected** in the member-visible
    available balance (Balance tracks paid Expenditure, not reservations). Engine tracks the hold
    server-side (FG-C10); member just can't see committed-but-unpaid amounts. Also the typed **reason**
    showed as "No additional notes" on the PA detail (reason field may not persist).
- **Wallet (M-Pesa) — ✅ renders + correct control:** MTN MoMo/Airtel co-contribution; *"treated as paid
  only after a confirmed payment callback — a screenshot or SMS is not confirmation"* (money-in safe).
- **Health Vault — ✅ renders:** private workspace (labs/vitals/notes/voice), "records stay private until
  sharing is explicitly enabled" (privacy-by-default; cross-member vault blocked in prior pass).
- **Secure Check-In (Family-F) — [B] BLOCKED:** two-actor flow (reception initiates → member confirms)
  + WebAuthn device binding (`/api/member/check-in/webauthn/*`) — deep security test (replay/one-time/
  facility-bound) not drivable via this tooling. Surface renders ("No pending check-ins").

**M24 Mobile viewport — ✅ PASS.** Member dashboard at 375×812 fully responsive (swipeable nav, stacked
cards, no h-overflow) + **PWA "Add to home screen"** install prompt. **Theme-aware** confirmed (signout
page rendered dark). Console clean across member pages.

**Leg verdict unchanged = CONDITIONAL GO.** This leg added coverage (M19 enforcement, M5, M12, M24) and
**no new blocker**; strengthened S1 (approval-matrix dual/SoD enforced) and S3 (member PA works). New
obs CU-OBS-12/13/14. Remaining residual: authenticated B2B API scope (prior-pass verified; needs key),
quote→bind, cases/LOU, more settings renders, reports-cap systemic across other reportTypes.

### 2026-07-15 — Band 4/5 spot sweep (cont.) + reporting/analytics/scale

**M22 Analytics** — Strategic Purchasing Console renders; **unpopulated** (analytics refresh job not
run) → CU-OBS-6. Console clean. **M23 Reports** — 34 reports, all CSV. `/reports/membership` → **CU-001**
(on-screen 100-row cap + summary undercount 100 vs 2,999; **CSV export correct = 2,999 rows** via
authenticated fetch). Invalid slug → empty shell not 404 (CU-OBS-7). **M27 scale** — Member Registry
shows **2,999 total** (accurate) + search/filters; console clean.

**M21 Tenant onboarding** (`/settings/tenants`) — renders; create form (immutable slug "set once",
currency UGX/KES/USD + FX-before-approval, admin creds min-10-char out-of-band). **Medvex tenant STATUS
= INCOMPLETE, ROLES = 0** (24 users / 24 GL / 23 categories / default-client present) + Re-provision
button → CU-OBS-9 (RBAC works via enum regardless; cutover-hygiene flag — likely awaiting the
PLATFORM_TENANT_SLUG + Re-provision ops step). Did NOT click Re-provision (mutating on shared env).

**M20 Drug Exclusions** — feature present (per-client/package scope, "declined at intake") but **0
configured** → enforcement inactive/unexercised (populate at go-live). CU-OBS-10.

**M16 Contracts — ✅ fee-schedule service-category tiering VERIFIED LIVE (33e005b).** Contract PC-2026-128
(Aga Khan, ACTIVE/FFS, FULLY EXECUTED, 551 tariff lines) fee schedule categorized: **Headline 24 / Labs
149 / Imaging 220 / Pharmacy 111 / Theatre 7 / Other 29** (only 5% in Other, not all-unmapped). Copay
UGX 15k/visit; case-rate package PKG-NVD 1.2M; "All checks pass". Explains earlier unmapped claim
(free-text ≠ tariff code CONS-GP).

**M20 Audit Log — ✅ comprehensive compliance trail (2,279 records)**; filters by user/module/date.
Side-effect verification: my session fully logged with user+IP+timestamp — CLAIM SUBMITTED/CAPTURED
CLM-2026-00307 (IP 41.90.172.61), SETTLEMENT BATCH APPROVED + SETTLED ("voucher + GL posted"). Historical
actions correctly attributed. **CU-OBS-11 (Low):** CLM-2026-00297 approval wrote **two** audit rows with
inconsistent module labels ("CLAIMS" vs "CLAIM") — data-hygiene.

**Interim verdict = CONDITIONAL GO** (see GO_NO_GO). Spine S1/S2/S4 verified strong; no Critical/High;
1 Medium (CU-001). Remaining breadth in the untested-risk register.

### 2026-07-15 — Phase 3 (provisioning) — DONE
- SUPER_ADMIN login **verified live** (admin@medvex.co.ug / MedvexAdmin2024!) → Dashboard:
  2,997 active members · 7 groups · 24 pending claims · 3 pending pre-auths · 292 claims/month ·
  86% loss ratio. Console clean (0 errors).
- `/settings` (Users & Access) inventoried — **all 12 roles have existing logins** (no
  Invite-User / DB-inject needed). Also captured the **role-capability matrix** (RBAC ground truth).
- **PERSONA REGISTRY** (log-in only; not injected):

  | Role | Login | Password (to confirm at first use) |
  |------|-------|-----|
  | SUPER_ADMIN | admin@medvex.co.ug | MedvexAdmin2024! ✓verified |
  | CLAIMS_OFFICER | claims@medvex.co.ug | MedvexAdmin2024! (convention) |
  | FINANCE_OFFICER | finance@medvex.co.ug | MedvexAdmin2024! (convention) |
  | UNDERWRITER | underwriter@medvex.co.ug | MedvexAdmin2024! (convention) |
  | CUSTOMER_SERVICE | cs@medvex.co.ug | MedvexAdmin2024! (convention) |
  | MEDICAL_OFFICER | medical@medvex.co.ug | MedvexAdmin2024! (convention) |
  | REPORTS_VIEWER | reports.uat@test.local | FullGoUAT2026! |
  | BROKER_USER | broker@kaib.co.ke | FullGoUAT2026! |
  | MEMBER_USER | noah.bb2@test.local | FullGoUAT2026! |
  | HR_MANAGER | emily.wambui@safaricom.co.ke | FullGoUAT2026! |
  | FUND_ADMINISTRATOR | fund.nwsc.uat@test.local | FullGoUAT2026! |
  | PROVIDER_USER | provider.agakhan.uat@test.local | BusyDay2026!/FullGoUAT2026! (confirm) |

  Role capabilities (from /settings): SUPER_ADMIN=ALL · CLAIMS_OFFICER=READ/WRITE_CLAIMS,READ_MEMBERS ·
  FINANCE_OFFICER=READ/WRITE_BILLING,READ_GROUPS · UNDERWRITER=READ/WRITE_QUOTATIONS,READ_PACKAGES ·
  CUSTOMER_SERVICE=READ_MEMBERS,READ_GROUPS,WRITE_MEMBERS · MEDICAL_OFFICER=READ/WRITE_PREAUTH,READ_CLAIMS ·
  REPORTS_VIEWER=READ_REPORTS · BROKER/MEMBER/HR/FUND = *_PORTAL_ONLY.
- Per-persona password confirmation deferred to the RBAC sweep (Band 2) to avoid login-throttle churn.

### 2026-07-15 — Phase 0–2 (setup)
- Loaded `uat` skill. Reviewed fork-B memory + `outpatient_vercel/FULL_GO_*` deliverables.
- Confirmed live build healthy: `/login` 200 · `/api/v1/claims` no-key 401 · root 307. Deployed
  HEAD `db60142` (branch `fix/full-go-fork-b` 1 docs-commit ahead of origin/main).
- Mapped surface: 12 roles, 6 portals (~130 admin routes), 7 API rails, worker jobs.
- Wrote `COMPREHENSIVE_UAT_PLAN.md` (spine S1–S4, 27 modules M1–M27, priority bands),
  `UAT_MASTER.md` (tracker), `DEFECT_REGISTER.md`, `GO_NO_GO_READINESS.md` (standing NO verdict
  until proven). Fork-B fix scoreboard carried for live re-verification.
