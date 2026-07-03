# Digital Contract Module & Contract-Driven Claims Automation — Implementation Specification

**Document type:** Prescriptive implementation specification (product + engineering + claims + implementation)
**Scope:** Digital provider rate contracts, contract rule engine, contract-driven claims adjudication, override/exception handling, rejection & audit framework, markdown contract extraction
**Source corpus studied:** 34 markdown files in `contract-mds/` (`FFS RATES/` — 17 payer rate agreements; `SHA CONTRACTS/` — 7 Social Health Authority facility contracts; `Masters/` — 10 internal service/price/doctor/inventory masters)
**Relationship to existing build:** This document EXTENDS the existing platform (Prisma schema `prisma/schema.prisma`, services in `src/server/services/`, tRPC routers in `src/server/trpc/routers/`). Every entity and workflow below is marked **EXISTS** (already built — reuse as-is), **EXTEND** (built but needs new fields/states/logic), or **NEW** (net-new build). Do not rebuild what exists.
**Status convention:** `EXISTS` · `EXTEND` · `NEW` — consistent with the `Covered/Partial/New` convention in `AICARE_TPA_UGANDA_SPEC.md`.
**Version:** 1.0 — 2026-07-02

---

## Existing-Platform Baseline (read this first)

The claims platform already implements a first generation of provider contracting. The new module builds on it:

| Capability | Where it lives today | Status for this spec |
|---|---|---|
| Provider master (type, tier, contact, geo, services) | `model Provider` | EXTEND (branches, legal identity, licence/PIN) |
| Provider contract record (DRAFT/ACTIVE/SUSPENDED/EXPIRED/TERMINATED, payment terms, unlisted-service rule, invoice discount, supersession chain) | `model ProviderContract`, `provider-contracts.service.ts` | EXTEND (approval workflow, applicability, versioning, new statuses) |
| Line tariffs (per-client, effective-dated, `requiresPreauth`, `maxQuantityPerVisit`, NEGOTIATED/GAZETTED/PUBLISHED priority) | `model ProviderTariff` | EXTEND (rate types, restrictions, UoM, external-tariff offsets) |
| Diagnosis-linked bundled / per-diem rates | `model ProviderDiagnosisTariff` | EXTEND (fold into general PricingRule/Package layer) |
| Contract exclusions (CPT or named service) | `model ProviderContractExclusion` | EXTEND (multi-level exclusions) |
| Rate resolution at adjudication (contract tariff → standalone tariff → exclusion → unlisted rule) | `ProviderContractsService.resolveClaimLineRates()` | EXTEND (new pipeline stages §6) |
| Claims pipeline (statuses, hard gates: duplicate invoice, double capture, temporal, cover) | `model Claim/ClaimLine`, `claim-adjudication.service.ts` | EXTEND (contract decision provenance per line) |
| Auto-adjudication policy + named failing gates | `model AutoAdjudicationPolicy`, `auto-adjudication.service.ts` | EXTEND (contract gates feed it) |
| Pre-authorisation (GOP, SLA, emergency flag, benefit holds, escalation) | `model PreAuthorization`, `preauth-adjudication.service.ts` | EXTEND (contract-sourced pre-auth rules) |
| Manual override framework (maker-checker, approver-role routing, SLA, audit chain) | `model OverrideRecord`, `override.service.ts`, `/overrides` UI | EXTEND (claims-contract override types) |
| Exceptions log | `model ExceptionLog` | EXISTS |
| Approval matrix engine (thresholds, steps) | `model ApprovalMatrix/ApprovalStep/ApprovalRequest` | EXISTS (route contract approvals through it) |
| Immutable audit chain | `audit-chain.service.ts` | EXISTS |
| Client (payer) master with hierarchy, per-client currency | `model Client` (`PayerType`: INSURER/HMO/EMPLOYER_SELF_FUNDED) | EXTEND (add GOVERNMENT_SCHEME) |
| Benefits (Package/PackageVersion/BenefitConfig/BenefitUsage, shared limits) | `model Package` et al. | EXISTS (contract applicability references it) |
| Provider eligibility per benefit package | `model PackageProviderEligibility` | EXISTS |
| Drug exclusions, fraud engine, cost-share engine | respective services | EXISTS |
| Terminology engine (client-specific vocabulary) | `model TerminologyEntry` | EXISTS (all new user-facing strings go through it) |
| Contracts UI stub | `src/app/(admin)/providers/[id]/contracts` | EXTEND (full module §11) |

Two coexisting contract stores must not be created. `ProviderContract` is the anchor entity; everything in §5 hangs off it.

---

## 1. Executive Summary

### 1.1 What the module does

The digital contract module converts signed healthcare provider rate agreements — today PDFs OCR-converted to markdown — into **structured, versioned, approvable, machine-evaluable contracts**. The claims engine stops treating the contract as a document someone remembers and starts treating it as data it executes:

1. **Contract creation & management** — capture a contract from scratch or from an uploaded markdown/PDF source; map provider, branches, payer(s), scheme/plan applicability; capture tariff lines, packages, pricing rules, pre-auth rules, documentation rules, exclusions; validate; route for approval; activate.
2. **Structured contract data model** — every negotiated term becomes a typed row (§5), never a paragraph.
3. **Contract rule engine** — a deterministic pipeline (§6) the claims module calls per claim and per claim line: match contract → validate → map service → price → check coverage/exclusions → check pre-auth → check documents → decide.
4. **Automated adjudication** — clean lines auto-price and auto-approve through the existing `auto-adjudication.service.ts` gates; every automated decision names the contract, version, and rule that produced it.
5. **Controlled manual intervention** — everything the engine cannot decide lands in a categorised manual-review queue (§8.5) with override paths that are role-gated, reason-coded, dual-approved where financial, and audit-chained (§9).
6. **Explainability** — no claim is ever just "Rejected". Every rejection/shortfall carries a structured reason code bound to the contract rule and claim field that triggered it, with member-, provider-, and internal-facing wording (§10).

### 1.2 Operational outcomes

- **Faster processing:** the corpus's dominant patterns (fixed pricelist rates, fixed packages, per-visit fixed fees) are fully deterministic — target ≥70% of claim lines auto-priced without human touch by Phase 3 (§16).
- **No more tribal knowledge:** today a claims officer must remember that Jubilee outpatient is a Kes 3,600 fixed fee per visit *excluding MRI/CT/ECHO/dialysis/optical/dental/wellness*, while Old Mutual is a Kes 4,000 *average* reconciled quarterly. Those become rule rows, not memory.
- **Consistent application:** the same claim line against the same contract always prices identically; variance is a defect, not a discretion.
- **Better rejection reasons:** structured codes with remedies and resubmission rules (§10), surfaced to providers to cut dispute volume.
- **Version-safe history:** the contract version in force **on the service date** prices the claim — retro-active repricing only by explicit, approved retro amendment (§4.4).
- **Leakage control:** "lower of billed vs contracted" enforcement, quantity/frequency caps, package-vs-itemised conflicts caught systematically; overpayment recovery flags mirror SHA GCC 12.9/12.10 obligations.
- **Fewer provider disputes & better transparency:** provider portal shows the same rate, rule, and reason the adjudicator saw.
- **Auditability:** every contract state change, rate change, and override is on the existing immutable audit chain.

### 1.3 What the module is not

- Not a document management system: the signed PDF/markdown stays attached as evidence; the structured record is what executes (§3).
- Not a benefits engine: member benefit limits, waiting periods, and cost-share remain in the existing benefits/cost-share modules. The contract engine answers "what does the TPA owe **the provider** for this service"; the benefits engine answers "what does the payer owe **on behalf of this member**". Both run on every claim; §14 defines the interface.
- Not an autonomous payer: reconciliation-style commercial terms (average-cost models, early-settlement discounts) are flagged and computed, but settlement adjustments remain finance-approved actions.

---

## 2. Observations From The Supplied Markdown Contracts

The corpus divides into four families with very different digitisation profiles.

### 2.1 Corpus families

| Family | Files | Nature | Digitisation difficulty |
|---|---|---|---|
| **A. FFS pricelist letters** | `CIC Insurance tariff.md`, `Amanah tariff.md`, `GA Insurance.md`, `Butali rates.md`, `Parliamentary rates.md`, `KCB Dental rates.md`, `Madison dental rates.md` | Letter from provider (LifeCare) to payer: category + item name + agreed rate tables, effective date, validity period, signature blocks | Medium — tabular but OCR-mangled |
| **B. Package / pricing-model letters & agreements** | `Jubilee SURGICAL.md`, `Britam surgical packages.md`, `APA Insurance Surgical package.md`, `CIC Insurance surgical package.md`, `Life Care Madison Signed Packages 2023.md`, `Lifecare Hospital - Old Mutual Package 2024 (signed).md`, `Madison-Life care FCM Agreement 2023.md`, `JUBILEE CAPITATION.md`, `Old Mutual AVERAGE COST DISCOUNT SIGNED AGREEMENT.md`, `Madison dental rates.md` (addendum pages) | Fixed surgical/maternity/dental package prices; fixed-cost-per-visit models; average-cost + discount addenda; contract addenda amending a parent agreement | Medium-high — narrative inclusion/exclusion lists, layered on unseen parent contracts |
| **C. SHA statutory contracts** | 7 files, one per branch (Eldoret, Meru, Kikuyu, Migori, Bungoma, Mlolongo, + duplicate Eldoret variant) | Full legal contracts: contract number (e.g. CN-73009), start/end dates, fund packages (PHC / SHIF / ECCIF), per-service tariff blocks with Tariff Description + Beneficiaries Schedule + Service Conditions Schedule, GCC/SCC legal clauses, claims-management SLAs | High volume but the MOST structured — repeating tariff blocks are template-extractable |
| **D. Internal masters** | `Last & Final Service & Procedures Master.md` (itemcode `SERxxx`, category, OP/IP/OT), `Specialty Master.md`, `Master Lab.md`, `Master Radiology.md`, `Inventory Matser*.md`, `Doctors' Master*.md` | The provider-side service catalogue and doctor fee-share tables | These are NOT contracts — they are the **service master** that contract tariff lines must map onto (§5.6, §14) |

### 2.2 Common structures observed

**Common fields** (appearing in most of families A–C): provider identity (with heavy naming variance — see 2.4), payer identity, effective date, validity period ("valid for one year/two years, after which subject to review"), rate tables (category / item / amount), signature blocks with name/designation/date, branch footprint (LifeCare footer lists `Bungoma | Migori | Eldoret | Meru | Kikuyu | Mlolongo`), reference to a governing parent agreement ("All other terms of engagement are as per the existing service agreement").

**Common pricing models found in the corpus** — the system must support ALL of these from day one of Phase 3:

| # | Pricing model | Concrete evidence |
|---|---|---|
| P1 | Fixed fee-for-service rate per item | CIC tariff: `Outpatient Consultation Fees 1,000.00`; GA: `Oxygen Therapy Per Hour 650`; Parliamentary rates with item codes (`XRS24 Pelvis(Ap) 1,300`) |
| P2 | Fixed package per procedure episode | Old Mutual 2024: `Adenoidectomy 110,000`; Jubilee: `Elective or Emergency Caesarean Section Package 120000`; Madison 2023: `Craniotomy for Aneurysm 537,000` |
| P3 | Package **net of external scheme rebate** | Britam & APA surgical packages: "These packages are Net of NHIF"; Jubilee: "JHIL AGREED RATES NET OF NHIF APPROVAL" |
| P4 | Fixed cost per outpatient visit (case rate / FCM) | Madison FCM: Kshs 3,900 per OP visit "regardless of the actual value of the invoice", incl. ANC, wellness, KEPI vaccines; Jubilee capitation letter: Kes 2,800 → 3,600 per valid patient visit |
| P5 | Average cost with periodic reconciliation | Old Mutual: KES 4,000 average OP cost; "at the end of each calendar quarter, any amounts billed over and above the agreed gross average cost shall be recovered from subsequent payment(s)" |
| P6 | Average-cost schedule per service class | Britam contract schedule: OP avg 3,500; Dental avg 8,000; IP avg 50,000 non-surgical; Delivery SVD 50,000 / C/S 120,000 |
| P7 | Early-settlement discount (payment-behaviour rule, not a claim rule) | Old Mutual: 2% discount on claims paid within 30 calendar days of receipt of complete documentation |
| P8 | Per-diem tariffs | SHA: Inpatient `Tariff: Ksh 3360.00` per day; CIC/Amanah/GA daily nursing/doctor review fees per ward class (`ICU Ward Daily 7,000`) |
| P9 | Branch-specific rate variants | CIC & Amanah bed-charge tables broken out by branch (Eldoret vs Kikuyu tables with different totals); Britam contract is signed by "Lifecare Hospital Bungoma Limited" only |
| P10 | Government fund/package tariffs with condition schedules | SHA fund packages (PHC/SHIF/ECCIF) with per-package tariff, beneficiary schedule, and service-condition schedule (referral required, pre-auth by Board, condition-restricted MRI/CT) |
| P11 | External tariff reference / zero-rated placeholder | SHA oncology blocks: `Tariff: Ksh 0.00` with conditions deferring to National Cancer Institute guidelines — a rate that is *defined elsewhere* |
| P12 | Composite bed-charge = base + external rebate | CIC page 6: bed charge tables with columns `CIC Liability | SHA Rebate | Total` (e.g. ICU 13,000 + 3,360 = 16,360) |

**Common service categories observed:** consultation (OP/specialist), IP services (bed, admission, lodger fee, nutritionist), procedures (minor/major), theatre/surgical packages by specialty (Neurology, Orthopaedic, Gynaecology, General Surgery/Urology, ENT, Obstetrics), ICU/HDU/NICU daily charges, dialysis, ambulance (distance-banded: within 50km / 50–150km / >150km, ACLS), radiology (X-ray, US, CT, MRI, fluoroscopy, mammography), laboratory (biochemistry, haematology, histology, immunology, microbiology, serology, virology), dental (consultation, extraction, endodontics, periodontics, restorative, oral surgery, imaging), physiotherapy, maternity (SVD, C/S, obstetrician packages), oncology (chemo, brachytherapy), mental wellness, palliative, overseas treatment (SHA).

