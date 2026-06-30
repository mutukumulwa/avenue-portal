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
> **Rebrand §D COMPLETE** (D-1…D-10). **G2.1 multi-client tenancy
> SUBSTANTIALLY COMPLETE** (slices 1,1b,2,4a,4b,5). **G2.4 terminology engine
> slices 1-2 done** (model + resolver). `Client` payer entity + isolation
> (`clientScope.ts`) + clients CRUD UI + `Group.clientId` NOT NULL;
> `TerminologyEntry`/`TerminologyApproval` + `terminology.service.ts`
> resolver (CLIENT>LOCALE>HOUSE>SYSTEM) verified vs Postgres + 7 unit tests.
> Suite 71/71; typecheck + brand guard green.

### ⚠️ Dev DB note
The local dev DB holds **pre-rebrand data** (tenant "Avenue Healthcare", slug
`avenue`, users `@avenue.co.ke`) — the Medvex seed was never run on it. My
backfill still correctly created a default Client for it. For verification I set
**admin@avenue.co.ke password = `Verify123!`** (original hash unknown). A test
client "Jubilee Insurance Uganda" was created during verification (harmless demo
row). **Consider `npm run db:seed` to refresh to Medvex data** (now includes the
default Client via slice 1b) — but that's destructive; do it deliberately.

### Next concrete step  →  finish **G2.4** then **G3.1**
G2.4 **slices 1-2 done** (model + resolver, verified end-to-end). Remaining:
- **Slice 3 — write/approval + router + UI:** add CRUD + maker-checker
  transitions to `terminology.service.ts` (create draft → submit → approve/
  reject; on approve, deactivate the prior active entry for the same
  scope/client/locale/key — never-delete; call `invalidate(tenantId)`).
  `terminology` tRPC router (list/upsert/submit/approve/reject/preview),
  permission-gated. Admin page `/(admin)/settings/terminology` (list +
  approval queue + editor).
- **Slice 4 — frontend:** `useTerm(key)`/`TermProvider` (hydrate via
  `resolveMany` for the current tenant+client+locale); sweep hard-coded
  policy/premium/insure/claim/endorsement strings (incremental).
- **Slice 5 — seed:** a Medvex HOUSE dictionary (status APPROVED) so resolve()
  returns real overrides out of the box.

Then **G3.1 approval-matrix engine** (S0). NOTE its currency-normalised bands
depend on FX (G3.5) — land `Currency`/`FxRate` schema first or stub normalise().

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
| G2.4 | Terminology engine (multi-client) (M, S1) | 🔄 slices 1-2 (model+resolver) done; 3-5 left |
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
- **Next:** G2.4 slice 3 (write/approval + router + admin UI), then 4 (useTerm
  hook) + 5 (seed house dictionary); then G3.1 approval matrix.
