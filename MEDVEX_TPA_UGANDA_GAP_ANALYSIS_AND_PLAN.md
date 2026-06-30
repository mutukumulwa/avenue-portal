# Medvex TPA (Uganda) — Gap Analysis & Implementation Action Plan

**Source spec:** `AICARE_TPA_UGANDA_SPEC.md` (v0.1)
**Codebase audited:** `avenue-portal` (Next.js 15 / React 19 / TypeScript / Prisma 7 / PostgreSQL / tRPC / BullMQ + Redis / MinIO)
**Audit date:** 2026-06-30
**Author:** Gap audit pass (analysis only — no code was changed)
**Purpose:** A discovery-and-planning document. It maps every requirement in the Uganda TPA spec against what actually exists in the code, names the gap, and lays out a concrete, file-level action plan to close it — plus a complete Avenue→Medvex de-branding workstream. Claude Code (or any implementer) can execute directly from this.

> **Scope discipline:** This document does **not** modify code. It is the build brief. Status tags follow the spec convention — `Covered` (exists, reusable), `Partial` (exists, needs adaptation), `New` (net-new), `Verify` (depends on an external fact/decision).

---

## How to read this document

- **§A — Executive summary:** the shape of the gap in one page.
- **§B — Current-state snapshot:** what the codebase actually is today, so the gaps are legible.
- **§C — Gap register:** the core. One subsection per spec area (§1–§9 of the spec). Each gap states the *requirement*, the *current state with file evidence*, a *severity*, and a *detailed action plan* (data model → services → API/UI → jobs → tests).
- **§D — Avenue→Medvex rebrand workstream:** the de-branding, treated as its own first-class workstream with a token-rename strategy and a file-level checklist.
- **§E — Consolidated phased build order:** every gap rolled into the spec's Phase 0–5 sequence, with priority and rough effort.
- **§F — Open decisions:** the spec's OD-1…OD-14 plus decisions this audit surfaced.
- **§G — Master acceptance checklist.**
- **Appendix — evidence index** (key files referenced).

**Severity scale used in the gap register:**
`S0` blocks the TPA from operating legally/safely in Uganda · `S1` core spec capability missing · `S2` adaptation of an existing capability · `S3` polish / nice-to-have.

**Effort scale (engineering, rough order-of-magnitude):**
`XS` <1 day · `S` 1–3 days · `M` 1–2 weeks · `L` 2–4 weeks · `XL` >1 month / multi-person.

---

## §A. Executive summary

The codebase is a **mature, Kenya-oriented, single-operator (Avenue/PSHP) health-benefits platform**. It is genuinely strong on the modules the spec wants to *reuse*: brokers/intermediaries, packages/benefits with shared-limit groups, quotation→binding→membership lifecycle, claims adjudication gates, co-contribution (copay), self-funded funds, provider contracts/tariffs, GL/billing, analytics/MLR, fraud rules, WebAuthn check-in, and a ~25-report catalogue. Roughly **60–70% of the spec's functional surface already exists in some form.**

The gap is concentrated in the structural pivots that turn a single-payer Kenyan product into a **multi-client Ugandan TPA**, plus the headline new architecture:

1. **Offline-first architecture (spec §4) — the single biggest gap.** Today there is only a shell-cache PWA (`public/sw.js`) that *explicitly bypasses every data route* (`/api/`, `/member/`, `/broker/`, `/fund/` are network-only). There is no IndexedDB store, no offline capture, no store-and-forward sync, no eligibility cache, no conflict resolution. This is `New` from the ground up and is the technical backbone of Medvex requirement #6.
2. **Multi-client tenancy (spec §2.1).** The data model is `Tenant` (the operator brand) → `Group` (employer scheme). There is no **Client** payer entity (insurer/HMO/employer-self-funded) above the scheme, and no per-client isolation of network/currency/terminology/approval/branding.
3. **Multi-currency + FX (spec §3.5).** KES is hard-coded throughout (schema comments, constants, fund/admin-fee fields). There is no currency entity, no FX rate table, no currency-normalised approval bands, no subsidiary consolidation.
4. **Uganda regulatory & data-protection layer (spec §1.1, §1.3).** No TPA compliance register (licence/security-deposit/director register/compliance-levy) and no DPPA-2019 postures (consent, data-subject rights, breach workflow, processor register). These are `S0` — they gate legal operation.
5. **Uganda integration swaps (spec §5.9, §5.10, §8).** Identity is IPRS (Kenya) — needs **NIRA**; mobile money is M-Pesa/Daraja — needs **MTN MoMo + Airtel Money**; tax/levy enums are Kenyan (Stamp Duty/Training Levy/PHCF) — need Ugandan equivalents.
6. **Approval Matrix as a first-class engine (spec §3.1).** A rudimentary `ApprovalMatrix` model exists (tenant-scoped, single role, `requiresDual` boolean, claim-value band only). The spec wants a client/scheme-scoped, action-typed, currency-normalised, multi-level-sequential, SLA-timed, version-resolved matrix with enforced segregation of duties.
7. **Active claims dashboard with incoming-claim alerts (spec §3.3).** Not present as specified — there is no real-time multi-channel "claim landed" alerting/work-queue console.
8. **Terminology engine (spec calls it `Covered`, Module 2).** It is **not implemented** in this repo (confirmed against `AICARE_TODO.md` items T-01…T-08). The spec's reuse assumption is incorrect for this codebase; treat as `New`.
9. **Avenue branding is everywhere.** ~3,800 references in `src/` — overwhelmingly design tokens (`--color-avenue-*` and `text-/bg-/border-avenue-*` classes) plus brand strings, hard-coded `avenue.co.ke` domains/emails, PWA icons, and the repo folder name. Full removal is a sizeable but mostly mechanical workstream (§D).

Everything else is `Partial` adaptation of strong foundations (claims, copay, providers, fraud, analytics, member experience, reporting) or `New` feature modules of moderate size (case management, cross-border, preventative care).

**Recommended critical path:** Phase 0 lands tenancy + offline scaffolding + approval-matrix engine + terminology engine + the rebrand; Phase 1 makes the claims/eligibility rail offline-capable with the active dashboard; later phases layer finance/multi-currency, fraud/analytics, member channels, and integrations depth — mirroring the spec's own Phase 0–5 order (§E).

---

## §B. Current-state snapshot (what exists today)

This is the baseline the gap register references. File paths are relative to repo root.

**Stack & conventions.** Next.js 15 (App Router) + React 19, TypeScript, tRPC (`src/server/trpc/`), Prisma 7 with a single large schema (`prisma/schema.prisma`, ~3,977 lines, ~150 models/enums), BullMQ workers (`src/server/jobs/`), Redis queue (`src/lib/queue.ts`), MinIO (`src/lib/minio.ts`), NextAuth (`src/lib/auth.ts`). The never-delete (activate/deactivate + effective dates) convention is widely used; an immutable audit chain exists (`src/server/services/audit-chain.service.ts`, `AuditLog` model). `AGENTS.md` warns this Next.js has breaking changes vs. training data — read `node_modules/next/dist/docs/` before coding.

**Tenancy.** `Tenant` model = the operator brand (Avenue), carrying brand colours/fonts/logo and owning *all* downstream relations. `Group` = an employer scheme/policy (has `tenantId`, `clientType` CORPORATE|INDIVIDUAL, `packageId`, `contributionRate`, `county`, `fundingMode`, self-funded admin-fee fields). `GroupBenefitTier` = category (Directors/Managers/Staff). `Member` = principal|dependant with `FamilySize` M…M+7. So the spec's `Category → Family → Member` taxonomy and M…M+7 convention already exist; the missing layer is **Client** above the scheme.

**What's genuinely strong (reuse targets).**
- Brokers/intermediaries: `Broker`, `BrokerProducer`, `BrokerCommissionSchedule`, `CommissionTier`, `CommissionLedgerEntry`, `CommissionPayoutBatch`, `broker/*` portal, `commission.service.ts`, `broker-compliance.service.ts`. (Spec Module 1 = `Covered`.)
- Packages/benefits: `Package`, `PackageVersion`, `BenefitConfig`, `BenefitRider`, `SharedLimitGroup`, `BenefitConfigSharedLimit`, `BenefitUsage`, rate-matrix UI. Shared-limit groups already exist (a spec ask).
- Underwriting→binding: `Quotation`, `QuotationVersion`, `QuotationLineItem`, `FamilySizeMatrixCell`, `binding.service.ts`, `quotation-builder.service.ts`, assessor queue, custom pricing model files (HyperFormula/Pyodide).
- Claims: `Claim`, `ClaimLine`, `AdjudicationLog`, `claim-adjudication.service.ts`, `claims.service.ts`; `ClaimStatus` already encodes the bill lifecycle `INCURRED→RECEIVED→CAPTURED→UNDER_REVIEW→APPROVED→PAID`. Duplicate-capture DB constraint applied (`AICARE_TODO` D-16).
- Pre-auth: `PreAuthorization`, `preauth-adjudication.service.ts`, `preauth-escalation.job.ts`, `sla-breach.job.ts`.
- Copay: `CoContributionRule`, `AnnualCoContributionCap`, `CoContributionTransaction`, `coContribution/*` services (calculator, ruleResolver). (Spec Req 4 foundation.)
- Providers: `Provider`, `ProviderTariff`, `ProviderDiagnosisTariff`, `ProviderContract`, `Practitioner`/credentials, `ProviderSettlementBatch`, `provider-contracts.service.ts`, `bank-reconciliation.service.ts`.
- Finance: `Invoice`, `Payment`, `ChartOfAccount`, `JournalEntry`/`JournalLine`, `gl.service.ts`, `billing.service.ts`, `SelfFundedAccount`, `FundTransaction`.
- Analytics: `AnalyticsEncounterFact`, `AnalyticsMlrSnapshot`, `ProviderScorecard`, `MemberRiskProfile`, `RenewalAnalysis`, `AnalyticsAlert`, `analytics.service.ts`, board pack.
- Fraud: `ClaimFraudAlert`, `fraud.service.ts` (~12 deterministic rules), `InternalBlacklist`, `blacklist.service.ts`.
- Identity/check-in: `MemberWebAuthnCredential`, `CheckInChallenge`, `CheckInEvent`, `secure-checkin/*` (webauthn, face-match adapter stub, crypto, audit-chain), `VisitVerification`.
- Member experience: member PWA pages, `member-app.service.ts`, health vault, notifications, `ussd.service.ts`, `sms-query.service.ts`, `low-bandwidth-channel.service.ts`, M-Pesa member payments.
- Platform: `ExceptionLog` + exceptions UI, `ActivityLog`/`AuditLog`, `IntegrationConfig`, `OverrideRecord`, RBAC (`Role`/`Permission`/`RolePermission`/`UserRoleAssignment`, `rbac.service.ts`), reports catalogue (`reports/[reportType]/page.tsx` covers loss-ratio, admin-fee, exceeded-limits, ageing, debtors/creditors, fund-utilisation, provider/member statements, claims-per-operator, user-rights-roles, comparison-services, etc.).

**Prior backlog.** `AICARE_TODO.md` is the existing Kenya/PSHP backlog and is a useful cross-check: it confirms the terminology engine (T-01…T-08), advanced fraud layer (F-01…F-12), 2FA/password-reset/single-session/SIEM (H-01…H-14), and several data-model items are still open. Per the chosen scope, this plan focuses on the Uganda spec + rebrand, but flags overlaps where a TODO item and a spec gap are the same work.

---

## §C. Gap register

### C-1 · Regulatory & market context (spec §1)

