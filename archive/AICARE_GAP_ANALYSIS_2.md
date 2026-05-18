# AiCare — Gap Analysis 2.0: System Requirements Alignment

**Document version:** 1.0
**Date:** 2026-05-10
**Audit Owner:** Antigravity

---

## 0. Executive Summary

This document represents a detailed gap analysis based on the `AICARE_SYSTEM_REQS_AUDIT.md` (excluding IPRS integration). Following an extensive codebase verification pass against the live AiCare platform schema, services, and routing layer, we have identified specific missing and partially implemented capabilities. 

This analysis translates those gaps into an actionable technical backlog, detailing the required schema changes, service logic, and UI surfaces to be implemented in the upcoming major development phase.

---

## 1. Identified Gaps & Technical Specifications

### 1.1 Shared Limit Groups (Product Factory)
**Status:** Missing
**Context:** Avenue currently supports per-family and per-member limits directly on `BenefitConfig`. However, there is no mechanism to express a shared monetary cap across multiple unrelated benefits (e.g., a 50,000 KES limit shared across Radiology, Pathology, and Cardiology).
**Technical Action Plan:**
- **Schema:** 
  - Create `SharedLimitGroup` model linked to `PackageVersion`.
  - Add fields: `name`, `limitAmount`, `appliesTo` (MEMBER/FAMILY).
  - Create join table `BenefitConfigSharedLimit` to map `BenefitConfig` to `SharedLimitGroup`.
- **Service (`claims.service.ts`):** Update the adjudication engine's `checkBenefitLimits()` to aggregate usage across all `BenefitConfig`s belonging to the same `SharedLimitGroup`.
- **UI:** Update `packages/[id]/edit` to allow grouping benefits into a shared limit pool.

### 1.2 Package-Level Provider Eligibility (Product Factory)
**Status:** Missing
**Context:** Facility access is currently managed via `PackageVersion.facilityAccess` (String array). A more robust, relational package-level network restriction is required.
**Technical Action Plan:**
- **Schema:** 
  - Create `PackageProviderEligibility` model.
  - Fields: `packageVersionId`, `providerId` (nullable), `providerTier` (nullable), `inclusionType` (INCLUDE/EXCLUDE).
- **Service:** Update `providers.service.ts` and the `resolveTariff()` adjudication step to strictly enforce package-level eligibility rules.
- **UI:** Enhance the Package Builder to configure explicitly allowed/denied facilities or tiers.

### 1.3 Premium Rate Matrix UI & Relational Model (Product Factory)
**Status:** Missing
**Context:** The `PricingModel` currently holds unstructured JSON (`parameters`) or an uploaded Excel file (`fileUrl`). There is no relational table representing Age × Gender × Location × Dependents dimensions.
**Technical Action Plan:**
- **Schema:** 
  - Create `ContributionRateTable` model linked to `PricingModel`.
  - Fields: `minAge`, `maxAge`, `gender` (Enum), `familySize` (Enum), `location` (String/Nullable), `baseRate` (Decimal).
- **UI:** Build a maker-checker data-grid UI in `modules/product/pages/rate-table-editor.tsx` to allow underwriters to edit matrix cells directly.

### 1.4 Membership Reinstatement Workflow (Policy Administration)
**Status:** Missing
**Context:** A daily job lapses memberships (`LAPSED` state) effectively, but there is no formalized path for a member to rectify a lapsed state.
**Technical Action Plan:**
- **Schema:** 
  - Create `MembershipReinstatementRequest` model.
  - Fields: `memberId`, `lapsedDate`, `requestDate`, `status` (PENDING, APPROVED, DECLINED), `catchUpAmount`, `approvedById`.
- **Service:** Implement `reinstatement.service.ts` to compute catch-up contributions and optionally reset waiting periods.
- **UI:** Add "Request Reinstatement" flow in the Member App and an approval queue in the HR/Admin Portal.

### 1.5 Face-Match Liveness SDK (Identity Management)
**Status:** Missing (Deferred to Phase 5)
**Context:** Check-in flows exist but lack a passive-liveness face-match SDK to anchor biometric identity and prevent synthetic identity fraud. *(Note: IPRS is excluded from this document).*
**Technical Action Plan:**
- **Integration:** Select and integrate a vendor SDK (e.g., Smile Identity or FaceKI) into the member app and provider portal.
- **Service (`secure-checkin/adapters/face-match.ts`):** Wire the SDK callback to a new `FaceMatchVerification` model to log verification confidence scores.

