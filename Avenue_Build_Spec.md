# AiCare — Membership Management Platform

## Antigravity Build Specification

> **Product Owner**: AiCare (technology company)
> **First Client**: Avenue Healthcare (Kenyan hospital group)
> **Platform Type**: Multi-tenant SaaS — white-labeled per client, with AiCare as the platform owner
> **Deployment**: Containerized (Docker + Docker Compose), self-hosted on client infrastructure

---

# PART 1: SYSTEM ARCHITECTURE

## 1.1 Tech Stack

| Layer                | Technology                                                   | Rationale                                                        |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Frontend**         | Next.js 14+ (App Router), React 18, TypeScript               | SSR for portal pages, RSC for performance, strong typing         |
| **Styling**          | Tailwind CSS + CSS custom properties                         | Theming per tenant via CSS variables                             |
| **Charts**           | Recharts                                                     | React-native charting                                            |
| **State**            | Zustand + React Query (TanStack Query)                       | Lightweight global state + server state caching                  |
| **Backend**          | Next.js API Routes + tRPC                                    | End-to-end type safety, co-located with frontend                 |
| **ORM**              | Prisma                                                       | Type-safe database access, migrations                            |
| **Database**         | PostgreSQL 16                                                | Relational, JSONB for flexible benefit configs                   |
| **Auth**             | NextAuth.js v5 (Auth.js)                                     | Multi-provider auth, role-based sessions                         |
| **File Storage**     | MinIO (S3-compatible, self-hosted)                           | Documents, invoices, member photos                               |
| **Background Jobs**  | BullMQ + Redis                                               | Async tasks: billing runs, report generation, notifications      |
| **PDF Generation**   | @react-pdf/renderer or Puppeteer                             | Member cards, invoices, benefit schedules, commission statements |
| **Email/SMS**        | Nodemailer + configurable SMS gateway (Africa's Talking API) | Notifications                                                    |
| **Search**           | PostgreSQL full-text search (pg_trgm)                        | ICD-10/CPT code lookup, member search                            |
| **Containerization** | Docker + Docker Compose                                      | All services containerized                                       |
| **Reverse Proxy**    | Nginx or Traefik                                             | SSL termination, routing                                         |

## 1.2 Project Structure

```
aicare/
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── nginx/
│   └── nginx.conf
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                    # Demo data seeder
│   └── migrations/
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (admin)/               # Admin portal layout + pages
│   │   │   ├── layout.tsx         # Sidebar layout
│   │   │   ├── dashboard/
│   │   │   ├── groups/
│   │   │   │   ├── page.tsx       # List
│   │   │   │   ├── [id]/page.tsx  # Detail
│   │   │   │   └── new/page.tsx
│   │   │   ├── members/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── endorsements/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── packages/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/page.tsx
│   │   │   │   └── builder/page.tsx
│   │   │   ├── claims/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── preauth/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── billing/
│   │   │   ├── providers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [reportType]/page.tsx
│   │   │   ├── brokers/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/page.tsx
│   │   │   ├── quotations/
│   │   │   │   ├── page.tsx
│   │   │   │   └── calculator/page.tsx
│   │   │   └── settings/
│   │   ├── (broker)/               # Broker portal
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   ├── groups/
│   │   │   ├── submissions/
│   │   │   ├── commissions/
│   │   │   ├── renewals/
│   │   │   ├── quotations/
│   │   │   └── support/
│   │   ├── (member)/               # Member portal
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/
│   │   │   ├── benefits/
│   │   │   ├── dependents/
│   │   │   ├── utilization/
│   │   │   ├── preauth/
│   │   │   ├── facilities/
│   │   │   └── support/
│   │   └── api/                    # API routes
│   │       ├── trpc/[trpc]/route.ts
│   │       └── integrations/
│   │           ├── smart/          # SMART integration endpoints
│   │           ├── slade360/       # Slade360 EDI endpoints
│   │           ├── hms/            # HMS integration endpoints
│   │           └── webhooks/
│   ├── server/
│   │   ├── trpc/
│   │   │   ├── router.ts          # Root router
│   │   │   ├── context.ts
│   │   │   └── routers/
│   │   │       ├── groups.ts
│   │   │       ├── members.ts
│   │   │       ├── endorsements.ts
│   │   │       ├── packages.ts
│   │   │       ├── claims.ts
│   │   │       ├── preauth.ts
│   │   │       ├── billing.ts
│   │   │       ├── providers.ts
│   │   │       ├── brokers.ts
│   │   │       ├── reports.ts
│   │   │       ├── quotations.ts
│   │   │       ├── integrations.ts
│   │   │       └── settings.ts
│   │   ├── services/               # Business logic
│   │   │   ├── endorsement.service.ts
│   │   │   ├── premium.service.ts
│   │   │   ├── claims.service.ts
│   │   │   ├── preauth.service.ts
│   │   │   ├── billing.service.ts
│   │   │   ├── commission.service.ts
│   │   │   ├── notification.service.ts
│   │   │   └── integration.service.ts
│   │   ├── jobs/                   # Background jobs
│   │   │   ├── billing-run.job.ts
│   │   │   ├── commission-calc.job.ts
│   │   │   ├── renewal-reminder.job.ts
│   │   │   ├── suspension-check.job.ts
│   │   │   └── report-generation.job.ts
│   │   └── integrations/
│   │       ├── smart/
│   │       │   ├── client.ts       # SMART API client
│   │       │   ├── types.ts
│   │       │   └── sync.ts
│   │       ├── slade360/
│   │       │   ├── client.ts       # Slade360 EDI client
│   │       │   ├── types.ts
│   │       │   └── eclaims.ts
│   │       ├── hms/
│   │       │   ├── fhir-client.ts  # HL7 FHIR client
│   │       │   └── types.ts
│   │       └── sha/
│   │           └── reporting.ts    # SHA compliance reporting
│   ├── components/
│   │   ├── ui/                     # Reusable UI primitives
│   │   ├── layouts/
│   │   │   ├── AdminSidebar.tsx
│   │   │   ├── BrokerSidebar.tsx
│   │   │   └── MemberNav.tsx
│   │   ├── domain/                 # Domain-specific components
│   │   │   ├── ICD10Search.tsx
│   │   │   ├── CPTSearch.tsx
│   │   │   ├── BenefitProgressBar.tsx
│   │   │   ├── MemberCard.tsx
│   │   │   ├── ClaimAdjudication.tsx
│   │   │   ├── EndorsementForm.tsx
│   │   │   ├── PremiumCalculator.tsx
│   │   │   └── QuotationBuilder.tsx
│   │   └── charts/
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts
│   │   ├── utils.ts
│   │   ├── constants.ts
│   │   └── theme.ts               # Tenant theming
│   ├── data/
│   │   ├── icd10-codes.json        # Pre-loaded ICD-10 library
│   │   └── cpt-codes.json          # Pre-loaded CPT library
│   └── types/
│       └── index.ts
├── public/
│   └── tenants/
│       └── avenue/                 # Avenue-specific assets
│           ├── logo.svg
│           └── favicon.ico
└── tests/
```

## 1.3 Multi-Tenancy Model

AiCare is the platform owner. Each client (like Avenue Healthcare) is a **tenant**. Use **schema-level isolation** via PostgreSQL schemas, or simpler **row-level isolation** with a `tenant_id` on every table. Given that the first deployment is single-tenant (Avenue) and white-labeling is a future concern, use **row-level tenancy with a `tenant_id` column** on all tables plus a `tenants` configuration table that stores branding, theme colors, logo, etc.

```prisma
model Tenant {
  id            String   @id @default(cuid())
  name          String   // "Avenue Healthcare"
  slug          String   @unique // "avenue"
  logoUrl       String?
  primaryColor  String   @default("#292A83")
  accentColor   String   @default("#435BA1")
  warmColor     String   @default("#F5C6B6")
  fontHeading   String   @default("Quicksand")
  fontBody      String   @default("Lato")
  domain        String?  // Custom domain
  config        Json     // Additional tenant configuration
  createdAt     DateTime @default(now())
  // All other models reference this
}
```

All queries are scoped by `tenantId` using Prisma middleware or a wrapper.

---

# PART 2: DATABASE SCHEMA

Design the full Prisma schema. Below is the complete data model. Implement this exactly in `prisma/schema.prisma`.

## 2.1 Core Entities

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── TENANT ──────────────────────────────────────────────
model Tenant {
  id            String   @id @default(cuid())
  name          String
  slug          String   @unique
  logoUrl       String?
  primaryColor  String   @default("#292A83")
  accentColor   String   @default("#435BA1")
  warmColor     String   @default("#F5C6B6")
  fontHeading   String   @default("Quicksand")
  fontBody      String   @default("Lato")
  domain        String?  @unique
  config        Json     @default("{}")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  users         User[]
  groups        Group[]
  members       Member[]
  packages      Package[]
  claims        Claim[]
  preauths      PreAuthorization[]
  providers     Provider[]
  brokers       Broker[]
  endorsements  Endorsement[]
  invoices      Invoice[]
  quotations    Quotation[]
}

// ─── USERS & AUTH ────────────────────────────────────────
enum UserRole {
  SUPER_ADMIN
  CLAIMS_OFFICER
  FINANCE_OFFICER
  UNDERWRITER
  CUSTOMER_SERVICE
  MEDICAL_OFFICER
  REPORTS_VIEWER
  BROKER_USER
  MEMBER_USER
}

model User {
  id            String    @id @default(cuid())
  tenantId      String
  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  email         String
  passwordHash  String
  firstName     String
  lastName      String
  role          UserRole
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Link to broker or member profile
  brokerId      String?   @unique
  broker        Broker?   @relation(fields: [brokerId], references: [id])
  memberId      String?   @unique
  member        Member?   @relation(fields: [memberId], references: [id])

  auditLogs     AuditLog[]
  claimReviews  Claim[]   @relation("ClaimReviewer")

  @@unique([tenantId, email])
  @@index([tenantId])
}

// ─── GROUPS / ORGANIZATIONS ─────────────────────────────
enum GroupStatus {
  PENDING
  ACTIVE
  SUSPENDED
  LAPSED
  TERMINATED
}

enum PaymentFrequency {
  MONTHLY
  QUARTERLY
  SEMI_ANNUAL
  ANNUAL
}

model Group {
  id                String           @id @default(cuid())
  tenantId          String
  tenant            Tenant           @relation(fields: [tenantId], references: [id])
  name              String
  industry          String?
  registrationNumber String?
  contactPersonName String
  contactPersonPhone String
  contactPersonEmail String
  address           String?
  county            String?
  packageId         String
  package           Package          @relation(fields: [packageId], references: [id])
  packageVersionId  String?
  packageVersion    PackageVersion?  @relation(fields: [packageVersionId], references: [id])
  brokerId          String?
  broker            Broker?          @relation(fields: [brokerId], references: [id])
  paymentFrequency  PaymentFrequency @default(ANNUAL)
  contributionRate  Decimal          // Per-member contribution amount
  effectiveDate     DateTime
  renewalDate       DateTime
  status            GroupStatus      @default(PENDING)
  suspendedAt       DateTime?
  suspensionReason  String?
  terminatedAt      DateTime?
  notes             String?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  members           Member[]
  endorsements      Endorsement[]
  invoices          Invoice[]
  payments          Payment[]
  documents         Document[]
  activityLogs      ActivityLog[]
  quotations        Quotation[]

  @@index([tenantId])
  @@index([tenantId, status])
  @@index([brokerId])
}

// ─── MEMBERS ─────────────────────────────────────────────
enum MemberStatus {
  PENDING_ACTIVATION
  ACTIVE
  SUSPENDED
  LAPSED
  TERMINATED
}

enum MemberRelationship {
  PRINCIPAL
  SPOUSE
  CHILD
  PARENT
}

enum Gender {
  MALE
  FEMALE
  OTHER
}

model Member {
  id                String             @id @default(cuid())
  tenantId          String
  tenant            Tenant             @relation(fields: [tenantId], references: [id])
  memberNumber      String             // e.g., AVH-2024-00001
  groupId           String
  group             Group              @relation(fields: [groupId], references: [id])
  firstName         String
  lastName          String
  otherNames        String?
  idNumber          String?            // National ID / Passport
  dateOfBirth       DateTime
  gender            Gender
  phone             String?
  email             String?
  photoUrl          String?
  relationship      MemberRelationship @default(PRINCIPAL)
  principalId       String?            // If dependent, links to principal member
  principal         Member?            @relation("Dependents", fields: [principalId], references: [id])
  dependents        Member[]           @relation("Dependents")
  packageId         String             // Inherited from group, but can be overridden
  package           Package            @relation(fields: [packageId], references: [id])
  packageVersionId  String?
  packageVersion    PackageVersion?    @relation(fields: [packageVersionId], references: [id])
  enrollmentDate    DateTime
  activationDate    DateTime?
  status            MemberStatus       @default(PENDING_ACTIVATION)
  waitingPeriodEnd  DateTime?          // General waiting period end
  smartCardNumber   String?            // SMART card number if integrated
  slade360MemberId  String?            // Slade360 member ID if integrated
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  claims            Claim[]
  preauths          PreAuthorization[]
  benefitUsages     BenefitUsage[]
  endorsements      Endorsement[]      @relation("EndorsementMember")
  user              User?
  correspondences   Correspondence[]
  activityLogs      ActivityLog[]

  @@unique([tenantId, memberNumber])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([groupId])
  @@index([principalId])
  @@index([idNumber])
}

// ─── PACKAGES & BENEFITS ────────────────────────────────
enum PackageType {
  INDIVIDUAL
  FAMILY
  GROUP
  CORPORATE
}

enum PackageStatus {
  DRAFT
  ACTIVE
  ARCHIVED
}

model Package {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  name            String          // "Avenue Essential"
  description     String?
  type            PackageType     @default(GROUP)
  annualLimit     Decimal         // Overall annual limit in KES
  perVisitLimit   Decimal?
  contributionAmount Decimal      // Per-member annual contribution
  status          PackageStatus   @default(DRAFT)
  minAge          Int             @default(0)
  maxAge          Int             @default(65)
  dependentMaxAge Int             @default(24)
  exclusions      String[]        // List of excluded conditions
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  versions        PackageVersion[]
  currentVersion  PackageVersion?  @relation("CurrentVersion")
  groups          Group[]
  members         Member[]

  @@index([tenantId])
}

model PackageVersion {
  id              String          @id @default(cuid())
  packageId       String
  package         Package         @relation(fields: [packageId], references: [id])
  versionNumber   Int
  effectiveFrom   DateTime
  effectiveTo     DateTime?
  benefits        BenefitConfig[]
  facilityAccess  String[]        // Provider IDs or "ALL_AVENUE" / "ALL_NETWORK"
  pricingModelUrl String?         // URL to uploaded pricing model (Excel/Python)
  pricingConfig   Json?           // Structured pricing parameters
  createdAt       DateTime        @default(now())

  currentForPackage Package?       @relation("CurrentVersion")
  groups            Group[]
  members           Member[]

  @@unique([packageId, versionNumber])
}

enum BenefitCategory {
  INPATIENT
  OUTPATIENT
  MATERNITY
  DENTAL
  OPTICAL
  MENTAL_HEALTH
  CHRONIC_DISEASE
  SURGICAL
  AMBULANCE_EMERGENCY
  LAST_EXPENSE
  WELLNESS_PREVENTIVE
  REHABILITATION
  CUSTOM
}

model BenefitConfig {
  id                String            @id @default(cuid())
  packageVersionId  String
  packageVersion    PackageVersion    @relation(fields: [packageVersionId], references: [id])
  category          BenefitCategory
  customCategoryName String?          // If category == CUSTOM
  annualSubLimit    Decimal           // KES
  perVisitLimit     Decimal?
  copayPercentage   Decimal           @default(0) // e.g., 10 = 10%
  waitingPeriodDays Int               @default(0)
  notes             String?
  exclusions        String[]

  benefitUsages     BenefitUsage[]

  @@index([packageVersionId])
}

model BenefitUsage {
  id              String        @id @default(cuid())
  memberId        String
  member          Member        @relation(fields: [memberId], references: [id])
  benefitConfigId String
  benefitConfig   BenefitConfig @relation(fields: [benefitConfigId], references: [id])
  periodStart     DateTime      // Start of the benefit period (usually enrollment anniversary)
  periodEnd       DateTime
  amountUsed      Decimal       @default(0)
  claimCount      Int           @default(0)
  lastUpdated     DateTime      @default(now())

  @@unique([memberId, benefitConfigId, periodStart])
  @@index([memberId])
}

// ─── ENDORSEMENTS ───────────────────────────────────────
// Endorsements track mid-term changes to a group's membership

enum EndorsementType {
  MEMBER_ADDITION       // New member joins mid-term
  MEMBER_DELETION       // Member exits mid-term
  DEPENDENT_ADDITION    // New dependent added
  DEPENDENT_DELETION    // Dependent removed
  PACKAGE_UPGRADE       // Member/group moves to higher package
  PACKAGE_DOWNGRADE     // Member/group moves to lower package
  AGE_BAND_CHANGE       // Age reclassification
  BENEFIT_MODIFICATION  // Change in benefits (e.g., maternity rider added)
  SALARY_CHANGE         // If contribution is salary-based
  GROUP_DATA_CHANGE     // Contact info, payment terms change
  CORRECTION            // Error correction
}

enum EndorsementStatus {
  DRAFT
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  REJECTED
  APPLIED            // Changes have been applied to the system
  CANCELLED
}

model Endorsement {
  id                String             @id @default(cuid())
  tenantId          String
  tenant            Tenant             @relation(fields: [tenantId], references: [id])
  endorsementNumber String             // e.g., END-2025-00001
  groupId           String
  group             Group              @relation(fields: [groupId], references: [id])
  type              EndorsementType
  status            EndorsementStatus  @default(DRAFT)
  effectiveDate     DateTime
  requestedDate     DateTime           @default(now())
  requestedBy       String?            // User ID or "BROKER" or "SYSTEM"

  // The member(s) affected
  memberId          String?            // For member-level endorsements
  member            Member?            @relation("EndorsementMember", fields: [memberId], references: [id])

  // Change details stored as structured JSON
  // Examples:
  // MEMBER_ADDITION: { firstName, lastName, dob, gender, idNumber, relationship, dependents[] }
  // MEMBER_DELETION: { reason, lastDay, refundEligible }
  // PACKAGE_UPGRADE: { fromPackageId, toPackageId }
  changeDetails     Json

  // Financial impact
  proratedAmount    Decimal?           // Pro-rata premium adjustment (+ = additional, - = refund)
  previousPremium   Decimal?           // What the group was paying before
  newPremium        Decimal?           // What they'll pay after
  premiumDelta      Decimal?           // Difference

  // Approval
  reviewedBy        String?
  reviewedAt        DateTime?
  reviewNotes       String?
  rejectionReason   String?

  // Application
  appliedAt         DateTime?
  appliedBy         String?

  documents         Document[]
  activityLogs      ActivityLog[]
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  @@unique([tenantId, endorsementNumber])
  @@index([tenantId])
  @@index([groupId])
  @@index([tenantId, status])
}

// ─── CLAIMS ─────────────────────────────────────────────
enum ClaimStatus {
  RECEIVED
  UNDER_REVIEW
  APPROVED
  PARTIALLY_APPROVED
  DECLINED
  PAID
  APPEALED
  APPEAL_APPROVED
  APPEAL_DECLINED
  VOID
}

enum ClaimSource {
  MANUAL          // Entered by admin
  PREAUTH         // Converted from pre-authorization
  SMART           // Received via SMART integration
  SLADE360        // Received via Slade360 EDI
  HMS             // Received from hospital HMS
  BATCH           // Batch upload from facility
}

enum ServiceType {
  OUTPATIENT
  INPATIENT
  DAY_CASE
  EMERGENCY
}

model Claim {
  id                String        @id @default(cuid())
  tenantId          String
  tenant            Tenant        @relation(fields: [tenantId], references: [id])
  claimNumber       String        // e.g., CLM-2025-00001
  memberId          String
  member            Member        @relation(fields: [memberId], references: [id])
  providerId        String
  provider          Provider      @relation(fields: [providerId], references: [id])
  preauthId         String?       // If converted from pre-auth
  preauth           PreAuthorization? @relation(fields: [preauthId], references: [id])
  source            ClaimSource   @default(MANUAL)
  serviceType       ServiceType
  dateOfService     DateTime
  admissionDate     DateTime?     // For inpatient
  dischargeDate     DateTime?
  lengthOfStay      Int?          // Calculated days
  attendingDoctor   String?

  // Diagnosis — stored as JSON array of { code, description, isPrimary }
  diagnoses         Json          // [{ icdCode: "E11.9", description: "Type 2 diabetes", isPrimary: true }]

  // Procedures — stored as JSON array of { code, description, quantity, unitCost, totalCost }
  procedures        Json          // [{ cptCode: "99213", description: "Office visit", qty: 1, unitCost: 2500, total: 2500 }]

  // Financial
  billedAmount      Decimal
  approvedAmount    Decimal       @default(0)
  copayAmount       Decimal       @default(0)
  excessAmount      Decimal       @default(0)  // Amount exceeding benefit limit
  paidAmount        Decimal       @default(0)
  memberLiability   Decimal       @default(0)  // Total member pays (copay + excess)

  // Benefit allocation
  benefitCategory   BenefitCategory
  benefitUsageId    String?

  // Status & workflow
  status            ClaimStatus   @default(RECEIVED)
  assignedReviewerId String?
  assignedReviewer   User?        @relation("ClaimReviewer", fields: [assignedReviewerId], references: [id])
  receivedAt        DateTime      @default(now())
  reviewStartedAt   DateTime?
  decidedAt         DateTime?
  paidAt            DateTime?
  turnaroundDays    Int?          // Calculated: decidedAt - receivedAt

  // Decline info
  declineReasonCode String?       // PREEXISTING, EXCLUSION, BENEFIT_EXHAUSTED, WAITING_PERIOD, INVALID_DOCS, NON_COVERED_FACILITY, FRAUD_SUSPECTED, OTHER
  declineNotes      String?

  // Appeal info
  appealDate        DateTime?
  appealNotes       String?
  appealDecision    String?
  appealDecidedAt   DateTime?

  // Integration references
  smartClaimRef     String?       // SMART claim reference
  slade360ClaimRef  String?       // Slade360 eClaim reference
  externalRef       String?       // Any external reference

  claimLines        ClaimLine[]
  documents         Document[]
  adjudicationLogs  AdjudicationLog[]
  paymentVoucherId  String?
  paymentVoucher    PaymentVoucher? @relation(fields: [paymentVoucherId], references: [id])

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@unique([tenantId, claimNumber])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([memberId])
  @@index([providerId])
  @@index([preauthId])
}

model ClaimLine {
  id              String   @id @default(cuid())
  claimId         String
  claim           Claim    @relation(fields: [claimId], references: [id])
  lineNumber      Int
  description     String
  cptCode         String?
  quantity        Int      @default(1)
  unitCost        Decimal
  billedAmount    Decimal
  tariffRate      Decimal? // From provider tariff schedule
  approvedAmount  Decimal  @default(0)
  notes           String?

  @@index([claimId])
}

model AdjudicationLog {
  id          String   @id @default(cuid())
  claimId     String
  claim       Claim    @relation(fields: [claimId], references: [id])
  userId      String
  action      String   // RECEIVED, REVIEW_STARTED, APPROVED, DECLINED, MORE_INFO_REQUESTED, ESCALATED, HELD, PAID, APPEALED, APPEAL_DECIDED
  fromStatus  String?
  toStatus    String
  amount      Decimal? // If amount was adjusted
  notes       String?
  createdAt   DateTime @default(now())

  @@index([claimId])
}

// ─── PRE-AUTHORIZATION ──────────────────────────────────
enum PreauthStatus {
  SUBMITTED
  UNDER_REVIEW
  APPROVED
  DECLINED
  EXPIRED                // Approved but validity period passed without use
  CONVERTED_TO_CLAIM     // Approved and claim was created
  CANCELLED
}

model PreAuthorization {
  id                  String          @id @default(cuid())
  tenantId            String
  tenant              Tenant          @relation(fields: [tenantId], references: [id])
  preauthNumber       String          // e.g., PA-2025-00001
  memberId            String
  member              Member          @relation(fields: [memberId], references: [id])
  providerId          String
  provider            Provider        @relation(fields: [providerId], references: [id])
  submittedBy         String          // "MEMBER", "PROVIDER", "ADMIN", "BROKER"
  status              PreauthStatus   @default(SUBMITTED)

  // Clinical info
  diagnoses           Json            // Same format as Claim.diagnoses
  procedures          Json            // Same format as Claim.procedures
  estimatedCost       Decimal
  clinicalNotes       String?
  serviceType         ServiceType     @default(OUTPATIENT)
  expectedDateOfService DateTime?

  // Benefit check at time of submission
  benefitCategory     BenefitCategory
  benefitRemaining    Decimal?        // Snapshot of remaining benefit at time of request

  // Approval details
  approvedAmount      Decimal?
  approvedBy          String?
  approvedAt          DateTime?
  validFrom           DateTime?       // Validity period start
  validUntil          DateTime?       // Validity period end (e.g., 30 days from approval)

  // Decline details
  declineReasonCode   String?
  declineNotes        String?
  declinedBy          String?
  declinedAt          DateTime?

  // Conversion to claim
  claimId             String?
  claim               Claim?
  convertedAt         DateTime?

  documents           Document[]
  activityLogs        ActivityLog[]
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  @@unique([tenantId, preauthNumber])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([memberId])
}

// ─── PROVIDERS / FACILITIES ─────────────────────────────
enum ProviderType {
  HOSPITAL
  CLINIC
  PHARMACY
  LABORATORY
  DENTAL
  OPTICAL
  REHABILITATION
}

enum ProviderTier {
  OWN       // Avenue's own facilities
  PARTNER   // Contracted partner facilities
  PANEL     // Wider panel
}

model Provider {
  id              String       @id @default(cuid())
  tenantId        String
  tenant          Tenant       @relation(fields: [tenantId], references: [id])
  name            String
  type            ProviderType
  tier            ProviderTier @default(PARTNER)
  address         String?
  county          String?
  phone           String?
  email           String?
  contactPerson   String?
  servicesOffered String[]     // ["Inpatient", "Outpatient", "Maternity", "Surgery", "Pharmacy", "ICU"]
  contractStatus  String       @default("ACTIVE") // ACTIVE, PENDING, EXPIRED
  contractStartDate DateTime?
  contractEndDate DateTime?
  smartProviderId String?      // SMART provider code
  slade360ProviderId String?   // Slade360 provider code
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  tariffs         ProviderTariff[]
  claims          Claim[]
  preauths        PreAuthorization[]

  @@index([tenantId])
  @@index([tenantId, tier])
}

model ProviderTariff {
  id            String   @id @default(cuid())
  providerId    String
  provider      Provider @relation(fields: [providerId], references: [id])
  cptCode       String?
  serviceName   String
  agreedRate    Decimal  // KES
  effectiveFrom DateTime
  effectiveTo   DateTime?
  createdAt     DateTime @default(now())

  @@index([providerId])
  @@index([providerId, cptCode])
}

// ─── BROKERS ─────────────────────────────────────────────
model Broker {
  id                  String    @id @default(cuid())
  tenantId            String
  tenant              Tenant    @relation(fields: [tenantId], references: [id])
  name                String    // Company name
  contactPerson       String
  phone               String
  email               String
  address             String?
  licenseNumber       String?   // IRA license
  status              String    @default("ACTIVE")
  dateOnboarded       DateTime  @default(now())

  // Commission structure
  firstYearCommissionPct  Decimal  @default(0)  // % of first-year contribution
  renewalCommissionPct    Decimal  @default(0)  // % of renewal contribution
  flatFeePerMember        Decimal? // Alternative: flat fee per member
  commissionStructure     Json?    // Complex tiered structures

  groups              Group[]
  commissions         Commission[]
  documents           Document[]
  user                User?
  quotations          Quotation[]
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  @@index([tenantId])
}

model Commission {
  id            String   @id @default(cuid())
  brokerId      String
  broker        Broker   @relation(fields: [brokerId], references: [id])
  period        String   // "2025-03" (year-month)
  groupId       String?
  contributionReceived Decimal
  commissionRate Decimal // The applicable rate
  commissionAmount Decimal
  paymentStatus  String  @default("PENDING") // PENDING, APPROVED, PAID
  paidAt        DateTime?
  paymentReference String?
  createdAt     DateTime @default(now())

  @@index([brokerId])
  @@index([brokerId, period])
}

// ─── BILLING & FINANCE ──────────────────────────────────
enum InvoiceStatus {
  DRAFT
  SENT
  PARTIALLY_PAID
  PAID
  OVERDUE
  VOID
}

model Invoice {
  id              String        @id @default(cuid())
  tenantId        String
  tenant          Tenant        @relation(fields: [tenantId], references: [id])
  invoiceNumber   String        // e.g., INV-2025-00001
  groupId         String
  group           Group         @relation(fields: [groupId], references: [id])
  period          String        // "2025-03"
  memberCount     Int
  ratePerMember   Decimal
  totalAmount     Decimal
  paidAmount      Decimal       @default(0)
  balance         Decimal       // totalAmount - paidAmount
  dueDate         DateTime
  status          InvoiceStatus @default(DRAFT)
  sentAt          DateTime?
  notes           String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  payments        Payment[]

  @@unique([tenantId, invoiceNumber])
  @@index([tenantId])
  @@index([groupId])
}

model Payment {
  id              String   @id @default(cuid())
  groupId         String
  group           Group    @relation(fields: [groupId], references: [id])
  invoiceId       String?
  invoice         Invoice? @relation(fields: [invoiceId], references: [id])
  amount          Decimal
  paymentDate     DateTime
  paymentMethod   String   // BANK_TRANSFER, CHEQUE, MPESA, CARD
  referenceNumber String?
  notes           String?
  reconciledAt    DateTime?
  createdAt       DateTime @default(now())

  @@index([groupId])
  @@index([invoiceId])
}

model PaymentVoucher {
  id              String   @id @default(cuid())
  voucherNumber   String
  providerId      String
  totalAmount     Decimal
  claimCount      Int
  status          String   @default("PENDING") // PENDING, APPROVED, PROCESSED
  processedAt     DateTime?
  processedBy     String?
  createdAt       DateTime @default(now())

  claims          Claim[]
}

// ─── QUOTATIONS ─────────────────────────────────────────
enum QuotationStatus {
  DRAFT
  SENT
  ACCEPTED
  DECLINED
  EXPIRED
}

model Quotation {
  id              String          @id @default(cuid())
  tenantId        String
  tenant          Tenant          @relation(fields: [tenantId], references: [id])
  quoteNumber     String          // e.g., QUO-2025-00001
  groupId         String?         // If quoting for existing group (renewal)
  group           Group?          @relation(fields: [groupId], references: [id])
  brokerId        String?         // If submitted by broker
  broker          Broker?         @relation(fields: [brokerId], references: [id])
  createdBy       String          // User ID

  // Prospect info (if new group)
  prospectName    String?
  prospectContact String?
  prospectEmail   String?
  prospectIndustry String?

  // Quote details
  packageId       String?
  memberCount     Int
  dependentCount  Int             @default(0)
  ageBands        Json?           // [{ minAge, maxAge, count, rate }]
  ratePerMember   Decimal
  annualPremium   Decimal         // Total annual contribution
  loadings        Json?           // { claimsHistory: 15, industry: 5 } — percentage loadings
  discounts       Json?           // { groupSize: -10, loyaltyYears: -5 }
  finalPremium    Decimal         // After loadings/discounts
  pricingNotes    String?
  validUntil      DateTime
  status          QuotationStatus @default(DRAFT)

  // If using uploaded pricing model
  pricingModelId  String?
  pricingModel    PricingModel?   @relation(fields: [pricingModelId], references: [id])

  documents       Document[]
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@unique([tenantId, quoteNumber])
  @@index([tenantId])
}

model PricingModel {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // "Standard Flat Rate", "Age-Banded Model 2025"
  description String?
  type        String   // FLAT_RATE, AGE_BANDED, EXPERIENCE_RATED, CUSTOM
  fileUrl     String?  // Uploaded Excel/Python pricing model
  parameters  Json     // Structured pricing parameters
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  quotations  Quotation[]
}

// ─── SUPPORTING ENTITIES ────────────────────────────────

model Document {
  id              String        @id @default(cuid())
  fileName        String
  fileUrl         String
  fileSize        Int?
  mimeType        String?
  category        String        // INVOICE, LAB_RESULT, DISCHARGE_SUMMARY, AGREEMENT, MEMBER_LIST, TARIFF_SCHEDULE, CLAIM_SUPPORT, ENDORSEMENT, QUOTATION
  uploadedBy      String?
  // Polymorphic relation via nullable FKs
  groupId         String?
  group           Group?        @relation(fields: [groupId], references: [id])
  endorsementId   String?
  endorsement     Endorsement?  @relation(fields: [endorsementId], references: [id])
  claimId         String?
  claim           Claim?        @relation(fields: [claimId], references: [id])
  preauthId       String?
  preauth         PreAuthorization? @relation(fields: [preauthId], references: [id])
  brokerId        String?
  broker          Broker?       @relation(fields: [brokerId], references: [id])
  quotationId     String?
  quotation       Quotation?    @relation(fields: [quotationId], references: [id])
  createdAt       DateTime      @default(now())
}

model Correspondence {
  id          String   @id @default(cuid())
  memberId    String
  member      Member   @relation(fields: [memberId], references: [id])
  type        String   // WELCOME, CARD_ISSUED, CLAIM_UPDATE, RENEWAL_REMINDER, SUSPENSION_NOTICE, PREAUTH_STATUS
  channel     String   // EMAIL, SMS, BOTH
  subject     String?
  body        String?
  status      String   @default("SENT") // SENT, FAILED, PENDING
  sentAt      DateTime @default(now())
}

model ActivityLog {
  id          String   @id @default(cuid())
  entityType  String   // GROUP, MEMBER, CLAIM, PREAUTH, ENDORSEMENT
  entityId    String
  action      String   // CREATED, UPDATED, STATUS_CHANGED, PAYMENT_RECEIVED, etc.
  description String
  userId      String?
  metadata    Json?
  createdAt   DateTime @default(now())

  // Polymorphic references
  groupId     String?
  group       Group?   @relation(fields: [groupId], references: [id])
  memberId    String?
  member      Member?  @relation(fields: [memberId], references: [id])
  endorsementId String?
  endorsement Endorsement? @relation(fields: [endorsementId], references: [id])
  preauthId   String?
  preauth     PreAuthorization? @relation(fields: [preauthId], references: [id])

  @@index([entityType, entityId])
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  action      String
  module      String
  description String
  ipAddress   String?
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([module])
  @@index([createdAt])
}

// ─── MEDICAL CODE REFERENCE ─────────────────────────────
model ICD10Code {
  code        String   @id // "E11.9"
  description String   // "Type 2 diabetes mellitus, unspecified"
  category    String   // "Endocrine, nutritional and metabolic diseases"
  chapterCode String?  // "IV"
}

model CPTCode {
  code        String   @id // "99213"
  description String   // "Office or other outpatient visit, established patient"
  category    String   // "Evaluation and Management"
  averageCost Decimal? // Reference cost in KES
}

// ─── NOTIFICATION TEMPLATES ─────────────────────────────
model NotificationTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // "Welcome Email"
  type        String   // WELCOME, CARD_ISSUED, CLAIM_APPROVED, CLAIM_DECLINED, RENEWAL_REMINDER_30, RENEWAL_REMINDER_7, PAYMENT_OVERDUE, SUSPENSION_NOTICE
  channel     String   // EMAIL, SMS, BOTH
  subject     String?  // For email
  bodyTemplate String  // Template with {{variables}}
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

// ─── INTEGRATION CONFIG ─────────────────────────────────
model IntegrationConfig {
  id          String   @id @default(cuid())
  tenantId    String
  provider    String   // SMART, SLADE360, HMS, SHA, ERP
  isEnabled   Boolean  @default(false)
  apiBaseUrl  String?
  apiKey      String?  // Encrypted
  apiSecret   String?  // Encrypted
  config      Json     @default("{}")
  lastSyncAt  DateTime?
  status      String   @default("DISCONNECTED") // CONNECTED, DISCONNECTED, ERROR
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, provider])
}
```

---

# PART 3: FEATURE MODULES — DETAILED SPECIFICATIONS

## 3.1 Endorsement Module

Endorsements are **mid-term changes** to a group's membership composition or package configuration. Every endorsement triggers a pro-rata premium recalculation.

### Business Rules

**Member Addition (mid-term join):**

1. Admin or broker submits endorsement with new member details
2. System calculates pro-rata contribution: `(dailyRate × remainingDaysInPeriod)`
3. Pro-rata amount is added to the group's next invoice as an endorsement debit
4. Upon approval, new member record is created with status `PENDING_ACTIVATION`
5. Waiting periods apply from the endorsement effective date (not the group's original effective date)
6. Member gets activated after waiting period (or immediately for categories with 0 waiting period)

**Member Deletion (mid-term exit):**

1. Admin submits deletion endorsement with reason (resignation, termination, death, voluntary exit)
2. System calculates pro-rata refund: `(dailyRate × remainingDaysInPeriod)`
3. Pro-rata refund is credited to the group's next invoice as an endorsement credit
4. Member status changes to `TERMINATED`
5. All pending pre-auths for this member are cancelled
6. Any pending claims are still processed (coverage exists for dates of service before termination)

**Dependent Addition:**

1. If the package includes dependent coverage, principal can add dependents mid-term
2. Premium adjustment = dependent rate × remaining pro-rata days
3. Dependent inherits the principal's package and benefit period
4. Waiting periods apply from dependent's enrollment date

**Dependent Deletion:**

1. Similar to member deletion but at dependent level
2. Pro-rata refund calculated

**Package Change (upgrade/downgrade):**

1. Group or member moves to a different package mid-term
2. Premium delta = `(newRate - oldRate) × remainingDays`
3. If upgrade: delta is positive (additional charge)
4. If downgrade: delta is negative (credit) — some schemes do NOT allow mid-term downgrade
5. Benefits reset to the new package's limits, but utilization from the current period carries over (deducted from new limits)

### Endorsement Workflow UI

**Admin: `/admin/endorsements`**

- Endorsement list table with filters: type, status, group, date range
- "+ New Endorsement" button → form with:
  - Group search/select
  - Endorsement type dropdown (determines the rest of the form)
  - Effective date
  - Dynamic form fields based on type:
    - MEMBER_ADDITION: full member details form (same as add member)
    - MEMBER_DELETION: member select, reason, last day of cover
    - DEPENDENT_ADDITION: principal select, dependent details
    - PACKAGE_UPGRADE/DOWNGRADE: current package (auto), new package select
  - **Pro-rata calculation preview**: automatically calculate and show the financial impact before submission
  - Supporting documents upload
  - Submit for approval

**Endorsement Detail Page** (`/admin/endorsements/:id`):

- Full endorsement details
- Financial impact summary card: previous premium, new premium, pro-rata adjustment
- Before/After comparison (e.g., member count before → after, package before → after)
- Approval actions: Approve (applies changes), Reject (with reason), Request More Info
- Activity log

### Impact on Group Financials

When an endorsement is approved and applied:

1. Group's `contributionRate` or member count is updated
2. An endorsement adjustment line is added to the next invoice
3. The group's next billing cycle reflects the new member/rate configuration
4. All financial impacts are trackable in the billing module

---

## 3.2 Premium Calculation & Quotation Module

### Pricing Engine Architecture

The system supports multiple pricing approaches via the `PricingModel` entity:

**1. Flat Rate (default):**

- Single rate per member per period
- `annualPremium = memberCount × ratePerMember`
- Simplest model, what Avenue currently uses for most groups

**2. Age-Banded:**

- Different rates based on member's age band
- Age bands: 0-17, 18-29, 30-39, 40-49, 50-59, 60-65
- `annualPremium = Σ(membersInBand × bandRate)`

**3. Experience-Rated (for renewals):**

- Base rate adjusted by the group's historical claims experience
- `renewalRate = baseRate × (1 + experienceLoading)`
- Experience loading derived from: loss ratio, claims frequency, large claim incidence

**4. Custom Model Upload:**

- Admin can upload an Excel file or Python script that implements custom pricing logic
- The system stores the file and its parameters
- For the prototype: store the file, display its parameters as JSON, and allow manual override of the calculated rate

### Quotation Builder UI

**Admin: `/admin/quotations/calculator`**

This is an interactive quoting tool:

**Step 1 — Group Info:**

- Is this a new prospect or existing group (renewal)?
- If new: company name, industry, contact info
- If renewal: select existing group (auto-loads current data)

**Step 2 — Census:**

- Enter member count (principals + dependents)
- Optionally enter age/gender breakdown for age-banded pricing
- CSV upload of member census for detailed quotes

**Step 3 — Package Selection:**

- Select a package (or build custom benefits)
- Show benefit summary

**Step 4 — Pricing:**

- Select pricing model (Flat Rate / Age-Banded / Custom)
- System calculates the base premium
- **Loadings section**: add percentage loadings for risk factors:
  - Claims history loading (if renewal): auto-calculated from loss ratio, editable
  - Industry loading: dropdown (healthcare: +10%, mining: +15%, office: 0%, etc.)
  - Custom loading: manual entry with description
- **Discounts section**: add percentage discounts:
  - Group size discount (auto: >100 members = -5%, >200 = -10%)
  - Loyalty discount (years with Avenue)
  - Custom discount
- **Final premium calculation display**: `Base Rate → + Loadings → - Discounts → Final Rate`
- Per-member and total annual amounts displayed clearly

**Step 5 — Generate Quote:**

- Review summary
- "Generate Quotation" button → creates Quotation record
- "Download Quote PDF" → generates branded PDF quotation letter
- "Send to Prospect/Broker" → email with PDF attached
- Quotation valid for 30 days (configurable)

**Broker: `/broker/quotations`**

- Brokers have access to a simplified version of the calculator
- They can generate quotes for prospects
- Quotes are submitted to Avenue admin for review/approval before being sent
- Broker sees their submitted quotes and statuses

### Premium Recalculation Triggers

The `premium.service.ts` recalculates in these scenarios:

1. Endorsement (addition/deletion) — pro-rata
2. Renewal — full re-pricing with experience loading
3. Package change — delta calculation
4. Age band reclassification — at renewal, members who crossed an age band boundary get new rates

---

## 3.3 Pre-Authorization → Claim Flow

### Complete Lifecycle

```
Member/Provider submits Pre-Auth Request
    ↓
