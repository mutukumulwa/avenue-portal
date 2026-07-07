# Outstanding Conditions Development Plan - Outpatient Vercel

**Created:** 2026-07-07  
**Purpose:** Build plan for the four remaining conditional-go items in `GO_NO_GO_READINESS.md`: OBS-7 fraud approval control, OBS-2 broad currency/FX, GL coverage confidence, and scale proof.  
**Current state:** The original settlement blocker is fixed and verified. These items are still not working or not sufficiently implemented for the target risk posture.

## 1. Executive Summary

The remaining work should be treated as four development workstreams, not only UAT scripts:

1. **Fraud approval gate:** Add a tenant-controlled money-control gate so claims with open fraud alerts cannot become payable until the alert is cleared or a second approval chain completes.
2. **Currency and FX:** Finish the app-wide currency display sweep, stop raw cross-currency summing, and normalise non-base-currency financial postings into UGX.
3. **GL coverage:** Make GL posting coverage observable and enforceable, then reconcile historical/imported records separately from fresh UI-created workflows.
4. **Scale:** Add repeatable performance/load tooling and settlement batch regression coverage so the 46-claim timeout class cannot return silently.

Recommended delivery order:

1. Fraud gate and currency label sweep.
2. Mixed-currency settlement guardrail: block or split mixed-currency batches first.
3. FX-normalised claim approval and settlement GL posting.
4. GL coverage dashboard/reconciliation checks.
5. Load harness and settlement stress suite.

## 2. Product / Finance Decisions Needed Before Coding

| Decision | Recommended Default | Why It Matters |
|---|---|---|
| Fraud-gate tenant setting name/default | `claims.requireFraudClearanceBeforeApproval = false` by default; enable for UAT tenant | Avoid silent policy change for existing tenants while enabling the money-control condition. |
| Fraud severity threshold | Gate open alerts with severity `MEDIUM` or above | Low/noise alerts should not freeze routine claims unless product says so. |
| Fraud gate satisfaction path | Either all open alerts resolved, or a completed dual approval request | Supports both fraud-team clearance and maker/checker approval models. |
| Who may clear fraud alerts | OPS/fraud/medical roles only; provider/member cannot clear | Keeps control independent from claim submitter and ordinary adjudicator. |
| Mixed-currency settlement policy | Phase 1: block or auto-split batches by currency. Phase 2: allow mixed only with explicit base-currency normalisation | Blocking/splitting is safer and faster than designing full multi-currency settlement accounting immediately. |
| FX rate date | Use claim decision date for approval GL; settlement date for FX gain/loss if settlement rate differs | Produces auditable accounting and avoids hidden rate drift. |
| Missing FX rate behavior | Fail closed for approval/settlement of non-base currency claims | Prevents raw KES + UGX arithmetic and under-controlled payment. |
| Historical GL gap treatment | Treat seed/imported gaps as data migration/reconciliation work, not live posting defect, if fresh UI flows post correctly | Prevents chasing seed artifacts while still documenting finance risk. |

## 3. Workstream A - OBS-7 Fraud Approval Gate

### A1. Current Code Shape

Relevant existing pieces:

- Canonical claim decision: `src/server/services/claim-decision.service.ts`
- Fraud alerts: `ClaimFraudAlert` in `prisma/schema.prisma`
- Fraud alert actions: `src/app/(admin)/fraud/[id]/actions.ts`
- Approval matrix/request engine: `src/server/services/approval-matrix.service.ts` and `src/server/services/approval-request.service.ts`
- Auto-adjudication already has `requireCleanFraud`; the missing control is human approval finalisation.

Observed gap:

- `ClaimDecisionService.decide` can approve or partially approve a claim even when `ClaimFraudAlert.resolved = false`.
- The approval matrix can route high-value claims, but fraud state is not a first-class gate when the amount is inside ordinary approval authority.

### A2. Data / Config Changes

Use `Tenant.config` for the first implementation unless the project already has a typed tenant settings helper. Add a small typed helper so config access is not scattered.

Proposed config shape:

```json
{
  "claims": {
    "requireFraudClearanceBeforeApproval": true,
    "fraudApprovalSeverityThreshold": "MEDIUM",
    "fraudApprovalGateMode": "CLEAR_ALERT_OR_DUAL_APPROVAL"
  }
}
```

