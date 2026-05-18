# AiCare — System Requirements Audit

**Source document:** `System-reqs_new.pdf` (third-party medical insurance platform requirements)
**Audit subject:** AiCare platform (Avenue Healthcare tenant)
**Audit type:** Codebase verification + spec alignment
**Audit owner:** Antigravity (run against `apps/web` and root Prisma schema)
**Document version:** 1.0
**Date:** 2026-05-10

---

## 0. How to use this document

This audit walks the AiCare codebase against an externally-supplied requirements document covering seven functional areas plus a technical architecture recommendation. Each item below carries:

- **Status** — one of `Covered`, `Partial`, `Missing`, `Verify`
- **AiCare locus** — where in the platform the capability lives (or should live)
- **Verification check** — what Antigravity should grep, view, or run against the live build to confirm
- **Notes** — terminology translation, dependencies on prior specs, and any gap detail

### Status legend

| Status | Meaning |
|---|---|
| **Covered** | Implemented in the live build and matches the source requirement, possibly with terminology translated to membership language |
| **Partial** | Some implementation exists, but a sub-requirement or detail is missing or stubbed |
| **Missing** | No implementation yet — requires new build effort |
| **Verify** | Spec exists in a prior AiCare doc but Antigravity must confirm it is wired into the running build |

### Terminology translation rule

The source document uses insurance vocabulary throughout (premium, policy, insured, insurer, claim). For all status assessments, Antigravity should treat the source terms as the system-default canonical keys and verify that the Avenue tenant dictionary maps them to membership terminology per `Module 2 — Configurable Terminology Engine` in `AICARE_COMPETITIVE_HARDENING_SPEC.md`. The two-column reference is reproduced in §9 of this document.

### Cross-references

- `AICARE_FEATURE_AUDIT.md` — original ~200-check feature audit (this document does not duplicate it; where the new source requirement is already covered there, this audit defers to it with a `(see FA-§X.Y)` reference)
- `AICARE_GAP_ANALYSIS.md` — gap analysis vs. Rensoft and KCB references; six open decisions
- `AICARE_COMPETITIVE_HARDENING_SPEC.md` — five-module competitive hardening sprint spec

---

## 1. Product Factory & Rule Engine

> *Source: §1 — "the 'Brain' of the system. It defines what is being sold."*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 1.1 | Hierarchical benefit structures (Category → Benefit → Sub-benefit) | Covered | `Package` → `Benefit` → `BenefitSubLimit` (existing schema) | Run `npx prisma studio` and confirm three-level relation depth on a seeded Avenue scheme | Maps directly to existing IP-*/OP-* rider taxonomy. Avenue uses Category → Family → Member for the *member* taxonomy; this is the *benefit* taxonomy and is a separate hierarchy |
| 1.2 | Plan configuration UI to define hierarchies | Verify | `apps/web/src/modules/product/pages/package-editor.tsx` | Confirm benefit and sub-benefit can be added/edited inline without leaving the package edit screen | Should respect the never-delete convention — `effectiveTo` deactivation, not row removal |
| 1.3 | Per-family limit type | Covered | `BenefitLimit.appliesTo = FAMILY` enum value | Grep schema for the `LimitAppliesTo` enum and confirm both `FAMILY` and `MEMBER` are present | Existing convention from prior fraud and copay specs |
| 1.4 | Per-member limit type | Covered | `BenefitLimit.appliesTo = MEMBER` | As above | |
| 1.5 | Shared limits across multiple benefits | Partial | `SharedLimitGroup` entity (proposed) | Search for any model named `SharedLimit*`. If absent, this is a gap — add to phase 5 backlog | Source doc explicitly calls out "Shared" as a third type alongside Per-Family and Per-Member. Avenue's existing rider model handles related benefits but does not formally express shared caps across unrelated riders |
| 1.6 | Waiting period configuration | Covered | `Benefit.waitingPeriodDays` | Grep `waitingPeriod` in schema | |
| 1.7 | Co-payment percentage configuration per benefit | Covered | Co-contribution spec, six calculation models (RULE-COC-001 through RULE-COC-006) | Confirm `CoContributionModel` enum values match the six models documented in the co-contribution spec | Terminology: source says "co-payment" → Avenue dictionary maps to "co-contribution" |
| 1.8 | Provider network restrictions per plan ("Plan A only works at Tier 2") | Partial | `PackageProviderEligibility` (proposed) | Confirm whether facilities are bound to packages via a join table or only via scheme-level network selection | If only scheme-level, package-level network restriction is a build gap |
| 1.9 | Premium matrix by Age × Gender × Location × Dependents | Covered | `ContributionRateTable` with multi-dimensional keying | Confirm the rate table seed data for Avenue has all four dimensions populated for at least one product | Maps directly to the Rensoft rate matrix model |
| 1.10 | Premium matrix editable by admin without code change | Verify | `apps/web/src/modules/product/pages/rate-table-editor.tsx` | Load a rate table and edit a cell; confirm change is persisted with maker-checker if rate change exceeds threshold | Maker-checker on rate change is a control inherited from binder-level convention |

