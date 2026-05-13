# AiCare — Underwriter End-to-End Process Specification

**Document type:** Implementation specification for Antigravity
**Target tenant:** Avenue Healthcare (PSHP)
**Document version:** 1.0
**Date:** May 2026

---

## 0. Context and How to Use This Document

This specification translates the classical workflows of a medical insurance underwriter into the operational reality of AiCare's membership platform. The shape of the work is identical to what an insurance underwriter does day-to-day; only the regulatory framing differs. Because Avenue Healthcare operates as a membership scheme rather than an insurer, the actors on the AiCare platform are referred to by their AiCare role names (Membership Assessor, Senior Assessor, Member Operations, Benefit Reviewer, etc.) and all user-facing language must flow through the configurable Terminology Engine.

Antigravity should treat this document as a **process verification checklist**. For each end-to-end process below, the agent should:

1. Locate the relevant tRPC routers, services, jobs, and UI surfaces in the codebase
2. Verify the documented sequence is implementable through the existing data model
3. Flag any step where the data model, state machine, or UI is missing or under-built
4. Where a gap exists, implement to the principle described — not to a prescriptive code shape

Each process specification has a uniform structure:

- **Purpose** — one-line statement of what the process accomplishes
- **Trigger** — the event that initiates the process
- **Primary actor / secondary actors** — who drives, who participates
- **Pre-conditions** — what must be true before the process can run
- **Step-by-step sequence** — the ordered flow with system touchpoints
- **Decision points** — branches in the flow with their criteria
- **Terminal states** — success and failure end states
- **Data model touchpoints** — which AiCare entities are read or written
- **Antigravity verification checklist** — explicit items to confirm in the code

This document does not redefine the data model. It assumes prior AiCare specifications (membership lifecycle, fraud detection, co-contribution, broker command center, competitive hardening) have established the canonical entities. Where this document refers to an entity, Antigravity should locate it in the existing Prisma schema and confirm fit; where the entity does not exist or is partially built, Antigravity should raise it as a gap.

A note on terminology: throughout this document, the canonical AiCare terms are used (membership, contribution, benefit, scheme, member, principal, dependant, benefit request, eligibility assessment, membership amendment). The classical underwriter terms (policy, premium, sum insured, claim, endorsement, etc.) appear in parentheses on first use for cross-reference only. The terminology engine handles all rendering — no hard-coded user-facing strings.

---

## 1. Cast of Internal Actors

Before walking through processes, it is essential to be unambiguous about who is doing what. These roles map to the existing RBAC matrix. Where a role does not yet exist, it should be added.

| Role | Classical equivalent | Primary responsibilities |
|---|---|---|
| Membership Assessor | Underwriter | Reviews new business submissions, conducts risk assessment, sets loadings/exclusions, produces quotations |
| Senior Membership Assessor | Senior Underwriter | Approves assessments above defined thresholds, handles exception cases, signs off on rate deviations |
| Member Operations Officer | Policy administration clerk | Onboards principals and dependants, processes membership amendments, manages cards and documents |
| Benefit Reviewer | Claims adjudicator | Reviews benefit requests (claims) against scheme terms, approves/declines/queries |
| Pre-Authorization Officer | Pre-auth clerk | Reviews service authorization requests in real time |
| Senior Benefit Reviewer | Claims manager | Handles escalated benefit requests, complex cases, large-value approvals |
| Scheme Manager | Account manager | Owns the commercial relationship with a corporate scheme; coordinates renewal |
| Finance Officer | Finance clerk | Posts contributions received, generates debit notes, manages provider settlements |
| Compliance Officer | Compliance officer | Reviews COI declarations, audits override actions, runs parity reports |
| Broker (external) | Broker | Brings business, manages corporate scheme relationships, receives commission |
| Provider (external) | Provider | Renders services, submits pre-auths and benefit requests, receives settlement |

A user can hold multiple roles. The system must enforce role-based gating at every approval boundary documented in the processes below. Maker-checker is enforced at the role level: the same human user cannot be both maker and checker on the same record.

---

## 2. Process Catalogue

The processes documented in this specification cover the full lifecycle a Membership Assessor (underwriter) touches. They are ordered roughly by the natural sequence of a business lifecycle, but they are not strictly sequential — endorsements and pre-auths happen continuously across the life of any active membership.

| # | Process | Primary actor | Touches |
|---|---|---|---|
| 3 | New Business Intake & Risk Assessment | Membership Assessor | Quotation, Underwriting, Member |
| 4 | Quotation Generation & Issuance | Membership Assessor | Quotation, Pricing, Broker |
| 5 | Quote Acceptance & Membership Binding | Senior Assessor | Scheme, Membership, Debit Note |
| 6 | Principal & Dependant Onboarding | Member Ops | Member, KYC, Cards |
| 7 | Mid-term Membership Amendments | Member Ops / Assessor | Amendment, Pro-rata, Debit Note |
| 8 | Pre-Authorization Review | PA Officer | Pre-auth, Benefit Hold |
| 9 | Benefit Request (Claim) Adjudication | Benefit Reviewer | Encounter, Benefit Request, Settlement |
| 10 | Reimbursement Processing | Benefit Reviewer | Member-paid Claim, Refund |
| 11 | Renewal Cycle Management | Senior Assessor / Scheme Mgr | Renewal Analysis, Quote, Membership |
| 12 | Lapse, Cancellation & Reinstatement | Member Ops / Assessor | Lifecycle, Refund, Waiting Period |
| 13 | Exception Handling & Maker-Checker | Assessor / Senior Assessor | Override, Audit Chain |
| 14 | Portfolio Monitoring & Strategic Purchasing | Senior Assessor / Scheme Mgr | Analytics, Alerts |

---

## 3. New Business Intake & Risk Assessment

### Purpose
To convert a sales lead or broker submission into an assessed risk that can be priced. The Membership Assessor evaluates the proposed group (or individual) for eligibility, identifies risk factors, applies waiting periods, exclusions, or loadings, and produces an assessed risk profile ready for pricing.

### Trigger
One of the following:
- A broker submits a new business application through the broker portal
- A scheme manager creates a direct sales submission via the admin portal
- An individual prospect completes a self-service application via the member portal
- A renewal cycle initiates a re-assessment (see Process 11)

### Primary actor
Membership Assessor.

### Secondary actors
- Broker (submitter, if broker-channel)
- Scheme Manager (if direct sales)
- Senior Assessor (approval if assessment falls outside auto-issue thresholds)

### Pre-conditions
- A broker, scheme manager, or prospect with appropriate authentication exists
- For broker submissions: the broker is in `ACTIVE` status with valid KYC
- The applicable products and benefit packages are in `ACTIVE` status as of the requested cover start date

### Step-by-step sequence

**Step 1 — Submission capture.** The submitter completes a structured application capturing:
- Client type (Corporate Scheme or Individual)
- For corporate: legal name, registration number, KRA PIN, industry sector, headcount, requested cover start date, billing contact
- For individual: principal demographics, requested dependants, age and gender of each life, current and historical medical conditions
- Census file upload (CSV/Excel) for corporate schemes with more than 10 lives — system parses and validates against template
- Medical history declarations per life (structured ICD-10 codes plus optional narrative)
- Requested benefit package(s) from the product catalogue
- Requested cover mode: Contribution-bearing (insured) or Fund-managed (self-funded)
- Supporting documents: claims history (if renewal from elsewhere), CR12 (for corporate), valid government ID per life