**Common restrictions observed:** pre-authorisation carve-outs from fixed-fee models (Madison FCM: MRI, dental & optical, external prescriptions/lab, private vaccines, dialysis, cancer treatment "will require preauthorization"); LOU thresholds (Madison dental addendum: "For all Dental services and other Services that are above Kshs 10,000 a letter of undertaking (LOU) MUST be sought"); referral gating (SHA imaging "available to Beneficiaries on a referral basis... self-referral shall not be allowed"); diagnosis/indication restrictions (SHA: "MRIs and CT scans will be limited to infective, oncology, neurological, degenerative conditions, specific obstetric conditions, cardiac/CVA-related cases and trauma cases"); annual utilisation limits (SHA: inpatient "up to a limit of 180 days per household per annum"); one-claim-per-episode (SHA: "lodge only one claim for all specified services provided to a beneficiary within the treatment period per admission episode"); package complication exclusions (CIC surgical package excludes "Complication - ICU/HDU/NICU", advanced imaging, non-related treatment, ambulance transfer); submission windows (SHA: claims within 7 days of service/discharge/invoice; Britam: F20 pre-auth form within 24 hours of hospitalisation; monthly invoicing under Jubilee capitation); payment SLAs (SHA: clean claims paid within 90 days, rejections communicated within 14 days, pre-auth decisions within 72 hours; Britam: invoices paid within 30 days; Jubilee: 10 working days); balance-billing prohibition (SHA GCC 12.16); no-handwritten-invoices rule (Britam 6.4).

### 2.3 Terms that are easy vs hard to digitise

**Easy (deterministic rows):** fixed item rates (P1), fixed package prices (P2), per-diem ward charges (P8), pre-auth thresholds, submission windows, payment terms, effective/end dates where printed clearly (SHA contracts print machine-readable dates: "Contract Start Date: Thu Oct 24 2024"), branch lists, distance-banded ambulance fees, exclusion service lists.

