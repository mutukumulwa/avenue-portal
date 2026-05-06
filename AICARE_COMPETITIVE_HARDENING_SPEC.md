# AiCare — Competitive Hardening Sprint Specification

**Document type:** Implementation specification for Antigravity
**Target tenant:** Avenue Healthcare (PSHP)
**Sprint duration:** 4 weeks
**Strategic objective:** Establish unambiguous technical superiority over Smart Applications International and Medbook Kenya in the Avenue Healthcare RFP evaluation
**Document version:** 1.0

---

## 0. Context and Build Orientation

This specification defines five modules to be delivered in a four-week competitive hardening sprint. Each module is designed to either (a) decisively beat the incumbent competitors on a feature category they cannot easily match, or (b) close a credibility gap that small-team vendors typically lose on in enterprise procurement.

The five modules in build order are:

1. **Broker Command Center** (Week 1)
2. **Configurable Terminology Engine** (Week 2)
3. **Strategic Purchasing & Analytics Layer** (Week 3)
4. **PSHP-Aware Fraud Controls** (Week 4, parallel track A)
5. **Member Experience Hardening** (Week 4, parallel track B)

All modules conform to AiCare's existing architectural conventions established in prior specs:

- Next.js 14 + TypeScript frontend
- PostgreSQL + Prisma 7+ ORM (using `prisma.config.ts` with `process.env.DIRECT_URL`)
- tRPC for API surface
- BullMQ + Redis for background jobs
- MinIO for object storage
- Containerized via Docker
- Hosted on Supabase (EU Frankfurt)
- All entities follow the **never-delete convention** — records are deactivated with effective date ranges, never hard-deleted
- Maker-checker controls applied at minimum to binder-level operations
- All user-facing strings routed through the terminology engine (Module 2)
- All sensitive operations logged to the immutable audit chain (Module 4)

Each module specification follows the canonical AiCare structure:
Prisma schema extensions → business logic → tRPC API surface → UI components → fraud rule additions (where applicable) → phased build order → seed data.

---

# Module 1 — Broker Command Center

## 1.1 Strategic Rationale

Both incumbent systems treat broker management as a peripheral feature. Smart's commission tooling is fragmented across `SmartCommissions` (a Zinnia product) and bespoke configurations. Medbook has no documented broker portal at all. Avenue Healthcare's commercial growth depends on broker-driven group sales — making this module a category where AiCare can deliver decisive superiority within a single sprint.

The Broker Command Center is to be the demo-anchor module. It must be feature-complete enough that a five-minute live demonstration leaves evaluators with no ambiguity about which platform is more capable.

## 1.2 Functional Scope

The module covers the full broker lifecycle:

- Broker onboarding and KYC
- Hierarchical broker structures (master broker → sub-agents → individual producers)
- Configurable commission schedules per product, scheme, and renewal cycle
- Real-time commission ledger with state tracking (earned, accrued, payable, paid, clawed-back)
- Automated commission reconciliation against contribution receipts
- Broker-facing self-service dashboard
- Broker performance analytics tied to underwriting outcomes
- Statutory tax handling (withholding tax, VAT, IRA agent levy)
- Maker-checker workflow on commission rate changes

## 1.3 Prisma Schema Extensions

```prisma
// =====================================================
// Broker entities
// =====================================================

model Broker {
  id                String              @id @default(cuid())
  brokerCode        String              @unique
  legalName         String
  tradingName       String?
  brokerType        BrokerType
  parentBrokerId    String?
  parent            Broker?             @relation("BrokerHierarchy", fields: [parentBrokerId], references: [id])
  children          Broker[]            @relation("BrokerHierarchy")

  // KYC
  iraRegistrationNumber String?         @unique
  iraExpiryDate     DateTime?
  kraPin            String?
  vatRegistered     Boolean             @default(false)
  vatNumber         String?
  bankAccountId     String?
  bankAccount       BankAccount?        @relation(fields: [bankAccountId], references: [id])
  mpesaPaybillNumber String?

  // Contact
  primaryContactName  String
  primaryContactEmail String
  primaryContactPhone String
  physicalAddress     String?
  postalAddress       String?

  // Lifecycle
  effectiveFrom     DateTime
  effectiveTo       DateTime?
  status            BrokerStatus        @default(PENDING_APPROVAL)
  approvedById      String?
  approvedAt        DateTime?

  // Relations
  producers         BrokerProducer[]
  commissionSchedules BrokerCommissionSchedule[]
  schemes           Scheme[]
  commissionLedger  CommissionLedgerEntry[]
  kycDocuments      BrokerKycDocument[]

  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt

  @@index([status, effectiveFrom, effectiveTo])
  @@index([parentBrokerId])
}

enum BrokerType {
  MASTER_BROKER
  SUB_AGENT
  TIED_AGENT
  INDIVIDUAL_PRODUCER
  BANCASSURANCE
}

enum BrokerStatus {
  PENDING_APPROVAL
  ACTIVE
  SUSPENDED
  TERMINATED
}

model BrokerKycDocument {
  id            String              @id @default(cuid())
  brokerId      String
  broker        Broker              @relation(fields: [brokerId], references: [id])
  documentType  KycDocumentType
  fileUri       String              // MinIO URI
  fileName      String
  uploadedAt    DateTime            @default(now())
  uploadedById  String
  verifiedAt    DateTime?
  verifiedById  String?
  expiresAt     DateTime?
  status        KycDocumentStatus   @default(PENDING_REVIEW)
  notes         String?

  @@index([brokerId, documentType])
}

enum KycDocumentType {
  IRA_LICENSE
  KRA_PIN_CERTIFICATE
  CR12
  PROFESSIONAL_INDEMNITY
  BANK_CONFIRMATION
  DIRECTORS_ID
  TAX_COMPLIANCE_CERTIFICATE
  OTHER
}

enum KycDocumentStatus {
  PENDING_REVIEW
  VERIFIED
  REJECTED
  EXPIRED
}

model BrokerProducer {
  id            String      @id @default(cuid())
  brokerId      String
  broker        Broker      @relation(fields: [brokerId], references: [id])
  producerName  String
  producerCode  String      @unique
  iraIndividualNumber String?
  email         String
  phone         String
  effectiveFrom DateTime
  effectiveTo   DateTime?
  status        BrokerStatus @default(ACTIVE)

  schemes       Scheme[]    @relation("ProducerSchemes")

  @@index([brokerId, status])
}

// =====================================================
// Commission schedules
// =====================================================

model BrokerCommissionSchedule {
  id              String                @id @default(cuid())
  brokerId        String
  broker          Broker                @relation(fields: [brokerId], references: [id])
  scheduleName    String
  scheduleType    CommissionScheduleType

  // Applicability
  productId       String?               // null = applies to all products
  schemeId        String?               // null = applies to all schemes for broker
  clientType      ClientType?           // CORPORATE | INDIVIDUAL | null (both)

  // Calculation
  newBusinessRate Decimal               @db.Decimal(8, 5)  // e.g. 0.10000 = 10%
  renewalRate     Decimal               @db.Decimal(8, 5)
  overrideRate    Decimal?              @db.Decimal(8, 5)  // for parent broker on sub-agent business

  // Tiered logic
  tiers           CommissionTier[]

  // Lifecycle
  effectiveFrom   DateTime
  effectiveTo     DateTime?
  status          ScheduleStatus        @default(PENDING_APPROVAL)
  createdById     String
  approvedById    String?               // maker-checker required
  approvedAt      DateTime?

  ledgerEntries   CommissionLedgerEntry[]

  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  @@index([brokerId, effectiveFrom, effectiveTo])
}

enum CommissionScheduleType {
  FLAT_PERCENTAGE
  TIERED_VOLUME
  TIERED_LOSS_RATIO
  HYBRID_FLAT_PLUS_OVERRIDE
  PERFORMANCE_LINKED
}

enum ScheduleStatus {
  DRAFT
  PENDING_APPROVAL
  ACTIVE
  SUPERSEDED
  REJECTED
}

model CommissionTier {
  id              String                    @id @default(cuid())
  scheduleId      String
  schedule        BrokerCommissionSchedule  @relation(fields: [scheduleId], references: [id])
  tierOrder       Int
  thresholdMetric TierMetric
  thresholdMin    Decimal                   @db.Decimal(18, 2)
  thresholdMax    Decimal?                  @db.Decimal(18, 2)
  rate            Decimal                   @db.Decimal(8, 5)

  @@index([scheduleId, tierOrder])
}

enum TierMetric {
  GROSS_CONTRIBUTION_BAND
  MEMBER_COUNT_BAND
  LOSS_RATIO_BAND
  RENEWAL_RETENTION_BAND
}

// =====================================================
// Commission ledger
// =====================================================

model CommissionLedgerEntry {
  id                  String                  @id @default(cuid())
  brokerId            String
  broker              Broker                  @relation(fields: [brokerId], references: [id])
  scheduleId          String?
  schedule            BrokerCommissionSchedule? @relation(fields: [scheduleId], references: [id])

  // Source transaction
  schemeId            String
  contributionReceiptId String?
  membershipId        String?

  // State machine
  state               CommissionState
  stateAsOf           DateTime                @default(now())

  // Amounts
  grossCommission     Decimal                 @db.Decimal(18, 2)
  withholdingTax      Decimal                 @db.Decimal(18, 2)  // 10% per Kenya Income Tax Act
  vatAmount           Decimal                 @db.Decimal(18, 2)  // 16% if VAT-registered
  iraAgentLevy        Decimal                 @db.Decimal(18, 2)
  netPayable          Decimal                 @db.Decimal(18, 2)
  currency            String                  @default("KES")

  // Period
  earnedPeriodStart   DateTime
  earnedPeriodEnd     DateTime

  // Payment
  paidAt              DateTime?
  paymentReference    String?
  payoutBatchId       String?
  payoutBatch         CommissionPayoutBatch?  @relation(fields: [payoutBatchId], references: [id])

  // Clawback
  clawbackParentId    String?
  clawbackParent      CommissionLedgerEntry?  @relation("ClawbackChain", fields: [clawbackParentId], references: [id])
  clawbackChildren    CommissionLedgerEntry[] @relation("ClawbackChain")
  clawbackReason      String?

  notes               String?
  createdAt           DateTime                @default(now())

  @@index([brokerId, state, earnedPeriodStart])
  @@index([schemeId, earnedPeriodStart])
  @@index([payoutBatchId])
}

enum CommissionState {
  PENDING_RECONCILIATION  // contribution received but not matched
  EARNED                  // matched to contribution, not yet payable
  ACCRUED                 // earned, awaiting payment cycle
  PAYABLE                 // approved for next payout batch
  PAID                    // disbursed
  CLAWED_BACK             // reversed due to refund/cancellation
  ON_HOLD                 // disputed or under investigation
}

model CommissionPayoutBatch {
  id              String                  @id @default(cuid())
  batchReference  String                  @unique
  batchDate       DateTime
  totalGross      Decimal                 @db.Decimal(18, 2)
  totalWHT        Decimal                 @db.Decimal(18, 2)
  totalVAT        Decimal                 @db.Decimal(18, 2)
  totalLevy       Decimal                 @db.Decimal(18, 2)
  totalNet        Decimal                 @db.Decimal(18, 2)
  currency        String                  @default("KES")
  status          PayoutBatchStatus
  generatedById   String
  approvedById    String?
  approvedAt      DateTime?
  disbursedAt     DateTime?

  entries         CommissionLedgerEntry[]
  createdAt       DateTime                @default(now())
}

enum PayoutBatchStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  IN_TRANSIT
  COMPLETED
  PARTIAL_FAILURE
}
```