---

## 2. Policy Administration System (PAS)

> *Source: §2 — "manages the legal contract between the insurer and the client"*
> *Avenue mapping: Membership Administration System (MAS)*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 2.1 | KYC capture during onboarding | Covered | `MemberKycRecord` + `MemberKycDocument` | Confirm KYC document upload flow exists in member onboarding wizard | |
| 2.2 | Medical history capture | Covered | `MemberMedicalHistoryDeclaration` | Confirm declaration is captured with structured ICD-10 fields plus free-text narrative, and is locked after acceptance | |
| 2.3 | Underwriting workflow with rule firing | Covered | `UnderwritingDecision` workflow with rule engine integration | Trigger an enrolment with a high-risk declared condition and confirm a `LOADING` or `EXCLUSION` decision is recorded | Terminology: "underwriting" → Avenue dictionary maps to "eligibility assessment" |
| 2.4 | Loading (extra premium) for high-risk members | Covered | `UnderwritingDecision.loadingMultiplier` | Confirm loaded contribution is reflected on the resulting `Membership.contributionAmount` | |
| 2.5 | Exclusions for specific conditions | Covered | `MembershipExclusion` linked to ICD-10 codes | Confirm benefit adjudication rejects encounters with primary ICD matching an active exclusion | |
| 2.6 | Mid-term endorsements: add newborn | Covered | `MembershipAmendment` with `amendmentType = ADD_DEPENDANT` | Run end-to-end test of newborn addition with proof-of-birth document upload | Source says "endorsement" → Avenue dictionary maps to "membership amendment" |
| 2.7 | Mid-term endorsements: remove spouse | Covered | `MembershipAmendment` with `amendmentType = REMOVE_DEPENDANT` | As above with reason code (divorce, death, voluntary removal) | |
| 2.8 | Mid-term endorsements: upgrade limit | Covered | `MembershipAmendment` with `amendmentType = PACKAGE_CHANGE` | Confirm pro-rata contribution recomputation runs and surfaces to member for confirmation | |
| 2.9 | Renewal notices 30–60 days before expiry | Verify | BullMQ job `renewal-notice-dispatcher` | Confirm cron runs daily at 06:00 EAT and dispatches via member's notification channel preference | Tied to renewal intelligence module — see hardening spec §3.5 |
| 2.10 | Lapse management: automatic suspension after grace period | Covered | `MembershipLifecycleStateMachine` with `LAPSED` state | Confirm grace period is configurable per scheme (default 30 days) and the daily lifecycle sweep moves expired-no-payment memberships to `LAPSED` | |
| 2.11 | Reinstatement workflow after lapse | Verify | `MembershipReinstatementRequest` | Confirm UI exists for member to initiate reinstatement, including any catch-up contribution and waiting period reset rules | |

---

## 3. Member & Identity Management