Implementation tasks:

| Task | Files / Areas | Notes |
|---|---|---|
| Add typed tenant claims-control helper | `src/server/services/tenant-settings.service.ts` or existing settings service | Return defaults when config keys are absent. |
| Add setting UI if tenant settings page exists | `src/app/(admin)/settings/*` | Admin-only, with copy that makes the money-control impact clear. |
| Add audit entry when setting changes | audit helper used by settings actions | Capture old/new values and actor. |
| Optional client override | `Client.config` | Only if product wants per-client/fund behavior. Do not add until required. |

No schema migration is required if `Tenant.config` is used. If settings must be queryable/reportable, add a dedicated `TenantClaimControlSetting` model later.

### A3. Service Design

Add a dedicated gate function rather than embedding fraud logic inline:

```ts
ClaimControlService.enforceFraudGate(tenantId, claim, decision)
```

Responsibilities:

- Run only for `APPROVED` and `PARTIALLY_APPROVED`; declines should remain allowed.
- Load unresolved alerts for the claim at or above configured severity.
- If no matching alerts, return.
- If setting is off, return.
- If setting is on and alerts exist:
  - If all alerts are resolved, return.
  - Else check whether a completed, unapplied approval request exists for the exact claim and decision amount, if product allows dual approval as an alternative.
  - Otherwise create or reuse an approval request and throw a controlled operator-readable error.

Recommended approval request options:

- Reuse `ApprovalActionType.CLAIM_PAYMENT` for the first version, with payload reason `FRAUD_ALERT_CLEARANCE`, if adding a new enum would slow delivery.
- Add `FRAUD_ALERT_CLEARANCE` to `ApprovalActionType` only if reporting and role matrices need to distinguish fraud approvals from value approvals.

### A4. Claim Decision Integration

Modify `ClaimDecisionService.decide` after basic status/amount validation and before any state-changing approval side effects:

1. Resolve tenant fraud-control settings.
2. Query unresolved `ClaimFraudAlert` rows.
3. Enforce the fraud gate.
4. Only then proceed to benefit, approval matrix, contract, fund, notification, and GL side effects.

Important guardrails:

- Do not create GL journals, fund transactions, utilisation, member notifications, or settlement eligibility before the fraud gate is satisfied.
- If the gate opens an approval request, the error message should say the claim has been routed for fraud clearance/second approval.
- If a completed approval request auto-applies the decision, mark it applied in the same pattern as the existing approval request flow.

### A5. Fraud Clearance UX

Enhance existing fraud pages:

| UX Area | Change |
|---|---|
| Fraud alert detail | Show linked claim, severity, open/resolved status, notes, and clearance history. |
| Resolve/dismiss action | Require a reason and write `resolved`, `resolvedBy`, `resolvedAt`, and audit entry. |
| Claim detail | Show blocking banner when fraud gate prevents approval. |
| Approvals console | If dual approval is used, show the fraud reason in request payload/description. |
| Settlement screens | Fraud-gated claims must not appear as payable until approved after clearance. |

### A6. Tests

Add or update:

- `tests/services/claim-decision.service.test.ts`
- `tests/services/approval-request.service.test.ts`
- `tests/services/fraud-engine.service.test.ts` if alert severity behavior is shared.

Required cases:

1. Setting off: open fraud alert does not block current flow.
2. Setting on: open medium/high fraud alert blocks approval.
3. Setting on: decline remains allowed.
4. Resolved fraud alert permits approval.
5. Dual approval path opens/reuses one approval request.
6. Same adjudicator cannot satisfy maker/checker if dual approval is required.
7. Blocked fraud approval creates no claim approval GL, no settlement eligibility, and no member paid/approved notification.

## 4. Workstream B - OBS-2 Broad Currency and FX

### B1. Current Code Shape

Relevant existing pieces:

- Claim currency stamping: `ClaimsService.resolveClaimCurrency` in `src/server/services/claims.service.ts`
- FX helper: `src/server/services/fx.service.ts`
- Approval matrix already normalises non-base amounts for matrix matching.
- Claim decision uses claim currency in some messages and has missing-FX fail-safe handling.
- Settlement creation and mark-paid currently sum raw `approvedAmount` values from claims without currency grouping.
- GL journal models do not currently store currency/rate on journal entries or lines.
- Many UI screens still hardcode `KES`.