## 1.4 Business Logic — Commission Calculation Engine

The commission engine evaluates each contribution receipt event and produces ledger entries.

### Calculation pipeline

For every confirmed contribution receipt event, the engine executes the following ordered steps:

**Step 1 — Schedule resolution.** Identify the active `BrokerCommissionSchedule` for the (broker, scheme, product, effective date) tuple. If no schedule exists, the entry is created with state `PENDING_RECONCILIATION` and a system flag is raised.

**Step 2 — Base rate determination.**
- New business if the membership is in its first contribution period.
- Renewal rate otherwise.
- For tiered schedules, evaluate the tier whose threshold metric is met as of the calculation date.

**Step 3 — Hierarchical override.** If the producing broker has a parent (sub-agent under master broker), generate a second ledger entry for the parent at the override rate. The override rate is capped such that combined producer + parent rate never exceeds the gross commission ceiling defined in the product configuration.

**Step 4 — Statutory deductions.**
Applied in this order, each computed against the gross commission:
- Withholding tax: 10% (Kenya Income Tax Act, agent commissions)
- IRA agent levy: as configured (typically 0.2% of gross premium, but applied to commission as configured)
- VAT: 16% added if broker is VAT-registered (output tax, not deduction)

Net payable = Gross – WHT – Levy + VAT

**Step 5 — Ledger entry creation.** Entry is written with state `EARNED`. A subsequent scheduled job promotes entries to `PAYABLE` according to the broker's payout cycle.

### Reconciliation

A nightly BullMQ job (`reconcile-commissions`) runs at 02:00 EAT and:
1. Identifies all `PENDING_RECONCILIATION` entries
2. Attempts to match against confirmed contribution receipts via `(schemeId, contributionPeriod, brokerId)` triple
3. Promotes matched entries to `EARNED`
4. Flags entries unmatched after 30 days for manual investigation
5. Generates a daily reconciliation report stored in MinIO and emailed to the finance lead

### Clawback

When a contribution is reversed (refund, scheme cancellation within cooling-off, fraud detection), the engine generates a negative ledger entry referencing the original via `clawbackParentId`. If the original entry is already `PAID`, the clawback amount is applied against the next payout batch for the broker. If the broker has insufficient pending commissions to absorb the clawback, the system raises an alert for finance team intervention and locks future payouts until resolved.

### Maker-checker on rate changes

Any change to a `BrokerCommissionSchedule` rate field (new rate, renewal rate, override rate, tier thresholds) requires:
1. Maker creates draft schedule with status `DRAFT`
2. Maker submits with status `PENDING_APPROVAL`
3. Different user with `commission:approve` permission reviews and approves
4. On approval, prior schedule for same (broker, product, scheme, clientType) is automatically marked `SUPERSEDED` with `effectiveTo` set to the new schedule's `effectiveFrom` minus one day
5. All four events are written to the immutable audit log

## 1.5 tRPC API Surface

```typescript
// router: broker
broker.list({ status?, brokerType?, search?, cursor?, limit })
broker.getById({ id })
broker.create({ ...BrokerInput })           // requires broker:create
broker.update({ id, ...BrokerUpdateInput }) // requires broker:update
broker.deactivate({ id, effectiveTo, reason })  // never delete
broker.approve({ id })                       // requires broker:approve

// router: brokerKyc
brokerKyc.uploadDocument({ brokerId, documentType, file })
brokerKyc.verifyDocument({ documentId, verified, notes })
brokerKyc.listForBroker({ brokerId })

// router: brokerProducer
brokerProducer.list({ brokerId, status? })
brokerProducer.create({ brokerId, ...ProducerInput })
brokerProducer.deactivate({ id, effectiveTo, reason })

// router: commissionSchedule
commissionSchedule.list({ brokerId?, status?, productId? })
commissionSchedule.getById({ id })
commissionSchedule.createDraft({ ...ScheduleInput })
commissionSchedule.submitForApproval({ id })
commissionSchedule.approve({ id })          // maker-checker enforced server-side
commissionSchedule.reject({ id, reason })
commissionSchedule.simulate({ id, contributionAmount, scenarioInputs })

// router: commission
commission.ledger({ brokerId?, state?, periodFrom?, periodTo?, cursor?, limit })
commission.summary({ brokerId, periodFrom, periodTo })
commission.statementForBroker({ brokerId, periodFrom, periodTo, format: 'PDF' | 'XLSX' })

// router: commissionPayout
commissionPayout.generateBatch({ asOfDate, brokerIds? })
commissionPayout.listBatches({ status?, dateFrom?, dateTo? })
commissionPayout.getBatchDetail({ batchId })
commissionPayout.approveBatch({ batchId })
commissionPayout.markDisbursed({ batchId, disbursementReference })
commissionPayout.recordFailure({ batchId, entryIds, failureReason })

// router: brokerAnalytics
brokerAnalytics.bookOfBusiness({ brokerId, asOf? })  // schemes, members, contribution
brokerAnalytics.lossRatioByBroker({ periodFrom, periodTo, brokerIds? })
brokerAnalytics.retentionRate({ brokerId, periodFrom, periodTo })
brokerAnalytics.profitabilityRanking({ periodFrom, periodTo, limit })
```

## 1.6 UI Components

### Internal admin views (Avenue staff)
- **Broker directory** — searchable, filterable list with status badges and quick actions
- **Broker detail page** — five tabs: Overview, KYC, Producers, Commission Schedules, Performance
- **Commission schedule editor** — visual tier builder with live preview of a sample calculation
- **Commission ledger view** — filterable by broker, state, period; with bulk action to promote `EARNED` to `PAYABLE`
- **Payout batch builder** — wizard flow with preview, approval queue, and disbursement tracker
- **Broker performance dashboard** — for each broker: in-force book size, gross contribution YTD, loss ratio, retention rate, ranked against peers

### Broker self-service portal (separate authenticated surface at /broker)
- **Dashboard** — at-a-glance: in-force memberships, commission earned this month, commission paid YTD, loss ratio of book, upcoming renewals (next 90 days)
- **My book** — list of all schemes/members under broker with utilization indicators
- **Earnings** — full ledger access with downloadable statements
- **Renewals** — calendar view of upcoming renewals with one-click renewal initiation
- **Documents** — KYC document upload, status, expiry warnings
- **Producers** — for master brokers: manage sub-agents and producers under them

## 1.7 Reports

Six broker-related reports added to the analytics module (Module 3):

1. **BR-001:** Commission earned by broker, period-by-period
2. **BR-002:** Commission paid vs. accrued reconciliation
3. **BR-003:** Broker performance ranking (composite score)
4. **BR-004:** Loss ratio by broker / by broker book
5. **BR-005:** Renewal retention by broker
6. **BR-006:** Producer activity within hierarchical broker

## 1.8 Fraud Rules — New Additions

Six new rules added to the fraud engine specifically for the broker context:

| Rule code | Description | Trigger |
|---|---|---|
| RULE-BRK-001 | Same producer onboarding multiple high-utilization members in short window | >10 enrolments in 7 days where avg expected utilization > 80% of cap |
| RULE-BRK-002 | Commission scheme rate spike | Approved commission rate > 150% of broker's prior 12-month average |
| RULE-BRK-003 | Broker book loss ratio anomaly | Single broker's book loss ratio > 1.4× scheme average |
| RULE-BRK-004 | Producer signing claims on own enrolments | Cross-system match: claims approver = enrolling producer |
| RULE-BRK-005 | Repeated cooling-off cancellations on broker book | >5% of broker's enrolments cancelled in cooling-off period over rolling 90 days |
| RULE-BRK-006 | KYC document anomaly | Two brokers sharing identical bank account, KRA PIN, or director ID |

## 1.9 Phased Build Order — Module 1

**Day 1–2:** Prisma schema migrations, seed data for one test broker hierarchy, auth/permission additions.
**Day 3:** Commission calculation engine + reconciliation BullMQ job.
**Day 4:** Internal admin UI — broker directory, broker detail, commission schedule editor.
**Day 5:** Commission ledger view + payout batch builder.
**Day 6:** Broker self-service portal (dashboard + earnings + book).
**Day 7:** Reports BR-001 through BR-006, fraud rules RULE-BRK-001 through RULE-BRK-006, end-to-end test of full lifecycle.

## 1.10 Seed Data

Required seed data for demo readiness:

- 3 master brokers, 2 sub-agents per master, 2 producers per sub-agent
- 1 active commission schedule per broker covering both new business and renewals
- 1 tiered schedule example showing volume-based escalation
- 90 days of synthetic contribution receipts producing 200+ ledger entries spread across all states
- 2 historical payout batches (one completed, one in approval)
- Sample KYC documents (PDF stubs in MinIO) for one fully verified broker

---

# Module 2 — Configurable Terminology Engine

## 2.1 Strategic Rationale

Avenue Healthcare's core regulatory positioning depends on consistent use of membership language rather than insurance language. Both incumbents are deeply branded as insurance platforms — Smart's MediCloud CBA is explicitly marketed for "HMO needs and health insurance operations" and Medbook's flagship product is named MediClaim.

Rather than building another platform with hard-coded terminology, AiCare implements a system-wide configurable terminology layer. This achieves three outcomes simultaneously:

1. Avenue gets demonstrably consistent membership language across every surface
2. White-label capability for future tenants is built in from the start, not bolted on
3. The demo can switch dictionaries live, making the architectural advantage visible

## 2.2 Functional Scope

- A tenant-scoped terminology dictionary that maps internal canonical keys to display strings
- Override layers: System default → Tenant default → Locale → User preference
- Coverage of every user-facing string surface: UI labels, button text, email templates, SMS templates, PDF outputs, report headers, API response field aliases, system notifications
- Real-time switching for demo purposes
- Translation memory pattern for future i18n expansion (en-KE primary, sw-KE planned)
- Change history with maker-checker on tenant-default modifications
- A regulatory positioning artifact generator — produces a one-page PDF summarizing terminology usage for a tenant's legal team

## 2.3 Prisma Schema Extensions

```prisma
model TerminologyKey {
  id            String                    @id @default(cuid())
  canonicalKey  String                    @unique  // e.g. "entity.policy.singular"
  category      TerminologyCategory
  description   String                    // human-readable explanation of what this key represents
  context       String?                   // optional context/example
  defaultValue  String                    // system default English value
  isSensitive   Boolean                   @default(false)  // regulatory-significant terms

  values        TerminologyValue[]

  createdAt     DateTime                  @default(now())
  updatedAt     DateTime                  @updatedAt

  @@index([category])
}

enum TerminologyCategory {
  ENTITY_NOUN              // e.g. policy → membership
  ENTITY_NOUN_PLURAL
  ROLE_NOUN                // e.g. policyholder → member
  FINANCIAL_TERM           // e.g. premium → contribution
  PROCESS_VERB             // e.g. underwrite → assess
  PRODUCT_TERM             // e.g. policy → package
  STATUS_TERM
  DOCUMENT_TYPE
  UI_LABEL
  EMAIL_TEMPLATE_FRAGMENT
  SMS_TEMPLATE_FRAGMENT
  PDF_HEADING
  REPORT_TITLE
  ERROR_MESSAGE
  SYSTEM_NOTIFICATION
}

model TerminologyValue {
  id            String              @id @default(cuid())
  keyId         String
  key           TerminologyKey      @relation(fields: [keyId], references: [id])
  scope         TerminologyScope
  scopeRef      String?             // tenantId for TENANT scope, locale code for LOCALE scope, userId for USER
  locale        String              @default("en-KE")
  value         String

  effectiveFrom DateTime
  effectiveTo   DateTime?
  status        TerminologyValueStatus  @default(ACTIVE)

  createdById   String
  approvedById  String?
  approvedAt    DateTime?

  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt

  @@unique([keyId, scope, scopeRef, locale, effectiveFrom])
  @@index([scope, scopeRef, status])
}

enum TerminologyScope {
  SYSTEM_DEFAULT
  TENANT_DEFAULT
  LOCALE_OVERRIDE
  USER_PREFERENCE
}

enum TerminologyValueStatus {
  DRAFT
  PENDING_APPROVAL
  ACTIVE
  SUPERSEDED
  REJECTED
}

model TerminologyDictionarySnapshot {
  id            String              @id @default(cuid())
  tenantId      String
  snapshotName  String
  snapshotData  Json                // full key→value map at point in time
  generatedAt   DateTime            @default(now())
  generatedById String
  notes         String?

  @@index([tenantId, generatedAt])
}
```

## 2.4 Resolution Order

For any given canonical key, the resolution algorithm is:

1. Check `USER_PREFERENCE` for current user
2. Check `LOCALE_OVERRIDE` for current locale (e.g. sw-KE)
3. Check `TENANT_DEFAULT` for current tenant
4. Fall back to `SYSTEM_DEFAULT`

Resolution is cached in Redis with key `term:{tenantId}:{locale}:{userId|null}` and a 5-minute TTL. Cache is invalidated on any value mutation.

## 2.5 Implementation Strategy

### Frontend — React hook + provider

```typescript
// useTerminology hook usage in components
const t = useTerminology();
return <h1>{t('entity.policy.plural')} dashboard</h1>;
// renders "Memberships dashboard" for Avenue tenant
// renders "Policies dashboard" for a default tenant
```

A `TerminologyProvider` at the app root loads the active dictionary on session start and provides the resolution function via React context. Hot updates propagate via a server-sent event channel so demo-time switching works without page reload.

### Backend — middleware + template engine

A tRPC middleware injects a `terminology` resolver into every request context, available for use in:
- Email/SMS template rendering (handlebars custom helper `{{t "entity.member.singular"}}`)
- PDF generation (server-side resolution before render)
- Error messages (Zod error map customization)
- API response field aliases (optional — for future B2B integrations)

### Coverage enforcement

A static analysis step in the build pipeline scans for hard-coded user-facing strings outside the terminology system. Any string in JSX, email templates, PDF templates, or notification copy that is not wrapped in a `t()` call generates a build warning. By end of week 2, the codebase passes with zero violations.

## 2.6 Avenue Default Dictionary

The Avenue tenant ships with a pre-loaded dictionary covering every regulatory-significant term. Categories and example mappings:

| Canonical key | System default | Avenue value |
|---|---|---|
| `entity.policy.singular` | Policy | Membership |
| `entity.policy.plural` | Policies | Memberships |
| `role.policyholder.singular` | Policyholder | Member |
| `role.principal_member.singular` | Principal insured | Principal member |
| `financial.premium.singular` | Premium | Contribution |
| `financial.premium.plural` | Premiums | Contributions |
| `financial.benefit_limit` | Sum insured | Benefit limit |
| `financial.copay` | Co-payment | Co-contribution |
| `financial.deductible` | Deductible | Member share |
| `process.underwrite.verb` | Underwrite | Assess eligibility |
| `process.claim.verb` | File a claim | Request benefit |
| `process.claim.noun` | Claim | Benefit request |
| `process.adjudicate.verb` | Adjudicate | Review |
| `product.policy.term` | Policy term | Membership year |
| `product.cover_type` | Insurance cover | Benefit package |
| `status.policy.active` | In force | Active membership |
| `status.policy.lapsed` | Lapsed | Inactive membership |
| `document.policy_certificate` | Policy certificate | Membership certificate |
| `document.endorsement` | Policy endorsement | Membership amendment |
| `document.schedule` | Policy schedule | Benefit schedule |

The full dictionary contains approximately 240 keys covering UI, email/SMS templates, PDF outputs, error messages, and report titles. The complete mapping is delivered as seed data.

## 2.7 tRPC API Surface

```typescript
// router: terminology
terminology.dictionary({ tenantId?, locale?, userId? })  // resolved dictionary for context
terminology.listKeys({ category?, search?, cursor?, limit })
terminology.getValueChain({ keyId, tenantId, locale })   // shows resolution chain for debugging

// router: terminologyAdmin (requires terminology:admin permission)
terminologyAdmin.proposeTenantValue({ keyId, tenantId, value, locale, effectiveFrom })
terminologyAdmin.approveValue({ valueId })               // maker-checker
terminologyAdmin.rejectValue({ valueId, reason })
terminologyAdmin.bulkImportTenantDictionary({ tenantId, csvFile })
terminologyAdmin.exportTenantDictionary({ tenantId, format: 'CSV' | 'JSON' })
terminologyAdmin.snapshotDictionary({ tenantId, snapshotName, notes })
terminologyAdmin.compareSnapshots({ snapshotIdA, snapshotIdB })

// router: terminologyArtifact
terminologyArtifact.generateRegulatoryPositioningPdf({ tenantId, signatoryName?, signatoryTitle? })
```

## 2.8 The Regulatory Positioning Artifact

A specific deliverable for Avenue's legal team. The artifact generator produces a PDF document containing:

- Tenant name and effective date of dictionary version
- A two-column comparison showing every regulatory-significant term: "Insurance industry term" vs. "Term used by [Tenant]"
- A statement of which terms are explicitly never used in any user-facing surface
- A list of all document templates affected (membership certificate, benefit schedule, etc.)
- Signature blocks for legal counsel and compliance officer
- Embedded SHA-256 hash of the dictionary state as a tamper-evidence anchor

This single artifact gives Avenue's general counsel an internal champion document that no incumbent can produce.

## 2.9 UI Components

- **Terminology browser** — filterable list of all canonical keys grouped by category, showing system default and current tenant value side-by-side
- **Tenant dictionary editor** — inline edit with maker-checker workflow visible
- **Live preview pane** — selecting a key shows every UI surface where it appears with current rendering
- **Snapshot manager** — list of historical snapshots with diff view between any two
- **Demo mode toggle** — for sales presentations, switches between "Insurance" and "Membership" dictionary instantly with visible UI re-render

## 2.10 Phased Build Order — Module 2

**Day 1:** Prisma schema + resolution algorithm + Redis caching + tRPC routers.
**Day 2:** React hook, provider, SSE channel for live updates; terminology browser UI.
**Day 3:** Sweep of existing codebase to wrap all user-facing strings; build pipeline static analysis check.
**Day 4:** Email/SMS template integration, PDF generation integration; tenant dictionary editor with maker-checker.
**Day 5:** Avenue default dictionary seed; snapshot manager; regulatory positioning PDF artifact generator.
**Day 6:** Demo mode toggle; documentation; end-to-end testing including a "switch dictionary" demo script.
**Day 7:** Buffer, polish, edge case handling (variables in templates, pluralization rules).