Status: SUBMITTED
    ↓
Admin/Medical Officer reviews
    ├── APPROVED (with validity period, e.g., 30 days)
    │   ├── Member receives service within validity period
    │   │   ↓
    │   │   Provider submits claim referencing PA number
    │   │   ↓
    │   │   Claim auto-populates from PA data
    │   │   ↓
    │   │   Status: CONVERTED_TO_CLAIM
    │   │   ↓
    │   │   Normal claim adjudication proceeds
    │   │
    │   └── Validity period expires without service
    │       ↓
    │       Status: EXPIRED
    │       (No financial impact, benefit hold released)
    │
    ├── DECLINED (with reason)
    │   ↓
    │   Appears in reports as "Declined Pre-Auth"
    │   ↓
    │   Member notified with reason
    │   ↓
    │   Member can re-submit with additional info or appeal
    │
    └── MORE INFO REQUESTED
        ↓
        Status stays UNDER_REVIEW
        ↓
        Notification sent to submitter
        ↓
        Resubmitted → back to review
```

### Benefit Hold on Approval

When a pre-auth is approved:

1. The estimated/approved amount is **held** (reserved) against the member's benefit balance
2. This prevents over-utilization: if a member has KES 300,000 remaining inpatient and a PA is approved for KES 200,000, only KES 100,000 remains available for other claims
3. When the PA converts to a claim, the hold is released and replaced by the actual claim amount
4. When the PA expires, the hold is released entirely

### Conversion to Claim

When an approved pre-auth converts to a claim:

1. A new Claim is created with `source = PREAUTH` and `preauthId` linked
2. The claim auto-populates: member, provider, diagnoses, procedures, estimated amounts
3. Provider can modify amounts based on actual services rendered (actual may differ from estimate)
4. The claim then goes through normal adjudication
5. The PA status changes to `CONVERTED_TO_CLAIM`

### Pre-Auth Detail Page UI

**Approval view shows:**

- Member info + benefit check (remaining balance in relevant category)
- Diagnosis and procedure details
- Estimated cost vs. benefit remaining — **clearly shows if the PA would exceed benefits**
- Uploaded supporting documents
- Approval actions:
  - **Approve**: set approved amount (can be less than estimated), set validity period (default 30 days), auto-generates PA reference number
  - **Decline**: reason code + notes
  - **Request More Info**: notification to submitter
- **PA Letter generation**: on approval, a Pre-Authorization Letter PDF is generated showing PA number, member details, approved procedures, facility, validity dates. Downloadable.

---

## 3.4 SMART Integration

SMART (Smart Applications International) is a benefits management platform used across 4,400+ health facilities in Kenya. It handles:

- Member identification (biometric/card-based)
- Benefit management at point of service
- Real-time eligibility verification

### Integration Points

Build API endpoints and a client module at `src/server/integrations/smart/`:

1. **Member Sync** (`POST /api/integrations/smart/members/sync`):
   - Push member data to SMART when members are enrolled
   - Receive member verification requests from SMART
   - Map AiCare member numbers to SMART card numbers

2. **Eligibility Check** (`POST /api/integrations/smart/eligibility`):
   - When a provider queries SMART for member eligibility, SMART calls our API
   - We respond with: member status, benefit balances, co-pay rates, waiting period status

3. **Benefit Deduction** (`POST /api/integrations/smart/benefits/deduct`):
   - When a service is provided at a SMART-enabled facility, SMART sends a benefit deduction request
   - We deduct from the member's benefit balance and respond with confirmation

4. **Claims Ingest** (`POST /api/integrations/smart/claims`):
   - Receive claim data from SMART after service delivery
   - Create Claim records with `source = SMART`

### Configuration UI

In Settings → Integrations → SMART:

- API Base URL, API Key, API Secret fields
- "Test Connection" button
- Sync status and last sync timestamp
- Mapping table: AiCare member numbers ↔ SMART card numbers
- Auto-sync toggle

---

## 3.5 Slade360 EDI Integration

Slade360 (by Savannah Informatics) is Kenya's leading Electronic Data Interchange for health insurance, connecting 2,500+ providers with insurers. It handles:

- Electronic claims submission (eClaims)
- Pre-authorization processing
- Member eligibility verification
- Invoice generation and payment tracking

### Integration Points

Build API endpoints and a client module at `src/server/integrations/slade360/`:

1. **eClaims Ingestion** (`POST /api/integrations/slade360/eclaims`):
   - Receive eClaims submitted by providers through Slade360
   - Map to AiCare Claim records with `source = SLADE360`
   - Include ICD-10 diagnoses and bill items from the Slade360 payload

2. **Pre-Auth Exchange** (`POST /api/integrations/slade360/preauth`):
   - Receive pre-auth requests from providers via Slade360
   - Process through AiCare's PA workflow
   - Return approval/decline to Slade360

3. **Eligibility Response** (`GET /api/integrations/slade360/eligibility/:memberId`):
   - Respond to eligibility queries from Slade360
   - Return: member status, benefit balances, co-pay, provider access

4. **Remittance Advice** (`POST /api/integrations/slade360/remittance`):
   - Push payment/remittance data back to Slade360 when claims are paid
   - Providers can then see payment status in their Slade360 portal

### Configuration UI

In Settings → Integrations → Slade360:

- EDI API credentials
- Provider mapping: AiCare provider IDs ↔ Slade360 provider codes
- Member mapping
- eClaims auto-import toggle
- Claims submission format configuration

---

## 3.6 HMS Integration (HL7 FHIR)

Build a FHIR-compatible integration layer for connecting to hospital management systems:

1. **Patient Resource** — sync member data as FHIR Patient resources
2. **Encounter Resource** — receive encounter data (visits, admissions) and create claims
3. **Condition Resource** — receive diagnoses (ICD-10 coded)
4. **Procedure Resource** — receive procedures (CPT coded)
5. **Claim Resource** — submit/receive FHIR Claim resources

Build the FHIR client at `src/server/integrations/hms/fhir-client.ts` with methods for each resource type. Actual facility connections will be configured per deployment.

---

# PART 4: FRONTEND SPECIFICATIONS

## 4.1 Branding & Theming

The frontend reads tenant branding from the database and applies it via CSS custom properties. For Avenue Healthcare:

```css
:root {
  --primary: #292a83;
  --primary-hover: #435ba1;
  --accent-warm: #f5c6b6;
  --text-heading: #212529;
  --text-body: #848e9f;
  --text-muted: #6c757d;
  --bg-primary: #ffffff;
  --bg-alt: #e6e7e8;
  --border: #eeeeee;
  --border-subtle: #e7ebef;
  --divider: #dcdcdc;
  --success: #28a745;
  --error: #dc3545;
  --info: #17a2b8;
  --whatsapp: #25d366;
  --radius-pill: 50px;
  --radius-card: 8px;
  --font-heading: "Quicksand", "Nunito", sans-serif;
  --font-body: "Lato", "Open Sans", sans-serif;
}
```

- Load Google Fonts: Quicksand (700) and Lato (400, 700)
- All headings: Quicksand 700
- Body text: Lato 400, color `#848E9F` (NOT black)
- All buttons: pill-shaped (`border-radius: 50px`)
- Cards: white, 1px `#EEEEEE` border, 8px radius, subtle shadow
- Sidebar: indigo active states
- Tables: alternating row shading with `#E6E7E8`
- Currency: always "KES 1,234,567" format