### 1.6 Doctor-Level Credentialing (Provider Management)
**Status:** Missing
**Context:** Provider credential tracking (`Provider`) currently only supports the facility. Individual practitioner licenses are not tracked, meaning practitioner credential lapses do not block claim approvals.
**Technical Action Plan:**
- **Schema:** 
  - Create `Practitioner` model (fields: `id`, `firstName`, `lastName`, `licenseType`, `licenseNumber`).
  - Create `PractitionerCredential` model (fields: `practitionerId`, `documentUrl`, `expiryDate`, `status`).
  - Create `ProviderPractitioner` join table to link doctors to facilities.
- **Service:** Update adjudication to flag/reject claims if the `attendingDoctor`'s license is expired.

### 1.7 Tariff Type Distinction (Provider Management)
**Status:** Partial
**Context:** `ProviderTariff` exists, but there is no explicit classification to define priority during adjudication between negotiated vs. published rates.
**Technical Action Plan:**
- **Schema:** Add `tariffType` Enum (`NEGOTIATED`, `PUBLISHED`, `GAZETTED`) to `ProviderTariff` and `ProviderDiagnosisTariff`.
- **Service:** Ensure `resolveTariff()` strictly prioritizes `NEGOTIATED` > `GAZETTED` > `PUBLISHED`.

### 1.8 Bank Statement Reconciliation (Financials)
**Status:** Missing
**Context:** `commission-reconciliation.job.ts` handles broker commissions, but Accounts Receivable bank statement reconciliation (CSV/MT940) is missing.
**Technical Action Plan:**
- **Schema:** Create `BankStatementImport` and `BankStatementLineItem` models.
- **Service:** Build a fuzzy-matching reconciliation engine (`bank-reconciliation.service.ts`) comparing statement lines (amount, date ± 2 days, reference) against `Invoice` and `Payment` records.
- **UI:** Admin view to upload MT940/CSV files and manually resolve fuzzy-match conflicts.

### 1.9 Card Payment Gateway Integration (Financials)
**Status:** Missing
**Context:** No integration with Pesapal or Flutterwave exists for card payments.
**Technical Action Plan:**
- **Service:** Implement `card-gateway.service.ts` implementing a standard interface for payment initiation and webhook callback handling.

### 1.10 Debit Note Generation (Financials)
**Status:** Missing
**Context:** Taxes and levies (Stamp Duty, Training Levy, PHCF) are present in the `Invoice` schema, but no actual PDF Debit Note is generated to display these components.
**Technical Action Plan:**
- **Service:** Implement PDF generation using existing templating tools (e.g., `debit-note.hbs` or `@react-pdf/renderer`).
- **UI:** Add "Download Debit Note" action to the Invoices list.

### 1.11 IRA Regulatory Exports (Business Intelligence)
**Status:** Missing
**Context:** Tranche C regulatory exports (RPT-021 through RPT-025) in IRA-mandated formats are deferred.
**Technical Action Plan:**
- **Service:** Implement data aggregation scripts and export formatting (XBRL/Excel) according to IRA guidelines.

### 1.12 FHIR Resource Adaptors (Architecture)
**Status:** Missing
**Context:** Necessary for HMS and SHA interoperability. Currently, only the canonical AiCare schema is used.
**Technical Action Plan:**
- **Service:** Build a mapper layer (`fhir.service.ts`) using a FHIR R4 validator to translate `Claim`, `Member`, `Provider`, and `PreAuthorization` records to/from FHIR resources.

---

## 2. Implementation Phasing Strategy

To ensure a structured rollout, the gaps above should be tackled by agents in the following prioritized phases:

### Phase A: Core Engine & Financial Completeness
*(Highest priority: Directly impacts pricing, adjudication logic, and revenue collection)*
1. **Premium Rate Matrix (1.3)**
2. **Shared Limit Groups (1.1)**
3. **Tariff Type Distinction (1.7)**
4. **Debit Note Generation (1.10)**

### Phase B: Provider & Policy Hardening
*(Medium priority: Enhances compliance and provider network controls)*
1. **Package-Level Provider Eligibility (1.2)**
2. **Doctor-Level Credentialing (1.6)**
3. **Membership Reinstatement Workflow (1.4)**

### Phase C: Integrations & Reconciliation
*(Deferred/External dependencies)*
1. **Bank Statement Reconciliation (1.8)**
2. **Card Payment Gateway (1.9)**
3. **Face-Match Liveness SDK (1.5)**
4. **FHIR Resource Adaptors (1.12)**
5. **IRA Regulatory Exports (1.11)**

---
*End of Gap Analysis.*
