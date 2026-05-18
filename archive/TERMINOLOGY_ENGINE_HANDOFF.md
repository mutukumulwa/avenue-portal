# Terminology Engine Handoff

Last updated: 2026-05-06

## Source Spec
- Competitive hardening spec: `AICARE_COMPETITIVE_HARDENING_SPEC.md`
- Current module: Module 2, Configurable Terminology Engine.
- Previous module status: Module 1 Broker Command Center is implemented through seed/demo data, with operational DB QA still pending in `BROKER_COMMAND_CENTER_HANDOFF.md`.

## Next Master Hardening Item
The next item on the master hardening list is **Module 2 — Configurable Terminology Engine**.

The goal is to make Avenue's "membership" vocabulary a configurable, tenant-scoped system capability instead of hard-coded UI copy. The live demo should be able to switch between an insurance-style dictionary and Avenue's membership dictionary, while admin users can manage terminology with maker-checker approval and audit history.

## Existing-Code Findings
- No full terminology engine currently exists.
- Existing multi-tenant anchor exists:
  - `Tenant` has `id`, `slug`, branding fields, and `config`.
  - `User` has `tenantId`, `role`, and optional portal links.
- Existing RBAC is role-set based in `src/lib/rbac.ts`, not permission-string based.
  - For the first implementation, use `ROLES.ADMIN_ONLY` for terminology administration.
  - Later refinement can add explicit `terminology:admin` and `terminology:approve` permissions if/when permission-string RBAC is introduced.
- Existing audit helper is `src/lib/audit.ts`.
  - Use `writeAudit()` for terminology create/submit/approve/reject/snapshot actions.
  - The immutable audit chain in the spec is a later Module 4 concern; do not block Module 2 on it.
- Existing tRPC root is `src/server/trpc/router.ts`.
  - Add a terminology router there when API work begins.
- Existing notification templates live in `NotificationTemplate`.
  - Module 2 should add terminology-aware rendering, not replace this table.
- Existing UI has many hard-coded user-facing strings in admin/member/HR/broker/fund surfaces.
  - A full sweep is large. Start with shared navigation, dashboard headings, member/group/package/claim/preauth/billing labels, and broker portal labels.
- Existing PDF/report surfaces include hard-coded headers.
  - Integrate terminology after the resolver and dictionary seed are stable.
- Redis/BullMQ exists through queue infrastructure.
  - Prefer a terminology resolver that works without Redis first, with request-level cache and optional Redis TTL cache if the existing Redis configuration is available.

## Execution Plan

### Phase 1 — Foundation Schema And Migration
Status: Pending

Add Prisma schema support for:
- `TerminologyKey`
- `TerminologyValue`
- `TerminologyDictionarySnapshot`
- Enums:
  - `TerminologyCategory`
  - `TerminologyScope`
  - `TerminologyValueStatus`

Implementation notes:
- Add relations from `Tenant` and `User` only where they improve query clarity. Avoid over-wiring if it creates migration risk.
- Preserve never-delete behavior with `effectiveFrom`, `effectiveTo`, and status transitions.
- Use indexes from the spec:
  - `TerminologyKey.category`
  - `TerminologyValue(scope, scopeRef, status)`
  - `TerminologyValue(keyId, scope, scopeRef, locale, effectiveFrom)` unique
  - `TerminologyDictionarySnapshot(tenantId, createdAt)`
- Create migration under `prisma/migrations/`.
- Run `npx prisma validate` after schema edits.

Deliverables:
- Prisma models/enums
- Migration
- Schema validation

### Phase 2 — Resolution Service
Status: Pending

Add `src/server/services/terminology.service.ts`.

Core responsibilities:
- Resolve a single canonical key.
- Resolve a dictionary map for a tenant/user/locale.
- Apply fallback order:
  1. `USER_PREFERENCE` for current user
  2. `LOCALE_OVERRIDE` for current locale
  3. `TENANT_DEFAULT` for current tenant
  4. `SYSTEM_DEFAULT`
  5. `TerminologyKey.defaultValue`
  6. final fallback to canonical key if missing
- Only use active values whose effective date range includes `asOf`.
- Provide interpolation for template variables, for example `t("message.welcome", { memberName })`.
- Support a simple pluralization convention through separate canonical keys, not runtime language rules at first.
- Add cache helpers:
  - request-level cache for server-rendered navigation/pages
  - optional Redis 5-minute TTL later if the queue Redis connection is readily reusable