### B2. Currency Display Sweep

Create one shared presentation helper and migrate money UI to it.

Recommended helper:

```ts
formatMoney(amount, currency, options?)
formatBaseMoney(amount, options?) // defaults to UGX
```

Likely files from the hardcoded sweep:

- `src/lib/utils.ts`
- `src/lib/format-pricing-rule.ts`
- `src/app/(admin)/billing/gl/page.tsx`
- `src/app/(admin)/billing/gl/ledger/page.tsx`
- `src/app/(admin)/members/[id]/page.tsx`
- `src/app/(admin)/providers/[id]/page.tsx`
- `src/app/(admin)/providers/[id]/ProviderDiagnosisTariffsCard.tsx`
- `src/app/(admin)/providers/[id]/ProviderContractCard.tsx`
- `src/app/(admin)/billing/page.tsx`
- `src/app/(admin)/reports/*`
- `src/app/provider/*`
- `src/app/member/*`
- Report export routes/components.

Rules:

- Do not replace Kenyan-specific seed/demo/legal text blindly.
- Do replace money labels used for the Ugandan tenant's operational claims, GL, settlements, portals, and reports.
- Prefer passing actual row currency down to components instead of defaulting globally.
- Where a screen shows GL, label it as base currency, e.g. `UGX (base)`.

Tests:

- Add component tests for GL page/report document/provider/member money labels where easy.
- Add a static regression check that fails on hardcoded `KES` in core outpatient money surfaces, with an allowlist for Kenya-specific modules/seeds.

### B3. Settlement Currency Guardrail

Phase 1 should prevent the dangerous behavior immediately: raw summing of UGX + KES.

Modify `claimAdjudicationService.createSettlementBatch`:

1. Select claim `id`, `approvedAmount`, and `currency`.
2. Group eligible claims by currency.
3. If more than one currency is present:
   - Recommended first version: throw a clear error explaining that claims must be settled in separate currency batches, or add a currency selector so maker creates one batch per currency.
   - If product prefers auto-split, create one batch per currency and return a summary.
4. Store batch currency so the batch total has a denomination.

Required schema change:

```prisma
model ProviderSettlementBatch {
  currency String @default("UGX")
  baseCurrency String @default("UGX") // optional but recommended
  baseTotalAmount Decimal @default(0) @db.Decimal(19, 4) // optional for phase 2
}
```

Also add `currency` and optionally `baseCurrency/baseTotalAmount` to `PaymentVoucher`.

Phase 1 acceptance:

- A single settlement batch cannot silently include claims with different transaction currencies.
- All batch totals have an explicit currency label.

### B4. FX-Normalised Approval Accounting

Add base-currency amounts at claim decision time so GL and reports do not repeatedly infer historical rates.

Recommended schema additions on `Claim`:

```prisma
approvedBaseAmount Decimal @default(0) @db.Decimal(19, 4)
billedBaseAmount Decimal? @db.Decimal(19, 4)
fxRateToBase Decimal? @db.Decimal(19, 8)
fxRateDate DateTime?
baseCurrency String @default("UGX")
```

Alternative if you want less claim-table churn: create a `FinancialAmountSnapshot` model keyed by entity type/id. That is cleaner long-term, but slower to deliver.

Modify `ClaimDecisionService.decide`:

1. On approval/partial approval, call `FxService.normalise(tenantId, approvedAmount, claim.currency, decisionDate)`.
2. If claim currency is not UGX and rate is missing, fail closed before approval side effects.
3. Persist approved transaction amount and base amount/rate/date.
4. Pass base amount to `GLService.postClaimApproved`.
5. Keep user-facing claim detail clear: transaction amount plus UGX base equivalent for non-base claims.

Modify `GLService`:

- Treat GL amounts as base currency.
- Update descriptions to avoid hardcoded KES.
- Consider adding `currency`, `baseCurrency`, and `fxRate` metadata to `JournalEntry` or `JournalLine` if finance needs audit visibility inside GL tables.

### B5. FX-Normalised Settlement Accounting

For phase 1 currency-split batches:

- If batch currency is UGX, current base posting is straightforward.
- If batch currency is KES, use either the stored claim approval base amounts or settlement-date conversion, per finance policy.

Recommended accounting:

- Approval JE: book liability in base at decision rate.
- Settlement JE: clear liability at booked base amount.
- If settlement-date rate differs and finance requires it, post FX gain/loss line to a new account.

Schema additions if settlement FX gain/loss is implemented:

- Add GL account `4050 FX Gain` / `5050 FX Loss`, or one `4050/5050` pair matching finance preference.
- Add settlement batch fields:
  - `baseTotalAmount`
  - `settlementFxRate`
  - `fxGainLossAmount`

Modify `markSettlementBatchPaid`:

1. Fetch claim `approvedAmount`, `approvedBaseAmount`, `currency`, and stored FX fields.
2. Compute settlement base total from stored base amounts for liability clearing.
3. Do not sum raw transaction amounts unless all claims share the same currency and the display total is clearly transaction-currency only.
4. Post GL in base currency.
5. Set `paidAmount = approvedAmount` and, if added, `paidBaseAmount = approvedBaseAmount`.
6. Write voucher totals with transaction currency and base currency.

### B6. Reports and Exports

Update reports to include both transaction and base amounts where multi-currency can appear:

- Claim report
- Provider statement
- Settlement report
- GL report
- Member utilisation
- Fund utilisation
- CSV and PDF exports

Columns:

- `currency`
- `billedAmount`
- `approvedAmount`
- `paidAmount`
- `baseCurrency`
- `approvedBaseAmount`
- `paidBaseAmount`
- `fxRateToBase`
- `fxRateDate`

### B7. Tests

Add or update:

- `tests/services/fx.service.test.ts`
- `tests/services/approval-matrix.service.test.ts`
- `tests/services/claim-decision.service.test.ts`
- `tests/services/settlement-gl.test.ts`
- Report/export component tests.

Required cases:

1. UGX claim remains identity/base.
2. KES claim with rate persists base amount and posts GL in UGX.
3. KES claim without rate fails closed before approval/settlement.
4. Mixed-currency settlement creation is blocked or split.
5. KES settlement voucher shows KES transaction total and UGX base total.
6. GL remains balanced after non-base approval and settlement.
7. Reports do not sum raw mixed transaction currencies.

## 5. Workstream C - GL Coverage

### C1. Current Code Shape

Relevant existing pieces:

- `src/server/services/gl.service.ts` posts claim approved, claim void reversal, settlement paid, premium invoice/payment, co-contribution, and commission entries.
- Settlement JE is now confirmed posting for live UI-created settlement.
- The remaining uncertainty is coverage: whether all claim/settlement paths call GL consistently and whether historical/imported data is expected to have GL entries.

### C2. Development Goals

1. Make missing GL posting visible.
2. Prevent financial state transitions from silently skipping GL.
3. Separate historical/imported reconciliation from fresh workflow correctness.

### C3. Posting Coverage Audit

Create a development audit table in the plan/issue tracker and verify code paths:

| Workflow | Expected GL Source Type | Code Path | Development Action |
|---|---|---|---|
| Manual/provider claim approval | `CLAIM_APPROVED` | `ClaimDecisionService.decide` | Confirm all approval paths call `GLService.postClaimApproved`. |
| Partial approval | `CLAIM_APPROVED` | `ClaimDecisionService.decide` | Confirm only approved payer share/base amount posts. |
| Decline | None | `ClaimDecisionService.decide` | Confirm no payable. |
| Void before settlement | `CLAIM_VOID` | claim void action/service | Confirm reversal exists and original is not edited. |
| Settlement paid | `SETTLEMENT_PAID` | `markSettlementBatchPaid` | Confirm base amount and one voucher/JE per batch. |
| Reimbursement paid | `CLAIM_PAID` or reimbursement-specific type | reimbursement service/actions | Confirm not skipped. |
| Co-contribution collected/waived | `CO_CONTRIBUTION_COLLECTED` / waived | member payment/co-contribution services | Confirm linked to claim/member transaction. |
| Imports/backfills | Depends | import routes/jobs | Decide whether historical rows create GL or are marked legacy/unposted. |

### C4. Enforcement Helpers

