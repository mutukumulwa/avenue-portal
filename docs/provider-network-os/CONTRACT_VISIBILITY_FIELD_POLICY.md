# F7.1 — Provider-Visible Contract Field Policy

**Work package:** F7.1 (BEGINS phase F7 — contract visibility, provider master data, network self-service)
**Size:** S · **Type:** documentation / policy (**no code**)
**Status:** SPEC COMPLETE · **GATED(network operations / legal / security review)** — §11.8; ratification block at §11 is PENDING and must be signed before F7.2 returns any contract fact to a provider.
**Branch/commit:** `feat/provider-network-os` @ phase-F6-complete tip `0aff671`
**Depends on:** F1.8 (applicability readiness) · **Feeds:** F7.2 (`ProviderContractViewService`), F7.3 (contracts/rates pages + export)
**Authority in the plan:** §8.10 (contract & tariff visibility), decision **D2** (no tenant-wide member/contract search — effective applicability only), **D18** (audience-safe explanations), **D27** (data minimization), §7.10.

> **Visibility rule (D2/§8.10, non-negotiable).** A provider may read **only the provider-visible, effective portion** of its **own** contracts. Never another provider's contract, another client's applicability, internal negotiation/extraction data, or a contract that is not yet in force. F7.2 must resolve the effective contract through the canonical `ContractLifecycleService.precheck` and project **only** the fields marked *VISIBLE* (and *CONDITIONAL* fields the sign-off approves) — everything else is internal-only.

---

## 0. Proof-before-build (§0.3)

```text
Work package: F7.1 — Define provider-visible contract field policy
Capability searched for: an existing field-by-field policy for what contract/rate facts a provider may see
Search terms used: ProviderContract, ContractVersion, ContractApplicability, ProviderTariff, PreauthRule,
  DocumentationRule, ProviderContractExclusion, ContractExtraction, PricingRule, ContractBranch, precheck,
  getActiveContract, sourceRef, confidence, capitation, provider.contract.read
Files inspected: prisma/schema.prisma (ProviderContract 3597-3699, ContractVersion 3704-3734,
  ContractApplicability 3738-3763, ContractBranch 3766-3777, ProviderBranch 3190-3216, ProviderTariff 3327-3399,
  ProviderDiagnosisTariff 3477-3497, PricingRule 3954-3974, PreauthRule 4061-4090, DocumentationRule 4120-4141,
  ProviderContractExclusion 3815-..., ContractExtraction 3855-..., ContractPackage 3992-..., enums 3268-3595);
  src/server/services/contract-lifecycle.service.ts (precheck 671-739); provider-contracts.service.ts
  (getActiveContract 57-68, resolveClaimLineRates 75-266, syncProviderSummary 328); contract-engine/engine.ts
  (evaluateClaim 134-319, effective tariff window 160-188); prisma/seeds/provider-rbac.ts (provider.contract.read 44).
Existing implementation found: a rich ADMIN contract surface (src/app/(admin)/contracts/**, incl. CapitationPanel);
  NO provider-facing contract read/page exists (§4.2 #-). provider.contract.read permission is seeded.
Existing tests found: contract engine + lifecycle tests (internal); none provider-facing.
Live behavior checked: read-only characterization (two direct reads + one evidence agent); no DB run.
Classification: PARTIAL — the fields exist and are documented; the provider-visibility CLASSIFICATION,
  download policy, and gap list are specified here for the first time.
Smallest required change: this document only. No code, no schema, no data.
Files expected to change: docs/provider-network-os/CONTRACT_VISIBILITY_FIELD_POLICY.md (new); trackers.
Data migration/backfill needed: none.
Security or money invariants touched: none mutated. This DEFINES the provider-visibility boundary for the phase.
```

**Stop condition:** field classification + scope/effective-date rules + download policy + worked examples + sign-off block delivered. **No code, no query, no page.**

---