## 2.11 Seed Data

- Full Avenue dictionary (~240 keys with values)
- One example "default insurance" snapshot for demo comparison
- One historical snapshot showing a prior version with notes
- Pre-generated regulatory positioning PDF for Avenue

---

# Module 3 — Strategic Purchasing & Analytics Layer

## 3.1 Strategic Rationale

Both incumbents treat reporting as bolted-on dashboards layered over a transactional core. Their data models do not support real-time strategic decisions — only retrospective reconciliation. Avenue Healthcare's research history (the Strathmore studies on Avenue's "passive" purchasing) shows that their commercial team needs analytical tools that drive proactive scheme management, not just monthly reports.

The Strategic Purchasing layer reframes analytics as an operational tool: live dashboards drive renewal pricing, provider tier negotiations, and risk-stratified care management. This is positioned as the difference between a "claims processor" and a "membership business management platform."

## 3.2 Functional Scope

- Real-time medical loss ratio (MLR) computation at multiple granularities
- Provider performance comparison with case-mix adjustment
- Member risk stratification (chronic disease registry + predicted utilization)
- Renewal intelligence: 90-day forward-looking pricing recommendations
- Corporate scheme profitability views
- Geographic and disease-pattern analytics
- Alert engine for trending concerns (MLR drift, utilization spikes, provider anomalies)
- Configurable role-based data access

## 3.3 Architectural Approach

A read-optimized analytical schema runs alongside the transactional Prisma schema. Materialized views in PostgreSQL refresh on configurable intervals (most every 15 minutes; some on-demand). For complex aggregations, a denormalized event store accumulates encounter, contribution, and benefit-utilization events.

For the four-week sprint, advanced ML predictions are deliberately scoped out of the build. Instead, a pragmatic statistical approach is used: rolling averages, peer-group comparisons, simple trend extrapolation. This is intentional — committing to ML predictions in a 4-week build invites over-promising and tuning issues that surface during implementation. The architecture leaves clear seams for ML insertion in a later phase.

## 3.4 Prisma Schema Extensions

```prisma
// =====================================================
// Analytics event store (denormalized for read performance)
// =====================================================

model AnalyticsEncounterFact {
  id                  String      @id @default(cuid())
  encounterId         String      @unique
  membershipId        String
  schemeId            String
  brokerId            String?
  facilityId          String
  facilityType        FacilityType
  isInternalProvider  Boolean     // true if Avenue-owned facility
  encounterDate       DateTime
  encounterType       EncounterType  // OUTPATIENT | INPATIENT | DENTAL | OPTICAL | ...
  primaryIcd10        String?
  primaryIcd10Family  String?     // first 3 chars (chapter/block)

  grossCost           Decimal     @db.Decimal(18, 2)
  benefitPaid         Decimal     @db.Decimal(18, 2)
  memberCoContribution Decimal    @db.Decimal(18, 2)
  rejectedAmount      Decimal     @db.Decimal(18, 2)

  caseMixWeight       Decimal?    @db.Decimal(8, 4)  // computed at write time

  memberAgeBand       String      // "0-5", "6-17", "18-35", ...
  memberGender        String

  geoCounty           String?
  geoSubcounty        String?

  createdAt           DateTime    @default(now())

  @@index([schemeId, encounterDate])
  @@index([brokerId, encounterDate])
  @@index([facilityId, encounterDate])
  @@index([primaryIcd10Family, encounterDate])
  @@index([membershipId, encounterDate])
}

model AnalyticsContributionFact {
  id              String      @id @default(cuid())
  contributionId  String      @unique
  schemeId        String
  brokerId        String?
  receiptDate     DateTime
  contributionPeriodStart DateTime
  contributionPeriodEnd   DateTime
  grossContribution       Decimal @db.Decimal(18, 2)
  netContribution         Decimal @db.Decimal(18, 2)  // after taxes/levies
  memberCount             Int

  @@index([schemeId, receiptDate])
  @@index([brokerId, receiptDate])
}

// =====================================================
// Risk stratification
// =====================================================

model MemberRiskProfile {
  id                  String              @id @default(cuid())
  membershipId        String              @unique
  riskTier            RiskTier
  chronicConditions   String[]            // ICD-10 codes
  predictedAnnualUtilization Decimal      @db.Decimal(18, 2)
  predictionConfidence String              // "low" | "medium" | "high"
  asOfDate            DateTime
  generatedAt         DateTime            @default(now())

  utilizationToDate   Decimal             @db.Decimal(18, 2)
  benefitCapRemaining Decimal             @db.Decimal(18, 2)
  projectedExceedDate DateTime?           // null if not projected to exceed

  @@index([riskTier, asOfDate])
  @@index([projectedExceedDate])
}

enum RiskTier {
  LOW
  STANDARD
  ELEVATED
  HIGH
  CHRONIC_MANAGED
}

// =====================================================
// Renewal intelligence
// =====================================================

model SchemeRenewalAnalysis {
  id                      String      @id @default(cuid())
  schemeId                String
  analysisDate            DateTime    @default(now())
  renewalDueDate          DateTime

  currentPeriodMlr        Decimal     @db.Decimal(8, 4)
  trailingTwelveMonthMlr  Decimal     @db.Decimal(8, 4)
  targetMlr               Decimal     @db.Decimal(8, 4)

  recommendedContributionAdjustment Decimal @db.Decimal(8, 4)  // e.g. 0.075 = +7.5%
  adjustmentBasis         String      // human-readable reasoning
  confidenceTier          String

  topUtilizers            Json        // anonymized top utilizing members
  driverIcdFamilies       Json        // disease drivers of cost

  generatedAt             DateTime    @default(now())

  @@index([renewalDueDate, schemeId])
}

// =====================================================
// Provider scorecards
// =====================================================

model ProviderScorecard {
  id                          String      @id @default(cuid())
  facilityId                  String
  scorecardPeriodStart        DateTime
  scorecardPeriodEnd          DateTime

  encounterCount              Int
  totalGrossCost              Decimal     @db.Decimal(18, 2)
  averageCostPerEncounter     Decimal     @db.Decimal(18, 2)
  caseMixAdjustedCost         Decimal     @db.Decimal(18, 2)

  fraudFlagCount              Int
  fraudFlagRate               Decimal     @db.Decimal(8, 4)  // per 100 encounters

  averageLosForInpatient      Decimal?    @db.Decimal(8, 2)
  readmissionRate             Decimal?    @db.Decimal(8, 4)

  peerPercentileCost          Decimal?    @db.Decimal(8, 2)  // percentile within facility tier
  peerPercentileQuality       Decimal?    @db.Decimal(8, 2)

  generatedAt                 DateTime    @default(now())

  @@index([facilityId, scorecardPeriodEnd])
}

// =====================================================
// Alert engine
// =====================================================

model AnalyticsAlert {
  id              String              @id @default(cuid())
  alertType       AnalyticsAlertType
  severity        AlertSeverity
  subjectType     String              // "scheme" | "broker" | "facility" | "member"
  subjectId       String
  title           String
  description     String
  metricValue     Decimal?            @db.Decimal(18, 4)
  thresholdValue  Decimal?            @db.Decimal(18, 4)
  detectedAt      DateTime            @default(now())
  acknowledgedAt  DateTime?
  acknowledgedById String?
  resolvedAt      DateTime?
  resolvedById    String?
  resolutionNotes String?

  @@index([severity, detectedAt, resolvedAt])
  @@index([subjectType, subjectId, detectedAt])
}

enum AnalyticsAlertType {
  MLR_DRIFT
  UTILIZATION_SPIKE
  PROVIDER_COST_OUTLIER
  SCHEME_PROFITABILITY_RISK
  MEMBER_CAP_PROJECTED_EXCEED
  BROKER_BOOK_LOSS_ANOMALY
  GEOGRAPHIC_CLUSTER
  DISEASE_OUTBREAK_SIGNAL
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}
```

## 3.5 Computation Logic

### Medical Loss Ratio (MLR)

For any given (scheme, period), MLR is computed as:

```
MLR = Σ(benefitPaid + memberCoContribution) ÷ Σ(grossContribution)
```

Computed at four granularities, refreshed every 15 minutes via materialized view:
- Per scheme
- Per category (within scheme)
- Per family size band
- Per broker book

A trailing 12-month rolling MLR is also maintained alongside the current-period MLR.

### Case-mix adjustment

Provider comparisons must adjust for the severity of cases each provider handles. The system maintains a simple case-mix weight table keyed by ICD-10 family + encounter type:

```
caseMixWeight = lookup(icd10Family, encounterType)
caseMixAdjustedCost = grossCost ÷ caseMixWeight
```

Weights are seeded from published diagnostic-related grouping (DRG) reference tables, then refined locally as Avenue's data accumulates. The case-mix table is admin-editable.

### Renewal intelligence algorithm

For each scheme with a renewal date in the next 90 days, a daily job computes:

1. Trailing 12-month MLR
2. Current-period MLR (for trend direction)
3. Target MLR for the scheme (configured per product)
4. Driver analysis: top 5 ICD-10 families by cost contribution
5. Top 10 utilizing members (anonymized)
6. Recommended contribution adjustment using:

```
if trailingMlr < targetMlr * 0.85: recommendation = -2.5%  # over-pricing
if trailingMlr <= targetMlr * 1.05: recommendation = inflation_adjustment
if trailingMlr <= targetMlr * 1.20: recommendation = +(actual - target) + inflation
if trailingMlr > targetMlr * 1.20: recommendation = +(actual - target) * 1.1 + inflation, flag for actuarial review
```

The recommendation is presented as guidance, not an automated rate change. Final pricing remains a human decision.

### Risk stratification

