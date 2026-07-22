# Claims Autopilot — Schema Deployment & Rollback

**Plan:** [`CLAIMS_AUTOPILOT_EXECUTION_PLAN.md`](../../CLAIMS_AUTOPILOT_EXECUTION_PLAN.md) §9.8, §14.1
**Applies to schema as of:** branch `feat/claims-autopilot`

All Claims Autopilot schema changes are **additive** (new enums, models, columns,
indexes). No populated column is renamed or removed. The repository is
**`db push`-managed** — never run `prisma migrate dev/reset` (`docs/INSTALL.md`
§3). This document grows one section per M2 schema package.

## General rules

- Apply with `npm run db:push` (= `prisma db push`) against an approved
  disposable/staging DB first, then production during an approved change window.
- Regenerate the client with `npm run db:generate` (offline; no DB needed).
- `db push` on additive changes creates new tables/enums/indexes and leaves all
  existing data untouched. New indexes land on **empty** new tables → negligible
  deploy cost.
- **Rollback for every package below:** the new objects are unwired until the M3
  service and M5 rails point at them. Until then, rolling back means simply not
  using them; if removal is required, drop only the NEW objects listed — never an
  existing table/column. No accepted claim data lives in these objects at deploy
  time (all policies ship `OFF`; §14.1).

---

## F2.1 — Intake receipt

**Adds:**
- enum `ClaimIntakeChannel` (12 channels: ADMIN_PORTAL … SLADE360).
- enum `ClaimIntakeReceiptState` (PROCESSING, SUCCEEDED, REJECTED, FAILED).
- model `ClaimIntakeReceipt` (hashes + safe outcomes only; D16 — no raw payloads).
- back-relations `Tenant.intakeReceipts` and `Claim.intakeReceipts` (relation
  fields only; no column change on existing rows).

**Indexes added (all on the new empty table):**
- `@@unique([tenantId, scopeKey, channel, idempotencyKey])` — the durable
  idempotency boundary.
- `@@index([tenantId, strongEventFingerprint])` — cross-rail strong-link lookup.
- `@@index([tenantId, suspectedDuplicateFingerprint])` — candidate detection.
- `@@index([tenantId, state, createdAt])` — operations/reconciliation queries.
- `@@index([claimId])` — receipt-by-claim.

**Deploy:** `npm run db:push` then `npm run db:generate`. Verified offline:
`prisma validate` OK, client generated, `tests/services/claim-intake-receipt-schema.test.ts`
passes.

**Rollback:** unwired (no route writes to `ClaimIntakeReceipt` until F3.x). Drop
the new model/enums if strictly required; nothing else references them.

**Applied to the throwaway `autopilot_uat` DB** (F2.2 onward): `db push` OK,
receipt table + indexes present.

---

## F2.3 — Processing run + stage + Claim provenance

**Adds:**
- enums `ClaimProcessingTrigger`, `ClaimProcessingState`, `ClaimProcessingStageName` (14 stages), `ClaimProcessingStageState`.
- models `ClaimProcessingRun` (lease/retry/sequence/supersession) and `ClaimProcessingStage`.
- `Claim` provenance columns: `intakeSchemaVersion`, `claimRevision @default(1)`, `strongEventFingerprint`, `suspectedDuplicateFingerprint`, `processingState`, `processingRouteCode` (all additive; nullable or defaulted).
- back-relations `Tenant.processingRuns`, `Claim.processingRuns`, `ClaimIntakeReceipt.processingRuns`.

**Indexes/uniques added:**
- run `@@unique([claimId, claimRevision, workflowVersion, sequence])` (at most one run per revision/workflow/sequence).
- run `@@index([tenantId, state, nextAttemptAt])` (sweeper), `@@index([tenantId, assignedQueue, state])` (queues), `@@index([claimId])`, `@@index([receiptId])`.
- stage `@@unique([runId, stage])`.
- `Claim @@unique([tenantId, strongEventFingerprint])` and `@@index([tenantId, suspectedDuplicateFingerprint])`.

