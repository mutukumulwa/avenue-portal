# AiCare Underwriter Workflow — Implementation Plan

**Derived from:** `AICARE_UNDERWRITER_WORKFLOW_SPEC.md` v1.0 (May 2026)
**Plan version:** 2.0
**Date:** 2026-05-12
**Author:** Antigravity (via Claude)
**Target audience:** Implementing agents and developers

---

## How to Use This Document

This plan is the definitive execution roadmap for implementing the underwriter workflow described in the spec. Each phase maps to one or more spec processes. Within each phase:

- **Status** shows what is already implemented vs. what is missing
- **Schema tasks** are concrete Prisma model additions or modifications
- **Service tasks** are concrete method additions in `src/server/services/`
- **Router tasks** are tRPC procedure additions in `src/server/trpc/routers/`
- **Job tasks** are scheduled job additions in `src/server/jobs/`
- **UI tasks** are Next.js page and component additions in `src/app/`

Implement phases in order — each builds on the data model established by the previous. Within a phase, schema changes must be applied before service/router/UI work.

---

## Resolved Design Decisions

These decisions were confirmed by Mutuku on 2026-05-12. They are constraints, not suggestions.

| # | Decision |
|---|---|
| **1 — RBAC** | Replace the `UserRole` enum with a database-driven Role/Permission system (full design in Phase 0). Take the migration pain now; do not add more enum values. |
| **2 — New business intake** | Model new business submissions as a `Quotation` in extended pre-issuance statuses (`PENDING_VALIDATION`, `PENDING_ASSESSMENT`, `ASSESSED`, `ASSESSED_PENDING_SENIOR_APPROVAL`). Do NOT add a top-level `Submission` entity. |
| **3 — Role codes** | Keep `UNDERWRITER` as the role code in code and database. "Membership Assessor" and other presentation names are terminology-engine concerns. |
| **4 — PDF generation** | Use Puppeteer (or Playwright — same model) for server-rendered HTML-to-PDF. Do not use PDFKit or React-pdf. |
| **5 — IPRS integration** | Implement as a stub service only. No real API call. Mark as future feature once platform buyers' IPRS provisioning is understood. |
| **6 — Custom pricing model** | In scope. Implement a sandboxed evaluator for uploaded Excel or Python pricing files (design in Phase 2). |
| **7 — M-Pesa/Daraja** | Implement as a stub service only. No real API call. Mark as future feature. |

---

## Codebase Orientation

### Key paths
| Area | Path |
|---|---|
| Prisma schema | `prisma/schema.prisma` |
| tRPC routers | `src/server/trpc/routers/` |
| Services | `src/server/services/` |
| Scheduled jobs | `src/server/jobs/` |
| Admin UI pages | `src/app/(admin)/` |
| Broker portal pages | `src/app/broker/` |
| Member portal pages | `src/app/member/` |
| Shared components | `src/components/` |

### Existing entities and their status
| Spec entity | Existing equivalent | Gap |
|---|---|---|
| New business submission | `Quotation` (DRAFT) | Missing assessment statuses, lives table, risk profile |
| `UnderwritingDecision` | None | Completely missing |
| `MembershipExclusion` | None | Completely missing |
| `WaitingPeriodApplication` | None | Completely missing |
| `RiskProfile` | `MemberRiskProfile` (analytics only) | Not linked to quotation assessment flow |
| Assessor work queue | None | Completely missing |
| `QuotationVersion` | None | Quotation has no version history |
| `QuotationLineItem` | None | No itemized quote breakdown |
| `MembershipBindingDocument` | `Document` (generic) | Not binder-specific |
| `FundDeposit` | `SelfFundedAccount` + `FundTransaction` | No deposit request workflow |
| `MemberKycRecord` | None | KYC documents exist but no structured record |
| `MembershipCard` | None | No card entity tracked in DB |
| `WelcomeCommunicationLog` | `Correspondence` (generic) | Not onboarding-specific |
| `BenefitHold` | None | PA holds not modeled as distinct entity |
| `MembershipBenefitState` | `BenefitUsage` (partial) | Usage tracked but hold state missing |
| `ProRataCalculation` | None | Not modeled |
| `SchemeRenewalAnalysis` | `RenewalAnalysis` | Exists; pipeline view and simulator missing |
| `MembershipLapseRecord` | None | Lapse state on Member only |
| `InternalBlacklist` | None | Completely missing |
| `RefundQueue` | `PaymentVoucher` (partial) | Not structured as a queue |
| `OverrideRecord` | `ExceptionLog` | Exists but lacks structured taxonomy |
| `ContractedRate` | `ProviderTariff` | Partial |
| `ProviderSettlementBatch` | None | Not modeled |
| `AuditChainEntry` | `AuditLog` + `ActivityLog` | Exists; hash-chaining missing |
| Role / Permission system | `UserRole` enum on User | Flat enum; not database-driven |

### Existing role codes (keep all; do not rename)
`SUPER_ADMIN`, `CLAIMS_OFFICER`, `FINANCE_OFFICER`, `UNDERWRITER`, `CUSTOMER_SERVICE`, `MEDICAL_OFFICER`, `REPORTS_VIEWER`, `BROKER_USER`, `MEMBER_USER`, `HR_MANAGER`, `FUND_ADMINISTRATOR`

Spec roles map as follows (presentation layer only — code always uses the right column):

| Spec role | Code role |
|---|---|
| Membership Assessor | `UNDERWRITER` |
| Senior Membership Assessor | `SENIOR_UNDERWRITER` (new — added as DB record, not enum) |
| Member Operations Officer | `CUSTOMER_SERVICE` |
| Benefit Reviewer | `CLAIMS_OFFICER` |
| Pre-Authorization Officer | `PRE_AUTH_OFFICER` (new) |
| Senior Benefit Reviewer | `SENIOR_CLAIMS_OFFICER` (new) |
| Scheme Manager | `SCHEME_MANAGER` (new) |
| Compliance Officer | `COMPLIANCE_OFFICER` (new) |
| Medical Advisor | `MEDICAL_ADVISOR` (new) |

New roles are database records in the `Role` table (Phase 0), not enum values. This is the core of Decision #1.

---

## Phase 0 — Foundation: RBAC, Audit Chain, Override, Blacklist

**Spec reference:** Section 1 (Cast of Actors), Section 13 (Maker-Checker), Section 15 (Cross-Cutting)
**Must complete before all other phases.**

---

### 0.1 RBAC System Redesign

**Current state:** `UserRole` is a flat Prisma enum on the `User` model. Adding a role requires a schema migration, a new code deployment, and updates to every RBAC check that enumerates roles. There is no concept of permissions, multiple roles per user, time-limited assignments, or maker-checker on role grants.

**Target state:** Roles and permissions are database records. The `UserRole` enum is deprecated (kept on `User` for a backward-compat period, then removed in a follow-up migration). Permission checks in middleware query `UserRoleAssignment` (cached on the session). New roles are added by inserting a `Role` row — no schema migration.

#### Schema additions

```prisma
model Role {
  id           String   @id @default(cuid())
  tenantId     String?  // null = system-wide; non-null = tenant-custom role
  code         String   // machine identifier, e.g. "UNDERWRITER", "SENIOR_UNDERWRITER"
  isSystemRole Boolean  @default(false)  // system roles cannot be deleted
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())

  permissions  RolePermission[]
  assignments  UserRoleAssignment[]

  @@unique([tenantId, code])
  @@index([code])
}

model Permission {
  id          String   @id @default(cuid())
  code        String   @unique  // e.g. "QUOTATION:APPROVE_BINDER"
  module      String             // e.g. "QUOTATION", "CLAIM", "UNDERWRITING"
  action      String             // e.g. "CREATE", "VIEW", "APPROVE", "DECLINE"
  resource    String             // e.g. "QUOTATION", "CLAIM", "MEMBER"
  description String

  roles RolePermission[]
}

model RolePermission {
  roleId       String
  permissionId String
  grantedAt    DateTime @default(now())
  grantedById  String

  role       Role       @relation(fields: [roleId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}

model UserRoleAssignment {
  id           String               @id @default(cuid())
  userId       String
  roleId       String
  tenantId     String
  assignedAt   DateTime             @default(now())
  expiresAt    DateTime?
  isActive     Boolean              @default(true)
  revokedAt    DateTime?
  revokedById  String?
  // Maker-checker on role assignment per spec Section 13
  makerId      String
  checkerId    String?
  status       RoleAssignmentStatus @default(PENDING_APPROVAL)

  user    User   @relation(fields: [userId], references: [id])
  role    Role   @relation(fields: [roleId], references: [id])
  tenant  Tenant @relation(fields: [tenantId], references: [id])

  @@unique([userId, roleId, tenantId, isActive])
  @@index([tenantId, userId, isActive])
}

enum RoleAssignmentStatus {
  PENDING_APPROVAL
  ACTIVE
  REVOKED
  EXPIRED
}
```

#### Seed data (migration script, not hardcoded in application)

Create `prisma/seeds/roles.ts`:

Seed one `Role` row per existing `UserRole` enum value (using the same code string), plus all new roles:

```
SUPER_ADMIN, CLAIMS_OFFICER, FINANCE_OFFICER, UNDERWRITER, CUSTOMER_SERVICE,
MEDICAL_OFFICER, REPORTS_VIEWER, BROKER_USER, MEMBER_USER, HR_MANAGER,
FUND_ADMINISTRATOR,
SENIOR_UNDERWRITER, PRE_AUTH_OFFICER, SENIOR_CLAIMS_OFFICER,
SCHEME_MANAGER, COMPLIANCE_OFFICER, MEDICAL_ADVISOR
```

Seed one `Permission` row per action/resource combination. Group by module:

| Module | Permissions (examples — seed the complete set) |
|---|---|
| `QUOTATION` | `QUOTATION:CREATE`, `QUOTATION:VIEW`, `QUOTATION:ISSUE`, `QUOTATION:APPROVE_BINDER`, `QUOTATION:DECLINE` |
| `UNDERWRITING` | `UNDERWRITING:ASSESS`, `UNDERWRITING:APPROVE_SENIOR`, `UNDERWRITING:RECORD_DECISION` |
| `CLAIM` | `CLAIM:VIEW`, `CLAIM:ADJUDICATE`, `CLAIM:APPROVE_SENIOR`, `CLAIM:APPEAL` |
| `PREAUTH` | `PREAUTH:CREATE`, `PREAUTH:ADJUDICATE`, `PREAUTH:APPROVE_SENIOR`, `PREAUTH:ESCALATE` |
| `MEMBER` | `MEMBER:VIEW`, `MEMBER:CREATE`, `MEMBER:AMEND`, `MEMBER:TERMINATE`, `MEMBER:REINSTATE` |
| `BILLING` | `BILLING:VIEW`, `BILLING:POST_DEBIT_NOTE`, `BILLING:APPROVE_SETTLEMENT` |
| `BROKER` | `BROKER:VIEW`, `BROKER:MANAGE`, `BROKER:APPROVE_COMMISSION` |
| `ANALYTICS` | `ANALYTICS:VIEW_PORTFOLIO`, `ANALYTICS:VIEW_PARITY`, `ANALYTICS:EXPORT` |
| `COMPLIANCE` | `COMPLIANCE:VIEW_AUDIT_CHAIN`, `COMPLIANCE:VIEW_OVERRIDES`, `COMPLIANCE:VIEW_PARITY` |
| `OVERRIDE` | `OVERRIDE:REQUEST`, `OVERRIDE:APPROVE_SINGLE`, `OVERRIDE:APPROVE_DUAL` |
| `ROLE` | `ROLE:ASSIGN`, `ROLE:APPROVE_ASSIGNMENT`, `ROLE:REVOKE` |

Seed `RolePermission` rows assigning the right permissions to each role. The `SUPER_ADMIN` role gets all permissions.

#### Migration of existing data

Create a one-time migration script `prisma/migrations/migrate_roles_to_assignments.ts`:
- For every `User` with a non-null `role`, find the corresponding `Role` row by code, create a `UserRoleAssignment` with `status = ACTIVE` (maker = system, checker = system for the migration batch)
- After validation: mark `User.role` as `@deprecated` in schema comments; do NOT delete the column yet

#### Permission check service

Create `src/server/services/rbac.service.ts`:

