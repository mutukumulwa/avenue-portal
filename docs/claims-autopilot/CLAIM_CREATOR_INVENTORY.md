# Claims Autopilot — Production Claim-Creator Inventory (F0.2)

**Work package:** F0.2 — Build the production claim-creator inventory
**Plan:** [`CLAIMS_AUTOPILOT_EXECUTION_PLAN.md`](../../CLAIMS_AUTOPILOT_EXECUTION_PLAN.md) §16 F0.2, §4.3
**Captured:** 2026-07-21 at HEAD `c56eaf1` (+ branch `feat/claims-autopilot`)
**Machine guard:** [`tests/services/claim-creator-consolidation.test.ts`](../../tests/services/claim-creator-consolidation.test.ts)

This document and the guard test **must agree exactly** (F0.2 "Done when"). The
guard scans `src/**` for real `*.claim.create(` / `*.claim.createMany(` calls and
fails if any live in a file that is not on the allowlist below, or if an
allowlisted file no longer creates claims (forcing the allowlist to shrink as F5
migrations land).

Search performed (§16 F0.2): `prisma.claim.create`, `tx.claim.create`,
`.claim.create(`, `.claim.createMany(`, `ClaimsService.createClaim`,
`runClaimIntake`, `createClaimWithPreauth` across `src/`, `prisma/`, `scripts/`,
`tests/`.

---

## 1. Production creators (9 originally; #1 migrated in F5.1 — routes through `persist.ts` now)

Legend — **Class:** `CANONICAL_NOW` (already the shared owner, still to be folded
into `ClaimIntakeService`), `MIGRATE` (independent rail to converge in M5),
`DERIVED_TRANSACTIONAL` (must call the canonical persist owner inside its own
domain transaction), `TEST/SEED_ONLY`.