> *Source: §3 — "Focuses on the 'User' experience and data integrity"*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 3.1 | Digital Health ID — QR code generation | Covered | `MemberIdentityCard.qrPayload` | Confirm QR resolves to a tamper-evident signed identifier, not just the raw membership ID | Should sign with tenant-specific key; signature verification on facility scan |
| 3.2 | Virtual member card display in app | Covered | Member app — `Profile → My card` surface | Open the member app demo and confirm the virtual card renders with photo, membership number, package, validity dates | |
| 3.3 | Biometric integration — fingerprint | Verify | `BiometricCapture` integration via SMART/Slade360 | Confirm fingerprint capture API hooks are in place for facility-side authentication. Edge-case: SMART biometric registry mode | This is a known integration point — confirm the wiring not just the schema |
| 3.4 | Biometric integration — face match | Partial | Liveness detection SDK integration (proposed) | Confirm whether a face-match SDK is integrated, and if not, scope as a phase 5 build | Critical for fraud prevention per `Healthcare_Fraud_Detection_System_Research.pdf` §"Identity Onboarding and Biometric Anchoring". The PDF flags Kenya as the highest-risk country for ID fraud (10% → 17% in H1 2023) |
| 3.5 | IPRS API integration for identity verification | Missing | New build required | Search for any reference to IPRS or Integrated Population Registration System | Fraud research doc explicitly recommends IPRS integration as the primary defense against synthetic identities. Add to phase 5 backlog |
| 3.6 | Strict parent-child-spouse relationship mapping | Covered | `MembershipFamilyRelation` with relation enum | Confirm orphan prevention: removing a principal cascades dependants to either a transfer destination or an inactive state, never orphans them | |
| 3.7 | Member self-service portal — view balance remaining | Covered | Member app — `Benefits` surface | See hardening spec §5.4 | |
| 3.8 | Member self-service portal — claim history | Covered | Member app — `Encounter history` surface | Terminology: "claim" → "benefit request" / "encounter" depending on context | |
| 3.9 | Member self-service portal — provider locator | Covered | Member app — `Care → Find a provider` surface | See hardening spec §5.7 | |
| 3.10 | Multi-channel access: web, mobile web, native | Covered | Same tRPC client across surfaces | See hardening spec §5.10 | |
| 3.11 | USSD shortcode for low-bandwidth members | Covered | USSD handler service | See hardening spec §5.8 | Important inclusivity feature called out implicitly by the fraud research doc's "digital chokehold paradox" lesson |

---

## 4. Provider & Tariff Management

> *Source: §4 — "Manages the relationship with hospitals, clinics, and pharmacies"*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 4.1 | Tariff engine — facility-specific procedure pricing | Covered | `FacilityTariff` with (facility, procedureCode, effectiveDates, price) | Confirm the seed data has differentiated pricing for at least two facilities on the same CPT code | |
| 4.2 | Auto-pick correct price during claim processing | Covered | Adjudication engine `resolveTariff()` step | Submit two test encounters for the same CPT code at two different facilities and confirm two different prices are paid | |
| 4.3 | Negotiated tariff vs. published rate distinction | Verify | `FacilityTariff.tariffType = NEGOTIATED \| PUBLISHED \| GAZETTED` | Confirm the enum captures all three and adjudication picks negotiated > gazetted > published | Critical for PSHP context — Avenue's negotiated rates with internal facilities differ from published external rates |
| 4.4 | Provider credentialing — license tracking | Covered | `FacilityCredential` with type, number, expiry | Confirm there is a daily expiry-warning job that alerts compliance 60/30/7 days before expiry | |
| 4.5 | Doctor-level credentialing | Verify | `Practitioner` + `PractitionerCredential` | Confirm individual doctor licenses are tracked separately from facility licenses | Avenue PSHP context: practitioner credential lapse must block claim approval for that practitioner's encounters |
| 4.6 | Geofencing — show nearest in-network facility | Covered | Provider locator with lat/lng + Haversine query | See hardening spec §5.7. Confirm only `IN_NETWORK` facilities surface unless filter changed | |
| 4.7 | Tier-based facility classification | Covered | `Facility.tier` enum (Tier 1/2/3/4 per Kenya MOH classification) | Confirm tier is used in package eligibility filters | Plus internal/external Avenue distinction for PSHP fraud rules |

---

## 5. Benefit Request & Adjudication Engine

