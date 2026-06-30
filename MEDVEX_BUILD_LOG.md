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

### Current status
> **Rebrand workstream (§D) is COMPLETE** (D-1…D-10), except deliberately
> deferred external/low-priority items (see §3). `npm run brand:guard` passes —
> zero "avenue" in src/, public/, prisma/. typecheck clean.

### Next concrete step  →  begin **Phase 0 functional work**
Per the plan §E, Phase 0 sequences **G2.1 (multi-client `Client` entity)** first
as the backbone everything depends on. Recommended first slice:
1. **Decision needed before G3.5:** AD-2 base currency (UGX vs USD) — ask user.
2. **G2.1 schema slice:** add `Client` model (AD-1: keep `Tenant` as the Medvex
   operator, add `Client` below it; type INSURER|HMO|EMPLOYER_SELF_FUNDED;
   parentClientId for subsidiaries; currency; branding overrides; status;
   effective dates). Add nullable `clientId` to `Group`. Write a data-migration
   that creates a default `Client` per existing tenant and backfills
   `Group.clientId`. Then `npm run db:migrate`, `db:generate`, `typecheck`.
3. Then isolation enforcement in tRPC context + `protectedProcedure`, RBAC
   client scope, `/(admin)/clients/` UI, client switcher. (Large — slice it.)

> ⚠️ G2.1 is XL and touches nearly every router/service. Work in small,
> independently-committable slices (schema → migration → context → services →
> UI). Never leave the schema mid-migration at a resource cutoff.

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
| AD-2 | Base currency for FX normalisation: **TBD** (UGX or USD) — decide before G3.5. | plan §F |
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
| G2.1 | Multi-client `Client` entity + isolation + migration (XL, S0) | ⬜ |
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
- **Next:** Phase 0 functional — ask user AD-2 (base currency), then start G2.1
  Client-entity schema slice.
