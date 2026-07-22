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