## 1. Purpose and how F7.2/F7.3 consume this

F7.1 is the network/legal/security-approved contract that F7.2 and F7.3 are built against:

- **F7.2 `ProviderContractViewService`** resolves the effective contract via `ContractLifecycleService.precheck` and projects **only** the *VISIBLE* (and approved *CONDITIONAL*) fields in §3, scoped to the caller's provider (D2). Its tests ("field leakage snapshot", "cross-provider/client") assert this policy.
- **F7.3** (contracts/rates pages + safe export) renders **only** this policy; the export uses the §7 download columns + watermark and the F6.5 CSV formula-injection guard.

If a later package needs a contract fact not classified here, it stops and amends this policy (with re-sign-off) rather than exposing an unclassified field.

---

## 2. Scope, effective-dating, and the canonical resolver

- **Own provider only (D2).** Every read starts from the caller's `ProviderAccessContext.providerId`; a contract is returned only when `ProviderContract.providerId === ctx.providerId`. Cross-provider is a non-enumerating not-found.
- **Effective + in-force only.** Only contracts in a live status are visible: **`ACTIVE`** (current), **`EXPIRED`/`TERMINATED`/`SUPERSEDED`** (historical, clearly labelled). Contracts in a **negotiation state — `DRAFT`, `UNDER_REVIEW`, `PENDING_CLARIFICATION`, `APPROVED`(not yet active), `VOIDED`, `ARCHIVED` — are NOT visible** (they are internal deliberation). `ProviderContract.status` (`schema.prisma:3607`, enum `ProviderContractStatus` 3503-3515).
- **Version windows (current/future/expired).** A contract's operative content is an effective-dated `ContractVersion`. Label:
  - **CURRENT** = `ContractVersion.status = ACTIVE` and `effectiveFrom ≤ serviceDate ≤ (effectiveTo ?? ∞)` (also pinned by `ProviderContract.currentVersionId`);
  - **FUTURE** = `status = APPROVED` with `effectiveFrom` in the future;
  - **EXPIRED** = `status = SUPERSEDED` with `effectiveTo` set.
  (`ContractVersion` `schema.prisma:3704-3734`.)