```typescript
// Cache shape: Map<userId, Set<permissionCode>>
// Cache is populated on session creation and invalidated on role assignment change

export const rbacService = {
  // Primary check used everywhere in middleware and services
  async hasPermission(userId: string, permission: string, tenantId: string): Promise<boolean>

  // Convenience check for role membership (used when you need the role, not a permission)
  async hasRole(userId: string, roleCode: string, tenantId: string): Promise<boolean>

  // Returns all active permissions for a user (used to hydrate session)
  async getUserPermissions(userId: string, tenantId: string): Promise<string[]>

  // Assigns a role — maker-checker enforced
  async assignRole(userId: string, roleId: string, tenantId: string, makerId: string): Promise<UserRoleAssignment>

  // Approves a pending assignment — checker must differ from maker
  async approveRoleAssignment(assignmentId: string, checkerId: string): Promise<void>

  // Revokes an active assignment — itself requires maker-checker (ROLE:REVOKE permission)
  async revokeRole(assignmentId: string, revokerId: string): Promise<void>
}
```

#### tRPC middleware update

In `src/server/trpc/middleware.ts` (or wherever role checks currently live):
- Replace all `ctx.user.role === 'UNDERWRITER'` style checks with `await rbacService.hasRole(ctx.user.id, 'UNDERWRITER', ctx.tenantId)` or `await rbacService.hasPermission(ctx.user.id, 'QUOTATION:ISSUE', ctx.tenantId)`
- Cache resolved permissions in the tRPC context object on first check within a request

#### Router tasks

Create `src/server/trpc/routers/roles.ts`:
- `listRoles` — query (all roles visible to tenant)
- `listPermissions` — query (SUPER_ADMIN only)
- `assignRole` — mutation (`ROLE:ASSIGN` permission required)
- `approveAssignment` — mutation (`ROLE:APPROVE_ASSIGNMENT` permission required; checker ≠ maker enforced)
- `revokeRole` — mutation (`ROLE:REVOKE` permission required)
- `getUserRoles` — query (self, or SUPER_ADMIN for any user)

#### UI tasks

**`src/app/(admin)/settings/roles/page.tsx`** — Role management
- List all roles with permission count
- Per role: list assigned permissions, manage assignments
- Assign role to user (initiates maker-checker flow)
- Pending assignments queue (for checker approval)

---

### 0.2 Audit chain hardening

**Status:** `AuditLog` and `ActivityLog` exist. Hash-chaining does NOT exist.

#### Schema additions

Add to `AuditLog` model:
```prisma
payloadHash   String?   // SHA-256 of the canonical JSON payload
previousHash  String?   // payloadHash of the preceding entry (by chainSequence)
chainSequence BigInt    @default(autoincrement())
// Note: chainSequence is per-tenant, not global
tenantChainSequence BigInt?  // tenant-scoped sequence for per-tenant chain verification
```

#### Service tasks

Create `src/server/services/audit-chain.service.ts`:

- `append(tenantId, actorId, action, entityType, entityId, payload)` — serializes payload to canonical JSON (sorted keys), computes SHA-256, fetches previous entry's hash in a transaction, writes new entry; returns new entry
- `verify(tenantId, fromSequence, toSequence)` — re-computes hashes for each entry in range and confirms they match stored hashes; returns `{ valid: boolean, firstBreak?: number }`

All service calls that mutate business state must call `auditChain.append(...)`. This replaces ad-hoc AuditLog writes.

#### Router tasks

Create `src/server/trpc/routers/auditChain.ts`:
- `list` — filterable paginated query; `COMPLIANCE_OFFICER` and `SUPER_ADMIN` only
- `verify` — triggers re-verification for a date range; returns pass/fail per entry

#### UI tasks

**`src/app/(admin)/audit-chain/page.tsx`**
- Reverse-chronological list with entity type, actor, action, timestamp, hash (truncated), chain status (green check / red X)
- Filter by entity type, actor, date range
- Verify range button
- Access-gated to `COMPLIANCE_OFFICER` + `SUPER_ADMIN`

---

### 0.3 Override record entity

**Status:** `ExceptionLog` exists but lacks the structured taxonomy from spec Section 13.

#### Schema additions

```prisma
model OverrideRecord {
  id              String         @id @default(cuid())
  tenantId        String
  overrideType    OverrideType
  makerId         String
  checkerId       String?
  checker2Id      String?        // for dual-approval override types
  status          OverrideStatus @default(PENDING)
  reasonCode      OverrideReasonCode
  justification   String
  entityType      String
  entityId        String
  preState        Json?
  postState       Json?
  slaDeadlineAt   DateTime
  resolvedAt      DateTime?
  auditEntryId    String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt

  tenant  Tenant @relation(fields: [tenantId], references: [id])
  maker   User   @relation("OverrideMaker", fields: [makerId], references: [id])
  checker User?  @relation("OverrideChecker", fields: [checkerId], references: [id])

  @@index([tenantId, status])
  @@index([tenantId, makerId])
  @@index([tenantId, entityType, entityId])
}

enum OverrideType {
  BACK_DATED_AMENDMENT
  BACK_DATED_COVER_START
  RATE_DEVIATION_EXCEED
  PRE_AUTH_OVER_BENEFIT_CAP
  CLAIM_EXCLUDED_DIAGNOSIS
  FORCE_APPROVE_FRAUD_CLAIM
  WAIVE_CO_CONTRIBUTION
  EXTEND_GRACE_PERIOD
  MID_TERM_RATE_CHANGE
  FRAUD_RULE_THRESHOLD_ADJUSTMENT
  RESTORE_TERMINATED_MEMBERSHIP
  PRIVILEGE_ESCALATION   // role assignment requiring override
  CUSTOM
}

enum OverrideStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
}

enum OverrideReasonCode {
  ADMINISTRATIVE_CORRECTION
  EXCEPTIONAL_BUSINESS_CASE
  REGULATORY_REQUIREMENT
  CLIENT_RETENTION
  CLINICAL_NECESSITY
  SYSTEM_ERROR_CORRECTION
  MANAGEMENT_INSTRUCTION
  OTHER
}
```

#### Service tasks

Create `src/server/services/override.service.ts`:

- `request(tenantId, makerId, overrideType, entityType, entityId, reasonCode, justification, supportingDocUrls?)` — validates maker has `OVERRIDE:REQUEST` permission; captures preState; routes to correct approver(s); sets SLA deadline (2 hours for operational, 24 hours for commercial); logs to audit chain
- `approve(overrideId, checkerId, notes?)` — validates checker ≠ maker and checker has `OVERRIDE:APPROVE_SINGLE` or `OVERRIDE:APPROVE_DUAL`; applies underlying action; captures postState; marks APPROVED; logs to audit chain
- `reject(overrideId, checkerId, reason)` — marks REJECTED; logs to audit chain
- `list(tenantId, filters)` — paginated, filterable by type, status, maker, date
- `getPatterns(tenantId, dateRange)` — per-maker frequency aggregation for compliance review
- `generateDailySummary(tenantId)` — returns structured summary for compliance inbox
- `generateMonthlyReport(tenantId, month, year)` — PDF via Puppeteer for board pack

#### Router tasks

`src/server/trpc/routers/overrides.ts`:
- `request`, `approve`, `reject`, `list`, `getPatterns` — all with appropriate permission gating

#### UI tasks

- **`src/app/(admin)/overrides/page.tsx`** — Override queue with SLA timers
- **`src/app/(admin)/overrides/[id]/page.tsx`** — Override detail with approve/reject
- **`src/app/(admin)/overrides/patterns/page.tsx`** — Compliance view; `COMPLIANCE_OFFICER` only

---

### 0.4 Internal blacklist entity

**Status:** Missing completely.

#### Schema additions

```prisma
model InternalBlacklist {
  id              String          @id @default(cuid())
  tenantId        String
  nationalId      String
  memberName      String
  reason          BlacklistReason
  narrative       String?
  addedById       String
  addedAt         DateTime        @default(now())
  isActive        Boolean         @default(true)
  deactivatedAt   DateTime?
  deactivatedById String?
  relatedMemberId String?

  tenant   Tenant @relation(fields: [tenantId], references: [id])
  addedBy  User   @relation("BlacklistAdder", fields: [addedById], references: [id])

  @@unique([tenantId, nationalId, isActive])
  @@index([tenantId, isActive])
}

enum BlacklistReason {
  FRAUD_CONFIRMED
  MISREPRESENTATION
  TERMS_BREACH
  COURT_ORDER
  OTHER
}
```

#### Service tasks

Create `src/server/services/blacklist.service.ts`:

- `add(tenantId, nationalId, memberName, reason, addedById, relatedMemberId?)` — creates entry; logs to audit chain; requires `MEMBER:TERMINATE` permission
- `check(tenantId, nationalId)` — returns matching entry or null; called during intake validation and pre-bind validation
- `deactivate(tenantId, nationalId, actorId)` — requires `OverrideRecord` of type `RESTORE_TERMINATED_MEMBERSHIP`; soft-deletes entry

---

### 0.5 Cross-cutting technical constraints

Enforce across all new code written in Phases 1–14:

1. **Decimal types** — all monetary fields: `Decimal @db.Decimal(19,4)`. Never `Float`.
2. **UTC storage / EAT display** — all `DateTime` stored as UTC. Add `src/lib/date.ts` with `toEAT(date: Date): string` if not present.
3. **Never-delete convention** — no `delete` or `deleteMany` on business entities. Use `isActive: false` + `deactivatedAt`.
4. **Server-side pagination** — all list queries accept `{ page, pageSize, sortBy, sortDir }`, return `{ items, total, page, pageSize }`.
5. **Zod schemas** — every tRPC input and output has an explicit Zod schema; schemas shared between client and server.
6. **Tenant scoping** — every Prisma query includes `where: { tenantId }`.
7. **Maker-checker server enforcement** — `makerId !== checkerId` checked in service layer, not UI.
8. **Terminology engine** — all user-facing strings pass through the engine. No hard-coded "policy", "premium", "claim", "underwrite", "insure", "endorsement" visible in the UI.
9. **Permission checks** — use `rbacService.hasPermission(userId, 'MODULE:ACTION', tenantId)` — never check `user.role` directly in routers or services after Phase 0 is merged.

---

## Phase 1 — New Business Intake & Risk Assessment (Process 3)

**Spec reference:** Section 3
**Decision #2 applies:** No `Submission` entity. This flow extends `Quotation` with pre-issuance assessment stages.

### 1.1 Status assessment

| Checklist item | Status |
|---|---|
| Quotation status lifecycle covering assessment stages | **MISSING** — only post-assessment statuses exist |
| Lives table linked to quotation (census data) | **MISSING** |
| CSV/Excel census import | **PARTIAL** — member bulk import exists; not linked to quotation |
| Per-life `UnderwritingDecision` records | **MISSING** |
| Loading multiplier stored as Decimal | **MISSING** |
| Exclusion records with ICD-10 codes | **MISSING** |
| Assessor work queue with SLA timers | **MISSING** |
| Threshold-based escalation to senior | **MISSING** |
| Every status transition logged to audit chain | **PARTIAL** — AuditLog exists; chain not hash-linked |
| IPRS national ID validation | **STUB** — Decision #5 |
| Blacklist check during intake | **DEPENDS ON Phase 0** |
| Terminology engine on all intake surfaces | **PARTIAL** |

### 1.2 Schema tasks

#### Extend `QuotationStatus` enum

Add the following values (do not remove existing ones):
```
PENDING_VALIDATION
PENDING_ASSESSMENT
ASSESSED
ASSESSED_PENDING_SENIOR_APPROVAL
DECLINED_BY_UNDERWRITING
WITHDRAWN_BY_SUBMITTER
```

The full status progression for a new business quotation is now:
```
DRAFT → PENDING_VALIDATION → PENDING_ASSESSMENT → ASSESSED (or ASSESSED_PENDING_SENIOR_APPROVAL)
      → ISSUED → ACCEPTED → [binding] → EXPIRED | WITHDRAWN | SUPERSEDED
```
For terminal assessment failures:
```
PENDING_ASSESSMENT → DECLINED_BY_UNDERWRITING | WITHDRAWN_BY_SUBMITTER
```

#### Extend `Quotation` model

Add fields:
```prisma
// Assessment-stage fields
clientType            ClientType?         // CORPORATE | INDIVIDUAL
coverMode             CoverMode           @default(CONTRIBUTION_BEARING)
industryCode          String?
headcount             Int?
legalName             String?             // corporate: legal entity name
registrationNumber    String?
kraPinCorporate       String?
billingContactEmail   String?
requestedCoverStart   DateTime?
censusFileUrl         String?             // uploaded CSV/Excel for corporate

// Workflow fields
assignedAssessorId    String?
assessorSlaDeadlineAt DateTime?
assessorNotes         String?
seniorApprovalNote    String?
declineReason         String?

// Issuance fields (already likely present — verify)
isRenewal             Boolean             @default(false)
priorQuotationId      String?
validityDays          Int                 @default(30)
expiresAt             DateTime?
issuedAt              DateTime?
pdfUrl                String?
benefitScheduleUrl    String?
termsUrl              String?
```

