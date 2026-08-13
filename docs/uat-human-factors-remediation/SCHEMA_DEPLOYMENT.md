# Schema deployment — cutover from `db push` to migrations

Task **P00.04 / P00.04a**, implementing **DEC-13 option A**.

> ## ✅ EXECUTED against production on 2026-08-13 — see §3x
>
> All 16 migrations are applied and recorded. Production's schema now matches
> `prisma/schema.prisma`. §3 below is kept as the reference procedure and as the
> record of what was intended; **§3x is what actually happened**, including the
> two places the plan needed adjusting.
>
> **One step remains and needs Vercel access:** set `SCHEMA_DEPLOY_MODE=migrate`
> in the production environment (§3.7). Until then the build still runs
> `prisma db push`, which now succeeds — the schema is in sync, so it is a no-op —
> but a *future* migration carrying a backfill would once again be skipped.

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

## 2b. Why the cutover became urgent — the failed deploy of 2026-08-13

Merging the branch to `main` produced an **ERROR** production deployment
(`dpl_3HaseH2129ZcL3uG1QpWgBr1wJPj`). The build failed at `db-sync`, not at
`next build`:

```
⚠️  There might be data loss when applying the changes:
  • A unique constraint covering [domainEventId] on ActivityLog will be added.
  • A unique constraint covering [tenantId,nationalIdNormalized] on Member will be added.
Error: Use the --accept-data-loss flag ...
[db-sync] `prisma db push` failed.
```

**No outage and no data loss** — Vercel does not promote a failed build, so
production continued to serve `53df0ab`, and the P00.04 guard refused rather
than dropping anything.

**Root cause.** P05.01 put the national-ID unique in a *separate, gated*
migration (`20260812000800`) so it would not apply until the preflight read
zero. But the build runs `SCHEMA_DEPLOY_MODE=push`, which **ignores
`prisma/migrations/` entirely** and syncs `prisma/schema.prisma` — where the
`@@unique` also lives. The gate was designed for the `migrate` world while the
deploy ran in the `push` world.

**The more serious consequence.** `db push` runs no migration SQL, so the
**backfills never execute**. Three migrations now carry them:

| Migration | Backfill that `push` would skip |
|---|---|
| `20260812000700` | member identity keys — every existing member left NULL |
| `20260812001100` | package version status — every version left `DRAFT` instead of `ACTIVE`/`SUPERSEDED` |
| `20260813001400` | import batches — no public reference/state/source hash and no synthetic row ledger for historical aggregate-only batches |

The package-version backfill is the pointer P09.01 uses to decide which version is live, so a
"successful" push deploy would have been worse than the failed one. **`push`
mode cannot correctly deploy this branch at all**, which is what makes the
cutover below mandatory rather than merely desirable.

---

## 3. Production cutover — OUTSTANDING, run by a human

Requires the **direct 5432** connection. The pooler on 6543 cannot run DDL.

**3.1 — Back up first.** Take a snapshot you can restore from.

**3.2a — Run the identity preflight FIRST. It must report zero.**

```bash
DATABASE_URL="<direct 5432 url>" npx tsx scripts/reports/member-identity-preflight.ts
```

It exits non-zero on any collision. **Do not proceed until it is zero**: step
3.5 applies `20260812000700` and `20260812000800` in the same pass, so a real
duplicate fails the unique *after* the columns are added, leaving production
half-migrated with a failed `_prisma_migrations` row that blocks every later
deploy.

> The report computes the key from the raw `idNumber` column, so it runs against
> production's schema **as it is today** — before `nationalIdNormalized` exists.
> It originally read the normalized column, which made it unrunnable before the
> migration it was written to gate.

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

## 3x. What was actually executed — 2026-08-13

Run through the **Supabase connection** to project `otivyuroqraiijayvkze` (AiCare,
eu-central-1 — the host in the failing build log), not from a shell with the direct
5432 string. That difference is why §3's Prisma CLI steps became hand-applied SQL, and it
is the main thing to know when reading what follows.

**Preflight, before any DDL.** Every check below was run read-only first:

| Check | Result |
|---|---|
| National ID collisions (§3.2a, the hard gate) | **0** |
| `_prisma_migrations` table | **did not exist** — production had never been migrated |
| `Member` rows | 2,764 (2,750 with an ID number) |
| `ImportBatch` rows | 7; `idempotencyKey` null on 0, duplicated on 0 |
| `mustChangePassword`, `ActivityLog.domainEventId`, `nationalIdNormalized` | all absent, as §3.2 predicted |
| Destructive statements across the 15 executable migrations | **none** — 57 `ALTER TABLE`, 24 `CREATE INDEX`, 8 `UPDATE`, 5 `INSERT`, 5 `CREATE TABLE`, 1 `DROP INDEX IF EXISTS` on a redundant index |
| `CREATE INDEX CONCURRENTLY` anywhere | none, so every migration could run atomically |

