# F0.1 — Provider Route Inventory (frozen 2026-07-23)

**Branch/commit:** `feat/provider-network-os` @ `648b678` (worktree clean of staged changes; unrelated UAT files untouched)
**Method:** `find src/app/provider`, `find src/app/api/v1 -name route.ts`, grep of provider mentions in other API routes, `ls src/server/trpc/routers`, `ls src/server/services`, plus a full read of every provider page/action and the two auth foundations. Every claim below carries file:line evidence from this tree. No behavior was changed.

**Classification rubric (relative to the PNOS target model, spec §6/§9.1):**
- `SAFE` — authenticated + resource scoped correctly for the target model at its current granularity.
- `PARTIAL` — authenticated + provider/tenant-scoped, but missing target-model requirements (branch scope, granular permission, API scopes, or canonical service).
- `UNSCOPED` — a scoping/authorization dimension the target model mandates is absent → live leak/abuse surface.

---

## 0. Authentication foundations

| Foundation | File | Behavior (verified) |
|---|---|---|
| `requireProvider()` | `src/lib/provider-portal.ts:11-23` | `requireRole(ROLES.PROVIDER)` (= `["PROVIDER_USER"]`, `src/lib/rbac.ts:42`) + `session.user.providerId` must exist + provider row must match `tenantId`. Returns `{session, providerId, provider, tenantId}`. **No branch concept, no granular permission** — role+provider binding only (spec gap #4). |
| API key auth | `src/lib/apiAuth.ts:46-60` | Two channels: operator env key (fail-closed when unset, BD-06; optional `OPERATOR_TENANT_ID` binding) and per-provider `ProviderApiKeyService.verify`. `withApiKey` wrapper → 401. **No scopes, no expiry, no branch restriction, no rotation family** (spec gap #6). |
| Route protection | no `middleware.ts` exists | Protection is per-layout (`src/app/provider/layout.tsx:5`) **and** independently per page — every provider page re-calls `requireProvider()` (verified in all 8 pages). |
| Entitlement | `src/server/services/provider-entitlement.service.ts:23` | `entitledMemberWhere(providerId)` — Provider → active `ProviderContract` → effective `ContractApplicability` INCLUDE/EXCLUDE → member's client/group. Deny-by-default (impossible filter when no rows). Used by API v1 member reads; **not** by browser portal. |

## 1. Browser provider portal (`src/app/provider/**`)

| Route | Files | Auth | Scoping (verified) | Class | Notes |
|---|---|---|---|---|---|
| `/provider` layout | `layout.tsx:5` | `requireProvider` | provider fetched by session | SAFE (as gate) | Renders `ProviderNav` (static). |
| `/provider/dashboard` | `dashboard/page.tsx:21-44` | `requireProvider` | all 3 queries `{tenantId, providerId}` | PARTIAL | No branch/permission granularity; KPIs fine. |
| `/provider/eligibility` | `eligibility/page.tsx:17-44` | `requireProvider` | **`member.findFirst({tenantId, memberNumber})` — tenant-wide, no entitlement** | **UNSCOPED (entitlement)** | Exposes name, member number, relationship, principal, scheme, package, **annual limit, total used, remaining** for ANY member in the tenant (spec gap #2, D2 violation). `benefitUsage.aggregate` unbounded by provider. |
| `/provider/claims` | `claims/page.tsx:31-44` | `requireProvider` | `{tenantId, providerId}` + status filter allowlist, take 200 | PARTIAL | Provider-scoped ✓; no branch, offset-free single page (take 200, no pagination). |
| `/provider/claims/[id]` | `claims/[id]/page.tsx:21-36` | `requireProvider` | `findFirst({id, tenantId, providerId})` → `notFound()` | PARTIAL | Hard provider scope ✓, safe not-found ✓; no branch/permission; shows raw `declineReason` strings (reason-catalog audience safety = F3/F5 scope). |
| `/provider/claims/new` (page+form) | `claims/new/page.tsx`, `ProviderClaimForm.tsx` | `requireProvider` | form → server action below | PARTIAL | |
| — action `submitProviderClaimAction` | `claims/new/actions.ts:20-106` | `requireProvider` | provider forced from session (`:71`); **member resolved tenant-wide (`:31-35`)**; canonical `runClaimIntake` with `kind:"providerUser"`; idempotency key ✓; 2-min soft duplicate block (`:48-66`) | **UNSCOPED (entitlement)** | `providerUser` channel sets `scopeMembersByEntitlement:false` (`src/server/services/claim-intake/context.ts:88`) — the documented F1.12 bypass. Rail itself is canonical (D5 ✓). |
| `/provider/cases` | `cases/page.tsx:26-45` | `requireProvider` | `{tenantId, providerId}`; recon via `CaseService.getCaseReconciliation` (same read-model as admin) | PARTIAL | A6 parity page; bounded 50. |
| `/provider/settlements` | `settlements/page.tsx:19-41` | `requireProvider` | batches+agg+vouchers all `{tenantId, providerId}` | PARTIAL | List only — no detail/remittance lines/disbursement facts (spec gap #16); base-currency display. |
| `/provider/api-keys` (page) | `api-keys/page.tsx:5-7` | `requireProvider` | `ProviderApiKeyService.list(tenantId, providerId)` | PARTIAL | Shows prefix/label/active/lastUsed only ✓. |
| — actions generate/revoke | `api-keys/actions.ts:8-47` | `requireProvider` only | provider from session; audit written | **UNSCOPED (permission)** | **Any provider user** may mint/revoke integration credentials — no `provider.api_keys.manage` equivalent (spec gap #5). Revoke swallows errors silently (`:43`). |

**Navigation:** `src/components/layouts/ProviderNav.tsx:17-25` — static 7 items (Dashboard, Eligibility, Claims, Cases, New Claim, Settlements, API Keys). No permission filtering; missing all PNOS target groups (preauth, inbox, payment queries, contracts, performance, profile, users, integrations) — spec gap #1.

## 2. B2B API (`src/app/api/v1/**`) — all `withApiKey`-gated

| Route | Verb | Scoping (verified) | Delegation | Class | Notes |
|---|---|---|---|---|---|
| `/api/v1/eligibility` | GET | provider key → `entitledMemberWhere` (`route.ts:21`); operator → `operatorTenantWhere` | direct prisma read | PARTIAL | Entitlement ✓ (E2E-D02 fix). No API scopes/expiry/branch; no durable eligibility-check evidence record (spec §7.3). |
| `/api/v1/benefits` | GET | same pattern (`route.ts:28`) | direct prisma read | PARTIAL | Same. |
| `/api/v1/claims` | POST | canonical adapter: `ClaimIntakeService.submit` (`route.ts:250`), `apiProvider` channel ⇒ `scopeMembersByEntitlement:true` (`context.ts:91`) | Claims Autopilot rail | PARTIAL | Rail canonical ✓ idempotent ✓. Missing: scopes/expiry/branch on credential. |
| `/api/v1/claims` | GET | `providerScopeWhere` + `operatorTenantWhere` (`route.ts:321+`) | direct prisma read | PARTIAL | Provider key sees own claims only. |
| `/api/v1/claims/receipts/[receiptId]` | GET | credential-scoped receipt lookup (`route.ts:22+`) | receipt store | PARTIAL | |
| `/api/v1/preauth` | POST | member via `entitledMemberWhere` (`route.ts:42`); tenant cross-check (`:60`) | **direct `prisma.preAuthorization.create` (`:72-86`)** — no receipt, no event, no SLA, no adjudication invocation; status `SUBMITTED` | **PARTIAL (rail fragmentation)** | The direct-API PA write rail (spec gap #10/#11). Collision-safe numbering via `createWithDocumentNumber` ✓. |
| `/api/v1/hms-batch` | POST | key → provider binding passed to `HmsBatchService.apply` (`route.ts:33`) | HmsBatchService | PARTIAL | Delivery-receipt/attempt control absent (spec gap #18) — F9 scope. |
| `/api/v1/sync` | POST | `withApiKey` only visible at route level; `SyncService.ingest` (`route.ts:38`) | offline sync (channel `offlineSync` ⇒ entitlement `true`, `context.ts:98`) | PARTIAL | |
| `/api/v1/upload` | POST | **any valid key** (operator or ANY provider's) | `uploadFile` → MinIO | **UNSCOPED (resource + content)** | No target authorization, no type/size validation, no Document row, returns **permanent public URL** (`src/lib/minio.ts` public-read bucket policy + URL construction). Spec gaps #7/#8. |

## 3. Provider-relevant session APIs outside `/provider`

| Route | Auth | Behavior (verified) | Class |
|---|---|---|---|
| `/api/upload` | any session (`route.ts:19-21`) | Type allowlist + 10MB cap ✓, then `prisma.document.create` with `claimId/preauthId/groupId/endorsementId` **taken from form data with zero ownership validation** (`route.ts:60-67`); stores public `fileUrl` | **UNSCOPED (target)** — gap #7 |
| `/api/claims/import` | admin session (CSV import rail) | Claims Autopilot CSV channel (`csvImport` ⇒ entitlement false, admin-side) | out of provider scope; listed for rail completeness |
| `/post-login` | session | role-based redirect (`src/app/post-login/route.ts:21`) | SAFE |

## 4. Admin-side tRPC touching provider-owned resources (`protectedProcedure`, tenant-scoped)

These are TPA/admin surfaces, not provider-facing, but they mutate resources PNOS governs — recorded because F3/F5/F7 must converge or bound them:

| Router | Provider-relevant procedures (verified head) | Note |
|---|---|---|
| `routers/preauth.ts` | `list/getById/create` → `ClaimsService.getPreAuthorizations/getPreAuthById/createPreAuth` (tenant-wide, `submittedBy:"ADMIN"`) | Second PA creation rail (gap #10). |
| `routers/providerBranches.ts` | `listBranches/createBranch/updateBranch` → direct prisma on `ProviderBranch` | Branch model EXISTS (`prisma/schema.prisma:2950`) — used for contracts, **not** user assignment. |
| `routers/providers.ts` | provider CRUD (admin) | Master-data owner F7 must route change-requests to. |
| `routers/contracts.ts`, `contractRules.ts`, `contractImport.ts`, `pricing.ts` | contract/rate admin | F7.2 read-view source of truth. |
| `routers/claims.ts` | admin claim surfaces | F5 status-consumer characterization input. |

Other PA creation rails known from the Claims Autopilot inventory (`docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md`) and `src/server/services/member-preauth.service.ts` (member self-service PA): full call-graph is F0.3's deliverable.

## 5. Provider-relevant services (`src/server/services/`)

`provider-api-key.service.ts`, `provider-contracts.service.ts`, `provider-entitlement.service.ts`, `providers.service.ts`, `preauth-adjudication.service.ts` (canonical PA decisions/holds), `member-preauth.service.ts`, `hms-batch.service.ts`, `claim-intake/**` (canonical claim rail incl. `context.ts` channel matrix), `claim-lifecycle.ts`, `case.service.ts` (provider cases recon read-model).

## 6. Existing provider-relevant tests

| Test | Covers |
|---|---|
| `tests/api/provider-preauth-scope.test.ts` | PA API scoping |
| `tests/api/provider-read-scope.test.ts` | provider key read scope (E2E-D02 regression) |
| `tests/api/api-auth-operator-key.test.ts` | BD-06 operator-key fail-closed |
| `tests/api/claims-idempotency.test.ts`, `claims-intake-validation.test.ts` | B2B claim adapter |
| `tests/integration/claim-intake-*.integration.test.ts` (13 suites) | canonical rail incl. provider/API/sync/case/preauth-conversion channels |
| `tests/integration/claim-autopilot-*.integration.test.ts` (10 suites) | autopilot decide/queue/recovery/security |

No test today covers: browser eligibility page scoping, provider api-key permission boundary, `/api/v1/upload` target authorization, branch-level anything. (F0.2's job.)

## 7. Route-count verification

`find src/app/provider -name "page.tsx"` → 8 pages (dashboard, eligibility, claims, claims/[id], claims/new, cases, settlements, api-keys) + 1 layout + 2 server-action files + 2 client components = 13 files — matches the file listing exactly; no unexplained route. API v1 = 8 route files — all listed above.

## 8. Confirmed spec-gap crosswalk (§4.2 → evidence)

| Spec gap | Status | Evidence |
|---|---|---|
| #1 nav lacks PA/inbox/remittance/contracts/profile/integrations/performance | CONFIRMED | `ProviderNav.tsx:17-25` |
| #2 browser eligibility tenant-wide + broad benefit/usage exposure | CONFIRMED | `eligibility/page.tsx:22-44` |
| #3 provider claim submission bypasses entitlement | CONFIRMED | `claims/new/actions.ts:31-35` + `claim-intake/context.ts:88` |
| #4 provider role coarse (no branch/granular permission) | CONFIRMED | `provider-portal.ts:11-23`, `rbac.ts:42` |
| #5 any provider user administers API keys | CONFIRMED | `api-keys/actions.ts:8-47` |
| #6 keys lack scopes/expiry/rotation/branch | CONFIRMED | `apiAuth.ts` + `ProviderApiKey` usage |
| #7 upload trusts target IDs post-auth | CONFIRMED | `api/upload/route.ts:60-67`; `/api/v1/upload` has no target at all |
| #8 storage public-read + direct URLs | CONFIRMED | `src/lib/minio.ts` (`ensureBucket` public `s3:GetObject` policy `Principal:*`; permanent URL construction) |
| #10 PA creation fragmented | CONFIRMED (3+ rails) | `api/v1/preauth/route.ts:72`, `trpc/routers/preauth.ts:create`, `member-preauth.service.ts`; F0.3 completes the graph |
| #16 settlement list only, no remittance detail/payment facts | CONFIRMED | `settlements/page.tsx` (list only) |
| #18 HMS pull stubbed / no delivery control | recorded | `hms-batch.service.ts` (F9.1 will detail) |
