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

---

## F5.2 — B2B API contract changes (integrator-facing; no schema change)

No `db push` needed. The POST `/api/v1/claims` body shape is unchanged
(additive optional `benefitCategory`, `invoiceNumber`), but the transport
contract tightens per §8.5/§8.6 — notify any HMS integrator before deploy:

- **`Idempotency-Key` header is now REQUIRED** for new submissions (422
  `IDEMPOTENCY_KEY_REQUIRED` without it). A resend of an EXISTING claim's
  `externalRef` still replays 200 — including claims accepted before this
  deploy — so in-flight integrations that only retry known submissions keep
  working; anything that CREATES needs the header.
- Validation failures are **422** with field issues (was 400); invalid JSON
  stays 400. Member existence is no longer leaked: unknown/foreign member is a
  non-enumerating **403** (was 404).
- Eligibility/coverage failures no longer reject: the claim is **accepted and
  routed** (D6) — integrators receive 201 + receipt and see the routed state in
  `processingState` / GET claim status.
- Same key + changed payload ⇒ **409 `IDEMPOTENCY_KEY_REUSED`** (stable code +
  `originalReceiptRef`). The 2-minute no-key heuristic dup-block is retired.
- `source` is no longer hardcoded `SMART`: facility keys record **HMS**,
  the operator key records SMART.
- **Operator-key writes require the tenant binding** (`OPERATOR_TENANT_ID`,
  BD-06 runbook) — an unbound operator key gets 403 on POST (reads unchanged).
- **Facility keys require provider entitlement** (`ContractApplicability`) to
  file for a member — consistent with the eligibility/benefits read endpoints
  since E2E-D04. Issue keys only for facilities with an active contract scope.
- New: **GET `/api/v1/claims/receipts/{receiptId}`** — authoritative receipt
  state for timeout recovery, facility-scoped.

---

## F5.5 — SyncOperation linkage columns (additive)

**Adds** `SyncOperation.receiptId` + `SyncOperation.resultClaimId` (nullable
plain refs, no FK) and `@@index([resultClaimId])`. `db push` — no data-loss
warning, existing rows untouched. Rollback: drop the two columns + index;
nothing references them outside the sync service.

---

## F8.1 — EXECUTED: production deploy with every policy OFF (2026-07-23)

**Prod:** avenue-portal.vercel.app · Supabase project `otivyuroqraiijayvkze` (PG 17).
**Sequence actually run (BD-05 pattern — schema out-of-band BEFORE code):**

1. Pre-deploy prod facts recorded: version `c56eaf1` (= branch merge-base ⇒ pure
   fast-forward), 1 tenant / 30 claims / 195 providers / **0 active API keys**
   (no integrator affected by the F5.2 contract tightening) / 1 legacy
   `enabled=true` policy row / worker never provisioned.
2. DDL generated by `prisma migrate diff` (main schema → branch schema), audited:
   4 tables, 8 enums, 10 additive ALTERs, 16 indexes, **zero DROPs**; the only
   "lossy-looking" object (Claim strong-fp unique) lands on an all-NULL column.
   Zero-drift pre-check (no object pre-existed), then applied as migration
   `claims_autopilot_m8_f81_additive` via Supabase MCP.
3. Post-DDL verification: 4/8/6 objects present; **`policies_resolving_live = 0`**
   (the legacy enabled row landed `mode=OFF status=DRAFT` — D1 fail-safe);
   fingerprint-dup pre-check clean. Row deliberately NOT hand-edited (D15 —
   it gets superseded through the governed console).
4. `feat/claims-autopilot` pushed, then fast-forwarded to `main`
   (`c56eaf1..18254fa`) → Vercel prod build → **`/api/health` serves `18254fa`,
   ok, db up**. The build's `db-sync` push no-opped against the pre-applied schema.
5. Smoke probes against LIVE prod (temporary bcrypt key minted for one facility,
   revoked + deleted after): no-key 401 · bogus-key 401 · valid-key un-entitled
   member **403 FORBIDDEN_SCOPE non-enumerating** · missing Idempotency-Key
   **422 IDEMPOTENCY_KEY_REQUIRED** · unknown receipt **404** + hash-chained
   `CLAIM:RECEIPT_LOOKUP_MISS` audit · 1.1 MB body **413** pre-parse.
   **Zero claims, zero receipts minted** (canonical: scope rejects are
   receipt-less by design). Evidence:
   `uat/claims_autopilot_2026-07-23/runs/2026-07-23_local_01/evidence/F81_prod_smoke.txt`.
6. Production integrity sweep (invariant SQL equivalents): all zeros.

**Deliberately NOT done at F8.1:** worker provisioning (DEC-08; F8.2 entry
criterion — with policies OFF interactive rails process inline and no LIVE
money can move), the ACCEPTED-path prod smoke (needs a real facility
entitlement — prod has **0 `ContractApplicability` rows**; the pilot facility
gets onboarded through the app's own contract workflow during the F7.6 human
campaign, never via SQL), and the optional provenance backfill (30 legacy
claims; marginal — run `--apply` before F8.2 if retroactive dup detection is
wanted).

**F7.6 gate handling (sponsor decision, 2026-07-23):** deploy-OFF authorized
ahead of the signed human campaign; the campaign now runs against prod-OFF
(higher fidelity). **F8.2 shadow remains gated on the signed campaign.**

**Rollback posture:** schema additive (keep), policies OFF (nothing to turn
off), breaker table empty (= closed/fail-safe), no worker. Stopping everything
= already the deployed state.
