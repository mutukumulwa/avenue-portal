# Digital Contract Module — Build Log & Resume Pointer

**Purpose:** durable, resumable record of implementation progress against
`DIGITAL_CONTRACT_MODULE_SPEC.md`. If a session ends mid-work, the next session
reads this file top-to-bottom, checks the **RESUME POINTER** and the phase
checklists, and continues without re-deriving context.

**Spec:** `DIGITAL_CONTRACT_MODULE_SPEC.md` (1017 lines, v1.0 2026-07-02).
**Started:** 2026-07-02.

---

## RESUME POINTER (update this every time you stop)

- **Current phase:** Phases 1–4 built & tested; engine wired into adjudication. Next = Phase 5.
- **Next action (pick up here), in priority order:**
  1. **Phase 5** — analytics suite (§15 datasets 1-15), average-cost reconciliation automation (finance maker-checker), override-pattern→amendment suggestions, unmapped-service suggestions from SVC-002 clusters, capitation pool settlement.
  2. Remaining polish (any order): Manual-queue UI (§8.5 — `Claim.assignedQueue` now persisted); Rule-builder UI (§11.5 — `contractRules.*` + `contractEngine.evaluateLine` sandbox exist); NET_OF_EXTERNAL/EXTERNAL_TARIFF_REF pricing from `ExternalTariffTable`; DocumentationRule stage-7 (`applyDocumentation`); wire OverrideControl into `override.service`; ServiceCategory seed from Masters; contract-detail Tariffs/Applicability widgets; BullMQ lifecycle jobs; intake pre-check into `intake.service.ts`.
- **Engine gate flag:** contract-engine auto-adjudication gates are OFF by default. Set env `CONTRACT_ENGINE_GATES=1` to enable CONTRACT_MATCH / PRICING_COMPLETE routing. Provenance persistence runs regardless (always on).
- **Blocked on:** nothing.
- **Last verified green:** 2026-07-03 — engine wired into `auto-adjudication.service.ts`
  (opt-in gates + always-on provenance persist via `ContractEngineIntegration.evaluateAndPersist`);
  `npm run typecheck` clean; production source `eslint` clean; **`vitest` 221/221 service
  tests pass** (incl. `contract-engine-persist.test.ts` 3 tests). Test files use `any` in
  prisma mocks per the existing repo convention (repo tests are not lint-clean by that rule).
- **Verification note:** Browser pixel-render still blocked by the preview harness not
  persisting the next-auth session cookie (callback 200 → bounces to /login). Engine
  correctness is instead proven by the vitest suite. To eyeball UI, log in via a real
  browser as `admin@medvex.co.ug` / `MedvexAdmin2024!` and open `/contracts` or any claim.
- **Seeding note:** run tenant seeds/scripts with `npx tsx --env-file=.env <script>` — plain
  `tsx` does not load `.env` and connects to the wrong DB.

> **IMPORTANT — schema apply method:** This project's live dev DB is *ahead* of the
> committed migration history (team uses `npx prisma db push`; there is a `db:push`
> script and pre-existing drift on Tenant/User/Terminology). `prisma migrate dev`
> tries to RESET the DB — do **not** run it. Apply schema changes with
> `npx prisma db push` (add `--accept-data-loss` only when the sole warning is a
> new unique constraint on a fresh all-null column, as with currentVersionId).

---

## Environment / conventions learned (do not re-discover)

- **Stack:** Next.js (app router, custom in-repo build — read `node_modules/next/dist/docs/` before Next APIs), tRPC v11, Prisma 7 (`@prisma/client` 7.7), Postgres (`localhost:5432` db `aicare`), Vitest.
- **Migrations:** `npx prisma migrate dev --name <name>` (config in `prisma.config.ts`). Existing 23 migrations live in `prisma/migrations/` named `YYYYMMDDHHMMSS_desc`.
- **Scripts:** `npm run db:migrate`, `db:generate`, `db:seed`, `typecheck` (`tsc --noEmit`), `lint` (eslint), `worker` (BullMQ jobs `src/server/jobs/worker.ts`).
- **Services:** `src/server/services/*.service.ts`. Static-class style (see `provider-contracts.service.ts`).
- **Routers:** `src/server/trpc/routers/*.ts`, registered in `src/server/trpc/router.ts` (`appRouter`).
- **Admin UI:** `src/app/(admin)/<feature>/`. Contract stub currently lives under `src/app/(admin)/providers/[id]/contracts/` — spec §11 wants a top-level `/(admin)/contracts`.
- **Conventions (spec §5):** multi-tenant `tenantId`, cuid ids, never-delete (`isActive` + effective dating), `createdAt/updatedAt`, money `Decimal @db.Decimal(14,2)`, sensitive mutations → audit chain (`audit-chain.service.ts`).
- **Terminology:** all user-facing strings go through `terminology.service.ts`.
- **Brand guard:** `scripts/check-no-avenue.mjs` runs on prebuild — don't introduce the word "avenue" in code.

