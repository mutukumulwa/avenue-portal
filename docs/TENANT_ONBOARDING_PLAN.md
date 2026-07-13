# Tenant Onboarding — Design & Execution Plan

> Status: implemented (see the file map below). This document is the plan of
> record for the `/settings/tenants` onboarding surface. It is written so that
> any engineer — or any code-generation model — can re-derive, extend, or
> verify the feature without re-exploring the codebase. Every load-bearing
> claim carries a `file:line` citation (line numbers as of the commit that
> introduced this doc; re-locate with the quoted identifiers if they drift).

---

## 1. Purpose

Give the platform operator an in-app way to create a **fully functional**
tenant (a TPA operator organisation) and repair a partially provisioned one.
Before this feature, the only tenant-creation site in the entire codebase was
`prisma/seed.ts` (`tenant.upsert`, slug `medvex`); tenants created any other
way (SQL, console) launched **un-provisioned** — which caused a real production
incident where every contract fee schedule collapsed into "Other / N unmapped"
because the service-category taxonomy was never seeded.

**Glossary (critical):** `Tenant` = the TPA operator org itself (Medvex).
`Client` = a payer (insurer / HMO / self-funded employer) administered *by* a
tenant (`prisma/schema.prisma`, Client model comment). Onboarding a tenant =
standing up a new operator org, NOT adding a payer.

## 2. What "fully functional" means — the fail-closed inventory

A tenant missing any of these breaks core flows. Each row cites the code that
fails loudly without it:

| # | Asset | Enforcing code (fails without it) | Provisioned by |
|---|---|---|---|
| 1 | **Default Client** — `id: cl_${tenantId}`, `slug: 'default'`, `type: 'INSURER'`, `status: 'ACTIVE'`, tenant currency | `resolveSchemeClientId` throws (`src/server/services/clientResolve.ts:21-26`) → no schemes/groups → no members | `provisionTenant` step 1 |
| 2 | **Chart of accounts** (24 standard accounts) | `GLService.getAccount` throws (`src/server/services/gl.service.ts:44-49`) *inside* the claim-approval / settlement / invoice transactions → first money operation rolls back | `provisionTenant` step 3 via `GLService.seedChartOfAccounts` |
| 3 | **RBAC** — global `Permission` rows, 17 per-tenant `Role` rows, `RolePermission` maps, and the `User.role`-enum → `UserRoleAssignment` migration | granular `rbacService.requirePermission` is fail-closed (`src/server/services/rbac.service.ts:56-77`): quotation binding/issue, underwriting decisions, overrides all throw FORBIDDEN; session `permissions[]` loads from `UserRoleAssignment` at login (`src/lib/auth.ts:11-25`) | `provisionTenant` step 2 via `seedRbac` |
| 4 | **Reference catalogs** — 36 adjudication reason codes, 16 override controls, 49 service categories (+aliases) | decline/shortfall paths need reason codes; fee schedule tiers need the taxonomy (the original incident) | `provisionTenant` step 4 |
| 5 | **First SUPER_ADMIN user** — must exist **before** `seedRbac` runs | `seedRbac`'s migration step (`prisma/seeds/rbac.ts:307-342`) mints the ACTIVE `UserRoleAssignment` from the enum role; without it the admin logs in with empty permissions | `createTenantAction` (nested write, before provisioning) |

**Conditionally required:** a non-UGX tenant cannot approve claims until an
in-force `FxRate { quoteCurrency → UGX }` exists — claim approval throws at
`src/server/services/claim-decision.service.ts:498-506` (`BASE_CURRENCY` is
hardcoded `"UGX"`, `src/server/services/fx.service.ts:14`). `FxRate` is
tenant-scoped, so the **new tenant's own admin** captures it in
Settings → FX Rates. The success panel surfaces this as a highlighted
checklist item whenever the created tenant's currency ≠ UGX.