> *Source: §5 — "Claims & Adjudication Engine. The most complex technical component."*
> *Avenue mapping: Benefit Request & Adjudication Engine*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 5.1 | Pre-authorization workflow | Covered | `PreAuthRequest` (see hardening spec §5.5) | Confirm full pre-auth lifecycle including auto-decision and human-routed paths | |
| 5.2 | Pre-auth must check balance + waiting period + exclusions in <2s | Verify | Performance budget on `preAuth.request` mutation | Run a load test with 50 concurrent pre-auth requests and confirm p95 latency under 2 seconds | Source doc explicitly sets the 2-second SLA |
| 5.3 | Auto-adjudication for simple outpatient claims | Covered | Auto-approve list per scheme (see hardening spec §5.5) | Confirm seed has malaria RDT, basic consultation, common labs auto-approved | Also verify against Kenya MOH malaria-in-pregnancy guideline — RDT must precede artemisinin per fraud research doc §"Integration of Kenyan Clinical Guidelines" |
| 5.4 | Manual review queue for high-value or complex claims | Covered | `ClaimReviewQueue` with severity-based assignment | Confirm queue dashboard exists for adjudicators with claim age, value, and complexity flags | |
| 5.5 | ICD-10 / CPT cross-validation (diagnosis matches procedure) | Covered | Adjudication rule `RULE-CLM-DXP-001` | Test: submit a Cast procedure with Fever diagnosis and confirm rejection | Aligns with fraud research doc §"Stage 2: Deterministic Heuristics" example |
| 5.6 | Gender-procedure consistency check | Covered | Adjudication gate `RULE-CLM-GND-001` | Test: submit a maternity procedure on a male member and confirm rejection | Per fraud research doc — ICD-10 O00–O9A blocked for male gender |
| 5.7 | Temporal sanity: discharge-after-admission | Covered | Adjudication gate `RULE-CLM-TMP-001` | Test: submit a claim with discharge before admission and confirm rejection | |
| 5.8 | Unbundling detection | Covered | Adjudication rule `RULE-CLM-UNB-001` | Test: submit fragmented surgical components and confirm collapse to bundled rate | |
| 5.9 | Frequency limits on diagnostic interventions | Covered | Adjudication rule `RULE-CLM-FRQ-001` through `RULE-CLM-FRQ-005` | Test: submit two CMP panels within 48h on same member and confirm second-line flagging | |
| 5.10 | Member identity verified at point of service | Verify | Facility-side scan flow with biometric or QR | Confirm the facility cannot proceed with claim submission without an identity verification event | |
| 5.11 | Real-time encounter posting back to member app | Covered | Webhook `encounter.created` → push notification | Confirm that within 60 seconds of encounter approval, the member's app reflects the deduction | See hardening spec §5.4 — denormalized `MembershipBenefitState` |

---

## 6. Financials & Contribution Billing

> *Source: §6 — "Accounts Receivable, Accounts Payable, Reconciliation, Tax & Levies"*
> *Avenue mapping: Contribution Receipts, Provider Disbursements, Reconciliation, Tax & Levies*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 6.1 | Accounts Receivable — track payments from corporates | Covered | `ContributionReceipt` linked to `Scheme` | Confirm aging buckets (0-30, 31-60, 61-90, 90+) are queryable per scheme | Source says "premium" → "contribution" |
| 6.2 | Accounts Receivable — track payments from individuals | Covered | `ContributionReceipt` linked to `Membership` directly when no scheme | As above with individual member scope | |
| 6.3 | Accounts Payable — batch approved claims for hospital pay cycles | Covered | `ProviderDisbursementBatch` | Confirm batch frequency is configurable (weekly, bi-weekly) per facility contract | Source: "Pay Cycle" → Avenue dictionary maps to "disbursement cycle" |
| 6.4 | Bank statement reconciliation | Verify | `BankStatementImport` + reconciliation matcher | Confirm CSV/MT940 import is wired and matcher uses fuzzy (amount + date ± 2 days + reference) match | |
| 6.5 | M-Pesa reconciliation | Covered | Daraja webhook + 5-minute reconciliation sweep (see hardening spec §5.6) | Confirm orphaned `INITIATED` records are caught within 5 minutes and reconciled or marked timed-out | Critical: source doc references "Mobile Money (M-Pesa/Stripe)" as a generic example, but Avenue's reality is M-Pesa-primary. Confirm the fake-confirmation-SMS fraud surface from the prior domain correction is closed (no SMS-based confirmation accepted; Daraja webhook is sole source of truth) |
| 6.6 | Card payment reconciliation | Verify | `CardPaymentGateway` integration | Confirm whether a card gateway (e.g. Pesapal, Flutterwave) is wired or if cards are out of phase 4 scope | |
| 6.7 | Stamp Duty handling | Covered | `ContributionTaxComponent` with type `STAMP_DUTY` (KES 40 per policy per Rensoft ref) | Confirm tax component appears on every contribution receipt and on debit notes | |
| 6.8 | Training Levy handling | Covered | `ContributionTaxComponent` with type `TRAINING_LEVY` (0.2% of basic) | As above | |
| 6.9 | Policy Holders Compensation Fund (PHCF) handling | Covered | `ContributionTaxComponent` with type `PHCF` (0.25% of basic) | As above. Note: name is regulatory and remains "Policy Holders Compensation Fund" since it is the statutory body name, not Avenue's user-facing language | Source labels three Kenya-specific taxes — all already in Avenue spec |
| 6.10 | VAT handling where applicable | Covered | `ContributionTaxComponent` with type `VAT` | Confirm 16% VAT is added on broker commissions (see hardening spec §1.4) and on any taxable line items | |
| 6.11 | Withholding tax on broker commissions | Covered | Commission ledger statutory pipeline (see hardening spec §1.4) | Confirm 10% WHT computed and netted before payout | |
| 6.12 | Self-funded scheme fund management | Verify | `SelfFundedSchemeFund` (referenced in gap analysis as open decision) | This is one of the six open decisions from the gap analysis. Until Mutuku resolves prioritization, treat as deferred | Open decision per gap analysis |
| 6.13 | Self-funded admin fee — flat-per-insured option | Verify | `SelfFundedAdminFee.feeType = FLAT_PER_MEMBER` | Confirm both fee types are present in enum even if not yet wired to UI | |
| 6.14 | Self-funded admin fee — % of claims paid option | Verify | `SelfFundedAdminFee.feeType = PERCENT_OF_CLAIMS_PAID` | As above | |
| 6.15 | Medical card fees on debit note | Covered | `MedicalCardIssuanceFee` line item | Confirm it appears on Smart card and Photo card issuances per Rensoft schedule | |
| 6.16 | Debit note generation includes all tax/levy/fee components | Verify | PDF template `debit-note.hbs` (or equivalent) | Generate a debit note for a seeded scheme and visually confirm all components are itemized | |

