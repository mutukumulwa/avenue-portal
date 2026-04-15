# HR Module — Comprehensive Action Plan

## Overview

The HR Module is a self-service portal for corporate HR managers at Avenue Healthcare's client companies (Groups). It sits alongside the Admin, Member, and Broker portals as a fourth access tier.

**Who uses it**: HR managers at companies like KCB Group, EABL, Bamburi Cement — each managing their own group's membership.

**Core principle**: HR managers can *view and request*, but not *directly modify*. All roster changes flow through Avenue as endorsements. Invoice and utilization data is read-only.

**Route group**: `src/app/(hr)/` — own layout, own sidebar, own RBAC role.

---

## Phase 1 — Foundation

### 1.1 Schema Changes

**File**: `prisma/schema.prisma`

Three additions:

**a. New `HR_MANAGER` role in `UserRole` enum**
```prisma
enum UserRole {
  ...
  HR_MANAGER   // New — corporate group HR administrator
  ...
}
```

**b. Group link on `User` model** (follows the same pattern as `brokerId` / `memberId`)
```prisma
model User {
  ...
  groupId  String?  @unique
  group    Group?   @relation("HRManagerGroup", fields: [groupId], references: [id])
  ...
}
```
Add the inverse on `Group`:
```prisma
model Group {
  ...
  hrManagers  User[]  @relation("HRManagerGroup")
  ...
}
```

**c. New `ServiceRequest` model** (for HR → Avenue support tickets)
```prisma
enum ServiceRequestCategory {
  MEMBER_QUERY
  CLAIM_QUERY
  INVOICE_QUERY
  CARD_REQUEST
  BENEFIT_QUERY
  GENERAL
}

enum ServiceRequestPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

enum ServiceRequestStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

model ServiceRequest {
  id              String                  @id @default(cuid())
  tenantId        String
  groupId         String
  group           Group                   @relation(fields: [groupId], references: [id])
  submittedById   String
  submittedBy     User                    @relation("SRSubmitter", fields: [submittedById], references: [id])
  subject         String
  category        ServiceRequestCategory
  priority        ServiceRequestPriority  @default(NORMAL)
  status          ServiceRequestStatus    @default(OPEN)
  body            String
  response        String?
  respondedAt     DateTime?
  respondedById   String?
  respondedBy     User?                   @relation("SRResponder", fields: [respondedById], references: [id])
  createdAt       DateTime                @default(now())
  updatedAt       DateTime                @updatedAt

  @@index([tenantId])
  @@index([groupId])
  @@index([status])
}
```

After changes: `npx prisma db push && npx prisma generate`

---

### 1.2 RBAC

**File**: `src/lib/rbac.ts`

Add to the `ROLES` constant:
```typescript
HR: ["HR_MANAGER"] as UserRole[],
```

Every HR page uses `requireRole(ROLES.HR)`. After auth, always scope Prisma queries to `session.user.groupId` — never `tenantId` alone.

---

### 1.3 Auth Session — expose `groupId`

**File**: `src/lib/auth.ts`

The NextAuth session callback needs to include `groupId` alongside `role`, so server components can use `session.user.groupId` directly. Verify this is already being forwarded from the JWT; if not, add it.

---

### 1.4 Layout & Sidebar

**Files**:
- `src/app/(hr)/layout.tsx` — async server component, fetches session, passes `groupId` + group name to sidebar
- `src/components/layouts/HRSidebar.tsx` — client component, own navigation structure

**Sidebar navigation**:
```
Overview
  Dashboard

My Group
  Roster
  Endorsement Requests

Finance
  Invoices

Insights
  Utilization

Support
  Service Requests

─────────
Profile / Log out
```

The sidebar header should show the company name (fetched from `group.name`) so the HR manager always knows which group they're managing.

---

### 1.5 Settings — Invite HR User

**File**: `src/app/(admin)/settings/actions.ts`

Extend `inviteUserAction` to support `HR_MANAGER` role. When inviting an HR user, the admin must select which Group to assign them to. The created User record gets `role: "HR_MANAGER"` and `groupId` set.

UI change: in the Invite User modal, when the selected role is `HR_MANAGER`, show a Group selector dropdown.

---

## Phase 2 — Core Read Pages

### 2.1 HR Dashboard

**Route**: `/hr/dashboard`
**File**: `src/app/(hr)/dashboard/page.tsx`

**Data fetched** (all scoped to `session.user.groupId`):

| Card | Query |
|---|---|
| Total Active Members | `COUNT(*) WHERE groupId = ? AND status = ACTIVE` |
| Members Added This Month | `COUNT(*) WHERE groupId = ? AND enrollmentDate >= start of month` |
| Pending Endorsements | `COUNT(*) WHERE groupId = ? AND status IN (SUBMITTED, UNDER_REVIEW)` |
| Outstanding Invoice Balance | `SUM(amount - paidAmount) WHERE groupId = ? AND status IN (ISSUED, OVERDUE)` |