Add a reconciliation helper:

```ts
FinancialPostingCoverageService.assertClaimPosting(tenantId, claimId)
FinancialPostingCoverageService.findUnpostedApprovedClaims(tenantId, range)
FinancialPostingCoverageService.findSettledBatchesWithoutJournal(tenantId, range)
```

Use it in:

- Admin GL diagnostics page.
- A one-off script/report for finance reconciliation.
- Unit/integration tests.

Do not make this helper mutate historical data automatically. It should report first; any backfill should be a separate approved migration.

### C5. GL UI Enhancements

Small but useful development changes:

- Add filters by `sourceType`, `sourceId`, date range, and reference on GL ledger pages.
- Add a drill-through link from claim detail to related GL entries.
- Add a drill-through link from settlement batch to voucher and journal entry.
- Label GL as base currency.
- Add a warning card for unposted approved claims / settled batches without journals if the coverage helper finds any.

### C6. Historical Backfill Plan

If historical claim volume remains much larger than GL volume:

1. Export historical claim/settlement coverage report.
2. Categorise records:
   - Seed/demo data - no backfill.
   - Imported operational data - backfill required.
   - Fresh UI-created data - should already post.
   - Declined/rejected - no GL required.
3. Draft a reversible backfill migration only for finance-approved categories.
4. Backfill with source references and a `legacyBackfill` note in journal descriptions.
5. Reconcile trial balance after backfill.

### C7. Tests

Add or update:

- `tests/services/settlement-gl.test.ts`
- `tests/services/claim-decision.service.test.ts`
- Reimbursement/co-contribution tests if not already covering GL.

Required cases:

1. Claim approval creates one balanced `CLAIM_APPROVED` JE.
2. Partial approval excludes rejected amount.
3. Settlement creates one balanced `SETTLEMENT_PAID` JE.
4. Duplicate settlement attempt creates no second JE/voucher.
5. Missing GL account blocks the financial transition.
6. Non-base claim posts base amount after Workstream B.
7. Coverage helper identifies approved claims without GL.

## 6. Workstream D - Scale and Load

### D1. Development Goals

1. Make the settlement timeout class reproducible in automated tests.
2. Add a repeatable load harness for outpatient workflows.
3. Add operational guardrails for long-running financial actions.

### D2. Settlement Batch Stress Tests

Add service-level tests for batch sizes:

- 1 claim
- 46 claims, matching the original failure size
- 100 claims
- 250 claims or agreed monthly target

Assertions:

- `markSettlementBatchPaid` uses set-based writes.
- One payment voucher is created.
- One settlement JE is created.
- All claims move to PAID.
- No per-claim transaction loop is reintroduced.
- Execution stays below a local threshold appropriate for mocked/integration test environment.

### D3. Browser / Workflow Load Harness

Recommended tool:

- Use Playwright for browser-real smoke concurrency.
- Use k6, Artillery, or a small app-approved load tool for HTTP-level sustained load.

Do not run load against production without an approved window.

Workflows to script:

- Login.
- Provider eligibility search.
- Provider claim intake.
- Claims officer queue/search/open.
- Claim compute and decision.
- Settlement create/approve/mark paid.
- Provider portal statement view.
- Member portal dashboard/utilisation.
- Reports export.

### D4. Observability

Add or verify:

- Server action timing logs around claim decision and settlement.
- Batch size, claim count, total amount, and duration in settlement audit payload.
- Safe error handling for all financial actions.
- Vercel/database log correlation by request or action reference where possible.
- Optional slow-query capture for settlement and reports.

### D5. Performance Guardrails

Development changes:

- Add pagination/filters where reports or queues load unbounded data.
- Ensure settlement queries select only required fields.
- Consider async job handoff for very large settlement batches if product expects thousands of claims in one batch.
- Add database indexes only after query plans show need. Candidate areas:
  - `Claim(tenantId, providerId, status, settlementBatchId, decidedAt)`
  - `JournalEntry(tenantId, sourceType, sourceId)`
  - `ClaimFraudAlert(claimId, resolved, severity)`

### D6. Tests / Acceptance

- Automated settlement stress test passes.
- Load harness can be run locally/staging with documented config.
- Normal and peak workflow profiles complete without duplicate financial records.
- No raw database/internal errors surface to users.
- No stranded `CHECKER_APPROVED` settlement batches after load.

