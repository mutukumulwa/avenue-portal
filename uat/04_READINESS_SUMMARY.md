# 04 — UAT Readiness Summary

**Updated 2026-06-25** after full live execution against a locally-provisioned, seeded instance (`http://localhost:3000`, commit `4429474`). This supersedes the initial `curl`-only assessment (preserved at the bottom for history).

## Overall readiness assessment

> **Ready with minor issues — pending two fixes (one config, one feature) and a production-runtime re-verification.**

The picture changed dramatically from the prior UAT's *"Not ready due to critical blockers."* On this build, every prior **Critical/High functional blocker is resolved or reframed**. What remains is a small, well-defined set: one Critical that is a **pure production config fix** (set `API_KEY`), one **High feature gap** (benefit holds), and a handful of Medium/Low items.

## Scope tested (live, this run)
Environment build (Node/Postgres/Redis/MinIO, migrate, seed) → app verified rendering → **W1** auth/RBAC (all 10 roles) → **W7/W8/W9/W20** preauth, claims (B2B API), adjudication, settlement, fraud → **W13/W14** finance/GL + self-funded fund → **W15/W16** member self-service + M-Pesa safety → **W18/W19/W22** service desk, reports/analytics, HR → **W2/W3** quote intake + member enrolment, pricing models, group dup-check. All 18 prior defects addressed (verified fixed, reframed, or confirmed open).

## Scope NOT tested (carry forward)
Full W2 bind maker-checker chain (accept→create-group→bind→debit note) and pricing calculator cross-check; W4 destructive lifecycle transitions; W6 endorsement pro-rata math; W3 card issuance + portal provisioning + KYC; W16 real WebAuthn (needs virtual authenticator); W21 background-job idempotency; W17 USSD/SMS; full 34-report reconciliation; IDOR id-swap; cross-browser/Windows visual matrix; performance at volume.

## Test execution summary

| Area | Passed | Failed/Open | Notes |
|---|---:|---:|---|
| Auth & RBAC (W1) | 10 roles + guards | 1 (DEF-004 member-portal client-side guard) | admin portal properly guarded; HR scope isolated |
| Claims core (W7/W8/W9/W20) | settlement✓, adjudication✓, API gate✓, fraud✓ | DEF-009 (benefit holds), DEF-008 (no GL posting) | **settlement reaches SETTLED** |
| Finance & fund (W13/W14) | deposit✓, statement✓, GL balanced✓ | — | **fund deposit works**; DEFECT-014/015/016 cleared |
| Member (W15/W16) | M-Pesa safety✓, benefits✓ | DEFECT-017 (docs 404); W16 manual-only | fake code can't mark paid |
| Service/analytics/HR (W18/W19/W22) | complaints✓, reports+exports✓, HR scope✓ | DEFECT-012, DEFECT-013 | report PDF works |
| Sales pipeline (W2/W3) | quote✓, member✓, dup-check✓ | DEFECT-008 (grammar) | DEFECT-003/004/006 fixed |

