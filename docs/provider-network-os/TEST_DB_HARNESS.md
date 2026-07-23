# PNOS throwaway test-DB harness (local)

Same convention as the Claims Autopilot engagement: real-DB suites opt in via
`AUTOPILOT_TEST_DB === DATABASE_URL`; otherwise they self-skip. This records the
local recipe used for F0.2/F0.6 (and reusable for later phases).

## Bring-up (macOS, PostgreSQL 16 Homebrew)

```bash
export LANG=C LC_ALL=C                      # macOS initdb needs an explicit locale
SOCK=/tmp/pnospg; mkdir -p "$SOCK"          # short socket dir — scratchpad path >103B breaks unix sockets
PGDATA="<scratchpad>/pgdata-pnos"
initdb -D "$PGDATA" -U postgres --auth=trust --locale=C
postgres -D "$PGDATA" -p 54329 -k "$SOCK" -c listen_addresses=127.0.0.1 > "$SOCK/pg.log" 2>&1 &
createdb -h 127.0.0.1 -p 54329 -U postgres pnos_uat
```

## Schema + seed

```bash
cd <repo>
export DATABASE_URL="postgresql://postgres@127.0.0.1:54329/pnos_uat"
export DIRECT_URL="postgresql://postgres@127.0.0.1:54329/pnos_uat"   # prisma.config.ts uses DIRECT_URL; dotenv won't override an already-set env var
export SEED_PASSWORD='Mdx!Seed-2026#Rotate'
npx prisma db push        # NEVER migrate dev/reset (docs/INSTALL.md §3)
npx prisma db seed
```

**LANDMINE:** `.env` points `DIRECT_URL`/`DATABASE_URL` at a real local `aicare_uat@localhost:5432`. `prisma.config.ts` does `import "dotenv/config"` and `datasource.url = env("DIRECT_URL")`. You MUST export `DIRECT_URL` (not just `DATABASE_URL`) to the throwaway or Prisma targets the real UAT DB — a `--accept-data-loss` push there would add unique constraints to real data. Always confirm the printed `Datasource "db": … "pnos_uat" … 127.0.0.1:54329` line before proceeding.

## Seeded baseline (what exists after seed)

| Table | Rows | Note |
|---|---:|---|
| Tenant | 1 | single-tenant seed |
| Provider | 6 | |
| Member | 249 | across clients/groups |
| **ProviderBranch** | **0** | branches not seeded — fixtures must create |
| **ProviderContract** | **0** | no contracts — `entitledMemberWhere` denies all by default |
| **ContractApplicability** | **0** | matches spec D3 "applicability may be incomplete" — here it's empty |
| **User (providerId set)** | **0** | no provider users — fixtures must create to exercise the portal |

**Consequence:** F0.2/F0.6 cannot rely on seed data for provider scenarios. Fixtures build their own tenants/providers/branches/users/contracts/applicability. The single-tenant seed also means true cross-tenant tests need a second tenant created by the fixture.

## Run opt-in suites

```bash
export AUTOPILOT_TEST_DB="$DATABASE_URL"    # flips describe.skipIf gates on
npx vitest run <suite> --no-file-parallelism
```

## Teardown

```bash
pg_ctl -D "$PGDATA" stop      # cluster lives in scratchpad; nuke the dir to reclaim
```

Evidence is host-side/committed; the cluster is disposable.