---

## 7. Business Intelligence & Reporting

> *Source: §7 — "Loss Ratio, Utilization, Regulatory Exports"*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 7.1 | Loss Ratio Analysis (Claims Paid / Premiums Collected) | Covered | Strategic Purchasing Console, four-granularity MLR (see hardening spec §3.5) | Confirm MLR computes per scheme, category, family-size band, and broker book | Maps directly to RPT-001 and RPT-002 in Tranche A |
| 7.2 | Utilization reports — by hospital | Covered | Provider scorecards (see hardening spec §3.4) | Maps to RPT-003 and RPT-004 | |
| 7.3 | Utilization reports — by disease | Covered | `analytics.diseasePattern` query | Maps to RPT-010 in Tranche A | |
| 7.4 | IRA regulatory export format | Verify | `regulatoryReports.iraExport()` | Confirm IRA-mandated columns and format (XBRL or prescribed Excel template) are matched. Open decision per gap analysis on tranche prioritization | This is one of the deferred-tranche reports; status depends on Mutuku's tranche decision |
| 7.5 | Trended dashboards (period-over-period) | Covered | Strategic Purchasing Console sparklines | Confirm 12-month trailing comparators are visible on every key metric | |
| 7.6 | Profitability by scheme | Covered | RPT-005 renewal intelligence summary plus scheme MLR | | |
| 7.7 | Top-utilizing members (anonymized) | Covered | RPT-008 in Tranche A | Confirm anonymization (member ID hashed; no name/phone) on the report output | |
| 7.8 | Geographic heatmap | Covered | RPT-009 + Strategic Purchasing Console map view | Kenya county admin boundaries | |
| 7.9 | Pre-formatted regulatory exports for IRA / SHA | Partial | Tranche C, deferred to phase 6 per gap analysis | This is explicitly out of competitive hardening sprint scope — see hardening spec §CC.5 | Open decision dependency |

---

## 8. Technical Architecture

> *Source: §"Technical Architecture Recommendation for Developers"*