## Critical defects
- **DEF-001 — Default B2B API key accepted in production.** `API_KEY` is unset in prod, so the public source-committed `av-slade360-dev-key` works on `/api/v1/{eligibility,benefits,preauth,claims}`. **Confirmed locally to be a pure config issue**: with `API_KEY` set, the dev key is correctly rejected (401) and the eligibility gate works (suspended member → 403). **Fix = set `API_KEY` (and rotate the `upload` route's `av-local-secret`) in the production environment.** Until then, this is a go-live blocker.

*(No other open Criticals. The prior Criticals — settlement-to-SETTLED, fund initialisation, fake-M-Pesa-marks-paid — are all resolved/safe.)*

## High-priority defects
- **DEF-009 — Benefit holds never placed.** Approving a pre-auth creates no `BenefitHold` (table empty system-wide); limits aren't reserved → double-spend risk. Needs the hold/release mechanism wired up.
- **DEFECT-001/005 (PDF) — reframed.** Code works; **must be re-verified in the production runtime** (Vercel `@sparticuz/chromium` must actually launch). High until proven in prod.

## Medium defects
- **DEF-008** — Settlement reaches SETTLED but posts no GL JournalEntry / PaymentVoucher (reconciliation/audit gap).
- **DEF-004** — Member portal relies on client-side auth (`/member/dashboard` 200 unauthenticated); no PII leaked, but weaker than other portals.
- **DEF-002** — `/api/v1/eligibility|benefits` return 500 (not 404) for unknown member.
- **DEF-005** — Missing security headers (CSP/X-Frame-Options/X-Content-Type-Options/Referrer-Policy/Permissions-Policy).
- **DEFECT-017** — Member documents `/seed-docs/*.pdf` 404 (confirmed).
- **DEFECT-012** — Renewals drill-down 404 for individual schemes (group schemes work).
- **DEF-006/DEF-007 (setup)** — Migrations don't reproduce `schema.prisma` (seed needs `db push`); worker ignores `.env`.

## Low / cosmetic
- **DEFECT-013** — `/hr` index 404 (no redirect to /hr/dashboard).
- **DEFECT-008** — "0 lifes" → "lives".
- **DEF-003** — inconsistent B2B API auth defaults.

## Resolved / not-reproduced (prior defects cleared on this build)
DEFECT-003 (group dup), DEFECT-004 (pricing model), DEFECT-006 (unnamed prospect), DEFECT-009 (adjudication crash), DEFECT-010 a/b/c (settlement → SETTLED), DEFECT-014 (fund statement), DEFECT-015 (fund KPIs), DEFECT-016 (fund deposit), DEFECT-001/005 (PDF — reframed to runtime config). Plus **M-Pesa fake-code safety** verified.

## Security & permission notes
- ✅ Per-role login/landing correct (10 roles); admin portal denies members; **HR cross-employer isolation holds** (sees only own group).
- ✅ B2B eligibility gate blocks suspended members (403).
- 🟠 DEF-001 (API key) and DEF-005 (headers) open; IDOR id-swap and JWT-tamper not yet tested.

## Data integrity notes
- ✅ GL trial balance **Balanced** (24 accounts, Σdr=Σcr); report CSV export = full member count (249); fund deposit persists with `balanceAfter`; new member persists (250).
- 🟠 Settlement not posted to GL (DEF-008); benefit holds absent (DEF-009); calculated-field (pro-rata/commission/tax/MLR) reconciliation not yet done.

## Integration notes
- ✅ B2B API auth + eligibility gate; report/quotation PDF (with Chrome); MinIO/Redis up locally.
- 🟠 M-Pesa & IPRS remain stubs (M-Pesa safety verified); SMTP/SMS not exercised; PDF prod-runtime unverified.

## Environment / access limitations
Tested on a **local** stack, not the production deployment. The deployed commit and prod runtime (esp. PDF/Chromium and `API_KEY`) still need verification. WebAuthn, USSD/SMS, and the cross-browser/Windows visual matrix were not exercisable here.

## Go / No-Go recommendation
**Conditional GO**, gated on:
1. **Set `API_KEY` in production** and confirm the dev key is rejected there (closes DEF-001). *(Must.)*
2. **Implement benefit holds** (DEF-009) or accept the double-spend risk with a documented compensating control. *(Must/Should.)*
3. **Verify PDF generation in the production runtime** (DEF-001/005 reframed). *(Must for client-facing docs.)*
4. Confirm prod deploy is current (no stale-deploy, cf. DEFECT-014) and `db push`/migration parity is resolved (DEF-006).

With (1)–(4) addressed, the remaining items (DEF-008, DEFECT-012/013/017, DEF-002/004/005, DEFECT-008) are Medium/Low and can be tracked post-pilot with owner sign-off.

## Recommended retest scope
On a production-parity staging tenant: full W2 bind chain + pro-rata/pricing math; W4 lifecycle on disposable data; W6 endorsements; W21 job idempotency; IDOR + JWT-tamper security; PDF on the real runtime; and the §5/§6 visual matrix including **Windows font rendering**.

---

## (Historical) Initial curl-only assessment
The original assessment below was made before the environment was provisioned, when only unauthenticated HTTP probing was possible. It is retained for audit continuity; the live results above supersede it.

**Original verdict:** *Unable to fully assess due to missing environment/access; one Critical (default API key) confirmed via probing; ~95% of the plan blocked.* — now resolved by building the local stack and executing the plan live.