**Deliberately NOT provisioned (fail-open or unused):** approval matrix
(empty = ungoverned, `approval-matrix.service.ts:205`), auto-adjudication
policy (null = manual routing), notification templates (fallback body),
tax rates (never read — levies are hardcoded), FX for pure-UGX tenants,
all demo data. There are **no number sequences** — numbering is count-based.

## 3. Flow design

```
createTenantAction(formData)
 ├─ requireRole(ROLES.ADMIN_ONLY)                       // SUPER_ADMIN only
 ├─ platform gate (see §4)                              // slug-locked, fail closed
 ├─ validate: name · slug /^[a-z0-9-]+$/ · currency ∈ {UGX,KES,USD}
 │            admin names · email · validatePassword()  // min 10 + upper/lower/digit
 ├─ pre-checks: tenant slug free · email free GLOBALLY  // see §5
 ├─ bcrypt.hash(password, 12)
 ├─ ATOMIC nested create:                               // no interactive tx needed
 │    prisma.tenant.create({ data: { name, slug,
 │      config: { defaultCurrency },                    // read back on re-provision
 │      users: { create: { …, role: "SUPER_ADMIN" } } } })
 ├─ provisionTenant(tenant.id, { currency })            // OUTSIDE the create; idempotent
 │    1. default-Client upsert (operatorTenantId_slug)  // update: {} — never clobbers
 │    2. seedRbac(prisma, tenantId)                     // roles + perms + admin's assignment
 │    3. GLService.seedChartOfAccounts(tenantId)
 │    4. reason codes · override controls · service categories
 ├─ writeAudit("TENANT_CREATED", module "SETTINGS")     // ALWAYS, even on provisioning failure
 └─ redirect ?created=<slug>   |   ?error=<msg mentioning Re-provision>
```

Why the split: the nested create is atomic by itself (tenant + admin can never
exist half-made), while provisioning runs hundreds of upserts — too slow for an
interactive transaction and unnecessary to make atomic because **every
provisioning step is idempotent**. A partial failure leaves the tenant row
with an `Incomplete` chip in the list and a **Re-provision** button
(`reprovisionTenantAction`) that safely re-runs the whole set.

Order invariant: the admin user is created **inside** the tenant create, i.e.
strictly before `seedRbac`, so the enum→assignment migration picks them up.

## 4. Access gate — slug-locked, fail closed

`SUPER_ADMIN` is tenant-scoped; there is **no platform-level role** in the
schema. Left ungated, the SUPER_ADMIN of *any* future tenant would see the
tenant-creation surface. Decision (2026-07-13): restrict to the platform
operator's own tenant, identified by slug, failing closed:

- Env var: **`PLATFORM_TENANT_SLUG`** (set to `medvex`). Slug — not id —
  because it is stable across local/UAT/prod databases.
- Unset/blank → the page renders a "disabled" explainer card (no form, no
  cross-tenant list) and both actions refuse. This is the same fail-closed
  convention as `API_KEY` / `OPERATOR_TENANT_ID` (BD-06,
  `docs/API_AUTHENTICATION.md`).
- Set, but the session user's tenant slug ≠ the env value → `redirect("/unauthorized")`.
- Implementation: `resolvePlatformGate(sessionTenantId)` in
  `src/app/(admin)/settings/tenants/platform-gate.ts` — a **separate module**
  because every export of a `"use server"` actions file must itself be a
  server action, so shared helpers cannot live in `actions.ts`.

## 5. The global-email rule (do not "fix" it per-tenant)

`User.email` is unique **per tenant** (`@@unique([tenantId, email])`) — but
login resolves `prisma.user.findFirst({ where: { email, isActive: true } })`
with **no tenant filter** (`src/lib/auth.ts:66-88`). Two active users sharing
an email across tenants means login picks an arbitrary one and the other is
shadowed. Until/unless login becomes tenant-aware, `createTenantAction` MUST
pre-check email uniqueness **across all tenants** (`user.findFirst({ where:
{ email } })`, deliberately unscoped) and reject duplicates.

## 6. File map