Members are classified into tiers using a deterministic rule set (no ML in this phase):

- **HIGH** — has any chronic condition flag AND >75% of cap utilized in current period
- **CHRONIC_MANAGED** — has chronic condition flag, utilization within expected range
- **ELEVATED** — utilization rate >120% of peer cohort (same age band, gender, scheme)
- **STANDARD** — utilization within 80–120% of peer cohort
- **LOW** — utilization <80% of peer cohort or no encounters

Projected cap exceed date computed via simple linear extrapolation when current-period burn rate exceeds 60% of cap.

### Alert engine

A scheduled job (`analytics-alert-sweep`) runs every hour and evaluates:

| Alert type | Trigger condition |
|---|---|
| MLR_DRIFT | Scheme MLR moved >10 percentage points in 7 days |
| UTILIZATION_SPIKE | Member's 7-day utilization > 3× their trailing 90-day average |
| PROVIDER_COST_OUTLIER | Facility's case-mix-adjusted cost > 1.5× peer median for same tier |
| SCHEME_PROFITABILITY_RISK | Scheme trailing-12 MLR > target × 1.15 |
| MEMBER_CAP_PROJECTED_EXCEED | Projected cap exceed date < renewal date |
| BROKER_BOOK_LOSS_ANOMALY | Broker book MLR > scheme average × 1.4 |
| GEOGRAPHIC_CLUSTER | County-level encounter rate for an ICD-10 family > 2× national rolling avg |
| DISEASE_OUTBREAK_SIGNAL | Single ICD-10 code shows >5× growth in 7 days within a county |

Alerts are deduplicated within a 24-hour window for the same subject + alert type.

## 3.6 The 25 Reports — Tranche Mapping

Aligns with the report backlog identified in the prior gap analysis. For this sprint, the first 12 are delivered:

**Tranche A (delivered in this sprint):**
1. RPT-001 Scheme MLR by period
2. RPT-002 Scheme MLR by category
3. RPT-003 Provider scorecard ranking
4. RPT-004 Provider cost per ICD-10 family
5. RPT-005 Renewal intelligence summary (90-day forward)
6. RPT-006 Member utilization distribution
7. RPT-007 Risk-tier composition by scheme
8. RPT-008 Top utilizing members (anonymized)
9. RPT-009 Geographic encounter heatmap data
10. RPT-010 Disease pattern by region
11. RPT-011 Co-contribution collection rate by scheme
12. RPT-012 Benefit utilization by package

**Tranche B (deferred to phase 5):** RPT-013 through RPT-020 (operational, audit, and compliance)
**Tranche C (deferred to phase 6):** RPT-021 through RPT-025 (regulatory, statutory, board)

## 3.7 tRPC API Surface

```typescript
// router: analytics
analytics.mlrSummary({ scope: 'scheme'|'category'|'familySize'|'broker', subjectId?, periodFrom, periodTo })
analytics.providerScorecard({ facilityId, periodFrom, periodTo })
analytics.providerRanking({ tier?, periodFrom, periodTo, sortBy, limit })
analytics.memberRiskProfile({ membershipId })
analytics.schemeRiskComposition({ schemeId, asOf? })
analytics.renewalIntelligence({ schemeId })
analytics.upcomingRenewals({ daysAhead })
analytics.geoEncounterHeatmap({ periodFrom, periodTo, icd10Family? })
analytics.diseasePattern({ geoLevel: 'county'|'subcounty', periodFrom, periodTo })
analytics.alerts({ severity?, status?, subjectType?, cursor?, limit })
analytics.alertAcknowledge({ alertId, notes? })
analytics.alertResolve({ alertId, resolutionNotes })

// router: analyticsReports
analyticsReports.list({ tranche? })
analyticsReports.run({ reportCode, parameters, format: 'PDF' | 'XLSX' | 'JSON' })
analyticsReports.schedule({ reportCode, parameters, cronExpression, recipients })
analyticsReports.history({ reportCode, cursor?, limit })
```

## 3.8 UI Components

### Strategic Purchasing Console (primary surface)
- **Header strip** — at-a-glance: portfolio MLR, members covered, contribution YTD, alerts count
- **Scheme grid** — every scheme with: MLR sparkline, member count, contribution, alert badge
- **Provider performance grid** — facility list ranked by case-mix-adjusted cost with sparklines
- **Risk composition donut** — portfolio breakdown by risk tier
- **Renewal pipeline** — Gantt-style 90-day forward view of upcoming renewals with MLR/recommendation
- **Geographic heatmap** — county-level utilization map (Kenya admin boundaries)

### Renewal Intelligence Workspace
- For each scheme due in 90 days: a single-screen workspace showing trailing performance, drivers, recommendation, scenario simulator (apply different rates and see projected MLR)

### Member Risk Workbench
- Risk-tier filtered member list with chronic condition tags, utilization-to-cap progress bars, and projected exceed dates
- Bulk action: enroll selected high-risk members in care management

### Alert inbox
- Severity-coloured stream
- Acknowledge / resolve / escalate workflow
- Drill-down to the underlying data that triggered the alert

## 3.9 Phased Build Order — Module 3

**Day 1:** Analytics fact table schemas + ETL job to populate from transactional schema + materialized view layer.
**Day 2:** MLR computation across all four granularities + Strategic Purchasing Console header and scheme grid.
**Day 3:** Provider scorecard + provider ranking views + case-mix table seed.
**Day 4:** Risk stratification engine + Member Risk Workbench + chronic condition registry.
**Day 5:** Renewal intelligence algorithm + Renewal Intelligence Workspace + simulator.
**Day 6:** Alert engine + Alert inbox + 5 of 12 reports built.
**Day 7:** Remaining 7 reports + geographic heatmap + end-to-end testing with seeded multi-month data.

## 3.10 Seed Data

For demo readiness:
- 18 months of synthetic encounter data (50,000+ encounters)
- 12 months of synthetic contribution data
- 30 schemes with varied MLR profiles (some healthy, some at risk, some at renewal)
- 12 facilities (mix of internal Avenue and external partners) with varied performance profiles
- Pre-computed renewal analyses for next 90 days
- 20 active alerts of varied types and severities
- Case-mix weight table loaded with reasonable defaults

---

# Module 4 — PSHP-Aware Fraud Controls

## 4.1 Strategic Rationale

The existing fraud detection spec (40+ rules across Gate Checks, Rules Engine, and Anomaly Detection) is solid. This module augments it with three additions specifically engineered for the Provider-Sponsored Health Plan (PSHP) context, where Avenue Healthcare is simultaneously payer and provider.

These additions answer a regulatory anxiety that any thoughtful evaluator at Avenue should have — and that the incumbent vendors, neither of which was built around PSHP-specific governance, cannot match.

## 4.2 Functional Scope

Three discrete capabilities:

1. **Internal-vs-external provider parity engine** — claims from Avenue-owned facilities are evaluated with the same statistical scrutiny as external partner facilities, and parity itself is monitored
2. **Conflict-of-interest register** — physicians with declared financial relationships have automatically lowered fraud thresholds on relevant service lines
3. **Cryptographically-anchored audit chain** — every fraud-flag override is recorded in a tamper-evident hash chain with administrator identity

## 4.3 Prisma Schema Extensions

```prisma
// =====================================================
// Provider parity monitoring
// =====================================================

model ProviderParityMetric {
  id                          String      @id @default(cuid())
  metricDate                  DateTime
  metricType                  ParityMetricType

  internalProviderValue       Decimal     @db.Decimal(18, 4)
  externalProviderValue       Decimal     @db.Decimal(18, 4)
  parityRatio                 Decimal     @db.Decimal(8, 4)  // internal / external

  cohortDescription           String      // e.g. "Outpatient encounters, ICD-10 J00-J99, age 18-35"

  parityFlag                  ParityFlag
  generatedAt                 DateTime    @default(now())

  @@index([metricDate, metricType])
  @@index([parityFlag, metricDate])
}

enum ParityMetricType {
  AVG_COST_PER_ENCOUNTER
  FRAUD_FLAG_RATE
  REJECTION_RATE
  AVG_LENGTH_OF_STAY
  REPEAT_VISIT_RATE
  PRESCRIPTION_INTENSITY
  DIAGNOSTIC_INTENSITY
}

enum ParityFlag {
  WITHIN_TOLERANCE
  INTERNAL_FAVORABLE_BIAS    // internal providers being treated more leniently
  EXTERNAL_FAVORABLE_BIAS    // unlikely but tracked
  SIGNIFICANT_DIVERGENCE
}

// =====================================================
// Conflict of interest register
// =====================================================

model ConflictOfInterestDeclaration {
  id                  String                          @id @default(cuid())
  declarantUserId     String
  declarantType       DeclarantType
  declarationCategory ConflictCategory
  description         String
  affectedServiceLines String[]                       // ICD-10 chapters or service categories
  affectedFacilityIds String[]                        // optional specific facilities

  effectiveFrom       DateTime
  effectiveTo         DateTime?
  status              DeclarationStatus               @default(ACTIVE)

  reviewedById        String?
  reviewedAt          DateTime?
  fraudThresholdMultiplier Decimal                    @db.Decimal(4, 3)  // e.g. 0.700 = trigger fraud rules at 70% of normal threshold

  documents           ConflictDeclarationDocument[]
  createdAt           DateTime                        @default(now())
  updatedAt           DateTime                        @updatedAt

  @@index([declarantUserId, status])
  @@index([effectiveFrom, effectiveTo])
}

enum DeclarantType {
  PHYSICIAN
  CLAIMS_ADJUDICATOR
  EXECUTIVE
  BOARD_MEMBER
  PROCUREMENT_OFFICER
}

enum ConflictCategory {
  FINANCIAL_INTEREST_IN_FACILITY
  COMPENSATION_TIED_TO_VOLUME
  FAMILY_RELATIONSHIP
  EXTERNAL_DIRECTORSHIP
  SUPPLIER_RELATIONSHIP
  RESEARCH_FUNDING
  OTHER
}

enum DeclarationStatus {
  PENDING_REVIEW
  ACTIVE
  EXPIRED
  WITHDRAWN
}

model ConflictDeclarationDocument {
  id              String                          @id @default(cuid())
  declarationId   String
  declaration     ConflictOfInterestDeclaration   @relation(fields: [declarationId], references: [id])
  fileUri         String
  uploadedAt      DateTime                        @default(now())
}

// =====================================================
// Audit chain (tamper-evident)
// =====================================================

model AuditChainEntry {
  id              String              @id @default(cuid())
  sequenceNumber  BigInt              @unique
  eventType       AuditEventType
  eventTimestamp  DateTime            @default(now())

  actorUserId     String
  actorRole       String
  actorIpAddress  String?
  actorUserAgent  String?

  subjectType     String              // e.g. "claim", "membership", "commission_schedule"
  subjectId       String

  action          String              // verb describing what happened
  payloadHash     String              // SHA-256 of the full payload
  payloadEncrypted String             // AES-256-GCM encrypted full payload

  previousEntryHash String              // SHA-256 of previous entry's combined fields
  thisEntryHash     String              // SHA-256 of (sequenceNumber + eventType + timestamp + actor + subject + action + payloadHash + previousEntryHash)

  reasonCode      String?             // for overrides: structured reason
  reasonNarrative String?             // free-text justification

  @@index([eventType, eventTimestamp])
  @@index([actorUserId, eventTimestamp])
  @@index([subjectType, subjectId, eventTimestamp])
}

enum AuditEventType {
  FRAUD_FLAG_OVERRIDE
  CLAIM_FORCE_APPROVAL
  CLAIM_FORCE_REJECTION
  COMMISSION_SCHEDULE_CHANGE
  COMMISSION_SCHEDULE_APPROVAL
  BENEFIT_CAP_OVERRIDE
  COI_DECLARATION
  COI_REVIEW
  TERMINOLOGY_CHANGE
  SECURITY_EVENT
  CONFIGURATION_CHANGE
  USER_PERMISSION_CHANGE
  DATA_EXPORT
  PRIVACY_ACCESS
}
```

