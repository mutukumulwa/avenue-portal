# UAT-HF-20260811-01: implementation log

Required by `IMPLEMENTATION_PLAN.md` §2.1. **One row per completed task.** A task without a row
here is not done, regardless of what the code looks like.

Each row must carry: task ID and defect IDs; commit SHA; migrations/backfills executed and their
output artifact paths; tests added with exact commands and results; routes exercised with evidence
paths; feature flags changed; remaining risks (or `none`).

Branch: `codex/uat-hf-remediation` (from `ff26e3b`)
Decisions: `DECISIONS.md` — DEC-01..DEC-12 all signed 2026-08-12 at recommended defaults

---

## P00 — Reconstruct a trustworthy baseline

### P00.00 — Branch, decisions, and log scaffolding

| Field | Value |
|---|---|
| **Task** | P00.00 (scaffolding; not a numbered plan task) |
| **Defect IDs** | none — prerequisite governance |
| **Commit** | _pending_ |
| **Migrations / backfills** | none |
| **Tests added** | none — no product code touched |
| **Commands / results** | `git checkout -b codex/uat-hf-remediation` from `ff26e3b` — clean |
| **Routes exercised** | none |
| **Evidence** | `docs/uat-human-factors-remediation/DECISIONS.md` |
| **Feature flags** | none |
| **Remaining risks** | Working tree carries ~71 pre-existing dirty entries belonging to the user (uncommitted plans, `outputs/`, `scripts/uat-*.ts`, 7 deleted CSVs under `uat/inpatient_longitudinal_2026-07-17/`). All commits on this branch must stage named files only — never `git add -A`. |

**Notes.** Branch was created in place rather than as a separate git worktree. Plan rule §2.3 says
not to work in the dirty analysis worktree; the intent of that rule is to avoid committing analysis
debris. The 7 tracked-dirty files are all under `uat/inpatient_longitudinal_2026-07-17/` and cannot
collide with any file P00 touches, and a separate worktree would have forced either a duplicate
`node_modules` or a symlink that P00.02's dependency reinstall would corrupt for the main checkout.
Surgical staging is the mitigation.

---

### P00.01 — Freeze evidence and choose the integration base

| Field | Value |
|---|---|
| **Task** | P00.01 |
| **Defect IDs** | none directly; protects all 81 findings and assigns a retest owner to all 31 blocked steps |
| **Commit** | _pending_ |
| **Migrations / backfills** | none |
| **Tests added** | none — measurement only, no product code touched |
| **Commands / results** | `npm run typecheck` → **5 errors**, all `mustChangePassword` (reproduced exactly as reported). Evidence re-hash → **190/190 match, 0 mismatched, 0 missing**. `git diff --name-status 53df0ab ff26e3b` → 75 files, +3004/−331. |
| **Routes exercised** | none |
| **Evidence** | `docs/uat-human-factors-remediation/BASELINE.md` |
| **Feature flags** | none — **no feature-flag surface exists in the codebase**, which P12.03 will have to build |
| **Remaining risks** | `DEC-13` is open and blocks P00.04. Seven of the 31 blocked steps cannot be unblocked by any product fix (harness/fixture capability), so P12.05's "zero blocked" GO criterion is unreachable until P00.05 delivers a mail sink, download interception, an exhausted-benefit fixture, cold-offline navigation, and a scenario reorder. |

**Findings that change downstream work.**

1. **The evidence freeze holds.** All 190 registered items were independently re-hashed and match;
   134 unregistered supplementary captures match the pack's own count. The run is authoritative.
2. **Schema deployment is `prisma db push` at build time, not migrations** (`scripts/db-sync.mjs`).
   The migration head is ~3 months stale and CHECK constraints live in a hand-applied SQL file.
   P00.04's acceptance criterion assumes a model the repo does not use → raised as `DEC-13`.
3. **The `TreatmentExclusionRule` XOR contradiction is confirmed with a precise mechanism:**
   `db push` owns the `SET NULL` referential action, while `exclusion_owner_xor` lives only in
   `prisma/sql/2026-08-10_onboarding_invariants.sql`. They contradict each other.
4. **Five HF tasks overlap work already done** in the 12 eligibility commits — most importantly the
   P03.01 seed/backfill/fixture scripts already exist, and `src/lib/dates.ts` already exists, so
   P01.05 must extend it rather than create a rival module.
5. **No feature-flag surface and no timezone constant exist anywhere**, so P12.03 and P01.05 both
   start from zero rather than from an existing primitive.

### P00.02 — Restore the mandated Next documentation and align dependencies

| Field | Value |
|---|---|
| **Task** | P00.02 |
| **Defect IDs** | none — removes an implementation-drift risk that gates every `src/app/**` task |
| **Commit** | _pending_ |
| **Migrations / backfills** | none |
| **Tests added** | none — no product code touched |
| **Commands / results** | `npm run lint` → **terminates in 21s** (previously never finished). 756 problems: 556 errors / 200 warnings, **all pre-existing**, none introduced here. `npm run typecheck` still fails with the same 5 `mustChangePassword` errors — P00.03 owns those. |
| **Routes exercised** | none |
| **Evidence** | `docs/vendor/nextjs-15.5.15/PROVENANCE.md` |
| **Feature flags** | none |
| **Remaining risks** | Repo-wide lint is red with 556 pre-existing errors → tracked as **P00.02b**. Vendored docs must be re-vendored on any Next upgrade or they silently become wrong; refresh procedure is in `PROVENANCE.md`. |

