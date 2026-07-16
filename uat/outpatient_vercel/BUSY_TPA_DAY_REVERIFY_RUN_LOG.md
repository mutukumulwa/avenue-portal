# Busy TPA Day — RE-VERIFICATION Pass (Phase R) — Run Log

> **RESUME POINTER:** Phase R re-verification of the BD-01..BD-05 remediation on
> https://avenue-portal.vercel.app (origin/main @ dbca188). Started 2026-07-08.
> **Next step:** Browser-driven re-verify of BD-01..BD-05 through the UI as each
> persona (see scoreboard). API-scope needle N2 already found a NEW Critical
> (**BD-06**) before UI work began. Continue at "UI RE-VERIFY" section.

**Target:** https://avenue-portal.vercel.app — Vercel production, `origin/main @ dbca188`
(the deployed remediation of the prior NO-GO run).
**Method:** UI-driven as each actor (as themselves) for workflow re-verify; read-only
API GETs permitted for security-boundary probing (bug-bounty framing, plan §2/§13).
**No mutations via API/DB.** No real PII exfiltration (auth-acceptance proven by
404-vs-401, never by dumping a real member).

Prior pass: `BUSY_TPA_DAY_E2E_UAT_RUN_LOG.md` (verdict NO-GO, BD-01..BD-05).
Remediation: `BUSY_TPA_DAY_REMEDIATION_PLAN.md` + commits 340c0bc/dbca188.

---

## Blocker re-verification scoreboard

| ID | First-pass finding | Fix claimed | Re-test status |
|---|---|---|---|
| BD-01 | Update-Access dropdown could escalate provider→SUPER_ADMIN | staff-only dropdown, portal rows locked, server rejects portal↔staff | ⏳ pending UI |
| BD-02 | Duplicate not blocked at intake (routed at adjudication) | 2-min intake dup guard | ⏳ pending UI |
| BD-03 | `/post-login` intermittent 503 blocks ALL logins | route handler + full-doc nav | ⏳ pending UI (mem says prod 307 OK) |
| BD-04 | Contract ceiling CPT-gated → CPT-less line escapes at full billed | desc-match + unpriced-0 ceiling | ⏳ pending UI — **NEEDLE N1: mixed-line gap** |
| BD-05 | Cannot create 2nd batch same provider+cycle → stranded | `sequence` supplementary runs | ⏳ pending UI |

## Needle hypotheses (code-derived, this pass)

- **N1 (BD-04 incomplete, High cand.):** `assessCeiling` folds each *unpriced/PENDED*
  line's **full billed** into the ceiling whenever ≥1 line is enforceable (FFS path
  `claim-decision.service.ts:147`; engine path `:114`). The BD-04 unpriced-0 guard
  (`:168`) only fires when **every** line is unpriced. → Bundle one cheap on-tariff line
  with an expensive uncoded/unlisted line and the uncoded amount is approvable at full
  billed with **no override**. Verify via UI.
- **N2 → BD-06 (Critical, CONFIRMED below):** hardcoded default operator API key.
- **N3 (Med/High cand.):** `ProviderEntitlementService` scopes by *client*, but prod
  models several employers (Safaricom, KCB…) as Groups under one shared "Medvex —
  Default Client" (documented caveat, `provider-entitlement.service.ts:15`). A provider
  entitled to one such group can read sibling groups' member PII. Probe if reachable.
- **N4 (Med cand.):** BD-05 — does REJECTING a settlement batch release its claims for
  re-batching, or strand them? Test if reachable.
- **N5 (systemic):** OBS-2 `?error=` blank-page feedback — re-check banners render.

---

## CHRONOLOGICAL LOG

### [SEC-API] N2 → BD-06 — Hardcoded default operator API key LIVE in prod — **CRITICAL**

Read-only probes (curl, GET only — no mutation, no real PII pulled):

| Probe | Key | Result | Meaning |
|---|---|---|---|
| `GET /api/v1/eligibility?memberNumber=ZZ-UAT-PROBE-0000` | `av-slade360-dev-key` (in-source default) | **404** `Member not found` | key **ACCEPTED** (past auth); only member lookup failed |
| same | `definitely-not-a-real-key…` | **401** `Unauthorized` | control — auth layer genuinely rejects bad keys |
| `GET /api/v1/claims?claimNumber=CLM-2026-99999` | default | **404** `Claim not found` | accepted |
| `GET /api/v1/benefits?memberNumber=ZZ-…` | default | **404** `Member not found` | accepted |
| same | invalid | **401** | control |
| `GET /api/v1/eligibility` `Authorization: Bearer av-slade360-dev-key` | default | **404** | Bearer form also works |

**Root cause:** `src/lib/apiAuth.ts:25` — `const OPERATOR_KEY = process.env.API_KEY || "av-slade360-dev-key";`
`process.env.API_KEY` is **not set** in Vercel prod, so the guessable in-source default is
a live credential. It resolves to `{ kind: "operator" }` → scope `{}` (no tenant/provider
confinement, `apiAuth.ts:52`, eligibility `route.ts:22`).