Add relations:
```prisma
lives             QuotationLife[]
decisions         UnderwritingDecision[]
riskProfile       QuotationRiskProfile?
workQueueItem     AssessorWorkQueueItem?
versions          QuotationVersion[]
lineItems         QuotationLineItem[]
```

#### New models

```prisma
enum ClientType {
  CORPORATE
  INDIVIDUAL
}

enum CoverMode {
  CONTRIBUTION_BEARING
  FUND_MANAGED
}

model QuotationLife {
  id              String      @id @default(cuid())
  tenantId        String
  quotationId     String
  role            LifeRole
  principalLifeId String?     // dependants point to their principal QuotationLife
  firstName       String
  lastName        String
  nationalId      String?
  dateOfBirth     DateTime
  gender          Gender
  isChronic       Boolean     @default(false)
  iprsValidated   Boolean     @default(false)
  medicalHistory  Json?       // array of { icd10Code, description, isCurrentCondition }
  decision        UnderwritingDecision?
  createdAt       DateTime    @default(now())

  quotation  Quotation  @relation(fields: [quotationId], references: [id])

  @@index([quotationId])
  @@index([tenantId, nationalId])
}

enum LifeRole {
  PRINCIPAL
  DEPENDANT
}

model UnderwritingDecision {
  id                       String         @id @default(cuid())
  tenantId                 String
  quotationId              String
  quotationLifeId          String?        @unique
  memberId                 String?        // populated when decision carries to active membership
  decision                 UWDecisionType
  loadingMultiplier        Decimal?       @db.Decimal(5,4)  // e.g. 1.25 not 125%
  excludedIcd10Codes       String[]
  waitingPeriodDays        Int?
  waitingPeriodCategories  String[]
  reasonCode               String
  narrative                String?
  decidedById              String
  seniorApprovedById       String?
  seniorApprovedAt         DateTime?
  createdAt                DateTime       @default(now())
  updatedAt                DateTime       @updatedAt

  quotation     Quotation       @relation(fields: [quotationId], references: [id])
  quotationLife QuotationLife?  @relation(fields: [quotationLifeId], references: [id])
  decidedBy     User            @relation("UWDecider", fields: [decidedById], references: [id])

  @@index([tenantId, quotationId])
  @@index([tenantId, memberId])
}

enum UWDecisionType {
  STANDARD
  LOADED
  EXCLUSION
  WAITING_PERIOD
  DECLINED
}

model MembershipExclusion {
  id                String   @id @default(cuid())
  tenantId          String
  memberId          String
  icd10Code         String
  description       String?
  sourceDecisionId  String
  effectiveFrom     DateTime
  effectiveTo       DateTime?
  isActive          Boolean  @default(true)
  deactivatedAt     DateTime?

  @@index([tenantId, memberId])
  @@index([tenantId, memberId, icd10Code])
}

model WaitingPeriodApplication {
  id                 String   @id @default(cuid())
  tenantId           String
  memberId           String
  benefitCategories  String[]
  waitingPeriodDays  Int
  startDate          DateTime
  endDate            DateTime  // startDate + waitingPeriodDays
  sourceDecisionId   String
  isActive           Boolean   @default(true)
  deactivatedAt      DateTime?

  @@index([tenantId, memberId])
}

model QuotationRiskProfile {
  id                String   @id @default(cuid())
  tenantId          String
  quotationId       String   @unique
  ageDistribution   Json     // { "0-17": n, "18-35": n, "36-50": n, "51-60": n, "60+": n }
  genderSplit       Json     // { "M": n, "F": n }
  dependantRatio    Decimal  @db.Decimal(5,4)
  icd10ChapterSummary Json   // { chapterCode: count }
  priorLossRatio    Decimal? @db.Decimal(5,4)  // from claims history if renewal from elsewhere
  geographicDist    Json?    // { countyCode: count }
  benchmarkMlr      Decimal? @db.Decimal(5,4)  // comparable schemes average
  preExistingFlags  Json?    // { icd10Code: lifeCount }
  blacklistMatches  Int      @default(0)
  computedAt        DateTime @default(now())
}

model AssessorWorkQueueItem {
  id              String    @id @default(cuid())
  tenantId        String
  quotationId     String    @unique
  assignedToId    String
  assignedAt      DateTime  @default(now())
  slaDeadlineAt   DateTime
  slaBreached     Boolean   @default(false)
  completedAt     DateTime?
  priority        Int       @default(0)

  assignedTo User      @relation(fields: [assignedToId], references: [id])
  quotation  Quotation @relation(fields: [quotationId], references: [id])

  @@index([tenantId, assignedToId, completedAt])
}
```

### 1.3 Service tasks

Create `src/server/services/intake.service.ts`:

- `createQuotation(tenantId, submitterId, data)` — creates Quotation in `DRAFT`; if corporate, `clientType = CORPORATE`; sets `headcount`, `legalName`, etc.
- `parseCensusFile(fileUrl)` — parses uploaded CSV/Excel using ExcelJS; validates against canonical template (columns: FirstName, LastName, NationalID, DOB, Gender, Relationship, ICD10Codes); returns `{ lives: QuotationLifeData[], rowErrors: RowError[] }`
- `submitForValidation(quotationId, submitterId)` — transitions `DRAFT → PENDING_VALIDATION`; runs automated gates:
  1. Required fields complete for clientType
  2. Census parsed cleanly (no duplicate nationalIds within quotation, dependants linked to a principal, ages consistent with DOBs)
  3. IPRS check per life (calls `iprsService.validate` — stub per Decision #5)
  4. Blacklist check per life (calls `blacklistService.check`)
  5. Cover start date ≥ 7 days from today (or per-scheme config)
  6. Broker authority limit check if broker-submitted
  - If all gates pass: transitions to `PENDING_ASSESSMENT`, creates `AssessorWorkQueueItem`
  - If any gate fails: returns structured `{ errors: GateError[] }`, stays in `PENDING_VALIDATION`; logs attempt to audit chain
- `assembleRiskProfile(quotationId)` — computes demographic distribution, ICD-10 chapter aggregation, geographic distribution, peer benchmark MLR lookup; saves `QuotationRiskProfile`; called when assessor opens the quotation
- `recordUnderwritingDecision(quotationId, lifeId, decision, deciderId, params)` — creates `UnderwritingDecision`; validates `loadingMultiplier` is a Decimal between 0.5 and 5.0; logs to audit chain
- `submitForPricing(quotationId, assessorId)` — evaluates escalation thresholds (configurable via scheme settings, with spec defaults as seeds):
  - Projected gross contribution > KES 5,000,000 annually → `ASSESSED_PENDING_SENIOR_APPROVAL`
  - Any `loadingMultiplier` > 2.0 → `ASSESSED_PENDING_SENIOR_APPROVAL`
  - Scheme-level discount > 10% → `ASSESSED_PENDING_SENIOR_APPROVAL`
  - Net deviation from rate card > 15% → `ASSESSED_PENDING_SENIOR_APPROVAL`
  - Life with high-attention condition (cancer, dialysis, cardiac surgery within 12 months) → `ASSESSED_PENDING_SENIOR_APPROVAL`
  - Otherwise → `ASSESSED`
  - Logs transition to audit chain
- `approveSeniorAssessment(quotationId, seniorId)` — validates seniorId ≠ assignedAssessorId (maker-checker); transitions to `ASSESSED`; logs to audit chain
- `declineByUnderwriting(quotationId, actorId, reason)` → `DECLINED_BY_UNDERWRITING`; notifies submitter
- `withdrawBySubmitter(quotationId, actorId)` → `WITHDRAWN_BY_SUBMITTER`
- `returnToSubmitter(quotationId, assessorId, reason)` → `DRAFT` with reason recorded; notifies submitter
- `allocateWorkQueue(tenantId)` — called by scheduler every 10 minutes; round-robin distribution of `PENDING_ASSESSMENT` quotations among active `UNDERWRITER` users; sets SLA deadline (default 48 hours, configurable); creates `AssessorWorkQueueItem`

### 1.4 Router tasks

Extend `src/server/trpc/routers/quotations.ts` (or create `intake.ts` if separation is cleaner):

- `createIntake` — mutation (`UNDERWRITING:ASSESS` or `BROKER_USER`)
- `uploadCensus` — mutation (accepts fileUrl, calls `parseCensusFile`)
- `submitForValidation` — mutation
- `getWithRiskProfile` — query (returns quotation + lives + risk profile + decisions)
- `getWorkQueue` — query (returns assessor's assigned items with SLA remaining)
- `recordDecision` — mutation (`UNDERWRITING:RECORD_DECISION`)
- `submitForPricing` — mutation (`UNDERWRITING:ASSESS`)
- `approveSenior` — mutation (`UNDERWRITING:APPROVE_SENIOR`)
- `decline` — mutation (`UNDERWRITING:ASSESS`)
- `withdraw` — mutation (submitter only)

### 1.5 Job tasks

**`src/server/jobs/intake-allocation.job.ts`** — every 10 minutes
- Calls `intake.service.allocateWorkQueue(tenantId)` for each active tenant
- Idempotent (skips quotations already in `AssessorWorkQueueItem`)

**`src/server/jobs/sla-breach.job.ts`** — every 30 minutes
- Finds `AssessorWorkQueueItem` records past `slaDeadlineAt` with no `completedAt`
- Sets `slaBreached = true`
- Sends notification to users with `SENIOR_UNDERWRITER` role

### 1.6 UI tasks

**`src/app/(admin)/quotations/page.tsx`** (extend)
- Add tabs: All | Pending Validation | Pending Assessment | Assessed | Declined
- SLA timer column (red/amber/green based on time remaining)

**`src/app/(admin)/quotations/new/page.tsx`** (extend existing or create)
Multi-step form:
1. Client type selection (Corporate / Individual)
2. Corporate details (legal name, reg number, KRA PIN, industry, headcount, cover start, billing contact) OR Individual details
3. Lives — two modes: manual entry table OR census file upload
   - Census upload: show parse results inline; display row-level errors with row number and remediation message
   - Manual: form row per life with role (principal/dependant), demographics, medical history (ICD-10 multiselect)
4. Package selection from active catalogue
5. Document uploads (CR12, ID copies, claims history if applicable)
6. Validation gate status summary and submit

**`src/app/(admin)/quotations/[id]/assess/page.tsx`** — new
- Risk profile panel: age/gender breakdown chart, ICD-10 chapter distribution, benchmark MLR comparison
- Lives table with per-life decision dropdown (STANDARD / LOADED / EXCLUSION / WAITING_PERIOD / DECLINED)
  - LOADED: multiplier input (Decimal, validated)
  - EXCLUSION: ICD-10 multiselect from reference table
  - WAITING_PERIOD: days input + benefit category multiselect
  - DECLINED: reason code required
- Scheme-level parameters panel (cover start, network tier, package confirmation, group discounts)
- Escalation threshold indicator (shows which thresholds are triggered)
- "Submit for Pricing" / "Decline" / "Return to Submitter" actions
- Audit timeline in right-side drawer

**`src/app/(admin)/assessor-queue/page.tsx`** — new
- Assessor's assigned quotations with SLA countdown timers
- Sorted by urgency (least time remaining first)
- Quick-open button

**`src/app/broker/submissions/page.tsx`** (extend)
- Show broker-submitted quotations in assessment stages
- Validation error display if gates failed

---

## Phase 2 — Quotation Generation & Issuance (Process 4)

**Spec reference:** Section 4
**Decision #4 applies:** Puppeteer for PDF. **Decision #6 applies:** Custom pricing model sandbox.
**Dependencies:** Phase 1 complete

### 2.1 Status assessment

| Checklist item | Status |
|---|---|
| All four pricing modes implementable | **PARTIAL** — FLAT_RATE, AGE_BANDED, EXPERIENCE_RATED, CUSTOM exist; family-size matrix not confirmed |
| Rate card effective date ranges (never-delete) | **PARTIAL** — needs verification |
| Family-size × benefit-limit matrix | **MISSING** |
| Custom model sandbox (Excel + Python) | **MISSING** — Decision #6 |
| Three statutory taxes as separate line items | **MISSING** |
| PDF generation with Avenue brand (Puppeteer) | **MISSING** — Decision #4 |
| Quote validity clock and auto-expiry job | **PARTIAL** — expiry state exists; job may not exist |
| Multiple versioned quotations per submission | **MISSING** |
| Audit log on every issuance | **PARTIAL** |

### 2.2 Schema tasks

```prisma
model QuotationVersion {
  id              String          @id @default(cuid())
  tenantId        String
  quotationId     String
  versionNumber   Int
  status          QuotationStatus
  snapshotData    Json            // full computation at time of issue
  issuedById      String?
  issuedAt        DateTime?
  expiresAt       DateTime?
  pdfUrl          String?
  createdAt       DateTime        @default(now())

  quotation Quotation @relation(fields: [quotationId], references: [id])

  @@unique([quotationId, versionNumber])
  @@index([tenantId, quotationId])
}

model QuotationLineItem {
  id            String              @id @default(cuid())
  tenantId      String
  quotationId   String
  lineType      QuotationLineType
  description   String
  quotationLifeId String?           // null = scheme-level item
  lifeName      String?
  ageBand       String?
  baseAmount    Decimal             @db.Decimal(19,4)
  adjustmentPct Decimal?            @db.Decimal(5,4)  // loading or discount multiplier
  netAmount     Decimal             @db.Decimal(19,4)
  displayOrder  Int
  isVisibleToSubmitter Boolean      @default(true)

  quotation Quotation @relation(fields: [quotationId], references: [id])

  @@index([tenantId, quotationId])
}

enum QuotationLineType {
  BASE_CONTRIBUTION
  LOADING_PER_LIFE
  LOADING_SCHEME
  DISCOUNT_GROUP_SIZE
  DISCOUNT_LOYALTY
  DISCOUNT_CUSTOM
  STAMP_DUTY
  TRAINING_LEVY
  PHCF
  CARD_ISSUANCE_FEE
  SMART_CARD_FEE
  WELCOME_PACK_FEE
  CO_CONTRIBUTION_PROVISION
  CUSTOM
}

model FamilySizeMatrixCell {
  id                   String   @id @default(cuid())
  tenantId             String
  rateCardId           String
  familySize           String   // "M", "M+1", "M+2", "M+3", "M+4", "M+5", "M+6", "M+7", "M+7+"
  benefitLimitBand     String   // e.g. "1000000", "2000000" — the tier boundary
  contributionAmount   Decimal  @db.Decimal(19,4)
  effectiveFrom        DateTime
  effectiveTo          DateTime?
  isActive             Boolean  @default(true)

  @@unique([rateCardId, familySize, benefitLimitBand, effectiveFrom])
  @@index([tenantId, rateCardId, isActive])
}

model CustomPricingModelFile {
  id            String          @id @default(cuid())
  tenantId      String
  packageId     String?         // the product this model applies to
  groupId       String?         // or a specific scheme override
  fileType      PricingFileType // EXCEL | PYTHON
  fileUrl       String          // MinIO path
  uploadedById  String
  uploadedAt    DateTime        @default(now())
  isActive      Boolean         @default(true)
  lastTestedAt  DateTime?
  lastTestResult Json?          // { success, errors, sampleOutput }

  @@index([tenantId, isActive])
}

enum PricingFileType {
  EXCEL
  PYTHON
}

model CustomPricingRunLog {
  id              String   @id @default(cuid())
  tenantId        String
  quotationId     String
  modelFileId     String
  inputSnapshot   Json     // census data passed in
  outputSnapshot  Json?    // contribution data returned
  executionMs     Int?
  succeeded       Boolean
  errorMessage    String?
  ranAt           DateTime @default(now())

  @@index([tenantId, quotationId])
}
```

### 2.3 Service tasks

Create `src/server/services/quotation-builder.service.ts`:

**Main orchestration:**
- `buildQuote(quotationId, assessorId)` — resolves pricing mode from package config; calls the appropriate pricing strategy; applies loadings, discounts, co-contribution, taxes, ancillary charges; creates `QuotationLineItem` records; returns full computation
- `computeNet(quotationId)` — computes `totalContribution` from line items; validates deviation from rate card; if > 15% deviation, marks for senior approval (same escalation path as Phase 1)

**Pricing strategies (one function per mode):**
- `priceFlatRate(lives, rateCard)` — `ratePerLife × liveCount`
- `priceAgeBanded(lives, rateCard, coverStartDate)` — for each life, determine age band as of `coverStartDate`; look up rate from `ContributionRateTable` by (rateCardId, ageBand)
- `priceFamilyMatrix(familyUnits, rateCardId)` — for each family unit (principal + their dependants), determine `familySize` ("M" for principal-only, "M+1" for one dependant, etc.); look up `FamilySizeMatrixCell` by (rateCardId, familySize, benefitLimitBand)
- `priceCustomModel(quotationId, modelFileId)` — see sandbox detail below

**Custom pricing model sandbox:**

Excel files:
- Parse with ExcelJS (`npm install exceljs`)
- If the file is a rate table (rows of family-size × benefit-limit → contribution), extract as a lookup matrix and evaluate using the same family-matrix logic
- If the file contains formula cells that compute contribution from census inputs, evaluate using HyperFormula (`npm install hyperformula`) — a formula engine that runs Excel formulas in JS without Excel
- Store input census JSON and output contribution JSON to `CustomPricingRunLog`

Python files:
- Run via Pyodide (`npm install pyodide`) — Python 3.x compiled to WebAssembly, runs inside the Node.js process without any subprocess or filesystem access
- Execution model:
  1. Load Pyodide runtime (singleton, initialized once on server start)
  2. Pass census data as a JSON string to the Python global scope (`census_json`)
  3. Execute the uploaded Python script within the Pyodide sandbox
  4. Read the result from the Python global `output_json` variable
  5. Parse and validate output shape
- Security constraints enforced by Pyodide's WASM sandbox:
  - No `import subprocess`, `import os`, `import sys` I/O operations
  - No network access
  - No filesystem access (Pyodide's virtual filesystem is isolated)
- Timeout: 30 seconds enforced via `Promise.race` with a rejection timer
- Memory: Pyodide default (256MB soft limit)
- Store all inputs and outputs to `CustomPricingRunLog` for regulatory audit

**Loadings and discounts:**
- `applyLoadings(quotationId)` — per-life loadings (multiplicative on base contribution); scheme-level loadings (additive percentage); custom loadings
- `applyDiscounts(quotationId)` — group size auto-discount (>100 lives = 5%, >200 = 10%, configurable); loyalty discount (computed from membership history); custom discounts

**Taxes (not bundled — always separate line items):**
- `computeStatutoryTaxes(quotationId)` — three items per spec:
  - Stamp Duty: `KES 40 × membershipYears` (flat per membership year)
  - Training Levy: `0.2% × baseContributionPostLoadingPreDiscount`
  - PHCF: `0.25% × baseContributionPostLoadingPreDiscount`
  - Creates one `QuotationLineItem` per tax type

**PDF generation (Puppeteer):**
- Add package: `npm install puppeteer`
- Create `src/server/services/pdf.service.ts`:
  - `renderToPdf(htmlContent: string, options?)` — launches headless Chromium via Puppeteer, renders HTML, returns PDF Buffer
  - Internal helper: keeps a browser instance pool (max 3 concurrent) to avoid cold-start latency per request
- Create HTML templates in `src/server/templates/pdf/`:
  - `quotation.html.ts` — parameterized template function returning HTML string
    - Avenue letterhead with indigo primary color (`#4F46E5` or per brand guide)
    - Quicksand font for headings (load from Google Fonts or self-hosted)
    - Lato font for body text
    - Table of line items (base, loadings, discounts, taxes, ancillary, total)
    - Benefit schedule annex (covers, sub-limits, exclusions, waiting periods)
    - Terms annex
  - `membership-certificate.html.ts` — per Phase 3
  - `board-pack.html.ts` — per Phase 12
- `generateQuotePdf(quotationId)` — builds HTML from template + quotation data; calls `renderToPdf`; stores Buffer to MinIO; updates `Quotation.pdfUrl`

**Issuance:**
- `issueQuote(quotationId, assessorId)` — requires `QUOTATION:ISSUE` permission; moves to `ISSUED`; sets `expiresAt = now + validityDays`; generates PDF; dispatches email to submitter with PDF attached; logs to audit chain
- `createNewVersion(quotationId, assessorId)` — creates `QuotationVersion` snapshot; increments `versionNumber`; moves prior version to `SUPERSEDED`

### 2.4 Job tasks

**`src/server/jobs/quotation-expiry.job.ts`** — daily at 01:00 EAT
- Finds `ISSUED` quotations where `expiresAt < now`
- Moves to `EXPIRED`
- Notifies broker/submitter

### 2.5 UI tasks

**`src/app/(admin)/quotations/[id]/page.tsx`** (extend)
- Line-item breakdown table (all components visible to assessor; submitter-visible items toggled)
- Family-size matrix input grid (when pricing mode is `FAMILY_MATRIX`)
- Statutory taxes section (read-only computed values, displayed as distinct rows)
- Version history tab (list of prior versions with diff indicator)
- "Issue Quote" action (triggers PDF generation + email)
- PDF preview button (inline or new tab)
- Custom model section: upload Excel/Python file, test run with sample census, view last run log

---

## Phase 3 — Quote Acceptance & Membership Binding (Process 5)

**Spec reference:** Section 5
**Dependencies:** Phase 2 complete

### 3.1 Status assessment

| Checklist item | Status |
|---|---|
| Acceptance event captured with method, timestamp, accepter | **MISSING** |
| Membership numbers follow `AVH-YYYY-NNNNN` | **MISSING** |
| UW decisions carried to active membership (not re-keyed) | **MISSING** |
| Binder-level maker-checker server-enforced | **MISSING** |
| Daily activation job idempotent | **PARTIAL** |
| Fund-managed generates fund deposit request | **PARTIAL** |
| Commission ledger entry at `PENDING_RECONCILIATION` | **PARTIAL** |
| All binding events logged with payload hashes | **MISSING** |

### 3.2 Schema tasks

```prisma
model QuotationAcceptance {
  id             String           @id @default(cuid())
  tenantId       String
  quotationId    String           @unique
  method         AcceptanceMethod
  acceptedById   String
  acceptedAt     DateTime
  documentUrl    String?          // for signed letter uploads
  coolingOffEnds DateTime?        // 14 days from cover start (configurable)

  quotation  Quotation @relation(fields: [quotationId], references: [id])
  acceptedBy User      @relation(fields: [acceptedById], references: [id])
}

enum AcceptanceMethod {
  PORTAL_CLICK
  EMAIL_REPLY
  SIGNED_LETTER
  PAYMENT_INITIATED
}

model MembershipBindingDocument {
  id            String        @id @default(cuid())
  tenantId      String
  memberId      String?
  groupId       String?
  documentType  BindingDocType
  fileUrl       String
  generatedAt   DateTime      @default(now())
  version       Int           @default(1)
  isActive      Boolean       @default(true)
  deactivatedAt DateTime?
}

enum BindingDocType {
  MEMBERSHIP_CERTIFICATE
  BENEFIT_SCHEDULE
  WELCOME_PACK
  SCHEME_BINDER
  TERMS_AND_CONDITIONS
}

model FundDepositRequest {
  id               String            @id @default(cuid())
  tenantId         String
  selfFundedAccId  String
  groupId          String
  requiredAmount   Decimal           @db.Decimal(19,4)
  receivedAmount   Decimal           @db.Decimal(19,4) @default(0)
  minimumToActivate Decimal          @db.Decimal(19,4)  // 50% of required by default; configurable
  status           FundDepositStatus @default(PENDING)
  dueDate          DateTime
  settledAt        DateTime?
  createdAt        DateTime          @default(now())

  @@index([tenantId, groupId, status])
}

enum FundDepositStatus {
  PENDING
  PARTIALLY_RECEIVED
  RECEIVED
  WAIVED
}
```

Add to `Member` model (verify existing fields; add missing):
```prisma
membershipNumber    String?  @unique   // AVH-YYYY-NNNNN
coverStartDate      DateTime?
coverEndDate        DateTime?
underwritingDecisionId String?          // link to UnderwritingDecision
bindingMakerId      String?
bindingCheckerId    String?            // enforced ≠ bindingMakerId
```

### 3.3 Service tasks

Create `src/server/services/binding.service.ts`:

- `captureAcceptance(quotationId, method, acceptedById, documentUrl?)` — validates quotation is `ISSUED` and not expired; creates `QuotationAcceptance`; sets `coolingOffEnds`; logs to audit chain
- `runPreBindValidation(quotationId)` — re-validates: IPRS stub per life, blacklist check per life, KYC docs uploaded and verified, payment method captured; returns `{ passed: boolean, failures: string[] }`
- `createMemberships(quotationId, makerId)` — for each principal `QuotationLife`:
  - Generates `membershipNumber`: `AVH-${currentYear}-${leftPad(sequence, 5)}`; sequence is per-tenant per-year counter
  - Creates `Member` record in `PENDING_ACTIVATION`
  - Links `UnderwritingDecision` by setting `Member.underwritingDecisionId`
  - Creates `MembershipExclusion` records from `excludedIcd10Codes`
  - Creates `WaitingPeriodApplication` records from `waitingPeriodCategories` + `waitingPeriodDays`
  - Creates dependant `Member` records linked to their principal
  - Sets `bindingMakerId`; `bindingCheckerId` remains null until approval
- `generateBindingDocuments(memberIds)` — calls `pdf.service.renderToPdf` with `membership-certificate.html.ts` template; stores to MinIO; creates `MembershipBindingDocument` records
- `postDebitNote(quotationId, financeOfficerId)` — creates `Invoice` with payment schedule per agreed frequency; or `FundDepositRequest` if scheme is `FUND_MANAGED`
- `approveBinder(groupId, checkerId)` — validates `checkerId ≠ bindingMakerId` (maker-checker); logs to audit chain with payload hash; marks binder as approved; from this point, activation job can process
- `activatePendingMemberships(tenantId)` — idempotent:
  - Finds all `PENDING_ACTIVATION` members where `coverStartDate <= today`
  - For `CONTRIBUTION_BEARING`: verifies first contribution received (`Payment` record linked to the `Invoice`)
  - For `FUND_MANAGED`: verifies `FundDepositRequest.receivedAmount >= minimumToActivate`
  - For payroll deduction schemes: activates with `PENDING_FIRST_DEDUCTION` sub-status if deduction cycle is on file
  - Qualifying members → `ACTIVE`; triggers onboarding queue (Phase 4)
  - Non-qualifying → `LAPSED_BEFORE_ACTIVATION`; notifies finance
  - Processes all days since last successful run (handles outage recovery)
- `accrueCommission(memberId)` — creates `CommissionLedgerEntry` in `PENDING_RECONCILIATION`; progresses to `EARNED` when first contribution receipt is matched (via billing reconciliation job)

### 3.4 Job tasks

**`src/server/jobs/membership-activation.job.ts`** — daily at 00:01 EAT
- Calls `binding.service.activatePendingMemberships(tenantId)` for each active tenant
- Idempotent (uses `coverStartDate <= today` comparison, not a "did-it-run" flag)
- Alerts finance on non-activation due to missing contribution

### 3.5 UI tasks

**`src/app/(admin)/quotations/[id]/page.tsx`** (extend)
- "Accept Quote" section: method selection (portal click, email reply, letter upload)
- Pre-bind validation checklist with live status per item (green / red / loading)
- Binder approval panel: maker confirmed, checker pending, approve/reject actions
- Generated membership list (numbers, status, links to member profiles)

---

## Phase 4 — Principal & Dependant Onboarding (Process 6)

**Spec reference:** Section 6
**Decision #5 applies:** IPRS is a stub. **Dependencies:** Phase 3 complete

### 4.1 Status assessment

| Checklist item | Status |
|---|---|
| KYC capture (portal and operator-driven) | **PARTIAL** — document upload exists; structured record missing |
| IPRS validation | **STUB ONLY** — Decision #5; future feature |
| Biometric enrollment | **PARTIAL** — WebAuthn check-in exists; not linked to onboarding |
| Digital cards generated in member portal | **MISSING** |
| Physical card issuance queue with status tracking | **MISSING** |
| Card replacement with billing | **MISSING** |
| Welcome communications via terminology engine | **PARTIAL** |
| Provider eligibility pushed on activation | **MISSING** |

### 4.2 Schema tasks

```prisma
model MemberKycRecord {
  id                String    @id @default(cuid())
  tenantId          String
  memberId          String    @unique
  status            KycStatus @default(PENDING)
  govIdType         String?   // NATIONAL_ID | PASSPORT | BIRTH_CERT
  govIdNumber       String?
  iprsValidated     Boolean   @default(false)
  iprsCheckedAt     DateTime?
  iprsNote          String?   // "IPRS integration pending — stub" until real integration
  biometricEnrolled Boolean   @default(false)
  biometricType     String?   // FINGERPRINT | FACE
  photoUrl          String?
  completedAt       DateTime?
  updatedAt         DateTime  @updatedAt

  @@index([tenantId, status])
}

enum KycStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
  WAIVED
}

model MemberKycDocument {
  id           String     @id @default(cuid())
  tenantId     String
  kycRecordId  String
  docType      KycDocType
  fileUrl      String
  uploadedAt   DateTime   @default(now())
  verifiedAt   DateTime?
  verifiedById String?
  isVerified   Boolean    @default(false)
}

enum KycDocType {
  NATIONAL_ID_COPY
  PASSPORT_COPY
  KRA_PIN
  CHRONIC_CONDITION_DOCS
  PHOTO
  BIRTH_CERTIFICATE
  OTHER
}

model MembershipCard {
  id                    String     @id @default(cuid())
  tenantId              String
  memberId              String
  cardType              CardType
  status                CardStatus @default(PENDING_ISSUANCE)
  cardNumber            String?
  issuedAt              DateTime?
  dispatchedAt          DateTime?
  deliveredAt           DateTime?
  activatedAt           DateTime?
  expiresAt             DateTime?
  replacedByCardId      String?
  replacementReason     String?
  replacementFeeInvoiceId String?

  @@index([tenantId, memberId])
}

enum CardType {
  DIGITAL
  PHYSICAL
  SMART
}

enum CardStatus {
  PENDING_ISSUANCE
  ISSUED
  DISPATCHED
  DELIVERED
  ACTIVATED
  LOST
  DAMAGED
  REPLACED
  EXPIRED
}

model OnboardingChecklistItem {
  id           String               @id @default(cuid())
  tenantId     String
  memberId     String
  itemType     OnboardingItemType
  status       OnboardingItemStatus @default(PENDING)
  notes        String?
  completedAt  DateTime?
  updatedAt    DateTime             @updatedAt

  @@index([tenantId, memberId])
  @@index([tenantId, status])
}

enum OnboardingItemType {
  KYC_COMPLETION
  PORTAL_PROVISIONING
  DIGITAL_CARD_GENERATED
  PHYSICAL_CARD_DISPATCHED
  WELCOME_COMMUNICATION_SENT
  PROVIDER_NOTIFIED
  BIOMETRIC_ENROLLED
}

enum OnboardingItemStatus {
  PENDING
  COMPLETED
  FAILED
  NOT_APPLICABLE
}
```

### 4.3 Service tasks

Create `src/server/services/onboarding.service.ts`:

- `initiateOnboarding(memberId)` — creates `OnboardingChecklistItem` set for each step (whether `BIOMETRIC_ENROLLED` is required depends on scheme config)
- `completeKyc(memberId, data, operatorId?)` — creates/updates `MemberKycRecord`; calls `iprsService.validate` (stub); marks `KycStatus.COMPLETED` when all docs verified
- `issueDigitalCard(memberId)` — creates `MembershipCard` with `cardType = DIGITAL`, `status = ISSUED`; generates card number (`AVH-CARD-NNNNNNNN`); marks onboarding item `DIGITAL_CARD_GENERATED` complete
- `queuePhysicalCard(memberId, isSmartCard)` — creates `MembershipCard` with type `PHYSICAL` or `SMART`, status `PENDING_ISSUANCE`; adds to issuance partner queue (write to integration outbox or partner API if configured)
- `updateCardStatus(cardId, newStatus, actorId)` — manages PENDING_ISSUANCE → ISSUED → DISPATCHED → DELIVERED → ACTIVATED lifecycle
- `sendWelcomeCommunications(memberId)` — dispatches email with welcome pack PDF (generated by `pdf.service`); dispatches SMS with member number + portal link; all strings via terminology engine; logs to `AuditLog`
- `notifyProviderNetwork(memberIds)` — calls SMART/Slade360 integration to push eligibility update; stubs gracefully if integration not configured; logs result
- `runReadinessCheck(memberId)` — verifies all mandatory onboarding checklist items complete; alerts Member Ops (`CUSTOMER_SERVICE` role) if gaps remain after 48 hours
- `requestCardReplacement(memberId, reason, operatorId)` — creates new `MembershipCard`; links `replacedByCardId`; deactivates prior card; creates `Invoice` for replacement fee

### 4.4 UI tasks

**`src/app/(admin)/members/[id]/onboarding/page.tsx`** — new
- Onboarding checklist table per item type with status and actions
- KYC form: gov ID type, ID number, doc uploads, IPRS status (always shows "Pending — future integration")
- Card section: digital card (generate now), physical card (queue for dispatch), card status pipeline

**`src/app/(admin)/onboarding-queue/page.tsx`** — new
- All members with outstanding onboarding items
- Filter by gap type, creation date
- Bulk-action: send welcome communications for selected members

---

## Phase 5 — Mid-term Membership Amendments (Process 7)

**Spec reference:** Section 7
**Dependencies:** Phase 3 complete

### 5.1 Status assessment

| Checklist item | Status |
|---|---|
| `MembershipAmendment` with taxonomy + before/after snapshot | **PARTIAL** — `Endorsement` exists; snapshot and pro-rata missing |
| Pro-rata calculation engine (day-count basis) | **MISSING** |
| Maker/approver matrix enforced per amendment type | **PARTIAL** |
| Re-assessment trigger for assessor-required amendments | **MISSING** |
| Back-dated amendments require senior approval + override | **MISSING** |
| Broker commission clawbacks for removals | **PARTIAL** |
| Provider notified of material eligibility changes | **MISSING** |
| Scheme transfer and category transfer as distinct types | **PARTIAL** |

### 5.2 Schema tasks

Extend the `Endorsement` model (backward-compatible additions only):
```prisma
// Add to Endorsement:
beforeSnapshot        Json?
afterSnapshot         Json?      // populated on approval
proRataCalculationId  String?
makerId               String?    // set from existing userId if not present
approverId            String?
backDated             Boolean    @default(false)
overrideRecordId      String?    // required if backDated = true
requiresAssessment    Boolean    @default(false)
assessmentDecisionId  String?    // UnderwritingDecision created during re-assessment
```

```prisma
model ProRataCalculation {
  id                    String      @id @default(cuid())
  tenantId              String
  endorsementId         String      @unique
  previousContribution  Decimal     @db.Decimal(19,4)
  newContribution       Decimal     @db.Decimal(19,4)
  periodStartDate       DateTime
  periodEndDate         DateTime
  effectiveDate         DateTime
  daysRemaining         Int
  totalDaysInPeriod     Int
  prorataFactor         Decimal     @db.Decimal(10,8)  // daysRemaining / totalDaysInPeriod
  adjustmentAmount      Decimal     @db.Decimal(19,4)  // positive = charge, negative = credit
  adjustmentType        ProRataType
  computedAt            DateTime    @default(now())
}

enum ProRataType {
  CHARGE
  CREDIT
  ZERO
}
```

### 5.3 Service tasks

Extend `src/server/services/endorsement.service.ts`:

- `initiateAmendment(tenantId, makerId, data)` — validates amendment type against scheme rules; checks if effective date < today (sets `backDated = true` if so, which gates on `OverrideRecord`); sets `requiresAssessment` flag per taxonomy table in spec Section 7
- `captureBeforeSnapshot(endorsementId)` — serializes current `Member` + `BenefitUsage` + `WaitingPeriodApplication` + `MembershipExclusion` state to JSON
- `computeProRata(endorsementId)` — day-count basis:
  - `daysRemaining = daysBetween(effectiveDate, periodEndDate)`
  - `totalDays = daysBetween(periodStartDate, periodEndDate)`
  - `factor = daysRemaining / totalDays`
  - `adjustment = (newContribution - prevContribution) × factor`
  - Saves `ProRataCalculation`
- `routeForApproval(endorsementId)` — per taxonomy table: resolves required approver role; creates approval task; sets SLA
- `validateMakerChecker(endorsementId, approverId)` — `approverId ≠ makerId`; approver has `MEMBER:AMEND` permission at correct level
- `applyAmendment(endorsementId, approverId)` — calls `validateMakerChecker`; updates member record; captures after-snapshot; posts pro-rata adjustment to next debit note; triggers provider notification if eligibility changed materially
- `processCommissionImpact(endorsementId)` — additions: accrue commission; removals: create clawback `CommissionLedgerEntry` proportioned by unutilized days
- `validateBackDate(endorsementId)` — if `backDated = true`, checks `OverrideRecord` exists and is approved; blocks apply if not

### 5.4 UI tasks

**`src/app/(admin)/endorsements/new/page.tsx`** (extend)
- Amendment type selector (full taxonomy from spec table rendered via terminology engine)
- Dynamic form per type (newborn details, package selector, category selector, etc.)
- Pro-rata preview: before/after contribution and day-count adjustment
- Back-date warning with override request initiation
- Document upload per amendment type

**`src/app/(admin)/endorsements/[id]/page.tsx`** (extend)
- Before/after snapshot comparison panel (JSON diff rendered as table)
- Pro-rata calculation breakdown
- Re-assessment section (conditional on `requiresAssessment`)
- Approval action with maker-checker enforcement display

---

## Phase 6 — Pre-Authorization Review (Process 8)

**Spec reference:** Section 8
**Dependencies:** Phase 3 complete

### 6.1 Status assessment

| Checklist item | Status |
|---|---|
| Auto-decision pipeline with all gates in correct order | **PARTIAL** — exists; completeness of gates unclear |
| Sub-3-second response for auto-decided | **UNKNOWN** — needs instrumentation |
| Human review queue with SLA clocks per type | **PARTIAL** |
| `BenefitHold` applied, surfaced in portal, released | **MISSING** |
| PA conversion to claim closes hold | **MISSING** |
| Emergency flag bypasses SLA | **MISSING** |
| Mid-treatment PA amendments link to parent | **MISSING** |
| Fraud rule firings logged regardless of decision | **PARTIAL** |
| All decisions logged to audit chain | **PARTIAL** |
| SMART and Slade360 receive authorization payloads | **PARTIAL** |

### 6.2 Schema tasks

```prisma
model BenefitHold {
  id               String     @id @default(cuid())
  tenantId         String
  memberId         String
  preAuthId        String     @unique
  benefitCategory  String
  heldAmount       Decimal    @db.Decimal(19,4)
  expiresAt        DateTime
  status           HoldStatus @default(ACTIVE)
  releasedAt       DateTime?
  convertedToClaimId String?
  createdAt        DateTime   @default(now())

  @@index([tenantId, memberId, status])
}

enum HoldStatus {
  ACTIVE
  RELEASED
  CONVERTED
  EXPIRED
}
```

Extend `PreAuthorization` model (add fields):
```prisma
isEmergency           Boolean  @default(false)
slaType               String?  // OUTPATIENT | INPATIENT_PREADMISSION | EMERGENCY
slaDeadlineAt         DateTime?
slaBreachedAt         DateTime?
parentPreAuthId       String?   // for mid-treatment amendments
estimatedComponents   Json?     // structured multi-component estimate
autoDecisionLog       Json?     // gate-by-gate result for auditability
fraudFlags            Json?     // fraud rule firings at decision time
```

Extend `BenefitUsage` model (or wherever per-category balances are stored):
```prisma
activeHoldAmount  Decimal  @db.Decimal(19,4) @default(0)
// remainingAmount = benefitLimit - consumedAmount - activeHoldAmount
```

### 6.3 Service tasks

Extend `src/server/services/member-preauth.service.ts`:

- `runAutoDecision(preAuthId)` — implement gates in exact spec order; instrument total latency; target < 3 seconds:
  1. Life active on service date
  2. Procedure covered under active package
  3. Diagnosis not in `MembershipExclusion`
  4. `WaitingPeriodApplication` elapsed
  5. Estimated cost within remaining cap (benefit limit − consumed − activeHold)
  6. Estimated cost vs auto-approve ceiling
  7. Procedure on auto-approve / clinical-review / never-auto list
  8. Fraud engine evaluation (all applicable rules)
  9. Provider network status check
  - Stores gate-by-gate results in `autoDecisionLog`; returns `{ decision, reason, fraudFlags }`
- `getSlaDeadline(requestType, isEmergency)`:
  - Emergency: 30 minutes
  - Inpatient pre-admission: 1 hour
  - Outpatient: 2 hours
- `createBenefitHold(preAuthId, amount, expiresAt)` — creates `BenefitHold`; atomically increments `BenefitUsage.activeHoldAmount` in a Prisma transaction
- `releaseBenefitHold(preAuthId)` — moves to RELEASED; atomically decrements `activeHoldAmount`; idempotent
- `convertHoldToClaim(preAuthId, claimId)` — moves to CONVERTED; sets `convertedToClaimId`; links PA and claim
- `createPaAmendment(parentPreAuthId, additionalData)` — creates new `PreAuthorization` with `parentPreAuthId` set; inherits member and eligibility context

### 6.4 Job tasks

Extend `src/server/jobs/preauth-escalation.job.ts`:
- Also release expired `BenefitHold` records where `expiresAt < now` and status = `ACTIVE`

### 6.5 UI tasks

**`src/app/(admin)/preauth/[id]/page.tsx`** (extend)
- Auto-decision log panel (gate-by-gate result rendered as checklist)
- Benefit hold panel: amount held, benefit limit, consumed, remaining
- Emergency flag banner (prominent, color-coded)
- Mid-treatment amendment button linking to parent PA
- SLA countdown timer with amber/red thresholds

**`src/app/member/preauth/page.tsx`** (extend)
- Show "Pending Authorization Hold" per benefit category in the member's balance view

---

## Phase 7 — Benefit Request (Claim) Adjudication (Process 9)

**Spec reference:** Section 9
**Dependencies:** Phase 6 complete

### 7.1 Status assessment

| Checklist item | Status |
|---|---|
| Composite unique constraints at DB level (not app level) | **MISSING** |
| Bill state machine `INCURRED → RECEIVED → CAPTURED → AUTHORIZED → SETTLED` | **PARTIAL** — states differ; verify against spec |
| Excel bulk claims import | **MISSING** |
| Line-item-level approve/decline | **PARTIAL** |
| Contracted rate vs billed variance as fraud signal | **MISSING** |
| Senior approval threshold server-enforced | **PARTIAL** |
| PA-linked claims close hold | **MISSING** — BenefitHold built in Phase 6 |
| Benefit balance updates atomic with approval | **UNKNOWN** — verify |
| Member notifications via terminology engine | **PARTIAL** |
| Appeal workflow with different reviewer | **PARTIAL** |

### 7.2 Schema tasks

Add DB-level uniqueness via Prisma migration with raw SQL:

```sql
-- Provider invoice uniqueness (hard constraint, not application check)
CREATE UNIQUE INDEX "claim_provider_invoice_unique"
  ON "Claim"("tenantId", "providerId", "providerInvoiceNumber")
  WHERE "status" != 'VOID';

-- Double-capture prevention
CREATE UNIQUE INDEX "claim_double_capture_prevention"
  ON "Claim"("tenantId", "providerId", "serviceCode", "memberId", "serviceDate")
  WHERE "status" != 'VOID';
```

Extend `Claim` model fields (add missing):
```prisma
providerInvoiceNumber   String?
linkedPreAuthId         String?
contractedRate          Decimal?  @db.Decimal(19,4)
billedAmount            Decimal?  @db.Decimal(19,4)
contractedVariancePct   Decimal?  @db.Decimal(5,4)
adjudicatorId           String?
seniorAdjudicatorId     String?
appealReviewerId        String?   // must differ from adjudicatorId
isReimbursement         Boolean   @default(false)
proofOfPaymentUrl       String?
```

Extend `ClaimLine` model:
```prisma
adjudicationDecision  ClaimLineDecision?
approvedAmount        Decimal?  @db.Decimal(19,4)
adjustmentReason      String?
declineReason         String?
```

```prisma
enum ClaimLineDecision {
  APPROVED
  APPROVED_WITH_ADJUSTMENT
  DECLINED
}

model ProviderSettlementBatch {
  id            String          @id @default(cuid())
  tenantId      String
  providerId    String
  cycleMonth    Int
  cycleYear     Int
  status        SettlementStatus @default(PENDING)
  totalAmount   Decimal         @db.Decimal(19,4)
  claimIds      String[]
  makerId       String
  checkerId     String?
  settledAt     DateTime?
  createdAt     DateTime        @default(now())

  @@index([tenantId, providerId, cycleMonth, cycleYear])
}

enum SettlementStatus {
  PENDING
  MAKER_SUBMITTED
  CHECKER_APPROVED
  SETTLED
  REJECTED
}
```

### 7.3 Service tasks

Extend `src/server/services/claims.service.ts`:

- `runHardGateValidation(claimData)` — composite uniqueness check (query DB), temporal gates (discharge not before admission, service date not future, service date not before cover start), gender-appropriate procedure check, age-appropriate procedure check, diagnosis-procedure coherence per configured pathway rules; returns `{ passed: boolean, errors: GateError[] }`
- `checkBenefitEligibility(claimId)` — exclusions, waiting periods, remaining cap (benefit limit − consumed − activeHold), PA linkage validity
- `computeContractedRateVariance(claimId)` — lookup `ProviderTariff` for the service code at this provider; compute `variancePct = (billedAmount − contractedRate) / contractedRate`; fire fraud signal if above threshold (configurable; default 20%)
- `adjudicateLineItem(claimLineId, adjudicatorId, decision, params)` — records per-line decision; must have `CLAIM:ADJUDICATE` permission
- `computeClaimOutcome(claimId)` — aggregates line decisions into `APPROVED` | `PARTIALLY_APPROVED` | `DECLINED`
- `requiresSeniorApproval(claimId)` — net payable > KES 100,000 (configurable per scheme); returns boolean
- `approveClaim(claimId, adjudicatorId)` — within a single Prisma transaction:
  - Calls `convertHoldToClaim(linkedPreAuthId, claimId)` if PA exists
  - Decrements `BenefitUsage.consumedAmount` and `activeHoldAmount` atomically
  - Moves claim to `APPROVED_FOR_SETTLEMENT`
  - Creates settlement batch entry
  - Notifies member
- `initiateAppeal(claimId, reason, newReviewerId)` — validates `newReviewerId ≠ adjudicatorId`; sets `appealReviewerId`; moves to `APPEALED`
- `bulkImportClaims(fileUrl, tenantId)` — parses Excel with ExcelJS; validates canonical template columns; runs `runHardGateValidation` per row; returns row-level errors for invalid rows; enqueues valid rows
- `createSettlementBatch(providerId, cycleMonth, cycleYear, makerId)` — creates `ProviderSettlementBatch`; aggregates approved claims for provider and cycle
- `approveSettlementBatch(batchId, checkerId)` — validates `checkerId ≠ makerId`; `BILLING:APPROVE_SETTLEMENT` permission required; moves to `CHECKER_APPROVED`; triggers disbursement

### 7.4 UI tasks

**`src/app/(admin)/claims/import/page.tsx`** — new
- Excel template download link
- Upload and parse with row-level error table (row number, column, error message)
- Confirm valid rows and submit

**`src/app/(admin)/claims/[id]/page.tsx`** (extend)
- Line-item adjudication table with per-line approve/adjust/decline actions
- Contracted rate vs billed comparison column (variance shown in red if above threshold)
- Fraud signals panel
- PA link with hold status (opens to PA detail)
- Senior approval gate (conditionally shown when threshold met; `CLAIM:APPROVE_SENIOR` permission required)
- Appeal action and re-assignment

**`src/app/(admin)/settlement/page.tsx`** — new
- Create settlement batch by provider and cycle
- Batch list with maker/checker status
- Approve batch action

---

## Phase 8 — Reimbursement Processing (Process 10)

**Spec reference:** Section 10
**Decision #7 applies:** M-Pesa/Daraja is a stub. **Dependencies:** Phase 7 complete

### 8.1 Status assessment

| Checklist item | Status |
|---|---|
| Reimbursement workflow distinct from provider claims | **MISSING** |
| Member banking details captured and validated | **PARTIAL** |
| Proof of payment verification | **PARTIAL** — stub for M-Pesa (Decision #7) |
| Reimbursement window configurable per scheme | **MISSING** |
| Out-of-network co-contribution rate applied | **MISSING** |

### 8.2 Schema tasks

```prisma
model ReimbursementRequest {
  id                    String                    @id @default(cuid())
  tenantId              String
  claimId               String                    @unique
  memberId              String
  providerName          String
  serviceDate           DateTime
  totalPaidByMember     Decimal                   @db.Decimal(19,4)
  proofType             ProofType
  proofFileUrl          String
  mpesaConfirmationCode String?
  mpesaVerified         Boolean                   @default(false)
  mpesaNote             String?                   // "M-Pesa verification pending — future integration"
  submittedWithinWindow Boolean
  reimbursementWindowDays Int
  disbursementMethod    ReimbursementPaymentMethod?
  disbursedAt           DateTime?
  disbursementRef       String?
  createdAt             DateTime                  @default(now())
}

enum ProofType {
  RECEIPT_PHOTO
  MPESA_SMS
  BANK_STATEMENT
  OTHER
}

enum ReimbursementPaymentMethod {
  BANK_TRANSFER
  MPESA
}
```

Add to `Member` model (verify; add if missing):
```prisma
bankName              String?
bankAccountNumber     String?
mpesaNumber           String?
reimbursementPaymentPreference ReimbursementPaymentMethod?
```

### 8.3 Service tasks

Create `src/server/services/reimbursement.service.ts`:

- `submit(memberId, data)` — creates `ReimbursementRequest` + `Claim` with `isReimbursement = true`; checks submission window (default 90 days from service date; configurable per scheme); validates provider network status as of service date for co-contribution rate
- `verifyMpesaProof(confirmationCode, amount, memberId)` — stub: always returns `{ verified: false, note: 'M-Pesa Daraja integration pending — verify manually' }`; log note clearly so operator knows to do manual verification; does NOT block adjudication, just informs reviewer
- `adjudicate(claimId, reviewerId)` — same logic as `claims.service.approveClaim`; payout target is member's bank/M-Pesa rather than provider
- `disburseMemberRefund(reimbursementRequestId, financeOfficerId)` — creates `PaymentVoucher` to member's registered method; marks `disbursedAt`; notifies member

---

## Phase 9 — Renewal Cycle Management (Process 11)

**Spec reference:** Section 11
**Dependencies:** Phase 3 complete

### 9.1 Status assessment

| Checklist item | Status |
|---|---|
| Renewal pipeline 90 days ahead | **MISSING** — `RenewalAnalysis` exists; no pipeline UI |
| Renewal intelligence algorithm | **PARTIAL** — MLR fields exist; algorithm not implemented |
| Scenario simulator | **MISSING** |
| Renewal quotations link to prior | **MISSING** |
| Waiting periods preserved on continuous renewal | **MISSING** |
| Age band reclassification at renewal | **MISSING** |
| Renewal notice dispatch job at 60 days | **PARTIAL** |
| Loss-leader and actuarial-review escalation | **MISSING** |
| Renewal conditional on prior-period reconciliation | **MISSING** |

### 9.2 Schema tasks

Add to `Group` model:
```prisma
supersededByGroupId   String?
renewalStatus         GroupRenewalStatus?
renewalNoticeDispatchedAt DateTime?
priorPeriodReconciled Boolean @default(false)
```

```prisma
enum GroupRenewalStatus {
  NOT_STARTED
  IN_PROGRESS
  QUOTE_ISSUED
  NEGOTIATING
  BOUND
  LAPSED
  CANCELLED
  WITHDRAWN
}

model RenewalScenario {
  id                   String   @id @default(cuid())
  tenantId             String
  renewalAnalysisId    String
  scenarioName         String
  proposedRateAdj      Decimal  @db.Decimal(5,4)    // e.g. 0.05 = +5%
  proposedCoContribAdj Decimal? @db.Decimal(5,4)
  proposedNetworkTier  String?
  projectedMlr         Decimal  @db.Decimal(5,4)
  projectedContribution Decimal @db.Decimal(19,4)
  isCommitted          Boolean  @default(false)
  createdById          String
  createdAt            DateTime @default(now())

  @@index([tenantId, renewalAnalysisId])
}
```

Add to `RenewalAnalysis` model:
```prisma
recommendedAdjustment         Decimal? @db.Decimal(5,4)
recommendationBasis           String?
requiresActuarialReview       Boolean  @default(false)
actuarialOpinionDocUrl        String?
isLossLeader                  Boolean  @default(false)
lossLeaderJustification       String?
lossLeaderApprovedById        String?
complianceOfficerApprovedById String?  // for fraud/regulatory event renewals
```

### 9.3 Service tasks

Create `src/server/services/renewal.service.ts`:

- `computeRenewalIntelligence(groupId)` — implements spec algorithm exactly:
  ```
  if trailingMlr < targetMlr * 0.85  → recommendation = -2.5%
  if trailingMlr <= targetMlr * 1.05 → recommendation = inflation adjustment only
  if trailingMlr <= targetMlr * 1.20 → recommendation = (actual - target) + inflation
  if trailingMlr > targetMlr * 1.20  → recommendation = (actual - target) * 1.1 + inflation; requiresActuarialReview = true
  ```
  Inflation rate is configurable (seed default: 5%). Stores result to `RenewalAnalysis`.
- `createScenario(renewalAnalysisId, params, createdById)` — creates `RenewalScenario` with projected MLR computed from scenario parameters; does NOT modify the underlying scheme until `commitScenario` is called
- `commitScenario(scenarioId, actorId)` — marks as committed; feeds parameters into quotation builder for renewal quotation
- `dispatchRenewalNotice(groupId)` — sends 60-day notice to scheme manager/broker via email; stores `renewalNoticeDispatchedAt`
- `reclassifyAgeBands(groupId, newCoverStartDate)` — for each member in individual scheme, computes age at `newCoverStartDate`; determines new age band; flags band crossings; feeds into renewal pricing
- `bindRenewal(renewalQuotationId, priorGroupId, actorId)` — creates new `Group` record; sets `priorGroup.supersededByGroupId`; carries over `WaitingPeriodApplication` records (adjusting dates to new period; does NOT reset them for continuously-renewed members); member numbers preserved; generates new binding documents
- `getPipeline(tenantId, daysAhead)` — returns groups with `coverEndDate <= today + daysAhead` with renewal status, MLR, intelligence summary, days remaining

### 9.4 Job tasks

Extend `src/server/jobs/renewal-reminder.job.ts`:
- At 90 days before expiry: set `renewalStatus = IN_PROGRESS`; surface in pipeline
- At 60 days: call `dispatchRenewalNotice`
- At 30 days: escalate to `SCHEME_MANAGER` if status is still `NOT_STARTED` or `IN_PROGRESS`
- At 7 days: critical alert to `SENIOR_UNDERWRITER`

### 9.5 UI tasks

**`src/app/(admin)/analytics/renewals/page.tsx`** (extend)
- Pipeline grid: scheme name, current MLR, member count, contribution, days to expiry, renewal status badge, alert flag
- Filter by status, days range
- Click through to Renewal Intelligence Workspace

**`src/app/(admin)/analytics/renewals/[groupId]/page.tsx`** — new (Renewal Intelligence Workspace)
- Loss experience: trailing MLR chart (12 months), top ICD-10 chapter drivers, provider concentration
- Algorithm recommendation with basis narrative
- Scenario simulator: sliders for rate adjustment %, co-contribution change, network tier; shows projected MLR and contribution in real time as sliders move
- Age band reclassification table (members crossing bands)
- "Commit Scenario" button (requires `QUOTATION:ISSUE` permission)
- Prior period reconciliation status with block indicator if not reconciled

---

## Phase 10 — Lapse, Cancellation & Reinstatement (Process 12)

**Spec reference:** Section 12
**Dependencies:** Phase 3 complete

### 10.1 Status assessment

| Checklist item | Status |
|---|---|
| Full lifecycle state machine (9 states) | **PARTIAL** — missing `CANCELLED_COOLING_OFF`, `TERMINATED_FRAUD`, `TERMINATED_BREACH`, `TERMINATED_DEATH`, `EXPIRED` |
| Daily lapse-detection job with false-positive validation | **PARTIAL** |
| Catch-up window configurable and enforced | **PARTIAL** |
| Cooling-off cancellation with provider clawback | **MISSING** |
| Internal blacklist maintained (Phase 0) | **DEPENDS ON Phase 0** |
| Broker commission clawbacks | **PARTIAL** |
| Provider network notified of lapse/termination | **MISSING** |
| Reinstatement within catch-up preserves waiting periods | **MISSING** |
| Beyond-catch-up routes to new business assessment | **MISSING** |
| All terminal events logged to audit chain | **PARTIAL** |

### 10.2 Schema tasks

Extend `MemberStatus` enum (add missing values; keep existing):
```
CANCELLED_COOLING_OFF
TERMINATED_FRAUD
TERMINATED_BREACH
TERMINATED_DEATH
EXPIRED
LAPSED_BEFORE_ACTIVATION
```

```prisma
model MembershipLapseRecord {
  id               String   @id @default(cuid())
  tenantId         String
  memberId         String
  lapseDate        DateTime
  unpaidAmount     Decimal  @db.Decimal(19,4)
  gracePeriodDays  Int
  catchupDeadline  DateTime
  reinstatedAt     DateTime?
  catchupExpired   Boolean  @default(false)

  @@index([tenantId, memberId])
}

model MembershipCancellationRecord {
  id                String           @id @default(cuid())
  tenantId          String
  memberId          String
  cancellationType  CancellationType
  requestedById     String
  effectiveDate     DateTime
  isCoolingOff      Boolean
  refundAmount      Decimal          @db.Decimal(19,4) @default(0)
  adminFeeDeducted  Decimal          @db.Decimal(19,4) @default(0)
  benefitsClawedBack Boolean         @default(false)
  processedAt       DateTime?
}

enum CancellationType {
  COOLING_OFF
  STANDARD
  SCHEME_CLOSURE
}

model MembershipTerminationRecord {
  id               String          @id @default(cuid())
  tenantId         String
  memberId         String
  terminationType  TerminationType
  initiatedById    String
  reasonCode       String
  narrative        String?
  effectiveDate    DateTime
  proRataRefund    Decimal         @db.Decimal(19,4) @default(0)
  blacklisted      Boolean         @default(false)
  processedAt      DateTime        @default(now())
}

enum TerminationType {
  FRAUD
  BREACH
  DEATH
  NON_RENEWAL
}
```

### 10.3 Service tasks

Create `src/server/services/lifecycle.service.ts`:

- `detectLapseCandidates(tenantId)` — job logic: finds members with unpaid contributions past grace period (configurable per scheme; default 30 days from due date); cross-checks `Payment` records to rule out settlement delays (false positives); returns confirmed candidates
- `lapseMembership(memberId, actorId)` — moves to `LAPSED`; creates `MembershipLapseRecord` with `catchupDeadline = lapseDate + catchupWindowDays` (default 60 days; configurable); releases all `BenefitHold` records; notifies member, scheme, broker; calls `notifyProviderNetworkOfTermination([memberId])`; logs to audit chain
- `reinstateWithinCatchup(memberId, paymentId, actorId)` — validates `catchupDeadline > today`; validates payment collected; moves back to `ACTIVE`; preserves all `WaitingPeriodApplication` and `UnderwritingDecision` records unchanged; marks `MembershipLapseRecord.reinstatedAt`; logs to audit chain
- `reinstateAfterCatchup(memberId)` — creates new `Quotation` in `DRAFT` (routes to Phase 1 new business assessment); waiting periods will be reset by new underwriting
- `initiateCoolingOffCancellation(memberId, requestedById)` — validates within cooling-off window (default 14 days from cover start; configurable per scheme); computes full refund; creates `MembershipCancellationRecord` with `isCoolingOff = true`; sets member to `CANCELLED_COOLING_OFF`; triggers benefit clawback (recovery of benefits paid during cooling-off from provider); claws back broker commission fully; logs to audit chain
- `initiateStandardCancellation(memberId, requestedById)` — validates scheme permits mid-term cancellation; computes pro-rata refund minus admin fee; creates `MembershipCancellationRecord`; moves to `CANCELLED`; logs to audit chain
- `terminateForFraud(memberId, complianceOfficerId, reasonCode, narrative)` — requires `MEMBER:TERMINATE` permission AND `COMPLIANCE_OFFICER` role; sets `TERMINATED_FRAUD`; creates `MembershipTerminationRecord`; calls `blacklistService.add` for the member's national ID; releases all active PAs and benefit holds; suspends future benefit access; claws back broker commission; logs to audit chain
- `terminateForBreach(memberId, actorId, reasonCode, narrative)` — same flow as fraud without blacklisting; sets `TERMINATED_BREACH`
- `recordPrincipalDeath(memberId, proofUrl, actorId)` — sets `TERMINATED_DEATH`; creates `MembershipTerminationRecord`; handles dependants per scheme rules (continuation or termination); computes pro-rata refund to estate; logs to audit chain
- `notifyProviderNetworkOfTermination(memberIds)` — pushes eligibility status update to SMART/Slade360; stubs gracefully if integration not configured

### 10.4 Job tasks

Create/extend **`src/server/jobs/lapse-detection.job.ts`** — daily at 23:00 EAT:
- Calls `lifecycle.service.detectLapseCandidates(tenantId)` for each tenant
- Calls `lapseMembership` for each confirmed candidate
- Logs results; flags potential false-positives to Finance queue for manual review

Also: extend `membership-activation.job.ts` (from Phase 3) to expire `MembershipLapseRecord` catch-up windows past their deadline and mark `catchupExpired = true`.

### 10.5 UI tasks

**`src/app/(admin)/members/[id]/page.tsx`** (extend)
- Lifecycle state banner showing current state and allowed transitions
- Reinstatement panel: catch-up window countdown, outstanding amount, reinstatement fee
- "Reinstate" (within window: payment form) vs "Start New Assessment" (beyond window)
- Cancellation and termination actions with reason code selectors (cooling-off auto-detected)
- Death recording with document upload

**`src/app/member/reinstatement/page.tsx`** (extend)
- Catch-up deadline prominently displayed (red countdown)
- Outstanding amount + reinstatement fee
- Self-service payment initiation

---

## Phase 11 — Exception Handling & Maker-Checker (Process 13)

**Spec reference:** Section 13
**Dependencies:** Phase 0 complete (OverrideRecord and full RBAC built in Phase 0)

### 11.1 Remaining tasks

Phase 0 built the data model and core service. Remaining work is wiring all 13 override types to their approver routing (which was not possible until other phases built their entities) and compliance reporting.

**Service additions to `override.service.ts`:**
- Ensure all override types route to correct approver per spec table:
  - `BACK_DATED_AMENDMENT` → `SENIOR_UNDERWRITER`
  - `BACK_DATED_COVER_START` → `SENIOR_UNDERWRITER`
  - `RATE_DEVIATION_EXCEED` → `SENIOR_UNDERWRITER`
  - `PRE_AUTH_OVER_BENEFIT_CAP` → `SENIOR_CLAIMS_OFFICER` + `COMPLIANCE_OFFICER` (dual)
  - `CLAIM_EXCLUDED_DIAGNOSIS` → `SENIOR_CLAIMS_OFFICER`
  - `FORCE_APPROVE_FRAUD_CLAIM` → `SENIOR_CLAIMS_OFFICER` + `COMPLIANCE_OFFICER` (dual)
  - `WAIVE_CO_CONTRIBUTION` → `SENIOR_CLAIMS_OFFICER`
  - `EXTEND_GRACE_PERIOD` → `SENIOR_UNDERWRITER`
  - `MID_TERM_RATE_CHANGE` → `SENIOR_UNDERWRITER` + `SCHEME_MANAGER` (dual)
  - `FRAUD_RULE_THRESHOLD_ADJUSTMENT` → `COMPLIANCE_OFFICER`
  - `RESTORE_TERMINATED_MEMBERSHIP` → `SENIOR_UNDERWRITER` + `COMPLIANCE_OFFICER` (dual)
  - `PRIVILEGE_ESCALATION` → `SENIOR_UNDERWRITER` (or `SUPER_ADMIN` for role grants)

**Job additions to `report-generation.job.ts`:**
- Daily at 06:00 EAT: generate override summary for `COMPLIANCE_OFFICER` inbox
- Monthly on 1st: generate aggregate override report PDF (Puppeteer); store to MinIO

**UI:**
- **`src/app/(admin)/overrides/patterns/page.tsx`** — compliance view; per-maker bar chart of override requests; per-checker approval rate; override type distribution; `COMPLIANCE_OFFICER` + `SUPER_ADMIN` only

---

## Phase 12 — Portfolio Monitoring & Strategic Purchasing (Process 14)

**Spec reference:** Section 14
**Dependencies:** All prior phases

### 12.1 Status assessment

| Checklist item | Status |
|---|---|
| Strategic Purchasing Console (refreshes ≤ 15 min) | **PARTIAL** — analytics pages exist; completeness per spec unclear |
| Alert inbox acknowledge/resolve/escalate | **PARTIAL** — `AnalyticsAlert` exists; workflow may be incomplete |
| All 8 analytics alert types wired | **UNKNOWN** — needs audit against spec |
| Renewal Intelligence Workspace | **DONE after Phase 9** |
| Member Risk Workbench with bulk care-management enrolment | **MISSING** |
| Parity Compliance Dashboard (compliance-gated) | **MISSING** |
| Audit Chain Explorer | **DONE after Phase 0** |
| Monthly board pack PDF (Puppeteer) | **MISSING** |
| Role-based access enforced on all senior surfaces | **PARTIAL** |

### 12.2 Service tasks

Extend `src/server/services/analytics.service.ts`:

- `getPortfolioSummary(tenantId)` — portfolio MLR with 12-month sparkline data, member count YTD, contribution YTD, active alert count
- `getSchemeGrid(tenantId, filters)` — per-scheme: MLR, member count, contribution, renewal status, alert badges; sortable and filterable
- `getProviderGrid(tenantId)` — case-mix adjusted provider performance (approve rate, avg claim value, MLR contribution)
- `getRiskComposition(tenantId)` — member count by risk tier for donut chart
- `getMemberRiskWorkbench(tenantId, filters)` — paginated; risk-tier filter; per-member: chronic condition tags, utilization-to-cap progress bar, projected cap-exceed date
- `bulkEnrolCareManagement(memberIds, programId, actorId)` — bulk enrollment action; requires `ANALYTICS:VIEW_PORTFOLIO` permission
- `getParityDashboard(tenantId)` — internal vs external provider cost comparison; cohort drill-down; `COMPLIANCE:VIEW_PARITY` permission required
- `generateMonthlyBoardPack(tenantId, month, year)` — renders board pack HTML template; calls `pdf.service.renderToPdf`; stores to MinIO; returns download URL

### 12.3 Job tasks

Extend `src/server/jobs/report-generation.job.ts`:
- Monthly on 1st at 07:00 EAT: generate board pack PDF; notify `SUPER_ADMIN` + `SENIOR_UNDERWRITER` + `SCHEME_MANAGER` via in-app notification

### 12.4 UI tasks

**`src/app/(admin)/analytics/page.tsx`** (extend / validate)
Ensure the following panels exist and refresh within documented intervals:
- Portfolio MLR sparkline (15 min refresh)
- Member count + contribution YTD (15 min)
- Active alerts panel with acknowledge/resolve actions
- Scheme grid with per-scheme MLR and alert badges
- Provider performance grid (case-mix adjusted)
- Risk composition donut
- Renewal pipeline (90-day forward; link to Phase 9 page)
- Geographic encounter heatmap

**`src/app/(admin)/analytics/risk/page.tsx`** — Member Risk Workbench
- Filter by risk tier
- Per-member: chronic condition tags, utilization progress bar, projected cap-exceed date
- Bulk-select and enrol in care management program

**`src/app/(admin)/analytics/parity/page.tsx`** — new (COMPLIANCE_OFFICER only)
- Internal vs external provider side-by-side cost and approval rate comparison
- Cohort drill-down panel

**`src/app/(admin)/analytics/board-pack/page.tsx`** — new
- Generate and download current month board pack
- Archive table of prior months

---

## Phase 13 — IPRS & M-Pesa Stubs

**Spec reference:** Sections 3, 6, 10
**Decision #5 and Decision #7 apply.**

Implement as permanent stubs with clear notes so future integration is low-friction.

### 13.1 IPRS stub

Create `src/server/services/integrations/iprs.service.ts`:

```typescript
// IPRS — Kenya Population Register Service
// Status: Stub. Real integration deferred until each platform buyer's
// IPRS API provisioning path is understood (may differ by buyer type).
// When integrating: set IPRS_API_URL and IPRS_API_KEY env vars.
// Replace the stub body with a real HTTP call to the IPRS REST API.

export const iprsService = {
  async validate(nationalId: string): Promise<IprsResult> {
    return {
      valid: true,
      name: null,
      dob: null,
      source: 'stub',
      note: 'IPRS validation not yet integrated — manual verification required',
    }
  }
}

interface IprsResult {
  valid: boolean
  name: string | null
  dob: Date | null
  source: 'stub' | 'iprs_api'
  note?: string
}
```

Everywhere IPRS is called, surface the stub note to the operator so they know manual verification is needed.

### 13.2 M-Pesa/Daraja stub

Create `src/server/services/integrations/mpesa.service.ts`:

```typescript
// M-Pesa Daraja API
// Status: Stub. Real integration deferred.
// When integrating: set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
// MPESA_SHORTCODE, MPESA_PASSKEY env vars and replace stub body.

export const mpesaService = {
  async verifyConfirmation(
    confirmationCode: string,
    expectedAmount: Decimal,
    memberId: string,
  ): Promise<MpesaVerifyResult> {
    return {
      verified: false,
      source: 'stub',
      note: 'M-Pesa confirmation verification not yet integrated — verify manually via M-Pesa portal',
    }
  }
}

interface MpesaVerifyResult {
  verified: boolean
  source: 'stub' | 'daraja_api'
  note?: string
}
```

---

## Phase 14 — Terminology Engine Audit

**Spec reference:** Section 15 (Cross-Cutting Item 1)

After all other phases are merged, run the following grep across all new UI surfaces and fix any hard-coded user-facing strings:

```bash
grep -rn --include="*.tsx" \
  -E "(\"policy\"|\"premium\"|\"underwrite\"|\"insurer\"|\"claim\"|\"endorsement\"|\"sum insured\")" \
  src/app/ src/components/
```

Strings that are code identifiers (variable names, enum values) are acceptable. Strings that will be rendered as visible text in the UI must use the terminology engine.

Also verify: no string in `src/server/services/notification.service.ts` or email templates contains these classical insurance terms without going through the engine.

---

## Implementation Sequence Summary

Execute phases in order. Each phase should be a distinct PR. Within a phase: schema changes first, then services, then routers, then UI.

| Phase | Spec Process | Key deliverables | Blocks |
|---|---|---|---|
| **0** | Foundation | RBAC system, audit chain, override record, blacklist | All |
| **1** | Process 3 — New Business Intake | Quotation assessment stages, QuotationLife, UnderwritingDecision, risk profile, assessor work queue | 2, 3 |
| **2** | Process 4 — Quotation & Pricing | Line items, family-size matrix, custom model sandbox (Puppeteer + Pyodide/HyperFormula), PDF generation | 3 |
| **3** | Process 5 — Binding | Acceptance, membership numbers, binding documents, debit notes, activation job | 4, 5, 6, 7, 9, 10 |
| **4** | Process 6 — Onboarding | KYC records, membership cards, welcome communications, provider eligibility push | — |
| **5** | Process 7 — Amendments | Endorsement extension, pro-rata engine, maker-checker matrix | — |
| **6** | Process 8 — Pre-Auth | BenefitHold, auto-decision pipeline, SLA clocks, emergency flag | 7 |
| **7** | Process 9 — Claims | DB-level unique constraints, line-item adjudication, settlement batches | 8 |
| **8** | Process 10 — Reimbursement | Reimbursement request, M-Pesa stub, member disbursement | — |
| **9** | Process 11 — Renewal | Renewal intelligence algorithm, scenario simulator, age band reclassification | — |
| **10** | Process 12 — Lapse/Cancel/Reinstate | Lifecycle states, lapse detection, cooling-off, fraud termination | — |
| **11** | Process 13 — Exceptions | Override type routing, compliance reports | Depends on 0 |
| **12** | Process 14 — Portfolio | Strategic Purchasing Console, Risk Workbench, parity dashboard, board pack PDF | — |
| **13** | Integration stubs | IPRS stub, M-Pesa stub | — |
| **14** | Terminology audit | No hard-coded insurance terms in UI | After all above |

---

## Output Document

Per spec Section 16, upon completion of all phases, produce `AICARE_UNDERWRITER_PROCESS_AUDIT.md` summarizing:
- Items verified as already implemented
- Items implemented during this sprint
- Items remaining as open questions for Mutuku

---

*End of implementation plan. Version 2.0 — reflects all design decisions confirmed 2026-05-12.*