**Charts**:
- Member count trend (last 12 months) — bar chart
- Membership composition by relationship — donut (PRINCIPAL / SPOUSE / CHILD / PARENT)

**Recent activity table**: last 10 ActivityLog entries for the group (enrollments, endorsements, status changes).

---

### 2.2 Roster

**Route**: `/hr/roster`
**File**: `src/app/(hr)/roster/page.tsx`

Full list of all members in the group. Server-rendered with search and filter.

**Columns**: Member Number, Name, Relationship, Package / Tier, Status, Enrolled Date, Phone

**Filters**:
- Status (Active / Suspended / Lapsed / All)
- Relationship (Principal / Dependant)
- Search by name, ID number, member number

**Actions per row**:
- View member detail (read-only: same data as admin member detail minus claims financials)

**Page-level actions**:
- "Add Member" → `/hr/roster/new` (creates an endorsement request)
- "Bulk Import" → `/hr/roster/import`
- "Export CSV" → downloads roster as CSV (name, ID, DOB, relationship, status)

**Privacy**: no claim amounts, no benefit balances visible at roster level. HR sees *who* is enrolled, not *what they've claimed*.

---

### 2.3 Member Detail (read-only)

**Route**: `/hr/roster/[memberId]`
**File**: `src/app/(hr)/roster/[memberId]/page.tsx`

Shows:
- Personal details (name, DOB, gender, ID number, phone, email)
- Coverage details (package, tier, enrollment date, status, waiting period end)
- Dependants (list of linked members)
- Endorsement history for this member

Does **not** show: claim history, benefit balances, pre-auth history — this is confidential clinical/financial data.

---

### 2.4 Invoices

**Route**: `/hr/invoices`
**File**: `src/app/(hr)/invoices/page.tsx`

List of all invoices for the group.

**Columns**: Invoice Number, Period, Amount (KES), Paid, Balance, Status, Due Date

**Status badges**: DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE

**Row actions**:
- Download PDF (Phase 2 — needs PDF library)
- View detail: line items, payment history

No payment submission in Phase 1 — payments are handled outside the system and reconciled by Avenue Finance. HR can see what's owed but cannot mark invoices as paid.

---

### 2.5 Group Profile

**Route**: `/hr/profile`
**File**: `src/app/(hr)/profile/page.tsx`

Read-only view of the group's details:
- Company name, industry, registration number
- Contact person (pre-filled from DB; editable via service request)
- Package name and annual limit
- Renewal date (with warning if < 60 days away)
- Assigned broker (if any)
- Payment frequency

No inline editing — changes go through a Service Request.

---

## Phase 3 — Self-Service Actions

### 3.1 Add Single Member (Endorsement Request)

**Route**: `/hr/roster/new`
**File**: `src/app/(hr)/roster/new/page.tsx` + `actions.ts`

This does **not** directly create a `Member`. It creates an `Endorsement` record with:
- `type: ADDITION`
- `status: SUBMITTED`
- Member details stored in `notes` as JSON (or a dedicated `payload` JSON field on `Endorsement`)
- `groupId` scoped to HR manager's group

**Form fields** (same as admin new-member form):
- First name, last name, date of birth, gender
- ID number (optional), phone (optional), email (optional)
- Relationship (PRINCIPAL / SPOUSE / CHILD / PARENT)
- Principal ID number (if dependant)

On submit: endorsement created, confirmation shown with endorsement reference number. Avenue ops team picks it up in the admin endorsements queue.

---

### 3.2 Bulk Import

**Route**: `/hr/roster/import`
**File**: `src/app/(hr)/roster/import/page.tsx`

Reuse the same CSV parsing logic from the admin bulk import (`parseImportAction` / `confirmImportAction`), but:
- HR version creates `Endorsement` records (`type: ADDITION`) rather than `Member` records directly
- Group is automatically scoped to the HR manager's group (no group selector needed)
- The page and instructions are simplified — no need to explain the full column guide, just link to the download template

This gives HR managers a self-service bulk onboarding flow while keeping data quality and approval in Avenue's hands.

---

### 3.3 Endorsement Requests List

**Route**: `/hr/endorsements`
**File**: `src/app/(hr)/endorsements/page.tsx`

List of all endorsements submitted for their group, across all time.

**Columns**: Reference, Type, Member, Submitted, Status, Effective Date, Processed By

**Status badges**: SUBMITTED, UNDER_REVIEW, APPROVED, DECLINED, REVERSED

**Filters**: Status, Type, Date range

**Row action**: View detail — shows what was submitted, any Avenue notes, approval/decline reason.