## 4.4 Internal-vs-External Provider Parity Engine

### What this is
A continuous monitoring layer that ensures Avenue-owned facilities are subjected to the same fraud-detection scrutiny as external partner facilities, and that publishes a parity report visible to compliance.

### How it works
A daily BullMQ job (`compute-provider-parity`) runs at 03:00 EAT and:

1. Stratifies the prior day's encounters into matched cohorts (same encounter type, ICD-10 family, age band, gender)
2. For each cohort, computes seven parity metrics for internal-provider encounters vs. external-provider encounters:
   - Average cost per encounter
   - Fraud flag rate per 100 encounters
   - Claim rejection rate
   - Average length of stay (inpatient cohorts)
   - Repeat visit rate (within 7 days)
   - Prescription intensity (drugs per encounter)
   - Diagnostic intensity (lab/imaging orders per encounter)
3. Writes a `ProviderParityMetric` record per cohort per metric
4. Flags rows where parity ratio drifts more than 1.25× or less than 0.80× from peer benchmarks
5. Generates alerts of type `INTERNAL_FAVORABLE_BIAS` when internal facilities consistently show:
   - Lower fraud flag rates than external (suggesting under-scrutiny)
   - Higher repeat visit rates (suggesting over-utilization)
   - Higher diagnostic intensity (suggesting over-servicing)

### Display
A dedicated **Parity Compliance Dashboard** (separate from the Strategic Purchasing Console) accessible only to compliance and audit roles. Shows:
- Headline parity score across all metrics
- Drill-down by metric, cohort, and time period
- Trend lines for each metric pair
- A monthly auto-generated **Parity Compliance Report** (PDF) suitable for board/regulator submission

### Why this is a winning feature
A procurement evaluator with a compliance background will immediately recognize this as the missing piece that addresses PSHP self-dealing risk. Smart and Medbook treat all providers identically because they were built for non-PSHP markets. AiCare is the only platform that explicitly engineers for the conflict.

## 4.5 Conflict of Interest Register

### What this is
A maintained register of declared financial relationships between system users (clinicians, adjudicators, executives) and entities (facilities, suppliers, service lines) that, when active, automatically reduce fraud-rule firing thresholds for affected transactions.

### Workflow

1. **Declaration** — User submits a declaration via their profile, attaching supporting documents
2. **Review** — Compliance officer reviews and either accepts (with effective dates and fraud-threshold-multiplier) or requests modification
3. **Active enforcement** — When the declarant performs a system action (e.g. an adjudicator approves a claim, a physician orders diagnostics, a procurement officer processes a vendor payment) that touches an affected service line or facility:
   - All fraud rules that would normally apply to the action have their thresholds multiplied by the threshold multiplier (typically 0.70 — meaning rules trigger at 70% of normal threshold)
   - The action is automatically routed to a second-eyes review queue
   - An entry is written to the audit chain regardless of outcome
4. **Periodic refresh** — Declarations expire on their `effectiveTo` date or 12 months from creation, whichever is sooner, and require active renewal

### Default threshold multipliers by category

| Category | Multiplier | Rationale |
|---|---|---|
| FINANCIAL_INTEREST_IN_FACILITY | 0.70 | Most direct conflict |
| COMPENSATION_TIED_TO_VOLUME | 0.75 | Volume incentive risk |
| FAMILY_RELATIONSHIP | 0.85 | Indirect but relevant |
| EXTERNAL_DIRECTORSHIP | 0.90 | Disclosure/governance focus |
| SUPPLIER_RELATIONSHIP | 0.80 | Procurement integrity |
| RESEARCH_FUNDING | 0.85 | Bias-of-prescription concern |

Multipliers are admin-editable per declaration during the review workflow.

## 4.6 Cryptographically Anchored Audit Chain

### What this is
A tamper-evident append-only log of every sensitive system event. Each entry references the hash of the previous entry, so any tampering with a historical entry breaks the chain and is detectable.

### Hash chain construction

For each entry:
```
entryHash = SHA256(
  sequenceNumber +
  eventType +
  eventTimestamp.toISOString() +
  actorUserId +
  subjectType + ":" + subjectId +
  action +
  payloadHash +
  previousEntryHash
)
```

The first entry (sequence 1) uses a constant genesis hash for `previousEntryHash`.

### Payload encryption

The full payload of each event is encrypted with AES-256-GCM using a tenant-specific key. The plaintext is never written to disk. Decryption requires both the active tenant key and an explicit "audit access" permission, and every decryption itself generates an `PRIVACY_ACCESS` audit entry.

### Verification

A scheduled job (`verify-audit-chain`) runs every 6 hours and:
1. Re-computes the hash chain from the most recent verified checkpoint to the latest entry
2. If any computed hash mismatches the stored hash, raises a `CRITICAL` security alert and locks the audit chain from further writes pending investigation
3. Writes a verification checkpoint record with the verified-up-to sequence number