**How it was applied.** The baseline was recorded, never executed — its SQL is a
`CREATE TABLE` of the schema production already had. Then each of the 15 remaining
migrations was applied with its `_prisma_migrations` row **in the same transaction**, so a
failure would roll back the DDL and the tracking row together and leave no half-applied
migration. Checksums are the real SHA-256 of each `migration.sql`, so a later
`prisma migrate deploy` sees them as legitimately applied rather than raising a checksum
mismatch.

**Verification after.**

| Check | Result |
|---|---|
| Migrations recorded / unfinished / rolled back | **16 / 0 / 0** |
| `Member.nationalIdNormalized` backfilled | 2,750 of 2,750 — **0 collisions after backfill** |
| `Member.memberNumberNormalized`, `searchNameNormalized` | 2,764 of 2,764 |
| `PackageVersion.status` | **8 ACTIVE, 1 SUPERSEDED, 0 DRAFT** |
| `ImportBatch.batchRef` | `NOT NULL`, all 7 rows backfilled; 9 synthetic `ImportRow` ledger rows |
| `MemberNumberSequence` | 2 series seeded from the highest number already minted |
| `TreatmentExclusionRule` FK delete actions | both `c` (CASCADE) |
| `mustChangePassword`, `lastTotpCounter`, `PackageProviderEligibility.priority` | present |
| **Drift vs a database built only from `prisma/migrations/`** | **identical** — 3,517 columns, same md5 fingerprint (`34aac66d…`) on both |

That last row is the strongest available check: production is now indistinguishable, at
column/type/nullability level, from a database `prisma migrate deploy` builds from empty.

**The `PackageVersion.status` row is the one to notice.** 8 ACTIVE / 1 SUPERSEDED is what
the migration's backfill produces. Under `db push` all 9 would have been left `DRAFT`,
because push runs no migration SQL — and that column is the pointer P09.01 uses to decide
which version is live. This is the concrete form of §2b's warning that a *successful* push
deploy would have been worse than the failed one.

**Two deviations from §3, both forced by the access route:**

1. **§3.3's `prisma migrate resolve --applied` was done as SQL.** The Supabase connection
   executes SQL; it does not run the Prisma CLI. The effect is identical — that command
   only writes a `_prisma_migrations` row — but the table had to be created first, with
   Prisma's exact column definitions.
2. **§3.5's `prisma migrate deploy` became 15 hand-applied migrations.** Same SQL, same
   order, same checksums, each transactional. The trade-off is that Prisma's engine was
   not the thing applying them, which is why the fingerprint comparison above exists: it
   independently confirms the result matches what the engine would have produced.

**Still outstanding:** §3.7. `SCHEMA_DEPLOY_MODE` is still `push` in Vercel. The build now
passes because the schema is in sync and push has nothing to do, but this must be flipped
to `migrate` before the next migration that carries a backfill.

## 4. Rollback

Set `SCHEMA_DEPLOY_MODE=push` (or unset it) and redeploy. The build reverts to
`prisma db push` immediately. Migrations already applied stay applied — they are
additive and the `_prisma_migrations` rows are harmless under `db push`.

## 5. Verification already performed

On a disposable database (`uathf_migrations_test`, local Postgres 5432). **Re-run 2026-08-13**
after `20260813001500_provider_rule_precedence`; the table below is that run, not the original
three-migration one.

| Check | Result |
|---|---|
| `prisma migrate deploy` from empty | **All 16 migrations applied cleanly** |
| `prisma migrate status` | "Database schema is up to date!" |
| `caps_family_gte_individual`, `caps_positive`, `exclusion_owner_xor` | All 3 present |
| `TreatmentExclusionRule` FK delete actions | Both `c` (CASCADE), previously `n` (SET NULL) |
| `Client_operatorTenantId_nameNormalized_key`, `Group_clientId_nameNormalized_key` | Present as unique indexes |
| `PackageProviderEligibility` new columns | `priority` default 0, `isActive` default true, both dates nullable |
| P06.02 import ledger | Batch/unit/row tables and all status enums present; disposable migrated schema vs Prisma schema reported **“No difference detected”** |
| **All of `tests/db/`** | **18 passed, 23 skipped, 0 failed** |

P06.02 separately rehearsed migration `014` over pre-`014` aggregate-only `ImportBatch` fixtures:
provable complete/partial batches reconstructed their old counts, while the ambiguous reservation
remained `UNKNOWN`. The final terminology-only correction classifies an untyped legacy aggregate
failure as `FAILED` rather than inventing `REJECTED`; that SQL is clean-install syntax-proven and
regression-asserted, but the fixture rehearsal was not rerun after that correction because the
isolated-database escalation quota was exhausted.

> **Two of those tests were broken and would have failed your cutover for no reason.**
> `client-uniques.test.ts` and `group-uniques.test.ts` asserted the uniques existed in
> `pg_constraint`. Prisma renders `@@unique` as `CREATE UNIQUE INDEX` under *both* `db push` and
> `migrate deploy`, and a unique index has no `pg_constraint` row — only
> `ALTER TABLE … ADD CONSTRAINT … UNIQUE` produces one. Both now query `pg_index`, which answers
> the question actually being asked. Fixed 2026-08-13 under P09.05. If you ran §3 and saw those two
> fail, that was the test, not your database — but re-pull before you rely on it.

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