HR managers cannot edit or cancel an endorsement once submitted — they raise a service request if a correction is needed.

---

## Phase 4 — Utilization

### 4.1 Utilization Report

**Route**: `/hr/utilization`
**File**: `src/app/(hr)/utilization/page.tsx`

Aggregate-only — no individual claim detail. HR should understand how their group is using benefits, not whose specific medical history is what.

**KPI cards**:
| Metric | Description |
|---|---|
| Total Claims | Count of claims for the group, current policy year |
| Total Billed | Sum of billedAmount |
| Total Approved | Sum of approvedAmount |
| Loss Ratio | approvedAmount ÷ total premium invoiced |
| Top Benefit Category | Category with highest utilization |
| Average Claim Value | approvedAmount ÷ claim count |

**Charts**:
- Claims by benefit category (bar chart: Inpatient, Outpatient, Optical, Dental, Maternity)
- Monthly claims volume trend (line chart, 12 months)
- Top 5 providers by claim count (horizontal bar)
- Age band utilization — claim count by 0-17, 18-29, 30-39, 40-49, 50+ (privacy-safe: no names)

**Date range filter**: current policy year vs previous year (default: current year).

**Export**: "Export CSV" downloads the aggregate summary table, not individual claim rows.

---

## Phase 5 — Support

### 5.1 Service Requests — HR Submit

**Route**: `/hr/support`
**File**: `src/app/(hr)/support/page.tsx` + `actions.ts`

Two tabs: **Open Requests** | **Resolved**

**New request form**:
- Subject (text)
- Category dropdown (MEMBER_QUERY / CLAIM_QUERY / INVOICE_QUERY / CARD_REQUEST / BENEFIT_QUERY / GENERAL)
- Priority (LOW / NORMAL / HIGH / URGENT)
- Description (textarea)

On submit: creates `ServiceRequest` record, shows confirmation with reference number.

**Request list** shows: Reference, Subject, Category, Priority, Status, Submitted date, Response (if resolved).

---

### 5.2 Service Requests — Admin Queue

**Route**: `/admin-side handled in existing settings or a new top-level section`

Avenue's customer service team needs to see and respond to service requests.

**Option A** (recommended): Add a "Service Requests" item to the Admin sidebar under "Membership", visible to `OPS` roles.

**Route**: `/service-requests`
**File**: `src/app/(admin)/service-requests/page.tsx` + `[id]/page.tsx`

List view shows all open service requests across all groups. Detail view shows the full submission with a response textarea and status changer (OPEN → IN_PROGRESS → RESOLVED).

When resolved: `response` text saved, `status → RESOLVED`, `respondedAt` and `respondedById` set, AuditLog entry written.

---

## Phase 6 — Admin Enhancements

### 6.1 Invite HR User (Settings)

When inviting a user with role `HR_MANAGER`, the settings form shows a "Group" dropdown. The invited user gets `groupId` set. Required for HR users to access their portal.

### 6.2 Group Detail — HR Tab

**File**: `src/app/(admin)/groups/[id]/page.tsx`

Add an "HR Access" tab showing:
- Which users have HR_MANAGER access to this group
- Button to invite a new HR user for this group (pre-fills the group selector in the invite modal)

---

## Implementation Order

Build in this sequence to avoid circular dependencies:

```
1.1 Schema (enum + User.groupId + ServiceRequest model)
1.2 RBAC (add ROLES.HR)
1.3 Auth session (expose groupId)
1.4 Layout + HRSidebar
1.5 Admin: Invite HR User

2.1 HR Dashboard
2.2 Roster list
2.3 Member detail
2.4 Invoices
2.5 Group profile

3.1 Add single member (endorsement request)
3.2 Bulk import
3.3 Endorsement requests list

4.1 Utilization report

5.1 Service requests (HR submit)
5.2 Service requests (Admin queue)

6.1 + 6.2 Admin enhancements
```

---

## Key Design Decisions

**Why endorsements, not direct member creation?**
HR managers don't have the full context that Avenue's ops team has. Routing changes through endorsements keeps Avenue in control of data quality, eligibility checks, and billing triggers. HR gets self-service convenience; Avenue keeps data integrity.

**Why no claim detail at HR level?**
Individual claim data is confidential health information. HR managers have no business need to see that John Smith claimed for a specific diagnosis — only that the group's overall utilization is within expected bands.

**Why ServiceRequest instead of email?**
Gives both HR and Avenue a trackable, auditable record. Avoids the classic "I sent an email" / "we didn't get it" problem. Also enables reporting on response times.

**Why scoped to `groupId` not `tenantId`?**
A large corporate client could have multiple groups (e.g., KCB Kenya vs KCB Uganda). HR managers should only see their group. If cross-group access is ever needed, it becomes a new `HR_GROUP_ADMIN` role — don't conflate it with the base HR role.
