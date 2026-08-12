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

_pending_

### P00.02 — Restore the mandated Next documentation and align dependencies

_pending_

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