**Step 2 — Initial validation gates.** The system runs automated gates at submission time:
- All required fields complete
- Census file matches the template and resolves cleanly (no duplicate national IDs within the submission, dependants linked to a principal, ages computed from DOB consistent with declared lives)
- Each declared national ID validates against the IPRS API where available
- No life on the submission is already an active member on a conflicting scheme
- Requested cover start date is at least 7 days in the future (Avenue's underwriting SLA buffer; configurable per scheme)
- The submission's projected gross contribution is within the broker's authority limit (if broker channel)

Any gate failure surfaces inline to the submitter with structured remediation. Submissions that pass all gates move to status `PENDING_ASSESSMENT` and enter the assessor work queue.

**Step 3 — Assessor work queue allocation.** A scheduled allocation job (every 10 minutes) distributes submissions to assessors using a configurable rule (round-robin within team, by scheme size band, by industry specialism). Each assigned submission appears on the assessor's dashboard with a target SLA clock starting.

**Step 4 — Risk profile construction.** The assessor opens the submission and the system surfaces an assembled risk profile:
- Demographic distribution of the proposed lives (age bands, gender split, dependant ratio)
- Declared medical conditions aggregated by ICD-10 chapter
- For renewals from elsewhere: claims history loss ratio if provided
- Geographic distribution (counties of residence)
- Comparable scheme benchmarks: average MLR for similar schemes in the same industry and headcount band
- Pre-existing condition flags requiring loading or exclusion per scheme rules
- Any internal blacklist matches (members previously terminated for fraud)

**Step 5 — Per-life assessment decisions.** For each life flagged for clinical attention, the assessor records a structured decision:
- `STANDARD` — accept at scheme default rate
- `LOADED` — accept at default rate plus a multiplier (e.g. 1.25× for diabetes, 1.50× for ischemic heart disease); the multiplier is recorded
- `EXCLUSION` — accept but explicitly exclude specified ICD-10 codes from benefit coverage; the excluded codes are recorded against the membership
- `WAITING_PERIOD` — accept but apply additional waiting periods on specified benefit categories (e.g. 12 months on maternity)
- `DECLINED` — reject this life from the submission; the submitting party can either accept the partial membership or withdraw the whole submission

Each decision must include a structured reason code from a configurable list, plus an optional narrative. Each decision is itself a `UnderwritingDecision` record subject to the audit chain.

**Step 6 — Scheme-level decisions.** Beyond per-life decisions, the assessor records scheme-level parameters:
- Cover start date (may be deferred from requested date)
- Benefit packages confirmed (assessor can recommend a different package than requested, with reason)
- Co-contribution applicability (Avenue's rule set per scheme size; see co-contribution spec)
- Network tier (which provider network the scheme accesses)
- Loadings or discounts at the scheme level (group size discount, loyalty discount, industry loading)
- Special conditions (e.g. "maternity benefit accessible only after 9 months of unbroken membership")

**Step 7 — Threshold-based escalation.** Before submitting for quotation, the system evaluates whether the assessment requires senior approval:

| Trigger | Approver required |
|---|---|
| Projected gross contribution > KES 5,000,000 annually | Senior Assessor |
| Any single life loading multiplier > 2.0× | Senior Assessor |
| Scheme-level discount > 10% | Senior Assessor |
| Net of all loadings/discounts deviates from rate card by > 15% | Senior Assessor |
| Any life with declared condition matching the high-attention list (cancer, dialysis, cardiac surgery within 12 months) | Senior Assessor + medical advisor sign-off |
| All other cases | Auto-progress |

Thresholds are scheme-attribute configurable; this table is the default seed.

**Step 8 — Submit for quotation.** The assessor moves the submission to `ASSESSED`. If escalation thresholds were triggered, the status is `ASSESSED_PENDING_SENIOR_APPROVAL`; the Senior Assessor receives notification with the rationale and either approves, modifies, or rejects.

### Decision points

- At Step 5: per-life decline can either remove the life from the submission or invalidate the whole submission, depending on whether the life is a principal or a dependant
- At Step 7: failure of senior approval returns the submission to `PENDING_ASSESSMENT` with comments
- At Step 8: assessor may also `RETURN_TO_SUBMITTER` if data quality is too poor to assess

### Terminal states

- `ASSESSED` — ready to enter the quotation pipeline (Process 4)
- `DECLINED_BY_UNDERWRITING` — assessment rejected the submission outright; the submitter is notified with structured reason
- `WITHDRAWN_BY_SUBMITTER` — the submitter withdrew before assessment completed

### Data model touchpoints

`Submission`, `SubmissionLife`, `UnderwritingDecision`, `MembershipExclusion`, `WaitingPeriodApplication`, `RiskProfile`, `AssessorWorkQueue`, `AuditChainEntry` (every decision logged).

### Antigravity verification checklist

- [ ] A `Submission` entity exists with status lifecycle: `DRAFT` → `PENDING_VALIDATION` → `PENDING_ASSESSMENT` → `ASSESSED` (with appropriate intermediate and terminal states)
- [ ] CSV/Excel census import for corporate schemes parses correctly, validates the template, and surfaces row-level errors
- [ ] Each life on a submission has an individual `UnderwritingDecision` record capable of carrying `STANDARD`, `LOADED`, `EXCLUSION`, `WAITING_PERIOD`, or `DECLINED` decisions
- [ ] Loading multiplier is stored as a decimal, not as a percentage string, and is applied during pricing
- [ ] Exclusion records link to specific ICD-10 codes and are surfaced during later benefit adjudication
- [ ] An assessor work queue UI exists with SLA timers visible
- [ ] Threshold-based escalation routes submissions to the Senior Assessor approval queue when criteria fire
- [ ] Every status transition is logged to the audit chain with actor, timestamp, and reason
- [ ] IPRS integration is wired in for national ID validation (or stubbed with a feature flag if production credentials not yet provisioned)
- [ ] The membership terminology engine is used for all user-facing strings in the submission and assessment surfaces

---

## 4. Quotation Generation & Issuance

### Purpose
To translate an assessed risk into a priced offer the submitter can accept or negotiate.

### Trigger
A submission reaches `ASSESSED` status (Process 3 terminal state).

### Primary actor
Membership Assessor.

### Secondary actors
- Broker (recipient of quotation, if broker-channel)
- Scheme Manager (recipient, if direct sales)

### Pre-conditions
- Submission is in `ASSESSED` status (with any required senior approvals captured)
- Active rate cards exist for the selected benefit packages, effective on the proposed cover start date
- Tax rates (Stamp Duty, Training Levy, PHCF) are configured and active

### Step-by-step sequence

**Step 1 — Pricing model resolution.** The system identifies the applicable pricing model for the scheme. AiCare supports four pricing modes (per prior specifications):
- Flat rate — single contribution per life per package per period
- Age-banded — different contribution by age band, applied per life
- Family-size matrixed — corporate rate table indexed by family size and benefit limit (Rensoft canonical model)
- Custom uploaded model — Excel or Python file evaluated in a sandboxed environment

The pricing mode is determined by the product configuration. The assessor cannot change the pricing mode at quote time; only the inputs to that mode.

**Step 2 — Base contribution computation.** The system computes the base contribution per life:
- For age-banded: lookup against the active rate card using each life's age band as of cover start
- For family-size matrix: for each family unit within a category, lookup against the (family size × benefit limit) cell
- For flat rate: simple per-life multiplication
- For custom model: pass the census and parameters to the sandboxed evaluator and receive the output

Sub-totals are computed per life, per family, per category, and at scheme level.

**Step 3 — Loadings application.** The system applies in this order:
1. Per-life loadings from the assessment (multiplicative on that life's base contribution)
2. Scheme-level loadings (industry, claims history, special conditions) — additive percentage
3. Custom loadings (manually entered with description) — additive percentage

**Step 4 — Discounts application.** The system applies in this order:
1. Group size discount (auto-computed: >100 lives = 5%, >200 lives = 10%, configurable)
2. Loyalty discount (years with Avenue, auto-computed from membership history)
3. Custom discount (manually entered with description and approver)

**Step 5 — Co-contribution configuration.** Per the co-contribution specification, the assessor confirms or modifies:
- Co-contribution model (fixed, percentage, hybrid, tiered by service category, network-tier based, or none)
- Per-visit/encounter caps
- Annual aggregate cap
- Waiver rules (if any)

**Step 6 — Statutory taxes computation.** The system applies the three mandatory Kenyan levies:
- Stamp Duty: KES 40 flat per membership year
- Training Levy: 0.2% of base contribution (before discounts but after loadings)
- PHCF: 0.25% of base contribution (before discounts but after loadings)

Taxes are computed and displayed as explicit line items; they are never bundled into the gross.

**Step 7 — Ancillary charges.** Per Rensoft and KCB references, the system adds:
- Membership card issuance fee (per life)
- Smart card / biometric enrollment fee (if applicable)
- Welcome pack fee (if applicable)

**Step 8 — Total contribution computation.** Net payable is calculated as:

```
Per-life base × loadings - discounts + co-contribution provision
+ taxes (Stamp Duty + Training Levy + PHCF)
+ ancillary charges
= Total contribution payable
```

The computation is displayed in a structured, line-item-visible form. The assessor sees every component; the submitter sees a structured but less granular version (configurable per scheme).

**Step 9 — Quote document generation.** The system generates:
- A branded quotation PDF (Avenue letterhead, Quicksand headings, indigo branding per style guide)
- A debit note preview showing how the contribution will be billed
- A benefit schedule annex listing all covers, sub-limits, exclusions, and waiting periods
- A terms-and-conditions annex generated from the scheme rules

The PDF is generated server-side, stored in MinIO, and linked to the `Quotation` record.

**Step 10 — Quote issuance.** The assessor reviews and issues. On issuance:
- The quotation status moves to `ISSUED`
- An email is dispatched to the submitter with the PDF attached
- The broker portal or member portal surfaces the quotation
- A 30-day validity clock starts (configurable per scheme); after expiry the quote moves to `EXPIRED` automatically via a scheduled job

### Decision points

- If pricing produces a result that deviates from the rate card by more than the configured tolerance, the assessor cannot issue without senior approval (returns to escalation flow from Process 3 Step 7)
- The assessor can produce multiple versioned quotations for the same submission (e.g. quote A with full dependant cover, quote B with principal-only)
- The custom-model branch must produce auditable outputs — every input row and output row stored — for regulatory defensibility

### Terminal states

- `ISSUED` — quotation sent, awaiting submitter response
- `EXPIRED` — validity period elapsed without acceptance
- `WITHDRAWN` — quotation withdrawn by Avenue (e.g. rate error discovered)
- `SUPERSEDED` — a newer quotation version replaced this one

### Data model touchpoints

`Quotation`, `QuotationVersion`, `QuotationLineItem`, `PricingModel`, `RateCard`, `Tax`, `AncillaryCharge`, `Discount`, `Loading`, `CoContributionConfiguration`, `AuditChainEntry`.

### Antigravity verification checklist

- [ ] All four pricing modes are implementable through `PricingModel` with appropriate strategy pattern
- [ ] Rate card lookups respect effective date ranges (never delete — activate/deactivate with timeframes)
- [ ] Family-size × benefit-limit matrix supports the full Rensoft taxonomy (M through M+7 and M+7+)
- [ ] Custom pricing model uploads are sandboxed (no host system access)
- [ ] The three statutory taxes appear as separate line items with their canonical calculation bases
- [ ] PDF generation uses Avenue's brand identity (Quicksand for headings, Lato for body, indigo primary color)
- [ ] Quote validity clock and auto-expiry job are wired
- [ ] Multiple versioned quotations per submission are supported with diff visibility
- [ ] Every quote issuance is logged to the audit chain
- [ ] Broker portal and admin portal both have full quotation-builder access; broker quotations route through Avenue admin for review

---

## 5. Quote Acceptance & Membership Binding

### Purpose
To convert an accepted quotation into one or more active memberships with associated billing.

### Trigger
The submitter (broker, scheme manager, or individual) accepts an issued quotation by clicking accept in the portal, replying with signed acceptance, or initiating first contribution payment.

### Primary actor
Senior Membership Assessor (binding authority).

### Secondary actors
- Membership Assessor (continuity from prior process)
- Finance Officer (debit note posting)
- Member Operations (onboarding handoff)

### Pre-conditions
- Quotation is in `ISSUED` status
- Quotation validity has not expired
- Submitter has explicitly accepted (a record of acceptance is captured)

### Step-by-step sequence

**Step 1 — Acceptance capture.** The system records the acceptance event:
- Method of acceptance (portal click, email reply, signed letter upload)
- Acceptance timestamp
- Identity of accepter (validated against authentication or recorded with an upload of signed acceptance)

Acceptance is irrevocable except via the cooling-off process (Step 11).

**Step 2 — Pre-bind validation.** The system runs final validation gates before binding:
- All lives still validate against IPRS (re-check; IPRS records may have changed since assessment)
- No life has been added to an internal blacklist since assessment
- The scheme's first contribution payment method is captured and validated (bank account, M-Pesa Paybill mandate, payroll deduction agreement)
- Required KYC documents are uploaded and verified (CR12 for corporate, ID copies for individual)

Any failure routes back to the assessor for resolution.

**Step 3 — Membership record creation.** For each principal life on the submission, the system creates a `Membership` record:
- Unique membership number (pattern: `AVH-YYYY-NNNNN`)
- Linked to scheme (for corporate) or standalone (for individual)
- Cover start and end dates
- Benefit package
- Lifecycle status: `PENDING_ACTIVATION` (becomes `ACTIVE` on cover start date)
- All underwriting decisions, exclusions, waiting periods carried over from the assessment
- Contribution amount derived from the quotation

For each dependant life, a child record is created linked to the principal.

**Step 4 — Binder generation.** The system generates the binding documents:
- Membership certificate (per principal)
- Benefit schedule
- Member welcome pack
- Scheme binder document (for corporate schemes — the formal contract)

All documents are stored in MinIO and surfaced to the appropriate portals.

**Step 5 — Debit note posting.** Finance Officer (or auto-post if scheme rules permit) posts the debit note:
- Total contribution amount
- Payment schedule per the agreed frequency (monthly, quarterly, annually, custom)
- First installment due date
- Linked to the scheme's financial ledger

If the scheme is Fund-Managed (self-funded), instead of a contribution debit note, a Fund Deposit Request is generated for the initial fund balance plus the administration fee.

**Step 6 — Binder-level maker-checker.** Per established AiCare convention, the binder is subject to maker-checker approval at the binder level:
- The Membership Assessor is the maker (initiated the binding)
- A Senior Assessor must approve before the binder becomes effective
- The Senior Assessor cannot be the same human as the Assessor
- All four events (submission, approval action, decision, timestamp) are logged to the audit chain

**Step 7 — Membership activation on cover start date.** A scheduled job runs daily at 00:01 EAT:
- Identifies all memberships with `cover_start_date = today` in `PENDING_ACTIVATION`
- Verifies the first contribution has been received (if contribution-bearing) or the fund deposit has been received (if fund-managed); if not, follows the lapse path (Process 12)
- Moves qualifying memberships to `ACTIVE`
- Triggers downstream onboarding workflows (card issuance, member portal access provisioning, welcome notifications)

**Step 8 — Broker commission accrual.** Per the broker command center specification, the commission ledger entry is created:
- New business commission rate applied
- Statutory deductions computed (WHT 10%, IRA Agent Levy as configured, VAT if VAT-registered)
- Ledger entry state: `PENDING_RECONCILIATION` until first contribution receipt is matched, then `EARNED`

**Step 9 — Handoff to onboarding.** Member Operations receives the new memberships in their onboarding queue (Process 6).

### Decision points

- If first contribution is not received by cover start date: the membership does not activate and follows the lapse-from-binding path (separate from in-life lapse)
- For corporate schemes with payroll deduction: the membership can activate with a pending-first-deduction status if the scheme's deduction cycle is captured
- Fund-managed schemes: the membership cannot activate until at least 50% of the first installment fund deposit is received (configurable per scheme)

### Terminal states

- `ACTIVE` — membership live and able to receive benefits
- `PENDING_ACTIVATION` — bound but cover start date not yet reached
- `LAPSED_BEFORE_ACTIVATION` — bound but failed to activate due to non-payment

### Data model touchpoints

`Quotation`, `Membership`, `MembershipBindingDocument`, `DebitNote`, `FundDeposit`, `CommissionLedgerEntry`, `MembershipLifecycleStateMachine`, `AuditChainEntry`.

### Antigravity verification checklist

- [ ] Acceptance event is captured as a structured record with method, timestamp, and accepter identity
- [ ] Membership numbers follow the canonical pattern and are globally unique
- [ ] Underwriting decisions, exclusions, and waiting periods from the assessment are carried over to the active membership record (not re-keyed)
- [ ] Binder-level maker-checker is enforced server-side; the same user cannot complete both roles
- [ ] The daily activation job exists, runs idempotently, and handles missed days (e.g. if the job did not run for 2 days due to outage, it processes both days' activations on next run)
- [ ] Fund-managed scheme binding correctly generates a fund deposit request rather than a contribution debit note
- [ ] Broker commission ledger entry is created with state `PENDING_RECONCILIATION` and progresses correctly to `EARNED` on contribution receipt
- [ ] All binding events are logged to the immutable audit chain with payload hashes

---

## 6. Principal & Dependant Onboarding

### Purpose
To complete the operational onboarding of newly-bound members so they can access services on cover start date.

### Trigger
A membership moves to `ACTIVE` status (Process 5 terminal state).

### Primary actor
Member Operations Officer.

### Secondary actors
- Member (recipient of onboarding artifacts)
- Card issuance partner (if external)

### Pre-conditions
- Membership is in `ACTIVE` status
- Member contact details are validated (phone, email)

### Step-by-step sequence

**Step 1 — KYC completion.** If KYC was not fully completed during assessment (often the case when a scheme has been bound on the basis of declared data only), Member Operations completes the KYC:
- Government ID validation against IPRS (re-confirm if stale)
- Photo capture (uploaded by member via portal or captured at facility)
- Biometric enrollment (fingerprint or face) via the SMART biometric integration if available
- Document upload: ID copy, KRA PIN copy if applicable, declared chronic condition documentation if relevant

**Step 2 — Member portal provisioning.** The system creates the member portal account:
- Magic-link invitation sent to registered email
- For principal: full portal access (own profile, dependants, benefit balance, encounter history, family view if applicable)
- For dependants over 18: independent portal access with the principal's consent
- For minors: aggregated under principal's view only

**Step 3 — Card issuance.** Per the scheme's configuration:
- Physical photo card or Smart card production triggered (sent to issuance partner queue)
- Digital card immediately available in the member portal
- Card lifecycle managed: issued, dispatched, delivered, activated; replacement workflow for lost/damaged with billing of replacement fee

**Step 4 — Welcome communications.** Multi-channel welcome dispatch:
- Email with welcome pack PDF, benefit guide, provider locator link
- SMS with member number and member portal link
- For corporate schemes: HR contact receives a roster of onboarded members and their card delivery status

**Step 5 — Provider notification.** For high-utilization providers in the scheme's network: the new members are pushed to the provider's eligibility verification system (via SMART, Slade360, or manual roster). This ensures real-time eligibility checks succeed from day one.

**Step 6 — Confirmation of readiness.** The system runs a readiness check at end of onboarding:
- All members have validated KYC
- All principals have activated portal accounts
- Cards are at minimum digitally available
- Provider network has updated eligibility data

Memberships failing readiness checks trigger an alert to Member Operations.

### Decision points

- Dependants added after initial binding (newborns, marriages) bypass this process and instead follow the Mid-term Amendment process (Process 7)
- For corporate schemes where the employer prefers bulk physical card delivery to HR, individual card dispatch is deferred and aggregated

### Terminal states

- `ONBOARDED` — operational onboarding complete, member can transact
- `ONBOARDED_WITH_GAPS` — member can transact but one or more onboarding elements outstanding (e.g. physical card pending); these are tracked for follow-up

### Data model touchpoints

`Membership`, `MemberKycRecord`, `MemberKycDocument`, `MembershipCard`, `MemberPortalAccount`, `WelcomeCommunicationLog`, `BiometricEnrollment`.

### Antigravity verification checklist

- [ ] KYC capture flow exists for both portal-driven (member self-service) and operator-driven (Member Ops keying)
- [ ] IPRS API integration is operational or stubbed with feature flag for offline testing
- [ ] Biometric enrollment integrates with SMART (or whichever biometric provider is configured); failure modes for offline biometric capture are handled
- [ ] Digital cards are generated and displayed in the member portal on activation
- [ ] Physical card issuance has a queue/dispatch workflow with status tracking
- [ ] Card replacement workflow exists with associated billing
- [ ] Welcome communications use the terminology engine for all user-facing strings
- [ ] Provider eligibility data is pushed/synced to integrated partner systems on activation

---

## 7. Mid-term Membership Amendments

### Purpose
To handle changes to active memberships that occur between cover start and renewal. This is the underwriter's "endorsement" workflow translated into AiCare's terminology.

### Trigger
One of:
- Member or scheme manager requests an amendment via portal
- Member Ops initiates an amendment based on an external event (newborn proof received, death certificate received, divorce, employment change)
- A scheduled job detects an event requiring amendment (age band crossing for individual schemes — handled at renewal not mid-term)

### Primary actor
Member Operations Officer (most amendments) or Membership Assessor (assessor-required amendments — see decision matrix below).

### Secondary actors
- Senior Assessor (approval for assessor-required amendments)
- Finance (pro-rata posting)
- Broker (notification, commission impact if applicable)

### Pre-conditions
- Affected membership is in `ACTIVE` status
- The requested amendment is within the scheme's allowed amendment rules (some schemes disallow mid-term downgrades, for example)
- Effective date of the amendment is on or after the request date (back-dating requires explicit senior approval and audit chain entry)

### Amendment taxonomy

The system supports the following amendment types, each with its own workflow nuances:

| Type | Maker | Approver | Pro-rata applied | Re-assessment needed |
|---|---|---|---|---|
| Add dependant (newborn, marriage) | Member Ops | Senior Member Ops | Yes — additional contribution | Only if dependant has declared condition |
| Remove dependant (divorce, death, voluntary) | Member Ops | Senior Member Ops | Yes — refund | No |
| Add principal (corporate scheme growing headcount) | Member Ops | Membership Assessor | Yes — additional contribution | Yes — new life assessment |
| Remove principal (corporate scheme reducing headcount) | Member Ops | Senior Member Ops | Yes — refund | No |
| Package upgrade (within same scheme) | Membership Assessor | Senior Assessor | Yes — delta charge | Yes — new package risk assessment |
| Package downgrade | Membership Assessor | Senior Assessor | Yes — credit (some schemes block this) | Optional |
| Category transfer (within corporate scheme) | Member Ops | Senior Member Ops | Yes if cost differs | No |
| Scheme transfer (between corporate schemes — e.g. employee changing employer) | Member Ops | Senior Member Ops | Yes — settlement between schemes | No (subject to portability rules) |
| Beneficiary update | Member Ops | None | No | No |
| Contact details update | Member or Member Ops | None | No | No |
| Banking details update (for refunds) | Member Ops | Senior Member Ops | No | No |
| Correction of erroneous data (DOB, gender, name) | Member Ops | Senior Member Ops | Conditional (only if the correction affects pricing) | Conditional |
| Mid-term scheme rate change (corporate negotiation) | Membership Assessor | Senior Assessor + Scheme Manager sign-off | Yes — applied prospectively or retroactively per agreement | No (reuses original assessment) |

### Step-by-step sequence

**Step 1 — Amendment initiation.** Maker opens the amendment workflow:
- Selects the membership
- Selects the amendment type from the structured taxonomy
- The system dynamically presents the relevant input form (newborn details, package selector, etc.)
- Effective date is captured (defaults to today; back-dating triggers escalation)
- Supporting documents are uploaded (birth certificate, marriage certificate, death certificate, employment letter, etc.)
- Reason code from the structured list

**Step 2 — Pro-rata impact preview.** Before submission, the system computes and displays:
- Previous contribution amount
- New contribution amount
- Pro-rata adjustment: delta × (remaining days in current period / total days in period)
- For dependant additions/principal additions: pro-rata charge to be added to next debit note
- For dependant removals/principal removals: pro-rata credit to be issued as refund or applied to next debit note (per scheme rule)
- For package changes: delta charge or credit
- For category transfers: typically zero impact unless rate differs between categories

The maker sees this preview before submitting. The submitter (if member-initiated) sees it in the portal before confirming.

**Step 3 — Re-assessment trigger.** If the amendment type requires re-assessment:
- The amendment routes to the Membership Assessor queue
- The Assessor reviews the new life or new package and produces an `UnderwritingDecision` (loading, exclusion, waiting period as appropriate)
- This decision feeds into the pro-rata calculation

**Step 4 — Approval workflow.** Per the taxonomy table, the amendment routes to the appropriate approver. Approval is recorded with timestamp, approver identity, and any modifications made.

**Step 5 — Application of amendment.** On approval:
- The membership record is updated with the new state (new dependant linked, new package code, new contribution amount, new category)
- A `MembershipAmendment` record captures the before/after snapshot
- The membership's effective dates are updated where necessary (e.g. new package effective from the amendment date)
- Any exclusions or waiting periods from the re-assessment are attached to the membership
- Documents are regenerated where required (new membership certificate if material change)

**Step 6 — Financial reflection.** The pro-rata adjustment flows into the financial ledger:
- An endorsement line item is added to the scheme's (or individual's) next debit note
- For refund cases: the refund is queued for payment per the refund policy (typically deducted from next contribution; cash refunds require specific approval)
- For self-funded schemes: the fund balance is debited/credited as appropriate

**Step 7 — Broker commission impact.** If a broker is on the membership:
- Addition: a new commission ledger entry is created for the added contribution
- Removal: a clawback ledger entry is created proportional to the unutilized period

**Step 8 — Notifications.** All affected parties receive notifications:
- Member (via configured channels)
- Scheme manager (for corporate)
- Broker (if applicable)
- Provider network (if eligibility data changed materially — e.g. new dependant added, or member removed)

### Decision points

- Back-dated amendments require Senior Assessor approval and a written justification; the audit chain captures this as a high-attention event
- Amendments that would breach a scheme rule (e.g. attempting to add a dependant beyond M+7 when the scheme's max family size is M+7) are blocked at validation
- Cooling-off cancellations (Process 12) are handled separately, not through this amendment flow

### Terminal states

- `APPLIED` — amendment effective, membership updated
- `REJECTED` — amendment did not pass approval
- `WITHDRAWN` — submitter withdrew before approval

### Data model touchpoints

`Membership`, `MembershipAmendment`, `AmendmentReason`, `MembershipAmendmentDocument`, `ProRataCalculation`, `DebitNote`, `RefundQueue`, `UnderwritingDecision` (if re-assessment), `CommissionLedgerEntry`, `AuditChainEntry`.

### Antigravity verification checklist

- [ ] `MembershipAmendment` entity exists with full taxonomy support and before/after snapshot fields
- [ ] Pro-rata calculation engine handles all amendment types correctly, using day-count basis (not month basis) for accuracy
- [ ] Amendment workflow respects the maker/approver matrix; same user cannot complete both
- [ ] Re-assessment trigger correctly routes amendments that require underwriter re-evaluation
- [ ] Back-dated amendments require senior approval and are flagged in the audit chain
- [ ] Broker commission clawbacks for removals are correctly proportioned
- [ ] All amendment documents are stored in MinIO with effective version control
- [ ] Provider network is notified of material eligibility changes (especially removals)
- [ ] Member and dependant data corrections (vs commercial amendments) follow a lighter approval path
- [ ] The KCB-flagged scheme transfer and category transfer flows are implemented as distinct amendment types

---

## 8. Pre-Authorization Review

### Purpose
To approve or decline service authorization requests in real time, before service rendering, holding the estimated benefit consumption against the member's balance.

### Trigger
A pre-authorization request submitted via:
- Member app
- Provider portal
- SMART or Slade360 integration (auto-forwarded)
- Direct telephone or email (manually keyed by a PA Officer)

### Primary actor
Pre-Authorization Officer.

### Secondary actors
- Senior Benefit Reviewer (escalations)
- Medical Advisor (clinical review for complex cases)
- Member (notification recipient)
- Provider (decision recipient)

### Pre-conditions
- Membership is in `ACTIVE` status as of the requested service date
- The requesting provider is in the scheme's network (or the scheme allows out-of-network with appropriate co-contribution)

### Step-by-step sequence

**Step 1 — Request capture.** The PA request captures structured data:
- Membership and life (principal or dependant)
- Provider/facility
- Requested service: procedure code (CPT), diagnosis code (ICD-10), date of service
- Estimated cost (provider's quote)
- Clinical narrative (especially for inpatient/surgical)
- Supporting attachments (referral letter, clinical notes)

**Step 2 — Auto-decision pipeline.** Per the auto-decision engine in the Member Experience Hardening spec, the system runs ordered gates:

*Eligibility gates* (failure = AUTO_DECLINED):
- Life is in active status on service date
- Procedure is covered under the active benefit package
- Diagnosis is not on the membership's exclusion list
- Applicable waiting period has elapsed

*Cost gates*:
- Estimated cost within remaining benefit cap (after subtracting other active PA holds)
- Estimated cost exceeding cap but within over-limit grace → flag co-contribution requirement, continue
- Estimated cost above the scheme's auto-approve ceiling → ROUTE_TO_HUMAN

*Procedure gates*:
- Procedure on the scheme's auto-approve list → AUTO_APPROVED
- Procedure on the clinical-review list → ROUTE_TO_HUMAN
- Procedure on the never-auto list → ROUTE_TO_HUMAN

*Fraud screening*:
- All applicable fraud rules from the fraud engine evaluated
- HIGH severity rule fired → ROUTE_TO_HUMAN
- MEDIUM severity rule fired → AUTO_APPROVED with audit flag

*Provider gates*:
- Internal Avenue facility → standard flow
- External partner facility → eligibility check on partnership active status
- Out-of-network facility → only allowed if scheme permits, with applicable co-contribution premium

**Step 3 — Auto-decision return.** For cases auto-decided:
- AUTO_APPROVED: a PA reference is generated, valid for the scheme's PA validity window (default 14 days, configurable), the estimated cost is held against the member's benefit balance, and the provider receives an authorization payload via the integration channel
- AUTO_DECLINED: a decline is dispatched with structured reason code; the member is notified

This return is targeted at sub-3-seconds end-to-end.

**Step 4 — Human review queue.** Cases routed to human review enter the PA Officer queue:
- SLA clock starts (default: 2 hours for outpatient, 1 hour for inpatient pre-admission, 30 minutes for emergency)
- The PA Officer sees: the request, the member's benefit balance, recent encounter history, the fraud signals that fired (if any), comparable approvals for the same procedure
- The Officer can approve, decline, request more info, or escalate to clinical review

**Step 5 — Clinical review (if escalated).** For procedures requiring clinical judgment:
- The Medical Advisor reviews the clinical narrative and supporting documentation
- May request additional information from the provider
- Records a clinical opinion which informs the PA Officer's final decision

**Step 6 — Senior review (if escalated by cost or anomaly).** For cases exceeding the PA Officer's authority limit:
- Senior Benefit Reviewer evaluates
- Applies any policy overrides with structured reason codes (recorded to audit chain)

**Step 7 — Decision issuance.** Human-decided cases follow the same return path as auto-decided:
- PA reference + validity + benefit hold (if approved)
- Decline + reason (if declined)
- Member and provider notified via configured channels

**Step 8 — Benefit hold management.** Approved PAs hold the estimated cost against the member's benefit balance:
- The hold is visible in the member's portal as "Pending Authorization Hold"
- The hold prevents over-utilization (subsequent PA requests see the held amount as already consumed)
- The hold automatically releases at validity expiry if service is not rendered
- The hold is converted to actual consumption when the matching benefit request (claim) is submitted (Process 9)

**Step 9 — Cancellation.** If the member or provider cancels the authorization before service rendering:
- The PA moves to `CANCELLED`
- The benefit hold releases immediately
- Cancellation is logged with reason

### Decision points

- Emergency pre-auths (clinical urgency flag) bypass the normal SLA and route directly to senior review with expedited handling
- For procedures with multiple components (e.g. inpatient admission with anticipated theatre + ICU + ward stay), a single PA may hold a structured estimate broken down by component
- Mid-treatment PA extensions (length-of-stay extensions, additional procedures discovered intra-op) are handled as PA amendments linked to the parent PA

### Terminal states

- `AUTO_APPROVED` / `HUMAN_APPROVED` — authorization issued, benefit held
- `AUTO_DECLINED` / `HUMAN_DECLINED` — declined with reason
- `EXPIRED` — validity elapsed without service rendered, hold released
- `CONVERTED_TO_BENEFIT_REQUEST` — actual service rendered and claim submitted; PA hold closed and replaced by actual claim
- `CANCELLED` — cancelled before service

### Data model touchpoints

`PreAuthRequest`, `PreAuthDecision`, `BenefitHold`, `Membership`, `MembershipBenefitState`, `FraudRuleEvaluation`, `AuditChainEntry`.

### Antigravity verification checklist

- [ ] Auto-decision pipeline implements all gates in correct order with documented thresholds
- [ ] Sub-3-second response for auto-decided cases (measure and surface in alerts)
- [ ] Human review queue has SLA clocks per request type, with escalation to senior on breach
- [ ] Benefit holds are correctly applied, surfaced in the member portal, and released on expiry/cancellation
- [ ] PA conversion to benefit request correctly closes the hold and replaces it with the actual claim amount
- [ ] Emergency flag bypasses normal SLA and routes to expedited handling
- [ ] Mid-treatment PA amendments link to the parent PA with full audit trail
- [ ] Fraud rule firings on PA evaluation are logged regardless of final decision
- [ ] All decisions (auto and human) are logged to the audit chain with structured reason codes
- [ ] Provider integration channels (SMART, Slade360) receive authorization payloads correctly

---

## 9. Benefit Request (Claim) Adjudication

### Purpose
To review claims for services already rendered, validate them against the membership terms, and authorize settlement to the provider.

### Trigger
A benefit request (claim) submitted via:
- Provider portal direct entry
- SMART or Slade360 integration
- Excel bulk import (KCB-flagged: Avenue's batch claims-from-facility workflow)
- Manual capture by claims clerk (for paper-based submissions)

### Primary actor
Benefit Reviewer.

### Secondary actors
- Senior Benefit Reviewer (escalations)
- Medical Advisor (clinical review)
- Finance (settlement)
- Member (notification, especially for co-contribution required or declined claims)
- Provider (settlement recipient)

### Pre-conditions
- Membership is in `ACTIVE` status on the service date (lapsed memberships allow benefit requests for dates of service before lapse)
- Service date is within the cover period for the relevant package

### Step-by-step sequence

**Step 1 — Submission capture.** The benefit request captures:
- Membership and life
- Provider, service date, encounter type (outpatient/inpatient/dental/etc.)
- Linked PA reference (if applicable)
- Itemized service lines: each with CPT code, ICD-10 code(s), quantity, unit cost, total cost
- Supporting documents: itemized invoice, lab results, discharge summary (for inpatient), prescription (for pharmacy)
- Provider's invoice number (must be unique per provider — KCB-flagged hard constraint)

**Step 2 — Hard-gate validation.** Per the fraud and quality specifications, the system applies deterministic gates at receipt:
- Composite uniqueness on (provider × invoice number) — duplicate provider invoices rejected
- Composite uniqueness on (provider × service code × member × service date) — KCB-flagged double-capture prevention
- Temporal gates: discharge date not before admission date; service date not in the future; service date not before membership cover start
- Logical gates: gender-appropriate procedures (no maternity claims on male members), age-appropriate procedures (no pediatric immunization on adults)
- Diagnosis-procedure coherence: procedures and diagnoses align per the configured clinical pathway rules

Failures route back to the submitting party with structured remediation guidance.

**Step 3 — Benefit eligibility check.** The system validates:
- Membership is active on service date
- Diagnosis is not on the exclusion list
- Procedure is covered under the active benefit package
- Applicable waiting period has elapsed
- Benefit category has remaining capacity (after subtracting active holds and prior consumption)
- If a PA exists for this service: the PA is linked, valid, and the actual service matches the authorized service

Failures move the claim to a structured decline state with reason code, not to the reviewer queue.

**Step 4 — Cost evaluation.** The system computes:
- Contracted rate for the service at this provider (from the `ContractedRate` table)
- Variance between billed amount and contracted rate
- Member's co-contribution per the co-contribution rules
- Net benefit payable: contracted rate minus member's co-contribution, capped at remaining benefit limit

The contracted-rate-vs-billed variance is a fraud signal; significant variance triggers fraud rule firing per the engine.

**Step 5 — Fraud screening.** All applicable fraud rules from the engine are evaluated:
- Provider-level rules (over-servicing, upcoding patterns, unbundling)
- Member-level rules (repeat utilization, unusual patterns)
- PSHP-specific rules (internal-vs-external provider parity, conflicted adjudicator)
- Any high-severity fire routes the claim to senior review with the fraud context attached

**Step 6 — Reviewer queue.** Claims passing automated gates enter the reviewer queue:
- Distributed by allocation rule (round-robin, by claim value band, by provider)
- The reviewer sees: claim detail, member's recent history, similar approvals, any fraud signals, the PA link if applicable, comparable claims for the same procedure
- Available actions: approve (with possible line-item adjustment), decline (with reason code), query the provider (request more info), escalate to senior, escalate to medical advisor

**Step 7 — Reviewer decision.** For each line item, the reviewer can:
- Approve at billed amount (within contracted rate tolerance)
- Approve with adjustment (record the difference and reason)
- Decline the line (record reason code)

The full claim outcome is the aggregation of line-item outcomes.

**Step 8 — Senior approval threshold.** Claims above the reviewer's authority limit must be approved by a Senior Benefit Reviewer:
- Default threshold: KES 100,000 net payable (configurable per scheme)
- Senior cannot be the same human as the reviewer
- All decisions logged to the audit chain

**Step 9 — Member notification.** Member is notified of the decision:
- Amount approved
- Amount the member must pay (co-contribution + any decline amount the member is liable for)
- Provider settlement timeline
- Decline reasons if applicable (with appeal path)

**Step 10 — Provider settlement preparation.** Approved claims are queued for settlement:
- Aggregated into settlement batches per provider per cycle
- Per the scheme's payment terms (typically 30 days)
- Settlement runs are themselves subject to maker-checker

**Step 11 — Benefit consumption recording.** On approval, the member's benefit balance is updated:
- Active benefit category balance decremented
- Sub-limit usage incremented
- Period-to-date utilization updated for analytics
- If the claim was preceded by a PA: the PA hold is released and replaced with the actual consumption

### Decision points

- Member-paid claims (Process 10) follow a similar adjudication flow but with the member as the settlement recipient rather than the provider
- Claims with disputed line items can be partially approved with the disputed lines moving to a separate query/dispute workflow
- Claims linked to a fraud investigation are paused pending investigation outcome
- Appeals on declined claims trigger a re-review by a different reviewer

### Terminal states

- `APPROVED_FOR_SETTLEMENT` — fully approved, queued for provider payment
- `PARTIALLY_APPROVED` — some lines approved, some declined; both outcomes recorded
- `DECLINED` — entire claim declined
- `QUERIED` — sent back to provider for more information; pauses SLA clock
- `UNDER_INVESTIGATION` — paused pending fraud investigation
- `APPEALED` — under re-review after decline

### Data model touchpoints

`BenefitRequest`, `BenefitRequestLineItem`, `Encounter`, `PreAuthRequest` (if linked), `ContractedRate`, `MembershipBenefitState`, `FraudRuleEvaluation`, `ProviderSettlementBatch`, `AuditChainEntry`.

### Antigravity verification checklist

- [ ] Composite uniqueness constraints on (provider × invoice number) and (provider × service code × member × service date) are enforced as hard database constraints, not application-level checks
- [ ] Bill state machine is explicitly modeled: `INCURRED` → `RECEIVED` → `CAPTURED` → `AUTHORIZED` → `SETTLED` (or `REJECTED`)
- [ ] Excel bulk claims import works and validates against the canonical template
- [ ] Line-item-level approval/decline is supported (not just whole-claim outcomes)
- [ ] Contracted rate vs billed variance is computed and surfaces as a fraud signal when threshold exceeded
- [ ] Senior approval threshold is enforced server-side and audit-logged
- [ ] PA-linked claims correctly close the PA hold and replace with actual consumption
- [ ] Member benefit balance updates are atomic with claim approval (no race conditions)
- [ ] Member notifications use the terminology engine and respect channel preferences
- [ ] Appeal workflow exists with re-review by different reviewer

---

## 10. Reimbursement Processing

### Purpose
To handle benefit requests where the member paid the provider directly and is seeking reimbursement, rather than the provider seeking direct settlement.

### Trigger
A member-paid claim submitted via:
- Member portal upload
- Email submission to claims address (manually entered by clerk)
- Walk-in counter submission (manually entered)

### Primary actor
Benefit Reviewer.

### Secondary actors
- Member (recipient of reimbursement)
- Senior Benefit Reviewer (escalations)
- Finance (reimbursement disbursement)

### Pre-conditions
- Membership is active on service date
- Member submits within the scheme's reimbursement window (default 90 days from service)
- Member provides proof of payment (receipt, M-Pesa confirmation)

### Step-by-step sequence

The flow is operationally similar to Process 9 with key differences:

1. **Submission capture** includes the proof-of-payment evidence (receipt photo or M-Pesa SMS image; M-Pesa transactions verified against Daraja API where possible per the fraud spec — fake confirmation SMS being the primary risk)
2. **Provider validation** — even though the provider is not the submitter, the provider's network status as of service date is checked; out-of-network reimbursement may apply different co-contribution rates
3. **Adjudication** follows the same logic as Process 9
4. **Payout target** is the member's registered bank account or M-Pesa number, not the provider
5. **Disbursement** is via direct payment to the member, captured against the membership ledger
6. **Member receives** notification confirming reimbursement amount and timeline

### Antigravity verification checklist

- [ ] Reimbursement workflow is operationally distinct from provider-paid claims
- [ ] Member's banking/M-Pesa details are captured and validated before reimbursement
- [ ] Proof of payment verification handles both photo and SMS-based proofs; M-Pesa confirmations are cross-checked via Daraja where possible
- [ ] Reimbursement window enforcement is configurable per scheme
- [ ] Out-of-network reimbursement applies the appropriate co-contribution rate

---

## 11. Renewal Cycle Management

### Purpose
To manage the periodic renewal of memberships, including loss experience review, rate recalculation, scheme negotiation, and renewal binding.

### Trigger
A scheduled job identifies memberships approaching renewal date. Renewal cycle initiates 90 days before expiry by default (configurable per scheme).

### Primary actor
Senior Membership Assessor (for assessment), Scheme Manager (for commercial relationship), Membership Assessor (for re-pricing).

### Secondary actors
- Broker (commercial counterpart)
- Member or scheme decision-makers
- Finance (settlement of prior period balances)

### Pre-conditions
- The renewable membership/scheme exists in the system
- Sufficient loss history is available (typically 9+ months of the current period)

### Step-by-step sequence

**Step 1 — Renewal pipeline visibility.** Per the Strategic Purchasing Console, all schemes due for renewal in the next 90 days appear in the renewal pipeline:
- Scheme name, current member count, current contribution, current MLR
- Renewal due date, days remaining
- Renewal intelligence pre-computed: trailing 12-month MLR, target MLR, recommended adjustment with rationale
- Status: not started, in progress, quote issued, negotiating, bound, lapsed, cancelled

**Step 2 — Loss experience review.** For each renewing scheme, the assessor reviews:
- Trailing 12-month MLR vs target
- Period-over-period MLR trend
- Top utilizing members (anonymized for individual review, not scheme-level disclosure)
- Top driver ICD-10 families and procedures
- Provider concentration (where claims went)
- Comparison to similar schemes (peer benchmarking)
- Operational quality indicators (PA approval rate, fraud signal rate, member satisfaction if available)

**Step 3 — Renewal recommendation.** Per the renewal intelligence algorithm (see Strategic Purchasing & Analytics specification):

```
if trailingMlr < targetMlr * 0.85: recommendation = -2.5% (over-pricing scenario)
if trailingMlr <= targetMlr * 1.05: recommendation = inflation adjustment only
if trailingMlr <= targetMlr * 1.20: recommendation = +(actual - target) + inflation
if trailingMlr > targetMlr * 1.20: recommendation = +(actual - target) * 1.1 + inflation, flag for actuarial review
```

The recommendation is guidance, not automatic. Final pricing is a human decision.

**Step 4 — Scenario simulation.** The assessor uses the Renewal Intelligence Workspace simulator to model alternative scenarios:
- Different rate adjustments and their projected MLR
- Benefit modifications (e.g. introducing or raising co-contribution to bring projected MLR back to target)
- Network tier changes
- Member exclusions or new waiting periods

**Step 5 — Pre-renewal communication.** Scheme Manager initiates the commercial conversation:
- Renewal notice dispatched (default 60 days before expiry per KCB reference)
- Loss experience summary shared with the scheme/broker
- Initial renewal terms proposed

**Step 6 — Re-assessment for material changes.** If the scheme accepts re-pricing without major changes: Membership Assessor performs a lightweight re-assessment (validating that no high-attention events have occurred). If the scheme is negotiating material changes (different package, different network, different headcount commitment): full re-assessment per Process 3.

**Step 7 — Renewal quotation.** Per Process 4, with the difference that the quote is flagged `RENEWAL` and references the prior membership. The renewal quotation includes:
- Comparison to current period rates
- Justification narrative for any rate movement
- Effective date (the new cover start, aligned with current cover end + 1 day)

**Step 8 — Renewal acceptance or non-renewal.** Three outcomes possible:
- **Acceptance** — flows through Process 5 (Membership Binding) with the prior membership recorded as superseded by the new one; member numbers carry over for individuals (avoiding card replacement); waiting periods are not re-applied for continuously-renewed members
- **Negotiation** — the scheme requests revised terms; cycle returns to Step 4
- **Non-renewal** — the scheme or Avenue does not renew; the membership moves to Process 12 (Lapse)

**Step 9 — Final period reconciliation.** For renewed schemes:
- Outstanding contributions for the prior period must be settled (or a settlement plan agreed)
- Outstanding provider settlements for the prior period are processed
- Outstanding member reimbursements for the prior period are processed
- The renewal binding may be conditional on prior-period closure

**Step 10 — Age band reclassification (individual schemes).** For individual memberships using age-banded pricing:
- At renewal, each life's age band is recomputed using their age as of the new cover start
- Lives that have crossed an age band boundary move to the new band's rate
- The system computes and surfaces this as part of the renewal pricing

### Decision points

- Loss-leader schemes (where Avenue accepts below-target MLR for strategic reasons — e.g. major corporate, market entry) require explicit Senior Assessor sign-off with documented justification
- Schemes triggering "actuarial review" status (MLR > target × 1.20) cannot be renewed without a written actuarial opinion attached to the audit chain
- Schemes with material adverse events in the period (fraud findings, major regulatory issue) require Compliance Officer sign-off in addition to standard renewal approvals

### Terminal states

- `RENEWED` — new membership active, prior superseded
- `LAPSED_NON_RENEWAL` — neither party renewed; prior membership in expired state
- `WITHDRAWN_FROM_RENEWAL` — Avenue chose not to renew (with documented reason)

### Data model touchpoints

`SchemeRenewalAnalysis`, `Membership` (with `supersededByMembershipId`), `Quotation` (flagged `RENEWAL`), `UnderwritingDecision`, `RenewalDecision`, `AuditChainEntry`.

### Antigravity verification checklist

- [ ] Renewal pipeline view exists and is populated 90 days ahead
- [ ] Renewal intelligence algorithm produces correctly-computed recommendations
- [ ] Scenario simulator allows applying different rates and shows projected MLR
- [ ] Renewal quotations link to prior memberships for continuity
- [ ] Waiting periods are correctly preserved (not reset) on continuous renewal
- [ ] Age band reclassification at renewal works correctly for individual schemes
- [ ] Renewal notice dispatch job runs on schedule (default 60 days before expiry)
- [ ] Loss-leader and actuarial-review escalation paths are enforced with structured sign-off
- [ ] Renewal binding can be made conditional on prior-period reconciliation
- [ ] All renewal decisions logged to the audit chain

---

## 12. Lapse, Cancellation & Reinstatement

### Purpose
To handle the termination of memberships — voluntary, involuntary, scheduled — and the conditional restoration of lapsed memberships.

### Trigger
One of:
- Contribution payment not received within grace period (lapse)
- Member or scheme initiates voluntary cancellation
- Avenue terminates the membership (fraud, breach of terms)
- Membership reaches cover end date without renewal (natural expiry)
- Death of a member

### Primary actor
Member Operations (most cases), Membership Assessor (reinstatement assessments), Compliance Officer (fraud-driven terminations).

### Secondary actors
- Senior Member Operations (approvals)
- Finance (refunds, refund clawbacks)
- Broker (commission impact)

### Lapse flow

**Trigger.** A scheduled daily job at 23:00 EAT:
- Identifies memberships with unpaid contributions past the grace period (default 30 days from due date, configurable)
- Validates with Finance that the contribution genuinely has not been received (false positives from settlement delays are common)
- Moves qualifying memberships to `LAPSED`
- Releases all active PA holds (they cannot be utilized post-lapse anyway)
- Notifies the member, scheme, and broker
- Notifies the provider network (members in `LAPSED` status fail eligibility checks)

**Catch-up window.** Avenue's standard policy allows a catch-up window (default 60 days from lapse date) during which the membership can be reinstated by paying outstanding contributions plus any reinstatement fee. During catch-up:
- Services rendered while lapsed are at member's own cost
- No new benefits accrue
- The member can pay and reinstate without re-assessment

**Beyond catch-up.** After the catch-up window expires, reinstatement requires full re-assessment as if it were new business, with waiting periods reset.

### Voluntary cancellation flow

**Cooling-off cancellation.** If the member cancels within the cooling-off window (default 14 days from cover start, configurable per scheme):
- Full refund of contributions paid
- All benefits accessed during cooling-off are recovered (member becomes liable for full provider rates)
- Broker commission for this membership is fully clawed back
- The membership moves to `CANCELLED_COOLING_OFF`

**Standard cancellation.** Cancellation after cooling-off but before cover end:
- Pro-rata refund computed (typically less an administrative fee)
- Some schemes do not permit mid-term cancellation (specifically for corporate schemes binding multiple lives)
- The membership moves to `CANCELLED`

### Avenue-initiated termination

**Fraud termination.** When fraud investigation concludes against a member:
- Compliance Officer initiates termination with structured fraud reason code
- All future benefits suspended
- The member is added to the internal blacklist (preventing re-enrolment under same identity)
- Outstanding amounts owed to Avenue are pursued through the standard recovery flow
- Broker commission related to the fraudulent membership is fully clawed back
- The membership moves to `TERMINATED_FRAUD`

**Breach termination.** Other terms breaches (misrepresentation discovered after binding, etc.) follow a similar path with `TERMINATED_BREACH` state.

### Death of a member

**Principal death.** When proof of death is received:
- The principal membership moves to `TERMINATED_DEATH`
- Dependants are notified; depending on scheme rules, they may transfer to a separate continuation policy or be terminated
- Outstanding benefits accrued before death are still payable
- Pro-rata refund applies for the unutilized period (paid to estate or beneficiary)

**Dependant death.** A specific amendment removes the deceased dependant from the membership (Process 7) with the appropriate effective date.

### Reinstatement flow

For lapsed memberships seeking reinstatement:

**Within catch-up window.** Member Ops processes a reinstatement request:
- Outstanding contribution(s) collected
- Reinstatement fee charged (if applicable)
- The membership moves back to `ACTIVE` with no change to underwriting decisions, exclusions, or waiting periods
- Any services rendered during the lapse remain at member's own cost (these are not retroactively covered)

**Beyond catch-up window.** Full re-assessment required:
- Treated as new business (Process 3)
- Waiting periods reset
- New underwriting decisions made (which may differ from prior given any health changes)
- New rates apply

### Data model touchpoints

`Membership` (with full lifecycle state machine), `MembershipLapseRecord`, `MembershipCancellationRecord`, `MembershipTerminationRecord`, `ReinstatementRequest`, `InternalBlacklist`, `RefundQueue`, `CommissionLedgerEntry` (clawbacks), `AuditChainEntry`.

### Antigravity verification checklist

- [ ] Membership lifecycle state machine is explicitly modeled with all states: `PENDING_ACTIVATION`, `ACTIVE`, `LAPSED`, `CANCELLED`, `CANCELLED_COOLING_OFF`, `TERMINATED_FRAUD`, `TERMINATED_BREACH`, `TERMINATED_DEATH`, `EXPIRED`
- [ ] Daily lapse-detection job runs with appropriate validation against false positives
- [ ] Catch-up window is configurable per scheme and enforced
- [ ] Cooling-off cancellation includes provider clawback workflow (recovering benefits paid during the window)
- [ ] Internal blacklist is maintained and queried during new business intake (Process 3)
- [ ] Broker commission clawbacks are correctly applied for cooling-off cancellations and fraud terminations
- [ ] Provider network is notified of lapse/termination events so eligibility checks correctly fail
- [ ] Reinstatement within catch-up does not reset waiting periods or re-trigger underwriting
- [ ] Beyond-catch-up reinstatement correctly routes to full new business assessment
- [ ] All terminal lifecycle events logged to audit chain with structured reason codes

---

## 13. Exception Handling & Maker-Checker

### Purpose
To handle cases where standard rules are deliberately overridden, ensuring such overrides are governed, justified, and auditable.

### Trigger
Throughout the platform, scenarios arise where a system rule would block an action but business judgment dictates the action should proceed. This process governs how those overrides happen.

### Primary actor
Varies by override type — but always involves at least two distinct human users (maker and checker).

### Common override scenarios

| Override type | Standard rule | Override permission | Trigger threshold |
|---|---|---|---|
| Back-dated membership amendment | Effective date must be today or later | Senior Assessor | Always requires override |
| Back-dated cover start | Cover starts in future per submission gate | Senior Assessor | Always requires override |
| Rate deviation > 15% from card | Pricing must match rate card | Senior Assessor | Auto-detect at quote |
| Pre-auth approval over benefit cap | Cannot exceed remaining cap | Senior Benefit Reviewer + Compliance Officer | Auto-route |
| Claim approval despite excluded diagnosis | Excluded diagnoses are not paid | Senior Benefit Reviewer | Manually invoked |
| Force-approve flagged fraud claim | High fraud-signal claims route to investigation | Senior Benefit Reviewer + Compliance Officer | Manually invoked |
| Waive co-contribution | Co-contribution per scheme rules | Senior Benefit Reviewer | Manually invoked |
| Extend grace period for a specific membership | Standard grace period applies | Senior Assessor | Manually invoked |
| Mid-term scheme rate change | Rates locked between renewals | Senior Assessor + Scheme Manager | Manually invoked |
| Manual fraud rule threshold adjustment | Thresholds set system-wide | Compliance Officer | Manually invoked |
| Restore terminated membership | Terminations are typically final | Senior Assessor + Compliance Officer | Rare, requires documented exceptional cause |

### Generic override workflow

**Step 1 — Maker initiation.** A user encountering a blocking rule sees a "Request Override" option (if their role grants override-request permission). They:
- Select the override type from the structured list
- Provide a structured reason code from the configured list (not free text alone)
- Provide a free-text justification (supplements but does not replace the code)
- Attach supporting documents if required (e.g. for back-dated amendments, the trigger event documentation)
- Submit

**Step 2 — Routing.** The system routes to the configured approver(s):
- Single-approver overrides: routed to a designated role's queue
- Dual-approval overrides: routed to two distinct roles, both must approve
- All overrides have a target SLA (default 2 hours for operational, 24 hours for commercial)

**Step 3 — Approver decision.** The approver:
- Reviews the request, justification, and supporting documents
- Sees the system rule being overridden in plain language
- Sees the historical pattern of this maker's override requests (to detect potential abuse)
- Approves, rejects, or modifies (e.g. approves a smaller exception than requested)

**Step 4 — Application.** On approval:
- The override is applied to the underlying record
- A `OverrideRecord` is created with full provenance
- An audit chain entry is written with both maker and checker identities, structured reason code, and the pre/post state

**Step 5 — Compliance review queue.** All overrides automatically queue for periodic Compliance Officer review:
- Daily summary of overrides applied
- Monthly aggregate review against patterns (which makers are repeatedly requesting overrides? which checkers are repeatedly approving them?)
- Quarterly board-ready override report

### Maker-checker general principles

These apply across the entire platform, not just to overrides:

1. **Same user is never both maker and checker.** Enforced server-side, not just by UI.
2. **Maker-checker is enforced at the binder level minimum** (per AiCare convention) — meaning all binder-level operations require dual control.
3. **Privilege escalation is itself maker-checker.** A user being granted any permission listed in this document requires two-person approval.
4. **Reason codes are structured.** Free text supplements but never replaces structured selection. This is for regulatory tractability.
5. **Audit chain is tamper-evident** per the PSHP governance specification. Each override is hash-chained to the previous audit entry.

### Antigravity verification checklist

- [ ] `OverrideRecord` entity exists with full taxonomy support
- [ ] Maker-checker enforcement is server-side and cannot be bypassed via API
- [ ] Override reason codes are configurable structured enums, not free-text only
- [ ] Override patterns are surfaced in the override review queue (showing maker behavior over time)
- [ ] Audit chain captures both maker and checker identities, payload hashes, and reason codes
- [ ] Permission escalation workflows themselves are subject to maker-checker
- [ ] Override SLAs are tracked and escalate to senior on breach
- [ ] Daily and monthly override summary reports are auto-generated
- [ ] All thirteen override types in the table above (or whichever the codebase has implemented) are wired with appropriate approver routing

---

## 14. Portfolio Monitoring & Strategic Purchasing

### Purpose
To enable senior underwriting and scheme management to operate the membership portfolio strategically rather than reactively — informed by real-time data on loss ratios, provider performance, member risk, and emerging signals.

### Trigger
This is a continuous process, not event-driven. The relevant surfaces (Strategic Purchasing Console, Renewal Pipeline, Alert Inbox, Parity Dashboard) are accessed daily by senior actors.

### Primary actors
- Senior Membership Assessor (book oversight)
- Scheme Manager (relationship oversight)
- Compliance Officer (governance oversight)
- Chief Underwriting Officer / equivalent (portfolio-wide accountability)

### Key surfaces

**Strategic Purchasing Console.** The primary daily surface (per the Strategic Purchasing & Analytics specification):
- Portfolio MLR with sparkline
- Member count and contribution YTD
- Active alerts
- Scheme grid with per-scheme MLR, member count, contribution, alert status
- Provider performance grid (case-mix adjusted)
- Risk composition donut
- Renewal pipeline 90 days forward
- Geographic encounter heatmap

**Renewal Intelligence Workspace.** For each scheme due in 90 days: a single-screen workspace per Process 11 Step 4 with scenario simulation.

**Member Risk Workbench.** Risk-tier-filtered member views with chronic condition tags, utilization-to-cap progress bars, projected cap exceed dates. Bulk-action enrolment into care management programs.

**Alert Inbox.** Severity-coloured stream of analytics alerts and fraud alerts requiring action (per the AnalyticsAlert and fraud engine specifications).

**Parity Compliance Dashboard.** (Compliance-role only per PSHP governance spec) Internal-vs-external provider parity metrics with cohort drill-down.

**Audit Chain Explorer.** (Compliance-role only) Filterable browse of audit events with hash verification status.

### Common workflows

**Daily review.** Senior actors check the Strategic Purchasing Console at start of day:
- Any new critical or warning alerts since previous review
- Schemes with MLR drift in the past 7 days
- New schemes entering the 90-day renewal window
- Override volume since previous review

**Weekly portfolio review.** Senior leadership reviews:
- Portfolio MLR trend
- Top 10 schemes by absolute loss (best and worst)
- Renewal pipeline progress
- Override patterns
- Fraud investigation outcomes since last review

**Monthly board-ready reporting.** The system auto-generates a monthly board pack containing:
- Portfolio MLR by month
- Member count and contribution growth
- Top driver disease categories
- Provider performance summary
- Compliance metrics (parity, audit chain integrity, override volume)
- Significant events (terminations, fraud cases, regulatory communications)

### Antigravity verification checklist

- [ ] Strategic Purchasing Console exists and refreshes within documented intervals (most every 15 minutes; some on demand)
- [ ] Alert inbox supports acknowledge/resolve/escalate workflow with audit logging
- [ ] All analytics alerts (8 types per the specification) are wired and firing
- [ ] Renewal Intelligence Workspace simulator allows scenario application without modifying the underlying scheme until commit
- [ ] Member Risk Workbench supports bulk-enrolment into care management
- [ ] Parity Compliance Dashboard is access-gated to compliance role only
- [ ] Audit Chain Explorer renders the hash chain and verification status
- [ ] Monthly board pack PDF generator runs reliably and produces a well-formatted deliverable using Avenue's brand identity
- [ ] Role-based access is enforced on all senior surfaces (regular operators cannot access portfolio-level data they should not see)

---

## 15. Cross-Cutting Verification Items

Beyond the per-process checklists, these system-wide items should be verified during Antigravity's pass:

- [ ] All processes use the terminology engine for user-facing strings; no hard-coded "policy", "premium", "claim", "underwrite", etc. visible to users
- [ ] All financial values use `Decimal` type, never floating point
- [ ] All dates stored as UTC, displayed in EAT (UTC+3) on frontend
- [ ] Every mutation creates an audit log entry
- [ ] Every entity uses the never-delete convention (deactivate with effective dates, not hard delete)
- [ ] All listings are server-paginated, sortable, filterable
- [ ] All forms validate with Zod schemas shared between client and server via tRPC
- [ ] All sensitive operations (per the action_types specification in the project rules) require explicit user permission
- [ ] All Prisma migrations are reversible
- [ ] All new schema includes appropriate indexes for the documented query patterns
- [ ] Tenant scoping (`tenantId`) is enforced on every query
- [ ] The maker-checker principle is consistently enforced server-side, not just in UI

---

## 16. Recommended Antigravity Execution Approach

1. **Read pass.** Antigravity ingests this entire document plus the existing AiCare specifications it references (membership lifecycle, fraud detection, co-contribution, broker command center, competitive hardening, gap analysis, feature audit). Build a mental map of where each process is currently realized in the codebase.

2. **Inventory pass.** For each process, the agent locates the tRPC routers, services, jobs, Prisma entities, and UI components that implement the described flow. Produce an inventory document.

3. **Gap pass.** For each Antigravity verification checklist item, the agent records:
   - **Verified** — the item is implemented as described
   - **Partial** — the item exists but with material gaps
   - **Missing** — the item is not implemented
   - **Diverges** — the item is implemented but differs from this specification in a way that needs Mutuku's review

4. **Remediation pass.** For Partial and Missing items, the agent implements to the principle described. For Diverges items, the agent does not modify code; instead it raises a structured question for Mutuku's review.

5. **Verification pass.** End-to-end testing of each process using seeded data, with explicit test coverage for the decision points and edge cases described.

The output of this pass should be a single document (`AICARE_UNDERWRITER_PROCESS_AUDIT.md`) summarizing what is now verified, what was implemented, and what remains as open questions for Mutuku.

---

## Appendix A — Document Cross-References

This specification references the following prior AiCare documents:

- `AICARE_ANTIGRAVITY_BUILD_SPEC.md` — the canonical build specification
- `AICARE_GAP_ANALYSIS.md` — gap analysis against Rensoft and KCB references
- `AICARE_FEATURE_AUDIT.md` — feature-level audit checklist
- `AICARE_COMPETITIVE_HARDENING_SPEC.md` — competitive hardening sprint specification covering Broker Command Center, Terminology Engine, Strategic Purchasing, PSHP Governance, and Member Experience modules
- `AVENUE_STYLE_GUIDE.md` — brand identity reference
- Co-contribution implementation specification (prior thread)
- Fraud detection specification (prior thread, already implemented)

---

## Appendix B — Document Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | May 2026 | Mutuku (via Claude) | Initial release for Antigravity |

---

**End of specification.**