| File | Role |
|---|---|
| `src/server/services/tenant-provisioning.service.ts` | `provisionTenant(tenantId, opts?)` — THE single provisioning entry point (default client + RBAC + COA + catalogs). Any tenant-creation path must call it. |
| `src/app/(admin)/settings/tenants/platform-gate.ts` | `resolvePlatformGate()` — §4 gate, shared by page + actions |
| `src/app/(admin)/settings/tenants/actions.ts` | `createTenantAction`, `reprovisionTenantAction` (both audited — see §8) |
| `src/app/(admin)/settings/tenants/TenantCreateForm.tsx` | client form; slug auto-suggest; password `minLength={PASSWORD_MIN_LENGTH}` |
| `src/app/(admin)/settings/tenants/page.tsx` | list (intentionally cross-tenant) + provisioned-state chips + Re-provision + success panel with go-live checklist |
| `src/components/layouts/AdminSidebar.tsx` | `SETUP_SUB` entry `{ label: "Tenants", href: "/settings/tenants" }` |
| `src/components/layouts/Breadcrumbs.tsx` | `tenants: "Tenants"` segment label |
| `prisma/seed.ts` | standalone `seedRbac` call removed — folded into `provisionTenant`; the early default-client block and mid-seed `seedChartOfAccounts` stay (mid-seed demo data needs them; both idempotent against the later provisionTenant re-run) |
| `.env.example` | `PLATFORM_TENANT_SLUG` documented |
| `tests/services/tenant-provisioning.test.ts` | provisioning orchestration (5 cases) |
| `tests/actions/tenant-onboarding.actions.test.ts` | action behavior incl. gate trio, global-email check, P2002 race, partial failure (~12 cases) |
| `scripts/seed-reason-codes.ts` | unchanged CLI repair path — `npx tsx --env-file=.env scripts/seed-reason-codes.ts [tenantId…]` now provisions the full set |

## 7. Conventions a re-implementer must follow

1. **Guard page AND every action** with `await requireRole(ROLES.ADMIN_ONLY)`
   — there is no middleware in this app; layouts only enforce ANY_STAFF.
2. **Audit-coverage CI**: `tests/audit-coverage/audit-coverage.test.ts` scans
   every `*actions.ts` under `src/app`; each exported async function must
   contain a `writeAudit(` call or a justified entry in
   `tests/audit-coverage/catalogue.ts`. Metadata values must be **flat
   scalars** (`Record<string, string|number|boolean|null>`).
3. **Error idiom** (copy of `settings/drug-exclusions/actions.ts`): collect a
   message in `try/catch` (re-throw `NEXT_REDIRECT`), then
   `redirect(\`${PATH}?error=${encodeURIComponent(msg)}\`)`; success →
   `revalidatePath(PATH)` + redirect with a success query param. The page
   reads `searchParams: Promise<{ error?: … }>`.
4. **Password policy**: `validatePassword()` from `@/lib/password-policy`
   (min **10**, upper+lower+digit — the invite modal's `minLength={8}` hint is
   stale; do not copy it). Hash with `bcrypt.hash(pw, 12)`. The admin TYPES
   the initial password; it is never generated, echoed, or emailed.
5. **Brand guards** (prebuild + tests): never render seeded account emails in
   UI; never introduce the retired brand string; a `<option value="KES">`
   currency selector is fine but `currency: "KES"` literals in src are not.
6. **Styling**: brand tokens (`globals.css @theme`) — inputs/labels/cards/
   banners exactly as in `settings/drug-exclusions/page.tsx`; success uses
   `brand-success`, warnings `brand-coral`.
7. **Prisma error mapping**: catch unique-constraint races by duck-typing
   `(err as { code?: string }).code === "P2002"` — no Prisma error-class
   imports in server actions (house precedent).

## 8. Edge cases & invariants

