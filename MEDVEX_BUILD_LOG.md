# Medvex TPA (Uganda) — Build Log

**Purpose:** Durable, resumable progress tracker for executing
`MEDVEX_TPA_UGANDA_GAP_ANALYSIS_AND_PLAN.md`. If a session is interrupted
(resources run out), the next session reads **§1 RESUME HERE** first and
continues with zero re-derivation. Keep this file updated after every
meaningful step. Newest status at the top of each section.

---

## §1. RESUME HERE  ⟵ read this first

- **Branch:** `medvex-phase-0` (off `main`).
- **Commits so far (newest last):**
  - `e9638fc` rebrand checkpoint (D-1…D-6, the 78-file uncommitted sweep).
  - `fe125bb` D-7 token-name rename `avenue-*` → `brand-*` (~3,760 usages).
  - `951eb10` D-8 part: en-KE→en-UG, UGANDA_DISTRICTS, brand-string sweep.
  - `bfca4a8` D-10 brand guard (script + prebuild + GitHub Action).
  - `45dfe5f` D-9 Medvex style guide + GEMINI scrub + test fixture.
- **Env verified:** Postgres up at `localhost:5432/aicare`; all 23 Prisma
  migrations applied; schema clean. `npm` (node v26). Scripts: `db:migrate`,
  `db:push`, `db:generate`, `db:seed`, `typecheck`, `build`, `worker`,
  `brand:guard`. Vitest works (`npx vitest run <file>`).
- **NOTE:** `AGENTS.md` says read `node_modules/next/dist/docs/` before coding,
  but that dir is **absent** in this install. Verify Next behaviour empirically.
- **⚠️ SCHEMA WORKFLOW = `db push`, NOT migrations.** The 23 dirs in
  `prisma/migrations/` are historical; recent models (provider contracts, the
  rebrand Tenant defaults) were applied via `prisma db push`. `migrate dev`
  detects drift and wants to **reset** (data loss) — do NOT run it. To apply a
  schema change: `npx prisma db push` (additive = non-destructive) then run any
  data backfill separately via `npx prisma db execute --file <sql> --schema prisma/schema.prisma`.
  (Tech-debt: migrations history should eventually be re-baselined to the DB.)

### Current status (2026-07-02 session — wire-in + consoles phase COMPLETE)
> **The entire "layer on top of the engines" is now built, wired, and
> in-browser-verified.** Suite 229/229; typecheck + brand guard green. This
> session closed every documented follow-up from the previous status block.
>
> **Adjudication wire-ins DONE** (commit before consoles):
> - G9.1 cost-share — `CostShareResolver` (cost-share.service.ts) resolves
>   BenefitConfig (coInsurancePct/deductibleAmount/copayPercentage) for the
>   member's package + enrollment-anniversary period, computes the split,
>   persists running `BenefitUsage.deductibleMet`. Wired into BOTH
>   `ClaimsService.adjudicateClaim` (replaced hard-coded 10% copay) and
>   `claimAdjudicationService.approveClaim` (Process 9).
> - G9.5 drug exclusions — `DrugExclusionService.applyToClaim` declines
>   excluded-drug lines at intake (client/package-scoped, idempotent).
> - G3.7 execution — `AutoAdjudicationService.processIntake` (exclusions →
>   evaluate → execute). AUTO_APPROVE runs the real approval via
>   `ClaimsService.adjudicateClaim`; ROUTE persists `Claim.autoAdj*` provenance
>   + a ROUTED adjudication log. Reimbursements always route. Fail-safe: any
>   pipeline error routes, never loses the claim. Wired into both claim-submit
>   server actions AND the offline `sync.service` reconcile (added fraud eval
>   there too).
> - `system-actor.service.ts` — per-tenant deactivated service User for
>   unattended writes (offline sync, jobs); fixed a latent FK bug in
>   membership-activation.job (actorId "system" had no matching User row).
> - Schema (db push, additive): `Claim.autoAdjDecision/autoAdjFailingGate/
>   autoAdjPolicyId/autoAdjudicatedAt`, `Claim.costShareDeductible/
>   costShareCoInsurance`, `BenefitUsage.deductibleMet`.
>
> **G5.10 call-site swap DONE:** reimbursement verification → MobileMoneyService
> (AUTO MSISDN detection); member-payment rail on Uganda MSISDNs (+2567…),
> provider-aware notifications, UGX copy in wallet UI. mpesa* DB columns kept
> (cosmetic rename deferred, same as iprs*).
>
> **Jobs DONE:** `AdminFeeService.accrueRecurringForPeriod` (PMPM/FLAT/
> PCT_OF_CLAIMS, idempotent per agreement+period) via daily admin-fee-accrual
> job (03:30 EAT, billing queue); `FraudEngineService.scanRecentClaims`
> (config-driven UPCODING/HIGH_FREQUENCY/IDENTITY_SHARING/PHANTOM_BILLING) via
> 6-hourly fraud-scan job. Both registered in queue.ts + worker.ts.
>
> **Admin consoles DONE (all in-browser verified):**
> - `/settings/auto-adjudication` — policy editor (never-delete supersede) +
>   recent-decisions view. Verified: new 500k policy superseded seeded 100k.
> - `/settings/drug-exclusions` — client/package-scoped exclusion editor.
> - `/fraud/rules` — configurable rule editor (code/scope/weight/JSON config)
>   + enable/disable. `/fraud/investigations` — open→assign→resolve workflow;
>   alert desk gained a one-click "open investigation" action.
> - `/billing/admin-fees` — agreement editor + ledger + "Run accrual now" +
>   "Invoice accrued". Verified: PMPM 5,000 × 248 members = 1,240,000 UGX.
> - `/compliance` — obligation traffic-lights, director residency majority,
>   licence/director capture, IRA levy compute. Verified: 1,240,000 × 0.5% =
>   6,200 UGX.
> - `/compliance/privacy` — DSR intake (30-day SLA), processor register, breach
>   workflow (72h clock). Verified: processor registered.
> - Sidebar: Setup (auto-adj, drug-exclusions), Fraud (investigations, rules),
>   Finance (admin fees), new Compliance group.
>
> ### Next concrete step (what actually remains)
> Everything left is **externally-gated integrations or Phase 4-5 depth** — no
> more "wire the built engine into the UI" work. Candidates, roughly by
> buildability without external creds:
> - **G5.15 cross-border** (Phase 4-5): model + service for cross-border claims/
>   settlement (partially seeded via AdminFeeMethod.CROSS_BORDER). Buildable.
> - **NIRA / MoMo / Airtel provider APIs**: adapters are stubs returning
>   `verified:false`; real calls need `NIRA_*` / `MOMO_*` / `AIRTEL_*` creds +
>   sandbox provisioning (external). Leave as stubs.
> - **SMS aggregator P-03**: USSD/SMS claim channels need an aggregator account
>   (external). `ussd.service`/`sms-query.service` exist as scaffolds.
> - **FHIR / EDI (G8)**: clinical/claims interchange — large, needs partner
>   specs (external).
> - **HA/DR + ops docs** (Phase 5): documentation deliverables, no code.
> - Optional polish: rename mpesa*/iprs* DB columns (cosmetic), re-baseline
>   Prisma migrations to the DB (tech-debt noted below).