## 4.2 All Three Portals

Build all three portals as specified in the Lovable update prompt (already provided in this project). Key additions beyond what was in the Lovable spec:

### Admin Portal additions:

- **Endorsements** section in sidebar (between Members and Packages)
- **Quotations** section in sidebar (under Brokers)
- Premium calculator page
- All detail pages fully functional with data CRUD

### Broker Portal additions:

- **Quotation calculator** accessible to brokers
- Submitted quotes visible with status tracking

### Member Portal additions:

- Clean mobile-first design with bottom tab navigation on mobile
- Digital member card with QR code
- WhatsApp floating button

---

# PART 5: REPORTS

Build 11 report types as specified in the update prompt. Each report has:

- Date range filter, additional relevant filters
- Recharts visualizations
- Data table below
- Export to CSV and PDF

Additionally, add **two new reports:**

12. **Endorsement Report**: endorsements by type, by group, by period. Shows pro-rata financial impact of all endorsements.
13. **Quotation Pipeline Report**: quotes generated, conversion rate (quote → active group), average premium, broker attribution.

---

# PART 6: SEED DATA

Create a comprehensive seed script at `prisma/seed.ts` that populates:

- 1 tenant: Avenue Healthcare
- 6 admin users (one per role)
- 3 packages (Essential KES 30,000, Premier KES 75,000, Executive KES 150,000) with full benefit configs
- 5 groups with realistic Kenyan company names
- ~25 members across groups with Kenyan names, dependents, varying statuses
- ~50 claims across different statuses, facilities, diagnoses
- 3 brokers with commission data
- 4 Avenue providers + 4 partner providers
- ~10 endorsements in various statuses
- 5 pre-authorizations (1 approved, 1 declined, 1 converted to claim, 1 expired, 1 pending)
- 3 quotations
- ~200 ICD-10 codes (most common in Kenya)
- ~100 CPT codes (most common)
- Invoice and payment records
- Notification templates