Suggested API:
- `resolveTerm({ canonicalKey, tenantId, userId?, locale?, asOf?, variables? })`
- `resolveDictionary({ tenantId, userId?, locale?, asOf? })`
- `invalidateTerminologyCache({ tenantId, locale? })`
- `hashDictionary(dictionary)` for snapshot/PDF tamper anchor

Deliverables:
- Service with deterministic fallback behavior
- Unit-style checks if test harness is available, otherwise a small script or direct `tsc` coverage

### Phase 3 — Admin Actions And tRPC Router
Status: Pending

Add server/API surfaces for:
- List keys and active values by tenant/category/search.
- Create canonical key.
- Create tenant override draft.
- Submit draft for approval.
- Approve override.
- Reject override.
- Snapshot active dictionary.
- Compare two snapshots.
- Resolve dictionary for the current session.

Implementation notes:
- In server actions/pages, use `requireRole(ROLES.ADMIN_ONLY)` initially.
- In tRPC, add an admin guard equivalent to existing role checks.
- Enforce maker-checker:
  - approver cannot be the same user as creator for tenant-default changes.
  - approval supersedes prior active values for same key/scope/scopeRef/locale.
- Audit every mutation through `writeAudit()` with module `terminology`.
- Keep public/user dictionary resolution read-only and tenant-scoped.

Likely files:
- `src/server/trpc/routers/terminology.ts`
- `src/server/trpc/router.ts`
- `src/app/(admin)/settings/terminology/actions.ts`

Deliverables:
- Router/actions
- Mutation audit logs
- Maker-checker status flow

### Phase 4 — Frontend Provider, Hook, And Demo Toggle
Status: Pending

Add client terminology support:
- `TerminologyProvider`
- `useTerminology()`
- `t(key, variables?)`
- Demo dictionary mode toggle for sales/admin demo sessions.

Implementation notes:
- The app uses server components heavily. Keep a server-side resolver available for server-rendered pages and a client provider for interactive client components.
- Start by mounting the provider in the relevant portal layouts rather than attempting every route at once.
- Keep demo toggle lightweight:
  - switch between active Avenue dictionary and "default insurance" dictionary.
  - persist preference in URL/search param, cookie, or user preference only after confirming existing patterns.
- SSE live update is in the spec, but should be second pass. A manual refresh or client state switch is acceptable for the first useful demo.

Likely files:
- `src/components/terminology/TerminologyProvider.tsx`
- `src/lib/terminology.ts`
- portal layouts under `src/app/(admin)/layout.tsx`, `src/app/member/layout.tsx`, `src/app/broker/layout.tsx`, `src/app/(hr)/layout.tsx`, `src/app/fund/layout.tsx`
- settings UI under `src/app/(admin)/settings/terminology/`

Deliverables:
- Hook/provider
- Demo switch
- Admin settings navigation link

### Phase 5 — Terminology Admin UI
Status: Pending

Build an admin settings surface:
- Browser table grouped/filterable by category.
- System default vs tenant value side-by-side.
- Inline draft editor.
- Pending approval queue.
- Approve/reject controls.
- Snapshot manager.
- Snapshot diff view.
- Preview pane for selected key.

Implementation notes:
- Keep UI dense and operational, consistent with current settings/admin pages.
- Avoid converting this into a marketing-style page.
- Use existing button/table/card styling patterns.

Likely route:
- `src/app/(admin)/settings/terminology/page.tsx`

Deliverables:
- Terminology browser
- Tenant override editor
- Approval queue
- Snapshot list/diff

### Phase 6 — Avenue Seed Dictionary
Status: Pending

Seed enough dictionary data to demonstrate the regulatory positioning clearly.

Minimum initial keys:
- `entity.policy.singular`: Policy -> Membership
- `entity.policy.plural`: Policies -> Memberships
- `role.policyholder.singular`: Policyholder -> Member
- `role.principal_member.singular`: Principal insured -> Principal member
- `financial.premium.singular`: Premium -> Contribution
- `financial.premium.plural`: Premiums -> Contributions
- `entity.insurer.singular`: Insurer -> Membership administrator
- `process.claim.submit`: Submit claim -> Submit reimbursement request
- `entity.benefit_schedule.singular`: Policy schedule -> Benefit schedule
- `entity.cover.singular`: Cover -> Benefit access
- `entity.preauthorization.singular`: Pre-authorization -> Care approval
- `entity.dependent.plural`: Dependants -> Family members

