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
> **Rebrand §D COMPLETE** (D-1…D-10). **G2.1 slices 1 & 2 done** — `Client`
> entity exists + backfilled; client-isolation plumbing wired through
> auth/tRPC; `clientScope.ts` helpers + groups enforcement + 11 isolation
> tests (full suite 64/64). typecheck clean; brand guard green.

### Next concrete step  →  continue **G2.1** (remaining slices)
Pick up at **slice 1b (seed)** or **slice 4 (clients UI + switcher)**:
- **Slice 1b — seed:** update `prisma/seed.ts` + `seed-safaricom.ts` to create
  a default `Client` (operatorTenantId, slug `default`, UGX) and set seeded
  groups' `clientId`. Find where the operator Tenant + groups are created.
  (A fresh `db:seed` currently leaves seeded groups' clientId null — harmless,
  nullable, but incomplete.)
- **Slice 4 — clients management:** `/(admin)/clients/` (list/create/edit using
  the `Client` model), a `clients` tRPC router, and a **client switcher** in the
  admin shell so operator users pick a client (drives `resolveWriteClientId` for
  writes). Branding overrides surface via `TenantThemeInjector` (extend to
  client overrides).
- **Slice 2b — incremental isolation:** apply `clientFilter`/`assertClientAccess`
  to other client-scoped routers/services as they're touched (members, claims,
  etc. gain `clientId` in later phases — scope at that point).
- **Slice 3 — RBAC client scope:** per-assignment client scope on
  `UserRoleAssignment` if confinement-via-`User.clientId` proves insufficient.
- **Slice 5 — enforce `Group.clientId` NOT NULL** once every create path sets it.

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
- ⬜ **Slice 1b — seed.** Update `prisma/seed.ts` + `seed-safaricom.ts` to create
  the default Client and link seeded groups (fresh `db:seed` currently leaves
  groups with null clientId — harmless but incomplete).
- ✅ **Slice 2 — tRPC isolation plumbing.** `cce…`/`f342403`: User.clientId;
  clientId threaded auth→session→context→protectedProcedure; `clientScope.ts`
  (clientFilter/assertClientAccess/resolveWriteClientId); GroupsService +
  router + 5 callers client-scoped; 11 isolation tests (suite 64/64).
- ⬜ **Slice 2b — incremental isolation** across other routers/services (as each
  client-scoped model gains `clientId` in later phases).
- ⬜ **Slice 3 — RBAC client scope** (per-assignment, if User.clientId insufficient).
- ⬜ **Slice 4 — UI:** `/(admin)/clients/` management + `clients` router + client switcher.
- ⬜ **Slice 5 — enforce `Group.clientId` NOT NULL** once all paths set it.
| G2.4 | Terminology engine (multi-client) (M, S1) | ⬜ |
| G3.1 | Approval-matrix engine (L, S0) | ⬜ |
| G4 (scaffold) | Offline SW (Serwist) + IndexedDB + sync skeleton | ⬜ |
| G3.5 (schema) | Currency/FxRate + currency columns | ⬜ |
| Security slice | 2FA, password reset, password policy, single-session, auth banner | ⬜ |
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
- **Next:** G2.1 slice 1b (seed) or slice 4 (clients UI + switcher).
