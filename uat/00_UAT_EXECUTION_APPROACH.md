# 00 — UAT Execution Approach

**Execution date:** 2026-06-24 → 2026-06-25 (UTC)
**Executed by:** UAT execution agent (Claude Code)
**Status of this run:** Executed against the constraints of the available environment. See the hard blocker in §8 — the bulk of the plan could **not** be executed and is honestly recorded as blocked, not passed.

---

## 1. Test plan source

- **Primary plan executed:** [`PRODUCTION_READINESS_TESTING_PLAN.md`](../PRODUCTION_READINESS_TESTING_PLAN.md) (997 lines, dated 2026-06-24).
- **Supporting reference material read for context (not the plan of record):**
  - [`uat/DEFECTS.md`](../uat/DEFECTS.md) — a **prior** UI-only UAT run's defect log (DEFECT-001…DEFECT-018).
  - [`uat/UAT_MASTER.md`](../uat/UAT_MASTER.md), [`uat/ACTION_PLAN.md`](../uat/ACTION_PLAN.md) — prior run notes.
  - `AICARE_TODO.md` — repo's own list of unimplemented modules.
  - Source under `src/app/api/v1/*` and `src/lib/apiAuth.ts` — read to design **safe, non-destructive** API probes.

> ⚠️ **Folder-name collision (important).** macOS is case-insensitive. The requested deliverable folder `UAT/` and the **pre-existing, git-tracked** folder `uat/` (the prior run: `DEFECTS.md`, `UAT_MASTER.md`, `*.mjs` scripts, 255 screenshots) are **the same directory** on this filesystem. This new evidence pack therefore lives **alongside** the prior-run artifacts; none of the prior files were removed. (During setup one `rm` accidentally deleted the tracked `uat/screenshots/`; it was immediately restored from git — see [01_ENVIRONMENT_AND_SETUP.md](01_ENVIRONMENT_AND_SETUP.md) §"Incidents".)

## 2. Application / system under test

**AiCare / "Avenue Portal"** — a multi-tenant medical-scheme & PSHP administration platform (Kenyan health-financing context).
- **Stack:** Next.js 15 (App Router, React 19), TypeScript, tRPC v11, Prisma 7 / PostgreSQL, NextAuth v5 (JWT), BullMQ/Redis, MinIO, Nodemailer, react-pdf/Puppeteer.
- **Deployment of record probed:** `https://avenue-portal.vercel.app/` (live, HTTP 200). This is the only running instance reachable from this environment.

## 3. Main user roles to be tested

SUPER_ADMIN, CLAIMS_OFFICER, FINANCE_OFFICER, UNDERWRITER, CUSTOMER_SERVICE, MEDICAL_OFFICER, REPORTS_VIEWER, BROKER_USER, HR_MANAGER, FUND_ADMINISTRATOR, MEMBER_USER (plus fine-grained `Permission`/`RolePermission` layer). Per plan §2.1, all seeded with password `AvenueAdmin2024!`.

## 4. Main workflows to be tested

W1–W22 per plan §3 (auth/routing; quote→bind; enrolment; lifecycle; benefit config; endorsements; preauth; claims capture; adjudication→settlement; reimbursement; provider network; broker; finance/GL; self-funded fund; member self-service; check-in/WebAuthn; USSD/SMS; service desk; analytics/reports; fraud/overrides; background jobs; HR portal), plus cross-cutting suites: visual/UI (§5), cross-browser/device (§6), security/permissions (§7), data integrity (§8), integrations (§9), performance (§10).

## 5. Assumptions needed before execution

1. Seeded UAT accounts and dataset (~249 members, 6 groups, 753 claims) exist in the target environment. **Could not be verified** — requires login (blocked).
2. The Vercel deployment is the environment of record. The **prior** run flagged this deployment as *stale vs origin/main* (DEFECT-014); the local git HEAD is `4429474` (2026-06-12) and the deployed commit is **unknown/unverified** from this environment.
3. Destructive lifecycle tests (W4/W9/W14) must run only on disposable data. Against a shared production-style deployment this is a real risk — see §7.