#### G1.1 — TPA compliance register (spec §1.1) · `New` · S0 · Effort M
**Requirement.** A TPA compliance-register module: licence record, renewal calendar, security-deposit evidence (UGX 19m), director register with residency flag (≥3 directors, resident majority), indemnity cover, and an annual-compliance-levy computation tied to fees-received reporting that produces the IRA-facing fee return.
**Current state.** None. The only "licence" concept in the code is `Broker.licenseNumber` / `requiresIraRegistration` (Kenya broker context, `src/app/(admin)/brokers/`). No entity tracks the *operator's own* regulatory standing. `TaxRate` is tenant-scoped and configurable, which is a reusable pattern, but holds Kenyan tax types only.
**Action plan.**
- Data model: add `ComplianceRegister` (one per legal entity holding the licence — see OD-14), `RegulatoryLicence` (type, number, issuer=IRA-UG, issuedAt, expiresAt, status, document ref to MinIO), `SecurityDeposit` (amount UGX, evidence doc, verifiedAt), `DirectorRegister` entry (name, role, `isResident` flag, appointedAt, effective dates — never-delete), `IndemnityCover` (insurer, sum insured, period, doc), and `ComplianceLevyComputation` (period, fees-received basis, rate, amount, status, generatedReturnRef).
- Service: `compliance-register.service.ts` — CRUD with maker-checker via the approval matrix; renewal-calendar derivation; levy computation that **reads from the admin-fee ledger** (see G2.3 / G5.8) as the system of record.
- Jobs: `compliance-renewal-reminder.job.ts` (BullMQ) — alert N days before licence/deposit/indemnity expiry; `compliance-levy-accrual.job.ts` — period-end levy accrual.
- UI: `/(admin)/compliance/` — register dashboard (traffic-light on each obligation), director register, levy worksheet, "generate IRA return" action (PDF + structured export).
- Audit: every register change on the immutable chain.
- Tests: levy computation reconciles to the admin-fee ledger; renewal reminders fire on schedule; director residency-majority validation.
**Dependencies.** Admin-fee ledger (G5.8); approval matrix (G3.1); OD-2, OD-14.

