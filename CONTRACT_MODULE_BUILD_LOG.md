# Digital Contract Module — Build Log & Resume Pointer

**Purpose:** durable, resumable record of implementation progress against
`DIGITAL_CONTRACT_MODULE_SPEC.md`. If a session ends mid-work, the next session
reads this file top-to-bottom, checks the **RESUME POINTER** and the phase
checklists, and continues without re-deriving context.

**Spec:** `DIGITAL_CONTRACT_MODULE_SPEC.md` (1017 lines, v1.0 2026-07-02).
**Started:** 2026-07-02.

---

## RESUME POINTER (update this every time you stop)

- **Current phase:** Phase 1 — Contract structuring foundation (core built end-to-end)
- **Current task:** Phase 1 remaining polish, then Phase 2 (tariff-based claims automation).
- **Next action (pick up here):**
  1. Wire the intake pre-check (`ContractLifecycleService.precheck`) into `intake.service.ts` so capture surfaces "no active contract" (spec §8.1). Currently the router exposes `contracts.precheck` but intake does not call it yet.
  2. Build the Tariffs tab on the contract detail page (grid editor + CSV bulk upload, spec §11.4). Right now the top-level detail page shows a tariff-line count but not the editor — the legacy provider-scoped editor at `/providers/[id]/contracts/[contractId]` still exists and can be adapted/linked.
  3. Add applicability / branch / source-doc management UI to the detail page (routers already exist: `contracts.addApplicability`, `contracts.addContractBranch`, `contracts.addSourceDocument`, `providerBranches.*`).
  4. Add BullMQ jobs: auto-activate APPROVED contracts at startDate; auto-expire ACTIVE past endDate; NO_CONTRACT queue re-sweep on activation (spec §4.3). See `src/server/jobs/`.
  5. Then start **Phase 2** — engine stages 3–4 + reason-code catalog. Extend `ProviderTariff` with pricing-rule fields (rateType, UoM, caps, rateMissing, serviceCategoryId, providerServiceCode, sourceRef) — this is the first Phase-2 schema migration.
- **Blocked on:** nothing.
- **Last verified green:** 2026-07-02 — Phase-1 schema applied via `prisma db push`
  (NOT migrate — see note below); `npm run typecheck` clean; `eslint` clean on all new
  files; `/contracts` route compiles (307 auth-gate, no errors).
- **Verification note:** Could NOT complete a browser pixel-render check — the preview
  harness does not persist the next-auth session cookie (credentials callback returns 200
  but bounces to /login). This is an environment quirk, not a code defect. To verify the
  rendered pages next session, log in via a real browser as `admin@medvex.co.ug` /
  `MedvexAdmin2024!` and open `/contracts`.

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
| 2 | Tariff-based claims automation | not started |
| 3 | Rule engine (full) | not started |
| 4 | Markdown extraction & assisted creation | not started |
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

## Decisions / notes log

- 2026-07-02: Confirmed DB reachable, schema up to date before changes. Keeping Phase-1 migration scoped to Phase-1 entities only (defer ProviderTariff pricing-rule fields, ContractPackage, PricingRule, PreauthRule, DocumentationRule, ServiceCategory, AdjudicationReasonCode to their phases). Rationale: spec is explicitly phased; smaller migrations are safer and match the roadmap.
- 2026-07-02: Will reuse existing `EligibilityRule` (INCLUDE/EXCLUDE) enum for ContractApplicability.inclusionType instead of a new enum.
- 2026-07-02: SHA payer = new `PayerType.GOVERNMENT_SCHEME`. Amanah (claims manager) = `TPA_CLAIMS_MANAGER`.

---

## Open questions deferred to user (spec §20)
Not blocking Phase 1 build; flag before go-live: unseen parent MSAs; NHIF/SHA rebate schedule ownership; Amanah payer chain; Britam branch scope; balance-billing default; KES vs UGX base currency; ServiceCategory ownership; retention policy.
