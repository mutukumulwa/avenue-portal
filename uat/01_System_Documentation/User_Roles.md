# Medvex TPA — User Roles (as-built)

**Source of truth:** `UserRole` enum (`prisma/schema.prisma`), role sets in `src/lib/rbac.ts`, menu gating in `src/components/layouts/AdminSidebar.tsx` + portal layouts.
**Verification status:** column "Verified live" is updated during Phase 5 role-based testing. Until marked ✅, entries describe code-declared behaviour, not observed behaviour.

## Role sets (from `src/lib/rbac.ts`)

| Set | Roles |
|---|---|
| ADMIN_ONLY | SUPER_ADMIN |
| CLINICAL | SUPER_ADMIN, CLAIMS_OFFICER, MEDICAL_OFFICER |
| FINANCE | SUPER_ADMIN, FINANCE_OFFICER |
| UNDERWRITING | SUPER_ADMIN, UNDERWRITER |
| OPS | SUPER_ADMIN, CLAIMS_OFFICER, MEDICAL_OFFICER, CUSTOMER_SERVICE, UNDERWRITER |
| ANY_STAFF | all internal staff incl. REPORTS_VIEWER + FUND_ADMINISTRATOR |
| MEMBER | MEMBER_USER |
| HR | HR_MANAGER, SUPER_ADMIN |
| FUND | FUND_ADMINISTRATOR, SUPER_ADMIN |

## The 11 roles

### 1. SUPER_ADMIN (`admin@medvex.co.ug`)
- **Purpose:** operator system administration — everything.
- **Menus:** all admin groups incl. Clients, Providers, Brokers, TPA Admin Fees, Compliance, Setup (users & roles, approval matrix, auto-adjudication, drug exclusions, terminology, FX, 2FA, pricing models, audit log).
- **Exclusive:** Clients, Providers, Brokers, Admin Fees, Compliance register/privacy, Setup pages.
- **Approval authority:** everything the approval matrix routes to (also HR/FUND portal access for support).
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 2. CLAIMS_OFFICER (`claims@medvex.co.ug`)
- **Purpose:** claims intake, capture, adjudication.
- **In sets:** CLINICAL, OPS, ANY_STAFF.
- **Menus:** Dashboard; Membership (Groups, Members, Onboarding, Endorsements — OPS); Clinical (Cases, Claims, Queues, Pre-auth, LOU, Offline, Approvals, Overrides, Cross-border, Wellness, Exceptions, Check-ins); Insights; Support. **No** Packages, Clients, Providers, Contracts, Finance pages, Setup.
- **Cannot:** see billing/GL/settlement (FINANCE), packages/quotations/contracts (UNDERWRITING), assessor queue.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 3. FINANCE_OFFICER (`finance@medvex.co.ug`)
- **Purpose:** billing, GL, provider settlement, reconciliation.
- **Menus:** Dashboard, Billing & Invoices, General Ledger, Account Ledger, Provider Settlements, Insights.
- **Cannot:** clinical pages, membership mutation pages, setup. Not in OPS → no Members/Groups/Claims menus.
- **Approval authority:** settlement checker (maker-checker), payment approvals per matrix.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 4. UNDERWRITER (`underwriter@medvex.co.ug`)
- **Purpose:** schemes, packages, quotations, provider contracts, assessor queue.
- **Menus:** Dashboard; Membership incl. Packages; Clinical incl. Assessor Queue + Contracts; Quotations; Insights; Support.
- **Cannot:** Billing/GL/Settlement, Clients, Providers (list is ADMIN_ONLY), Brokers, Setup.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 5. CUSTOMER_SERVICE (`cs@medvex.co.ug`)
- **Purpose:** front-office member/claims servicing, complaints, service requests.
- **In sets:** OPS, ANY_STAFF. Menus like CLAIMS_OFFICER minus adjudication authority (actions on claim detail are CLINICAL-gated).
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 6. MEDICAL_OFFICER (`medical@medvex.co.ug`)
- **Purpose:** clinical adjudication decisions, pre-auth medical review.
- **In sets:** CLINICAL, OPS, ANY_STAFF. Same menu surface as CLAIMS_OFFICER.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 7. REPORTS_VIEWER (no seeded user)
- **Purpose:** read-only insights. In ANY_STAFF only → Dashboard, Strategic Purchasing, Reports.
- ⚠️ No seeded account; must be created via Settings → Users to test.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 8. FUND_ADMINISTRATOR (`fund@medvex.co.ug`)
- **Purpose:** employer finance officer of self-funded scheme(s) — monitors fund balance, deposits, claims drawdown, statements.
- **Portal:** `/fund/dashboard` → per-group fund pages. Note: fund pages are also in the admin sidebar for SUPER_ADMIN ("Self-Funded Schemes").
- **Scope:** only groups where they are the assigned fund admin.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 9. BROKER_USER (`broker@kaib.co.ke`)
- **Purpose:** intermediary self-service. Portal `/broker/*`: dashboard, quotations (create/list own), groups (own book), submissions, renewals, commissions, support.
- **Scope:** own brokerage's records only.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 10. HR_MANAGER (`emily.wambui@safaricom.co.ke`)
- **Purpose:** corporate client HR admin. Portal `/hr/*`: dashboard, roster (view own employees, request additions → endorsements, CSV import), endorsements, invoices, utilization, support, profile.
- **Scope:** own employer group only (cross-employer isolation).
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

### 11. MEMBER_USER (`member@medvex.co.ug` + 5 demo members)
- **Purpose:** insured member self-service. Portal `/member/*` (see Workflows §M).
- **Scope:** self + family unit.
- Verified live: ✅ 2026-07-04 RB sweep (06_Test_Results/rb-sweep-results.json + 04_Evidence/Screenshots/rb-*.png) — nav footprint and forbidden-route redirects match the declared sets

## Parallel fine-grained RBAC (settings-managed)

`Role`/`Permission`/`RolePermission`/`UserRoleAssignment` tables (with maker-checker `PENDING_APPROVAL→ACTIVE` role assignment) exist and are seeded via `prisma/seeds/rbac.ts`; administered under `/settings`. **Observed:** page-level gating in code uses only the coarse enum; where the fine-grained permissions are actually enforced needs testing (risk: two RBAC systems that can disagree). → tracked as an open question OQ-1.

## Portal ↔ role routing

`/post-login` routes: staff → `/dashboard`; FUND_ADMINISTRATOR → `/fund/dashboard`; BROKER_USER → `/broker/dashboard`; HR_MANAGER → `/hr/dashboard`; MEMBER_USER → `/member/dashboard`. Wrong-portal access redirects to `/unauthorized` (branded page).