### Key existing entities (reuse, don't rebuild)
- `Provider` (schema ~2384): flat `contract*` summary fields kept for back-compat; contract truth is in `ProviderContract`.
- `ProviderContract` (~2511): DRAFT/ACTIVE/SUSPENDED/EXPIRED/TERMINATED, payment terms, unlistedServiceRule, supersededBy/predecessor chain.
- `ProviderTariff` (~2437): per-provider/contract/client tariff lines, TariffType NEGOTIATED/GAZETTED/PUBLISHED, requiresPreauth, maxQuantityPerVisit, effective dating.
- `ProviderDiagnosisTariff` (~2467), `ProviderContractExclusion` (~2560).
- `ProviderContractsService.resolveClaimLineRates()` — existing rate resolver (becomes engine stages 3–4).
- `Claim` (~2040) / `ClaimLine` (~2209): adjudication fields incl. `contractedRate`, `autoAdj*`, per-line decision. `declineReasonCode` is a String (spec migrates to FK).
- `Client` (~114): PayerType {INSURER, HMO, EMPLOYER_SELF_FUNDED}; hierarchy via parentClientId; per-client currency.
- `Group` (~682) = scheme; `Package/PackageVersion` (~1723/1753) = plan.
- `ApprovalMatrix/ApprovalStep/ApprovalRequest/ApprovalDecision` (~1477+) — reuse for contract approvals.
- `OverrideRecord` + `OverrideType`/`OverrideStatus`/`OverrideReasonCode` enums (~4675+) — extend enum for contract override types.
- `ExceptionLog` (~3333), `AuditLog` (~3269), `AdjudicationLog` (~2236).
- `AutoAdjudicationPolicy` — named gates feed auto-adjudication.
- `PreAuthorization` (~2262).

---

## Phase status

| Phase | Title | Status |
|---|---|---|
| 1 | Contract structuring foundation | CORE DONE (schema+service+router+UI); polish + intake wiring + lifecycle jobs remain |
| 2 | Tariff-based claims automation | ENGINE CORE DONE (schema+engine+reason-codes+claims panel+tests); adjudication-persist wiring + queues UI remain |
| 3 | Rule engine (full) | ENGINE + DATA MODEL DONE (stages 5-8, packages/case-rate/avg-pool/exclusions/preauth/submission, V12, rule CRUD, override controls, tests); rule-builder UI remains |
| 4 | Markdown extraction & assisted creation | DONE (zero-hallucination extractor, import pipeline, review UI, tests); LLM-assisted clause tagging optional enhancement |
| 5 | Advanced automation & optimisation | not started |

---

## Phase 1 — Contract structuring foundation

Spec §16 Phase 1 + §5.1–5.4, §4.2–4.4, §11.1–11.3.

