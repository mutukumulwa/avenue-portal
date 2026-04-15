# AiCare — Immediate Action Plan
**Created:** 2026-04-11
**Priority:** Critical UX & Clinical Workflow Improvements

---

## Item 1 — Multi-Package Benefit Tiers within a Group ✦ FOUNDATIONAL

**Problem:** A group (e.g., Safaricom) has one CEO-level employee on Platinum, 20 senior managers on Gold, and 200 staff on Silver. Currently a group can only have one package.

**Design:**
- Introduce a `GroupBenefitTier` model: named tiers within a group (e.g., "Executive", "Senior Management", "Staff"), each pointing to a different Package.
- Member gets a `benefitTierId`. Their package is derived from their tier, not set directly.
- Group retains a `defaultPackageId` for members without an explicit tier.
- Endorsement type `TIER_CHANGE` handles moving a member between tiers (pro-rata calculated on package delta).
- UI: Group detail page shows a "Benefit Tiers" card with all configured tiers and member counts per tier. Member form lets you pick the tier on enrolment.

**Schema changes:**
- New model: `GroupBenefitTier` (id, groupId, name, packageId, contributionRate, description, memberCount computed)
- New field on `Member`: `benefitTierId String?`
- New `EndorsementType` value: `TIER_CHANGE`

**Implementation order:**
1. Prisma migration
2. Group detail — "Benefit Tiers" management card (create/edit/delete tiers)
3. Member create/edit — tier picker replacing direct package picker
4. Endorsement — TIER_CHANGE type with pro-rata preview

---

## Item 2 — Searchable Diagnosis & Procedure Library with Standard Charges ✦ QUICK WIN

**Problem:** Clinicians type free text for diagnoses and procedures. No standardization, no auto-pricing.

**Design:**
- Enhance `ICD10Code`: add `standardCharge Decimal?`, `category String` (e.g., "Infectious", "Chronic", "Surgical")
- Enhance `CPTCode`: add `category String`, ensure `averageCostKes` is well-populated
- Build a reusable `<DiagnosisSearch>` client component — autocomplete dropdown searching ICD-10 codes, shows code + description + standard charge
- Build a reusable `<ProcedureSearch>` client component — autocomplete for CPT codes
- Wire both into claim form, pre-auth form, and provider tariff overrides

**Schema changes:**
- Add `standardCharge Decimal?` and `category String?` to `ICD10Code`
- Add `category String?` to `CPTCode`
- Add API route `GET /api/icd10?q=` and `GET /api/cpt?q=`

**Implementation order:**
1. Schema migration + seed enhanced data
2. Search API routes
3. `<DiagnosisSearch>` and `<ProcedureSearch>` components
4. Wire into claim form and pre-auth form

---

## Item 3 — Multi-Service Claim Redesign ✦ CLINICAL WORKFLOW

**Problem:** A single patient encounter at a hospital involves multiple services: consultation, lab tests, pharmacy, imaging, procedures. The current claim form treats it as one line item.

**Design:**
- Claim = one encounter (header): member, provider, date, service type, attending doctor, primary diagnosis
- Claim lines = individual services, grouped by category:
  - **Consultation** — CPT code, doctor, duration, cost
  - **Laboratory** — test name, CPT code, quantity, cost
  - **Pharmacy** — drug name, quantity, unit cost, total
  - **Imaging** — scan type, CPT code, cost
  - **Procedures** — CPT code, description, cost
- Each line: ICD-10 code (pre-fills from header diagnosis), CPT code picker, description, quantity, unit cost (auto-filled from provider tariff or standard charge), total
- Line totals aggregate to billed amount
- Benefit category auto-suggested per line (Lab → OUTPATIENT, surgery → SURGICAL, etc.)

**Schema changes:**
- Add `serviceCategory` enum to `ClaimLine`: CONSULTATION, LABORATORY, PHARMACY, IMAGING, PROCEDURE, OTHER
- Add `icdCode String?` to `ClaimLine` (line-level diagnosis override)
- Add `isException Boolean` and `exceptionRef String?` to `ClaimLine`

**Implementation order:**
1. Schema migration
2. Redesign `/claims/new` as a multi-step form: Step 1 (encounter header), Step 2 (line items builder)
3. Line item table: add row per service category, CPT autocomplete, auto-price from tariff
4. Running total sidebar
5. Update claim detail page to show grouped line items

---

## Item 4 — Comprehensive Provider Contracts ✦ BILLING ACCURACY

**Problem:** Provider contracts contain negotiated rates that differ from standard charges — especially for specific diagnoses or bundles. These need to be captured and used in adjudication.

**Design:**
- Provider gets a dedicated "Contract" tab on its detail page
- Contract header: contracted services, payment terms (net 30, net 14), credit limit, contract document attachment
- Tariff schedule: two types:
  1. **CPT-based tariff** (existing `ProviderTariff`) — procedure rate overrides
  2. **Diagnosis-based tariff** (new `ProviderDiagnosisTariff`) — package rate per ICD-10 code (e.g., a ward rate for malaria admission = KES 8,000/day regardless of procedure codes)