#### G1.2 — Uganda Data Protection & Privacy Act 2019 postures (spec §1.3) · `New`/`Verify` · S0 · Effort L
**Requirement.** Lawful-basis & consent capture at member onboarding with purpose limitation on health data; data-subject-rights handling (access, correction, objection) wired into member portal + case management; processor/sub-processor governance register (host, SMS aggregator, mobile-money providers, identity provider); data-residency / cross-border-transfer assessment before host-region lock; breach-notification workflow. PDPO (NITA-U) is the Ugandan analogue of Kenya's ODPC.
**Current state.** None. There is member KYC (`MemberKycRecord`, `MemberKycDocument`) and a health vault with `MemberHealthShare` visibility controls, but no consent ledger, no DSR workflow, no processor register, no breach workflow. `IntegrationConfig` exists but has no processor/DPA metadata.
**Action plan.**
- Data model: `ConsentRecord` (memberId, purpose, lawfulBasis, grantedAt, withdrawnAt, version, channel), `DataSubjectRequest` (type ACCESS|CORRECTION|OBJECTION|ERASURE, status, SLA timer, fulfilment artefact), `ProcessorRegister` (processor name, role, dataCategories, location, DPA ref, sub-processors), `BreachIncident` (detectedAt, scope, severity, notifiablyAt, regulator-notified flag, narrative, remediation).
- Services: `dpo.service.ts` — DSR intake→fulfilment (access = export member's data package; correction routes to endorsement; objection/erasure routes to retention-policy check); consent capture hooked into onboarding (`onboarding.service.ts`) and member portal.
- UI: member-portal "My data & consents" page; admin `/(admin)/compliance/data-protection/` for DSR queue, processor register, breach log.
- Cross-cutting: purpose-limitation tags on health-data reads; retention policy config (overlaps `AICARE_TODO` P-01/H-05).
- `Verify`: confirm each obligation against current PDPO guidance; resolve data-residency (OD-1) before locking host region.
**Dependencies.** Case management (G5.14) for DSR workflow surface; retention/SIEM (G6 platform items); OD-1.

#### G1.3 — Regulatory-defensibility artifact (spec §1.2) · `New` · S2 · Effort S
**Requirement.** Per-client signed, hash-anchored PDF mapping canonical insurance enums → the client's display vocabulary, plus the audit chain for claims decisions — a procurement differentiator.
**Current state.** Audit chain exists (`audit-chain.service.ts`); PDF generation infra exists (`pdf.service.ts`, Puppeteer, `@react-pdf/renderer`). The terminology mapping it depends on does **not** exist (see G2.4).
**Action plan.** After the terminology engine lands (G2.4): add `regulatory-positioning.service.ts` to render a per-client mapping PDF, hash-anchor it to the audit chain, and expose a download in the client/compliance UI. (Mirrors `AICARE_TODO` T-08.)
**Dependencies.** G2.4 terminology engine.

---

### C-2 · TPA operating model & tenancy (spec §2)

#### G2.1 — Multi-client tenancy (spec §2.1) · `Partial→New` · S0 · Effort XL
**Requirement.** Promote "tenant" to a true **Client** payer (insurer | HMO | employer-self-funded). Hierarchy: `Client → Scheme → Category → Family → Member`. Each Client carries its own benefit structures, provider network (or shared Medvex master network with per-client tariffs), currency, terminology dictionary, approval matrix, copay rules, fraud thresholds, branding, and report templates. Cross-client isolation is a hard security boundary and an audit-chain assertion.
**Current state.** Two-level: `Tenant` (operator brand) owns everything; `Group` (=scheme) belongs directly to a tenant. `GroupBenefitTier` already provides the Category layer and `Member`/`FamilySize` provide Family/Member. There is **no Client entity** between operator and scheme, and no per-client config isolation. Today the implicit model is "Avenue administers groups directly," not "Medvex administers many client payers, each with many schemes."
**Action plan (phased; this is the backbone change).**
- Data model: introduce `Client` (id, operatorTenantId, type INSURER|HMO|EMPLOYER_SELF_FUNDED, name, parentClientId for subsidiaries, currency, branding overrides, terminology dictionary ref, approval-matrix scope, status, effective dates). Add `clientId` to `Group`/scheme and cascade the FK onto all client-scoped entities (network/tariff/copay/fraud-threshold/report-template configs). Decide and document the relationship between `Tenant` and `Client`: recommended — `Tenant` becomes the **Medvex operator** singleton (the TPA itself) and `Client` becomes the per-payer boundary. (Rename ambiguity: see OD-14 and §D.)
- Migration: write a data-migration that creates a default `Client` for existing groups so nothing breaks; backfill `clientId`. Never-delete preserved.
- Isolation enforcement: extend tRPC context (`src/server/trpc/context.ts`) and the `protectedProcedure` guard so every query is client-scoped, not just tenant-scoped; add row-level checks in services. Add a cross-client access assertion to the audit chain.
- RBAC: extend roles to carry a client scope (a Medvex ops user may span clients; a client's own users are confined to their client).
- UI: `/(admin)/clients/` management; client switcher in the admin shell; client context surfaced on every list/detail.
- Tests: cross-client isolation test suite (no query returns another client's rows); migration idempotency; audit-chain client assertion.
**Dependencies.** Touches nearly every router/service — sequence first in Phase 0. Pairs with terminology (G2.4), approval matrix (G3.1), multi-currency (G3.5), branding (§D).

#### G2.2 — Division parameter (spec §2.2) · `New` · S2 · Effort S
**Requirement.** Carry the KCB "division" concept (general lines vs. medical) for production reporting and GL routing.
**Current state.** No `division` field on policies/quotations/GL. `clientType` exists but is not the same axis.
**Action plan.** Add `division` enum/field to `Group`/`Quotation` and thread into GL posting (`gl.service.ts`) and production reports (§7). Configurable per client.
**Dependencies.** GL (G5.8), reporting (G7).

#### G2.3 — Admin-fee revenue model (spec §2.3) · `New` · S0 · Effort L
**Requirement.** TPA earns *administration fees*, configured per Client/Scheme, supporting at least: PMPM; % of claims paid (period-end); flat fee per insured (policy start); case-management/pre-auth/cross-border-coordination fees; card issuance/replacement fees. Fees must be invoiceable/receiptable, feed the IRA compliance-levy computation (G1.1), and be reportable as an admin-fee statement (§7).
**Current state.** Partial foundation only: `AdminFeeMethod` enum has `FLAT_PER_INSURED` and `PCT_OF_CLAIMS`, on **self-funded groups only** (`Group.adminFeeMethod/adminFeeRate`, `SelfFundedAccount`, `FundTransaction` type `ADMIN_FEE`). There is no PMPM, no case-management/pre-auth/cross-border fee, no card-fee-as-admin-fee, and the model is scoped to self-funded funds rather than being the TPA's primary revenue line across all clients.
**Action plan.**
- Data model: generalise into an `AdminFeeAgreement` (clientId/schemeId, method enum extended to PMPM|PCT_CLAIMS|FLAT_PER_INSURED|CASE_MGMT|PREAUTH|CROSS_BORDER|CARD_ISSUANCE|CARD_REPLACEMENT, rate, currency, effective dates) and an `AdminFeeLedger` (the system of record for fees earned, per period, per client) feeding invoicing.
- Service: `admin-fee.service.ts` — accrual engine (PMPM monthly from active-member counts; PCT_CLAIMS at period close; flat at policy start; event-driven for case-mgmt/pre-auth/card). Emits invoice lines (G5.8) and ledger entries; the ledger is the levy basis (G1.1).
- Jobs: `admin-fee-accrual.job.ts` (monthly + period-close).
- UI: per-client admin-fee agreement editor; admin-fee statement report.
- Tests: each method computes correctly; PMPM ties to membership counts; PCT_CLAIMS ties to paid claims; ledger reconciles to invoices and to the levy return.
**Dependencies.** Multi-client (G2.1), finance/invoicing (G5.8), compliance levy (G1.1), multi-currency (G3.5).

#### G2.4 — Terminology engine per client (spec §2.4, Module 2) · `New` (spec says Covered — it is NOT in this repo) · S1 · Effort M
**Requirement.** Resolution order: system default → Medvex house → **Client override** → locale. Each client presents its own vocabulary while enums stay canonical in code.
**Current state.** **Absent.** No `TerminologyEntry` model, no `terminology.service.ts`, no `useTerm()` hook; user-facing strings are hard-coded across the app. Confirmed by `AICARE_TODO` T-01…T-08 (all open). The spec's "Covered" tag is inherited from a companion corpus (`AICARE_COMPETITIVE_HARDENING_SPEC.md`) that is **not present in this repository**.
**Action plan.** Implement T-01…T-08 from `AICARE_TODO.md`, extended for multi-client:
- Data model: `TerminologyEntry` (scope: SYSTEM|HOUSE|CLIENT|LOCALE, clientId?, key, displayText, context, effective dates) + `TerminologyApproval` (maker-checker).
- Service: `terminology.service.ts` — `resolve(clientId, key, fallback)` with the four-level fallback; in-memory cache + Redis invalidation.
- API/UI: `terminology` tRPC router (list/upsert/approve/reject/preview); admin page with approval queue.
- Frontend: `useTerm(key)` hook + `TermProvider`; surface-sweep hard-coded "policy/premium/insure/claim/endorsement" strings.
- Seed: a Medvex house dictionary; per-client overrides on demand.
**Dependencies.** Multi-client (G2.1). Unblocks the regulatory-positioning artifact (G1.3).

---

### C-3 · Medvex partner requirements (spec §3)

#### G3.1 — Approval matrix & authorization levels (Req 1, spec §3.1) · `Partial→New` · S0 · Effort L
**Requirement.** A configurable, **client-scoped** approval matrix governing which roles approve which **action types** at which **currency-normalised amount bands**, with multi-level sequential approval, enforced segregation of duties (maker ≠ checker), SLA timers + escalation, never-delete versioning (decisions resolve against the matrix version in force at decision time), and a rights-and-roles report. Actions governed: claim auth/payment, pre-auth/GOP, benefit-limit overrides, scheme/binder activation, commission-rate changes, member endorsements, provider-tariff changes, fund top-ups, write-offs/refunds.
**Current state.** A thin `ApprovalMatrix` model exists: `tenantId`, `claimValueMin/Max`, `serviceType?`, `benefitCategory?`, `requiredRole` (string), `requiresDual` boolean, effective dates. It is **tenant-scoped not client-scoped**, **claims-only** (no action-type taxonomy), single-role (no multi-level sequence), has **no currency normalisation**, **no SLA/escalation fields**, and **no version-resolution at decision time**. `AICARE_TODO` V-02 flags that it may be seeded but not actually enforced by routers at runtime. Maker-checker exists ad-hoc (e.g. `OverrideRecord`, binding) but not as a general engine.
**Action plan.**
- Data model: redesign to `ApprovalMatrix` (clientId, schemeId?, `actionType` enum, `amountBandMin/Max` in **base currency**, `currency` of evaluation, sequence steps) + `ApprovalStep` (level, requiredRole(s), SLA minutes, escalationTargetRole) + `ApprovalRequest`/`ApprovalDecision` runtime tables with resolved `matrixVersionId`. Keep effective-date versioning.
- Service: `approval-matrix.service.ts` — `resolve(action, amount, currency, client)` returns exactly one path; `enforceSegregationOfDuties()`; FX-normalises the amount (G3.5) before band evaluation; writes every decision to the audit chain with the resolved version id.
- Wire-in: route claim auth/payment, pre-auth/GOP, overrides, endorsements, tariff changes, commission changes, fund top-ups, write-offs/refunds through the engine (replaces scattered ad-hoc checks). Resolves `AICARE_TODO` V-02.
- Escalation: extend `sla-breach.job.ts` to auto-escalate unactioned approvals to the next level.
- UI: `/(admin)/settings/approval-matrix` upgraded to a multi-level, action-typed editor (a page already exists at that path — extend it); rights-and-roles report (KCB R26, already present as `user-rights-roles` report — extend to show approvable actions).
- Tests: every approvable action resolves to one path; no approval outside the matrix; maker≠checker enforced; currency-normalised bands; version-at-decision-time.
**Dependencies.** Multi-client (G2.1), multi-currency/FX (G3.5), audit chain (Covered). **Phase 0.**

#### G3.2 — Pre-authorization online management (Req 2, spec §3.2) · `Partial` · S1 · Effort M
**Requirement.** Provider-initiated pre-auth, clinical + benefit checks, **20–30 min target turnaround**, GOP issuance within pre-approved limits, validity windows, live queue with escalation; offline provisional decisions against cached balance.
**Current state.** Solid base: `PreAuthorization` model, `preauth-adjudication.service.ts`, `preauth-escalation.job.ts`, admin + member pre-auth pages, email alerts. Missing: explicit 20–30 min SLA target instrumentation, GOP-within-financial-limits issuance object, and **offline provisional pre-auth** (depends on G4).
**Action plan.** Add a GOP issuance artefact + financial-limit guard; add SLA-target config + dashboard timer; integrate provider-initiated channel; add offline provisional path (G4). Confirm `AICARE_TODO` V-05 (PA email alerts on submit/approve/decline).
**Dependencies.** Offline (G4), approval matrix (G3.1).

#### G3.3 — Active claims dashboard with incoming-claim alerts (Req 3, spec §3.3) · `New` · S1 · Effort M
**Requirement.** Real-time ops console: incoming-claim alerts (in-app + email + optional SMS) the moment a claim lands from *any* channel; live work queues by state (received→registered→captured-awaiting-auth→authorised→paid); per-queue SLA timers + escalation; per-user productivity widgets; customisable per-role dashboard; drill-through to member history + duplicate guard; filters by client/scheme/provider/currency/risk.
**Current state.** There is an admin dashboard (`/(admin)/dashboard`) and a `notification.service.ts`, and `sla-breach.job.ts`, but **no real-time incoming-claim alert pipeline** and no channel-agnostic "claim landed" event/queue console as specified. Bill lifecycle states exist on `ClaimStatus` (good substrate).
**Action plan.**
- Event: emit a `claim.received` domain event on every capture path (online, EDI, offline sync, Excel import, USSD/SMS, smart-claim) → fan out to in-app notification + email + optional SMS.
- Real-time: add an in-app alert channel (SSE or polling; avoid new infra — can ride existing notification tables + a lightweight poll, or add a Redis pub/sub already available via ioredis).
- UI: `/(admin)/claims/queues` console — columns per lifecycle state, SLA countdown per card, productivity widgets (claims booked per user — KCB R64, report already exists), filters, drill-through to member history (`/claims/new` already surfaces history per V-07).
- SLA/escalation: per-queue timers in `sla-breach.job.ts`.
- Tests: a claim on any channel raises an alert and lands in the right queue within seconds (online) / seconds-of-sync (offline); every queue has a working timer + escalation.
**Dependencies.** Offline sync (G4) for the offline path; multi-channel capture (G5.6).

#### G3.4 — Copay management by AiCare/Medvex (Req 4, spec §3.4) · `Partial` · S2 · Effort M
**Requirement.** Platform is system of record that computes, applies, and reconciles copays on behalf of client payers at adjudication — %-of-limit or flat, per-cover, configurable at setup, editable at underwriting, enforced at payment; offline: computed locally at capture, re-validated on sync.
**Current state.** Strong base: `CoContributionRule`, `AnnualCoContributionCap`, `CoContributionTransaction`, `MemberCoContributionPayment`, `coContribution/{calculator,ruleResolver,coContribution.service}.ts`, packages UI manager. Missing: explicit **client-scoping** (currently tenant/package-scoped), and **offline local computation + re-validation** (G4).
**Action plan.** Client-scope the rules (G2.1); confirm enforced-at-payment in the payment path; add offline copay computation against cached rules + re-validation on sync (G4). Reconciliation/reporting largely exists.
**Dependencies.** Multi-client (G2.1), offline (G4).

#### G3.5 — Multi-currency underwriting & claims for subsidiaries (Req 5, spec §3.5) · `New` · S0 · Effort L
**Requirement.** Currency per Client/Scheme/policy; FX rate tables with effective dating + source (activate/deactivate, never delete); currency-normalised approval bands; reporting in transaction + base currency with FX gain/loss; consolidated parent + per-subsidiary views (claims experience, loss ratio, admin fees). Regional client = parent Client with subsidiary Clients, each potentially a different currency.
**Current state.** **KES is assumed everywhere.** `currency String @default("KES")` appears on only two models (`Commission`/broker context); schema comments and constants hard-code KES; `KENYAN_COUNTIES` in `src/lib/constants.ts`. No `Currency`/`FxRate` entity, no currency on `Group`/`Quotation`/`Claim`/`Invoice`/`Payment`/fund/admin-fee, no normalisation, no consolidation, no FX gain/loss.
**Action plan.**
- Data model: `Currency` reference (ISO 4217) + `FxRate` (base, quote, rate, source, effective dates, isActive — never delete). Add `currency` to `Client`, `Group/Scheme`, `Quotation`, `Claim`, `Invoice`, `Payment`, `FundTransaction`, admin-fee entities. Store amounts with their currency; add `baseAmount`/`baseCurrency` derived columns where needed for normalisation.
- Service: `fx.service.ts` — `rateAt(base, quote, date)`, `normalise(amount, currency, date)`; integrate into approval-matrix band evaluation (G3.1), GL posting, and reporting.
- Reporting: dual-currency columns; FX gain/loss view for finance; parent+subsidiary consolidation in analytics (`analytics.service.ts`).
- Migration: backfill existing rows to KES (or the chosen base) explicitly; document the assumption (resolves `AICARE_TODO` V-10).
- Tests: a subsidiary-currency claim is captured→adjudicated→copay→approved on normalised bands→paid in correct currency; consolidated reporting reconciles to subsidiaries at in-force FX.
**Dependencies.** Multi-client (G2.1), approval matrix (G3.1), GL/finance (G5.8), analytics (G5.12). **Phase 3 per spec, but the schema/`currency` columns should land in Phase 0/1 to avoid rework.**

#### G3.6 — Backup for online claims submission (Req 6, spec §3.6) · `New` · S0 · Effort XL
This is the offline-first architecture — see **C-4 / G4** in full. "Backup" = layered channels (offline point-of-care capture + store-and-forward sync, Excel/CSV import, smart-claim capture, USSD/SMS) all converging on one claim model with idempotency + conflict resolution.

#### G3.7 — Auto-registration & auto-adjudication (Req 7, spec §3.7) · `Partial` · S1 · Effort L
**Requirement.** (a) Auto-registration of members via pop-up, bulk import/spool, or self-service with NIRA validation + de-dup, family-tree aware. (b) Auto-adjudication: clean low-risk claims passing all deterministic gates (active membership, benefit available, within limit, valid tariff, no duplicate, no fraud flag, pre-auth satisfied) auto-approve without human touch; everything else routes to the matrix path with the failing gate named; AI-assisted checks augment but never silently override; every auto-decision explainable + audit-chained; criteria client-configurable + versioned.
**Current state.** Auto-registration: member creation, bulk import (`members/import`, `intake.service.ts`), family tree exist; identity validation is **IPRS (Kenya) stub** — needs NIRA (G5.9). Adjudication: `claim-adjudication.service.ts` runs deterministic gates; pre-auth has numbered gates. Missing: an explicit **auto-approve vs route** decision with client-configurable + versioned criteria, the "failing-gate-named" routing contract, and the AI-assist layer hooks.
**Action plan.** Add an `AutoAdjudicationPolicy` (client-scoped, versioned: which gates must pass to auto-approve, value ceilings, validity windows). Refactor adjudication to return a structured result (pass/route + failing gate) and route non-clean claims through the approval matrix (G3.1). Swap IPRS→NIRA (G5.9). Add AI-assist hooks (G5.11) as advisory only, audit-chained. 
**Dependencies.** NIRA (G5.9), approval matrix (G3.1), fraud/AI (G5.11), offline (G4).

#### G3.8 — Integration with other systems (Req 8, spec §3.8) · `Partial` · S1 · Effort L
See **C-8 / G8** for the full catalogue. Anchor swaps: mobile money (MTN MoMo, Airtel Money), provider/EMR/EDI (Slade360/Smart/FHIR R4), NIRA, insurer/HMO core, SMS/USSD, accounting/GL, banking/EFT, plus integration logging (KCB R3) + data dictionary (KCB R18) per interface.

---

### C-4 · Offline-first & asynchronous architecture (spec §4) — **headline gap**

#### G4 — Offline point-of-care + store-and-forward sync · `New` · S0 · Effort XL
**Requirement.** The point of care keeps working offline (member verification, pre-auth, claims) and reconciles on reconnect with zero data loss. Server is source of truth; client is a durable buffer; every offline op is idempotent (client UUID + op key); async by default, extending BullMQ into a sync-reconciliation engine. Includes: a resilient provider PWA with IndexedDB store of cached eligibility/balances/tariffs/copay/pre-auth rules; offline capture of check-in/pre-auth/claim/images; local provisional decisions; visible per-record sync state. On reconnect: idempotency check → authoritative re-validation → deterministic conflict resolution (no last-write-wins for financial records; re-sequence benefit decrements by clinical event time; insufficient balance → flag for review) → adjudication → audit-chain entry with provisional-vs-final delta. Eligibility-cache integrity via soft-reservation buffer, time-boxed validity, and reconciliation flags. USSD/SMS promoted to first-class.
**Current state.** **Effectively nothing at the data layer.** `public/sw.js` is a shell-cache service worker that *explicitly bypasses* `/api/`, `/member/`, `/broker/`, `/fund/` and `/auth/` (network-only `event.respondWith(fetch(request))`). `PWARegister.tsx` just registers `sw.js`. `manifest.webmanifest` is a member-portal shell. There is no IndexedDB, no offline write buffer, no sync engine, no eligibility cache, no conflict resolution. USSD/SMS exist as online services (`ussd.service.ts`, `sms-query.service.ts`, `low-bandwidth-channel.service.ts`) but are not offline-channel-integrated. `ClaimSource` enum has SMART/SLADE360/HMS/BATCH but no `OFFLINE_SYNC`/`USSD`/`SMS` source.
**Action plan (build in slices; Phase 0 scaffold → Phase 1 end-to-end).**
- **Service worker / PWA (Serwist):** replace `sw.js` with a Serwist-based worker; precache the provider-client shell; add a background-sync queue. Keep member shell behaviour.
- **Local store (IndexedDB):** schema for cached eligibility + benefit balances (net of soft-reservation buffer), tariff/price list, copay rules, pre-auth rules; refreshed on schedule + on demand; time-boxed validity (shorter for near-limit/high-risk members).
- **Offline capture:** provider front-desk flows for member check-in/verification, pre-auth request, claim/bill, and supporting images (queued to local object cache, uploaded to MinIO on sync). Client-generated UUID + operation key on every record (idempotency).
- **Provisional decisions (local):** eligibility (active?), benefit-available vs cached balance, copay computation, duplicate-claim guard within local queue. Visible sync state per record (pending|synced|conflict|rejected) + manual "sync now."
- **Sync-reconciliation engine (server):** extend BullMQ (`src/server/jobs/`, `src/lib/queue.ts`) with a `sync-reconcile` queue implementing the 5-step pipeline: idempotency drop → authoritative re-validation → deterministic conflict resolution (re-sequence decrements by clinical event time; insufficient → review flag, never silent reject/overpay) → adjudication (feeds G3.7/G3.1) → audit-chain entry with provisional-vs-final delta.
- **Data model:** `SyncOperation` (clientUuid, opKey, entityType, payload, deviceId, capturedAt, syncedAt, state, conflictReason), `EligibilitySnapshot`/`CachedBalance` server-side provenance, `OfflineReservation` (soft hold). Add `OFFLINE_SYNC`, `USSD`, `SMS` to `ClaimSource`.
- **First-class USSD/SMS (G4.5):** wire `ussd.service.ts`/`sms-query.service.ts` for verification, visit initiation, OTP authorisation, balance queries independent of app availability.
- **Tests (the spec's headline acceptance):** provider client offline for a full working day → zero record loss; on reconnect all reconcile with correct final balances + complete audit trail; over-commitments flagged, never silently paid/dropped. Plus idempotency-on-retry and stale-cache-overspend tests.
**Dependencies.** Touches claims (G5.6), pre-auth (G3.2), copay (G3.4), eligibility, dashboard (G3.3), audit chain. **Scaffold in Phase 0; complete end-to-end in Phase 1.**

---

### C-5 · Core TPA functional modules (spec §5)

#### G5.1 — Client & scheme setup (spec §5.1) · `Partial` · S2 · Effort M
**Current state.** Binder/product config exists: `Package`/`PackageVersion`, packages builder UI, maker-checker on binding, pricing reference at binder level (rate matrix, Excel import via `exceljs`/`papaparse`). Missing per spec/KCB: an explicit **progress bar + completeness report** (R38/R39 — note a `product-completeness`/`quotation-funnel` report exists; verify it covers binder completeness), per-client **workflow customisation** (R14), **jobs-scheduling screen** (R11), **function prioritisation** (R12).
**Action plan.** Add binder completeness progress UI; client-scoped workflow config; a jobs-scheduling/monitoring screen (overlaps `AICARE_TODO` H-06 BullMQ admin UI). Division param (G2.2). Client-scope all binder config (G2.1).

#### G5.2 — Membership administration (spec §5.2) · `Partial` · S2 · Effort M
**Current state.** Strong: creation (pop-up/import/self-service), bulk import (`members/import`), family tree (`FamilyTreeView`), endorsements (add/delete/cancel/reinstate — `endorsement.service.ts`, `Endorsement`, `MembershipReinstatementRequest`), transfers (member→scheme, category→category), cards (`MembershipCard`, photo/smart, replacement+billing `D-04`), renewals (`renewal.service.ts`, `renewal-reminder.job.ts`). Missing/adapt: identity is IPRS→**NIRA** (G5.9); biometric-from-smart-card capture (KCB R49) — verify; renewal SMS actually dispatched (`AICARE_TODO` V-04).
**Action plan.** Swap identity to NIRA (G5.9); confirm renewal-notice SMS dispatch (V-04); client-scope membership (G2.1); add offline check-in capture (G4).

#### G5.3 — Underwriting & quotation (spec §5.3) · `Partial` · S2 · Effort M
**Current state.** Rensoft model largely present: client/policy generation, covers/sections with riders, benefit limits per category (per family/member), shared-limit groups (`SharedLimitGroup`), copay editable at underwriting, taxes/levies at setup (`TaxRate` — but **Kenyan** `TaxType`: STAMP_DUTY/TRAINING_LEVY/PHCF), self-funded fund-deposit + admin-fee, policy authorisation with exception generation (`ExceptionLog`). Missing/adapt: **Ugandan tax/levy schedule** (OD-3) replacing Kenyan constants; **currency** on policy (G3.5); intelligent medical quotation module (KCB R84, OD-5 → Phase 3).
**Action plan.** Replace `TaxType` enum + seeded rates with Ugandan equivalents (OD-3); add policy currency (G3.5); confirm self-funded priority in-scope (OD-4); plan intelligent quotation for Phase 3 (OD-5).

#### G5.4 — Provider network management (spec §5.4) · `Partial→New` · S1 · Effort L
**Requirement (the stickiness moat).** Onboarding/KYC, contracting, digital directory; per-provider/client tariff management with agreed rate at claims level (KCB R56); automated reconciliation of provider statements (R58) and **shortened settlement cycles** (~60–77 days → ~3 days); provider scorecards (turnaround/leakage/anomaly) + suspension/curation workflow.
**Current state.** Good base: `Provider`, `ProviderTariff`, `ProviderDiagnosisTariff`, `ProviderContract`(+exclusions), `ProviderSettlementBatch`, `provider-contracts.service.ts`, `bank-reconciliation.service.ts` (statement reconciliation `D-07`), `ProviderScorecard` (analytics), `suspension-check.job.ts`. Missing/adapt: **per-client tariffs** (shared master network with per-client rates — needs G2.1 scoping), accelerated settlement workflow target, scorecard surfacing into a curation/suspension decision flow, member-facing locator (G5.10).
**Action plan.** Client-scope tariffs; add settlement-cycle acceleration workflow + targets; promote scorecards into an actionable suspension/curation workflow (never-delete); confirm directory feeds member locator (G5.10).

#### G5.5 — Pre-authorization & utilization management (spec §5.5) · `Partial` · S1 · Effort M
Covered substantially (see G3.2). Add: utilisation-review/gatekeeping analytics tie to loss-ratio (G5.12); GOP-within-limits artefact; 20–30 min SLA instrumentation; offline provisional path (G4). Email alerts (KCB R57) + escalation (R59) exist (`preauth-escalation.job.ts`) — confirm V-05.

#### G5.6 — Claims management (spec §5.6) · `Partial` · S1 · Effort L
**Current state.** Operational heart exists: `Claim`/`ClaimLine`/`AdjudicationLog`, `claims.service.ts`, `claim-adjudication.service.ts`, capture pages, Excel import (`claims/import`, `/api/claims/import`), reimbursement flow, duplicate-capture DB constraint (`D-16`), bill lifecycle on `ClaimStatus` (`V-01` substrate), member-history-at-capture (`V-07`), reimbursements (`reimbursement.service.ts`), allocation (`intake-allocation.job.ts`). `ClaimSource` = MANUAL/REIMBURSEMENT/PREAUTH/SMART/SLADE360/HMS/BATCH. Missing/adapt: **offline-sync, USSD/SMS, smart-claim** capture sources (G4); the active dashboard + incoming alerts (G3.3); auto-adjudication decisioning (G3.7); unique claim/invoice number per provider (KCB R62 — verify); utilisation notifications to members (R69, confirm V-03).
**Action plan.** Add the three missing capture channels + sources (G4); wire the dashboard/alerts (G3.3); structured auto-adjudication (G3.7); verify R62 uniqueness + V-03 notifications; client-scope + multi-currency (G2.1/G3.5).

#### G5.7 — Copay & benefit-limit enforcement (spec §5.7) · `Partial` · S2 · Effort M
Covered base (see G3.4) plus benefit-limit enforcement at adjudication against per-family/per-member and **shared-limit-group** balances (`SharedLimitGroup`, `BenefitUsage`) with real-time decrement. Add: **offline soft-reservation** decrement model (G4.4); exceeded-limit reporting exists (`exceeded-limits` report). Client-scope rules (G2.1).

#### G5.8 — Finance & billing (spec §5.8) · `New`/`Partial` · S0 · Effort L
**Current state.** GL exists (`ChartOfAccount`, `JournalEntry`/`JournalLine`, `gl.service.ts`, `/billing/gl`), invoices/payments/vouchers, self-funded funds + top-ups + alerts (`fund-balance-alert.job.ts`), receipting, debtors/creditors report, allocation, bank integration via reconciliation. Missing for TPA: **admin-fee invoicing/receipting across PMPM/%-claims/flat/case-mgmt** (G2.3 — only self-funded flat/%-claims today); feed to **IRA compliance-levy** (G1.1); **multi-currency throughout** (G3.5); cheque/EFT payment detail completeness (KCB R67 — verify).
**Action plan.** Build the admin-fee ledger + invoicing (G2.3); levy feed (G1.1); multi-currency on all finance entities (G3.5); verify EFT/cheque capture and bank EFT integration (G8).

#### G5.9 — Member & provider identity (spec §5.9) · `Partial` · S0 · Effort L
**Requirement.** NIRA national-identity integration (validate + de-dup at onboarding, cross-reference photo); biometric verification (fingerprint/face) with **liveness** at point of care; OTP-based authorisation to principal's phone; virtual/digital member card with WebAuthn check-in.
**Current state.** Identity = **IPRS (Kenya) stub** (`integrations/iprs.service.ts`, referenced in `intake.service.ts` gate 5 + `binding.service.ts`; `kycRecord.iprsNote` in onboarding UI). Biometric: WebAuthn enrolment + check-in built (`secure-checkin/*`, `MemberWebAuthnCredential`, `CheckInChallenge`, `CheckInEvent`); face-match is a **stub adapter** (`secure-checkin/adapters/face-match.ts`) pending vendor (`AICARE_TODO` B-01/D-05, P-04). OTP fallback partial (B-03). Virtual card exists (`MembershipCard`, member card page).
**Action plan.** Build `integrations/nira.service.ts` mirroring the IPRS interface; swap all IPRS call-sites (`intake.service.ts`, `binding.service.ts`, onboarding UI) to NIRA, keeping a clean adapter boundary; rename `iprsValidated`/`iprsNote` fields → identity-neutral (e.g. `identityValidated`/`identityNote`) via migration. Select + integrate liveness vendor for Uganda (OD-6, P-04). Complete OTP authorisation path. `Verify` NIRA API availability/commercial terms (OD-6).
**Dependencies.** Auto-registration (G3.7), offline capture (G4).

#### G5.10 — Member experience (spec §5.10) · `Partial` · S1 · Effort L
**Current state.** Member PWA pages (dashboard, benefits, dependents, utilization, preauth, facilities, support, wallet, health vault, security), `member-app.service.ts`, real-time utilisation, provider locator (`member/facilities`, `leaflet`/`react-leaflet`), member payments via **M-Pesa** (`integrations/mpesa.service.ts`, `member/payments/mpesa/*`), USSD/SMS services. Missing/adapt: **mobile money rails → MTN MoMo + Airtel Money** (replace M-Pesa, OD-7); USSD/SMS as **first-class offline** channels (G4.5); provider locator cost transparency; renewal/utilisation SMS (V-03/V-04).
**Action plan.** Build `integrations/momo.service.ts` + `integrations/airtel-money.service.ts` mirroring the mpesa adapter; replace M-Pesa call-sites + UI strings; carry the "fake-confirmation-not-reversal" fraud reframing (OD-7); first-class USSD/SMS (G4.5); cost-transparency in locator.
**Dependencies.** Offline (G4), fraud reframing (G5.11), payments (G5.8).

#### G5.11 — Fraud, waste & abuse controls (spec §5.11) · `Partial` · S1 · Effort L
**Current state.** `fraud.service.ts` (~12 deterministic rules), `ClaimFraudAlert`, `MemberRiskProfile`, `ProviderScorecard`, `InternalBlacklist`/`blacklist.service.ts`, fraud UI. Per `AICARE_TODO` F-01…F-12, the **configurable rules engine, anomaly-detection batch layer, investigation workflow, provider risk profile, and PSHP conflict-of-interest** items are open. The PSHP "internal vs external parity" engine (`analytics/parity`) is Avenue-specific and must be **re-framed** for arm's-length provider–member collusion.
**Action plan.** Implement the configurable `FraudRule` engine + `FraudFlag`/`Investigation`/`ProviderRiskProfile` + nightly anomaly job (F-01…F-12); **re-weight typologies** for Uganda (phantom billing, dual invoicing, upcoding, unbundling, identity sharing, collusive networks, AI-forgery); add **AI-assisted clinical auditing** hooks (IDP/OCR/NLP → ICD-10/11, procedure-vs-diagnosis), advisory-only + audit-chained; **shared-fraud-database readiness** (contributable/consumable fingerprints for a future UIA syndicated blacklist); repurpose the conflict-of-interest register for staff–provider relationships and re-frame the parity engine.
**Dependencies.** Multi-client (G2.1), auto-adjudication (G3.7).

#### G5.12 — Strategic purchasing & analytics (spec §5.12) · `Partial` · S2 · Effort M
**Current state.** `analytics.service.ts`, `AnalyticsMlrSnapshot`, `CaseMixWeight`, `ProviderScorecard`, `MemberRiskProfile`, `RenewalAnalysis`, `AnalyticsAlert`, board pack, analytics pages. Missing/adapt: **per-client/per-scheme loss ratio** as first-class KPI with the 60–80% band + alerting toward the 109% danger zone; consolidated parent/subsidiary loss ratio (G3.5).
**Action plan.** Add per-client loss-ratio KPI + band alerting; subsidiary consolidation; reuse case-mix-adjusted MLR + risk stratification. Re-orient board pack to client-payer loss-ratio story.

#### G5.13 — Broker / intermediary management (spec §5.13) · `Covered` · S3 · Effort S
**Current state.** Module 1 is genuinely present and strong (see §B). Only adaptation: replace **Kenyan withholding/IRA-levy** specifics with **Ugandan tax + IRA-UG agent levies** (OD-3) in `commission.service.ts`/`broker-compliance.service.ts`; client-scope where relevant.
**Action plan.** Localise statutory handling (OD-3). Otherwise reuse wholesale.

#### G5.14 — Case management (spec §5.14) · `New` · S1 · Effort M
**Current state.** Absent as a module (`AICARE_TODO` R-19 notes "no case management module yet"). `Complaint` model exists but is narrower.
**Action plan.** Add `Case` model (type chronic|high-cost|complex|DSR, status, assignee, care-navigation notes, linked claims/members), `case-management.service.ts`, `/(admin)/cases/` UI + case-management report (KCB R78/Reports R11). Provides the **DSR workflow surface** for G1.2.
**Dependencies.** DPPA DSR (G1.2).

#### G5.15 — Cross-border / overseas care coordination (spec §5.15) · `New` (optional, Phase 5) · S3 · Effort L
**Current state.** Absent.
**Action plan (gate on OD-8 / client demand).** Coordination layer integrating into client pre-auth: vetted-facility sourcing with upfront estimates, GOP-within-limits commitment, single consolidated audit-ready invoice. Enables the cross-border employee-benefits play.

#### G5.16 — Preventative care & wellness (spec §5.16) · `New` (Phase 4+) · S3 · Effort M
**Current state.** Absent (chronic-disease report exists but not a wellness module).
**Action plan (gate on OD-9).** Funded wellness checks + chronic-disease-management protocols configurable into covers; incentivised wellness layer (activity tracking/gamification). Loss-ratio countermeasure.

---

### C-6 · Platform & non-functional requirements (spec §6)

The spec §6 absorbs the KCB system-administration punch-list. Several map directly to open `AICARE_TODO` H-items. Status against current code:

| Spec / KCB ref | Requirement | Current state | Status | Effort |
|---|---|---|---|---|
| R2 | Multi-currency | KES hard-coded | `New` → G3.5 | L |
| R3 (i18n) | Multi-lingual | None (English only) | `Partial` (H-08) | M |
| R3 (int) | Integration logs | `IntegrationConfig` only; no per-call log | `New` → G8 | S |
| R5/R27 | Online help + helpdesk | None | `New` (H-14) | M |
| R6 | Immutable audit-trail + report | `audit-chain.service.ts`, `AuditLog` | `Covered` | — |
| R7 | Customisable dashboards | Static dashboards | `New` (H-07) → G3.3 | M |
| R8 | Exceptions framework | `ExceptionLog` + UI | `Covered` | — |
| R9 | Error management (defined messages/behaviours) | Ad-hoc | `New` | S |
| R10 | Activate/deactivate + never-delete | Convention used widely | `Covered` | — |
| R11 | Jobs-scheduling screen | BullMQ workers, no UI | `New` (H-06) | S |
| R12/R17 | Function prioritisation | None | `New` | S |
| R14 | Workflow customisation | None (per-client) | `New` → G2.1/G5.1 | M |
| R16/R20/R21/R22 | Security/patching/network/archiving docs | None | `New` (doc deliverables) | S |
| R18 | Data dictionary | None | `New` (H-12) → G8 | S |
| R19 | Maintenance procedures under audit | None | `New` (doc) | XS |
| R23 | Backup procedures in-system | None | `New` | S |
| R24 | Password reset via emailed code | **Absent** (`auth.ts` has no reset) | `New` (H-02) S0 | S |
| R25 | Single-session control | None | `New` (H-03) | S |
| R26 | Rights-and-roles report | `user-rights-roles` report exists | `Covered` → extend (G3.1) | XS |
| R28 | Password policies | Not enforced in `auth.ts` | `New` (V-08) S0 | XS |
| R29/R30 | Log size/retention/archival + Word/Excel/SIEM export | None | `New` (H-04/H-05) | M |
| R31 | Log fields: date/time/event/IP/user | Partial on `AuditLog` (verify V-09) | `Covered`/extend | XS |
| R32 | Authorized-users-only banner | None | `New` (H-09) | XS |
| R33 | High-availability docs | None | `New` (H-11) | S |
| R34 | Disaster-management docs | None | `New` (H-11) | S |
| R35 | Data migration / upload | Member/claims import exist | `Covered`/extend | S |
| R36 | Production change logs | None | `New` (H-10) | S |
| R81 | Two-factor authentication | **Absent** | `New` (H-01) S0 | S |
| R79 | WebLogic deployment test | N/A — Node/Next.js stack | `Verify` → OD-11 (resist) | — |
| R80 | Performance-monitoring tools | `perf.ts` minimal | `New` | S |
| R82 | Password-protected reports | Partial (PDF route, needs qpdf) | `Partial` (R-24) | S |
| R83 | Redundant-design assessment | None | `Verify` | — |

**Security cluster is S0 for go-live:** R81 (2FA/H-01), R24 (password reset/H-02), R28 (password policy/V-08), R25 (single-session/H-03), R32 (auth banner/H-09). These are small individually; batch them as a "platform hardening" slice early. **R79 (WebLogic):** do not absorb — AiCare is a Node/Next.js container stack; escalate via OD-11 only if a client mandates a Java app server.

---

### C-7 · Reporting & analytics (spec §7) · `Covered`/`Partial` · S2 · Effort M

**Current state.** A broad report catalogue already exists via `reports/[reportType]/page.tsx` + `api/reports/[reportType]/export` and the `reports` tRPC router: claims-experience, exceeded-limits, **loss-ratio**, fund-utilisation, **admin-fee**, ageing-analysis, outstanding-bills, membership, provider-statements, member-statements, commission-statements, fees-statements, levies-taxes, debtors-creditors, organic-growth, exclusion-rejected, admissions, admission-visits, claims-per-operator, user-rights-roles, comparison-services, quotation-funnel, plus analytics-portfolio-mlr / scheme-profitability / provider-performance / risk-distribution / renewal-recommendations. `AICARE_TODO` R-01…R-23 are mostly ✅. PDF export route exists; full encryption needs `node-qpdf` (R-24 partial).

**Gaps to close.**
- **Client-scoping + multi-currency awareness** on every report (G2.1/G3.5) — reports currently filter by `ctx.tenantId`.
- **Case-management report** (KCB Reports R11 / R-19) — depends on G5.14.
- **Password-protected reports** — complete encryption (R-24).
- **Regulatory exports (`New`/`Verify`):** IRA-Uganda-facing returns incl. the **annual compliance-levy / fees-received return** (G1.1) and any HMO/insurer-client statutory submissions — swap IRA-Kenya schemas for IRA-Uganda (OD-12).
**Action plan.** Thread client + currency through report queries; add case-mgmt report; finish PDF encryption; build the IRA-UG regulatory export tranche (OD-12). All reports already exportable + individually permissionable — extend permissioning where flagged.

---

### C-8 · Integrations catalogue (spec §8) · `Partial`/`New` · S1 · Effort L

Every interface must carry an **integration log** (KCB R3), a **data-dictionary** entry (R18), retry/idempotency, and a processor record where it touches personal data (G1.2).

| Integration | Current state | Status | Action |
|---|---|---|---|
| **Mobile money** | M-Pesa stub (`mpesa.service.ts`) | `New` | Build MTN MoMo + Airtel Money adapters; replace M-Pesa (G5.10, OD-7) |
| **Provider/EMR/EDI** | SMART/SLADE360/HMS in `ClaimSource` + `IntegrationConfig`; FHIR deferred (D-09) | `Partial` | Add FHIR R4 adaptors; confirm Slade360/Smart live |
| **National identity** | IPRS stub (`iprs.service.ts`) | `Partial` | Build NIRA adapter, swap call-sites (G5.9, OD-6) |
| **Identity/liveness SDK** | face-match stub | `Partial` | Select + integrate UG-covered vendor (OD-6, P-04) |
| **Insurer/HMO core systems** | None | `New` | Per-client adaptors for member/scheme sync, claims hand-off, settlement |
| **SMS/USSD aggregator** | services exist; provider TBD (P-03) | `New` | Select Ugandan aggregator/shortcode; first-class channel (G4.5) |
| **Accounting/GL** | internal GL only | `New` | External GL posting adaptor per finance stack |
| **Banking/EFT** | bank reconciliation (D-07) | `New` | Ugandan banks/EFT payout integration |
| **National scheme (NHIS)** | None | `Verify` | Connectivity-ready posture only (OD-13) |

**Cross-cutting:** add an `IntegrationLog` model (per-call: integration, direction, request/response refs, status, latency, retries, idempotency key) and a generated data dictionary (H-12). Extend `IntegrationConfig.provider` set for the Uganda integrations.

---

## §D. Avenue → Medvex rebrand workstream (leave no trace of Avenue)

> **Brand name confirmed: Medvex** (wordmark `MED✓EX`, "INSURANCE · THIRD PARTY ADMINISTRATOR"; marketing domain `medvex.co.ug`). Earlier drafts and the handoff bundle used "Medvex" and "Medvex" interchangeably; **Medvex is canonical** and is what appears in the UI and code.
>
> **Status: substantially IMPLEMENTED.** As of 2026-06-30 the visual identity and the brand-name/domain/seed sweep are done in code (see D-2…D-6 status flags). The one deliberately-deferred item is the `avenue-*` → `brand-*` **token-name** rename (D-7). Source of truth for values is the `Medvex Design Language` handoff bundle.

**Decision record.**
- **Token values, not names (now):** repoint the existing `--color-avenue-*` token *values* to the Medvex palette so the whole app re-skins instantly without touching the ~3,800 `avenue-*` class usages. The `avenue-*` → `brand-*` *name* rename is a separate, later mechanical pass (D-7).
- **Brand-name anchor = "Medvex"; navy = brand identity, ink = UI primary.** `#000523` (navy) anchors the logo/PWA/tenant brand; `#0B1437` (ink) is the in-app primary (= the `avenue-indigo` token value).

### D-0 — Medvex Design Language (token reference, source of truth)

**Palette.**

| Role | Hex | Where used | Mapped to token (value) |
|---|---|---|---|
| Navy (Primary · brand) | `#000523` | Logo, sidebar, cover/dark cards, PWA `theme_color`, Tenant `primaryColor` | `--color-avenue-navy`; Tenant default |
| Navy 700 | `#142150` | Panels, depth, primary hover | `--color-avenue-navy-700`, `--color-avenue-indigo-hover` |
| Ink | `#0B1437` | **In-app primary** (buttons/headings/links), PDF/report headers | `--color-avenue-indigo`, `--color-avenue-text-heading`, `--foreground` |
| Teal (Accent · confirm) | `#06B9AB` | Confirmation, emphasis, accent CTAs, Tenant `accentColor` | `--color-avenue-teal`; Tenant default |
| Teal dark | `#058A80` | Links/eyebrows on light, hover targets | `--color-avenue-secondary` |
| Teal tint | `#E4F7F5` | "In review" badge bg, soft surfaces | `--color-avenue-teal-tint` |
| Coral (Human · sparing) | `#F2715A` | Warm accent, "denied" dot, Tenant `warmColor` | `--color-avenue-pink`, `--color-avenue-coral` |
| Ink / heading text | `#0B1437` | Headings | `--color-avenue-text-heading` |
| Body text | `#41505E` | Paragraphs | `--color-avenue-text-body` |
| Slate (muted) | `#5A6B7B` | Labels, captions | `--color-avenue-text-muted` |
| Surface | `#FFFFFF` | Cards/background | `--color-avenue-bg` |
| Mist | `#EEF2F4` | App background, alt surfaces | `--color-avenue-bg-alt`, PWA `background_color` |
| Border | `#E2E8EC` | Card borders | `--color-avenue-border` |
| Status — approved | `#0F8A5F` (text) / `#16A37B` (dot) / `#E3F6EF` (bg) | Claim "Approved" | `--color-avenue-success` = `#0F8A5F` |
| Status — pending | `#B07407` / `#E6A21A` / `#FBEFD6` | Claim "Pending" | (badge literals) |
| Status — in review | `#0B8077` / `#06B9AB` / `#E4F7F5` | Claim "In review" | `--color-avenue-info` = `#0B8077` |
| Status — denied | `#C04A39` / `#F2715A` / `#FBE7E3` | Claim "Denied" | `--color-avenue-error` = `#C04A39` |

**Typography.** Display/headings = **Sora** (400/600/700/800); body/UI = **Hanken Grotesk** (400/500/600/700); mono = `ui-monospace`. Loaded via `next/font/google` in `layout.tsx` (`--font-sora`, `--font-hanken`) and wired into `--font-heading` / `--font-body` / `--font-ui` in `globals.css`.

**Logo / icon.** Wordmark `MED✓EX` with the **V-mark** = a teal (`#06B9AB`) checkmark on a navy (`#000523`) rounded square, doubling as app icon/favicon/avatar — "a check that means approved." Implemented as `public/icons/medvex-icon.svg` (rounded) and `medvex-maskable.svg` (full-bleed).

**Domain.** `medvex.co.ug` (emails `…@medvex.co.ug`).

### D-1 — Branding implementation status (done vs remaining)

**✅ DONE (in code, typechecks):**
- **Design tokens repointed** to the Medvex palette in `src/app/globals.css` `@theme` (all `--color-avenue-*` values + new `avenue-navy/navy-700/teal/teal-tint/coral`; added the previously-undefined `avenue-secondary`; `--foreground` → ink). Token *names* unchanged.
- **Typography** swapped to Sora + Hanken Grotesk in `layout.tsx` + `globals.css` + all three PDF templates + admin `font-[…]` utilities.
- **Icons + PWA**: `medvex-icon.svg` / `medvex-maskable.svg` created; `manifest.webmanifest` (name/colours/icons) and `sw.js` shell assets updated; `layout.tsx` metadata + `themeColor #000523`.
- **Hard-coded brand hexes** swept in ~30 files (status badges, form borders, buttons, charts, PDF templates/components, member-card gradient): `#292A83→#0B1437`, `#435BA1→#142150`, `#F5C6B6→#F2715A`, `#a0522d→#C04A39`.
- **Brand-name strings** `"Avenue Healthcare/Health/Portal"` → **Medvex** across 19 files.
- **Domains** `avenue.co.ke` / `avenue.healthcare` / `avenuehealthcare.com` / `avenue.local` → `medvex.co.ug` (notification from-address, fund-alert link, login demo creds, `.env`, support pages); export filenames `avenue-*`→`medvex-*`.
- **Seed + Tenant defaults**: `prisma/seed.ts` + `seed-safaricom.ts` operator tenant → **Medvex** (slug `medvex`, Medvex palette/fonts, demo password, all `@medvex.co.ug` accounts, re-branded demo packages/providers); `schema.prisma` Tenant `@default`s → navy/teal/coral + Sora/Hanken; `TenantThemeInjector` default-guards updated.

**⛔ REMAINING:**
- **D-7** token-*name* rename `avenue-*` → `brand-*` (~3,760 usages) — deferred by decision; app already renders Medvex via the repointed values.
- **D-8** Kenya-specific constants (counties/KES/tax enums) — tracked under the functional gaps (G3.5/G5.3), not pure branding.
- **D-9** docs/repo/non-shipped: `Avenue_Style_Guide.md`, `README`/`GEMINI`/`AGENTS`/`CLAUDE`, `uat/` + `archive/`, repo folder name `avenue-portal`.
- ~~Orphaned old `public/icons/avenue-*.svg`~~ — ✅ removed.

### D-2 — Design tokens (values) · ✅ DONE
`src/app/globals.css` `@theme` now holds the D-0 palette under the existing `avenue-*` names; `avenue-secondary` added; `--foreground` = `#0B1437`. The app re-skins to Medvex with zero class-usage changes.

### D-3 — Typography · ✅ DONE
Sora + Hanken Grotesk via `next/font/google`; verified present in Next's font registry. PDF templates' Google-Fonts links + font stacks updated.

### D-4 — Icons & PWA · ✅ DONE
V-mark icons created; manifest + `sw.js` + `layout.tsx` metadata/`themeColor` updated.

### D-5 — Brand copy, domains, URLs · ✅ DONE
All "Avenue …" brand strings → Medvex; `tenant?.name ?? "…"` fallbacks → "Medvex"; domains → `medvex.co.ug`. `fund-balance-alert.job.ts` link now points at `medvex.co.ug` (optionally promote to an `APP_BASE_URL` env in D-9).

### D-6 — Seed & Tenant defaults · ✅ DONE
Seeded operator tenant = **Medvex** with Medvex brand fields; `schema.prisma` Tenant `@default`s updated; injector guards aligned. (When multi-client tenancy G2.1 lands, seed a Medvex *operator* + sample *client* payers.)

### D-7 — Deferred: `avenue-*` → `brand-*` token-NAME rename · ⛔ PENDING · S1 · Effort M
The only remaining source of the word "avenue" in shipped code (~3,760 class usages + the `@theme` definitions + one comment). Mechanical:
1. In `globals.css`, rename `--color-avenue-*` → `--color-brand-*` (e.g. `avenue-indigo`→`brand-primary`, `avenue-text-heading`→`brand-text-heading`, `avenue-secondary`→`brand-secondary`, `avenue-bg-alt`→`brand-bg-alt`, `avenue-navy/teal/coral`→`brand-*`). Keep the **values** (already Medvex).
2. Global scoped find-replace of class fragments across `src/**/*.{ts,tsx,css}`, **longest-first** (`avenue-text-heading` before `avenue-text…`), and update `TenantThemeInjector` var names.
3. Build + Tailwind compile + `uat/visual_ui` diff; confirm zero `avenue-` fragments remain.
> Neutral `brand-*` (not `medvex-*`) keeps it immune to a future rebrand.

### D-8 — Kenya-specific data (branding-adjacent) · ⛔ PENDING · S2 · Effort S
`src/lib/constants.ts` `KENYAN_COUNTIES` → Ugandan districts/configurable; "KES" UI strings → currency-driven (G3.5); `TaxType` enum → Ugandan (G5.3, OD-3). Also `toLocaleDateString("en-KE")` call-sites → locale-driven.

### D-9 — Docs, repo, assets, non-shipped trees · ⛔ PENDING · S3 · Effort S
- Rewrite/rename `Avenue_Style_Guide.md` → `Medvex_Style_Guide.md` from the D-0 tokens.
- Scrub `README.md`, `GEMINI.md`, `AGENTS.md`, `CLAUDE.md`.
- `uat/` (78 refs) + `archive/` (16 refs): no shipped test should assert "Avenue" copy; archive docs may carry a header note instead of full rewrite.
- ~~Delete orphaned `public/icons/avenue-*.svg`~~ — ✅ done.
- Repo folder rename `avenue-portal` → `medvex-portal` (coordinate git/CI; `package.json` name is already `aicare`).

### D-10 — Verification gate (no trace) · partial
After D-7…D-9: `grep -ri "avenue" .` (excluding `node_modules/.next/.git`) returns **zero** in shipped code/assets/seeds/active docs. Add a CI guard failing the build if `avenue` reappears in `src/`, `public/`, `prisma/`. **Current state:** the only `avenue` left in `src/` is the `avenue-*` token names (D-7) + one explanatory comment.

---

## §E. Consolidated phased build order

Mirrors the spec's Phase 0–5, with each gap slotted. `S0` items are flagged as go-live blockers. The **rebrand (§D)** runs alongside Phase 0 because the design-token rename is least painful before more UI is added.

### Phase 0 — Foundation (the backbone; sequence first)
The pivots everything else depends on. Nothing downstream is correct until these land.
- **G2.1** Multi-client tenancy (`Client` entity + isolation + migration) — `XL`, S0.
- **G2.4** Terminology engine (multi-client) — `M`, S1.
- **G3.1** Approval-matrix engine (action-typed, multi-level, SLA, version-resolved) — `L`, S0.
- **G4 (scaffold)** Offline service worker (Serwist) + IndexedDB store + idempotency + sync-engine skeleton — part of `XL`, S0.
- **G3.5 (schema only)** Add `Currency`/`FxRate` + `currency` columns now to avoid rework — part of `L`.
- **§6 platform frameworks:** exceptions (Covered), error-management (R9), never-delete (Covered), jobs-scheduling screen (R11/H-06).
- **Security hardening slice:** 2FA (R81/H-01), password reset code (R24/H-02), password policy (R28/V-08), single-session (R25/H-03), auth banner (R32/H-09) — all S0/small.
- **§D rebrand:** D-1 tokens, D-2 copy, D-3 domains, D-4 assets, D-5 seeds, D-8 CI guard. Includes **G9.6** (replace hard-coded `AVH-` member-number prefix; make numbering client-configurable).
- Audit chain wired globally (Covered) incl. cross-client assertion.

### Phase 1 — Membership + provider + claims core (offline-capable)
- **G5.2** Membership admin + import + family tree + **NIRA** validation (G5.9) — `M`, S2.
- **G5.4** Provider network + per-client tariffs — `L`, S1.
- **G5.6** Claims capture across channels (+ offline/USSD/SMS/smart-claim sources) with duplicate guard + bill lifecycle — `L`, S1.
- **G3.3** Active claims dashboard with incoming-claim alerts + SLA queues — `M`, S1.
- **G4 (end-to-end)** Offline point-of-care client + eligibility cache + store-and-forward + conflict resolution — completes `XL`, S0.

### Phase 2 — Pre-auth + copay + adjudication
- **G3.2 / G5.5** Online pre-auth + GOP-within-limits + escalation + 20–30 min SLA + offline provisional — `M`, S1.
- **G3.4 / G5.7** Copay computation + enforcement (client-scoped, offline soft-reservation) + shared-limit-group enforcement — `M`, S2.
- **G3.7** Auto-adjudication policy (configurable, versioned, gate-named routing) + auto-registration — `L`, S1.
- **G9.1** Co-insurance & deductibles modeling (built alongside copay) — `M`, S1.
- **G9.5** Drug-level exclusion control (with the drug-coding prerequisite shared by G9.2) — `S`, S2.

### Phase 3 — Finance + reporting + multi-currency
- **G2.3 / G5.8** Admin-fee ledger + invoicing/receipting (PMPM/%-claims/flat/case-mgmt) + funds + debtors/creditors + allocation + EFT — `L`, S0.
- **G3.5** Multi-currency + FX + subsidiary consolidation (full) — `L`, S0.
- **G7** Client-scoped, multi-currency report catalogue + password-protected reports + **IRA-UG compliance-levy return** — `M`, S2.
- **G1.1** TPA compliance register (ties to levy/admin-fee ledger) — `M`, S0.
- **G5.3** Intelligent quotation (OD-5) — `M`, S3.
- **G9.7** Per-client configurable grace/suspension rules (lift `lifecycle.service.ts` constants into config) — `S`, S3.

### Phase 4 — Fraud + analytics + member experience
- **G5.11** Configurable fraud engine + provider scorecards + AI clinical auditing + shared-DB readiness (re-weighted for Uganda) — `L`, S1.
- **G5.12** Per-client loss-ratio analytics + band alerting + consolidation — `M`, S2.
- **G5.10** Member app + first-class USSD/SMS + **MTN MoMo / Airtel Money** rails + provider locator cost transparency — `L`, S1.
- **G5.16** Preventative care / wellness (OD-9) — `M`, S3.
- **G9.2 / G9.3 / G9.4** Duplicate-medication check, configurable frequency limits, statistical outlier layer (extend fraud engine; G9.4 = `AICARE_TODO` F-06) — `M`/`M`/`L`, S2.
- **G1.2** DPPA-2019 postures (consent, DSR, processor register, breach) — `L`, S0 *(pull earlier if go-live timing demands; legally gating)*.
- **G5.14** Case management (DSR surface) — `M`, S1.

### Phase 5 — Integrations depth + cross-border + platform hardening
- **G8 / G9.8** Insurer/HMO core adaptors, external GL, banking/EFT, NHIS readiness, FHIR R4, integration logs + data dictionary, **API-layer hardening** (idempotency, rate-limiting, client-scoped keys, versioning) — `L`, S1.
- **G5.15** Cross-border care coordination (OD-8) — `L`, S3.
- **§6 docs/ops:** HA/DR (H-11), SIEM/log retention (H-04/H-05), perf-monitoring (R80), production change log (H-10), backup procedures (R23), online help (H-14), i18n depth (H-08/OD-10).
- **G5.13** Broker statutory localisation (OD-3).

> **Cross-phase note on S0 legal items:** G1.1 (compliance register) and G1.2 (DPPA) are placed by dependency, but both **gate legal operation in Uganda**. If go-live precedes Phase 3/4, pull the minimum viable slice of each forward. Confirm sequencing against the licence timeline (OD-14).

---

## §F. Open decisions

The spec's OD-1…OD-14 carry forward unchanged (host/residency, HMO-vs-TPA, UG tax schedule, self-funded priority, intelligent quotation, NIRA+liveness, MoMo/Airtel semantics, cross-border, wellness depth, multilingual depth, WebLogic, IRA-UG schemas, NHIS readiness, licence-holding entity & brand). This audit surfaces additional, code-specific decisions:

| ID | Decision | Why it matters | Recommendation |
|---|---|---|---|
| AD-1 | `Tenant` vs new `Client`: refactor `Tenant`→Medvex-operator singleton + add `Client`, **or** repurpose `Tenant` as `Client`? | Determines migration shape and blast radius of G2.1 | Keep `Tenant` as the operator; add `Client` below it. Cleaner isolation, smaller migration risk. |
| AD-2 | Base currency for normalisation (G3.5) | Approval bands, consolidation, GL all need one | Pick UGX or USD as base; document; backfill existing rows explicitly. |
| AD-3 | Design-token naming (D-1) | Affects ~3,700 edits | **Decided: neutral `brand-*`.** |
| AD-4 | Repo folder rename `avenue-portal`→`medvec-portal` (D-7) | External coordination (git/CI) | Do it once, early, with the team; `package.json` is already `aicare`. |
| AD-5 | Offline scope for v1: which flows must work offline first? | Bounds the `XL` G4 build | Member verification + claim capture + provisional copay first; pre-auth next. |
| AD-6 | Keep `secure-checkin` WebAuthn as the biometric base and add liveness, or replace with vendor SDK end-to-end? | Affects G5.9 effort | Keep WebAuthn; add liveness via adapter (existing stub boundary). |
| AD-7 | Terminology engine — adopt `AICARE_TODO` T-01…T-08 as-is, extended for multi-client? | Avoids duplicate design | Yes; implement T-series with a `CLIENT` scope added. |
| AD-8 | Fraud advanced layer — build `AICARE_TODO` F-01…F-12 within G5.11? | Same work, two trackers | Treat F-series as the G5.11 backlog, re-weighted for Uganda typologies. |

---

## §G. Master acceptance checklist (capability level)

Closing the gaps means all of the following pass (mirrors spec §11, made concrete):

- [ ] **Offline:** provider client offline for a full working day loses zero records; on reconnect all reconcile with correct final balances + complete audit trail; over-commitments flagged, never silently paid/dropped. (G4)
- [ ] **Approval matrix:** every approvable action resolves to exactly one matrix path; no approval possible outside the matrix; maker≠checker enforced; every decision audit-chained with resolved matrix-version id. (G3.1)
- [ ] **Claims dashboard:** any-channel claim raises an alert and lands in the correct queue within seconds (online) / seconds-of-sync (offline); every queue has a working SLA timer + escalation. (G3.3)
- [ ] **Copay:** computed/enforced per client rules (%/flat), deducted at payment, reconciled + reported; offline-computed copays re-validate on sync. (G3.4/G5.7)
- [ ] **Multi-currency:** subsidiary-currency claim captured→adjudicated→copay→approved on normalised bands→paid in correct currency; consolidated reporting reconciles to subsidiaries at in-force FX. (G3.5)
- [ ] **Auto-adjudication:** clean claims auto-approve end-to-end; gate failure routes to review with the failing gate named; criteria client-configurable + versioned. (G3.7)
- [ ] **Duplicate guard:** no double capture on same provider+service+member+date; invoice numbers unique per provider. (G5.6)
- [ ] **Audit chain:** every sensitive op (claim decision, pre-auth/GOP, limit override, commission change, endorsement, payment) on the tamper-evident chain and verifiable. (Covered/extend)
- [ ] **Compliance:** admin-fee ledger reconciles to the IRA-UG fees-received return; TPA compliance register tracks licence, deposit, directors, renewals. (G1.1/G2.3)
- [ ] **Multi-client isolation:** no query returns another client's rows; isolation asserted on the audit chain. (G2.1)
- [ ] **Identity:** member identity validated + de-duplicated via NIRA at onboarding; liveness at point of care. (G5.9)
- [ ] **Payments:** MoMo + Airtel Money rails functional; fake-confirmation fraud controls in place. (G5.10)
- [ ] **Data protection:** consent captured at onboarding; DSR workflow operational; processor register + breach workflow exist. (G1.2)
- [ ] **Security:** 2FA, email password-reset, password policy, single-session, auth banner all enforced. (§6)
- [ ] **Cost-sharing completeness:** copay **and** co-insurance **and** deductibles each configurable per benefit and applied correctly at adjudication. (G9.1)
- [ ] **Pharmacy controls:** drug-coded claim lines support duplicate-medication detection and drug-level exclusions. (G9.2/G9.5)
- [ ] **No Avenue trace:** `grep -ri avenue` over shipped code/assets/seeds/active docs returns zero; CI guard in place; member numbering carries no `AVH-` prefix. (§D/G9.6)

---

## §H. Core TPA feature-checklist traceability

*Added 2026-06-30 — validates a granular 10-domain TPA feature checklist against the code and the gaps above.* Each item gets a status (`Covered`/`Partial`/`New`), file evidence, and either a link to an existing gap (G-id) or a **net-new gap** id (G9.x) registered in §H.11. Items already fully handled need no further action beyond the cross-cutting client-scoping (G2.1) / multi-currency (G3.5) / rebrand (§D) that apply platform-wide.

### H.1 Member & Policy Management
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Member registration (individuals/families/groups) | `Covered` | `members.service.ts`, `binding.service.ts` (`nextMemberNumber`), `members/import`, `FamilyTreeView`, `FamilySize` | Client-scope (G2.1) |
| Policy creation/activation/renewal/suspension | `Covered` | `Quotation`→`binding.service.ts`; `GroupStatus` PROSPECT→TERMINATED; `renewal.service.ts`, `lifecycle.service.ts`, `suspension-check.job.ts` | — |
| Plan & benefit configuration | `Covered` | `Package`/`PackageVersion`/`BenefitConfig`/`BenefitRider`, packages builder | — |
| Dependent management | `Covered` | `Member.relationship`, `member/dependents`, family tree | — |
| Member ID generation | `Partial` | `nextMemberNumber()`; **but `endorsement.service.ts` hard-codes `AVH-YYYY-NNNNN` (Avenue Healthcare) prefix** | **G9.6** + §D |
| Basic KYC & demographics | `Covered`/`Partial` | `MemberKycRecord`, `MemberKycDocument`, demographics on `Member`; identity validation is IPRS | IPRS→NIRA (G5.9) |

### H.2 Provider Management
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Onboarding & credentialing | `Covered` | `Provider`, `Practitioner`/`PractitionerCredential`, `ProviderContract` | — |
| Provider mapping abilities | `Partial` | `Provider.smartProviderId`, `Provider.slade360ProviderId` (EDI code mapping); `PackageProviderEligibility` (provider↔plan) | No general multi-payer/external crosswalk → extend under G5.4/G8 |
| Facility & doctor registry | `Covered` | `Provider` + `Practitioner` + `ProviderPractitioner` | — |
| Tariff/price-list management | `Covered` | `ProviderTariff`, `ProviderDiagnosisTariff` | Per-client tariffs (G5.4) |
| Provider categorization (tier/location/specialty) | `Covered` | `ProviderTier`, `county`/`geoLatitude/Longitude`, `servicesOffered[]` | — |
| Contract management | `Covered` | `ProviderContract`(+`ProviderContractExclusion`), `provider-contracts.service.ts` | — |
| Service/drug exclusion control | `Partial` | `ProviderContractExclusion`, package/benefit `exclusions[]`, `excludedIcd10Codes[]` (service + diagnosis) | **Drug-level exclusion absent → G9.5** |

### H.3 Benefits & Coverage
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Benefit definitions (IP/OP etc.) | `Covered` | `BenefitConfig`, `BenefitCategory`, `BenefitRider` | — |
| Limits (annual/per-visit/per-diagnosis) | `Covered` | `annualLimit`, `annualSubLimit`, `ProviderDiagnosisTariff`, `SharedLimitGroup` | — |
| Co-pay, **co-insurance, deductibles** | `Partial` | Copay/co-contribution fully built (`CoContributionRule`, `coContribution/*`). **No co-insurance or deductible constructs in the schema** | **G9.1 (net-new)** |
| Exclusions & waiting periods | `Covered` | `exclusions[]`, `WaitingPeriodApplication`, `waitingPeriodDays`/`waitingPeriodCategories`, `resetWaitingPeriod` | — |
| Eligibility checks | `Covered` | `GET /api/v1/eligibility` (Slade360 SMART shape) | Offline eligibility cache (G4.4) |

### H.4 Claims Management
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Claims intake (provider, manual) | `Covered` | `claims.service.ts`, `claims/new`, `POST /api/v1/claims`, `claims/import` | + offline/USSD/SMS/smart-claim channels (G4/G5.6) |
| Pre-authorization | `Covered` | `PreAuthorization`, `preauth-adjudication.service.ts` | G3.2 |
| Claims validation | `Covered` | `claim-adjudication.service.ts` gates (dup invoice, double-capture, tariff) | — |
| Adjudication (approve/reject/partial) | `Covered` | `ClaimStatus` APPROVED/PARTIALLY_APPROVED/DECLINED; `AdjudicationLog` | Auto-adjudication decisioning (G3.7) |
| Document handling | `Covered` | `Document`, `Correspondence`, `lib/minio.ts`, `POST /api/v1/upload` | — |
| Claims status tracking | `Covered` | `ClaimStatus` lifecycle (INCURRED→PAID) | Active dashboard + alerts (G3.3) |
| Bulk processing | `Partial` | Excel import (`claims/import`, `/api/claims/import`), `intake.service.ts` | Bulk *adjudication* run + offline batch sync (G3.7/G4) |

### H.5 Payments & Reconciliation
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Claims payouts (providers/members) | `Covered` | `Payment`, `PaymentVoucher`, `reimbursement.service.ts` | Multi-currency (G3.5) |
| Payment batching | `Covered` | `ProviderSettlementBatch`, `CommissionPayoutBatch` | Settlement acceleration (G5.4) |
| Mobile money / bank integration | `Partial` | M-Pesa stub (`mpesa.service.ts`); `bank-reconciliation.service.ts` | MoMo/Airtel + EFT (G5.10/G8) |
| Reconciliation (approved vs paid) | `Covered` | `bank-reconciliation.service.ts`, settlement batches | — |
| Basic ledger tracking | `Covered` | `ChartOfAccount`/`JournalEntry`/`JournalLine`, `gl.service.ts` | — |

### H.6 Premium Management
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Premium setup (plans/groups) | `Covered` | `Group.contributionRate`, `ContributionRateTable`, rate matrix | — |
| Billing cycles (monthly/annual) | `Covered` | `PaymentFrequency` (MONTHLY/QUARTERLY/SEMI_ANNUAL/ANNUAL), `billing-run.job.ts` | — |
| Payment tracking | `Covered` | `Invoice`/`Payment`, `billing.service.ts` | — |
| Grace periods & suspension rules | `Partial` | `lifecycle.service.ts` (30-day grace / 60-day catch-up **hard-coded**), `lapse-detection.job.ts`, `GroupStatus` SUSPENDED/LAPSED | **Make per-client configurable → G9.7** |

### H.7 Fraud & Controls
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Duplicate claim detection | `Covered` | `fraud.service.ts` RULE-TEMP-004 + DB partial-unique constraint + `claim-adjudication` double-capture gate | — |
| **Duplicate medication check** | `New` (missing) | No drug/medication-level dedup anywhere; adjudication keys on provider/member/date/category, not drug code | **G9.2 (net-new)** |
| Frequency checks | `Partial` | RULE-VEL-001 (visit velocity), RULE-FIN-004 (same-day split billing) | No configurable per-service/drug frequency caps → **G9.3** |
| Outlier detection | `Partial` | RULE-BILL-003 (over tariff), RULE-BILL-004 (round-number clustering) | No statistical anomaly layer → **G9.4** (= `AICARE_TODO` F-06; folds into G5.11) |
| Blacklisting | `Covered` | `InternalBlacklist`, `BlacklistReason`, `blacklist.service.ts` | Shared-fraud-DB readiness (G5.11) |

### H.8 Reporting & Analytics
| Item | Status | Evidence | Gap/Action |
|---|---|---|---|
| Claims reports / utilization / member statistics / financial summaries | `Covered` | `reports/[reportType]` catalogue, `reports` tRPC router, analytics suite | Client-scope + multi-currency (G7) |
| Data export (Excel/CSV) | `Covered` | `api/reports/[reportType]/export/route.ts` (ExcelJS/Papa) | — |

### H.9 Notification capabilities
`Covered`/`Partial`. `notification.service.ts` (nodemailer; channels EMAIL/SMS/BOTH), `NotificationTemplate`, in-app `MemberNotification`/`member-notification.service.ts`. SMS provider is TBD (P-03); no WhatsApp/push channel; USSD/SMS not yet first-class. → SMS aggregator selection (P-03), first-class USSD/SMS (G4.5), optional WhatsApp/push.

### H.10 API Layer
`Partial`. External versioned API `GET/POST /api/v1/{benefits,claims,eligibility,preauth,upload}` with API-key auth (`lib/apiAuth.ts`), plus internal tRPC. Missing for a TPA platform: per-call **integration logging** (KCB R3), **idempotency keys**, **rate-limiting**, **client-scoping** of API keys, **data dictionary** (R18), and a published versioning/deprecation policy. The eligibility/benefits routes also hard-code `payer: "Avenue Healthcare"` (→ §D). → **G9.8**, folds into G8.

### H.11 Net-new gaps registered from this checklist
| ID | Gap | Status | Sev | Effort | Phase | Notes |
|---|---|---|---|---|---|---|
| **G9.1** | Co-insurance & deductibles modeling | `New` | S1 | M | 2 | Add `coInsurancePct` and `deductible` (annual member-paid threshold) to benefit config + adjudication math, distinct from copay. The checklist explicitly lists all three cost-share types; only copay exists today. |
| **G9.2** | Duplicate-medication / drug-level duplicate detection | `New` | S2 | M | 4 (hook in 2) | Add drug-coded claim lines (ATC/NDC or local drug register) and a dedup rule (same drug + member + overlapping supply window). Requires a drug code list on `ClaimLine`. |
| **G9.3** | Configurable frequency limits (per service/drug) | `Partial→New` | S2 | M | 4 | Promote velocity heuristics into config-driven frequency caps (e.g. max N of service X per period) enforced at adjudication + flagged in fraud. |
| **G9.4** | Statistical outlier / anomaly-detection layer | `New` | S2 | L | 4 | Nightly batch scoring provider/member outliers (= `AICARE_TODO` F-06); folds into G5.11. Current rules are deterministic only. |
| **G9.5** | Drug-level exclusion control | `Partial→New` | S2 | S | 1–2 | Today exclusions are service-level + ICD-10 diagnosis + free-text. Add an excluded-drug list (per package/contract) enforced at adjudication. Depends on drug coding (shared with G9.2). |
| **G9.6** | Client-configurable member/policy numbering | `New` | S2 | S | 0–1 | Replace hard-coded `AVH-` prefix in `endorsement.service.ts`; unify with `nextMemberNumber`; make the format a per-client setting. Part rebrand (§D), part feature. |
| **G9.7** | Per-client configurable grace/suspension rules | `Partial→New` | S3 | S | 3 | Move `lifecycle.service.ts` 30/60-day constants into client/scheme config with effective dating. |
| **G9.8** | API-layer hardening | `Partial` | S1 | M | 5 | Integration logging, idempotency, rate-limiting, client-scoped keys, data dictionary, versioning policy. Folds into G8; remove Avenue payer string (§D). |

> **Headline net-new finding:** **co-insurance and deductibles (G9.1)** are a true functional gap — the platform models copay/co-contribution thoroughly but has no separate co-insurance percentage or annual deductible. If client payers expect deductible-based plans (common in employer schemes), this must be built in Phase 2 alongside copay. The **drug-coding prerequisite** shared by G9.2/G9.5 is worth sequencing once (add drug codes to claim lines), then both the dedup rule and the exclusion control build on it.

---

## Appendix — evidence index (key files referenced)

**Spec & docs:** `AICARE_TPA_UGANDA_SPEC.md`, `AICARE_TODO.md` (prior backlog), `PRODUCTION_READINESS_TESTING_PLAN.md`, `Avenue_Style_Guide.md`.
**Schema:** `prisma/schema.prisma` (~150 models/enums) — notably `Tenant`, `Group`, `GroupBenefitTier`, `Member`, `ApprovalMatrix`, `TaxType`/`TaxRate`, `CoContributionRule`, `SharedLimitGroup`, `Claim`/`ClaimStatus`/`ClaimSource`, `PreAuthorization`, `Provider*`, `Broker*`, `Invoice`/`Payment`/`ChartOfAccount`/`JournalEntry`, `IntegrationConfig`, `AuditLog`, `ExceptionLog`, `OverrideRecord`, analytics + fraud models, WebAuthn/check-in models, `AdminFeeMethod`/`SelfFundedAccount`/`FundTransaction`.
**Services:** `src/server/services/` — `audit-chain`, `claim-adjudication`, `preauth-adjudication`, `coContribution/*`, `gl`, `billing`, `fraud`, `analytics`, `commission`, `provider-contracts`, `bank-reconciliation`, `secure-checkin/*`, `integrations/iprs`, `integrations/mpesa`, `ussd`, `sms-query`, `low-bandwidth-channel`, `letters`, `renewal`, `endorsement`, `members`, `onboarding`.
**Routers:** `src/server/trpc/routers/` — claims, preauth, coContribution, groups, members, packages, providers, brokers, billing, analytics, reports, settings, overrides, auditChain, etc.
**Jobs:** `src/server/jobs/` — `sla-breach`, `preauth-escalation`, `renewal-reminder`, `fund-balance-alert`, `suspension-check`, `commission-*`, `analytics-refresh`, etc.
**Frontend/PWA:** `src/app/globals.css` (`@theme` design tokens), `public/sw.js` (shell-cache only), `public/manifest.webmanifest`, `public/icons/avenue-*`, `src/components/PWARegister.tsx`, `src/components/layouts/AdminSidebar.tsx`, `src/lib/constants.ts` (`KENYAN_COUNTIES`), `src/lib/auth.ts` (no 2FA/reset).
**Infra/config:** `.env` (`EMAIL_FROM=uat@avenue.local`), `notification.service.ts` (`noreply@avenue.co.ke`), `fund-balance-alert.job.ts` (`https://avenue.co.ke/fund/...`), `Dockerfile`, `docker-compose.yml`, `nginx/`.

*End of plan.*