### 1.1 Schema extensions — STATUS: DONE ✅ (applied via db push, typecheck green)
- [x] `PayerType` enum: add `GOVERNMENT_SCHEME`, `TPA_CLAIMS_MANAGER` (§5.3)
- [x] `ProviderContractStatus`: add `UNDER_REVIEW`, `PENDING_CLARIFICATION`, `APPROVED`, `SUPERSEDED`, `ARCHIVED` (§4.2)
- [x] NEW enum `ContractType` (§3.3)
- [x] NEW enums: `ContractBranchScope`, `ContractExecutionStatus`, `PaymentTermType`, `SubmissionWindowBasis`, `BalanceBillingPolicy`, `ReconciliationCadence`, `TaxInclusivity`, `ContractVersionStatus`. Reused existing `EligibilityRule` for applicability inclusion.
- [x] `Provider` EXTEND: legalName, registrationNumber, licenceNumber, licenceExpiry, taxPin, facilityLevel, bankDetailsRef (§5.2)
- [x] NEW `ProviderBranch` (§5.2)
- [x] NEW `ProviderAlias` (§5.2)
- [x] `ProviderContract` EXTEND (§5.1) — all listed fields added
- [x] NEW `ContractVersion` (§4.4/§5.14)
- [x] NEW `ContractApplicability` (§5.4)
- [x] NEW `ContractBranch` (§5.1)
- [x] NEW `ContractSourceDocument` (§3.2)
- [x] `ProviderTariff` EXTEND: versionId, branchId (pricing-rule fields deferred to Phase 2/3)
- [x] `Claim` EXTEND: providerBranchId, contractId FK, contractVersionId, contractFamilyIds(String[]), assignedQueue
- [x] back-relations on Provider, Client, Tenant
- [x] Applied via `prisma db push --accept-data-loss`; `prisma generate`; `typecheck` green

### 1.2 Service layer — STATUS: DONE ✅
File: `src/server/services/contract-lifecycle.service.ts`
- [x] `ContractLifecycleService.validate()` — §13 activation gates V1–V4, V6, V10, V13, V16 (Phase-1 subset; V7–V12/V14–V18 land with their phases)
- [x] Status machine `TRANSITIONS` map + `assertTransition` (§4.2)
- [x] Transitions: submitForReview, approve (maker≠checker enforced vs createdById+submittedById), requestClarification, returnToDraft, activate (validation gate + unsigned-override + backdate-horizon check + version-1 snapshot + suspend-overlaps + syncProviderSummary), suspend, reinstate, terminate, archive
- [x] `contractSnapshot()` for versioning/diff
- [x] `precheck()` — intake engine stages 1–2 (CON-001/002/008/010), branch-scope + payer-applicability filtering
- [x] All sensitive transitions logged to the immutable audit chain (`auditChainService.append`)
- [ ] TODO(next): wire `precheck` into `intake.service.ts`; BullMQ lifecycle jobs (auto-activate/expire, NO_CONTRACT re-sweep)

### 1.3 tRPC router — STATUS: DONE ✅
- [x] `src/server/trpc/routers/contracts.ts` — list, getById, create, update, validate, all lifecycle transitions, applicability add/remove, contract-branch add/remove, source-doc add, precheck
- [x] `src/server/trpc/routers/providerBranches.ts` — branch CRUD + alias CRUD
- [x] Both registered in `src/server/trpc/router.ts` (`contracts`, `providerBranches`)

### 1.4 UI — STATUS: CORE DONE ✅ (RSC + server actions — matches app convention; NOT client tRPC)
- [x] `/(admin)/contracts/page.tsx` — list with status/type filters + search (§11.1)
- [x] `/(admin)/contracts/new/page.tsx` — manual create form (minimum-viable fields §20) (§11.3)
- [x] `/(admin)/contracts/[id]/page.tsx` — detail: header/status chip, lifecycle action bar (status-gated buttons), Overview terms, family tree, applicability & branch scope, live §13 validation report, versions, counts (§11.2)
- [x] `/(admin)/contracts/actions.ts` — server actions for create + all lifecycle transitions (errors surfaced back to detail via `?error=`)
- [x] Sidebar nav entry "Contracts" added (`AdminSidebar.tsx`, UNDERWRITING roles)
- [ ] TODO(next): Tariffs tab (grid + CSV upload §11.4), Applicability/Branch/Source-doc management widgets, Versions & audit tab (§11.7), wizard "import mode" (Phase 4)

### Phase 1 acceptance (spec §16)
- CIC-style pricelist contract fully captured, approved, activated
- claim intake shows correct contract match
- maker≠checker enforced
- all events on audit chain

---

## Phase 2 — Tariff-based claims automation

Spec §16 Phase 2 + §5.5, §5.6, §5.13, §6.3, §6.4, §6.8, §8.5, §10.

