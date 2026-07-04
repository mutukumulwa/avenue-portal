# Medvex TPA — Install & Operations Runbook (PR-001/PR-002)

The single documented install path. Verified against the 2026-07 remediation
build. One environment = one Postgres database + one Redis + the Next.js app +
the background worker.

## 1. Prerequisites

- Node.js ≥ 20 (worker heartbeat and env loading verified on 26.x)
- PostgreSQL ≥ 15, Redis ≥ 6
- `npm install` (runs `prisma generate` via postinstall)

## 2. Environment

Copy the template and fill every value — the worker **refuses to boot** on
missing or placeholder `DATABASE_URL` / `REDIS_URL` (PR-002; no silent
fallbacks):

```bash
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<db>
REDIS_URL=redis://<host>:6379
NEXTAUTH_SECRET=<random 32+ chars>
NEXTAUTH_URL=https://<host>
# Optional: SEED_PASSWORD (see §4), EMAIL_* for outbound mail, MinIO settings.
```

Notes:
- The June `.env` oddities (broken `PUPPETEER_EXECUTABLE_PATH`) must not be
  copied forward; leave Puppeteer settings unset unless PDF rendering is used.
- `NEXT_PUBLIC_*` demo flags must be absent from every non-local env.

## 3. Schema

Schema is currently **db-push managed** (MEDVEX_BUILD_LOG §1):

```bash
npx prisma db push        # apply schema to the configured database
```

> Migration re-baseline (PR-001 #1/#2) is planned but NOT yet executed: it
> requires a change freeze plus a `migrate resolve` pass on every existing
> environment (aicare, aicare_uat) with a pg_dump snapshot first. Until then,
> never run `prisma migrate dev/reset` in this repo — `db push` is the only
> sanctioned mechanism, and the build still runs `scripts/db-sync.mjs`.

## 4. Seed

```bash
SEED_PASSWORD='<choose one>' npx prisma db seed
```

- The seed includes ALL reference data — ICD-10, CPT, chart of accounts,
  currencies + FX, tax rates, terminology, notification templates, RBAC,
  approval-matrix defaults, reason codes, override controls, service
  categories (the former `scripts/seed-reason-codes.ts` step is absorbed;
  the script remains for re-running against existing DBs).
- It also seeds the Kenyan demo book (groups/members/claims). Reference/demo
  separation into `db:seed:demo` is the remaining PR-001 #3 work.
- **Passwords (PR-003):** the pre-2026-07 default was rendered on the public
  login page and is burned. The seed default has been rotated; set
  `SEED_PASSWORD` explicitly per environment. To rotate an already-seeded
  environment:

```bash
NEW_PASSWORD='<new value>' npx tsx scripts/rotate-seed-password.ts        # seeded domains only
NEW_PASSWORD='<new value>' npx tsx scripts/rotate-seed-password.ts --all-users
```

## 5. Run

```bash
npm run build && npm run start   # web app
npm run worker                   # background worker (separate process)
```

The worker loads `.env` itself (PR-002) — `npm run worker` works from a clean
shell. On boot it validates config and exits non-zero with a one-line error if
`DATABASE_URL`/`REDIS_URL` are missing, malformed, or placeholders.

**Heartbeat:** every 60s the worker logs `[Worker] heartbeat <ts>` and writes
the Redis key `worker:heartbeat` (TTL 180s). Alert when the key is absent or
stale:

```bash
redis-cli GET worker:heartbeat   # empty ⇒ worker dead > 3 minutes
```

## 6. Smoke checks

1. `GET /login` returns 200 and contains **no** email addresses or passwords
   (PR-003 guard: `npm run brand:guard`).
2. Log in as the admin account; dashboard renders.
3. One scheduled job completes in the worker log.
4. Data-integrity invariants hold:

```bash
npx tsx scripts/data-integrity-check.ts
```

(asserts the holds ledger and settlement reconciliation invariants — PR-011 #8
/ PR-018 #7; wire into cron alongside the worker).

## 7. UAT-remediation one-offs (already applied to aicare_uat on 2026-07-04)

- `npx tsx scripts/backfill-claim-currency.ts` — stamps explicit claim
  currency (provider contract → client currency → KES legacy rule, PR-017 D2).
  Idempotent; run once per pre-existing environment.