## 7. Cross-Cutting Engineering Tasks

| Task | Why |
|---|---|
| Read relevant Next.js docs in `node_modules/next/dist/docs/` before changing server actions/routes | The repo's `AGENTS.md` warns this Next.js version differs from common assumptions. |
| Keep server actions thin | Put control logic in services for testability. |
| Use safe action errors on all edited financial actions | Prevent another raw Prisma leak. |
| Keep money calculations in Decimal/number conversion boundaries explicit | Avoid rounding drift. |
| Add audit events for every control decision | Fraud gate, FX fail-closed, settlement split/block, GL backfill. |
| Avoid destructive historical fixes | Report historical GL gaps first; backfill only after finance sign-off. |

## 8. Suggested Implementation Tickets

### Ticket 1 - Tenant Fraud Gate Setting

- Add typed settings helper.
- Add admin UI/control if settings UI exists.
- Add audit on setting change.
- Unit test default/off/on behavior.

### Ticket 2 - Fraud Gate Enforcement in Claim Decision

- Add `ClaimControlService.enforceFraudGate`.
- Integrate into `ClaimDecisionService.decide`.
- Reuse or extend approval requests for dual approval.
- Update fraud and claim detail UI banners.
- Add tests for blocked, cleared, and dual-approved paths.

### Ticket 3 - Shared Money Formatter and Currency Sweep

- Add shared formatter.
- Replace hardcoded KES in core outpatient money surfaces.
- Add static allowlist check for remaining KES.
- Add component/report export tests.

### Ticket 4 - Settlement Currency Guardrail

- Add settlement batch/voucher currency fields.
- Update settlement creation to group by currency.
- Block or split mixed-currency batches.
- Update settlement UI/provider statement labels.
- Add tests for mixed-currency block/split.

### Ticket 5 - Claim FX Snapshot at Approval

- Add claim base amount/rate fields or amount snapshot model.
- Use `FxService.normalise` in claim decision.
- Fail closed when non-base FX rate is missing.
- Update claim detail/member/provider/report displays.
- Add tests for UGX, KES with rate, and KES missing rate.

### Ticket 6 - FX-Normalised Settlement and GL

- Post settlement GL in base currency.
- Add voucher base totals.
- Add optional FX gain/loss handling if finance requires settlement-date revaluation.
- Update tests for non-base and mixed/split settlement.

### Ticket 7 - GL Coverage Diagnostics

- Add coverage helper/report.
- Add GL filters and drill-through links.
- Add tests for missing GL detection.
- Produce historical reconciliation output for finance.

### Ticket 8 - Scale Harness and Settlement Regression

- Add settlement batch stress tests.
- Add Playwright/k6/Artillery load scripts and README.
- Add instrumentation around settlement and claim decision.
- Run smoke profile in staging and attach report to readiness evidence.

## 9. Dependencies and Risk

| Risk | Mitigation |
|---|---|
| Fraud gate blocks too many claims | Keep default off, configure severity threshold, and use OBS-5 false-positive fix first. |
| Mixed-currency support becomes too broad | Deliver block/split guardrail first; only add full mixed batch normalisation after finance confirms policy. |
| FX missing rates create operational blockers | Add clear settings/admin rate maintenance path and fail-closed messages. |
| Historical GL data pollutes confidence | Separate fresh workflow posting from historical/imported reconciliation. |
| Load test pollutes finance data | Use dedicated UAT tenant and clearly named generated claims. |
| Schema changes affect production deploy | Add backward-compatible nullable/defaulted fields and backfill deliberately. |

## 10. Definition of Done

The development work is complete when:

- Fraud-gated approvals cannot become payable while configured open alerts remain unresolved or unapproved.
- All core outpatient money screens use tenant/claim/base currency labels correctly.
- Settlement cannot sum raw claims across currencies.
- Non-base claim approval and settlement have auditable base-currency amounts and GL entries.
- Fresh UI-created claims and settlements have complete GL coverage or fail loudly before financial state changes.
- Historical GL gaps have a finance-approved reconciliation/backfill decision.
- Automated tests cover fraud gate, FX, settlement, GL, and batch scale regressions.
- A repeatable load harness exists and has been run in an approved environment.

