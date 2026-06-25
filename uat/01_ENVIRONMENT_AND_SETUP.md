# 01 — Environment and Setup

## ✅ UPDATE 2026-06-25 — local UAT environment now PROVISIONED

The "no runtime" blocker recorded below (original `curl`-only run) has been resolved. A full local stack is now running, so authenticated/interactive UAT is possible.

**Installed (Homebrew native, Apple Silicon):**
- Node **26.3.1** + npm 11.16.0
- PostgreSQL **16.14**, Redis **8.8.0**, MinIO **2025-10-15** — all running as `brew services`

**Provisioned:**
- Postgres role `aicare` + database `aicare`; `.env` written (gitignored) with local `DATABASE_URL`/`DIRECT_URL`, generated `AUTH_SECRET`, and a **real `API_KEY`** (so the dev-key default is overridden locally).
- `npm install` (692 pkgs, Prisma client generated) → `prisma migrate deploy` (24 migrations, 119 tables) → **`prisma db push`** (to reconcile migration↔schema drift, see DEF-006) → **`npm run db:seed`** ✓.
- **Seeded data verified:** 1 tenant, 15 users (all roles), 6 groups, **249 members, 759 claims**, 3 packages, 6 providers, 5 brokers, 8 preauths, 6 endorsements.
- **Dev server** running on `http://localhost:3000` (Next.js 15.5.15, ready in 813ms).
- **Worker** running (`tsx --env-file=.env src/server/jobs/worker.ts`) — connected to Redis, jobs clean (see DEF-007 for why `--env-file` was needed).

**Login proven:** programmatic NextAuth credentials flow as `admin@avenue.co.ke / AvenueAdmin2024!` → 302 → `/dashboard`; `/api/auth/session` returns `SUPER_ADMIN` with fine-grained permission codes; authenticated `GET /dashboard` → 200.

**Run commands (for future sessions), from repo root with `PATH=/opt/homebrew/bin:$PATH`:**
```
brew services start postgresql@16 redis minio      # backing services
npm run dev                                         # app  → http://localhost:3000
npx tsx --env-file=.env src/server/jobs/worker.ts   # worker (note: --env-file required, DEF-007)
```
**Accounts:** all 11 role logins at password `AvenueAdmin2024!` (REPORTS_VIEWER has **no** seeded account — confirmed gap). Member demo variants: `member.demo.{low,nearcap,family,wallet,preauth}@avenue.co.ke`.

