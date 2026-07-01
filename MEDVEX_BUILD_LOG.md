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

### Current status
> **Rebrand §D ✅ · G2.1 ✅ · G2.4 ✅ · G3.1 ✅ · G4 scaffold ✅ · Security 5/5 ✅
> · G3.5 multi-currency CORE ✅** — currency columns on 7 money entities +
> Currency/FxRate seed + FX-rate admin UI (never-delete, verified in-browser) +
> FxService.normalise/consolidate (normalise already used by approval bands).
> Suite 141/141; typecheck + brand guard green.
> **User's remaining sequence: (1) wire remaining G3.1 action paths → (2) G9.6
> member numbering → (3) G4 Phase-1 end-to-end.** Now on G3.1 wiring.

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
| G4 (scaffold) | Offline SW + IndexedDB + sync skeleton | ✅ scaffold (model+server rail+client rail); Phase-1 end-to-end left |
| G3.5 | Currency/FxRate + currency columns + FX UI + consolidation | ✅ core (`7212bd0`,`95c277f`); full UI/report threading = incremental |
| Security slice | 2FA, password reset, password policy, single-session, auth banner | ✅ 5/5 (policy `0c572fb`, banner `0c572fb`, reset `4a168a7`, single-session `37a1f89`, 2FA `7cdf3b6`) |
| G9.6 | Client-configurable member numbering (drop `AVH-` prefix) | ⬜ |

> Later phases (1–5) tracked in the plan §E; expand here as they begin.

---

## §4. Chronological log (newest first)

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
- **G3.5 multi-currency core** `7212bd0` (currency columns on 7 entities +
  Currency/FxRate seed) + `95c277f` (FX-rate admin UI, never-delete, verified
  in-browser; FxService.consolidate + 4 tests). Suite 141/141.
- **Next (user sequence):** wire remaining G3.1 action paths, then G9.6, then G4 Phase-1.