## 11. Verification After Development

After these tickets land, execute `OUTSTANDING_CONDITIONS_UAT_TEST_PLAN.md` as the validation layer. The UAT plan should not be used as a substitute for the development work above; it becomes the evidence pack that the built controls behave correctly in the browser and reports.

---

## 12. Delivery Log — 2026-07-07

All eight tickets implemented on `main`. Baseline was 470 tests / tsc clean; after this work **513 tests pass, `tsc --noEmit` clean, brand + currency guards green**. Dev server compiles the new/edited routes with zero server errors (auth redirects as expected). Schema additions are backward-compatible (nullable/defaulted) and reach the DB via the existing production `db-sync` step — **no live-DB push was performed from this session** (run `npm run db:push` against a target env before exercising the new columns there).

| Ticket | Status | Key artifacts |
|---|---|---|
| 1 — Tenant fraud-gate setting | ✅ | `src/server/services/tenant-settings.service.ts` (typed `Tenant.config.claims` reader, defaults, audited update); `/settings/claim-controls` admin page + action; sidebar entry. Tests: `tests/services/tenant-settings.service.test.ts`. |
| 2 — Fraud gate enforcement | ✅ | `src/server/services/claim-control.service.ts` (`enforceFraudGate`, dedicated `ClaimFraudClearance` approval entity to avoid matrix collision); integrated into `ClaimDecisionService.decide` before all side effects (excludes `systemDecision`); claim-detail blocking banner. Tests: `tests/services/claim-control.service.test.ts` + integration cases in `claim-decision.service.test.ts`. |
| 3 — Money formatter + KES sweep | ✅ | `formatMoney`/`formatBaseMoney`/`BASE_CURRENCY` in `src/lib/utils.ts` (code-display, base=UGX); GL + settlement operational labels de-KES'd; `scripts/check-currency-labels.mjs` static guard wired into `prebuild`. Tests: `tests/services/format-money.test.ts`. |
| 4 — Settlement currency guardrail | ✅ | `ProviderSettlementBatch`/`PaymentVoucher` currency + base fields; `createSettlementBatch` groups by currency and **blocks mixed-currency scoops**; mark-paid defence-in-depth check. Tests in `settlement-gl.test.ts`. |
| 5 — Claim FX snapshot at approval | ✅ | `Claim.{baseCurrency,approvedBaseAmount,billedBaseAmount,fxRateToBase,fxRateDate}`; decision computes the snapshot and **fails closed** on a missing non-base rate before any side effect; claim-detail base equivalent. Tests in `claim-decision.service.test.ts`. |
| 6 — FX-normalised settlement + GL | ✅ | `decide` posts GL + fund drawdown in base; `voidClaim` reverses in base; `markSettlementBatchPaid` posts the base total and stamps voucher/batch base fields. Tests in `settlement-gl.test.ts`. (Settlement-date FX gain/loss deferred — finance-gated, per §B5.) |
| 7 — GL coverage diagnostics | ✅ | `src/server/services/financial-posting-coverage.service.ts` (`assertClaimPosting`, `findUnpostedApprovedClaims`, `findSettledBatchesWithoutJournal`, `summarise` — report-only); `scripts/gl-coverage-report.ts` reconciliation CLI. Tests: `financial-posting-coverage.test.ts`. |
| 8 — Scale harness + settlement regression | ✅ | `tests/services/settlement-stress.test.ts` (set-based-write regression across 1/46/100/250 claims); `loadtest/outpatient.k6.js` + `loadtest/README.md`; settlement `durationMs` in the audit payload. |

**Deferred (documented, not blocking the controls above):**
- Broad report/export base-currency columns (§B6) — the data now exists on `Claim`/voucher/batch; wiring every report/CSV/PDF column is a follow-up sweep.
- GL ledger drill-through links + unposted-claims warning card (§C5) — the coverage service + CLI provide the data; the admin UI surface is a follow-up.
- Historical GL backfill (§C6) and settlement-date FX gain/loss (§B5) — both explicitly finance-sign-off-gated; report first, mutate later.
- Full multi-currency settlement accounting (§B, Phase 2) — Phase 1 block/guardrail shipped as recommended.
