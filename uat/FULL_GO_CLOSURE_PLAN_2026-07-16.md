# FULL GO CLOSURE PLAN — 2026-07-16

**Objective:** take the platform from **CONDITIONAL GO** (Comprehensive UAT 2026-07-15) to **FULL GO**,
with exactly **one accepted residual: the temporary hosting environment** (Vercel + Supabase eu-central-1,
pending the in-country Raxio migration per `docs/INFRA_BOM_AND_12MO_COST_PROJECTION.md`). Everything else
— code, config, data, process — closes or gets an explicit signed acceptance.

**Verdict inputs reconciled by this plan:**

| Engagement | Date | Verdict | Status |
|---|---|---|---|
| Comprehensive UAT (`uat/comprehensive_2026-07-15/`) | 2026-07-15 | **CONDITIONAL GO** — spine S1/S2/S4 strong, S3 partial, 16 observations, untested residual | standing |
| **Inpatient E2E** (`uat/inpatient_vercel/`) | 2026-07-07 | **NO-GO** — Critical IP-DEF-06 + 3 High + config blocker | **never remediated, never re-run** (predates BD/BB2/fork-A/fork-B fixes) |
| Data purge + clean reseed | 2026-07-16 | — | N3 closed structurally; NWSC (2,750) + Pearl/Kyoga (14) clean book; fund ties exactly (500,000,000 − 1,496,500 = 498,503,500); fraud gate ENFORCED; seed.ts Medvex-clean (`7fa1b77`) |

**Prod ground truth (queried live 2026-07-16):** 1 tenant (medvex) · 2 clients (nwsc, pearl-health) —
**no `default`-slug client** · 2,764 members · 2,764 coverage periods · 30 claims · 84 fraud-alert rows ·
4 provider API keys · **1 underwriter** · **0 Role rows** (tenant metadata INCOMPLETE) · **0 WebAuthn
credentials** · 0 drug exclusions · CLM-2026-00302 (negative-billed artifact) still present, status RECEIVED.

---

## 1. The gap decomposition — what stands between CONDITIONAL GO and FULL GO

**Three load-bearing discoveries this review adds to the known register:**

1. **The inpatient NO-GO is unresolved.** No commit references any IP-DEF; the register has no re-test
   column filled. IP-DEF-06 (member annual benefit sub-limit not enforced at claim decision) is confirmed
   still in code — `TPA_PRIORITY_SIX_EXECUTION_PLAN.md` P1 "confirmed gaps" documents that
   `ClaimDecisionService.decide` never compares approval amount to available benefit, and
   `BenefitUsageService.recordUsage` floors at zero instead of rejecting. This is not inpatient-only:
   **outpatient benefit exhaustion is equally unenforced** (proven broken inpatient 07-07; never proven
   either way outpatient — Family C07/C08 untested).
2. **The async job layer is dormant in prod.** All background jobs (membership activation, lapse
   detection, preauth/approval escalation, fund-balance alerts, quotation expiry, admin-fee accrual,
   fraud scan, analytics refresh, offline packs) run through a BullMQ worker (`src/server/jobs/worker.ts`)
   that has no home on Vercel — there is no `vercel.json`, no crons, and CU-OBS-6 (analytics never ran)
   is a symptom, not the disease. Anything the product promises "happens automatically" currently doesn't.
3. **The purge left a landmine:** `resolveSchemeClientId` (`src/server/services/clientResolve.ts:21`)
   throws when no `default`-slug client exists. Call sites: group creation (`groups.service.ts`),
   **quote→bind** (`binding.service.ts`, `quotations/[id]/actions.ts`), individual scheme creation.
   Those flows are **broken in prod right now**. (Also explains why V6 below is mandatory.)

Everything else is enumerable: 14 open observations (CU-OBS-2/3/4/7/8/11/12/13/14/15/16 + OBS-IP-*),
inpatient High/Medium defects, the untested-risk residual, data hygiene, ops config, and the business
preconditions for a real (non-synthetic) launch.

---

## 2. Workstream 1 — CODE (owner: Claude, approvals: Arthur)

Protocol: unchanged from `FULL_GO_EXECUTION_PLAN.md` §1 (read AGENTS.md / Next docs first; canonical
services only; `npm run typecheck` + `npx vitest run` + brand/currency guards green before every commit;
one commit per WP; additive-only schema via `prisma db push` until DEC-20 lands).

