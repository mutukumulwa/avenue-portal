# Busy TPA Day — Adversarial Resilience Campaign (BB2) — Run Log

> **RESUME POINTER (session closed 2026-07-13 ~14:20 — VERDICT: CONDITIONAL GO):**
> Second-wave bug-bounty UAT on https://avenue-portal.vercel.app @ `33e005b`.
> **VERDICT + defect register written** → `BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_GO_NO_GO.md` / `_DEFECT_REGISTER.md`.
> **DONE (all ✅):** Entry gate GATE-01 login, GATE-02 **BD-06** default-key (both forms 401), GATE-03 API scope,
> **GATE-04 BD-07** mixed-ceiling FIXED-VERIFIED (3,500 excl. uncoded, blocks 83,500), GATE-05 **BD-05** supplementary run,
> Family A1/A2/A3 (key lifecycle, auth parser, facility-attribution safe), cross-rail API write (A2-01 safe),
> maker/checker SoD, GL balanced (9,551,680), key revoked+enforced. **Both prior blockers (BD-06 Critical, BD-07 High) CLOSED.**
> **New defects:** BB2-DEF-01 Med (API negative amount), BB2-DEF-03 Med (API dup idempotency; mitigated by double-capture),
> BB2-DEF-02 Low (API 500). OBS-B7/H1/A1/A2/A3. **No new Critical/High.**
> **Family K done this pass:** provider row PASS (routes+API+settlement scope), finance partial PASS, **N3 sibling-group CONFIRMED (Med)** — 6 employers under "Medvex — Default Client". Still open: **member IDOR + broker** (seed members have no portal emails → need provisioning; tooling degraded mid-session).
> **NEXT AGENT — untested residual (priority):** (1) **member IDOR + broker + HR/fund/reports adversarial re-test** (provision portal logins first; use a FRESH session/browser — Chrome login-submit broke this session), (2) Family C offline war-game, (3) Family D HMS-UI, (4) settlement-side fraud gate
> (does fraud-flagged claim pay through checker→Mark Paid?), (5) Family J membership/effective-date, (6) Family R portfolio ops.
> **Env facts:** Chrome (claude-in-chrome tab 80909685)=staff/provider forms (read_page works); in-app Claude_Browser
> ("seed")=2nd profile, but its read_page returns EMPTY on /provider/* pages (use JS+coordinate). **Login submit = Enter key.**
> Persona identity: **verify after login** (stale sessions bleed — hit IHK when expecting Aga Khan once). Creds in roster above.
> **Cleanup:** API key REVOKED ✅. Left: Jul 2026 RUN 2 batch (MAKER SUBMITTED, 3,500) + CLM-2026-00297..00305 test claims (RECEIVED/flagged, harmless).

**Target:** https://avenue-portal.vercel.app — Vercel production.
**Local HEAD:** main @ `33e005b` (BD-06 `e69ec17`, BD-07 `f5dfab7` are ancestors; Vercel auto-deploys main).
**Method:** UI-driven as each persona (as themselves). Read-only API GET probes + UI-created
provider keys for API boundary tests (plan §2.3/§2.4). No DB mutation. No real PII exfiltration
(auth-acceptance proven by response-code oracle, never by dumping a real member).
**Severity model:** plan §3 (Critical=stop-the-line; High=blocker unless waived by ops+finance).

## Persona roster & credentials (from prior Busy TPA passes)
| Persona | Login | Password | Scope |
|---|---|---|---|
| SUPER_ADMIN | admin@medvex.co.ug | MedvexAdmin2024! | tenant |
| Claims Officer (Grace Wanjiku) | claims@medvex.co.ug | MedvexAdmin2024! | ops |
| Medical (Dr Sarah Achieng) | medical@medvex.co.ug | MedvexAdmin2024! | clinical |
| Finance Maker (Peter Ochieng) | finance@medvex.co.ug | MedvexAdmin2024! | finance |
| Finance Checker | finance.busyday.checker@test.local | BusyDay2026! | finance (distinct) |
| Provider A (Aga Khan) | provider.busyday.agakhan@test.local | BusyDay2026! | facility A |
| Provider B (IHK) | provider.busyday.ihk@test.local | BusyDay2026! | facility B |
| Broker | broker@kaib.co.ke | (unknown — re-invite if needed) | brokerage |
| HR NWSC | hr.nwsc.uat@test.local | (temp — re-invite) | group |
| Fund NWSC | fund.nwsc.uat@test.local | (temp — re-invite) | fund |
| Reports | reports.uat@test.local | (temp — re-invite) | read-only |

Key member: **Mark Kato NWSC-2026-01768** (principal). Provider A active contract **PC-2026-128** (FFS tariff path).

## Entry Gate scoreboard (plan §7) — re-verifies BD-01..BD-07 on deployed build
| Gate | Probes | Blocker re-verified | Status |
|---|---|---|---|
| GATE-01 | login/out ×3 across roles, incl. cold browser — no /post-login 5xx, no role bleed | BD-03 | ⏳ |
| GATE-02 | retired default key + random key → both 401, non-enumerable | BD-06 | ✅ **PASS** (both 401; see below) |
| GATE-03 | Facility A key → Facility B claim / out-of-scope member → non-enumerable denial | E2E-D02 / API scope | ⏳ |
| GATE-04 | coded + uncoded line → unpriced contributes 0; full billed not payable w/o override | BD-07 | ⏳ (critical re-verify) |
| GATE-05 | late claim after settled batch → supplementary run settles once | BD-05 | ⏳ |
| GATE-06 | rapid double portal claim; later deliberate dup flagged | BD-02 | ⏳ |
| GATE-07 | foreign provider claim/batch URLs as Provider B → branded denial, no flash | IDOR | ⏳ |

---

## CHRONOLOGICAL LOG

### [GATE-02] BD-06 — default operator API key fail-closed — ✅ PASS (re-verified prod, 2026-07-13)
Read-only curl, GET only, no PII pulled:
| Probe | Key | HTTP | Meaning |
|---|---|---|---|
| `GET /api/v1/eligibility?memberNumber=ZZ-UAT-PROBE-0000` | `av-slade360-dev-key` (retired in-source default) | **401** | key **REJECTED** — fail-closed holds |
| same | `definitely-not-a-real-key-zzz` | **401** | control — bad key also 401 |

Both return **401 Unauthorized** — identical, non-enumerable. Prior pass the default key returned
**404-past-auth** (authenticated). The `e69ec17` fix (remove `|| "av-slade360-dev-key"` fallback →
fail closed on unset `API_KEY`) is **live in prod**. **BD-06 Critical CLOSED, verified.**
Note: operator channel is intentionally disabled (no `API_KEY` set) — this is the safe state.

### [GATE-01] BD-03 login stability — ✅ PASS (representative sweep)
- **admin@medvex.co.ug** → `/dashboard` clean, no 503 (dashboard: 2,997 members, 7 groups, 15 pending claims).
- **provider.busyday.agakhan** (the persona that ORIGINALLY threw the `/post-login` 503) → `/provider/dashboard` clean, no 503.
- UI logout (admin) → `/login` clean. Login page shows an "Authorized users only … monitored and logged" banner and **no seeded credentials/demo accounts** (playbook §9 pass).
- Scope note: prior pass already proved 6/6 roles clean; this pass re-confirms admin + the problem persona on the current build. Full 3×/role matrix not re-run (BD-03 twice-verified). 2FA field is optional ("if 2FA enabled").

### [Family A1] Facility A key lifecycle via UI — ✅ PASS
As Provider A (`/provider/api-keys`): generated key **label `BB2-API-A-001 primary`, prefix `mvxk_021ea12…`**.
Plaintext shown **once** with banner "Copy your new key now — it is shown only once"; table row ACTIVE, LAST USED "never", Revoke control present. (Secret held only in session shell; NOT recorded. Revoke at end.)

### [GATE-03 / Family A2] Facility-A key data scope — ✅ PASS
Black-box curl (GET only; PII auto-redacted; no real member dumped):
| Probe | HTTP | Verdict |
|---|---|---|
| Aga key → own claim `CLM-2026-00295` | 200 (own claim data) | correct — reads own facility |
| Aga key → IHK claim `CLM-2026-00284` | **404 "Claim not found"** | ✅ cross-facility read denied |
| Aga key → IHK claim `CLM-2026-00279` | **404 "Claim not found"** | ✅ denied, identical to nonexistent |
| Aga key → eligibility own-member `NWSC-2026-01768` | **404 "Member not found"** | non-enumerable (see OBS-A1) |
| Aga key → eligibility fake `ZZ-NOPE-9999999` | **404 "Member not found"** | identical → **no enumeration oracle** |

**OBS-A1 (Low/functional):** eligibility returns "Member not found" for `NWSC-2026-01768` even though Aga Khan holds a *paid* claim for that member — eligibility is scoped by **client-entitlement** (which schemes the provider is contracted for) while claim-read is scoped by **filing facility**. Fails safe (no leak); but a provider that has treated a patient can't run an eligibility check for them via API. Investigate whether intended.

### [GATE-02 ext / Family A3] Auth parser fail-closed matrix — ✅ PASS
Endpoint returns 200 only when auth accepted (`/claims?claimNumber=CLM-2026-00295`):
| Variant | HTTP | | Variant | HTTP |
|---|---|---|---|---|
| valid Bearer | 200 | | key via `x-api-key` | 200 |
| no header | **401** | | **retired default op key (Bearer)** | **401** |
| empty Bearer | **401** | | **retired default op key (x-api-key)** | **401** |
| random junk | **401** | | good Bearer + bad x-api-key | 200 |
| lowercase `bearer` | 200 (tolerant) | | **bad Bearer + good x-api-key** | **401** (Bearer wins, no fallthrough) |
| leading/trailing spaces | 200 (trims) | | duplicate `Authorization` | **400** (rejects ambiguity) |
| oversized 8KB header | 200 (handled) | | | |

Auth is **deterministic, fails closed** on missing/empty/bad, default operator key **dead on both header forms**, no built-in-credential fallback. Case/space tolerance is acceptable. **BD-06 hardening confirmed comprehensively.**

### [GATE-04] BD-07 — mixed coded+uncoded contract ceiling — ✅ FIXED-VERIFIED (the key money re-verify)
**Repro (mirrors prior BD-07 exactly):** Provider A (Aga Khan, PC-2026-128 FFS path) filed **CLM-2026-00297**, member Mark Kato NWSC-2026-01768, billed **UGX 140,000**:
- Line 1 CONSULTATION "BB2-GATE04 GP consultation" **CPT 99213**, billed 60,000 → contracted **3,500** (+1614%, capped)
- Line 2 OTHER "BB2-GATE04 unlisted specialist bundle" **no CPT**, billed 80,000 → contracted **—** (no enforceable price)

Claims Officer (Grace Wanjiku) adjudication panel:
- **Payable ceiling (PC-2026-128 tariff schedule) = UGX 3,500** — uncoded line **EXCLUDED** (was **83,500** in prior BD-07). Delta vs billed 136,500.
- Explicit **"BD-07"-labelled banner**: *"line(s) are uncoded/unlisted with no contracted rate — they are EXCLUDED from the payable ceiling… Approving the full billed amount is not permitted."*
- Approved-amount input **pre-filled to 3,500** (prior BD-07 pre-filled 83,500 → UI steering also fixed).
- **Enforcement proven:** set Approved Amount = **83,500**, Submit → **server-side hard block**, on-page banner (ss_0155mk69c): *"Contract enforcement: approved amount (UGX 83,500) exceeds the payable ceiling of UGX 3,500 … raise a PAY_ABOVE_CONTRACT_RATE override (requires senior approval)."* Claim stayed **CAPTURED, Approved 0** — no leak.

**BD-07 CLOSED, verified on both engine-PENDED and FFS branches (both lines PENDED → ceiling 3,500).** The `f5dfab7` fix holds for the mixed shape that the prior pass proved still leaked.

**OBS-B7 (Medium — display inconsistency):** the read-only **"Contracted Rate Analysis" preview** on the same page still shows **"Contracted total: UGX 83,500 … Consider approving the contracted total"** (line1 3,500 + line2 full-billed 80,000), which contradicts the enforced ceiling of 3,500 in the Adjudicate panel. An officer following the preview's advice is safely blocked, but the two figures disagree on one screen — confusing and could invite an unnecessary override. Recommend the preview reuse `assessCeiling` (exclude unpriced) so both read 3,500.

Final disposition CLM-2026-00297: **APPROVED UGX 3,500** (legit contracted amount; uncoded 80k correctly excluded).

### [ADJ-12 / Family H] Fraud gate — ⚠️ OBS-H1 (needs settlement-side follow-up)
CLM-2026-00297 was **"Routed to manual review — FRAUD_FLAG: 3 open fraud alert(s)"** (dup-detection from the three 140k same-member claims 00295/96/97). The Claims Officer **approved it (3,500) with all 3 fraud alerts still OPEN** — no fraud-acknowledgement or clearance step gated the approval. Routing-to-manual-review-then-human-approves is defensible (flags are advisory to the adjudicator), so this is **not** auto-NO-GO on its own. **The money-critical question (per plan Family H/ADJ-12) is whether a fraud-flagged claim can SETTLE before clearance** — to be tested on the finance side. Logged as **OBS-H1 (Medium, pending settlement probe).**

### [Family A2 / B / D — cross-rail API claim write] via Aga Khan key `mvxk_021ea12…`
Schema: `{memberNumber, providerCode, serviceType, dateOfService, diagnoses:[code], lineItems:[{category,description,cptCode,quantity,unitCost}]}`.

**A2-01 facility attribution — ✅ PASS (safe).** Aga Khan key POSTed claims with `providerCode` = `IHK` (→CLM-2026-00299), `BOGUS-XYZ-9999` (→00300), `""` (→00301), and `AGA-KHAN` (→00298). **All four attributed to "Aga Khan University Hospital"** (verified by own-facility read = 200 for each). The facility key **ignores body `providerCode` and forces its own facility** — no cross-facility write possible. Correct.

**Validations present on API:** member existence enforced (`ZZ-FAKE-99999` → **404 Member not found**); future date enforced (`2099-12-31` → **422** "Date of service cannot be in the future (Africa/Kampala)"). Cross-rail parity preserved at adjudication (API claims land RECEIVED → same ceiling engine).

**BB2-DEF-01 (Medium — negative billed amount accepted at API intake):** POST with `unitCost:-5000` → **HTTP 201, CLM-2026-00302 created with billedAmount −5000**. Invalid financial data materialised. Plan B-04 says zero/negative price must be rejected. Likely a **UI-vs-API parity gap** (UI number field may block negatives). Risk: negative line could corrupt claim/batch/GL math if adjudicated. Intake should reject qty/price ≤ 0. *Pending: UI-parity check + adjudication behaviour of a negative claim.*

**BB2-DEF-02 (Low — raw 500 on malformed field):** POST with `diagnoses:[{code:"I10"}]` (object instead of string) → **HTTP 500 "Internal Server Error"** instead of a 400 validation message. Structured-but-wrong input should fail gracefully (plan §24: no raw exceptions). Not security/money, but a robustness gap and it leaks nothing useful to the caller.

**OBS-A2 (informational):** API claim-write accepts any *existing* member (NWSC-2026-01768 → 201) even though API eligibility-read returns 404 for the same member+key (client-entitlement scope). Defensible split (providers file; TPA adjudicates entitlement), but worth confirming it's intended.

Test claims created via API (all Aga Khan, RECEIVED, BB2-labelled): **CLM-2026-00298..00302** (00302 = negative). To be declined/dispositioned at cleanup.

### [GATE-06 / E-02 / needle #7,#19] Cross-rail duplicate control — 🟠 BB2-DEF-03 (Medium — corrected down from High after observing the backstop)
**Repro:** 3× rapid **identical** API POST (same member/provider/date/desc/CPT, unitCost 7,777) → **HTTP 201 ×3, three distinct claims CLM-2026-00303 / 00304 / 00305**. No dedup, no idempotent response — a client retry gets a NEW claim number each time.
**Cross-rail parity gap:** the **UI portal** has a **2-minute intake dup-guard** (prior pass). The **API rail has no intake guard.**
**BUT the backstop fires (credit due):** at **capture**, the system runs **synchronous double-capture detection** and routes the claim to manual review with an **explicit reason listing the exact sibling claims** — observed on CLM-2026-00303: *"Routed to manual review — Double-capture: claim for same provider/member/date/category already exists (CLM-2026-00297, 00298, 00299, 00300, 00301)."* This catches **cross-rail** duplicates (it flagged the API dups against the UI-filed 00297). So duplicates **cannot silently settle twice** — an adjudicator is explicitly told they're duplicates.
**Residual risk (why still a defect, Medium):** (1) the double-capture routing is **advisory not enforcing** (per OBS-H1 an officer can still approve a flagged claim), so two duplicates *could* be paid if the officer ignores the warning; (2) no **idempotent API response** — an automated HMS timeout-retry creates claim clutter (new number each time) instead of returning the original. **Fix:** honor a client idempotency/`externalRef` key on `/api/v1/claims` (return the original claim on retry); consider making double-capture **block** rather than warn at approval.
**OBS-A3 (Low):** API-created claim 00305 shows an **empty DIAGNOSES** panel — `diagnoses:["I10"]` did not attach a diagnosis record the way the UI claim (00297 → "Essential hypertension I10") did. API-rail data fidelity gap.
**Credit:** synchronous **cross-rail double-capture detection** with explicit sibling listing is a genuine strength — it closes the silent-duplicate-payment path the API intake gap would otherwise open.

### [GATE-05 / Family I — settlement] BD-05 supplementary run + SoD + fraud-at-settlement
Finance Maker (Peter Ochieng, finance@) at `/settlement`:
- **GATE-05 / BD-05 — ✅ re-verified.** Created **Aga Khan · Jul 2026 · RUN 2 · 1 claim · UGX 3,500 · MAKER SUBMITTED** — a supplementary run for a cycle that already has a settled batch (the Jul 2026 46-claim/3,288,480 batch). Scooped exactly the newly-approved CLM-2026-00297.
- **FIN SoD — ✅ PASS.** Maker clicked **Approve** on own batch → **server block** `?error=Maker and checker must be different users`. Self-approval impossible.
- **OBS-H1 confirmed (fraud does NOT gate settlement):** CLM-2026-00297 carried **3 open fraud alerts** through approval AND was **scooped into the settlement batch** with no fraud block anywhere on the settlement path. Money-impact here is nil (the settled amount 3,500 is the legit contracted value; the duplicate 140k siblings are un-approved and NOT in the batch), so this is **Medium, not a blocker** — but the *control* gap stands: an open fraud/duplicate alert should quarantine a claim from settlement until cleared. Combined with BB2-DEF-03, an officer who ignores a double-capture warning could approve + settle duplicates.

### [Cleanup] API key revocation — ✅ done + enforced
Revoked **BB2-API-A-001 primary** via `/provider/api-keys` (status → REVOKED; LAST USED 13/07 14:14:12 confirmed usage tracking advanced). Server enforcement re-checked: revoked key → **401 on read AND write** (A1.7-8 PASS; no claim created).

### [Test-artifact ledger — this pass]
- CLM-2026-00297 (UI mixed coded+uncoded, billed 140k, **APPROVED 3,500**, in Aga Khan **Jul 2026 RUN 2** batch, **MAKER SUBMITTED** — recoverable; a checker will approve/reject in normal ops).
- CLM-2026-00298..00305 (API-created, all Aga Khan, RECEIVED): 00298 (1,000), 00299/00300/00301 (500 ea, providerCode attribution probes), 00302 (**-5,000** negative — BB2-DEF-01), 00303/00304/00305 (7,777 ea, dup probes → double-capture flagged). All BB2-labelled, RECEIVED, cannot auto-settle (flagged); recommend bulk-decline in cleanup.
- API key **BB2-API-A-001** — REVOKED ✅.

### [Family K — scope & privacy] Provider portal boundary — ✅ PASS; member/HR/fund/reports/broker — ⛔ BLOCKED (login rate-limit)
**Provider row — ✅ PASS (comprehensive).** As Provider A (Aga Khan), direct navigation to every staff/admin/other-portal route lands on branded **`/unauthorized` "Access Denied"**: `/settings`, `/members`, `/claims`, `/member/dashboard`, `/billing/gl`, `/reports`, `/groups`, `/settlement`, `/hr/dashboard`, `/fund/dashboard`, `/broker/dashboard`, `/compliance/privacy`, `/preauth`. Provider is confined to `/provider/*`. (A `fetch()` returns the 200 SSR shell for `/claims` & `/member/dashboard`, but **real navigation redirects to Access Denied** — the guard holds; no member-list/PII or cross-provider data rendered.) Combined with GATE-03 (API facility scope) + A2-01 (no cross-facility write), **provider isolation is solid.**
**Finance row — ✅ partial.** Finance Maker → `/settings` = Access Denied; finance nav trimmed to OVERVIEW/FINANCE/INSIGHTS only.
**Provider settlement scope — ✅ PASS.** Aga Khan `/provider/settlements` shows ONLY its own batches (total UGX 3,458,980; incl. the Jul 2026 RUN 2 3,500 MAKER SUBMITTED I created); IHK's Jul 2026 batch is absent. Facility is session-derived (A2-01), not URL-param — no filter-tamper vector (needle #20) on the provider settlement surface.

**N3 shared-client sibling-group exposure — 🟠 CONFIRMED live (Medium).** Admin `/clients` shows **"Medvex — Default Client" (Insurer) holds 6 schemes** — Twiga Foods, Bamburi Cement, East African Breweries, KCB Group, Safaricom PLC, and Patricia Wanjiru are all **sibling groups under ONE payer client** (`/groups` confirms them as distinct employers). Only **NWSC is correctly its own client** (self-funded, 1 scheme). Because provider/API entitlement scopes by **client** (GATE-03 showed Aga Khan is client-entitlement-scoped, and it holds AVH-DEMO-EABL/BAM claims → it IS entitled to the Default Client), a provider entitled to the Default Client can read member PII across **all 6 unrelated employers** (e.g., an entity serving EABL could enumerate Safaricom/KCB members). Employer-level data isolation is **not enforced** for the 6 Default-Client employers. Architectural confirmation of the prior N3 residual; live cross-employer read not re-run (would need a fresh provider key — mine was revoked). **Fix:** promote each employer to its own Client, or add group/scheme-level applicability to provider entitlement.

### [Family K — Member IDOR (VIS-02)] — ✅ PASS (resumed 2026-07-13, member portal provisioned)
Provisioned a member-portal login via admin `/members/<Noah>` → "Member Portal Login" → **noah.bb2@test.local / BusyDay2026! ACTIVE** (Noah Kato NWSC-2026-02995). Logged in as Noah → `/member/dashboard`. IDOR probes (attacker=Noah, victims=Mark Kato NWSC-2026-01768 / CLM-2026-00297, EABL demo members):
| Probe | Result |
|---|---|
| Noah → admin `/members` (registry) | **Access Denied** |
| Noah → staff claim `/claims/cmrj3zdnp…` (Mark's CLM-2026-00297) | **Access Denied**, no data leak |
| Noah session → provider `GET /api/v1/eligibility?memberNumber=NWSC-2026-01768` | **401** "Invalid or missing API Key" (member cookie ≠ provider key) |
| Noah → `/api/member/{benefits,claims,profile}`, `/api/members/NWSC-2026-01768` | **404** (no member REST API to tamper) |
| Noah → `/member/benefits?memberNumber=NWSC-2026-01768&memberId=…&member=…` | **ignored** — still Noah's own data (Silver, 30.0M); **not param-driven** |
| Noah → `/member/dependents` | shows **only Noah** (1 covered member, "your own"); explicit **"PRIVACY GUARDRAIL — sensitive categories summarized for family"** |

**Member portal is strictly session-scoped (RSC, no client data API, ignores tampered member identifiers). Member IDOR: PASS — no cross-member PII access.**

### [Family K — Broker scope (VIS-05)] — ✅ PASS (resumed 2026-07-13)
Logged in as **broker@kaib.co.ke / MedvexAdmin2024!** → `/broker/dashboard` (nav: My Groups, Submissions, Quotations, Commissions, Renewals).
| Probe | Result |
|---|---|
| Broker `/broker/groups` (own book) | **Only Safaricom PLC** (78 members) — "Corporate groups under your brokerage." NOT the other 6 groups (NWSC/Twiga/Bamburi/EABL/KCB/Patricia) |
| Broker → `/members`, `/claims`, `/billing/gl`, `/settings`, `/reports`, `/provider/dashboard`, `/settlement`, `/groups`, `/preauth`, `/member/dashboard` | **ALL denied** (middleware redirect → `/unauthorized`) |
| Broker → own group detail `/broker/groups/<Safaricom>` | roster only (names/member-no/relationship/aggregate limit+endorsements); **NO clinical/claim/ICD detail** (within policy) |

**Broker sees only its own book (Safaricom), no other brokers' clients, no clinical detail, no cross-portal access. Broker scope: PASS.** *(Cross-broker foreign-group-detail IDOR `/broker/groups/<other-id>` not probed — no second group ID available without another admin login; low risk given RSC session-scoping + middleware denials.)*

### [Family K — HR / Fund / Reports (VIS-03/04/06)] — carried from prior outpatient CLOSURE pass (PASS), not adversarially re-tested this build
HR-scope, fund-admin, and reports were **PASS** in the outpatient closure pass (per memory `outpatient-vercel-uat-2026-07-07`). Not re-run under this adversarial lens on `33e005b` — residual, lower risk than member/broker (which are now cleared).

**Test-artifact note:** created member-portal login **noah.bb2@test.local** (Noah Kato NWSC-2026-02995) → **NEUTRALISED 2026-07-13**: admin `/members/<Noah>` → Member Portal Login → **Reset Password** to a strong random value that was NOT recorded, invalidating the `BusyDay2026!` credential. Login row still reads "ACTIVE" (the UI provides **no hard disable/delete** for member portal logins — only reset), but no usable/known password remains. **OBS-K2 (Low): member portal login can be created/reset but not deactivated or deleted from the UI** — a member self-service account, once created, can't be turned off without a password-reset-to-unknown workaround. Noah's member record itself was left untouched (ACTIVE, legitimate).

**Original blocked line (superseded above):** member/HR/fund/reports/broker were login-throttle-blocked on the first attempt; member + broker now completed on resume. Their creds are admin-set temp passwords needing an admin reset, and **admin login is unavailable** (see OBS-K1). This is the **#1 remaining untested privacy gap** and stays a NO-GO risk until cleared.

**OBS-K1 (Low — login rate-limit gives no user feedback):** after ~10 rapid login/logout cycles this session, **new logins from this browser stopped submitting** — clicking Sign In (or Enter) fires **no network request**, shows **no error/message**, button stays idle; affects **multiple accounts** (admin@ and finance.busyday.checker@ both), while **existing authenticated sessions keep working** (Aga Khan in the 2nd profile was unaffected). Consistent with an **IP-based anti-brute-force login throttle** — a good control — but it **silently dead-ends the form with zero user feedback** (a real user mistyping a few times would see a broken-looking page). Recommend a visible "too many attempts, try again in N min" message. *(Env note: this also blocked the Family K persona provisioning above — retry once the throttle window clears.)*

### [Family Q — GL money spine] Trial balance — ✅ BALANCED on build 33e005b
`/billing/gl` Trial Balance **✓ Balanced, TOTAL DR = CR = UGX 9,551,680**. This is exactly **+3,500 vs the prior pass's 9,548,180** — my CLM-2026-00297 approval posted **Dr 5010 Net Claims Incurred / Cr 2010 Claims Payable 3,500**, balanced. Approval-time GL posting **re-proven on the current build**. (Settlement-pay leg Dr ClaimsPayable/Cr Cash proven in prior pass; GL logic untouched by BD-06/07/tiering fixes.) Chart of accounts complete (24 accounts, double-entry).