**Blast radius (all `/api/v1/*` are gated only by `withApiKey`, which accepts this key):**
- GET `/eligibility` → any member PII (name, **DOB**, gender, relationship, group, package,
  status), **enumerable by memberNumber** — 404-vs-existing distinguishes valid members.
- GET `/benefits` → member benefit/utilisation.
- GET `/claims?claimNumber=` → claim member name, provider, billed/approved/copay —
  **enumerable by claim number** (sequential `CLM-YYYY-NNNNN`).
- POST `/claims` → **claim injection** (write/money path; operator key resolves provider
  from body `providerCode`). *Not executed live — mutation prohibited; code-confirmed.*
- POST `/preauth`, `/hms-batch`, `/sync` → same gate, code-confirmed writable.

**Severity: CRITICAL.** Unauthenticated-in-practice (publicly guessable) mass PII disclosure
of every member + every claim, plus claim injection, across the whole tenant. Strictly worse
than the prior E2E-D02. This is an independent NO-GO on its own.
**Evidence:** probe table above (reproducible read-only). Deliberately did NOT dump a real
member — 404-past-auth is sufficient proof and pulling real DOBs would itself be harmful.
**Remedy:** set a strong `API_KEY` in Vercel env AND remove the `|| "av-slade360-dev-key"`
fallback (fail-closed if unset); rotate; consider per-operator keys + tenant binding on the
operator credential.

---

### [UI RE-VERIFY] Blocker scoreboard results (as-each-persona, live)

- **BD-03 (login 503) — FIXED-VERIFIED.** Clean logins landing in-portal, no 503, for
  **admin** (→/dashboard, ss_8953snwkd), **Provider A** (→/provider/dashboard, ss_6242mt6al),
  **Claims Officer** (→/dashboard, ss_0216f7x2f). 3/3 roles, no stuck "Signing in…".
- **BD-01 (RBAC Update-Access) — FIXED-VERIFIED.** /settings Users&Access: every portal row
  (PROVIDER/MEMBER/HR/FUND/BROKER) renders **"… (locked)"** with NO role dropdown; staff rows
  show a staff-only dropdown (no portal roles). A provider row can no longer be silently
  escalated to SUPER_ADMIN. Backed by server guard `updateUserAccessAction` (requireRole
  ADMIN_ONLY + portal↔staff rejection). Evidence: /settings get_page_text.
- **BD-02 (intake dup guard) — FIXED-VERIFIED (scoped).** Rapid identical claim (same
  member/date/amount, <2 min) soft-blocked with **inline banner** "An identical claim
  (CLM-2026-00296) … was just submitted … already in the queue" — no dup created (ss_2545yfydi).
  NOTE: guard is a **2-minute** window only; two identical claims >2 min apart are BOTH created
  (observed: 00295 & 00296, both 140k, same member/date) — by design (genuine repeat visits);
  adjudication-time double-capture routing is the backstop (confirmed firing on 00295).
  Also validates OBS-2/N5: error now renders as inline banner, not a silent blank page.

### [ADJ] N1 → **BD-07** — BD-04 ceiling bypass SURVIVES for mixed coded+uncoded claims — **HIGH**