### WP-1 — Benefit-limit availability gate (fixes IP-DEF-06 Critical; the anchor)
> **✅ EXECUTED 2026-07-16** — P1.0–P1.6 complete (commits `c01a1f4`, `65a7452`, `07ca32d`, `4fbb973`,
> `99603d4` + P1.6). Concurrency proven 3/3 on a real Postgres (one balance, two approvals, exactly one
> commits). Result notes + two carried findings (missing appeal resolution; pre-existing co-contribution
> Decimal RSC crash): `uat/priority-six/P1_IMPLEMENTATION_LOG.md`. Remaining for the P1 DoD: the live
> inpatient re-run (V2/V3).

Execute `TPA_PRIORITY_SIX_EXECUTION_PLAN.md` **P1.0–P1.6 as written** (it is implementation-ready):
one availability result from `BenefitUsageService`; atomic hold placement; atomic claim consumption
(reject `BENEFIT_LIMIT_EXCEEDED`, never floor-at-zero); FAMILY shared-limit pools in `remainingAfter`;
reversal idempotency; offline reconciliation resolves the submitted category. Acceptance = P1 stories
A–D as automated tests + live V3 below. **Blocked on DEC-02..06** (safe defaults are pre-recorded in
the plan §"P1 decisions"; confirming defaults unblocks same-day).

