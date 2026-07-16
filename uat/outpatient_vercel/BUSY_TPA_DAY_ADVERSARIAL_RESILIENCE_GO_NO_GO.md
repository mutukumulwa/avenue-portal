# Busy TPA Day — Adversarial Resilience Campaign (BB2) — GO / NO-GO

**Standing verdict: CONDITIONAL GO** — *the two previously-blocking issues are FIXED-VERIFIED and no new Critical/High was found in the surfaces tested; a full production GO is gated on clearing the untested residual (esp. member/HR/fund/reports privacy scope, offline, HMS, membership) and the Medium findings.*

**Date:** 2026-07-13 · **Target:** https://avenue-portal.vercel.app (Vercel prod) · **Build:** origin/main @ `33e005b` (incl. BD-06 `e69ec17`, BD-07 `f5dfab7`).
**Method:** UI-driven as each persona (as themselves) via real browser + black-box HTTP client for API boundary tests (plan §2.3). No DB mutation. No real PII exfiltration. Evidence: `BUSY_TPA_DAY_ADVERSARIAL_RESILIENCE_RUN_LOG.md`.

## Prior-blocker re-verification scoreboard (the headline)
| Blocker | Prior severity | Re-test verdict (this pass, fresh evidence) |
|---|---|---|
| **BD-06** default operator API key live in prod | 🔴 Critical | ✅ **FIXED-VERIFIED** — retired key + random key both **401** on `x-api-key` AND `Bearer`; auth fails closed on missing/empty/bad; no built-in-credential fallback. |
| **BD-07** mixed coded+uncoded ceiling bypass | 🟠 High | ✅ **FIXED-VERIFIED** — CLM-2026-00297: payable ceiling **3,500** (uncoded 80k **excluded**), server **hard-blocks** an 83,500 approve, override required. |
| BD-03 `/post-login` 5xx login outage | 🔴 Critical | ✅ FIXED-VERIFIED — admin + the originally-failing provider persona log in clean, no 503. |
| BD-05 stranded settlement (no supplementary run) | 🟠 High | ✅ FIXED-VERIFIED — Aga Khan **Jul 2026 RUN 2** supplementary batch created + scooped the late claim. |
| BD-02 intake duplicate guard | Low/Med | ✅ holds in UI; ⚠️ **absent on API rail** → BB2-DEF-03 (Med, mitigated by double-capture detection). |
| BD-01 RBAC role-escalation | High | (not re-tested this pass — FIXED-VERIFIED in prior pass; server guard intact.) |

**Both stop-the-line blockers from the last NO-GO are closed. This is a major improvement over the 2026-07-08 NO-GO.**

## Spine-question answers
1. **Can it pay only what the contract says?** — **YES.** BD-07 fixed; uncoded lines excluded from the ceiling; over-ceiling approval server-blocked; requires PAY_ABOVE_CONTRACT_RATE override (senior approval).
2. **Can member/claim data stay within its scope?** — **YES for provider + API scope** (facility key can't read another facility's claims; body `providerCode` ignored → no cross-facility write; non-enumerable 401/404). **UNTESTED for member / HR / fund / reports / broker scope** (Family K) — the largest residual risk.
3. **Can money leave only with the required approvals?** — **YES.** Maker/checker SoD server-enforced (self-approve blocked); GL trial balance **✓ balanced** (9,551,680) with correct approval posting. Caveat: fraud/duplicate flags are **advisory, not enforcing** (OBS-H1) — a flagged claim can be approved and settled.
4. **Does every submitted event become exactly one outcome / at most one payment?** — **Mostly.** API rail lacks an intake dup-guard (BB2-DEF-03), but synchronous **cross-rail double-capture detection** catches duplicates at capture with explicit sibling listing, preventing silent double-payment.

## What is genuinely strong (verified live this pass)
- **BD-06 hardening** is comprehensive: default key dead on both header forms; deterministic fail-closed auth parser; revoked keys 401 on read+write.
- **BD-07 contract ceiling** is server-enforced with an explicit BD-07 banner and a correct 3,500 ceiling on the exact mixed shape that leaked before.
- **API facility scoping**: reads scoped to own facility; writes force own facility regardless of body `providerCode`; member-existence + future-date validated.
- **Money spine**: supplementary settlement runs, maker/checker SoD, balanced double-entry GL, cross-rail double-capture detection.

## Findings this pass (none Critical/High)
| ID | Sev | Title |
|---|---|---|
| BB2-DEF-01 | Medium | API `/api/v1/claims` accepts a **negative billed amount** at intake (CLM-2026-00302, −5,000). UI-vs-API parity gap; contract engine floors payable at 0 so no negative-money leak, but invalid data materialises. |
| BB2-DEF-03 | Medium | API rail has **no intake duplicate/idempotency guard** (UI has a 2-min guard). Mitigated by synchronous double-capture detection at capture; residual: no idempotent retry response; double-capture warning is advisory. |
| OBS-B7 | Medium | Adjudication page shows an **inconsistent** read-only "Contracted total 83,500" preview vs the enforced ceiling of 3,500. |
| OBS-H1 | Medium | Fraud/duplicate alerts **do not gate** approval or settlement (advisory only) — a flagged claim can be approved and scooped into a settlement batch. |
| BB2-DEF-02 | Low | API returns raw **HTTP 500** on a structured-but-invalid `diagnoses` field (should be a 400). |
| OBS-A1/A2/A3 | Low/info | eligibility-read vs claim-read scope asymmetry; API accepts existing-non-entitled member (adjudication gates entitlement); API `diagnoses` didn't attach to the claim record. |

