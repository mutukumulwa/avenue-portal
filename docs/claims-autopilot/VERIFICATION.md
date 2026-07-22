# Claims Autopilot — Verification (real-DB / browser / load)

**Plan:** §18.2 (this file documents the real-database, browser and load commands).

## Disposable Postgres for real-DB integration proofs

The mandated concurrency/transaction proofs (F2.2, F3.5/3.6, F4.5, F7.4) run
against a THROWAWAY local Postgres — never a real environment. Integration
suites are gated so they can only touch a database explicitly designated as the
throwaway:

```ts
const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
describe.skipIf(!URL_SET)(...)
```

### Provision (macOS, Homebrew Postgres 16, no Docker needed)

The Unix-socket path has a ~103-byte limit, so use a SHORT socket dir (not the
long scratchpad path):

```bash
SCRATCH=<session scratchpad>
PGDATA="$SCRATCH/pgdata"; SOCK="/tmp/ap_uat_sock"; PORT=55432
mkdir -p "$SOCK"
LC_ALL=C initdb -D "$PGDATA" -U postgres --auth-local=trust --auth-host=trust --locale=C -E UTF8
LC_ALL=C pg_ctl -D "$PGDATA" -l "$SCRATCH/pg.log" \
  -o "-p $PORT -k $SOCK -c listen_addresses=127.0.0.1" -w start
createdb -h 127.0.0.1 -p $PORT -U postgres autopilot_uat

export DATABASE_URL="postgresql://postgres@127.0.0.1:55432/autopilot_uat"
export DIRECT_URL="$DATABASE_URL"        # prisma.config.ts reads DIRECT_URL for db push
export AUTOPILOT_TEST_DB="$DATABASE_URL" # un-skips the autopilot integration suites
npx prisma db push                        # applies the additive schema (181 tables)
```

The connection env is saved at `<scratchpad>/db.env` — `source` it in any shell.

### Run integration suites

```bash
source <scratchpad>/db.env
# a single suite:
npx vitest run tests/integration/claim-intake-receipt.integration.test.ts
# ALL autopilot suites together — MUST be sequential (the recovery sweep is global;
# suites also use disjoint seeded-claim windows by claimNumber to avoid sharing):
npx vitest run tests/integration/ --no-file-parallelism
```

Run all together (with a throwaway Redis also up) → **38 passed / 9 skipped**
(the 9 = 2 pre-existing suites gated on `P1_TEST_DB`). Integration suites are
opt-in, so the standard `npx vitest run` (no DB env) skips them and stays green.

### Teardown (fully disposable)

```bash
LC_ALL=C pg_ctl -D "$PGDATA" stop
rm -rf "$PGDATA" /tmp/ap_uat_sock
```

Nothing here touches a production or staging database; the cluster lives entirely
in the session scratchpad and is deleted on teardown.

## Status of real-DB proofs

| Package | Integration suite | Status |
|---|---|---|
| F2.2 | `claim-intake-receipt.integration.test.ts` | **PASS** — 20-way same-key ⇒ 1 receipt + 19 replays; diff-hash ⇒ 1 reserved + 9 conflicts, original never overwritten; one-way terminal transition (Postgres 16.14). |
| F2.5 | `claim-autopilot-policy-approval.integration.test.ts` | **PASS** — maker submits ⇒ PENDING_APPROVAL; maker self-approval blocked (SoD); checker activates ⇒ APPROVED/LIVE; new version supersedes prior; rejection ⇒ REJECTED (non-live); deactivation immediate. |
| F3.3 | `claim-intake-persist.integration.test.ts` | **PASS** — CREATED (totals 3500, MANUAL source, 2 lines, 1 PENDING run, receipt SUCCEEDED+linked, no post-effects); strong-link sequential + concurrent ⇒ one claim; suspected-content ⇒ separate claims; full rollback leaves receipt PROCESSING (seeded DB). |
| F3.4 | `claim-intake-service.integration.test.ts` | **PASS** — submit ⇒ ACCEPTED (claim+PENDING run, enqueue called with runId, `CLAIM:INTAKE_ACCEPTED` chained audit); replay ⇒ same claim (no 2nd); conflict ⇒ 409, original untouched; throwing enqueuer still ACCEPTED (run PENDING); getReceipt authoritative + foreign-tenant null. |
| F3.5 | `claim-intake-processing.integration.test.ts` | **PASS** — two-worker race ⇒ one claim; stale-lease reclaim; non-owner cannot complete; retry reuses run (attempt++); reprocess next-sequence + supersession; concurrent reprocess ⇒ one non-terminal run; terminal immutable; stage upsert. |
| F3.6 | `claim-autopilot-recovery.integration.test.ts` | **PASS** — processClaimRun route+mirror; error ⇒ retry below cap, FAILED (visible) at cap; recovery sweep processes un-enqueued runs; sweep reclaims a crashed worker's stale-leased run. |
| F3.6 | `claim-autopilot-queue.integration.test.ts` (Redis) | **PASS** — enqueue dedup by run id (one job); run-job handler claims+processes. Throwaway Redis on `:56379` (`redis-server --port 56379 --save "" --appendonly no`; gate `AUTOPILOT_TEST_REDIS===REDIS_URL`). |

**⚠️ Timezone finding (F3.5):** the DB session TZ is EAT (UTC+3). Prisma stores
`DateTime` as UTC in a `timestamp` (no-tz) column, so raw-SQL lease/retry
comparisons MUST use `now() AT TIME ZONE 'UTC'` — plain `now()` (timestamptz)
mis-read a future lease as ~3h expired and let a second worker double-claim it.
Fixed in `processing.ts`; any future raw-SQL time comparison must follow suit.

**Seed:** the throwaway DB was seeded once (`SEED_PASSWORD='Mdx!Seed-2026#Rotate' npx prisma db seed`) → 1 tenant (`medvex`), 6 providers, 249 members, contracts/benefits/PA/GL. Integration tests **query** for ids at runtime (resilient to reseed) rather than hardcoding.