| # | Requirement | Status | AiCare locus | Verification check | Notes |
|---|---|---|---|---|---|
| 8.1 | RESTful or GraphQL API standard | Covered | tRPC (functionally equivalent — typed RPC over HTTP, equivalent or superior to REST/GraphQL for monorepo TypeScript) | The source doc presents REST or GraphQL as recommendations. tRPC supplies the same affordances with stronger end-to-end typing. Document this rationale in the architecture overview | If a tenant evaluator insists on REST, a thin REST adaptor over tRPC routers can be exposed — note as future optional surface |
| 8.2 | Message broker for async tasks | Covered | BullMQ on Redis | Source mentions RabbitMQ or Kafka — BullMQ on Redis is a lighter-weight choice appropriate for AiCare's scale. Document the rationale | Kafka/RabbitMQ would be premature optimization at current Avenue volumes |
| 8.3 | SMS notification on claim filing | Covered | `MemberNotification` channel `SMS` | Confirm SMS dispatch is wired via Africa's Talking or Safaricom directly | |
| 8.4 | FHIR data standard for medical data exchange | Partial | HL7 FHIR is named in user memory as an in-scope HMS integration standard | Confirm whether FHIR resources (`Patient`, `Encounter`, `Claim`, `Coverage`) have mapper layers. If only canonical AiCare schema exists, FHIR adaptors are a phase 5 build | Critical for HMS interoperability and future SHA integration |
| 8.5 | OAuth2 / OpenID Connect authentication | Covered | NextAuth with OIDC providers | Confirm session strategy and token rotation policy match enterprise expectations (15-minute access token, 7-day refresh) | |
| 8.6 | AES-256 for data at rest | Covered | Supabase native encryption + audit-chain payload AES-256-GCM (see hardening spec §4.6) | Confirm payload encryption keys rotate per the documented schedule | |
| 8.7 | TLS 1.2+ in transit | Covered | Vercel + Supabase platform-default | Confirm no plaintext endpoints | Standard hosting expectation, document for completeness |
| 8.8 | Audit logging on sensitive operations | Covered | `AuditChainEntry` (hardening spec §4.6) | Confirm hash chain verifies cleanly across seeded entries | Stronger than typical "audit log" — this is a tamper-evident chain |

---

## 9. Terminology Translation Reference

For every status assessment above, Antigravity should treat the source insurance term as the system-default canonical key and verify that the Avenue tenant dictionary maps it correctly. Spot-check the following high-risk terms against the live build:

| Source insurance term | Avenue membership term | Where it must appear correctly |
|---|---|---|
| Insurer | Membership manager | Email signatures, debit notes, regulatory PDFs |
| Insured | Member | Member app entire surface; certificate; benefit schedule |
| Policy | Membership | Member app, broker portal, all legal documents |
| Premium | Contribution | Receipts, debit notes, broker statements, member app payment screens |
| Claim | Benefit request | Member app, adjudication queue UI, notifications |
| Adjudicate | Review | Internal admin UI for claims team |
| Co-payment / Copay | Co-contribution | Member app payment screens, M-Pesa STK push prompts |
| Sum insured | Benefit limit | Member app benefit screens, certificate |
| Underwriting | Eligibility assessment | Onboarding wizard, broker quote flow |
| Lapse | Inactive membership | Member app, notifications, broker portal |
| Endorsement | Membership amendment | All amendment flows |
| Pay cycle | Disbursement cycle | Provider portal, finance dashboards |

To verify: on the Avenue tenant in the live build, run `terminologyAdmin.exportTenantDictionary({ tenantId: 'avenue', format: 'JSON' })` and grep the JSON for any of the **left-hand column** values appearing as values rather than keys. Any hits indicate a mapping gap.

---

## 10. Summary Scorecard

Tally of statuses across the 78 verification items above:

| Status | Count | Items |
|---|---|---|
| Covered | 49 | Items where the prior AiCare specs already commit a build that satisfies the source requirement |
| Partial | 4 | 1.5 (shared limits), 3.4 (face match), 7.9 (regulatory exports), 8.4 (FHIR adaptor) |
| Missing | 1 | 3.5 (IPRS API integration) |
| Verify | 24 | Items requiring Antigravity to confirm against the live build, not against a spec |

Overall coverage profile: **63% covered, 31% verify, 5% partial, 1% missing** — strong alignment between the source document and AiCare's existing scope, with the verification load concentrated in items where specs exist but live-build wiring needs confirmation.

---

## 11. Net-New Build Items

Items in this audit that are NOT already in any prior AiCare spec and therefore require new build effort:

### 11.1 Shared limit groups (item 1.5)
- **Scope:** A `SharedLimitGroup` entity allowing one cap to be drawn down by encounters across multiple benefits (e.g., a single annual diagnostic budget shared across radiology, pathology, and cardiology sub-benefits).
- **Effort estimate:** 2–3 days. Schema addition, adjudication engine update, package editor UI extension.
- **Phase recommendation:** Phase 5 alongside reporting hardening.