### Current status (previous session)
> **Phases 1-3 core substantially COMPLETE across the plan.** All of: Rebrand §D,
> G1.1 (compliance register), G1.2 (DPPA), G2.1, G2.3 (admin-fee), G2.4, G3.1,
> G3.3, G3.4, G3.5 (full FX), G3.7, G4 (flow+balance), G5.2, G5.4, G5.5, G5.6,
> G5.7, G5.8 (finance), G5.9, G5.10 (MoMo/Airtel), G5.11 (fraud engine), G9.1,
> G9.5, G9.6, Security 5/5 — data models + service/decision engines done & tested.
> Suite 208/208; typecheck + brand guard green.
> **Remaining = mostly UI/wire-ins/jobs on top of the built engines** (admin
> editors, compliance/DSR/fraud consoles, accrual + anomaly jobs, member-payment
> call-site swap, auto-adj execution, cost-share/drug-exclusion adjudication
> wiring) + external-gated integrations (NIRA/MoMo APIs, SMS aggregator P-03,
> FHIR/EDI). Then Phase 4-5 depth (G5.15 cross-border, G8 integrations, HA/DR docs).

### ⚠️ Dev DB note
The local dev DB holds **pre-rebrand data** (tenant "Avenue Healthcare", slug
`avenue`, users `@avenue.co.ke`) — the Medvex seed was never run on it. My
backfill still correctly created a default Client for it. For verification I set
**admin@avenue.co.ke password = `Verify123!`** (original hash unknown). A test
client "Jubilee Insurance Uganda" was created during verification (harmless demo
row). **Consider `npm run db:seed` to refresh to Medvex data** (now includes the
default Client via slice 1b) — but that's destructive; do it deliberately.

### Next concrete step  →  finish **security hardening** (2 remaining, auth hot-path)
Done: password policy (R28) `0c572fb`, auth banner (R32) `0c572fb`, password
reset (R24) `4a168a7`. Remaining — **modify `src/lib/auth.ts` authorize/jwt/
session callbacks; VERIFY LOGIN IN-BROWSER after each (high blast radius):**
- **Single-session (R25/H-03):** add `User.sessionVersion Int @default(0)`;
  `authorize` increments it and returns it → jwt stores it; jwt/session callback
  compares token vs DB version (bound DB cost with a short in-memory cache),
  invalidating stale sessions. **Fail-open on DB error (never lock users out).**