**⚠️ Deploy note — expected `db push` data-loss warning (safe here):** adding
`Claim @@unique([tenantId, strongEventFingerprint])` triggers Prisma's
conservative warning *"A unique constraint … will be added. If there are existing
duplicate values, this will fail."* This is a **false positive** for this change:
`strongEventFingerprint` is a NEW, all-`NULL` column and Postgres treats `NULL`s
as distinct, so no existing row can collide. Apply with
`npm run db:push -- --accept-data-loss` (or `prisma db push --accept-data-loss`).
Verified on `autopilot_uat`: constraint created, 0 rows affected. Before the
production run (F8.1), still confirm `SELECT tenantId, strongEventFingerprint,
count(*) FROM "Claim" WHERE strongEventFingerprint IS NOT NULL GROUP BY 1,2 HAVING
count(*)>1` returns no rows (it will — the column is unpopulated pre-backfill).

**Rollback:** unwired until F3.x. Drop the two new models + Claim columns/indexes
if strictly required; the legacy `autoAdj*` columns remain the compatibility path.

---

## F2.4 — Governed policy modes + fail-safe defaults

**Adds:**
- enums `AutoAdjudicationMode` (OFF, SHADOW, LIVE) and `AutoAdjudicationPolicyStatus` (DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, SUPERSEDED, DEACTIVATED).
- `AutoAdjudicationPolicy` columns: `name`, `version @default(1)`, `mode @default(OFF)`, `status @default(DRAFT)`, `allowAutoPartial @default(false)`, `allowedSources/allowedServiceTypes/allowedBenefitCategories/allowedProviderTiers @default([])`, `maxClaimAgeDays`, `requireAllLinesPriced/requireDocumentsComplete/requireEligibilityClear @default(true)`, `createdById`, `approvalRequestId`, `approvedById`, `approvedAt`, `deactivatedById`, `deactivationReason`. (Existing `enabled`, `maxAutoApproveAmount`, `requireCleanFraud`, `requirePreauthWhenNeeded` retained.)

**Fail-safe on deploy:** the `mode @default(OFF)` + `status @default(DRAFT)` column
defaults backfill **every existing policy row to OFF/DRAFT** — no pre-existing
policy is implicitly LIVE (D1). No unique constraint is added, so `db push`
produces **no** data-loss warning. Verified on `autopilot_uat`.

**Rollback:** unwired (resolution still reads the legacy `enabled` path until F4.1).
Dropping the new columns/enums is safe; nothing executes on `mode` yet.

**Backfill (F2.6):** the `classifyHistoricalPolicyMode` helper maps legacy rows to
OFF (or SHADOW only if the operator opts in); the F2.6 script applies it. Never
infers LIVE.

---

## F2.6 — Deployment sequence, backfill & integrity

**Additive-schema deploy sequence (M2 whole):**
1. `npm run db:push -- --accept-data-loss` (the only lossy-looking change is the
   safe all-NULL `Claim` strong-fp unique — see F2.3). Applies all of F2.1–F2.5.
2. `npm run db:generate`.
3. Report-only backfill + post-deploy safety gate:
   `npx tsx scripts/backfill-claim-intake-provenance.ts --verify-non-live`
   — exits non-zero if ANY policy resolves LIVE (must be zero right after deploy).
4. Optional provenance backfill (idempotent, non-destructive):
   `npx tsx scripts/backfill-claim-intake-provenance.ts --apply`
   — computes the non-unique `suspectedDuplicateFingerprint` for existing claims
   so retroactive duplicate detection works. Never invents idempotency keys or
   receipts (§9.8).
5. `npx tsx scripts/data-integrity-check.ts` — now also asserts the Claims
   Autopilot invariants (SUCCEEDED receipt ⇒ linked claim; strong-fp uniqueness;
   terminal run ⇒ completed). Wire into the existing integrity cron.