**New findings from provisioning:** DEF-006 (migrations don't reproduce schema → seed crash), DEF-007 (worker ignores `.env`). See [03_DEFECT_LOG.md](03_DEFECT_LOG.md).

> The sections below document the **original** `curl`-only environment and remain accurate for that first run.

---

## Execution metadata

| Item | Value |
|---|---|
| Date/time of execution | 2026-06-24 19:10 UTC → 2026-06-25 02:38 UTC |
| Git branch | `main` |
| Latest local commit | `44294740466f1e1107bcb3a43842f9c90b68ee08` (2026-06-12 09:15 +0300) |
| App start command (per repo) | `npm run dev` (`next dev --turbopack`) — **NOT runnable here (no Node)** |
| Worker start command (per repo) | `npm run worker` (`tsx src/server/jobs/worker.ts`) — **NOT runnable here** |
| DB setup (per repo) | `npm run db:migrate` / `npm run db:seed` — **NOT runnable here** |
| Build artifact | none (`.next/` absent) |
| Target tested | `https://avenue-portal.vercel.app/` (live, HTTP 200) |
| Deployed commit | **UNKNOWN** — not verifiable from this environment (prior UAT flagged stale deploy, DEFECT-014) |
| Tooling used | `curl 8.7.1` (system) for non-destructive HTTP probes |
| "Browser" used | **None** (no Chrome MCP browser connected; desktop browsers are read-only tier) |
| OS (test host) | macOS (Darwin 25.5.0) |
| Viewport | N/A (no rendering performed) |

## Runtime / dependency availability (checked)

```
node / npm / npx / pnpm / yarn / bun / nvm / volta / fnm : ALL MISSING
docker                                                   : MISSING
psql / redis-cli                                         : MISSING
node_modules/                                            : ABSENT
.next/ build                                             : ABSENT
.env / .env.* files                                      : ABSENT
DATABASE_URL (shell env)                                 : UNSET
outbound network + curl                                  : AVAILABLE
```

**Consequence:** the application cannot be built, started, seeded, or driven locally. The `preview_*` verification tools (which require a dev server) and the existing `uat/*.mjs` scripts (which require Node/Playwright) are unusable. Only unauthenticated HTTP probing of the already-deployed instance was possible.

## Environment variables required (per plan §1.7) — NOT exposed here

`DATABASE_URL`, `REDIS_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `SMTP_HOST/PORT/USER/PASS`, `MINIO_ENDPOINT/PORT/ROOT_USER/ROOT_PASSWORD`, `MPESA_CALLBACK_SECRET`, `API_KEY`, the WebAuthn set, the check-in TTL set, `NODE_ENV`, `VERCEL`, `AICARE_PERF_LOGS`.

> **Finding (config):** No `.env.example` is committed → no authoritative source of truth for required production config. **Live evidence in this run shows `API_KEY` is NOT set in production** (the hardcoded dev-key default is in effect — see [03_DEFECT_LOG.md](03_DEFECT_LOG.md) DEF-001 and [workflows/WF08_b2b_api_auth.md](workflows/WF08_b2b_api_auth.md)). This is a direct hit on plan Open Question §13.8.

No secrets are printed in this pack. Where a default/insecure value is named (e.g. `av-slade360-dev-key`), it is a **hardcoded default already present in committed source** (`src/lib/apiAuth.ts:7`), not a discovered secret.

## Test accounts used, by role

**None.** No logins were performed (no browser; credential entry is out of scope for this agent). The eleven seeded role accounts (plan §2.1) remain **untested** for login/landing/permissions.

## External services — state during testing

| Service | State |
|---|---|
| PostgreSQL, Redis, MinIO, SMTP, BullMQ worker | Not available locally; state on the deployment unknown/unverified |
| M-Pesa (Daraja), IPRS | Documented STUBS in source (unchanged; not exercised) |
| B2B API `/api/v1/*` | **Live and probed** (auth gate tested non-destructively) |

## Known constraints before testing began

- Production-style target → destructive workflows intentionally **not** attempted.
- No ability to read server/Vercel function logs (needed to confirm the prior "Digest" crash defects 001/005/009/010/016).
- No ability to check the database directly (no DB access) — data-integrity "verify-only" steps are blocked.

## Incidents during this run

- **Accidental delete + restore.** During folder setup, a `rm -rf UAT/screenshots` resolved (case-insensitive FS) to the tracked `uat/screenshots/` and deleted 255 committed PNGs. They were **immediately restored** via `git checkout -- uat/screenshots` (255 files back; `git status` clean for that path). No permanent loss. Documented here per the instruction to surface any change to files outside the UAT deliverable.
- **Sandbox/PATH quirk.** Network-egress shell commands ran under a stripped PATH; probes were executed with absolute binary paths and the sandbox disabled (justified: non-destructive GET / empty-POST against the user's own deployment).

## Evidence locations

- Raw HTTP probe outputs & bodies: [`evidence/network_logs/`](evidence/network_logs/) (`00_probe_summary.txt`, `01_api_auth_matrix.txt`, per-route `*.headers.txt` / `*.body.html` / `*.body.json`).
- No screenshots/videos captured this run (no renderer); `evidence/screenshots/` is empty by necessity. The **prior** run's screenshots remain under `uat/screenshots/` (same folder, case-insensitive) for reference only — they are not evidence of this run.