| # | Site | Rail / caller | Auth scope (derived?) | Channel → Source (current) | Idempotency | Fraud | Auto-adj | Audit | Txn boundary | Class | Migrates in |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ~~1~~ | ~~`src/server/services/claim-intake.ts` (`runClaimIntake`)~~ **MIGRATED (F5.1)** | Admin wizard + provider portal | ✅ CallerIdentity (operator/providerUser) → context derives tenant/provider/member/scope | ADMIN_PORTAL / PROVIDER_PORTAL → MANUAL (recorded on the receipt) | ✅ form draft UUID (replay-safe) | ✅ staged (FRAUD) | ✅ evaluate→plan→execute (inline + sweep) | ✅ chain `CLAIM:INTAKE_ACCEPTED` | ✅ atomic persist (claim+lines+receipt+run) | **DONE** — now delegates to `ClaimIntakeService`; no direct `Claim.create` | F5.1 ✔ |
| 2 | `src/server/services/claims.service.ts:374` (`ClaimsService.createClaim`) | tRPC `claims.create`; also `createClaimWithPreauth` | ✅ `ctx.tenantId` (tRPC) | TRPC → `data.source?` (caller-supplied) | ❌ none | ❌ **none** | ❌ **none** | inline `adjudicationLog` RECEIVED | ❌ | MIGRATE (legacy) | F5.3 |
| ~~3~~ | ~~`src/app/api/v1/claims/route.ts`~~ **MIGRATED (F5.2)** | B2B API POST `/api/v1/claims` (+ new receipt status route) | ✅ credential → `providerKey`/tenant-bound `integrationKey` (unbound operator refused) | API_V1 → **HMS** (facility key) / SMART (operator) — recorded on receipt | ✅ `Idempotency-Key` header REQUIRED; legacy `(tenant,provider,externalRef)` replay retained cross-boundary; request-hash 409 on changed payload | ✅ staged | ✅ evaluate→plan→execute (inline + sweep) | ✅ chain `CLAIM:INTAKE_ACCEPTED` | ✅ atomic persist (+PA attach via `origin`) | **DONE** — adapter over `ClaimIntakeService`; no direct `Claim.create` | F5.2 ✔ |
| 4 | `src/app/api/claims/import/route.ts:229` | CSV/XLSX import POST `/api/claims/import` | ✅ session + `CLINICAL_ROLES` gate | CSV_IMPORT → `"BATCH"` | ❌ **none** (re-upload duplicates) | ❌ **none** | ❌ variance-only (`computeContractedRateVariance`) | inline `adjudicationLog` | ❌ per-row, no txn | MIGRATE | F5.4 |
| 5 | `src/app/(admin)/claims/new/actions.ts:105` (`submitReimbursementClaimAction`) | Admin reimbursement form | ✅ `requireRole(OPS)` | REIMBURSEMENT → `"REIMBURSEMENT"` | ❌ none | ✅ | ✅ `processIntake` (routes) | plain `writeAudit` | ❌ | MIGRATE | F5.6 |
| 6 | `src/server/services/reimbursement.service.ts:101` (`ReimbursementService.submit`) | tRPC reimbursement submit | ✅ tenantId + submittedById | REIMBURSEMENT → `"MANUAL"` | ❌ none | ❌ none | ❌ none | ✅ audit-chain `REIMBURSEMENT:SUBMITTED` | ✅ claim + reimbursementRequest atomic | MIGRATE | F5.6 |
| 7 | `src/server/services/sync.service.ts:231` | Offline sync reconcile (BullMQ) | ✅ offline op / work-code / Slade match | OFFLINE_SYNC → `"OFFLINE_SYNC"` | ✅ `externalRef = clientUuid` (pre-check + unique index) | ✅ (`.catch`) | ✅ `processIntake` (system actor) | (SyncOperation state) | ❌ create then post-effects | MIGRATE | F5.5 |
| 8 | `src/server/services/case.service.ts:384` (`cutInterimSliceTx`) | Inpatient interim slice | ✅ tenant + case ownership | CASE_INTERIM → case-derived (`isInterimBill:true`) | implicit (entry-freeze + slice seq in txn) | ✅ after txn | ❌ (interim ⇒ shadow) | case logs | ✅ slice txn (entry freeze + claim) | DERIVED_TRANSACTIONAL | F5.8 |
| 9 | `src/server/services/case.service.ts:580` (`closeAndFile`) | Inpatient final residual | ✅ tenant + case ownership | CASE_FINAL → case-derived (`isInterimBill:false`) | first-write case-close race guard | ✅ after txn | ❌ | case logs | ✅ close txn (residual freeze + claim) | DERIVED_TRANSACTIONAL | F5.9 |

### Derived / wrapper paths (no independent `Claim.create`)

