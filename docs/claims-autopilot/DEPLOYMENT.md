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

**Not run here:** `db push` against a live DB — no `DATABASE_URL` in this
environment. Applied during F8.1 against an approved environment.