| Case | Behavior |
|---|---|
| Slug taken (pre-check or P2002 race) | Friendly error; DB `@unique` is the backstop |
| Email in use in ANY tenant | Rejected (§5) with an explanatory message |
| Provisioning throws after create | Tenant+admin survive; audit records `provisioned: false` + `provisionError`; UI error names the **Re-provision** button; chips show `Incomplete` |
| Re-provision of a healthy tenant | No-op counts (all upserts) — safe, idempotent |
| Currency on repair | `provisionTenant` resolves `opts.currency ?? tenant.config.defaultCurrency ?? "UGX"`, so a KES tenant whose default client was never created gets a KES one on repair; an existing default client is never mutated (`update: {}`) |
| Slug rename / tenant deactivation | Out of scope — no UI; `Tenant` has no status field |
| New tenant look & feel | Branding fields fall back to schema defaults; `Client.memberNumberPrefix` defaults `MVX` — both on the go-live checklist |

## 9. Go-live checklist for a newly created tenant

Shown on the success panel; recorded here for support use:

1. Sign in at `/login` with the admin email + password entered on the form.
2. **If currency ≠ UGX**: capture a rate to UGX in Settings → FX Rates *as the
   new tenant's admin* — claim approval fails closed without it (§2).
3. Invite the rest of the team (Settings → Users & Access).
4. Review branding (logo/colors) and the member-number prefix (default `MVX`).
5. Create Clients (payers), Groups/schemes, Packages, Providers + contracts.

## 10. Plug points (deferred by decision, 2026-07-13)

- **Branding fields** on the create form → write `logoUrl`, `primaryColor`,
  `accentColor`, `warmColor`, `fontHeading`, `fontBody` on `tenant.create`
  (schema defaults documented in §2 of this doc's source exploration).
- **Initial FX rate field** (when currency ≠ UGX) → after provisioning, create
  `FxRate { tenantId, baseCurrency: "UGX", quoteCurrency: currency, rate,
  source: "onboarding" }` so claims work day-1 without the new admin touching
  Settings → FX Rates.
- Marked with `DECISION(B)` comments in `actions.ts` / `TenantCreateForm.tsx`.

## 11. Verification

```bash
npm run typecheck && npx vitest run && npm run brand:guard && npm run currency:guard
```

Runtime proof (local DB): set `PLATFORM_TENANT_SLUG=medvex` in `.env`, start
the dev server, sign in as the seeded platform admin → Setup → Tenants →
create a KES test tenant → confirm: success panel shows the FX checklist item;
list chips read `Provisioned`; SQL counts — default client 1, roles 17, COA 24,
service categories > 0, reason codes > 0, ACTIVE `UserRoleAssignment` ≥ 1 —
then sign in as the new admin (lands on `/dashboard`, `/settings` loads), and
click **Re-provision** (idempotent; `TENANT_REPROVISIONED` appears in
Settings → Audit Log). Negative check: blank `PLATFORM_TENANT_SLUG` → the page
shows the disabled card and the actions refuse. Finally `npx prisma db seed`
must still complete (RBAC folded into `provisionTenant`).

## 12. Ops

- **Vercel**: set `PLATFORM_TENANT_SLUG=medvex` (Environment Variables → all
  environments). Until set, the feature is safely disabled in prod.
- The live tenant predates the full catalog: after deploy, clicking
  **Re-provision** on it tops up the SQL-seeded 23-category taxonomy to the
  full 49-category catalog and backstops COA/RBAC — all idempotent.

## 13. Known limitations (pre-existing, documented not fixed)

- Three routes assume a single tenant (`prisma.tenant.findFirst()`):
  `src/app/member/support/actions.ts:28`, `src/app/api/v1/hms-batch/route.ts:21`,
  `src/app/api/v1/sync/route.ts:35` — harmless today; wrong the day tenant #2
  processes traffic through them.
- Governance thresholds are authored in KES terms but FX-normalised to UGX at
  runtime (`override-control.service.ts:6-8`, approval-matrix bands): a real
  KES tenant with an in-force rate would see ~29× skew unless per-rule band
  currencies are set deliberately.
- Login resolves email globally (§5) — the onboarding action compensates; a
  future tenant-aware login should revisit.