- At claim adjudication: look up provider-specific rate first, fall back to CPT standard charge, then flag if billed amount exceeds either

**Schema changes:**
- Add `paymentTermDays Int @default(30)`, `creditLimit Decimal?`, `contractNotes String?` to `Provider`
- New model: `ProviderDiagnosisTariff` (id, providerId, icdCode, diagnosisDescription, bundledRate, perDayRate, effectiveFrom, effectiveTo)

**Implementation order:**
1. Schema migration
2. Provider detail — "Contract" tab: contract dates, payment terms, notes
3. CPT tariff management UI (edit existing ProviderTariff records inline)
4. Diagnosis tariff table — add/edit ICD-10 bundled rates
5. Wire into claim adjudication: auto-populate line unit costs from provider tariff

---

## Item 5 — Manual Exceptions & Override Framework ✦ OPERATIONS

**Problem:** Operations staff regularly make judgment calls: waive a waiting period for a critical illness, override a declined benefit for a VIP client, approve a claim above tariff. These need to be easy to do but fully traceable for audit and reporting.

**Design:**
- Any claim, pre-auth, or member record can have an exception logged against it
- Exception modal: select exception type, enter justification, enter authorizing reference (e.g., "CEO verbal approval")
- Exception types have codes: `WP-WAIVER` (waiting period), `TARIFF-OVER` (above tariff), `LIMIT-OVER` (above benefit limit), `EXCL-OVERRIDE` (covered exclusion), `NET-OVERRIDE` (out-of-network), `COPAY-WAIVER`, `MANUAL-APPROVE`
- Exceptions visible as a badge/flag on claim/member detail
- Reports filter by "has exception" or by exception type
- Exception log visible in Settings > Exceptions for audit

**Schema changes:**
- New model: `ExceptionLog` (id, tenantId, entityType: CLAIM/PREAUTH/MEMBER/ENDORSEMENT, entityId, exceptionCode, exceptionType label, originalValue, overriddenValue, justification, authorizedBy userId, authorizedAt, createdAt)
- Add `hasException Boolean @default(false)` to Claim and PreAuthorization

**Implementation order:**
1. Schema migration
2. `<ExceptionModal>` client component — triggered from claim/preauth action buttons
3. Server action to create ExceptionLog + flip `hasException`
4. Visual flag (orange badge) on claim/preauth lists and detail pages
5. `/settings/exceptions` list page — filterable by type, date, entity

---

## Item 6 — Finance & General Ledger Framework ✦ FINANCIAL INTEGRITY

**Problem:** The system records billing and payments but has no concept of double-entry accounting. Finance cannot reconcile what's owed, earned, and paid without external spreadsheets.

**Design — Chart of Accounts (Kenya healthcare HMO structure):**

| Code | Account | Type |
|------|---------|------|
| 1001 | Cash & Bank | Asset |
| 1002 | Accounts Receivable — Groups | Asset |
| 1003 | Deferred Contribution Revenue | Liability |
| 2001 | Accounts Payable — Providers | Liability |
| 2002 | Commission Payable — Brokers | Liability |
| 3001 | Contribution Revenue | Revenue |
| 3002 | Reinsurance Recovery | Revenue |
| 4001 | Claims Expense | Expense |
| 4002 | Broker Commission Expense | Expense |
| 4003 | Admin & Overhead | Expense |

**Posting rules (auto-generated journal entries):**
- Invoice raised → Dr Accounts Receivable, Cr Deferred Contribution Revenue
- Payment received → Dr Cash, Cr Accounts Receivable; Dr Deferred, Cr Contribution Revenue (pro-rata per month)
- Claim approved → Dr Claims Expense, Cr Accounts Payable — Provider
- Claim paid (voucher processed) → Dr Accounts Payable — Provider, Cr Cash
- Broker commission → Dr Commission Expense, Cr Commission Payable
- Endorsement adjustment → Debit/Credit Accounts Receivable + Deferred Revenue delta

**Schema changes:**
- New models: `ChartOfAccount`, `JournalEntry`, `JournalLine`
- New field on Invoice, Payment, Claim, Commission: `journalEntryId String?`

**Implementation order:**
1. Schema migration + seed Chart of Accounts
2. `/billing/ledger` page — journal entry list, filterable by account/date/entity
3. Auto-post on Invoice creation and Payment recording
4. Auto-post on Claim approval and payment voucher processing
5. Trial Balance view: account balances as of any date
6. P&L summary: Revenue vs Claims Expense vs Commission Expense

---

## Implementation Sequence

| # | Item | Est. Complexity | Start |
|---|------|----------------|-------|
| 1 | Benefit Tiers | Medium | Now |
| 2 | Diagnosis/CPT Library | Low | After 1 |
| 3 | Multi-line Claim Redesign | High | After 2 |
| 4 | Provider Contract Enhancement | Medium | After 3 |
| 5 | Exception Framework | Medium | After 4 |
| 6 | Finance/GL Framework | High | After 5 |