**Steps 1 and 3 — why the mandated docs were missing, and what replaced them.**

Next ships **no `dist/docs` in any published release.** Verified twice: the installed
`next@15.5.15` has no such directory (its `dist/` is build/runtime output only), and the jsDelivr
file manifest for the published 15.5.15 tarball contains no path beginning `/dist/docs` and no file
containing "docs" at all. Next's documentation lives in the GitHub repository under `docs/` and on
nextjs.org — it is never published to npm. `AGENTS.md`'s rule was therefore unfollowable as written,
not broken by a bad install.

This triggered the task's **Stop** condition. With owner approval (2026-08-12), the official
version-matched docs were vendored from `vercel/next.js` at tag `v15.5.15`
(commit `412eb90b6587ec02e8361c92efa9091487e7348f`) into `docs/vendor/nextjs-15.5.15/` — 3.0 MB,
370 files — and `AGENTS.md` was repointed there. All five guides the task names are present and
indexed in `PROVENANCE.md`:

| Required guide | Vendored path (under `docs/vendor/nextjs-15.5.15/`) |
|---|---|
| Server Actions | `01-app/01-getting-started/08-updating-data.mdx` |
| Error boundaries | `01-app/01-getting-started/10-error-handling.mdx` + `01-app/03-api-reference/03-file-conventions/error.mdx` |
| Caching / revalidation | `01-app/01-getting-started/09-caching-and-revalidating.mdx` + `01-app/02-guides/caching.mdx` |
| Forms | `01-app/02-guides/forms.mdx` |
| Route handlers | `01-app/01-getting-started/15-route-handlers-and-middleware.mdx` + `01-app/03-api-reference/03-file-conventions/route.mdx` |

`src/app/**` edits are now unblocked.

**Step 2 — the dependency "mismatch" is deliberate and must not be "fixed".**

The plan flags Next 15.5.15 against `eslint-config-next` 16.2.2 and says not to leave them paired
"unless official compatibility documentation explicitly permits it". Investigation shows the pairing
is *required*, not accidental:

- `eslint-config-next@16.2.2` declares peer dependencies on **`eslint` and `typescript` only — it
  has no `next` peer dependency at all**, so the package's own metadata asserts no coupling to the
  framework version. That is the authoritative statement the task asks for.
- `eslint-config-next@15.5.15` publishes **no `exports` field**, so it does not provide the
  `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` subpaths that
  `eslint.config.mjs` imports. Downgrading to match Next would **break the flat ESLint config
  outright.**
- The only other way to "align" is upgrading Next 15 → 16, a major framework change with breaking
  App Router behaviour. Doing that at the start of a remediation programme — immediately before
  P02/P03/P04 rewrite App Router code — would invalidate the tested baseline for no benefit.

**Decision: keep Next 15.5.15 + `eslint-config-next` 16.2.2 and pin the reason here.** No reinstall
was necessary; the lockfile already resolves a coherent set.

**Step 4 — why repo-wide lint never finished.**

`eslint.config.mjs` ignored `".next/**"`, which in flat config is anchored at the repository root
and therefore does **not** match build output nested inside git worktrees. Lint was walking
`.claude/worktrees/stoic-gauss-1e06aa/.next/**` and the 198 MB `outputs/` evidence tree. Added
`**/.next/**`, `.claude/**`, `outputs/**`, `coverage/**`, and `docs/vendor/**`. `src`, `tests`,
`scripts`, and `prisma` remain linted, as the task requires.

### P00.03 — Reconcile and repair the existing eligibility branch

_pending_

### P00.04 — Make schema deployment reproducible

_pending_

### P00.05 — Close UAT governance gaps

_pending_

---

## Corrections made to the implementation plan

The plan is treated as authoritative but not infallible. Where a plan statement was checked against
the codebase and found wrong, the correction is recorded here and the plan text is left intact so
the divergence stays visible to a reviewer.

| Plan location | Plan says | Verified reality | Consequence |
|---|---|---|---|
| §1.2, bullet 8; P00.03 step 2 | "code reads/writes `User.mustChangePassword`, but the Prisma client/**schema** does not expose the field" — implying a design choice between adding the field and deleting the callers | `prisma/schema.prisma:338` declares `mustChangePassword Boolean @default(false)`, committed in `9e7586e` ("Phase 1 — provider onboarding + first-login"). The **generated client** is stale (built 2026-08-11 20:26, before the commit) and **no migration** under `prisma/migrations/` contains the column. | There is no design decision. P00.03 becomes: regenerate the client, add the missing migration. Callers stay. |

---

## Phase gates

| Phase | `npm run typecheck` | Full `npx vitest run` | Signed off |
|---|---|---|---|
| P00 | _pending_ | _pending_ | _pending_ |