### WP-2 — Inpatient High fixes
> **✅ DONE 2026-07-17** (`4f727d7`, `4fc74ec`): IP-DEF-01 root = phantom `reviewNotes` column behind an
> `as never` cast → additive column + cast removed + `safeActionError` on the action (no more schema
> dump); IP-DEF-02 = entry dates bounded to [admission, discharge] and never future. Both REAL-DB-proven
> on a throwaway pg + UI-verified. IP-DEF-03 = VERIFIED-BY-SUBSEQUENT-RUNS (every live settlement since
> BD-03's fix; explicit re-check stays on V2).
- **IP-DEF-01:** PA-approval reviewer notes crash + raw Prisma error/schema leak to browser. Fix the
  write; add a global "no raw DB errors to client" guard on that route family.
- **IP-DEF-02:** future-dated / post-discharge `CaseServiceEntry` accepted and accrues billable. Reject
  service dates outside admission window (and > now) at entry creation, server-side.
- **IP-DEF-03:** settlement/approval POSTs intermittently 503 (mutation lands). Likely already fixed by
  the BD-03 route-handler remediation (2026-07-08) — **re-verify first** on current build; fix only if
  it reproduces.

### WP-3 — Inpatient Mediums
> **✅ DONE 2026-07-17** (`4fc74ec`, `b3ac3af`): IP-DEF-04 = same-date bed-day overlap → case-timeline
> warning at entry + HIGH "Overlapping Bed-Day Charges" fraud alert on the filed claim (gate blocks until
> OPS/fraud/medical clears — the authorised-override shape). IP-DEF-05 crash = VERIFIED-EXISTING (FG-C3/C4
> envelope validation); route hardened (validation→400, infra→500 generic). IP-GAP-HMS = provider page now
> spells out the accepted batch identity. REAL-DB-proven + UI-verified.
- **IP-DEF-04:** same-date ward + ICU bed-day both price payable — add an overlap guard (flag or block
  per DEC-01 scope decision; recommend hard-flag to adjudicator, PAY override to allow).
- **IP-DEF-05 + IP-GAP-HMS:** HMS batch missing `facilityCode` crashes unhandled → return 400 with
  field error; surface each facility's `facilityCode`/API identity in the provider settings UI.

### WP-4 — Default-client fallback restoration + regression guard
Ops restores the empty default client via Re-provision (H7). Code side: add a regression test that
group-creation/bind works against a zero-scheme default client, and a fail-loud startup/health check
(see WP-6 health endpoint) that reports a missing default client instead of failing at bind time.
Optional (DEC-14b): make bind require an explicit client and retire the fallback.

### WP-5 — Approval-matrix capacity guard (IP-OBS-DUAL)
Config-time + decision-time guard: if a matrix rule requires N distinct approvers of role R and fewer
than N **active** users hold R, warn on the settings page and surface a clear operator error on the
approval path (today it deadlocks silently). Ops pair: H4 provisions a real second underwriter.

### WP-6 — Small-defect sweep (all Low/cosmetic, all real; ~1 day bundled)
| Item | Fix |
|---|---|
| CU-OBS-2 | clear stale intake-rejection banner on wizard Back/Next |
| CU-OBS-3 | Mark-Paid stale-retry message names the real state ("batch already settled") |
| CU-OBS-4 | branded 404 + NextAuth signout pages |
| CU-OBS-7 | unknown report slug → 404, not an empty report shell |
| CU-OBS-8 | after-hours fraud rule uses the service/visit time in Africa/Kampala, not server-TZ created-at |
| CU-OBS-11 | single audit row per approval; unify "CLAIM"/"CLAIMS" module labels |
| CU-OBS-12 | uncoded line: hide PAY_ABOVE_CONTRACT_RATE override or explain the no-op inline |
| CU-OBS-14 | member Benefits page shows available = limit − used − **active holds**; persist the PA reason field |
| OBS-IP-1 | benefit panel shows one limit basis pre/post approval |
| OBS-IP-CUR | inpatient episode currency labels consistent (UGX tenant) |
| OBS-IP-PA-HOLD | release residual PA hold when its episode/case closes (fold into WP-1 conversion logic) |
| new | **`/api/health`** endpoint (DB ping + default-client presence + version) — none exists today; needed for uptime monitoring |

### WP-7 — Background-job layer in production (blocked on DEC-08)
> **✅ CODE + PACK DONE 2026-07-17** (`ff72ee1`): Dockerfile.worker + Railway/Fly configs +
> `.env.worker.example` + `docs/WORKER_DEPLOYMENT.md`; WorkerHeartbeat row surfaced as
> `workerFresh` on `/api/health` (dormancy now monitorable). LOCAL PROOF: clean boot, 0 schedule
> failures, heartbeats, analytics job populates facts (CU-OBS-6 locally). **Remaining = Arthur's
> ~15-min provisioning step (Upstash + Railway/Fly per the runbook) → `workerFresh:true` on prod.**
Recommended: a small always-on worker (Railway/Fly/Render) running `npm run worker` against Supabase +
Upstash Redis, with `validateWorkerConfig` env set; alternative: convert scheduling to Vercel crons
hitting job routes. Acceptance: analytics facts populate (closes CU-OBS-6), membership-activation and
lapse jobs observably run, fund-balance alert fires on a test threshold. Stopgap available today:
admin-triggered `refreshFoundation` mutation for analytics only.

### WP-8 — 2FA enforcement for privileged staff (CU-OBS-15, blocked on DEC-09)
> **✅ DONE 2026-07-17** (`33c9255`): TOTP compulsory for SUPER_ADMIN / FINANCE_OFFICER /
> UNDERWRITER — grace login confined to Settings → Security until enrolment (deadlock-proof
> exemptions on the enrolment surface only), flag self-heals ~15s after enrolment via the R25
> session lookup, disable server-refused for enforced roles. +8 tests. NOTE for H3/DEC-10: every
> newly created privileged user will be forced through enrolment at first login.
>
> **AMENDED 2026-07-17 (Arthur): enforcement env-gated for the test phase.** Shared UAT personas
> hold privileged roles and testers can't enrol authenticators, so the gate is OFF unless
> `REQUIRE_PRIVILEGED_2FA=true`. **Added to the H8 go-live env checklist: set it in Vercel at
> cutover** (alongside PLATFORM_TENANT_SLUG etc.). The mechanism itself is built, tested, and
> verified — flipping the flag is the entire activation.
Tenant policy: TOTP mandatory for selected roles at login (recommend SUPER_ADMIN, FINANCE_OFFICER,
UNDERWRITER minimum). Enrolment grace flow for existing users.

---

## 3. Workstream 2 — LIVE VERIFICATION (owner: Claude via `/uat` skill, on the fixed build)

The Pearl/Kyoga demo client is the designated **sacrificial book** — races and destructive probes run
there, ending the "not re-raced to avoid foreign-record mutations" caveat.

| # | Campaign | Closes |
|---|---|---|
| V1 | One fresh **coded** outpatient claim through the FULL chain: intake→capture→adjudicate→approve→settle→PAID→balanced GL→provider statement | S3 "partial" |
| V2 | Inpatient long-stay spine re-run on fixed build (PA→GOP→case→LOU→accrual→claim→dual approval→settle→GL tie-out) incl. IP-DEF-01/02/03 re-tests | inpatient NO-GO conditions 1–2 |
| V3 | Benefit-limit adversarial pack: exhausted-member hard block; explicit partial-to-availability; family-pool block; **concurrent double-spend race** (P1-A, two API claims); PA-hold conversion no-double-count; reversal idempotency | IP-DEF-06 / WP-1 acceptance |
| V4 | Individual live races FG-C6 / C8 / C9 / C10 / C11 on Kyoga records (parallel API/UI double-fire per transition) | "credited, not driven" residual (DEC-23) |
| V5 | **Family-F member check-in E2E with a real passkey** (0 credentials exist today): enrol on a real device, provider-side check-in, then replay / one-time / facility-bound negative probes | WebAuthn-blocked residual |
| V6 | Quote→bind→enrol→claim→settle full lifecycle (after WP-4/H7) incl. census-integrity gate | bind chain + clientResolve landmine |
| V7 | Case open→close→exactly-one-claim (inside V2) | cases residual |
| V8 | Breadth sweep: HR roster add/import, broker quote create→submit, fund statement export, provider onboarding M17, cross-border/complaints/service-requests, notifications/terminology/pricing-models render | untested renders |
| V9 | Reports: **PDF export** verified; tie-out sample across remaining reportTypes; **conservation M26** formal tie-out (account already ties: 500,000,000 − 1,496,500 = 498,503,500) + GL cross-check | reports/conservation residual |
| V10 | Analytics populated post-refresh; spot-verify MLR/encounter facts against raw tables | CU-OBS-6 |
| V11 | Load at NWSC scale per DEC-21 (recommend: Supabase branch + preview deploy, NOT prod; e.g. 20 concurrent staff sessions + 5 rps API intake × 10 min; p95 < 1.5 s, 0 5xx) | scale residual |
| V12 | Final re-verify gate (D-1..13 style: auth 401s, fraud gate ON, ceilings, spine smoke, scope checks, report KPIs) → **issue the updated GO/NO-GO** | verdict |

CU-OBS-13 (can SUPER_ADMIN satisfy an UNDERWRITER-required approval level?) gets a targeted probe inside
V2/V4 — if it bypasses, it escalates to a WS-1 fix before verdict.

---

## 4. Workstream 3 — DATA & OPS HYGIENE (owner: Arthur + Claude; Medvex inputs where marked)

| # | Item | Notes |
|---|---|---|
| H1 | Void CLM-2026-00302 (−5,000 artifact, RECEIVED) via UI with audit reason | BB2-DEF-01 residue |
| H2 | Investigate the **84 fraud-alert rows vs 30 claims** (likely orphans referencing purged claims); clear stale alerts — the gate is ENFORCED, so the live queue must start clean | new |
| H3 | Retire/rotate **15 UAT-style logins** (test.local / busyday / broker@kaib.co.ke; 2 purged-* already retired) + kill the shared `MedvexAdmin2024!` convention on @medvex.co.ug accounts; create named real users with forced first-login reset | needs DEC-10 list |
| H4 | Provision a **second underwriter** (real person) | pairs WP-5 |
| H5 | Rotate all 4 provider API keys + the operator `API_KEY`; deliver via a secure channel to key custodians | needs DEC-13 |
| H6 | Populate drug exclusions per client/package, or record explicit "launch empty" acceptance | needs DEC-12 |
| H7 | Set `PLATFORM_TENANT_SLUG=medvex` in Vercel, then **Re-provision the Medvex tenant** — seeds Role rows (clears INCOMPLETE/CU-OBS-9) and recreates the **empty** default client (fixes the clientResolve landmine; provisioning is create-if-missing/upsert, never mutates existing data — verified in `tenant-provisioning.service.ts`) | do BEFORE V6 |
| H8 | Vercel env audit (Arthur, dashboard): `API_KEY`, `OPERATOR_TENANT_ID=cmr3ae8v30000nlvqxrqlfn38`, `PLATFORM_TENANT_SLUG`, `NEXTAUTH_URL/SECRET`, email/SMS provider keys, `REDIS_URL` (if DEC-08 = worker) | screenshot evidence into `uat/` |
| H9 | Email/SMS transport live: sender identity + SPF/DKIM; verify invite + member notification delivery end-to-end | needs DEC-18/DEC-25 |
| H10 | Supabase **PITR/backup** enabled + one **restore drill** to a branch DB with evidence | needs DEC-19 |
| H11 | **Migration baseline**: `prisma migrate diff` → init migration; adopt `migrate deploy` from then on (protects data continuity incl. the eventual Raxio move) | needs DEC-20 |
| H12 | Custom domain + TLS + `NEXTAUTH_URL` update | needs DEC-18 |
| H13 | Monitoring: uptime probe on the new `/api/health`; 5xx alerting (Sentry or Vercel); alert recipients configured | needs DEC-08/22 |
| H14 | **Repo hygiene (do first, today):** delete the 4 byte-identical iCloud " 2" duplicate files; commit all untracked UAT deliverables (`uat/comprehensive_2026-07-15/`, `uat/inpatient_vercel/`, outpatient docs) + `facilities/` + `members/` tooling + the 3 root docs; fast-forward the stale **local** `main` ref (origin/main is already current at `7fa1b77` — prod builds from it, verified READY) and push `fix/full-go-fork-b` (13 ahead of its remote) or retire it | + DEC-24 (move repo off iCloud — the stale refs + " 2" dupes this session are iCloud artifacts) |

---

## 5. Workstream 4 — BUSINESS / LAUNCH PRECONDITIONS (owner: Medvex, facilitated by Arthur)

| # | Item |
|---|---|
| B1 | Launch scope: inpatient in/out at NWSC go-live (DEC-01) — determines whether WP-2/3 + V2/V3 gate launch or are fast-follow behind a config gate |
| B2 | **Real NWSC member roster** (the 2,750 in prod are synthetic): delivery in the `members/onboarding/` crosswalk format; cutover = reviewed purge-and-reload script (precedent: `b0fdcc9`); named data-quality signatory (DEC-15) |
| B3 | Benefit/scheme config certification against the signed NWSC contract (tiers, limits, copays, waiting periods, exclusions) — also feeds WP-1 semantics (DEC-07) |
| B4 | Launch provider network: contracts FULLY_EXECUTED, fee schedules verified, per-facility keys issued (DEC-13) |
| B5 | Pearl/Kyoga demo client disposition post-launch (DEC-14) |
| B6 | **DPPA pack**: registration as collector/processor, DPA with NWSC, privacy notice in the portal, breach runbook, and **NWSC's written acceptance of interim out-of-country hosting** — turns the one stomached gap into a signed, bounded acceptance (DEC-17) |
| B7 | Real opening fund balance + bank-reconciliation owner (current 500M deposit is a seeded ops figure) (DEC-16) |
| B8 | Go-live governance: date, hypercare window, rollback criteria (DB snapshot + previous deployment pin), support rota, training for Medvex staff / NWSC HR / providers (DEC-22) |
| B9 | Fraud-queue operating model: who clears alerts (OPS/fraud/medical), at what SLA — the gate now blocks approvals (DEC-11) |

---

## 6. Sequencing & timeline

```
Day 0 (today)      H14 repo hygiene/commit deliverables · decisions batch sent to Medvex
Day 0–1            H7/H8 env + re-provision · H1/H2 data hygiene · WP-6 sweep + /api/health
Day 1–4            WP-1 (P1.0–P1.6) · WP-2/3 in parallel · WP-4/5 · WP-8   [needs DEC-01..09]
Day 4              Deploy fix build · H3/H4/H5 personas + keys
Day 4–7            V1–V10 verification campaigns · WP-7 worker live · V11 load on branch env
Medvex clock       B2/B3/B6/B7 (roster, config cert, DPPA, float) — can run fully in parallel
Final              Cutover rehearsal (synthetic→real roster on a branch DB) · V12 re-verify gate
                   → updated GO/NO-GO: target FULL GO (sole residual: temporary environment, signed)
```

Engineering-effort estimate: **WP-1 is 2–3 focused days** (plan is implementation-ready; machinery
exists); WP-2..6/8 ≈ 2 days bundled; verification ≈ 2–3 days. Wall-clock to verdict ≈ **1.5–2 weeks**,
gated almost entirely by decision turnaround and Medvex deliverables (roster, DPPA, float).

---

## 7. DECISION REGISTER (answers unblock the plan — reply by ID)

**A = Arthur alone · M = Medvex team · J = joint.** Recommended defaults are pre-loaded; a bare
"proceed with defaults" answer is sufficient for any item marked ⭐.

> **2026-07-16 — Arthur accepted ALL ⭐ defaults** (DEC-02..06, 08, 09, 14, 19, 20, 21, 23, 24). They are
> now recorded decisions and execution proceeds on them; directors may still override at the review
> meeting (any override reopens the affected work package). Non-starred items remain OPEN — presented to
> the directors in `uat/FULL_GO_DECISIONS_FOR_DIRECTORS_2026-07-16.docx`.

| ID | Who | Decision | Recommendation |
|----|-----|----------|----------------|
| DEC-01 | J | **Launch scope:** outpatient-only vs outpatient+inpatient at NWSC go-live | If dates slip: outpatient-first with inpatient intake config-gated; inpatient fast-follows after V2/V3 pass. If no pressure: fix-then-launch both |
| DEC-02 | M ⭐ | Benefit utilization consumes covered/approved amount or payer share only | keep current `approvedAmount` basis |
| DEC-03 | M ⭐ | Is `Package.annualLimit` a hard overall ceiling above category sublimits | yes when populated |
| DEC-04 | M ⭐ | Over-limit approval behavior | **hard-block + offer explicit partial equal to availability; never silently cap** |
| DEC-05 | M ⭐ | Dependants draw from a FAMILY pool rooted at the principal | yes where `SharedLimitGroup.appliesTo=FAMILY` |
| DEC-06 | M ⭐ | Orphaned-dependant family-limit handling | fail closed + data-quality exception |
| DEC-07 | M | Who at Medvex certifies benefit config == signed NWSC contract | name a person |
| DEC-08 | A ⭐ | Worker hosting for background jobs | small always-on worker (Railway/Fly) + Upstash Redis |
| DEC-09 | J ⭐ | 2FA enforcement scope at go-live | mandatory: SUPER_ADMIN, FINANCE_OFFICER, UNDERWRITER |
| DEC-10 | M | Named production users + roles (must yield ≥2 underwriters, ≥2 finance for SoD); approve retiring 15 UAT logins + shared-password convention | provide list |
| DEC-11 | M | Fraud-alert clearing ownership + SLA (gate is ON) | name owner + e.g. 24h SLA |
| DEC-12 | M | Drug-exclusion list at launch | provide list, or sign "launch empty" |
| DEC-13 | M | Launch provider list + API-key custodians + secure delivery channel | provide |
| DEC-14 | J ⭐ | Pearl/Kyoga demo client post-launch | keep as flagged demo/training sandbox (it's the race-test book) |
| DEC-15 | M | Real NWSC roster: delivery date, format owner, data-quality signatory; approve synthetic-member purge at cutover | provide |
| DEC-16 | M | Real opening fund float + bank-rec owner (500M is seeded) | provide figure + owner |
| DEC-17 | M | DPPA pack incl. **written NWSC acceptance of interim out-of-country hosting** | required before real PII loads |
| DEC-18 | A | Custom domain + email sender identity (e.g. portal.medvex.co.ug / claims@medvex.co.ug) | choose names |
| DEC-19 | A ⭐ | Supabase backup tier + PITR + restore drill | enable PITR; drill to branch DB |
| DEC-20 | A ⭐ | Adopt Prisma migration baseline now (vs stay db-push until Raxio) | adopt now |
| DEC-21 | J ⭐ | Load-test targets + environment | branch DB + preview deploy; 20 concurrent staff + 5 rps intake × 10 min; p95<1.5s |
| DEC-22 | J | Go-live date, hypercare window, rollback criteria, support rota | propose at decision meeting |
| DEC-23 | A ⭐ | FG-C6/8/9/11 races: live-verify on Kyoga demo vs accept engineering credit | live-verify (cheap now that a sacrificial book exists) |
| DEC-24 | A ⭐ | Move working repo off iCloud Drive (source: byte-identical " 2" dupes + stale git status this session) | yes — GitHub canonical, local clone outside iCloud |
| DEC-25 | M | Member notification channel for claim/PA decisions (email/SMS) | choose channel; pairs H9 |
| DEC-26 | M | **Uganda statutory levies:** the tax model is still Kenyan (`TaxType: STAMP_DUTY (IRA) / TRAINING_LEVY (AKI) / PHCF`) — specify Uganda's equivalents so `ComplianceLevyComputation` + the levies report compute the right obligations | Medvex compliance to specify; deliberately not guessed |

---

## 8. Definition of FULL GO (the exit test)

All of: WP-1..8 deployed and green · V1–V12 executed with **no open Critical/High and no unexplained
Medium** · H1–H14 evidenced · B-items delivered or explicitly signed as accepted · one residual recorded:
*temporary environment, accepted in writing by Medvex/NWSC (DEC-17)*. Verdict issued as an update to
`uat/comprehensive_2026-07-15/GO_NO_GO_READINESS.md` with this plan as the closure evidence trail.