Seed shape:
- System default keys/values.
- Avenue tenant defaults.
- One "default insurance" snapshot for live demo comparison.
- One historical Avenue snapshot with notes.

Implementation notes:
- Make seed idempotent.
- Do not run `npm run db:seed` unless explicitly requested because it writes to the database.
- The seed must run after the terminology migration.

Deliverables:
- Seed block in `prisma/seed.ts`
- Optional seed helper data file if the key list grows large

### Phase 7 — Surface Sweep
Status: Pending

Do the string replacement in passes to keep risk controlled.

Pass A: Navigation and shared portal chrome
- `AdminSidebar`
- `BrokerSidebar`
- `HRSidebar`
- `FundSidebar`
- `PortalSwitcher`

Pass B: High-impact demo surfaces
- Admin dashboard
- Member dashboard and benefits pages
- Broker dashboard/commissions page
- HR dashboard
- Fund dashboard

Pass C: High-frequency operational pages
- Members list/detail/forms
- Groups list/detail/forms
- Claims and pre-auth pages
- Billing/invoices pages
- Reports headers

Pass D: Templates and generated outputs
- Notification templates
- PDF report document
- Export/report headers

Implementation notes:
- Prefer meaningful canonical keys over one-off keys for every label.
- Keep dynamic business data untouched.
- Avoid translating enum values at the database layer; map enum display labels through terminology.
- Add a static analysis script only after the first sweep establishes conventions.

Deliverables:
- Converted shared surfaces
- Converted demo surfaces
- Static analysis script with warning mode first

### Phase 8 — Regulatory Positioning Artifact
Status: Pending

Generate a one-page PDF for Avenue legal/compliance.

Contents:
- Tenant name
- Dictionary effective date
- Two-column comparison of sensitive/regulatory-significant terms
- Terms explicitly avoided in user-facing surfaces
- Affected templates/surfaces
- Signature blocks
- SHA-256 hash of dictionary state

Implementation notes:
- Reuse existing PDF stack if practical, likely `@react-pdf/renderer`.
- Store/generated file approach should match existing report export conventions.
- Include the dictionary hash in the UI and PDF.

Deliverables:
- PDF generator service/component
- Admin action/button
- Pre-generated seed/demo artifact if storage conventions allow it

### Phase 9 — Verification And Handoff
Status: Pending

Run:
- `npx prisma validate`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`

Expected current caveat:
- `npm run lint` currently fails on unrelated baseline errors in:
  - `src/components/dashboard/DashboardCharts.tsx`
  - `src/server/services/providers.service.ts`
  - `src/server/services/secure-checkin/secure-checkin.service.ts`

Manual QA:
- Admin can view terminology browser.
- Admin can create a tenant override draft.
- Different admin can approve it.
- Same creator cannot approve own draft.
- Approved value supersedes prior active tenant value.
- User-facing demo surface changes after dictionary switch.
- Missing key falls back gracefully.
- Snapshot hash remains stable for unchanged dictionary.
- Generated PDF includes expected sensitive terms.

## Initial Build Order Recommendation
1. Schema/migration.
2. Resolution service.
3. Avenue seed dictionary.
4. Admin browser read-only UI.
5. Draft/submit/approve/reject workflow.
6. Provider/hook and shared navigation conversion.
7. Demo toggle.
8. High-impact surface sweep.
9. Snapshot/PDF artifact.
10. Static analysis warning script.

This order gets a demonstrable vertical slice quickly: database -> resolver -> seed -> admin browser -> one live UI surface switching dictionaries.

## Risks And Decisions
- Full codebase string sweep is large. Do it incrementally and document remaining surfaces.
- SSE live updates may be unnecessary for the first demo. A client-side demo toggle is faster and less risky.
- Permission-string RBAC is specified but the app currently uses role sets. Use `SUPER_ADMIN`/`ROLES.ADMIN_ONLY` first.
- Redis cache should not be a hard dependency for correctness. The resolver should work with database + request cache.
- The broker module has pending DB migration/seed QA. Avoid coupling terminology work to broker operational QA.

## Handoff Protocol
Update this document after every meaningful phase with:
- status changes
- files touched
- commands run
- test/build results
- known blockers
- next recommended step

Keep `BROKER_COMMAND_CENTER_HANDOFF.md` for Module 1 notes. This file is the canonical handoff for Module 2.