**Rollback (safe, non-destructive):**
`npx tsx scripts/backfill-claim-intake-provenance.ts --rollback` sets every
non-OFF policy to `OFF` + `DEACTIVATED`. Receipts and processing runs are **never
deleted** — accepted claim data is preserved (§14.1 rollback rule). Combined with
the circuit breaker (F4.7), this stops all live automation immediately.

**Verified on `autopilot_uat`:** integrity script → "✓ … claims autopilot";
backfill report → 0 claims/policies, `policiesResolvingLive: []`, `--verify-non-live`
exits 0.

---

## F3.6 — Worker & queue config

**Adds** a BullMQ `claims` queue with two job kinds (`src/lib/queue.ts`,
`src/server/jobs/claim-autopilot.job.ts`, registered in `src/server/jobs/worker.ts`):
- `claim-autopilot-run` — processes one accepted run; enqueued best-effort by
  `enqueueClaimAutopilotRun(runId, tenantId)` with `jobId=car-<runId>` so a
  duplicate dispatch collapses to one job. Web-side wiring (`setProcessingEnqueuer`)
  lands in F5.1; until then the recovery sweep drives everything.
- `claim-autopilot-recovery` — recurring every 60s (`scheduleClaimAutopilotRecovery`),
  claims PENDING/due-RETRYABLE/stale runs in bounded batches and processes them.
  **This is the safety net (D8):** accepted claims process even if an enqueue or
  worker was interrupted. Runs are worker-safe via `FOR UPDATE SKIP LOCKED`.

The worker (`npm run worker`) registers the `claims` Worker and schedules recovery
on boot; SIGTERM closes it gracefully. A run that exhausts `MAX_RUN_ATTEMPTS` (5)
becomes `FAILED` with the claim mirrored to `assignedQueue=AUTOPILOT_FAILURE`
(operator-visible). The stage evaluator is registered by F4.2 via
`setClaimProcessor`; until then the fail-closed default routes every claim to
manual adjudication.

---

## F4.7 — Circuit breaker (completes M4)

**Adds** one additive model (`db push`, no data-loss warning — new empty table):
- `ClaimAutopilotBreaker` (`tenantId`, nullable `clientId`, `isOpen @default(false)`,
  `reason`, `autoTriggered @default(false)`, `openedById`/`openedAt`,
  `closedById`/`closedAt`; `@@unique([tenantId, clientId])`, `@@index([tenantId, isOpen])`)
  and the `Tenant.autopilotBreakers` back-relation.

**Fail-safe on deploy:** no rows exist ⇒ `isBreakerOpen` is false everywhere ⇒ live
automation behaves exactly as before the deploy. A tenant-wide breaker is a row with
`clientId = null`; a client breaker names the client. Opening one is **immediate**
and blocks only live money execution — intake/receipts/evaluation/shadow/routing
continue (a blocked LIVE claim is downgraded to a stored shadow proposal routed to
`MANUAL_ADJUDICATION`). Manual open/close (reason required to close) and `tripBreaker`
auto-trips emit hash-chained `AUTO_ADJ:CIRCUIT_BREAKER_OPENED`/`CLOSED` audit rows.

**Operational kill-switch (the safe way to stop all live automation instantly):**
open a tenant-wide breaker (no policy edits, full history preserved), or run the
F2.6 `--rollback` for a durable OFF/DEACTIVATED. The commit-time `breakerCheck`
inside `decide` closes the eval→commit race (a breaker opened mid-flight throws
`StalePlanError` before any money moves).

**Rollback:** drop `ClaimAutopilotBreaker` + the back-relation; nothing else
references it and no money state depends on it.

**Verified on `autopilot_uat`:** `db push` applied cleanly (no data-loss prompt);
`claim-autopilot-breaker.integration.test.ts` → 5 passed.