### 2.1 Schema — DONE ✅ (db push + typecheck + tests green)
- [x] Enums: `TariffRateType`, `UnitOfMeasure`, `FrequencyPeriod`, `CodingSystem`, `PatientClass`, `ReasonSeverity`
- [x] `ProviderTariff` EXTEND (§5.6): serviceCategoryId, providerServiceCode, provider/standardDescription, codingSystem, rateType, discount/markupPct, min/maxPayableAmount, unitOfMeasure, quantity/frequencyLimit+frequencyPeriod, gender/age restrictions, diagnosisRestriction, requiresReferral, rateMissing, sourceRef, notes
- [x] NEW `ServiceCategory` + `ServiceCategoryAlias` (§5.5)
- [x] NEW `ServiceMappingMemory` (§6.3)
- [x] NEW `AdjudicationReasonCode` catalog (§5.13)
- [x] `ClaimLine` EXTEND (§5.13/§6.4): serviceCategoryId, contractId, contractVersionId, matchedRuleType/Id, payableSource, reasonCodeId, contracted/shortfall/disallowed/memberLiability/payerLiability/providerWriteOff/externalRebate amounts, quantityApproved, ruleTrace
- [x] Tenant back-relations

### 2.2 Reason-code catalog — DONE ✅
- [x] `reason-codes.service.ts` — `REASON_CODE_CATALOG` (§10.1: CON/ELG/SVC/PRC/LIM/EXC/AUTH/DOC/SUB/DUP/MAN, 40 codes) with provider/member/internal wording, severity, remedy, override types, escalation queue
- [x] `ReasonCodeService.seedForTenant()` (idempotent upsert) + `resolve()`
- [x] `scripts/seed-reason-codes.ts` — run with `npx tsx --env-file=.env scripts/seed-reason-codes.ts` (seeded 40 for the tenant)

### 2.3 Contract rule engine — DONE ✅ (stages 1–4 + 9)
Module: `src/server/services/contract-engine/` (`types.ts`, `engine.ts`)
- [x] `ContractEngine.evaluateClaim(ctx)` — pure/read-only, deterministic; emits per-line + claim-level RuleTrace
- [x] `evaluateClaimById(tenantId, claimId)` — loads claim/lines/payer, calls evaluateClaim
- [x] Stage 1–2 matching/validity via `ContractLifecycleService.precheck`
- [x] Stage 3 mapping: code → exact description → mapping-memory → fuzzy(Dice, ≥0.92, auto only if memory-confirmed) → unlisted rule
- [x] Stage 4 pricing: FIXED (LOWER_OF default), PER_DIEM (uses lengthOfStay), DISCOUNT_OFF_BILLED, MARKUP_OVER_COST; min/max caps; quantity caps → LIM-001; rateMissing → PRC-002; deferred rate types (EXTERNAL/NET/CAPITATION/AVG) → MAN-001 pend
- [x] Shortfall routing: provider write-off default, member liability only when balanceBillingPolicy=ALLOWED (§6.4 O19)
- [x] Stage 9 decision synthesis: per-line decision + claim decision (AUTO/PARTIAL/DECLINED/UNDER_REVIEW) + assignedQueue from reason→queue map
- [ ] TODO(next): persist results to ClaimLine + wire named gates into `auto-adjudication.service.ts` (§8.3); stages 5–8 are Phase 3

### 2.4 tRPC + UI — DONE ✅ (read-only)
- [x] `contractEngine` router: `evaluateClaim` (with reason wording), `evaluateLine` (sandbox §11.5), `seedReasonCodes` — registered
- [x] Claims Contract panel `src/app/(admin)/claims/[id]/ContractPanel.tsx` embedded in claim detail (§11.6): matched contract link, claim decision + queue, totals, per-line mapping→rule→payable/shortfall→reason→decision
- [ ] TODO(next): tariff-editor fields for §5.6; queues UI (§8.5); make the panel actionable (overrides)

### 2.5 Tests — DONE ✅
- [x] `tests/services/contract-engine.test.ts` — 6 tests: §10.3 ex.1 (PRC-001 shortfall + write-off), ex.1b (LOWER_OF pays billed), ex.8 (SVC-002 refer), CON-001 no-contract, LIM-001 qty cap, determinism. Full suite 204/204 green.

---

## Phase 3 — Rule engine (full)

Spec §16 Phase 3 + §5.7–5.11, §6.5–6.8, §7, §8.4, §9.1–9.3.