**Hard (need structured modelling + review):**
- Package inclusion/exclusion narratives ("Theatre fees - Theatre time, medication, consumables and related charges... Specialist reviews for the duration of stay... For orthopaedic - Two X-rays") → must become typed inclusion rows with quantity caps (2 X-rays), not prose.
- "Net of NHIF/SHA" — an *offset against an external scheme* whose own tariff is not in the document. Requires an external-tariff reference table (§5.7 R-NET rule).
- Average-cost models (P5/P6) — not line-adjudicable at all; they are portfolio-level reconciliation terms. The engine must price normally and tag the claim as belonging to an average-cost pool (§6.4, §17-E14).
- Addenda layered on unseen parent contracts (Old Mutual addendum "pursuant to clause 11 of the Main Agreement"; Madison dental "1st ADDENDUM TO THE CONTRACT dated 20 December 2022") — the parent is NOT in the corpus. The model must represent parent/child contract links with explicit "parent not digitised" status (§5.1).
- Quarterly-review clauses ("valid for one year, after which they will be subject to review") — validity ≠ expiry; the rate does not die at the anniversary, it becomes review-due. Model as `reviewDueDate` distinct from `endDate`.
- Fee-share masters (Doctors' Masters with Cash/Insurance/SHA/MAKL share splits) — provider-internal economics, out of adjudication scope but needed by the provider-side module; keep in the service master domain, not the contract engine.

**Terms requiring manual interpretation forever (route to human):** "All other terms as per the already existing service level agreement" (unresolvable without the SLA); OCR-destroyed rates (see 2.4); clinical-necessity conditions ("routine and of medical necessity ... as per MOH guidelines"); SHA "coverage decisions (applicable payment options)" for intra-admission cross-package procedures.

### 2.4 Inconsistencies, ambiguities, and gaps found (with system implications)

| # | Observation (verbatim where possible) | File | System implication |
|---|---|---|---|
| O1 | Provider legal identity varies: "AFRIHOSPITAL HOLDINGS LIMITED ... trading as Life Care Hospitals", "LIFECARE HOSPITALS (K) LIMITED", "Lifecare Hospital Bungoma Limited", "LIFECARE HOSPITAL LIMITED-MERU", "Lifecare Hospitals Limited P.O. Box 22476" | Madison FCM; Old Mutual; Britam 2024; SHA Meru; Jubilee | Provider entity needs legal name + trading name + branch entities + alias table; contract matching must resolve aliases (§5.2) |
| O2 | OCR-destroyed rate tables: KCB dental rows collapse into `8/8/8/8|8/3/3/3`; Jubilee surgical page 1 lists procedures with NO visible amounts; Britam surgical amounts shredded across lines | `KCB Dental rates.md`, `Jubilee SURGICAL.md`, `Britam surgical packages.md` | Extraction pipeline MUST support "row detected, rate unreadable" state → import as `rateMissing` line requiring human entry against source PDF (§12); never guess a rate |
| O3 | Conflicting effective dates in one document: CIC letter dated 29 Jan 2025; title says "EFFECTIVE 04: February 2025"; body says "starting from 01st February 2025" | `CIC Insurance tariff.md` | Ambiguous-date detection; block activation until a human confirms one date; record both candidates in extraction notes (§12, §13-V3) |
| O4 | Validity wording is review-based not expiry-based: "will remain valid for one year, after which they will be subject to review" / "two years" | CIC, GA, Amanah, Madison dental, Old Mutual 2024 | `reviewDueDate` field + renewal task generation; contract does NOT auto-expire (§4.3, §5.1) |
| O5 | Rate supersession by letter: Jubilee OP fixed cost "reviewed from Kes 2,800 to Kes. 3,600" | `JUBILEE CAPITATION.md` | Amendment/versioning: a one-line letter re-prices a whole model; version chain with effective dates (§4.4) |
| O6 | Layered contracts: addenda amend unseen parents; "Except as modified by this 1st Addendum, the terms ... remain in effect" | Madison dental, Old Mutual discount | `parentContractId` + `AMENDS` link type; validation warns when parent is not digitised (§5.1, §13-V10) |
| O7 | Same tariff block duplicated verbatim (every SHA tariff appears twice in sequence) | all SHA contracts | Extraction de-duplication by content hash (§12) |
| O8 | Zero tariffs deferring to external guidelines: `Tariff: Ksh 0.00` for chemo/diagnostics with NCI-guideline conditions | SHA Meru | R-EXTERNAL rate type: line maps but prices from an external tariff table or routes to manual (§5.7) |
| O9 | "Net of NHIF" with no NHIF schedule supplied | Britam/APA/Jubilee packages | External-offset table keyed by scheme + service; if offset unknown → manual review, never silently pay gross (§5.7 R-NET) |
| O10 | Branch-specific tables inside one network-wide letter (bed charges per branch; `CIC Liability / SHA Rebate / Total` columns) | CIC, Amanah | Tariff lines must carry optional `branchId`; composite rate = payerLiability + externalRebate must be stored decomposed (§5.6) |
| O11 | Category label noise: "Mo Minor Procedure", "Mo Pocedures", "IP SERVICES", "Physio", "oe" (OCR) | CIC, Amanah, GA | Service-category normalisation layer mapping raw labels → canonical categories, preserving raw text (§5.5) |
| O12 | Same item, different rates across payers (OP consultation: CIC 1,000 vs Amanah 4,000; CT Colonography: Amanah 14,000 vs CIC OCR-garbled `455000`) | CIC vs Amanah | Rates are per-contract, never global; cross-payer rate-variance reporting (§15) |
| O13 | Missing amounts for listed items (Madison dental IOPA/bitewing rows have no price; several CIC rows blank) | Madison dental, CIC | `rateMissing` lines allowed in DRAFT, block ACTIVATION unless line is deactivated or priced (§13-V6) |
| O14 | Numbers-vs-words precedence clause exists in legal families: "Where figures are referred to in numerals and in words ... the words shall prevail" | Britam 2024 §1.4 | Extraction stores both; conflict flags for human resolution |
| O15 | Payment/SLA asymmetries across payers: SHA 90 days; Britam 30 days; Jubilee 10 working days + monthly reconciliation sign-off | SHA, Britam, Jubilee capitation | Payment terms are contract fields feeding the settlement module, not hard-coded (§5.1, §14) |
| O16 | Fraud/abuse clauses define adjudication red flags: upcoding, claim-splitting ("Submitting separate claims to the Authority for services that should fit on a single bill"), member substitution, self-referral billing | SHA GCC 16.1 | Feed as fraud-rule seeds to the existing fraud engine; claim-splitting detection needs episode grouping (§14) |
| O17 | Emergency exception is explicit: "preauthorization shall not apply for Emergency services" | SHA GCC 11.1 | Pre-auth rule must carry `emergencyExempt` flag; ties to existing `PreAuthorization.isEmergency` (§5.10) |
| O18 | Retrospective repayment obligations both directions (recoup overpayments; provider must return overpayments within 7 days) | SHA GCC 12.9–12.10 | Recovery/offset flags on settlement; overpayment ledger events (§14) |
| O19 | Balance-billing prohibition with carve-out (may bill member only for non-covered services after written consent) | SHA GCC 12.15–12.16 | Member-liability computation must distinguish "member payable" vs "provider write-off — billing member prohibited" (§6.4) |
| O20 | The Butali file is an employer-direct contract (Butali Sugar Mills Ltd), not an insurer | `Butali rates.md` | Payer model must cover employers directly (`PayerType.EMPLOYER_SELF_FUNDED` EXISTS) |
| O21 | Masters carry the provider's canonical item codes (`SER001 NHIF Dialysis Relif`, category, OP/IP/OT class) — contract letters use free-text names that must map to them | Masters family | Service-mapping layer (§6.3) between contract tariff descriptions and the service master; the Masters files seed that master |
| O22 | Signature/approval evidence is inconsistent (some signed both parties, some provider-only, OCR-illegible signatories) | Jubilee capitation (unsigned page 2), Madison dental | `signedDate`, `signatories[]`, and `executionStatus` metadata; unsigned → cannot ACTIVATE without override (§13-V2) |

### 2.5 Missing information required for automation (must be captured at digitisation time)

For most family-A/B letters the following are absent and MUST be prompted for during import: (a) which payer schemes/plans the rates apply to (letters name the insurer only); (b) claim submission window (only SHA and Britam state one); (c) what happens to unlisted services (only the existing `UnlistedServiceRule` default covers this); (d) whether rates include VAT/levies (SHA says "inclusive of taxes"; commercial letters are silent); (e) currency (implied KES everywhere — never printed as ISO code); (f) the governing parent SLA; (g) branch applicability when the letter is network-wide but the signing entity is one branch (Britam signed by Bungoma entity while schedule reads network-wide); (h) pre-auth validity periods; (i) documentation checklists per service (Britam names F20 + outpatient claim form; others silent). §12 makes each of these a required review-step field with a default + provenance note.


---

## 3. Proposed Digital Contract Concept

### 3.1 Definition

A **digital contract** is the structured, versioned, approval-gated, machine-readable representation of a provider rate agreement. It is composed of:

1. **Metadata** — identity, type, parties, dates, status, ownership (§5.1).
2. **Applicability scope** — which payer(s), scheme(s)/groups, plans/packages, benefit types, networks, provider branches, and member populations it governs (§5.4).
3. **Tariff schedule** — priced service lines (§5.6).
4. **Pricing rules** — typed rules (fixed, discount, per-diem, case-rate, package, capitation, average-cost, net-of-external...) (§5.7).
5. **Packages/bundles** — episode-priced procedure sets with inclusions, exclusions, complication rules (§5.8).
6. **Exclusion rules** at every level (§5.9).
7. **Pre-authorisation rules** (§5.10) and **documentation rules** (§5.11).
8. **Operational terms** — submission window, payment terms, discounts for early settlement, reconciliation cadence, balance-billing policy.
9. **Override policy** — which deviations are permitted and by whom (§5.12).
10. **Version history + approval trail + audit chain** (§4.4, §5.14).

### 3.2 Source document vs operational contract

- The uploaded markdown/PDF is stored via the existing `Document` model and linked from `ProviderContract.documentUrl` (EXISTS) plus a NEW `ContractSourceDocument` join allowing multiple sources (main agreement + addenda + rate letters).
- The source is **evidence**; the structured contract is **the executable**. Claims never parse the document at run time.
- Every structured field carries provenance: `sourceDocumentId + sourcePage/anchor + extractionConfidence + confirmedBy` (§12). An auditor can walk from any adjudication decision → rule → contract version → source page.
- Where the source and structure disagree, the structure that was human-confirmed and approved governs operationally; a `CONTRACT_SOURCE_MISMATCH` exception task is raised to correct whichever is wrong (§13).

### 3.3 Contract taxonomy (contractType)

Derived from the corpus:

| contractType | Description | Corpus example |
|---|---|---|
| `MASTER_SERVICE_AGREEMENT` | Full legal agreement, usually rate-silent or schedule-carrying | Britam 2024; the unseen Madison/Old Mutual "Main Agreements" |
| `RATE_SCHEDULE` | Pricelist letter attached to an MSA | CIC, GA, Amanah, Parliamentary, Butali, KCB |
| `PACKAGE_AGREEMENT` | Surgical/maternity/dental package price sets | Jubilee SURGICAL, Old Mutual 2024, Madison 2023, CIC surgical, APA, Britam surgical |
| `CASE_RATE_AGREEMENT` | Fixed-fee-per-visit / FCM / capitation-style letters | Madison FCM, Jubilee capitation |
| `RECONCILIATION_AGREEMENT` | Average-cost / discount addenda settled by reconciliation | Old Mutual Average Cost & Discount |
| `ADDENDUM` | Amends a parent contract | Madison dental addendum |
| `GOVERNMENT_SCHEME_CONTRACT` | Statutory scheme contract | SHA contracts |

A single provider+payer pair typically holds an MSA plus several child schedules/addenda. The **contract family** (parent + children) is resolved together at adjudication (§6.1).

---

## 4. Contract Lifecycle Workflow

### 4.1 Contract creation

Two entry paths, one wizard (§11.3):

**Path A — from scratch:** user keys everything manually.
**Path B — from uploaded source (markdown/PDF):** extraction pipeline (§12) pre-fills the wizard; every extracted field requires confirmation.

Wizard steps (each step = a saved draft checkpoint; users can leave and resume):

1. **Upload source document(s)** (optional in Path A). Multiple files allowed (MSA + rate letter + addendum).
2. **Extract key terms** (Path B) — automatic; produces field candidates with confidence scores.
3. **Review extracted terms** — side-by-side source page vs candidate fields; confirm/correct each.
4. **Map provider** — resolve to provider master + branches; create alias if the contract names a variant (O1). If the signing entity is a single branch but the schedule reads network-wide (Britam case), user must explicitly pick branch scope; default = signing branch only, with warning.
5. **Map payer** — resolve to `Client`; addenda must link `parentContractId`.
6. **Define applicability** — schemes/groups, plans/packages, benefit types, networks, member categories, or "all members of payer" (§5.4).
7. **Map service categories** — normalise raw category labels to canonical `ServiceCategory` (O11).
8. **Capture rates** — tariff table editor (§11.4): manual entry, CSV/XLSX bulk upload, or extraction import. `rateMissing` lines allowed here.
9. **Define rules** — pricing rules, packages, pre-auth rules, documentation rules, exclusions, submission window, payment terms (rule builder §11.5).
10. **Validate completeness** — run §13 validation suite; blocking errors listed with jump-links.
11. **Send for approval** — snapshots the draft into an immutable proposed version; routes through the EXISTING ApprovalMatrix engine.
12. **Activate** — on approval + effective date reached (§4.3).

### 4.2 Contract review and approval — status machine

`ProviderContractStatus` is EXTENDED from {DRAFT, ACTIVE, SUSPENDED, EXPIRED, TERMINATED} to:

| Status | Allowed actions | Claims impact |
|---|---|---|
| `DRAFT` | Edit everything; delete; submit for review | Invisible to claims engine |
| `UNDER_REVIEW` | Reviewer comments; approve; reject-to-draft; request clarification | Invisible |
| `PENDING_CLARIFICATION` | Editor answers reviewer queries; resubmit | Invisible |
| `APPROVED` | Activate (manual or auto at effective date); withdraw-to-draft (before activation only) | Invisible until ACTIVE |
| `ACTIVE` | Amend (creates new version); suspend; terminate; attach addendum | **Engine evaluates claims against it** for service dates within effective window |
| `SUSPENDED` | Reinstate; terminate | New claims: route to manual queue `CONTRACT_SUSPENDED` (do NOT auto-reject — suspension is usually administrative, per Britam §8.2.3 warning→suspension→termination ladder). Claims with service date before suspension adjudicate normally |
| `EXPIRED` | Renew (new contract, supersedes); extend (amendment moving endDate) | Service date ≤ endDate: adjudicate normally. Service date > endDate: reason `CON-003` (§10) → reject or route per payer config |
| `TERMINATED` | None (read-only); create successor | Service date < terminationDate: adjudicate normally. Service date ≥ terminationDate: reject `CON-004`. SHA GCC 9.1.8 explicitly excludes "treatment after the termination of this Contract" |
| `SUPERSEDED` | Read-only | Only used for service dates within its historical window |
| `ARCHIVED` | Read-only; excluded from default lists | Historical reference only |

Approval rules: approval is maker-checker minimum (creator ≠ approver, enforced); financial-impact thresholds route through `ApprovalMatrix` (e.g. contracts with projected annual spend > X require a second approver — finance). Reviewer sees the §13 validation report and a diff against the currently active version (if amendment).

### 4.3 Contract activation

- **Effective window:** `startDate`/`endDate` (EXISTS). Engine matches on **service date** (admission date for inpatient episodes — §6.1) within window.
- **Approval precondition:** transition to ACTIVE only from APPROVED. No unapproved rates can ever price a claim (§13-V5).
- **Future-dated contracts:** APPROVED contracts auto-activate at `startDate` (BullMQ scheduled job — same pattern as existing lifecycle jobs).
- **Backdating:** allowed (corpus proves it: Britam effective 11/03/2024 in a contract signed later; SHA Meru start 24 Oct 2024). Backdating past a configurable horizon (default 90 days) requires override `CONTRACT_BACKDATE` (§9). On activation of a backdated contract, the system generates a **re-adjudication impact report**: claims with service dates in the window that were adjudicated without it (or against a different contract). Re-pricing those claims is NEVER automatic — each is a proposed adjustment requiring claims-supervisor approval.
- **Retroactive changes:** same mechanism as backdating; SHA/Britam both prohibit retrospective payment-term changes against the provider without consent (Britam 6.6 "shall in no case apply retrospectively") — the system records `retroApplication: PROSPECTIVE_ONLY | RETRO_WITH_CONSENT` per amendment and enforces it in re-adjudication proposals.
- **Claims received before activation** (contract not yet in system but service date in window): they will have routed to `NO_CONTRACT` manual queue; on activation the queue re-runs those claims automatically (queue re-sweep job).
- **`reviewDueDate`:** distinct from endDate (O4). At reviewDueDate the contract stays ACTIVE; a renewal/renegotiation task is opened and surfaced on the expiring-contracts report (§15).

### 4.4 Amendment and versioning

Mechanism: **immutable version snapshots** (NEW `ContractVersion`) over the EXISTING supersession chain.

- Any change to an ACTIVE contract's operative content (rates, rules, scope, dates) creates version n+1 in DRAFT, leaving version n live until n+1 is approved+effective. Metadata-only edits (contact person, notes) are logged but do not version.
- Each version carries `versionNumber`, `effectiveFrom`, `effectiveTo` (set when superseded), full snapshot of tariff/rule state (implementation: effective-dated child rows keyed by version id — matches the never-delete convention already used by `ProviderTariff.isActive` + effective dates).
- **Which version prices a claim: the version effective on the SERVICE DATE.** Submission date is irrelevant to pricing (E1 in §17). This is the single most important versioning rule.
- Amendment classes and their handling:

| Change | Handling |
|---|---|
| Minor edit (typo in description, notes) | Same version, audit-logged |
| Rate change (Jubilee 2,800→3,600 case) | New version; old rate row `effectiveTo` = new `effectiveFrom` − 1 day |
| Service category / tariff-line additions | New version (additive) |
| Provider branch addition | New version; applicability diff shown |
| Payer/scheme/plan addition | New version |
| Effective-date change | New version + backdating rules above |
| Expiry extension | New version (endDate move); trivial-diff fast-track approval |
| Renewal | New CONTRACT (not version), linked via existing `supersededById` chain; wizard pre-fills from predecessor |
| Replacement | New contract; predecessor → SUPERSEDED at cutover date |
| Addendum arriving (Madison dental case) | Child contract of type ADDENDUM linked by `parentContractId`; at adjudication the family is merged with addendum precedence (§7) |

- **Version comparison:** any two versions diffable — field-level for metadata/rules, row-level for tariffs (added/removed/changed with old→new rate). Shown at approval and in history view (§11.7).

### 4.5 Suspension and termination

- Suspension (fraud investigation, compliance breach — Britam warning→suspension ladder, SHA GCC 16.2): claims with service date during suspension → manual queue with reason `CON-005 Provider contract suspended`; configurable per payer whether to hard-reject instead. Pre-auths in flight are frozen, not cancelled.
- Termination: hard boundary at terminationDate. In-flight admissions spanning the boundary (E: admitted before, discharged after) → the admission-date rule governs: episode priced under the contract active at admission (mirrors SHA episode logic), flagged for medical review if stay extends >N days past termination.
- Expiry: soft boundary; claims for service dates within the window remain payable subject to the submission window; the "contract expired but claims still arriving" case (§17-E5) is normal, not an error.


---

## 5. Detailed Data Model

Conventions (all EXIST platform-wide and apply to every NEW entity): multi-tenant `tenantId`, cuid ids, never-delete (deactivate + effective dating), `createdAt/updatedAt`, sensitive mutations to the audit chain, money as `Decimal @db.Decimal(14,2)`, contract-level `currency` (ISO 4217; corpus = KES).

### 5.1 Contract — `ProviderContract` (EXTEND)

Purpose: anchor record for one agreement (or addendum/schedule) between provider scope and payer scope.

| Field | Type | Req | Status | Notes / validation |
|---|---|---|---|---|
| id, tenantId, contractNumber, title | — | ✔ | EXISTS | `contractNumber` unique per tenant (`PC-2026-001`) |
| contractType | enum (§3.3) | ✔ | NEW | |
| providerId | FK Provider | ✔ | EXISTS | Legal signing entity |
| branchScope | enum ALL_BRANCHES / LISTED | ✔ | NEW | LISTED requires ≥1 `ContractBranch` row (O10, Britam case) |
| payerId (clientId) | FK Client | ✔* | NEW | *or ≥1 `ContractApplicability` row (§13-V1). SHA = Client of NEW PayerType `GOVERNMENT_SCHEME` |
| parentContractId | FK self | ○ | NEW | For ADDENDUM / RATE_SCHEDULE under an MSA; `parentDigitised` boolean warns when parent absent (O6) |
| externalContractRef | string | ○ | NEW | e.g. SHA `CN-73009` |
| status | enum §4.2 | ✔ | EXTEND | Add UNDER_REVIEW, PENDING_CLARIFICATION, APPROVED, SUPERSEDED, ARCHIVED |
| startDate, endDate | date | ✔ | EXISTS | endDate ≥ startDate (§13-V4) |
| reviewDueDate | date | ○ | NEW | O4 "subject to review" |
| signedDate, documentUrl, notes, autoRenew | — | ○ | EXISTS | |
| executionStatus | enum FULLY_EXECUTED / PROVIDER_ONLY / UNSIGNED | ✔ | NEW | O22; UNSIGNED blocks activation without override |
| signatories | Json | ○ | NEW | [{party, name, designation, date}] |
| currency | string | ✔ | NEW | default from Client.currency |
| country, region | string | ○ | NEW | |
| paymentTermDays, creditLimit, invoiceDiscountPct | — | ○ | EXISTS | Britam 30d; Jubilee 10 working days → store days + `paymentTermType: CALENDAR/BUSINESS` (NEW) |
| earlySettlementDiscountPct / earlySettlementWindowDays | Decimal / Int | ○ | NEW | Old Mutual 2% within 30 days (P7) — consumed by settlement, not adjudication |
| submissionWindowDays / submissionWindowBasis | Int / enum SERVICE_DATE, DISCHARGE_DATE, INVOICE_DATE, MONTHLY_BATCH | ○ | NEW | SHA: 7 days from service/discharge/invoice (GCC 12.5); consequence = reason `SUB-001` |
| balanceBillingPolicy | enum PROHIBITED / ALLOWED_NONCOVERED_WITH_CONSENT / ALLOWED | ○ | NEW | SHA GCC 12.15/12.16 (O19) |
| taxInclusive | boolean | ○ | NEW | SHA GCC 13 inclusive; null = unknown → flag |
| reconciliationCadence | enum NONE/MONTHLY/QUARTERLY/BIANNUAL | ○ | NEW | Old Mutual quarterly recovery; Jubilee monthly sign-off |
| unlistedServiceRule, unlistedDiscountPct | — | ✔ | EXISTS | |
| supersededById / predecessor | — | ○ | EXISTS | renewal chain |
| currentVersionId | FK ContractVersion | ○ | NEW | |
| contractOwnerId (User), createdById, approvedById, activatedById + timestamps | — | ✔ | NEW/EXTEND | maker ≠ checker enforced |

Claims relevance: §6.1 matching, §6.2 validity, submission-window and payment terms feed intake and settlement.

### 5.2 Provider & branches — `Provider` (EXTEND) + NEW `ProviderBranch`, `ProviderAlias`

`Provider` gains: `legalName` (distinct from trading `name`), `registrationNumber`, `licenceNumber`, `licenceExpiry`, `taxPin` (KRA PIN in Britam schedule), `facilityLevel` (SHA "LEVEL 4"), `bankDetailsRef` (link into existing settlement data). Keep `type`, `tier`, `contractStatus` fields for backward compatibility, but contract truth moves to `ProviderContract`.

`ProviderBranch` (NEW): id, providerId, name (Bungoma, Migori, Eldoret, Meru, Kikuyu, Mlolongo), code, address, county, geo, licenceNumber, isActive. Claims: `Claim` gains optional `providerBranchId` (EXTEND) — branch-level rates (O10) and branch-scoped contracts (Britam, SHA per-branch) are unmatchable without it.

`ProviderAlias` (NEW): providerId, aliasName, source. Resolves O1 name variants during extraction and EDI intake.

### 5.3 Payer / Client / Scheme — `Client` (EXTEND)

EXISTS with hierarchy + PayerType {INSURER, HMO, EMPLOYER_SELF_FUNDED}. EXTEND: add `GOVERNMENT_SCHEME` (SHA) and `TPA_CLIENT`/`CLAIMS_MANAGER` (Amanah Claims Management is a claims manager, not a risk carrier — the payer behind it may differ; `parentClientId` covers the chain). Scheme/plan level = existing `Group` (scheme) and `Package/PackageVersion` (plan) — no new entity.

### 5.4 Contract applicability — NEW `ContractApplicability`

Purpose: which populations the contract governs. One row per scope grant; evaluated as: specific INCLUDE rows win over payer-wide default; EXCLUDE rows always win (§7).

| Field | Type | Notes |
|---|---|---|
| contractId, versionId | FK | |
| clientId | FK Client | payer |
| groupId | FK Group ○ | scheme/employer group; null = all payer groups |
| packageId / packageVersionId | FK ○ | plan; null = all plans |
| benefitCategory | enum ○ | restrict to e.g. DENTAL (KCB/Madison dental letters), OPTICAL |
| networkTier | ProviderTier ○ | reuse existing tier as "network" |
| memberCategory | enum ○ | e.g. SHA "registered, fully paid-up and officially declared" → eligibility flags |
| inclusionType | INCLUDE/EXCLUDE | |
| effectiveFrom/To, isActive | | |

Claims relevance: §6.1 step 3; failure → `CON-002`/`ELG-*` reasons.

### 5.5 Service category — NEW `ServiceCategory` + `ServiceCategoryAlias`

Canonical, tenant-level taxonomy (seeded from §2.2 list + Masters `categoryname`/`Final_Category`): code, name, parentId (hierarchy: RADIOLOGY > CT_SCAN), patientClass OP/IP/OT (mirrors Masters), isActive. `ServiceCategoryAlias` maps raw corpus labels ("Mo Minor Procedure", "Mo Pocedures", "IP SERVICES") → canonical category with source provenance (O11). Existing `ClaimLineCategory` enum stays as the coarse claim-line class; `ClaimLine` gains optional `serviceCategoryId` (EXTEND) for fine mapping.

### 5.6 Tariff line — `ProviderTariff` (EXTEND)

The critical entity. Existing fields kept: providerId, contractId, clientId, cptCode, serviceName, agreedRate, currency, tariffType, requiresPreauth, maxQuantityPerVisit, effectiveFrom/To, isActive.

EXTEND with:

| Field | Type | Notes |
|---|---|---|
| versionId | FK ContractVersion | version-pinning |
| branchId | FK ProviderBranch ○ | O10; null = all branches in contract scope |
| serviceCategoryId | FK ServiceCategory | |
| providerServiceCode | string ○ | provider master code (`SER015 BED CHARGE`) — the join key to the provider's HMS bills (O21) |
| providerDescription / standardDescription | string | raw contract text preserved + normalised name |
| codingSystem | enum CPT/ICD10/LOCAL/SHA_PACKAGE ○ | |
| rateType | enum → §5.7 rule kinds | default FIXED |
| discountPct / markupPct | Decimal ○ | for DISCOUNT/MARKUP rate types |
| maxPayableAmount / minPayableAmount | Decimal ○ | caps independent of rate |
| unitOfMeasure | enum PER_ITEM, PER_HOUR (Oxygen Therapy Per Hour), PER_DAY (ward fees), PER_VISIT, PER_SESSION (dialysis, brachytherapy), PER_EPISODE, PER_KM_BAND (ambulance bands) | E20 unit mismatch detection |
| quantityLimit / frequencyLimit + frequencyPeriod (DAY/VISIT/ADMISSION/YEAR) | | SHA 180 days/household/year; "1 Visit Per Day/Per Consultant" ICU review |
| genderRestriction / ageMin / ageMax | ○ | none observed in corpus but required for maternity/paeds tariffs |
| diagnosisRestriction | Json ○ | ICD list/pattern — SHA MRI/CT indication limits (O: infective, oncology, neuro, degenerative, obstetric, cardiac/CVA, trauma) |
| externalRebateScheme / externalRebateAmount | string/Decimal ○ | P3/P12 "Net of NHIF", `SHA Rebate` columns — stored decomposed: payable = agreedRate; gross = agreedRate + rebate |
| requiresReferral | boolean | SHA imaging self-referral ban |
| preauthRuleId / documentationRuleIds | FK ○ | overrides contract-level rules per line |
| rateMissing | boolean | O2/O13 — line exists, price unreadable; blocks activation unless resolved (§13-V6) |
| sourceRef | Json ○ | {documentId, page, rawText, confidence} |
| notes | string ○ | |

Validation: agreedRate > 0 unless rateMissing or rateType EXTERNAL/CAPITATION; discount/markup require pct; caps: min ≤ max; effective ranges must not overlap for identical (contract, branch, code/description, UoM) — §13-V11.

### 5.7 Pricing rule — NEW `PricingRule`

Typed rules attached at contract, category, or line scope. `ruleKind` values (superset of corpus P1–P12):

| ruleKind | Semantics | Engine behaviour (§6.4) |
|---|---|---|
| `FIXED` | pay contracted amount | payable = min(billed, rate) by default; `payBasis` field can force AS_CONTRACTED (case rates pay 3,900 even if billed 2,500 — Madison FCM explicitly pays fixed "regardless of the actual value of the invoice") |
| `DISCOUNT_OFF_BILLED` | billed × (1 − pct) | existing unlisted rule generalised |
| `MARKUP_OVER_COST` | cost basis × (1 + pct) | pharmacy/consumables cost-plus |
| `MAX_CAP` / `MIN_FLOOR` | ceiling/floor combinators | applied after base rule |
| `PER_DIEM` | rate × days | ward/ICU daily; LOS from admission/discharge |
| `PER_VISIT_CASE_RATE` | fixed per valid visit with carve-out list | Madison FCM 3,900; Jubilee 3,600; carve-outs price separately + preauth |
| `PER_ADMISSION` / `PER_PROCEDURE` / `PER_CONSULTATION` / `PER_ITEM` / `PER_SESSION` | unit scope variants | |
| `PACKAGE` | episode price via §5.8 | overrides line items |
| `CAPITATION` | per-member-per-period; claims record encounter at 0 payable against capitation pool | encounter tagging + pool ledger (Phase 5 for pool settlement) |
| `NET_OF_EXTERNAL` | payable = rate; gross = rate + external scheme rebate | P3/P12; if rebate table missing → route `RATE-AMBIG` |
| `EXTERNAL_TARIFF_REF` | rate resolved from external tariff table (SHA 0.00→NCI; "NHIF rates apply") | NEW `ExternalTariffTable` keyed (scheme, code, period); unresolved → manual `RATE-EXT` |
| `AVERAGE_COST_POOL` | not line-priced; tag claim into pool; reconcile per cadence | Old Mutual P5, Britam P6 — lines price at billed (or schedule), claim tagged `avgCostPoolId`; quarterly reconciliation report computes recovery (§15) |
| `LOWER_OF` / `HIGHER_OF` | explicit combinators | "lower of claimed or contracted" default made explicit and overridable |

Fields: id, contractId, versionId, scope (CONTRACT/CATEGORY/LINE), serviceCategoryId ○, tariffLineId ○, ruleKind, params Json (typed per kind, zod-validated), priority int, effectiveFrom/To, isActive. Plan/scheme/branch variations are expressed by attaching applicability (§5.4) to the rule row, not by cloning contracts.

### 5.8 Package / bundle — NEW `ContractPackage` (+ `PackageComponent`)

Purpose: episode-priced procedure sets (family B). Distinct from the benefits `Package` model (plan design) — naming: **`ContractPackage`** to avoid collision; UI label "Surgical/Case Package".

| Field | Notes |
|---|---|
| contractId, versionId, name, code | e.g. "Caesarean Section Package" |
| packagePrice, currency | Jubilee CS 120,000 |
| netOfExternalScheme / externalRebateAmount | P3 |
| triggerType | PROCEDURE_CODE / DIAGNOSIS_CODE / SERVICE_DESCRIPTION match |
| triggerCodes Json | CPT/ICD/local codes or normalised names |
| includedComponents (child rows) | typed inclusions with qty caps: CIC package: theatre time, meds, consumables, doctor+anaesthetist fees, specialist reviews *for duration of stay*, ward meds + nursing, discharge meds, all labs + crossmatch, admission fee, ECG, nutrition counselling, **orthopaedic: two X-rays** (qty cap = 2) |
| excludedComponents | ICU/HDU/NICU complications, CT/MRI, non-primary-surgery specialist reviews, unrelated treatment, ambulance (CIC list) |
| losAssumptionDays / losCapDays | length-of-stay assumptions |
| complicationRule | enum EXCLUDED_BILL_SEPARATELY (CIC: complications → ICU excluded = revert to FFS/per-diem for those components) / INCLUDED / ESCALATE |
| unbundlingAllowed | boolean, default false — package overrides itemised bill (E7) |
| packageOverridesLineItems | boolean, default true |
| maternityVariants | model as separate packages (Jubilee: normal delivery 25,000; +obstetrician & paediatrician 40,000; private-doctor variant 25,000 excluding doctor charges) |

Claims relevance: §6.3 trigger detection; §6.4 pricing; §8.4 claim-level cap. `ProviderDiagnosisTariff` (EXISTS) is retained for simple diagnosis-keyed per-diem/bundles and migrates onto `ContractPackage` in Phase 3.

### 5.9 Exclusions — `ProviderContractExclusion` (EXTEND) → generalised `ContractExclusion`

Add: level (CONTRACT/CATEGORY/TARIFF_LINE/DIAGNOSIS/PLAN/MEMBER_CATEGORY/DATE_RANGE), serviceCategoryId ○, icdCodes Json ○, packageId(plan) ○, dateFrom/dateTo ○, appliesToBranchId ○, reasonText, sourceRef. Corpus seeds: FCM carve-outs (MRI, dental/optical, external scripts, private vaccines, dialysis, cancer — Madison; MRI/CT, ECHO, dialysis, optical/dental, wellness incl. COVID PCR — Jubilee; CT/MRI, ultrasound, dental, dialysis, day-case — Old Mutual average-cost exclusions); SHA general exclusions (unauthorised referrals, non-package services, over-annual-limit costs, post-termination treatment, interest on delays). NOTE: FCM carve-outs are "excluded from the case rate, priced separately WITH pre-auth" — model as exclusions from the PER_VISIT_CASE_RATE rule scope + separate tariff/preauth entries, not as coverage exclusions. Member-level and policy exclusions stay in the benefits module (DrugExclusion, BenefitConfig) — the engine merges both (§6.5).

### 5.10 Pre-authorisation rule — NEW `PreauthRule`

| Field | Notes |
|---|---|
| contractId, versionId, scope + refs | contract-wide, category, line, or package |
| triggerType | SERVICE_LIST / AMOUNT_THRESHOLD / ADMISSION / LOS_BEYOND / ALWAYS |
| thresholdAmount | Madison addendum: LOU for services > Kshs 10,000 |
| serviceRefs Json | FCM carve-out lists |
| admissionRequired | Britam F20 within 24h of hospitalisation |
| emergencyExempt | boolean — SHA GCC 11.1 (O17) |
| retrospectiveAllowed / retrospectiveWindowHours | emergency retro approval window (Britam 24h F20) |
| approvalSlaHours | SHA 72h — payer-side SLA surfaced to preauth module |
| validityDays | maps to existing `PreAuthorization.validUntil` |
| requiredDocumentIds | link §5.11 |
| consequenceIfMissing | enum REJECT (`AUTH-001`) / ROUTE_MANUAL / PAY_WITH_PENALTY |

Integrates with EXISTING PreAuthorization module: at pre-auth intake, rules are evaluated to auto-populate requirements; at claims, §6.6 checks approval linkage.

### 5.11 Documentation requirement — NEW `DocumentationRule`

contractId/version/scope refs; documentType enum (INVOICE, ITEMISED_BILL, CLAIM_FORM, PRESCRIPTION, LAB_REQUEST, LAB_RESULT, DOCTOR_NOTES, DISCHARGE_SUMMARY, CARE_PLAN, MEDICAL_REPORT, REFERRAL_LETTER, PREAUTH_APPROVAL/LOU, THEATRE_NOTES, DELIVERY_NOTES, IMAGING_REPORT, RADIOLOGY_REPORT_STRUCTURED, OTHER); mandatory boolean; appliesWhen Json (e.g. only IP, only amount > X); consequenceIfMissing (REJECT `DOC-001` / ROUTE / PEND_PROVIDER). Corpus seeds: SHA claims must enclose "discharge summary, the Care Plan, medical report, invoice, and referral documents where applicable"; SHA radiology report content requirements (clinical indication, technique, findings, impression); Britam "system generated" invoice rule (→ documentType INVOICE with attribute systemGenerated=true; handwritten → reject `DOC-004`).

### 5.12 Manual override rule — reuse `OverrideRecord` (EXTEND enum)

The override framework EXISTS (maker-checker, approver-role map, SLA, audit chain, patterns screen). EXTEND `OverrideType` with contract-claims types (§9.1) and add fields on OverrideRecord: `maxAmount` guard from `OverrideControl` (NEW config table §9.3), `contractId/ruleRef` affected, `reusable` boolean (one-off vs creates temporary rule), `createsContractReviewTask` boolean.

### 5.13 Rejection / shortfall reason — NEW `AdjudicationReasonCode`

Catalog table (not enum — payers/tenants extend): code (§10 taxonomy), category, internalDescription, providerDescription, memberDescription (all via terminology engine), contractRuleRefType, defaultSeverity (REJECT/SHORTFALL/PEND/INFO), remedy, resubmissionAllowed, overrideAllowed + allowedOverrideTypes, requiredDocsForReconsideration, escalationRoute, isActive. `ClaimLine` EXTENDS: `reasonCodeId`, `contractId`, `contractVersionId`, `matchedRuleType` + `matchedRuleId`, `payableSource` (which rule priced it) — this is the per-line decision provenance. `Claim.declineReasonCode` (string, EXISTS) migrates to FK.

### 5.14 Audit trail — EXISTS (`audit-chain.service.ts`, `AdjudicationLog`, `ActivityLog`)

Contract events to log (all through the immutable chain): create, field edits (old→new), source doc upload, extraction run + confidences, each field confirmation, submit/approve/reject/clarify with comments, activate, suspend, reinstate, terminate, version create/supersede, tariff row add/change/deactivate (old→new rate), rule add/change, exclusion changes, applicability changes, exports/views of rate schedules (commercially sensitive — §19), every engine evaluation outcome (claim id, contract id, version, per-line rule refs — via AdjudicationLog EXTEND with `contractVersionId` and machine-readable `ruleTrace` Json), every override (§9.4), every re-adjudication proposal and decision.


---

## 6. Contract Rule Engine

Implementation home: EXTEND `ProviderContractsService` into a staged pipeline (new module `src/server/services/contract-engine/` with one file per stage; the existing `resolveClaimLineRates()` becomes stages 3–4). Pure/deterministic: same inputs ⇒ same outputs; read-only against the DB; emits a `RuleTrace` (Json) consumed by auto-adjudication, the claims UI, and the audit log. Every stage returns `{outcome, reasonCode?, ruleRef?, trace}`.

**Evaluation order (normative):**

```
1. CONTRACT MATCHING        → candidate contract family + version
2. CONTRACT VALIDITY        → status/dates/scope gates
3. SERVICE MAPPING          → line → tariff | package | rule | unlisted
4. PRICING                  → payable/shortfall per line
5. COVERAGE & EXCLUSIONS    → contract + benefits-module merge
6. PRE-AUTHORISATION        → rule check + approval linkage
7. DOCUMENTATION            → checklist vs attached docs
8. CLAIM-LEVEL RULES        → packages, caps, episode, submission window
9. DECISION SYNTHESIS       → line + claim classification, reason codes
```

Ordering rationale: exclusions (5) run AFTER pricing (4) so the trace shows what *would* have been paid (dispute value); pre-auth/docs (6–7) after mapping because their rules are keyed to the mapped service; submission window sits in 8 because it is claim-level.

### 6.1 Contract matching

Inputs: providerId (+branchId), memberId → (clientId, groupId, packageVersionId, benefitCategory), serviceType, dateOfService, admissionDate, submissionDate.

1. **Pricing date** = admissionDate for IP episodes else dateOfService (E1, E12).
2. Candidate contracts: ACTIVE (or EXPIRED/TERMINATED/SUSPENDED with window covering pricing date — status handling per §4.2 table), provider matches (branch ∈ scope), pricing date ∈ [startDate, endDate].
3. Applicability filter (§5.4): payer, scheme, plan, benefit type, member category.
4. Family assembly: matched contract + parent + sibling addenda effective on pricing date, merged with §7 precedence.
5. Version selection: version effective on pricing date.
6. Outcomes: exactly one family → proceed; none → `CON-001` (route `NO_CONTRACT` queue); multiple non-hierarchical matches → most-specific wins (§7); tie → `CON-010` ambiguity queue.

### 6.2 Contract validity checks

Sequential gates, each with a reason code: exists (`CON-001`), approved+active-status rules (`CON-005` suspended, `CON-006` draft/unapproved — should be unreachable, defensive), pricing date within window (`CON-003` expired / `CON-007` not yet effective), payer/scheme/plan applicable (`CON-002`), branch covered (`CON-008`), service category in contract scope (`SVC-001` if category-scoped contract, e.g. dental-only letters).

### 6.3 Service mapping

Per claim line, in order:
1. **Code match**: cptCode / providerServiceCode against tariff lines (branch-specific row beats network row).
2. **Package trigger**: procedure/diagnosis codes against `ContractPackage.triggerCodes` — if triggered, mark episode candidate (resolved at stage 8).
3. **Description match**: normalised string match (exact → alias table → fuzzy ≥ threshold 0.92) against `standardDescription`/`providerDescription`; fuzzy hits are auto-usable only if a prior human mapping confirmed the pair (mapping memory table `ServiceMappingMemory` NEW — learned mappings, maker-confirmed, reused; §9 override "Map service to existing tariff" writes into it).
4. **Category rule**: category-scoped PricingRule (e.g. DISCOUNT_OFF_BILLED on PHARMACY).
5. **Unlisted**: contract's `UnlistedServiceRule` (EXISTS): PAY_AS_BILLED / DISCOUNT_OFF_BILLED / REFER_FOR_REVIEW (`SVC-002` queue) / REJECT (`SVC-003`).
Multiple tariff hits: TARIFF_PRIORITY (EXISTS: NEGOTIATED > GAZETTED > PUBLISHED), then branch-specific > network, then latest effectiveFrom; still tied → `PRC-004` rate-ambiguity queue (O12).

### 6.4 Pricing evaluation

Per line, compute and persist ALL of: claimedAmount (qty × unitCost), contractedAmount, payableAmount, shortfallAmount (claimed − payable when provider absorbs), disallowedAmount (components rejected outright), memberLiability (only where balance-billing policy permits — O19; under SHA-style PROHIBITED policy the delta is providerWriteOff, never member), payerLiability, providerWriteOff, externalRebateAmount (NET_OF_EXTERNAL), taxAmount (if taxInclusive=false and tax config present; corpus default: inclusive/silent → 0 and flag when VAT lines appear — E17).

Normative handling:

| Case | Behaviour |
|---|---|
| Claimed < contracted | payBasis LOWER_OF (default): pay claimed. payBasis AS_CONTRACTED (case rates/packages, e.g. FCM 3,900): pay contracted; trace notes over/under |
| Claimed > contracted | pay contracted; shortfall = difference; reason `PRC-001` (shortfall, not rejection) |
| Missing rate (`rateMissing` or unlisted-REFER) | route `PRC-002`; no payable computed |
| Multiple candidate rates | §6.3 tie-break; unresolved → `PRC-004` |
| Expired rate row (line effectiveTo < pricing date, no successor) | fall to unlisted rule + `PRC-003` trace note |
| Package vs itemised conflict | stage 8: package wins when packageOverridesLineItems ∧ ¬unbundlingAllowed (E7); included components zero-priced with `PRC-005 Package rate applies`; excluded components price independently |
| Discount + cap conflict | apply base rule → then MIN/MAX combinators; ordering fixed: base → discount/markup → floor → ceiling; trace records each step |
| Quantity over `maxQuantityPerVisit`/quantityLimit | payable qty = cap; excess disallowed `LIM-001` |
| Frequency limit (per day/admission/year) | count prior approved usage (BenefitUsage + claims index); breach → `LIM-002` (e.g. ICU consultation "1 Visit Per Day/Per Consultant") |
| UoM mismatch (billed PER_ITEM vs contracted PER_DAY) | route `PRC-006` (E20) |
| Rounding | round half-up to 2dp at each money step; final payable to currency minor unit |
| Currency | line/claim currency must equal contract currency else `PRC-007` route (E18); FX via existing FxRate only for reporting, never silent settlement conversion |
| AVERAGE_COST_POOL contracts | lines price per schedule/billed; claim tagged to pool; NO claim-level recovery — reconciliation report (§15) computes quarterly recovery per Old Mutual 1.3 |

### 6.5 Coverage & exclusion evaluation

Merge, in order: contract exclusions (§5.9, all levels incl. diagnosis and date-based) → plan/benefit exclusions (EXISTING BenefitConfig / DrugExclusion / cost-share) → policy-level rules outside contract (waiting periods, member status — EXISTING eligibility). Contract exclusion → `EXC-001..n` with the source level in the trace. A service excluded by contract but covered by plan = provider-payment problem (`EXC-001`, member may self-pay per balanceBillingPolicy); covered by contract but excluded by plan = benefits rejection (existing decline codes) — the trace must say WHICH side rejected (providers dispute these differently).

### 6.6 Pre-authorisation evaluation

Resolve applicable PreauthRules (line → category → package → contract). If required: approval exists and linked (`Claim.preauthId` EXISTS)? covers the service (procedure/code intersection)? amount sufficient (approvedAmount ≥ payable; else `AUTH-003` partial — pay up to approval, route remainder)? valid on service date (`validFrom/Until`; else `AUTH-002`)? emergency exception (`isEmergency` ∧ rule.emergencyExempt → pass with trace note + retrospective task per rule.retrospectiveAllowed — E6)? retrospective approval within window? Missing entirely → rule.consequenceIfMissing (`AUTH-001` reject / route / penalty).

### 6.7 Documentation evaluation

Resolve DocumentationRules; check attached `Document` rows by documentType. Missing mandatory → consequence (`DOC-001` reject / `DOC-002` pend-provider with checklist). Attribute rules (systemGenerated invoice) checked where metadata exists; else route to human with checklist item.

### 6.8 Final claim decision

Line classification: AUTO_APPROVED / APPROVED_WITH_ADJUSTMENT (shortfall) / DECLINED / PENDED(queue). Claim classification (derives from lines + claim-level checks, feeds EXISTING ClaimStatus): all approved → auto-approve path via `auto-adjudication.service.ts` (contract gates become named gates in its result — EXTEND gate list with CONTRACT_MATCH, PRICING_COMPLETE, PREAUTH_OK, DOCS_OK, WITHIN_SUBMISSION_WINDOW); mix → PARTIALLY_APPROVED; all declined → DECLINED; any pend → UNDER_REVIEW with queue routing (§8.5). Pending sub-states (provider clarification, member clarification, payer approval, medical review, contract clarification, escalated) = queue categories + `Claim.assignedQueue` (NEW field), not new statuses.

---

## 7. Rule Precedence And Conflict Resolution

**Precedence hierarchy (highest wins):**

1. **Approved manual override** on the specific claim/line (§9) — never silently outranked; expires with the claim.
2. **Addendum / child contract** over parent (Madison addendum: "Except as modified... remain in effect"; SHA order: SCC > GCC > Schedule 1 — same principle).
3. **More specific applicability** over less: line > package > category > contract; branch-specific > network-wide; plan-specific > scheme-wide > payer-wide (mirrors existing per-client tariff "wins at resolution" comment in schema).
4. **Later effective date** among equal-specificity rows of the same family (a re-priced rate letter supersedes the old rate from its effective date — Jubilee 2,800→3,600).
5. **TariffType priority** NEGOTIATED > GAZETTED > PUBLISHED (EXISTS).
6. **Stricter rule** as final deterministic tie-break for *control* rules (pre-auth required beats not-required; exclusion beats inclusion; lower cap beats higher) — money ties do NOT auto-pick: route `PRC-004`/`CON-010`.

Named conflicts:

| Conflict | Resolution |
|---|---|
| Contract-level rule vs tariff-line rule | line wins (rule 3) |
| Scheme rule vs provider rule | scheme-scoped applicability wins over payer-wide (rule 3); cross-domain conflicts (benefits vs contract) are not precedence — both must pass (§6.5) |
| Plan rule vs payer rule | plan wins (rule 3) |
| Package rate vs itemised bill | package wins unless unbundlingAllowed (§6.4, E7) |
| Discount rule vs fixed tariff | fixed line rate wins (rule 3); discount applies only where no line rate (category/unlisted scope) |
| Pre-auth rule vs emergency exception | emergency exempts when rule.emergencyExempt; else strict (rule 6) with retro pathway |
| Overridden rate vs contracted rate | override wins for that claim only (rule 1); reusable overrides create a temporary rule row that then competes normally |
| New vs old contract version | pricing-date selection (§6.1.5) — versions never conflict at run time |

**When rules genuinely conflict (same specificity, same dates, different money):** block auto-processing, route `CON-010`/`PRC-004` with both candidates in the trace, and raise a contract-review task — a human fixes the contract, the claim re-runs. Auto-selecting "strictest" for money is forbidden: silently underpaying providers creates disputes and silently overpaying creates leakage.

---

## 8. Claims Processing Workflow Against Digital Contracts

### 8.1 Claim intake (EXISTS — `intake.service.ts`, claim sources incl. HMS/EDI/batch/offline)

Contract-relevant additions at capture: `providerBranchId` (required when provider has branches — pick-list), submissionDate stamped (`receivedAt` EXISTS), invoice metadata (systemGenerated flag when derivable), documents typed on upload (documentType from §5.11 enum). Intake runs a **contract pre-check** (stages 1–2 only) and surfaces "no active contract for this provider/payer/date" to the capturer immediately — bad claims die cheap.

### 8.2 Contract lookup

Engine stages 1–2 (§6.1–6.2). Persist on claim: `contractId`, `contractVersionId`, `contractFamilyIds` (EXTEND Claim). Version pinned at first adjudication; re-adjudication re-pins explicitly and logs the change.

### 8.3 Claim-line adjudication

Stages 3–7 per line, independently; each line persists mapping ref, rule trace, amounts, reason codes (§5.13 fields). Lines never block each other — one unmapped line pends that line (and holds claim finalisation), the rest price.

### 8.4 Claim-level adjudication

Stage 8: package assembly (group lines into episode; apply ContractPackage; re-mark included components); per-visit / per-admission caps (case rates: one PER_VISIT_CASE_RATE payment per valid visit — duplicate same-day visits route to fraud-adjacent queue per Madison "repeat visit rates" watch); LOS caps vs per-diem days; annual limits (SHA 180 days — consumes BenefitUsage-style counter at household scope: NEW usage scope HOUSEHOLD); referral pathway present where `requiresReferral`; pre-auth approval amount across lines (approval covers episode total, not per line); submission window (`SUB-001` when receivedAt − basisDate > submissionWindowDays; consequence per contract: reject or route — SHA says Authority "will not be obligated" to pay unless waived → default route with override path `PAY_DESPITE_LATE_SUBMISSION`); one-claim-per-episode (SHA GCC: duplicate episode claims → `DUP-002` merge task).

### 8.5 Manual review queues

One queue framework (EXTEND existing claims queues UI `claims/queues`), categories with default owners + SLAs:

| Queue | Trigger | Default owner | SLA |
|---|---|---|---|
| NO_CONTRACT | CON-001 | Contract team | 48h |
| CONTRACT_EXPIRED / NOT_EFFECTIVE | CON-003/007 | Contract team | 48h |
| PROVIDER_NOT_CONTRACTED (payer/scheme) | CON-002 | Provider relations | 48h |
| CONTRACT_SUSPENDED | CON-005 | Provider relations + compliance | 24h |
| SERVICE_NOT_MAPPED | SVC-002 | Senior claims | 24h |
| RATE_MISSING | PRC-002 | Contract team | 48h |
| RATE_AMBIGUITY | PRC-004 / CON-010 | Contract team | 48h |
| CLAIMED_EXCEEDS_CONTRACT (high variance) | PRC-001 above variance threshold | Senior claims | 24h |
| MISSING_PREAUTH | AUTH-001 routed | Claims + care mgmt | 24h |
| MISSING_DOCS | DOC-002 | Claims (provider follow-up) | 72h |
| EXCLUSION_CONFLICT | EXC vs plan mismatch | Medical reviewer | 48h |
| PACKAGE_CONFLICT | E7 unbundling disputes | Senior claims | 48h |
| FWA_SUSPECT | fraud engine + claim-splitting/upcoding patterns (O16) | Fraud team | 24h |
| MEDICAL_REVIEW | clinical-necessity rules, LOS outliers | Medical reviewer | 72h |
| CONTRACT_AMENDMENT_REQUIRED | recurring unmapped/disputed rule | Contract manager | 5d |

Queue metadata: reason codes, rule trace, suggested actions (each queue defines its allowed overrides §9), bulk actions where safe (e.g. re-run after contract activation).

### 8.6 Output to claims officer (§11.6 screen)

For each claim: decision + per-line decisions; contract used (number, title, version, link); matched rule per line (human-readable: "Tariff line 'CT Scan Abdomen' KES 8,000, CIC Pricelist v2, effective 01-Feb-2025"); payable / shortfall / disallowed / member / write-off amounts with arithmetic trace; reason codes with provider-facing wording preview; available override options for THIS user's role (greyed otherwise, with required-role shown); required next action.

---

## 9. Manual Override And Exception Handling

Builds on EXISTING `override.service.ts` (maker-checker, role routing, SLA, audit chain, `/overrides` UI, patterns detection) and `ExceptionLog`. NEW: claims-contract override types, a config table for controls, and rule-engine integration (override outcome re-enters the engine as a rule-1 precedence input).

### 9.1 Override types (EXTEND `OverrideType` enum)

| Type | Effect |
|---|---|
| `PAY_MISSING_RATE` | set payable for unmapped/rate-missing line |
| `PAY_ABOVE_CONTRACT_RATE` | payable > contracted for a line |
| `PAY_DESPITE_EXPIRED_CONTRACT` | accept CON-003/004 claim |
| `PAY_DESPITE_MISSING_PREAUTH` | waive AUTH-001 |
| `PAY_DESPITE_MISSING_DOCS` | waive DOC-001/002 |
| `PAY_DESPITE_LATE_SUBMISSION` | waive SUB-001 (SHA waiver-in-writing analogue) |
| `APPLY_ALTERNATIVE_TARIFF` | price from a different line than mapped |
| `APPLY_PACKAGE_MANUALLY` | force package where trigger failed |
| `SPLIT_CLAIM_LINE` | split one line into components |
| `RECLASSIFY_SERVICE_CATEGORY` | remap category |
| `MAP_SERVICE_TO_TARIFF` | confirm mapping (writes ServiceMappingMemory — reusable by design) |
| `CREATE_TEMPORARY_RATE` | time-boxed rate row pending contract amendment; auto-creates CONTRACT_AMENDMENT_REQUIRED task |
| `ESCALATE_TO_CONTRACT_TEAM` / `ESCALATE_TO_PAYER` / `ESCALATE_TO_MEDICAL_REVIEW` | routing overrides |
| (EXISTING kept) `RATE_DEVIATION_EXCEED`, `CLAIM_EXCLUDED_DIAGNOSIS`, `FORCE_APPROVE_FRAUD_CLAIM`, `PRE_AUTH_OVER_BENEFIT_CAP`, ... | unchanged |

### 9.2 Override permissions (role → capability)

Roles map onto the EXISTING RBAC roles; add PROVIDER_RELATIONS_MANAGER and PAYER_APPROVER if absent.

| Role | May request | May approve |
|---|---|---|
| Claims processor | mapping/reclassify/split; escalations | — |
| Senior claims processor | + pay-despite-docs, late submission (≤ threshold) | mapping memory confirmations |
| Claims supervisor | all claim-scoped types | most claim-scoped ≤ financial threshold |
| Medical reviewer | medical-necessity overrides | MEDICAL_REVIEW queue outcomes |
| Contract manager | CREATE_TEMPORARY_RATE, alternative tariff | contract-scoped overrides |
| Provider relations manager | PAY_DESPITE_EXPIRED_CONTRACT | co-approver on provider-impacting types |
| Finance approver | — | second approval above financial threshold |
| Payer approver | — | types configured payer-consent-required |
| System administrator | none (config only) | never (segregation §19) |

### 9.3 Override controls — NEW `OverrideControl` config table

Per (tenant, overrideType): allowed y/n; requestor roles; approver roles (1 or 2 — dual approval when financial impact > `dualApprovalThreshold`); maxFinancialImpact (hard block above); reason code required (from a controlled OverrideReasonCode list, EXISTS); free-text justification min length; required document types; notifyProvider / notifyPayer booleans; updatesAutomation (only MAP_SERVICE_TO_TARIFF and CREATE_TEMPORARY_RATE may be reusable; all others one-off by construction); createsContractReviewTask. Defaults ship conservative: everything one-off, dual approval ≥ KES 100,000 impact, payer notification on PAY_ABOVE_CONTRACT_RATE and PAY_DESPITE_EXPIRED_CONTRACT.

### 9.4 Override audit trail (EXTEND existing OverrideRecord capture)

Log (immutable chain): original engine decision + full rule trace; original payable + reason codes; maker (id, role), reason code + justification; new decision + new payable; approver(s) + timestamps; supporting document refs; affected contractId/version/ruleRef; oneOff vs reusable; downstream artefacts created (temporary rate id, mapping memory id, contract review task id); provider/payer notifications sent. The overrides-by-user / by-provider patterns reports (§15) read from this.


---

## 10. Rejection, Shortfall, And Explanation Framework

### 10.1 Reason code taxonomy (seed catalog for `AdjudicationReasonCode`)

| Code | Category | Meaning |
|---|---|---|
| CON-001 | Contract | No active contract found for provider/payer/service date |
| CON-002 | Contract | Provider not contracted for this payer/scheme/plan |
| CON-003 | Contract | Contract expired before service date |
| CON-004 | Contract | Service date after contract termination |
| CON-005 | Contract | Contract suspended |
| CON-006 | Contract | Contract not approved (defensive) |
| CON-007 | Contract | Contract not yet effective on service date |
| CON-008 | Contract | Provider branch not covered by contract |
| CON-010 | Contract | Ambiguous contract match — manual resolution required |
| ELG-001 | Eligibility | Member plan not covered by this provider contract |
| ELG-002 | Eligibility | Benefit type not eligible under contract |
| ELG-003 | Eligibility | Member category not in beneficiary schedule (e.g. SHA not fully paid-up) |
| SVC-001 | Service | Service category outside contract scope |
| SVC-002 | Service | Service not mapped to any contracted tariff — manual review |
| SVC-003 | Service | Unlisted service not payable under contract (UnlistedServiceRule=REJECT) |
| PRC-001 | Pricing | Claimed amount exceeds contracted rate — short-paid to contract |
| PRC-002 | Pricing | Contracted rate missing/unreadable — manual pricing required |
| PRC-003 | Pricing | Rate expired with no successor — priced under unlisted rule |
| PRC-004 | Pricing | Multiple conflicting rates — manual resolution |
| PRC-005 | Pricing | Package rate applies — itemised component not separately payable |
| PRC-006 | Pricing | Unit-of-measure mismatch between bill and contract |
| PRC-007 | Pricing | Currency mismatch |
| LIM-001 | Limits | Quantity exceeds contract limit |
| LIM-002 | Limits | Frequency exceeds contract limit (per day/admission/year) |
| LIM-003 | Limits | Annual utilisation limit exhausted (e.g. SHA 180 inpatient days/household) |
| EXC-001 | Exclusion | Service excluded by contract |
| EXC-002 | Exclusion | Diagnosis excluded / indication restriction not met (SHA MRI/CT indications) |
| EXC-003 | Exclusion | Excluded for this plan/member category/date range |
| EXC-004 | Exclusion | Unauthorised referral / self-referral (SHA) |
| AUTH-001 | Pre-auth | Pre-authorisation required but missing |
| AUTH-002 | Pre-auth | Pre-authorisation expired / not valid on service date |
| AUTH-003 | Pre-auth | Approved amount exceeded |
| AUTH-004 | Pre-auth | Approval does not cover this service |
| DOC-001 | Documents | Mandatory document missing — rejected per contract |
| DOC-002 | Documents | Documents missing — pended for provider |
| DOC-004 | Documents | Invoice not system-generated (handwritten) — not acceptable (Britam 6.4) |
| SUB-001 | Submission | Claim submitted outside contractual window |
| DUP-001 | Duplicate | Duplicate provider invoice (EXISTS as hard gate) |
| DUP-002 | Duplicate | Second claim for same admission episode (one-claim-per-episode) |
| MAN-001 | Manual | Ambiguous contract rule — routed for contract clarification |

### 10.2 Reason structure

Every code row carries (per §5.13): reason code; **user-facing (member) description**; **provider-facing description** (actionable, names the contract clause/tariff line, e.g. "Your contract 'CIC Pricelist Agreement eff. 01-Feb-2025', line 'CT Scan Abdomen', caps this service at KES 8,000. Billed KES 9,500; KES 1,500 is not payable and may not be billed to the member."); **internal technical explanation** (rule ids, trace pointer); contract rule reference (type + id + version); triggering claim field; possible remedy; resubmissionAllowed; overrideAllowed + which types; requiredDocsForReconsideration; escalationRoute. All display strings through the terminology engine (per-payer vocabulary).

### 10.3 Worked examples

| # | Claim line | Contract position | Outcome |
|---|---|---|---|
| 1 | CIC member, OP consultation billed KES 1,500, service 10-Mar-2025 | CIC pricelist v1 (eff. 01-Feb-2025): `Outpatient Consultation Fees 1,000.00` | APPROVED_WITH_ADJUSTMENT: payable 1,000, shortfall 500, `PRC-001`; provider write-off (balance-billing per contract policy) |
| 2 | Madison member, OP visit: consult 800 + labs 2,400 + pharmacy 1,900 (billed 5,100) | Madison FCM: PER_VISIT_CASE_RATE 3,900 AS_CONTRACTED; carve-outs MRI/dental/optical/etc. not present | Claim priced 3,900 flat; lines informational; trace: "Fixed Cost Model per visit, FCM Agreement eff. 01-Jan-2023" |
| 3 | Madison member, same visit + MRI 18,400, no LOU | MRI = FCM carve-out; PreauthRule: carve-outs + >10,000 require LOU (dental addendum threshold) | Visit pays 3,900; MRI line `AUTH-001` → MISSING_PREAUTH queue; provider text names LOU requirement + retro pathway |
| 4 | Jubilee member, C/S admission itemised at 145,000 (theatre 60k, ward 30k, drugs 25k, doctor 30k) | Jubilee maternity package: Elective/Emergency CS 120,000; unbundling not allowed | Package applied: payable 120,000; components `PRC-005`; disallowed 25,000; E7 |
| 5 | Same admission + NICU 3 days after complication | CIC-style package excludes ICU/HDU/NICU complications → bill separately | Package 120,000 + NICU per-diem lines priced from tariff; complicationRule EXCLUDED_BILL_SEPARATELY in trace |
| 6 | SHA beneficiary, MRI lumbar, self-referred | SHA: imaging on referral only; indication limits | `EXC-004` reject; provider text quotes referral condition; remedy: submit referral documentation; resubmission allowed |
| 7 | SHA beneficiary, IP claim submitted 12 days post-discharge | submissionWindowDays=7 basis DISCHARGE_DATE | `SUB-001` → route; override PAY_DESPITE_LATE_SUBMISSION (supervisor + payer approver, SHA waiver analogue) |
| 8 | GA member, "Robotic knee arthroplasty" — not on any schedule | GA contract unlistedServiceRule=REFER_FOR_REVIEW | `SVC-002` → SERVICE_NOT_MAPPED queue; suggested near-matches shown; resolution may CREATE_TEMPORARY_RATE + contract amendment task |
| 9 | Old Mutual member, OP visit billed 6,200 | AVERAGE_COST_POOL 4,000 (contract-level), exclusions CT/MRI/US/dental/dialysis/day-case | Lines pay per schedule/billed; claim tagged to pool; no line shortfall; quarterly reconciliation computes recovery — officer sees "average-cost contract: settlement adjustment at reconciliation" |
| 10 | Britam member at Meru branch | Britam 2024 signed by Lifecare Bungoma Ltd, branchScope=LISTED[Bungoma] | `CON-008` → PROVIDER_NOT_CONTRACTED queue; remedy: confirm branch scope with payer / amend contract |

---

## 11. User Interface Requirements

All screens follow existing admin app conventions (Next.js app router pages under `src/app/(admin)/`, tRPC, existing table/filter components, terminology engine for labels, RBAC-gated actions).

### 11.1 Contract list — `/(admin)/contracts`

Columns: contract number, title, type, provider (+branch scope), payer, status chip, effective window, reviewDueDate flag, version, tariff-line count, % lines rate-complete, owner, last activity. Filters: status, type, payer, provider, expiring within N days, review-due, has-open-clarifications, created-by. Actions: new contract, import from document, renew, export list. Row click → detail.

### 11.2 Contract detail — `/(admin)/contracts/[id]`

Header: identity, status, version selector (view any version read-only), effective window, family tree (parent MSA / addenda / rate schedules with links — the Madison MSA→dental-addendum→rate-letter chain visualised). Tabs: **Overview** (metadata, parties, terms: payment, submission window, balance billing, reconciliation cadence), **Applicability**, **Tariffs** (§11.4 editor), **Packages**, **Rules** (pricing/pre-auth/documentation/exclusions, §11.5 builder), **Source documents** (viewer with page anchors; field-provenance backlinks), **Claims activity** (claims priced by this contract, queue items, disputes), **Versions & audit** (§11.7). Action bar per status machine (§4.2): submit for review, approve/reject/clarify, activate, amend, suspend, terminate, renew — each gated by role and validation state.

### 11.3 Contract creation wizard — `/(admin)/contracts/new`

Steps exactly per §4.1; progress rail; each step blocks on its own validations only (full validation at step 10); autosave drafts; "import mode" shows source-pane + candidate-fields side-by-side with per-field confirm/edit/flag controls and confidence chips (§12).

### 11.4 Tariff table editor (critical)

- Grid editing (keyboard-first): columns = §5.6 fields with sensible defaults; inline validation; category/UoM pickers; branch column when branchScope=LISTED.
- **Bulk upload:** CSV/XLSX template download (per contract, pre-filled with existing lines for re-import round-trips); upload → column-mapping step → row-level validation report (errors block row, warnings import flagged) → preview diff (adds/updates/deactivations) → commit as draft changes. Never partial-commit a failed file.
- Search/filter: text across descriptions/codes, category, rate range, rateMissing, requiresPreauth, expiring rows, branch.
- Rate-missing workbench: list of `rateMissing` rows with source-page snapshot beside each for transcription (O2 KCB case).
- Versioning: edits on an ACTIVE contract accumulate into the pending draft version with a visible "n changes pending approval" banner and full diff view; effective-date per change batch.
- Duplicate detection on entry: same normalised description + overlapping window → warn/block (§13-V11).

### 11.5 Rule builder

Non-technical IF/THEN composer producing typed `PricingRule`/`PreauthRule`/`DocumentationRule`/`ContractExclusion` rows (never free-form code):
- WHEN: service category / specific tariff lines / package / diagnosis list / amount threshold / date range / plan-scheme scope / branch / emergency flag.
- THEN: price by (rule kinds §5.7 with parameter forms) / require pre-auth (with threshold, validity, emergency exemption, retro window) / require documents (typed list, consequence) / exclude (level, reason) / route to queue.
- Live preview: "test a claim line" sandbox — enter a hypothetical line, see the full §6 trace against the draft contract (this is also the reviewer's verification tool).
- Conflict linting inline (§13-V12): overlapping rules of equal specificity flagged as you build.

### 11.6 Claims evaluation view (EXTEND `/(admin)/claims/[id]`)

Add a **Contract panel**: matched contract/version with link; per-line table: billed → mapped tariff/package (with match method: code/alias/fuzzy-confirmed/manual) → rule applied → contracted → payable → shortfall/disallowed → reason chips; expandable full rule trace per line (every pipeline stage's outcome); claim-level checks (package assembly, caps, submission window); override buttons filtered by role with required-approver preview; provider-facing remittance wording preview.

### 11.7 Audit & version history view

Timeline of all §5.14 events with actor, before→after; version compare picker (v_n vs v_m): metadata field diff + tariff row diff (added/removed/changed with rate deltas) + rule diff; export diff to PDF for provider negotiation packs; immutable-chain verification indicator (existing audit-chain verify).

---

## 12. Bulk Upload And Extraction From Markdown Contracts

Pipeline (Phase 4; BullMQ job chain, human-in-the-loop mandatory — extraction NEVER activates anything):

1. **Upload** markdown (and/or original PDF) → `ContractSourceDocument` (status UPLOADED).
2. **Parse:** markdown structure pass (headings/pages/tables/lists — the corpus files carry `## Page N` markers and `_Source:_` lines from the PDF→md conversion; preserve page anchors for provenance) → block classification (PARTY_BLOCK, DATE_BLOCK, RATE_TABLE, PACKAGE_LIST, INCLUSION_LIST, EXCLUSION_LIST, LEGAL_CLAUSE, SIGNATURE_BLOCK, NOISE/OCR_GARBAGE).
3. **Clause identification:** rule-based + LLM-assisted tagging of operative clauses (pre-auth, submission window, payment terms, balance billing, reconciliation, exclusions) with clause-type confidence.
4. **Rate-table extraction:** reconstruct rows from misaligned OCR tables (category, description, amount, per-branch columns, rebate columns like `CIC Liability | SHA Rebate | Total` decomposed per O10/P12); rows with detected structure but unreadable amounts emit `rateMissing` candidates (O2), never guessed values.
5. **Entity extraction:** provider (via ProviderAlias fuzzy match — O1), payer, branches, effective/expiry/review dates, external refs (CN numbers), signatures/execution status.
6. **De-duplication:** content-hash of tariff blocks (SHA duplication O7).
7. **Ambiguity detection:** conflicting dates in one doc (O3), numerals-vs-words conflicts (O14), validity-vs-review wording (O4), branch-scope ambiguity (O10/Britam), unknown parent references (O6), tax silence, currency silence — each becomes a required review question.
8. **Confidence scoring:** per field 0–1; thresholds: ≥0.95 pre-accepted (still shown), 0.6–0.95 needs confirmation, <0.6 blank + source snippet.
9. **Human review:** wizard import mode (§11.3) — field-level confirm; every §2.5 missing-information item is a mandatory prompt with recorded answer + who answered.
10. **Bulk validation + error report:** §13 suite against the assembled draft; import preview (entities/lines/rules to be created).
11. **Commit as DRAFT** → normal approval path. Extraction metadata (model/version, confidences, reviewer answers) stored for audit.

Prescribed handling of corpus pathologies: missing rates → rateMissing lines (block activation per §13-V6); duplicate service descriptions in one doc → merge prompt or intentional-variant confirmation (branch/UoM); conflicting rates for same item → both surfaced, human picks, loser recorded in notes; ambiguous dates → block until confirmed (O3); unclear payer applicability → mandatory applicability step; unclear branch applicability → default signing-branch + explicit expansion choice; free-text exclusions → LLM-proposed structured exclusion rows, human-approved; non-standard package wording → package composer pre-filled, inclusions/exclusions individually confirmed; non-tabular rates (rates in prose, e.g. FCM letters) → clause extraction proposes a PricingRule (PER_VISIT_CASE_RATE 3,900 + carve-out list) for confirmation; footnotes altering pricing ("Rate applicable for under LA", "For OPD basis only" — Madison dental package terms) → attached as line conditions requiring structured capture (anaesthesia-type restriction, OP-only restriction).

---

## 13. Validation Rules (activation gates)

Blocking (E) unless stated warning (W):

| # | Rule |
|---|---|
| V1 | Contract must have provider + branch scope; and payerId or ≥1 applicability row |
| V2 | executionStatus must be FULLY_EXECUTED to activate (override: contract manager + note) |
| V3 | startDate required; ambiguous-date flags from extraction must be resolved |
| V4 | endDate ≥ startDate; reviewDueDate within window (W) |
| V5 | ACTIVE contract cannot carry unapproved tariff/rule changes (versioning enforces) |
| V6 | No `rateMissing` lines on activation — price them or deactivate the line (override logged) |
| V7 | Every tariff line: valid rateType + required params (discount pct, UoM, currency = contract currency) |
| V8 | Every ContractPackage: ≥1 included component, exclusions list present (may be explicit "none"), trigger defined, unbundling flag set |
| V9 | Every PreauthRule: consequenceIfMissing defined; emergencyExempt explicitly set |
| V10 | ADDENDUM must reference parentContractId; parent not digitised → W + banner |
| V11 | No two active lines with same (branch, code/normalised description, UoM) and overlapping effective windows |
| V12 | Conflicting rules of equal specificity (same scope, overlapping window, different outcome) → E with both listed |
| V13 | Contract-level: submission window, balance-billing policy, unlisted-service rule must be set (defaults allowed but explicit) |
| V14 | Override rules referenced must have authorised roles configured (OverrideControl rows exist) |
| V15 | Mandatory documentation rules for IP claims present when contract covers IP (W) |
| V16 | Currency set; tax-inclusivity answered (UNKNOWN allowed as explicit choice, W) |
| V17 | Applicability rows must resolve to existing Client/Group/PackageVersion ids |
| V18 | AVERAGE_COST_POOL contracts must define reconciliationCadence + pool scope |

Validation report is persisted with the version snapshot and shown to the approver.

---

## 14. Integration With Other System Modules

| Module (EXISTS) | Contract module provides | Contract module consumes |
|---|---|---|
| Provider master (`Provider`) | contract status per provider/branch; contracted-service directory | provider identity, branches, aliases, licence status (licence expiry → contract warning) |
| Payer/client master (`Client`) | contracted-network per payer | payer identity, hierarchy, currency, PayerType |
| Member eligibility | — | member → client/group/plan resolution + member-category flags (§6.1) |
| Benefits (`Package/BenefitConfig/BenefitUsage`) | contract applicability references plans; HOUSEHOLD-scope usage counters (LIM-003) | benefit category mapping, limits/usage, cost-share outputs (§6.5 merge) |
| Pre-auth module (`PreAuthorization`) | PreauthRules to auto-build requirements at PA intake; SLA hours per contract (SHA 72h) | approval records for §6.6 linkage |
| Claims intake (`intake.service`) | pre-check (stages 1–2) at capture; submission-window countdown surfaced | claim + line + document data |
| Claims adjudication (`claim-adjudication`, `auto-adjudication`) | full engine (§6) + named contract gates; per-line provenance fields | hard-gate results, fraud flags, policy ceilings |
| Payments/settlement (`billing`, `settlement`, GL) | payment terms, early-settlement discount params, average-cost pool tags + reconciliation computations, overpayment-recovery flags (O18) | payment dates (to compute P7 discount eligibility) |
| Provider portal | provider-facing rate schedule (their own contracts only), rejection wording, dispute submission against rule refs | dispute filings → CONTRACT_AMENDMENT_REQUIRED / RATE_AMBIGUITY queues |
| Payer portal | payer's contracted network, rates (if permitted), override notifications (§9.3), reconciliation reports | payer approvals for payer-consent override types |
| Document management (`Document`) | typed documents per §5.11; source documents | storage, viewer |
| User management / RBAC | contract role permissions (§19) | roles, maker-checker identity |
| Audit (`audit-chain`) | all §5.14 events | verification |
| Fraud engine (`FraudRule`) | contract-derived seeds: claim-splitting (one-claim-per-episode), upcoding vs contracted mix, repeat-visit abuse under case rates (Madison quarterly-review concern), duplicate-invoice patterns | fraud flags into §8.5 FWA queue |
| Reporting/analytics | §15 datasets | warehouse jobs |
| Terminology engine | all new user-facing strings keyed | per-client vocabulary |

API concepts (tRPC routers, following existing patterns): `contracts.*` (crud, lifecycle transitions, versions, diff, validate), `contractTariffs.*` (grid crud, bulkUpload, template), `contractRules.*`, `contractPackages.*`, `contractEngine.evaluate(claimId | hypotheticalLine)` (read-only trace — powers sandbox + claims panel), `contractImport.*` (upload, extractionStatus, reviewAnswers, commit), `reasonCodes.*`. Engine evaluation is also callable synchronously inside the existing adjudication service (in-process, not HTTP).

---

## 15. Reporting And Analytics

Datasets keyed by (contractId, contractVersionId, ruleRef, reasonCode) — all derivable because §5.13 provenance is persisted per line:

1. Claims paid by contract (count, billed, payable, shortfall, write-off; by period/branch/payer).
2. Rejections by contract rule (reason code × rule ref ranking — "most disputed rules" when joined with dispute filings).
3. Short-paid against tariff (PRC-001 volume + variance distribution per provider — negotiation evidence).
4. Overrides by user / by provider / by type / financial impact (feeds existing override patterns screen).
5. Missing-tariff frequency (SVC-002/PRC-002 by service description — ranked amendment backlog; feeds "unmapped-service suggestions").
6. Expiring & review-due contracts (endDate/reviewDueDate horizon, with claims volume at risk).
7. Contracts with high manual-review rates (queue entries ÷ claims priced — digitisation quality metric).
8. Provider leakage & overpayment risk (paid > contracted after overrides; PAY_ABOVE_CONTRACT_RATE totals; unlisted PAY_AS_BILLED spend).
9. Underpayment disputes (provider dispute volume vs PRC-001 lines).
10. Contract utilisation (% of tariff lines ever hit; dead schedules).
11. Rate variance across providers for the same canonical service (O12 — purchasing intelligence).
12. Average-cost pool reconciliation (per Old Mutual 1.2–1.3: monthly average-cost trend vs agreed 4,000; quarterly recovery computation; Britam class averages).
13. Early-settlement discount capture (claims paid within window × 2% — realised vs missed, P7).
14. Turnaround impact (auto-adjudicated share, queue dwell times, TAT before/after contract digitisation).
15. Submission-window compliance per provider (SUB-001 rates).

---

## 16. Implementation Roadmap

**Phase 1 — Contract structuring foundation (extend what exists)**
Features: ProviderBranch + ProviderAlias; ProviderContract EXTEND (statuses, applicability, ownership, operational terms); ContractVersion snapshots; approval workflow via ApprovalMatrix; contract list/detail/wizard (manual path); basic tariff capture incl. bulk CSV; claims lookup pre-check (stages 1–2) surfaced at intake.
Dependencies: none beyond existing platform. Data: provider/branch master cleanup; payer (Client) rows for all corpus payers incl. SHA as GOVERNMENT_SCHEME. Risks: dual contract stores (mitigate: migrate existing ProviderContract rows in place, no parallel entity); branch retrofits on historical claims (leave null, don't backfill). Acceptance: a corpus contract (CIC pricelist) fully captured, approved, activated; claim intake shows correct contract match; maker≠checker enforced; all events on audit chain.

**Phase 2 — Tariff-based claims automation**
Features: engine stages 3–4 + 9 (mapping incl. alias/fuzzy-with-memory, pricing for FIXED/PER_DIEM/DISCOUNT/caps, LOWER_OF default); per-line provenance fields; reason-code catalog (CON/SVC/PRC/LIM/DUP); manual queues (§8.5 subset); claims evaluation contract panel; shortfall remittance wording.
Dependencies: Phase 1; ServiceCategory taxonomy seeded from Masters. Data: Masters imported as provider service master; tariffs for 3 pilot contracts. Risks: description-matching precision (mitigate: conservative fuzzy threshold + mandatory human confirm first time); provider pushback on shortfalls (mitigate: provider-facing wording review with provider relations before go-live). Acceptance: ≥95% of pilot-contract coded lines auto-price; every adjudicated line stores contract/version/rule/reason; zero lines priced by an unapproved rate; §10.3 examples 1, 8 reproduce exactly.

**Phase 3 — Rule engine (full)**
Features: PricingRule kinds complete (case rates, packages, NET_OF_EXTERNAL, EXTERNAL_TARIFF_REF, AVERAGE_COST_POOL tagging); ContractPackage + episode assembly + complication rules; PreauthRule + DocumentationRule + ContractExclusion generalisation; stages 5–8; precedence engine (§7); rule builder + sandbox; submission-window enforcement; override types §9.1 + OverrideControl.
Dependencies: Phase 2; pre-auth module linkage. Data: package agreements (Jubilee/Old Mutual/Madison/CIC/APA) digitised; external rebate table (NHIF/SHA offsets) seeded or explicitly marked unavailable. Risks: package trigger precision (mitigate: trigger dry-run report against 6 months of historical claims before enabling override of line items); average-cost misunderstanding (mitigate: those contracts NEVER produce line shortfalls). Acceptance: §10.3 examples 2–7, 9–10 reproduce; conflicting-rule builds blocked by V12; emergency exemption path works end-to-end with retro task.

**Phase 4 — Markdown extraction & assisted creation**
Features: §12 pipeline; import wizard mode; confidence scoring; ambiguity questionnaire; bulk import preview; extraction audit.
Dependencies: Phases 1–3 (extraction targets the full model). Data: the 34-file corpus as test fixtures — extraction quality measured against the hand-digitised Phase 2/3 contracts as ground truth. Risks: OCR quality ceiling (mitigate: rateMissing workbench is a first-class flow, not an error path); hallucinated rates (mitigate: hard rule — no amount enters a field without either table-cell provenance or human keystroke). Acceptance: for family-A files, ≥90% of readable rate rows extracted with correct amount; 100% of unreadable rows flagged not guessed; every activated import traceable field-by-field to source or reviewer.

**Phase 5 — Advanced automation & optimisation**
Features: contract analytics suite (§15) complete; override-pattern learning → suggested contract amendments; unmapped-service suggestions (auto-draft tariff lines from SVC-002 clusters); provider dispute analytics; renegotiation insight packs (rate variance, utilisation, loss-making packages); capitation pool settlement; average-cost reconciliation automation with finance approval flow.
Dependencies: ≥2 quarters of Phase 2–3 provenance data. Risks: automation of reconciliation adjustments (keep finance maker-checker). Acceptance: quarterly Old Mutual-style reconciliation computed and approved in-system; amendment backlog ranked by financial impact; measurable TAT improvement reported (dataset 14).

---

## 17. Edge Cases And Failure Modes

| # | Edge case | Prescribed behaviour |
|---|---|---|
| E1 | Service date under old contract, submission under new | Pricing date (service/admission) selects version — always (§6.1); submission window measured against the contract in force on pricing date |
| E2 | Provider changed name | ProviderAlias; legal identity change → new alias + note; change of control (Britam 4.2.6) → compliance task, contracts unaffected until amended |
| E3 | Branch has different rates | branch-scoped tariff rows beat network rows (§6.3); claim without branchId at a multi-branch provider → capture-time required field |
| E4 | Same service under multiple categories (Butali: ECG listed under "MAGNETIC RESONANCE IMAGING") | canonical ServiceCategory mapping fixes at digitisation; engine matches by line, not category label; category is scope filter only |
| E5 | Contract expired, claims still arriving | service date in window → normal; outside → CON-003 route with PAY_DESPITE_EXPIRED_CONTRACT path (§4.5) |
| E6 | Emergency without pre-auth | emergencyExempt pass + retrospective-approval task within rule window; if retro denied → claim re-routes AUTH-001 (SHA GCC 11.1 pattern) |
| E7 | Package exists, provider bills itemised | package wins (unbundlingAllowed=false default); components PRC-005; excluded components (complications) price separately (§5.8) |
| E8 | Service not listed but clinically necessary | UnlistedServiceRule; REFER path → medical review + CREATE_TEMPORARY_RATE; SHA-style contracts (REJECT) → EXC/SVC-003 with provider consent-billing note |
| E9 | "NHIF rates apply" / external tariff reference | EXTERNAL_TARIFF_REF; resolved from ExternalTariffTable if loaded, else RATE-EXT manual queue; never approximate (O8/O9) |
| E10 | "Standard rates apply" vague wording | digitisation question (which standard? provider pricelist? payer tariff?); if unresolved → contract note + unlisted REFER behaviour; MAN-001 on claims |
| E11 | Handwritten/narrative exceptions on scanned contract | captured as structured rules where possible, else contract note + claims banner "manual conditions apply — see clause n" and forced routing for affected categories |
| E12 | Tariff updated mid-admission | admission-date version prices whole episode (SHA one-claim-per-episode); explicit exception: per-diem lines MAY be date-split only if amendment says RETRO/DATE_SPLIT — default no |
| E13 | Member changes plan mid-treatment | eligibility module decides plan per date; episode claims: plan at admission governs applicability (consistent with E12); mismatch → ELG-001 route |
| E14 | Average-cost contract line-level disputes | lines never shortfall against the average (P5); disputes belong to reconciliation, UI must say so (example 9) |
| E15 | Partial approvals | line-level decisions + AUTH-003 partial payable against approval ceilings; claim PARTIALLY_APPROVED (EXISTS) |
| E16 | Multiple insurers / co-pay arrangements | coordination-of-benefits outside contract engine; engine prices provider payable; cost-share module splits payer/member; SHA fraud clause 16.1.7 (billing SHA for another insurer's liability) → fraud seed |
| E17 | VAT/tax ambiguity | taxInclusive tri-state; UNKNOWN + VAT line on invoice → PRC route + contract clarification task |
| E18 | Currency mismatch | PRC-007 route; no silent FX (§6.4) |
| E19 | Duplicate claim lines | existing dup gates + same-line dedup within claim (same code+date+qty) → DUP flag |
| E20 | Rate exists, UoM differs | PRC-006 route (per-hour oxygen billed per-day etc.) |
| E21 | Provider disputes contracted rate | provider portal dispute → RATE_AMBIGUITY/amendment queue; claim stands unless override; dispute analytics (§15.9) |
| E22 | Claim matches contract but needs medical review | MEDICAL_REVIEW queue coexists with clean pricing; medical outcome can override clinical appropriateness independent of rate |
| E23 | Contract activated late (backdated) | re-adjudication impact report + approved re-pricing proposals only (§4.3) |
| E24 | Two overlapping ACTIVE contracts same scope | V11/V12 prevent at activation; if data drift causes it → CON-010 block + contract-team task |
| E25 | Provider suspended for fraud mid-episode | suspension freezes new claims (CON-005 queue); in-flight episode admitted prior → adjudicate with FWA queue co-review |

---

## 18. Acceptance Criteria

**Contract creation:** wizard completes for all 7 §3.3 types; drafts autosave/resume; every mandatory §2.5 answer recorded with answerer; V1–V18 enforced with actionable messages.
**Approval:** creator cannot approve own contract (hard block, tested); approval snapshot immutable; approver sees validation report + diff; clarification round-trips preserved.
**Activation:** only APPROVED→ACTIVE; future-dating auto-activates on date; backdating beyond horizon requires override; re-sweep re-runs NO_CONTRACT queue claims on activation (tested with queued claim).
**Versioning:** rate change creates v(n+1) leaving v(n) pricing until effective; historical claim re-adjudication uses original version unless explicit re-pin; diff view shows exact row deltas (Jubilee 2,800→3,600 fixture).
**Tariff capture:** bulk upload round-trip (export→edit→import) is lossless; invalid rows never partially commit; rateMissing lines block activation; duplicate-window rows blocked.
**Rule creation:** every §5.7 kind creatable via builder without code; sandbox trace matches production engine output for identical input (same code path, verified by test).
**Claims matching:** given the §10.3 fixtures, engine selects the correct contract/version/branch in 100% of cases; ambiguity produces CON-010, never a silent pick.
**Adjudication:** deterministic (same claim re-evaluated → identical trace); ≥ targets in §16 phase acceptance; per-line persistence of contract/version/rule/reason verified by DB assertion in tests.
**Rejection reasons:** no claim/line can reach DECLINED or shortfall without a reasonCodeId; provider-facing text renders for every seeded code; remittance never prints bare "Rejected".
**Manual override:** every §9.1 type enforces OverrideControl (role, dual approval, max amount, docs); blocked path tested per type; reusable overrides restricted to the two designated types; override outcome visible in claim trace as precedence rule 1.
**Audit trail:** every §5.14 event present on the chain with verifiable integrity; version/rate old→new values reconstructable for any date.
**Reporting:** datasets 1–15 return correct figures on seeded fixtures (esp. average-cost recovery arithmetic vs Old Mutual clauses 1.1–1.3).
**Markdown extraction:** Phase 4 metrics met on the 34-file corpus; zero hallucinated amounts (any extracted amount must have a source-cell provenance record); ambiguous dates always block.
**Security/permissions:** §19 matrix enforced; rate export logged; provider portal shows only own contracts.

---

## 19. Security, Permissions, And Governance

Permission matrix (enforced via existing RBAC service; roles may be mapped/merged in RBAC config):

| Action | Roles |
|---|---|
| Create contract / edit draft | Contract manager, Provider relations manager |
| Review/approve contract | Claims supervisor or Medical director (content) + Finance approver (when projected spend > threshold via ApprovalMatrix); NEVER the creator |
| Activate | Contract manager after approval (or auto at effective date) |
| Amend active (start new version) | Contract manager |
| Suspend/terminate | Contract manager + second approver (dual, always) |
| Approve overrides | per §9.2/OverrideControl |
| View rates | Claims roles (need-to-know), contract team, finance; provider portal: own contracts only; payer portal: own network per payer agreement |
| Export rates | Contract manager, Finance — every export audit-logged with row count (commercially sensitive: cross-payer rate leakage is a real dispute risk given O12 variance) |
| View audit logs | Compliance, admins (read-only) |
| Configure OverrideControl / reason codes / categories | System administrator via maker-checker (admin proposes, compliance approves) |

Segregation of duties (hard rules): contract creator ≠ approver; override maker ≠ checker (EXISTS); system administrators cannot approve business overrides; finance approver cannot create contracts. Maker-checker minimum on: activation, suspension, termination, backdating, temporary rates, reason-code catalog changes. Data protection: contracts contain commercial terms only, but linked claims are health data — existing DPA controls apply; provider bank details stay in settlement module.

---

## 20. Final Recommendations

**Minimum viable digital contract (Phase 1 mandatory fields):** contractNumber, contractType, provider + branchScope, payer (or applicability), status, startDate, endDate, currency, submissionWindow (explicit default), unlistedServiceRule, balanceBillingPolicy, executionStatus, owner, source document, ≥1 tariff line or pricing rule.

**Automate first (highest volume, lowest ambiguity):** fixed FFS pricelists (P1) and per-diem ward charges (P8) with LOWER_OF pricing and shortfall reasons — this alone covers families A and most of C's daily claims. Then case rates (P4 — few rules, huge Madison/Jubilee OP volume), then packages (P2/P3).

**Keep manual initially:** average-cost reconciliation adjustments (compute, don't post); external-tariff (NHIF/SHA offset) resolution until the offset table is authoritative; capitation pool settlement; any re-pricing of historical claims; SHA "coverage decision" cross-package intra-admission calls.

**Biggest digitisation risks:** (1) OCR-garbage rates entering as real numbers — the zero-hallucination rule (§12) is non-negotiable; (2) branch-scope errors (Britam signing-entity trap) systematically mispaying five branches; (3) treating average-cost contracts as line-priced (creates phantom shortfalls and provider war); (4) undigitised parent MSAs silently missing controlling terms — surface `parentDigitised=false` everywhere; (5) dual contract stores if the team builds new entities beside `ProviderContract` instead of extending it.

**Biggest operational risks:** provider dispute spike at go-live when enforcement becomes consistent (mitigate: provider-facing wording review + grace-period variance reporting before hard shortfalls); claims-team trust (mitigate: full trace visibility — officers must be able to see *why* in one click); contract-team backlog on RATE_MISSING/SERVICE_NOT_MAPPED queues (staff it before Phase 2 go-live, watch dataset 5).

**Most important design decisions (locked by this spec):** service-date/admission-date version pinning; package-beats-itemised default; LOWER_OF default with AS_CONTRACTED for case rates; exclusions evaluated after pricing for dispute-value transparency; money conflicts route, control conflicts pick strictest; overrides one-off by default with exactly two reusable types; extraction is assistive, activation is human.

**Biggest claims-automation opportunities:** OP consultation/lab/radiology lines under fixed pricelists (highest line volume in corpus); Madison/Jubilee per-visit case rates (whole-claim pricing in one rule); SHA per-diem inpatient + structured package conditions (already the most machine-readable contracts in the corpus).

**Open questions to answer before development:**
1. Are the unseen parent MSAs (Madison 20-Dec-2022, Old Mutual "Main Agreement", Jubilee service agreement) obtainable? They control documentation/termination/validation terms the letters defer to.
2. What is the authoritative NHIF/SHA rebate schedule for "net of NHIF" packages — and who maintains it as SHA tariffs evolve?
3. Which payer(s) actually stand behind Amanah Claims Management (TPA-of-TPA chain) for applicability mapping?
4. Confirm branch scope of the Britam 2024 agreement (signed Bungoma; schedule reads network-wide) with provider relations before digitising it.
5. Is member balance-billing permitted under each commercial contract (only SHA states it)? Default PROHIBITED or ALLOWED_NONCOVERED_WITH_CONSENT?
6. Base currency strategy: platform base is UGX (existing convention) while this corpus is KES — confirm contract-currency settlement rails per market.
7. Who owns the canonical ServiceCategory taxonomy and the service master (Masters files suggest the provider's HMS does — for a TPA, the TPA must own its own)?
8. Retention: SHA requires 5-year claims-document retention — confirm tenant-wide retention policy matches the strictest contract.

---

*End of specification.*