Persona: Provider A (Aga Khan) files, Claims Officer (Grace Wanjiku) adjudicates. Member
Mark Kato NWSC-2026-01768. Active contract **PC-2026-128** (FFS tariff path — "no digital
contract matched"; banner "Unlisted services: refer for review").

Claim **CLM-2026-00295**, two lines, billed UGX 140,000:
| Line | CPT | Billed | System "Contracted" | Capped? |
|---|---|---:|---:|---|
| CONSULTATION "GP consultation" | **99213** | 60,000 | **3,500** (+1614%) | ✅ capped |
| OTHER "UAT-N1 unlisted specialist bundle" | *(none)* | 80,000 | **—** | ❌ **NOT capped** |

- Adjudicate panel: **Payable ceiling (Contract PC-2026-128 tariff schedule) = UGX 83,500**
  = 3,500 (capped coded line) **+ 80,000 (uncoded line at FULL billed)**. Banner: *"1 line
  billed above contracted rate … Consider approving the contracted total."* (ss_0313olajf)
- Decision **pre-filled to "Approve (Full)"**, Approved Amount **pre-filled 83,500** (ss_2200icxea).
- Submitted Approve(Full) 83,500 → **ACCEPTED, no override, no senior approval** →
  **CLM-2026-00295 APPROVED, Approved UGX 83,500** (ss_1502vhone).

**Defect:** the BD-04 fix (unpriced→ceiling 0, block full-billed) only fires when **every**
line is unpriced (`claim-decision.service.ts assessCeiling` FFS branch: reached only when
`hasEnforceableLines === false`). A single coded line makes `hasEnforceableLines=true`, and
each unpriced line then adds `unitCost × qty` (full billed, line ~147) to the ceiling and
returns before the unpriced-0 guard. Same gap on the engine branch (PENDED line adds full
billed, line ~114). Net: **an uncoded/unlisted line bundled with one coded line escapes the
contract ceiling at full billed, no override** — the exact BD-04 bug class, still live, and
the UI steers the officer to approve it. Real claims routinely mix coded + uncoded/bundled
lines → high real-world exposure (fail-toward-overpay). **Severity: HIGH** (money control
bypassable). Only backstop = double-capture routing (fired here only because I made dups) +
reviewer diligence.

### [BD-05 + FIN + GL] Supplementary settlement run + money spine — FIXED-VERIFIED / RE-PROVEN

- **BD-05 — FIXED-VERIFIED.** Finance maker created an **Aga Khan / Nov 2026** batch (cycle
  already has a SETTLED batch, 3 claims/61,500). Result: new **"Nov 2026 · RUN 2 · 1 claim ·
  UGX 83,500 · MAKER SUBMITTED"** (ss_6470yzfam). Supplementary run scooped exactly the newly-
  approved 00295. No silent fail.
- **FIN-03 (maker/checker SoD) — PASS.** Maker Approve on own RUN 2 → blocked, banner "Maker and
  checker must be different users" (ss_6056u7ip3).
- **FIN-04/05 — PASS.** Distinct checker Approved → CHECKER APPROVED (ss_53598ewn1) → Mark Paid →
  **SETTLED** (ss_98753z0hs).
- **GL — PASS (balanced throughout).** Before settle 9,464,680=9,464,680 (= prior close 9,381,180
  +83,500 approval); after settle **9,548,180=9,548,180** (+83,500): Cash CR +83,500, Claims Payable
  DR +83,500, expense/revenue untouched → settlement Dr ClaimsPayable/Cr Cash 83,500 once.
  **Money spine RE-PROVEN.** BD-07 side effect confirmed: 80,000 of the 83,500 paid = the uncoded
  line that escaped the ceiling → leak reached cash.
- **BD-03 re-verified for Finance maker & checker → 5/5 roles clean logins, no 503.**

### Scoreboard so far
BD-01 ✅ · BD-02 ✅(2-min) · BD-03 ✅(5 roles) · BD-04→**BD-07 HIGH open** · BD-05 ✅ · +**BD-06 CRITICAL** (API key).
Money spine ✅ balanced. **Verdict trending NO-GO** (BD-06 Critical alone). Remaining: E2E-D02
provider-portal IDOR, member IDOR, fraud gate, HR/fund/reports scope, inpatient/preauth.

### [E2E-D02 IDOR re-probe] Provider isolation (prior D02 Critical area) — PASS

Persona: Provider B (IHK, provider.busyday.ihk@). BD-03 login clean (6th role).
- **List scope PASS:** IHK dashboard shows ONLY its own 2 claims (Prossy Kato 00284/00279);
  none of Aga Khan's 96 claims (ss_3553kocsm).
- **Admin-route denial PASS:** IHK → `GET /claims/cmrbqlbb4000004laasoynenk` (the Aga Khan
  claim 00295) → branded **Access Denied** at `/unauthorized`, no data/stack trace (ss_9761oxl1l).
- **Settlement scope PASS:** IHK `/provider/settlements` shows ONLY its own Jul 2026 batch
  (UGX 6,000, PV-2026-00003); none of Aga Khan's 7 batches (incl. the 83,500 Run 2).
- Provider-API scoping (the actual prior D02) is confirmed in code (`entitledMemberWhere` +
  `providerScopeWhere`, deny-by-default) — BUT undermined by **BD-06** (operator key bypasses
  all scope). N3 (client-granularity caveat for sibling groups under shared "Medvex — Default
  Client") remains a documented data-modelling residual — not re-probed live this pass.

### Untested this pass (residual risk — carry to verdict)
Member IDOR (VIS-02), HR/Fund/Reports scope (VIS-03..07), fraud gate ON (ADJ-12), inpatient
IP-1/IP-2, preauth PA-*, reports export tie-out (FIN-11), N3 entitlement client-granularity.
Reason: member/HR/fund/reports personas use @test.local temp pws (need admin re-invite) and
ADJ-12 needs a prod global-setting flip; verdict is already decided by BD-06, so these were
deprioritised. They could hide further defects.

### Test-artifact ledger (this pass)
- CLM-2026-00295 (N1 mixed, billed 140k, **APPROVED 83,500, SETTLED** in Aga Khan Nov 2026 Run 2)
- CLM-2026-00296 (>2-min dup of 00295, 140k, RECEIVED — un-adjudicated; decline/ignore)
- Settlement batch: Aga Khan **Nov 2026 RUN 2, UGX 83,500, SETTLED** (voucher+journal)
- No users created this pass (reused prior BusyDay personas).