### 3.1 Schema — DONE ✅ (db push + typecheck + tests green)
- [x] Enums: `ExclusionLevel`, `ContractRuleScope`, `PricingRuleKind`, `PackageTriggerType`, `ComplicationRule`, `PackageComponentType`, `PreauthTriggerType`, `PreauthConsequence`, `ContractDocumentType`, `DocConsequence`
- [x] `ProviderContractExclusion` EXTEND (§5.9): level, serviceCategoryId, icdCodes, packageId, memberCategory, dateFrom/To, appliesToBranchId, sourceRef
- [x] NEW `PricingRule` (§5.7), `ContractPackage` + `PackageComponent` (§5.8), `PreauthRule` (§5.10), `DocumentationRule` (§5.11), `ExternalTariffTable` (§5.7), `OverrideControl` (§9.3)
- [x] `OverrideType` enum EXTEND (§9.1): 15 contract-claims override types + CONTRACT_BACKDATE
- [x] `Claim.avgCostPoolId`; ProviderContract + Tenant back-relations
- [x] `override.service.ts` OVERRIDE_APPROVER_ROLES extended for the new types

### 3.2 Engine stages 5–8 + precedence — DONE ✅
`contract-engine/engine.ts` (+ types)
- [x] Stage 5 exclusions (`applyExclusions`): EXC-001/002/003 by level; requiresReferral → EXC-004 (runs after pricing for dispute value)
- [x] Stage 6 pre-auth (`applyPreauth`): SERVICE_LIST/AMOUNT_THRESHOLD/ADMISSION/ALWAYS triggers; emergency exemption; AUTH-001 (reject/route/penalty), AUTH-002 validity, AUTH-003 amount, AUTH-004 coverage
- [x] Stage 8 PER_VISIT_CASE_RATE (`applyCaseRate`): non-carve-out lines fold into a fixed AS_CONTRACTED payable (PRC-005); carve-outs price separately + preauth
- [x] Stage 8 AVERAGE_COST_POOL (`applyAverageCostPool`): pay billed, no shortfall, tag `avgCostPoolTag`
- [x] Stage 8 package assembly (`assemblePackages`): package-beats-itemised (PRC-005 components, disallowed excess); EXCLUDED components priced separately (complications)
- [x] Stage 8 submission window (`checkSubmissionWindow`): SUB-001 claim-level
- [x] Precedence: package overrides line items; line>category>contract; exclusion beats inclusion (§7 — money conflicts route, not auto-picked)
- [x] Engine result: `avgCostPoolTag`, `submissionLate`; queue routing extended (AUTH→MISSING_PREAUTH, DOC/SUB→MISSING_DOCS)

### 3.3 Validation V12 + rule CRUD + override controls — DONE ✅
- [x] `ContractLifecycleService.validate` adds V8 (package trigger) + V12 (conflicting equal-specificity pricing rules block activation)
- [x] `contractRules` tRPC router: CRUD for PricingRule / ContractPackage(+components) / PreauthRule / DocumentationRule / ContractExclusion + `listForContract`
- [x] `override-control.service.ts` + seeder (16 conservative defaults; MAP_SERVICE_TO_TARIFF + CREATE_TEMPORARY_RATE reusable; payer-notify on pay-above/expired/escalate-payer). Seeded via the reason-codes script.

### 3.4 Tests — DONE ✅
- [x] `contract-engine.test.ts` now 13 tests: §10.3 examples 1,1b,8 (Phase 2) + 2 (case rate), 3 (carve-out AUTH-001), 4 (package), 5 (package+NICU excluded), 6 (EXC-004 referral), 7 (SUB-001), 9 (avg-cost pool), LIM-001, CON-001, determinism. Full suite 211/211.

### Phase 3 remaining (polish)
- [ ] Rule-builder UI (§11.5) — backend (`contractRules.*`) + sandbox (`contractEngine.evaluateLine`) exist; the visual IF/THEN composer + conflict-lint UI is not built
- [ ] NET_OF_EXTERNAL / EXTERNAL_TARIFF_REF pricing (schema + ExternalTariffTable exist; engine currently routes these tariff.rateType values to MAN-001 — implement resolution from ExternalTariffTable)
- [ ] Wire OverrideControl into `override.service` request/approve (maxFinancialImpact block, dual-approval threshold)
- [ ] DocumentationRule stage-7 check in the engine (rules CRUD + schema exist; engine does not yet evaluate DOC-001/002 — add `applyDocumentation`)

