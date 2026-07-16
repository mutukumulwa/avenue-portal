# Busy TPA Day — RE-VERIFICATION Defect Register (Phase R)

Run: 2026-07-08 · Target: https://avenue-portal.vercel.app (Vercel prod, origin/main @ **dbca188**) ·
UI-driven as each persona + read-only API GET probes. Evidence in `BUSY_TPA_DAY_REVERIFY_RUN_LOG.md`.
Severity model (plan §2): Critical = stop-the-line; High = blocker unless waived by ops+finance.

## Blocker re-verification scoreboard (the deliverable)

| ID | First-pass finding | Re-test verdict | Evidence |
|---|---|---|---|
| **BD-01** | Update-Access dropdown could escalate provider→SUPER_ADMIN | **FIXED-VERIFIED** | portal rows "(locked)", staff-only dropdown; server guard requireRole ADMIN_ONLY + portal↔staff reject |
| **BD-02** | Duplicate not blocked at intake | **FIXED-VERIFIED (2-min window)** | rapid identical claim soft-blocked with inline banner (ss_2545yfydi); >2 min gap still creates both (by design) |
| **BD-03** | `/post-login` 503 blocks ALL logins | **FIXED-VERIFIED** | 6/6 clean role logins, no 503 (admin, ProvA, Claims, FinMaker, FinChecker, ProvB) |
| **BD-04** | Contract ceiling CPT-gated → CPT-less line escapes at full billed | **PARTIAL — reopened as BD-07 (High)** | fix works only for **pure** unlisted claims; mixed coded+uncoded still escapes |
| **BD-05** | Cannot create 2nd batch same provider+cycle → stranded | **FIXED-VERIFIED** | Aga Khan Nov 2026 **Run 2** created + settled (ss_6470yzfam, ss_98753z0hs) |

**4 of 5 fully fixed. BD-04 only partially fixed → BD-07. PLUS one NEW Critical (BD-06).**

---

## NEW / REOPENED defects this pass

| ID | Sev | Area | Title | Repro | Observed vs Expected | Status |
|---|---|---|---|---|---|---|
| **BD-06** | **CRITICAL** | API auth / PII | Hardcoded default operator API key **live in prod** → unscoped mass PII + claim read/inject | `GET /api/v1/eligibility?memberNumber=X` with header `x-api-key: av-slade360-dev-key` → **404** (authenticated, member-not-found), vs **401** for a bad key. Same on `/benefits`, `/claims`. Bearer form also works. | Obs: the in-source fallback `process.env.API_KEY \|\| "av-slade360-dev-key"` (`apiAuth.ts:25`) is a guessable, live operator credential; `operator` scope = `{}` (no tenant/provider confinement). Grants enumerable read of **every member's PII (incl. DOB)** + **every claim**, and (code-confirmed, not run) claim **injection** via POST /claims + preauth/hms-batch/sync. Exp: unset env must fail closed; no shipped default secret. | **OPEN** |
| **BD-07** | **High** | Adjudication / money control | BD-04 contract-ceiling bypass **survives for mixed coded+uncoded claims** | Provider A files CLM-2026-00295: line1 CONSULTATION CPT **99213** (billed 60k) + line2 OTHER "unlisted specialist bundle" **no CPT** (billed 80k). Claims Officer adjudicates. | Obs: line1 capped to tariff **3,500**; line2 **NOT capped** → system "Payable ceiling" = **83,500** (incl. full 80k uncoded), Decision pre-filled **Approve(Full)**, approved **83,500 accepted with no override** → APPROVED → **SETTLED** (80k left to cash). Exp: uncoded/unlisted line must not be payable at full billed without a `PAY_ABOVE_CONTRACT_RATE` override. The BD-04 unpriced-0 guard only fires when **every** line is unpriced. | **OPEN** |

### BD-06 — remediation
1. Set a strong `API_KEY` in the Vercel environment (all envs). 2. **Remove** the
`|| "av-slade360-dev-key"` fallback in `src/lib/apiAuth.ts` — fail closed (401) if unset.
3. Rotate/retire the exposed key. 4. Bind the operator credential to a tenant (the `operator`
scope is currently `{}`, so even a correct key spans all tenants) and prefer per-integration
keys. 5. Add a deploy guard/test asserting no default secret ships.

### BD-07 — remediation
In `ClaimDecisionService.assessCeiling` (`claim-decision.service.ts`): a line that resolves to
**no enforceable price** must contribute **0** (or force `unpriced`/refer) to the ceiling —
not its full `unitCost × qty` — regardless of whether *other* lines priced. Apply on BOTH the
engine branch (PENDED line ≈ line 114) and the FFS branch (allowedUnit === null ≈ line 147).
Equivalent: compute the ceiling as Σ(priced lines only) and route the unpriced remainder to
an explicit override, so a mixed claim can't auto-approve the uncoded portion at full billed.
Also stop the UI pre-filling Approve(Full) at a ceiling that includes uncoded lines.

## Re-verified strong (live this pass — give the system its due)
- **Money spine end-to-end RE-PROVEN** with **balanced GL** (9,548,180=9,548,180): intake →
  adjudicate (only approved posts) → maker batch → **maker self-approve blocked** → distinct
  checker → Mark Paid → SETTLED → Dr ClaimsPayable/Cr Cash once.
- **BD-05 supplementary run** works (Run 2 in a settled cycle).
- **Contract ceiling fail-closed for CODED lines** (line1 60k→3,500).
- **Provider isolation solid** (E2E-D02 area): IHK sees only its own claims/settlements;
  Aga Khan admin claim URL → branded Access Denied; provider-API scoping present in code.
- **RBAC**: nav trimmed per role; branded /unauthorized denial (no leak/crash).
- **BD-01/02/03 fixes hold.**

## Observations
- **OBS-2 (improved):** server-action errors now render as **on-page banners** (maker/checker
  block, dup guard) — the prior blank-after-503 symptom is gone.
- **OBS-1 (still open):** Aga Khan tariff rates are KES-magnitude labelled UGX (e.g. CPT 99213
  "UGX 3,500") — legacy de-KES relabel without FX conversion. Data-integrity item.
- **N3 (data-modelling, Med):** provider entitlement scopes by *client*, but several employers
  (Safaricom, KCB…) are modelled as Groups under a shared "Medvex — Default Client", so a
  provider entitled to one such group can read sibling groups' member PII over the API.
  Documented in `provider-entitlement.service.ts`; not code-fixable — promote employers to
  their own Client or add group-level applicability. (Not re-probed live.)

## Untested this pass (residual risk)
Member IDOR (VIS-02), HR/Fund/Reports data scope (VIS-03..07), fraud gate ON (ADJ-12), inpatient
IP-1/IP-2 money path, preauth PA-*, reports/CSV export tie-out (FIN-11), N3 live probe. These
could hide further defects and are NOT cleared.