- `ClaimsService.createClaimWithPreauth` (`claims.service.ts:748`) → calls `createClaim` (#2). PA-conversion origin; migrates in **F5.7** (key `preauthId:claim-create:v1`, channel `PREAUTH_CONVERSION`). Caller: `src/app/(admin)/preauth/[id]/actions.ts:92`.
- `ClaimsService.convertPreauthToClaim` (`claims.service.ts:787`, `@deprecated`) → delegates to `createClaimWithPreauth`. Removal candidate at F5.7/F5.10.

---

## 2. Non-production creators (`TEST/SEED_ONLY` — excluded from the guard scan)

The guard scans `src/**` only, so these are structurally out of scope, but are
recorded for completeness:

- `prisma/seed.ts` — ~20 `prisma.claim.create(...)` sites (Kenyan/Uganda demo book, fixtures). Reference/demo seed; never a runtime rail.
- `tests/integration/benefit-race.integration.test.ts:84` — real-DB concurrency fixture.

These stay direct `Claim.create` by design; migrating them would couple seed/test
data to the runtime intake pipeline for no benefit.

---

## 3. Confirmed cross-rail divergences (the reasons this epic exists)

These are the concrete inconsistencies M5 removes (§4.3). Recorded now so parity
tests (F0.3, F5.x) have a checklist:

1. **Fraud/automation coverage is uneven.** #1, #3, #5, #7 run `FraudService` + `AutoAdjudicationService.processIntake`; #2 (tRPC), #4 (CSV), #6 (reimbursement service) run **neither** — claims born on those rails never get fraud-screened or auto-adjudicated.
2. **Two reimbursement creators.** #5 (admin action, `source:"REIMBURSEMENT"`, `CLM` prefix, plain audit) and #6 (service, `source:"MANUAL"`, `CLM-REIMB` prefix, audit-chain) produce structurally different reimbursement claims. F5.6 collapses them.
3. **Source labelling is inconsistent / wrong.** #3 hardcodes `source:"SMART"` for *all* B2B API claims regardless of true origin (violates §7.6 "do not label everything one source"). #2 trusts a caller-supplied `data.source`.
4. **Idempotency is partial.** Only #3 (externalRef/header) and #7 (clientUuid) are replay-safe. #1, #2, #4, #5, #6 have no transport idempotency — a lost response or double-submit creates a duplicate claim (#4 re-upload is the worst case).
5. **Audit is inconsistent.** #1 and #5 use plain `writeAudit` (not hash-chained — §4.5 correction); #6 uses audit-chain; #2/#4 write only an inline `adjudicationLog`; #3 writes no intake audit.
6. **Coverage/eligibility depth differs.** #1 runs point-in-time `coverageService.evaluate` + member/group status + benefit-in-package gates; #2 runs a shallower gate (service-date + PA + provider + package-eligibility) with **no** member-status or coverage-window check.
7. **Transaction boundaries differ.** #6, #8, #9 wrap create in `$transaction`; #1, #2, #3, #4, #5, #7 do not — post-create effects (PA update, notify, fraud, adjudication) can partially apply.

---

## 4. Allowlist (authoritative; mirrored exactly in the guard test)

Each entry is `path → reason`. The list **shrinks** as F5 migrations point rails
at the canonical persist owner. At F5.10 only the canonical persist file (plus
documented `DERIVED_TRANSACTIONAL` case adapters that call it) should remain.

| Allowlisted file | Reason it may still call `Claim.create` today | Removed by |
|---|---|---|
| ~~`src/server/services/claim-intake.ts`~~ | **REMOVED (F5.1):** `runClaimIntake` now delegates to `ClaimIntakeService` — no direct `Claim.create`. | F5.1 ✔ |
| ~~`src/app/api/v1/claims/route.ts`~~ | **REMOVED (F5.2):** the B2B route adapts onto `ClaimIntakeService` — no direct `Claim.create`, no claim-number loop. | F5.2 ✔ |
| `src/server/services/claims.service.ts` | Legacy `createClaim` (tRPC + PA conversion) pending deprecation. | F5.3 / F5.7 |
| `src/app/api/claims/import/route.ts` | CSV import rail pre-migration. | F5.4 |
| `src/app/(admin)/claims/new/actions.ts` | Admin reimbursement action pre-migration. | F5.6 |
| `src/server/services/reimbursement.service.ts` | Reimbursement service rail pre-migration. | F5.6 |
| `src/server/services/sync.service.ts` | Offline sync rail pre-migration. | F5.5 |
| `src/server/services/case.service.ts` | Inpatient interim + final; becomes `DERIVED_TRANSACTIONAL` calling the canonical persist owner inside the case txn. | F5.8 / F5.9 (reclassified, not removed) |

| `src/server/services/claim-intake/persist.ts` | **THE canonical owner** (F3.3, added) — `persistClaimWithinTransaction`. Every rail routes through it; the last entry standing after F5.10. | — (permanent) |

`persist.ts` is now the sanctioned canonical `Claim.create`. As each F5 rail
migrates onto it, that rail's row is removed from this table and the guard
allowlist, until only `persist.ts` (plus documented `DERIVED_TRANSACTIONAL` case
adapters that call it) remains.