---

# PART 7: DEPLOYMENT

## Docker Compose

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://aicare:${DB_PASSWORD}@db:5432/aicare
      - REDIS_URL=redis://redis:6379
      - MINIO_ENDPOINT=minio
      - MINIO_PORT=9000
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
    depends_on:
      - db
      - redis
      - minio

  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=aicare
      - POSTGRES_USER=aicare
      - POSTGRES_PASSWORD=${DB_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes:
      - miniodata:/data
    environment:
      - MINIO_ROOT_USER=${MINIO_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}

  worker:
    build: .
    command: npm run worker
    environment:
      - DATABASE_URL=postgresql://aicare:${DB_PASSWORD}@db:5432/aicare
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/certs:/etc/nginx/certs
    depends_on:
      - app

volumes:
  pgdata:
  redisdata:
  miniodata:
```

## .env.example

```env
DATABASE_URL=postgresql://aicare:changeme@localhost:5432/aicare
REDIS_URL=redis://localhost:6379
NEXTAUTH_SECRET=generate-a-random-secret
NEXTAUTH_URL=http://localhost:3000
DB_PASSWORD=changeme
MINIO_USER=minioadmin
MINIO_PASSWORD=minioadmin
MINIO_ENDPOINT=localhost
MINIO_PORT=9000

# Integration credentials (optional)
SMART_API_URL=
SMART_API_KEY=
SLADE360_API_URL=
SLADE360_API_KEY=
AFRICAS_TALKING_API_KEY=
AFRICAS_TALKING_USERNAME=

# Email
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
```

---

# PART 8: DEVELOPMENT INSTRUCTIONS

## Getting Started

```bash
# 1. Clone and install
npm install

# 2. Start services
docker-compose up -d db redis minio

# 3. Run migrations
npx prisma migrate dev

# 4. Seed data
npx prisma db seed

# 5. Start dev server
npm run dev
```

## Build Order

Build the system in this order:

1. **Database & Auth**: Prisma schema, migrations, seed, NextAuth setup, role-based middleware
2. **Core CRUD**: Groups, Members, Packages (basic list/detail/create/edit)
3. **Claims Module**: Claims list, detail page with ICD-10/CPT search, adjudication workflow
4. **Endorsements Module**: All endorsement types, pro-rata calculations, approval workflow
5. **Pre-Auth Module**: Full lifecycle including conversion to claim
6. **Billing Module**: Invoicing, payments, reconciliation, aging
7. **Premium & Quotations**: Calculator, quotation builder, pricing models
8. **Broker Portal**: All broker-facing features
9. **Member Portal**: All member-facing features
10. **Reports**: All 13 report types with charts
11. **Broker Management**: Commission tracking, statements
12. **Settings**: Users, roles, notification templates, integrations config
13. **Integrations**: SMART, Slade360, HMS API endpoints
14. **Background Jobs**: Billing runs, renewal reminders, suspension checks
15. **Polish**: PDF generation, member cards, export functionality

## Key Technical Notes

- All monetary values use `Decimal` (Prisma) / `number` (frontend) — never floating point
- All dates stored as UTC, displayed in EAT (East Africa Time, UTC+3)
- All tables must be sortable, filterable, paginated (server-side pagination for large datasets)
- Toast notifications on all mutations
- Optimistic updates where appropriate
- Form validation with Zod schemas shared between frontend and backend via tRPC
- Every mutation creates an AuditLog entry
- File uploads go to MinIO, URLs stored in database

---

This specification defines the complete AiCare Membership Management Platform. Build every module, every page, every API endpoint, every database table as specified. The system should be production-ready, fully functional with the seeded demo data, and containerized for deployment.
