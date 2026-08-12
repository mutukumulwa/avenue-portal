# Schema deployment — cutover from `db push` to migrations

Task **P00.04 / P00.04a**, implementing **DEC-13 option A**.

> **Nothing in this runbook has been executed against production.** The code
> changes are committed and the migrations are verified on a disposable database.
> The production cutover in §3 is a human ops step and is **still outstanding**.

---

## 1. What was wrong

Production schema was deployed by `prisma db push`, run from `scripts/db-sync.mjs`
during the Vercel production build. Three consequences:

1. **`prisma/migrations/` was never applied in production.** Its head was
   `20260513010000_phase_10_lifecycle`, dated 2026-05-13 — about three months
   behind `schema.prisma`, which was the real authority.
2. **CHECK constraints were invisible to the deployment.** They cannot be
   expressed in a Prisma schema, so `db push` never manages them. All three lived
   in `prisma/sql/2026-08-10_onboarding_invariants.sql`, applied by hand over the
   direct 5432 connection (the prod pooler on 6543 cannot run DDL).
3. **A referential action and a CHECK constraint contradicted each other.**
   `TreatmentExclusionRule` has an XOR check requiring exactly one of
   `packageVersionId` / `providerContractId`. Both relations are optional, so
   Prisma's default action is `SET NULL` — which nulls the owner on delete and
   instantly violates the check. Deleting any `PackageVersion` therefore failed
   unless its exclusion rules were deleted by hand first. Found during the UAT-HF
   run while restoring production state.

## 2. What changed

**`prisma/migrations/` was rebuilt as three reviewed migrations.** The previous 23
were never the deployment mechanism and were three months stale; they are
preserved, not deleted, in `prisma/migrations-legacy/`.

| Migration | Contents |
|---|---|
| `20260812000000_baseline_production_schema` | The complete schema **as production already is** — generated from `53df0ab:prisma/schema.prisma`, the deployed build. Creates nothing new; it is the baseline an existing database is marked against. |
| `20260812000100_onboarding_invariant_checks` | `caps_family_gte_individual`, `caps_positive`, `exclusion_owner_xor`. Byte-for-byte the existing `prisma/sql/2026-08-10_onboarding_invariants.sql`, which is idempotent (`IF NOT EXISTS` guards), so it is a no-op where they already exist. |
| `20260812000200_must_change_password_and_exclusion_owner_cascade` | Adds `User.mustChangePassword` (**production does not have this column**) and changes both `TreatmentExclusionRule` owner foreign keys from `SET NULL` to `CASCADE`. |

**`scripts/db-sync.mjs` gained a `SCHEMA_DEPLOY_MODE` switch.** It still defaults
to `push`, so **this commit changes nothing about how production deploys today**.
Setting `SCHEMA_DEPLOY_MODE=migrate` switches it to `prisma migrate deploy`.

The default is deliberate: `migrate deploy` on a database that has never been
baselined would try to `CREATE TABLE` over existing tables and fail the build.
§3 must happen first.

## 3. Production cutover — OUTSTANDING, run by a human

Requires the **direct 5432** connection. The pooler on 6543 cannot run DDL.

**3.1 — Back up first.** Take a snapshot you can restore from.

**3.2 — Confirm what production actually has.** Expect `mustChangePassword` to be
absent and the three constraints to be present.

```bash
psql "$DIRECT_URL" -c "\d \"User\"" | grep -i mustchangepassword
```

```bash
psql "$DIRECT_URL" -tAc "select conname from pg_constraint where conname in ('caps_family_gte_individual','caps_positive','exclusion_owner_xor') order by 1;"
```

**3.3 — Mark the baseline as already applied.** This writes a `_prisma_migrations`
row; it does **not** run the SQL. Without it, step 3.5 fails.

```bash
DIRECT_URL="<direct 5432 url>" npx prisma migrate resolve --applied 20260812000000_baseline_production_schema
```

**3.4 — Check what is now pending.** Expect exactly the invariants and the delta.

```bash
DIRECT_URL="<direct 5432 url>" npx prisma migrate status
```

**3.5 — Apply the remaining migrations.**

```bash
DIRECT_URL="<direct 5432 url>" npx prisma migrate deploy
```

**3.6 — Verify.** `mustChangePassword` present; both FKs report `c` (CASCADE).

```bash
psql "$DIRECT_URL" -tAc "select conname, confdeltype::text from pg_constraint where conrelid='\"TreatmentExclusionRule\"'::regclass and contype='f' order by 1;"
```

**3.7 — Only now flip the build.** Set `SCHEMA_DEPLOY_MODE=migrate` in the Vercel
production environment and redeploy.

> **Note on the legacy history.** If production's `_prisma_migrations` table still
> holds rows for the 23 retired migrations, leave them. They name directories that
> no longer exist, which `migrate deploy` ignores; `migrate status` may mention
> them. Do not delete rows from `_prisma_migrations` to tidy up.

## 4. Rollback

Set `SCHEMA_DEPLOY_MODE=push` (or unset it) and redeploy. The build reverts to
`prisma db push` immediately. Migrations already applied stay applied — they are
additive and the `_prisma_migrations` rows are harmless under `db push`.

## 5. Verification already performed

On a disposable database (`uathf_migrations_test`, local Postgres 5432):

| Check | Result |
|---|---|
| `prisma migrate deploy` from empty | All 3 migrations applied cleanly |
| `prisma migrate status` | "Database schema is up to date!" |
| Drift: live DB vs `schema.prisma` | **"No difference detected"** |
| `caps_family_gte_individual`, `caps_positive`, `exclusion_owner_xor` | All 3 present |
| `TreatmentExclusionRule` FK delete actions | Both `c` (CASCADE), previously `n` (SET NULL) |
| `tests/db/exclusion-owner-xor.test.ts` + `tests/db/constraints.test.ts` | **9 passed** |

Reproduce with:

```bash
createdb uathf_migrations_test && DIRECT_URL="postgresql://$(whoami)@localhost:5432/uathf_migrations_test" DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy
```

```bash
DB="postgresql://$(whoami)@localhost:5432/uathf_migrations_test"; ONBOARDING_INVARIANTS_TEST_DB="$DB" DATABASE_URL="$DB" DIRECT_URL="$DB" npx vitest run tests/db/
```

## 6. Still open

- **P00.04 step 2** — read-only preflight reports for every *proposed* unique/check/FK
  change are owned by **P12.02**, which enumerates them. The three constraints
  shipped here already exist in production, so no preflight was required for them.
- The plan's P00.04 acceptance also asks that an *upgraded* database converge with
  zero drift. That is exactly what §3 exercises, and it cannot be fully rehearsed
  without a production-shaped snapshot. **Take one and rehearse §3 against it
  before running §3 for real.**