## Family K (scope & privacy) — partial
- **Provider row — ✅ PASS (comprehensive).** Provider A denied on every staff/admin/other-portal route (`/settings`, `/members`, `/claims`, `/member/dashboard`, `/billing/gl`, `/reports`, `/groups`, `/settlement`, `/hr|fund|broker/dashboard`, `/compliance/privacy`, `/preauth`) → branded `/unauthorized`; confined to `/provider/*`. With GATE-03 (API facility scope) + A2-01, provider isolation is solid.
- **Finance row — ✅ partial** (Finance Maker denied `/settings`; nav trimmed).
- **Provider settlement scope — ✅ PASS** (own batches only; facility session-derived, no filter-tamper vector).
- **N3 shared-client sibling groups — 🟠 CONFIRMED live (Medium).** `/clients` shows **"Medvex — Default Client" holds 6 schemes** (Twiga, Bamburi, EABL, KCB, Safaricom, Patricia — 6 distinct employers as sibling groups under one payer); only NWSC is its own client. Provider/API entitlement scopes by *client*, so a provider entitled to the Default Client can read member PII across all 6 unrelated employers. Employer-level isolation not enforced for those 6. **Fix:** promote each employer to its own Client, or add group-level applicability to entitlement.
- **Member IDOR — ✅ PASS (resumed).** Provisioned a member-portal login (Noah Kato) and probed as that member: admin `/members` denied, staff claim `/claims/<id>` denied (no leak), provider API → 401 (member cookie ≠ key), no member REST API (`/api/member/*` → 404), and `/member/benefits?memberNumber=<other>` **ignored** (session-scoped, not param-driven). Dependents page shows only own coverage with an explicit "PRIVACY GUARDRAIL". No cross-member PII access.
- **Broker scope — ✅ PASS (resumed).** `broker@kaib.co.ke` sees **only its own book (Safaricom)**, not the other 6 groups; denied on all staff/admin/provider/member routes; own-group detail shows roster only (no clinical/claim detail). (Cross-broker foreign-group-detail IDOR not probed — needs a 2nd group ID; low risk given RSC scoping.)
- **HR / Fund / Reports — carried PASS** from the prior outpatient closure pass; not adversarially re-tested on this build (lower residual than member/broker, which are now cleared).
- **OBS-K1 (Low):** after ~10 rapid login cycles an IP login throttle tripped; rate-limited logins fail silently (no request, no error) — recommend visible "too many attempts" feedback. (Also: Chrome's login-submit degraded durably this session; the in-app browser + NextAuth `/api/auth/signout` were the reliable path.)

## Untested residual (risk — could hide further blockers; NOT cleared this pass)
- **Family K — mostly CLEARED:** provider, member (IDOR), and broker scope all PASS; N3 sibling-group Medium confirmed. Remaining: HR/Fund/Reports adversarial re-test on this build (prior-pass PASS), health-vault member-to-member document access (couldn't test — fresh member had no documents), and cross-broker foreign-group-detail IDOR. No privacy breach found — Family K is no longer a NO-GO risk on the surfaces tested.
- **Family C — offline capture / reconnect / exact-once assimilation** (entirely untested; the plan's primary new campaign).
- **Family D — HMS batch UI + case attribution** (only the API claim-write was exercised).
- **Family F/G — check-in binding, PA/LOU/case lifecycle races.**
- **Family J — membership/endorsement/effective-date hardening.**
- **Family I/O — settlement uncertainty, concurrent decisions, session/deployment resilience** (only SoD + supplementary run done).
- **Family N — worker/jobs/time** (fraud detection appears async — not exercised under worker pause).
- **Family R — quotation/binding, billing/admin-fee, bank recon, commission, member wallet callbacks, cross-border FX, compliance/DSAR, wellness/health-vault.**
- **Settlement-side fraud gate** (does a fraud-flagged claim actually pay through checker → Mark Paid?).

## Conditions that survive even if the Medium findings are fixed
- Scale (2,997 members claimed) not load-verified.
- Operator API channel intentionally disabled (no `API_KEY` set) — restoring it requires setting `API_KEY` + `OPERATOR_TENANT_ID` in Vercel and re-testing operator scope.
- Shared-client sibling-group modelling (prior N3) not re-probed live.

## Path to full GO
1. Fix the Mediums: API intake validation (reject negative/zero amounts — BB2-DEF-01; graceful 400 — BB2-DEF-02), API idempotency/dup-guard (BB2-DEF-03), reconcile the ceiling preview (OBS-B7), and make fraud/duplicate flags **block** approval+settlement until cleared (OBS-H1).
2. Clear the untested residual — prioritise **Family K privacy scope**, then **C offline**, **D HMS**, **J membership**, **I/O settlement concurrency**, **R portfolio ops**.
3. Re-run the entry gate + a settlement-side fraud probe on the fix build.

## Scope caveat
This pass re-verified all prior blockers + the money-spine controls + the full API security surface + cross-rail claim intake, and issued the CONDITIONAL verdict on that basis. It did **not** exercise the offline, HMS-UI, membership, privacy-scope, notification, import, worker-outage, or portfolio-operations families. Those are risks, not passes.