- **2FA/TOTP (R81/H-01):** add `User.totpSecret`/`totpEnabled`; hand-roll RFC-6238
  TOTP with node `crypto` (no otplib/speakeasy installed); enrolment page (QR via
  a lib-free otpauth:// URI + manual secret) + verify step at login. Largest item.
Dev-login note: seeded users are pre-rebrand `@avenue.co.ke`; admin password was
set to `Verify123!` for verification.

Then: G4 Phase-1 end-to-end, or wire remaining G3.1 action paths.

#### G4 offline-first scaffold (DONE — reference)
Sequence chosen by user: G3.1 → **G4** → security hardening. G4 is XL; scaffold
now (Phase-0), full end-to-end later (Phase-1). Planned scaffold slices:
- **Slice 1 — data model:** `SyncOperation` (clientUuid, opKey idempotency,
  entityType, payload, deviceId, capturedAt, syncedAt, state
  pending|synced|conflict|rejected, conflictReason), plus `OfflineReservation`
  (soft hold) + provenance for cached eligibility/balances. db push.
- **Slice 2 — service worker:** replace shell-only `public/sw.js` with a
  Serwist worker (precache provider shell + background-sync queue); keep member
  shell behaviour. (Check next/serwist availability; else a hand-rolled SW.)
- **Slice 3 — IndexedDB store:** client-side schema for cached eligibility +
  benefit balances (net of soft reservation), tariff/copay/pre-auth rules;
  time-boxed validity.
- **Slice 4 — sync-reconcile engine:** BullMQ `sync-reconcile` queue skeleton —
  idempotency drop → authoritative re-validation → deterministic conflict
  resolution → adjudication hand-off → audit-chain delta. Add OFFLINE_SYNC/
  USSD/SMS to `ClaimSource`.
- **AD-5 (offline v1 scope):** member verification + claim capture + provisional
  copay first; pre-auth next. (Confirm with user before Phase-1 build-out.)

**After G4 scaffold → security-hardening slice** (2FA/R81, password-reset/R24,
password-policy/R28, single-session/R25, auth-banner/R32 — all S0, small).

#### Original G3.1 plan (reference)
Redesign the thin `ApprovalMatrix` (tenant-scoped, claims-only, single-role,
`requiresDual` bool) into a client-scoped, action-typed, currency-normalised,
multi-level-sequential, SLA-timed, version-resolved engine with enforced SoD.
Planned slices:
- **Slice 1 — data model:** `ApprovalActionType` enum (CLAIM_PAYMENT, PREAUTH_GOP,
  LIMIT_OVERRIDE, SCHEME_ACTIVATION, COMMISSION_CHANGE, ENDORSEMENT,
  TARIFF_CHANGE, FUND_TOPUP, WRITEOFF_REFUND, …). Extend/redesign `ApprovalMatrix`
  (clientId, schemeId?, actionType, amountBandMin/Max in **base currency UGX**,
  currency, effective-dated/versioned) + `ApprovalStep` (level, requiredRole(s),
  slaMinutes, escalationTargetRole) + runtime `ApprovalRequest`/`ApprovalDecision`
  (resolved matrixVersionId). **Also land `Currency`/`FxRate` (G3.5 schema-only)**
  for normalisation. db push (existing ApprovalMatrix is seeded-but-maybe-unused
  — check `AICARE_TODO` V-02 / call-sites before mutating columns).
- **Slice 2 — service:** `approval-matrix.service.ts` — `resolve(action, amount,
  currency, clientId)` → exactly one path; `fx.normalise()` (UGX base; identity
  until FxRate seeded); `enforceSegregationOfDuties()`; writes decisions to the
  audit chain with resolved version id. Unit tests.
- **Slice 3 — wire-in:** route one action (e.g. claim payment or override)
  through the engine + tests (resolves V-02 "seeded but not enforced").
- **Slice 4 — UI:** extend `/(admin)/settings/approval-matrix` to multi-level,
  action-typed editor; rights-and-roles report shows approvable actions.
- **Slice 5 — escalation:** extend `sla-breach.job.ts` to auto-escalate.

**Remaining G2.1 (deferred, do when needed):** 4b-switcher (operator UX), 2b
(incremental per-router isolation), 3 (RBAC per-assignment).

> ⚠️ Schema changes go via **`db push`** (NOT migrate — see note above). Work in
> small, independently-committable slices. Never leave schema half-applied at a cutoff.

### How to verify a slice is done
- `npm run typecheck` passes; relevant `npx vitest run` passes.
- `npm run brand:guard` stays green.
- After a schema change: `npm run db:migrate` succeeds + `db:generate`.
- Commit each coherent slice with a clear message; update this log.

---

## §2. Decisions locked (this session)

| Ref | Decision | Source |
|---|---|---|
| Baseline | Branch `medvex-phase-0` + commit existing rebrand as checkpoint. | user, 2026-06-30 |
| Start point | Finish rebrand (D-7/D-8/D-9/D-10) **before** functional Phase 0. | user, 2026-06-30 |
| AD-1 | Keep `Tenant` as Medvex operator; add `Client` below it. | plan §F (recommended) |
| AD-2 | Base currency = **UGX**; new clients default to **UGX**. | user, 2026-06-30 |
| AD-3 | Design tokens rename to neutral `brand-*` (not `medvex-*`). | plan §F (decided) |

> Open decisions still needing the user: AD-2 (base currency), AD-4 (repo folder
> rename), AD-5 (offline v1 scope). Surface these when their phase arrives.

---

## §3. Workstream tracker

Status: ⬜ not started · 🔄 in progress · ✅ done · ⏸ blocked/deferred

### Rebrand (§D) — ✅ COMPLETE (except deferred externals)
| Item | What | Status | Notes |
|---|---|---|---|
| D-1…D-6 | Token values, typography, icons, copy, domains, seeds | ✅ | `e9638fc`. |
| D-7 | `avenue-*` → `brand-*` token-NAME rename (~3,760 usages) | ✅ | `fe125bb`. Pure prefix swap; values unchanged. |
| D-8 | en-KE→en-UG (340), KENYAN_COUNTIES→UGANDA_DISTRICTS, brand strings | ✅* | `951eb10`. *KES (534)→G3.5, TaxType→G5.3/OD-3, county column→later migration. |
| D-9 | Style guide rewrite, GEMINI scrub, test fixture | ✅* | `45dfe5f`. *Deferred: archive/ (16), uat/ evidence (102), repo folder rename (AD-4). |
| D-10 | CI guard: fail build if `avenue` reappears | ✅ | `bfca4a8`. `scripts/check-no-avenue.mjs` + `prebuild` + GH Action. |

**Deferred rebrand items (revisit when their phase/owner is ready):**
- KES currency strings (534) → fold into **G3.5** (Currency entity).
- `TaxType` enum (STAMP_DUTY/TRAINING_LEVY/PHCF) → **G5.3 / OD-3** (needs real UG tax schedule).
- schema `county` columns (6) → district rename in a later data migration.
- `archive/` (16 docs) header notes; `uat/` brand-copy audit on next UAT run.
- Repo folder rename `avenue-portal`→`medvex-portal` (**AD-4**, external git/CI — user-driven).

### Phase 0 — Foundation (after rebrand)
| Gap | What | Status |
|---|---|---|
| G2.1 | Multi-client `Client` entity + isolation + migration (XL, S0) | 🔄 |

**G2.1 sub-slices:**
- ✅ **Slice 1 — schema + backfill.** Added `Client` model + `PayerType`
  (INSURER/HMO/EMPLOYER_SELF_FUNDED) + `ClientStatus` enums; nullable
  `Group.clientId` + index; `Tenant.clients` back-relation. Applied via
  `db push`. Backfill `prisma/sql/backfill_default_client_g2_1.sql` created one
  default Client per tenant (id `cl_<tenantId>`, slug `default`, UGX) and set
  all 7 schemes' `clientId` (0 orphans). typecheck clean.
  > NOTE: `ClientType` enum (CORPORATE|INDIVIDUAL) already existed for the
  > *scheme* type — did NOT reuse it; `PayerType` is the new payer-entity enum.
- ✅ **Slice 1b — seed.** `c01cfb8`: `seed.ts` creates default Client after
  tenant upsert + end-of-seed updateMany links all schemes. seed-safaricom.ts
  needs no change (read-only on existing tenant/groups).
- ✅ **Slice 2 — tRPC isolation plumbing.** `cce…`/`f342403`: User.clientId;
  clientId threaded auth→session→context→protectedProcedure; `clientScope.ts`
  (clientFilter/assertClientAccess/resolveWriteClientId); GroupsService +
  router + 5 callers client-scoped; 11 isolation tests (suite 64/64).
- ⬜ **Slice 2b — incremental isolation** across other routers/services (as each
  client-scoped model gains `clientId` in later phases).
- ⬜ **Slice 3 — RBAC client scope** (per-assignment, if User.clientId insufficient).
- ✅ **Slice 4a — clients UI.** `c37ba38`: `ClientsService` + `/(admin)/clients`
  list + `/clients/new` create (server action + audit) + sidebar link.
  Verified in-browser end-to-end (create → persist → audit → list).
- ✅ **Slice 4b — client detail + edit.** `98d749c`: `/clients/[id]` detail +
  `/clients/[id]/edit` (update + never-delete deactivation). Verified in-browser.
  (Operator client-*switcher* still deferred.)
- ✅ **Slice 5 — `Group.clientId` NOT NULL.** `6e80ebe`: `resolveSchemeClientId`
  shared resolver wired into all 4 create paths + seed; column NOT NULL; FK
  RESTRICT. DB is_nullable=NO; tests 64/64.
| G2.4 | Terminology engine (multi-client) (M, S1) | ✅ all 5 slices (model+resolver+workflow+UI+hook+seed) |
| G3.1 | Approval-matrix engine (L, S0) | ✅ all 5 slices (model+service+claims+editor UI+runtime workflow+escalation); wiring other actions = incremental |
| G4 | Offline SW + IndexedDB + sync + capture UI | ✅ scaffold + Phase-1 headline flow (`963afd6`/`568b1f5`/`8fccd13`): capture→sync→reconcile→real OFFLINE_SYNC claim, verified end-to-end. Refinements left: balance reconcile, eligibility cache, USSD/SMS |
| G5.9 | NIRA identity (replaces Kenya IPRS) | ✅ `58ed550` — nira.service + 3 call-sites swapped; iprs* field rename deferred (cosmetic) |
| G3.3 | Active claims dashboard + SLA queues | ✅ `e1df67e` — /claims/queues console (lanes+SLA timers, verified). Real-time alert fan-out remaining |
| G5.2 | Membership admin (multi-client) | ✅ `b4cfb9b` — client-scoped members list/service; NIRA+renewal+offline already covered. Otherwise strong/existing |
| G5.4 | Provider network + per-client tariffs | ✅ core `51edace` (engine) + editor UI (2026-07-02): ProviderTariffsCard exposes the clientId override + currency + Scope column, verified in-browser. Settlement accel + scorecard curation still incremental |
| G5.6 | Claims management + channels | ✅ `16fa9cf` client-scoped + R62 verified; offline channel done (G4), dashboard done (G3.3). USSD/SMS wiring needs aggregator P-03 |
| G3.3+ | Real-time incoming-claim alert | ✅ `e9b58b9` — polling banner on queues console (client-scoped) |
| G3.5 | Currency/FxRate + currency columns + FX UI + consolidation | ✅ core (`7212bd0`,`95c277f`); full UI/report threading = incremental |
| Security slice | 2FA, password reset, password policy, single-session, auth banner | ✅ 5/5 (policy `0c572fb`, banner `0c572fb`, reset `4a168a7`, single-session `37a1f89`, 2FA `7cdf3b6`) |
| G9.6 | Client-configurable member numbering (drop `AVH-` prefix) | ✅ `4b659d5` — Client.memberNumberPrefix + member-numbering.service; all AVH- sites replaced |

### Wire-in / jobs / consoles phase (2026-07-02) — ✅ COMPLETE
| Gap | What | Status |
|---|---|---|
| G9.1 wire-in | Cost-share into adjudication | ✅ `CostShareResolver` in both adjudication paths; `BenefitUsage.deductibleMet`; replaced hard-coded copay |
| G9.5 wire-in | Drug exclusions at intake | ✅ `DrugExclusionService.applyToClaim` declines excluded lines (idempotent) |
| G3.7 exec | Auto-adjudication execution | ✅ `AutoAdjudicationService.processIntake` at both submit actions + sync reconcile; provenance on Claim; fail-safe routing |
| — | System actor for unattended writes | ✅ `system-actor.service.ts`; fixed FK bug in membership-activation.job |
| G5.10 wire-in | Member-payment rail → MobileMoneyService | ✅ reimbursement + member-payment call-sites; Uganda MSISDNs; UGX/wallet copy |
| G2.3 job | Recurring admin-fee accrual | ✅ `accrueRecurringForPeriod` + daily `admin-fee-accrual` job |
| G5.11 job | Configurable fraud scan | ✅ `scanRecentClaims` + 6-hourly `fraud-scan` job |
| G3.7 UI | Auto-adj policy editor | ✅ `/settings/auto-adjudication` (verified) |
| G9.5 UI | Drug-exclusions console | ✅ `/settings/drug-exclusions` (verified) |
| G5.11 UI | Fraud rules + investigations | ✅ `/fraud/rules` + `/fraud/investigations` + alert-desk action (verified) |
| G2.3/G5.8 UI | Admin-fees console | ✅ `/billing/admin-fees` — agreements/ledger/accrual/invoice (verified) |
| G1.1 UI | Compliance register | ✅ `/compliance` — obligations/directors/licence/levy (verified) |
| G1.2 UI | Data-protection console | ✅ `/compliance/privacy` — DSR/processor/breach (verified) |
| G5.4 UI | Per-client tariff editor | ✅ ProviderTariffsCard clientId override + currency + Scope column (verified) |

> Later phases (1–5) tracked in the plan §E; expand here as they begin.
> **Everything remaining is externally-gated (provider APIs, SMS aggregator,
> FHIR/EDI) or Phase 4-5 depth (G5.15 cross-border, HA/DR docs)** — see §1.

---

## §4. Chronological log (newest first)

### 2026-07-02 — wire-in + jobs + consoles (closes all documented follow-ups)
- **Cost-share (G9.1)** committed: `CostShareResolver.applyForClaim` +
  `benefitPeriodFor`; wired into `ClaimsService.adjudicateClaim` (dropped the
  hard-coded 10% copay) and `claimAdjudicationService.approveClaim`. Schema
  (db push): Claim.autoAdj*/costShare*, BenefitUsage.deductibleMet. 11 tests.
- **Intake pipeline (G3.7/G9.5)** committed: `DrugExclusionService.applyToClaim`
  + `AutoAdjudicationService.processIntake`; wired into both claim-submit server
  actions + `sync.service` reconcile; `system-actor.service` (fixed
  membership-activation FK bug). Suite 223/223.
- **G5.10 call-site swap** committed: reimbursement + member-payment →
  MobileMoneyService; Uganda MSISDNs + UGX copy.
- **Jobs (G2.3/G5.11)** committed: `accrueRecurringForPeriod` +
  `scanRecentClaims`; `admin-fee-accrual` (daily) + `fraud-scan` (6h) jobs in
  queue.ts + worker.ts. Suite 229/229.
- **Consoles** committed (each in-browser verified via preview + admin login
  admin@avenue.co.ke / Verify123!):
  - `/settings/auto-adjudication` + `/settings/drug-exclusions` (`330960e` prior
    style; new commit this session).
  - `/fraud/rules` + `/fraud/investigations` (+ alert-desk "open investigation").
  - `/billing/admin-fees` (agreements/ledger; ran accrual → 1,240,000 UGX).
  - `/compliance` (levy 2026 = 6,200 UGX from the ledger basis).
  - `/compliance/privacy` (registered a processor).
  - Sidebar updated: Setup, Fraud, Finance entries + new Compliance group.
- **All 6 session tasks complete.** typecheck + brand guard green throughout.
- **Bonus G5.4 editor UI**: `ProviderTariffsCard` now exposes the per-client
  `clientId` override + `currency` (Scope column; KES→currency); action
  persists clientId with operator-ownership check + audit; provider page loads
  clients and renders the card unconditionally. Verified in-browser (85,000 UGX
  Default-Client override shown beside the network-master rate). Suite 229/229.
- **Session end state: every non-externally-gated, non-decision-gated item in
  the plan is built + verified.** Next agent: remaining work is provider-API
  integrations (need creds), SMS aggregator (P-03), FHIR/EDI (G8), and the
  decision-gated Phase-5 modules G5.15 (cross-border, OD-8) / G5.16 (wellness,
  OD-9). None are startable without either external credentials or a user
  decision — surface those to the user rather than building speculatively.

### 2026-06-30
- Read full gap plan + spec context. Verified env (Postgres up, 23 migrations
  applied, clean). Confirmed `.env` gitignored.
- Created branch `medvex-phase-0`; committed rebrand baseline as `e9638fc`
  (78 files: tracked rebrand changes + new `medvex-*` icons).
- Created this build log.
- **D-7** `fe125bb`: mechanical `avenue-` → `brand-` substring rename across
  src/ (3,762→0 avenue refs); rewrote globals.css header comment; typecheck clean.
- **D-8** `951eb10`: en-KE→en-UG (340 sites); KENYAN_COUNTIES→UGANDA_DISTRICTS
  (was orphan/unused); cleared residual Avenue strings in prisma comments+seed.
  Deferred KES/TaxType/county to functional gaps. typecheck clean.
- **D-10** `bfca4a8`: `scripts/check-no-avenue.mjs` (scans src/public/prisma,
  exit 1 on hit), wired as `prebuild` + `brand:guard` + `.github/workflows/
  brand-guard.yml`. Verified pass + planted-ref fail.
- **D-9** `45dfe5f`: wrote `Medvex_Style_Guide.md` from D-0 tokens, removed
  `Avenue_Style_Guide.md`; scrubbed GEMINI.md; renamed knowledge.test.ts fixture
  (test passes 2/2).
- **Rebrand §D complete.** brand:guard green, typecheck clean.
- AD-2 decided by user: **UGX** base + default.
- **G2.1 slice 1** `3913e21`: `Client` model + `PayerType`/`ClientStatus` enums,
  `Group.clientId`, `Tenant.clients`; applied via `db push`; backfill SQL → 1
  default client/tenant, 7/7 groups linked. Found project uses **db push, not
  migrate** (logged in §1).
- **G2.1 slice 2** `f342403`: client-isolation plumbing (User.clientId, auth/
  session/context/protectedProcedure) + `clientScope.ts` helpers + groups
  enforcement + 11 isolation tests (suite 64/64).
- `c6d34d8`: tracked spec + gap plan; gitignored the 2.9M design-handoff zip.
- **G2.1 slice 1b** `c01cfb8`: seed creates default Client + links schemes.
- **G2.1 slice 4a** `c37ba38`: `ClientsService` + `/(admin)/clients` UI +
  sidebar. Verified in-browser (login as admin@avenue.co.ke, list shows default
  client w/ 7 schemes; created Jubilee Insurance Uganda → persisted + audited).
  Noted dev DB is stale pre-rebrand data (see §1 Dev DB note).
- **G2.1 slice 4b** `98d749c`: client detail + edit pages; verified edit →
  USD/SUSPENDED persisted with never-delete (isActive=false, effectiveTo set).
- **G2.1 slice 5** `6e80ebe`: `resolveSchemeClientId` shared resolver across all
  4 group.create paths + seed; `Group.clientId` NOT NULL; FK RESTRICT; 64/64.
- **G2.1 multi-client tenancy substantially COMPLETE.**
- **G2.4 slices 1-2** `a3ea874`: `TerminologyEntry`/`TerminologyApproval` models
  (db push) + `terminology.service.ts` resolver (CLIENT>LOCALE>HOUSE>SYSTEM,
  locale refinement, TTL cache) + 7 precedence unit tests. Verified end-to-end
  vs Postgres (inserted HOUSE+CLIENT "policy" overrides → service query returns
  them; cleaned up). Suite 71/71.
- **G2.4 slice 3** `e0ed9d3`: maker-checker write path (list/createDraft/submit/
  approve/reject) + `terminology` tRPC router + `/(admin)/settings/terminology`
  admin UI (server actions + audit) + sidebar link + 7 write-path tests.
  Verified in-browser: draft→submit→queue→self-approve BLOCKED by SoD. Suite 78/78.
- **G2.4 slice 4** `0ce8c94`: `getMap` + `TermProvider`/`useTerm` wired into the
  admin layout (+ getMap test). **G2.4 slice 5** `b292c68`: seeded 10 APPROVED
  HOUSE terms (policy→Scheme, premium→Contribution, …); verified in-browser
  (ALL TERMS 10). **G2.4 COMPLETE.** Suite 79/79.
- **G3.1 slice 1** `f4a0404`: action-typed/client-scoped/currency-aware
  ApprovalMatrix + ApprovalStep/ApprovalRequest/ApprovalDecision + Currency/FxRate
  (additive; legacy rows default CLAIM_PAYMENT/UGX). db push.
- **G3.1 slice 2** `e6bf441`: `fx.service.ts` (UGX base normalise) +
  `approval-matrix.service.ts` (resolve, expandSteps, SoD, roleAuthorised) + 12 tests.
- **G3.1 slice 3** `514d9df`: claim-payment path routed through the engine
  (client-scoped + SoD); resolves V-02. Seeded rules resolve under engine; 91/91.
- **G3.1 slice 4** `2d33e82`: action-typed/client-scoped/currency/SLA matrix
  editor UI. Verified in-browser (created PREAUTH_GOP rule, client-scoped, SLA
  30m→UNDERWRITER).
- **G3.1 slice 5** `3104fa2`: runtime `ApprovalRequestService` (create/decide,
  multi-level, SoD) + `approval-escalation.job.ts` (scheduled 30m) + 9 tests.
- **G3.1 approval-matrix engine SUBSTANTIALLY COMPLETE (all 5 slices).** Suite 100/100.
- **G3.1 integration** `da02e44`: multi-level config (stepRoles) + approvals
  console (/approvals) + claim wire-in opens ApprovalRequest for multi-level
  rules. Verified live: L1 approve advances to L2; same user blocked at L2 by SoD.
  **G3.1 COMPLETE & USABLE.**
- **G4 offline scaffold** `042d8ba`+`85c1d6e`: SyncOperation/OfflineReservation/
  EligibilitySnapshot model + ClaimSource offline sources; sync.service (ingest
  idempotent + reconcile skeleton) + /api/v1/sync + BullMQ sync-reconcile; client
  IndexedDB outbox + eligibility cache + SW background-sync. 5 tests. Suite 105/105.
- **Security hardening 3/5:** `0c572fb` password policy (validatePassword, min 10
  + complexity, applied at all set-sites) + authorized-users login banner;
  `4a168a7` password reset via emailed 6-digit code (PasswordResetToken +
  request/confirm service + /reset page + login link). 11 tests. Suite 116/116.
  Verified in-browser (reset page + token issuance).
- **Security single-session (R25)** `37a1f89`: User.sessionVersion bumped on
  login; jwt callback invalidates stale tokens (15s cache, fail-open). Verified
  in-browser (login → bump → invalidated → re-login).
- **Security 2FA/TOTP (R81)** `7cdf3b6`: hand-rolled RFC 6238 (src/lib/totp.ts,
  7 tests incl. RFC vector) + User.totpSecret/totpEnabled + login `totp`
  credential + /settings/security enrolment. Verified in-browser (blocked w/o
  code, passes w/ code). **Security hardening COMPLETE 5/5.** Suite 137/137.
- **G3.5 multi-currency core** `7212bd0`+`95c277f`: currency columns, Currency/
  FxRate seed, FX-rate admin UI (never-delete, verified), FxService.consolidate.
- **G3.1 wiring** `2daee20`: reusable `ApprovalRequestService.enforce()` gate
  (5 tests) + fund top-ups routed through it. One-liner pattern for the rest.
- **G9.6** `4b659d5`: `Client.memberNumberPrefix` (default MVX) +
  member-numbering.service; replaced every hard-coded `AVH-` site; prefix
  exposed in the client create form. Brand guard caught 2 doc comments (fixed).
- **G4 Phase-1** `963afd6` (Claim re-validation) + `568b1f5` (reconcile creates
  real OFFLINE_SYNC claim, idempotent via externalRef) + `8fccd13` (provider
  offline-capture UI). **Verified end-to-end in-browser + BullMQ worker:**
  captured claim offline → outbox → Sync now → SyncOperation → worker reconciled
  → Claim CLM-2026-00760 (OFFLINE_SYNC). Zero data loss.
  > Worker gotcha: `npm run worker` needs DATABASE_URL exported (tsx doesn't load
  > .env) — else Prisma hits the wrong DB (DatabaseDoesNotExist).
- **G5.9 NIRA** `58ed550`: nira.service adapter + 3 call-sites swapped from IPRS;
  4 tests. iprs* DB field rename deferred (cosmetic, not brand-guarded).
- **Both requested items delivered.** Suite 156/156.
- **G3.3** `e1df67e`: `/claims/queues` active work-queue console — lanes by
  lifecycle state + per-card SLA age (red when over target) + drill-through +
  client-scoped. Verified in-browser (465 active, over-SLA flagged, UGX amounts).
- **G5.2** `b4cfb9b`: client-scoped members list/service (G2.1 slice 2b for
  membership). NIRA/renewal-SMS/offline already covered; module otherwise strong.
- **G5.4** `51edace`: per-client provider tariffs (ProviderTariff.clientId +
  client-aware resolution, client rate wins; 2 tests).
- **G5.6** `16fa9cf`: client-scoped claims list/service; R62 uniqueness verified.
- **G3.3 real-time alert** `e9b58b9`: polling incoming-claim banner on the console.
- **G4 balance reconcile** `3753475`: insufficient benefit balance at sync →
  CONFLICT (never silent overpay); soft-hold aware; +2 tests. Suite 160/160.
- **Phase-1 core substantially complete.**
- **G3.7** `c1a417b`: AutoAdjudicationPolicy (client-scoped/versioned) +
  evaluateClaim (auto-approve vs route w/ named gate); 6 tests. Default seeded.
- **G5.5** `ec67524`: GOP artefact (gopNumber/gopIssuedAt) issued within limits
  on both pre-auth approval paths.
- **G3.4/G5.7** `8a2552c`: per-client copay overrides (CoContributionRule.clientId
  + resolver preference); 3 tests.
- **G9.1 (Phase-2 headline)** `856a12e`: co-insurance + deductibles —
  BenefitConfig.coInsurancePct/deductibleAmount + cost-share.service
  (deductible-then-co-insurance, distinct from copay); 5 tests. Suite 174/174.
- **G9.5** `8bd0570`: ClaimLine.drugCode + DrugExclusion + service (3 tests).
- **G2.3** `372b2e4`: AdminFeeAgreement + AdminFeeLedgerEntry + accrual service
  (PMPM/flat/pct/event; 6 tests).
- **G5.8** `b0e6a22`: admin-fee invoicing from the ledger (2 tests).
- **G3.5 full** `b618f9e`: FxService.gainLoss + ClientConsolidationService
  (parent+subsidiary claims → base; 3 tests).
- **G1.1** `fd914a4`: compliance register models + ComplianceService (levy from
  admin-fee ledger, director-residency, obligation status; 5 tests).
- **G1.2** `3b8f2fc`: DPPA models (consent/DSR/processor/breach) + DpoService (5 tests).
- **G5.11** `5c5b7be`: configurable FraudRule + FraudInvestigation + service (4 tests).
- **G5.10** `f173a2e`: MTN MoMo + Airtel Money adapters + MobileMoneyService
  facade (MSISDN detection, fake-SMS reframing; 6 tests).
- **Full 8-item sequence delivered.** Suite 208/208. Each is model+service+tests;
  UIs/jobs/adjudication wire-ins + external APIs are the documented follow-ups.