- **Canonical resolver (reuse, don't reinvent).** `ContractLifecycleService.precheck({tenantId, providerId, providerBranchId, clientId, pricingDate})` (`contract-lifecycle.service.ts:671-739`) is the effective-contract resolver: it filters `status:ACTIVE` + `startDate ≤ date ≤ endDate`, applies **branch scope** (CON-008), **payer applicability** (INCLUDE with EXCLUDE always winning, CON-002), prefers LISTED over ALL_BRANCHES (ambiguity → CON-010), and returns the contract **+ its `currentVersionId`**. F7.2 reuses this; the engine's effective-tariff date-window query (`engine.ts:160-188`) is the effective-rate pattern. The lighter `ProviderContractsService.getActiveContract` (no branch/payer/version resolution) is NOT sufficient for the provider view.
- **Client/group scope (D2).** A provider sees the applicability of its **own** contract (the payers/plans it serves under that agreement) — never another client's contract or a client it is not contracted for. `ContractApplicability` rows are internal scope config; the provider view surfaces the **derived** list of served clients/groups/packages/benefits, not the raw INCLUDE/EXCLUDE machinery.

---

## 3. Field dictionary

Classification: **VISIBLE** (provider-safe, always shown) · **CONDITIONAL** (shown only if the sign-off approves, or only when contractually appropriate) · **INTERNAL** (never shown). Every row cites `model.field @ schema.prisma:line`.

### 3.1 Contract header — `ProviderContract` (3597-3699)

| Field | Source @ line | Class | Note |
|---|---|---|---|
| Contract number | `contractNumber` @3604 | VISIBLE | |
| Title | `title` @3605 | VISIBLE | |
| Type | `contractType` @3606 | VISIBLE | MSA / RATE_SCHEDULE / PACKAGE / CASE_RATE / … |
| Status | `status` @3607 | CONDITIONAL | show ONLY ACTIVE/EXPIRED/TERMINATED/SUPERSEDED (labelled); negotiation states hidden |
| Branch scope | `branchScope` @3610 | VISIBLE | ALL_BRANCHES / LISTED |
| External reference | `externalContractRef` @3611 | CONDITIONAL | e.g. SHA "CN-73009" — network-ops call |
| Start / end date | `startDate` @3619, `endDate` @3620 | VISIBLE | |
| Signed date | `signedDate` @3622 | CONDITIONAL | |
| Auto-renew | `autoRenew` @3623 | CONDITIONAL | |
| Currency | `currency` @3629 | VISIBLE | ISO-4217 (default KES on contract; **rate lines carry their own currency**) |
| Country / region | `country` @3630, `region` @3631 | VISIBLE | |
| Payment term days | `paymentTermDays` @3634 | VISIBLE | days to pay |
| Payment term basis | `paymentTermType` @3635 | VISIBLE | CALENDAR / BUSINESS |
| Submission window | `submissionWindowDays` @3644, `submissionWindowBasis` @3645 | VISIBLE | claim-filing window (reason SUB-001) |
| Balance-billing policy | `balanceBillingPolicy` @3648 | VISIBLE | whether the member may be balance-billed |
| Tax inclusivity | `taxInclusive` @3649 | VISIBLE | |
| Reconciliation cadence | `reconciliationCadence` @3650 | VISIBLE | NONE / MONTHLY / QUARTERLY |
| Unlisted-service rule | `unlistedServiceRule` @3653 | CONDITIONAL | pricing policy for un-tariffed services |
| Unlisted discount % | `unlistedDiscountPct` @3654 | CONDITIONAL | only if unlistedServiceRule = DISCOUNT |
| Early-settlement disc/window | `earlySettlementDiscountPct` @3640, `earlySettlementWindowDays` @3641 | CONDITIONAL | commercial term |
| Invoice discount % | `invoiceDiscountPct` @3637 | CONDITIONAL | negotiated — network-ops call |
| Credit limit | `creditLimit` @3636 | **INTERNAL** | payer's exposure, not the provider's business |
| Execution status | `executionStatus` @3626 | INTERNAL | signature-evidence workflow |
| Signatories | `signatories` @3627 | **INTERNAL** | PII |
| Review due date | `reviewDueDate` @3621 | INTERNAL | internal review schedule |
| Parent digitised flag | `parentDigitised` @3617 | INTERNAL | data-completeness flag |
| Notes | `notes` @3657 | **INTERNAL** | free-text internal notes |
| Document URL | `documentUrl` @3656 | **INTERNAL** | the system's scanned-agreement link (the provider has its own copy) |
| Ownership / approval | `contractOwnerId`/`createdById`/`submittedById`/`approvedById`/`activatedById` + `*At` @3667-3674 | **INTERNAL** | maker-checker actors |
| Version/renewal pointers | `currentVersionId` @3665, `supersededById` @3660 | INTERNAL | internal ids |

### 3.2 Contract version — `ContractVersion` (3704-3734)

| Field | Source @ line | Class | Note |
|---|---|---|---|
| Version number | `versionNumber` @3710 | VISIBLE | |
| Effective from / to | `effectiveFrom` @3712, `effectiveTo` @3713 | VISIBLE | drives current/future/expired label |
| Status label | `status` @3711 | VISIBLE (as label) | render CURRENT/FUTURE/EXPIRED, not the raw enum |
| Snapshot | `snapshot` @3717 | **INTERNAL** | diff metadata |
| Validation report | `validationReport` @3718 | **INTERNAL** | approver-only §13 result |
| Change summary | `changeSummary` @3719 | CONDITIONAL | a provider-safe "what changed" line, if approved |
| Approver / creator | `approvedById`/`createdById`/`approvedAt` @3721-3723 | INTERNAL | |

### 3.3 Applicability (derived scope) — `ContractApplicability` (3738-3763)

The provider view shows the **derived served-scope**, not the raw rows.

| Derived field | Source @ line | Class | Note |
|---|---|---|---|
| Served client(s) | `clientId` @3744 | VISIBLE | the payer(s) under this contract (the provider's own) |
| Served group/scheme | `groupId` @3746 | VISIBLE | null = all groups |
| Served package/plan | `packageId` @3747, `packageVersionId` @3748 | VISIBLE | null = all plans |
| Benefit restriction | `benefitCategory` @3749 | VISIBLE | e.g. DENTAL-only |
| Member category | `memberCategory` @3751 | CONDITIONAL | e.g. "registered, fully paid-up" |
| Network tier | `networkTier` @3750 | CONDITIONAL | the provider's tier under this payer |
| Effective from / to | `effectiveFrom` @3755, `effectiveTo` @3756 | VISIBLE | |
| Inclusion machinery | `inclusionType` @3753 (INCLUDE/EXCLUDE), `isActive` @3757 | INTERNAL | resolve to the derived served-scope; do not expose the raw rule rows |

### 3.4 Branch coverage — `ProviderBranch` (3190-3216) + `ContractBranch` (3766-3777)

| Field | Source @ line | Class |
|---|---|---|
| Branch name / code | `ProviderBranch.name` @3196, `code` @3197 | VISIBLE |
| Address / county | `address` @3198, `county` @3199 | VISIBLE |
| Geo / licence | `geoLatitude`/`geoLongitude` @3200-3201, `licenceNumber` @3202 | VISIBLE |
| Active | `isActive` @3203 | VISIBLE |
| Covered-by-contract | `ContractBranch(contractId, branchId)` @3766-3777 | VISIBLE (as "covered branches") |

### 3.5 Rate / tariff — `ProviderTariff` (3327-3399) + `ProviderDiagnosisTariff` (3477) + `PricingRule` (3954)

| Field | Source @ line | Class | Note |
|---|---|---|---|
| Service name | `serviceName` @3345 | VISIBLE | |
| Standard / provider description | `standardDescription` @3357, `providerDescription` @3356 | VISIBLE | the provider's own text |
| CPT / provider code | `cptCode` @3344, `providerServiceCode` @3355, `codingSystem` @3358 | VISIBLE | the provider's own billing codes |
| Service category | `serviceCategoryId` @3353 (name via `ServiceCategory`) | VISIBLE (name only) | |
| Agreed rate | `agreedRate` @3346 | VISIBLE | **the rate** |
| Currency | `currency` @3347 | VISIBLE | per-line currency |
| Rate type / method | `rateType` @3359 | VISIBLE | FIXED / DISCOUNT_OFF_BILLED / MARKUP_OVER_COST / PER_DIEM / CAPITATION / … |
| Discount / markup % | `discountPct` @3360, `markupPct` @3361 | VISIBLE | for the matching rate type |
| Ceiling / floor | `maxPayableAmount` @3362, `minPayableAmount` @3363 | VISIBLE | |
| Unit / limits | `unitOfMeasure` @3364, `maxQuantityPerVisit` @3350, `quantityLimit` @3365, `frequencyLimit` @3366, `frequencyPeriod` @3367 | VISIBLE | |
| Clinical restrictions | `genderRestriction` @3368, `ageMin`/`ageMax` @3369-3370, `diagnosisRestriction` @3371 | VISIBLE | |
| Requires PA / referral | `requiresPreauth` @3349, `requiresReferral` @3372 | VISIBLE | |
| External scheme / rebate | `externalScheme` @3377, `externalRebateAmount` @3378 | CONDITIONAL | for NET_OF_EXTERNAL — show the offset only if the provider needs it |
| Effective from / to | `effectiveFrom` @3382, `effectiveTo` @3383 | VISIBLE | |
| Rate-missing flag | `rateMissing` @3373 | **INTERNAL** | render as "rate under confirmation" (§6), never the flag |
| Source ref (extraction) | `sourceRef` @3379 `{documentId,page,rawText,confidence}` | **INTERNAL — §8.10 forbids extraction confidence** | never expose page/rawText/confidence |
| Notes | `notes` @3380 | **INTERNAL** | |
| Version pin / client / branch scope | `versionId` @3335, `clientId` @3342, `branchId` @3338 | INTERNAL (scoping) | resolve; do not expose the negotiated per-client rate machinery beyond the provider's applicable rate |
| Diagnosis-bundled rate | `ProviderDiagnosisTariff.icdCode`/`diagnosisLabel`/`bundledRate`/`perDayRate` @3483-3486 | VISIBLE | (its `notes` @3488 INTERNAL) |
| Typed pricing rule | `PricingRule.ruleKind` @3964, `params` @3965 | VISIBLE (derived) | project a provider-safe summary (rate/basis/carve-outs) from `params`; never the raw `poolId`/internal keys |

### 3.6 Pre-authorisation requirements — `PreauthRule` (4061-4090)

All VISIBLE (the rules the provider must follow): `triggerType` @4072, `thresholdAmount` @4073 (PA above X), `serviceRefs` @4074 (carve-out lists), `admissionRequired` @4075, `emergencyExempt` @4076, `retrospectiveAllowed` @4077 + `retrospectiveWindowHours` @4078, `approvalSlaHours` @4079, `validityDays` @4080, `requiredDocumentTypes` @4081, `consequenceIfMissing` @4082, effective dates. Internal: `tariffLineId`/`packageId`/`serviceCategoryId` ids (resolve to names).

### 3.7 Document requirements — `DocumentationRule` (4120-4141)

VISIBLE: `documentType` @4130, `mandatory` @4131, `appliesWhen` @4132 (e.g. `{onlyIP:true}`), `consequenceIfMissing` @4133, effective dates. Internal: the scope ids (resolve to names).

### 3.8 Exclusions — `ProviderContractExclusion` (3815-...)

VISIBLE (so the provider knows what is not payable): `cptCode`, `serviceName`, `reason`, `level` (TARIFF_LINE/CATEGORY/DIAGNOSIS/PLAN/MEMBER_CATEGORY/DATE_RANGE), `icdCodes`, `dateFrom`/`dateTo`. INTERNAL: `sourceRef` (extraction).

### 3.9 Capitation coverage & FFS carve-outs

**No dedicated capitation model exists today** (a `CapitationArrangement` + ledger is F10). Capitation is represented by:
- **Contract side:** a `PricingRule` with `ruleKind ∈ {CAPITATION, PER_VISIT_CASE_RATE, AVERAGE_COST_POOL}` (@3964) whose `params` JSON (@3965) carries the rate/basis and **`params.carveOutCodes`** (the FFS carve-outs) + `poolId` (internal).
- **Benefit side:** `BenefitConfig.fundingModel` (`schema.prisma:2010`, FEE_FOR_SERVICE/CAPITATION/HYBRID).

**Provider-visible projection:** when a capitation `PricingRule` is active for a served scope, show "**Capitation** — covered under a capitation arrangement (rate/basis if approved); the following services are **fee-for-service carve-outs**: `params.carveOutCodes`." Never expose `poolId`, the internal average-cost pool, or `ContractReconciliation`. The full per-member accrual/statement is **F10-deferred** — the policy notes it as a gap (§9 D-CAP).

---

## 4. Never-expose list (D18/D27/§8.10)

Absolute internal-only, regardless of any *CONDITIONAL* sign-off:

- **Extraction data** — `ProviderTariff.sourceRef` / `ProviderContractExclusion.sourceRef` (page/rawText/**confidence**) and the entire `ContractExtraction` model (`tariffCandidates[].confidence`, `ambiguities`, `reviewAnswers`, `stats`, `extractorVersion`).
- **Internal deliberation** — contract/tariff `notes`, `ContractVersion.snapshot`/`validationReport`, negotiation-state contracts (DRAFT/UNDER_REVIEW/PENDING_CLARIFICATION), `reviewDueDate`.
- **Ownership/approval** — every `*ById`/`*At` maker-checker actor field.
- **Internal finance** — `creditLimit`, `ContractReconciliation` (average-cost pool settlement), `PricingRule.params.poolId`, `avgCostPoolId`.
- **Other parties** — any other provider's contract; any client the provider is not contracted for; `ServiceMappingMemory`; `signatories` (PII).
- **The scanned agreement link** (`documentUrl`) — the provider has its own executed copy; the system's object link is not served.

---

## 5. Conflicting / missing configuration display (step 5)

- **Rate unreadable** (`rateMissing = true`) → show "Rate under confirmation — contact the payer", never the flag or the extraction note.
- **No tariff for a service** → "Not on your rate schedule" (aligns with the claims reason SVC/PRC catalog).
- **Ambiguous contract match** (precheck CON-010, overlapping applicability) → "Coverage under review" — never the raw ambiguity list.
- **Missing/expired version** → show the last CURRENT version with its effective window; a FUTURE version is labelled "Effective from <date>".

---

## 6. Download policy — columns + watermark (step 4)

The provider-safe rate-schedule export (F7.3) uses the **F6.5 CSV machinery** (versioned column dictionary + OWASP formula-injection guard + UTF-8 BOM + sha256 checksum). Columns (VISIBLE fields only):

```text
Service | CPT | Provider code | Category | Rate | Currency | Rate type | Discount % | Markup % |
Max payable | Min payable | Unit | Max qty/visit | Frequency limit | Requires PA | Requires referral |
Effective from | Effective to | Exclusion note
```

**Watermark (mandatory on every export/print):** provider name + "Indicative rate schedule for `<contract number>` version `<n>`, generated `<UTC timestamp>`. Rates are subject to the executed agreement; final payment depends on the actual service, a complete claim, pre-authorisation, benefit limits, and policy." **No** `sourceRef`, confidence, notes, internal ids, other clients, or other providers. The export is audited (F7.3 step 6).

---

## 7. Worked examples

### E1 — Fee-for-service (RATE_SCHEDULE) contract
`ProviderContract{ type: RATE_SCHEDULE, status: ACTIVE, currency: KES, paymentTermDays: 30 (CALENDAR), submissionWindowDays: 7 (SERVICE_DATE), balanceBillingPolicy: NOT_ALLOWED }`, current `ContractVersion{ v2, effectiveFrom 2026-01-01, ACTIVE }`. Served scope (derived from applicability): payer "SHA", all groups, DENTAL package. Rate lines (VISIBLE): `Consultation | 99213 | KES 1,500 | FIXED | requiresPreauth false`; `CT scan | 70450 | KES 8,000 | FIXED | requiresPreauth true (PreauthRule threshold 5,000, SLA 72h, requiredDocs [REFERRAL_LETTER])`. Exclusion: `Cosmetic dentistry — EXC level TARIFF_LINE`. **Not shown:** the extraction `sourceRef.confidence`, `creditLimit`, the approver ids, or SHA's other providers.

### E2 — Capitated contract (coverage only; ledger deferred)
`ProviderContract{ type: CASE_RATE_AGREEMENT, status: ACTIVE }` with `PricingRule{ ruleKind: CAPITATION, params: { rate: 500, basis: "PMPM", carveOutCodes: ["70450","74177"] } }`. Provider-visible projection: "**Capitation** — outpatient primary care is covered under a capitation arrangement. **Fee-for-service carve-outs:** CT (70450), CT abdomen (74177) — these are billed as normal claims at your FFS rates." **Not shown:** `poolId`, the average-cost `ContractReconciliation`, or per-member accrual (F10). A carve-out service still resolves to its FFS `ProviderTariff` line (E1-style).

---

## 8. Handoff to F7.2

1. `ProviderContractViewService.list(ctx, {serviceDate?})` + `getById(ctx, contractId)` + `getRates(ctx, contractId, {serviceDate, code?, name?, page})` resolve via `ContractLifecycleService.precheck` and project **only** §3 VISIBLE (+ approved CONDITIONAL) fields, scoped to `ctx.providerId`, non-enumerating.
2. Effective/current/future/expired labels from §2.
3. A per-field allow-list projection (never a `select: *`) so a new internal field cannot leak by default — the F7.2 "field leakage snapshot" test enforces this policy.
4. Missing/conflicting config renders per §5; capitation per §3.9.

---

## 9. Data-gap register (step 5)

| # | Gap | Impact | Closes in | Decision? |
|---|---|---|---|---|
| **D-CAP** | No capitation arrangement/ledger model — capitation is only a `PricingRule` + `params.carveOutCodes` | Provider sees "covered + carve-outs" but no per-member rate/accrual | F10 | Informational |
| **D-RECON-WINDOW** | The reconsideration window is NOT a contract field — it is computed by the F5.11 policy at filing (`ClaimReconsideration.filingDeadline`) | §8.10 lists it as visible; the provider view shows the **derived** window (contract submission basis → default 60d), not a stored field | F7.2 (derive + label) | Informational |
| **D-CURRENCY** | Contract default currency is KES (@3629) but tariff lines default UGX (@3347) | Always show the **line's own currency**, never assume the contract currency | F7.2 | Informational |
| **D-STATUS** | `status` mixes in-force + negotiation states | Only ACTIVE/EXPIRED/TERMINATED/SUPERSEDED are visible; negotiation states hidden entirely | F7.2 (status allow-list) | **Yes — Q2** |

---

## 10. Sign-off (PENDING — this is the gate)

F7.2 must not return any contract fact to a provider until this section is signed. Decisions to ratify:

- **Q1 (CONDITIONAL fields).** Confirm which *CONDITIONAL* fields are provider-visible: external reference, signed date, auto-renew, unlisted-service rule + discount, early-settlement + invoice discount, member category, network tier, external rebate, change summary. (Legal/network-ops: commercial terms; some payers treat discounts as confidential.)
- **Q2 (status/negotiation).** Confirm negotiation-state contracts (DRAFT/UNDER_REVIEW/PENDING_CLARIFICATION/VOIDED) are never visible, and that only ACTIVE + historical (EXPIRED/TERMINATED/SUPERSEDED) appear.
- **Q3 (capitation).** Confirm the §3.9 capitation projection (coverage + carve-out codes only; no pool/ledger) is acceptable pending F10.
- **Q4 (download).** Confirm the §6 column set + watermark, and that the export is audited and carries no extraction/internal data.
- **Q5 (never-expose).** Confirm the §4 list (extraction confidence, notes, credit limit, ownership, other parties, scanned-agreement link) is complete for network/legal/security.

| Role | Name | Decision | Date | Signature |
|---|---|---|---|---|
| Network operations (field visibility) | _pending_ | | | |
| Legal (commercial-term confidentiality) | _pending_ | | | |
| Security (extraction/internal leakage) | _pending_ | | | |

**Until all three sign:** F7.1 stands as an internal specification (§11.6 stage 1); no provider-facing contract read (F7.2) is activated.

---

*F7.1 deliverable — no code, no schema, no data. Every source fact above is a real column/service at the cited `schema.prisma`/service line on `feat/provider-network-os`. F7.2/F7.3 implement against this policy; amendments require network/legal/security re-sign-off.*