Daily, the most recent checkpoint hash is exported to:
- A separate database (write-only from the application's perspective)
- An optional external timestamping service (e.g. RFC 3161 TSA)

This dual external anchor means any tampering would have to compromise both the primary database AND the external anchor within the verification window, which is a substantially higher bar than tampering with a single database table.

### What gets logged

All `AuditEventType` values listed in the schema — primarily fraud-flag overrides, claim force-approvals/rejections, commission schedule changes, benefit cap overrides, COI declarations and reviews, terminology changes, security events, configuration changes, permission changes, data exports, and privacy-sensitive accesses.

### Non-repudiation features

- `actorUserId` is captured from the authenticated session, not request payload
- `actorIpAddress` and `actorUserAgent` are captured server-side
- For fraud-flag overrides specifically, the `reasonCode` field is required and must be selected from a structured enum (NOT free text) — this ensures regulators get categorical data, not narrative excuses
- Free-text `reasonNarrative` is also required, but supplements rather than replaces the code

### UI for audit chain access
- **Audit chain explorer** — filterable by event type, actor, subject, time
- **Verification status indicator** — always visible to compliance role; shows last verified checkpoint and chain integrity status
- **Override review workspace** — for compliance to review flagged overrides on a periodic cadence

## 4.7 tRPC API Surface

```typescript
// router: providerParity
providerParity.dashboard({ periodFrom, periodTo })
providerParity.cohortDetail({ cohortDescription, periodFrom, periodTo })
providerParity.generateReport({ periodFrom, periodTo, format: 'PDF' })
providerParity.alerts({ flag?, cursor?, limit })

// router: conflictRegister
conflictRegister.myDeclarations()
conflictRegister.declare({ ...DeclarationInput })
conflictRegister.uploadDocument({ declarationId, file })
conflictRegister.review({ declarationId, accept, fraudThresholdMultiplier?, notes? })
conflictRegister.list({ status?, declarantType?, cursor?, limit })
conflictRegister.activeForUser({ userId })  // used internally by fraud engine

// router: auditChain
auditChain.list({ eventType?, actorUserId?, subjectType?, subjectId?, periodFrom?, periodTo?, cursor?, limit })
auditChain.getEntry({ sequenceNumber })  // requires audit:read permission, generates audit event itself
auditChain.verifyIntegrity({ fromSequence?, toSequence? })
auditChain.exportForRegulator({ periodFrom, periodTo, eventTypes, justification })  // requires audit:export permission
```

## 4.8 New Fraud Rules — PSHP-Specific

In addition to existing rules, six new PSHP-specific rules are added:

| Rule code | Description | Detection logic |
|---|---|---|
| RULE-PSHP-001 | Internal-provider over-prescription | Internal facility's drugs-per-encounter > 1.4× external peer for same ICD family |
| RULE-PSHP-002 | Internal-provider over-diagnostics | Internal facility's lab/imaging orders > 1.5× external peer |
| RULE-PSHP-003 | Conflicted adjudicator approval | Claim approved by adjudicator with active COI declaration covering claim's service line |
| RULE-PSHP-004 | Internal up-conversion | Outpatient-to-inpatient conversion rate > 1.3× external peer for same ICD |
| RULE-PSHP-005 | Conflicted referrer | Referring physician has active COI declaration on referred-to facility |
| RULE-PSHP-006 | Internal repeat visit clustering | Same patient, same ICD, repeated internal-provider visits within 7 days exceeding peer rate |

## 4.9 Phased Build Order — Module 4

**Day 1:** Audit chain schema + hash construction + verification job. (Most foundational.)
**Day 2:** Conflict of interest register schema + declaration workflow + threshold integration into fraud rule firing.
**Day 3:** Provider parity engine + daily computation job + parity dashboard.
**Day 4:** Six new RULE-PSHP-* fraud rules wired into existing fraud engine; audit-chain explorer UI.
**Day 5:** Parity compliance report PDF generator; periodic verification scheduler with external anchor.
**Day 6:** Override review workspace; documentation; end-to-end testing.
**Day 7:** Buffer; harden the encryption key management and rotation flow.

## 4.10 Seed Data

- 5 sample COI declarations covering different categories
- 60 days of synthetic provider parity metrics including some flagged divergences
- 100 sample audit chain entries demonstrating the hash chain
- Pre-generated parity compliance report PDF for the most recent month

---

# Module 5 — Member Experience Hardening

## 5.1 Strategic Rationale

The Smart Access app and Medbook MedApp both prioritize clinical record viewing. Avenue's RFP explicitly calls for a member portal showing benefit utilization. This module focuses Avenue's member-facing experience on financial transparency, real-time decisions, and frictionless co-contribution — the things members actually feel.

This module is the demo's emotional payoff. When evaluators pull out their phones during the live demo and the member experience just works, the rest of the technical case lands.

## 5.2 Functional Scope

- Real-time benefit utilization dashboard (KES remaining, by package, by sub-limit)
- Encounter history with itemized cost transparency
- Provider locator with cost transparency by procedure
- Real-time pre-authorization request flow with auto-decision for common procedures
- M-Pesa STK push for co-contribution payments inside the app
- Family-wide views for principal members
- Membership document repository (certificate, schedule, benefit guide)
- Push notifications for benefit events, renewal reminders, payment confirmations
- Multi-channel access — same data accessible via web, mobile web, native iOS/Android, and SMS shortcode for low-bandwidth users

## 5.3 Prisma Schema Extensions

```prisma
model MemberAppSession {
  id              String      @id @default(cuid())
  membershipId    String
  deviceFingerprint String
  channel         AppChannel
  pushToken       String?
  lastActiveAt    DateTime    @default(now())
  createdAt       DateTime    @default(now())

  @@index([membershipId, channel])
}

enum AppChannel {
  WEB
  MOBILE_WEB
  IOS_NATIVE
  ANDROID_NATIVE
  USSD
  SMS
}

model PreAuthRequest {
  id              String                  @id @default(cuid())
  membershipId    String
  facilityId      String
  requestedAt     DateTime                @default(now())
  requestSource   String                  // "MEMBER_APP" | "FACILITY_PORTAL" | "API"

  procedureCode   String                  // CPT
  diagnosisCode   String                  // ICD-10
  estimatedCost   Decimal                 @db.Decimal(18, 2)

  decision        PreAuthDecision
  decisionAt      DateTime?
  decisionBy      String                  // "AUTO" or userId
  decisionRationale String?
  decisionExpiresAt DateTime?

  benefitCapImpact Decimal?               @db.Decimal(18, 2)
  memberCoContribution Decimal?           @db.Decimal(18, 2)

  fraudRulesEvaluated Json
  routedToHumanReview Boolean             @default(false)

  @@index([membershipId, requestedAt])
  @@index([decision, decisionAt])
}

enum PreAuthDecision {
  AUTO_APPROVED
  AUTO_DECLINED
  PENDING_HUMAN_REVIEW
  HUMAN_APPROVED
  HUMAN_DECLINED
  EXPIRED
}

model MemberCoContributionPayment {
  id              String                      @id @default(cuid())
  membershipId    String
  encounterId     String?
  preAuthId       String?
  amount          Decimal                     @db.Decimal(18, 2)
  currency        String                      @default("KES")

  channel         CoContributionChannel
  mpesaCheckoutRequestId String?              @unique
  mpesaReceiptNumber String?                  @unique
  mpesaPhoneNumber String?

  state           CoContributionState
  initiatedAt     DateTime                    @default(now())
  confirmedAt     DateTime?
  failureReason   String?

  @@index([membershipId, initiatedAt])
  @@index([state, initiatedAt])
}

enum CoContributionChannel {
  MPESA_STK
  CARD
  CASH_AT_FACILITY
  PAYROLL_DEDUCTION
}

enum CoContributionState {
  INITIATED
  PROMPT_SENT
  CONFIRMED
  FAILED
  TIMED_OUT
  REVERSED
}

model MemberNotification {
  id              String              @id @default(cuid())
  membershipId    String
  notificationType MemberNotificationType
  channel         NotificationChannel
  subject         String?
  body            String
  payload         Json?
  sentAt          DateTime?
  deliveredAt     DateTime?
  readAt          DateTime?
  createdAt       DateTime            @default(now())

  @@index([membershipId, createdAt])
}

enum MemberNotificationType {
  BENEFIT_USED
  BENEFIT_NEAR_CAP
  CO_CONTRIBUTION_REQUESTED
  CO_CONTRIBUTION_CONFIRMED
  PRE_AUTH_DECISION
  RENEWAL_REMINDER
  DOCUMENT_AVAILABLE
  ENCOUNTER_RECORDED
  SECURITY_ALERT
}

enum NotificationChannel {
  PUSH
  SMS
  EMAIL
  IN_APP
}
```

## 5.4 Real-Time Benefit Utilization

### Architectural approach
Benefit utilization is a frequently-read, write-on-encounter metric. A denormalized `MembershipBenefitState` table holds current utilization for each (membership, package, sub-limit) tuple, updated transactionally on every encounter posting. The state is also pushed to Redis for sub-50ms reads.

### What the member sees
For each of their packages (Inpatient, Outpatient, Dental, Optical, Maternity, etc.):
- Current period: KES X used of KES Y limit (visual progress bar)
- Sub-limits inside each package displayed similarly
- Timeline of recent benefit consumption events
- "Time-of-the-period" indicator: are they on track, ahead, or behind expected utilization
- Family-wide view for principal members showing each dependant's usage

### What's deliberately not shown
- Insurance jargon. All language is routed through the terminology engine.
- Adjudication detail. Members see "Approved KES 4,500" not "ICD-10 J45.9, line item adjudicated".
- Other members' detail. Privacy is enforced even within a family for sensitive categories (maternity, mental health, HIV — configurable per scheme).

## 5.5 Pre-Authorization Auto-Decision

### Decision algorithm

For each pre-auth request:

1. **Eligibility gates** (any failure = AUTO_DECLINED):
   - Member is in active status as of requested service date
   - Procedure is covered under member's active package
   - Diagnosis is not on excluded list for this benefit
   - Waiting period has elapsed if applicable

2. **Cost gates**:
   - Estimated cost within remaining benefit cap → continue
   - Estimated cost > remaining cap → flag with co-contribution requirement, continue
   - Estimated cost > scheme's auto-approve ceiling → ROUTE_TO_HUMAN

3. **Procedure-specific gates**:
   - Procedure is on the auto-approve list for the scheme → AUTO_APPROVED
   - Procedure requires clinical review → ROUTE_TO_HUMAN
   - Procedure is on the never-auto list → ROUTE_TO_HUMAN

4. **Fraud check**:
   - Run fraud rules against the request
   - Any rule firing at HIGH severity → ROUTE_TO_HUMAN
   - Rules firing at MEDIUM severity → AUTO_APPROVED with audit flag

5. **Provider check**:
   - Internal facility → standard flow
   - External facility → must be in active partnership; if pricing differs from negotiated tariff, flag for review

Decisions are returned to the member app within 3 seconds for the auto-decided cases. Human-review cases are queued and the member is notified the request is under review with a target SLA.

### Auto-approve list
Scheme admin configures, per scheme, which CPT codes auto-approve. A reasonable default seed for Avenue: standard outpatient consultations, common laboratory panels, basic imaging, refills of established chronic medications, dental cleaning.

### Decision validity
Every approved pre-auth has an `expiresAt` (default 14 days). Service must be rendered within this window or the auth lapses and benefit cap is restored.

## 5.6 M-Pesa Co-Contribution Flow

### User journey

1. Member receives a pre-auth approval indicating co-contribution required
2. Member taps "Pay co-contribution" in the app
3. App initiates STK push to the member's M-Pesa registered phone number (defaulted from membership record, editable)
4. M-Pesa prompt appears on member's phone
5. Member enters PIN, confirms
6. Daraja API webhook returns to AiCare with the result
7. On success: encounter authorization is finalized, member receives confirmation push, facility receives confirmation that co-contribution is settled and they can dispense service
8. On failure: member is notified with retry option

### Technical implementation
- Daraja Lipa Na M-Pesa Online (STK push) integration
- Idempotency via the `CheckoutRequestID` from Daraja
- Confirmation webhook is the source of truth — never trust the client
- Reconciliation job runs every 5 minutes to detect orphaned `INITIATED` or `PROMPT_SENT` records and either confirms via direct query to Daraja or marks as `TIMED_OUT`
- Co-contribution payments link back to the originating pre-auth and encounter, ensuring traceability

### Reflecting the prior domain correction
M-Pesa Paybill/Till reversals are NOT automated. The fraud engine treats fake confirmation SMS as the primary risk vector. The co-contribution flow is therefore architected so that:
- Confirmation comes from the Daraja webhook, never from a member-presented SMS
- Facility staff never have a "confirmed via SMS" UI option
- If a member presents an SMS at the facility, the facility staff workflow is to verify in AiCare directly — only AiCare's webhook-confirmed state authorizes service

## 5.7 Provider Locator with Cost Transparency

### Functionality
- Map view of partner facilities with filters by service offered, distance, hours
- For each facility: average cost for member's likely procedure category, member rating, partner-tier indicator
- Cost transparency by procedure: for common CPT codes, member sees "estimated cost at this facility: KES X, your co-contribution: KES Y, your benefit covers: KES Z"
- Wait time indicator (where facilities have integrated their queue management)

### Why this matters competitively
Smart Access shows facilities. Medbook MedApp shows facilities. Neither shows what the visit will actually cost the member before they go. Avenue members will repeatedly use this — it's the kind of feature that drives daily app open rates, which is the metric that sells the platform internally to Avenue's marketing team.

## 5.8 USSD and SMS Channels

For low-bandwidth or low-spec-device members, the same core data is accessible via USSD shortcode (e.g. `*483*1#`) and SMS query.

Supported queries:
- `*483*1*1#` — Check benefit balance
- `*483*1*2#` — Recent encounters
- `*483*1*3#` — Upcoming renewal
- `*483*1*4#` — Find nearest provider
- SMS keyword `BAL` to shortcode — returns benefit balance
- SMS keyword `LOC` followed by area name — returns 3 nearest providers

This addresses the rural/low-connectivity gap Smart's biometric-first approach struggles with, and demonstrates inclusive design that maps to UHC values.

## 5.9 tRPC API Surface

```typescript
// router: memberApp
memberApp.dashboard()  // primary aggregated view
memberApp.benefitState({ packageId? })
memberApp.encounterHistory({ periodFrom?, periodTo?, cursor?, limit })
memberApp.familyView()  // for principal members
memberApp.documents()
memberApp.notifications({ status?, cursor?, limit })
memberApp.markNotificationRead({ notificationId })

// router: preAuth
preAuth.request({ ...PreAuthInput })
preAuth.history({ cursor?, limit })
preAuth.detail({ id })

// router: coContribution
coContribution.initiate({ encounterId | preAuthId, amount, channel, phoneNumber? })
coContribution.status({ paymentId })
coContribution.history({ cursor?, limit })

// router: providerLocator
providerLocator.search({ lat?, lng?, radiusKm?, services?, partnerTier? })
providerLocator.facilityDetail({ facilityId })
providerLocator.estimatedCost({ facilityId, procedureCode })

// router: ussd (called by USSD gateway)
ussd.handleSession({ sessionId, phoneNumber, input, networkCode, serviceCode })
```

## 5.10 UI / App Surfaces

### Mobile web (primary surface for the sprint)
- **Home** — benefit balance hero card, recent activity feed, quick actions
- **Benefits** — full breakdown by package and sub-limit
- **Care** — provider locator + pre-auth request entry
- **Wallet** — co-contribution history, M-Pesa registered number
- **Family** — principal-member view of dependants
- **Profile** — documents, notification preferences, language toggle (en-KE / sw-KE)

### Web portal (responsive, same codebase)
Same surfaces optimized for desktop with multi-pane layouts.

### Native iOS / Android
Wrapped via Expo / React Native shell sharing the same tRPC client. Push notifications via Firebase Cloud Messaging (Android) and APNs (iOS).

### USSD / SMS
Stateless handler service that consumes the same tRPC API.

## 5.11 Phased Build Order — Module 5

**Day 1:** Member app shell + auth flow + dashboard + benefit state real-time read.
**Day 2:** Encounter history + family view + documents.
**Day 3:** Provider locator + cost transparency layer.
**Day 4:** Pre-auth request flow + auto-decision engine.
**Day 5:** M-Pesa STK push integration + co-contribution flow end to end.
**Day 6:** Notifications (push + SMS); USSD shortcode handler.
**Day 7:** Native shell wrapping; demo polish; load test on member endpoints.

## 5.12 Seed Data

For demo readiness:
- 50 demo members with varied benefit utilization profiles
- 5 family groupings showing principal + dependants
- 12 partner facilities with cost data for top 30 procedures
- Auto-approve list seeded with sensible Avenue defaults
- Mock M-Pesa Daraja integration in sandbox mode for live demo
- Pre-loaded notifications showing the variety of types

---

# Cross-Module Concerns

## CC.1 Permissions Added

New permission strings introduced across the modules:

```
broker:create
broker:update
broker:approve
broker:read
brokerKyc:verify
commission:approve
commission:disburse
terminology:admin
terminology:approve
analytics:read
analytics:export
analytics:advanced
parity:read
coi:declare
coi:review
audit:read
audit:export
member:impersonate     // for support — generates audit event
preauth:override
```

These slot into the existing RBAC matrix. A new role bundle "Compliance Officer" is introduced, combining `audit:*`, `parity:read`, `coi:review`, and read-only access to fraud and analytics surfaces.

## CC.2 Demo Script Recommendation

For maximum competitive impact, the live demo follows this 18-minute sequence:

1. **(2 min) Open with the member app on a phone** — open the app, show real-time benefit balance, walk through requesting a pre-auth, show the auto-approve happen in 3 seconds, initiate an M-Pesa STK push (sandbox), confirm payment, show the encounter recorded.
2. **(3 min) Switch to the broker portal** — log in as a broker, show book of business, show commission earned this month, drill into a specific scheme showing its loss ratio and the member-level utilization driving it.
3. **(3 min) Switch to Avenue's Strategic Purchasing Console** — show portfolio MLR, show three schemes with very different MLR profiles, drill into the renewal workspace for one due in 60 days, demonstrate the recommendation and scenario simulator.
4. **(2 min) Show the Provider Performance grid** — rank facilities by case-mix-adjusted cost, show one facility consistently outperforming and one underperforming.
5. **(2 min) The terminology dictionary switch** — open the terminology browser, show the Avenue dictionary, switch the demo toggle to default insurance vocabulary, watch every visible surface re-render. Switch back. Show the regulatory positioning PDF generator and produce one live.
6. **(3 min) The PSHP governance story** — open the Parity Compliance Dashboard, show the parity score across internal vs. external providers, drill into one cohort. Open the audit chain explorer, show a fraud-flag override entry with its hash linkage, run an integrity verification live.
7. **(2 min) Member experience close** — back to the member app, show the family view, show the cost transparency at a partner facility, show the USSD fallback option, show the language toggle to sw-KE.
8. **(1 min) Question framing** — invite the evaluator to name a feature they want to see. Avoid this being a slide-driven sales close.

## CC.3 Documentation Deliverables

Beyond the build itself, three documents must be produced and bound into the bid response:

1. **AiCare Architecture Overview** — 8–12 page document covering stack, security posture, data residency, scaling characteristics, integration patterns
2. **Avenue Fit Statement** — 4–6 page document mapping each RFP requirement to the AiCare module that delivers it
3. **Implementation & Support Plan** — 6–8 page document covering phased rollout, training, SLA commitments, escalation paths, knowledge transfer

These are not built by Antigravity; they are produced by the Mutuku-led commercial team using the technical artifacts from this sprint as source material.

## CC.4 Hardening Checklist for Bid Submission

By end of sprint, the following must be true:

- [ ] All 5 modules pass their respective Phase 7 (end-to-end test)
- [ ] Codebase passes the terminology static analysis with zero violations
- [ ] Audit chain integrity verifies cleanly across 5,000+ seeded entries
- [ ] Demo script executes cleanly twice in succession without manual reset
- [ ] Load test report shows the system handling the projected concurrent user volume for Avenue's anticipated rollout (2,000 concurrent users for 4 hours sustained)
- [ ] One external security review completed (penetration test or code review by a reputable Kenyan firm)
- [ ] One reference deployment is live (even a pilot tenant of 100 members) with 30 days of uptime data
- [ ] All Prisma migrations are reversible
- [ ] All new schema includes appropriate indexes for the documented query patterns
- [ ] All new tRPC procedures have request validation via Zod and appropriate permission checks

## CC.5 What Is Deliberately Excluded From This Sprint

To preserve sprint integrity and avoid over-promising:

- ML-based fraud detection beyond the existing rules engine
- Multi-tenant deployment hardening (Avenue is the only tenant in this phase)
- Multi-country localization (en-KE only; sw-KE strings stubbed but not translated)
- EMR/clinical workflow features (Med360 boundary respected)
- Facility-side biometric or POS hardware (Smart boundary respected)
- Native iOS/Android app store submissions (web wrapper sufficient for demo and pilot; submission queued for post-bid)
- Integration with Smart Access or Medbook MedApp (commercial decision, not a sprint task)

---

## Appendix A — File and Directory Conventions

Each module's code organization follows the existing AiCare convention:

```
src/
├── modules/
│   ├── broker/
│   │   ├── schema.prisma.fragment    # appended to root schema
│   │   ├── routers/
│   │   ├── services/
│   │   ├── jobs/                     # BullMQ workers
│   │   ├── components/               # React components
│   │   └── pages/
│   ├── terminology/
│   ├── analytics/
│   ├── pshp-governance/
│   └── member-app/
├── shared/
└── tests/
    ├── broker.spec.ts
    └── ...
```

## Appendix B — Sprint Risk Register

Risks identified at sprint kickoff:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| M-Pesa sandbox unreliability for demo | Medium | High | Cache successful sandbox responses; have fallback recorded demo if live fails |
| Terminology sweep finds more hard-coded strings than expected | High | Medium | Day 3 buffer in module 2; hard-prioritize user-facing surfaces over admin |
| Audit chain hash chain implementation bugs | Medium | High | Reference implementation against an established library; verification job catches issues early |
| Analytics fact-table volume crashes dev environment | Medium | Medium | Limit seed data volume; document production scaling separately |
| Browser fingerprinting requirement for member sessions conflicts with privacy posture | Low | Medium | Use device fingerprint hash, never raw browser data; document in privacy policy |
| Sprint scope expands due to RFP clarification questions | High | High | Hold scope at defined modules; queue clarifications for post-bid phase 5 |

## Appendix C — Document Change Log

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-05-06 | Mutuku (via Claude) | Initial release for Antigravity |

---

**End of specification.**