---

## Phase 4 — Markdown extraction & assisted creation

Spec §12 + §11.3 import mode. Acceptance: family-A ≥90% readable rows extracted;
100% unreadable flagged not guessed; ambiguous dates always block; every field
traceable to source or reviewer.

### 4.1 Schema — DONE ✅
- [x] `ExtractionStatus` enum + `ContractExtraction` model (entities/tariffCandidates/ambiguities/reviewAnswers/stats JSON, provenance) + Tenant back-relation

### 4.2 Extractor — DONE ✅ (deterministic, rule-based, zero-hallucination)
`contract-extraction.service.ts`
- [x] `parse(markdown)`: page split (`## Page N`), OCR row cleaning, **trailing-amount** detection (thousands/decimal/bare 3-6 digit at line end — never embedded like "50KM"), rateMissing for structured rows with no readable amount (O2), content-hash de-dup (O7)
- [x] Entity extraction: effective-date candidates (context-gated by "effective/starting from"), review-based validity (O4), external refs (CN-numbers), provider names, currency/tax stated
- [x] Ambiguity detection → mandatory review questions: AMBIGUOUS_EFFECTIVE_DATE (O3, **blocking**), EFFECTIVE_DATE_UNSTATED (blocking), VALIDITY_REVIEW_BASED, CURRENCY_UNSTATED, TAX_UNSTATED, RATE_MISSING_ROWS (blocking)
- [x] `createExtraction()` (persist, status PARSED) + `commit()` (write kept candidates as tariff lines incl. rateMissing → DRAFT contract; never activates)
- [x] Sanity-checked on real corpus: CIC 55 priced/60 missing, Amanah 80/70, GA 182/51; currency correctly UNSTATED (corpus never prints ISO, §2.5e)

### 4.3 API + UI — DONE ✅
- [x] `contractImport` tRPC router: preview / create / list / get / submitReviewAnswers / commit
- [x] `/(admin)/contracts/import` paste page + `/(admin)/contracts/import/[id]` review page (entities, blocking/confirm ambiguities, candidate table with rate-missing highlight + confidence, commit-to-draft form); "Import" button on contracts list

### 4.4 Tests — DONE ✅
- [x] `tests/services/contract-extraction.test.ts` — 7 tests: readable amounts correct, unreadable flagged with null amount + provenance (zero-hallucination), conflicting dates block (O3), review-based (O4), rate-missing blocking, no fabricated amounts, determinism. Full suite 218/218.

### Phase 4 remaining (optional enhancement)
- [ ] LLM-assisted clause tagging (§12.3) for narrative pre-auth/exclusion/package clauses — current extractor is rule-based (tariff tables + dates + entities). Rule-based is the zero-hallucination baseline; LLM step would add clause structuring behind the same human-confirm gate.
- [ ] Candidate keep/drop checkboxes in the review UI (commit currently imports all candidates; `commit` service already supports `keepCandidateIndexes`)

---

## Decisions / notes log

- 2026-07-02: Confirmed DB reachable, schema up to date before changes. Keeping Phase-1 migration scoped to Phase-1 entities only (defer ProviderTariff pricing-rule fields, ContractPackage, PricingRule, PreauthRule, DocumentationRule, ServiceCategory, AdjudicationReasonCode to their phases). Rationale: spec is explicitly phased; smaller migrations are safer and match the roadmap.
- 2026-07-02: Will reuse existing `EligibilityRule` (INCLUDE/EXCLUDE) enum for ContractApplicability.inclusionType instead of a new enum.
- 2026-07-02: SHA payer = new `PayerType.GOVERNMENT_SCHEME`. Amanah (claims manager) = `TPA_CLAIMS_MANAGER`.

---

## Open questions deferred to user (spec §20)
Not blocking Phase 1 build; flag before go-live: unseen parent MSAs; NHIF/SHA rebate schedule ownership; Amanah payer chain; Britam branch scope; balance-billing default; KES vs UGX base currency; ServiceCategory ownership; retention policy.
