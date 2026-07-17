# Background worker — production deployment (WP-7 / DEC-08)

Every automatic behaviour the platform promises runs through ONE BullMQ worker
process (`src/server/jobs/worker.ts`): pre-auth/approval escalations, renewal
reminders, suspension checks, **membership activation**, **lapse detection**,
**fund-balance alerts**, commission reconciliation, quotation expiry, report
generation, admin-fee accrual, **fraud scans**, contract lifecycle, offline
packs, **analytics refresh** (CU-OBS-6), and outbound notification email.

Vercel hosts only the web app — it has no always-on process, so until this
worker is deployed the entire async layer is dormant (FULL GO closure plan,
discovery #2). DEC-08 (accepted 2026-07-16): run it as a small always-on
worker on Railway or Fly with Upstash Redis (~US$10–15/month all-in).

## One-time provisioning (≈15 minutes, dashboard access required)

1. **Upstash Redis** — console.upstash.com → Create Database (region:
   `eu-central-1`, same as Supabase) → copy the `rediss://…` URL.
2. **Database URL** — Supabase → Connect → **Session pooler (port 5432)**
   connection string (NOT the 6543 transaction pooler; strip `?pgbouncer=true`
   if present, keep `sslmode=require`).
3. **Host** — either:
   - **Railway** (recommended, simplest): railway.app → New Project → Deploy
     from GitHub repo → set config file to `railway.worker.json` (Settings →
     Config-as-code) → add the variables from `.env.worker.example` → Deploy.
   - **Fly.io**: `fly launch --no-deploy --copy-config -c fly.worker.toml`,
     `fly secrets set DATABASE_URL=… DIRECT_URL=… REDIS_URL=… SMTP_…=…`,
     `fly deploy -c fly.worker.toml`.
4. **SMTP** — same values the Vercel app uses (pending DEC-18/DEC-25); the
   notifications worker no-ops loudly without them but everything else runs.

## How you know it's alive

- `https://avenue-portal.vercel.app/api/health` → `"workerFresh": true` and a
  recent `workerLastSeenAt` (the worker upserts a `WorkerHeartbeat` row every
  60s; fresh = seen within 5 minutes). This is the field to alert on (H13).
- Host logs show `[Worker] heartbeat <iso-timestamp>` every minute and one
  `Failed to schedule …` line ONLY if something is wrong.
- Redis key `worker:heartbeat` (TTL 180s) — legacy signal, still written.

## Fail-fast guarantees (PR-002)

The worker **exits non-zero immediately** if `DATABASE_URL` or `REDIS_URL` is
missing, malformed, or still a placeholder — it never falls back to localhost
or an OS-username database. The Docker image's build-time dummies contain
`CHANGE_ME` precisely so a missing platform env kills the process at boot.

## Local development

```bash
redis-server --port 6379 &          # or: brew services start redis
npm run worker                      # reads .env (DATABASE_URL/DIRECT_URL/REDIS_URL)
```

## Acceptance (closure plan WP-7)

1. `workerFresh: true` on prod `/api/health`.
2. Analytics facts populate (Strategic Purchasing Console stops saying
   "Awaiting analytics refresh") — the daily job, or trigger once from the
   console's Refresh action.
3. Membership-activation and lapse jobs visible in host logs on their
   schedules; fund-balance alert fires when a self-funded balance crosses its
   minimum.