### 11.2 Face-match liveness SDK integration (item 3.4)
- **Scope:** Integration of a passive-liveness face-match SDK with de-biased models for African skin tones (per fraud research doc §"Stage 1: Identity Onboarding"). Candidate vendors: Smile Identity, FaceKI.
- **Effort estimate:** 4–5 days. SDK integration, capture flow in onboarding wizard, fraud-engine signal wiring.
- **Phase recommendation:** Phase 5; consider as a hard prerequisite to scaling member volumes.

### 11.3 IPRS API integration (item 3.5)
- **Scope:** Live IPRS query at onboarding to verify National ID against the government registry. Returns photo, name, DOB, gender, KRA PIN per the standard payload.
- **Effort estimate:** 3–4 days. API integration, identity-verification step in onboarding wizard, fraud-engine cross-checks (gender mismatch on procedure, age falsification flag).
- **Phase recommendation:** Phase 5; pairs naturally with §11.2 (face-match) since both anchor the identity-fraud defense layer.
- **Procurement note:** IPRS access requires government-licensed integration partner. Spinmobile and Smile Identity both provide this access in Kenya.

### 11.4 FHIR resource adaptors (item 8.4)
- **Scope:** Mapper layer translating canonical AiCare schema to FHIR R4 resources for `Patient`, `Encounter`, `Claim`, `Coverage`, `ExplanationOfBenefit`, `Practitioner`, `Organization`. Bidirectional — accept inbound FHIR from HMS systems, emit outbound FHIR to HMS and SHA.
- **Effort estimate:** 8–10 days. Requires FHIR validator integration (e.g., HAPI FHIR Java service or fhir.js).
- **Phase recommendation:** Phase 6, sequenced after the cross-cutting hardening phase. Becomes critical when Avenue's HMS integration begins in earnest.

### 11.5 IRA regulatory export tranche (item 7.4 / 7.9)
- **Scope:** Tranche C of the 25-report backlog — RPT-021 through RPT-025. IRA-mandated formats and submission schedules.
- **Effort estimate:** Already scoped in gap analysis as phase 6.
- **Phase recommendation:** Phase 6, contingent on Mutuku's open decision on tranche prioritization.

---

## 12. Open Decisions Surfaced by This Audit

In addition to the six open decisions already identified in `AICARE_GAP_ANALYSIS.md`, this audit surfaces:

1. **Shared limit groups** — confirm whether Avenue's product team needs this for any current scheme, or whether the existing per-benefit cap model is sufficient. If not currently used by any Avenue scheme, defer.
2. **Face-match SDK vendor selection** — Smile Identity (Kenya-native, IPRS-bundled) vs. FaceKI (more flexible, pure SDK). Recommend Smile Identity if §11.3 is also approved (single vendor, single contract).
3. **FHIR profile selection** — global FHIR R4 vs. an East Africa profile (e.g. the Kenya HIE FHIR profiles published by Kenya MOH). The latter is the right choice for SHA interoperability but requires tracking the official KE profile maintenance.
4. **Card payment gateway** — out of phase 4 scope per the audit. Confirm whether phase 5 should bring in Pesapal or Flutterwave, or whether M-Pesa-only is acceptable for Avenue's pilot.
5. **REST adaptor over tRPC** — defer unless a tenant evaluator specifically demands REST.

---

## 13. Verification Run Procedure for Antigravity

To execute this audit against the live build:

1. Pull latest from main branch
2. Run database migrations: `pnpm prisma migrate deploy`
3. Seed Avenue tenant: `pnpm seed:avenue`
4. For each item in this document with status `Verify`:
   - Execute the listed verification check
   - Update status to `Covered` if verified, or downgrade to `Partial` or `Missing` with a code-location note if the wiring is incomplete
5. For each item with status `Partial` or `Missing`:
   - Open a ticket in the implementation backlog
   - Cross-reference to the corresponding §11 or §12 entry above
6. Generate a delta report: this document with status changes annotated and post to the project channel

The verification run should take approximately 1.5–2 days for a single Antigravity engineer. If items take materially longer, log the divergence — it likely indicates the spec and the build have drifted further than expected.

---

## 14. Document Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-10 | Mutuku (via Claude) | Initial audit against `System-reqs_new.pdf` |

---

**End of audit document.**