## 6. Environment setup required (per plan) vs available

| Needed | Available here | Result |
|---|---|---|
| Node.js + npm, `npm install` | ❌ no Node/npm/pnpm/yarn/bun on PATH | Cannot build/run app or run `uat/*.mjs` scripts |
| PostgreSQL (DATABASE_URL) | ❌ none, no `psql`, no `.env` | No local DB |
| Redis + BullMQ worker | ❌ none, no `redis-cli` | No jobs/queues |
| MinIO object storage | ❌ none | No uploads |
| SMTP | ❌ none | No email |
| A browser to drive the UI | ❌ no connected Chrome MCP; desktop browsers are tier-"read" (cannot type/click) | No interactive UAT |
| Outbound network + `curl` | ✅ | **Non-destructive HTTP probing of the live deployment is possible** |

## 7. Credentials / test accounts required

Per plan §2.1, eleven role accounts at password `AvenueAdmin2024!` plus demo member variants. **No credentials were entered in this run.** Authenticated testing is blocked (no browser; and entering credentials into web forms is outside this agent's allowed actions regardless). The only auth-related testing performed was the **B2B API key gate** via `curl` (non-destructive, see WF08).

## 8. Risks, blockers, and ambiguities found before/while starting

- **🔴 HARD BLOCKER — no runtime.** There is no Node.js, package manager, `node_modules`, Docker, local Postgres/Redis/MinIO, or `.env` on this machine. The application cannot be built or run locally, the `preview_*` tools cannot start a dev server, and the existing `uat/*.mjs` Playwright-style scripts cannot be executed. **All authenticated, interactive UAT (the large majority of W1–W22 and §5/§6/§8/§9/§10) is BLOCKED.**
- **🟠 No interactive browser.** No Chrome MCP browser is connected and desktop browsers are restricted to read-only (no typing/clicking). Login-gated flows cannot be driven.
- **🟠 Deployment-of-record uncertainty.** The deployed commit cannot be confirmed from here; prior UAT flagged a stale deploy (DEFECT-014). Any "absent feature" results could be stale-deploy artifacts rather than true gaps.
- **🟠 Destructive-test safety.** The reachable instance is a production-style deployment; running create/lapse/settle flows there is unsafe without a disposable staging tenant (plan Open Question §13.10).
- **No `.env.example`** committed → no authoritative list of required production config (plan Open Question §13.8).

## 9. What WAS executed in this run (scope actually covered)

Non-destructive, unauthenticated HTTP probes against the live deployment (`curl`, no logins, no data writes):
- **W1 (partial):** root/route-guard behaviour for protected portals; login & unauthorized pages reachable.
- **W8 / §7 B2B API security (substantive):** API-key gate across all five `/api/v1/*` endpoints, including the plan's flagged **default-dev-key** Critical check.
- **Visual/§7:** 404 branding (DEFECT-018), missing `/seed-docs` asset (DEFECT-017 pattern), `/hr` index (DEFECT-013), security response headers.

Everything else is recorded as **BLOCKED — environment** in [02_TEST_RUN_LOG.md](02_TEST_RUN_LOG.md) and [unresolved_questions/](unresolved_questions/). Nothing is marked "passed" without evidence captured in this run.

## 10. How to complete the remaining UAT

Either (a) provision a local stack (Node 20+, Postgres, Redis, MinIO, `.env`, `npm install`, `npm run db:seed`, `npm run dev` + `npm run worker`) so the `preview_*` tools and `uat/*.mjs` scripts can run; or (b) connect a Chrome MCP browser to drive the live/staging deployment interactively with the seeded accounts. See [04_READINESS_SUMMARY.md](04_READINESS_SUMMARY.md) "Recommended retest scope".
