# Feature Status — Incomplete & Stubbed Features

**Purpose:** the single place that records features which exist in the codebase but are
not yet complete. Internal build references (spec section numbers, work-package IDs,
gap codes) belong **here and in code comments only — never in user-facing UI copy**.
If a screen needs to explain a limitation to the user, it says so in plain English.

**House rule:** before shipping a page, grep your strings for `§`, `spec`, `WP-`,
`G<number>`, `Phase <n>` — if any appear in rendered text, move the reference here
and rewrite the copy.

_Last reviewed: 2026-07-03._

---

## Incomplete features

### 1. SMS delivery (offline work codes, check-in OTP)
- **Status:** stubbed — no SMS provider is configured. Phone read-out is the working
  channel for offline work codes (by design, per TPA decision); the "Send by SMS"
  path is not wired.
- **Where:** `src/server/services/secure-checkin/adapters/sms.ts` (stub adapter),
  `src/app/(admin)/offline-auth/actions.ts` (TODO hook at issuance).
- **To finish:** configure an SMS provider (Africa's Talking is the expected default),
  implement the adapter, call it from the offline-code issuance action.

### 2. HMS batch polling (pull channel)
- **Status:** partial — the **push** channel is live (`POST /api/v1/hms-batch`) and the
  manual JSON upload on the Open Cases board works end-to-end. The daily **poll** of
  facility HMS endpoints is a scheduler slot with a stubbed transport.
- **Where:** `src/server/services/hms-batch.service.ts` (`pollConfiguredEndpoints`),
  wired into the daily job in `src/server/jobs/offline-pack.job.ts`.
- **To finish:** agree an endpoint contract with a facility HMS, implement the
  per-config HTTP fetch, reuse `HmsBatchService.apply` (idempotency already handled).

### 3. Contract rule engine → auto-adjudication wiring
- **Status:** partial — the contract engine prices claims and the Contract Panel on
  the claim screen shows a **read-only preview** of its outcome, but the engine's
  per-line decisions do not yet drive auto-adjudication. The adjudicator's manual
  decision (guarded by the contract-enforcement ceiling checks) is authoritative.
- **Where:** `src/server/services/contract-engine/engine.ts` + `persist.ts`,
  preview in `src/app/(admin)/claims/[id]/ContractPanel.tsx`, manual enforcement in
  `src/app/(admin)/claims/[id]/actions.ts`.
- **To finish:** feed engine line results into `AutoAdjudicationService` as the
  pricing source, with the manual path as fallback.

### 4. Capitation settlement (pool accounting, PMPM invoicing)
- **Status:** deferred by decision (TPA, 2026-07-03) — capitation **setup** is live
  (amount + package lists on contracts, benefit funding models, capitated claim lines
  priced at 0 and pool-tagged), but the pool itself is not yet accounted or invoiced.
- **Where:** tagging in `src/server/services/funding-model.service.ts` and the
  contract engine's capitation stage; setup UI in
  `src/app/(admin)/contracts/[id]/CapitationPanel.tsx`.
- **To finish:** a capitation settlement workstream — per-member-per-month pool
  accrual, invoicing, reconciliation against pool-tagged encounters.

### 5. Advanced tariff pricing kinds
- **Status:** partial — `FIXED`, `DISCOUNT_OFF_BILLED`, `MARKUP_OVER_COST` and
  `PER_DIEM` price automatically. `EXTERNAL_TARIFF_REF`, `NET_OF_EXTERNAL`,
  `CAPITATION` and `AVERAGE_COST_POOL` tariff-line rate types route to manual
  review until their pricing lands (contract-level capitation/average-cost rules DO
  price via the engine).
- **Where:** `TariffRateType` enum in `prisma/schema.prisma`,
  `src/server/services/contract-engine/engine.ts`.

### 6. API-key → tenant mapping (multi-operator)
- **Status:** scaffold — the external API routes resolve the sole operator tenant
  rather than mapping the API key to a tenant. Correct for the current
  single-operator deployment; wrong the day a second tenant exists.
- **Where:** `src/app/api/v1/sync/route.ts`, `src/app/api/v1/hms-batch/route.ts`.
- **To finish:** key-per-tenant issuance + lookup in `src/lib/apiAuth.ts`.

### 7. One case → many claims
- **Status:** intentionally not built — one case files exactly one claim (service-layer
  rule). The schema already supports many claims per case (`Claim.caseId` is
  non-unique), so relaxing this (e.g. pregnancy + newborn under one admission) is a
  service-layer change only. Kept open per TPA decision.
- **Where:** `CaseService.closeAndFile` in `src/server/services/case.service.ts`.

### 8. Approval matrix coverage beyond claim payments
- **Status:** partial — the multi-level approval engine and the Approvals console are
  live, and **claim payments** are fully routed through them. The other action types
  (pre-auth/GOP, limit override, scheme activation, commission change, endorsement,
  tariff change, fund top-up, write-off) are supported by the engine but not every
  initiating screen opens an approval request yet.
- **Where:** engine in `src/server/services/approval-matrix.service.ts` +
  `approval-request.service.ts`; the fully-wired path is
  `src/app/(admin)/claims/[id]/actions.ts`.
- **To finish:** route each remaining action's mutation through
  `ApprovalMatrixService.resolve` the way claim payment does.

---

## Resolved / removed labels

2026-07-03 — removed internal spec tags from rendered UI copy (all moved into code
comments or this document): contract capture page ("spec §20"), contract detail
("§13"), contract analytics ("spec §15", "§8.5"), contract review queues
("spec §8.5"), renewal intelligence ("spec §11", "Spec Algorithm"), claim contract
panel ("§6" + auto-adjudication wiring disclosure).
