# Provider Network Operating System — Implementation Log

One entry per completed work package, appended in order, in the spec's §24.5 result-note
format. "Implemented" or "tests pass" alone is invalid — every entry states observable
behavior, forbidden effects explicitly checked, and exact test results.

Execution model: strict dependency order from F0.1 on branch `feat/provider-network-os`
(off `feat/claims-autopilot` @ `015cb31`). Each package keeps `npm run typecheck` and its
focused tests green; `npm run brand:guard` / `npm run currency:guard` at commit
boundaries; Prisma changes only via the sanctioned db-push workflow (docs/INSTALL.md §3).
Unrelated dirty UAT worktree files are never staged. The Claims Autopilot branch and its
pending F8.2/F8.3 work are never touched from this engagement.

Result-note template (§24.5):

```text
Work package:
Status: COMPLETE | PARTIAL | BLOCKED
Proof-before-build classification:
Files changed:
Schema/data changes:
Behavior delivered:
Authorization evidence:
Idempotency/concurrency evidence:
Privacy/security evidence:
Money/reconciliation evidence:
Focused tests and results:
Typecheck/schema result:
Manual/visual evidence:
Feature-flag state:
Backfill/rollout impact:
Known limitations:
Unrelated worktree changes preserved:
Next allowed package:
Stop condition observed:
```

---

## F0.1 — Freeze the current provider route inventory

```text
Work package: F0.1
Status: COMPLETE
Proof-before-build classification: MISSING (no prior provider route inventory existed; docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md covers claim creators only)
Files changed: docs/provider-network-os/PROVIDER_ROUTE_INVENTORY.md (new); PROGRESS.md row update
Schema/data changes: none
Behavior delivered: none (read-only characterization, per package rule 5 "Do not change behavior")
Authorization evidence: every provider page/action/API's auth + scoping recorded with file:line; rubric SAFE/PARTIAL/UNSCOPED applied; 5 UNSCOPED surfaces named (browser eligibility entitlement, claim-submit member resolution, api-key admin permission, /api/v1/upload target+content, /api/upload target ownership)
Idempotency/concurrency evidence: n/a (no writes); existing idempotency facts recorded (claim action draft-UUID, B2B canonical adapter)
Privacy/security evidence: inventory §8 crosswalks spec §4.2 gaps #1-#8,#10,#16,#18 to exact code evidence; no secrets/PHI in the doc
Money/reconciliation evidence: n/a this package (F0.5 owns it)
Focused tests and results: none required by package; route-count verification via file enumeration (13 provider files, 8 API v1 routes — §7 of inventory, no unexplained route)
Typecheck/schema result: npm run typecheck PASS; npx vitest run baseline at this tree: 1124 passed / 109 skipped (142 files; skips = real-DB suites w/o AUTOPILOT_TEST_DB — expected)
Manual/visual evidence: n/a
Feature-flag state: none introduced
Backfill/rollout impact: none
Known limitations: tRPC admin routers recorded at head-level only (their full audit belongs to F0.3/F5.1/F7); build-output route comparison not run (find-based enumeration used, "where available" clause)
Unrelated worktree changes preserved: yes — uat/*, scripts/uat-*, root plan .md files remain unstaged/untouched
Next allowed package: F0.3 (F0.2 characterization tests deferred until after F0.3-F0.5 reads per dependency note below — F0.2 depends only on F0.1, but writing leak tests benefits from the F0.3/F0.4 path facts; board order kept)
Stop condition observed: yes — inventory written and reviewed; no route fixed
```

---

## F0.3 — Characterize claim and PA ownership paths

```text
Work package: F0.3
Status: COMPLETE
Proof-before-build classification: PARTIAL (claim side COVERED by docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md + guard tests — reconciled, not rebuilt; PA side was MISSING — built here)
Files changed: docs/provider-network-os/CLAIM_PA_OWNERSHIP_PATHS.md (new); PROGRESS.md row
Schema/data changes: none
Behavior delivered: none (read-only characterization; package rule "Do not refactor" observed)
Authorization evidence: per-rail auth recorded (B2B entitledMemberWhere + tenant cross-check; admin/tRPC protectedProcedure; member self+dependants scope)
Idempotency/concurrency evidence: recorded, not built — ALL 5 PA rails have NO idempotency (D26 gap; B2B retry duplicates); decision txns use inSerializableTx; PA-conversion has durable key <preauthId>:claim-create:v1; consumption inside decision tx (IPL-PA-01)
Privacy/security evidence: B2B PA rail skips fraud screen + benefit-in-package gate that other rails enforce (recorded as CONFLICTING for F3.1); no PHI in the doc
Money/reconciliation evidence: hold placement/release/consumption ownership mapped (approveByHuman always places hold; decision-tx consumption; case close/cancel guards) — conservation queries deferred to F0.5 as scoped
Focused tests and results: none required (characterization); existing per-path evidence mapped in doc §6; two named coverage holes (member 15k auto path, B2B duplicate-on-retry)
Typecheck/schema result: no code changed; tree baseline unchanged (typecheck PASS at cb28605)
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: none
Known limitations: LOU (letterOfUndertaking) lifecycle only touched where case close consumes it — full GOP/LOU characterization lands in F3.14 proof-before-build; escalation job read at excerpt level
Unrelated worktree changes preserved: yes
Next allowed package: F0.4
Stop condition observed: yes — call graph + path matrix complete; no refactor performed
```

---

## F0.4 — Characterize document storage and consumers

```text
Work package: F0.4
Status: COMPLETE
Proof-before-build classification: MISSING (no prior storage/consumer inventory; spec §7.4 target fields almost entirely absent on Document)
Files changed: docs/provider-network-os/DOCUMENT_STORAGE_MAP.md (new); PROGRESS.md row
Schema/data changes: none — bucket policy NOT touched (stop condition)
Behavior delivered: none (read-only)
Authorization evidence: per-target app-level "who is handed the URL" matrix + the overriding fact that public-read bucket makes effective viewer = anyone with the URL, unauthenticated (minio.ts:14-36); U1 accepts unvalidated target IDs (api/upload/route.ts:60-67); U2 no auth-scope/validation/record at all
Idempotency/concurrency evidence: n/a (characterization)
Privacy/security evidence: PUBLIC-READ bucket + permanent guessable URLs confirmed (gap #8); SSRF surface found (intake.parseCensusFile arbitrary-URL fetch, trpc/routers/intake.ts:58); counter-example recorded (autopilot evaluate reads metadata only). No object contents downloaded/logged (package rule)
Money/reconciliation evidence: n/a
Focused tests and results: none required; migration-count SQL drafted (§6) for later read-only run (no prod DB access from workstation)
Typecheck/schema result: no code changed
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: documented F2.7 legacy inputs + F2.9 gate blockers (9 consumer groups, break-glass on ensureBucket policy re-application)
Known limitations: row/object counts require environment DB access (queries provided, not executed); MemberHealthShare share-grant lifecycle read at model level only
Unrelated worktree changes preserved: yes
Next allowed package: F0.5
Stop condition observed: yes — inventory complete; no bucket-policy change
```

---

## F0.5 — Characterize settlement and money conservation

```text
Work package: F0.5
Status: COMPLETE
Proof-before-build classification: PARTIAL (settlement path + atomic paid-gate + existing recon invariant COVERED and shipping; ProviderDisbursement + ProviderRemittanceService + payment-query MISSING — confirmed gaps #16/#17)
Files changed: docs/provider-network-os/SETTLEMENT_MONEY_MAP.md (new); PROGRESS.md rows
Schema/data changes: none — no production mutation (stop condition)
Behavior delivered: none (read-only)
Authorization evidence: n/a this package
Idempotency/concurrency evidence: documented the shipped FG-C7 atomic exactly-once Mark-Paid gate (updateMany status guard = first write, count!=1 → rollback) — must be preserved by F6
Privacy/security evidence: n/a
Money/reconciliation evidence: full claim→decision→batch→voucher→GL path traced with file:line; the ONE paid-setter identified (markSettlementBatchPaid); existing data-integrity invariant formula captured (claim approvedAmount ↔ 1010 SETTLEMENT_PAID credits); spec D25/I5 target formula documented; frozen-example capture SQL drafted (not run — no sanctioned DB from workstation); ProviderDisbursement absence confirmed (paid = accounting state, no real reference/value-date)
Focused tests and results: none required (characterization)
Typecheck/schema result: no code changed
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: F6.7/6.8 disbursement additive; F6.9 recon extends shipped check; single-currency Phase-1 = finance decision (F6.1)
Known limitations: admin settlement pages/actions read at service level only (full admin-field parity is F6.3's proof-before-build); frozen examples require environment DB (queries provided)
Unrelated worktree changes preserved: yes
Next allowed package: F0.6
Stop condition observed: yes — path traced, baseline queries written, no disbursement added, no production mutation
```

---

## F0.2 — Characterize provider access leakage

```text
Work package: F0.2
Status: COMPLETE
Proof-before-build classification: PARTIAL — cross-provider claim/eligibility + client-entitlement + operator-span boundaries ALREADY COVERED by tests/api/provider-read-scope.test.ts, provider-preauth-scope.test.ts, api-auth-operator-key.test.ts (referenced, not duplicated); the uncovered boundaries (upload target/content, branch-scope absence) were MISSING → added
Files changed: tests/api/provider-access-characterization.test.ts (new); docs/provider-network-os/TEST_DB_HARNESS.md (new — bring-up recipe + seed-gap findings); PROGRESS.md row
Schema/data changes: none
Behavior delivered: none (characterization only, per stop condition "do not implement fixes")
Authorization evidence: UPLOAD — any valid provider key uploads with an unrelated/foreign claimId as target with NO authorization and NO Document row (characterization → flips at F2.3/F2.4); BRANCH — entitledMemberWhere has no branch dimension in signature or where-fragment (→ F1.3 ProviderAccessContext.allowedProviderBranchIds); PERMISSION — characterized structurally in PROVIDER_ROUTE_INVENTORY (rbac import pulls next-auth graph that won't resolve under jsdom; noted, deferred to F1.1 seed test)
Idempotency/concurrency evidence: n/a (read/probe)
Privacy/security evidence: upload accepts arbitrary MIME + no size cap (public URL) — pinned as red line for F2; no PHI/secrets in fixtures (synthetic ids)
Money/reconciliation evidence: n/a
Focused tests and results: npx vitest run tests/api/provider-access-characterization.test.ts → 4 passed. Mock-based (prisma/minio/apiAuth seams), CI-safe, no DB dependency — matches tests/api/ convention
Typecheck/schema result: npx tsc --noEmit → exit 0
Manual/visual evidence: n/a (API/service layer)
Feature-flag state: none
Backfill/rollout impact: none. Also stood up the reusable throwaway PG16 harness (TEST_DB_HARNESS.md) — surfaced that the seed has 0 branches/contracts/applicability/provider-users, so F0.6 fixtures must build all provider infra themselves
Known limitations: RSC page-level auth (requireProvider) not unit-tested here (needs next-auth session mock — deferred to F11.1 security suite + F1 page migrations); settlement boundary is a page not an API, characterized in SETTLEMENT_MONEY_MAP instead
Unrelated worktree changes preserved: yes
Next allowed package: F0.6
Stop condition observed: yes — reproducible evidence captured, no fixes implemented
```

---

## F0.6 — Create deterministic provider test fixtures

```text
Work package: F0.6
Status: COMPLETE
Proof-before-build classification: MISSING — no DB-factory convention existed (claims-autopilot fixtures are pure oracle objects; integration suites use seed findFirstOrThrow). Established a new factory.
Files changed: tests/factories/provider-network.ts (new), tests/factories/provider-network.smoke.test.ts (new); PROGRESS.md rows
Schema/data changes: none (test-only creates; direct model creates are TEST_ONLY per CLAIM_CREATOR_INVENTORY §2 — outside runtime allowlist by design)
Behavior delivered: buildProviderWorld(prisma) → 2 tenants (Alpha UGX / Beta KES), providers A+B in Alpha + C in Beta, branches A1/A2/B1/C1 (rows only — no user→branch assignment; that field lands F1.2), client/group/package/version/benefit per tenant, active+inactive members, 6 persona provider users + provider-B + provider-C + suspended (all coarse PROVIDER_USER), contracts ACTIVE/EXPIRED/future-APPROVED, INCLUDE + EXCLUDE applicability. Namespaced per run token; idempotent teardown in FK order; no shared mutable state.
Authorization evidence: smoke test drives the REAL ProviderEntitlementService against real applicability rows — A sees INCLUDEd Alpha client, denies the EXCLUDEd group and cross-tenant Beta member; B sees only its group-level INCLUDE. This is the F1.8/F1.10/F1.11 exercise substrate.
Idempotency/concurrency evidence: teardown idempotent (second call resolves, asserted); per-run token prevents parallel collision
Privacy/security evidence: synthetic data only; placeholder passwordHash is not a login target
Money/reconciliation evidence: n/a (claim/settlement rows deferred — added by the tests that need them via canonical services)
Focused tests and results: AUTOPILOT_TEST_DB set → 3 passed (build, entitlement, teardown) on throwaway PG16; unset → 3 skipped (CI-safe). Full suite 1128 passed / 112 skipped (no regression vs 1124/109 baseline + F0.2's 4 + F0.6's 3 skips)
Typecheck/schema result: npx tsc --noEmit → exit 0; brand:guard PASS; currency:guard PASS (662 files)
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: none. Grounded every model's required fields via a schema scan before writing (caught Client.type/slug, Member.gender, Provider.type) — recipe in TEST_DB_HARNESS.md
Known limitations: no claim/PA/settlement rows in the base graph (spec lists them, but they belong to the canonical services the consuming tests call; adding a direct-create claim helper deferred until an F5/F6 test needs it); branch-assignment dimension intentionally absent until F1.2 schema
Unrelated worktree changes preserved: yes
Next allowed package: F1.1 — Define and seed provider permission catalog (phase F1 begins; additive schema + code, flags default OFF)
Stop condition observed: yes — fixtures + smoke complete, no feature implementation
```

---

# Phase F0 COMPLETE (2026-07-23)

All six baseline/characterization packages done: provider route inventory, access-leakage characterization, claim/PA ownership graph, document storage map, settlement money map, deterministic fixtures. Evidence: `PROVIDER_ROUTE_INVENTORY.md`, `CLAIM_PA_OWNERSHIP_PATHS.md`, `DOCUMENT_STORAGE_MAP.md`, `SETTLEMENT_MONEY_MAP.md`, `TEST_DB_HARNESS.md`, `tests/api/provider-access-characterization.test.ts`, `tests/factories/provider-network.*`. No product behavior changed; no schema changed; branch isolated from Claims Autopilot. **F1 next — first schema/code changes.**

> **Working location note:** from F1.1 the engagement runs inside the git worktree `.claude/worktrees/pnos` (concurrent claims-autopilot session shares the main checkout HEAD). Run vitest there with `--config ./vitest.worktree.config.ts` (a local, un-committed override that drops the `**/.claude/worktrees/**` exclude which would otherwise hide the worktree's own tests). All Write/Edit paths must be worktree-prefixed.

---

## F1 — Provider access and entitlement foundation

## F1.1 — Define and seed provider permission catalog

```text
Work package: F1.1
Status: COMPLETE
Proof-before-build classification: MISSING (no provider permissions/roles in the dynamic RBAC — provider users are gated only by requireProvider + UserRole.PROVIDER_USER; PROVIDER_USER was absent from ROLE_CODES/ROLE_PERMISSIONS entirely)
Files changed: prisma/seeds/provider-rbac.ts (new — pure catalog + bundles), prisma/seeds/rbac.ts (additive merge: PERMISSIONS.push + Object.assign ROLE_PERMISSIONS + ROLE_CODES spread), tests/services/provider-rbac-catalog.test.ts (new), scripts/pnos-map-provider-users.ts (new — explicit legacy mapping), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: NO schema change (uses existing Role/Permission/RolePermission/UserRoleAssignment). Seed DATA additively adds 22 provider permissions + 7 provider roles (6 persona + 1 deprecated PROVIDER_LEGACY). Idempotent (upsert). No backfill auto-runs — provider-user→role mapping is an explicit report-by-default script.
Behavior delivered: the §7.1 provider permission catalog and §2.4 least-privilege persona bundles now seed into the dynamic RBAC on every tenant (main seed + TenantProvisioningService.provisionTenant both call seedRbac, which now merges these). rbacService.hasPermission("provider.*") is now answerable. NO route wired to them yet (stop condition).
Authorization evidence: pure test asserts the deny matrix (front desk: no settlement/api-keys/clinical-respond; finance: no clinical; integration admin: no settlement/claim; etc.) and that every bundle contains ONLY provider.* codes. DB test proves PROVIDER_BILLER resolves only provider.* and CLAIMS_OFFICER resolves ZERO provider.* (boundary both directions). Provider boundary checks left independent of role (D4 — requireProvider untouched).
Idempotency/concurrency evidence: DB test runs seedRbac twice → permission count and role-permission count unchanged (upsert idempotent).
Privacy/security evidence: PROVIDER_LEGACY flagged deprecated + excluded from PROVIDER_PERSONA_ROLE_CODES; it intentionally preserves today's reach (incl. api_keys.manage, gap #5) so enabling enforcement later doesn't lock users out before F1.5 re-maps them — documented in-file.
Money/reconciliation evidence: n/a
Focused tests and results: npx vitest run --config ./vitest.worktree.config.ts tests/services/provider-rbac-catalog.test.ts → pure 6/6 (no DB); with AUTOPILOT_TEST_DB → 7/7 (incl. idempotency + boundary). Full suite 1134 passed / 113 skipped (was 1128/112 — +6 pure, +1 DB-gated). tsc exit 0; brand:guard PASS; currency:guard PASS (662 files). Mapping script report-mode runs clean (0 provider users in throwaway).
Typecheck/schema result: tsc exit 0; no prisma schema change (npx prisma db push not needed)
Manual/visual evidence: n/a (seed/RBAC layer)
Feature-flag state: none — seeding a catalog is inert until a route checks it (later packages, behind the F1 flags)
Backfill/rollout impact: seedRbac upserts are safe to re-run on existing envs to add the provider catalog. Existing provider users get NO role until scripts/pnos-map-provider-users.ts --apply is run (reviewed) — deliberately deferred so nothing changes behavior now.
Known limitations: PROVIDER_LEGACY over-grants relative to persona least-privilege by design (temporary); real per-user persona assignment + api-key permission gating land in F1.5. Route enforcement is F1.4+.
Unrelated worktree changes preserved: yes. NOTE: F1.1 files were first written to the main checkout by path error, then relocated to the worktree and the main checkout restored to pristine (git restore rbac.ts + removed 3 new files) — verified clean.
Next allowed package: F1.2 — Add provider branch assignments (additive schema; needs prisma db push to the throwaway)
Stop condition observed: yes — catalog seeded + tested; NO routes wired
```

---

## F1.2 — Add provider branch assignments

```text
Work package: F1.2
Status: COMPLETE
Proof-before-build classification: MISSING (grep confirmed no user↔branch assignment concept anywhere; ProviderBranch existed only for contracts/tariffs/claims)
Files changed: prisma/schema.prisma (new model ProviderUserBranchAssignment + 4 additive back-relations on Tenant/Provider/User/ProviderBranch), src/server/services/provider-branch-assignment.service.ts (new), tests/services/provider-branch-assignment.test.ts (new), tests/factories/provider-network.ts (teardown now clears assignments + this world's AuditLog rows before deleting users), scripts/pnos-backfill-branch-assignments.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive model + indexes via prisma db push to the throwaway (validated, "in sync", no data loss). No migration file (repo is db-push managed, INSTALL §3). No production DB touched. Client regenerated into the shared node_modules/.prisma (superset — harmless to the concurrent claims-autopilot session, which never references the model).
Behavior delivered: ProviderBranchAssignmentService.{assign,retire,activeAssignmentsForUser,activeBranchIdsForUser,listAllForUser}. Full server-side scope validation (branch∈tenant/provider, user∈tenant & bound to provider), overlapping-active-duplicate rejection, soft-retire with audit facts on the row + an AuditLog row (written inline, not via headers-bound writeAudit, so it runs in tests/scripts/jobs). activeBranchIdsForUser is the scope primitive F1.3 ProviderAccessService will consume. NOTHING reads it yet (stop condition).
Authorization evidence: tests prove cross-provider denied two ways (BRANCH_NOT_IN_SCOPE when branch∉provider; USER_PROVIDER_MISMATCH when user not bound to provider), overlapping active duplicate → DUPLICATE_ACTIVE, retire scoped by tenant (NOT_FOUND otherwise). Scope is caller-supplied trusted context, never a request body (D1).
Idempotency/concurrency evidence: retire is idempotent (already-retired row returned unchanged, no second audit). Re-assignment after retirement is allowed (test) — retirement genuinely frees the active slot.
Privacy/security evidence: audit metadata carries ids only (no PHI). Overlap rule enforced in service (partial-unique-on-null not portable — documented in schema).
Money/reconciliation evidence: n/a
Focused tests and results: npx vitest run --config ./vitest.worktree.config.ts (AUTOPILOT_TEST_DB set) tests/services/provider-branch-assignment.test.ts → 7 passed; co-run with the F0.6 smoke → 2 files/10 passed (factory teardown fix verified). Full suite (no DB) 1134 passed / 120 skipped (was 1134/113 — +7 F1.2 DB-gated skips). tsc exit 0; brand:guard PASS; currency:guard PASS (663 files). Backfill script report-mode runs and correctly classifies assignable vs review users.
Typecheck/schema result: tsc exit 0; prisma validate OK; db push in sync
Manual/visual evidence: n/a (service/schema layer)
Feature-flag state: none (inert until F1.3 reads it)
Backfill/rollout impact: existing envs need `prisma db push` to add the table, then the reviewed `scripts/pnos-backfill-branch-assignments.ts` (report-by-default; --apply assigns each provider user to all their provider's active branches; ambiguous users — no providerId / inactive / provider with 0 branches — reported REVIEW, never auto-assigned).
Known limitations: overlap detection covers same-tuple open/future-open rows (not arbitrary interval intersection) — sufficient for the "one open assignment per user+branch" invariant. Session revocation on last-branch removal is policy for F1.3/F1.5, not enforced here.
Unrelated worktree changes preserved: yes (all edits worktree-prefixed; main checkout untouched)
Next allowed package: F1.3 — Build canonical ProviderAccessService (M; wraps requireProvider, loads permissions + branch scope, proves on ONE route)
Stop condition observed: yes — schema+service+tests+backfill done; NO provider pages/routes updated
```

---

## F1.3 — Build canonical ProviderAccessService

```text
Work package: F1.3
Status: COMPLETE
Proof-before-build classification: MISSING (no unified access-context resolver; requireProvider returns {session,provider,providerId,tenantId} with no permissions/branch scope and no isActive check)
Files changed: src/server/services/provider-access.service.ts (new), tests/services/provider-access.service.test.ts (new), src/app/provider/dashboard/page.tsx (ONE proof route migrated), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: ProviderAccessContext (§6.5) + resolvers + pure helpers. buildUserContext (testable core) validates user active + in-tenant + bound-to-claimed-provider, then loads permissions from the RBAC owner (F1.1) and active branch ids from ProviderBranchAssignmentService (F1.2) into one context. resolveUserContext wraps requireProvider (preserving login/role/provider redirects) then enriches. Helpers: hasPermission/requirePermission, hasBranch/requireBranch (empty set denies), assertProviderOwned, narrowToBranches (shrink-only). buildCredentialContext is a deny-by-default stub for API keys (scopes/branches filled in F1.6/F1.7). Composes existing owners only — owns no eligibility/PA/claim decision (§6.2).
Authorization evidence: pure tests — permission check independent of branch (has perm, empty branches still denies branch-scoped), empty/forged branch denied, assertProviderOwned rejects other provider, narrow never widens, credential ctx empty scopes. DB tests — denies inactive (USER_INACTIVE), denies user-not-bound-to-claimed-provider (FORBIDDEN_PROVIDER, the anti-forge case), safe NOT_FOUND for cross-tenant user, empty branch set for unassigned user, and correct assembly of F1.1 perms + F1.2 branches. Scope is server-derived; the session's serialized permissions array is treated as a cache, not authority (loaded fresh from RBAC).
Idempotency/concurrency evidence: n/a (read-only resolver + pure helpers)
Privacy/security evidence: NOT_FOUND is returned identically for absent and out-of-tenant users (§9.1 — no existence leak). Context is not serialized to the browser as authority. requireProvider (→ next-auth) is dynamically imported inside resolveUserContext ONLY, so the testable core imports without dragging next/server under jsdom.
Money/reconciliation evidence: n/a
Focused tests and results: npx vitest run --config ./vitest.worktree.config.ts tests/services/provider-access.service.test.ts → pure 5/5 (no DB); with AUTOPILOT_TEST_DB → 10/10 (incl. inactive/mismatch/not-found/assembly). Full suite (no DB) 1139 passed / 125 skipped (was 1134/120 — +5 pure, +5 DB-gated). tsc exit 0; brand:guard PASS; currency:guard PASS (664 files).
Typecheck/schema result: tsc exit 0
Manual/visual evidence: dashboard proof route migrated (requireProvider → ProviderAccessService.resolveUserContext). Browser QA deferred by design: the change is behavior-neutral (identical provider/tenant values + identical queries) and the page requires an authenticated provider session the seed does not contain; tsc + the service tests are the proof.
Feature-flag state: none (resolver is additive; only the dashboard reads it, with unchanged output)
Backfill/rollout impact: none
Known limitations: only ONE route migrated (stop condition) — layout/nav + remaining pages are F1.4+. API_KEY/CONNECTOR context is a documented deny-by-default stub until F1.6/F1.7. No session-id is exposed by auth, so sessionId currently mirrors the user id.
Unrelated worktree changes preserved: yes (all edits worktree-prefixed)
Next allowed package: F1.4 — Migrate provider layout/navigation guards (S)
Stop condition observed: yes — service + tests + exactly one proof route; no further routes migrated
```

---

## F1.4 — Migrate provider layout/navigation guards

```text
Work package: F1.4
Status: COMPLETE
Proof-before-build classification: PARTIAL (layout was an async RSC calling requireProvider; ProviderNav was a hardcoded static NAV_ITEMS list with no permission filtering). Checked node_modules/next/dist/docs/ per AGENTS.md — the directory does NOT exist in this install (next 15.5.15); followed the established in-repo pattern (async RSC layout + "use client" nav) as the authoritative signal.
Files changed: src/components/layouts/provider-nav-model.ts (new — pure), src/components/layouts/ProviderNav.tsx (now renders a passed permission-filtered item list; iconKey→component map), src/app/provider/layout.tsx (resolves ctx via ProviderAccessService, computes nav server-side), tests/components/provider-nav-model.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: navigation is computed server-side from ctx.permissions (computeProviderNav) and only a browser-safe {key,label,href,iconKey} list crosses to the client. Grouped per §10.1 order; ONLY existing routes emitted (unfinished routes never appear). Legacy fallback: a user with no provider.* permission sees the full current working set (identical to today's nav) so the portal is not blanked before F1.9 assigns persona roles; a user WITH provider permissions is filtered precisely (Home always shown).
Authorization evidence: 9 pure tests — finance/biller/front-desk/admin/integration personas each get the correct subset; legacy/TPA-only users get the full set; unfinished routes never emitted; emitted items carry NO permission/provider/branch field (only key/label/href/iconKey). requireProvider (inside resolveUserContext) still performs login/role/unauthorized redirects — hiding a nav item is convenience, not security; each page stays independently server-guarded (unchanged by this package).
Idempotency/concurrency evidence: n/a (pure render model)
Privacy/security evidence: context is NOT serialized to the browser (§6.5) — asserted by the item-shape test. Navigation hiding is explicitly not the boundary.
Money/reconciliation evidence: n/a
Focused tests and results: npx vitest run --config ./vitest.worktree.config.ts tests/components/provider-nav-model.test.ts → 9 passed. Full suite (no DB) 1148 passed / 125 skipped (was 1139/125 — +9). tsc exit 0 (also confirms ProviderNav has exactly one consumer, the layout, with the new signature); brand:guard PASS; currency:guard PASS (665 files).
Typecheck/schema result: tsc exit 0
Manual/visual evidence: browser QA deferred by design — for a legacy user computeProviderNav returns all 7 items and ProviderNav preserves the exact prior classNames/order, so the rendered bar is byte-identical to before; and there is no seeded provider session to authenticate headlessly. tsc + the 9 unit tests are the proof; permission-filtered rendering activates only once a user holds provider roles.
Feature-flag state: none — the legacy fallback (no provider.* perms ⇒ full nav) is the rollout gate; no behavior flips until users are assigned persona roles (F1.9).
Backfill/rollout impact: none directly; filtered nav takes effect per-user as F1.9 assigns roles.
Known limitations: horizontal bar renders the flattened item list (group headers not shown as dropdowns) — grouped-dropdown UX is a later presentation package; the group structure is already computed. Per-page permission gating is NOT added here (later per-page migrations) — F1.4 only governs nav visibility.
Unrelated worktree changes preserved: yes
Next allowed package: F1.5 — Harden provider user administration and offboarding (M)
Stop condition observed: yes — nav renders from permissions; unfinished routes absent; no per-page gates added
```

---

## F1.5 — Harden provider user administration and offboarding

```text
Work package: F1.5
Status: COMPLETE
Proof-before-build: existing invite flow is TPA-admin-only (settings/actions.ts inviteUserAction/updateUserAccessAction, ROLES.ADMIN_ONLY) creating raw User.role+providerId; no provider-side self-administration; session revocation = User.sessionVersion bump (auth.ts invalidates stale sessions within ~15s cache TTL). Classification: PARTIAL (TPA invite exists; provider-scoped admin + guardrails MISSING).
Files changed: src/server/services/provider-user-admin.service.ts (new), tests/services/provider-user-admin.service.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none (reuses RBAC UserRoleAssignment + F1.2 branch assignments + User.isActive/sessionVersion)
Behavior delivered: ProviderUserAdminService.{assignRole,revokeRole,assignBranches,suspendUser,reactivateUser} — all actor authority from the F1.3 ctx (provider.users.manage). assignRole only grants PROVIDER_PERSONA roles (TPA/SUPER_ADMIN/PROVIDER_LEGACY rejected FORBIDDEN_ROLE), only to own-provider users (cross-provider FORBIDDEN_PROVIDER), idempotent. suspendUser deactivates + bumps sessionVersion (revokes live session) + retires all active branch assignments. Last-admin safeguard blocks suspending/demoting the final provider.users.manage holder. PHI-free audit on every mutation.
Authorization evidence: 6 DB tests — TPA/legacy role grant denied; cross-provider denied (assign + suspend); non-manage actor denied (FORBIDDEN_PERMISSION); suspend revokes session (sessionVersion+1, isActive false) + retires 2 branches; last-admin blocked then released once a 2nd admin exists; grant idempotent (replay = same assignment id).
Idempotency/concurrency evidence: assignRole/assignBranches idempotent; revoke via updateMany conditional.
Privacy/security evidence: audit metadata = ids/roleCode/counts only. MFA enforced upstream (requireRole mustEnrollTotp) — documented, not re-implemented.
Money/reconciliation evidence: n/a
Focused tests and results: 6/6 (opt-in DB). Full suite (no DB) 1148 passed / 131 skipped (+6 DB-gated). tsc 0; brand PASS; currency PASS (666 files).
Feature-flag state: none (service is additive; no route wired to it yet — provider-side admin UI is a later presentation package)
Known limitations: no provider-admin UI built here (service + invariants only); "invitation replay after expiry/use" maps to grant-idempotency in the current password-invite model (no separate invite token exists). Per-route wiring deferred.
Next allowed package: F1.6 — Extend API keys with scope, expiry, branch, rotation (M)
Stop condition observed: yes — no profile/master-data changes
```

---

## F1.6 — Extend API keys with scope, expiry, branch, rotation

```text
Work package: F1.6
Status: COMPLETE
Proof-before-build: ProviderApiKey had only label/prefix/hash/isActive/lastUsedAt; verify() checked isActive only. ProviderApiKeyService.generate/verify/list/revoke existed. Classification: PARTIAL (credential exists; least-privilege/expiry/rotation/health MISSING).
Files changed: prisma/schema.prisma (ProviderApiKey additive: scopes, allowedBranchIds, expiresAt, lastSuccessAt/lastFailureAt, rotationFamilyId, previousKeyId, revokedById, revokeReason, allowedIpPolicyRef + 2 indexes), src/server/services/provider-api-key.service.ts (extended), src/lib/apiAuth.ts (ApiCredential provider variant now carries scopes/allowedBranchIds), src/lib/provider-api-scopes.ts (new — scope catalog + route→scope map + permissionsAllowKeyAdmin), src/app/provider/api-keys/actions.ts (gap #5: admin gated behind provider.api_keys.manage, legacy-aware), tests/services/provider-api-key.service.test.ts (new), 3 existing api tests updated for the additive credential type, PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive via db push (validated, in sync, no data loss). No prod DB.
Behavior delivered: generate(scopes/allowedBranchIds/expiresAt/family); verify() rejects expired keys (hard gate) + records success/failure health + returns scopes/branches; overlap-safe rotate() (successor inherits scopes/branches/family, predecessor expiresAt=cutoff so both valid during overlap, only successor after); revoke() records actor+reason; list() safe projection (no hash/plaintext). Route→scope catalog is data for F1.7. api-keys admin action now requires provider.api_keys.manage (legacy users unaffected). hasScope/allowsBranch pure helpers for F1.7.
Authorization evidence: DB — plaintext returned once, never in row/list; expired key → verify null; revoked key → verify null (+ reason stored); rotation overlap/cutoff proven with time-parameterized verify. Pure — hasScope (unscoped permissive / scoped exact), allowsBranch (empty unrestricted / listed only), permissionsAllowKeyAdmin (legacy allowed, migrated needs manage).
Idempotency/concurrency evidence: n/a (each generate is a new credential by design); rotation is a single explicit action.
Privacy/security evidence: only bcrypt hash stored; list() select excludes keyHash; §7.2 "never plaintext after creation" upheld (test asserts absence). Scope enforcement per route deferred to F1.7 (catalog shipped).
Money/reconciliation evidence: n/a
Focused tests and results: 7/7 (3 pure + 4 DB). Full suite (no DB) 1151 passed / 135 skipped (+3 pure, +4 DB-gated). tsc 0 (fixed 3 pre-existing api tests for the additive credential type); brand PASS; currency PASS (667).
Feature-flag state: none — additive; keys default to empty scopes (unscoped/legacy) so existing integrations keep working until F1.7 requires scopes per route.
Known limitations: scope/branch ENFORCEMENT on routes is F1.7 (this ships the fields + catalog + helpers only). api-keys UI still submits label only — scope/expiry selection is a later UI package (service supports it). IP allowlist field present but unused.
Next allowed package: F1.7 — Enforce API scopes route by route (S per group; do ONE group)
Stop condition observed: yes — did NOT migrate all API routes
```

---

## F1.7(a) — Enforce API scopes: eligibility group

```text
Work package: F1.7 (route group (a): eligibility — ONE group only, per stop condition)
Status: COMPLETE for group (a); F1.7(b..) remain (benefits/preauth/claims/upload/remittance/hms-batch) as separate future units
Proof-before-build: /api/v1/eligibility (withApiKey → getApiCredential → entitledMemberWhere/operatorTenantWhere → member). No scope check existed. F1.6 shipped the catalog + hasScope. Classification: PARTIAL→extend.
Files changed: src/lib/apiAuth.ts (providerScopeError helper), src/app/api/v1/eligibility/route.ts (enforce ROUTE_SCOPE_CATALOG.eligibility), tests/api/provider-api-scope-eligibility.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: eligibility route rejects a scoped provider key lacking api.eligibility.read with 403 FORBIDDEN_SCOPE, BEFORE any member query. Unscoped legacy keys pass (no silent break); operator keys exempt. Branch constraint N/A for eligibility (no branch in the request) — allowsBranch will be applied by route groups that carry a branch (F3/F5).
Authorization evidence: 4 mock tests — correct scope 200; wrong scope 403 + members never queried; unscoped legacy 200; operator 200.
Idempotency/concurrency evidence: n/a (read)
Privacy/security evidence: denial precedes data access; safe error envelope (code FORBIDDEN_SCOPE, requiredScope) with no internal detail.
Money/reconciliation evidence: n/a
Focused tests and results: 4/4. Full suite 1155 passed / 135 skipped (+4). tsc 0; brand PASS; currency PASS.
Feature-flag state: none — legacy-permissive by the F1.6 hasScope design; tightens as keys gain scopes.
Known limitations: only the eligibility group enforced (stop condition). Other groups (benefits, preauth.submit, claims.submit/read, upload, hms-batch) each become their own F1.7(x) unit reusing providerScopeError + ROUTE_SCOPE_CATALOG.
Next allowed package: F1.8 — Audit applicability data readiness (M)
Stop condition observed: yes — exactly one route group.
```

---

## F1.8 — Audit applicability data readiness

```text
Work package: F1.8
Status: COMPLETE
Proof-before-build: ProviderEntitlementService reads ProviderContract→ContractApplicability; no readiness report existed. MISSING.
Files changed: src/server/services/provider-applicability-readiness.service.ts (new), scripts/pnos-applicability-readiness.ts (new), tests/services/provider-applicability-readiness.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none — READ-ONLY report (stop condition: no enforcement)
Behavior delivered: classifyApplicability (pure, priority-ordered: INACTIVE_PROVIDER → ORPHANED_RULES → CONTRADICTORY → NO_ACTIVE_CONTRACT → MISSING_APPLICABILITY → COMPLETE) + report() gathering per-provider summaries (active/expired/future contracts, effective INCLUDE/EXCLUDE, contradictions, orphans) with control totals + gateReady flag. Script prints repair-input grouped by classification. This is the network-ops sign-off artifact for the D3 gate (F1.9/F1.11).
Authorization evidence: n/a (read-only report; no actor mutation)
Idempotency/concurrency evidence: rerunnable; DB test asserts row counts unchanged after report.
Privacy/security evidence: report carries ids/counts/classification only (no member/PHI). Produces safe repair input, never auto-assumptions (spec F1.8 step 5).
Money/reconciliation evidence: control totals sum to reported provider count (asserted).
Focused tests and results: 8/8 (6 pure classifier + 2 DB: factory A/B/C COMPLETE with EXCLUDE/expired/future counted + read-only; retiring B's INCLUDE flips B to MISSING_APPLICABILITY + gateReady false). Full suite 1161 passed / 137 skipped (+6 pure, +2 DB). tsc 0; brand PASS; currency PASS (668). Script smoke prints totals.
Feature-flag state: none
Known limitations: "define required relationship set WITH network operations" + "spot-check with contract owners" are human review steps — the report is the input to them, not a substitute. Package/benefit-level completeness beyond client/group INCLUDE is not scored (client-level is the entitlement key today).
Next allowed package: F1.9 — Backfill applicability through reviewed inputs (GATED: needs network-ops signed input; build mechanism + dry-run, do NOT --apply)
Stop condition observed: yes — no enforcement.
```

---

## F1.9 — Backfill applicability through reviewed inputs (mechanism BUILT; prod apply GATED)

```text
Work package: F1.9
Status: COMPLETE (mechanism + tests). PROD --apply GATED on network-ops signed input — NOT run against any real data (D3/spec F1.9 step 1). Tested against the throwaway only.
Proof-before-build: F1.8 report identifies gaps; no backfill mechanism existed. MISSING.
Files changed: src/server/services/provider-applicability-backfill.service.ts (new: dryRun/apply/retire + ReviewedApplicabilityRow), tests/services/provider-applicability-backfill.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none (writes ContractApplicability rows only on explicit --apply against signed input; none run on real data). Uses existing model.
Behavior delivered: dryRun classifies every row (VALID/ALREADY_EXISTS/MISSING_CLIENT/INVALID_PROVIDER|CONTRACT|CLIENT|GROUP|PACKAGE|INPUT), writes nothing; apply writes only VALID rows idempotently with audit; retire rolls back via additive isActive=false (never delete). Full reference validation (provider∈tenant, contract∈provider & ACTIVE, client/group/package resolve). NO all-clients default — a row without clientId is MISSING_CLIENT.
Authorization evidence: n/a (operator/ops tool; actorId recorded on audit). Real apply requires signed input (human gate).
Idempotency/concurrency evidence: apply rerun → ALREADY_EXISTS, applied 0 (test).
Privacy/security evidence: audit metadata = ids/inclusionType only. Rollback retains rows (evidence never erased, D28).
Money/reconciliation evidence: row conservation — dryRun counts sum to input total (test).
Focused tests and results: 3/3 DB (dry-run conservation + no-all-clients + nothing-written; idempotent apply; retire=retire-not-delete). Full suite 1161 passed / 140 skipped (+3 DB). tsc 0; brand PASS; currency PASS (669).
Feature-flag state: n/a — gated by process (signed input), not a flag.
Known limitations: production run pending network-ops signed batch (the F1.8 report is the input). A CLI wrapper reading a JSON batch file can be added when the first signed batch exists.
Next allowed package: F1.10 — Add entitlement shadow comparison (M)
Stop condition observed: yes — one mechanism, no real-data apply.
```

---

## F1.10 — Add entitlement shadow comparison

```text
Work package: F1.10
Status: COMPLETE
Proof-before-build: ProviderEntitlementService exists; no shadow/telemetry. MISSING.
Files changed: prisma/schema.prisma (ProviderEntitlementShadowSample — relation-less, safe fields only), src/server/services/provider-entitlement-shadow.service.ts (new), tests/services/provider-entitlement-shadow.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive model via db push (validated, in sync). No relations added to other models.
Behavior delivered: classifyShadow (pure: AGREE_ALLOW/AGREE_DENY/TARGET_DENY_CURRENT_ALLOW/TARGET_ALLOW_CURRENT_DENY/ERROR) + shadowCompareMemberLookup (runs target entitlement beside today's tenant-only lookup, records a safe sample, returns classification) + metrics(). NEVER throws to the caller (both the query and the record are wrapped) and NEVER changes the live response. Enforcement stays OFF.
Authorization evidence: n/a (observational). It reads the same entitlement the gate will enforce.
Idempotency/concurrency evidence: deterministic at a fixed service date (test).
Privacy/security evidence: sample row has NO memberId/memberNumber (test asserts absent keys); only tenant/provider/client/branch/date/classification. clientId is a safe identifier.
Money/reconciliation evidence: n/a
Focused tests and results: 4/4 (pure classifier; failure-injection ⇒ ERROR not throw; DB divergence AGREE_ALLOW vs TARGET_DENY_CURRENT_ALLOW; deterministic + PHI-free sample + metrics). Full suite 1163 passed / 142 skipped (+2 pure/inject, +2 DB). tsc 0; brand PASS; currency PASS (670).
Feature-flag state: enforcement OFF (spec stop condition) — this only observes.
Known limitations: not yet wired INTO the live eligibility path (that call site is added in F1.11 in shadow-then-enforce order). The service is ready to be invoked fire-and-forget.
Next allowed package: F1.11 — Make provider browser eligibility canonical (GATED: D3 readiness-gate approval; build flagged code OFF, do NOT flip enforcement)
Stop condition observed: yes — enforcement flag remains off.
```

> **Test run-mode landmine (F1.11):** NEVER run the FULL vitest suite with AUTOPILOT_TEST_DB set — the many DB-integration suites (claims-autopilot, benefit-race, PNOS) are not hermetic under parallelism against one throwaway DB and collide (saw 12 spurious failures). Standard regression = full suite WITHOUT the DB env (DB suites skip). Focused DB suites = WITH the env + `--no-file-parallelism`.

---

## F1.11 — Make provider browser eligibility canonical (BUILT; enforcement GATED OFF)

```text
Work package: F1.11
Status: COMPLETE (canonical service + evidence + flag + page wired). Deny-by-default entitlement ENFORCEMENT defaults OFF and is flipped per tenant/provider ONLY via the D3 readiness sign-off — NOT flipped here.
Proof-before-build: EligibilitySnapshot is an offline-pack balance cache (balances Json, offline validity) — §7.3 says do not overload it → ADDED ProviderEligibilityCheck. Tenant.config JSON is the flag store (TenantSettingsService pattern). Browser eligibility (eligibility/page.tsx) did tenant-only member search + exposed annual limit/used/remaining (gap #2 / D2).
Files changed: prisma/schema.prisma (ProviderEligibilityCheck, relation-less), src/server/services/provider-access-settings.service.ts (new — flag reader, default OFF), src/server/services/provider-eligibility.service.ts (new — canonical check), src/app/provider/eligibility/page.tsx (rewired to the service, data minimised), tests/services/provider-eligibility.service.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive ProviderEligibilityCheck via db push (in sync). No prod DB.
Behavior delivered: ProviderEligibilityService.check resolves via the F1.3 ctx, records a point-in-time evidence row, returns a MINIMUM safe result (name, eligible, scheme/package, PA flag, disclaimer) — NO annual limit/usage (D2/§8.1 privacy fix, applied regardless of the flag). Flag OFF (default) = today's permissive tenant-only resolution + shadow sample (F1.10); flag ON (per tenant/provider) = entitlement-scoped + branch must be in ctx, out-of-scope member → safe NOT_ELIGIBLE with no enumeration. Every result carries a not-a-payment-guarantee disclaimer. Eligibility page now delegates to the service.
Authorization evidence: 5 tests — flag parser default OFF + garbage-tolerant + per-provider list; OFF permissive + evidence-not-guarantee + no annual-limit in payload; ON EXCLUDEd member → NOT_ELIGIBLE no member details; ON branch-not-in-context → OUT_OF_NETWORK; ON cross-tenant → safe not-found.
Idempotency/concurrency evidence: n/a (read + evidence append)
Privacy/security evidence: response minimised (no limit/used/remaining — asserted absent); safe not-found for out-of-scope (no enumeration); evidence row carries member/client ids + safe result code only (no DOB/diagnosis/utilization).
Money/reconciliation evidence: n/a
Focused tests and results: 5/5 (opt-in DB). Full suite (no DB env) 1164 passed / 146 skipped (+1 pure flag-parse, +4 F1.11 DB). tsc 0; brand PASS; currency PASS (672).
Feature-flag state: providerAccess.entitlementEnforcement in Tenant.config — DEFAULT OFF (global + per-provider list). Flipping ON is the D3 human gate.
Manual/visual evidence: eligibility page rewired + typechecks; browser QA deferred (no seeded provider session; enforcement OFF ⇒ member resolution unchanged, only the over-exposed annual-limit/usage block removed). This must be browser-verified at the pilot gate before enforcement flips.
Known limitations: page has no branch selector yet (branch optional while OFF; required-branch UX lands with the enforcement flip). B2B /api/v1/eligibility route not yet switched to this service (it already entitlement-scopes via F1.7(a) + entitledMemberWhere) — a later convergence unit.
Next allowed package: F1.12 — Enforce entitlement on provider claim submission (GATED: approved provider/client flag; build flagged, do NOT remove bypass in prod)
Stop condition observed: yes — did NOT change claim submission.
```

---

## F1.12 — Enforce entitlement on provider claim submission (BUILT; bypass removal GATED OFF)

```text
Work package: F1.12
Status: COMPLETE (flag-gated enforcement built + wired). Bypass removed ONLY under the D3 flag (default OFF) — production bypass preserved until network-ops/claims/security sign-off.
Proof-before-build: F0.3 — provider-portal claim intake uses channel PROVIDER_PORTAL with scopeMembersByEntitlement:false (claim-intake/context.ts); the action resolved the member tenant-only. B2B API uses apiProvider scope true. Reused ProviderEntitlementService (entitledMemberWhere) + ProviderAccessSettings flag (F1.11).
Files changed: src/server/services/provider-claim-entitlement-gate.service.ts (new), src/app/provider/claims/new/actions.ts (member resolution now goes through the gate), tests/services/provider-claim-entitlement-gate.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: ProviderClaimEntitlementGate.resolveSubmittableMember — flag OFF (default) resolves tenant-only (documented bypass preserved); flag ON resolves entitlement-scoped at the CLAIM'S service date, so an out-of-entitlement member is unresolvable ⇒ the action returns its normal "no member found" ⇒ structural reject, NO claim created (matches the B2B API). Receipt/idempotency/routing remain with Claims Autopilot (the gate only gates member resolution before intake; runClaimIntake unchanged).
Authorization evidence: 3 DB tests — OFF: EXCLUDEd member still resolves (bypass); ON: EXCLUDEd member null (structural reject) + INCLUDEd resolves; ON: service date before applicability effectiveFrom ⇒ even in-group member null (date-correct).
Idempotency/concurrency evidence: unchanged — the gate does not touch receipts; runClaimIntake keeps the form draft-UUID idempotency (F0.3).
Privacy/security evidence: out-of-scope member is a safe not-found (same error string as a genuinely missing member — no enumeration). Provider derived from session (action), never the body (D1).
Money/reconciliation evidence: n/a (no money path change; a rejected member creates no claim)
Focused tests and results: 3/3 (opt-in DB). Full suite (no DB env) 1164 passed / 149 skipped (+3 DB). tsc 0; brand PASS; currency PASS (673).
Feature-flag state: providerAccess.entitlementEnforcement (Tenant.config) — DEFAULT OFF. Bypass removal per provider/client is the D3 human gate.
Manual/visual evidence: claim action typechecks; enforcement OFF ⇒ claim submission behavior unchanged; browser QA of the ON path deferred to the pilot gate (needs a seeded provider session + flipped flag).
Known limitations: branch context not yet required on claim submission (the provider claim form has no branch selector — added when the form gains one); channel matrix (context.ts) left as-is (gate sits in the provider action, not the shared Claims Autopilot channel config).
Next allowed package: F2.1 — Private document metadata + upload-intent schema (Phase F2). Remaining F1.7 route groups (b..) also open as separate units.
Stop condition observed: yes — did NOT build corrections (F5).
```

---

# Phase F1 COMPLETE (2026-07-23)

All 12 packages built on the worktree branch (`9b48962`→`df03532`→ this). Provider access foundation: RBAC permission catalog + persona roles, effective branch assignments, canonical ProviderAccessService (context = provider + permissions + branch scope), permission-filtered nav, hardened user admin/offboarding (session-revoking suspend, last-admin safeguard), scoped/expiring/rotatable API keys + per-route scope enforcement (eligibility group), applicability readiness report, reviewed-input backfill mechanism, entitlement shadow comparison, canonical eligibility (data-minimised), and the claim-submission entitlement gate. **Deny-by-default entitlement (F1.9 apply / F1.11 / F1.12) is built behind Tenant.config providerAccess flags defaulting OFF — production activation is the D3 network-ops/claims/security sign-off (Gate A activation), deliberately not flipped in code.** Full suite 1164 passed / 149 skipped; tsc/brand/currency green throughout. Next phase: **F2 — private document foundation** (Gate B).

---

## F2.1 — Private document metadata + upload-intent schema

```text
Work package: F2.1
Status: COMPLETE
Proof-before-build: F0.4 map — Document lacks tenantId/providerId/storageKey/hash/scan; public-read bucket; no intent model. No enum collisions. MISSING.
Files changed: prisma/schema.prisma (Document §7.4 fields + DocumentUploadIntent + DocumentScanStatus/DocumentSourceType/DocumentTargetType enums), src/server/services/provider-document.service.ts (new, minimal), tests/services/provider-document.f21.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive via db push. scanStatus is NULLABLE (null=legacy readable; F2.7 backfills). fileUrl retained (legacy readability, step 2). db push flagged ONE data-loss warning = the new uploadIntentId unique on Document — SAFE because the column is brand-new all-NULL (Postgres NULLs distinct) → no duplicates; accepted on throwaway. SAME reasoning applies to prod (all-null new column, no dupes) — DEPLOYMENT note.
Behavior delivered: private/scanned/scoped document schema + single-use upload intent + target-type constraints (assertProviderUploadTarget: unknown → INVALID_TARGET_TYPE; provider source to a legacy target → TARGET_NOT_PROVIDER_UPLOADABLE). NO bucket-policy change (stop condition). No finalize/scan/download yet (F2.2-F2.6).
Authorization evidence: target-type constraint is the F2.1 slice; resource authorization is F2.2.
Idempotency/concurrency evidence: Document.uploadIntentId @unique + DocumentUploadIntent.finalizedDocumentId @unique = finalize-once guarantee (DB test: 2nd document for the same intent rejected).
Privacy/security evidence: storageKey stored (not URL); scanStatus gates usability later. No object/bucket change.
Money/reconciliation evidence: n/a
Focused tests and results: 6/6 (4 pure target-type + 2 DB: finalize-once unique + legacy null-scan readable). Full suite (no DB env) 1168 passed / 151 skipped (+4 pure, +2 DB). tsc 0; brand PASS; currency PASS (674).
Feature-flag state: none (inert schema until F2.3+ flow uses it)
Known limitations: DocumentTargetType lists forward values (INFORMATION_REQUEST/RECONSIDERATION/PAYMENT_QUERY/PROFILE_CHANGE) whose target models arrive in F4-F7; intent stores targetType+targetId as scalars so no dangling FK. Legacy MemberHealthFile not folded in (separate model; F2.7/F2.8 decide).
Next allowed package: F2.2 — Build resource-level document authorization (M)
Stop condition observed: yes — no bucket-policy change.
```

---

## F2.2 — Resource-level document authorization

```text
Work package: F2.2
Status: COMPLETE
Proof-before-build: confirmed Claim (tenant/provider/branch?/status), PreAuthorization (tenant/provider/status, NO branch), ClinicalCase (tenant/provider/branch?/status). MISSING authz.
Files changed: src/server/services/provider-document.service.ts (authorizeTarget + TARGET_PERMISSION map), tests/factories/provider-network.ts (createClaim/createPreauth helpers + teardown clears F2+ targets/documents), tests/services/provider-document-authz.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: authorizeTarget(ctx,{targetType,targetId,action}) in §9.1 order — required permission (per-target map: CLAIM read/respond, PREAUTH read/respond, CASE read/read) → resource load scoped to tenant+provider → branch check when target has a branch. Absent + cross-provider both → safe NOT_FOUND. Not-yet-built targets (PAYMENT_QUERY etc.) → TARGET_TYPE_NOT_SUPPORTED (honest — no fabricated loaders). Does NOT expose the object (F2.6).
Authorization evidence: 6 DB tests — own claim ok; missing/wrong permission FORBIDDEN_PERMISSION (before load); other-provider + guessed id both NOT_FOUND; branch-scoped denied without branch / allowed with; PA (no branch) ok; unsupported target refused.
Idempotency/concurrency evidence: n/a (read authz)
Privacy/security evidence: NOT_FOUND indistinguishable for absent vs cross-provider (§9.1); permission checked before load (no existence leak on permission failure).
Money/reconciliation evidence: n/a
Focused tests and results: 6/6. Full suite (no DB env) 1168 passed / 157 skipped (+6 DB). tsc 0; brand PASS; currency PASS.
Feature-flag state: none (service not wired to live upload routes yet — F2.8)
Known limitations: loaders exist for CLAIM/PREAUTH/CASE only; INFORMATION_REQUEST/RECONSIDERATION/PAYMENT_QUERY/PROFILE_CHANGE loaders arrive with their phases (F4/F5/F6/F7). Operator/member access is a separate admin path, not this provider service. Cross-target document-reuse denial fully exercised at F2.6 (download).
Next allowed package: F2.3 — Implement upload intent creation (S)
Stop condition observed: yes — download not exposed.
```

---

## F2.3 — Upload intent creation

```text
Work package: F2.3
Status: COMPLETE
Files changed: src/server/services/provider-document.service.ts (DOCUMENT_UPLOAD_POLICY + createUploadIntent + resolveOpenIntent + POLICY_MIME code), tests/services/provider-document-intent.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Behavior delivered: createUploadIntent authorizes the target (UPLOAD) → validates MIME against the small policy allowlist → caps size at 10MB → mints a single-use hex token + 15-min expiry → audits. Returns token/expiry/constraints, NO public-read URL. Target+actor binding fixed at creation. resolveOpenIntent returns the intent only if unexpired + unfinalized (expired/used/unknown all → null).
Authorization evidence: 5 DB tests — bound intent (token+expiry, no url, actor/provider stored); forbidden target NOT_FOUND + missing perm FORBIDDEN_PERMISSION; disallowed MIME POLICY_MIME; expired/unknown → resolveOpenIntent null; size capped at policy.
Idempotency/concurrency evidence: single-use token (unique); finalize-once enforced at F2.4 via resolveOpenIntent + schema uniques.
Privacy/security evidence: no public-read access issued (asserted no url/http/bucket in the result); MIME policy is a small allowlist (§9.9).
Focused tests and results: 5/5. Full suite (no DB env) 1168 passed / 162 skipped (+5 DB). tsc 0; brand PASS; currency PASS.
Feature-flag state: none (not wired to live routes until F2.8)
Next allowed package: F2.4 — Upload finalize + content validation (M)
Stop condition observed: yes — no finalize/scan in this package.
```

---

## F2.4 — Upload finalize + content validation

```text
Work package: F2.4
Status: COMPLETE
Files changed: src/lib/document-mime.ts (new — magic-byte detector + resolveAcceptableMime), src/server/services/provider-document.service.ts (DocumentStagingPort + stagingKeyForIntent + finalizeUpload + 4 error codes), tests/services/provider-document-finalize.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Behavior delivered: finalizeUpload — reauthorize (provider match + authorizeTarget UPLOAD) → stat staged object (exists) → size ≤ intent cap → sha256 → detected-MIME consistency (magic bytes, not extension; forged/lie rejected) → atomic single-use consume (updateMany finalizedAt:null guard) + create PENDING Document (private storageKey, sha256, sizeBytes, detectedMime, target FK) → promote object + audit after commit. Idempotent on token (replay = same document). Storage is an injectable port (fake in tests; MinIO adapter wired at F2.8). NO clean availability (scanStatus PENDING).
Authorization evidence: reauthorizes provider + target on finalize; provider mismatch → safe NOT_FOUND.
Idempotency/concurrency evidence: atomic finalizedAt:null guard + Document.uploadIntentId unique ⇒ one document per intent; retry returns the SAME documentId (test: count==1); raced finalizer returns the winner's doc.
Privacy/security evidence: content-based MIME (magic bytes) defeats extension/MIME lies — MZ exe declared pdf → CONTENT_REJECTED; oversize → OVERSIZE; missing staged object → STAGING_OBJECT_MISSING. fileUrl="" (no public URL); storageKey is private.
Money/reconciliation evidence: n/a
Focused tests and results: 5/5 (valid PDF→PENDING+sha256+promote; forged/lie rejected; missing+oversize; retry=same doc + unknown token invalid; pending≠clean). Full suite (no DB env) 1168 passed / 167 skipped (+5 DB). tsc 0; brand PASS; currency PASS (675).
Feature-flag state: none (not wired to live upload routes until F2.8)
Known limitations: MinIO-backed DocumentStagingPort adapter not written yet (port + fake only) — added when consumers migrate (F2.6/F2.8). Abandoned-staging cleanup job (step 7) deferred to the F4.10/F2 job sweep; PENDING state is the scan queue (§9.14, F2.5).
Next allowed package: F2.5 — Malware scan + quarantine lifecycle (M)
Stop condition observed: yes — no clean availability.
```

---

## F2.5 — Malware scan + quarantine lifecycle

```text
Work package: F2.5
Status: COMPLETE
Files changed: prisma/schema.prisma (Document.scanAttempts/scanLeaseUntil/scanReason + index), src/server/services/provider-document-scan.service.ts (new), tests/services/provider-document-scan.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive scan lease/attempt fields via db push (in sync)
Behavior delivered: DocumentScannerPort (injectable) + scanOne (verdict→terminal: CLEAN→CLEAN, INFECTED→QUARANTINED, CORRUPT→REJECTED, ERROR→retry-then-ERROR) + runScanSweep (lease-claim before scan so concurrent workers don't double-process) + isDocumentUsable (only CLEAN). Scan driven off PENDING state (§9.14). Legacy (null scanStatus) untouched (stop condition). Notify-provider (step 5) records the disposition; the durable outbox notification is F4.8 (hook noted). Admin quarantine view (step 6) is an F2/F9 ops surface — the data (scanReason, QUARANTINED status, no download) is in place.
Authorization evidence: isDocumentUsable is the single gate F2.6 download enforces — QUARANTINED/REJECTED/ERROR/PENDING all non-usable (provider cannot access quarantine).
Idempotency/concurrency evidence: re-scan of a terminal doc = SKIPPED (no-op); sweep lease-claim (updateMany guard) prevents double-processing; retry increments scanAttempts to the cap then ERROR.
Privacy/security evidence: scanReason is a safe label (no raw payload); scanner reads via storageKey (private), never a public URL.
Focused tests and results: 5/5 (usability gate pure; clean/quarantine/reject; retry→exhaust ERROR; idempotent re-scan; sweep lease). Full suite (no DB env) 1169 passed / 171 skipped (+1 pure, +4 DB). tsc 0; brand PASS; currency PASS (676).
Feature-flag state: none
Known limitations: real scanner engine (ClamAV etc.) wired in ops later — port + fake here. Provider notification of rejected/error rides the F4.8 outbox (not built yet); disposition + scanReason are recorded now.
Next allowed package: F2.6 — Implement authorized document download (M)
Stop condition observed: yes — legacy documents not switched.
```

---

## F2.6 — Authorized document download

```text
Work package: F2.6
Status: COMPLETE
Files changed: src/server/services/provider-document.service.ts (authorizeDownload + DocumentDownloadPort + DOCUMENT_DOWNLOAD_TTL_SECONDS + DOCUMENT_NOT_AVAILABLE), src/lib/document-storage.ts (new — MinIO port adapter), src/app/provider/documents/[id]/download/route.ts (new — proof consumer), tests/services/provider-document-download.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Behavior delivered: authorizeDownload loads the doc (tenant-scoped), reauthorizes against the doc's OWN target (VIEW — provider/branch/permission), requires CLEAN, then mints a 120s signed URL via an injectable port + audits. minioDocumentPort implements presignRead (presignedGetObject) + staging stat/read/promote (reusable by F2.4/F2.8). Proof consumer: /provider/documents/[id]/download route → 302 to signed URL; forbidden→403, absent/cross-provider/pending/quarantined→safe 404.
Authorization evidence: 4 DB tests — CLEAN own-claim → signed URL with expiry; PENDING+QUARANTINED → DOCUMENT_NOT_AVAILABLE; cross-provider NOT_FOUND + missing perm FORBIDDEN_PERMISSION; branch scope. A document is only reachable through its OWN target (target derived from the doc, not the request) — closes the F2.2 cross-target-reuse concern.
Idempotency/concurrency evidence: n/a (read)
Privacy/security evidence: minute-scale signed URL (expiry asserted), never a permanent/public URL; scan gate (CLEAN only); safe 404 hides existence + scan state.
Focused tests and results: 4/4. Full suite (no DB env) 1169 passed / 175 skipped (+4 DB). tsc 0 (route + MinIO adapter compile); brand PASS; currency PASS (678).
Feature-flag state: none
Manual/visual evidence: download route typechecks; browser QA deferred (no seeded provider session). copyObject/promote signature to be verified against live MinIO at F2.8 wiring.
Known limitations: only ONE proof consumer (the download route) per stop condition; migrating the existing admin/member fileUrl consumers is F2.8. Public bucket still readable (F2.9 gated).
Next allowed package: F2.7 — Backfill legacy document metadata (S per class/batch)
Stop condition observed: yes — one proof consumer.
```

---

## F2.7 — Backfill legacy document metadata (CLAIM class)

```text
Work package: F2.7
Status: COMPLETE for the CLAIM target class (F2.7 is per-class/batch; other classes = future units)
Files changed: src/server/services/provider-document-backfill.service.ts (new), tests/services/provider-document-backfill.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Behavior delivered: backfillClaimDocuments — dry-run by default; classifies each legacy claim doc UNAMBIGUOUS/MISSING_TARGET/BROKEN_URL/ALREADY_MIGRATED; apply stamps storageKey (parsed from fileUrl), tenant/provider/branch scope (from the owning claim), sourceType OPERATOR, retentionClass LEGACY_BACKFILL, and a scan disposition (default PENDING → rescan). Only UNAMBIGUOUS rows written; ambiguous/broken → exceptions (never guessed). Legacy fileUrl untouched (stays readable).
Authorization evidence: n/a (ops backfill; scope derived from the owning claim, not guessed)
Idempotency/concurrency evidence: rows with storageKey already set → ALREADY_MIGRATED (skipped); rerun applies 0 (test).
Privacy/security evidence: no object contents read/logged (URL string parsing only); disposition defaults PENDING so backfilled docs are not silently usable via the new path until scanned.
Money/reconciliation evidence: row conservation — counts sum to total (test).
Focused tests and results: 4/4 (2 pure URL-parse + 2 DB dry-run/apply/idempotent). Full suite (no DB env) 1171 passed / 177 skipped (+2 pure, +2 DB). tsc 0; brand PASS; currency PASS (679).
Feature-flag state: none (ops tool)
Known limitations: CLAIM class only (PREAUTH/CASE/etc. classes are separate F2.7 batches); scan disposition policy (PENDING vs grandfather-CLEAN) is a security decision — mechanism parameterizes it, default PENDING. Real MinIO object existence not verified per row (URL→key mapping only).
Next allowed package: F2.8 — Migrate document consumers (S per group) — then F2.9 (GATED security approval)
Stop condition observed: yes — one target class.
```

---

## F2.8 — Migrate document consumers (provider claim-documents group)

```text
Work package: F2.8
Status: COMPLETE for ONE consumer group (provider claim documents). Other groups (admin ClaimDocuments/PreAuthDocuments, member pages, HR endorsements) remain separate units.
Proof-before-build: existing fileUrl consumers are operator/member-scoped and F2.2 deliberately left operator access to a separate admin path that does not exist yet — migrating them would exceed one group and require unbuilt operator authz. The provider claim detail page rendered NO documents at all, so the provider group is built authorized-only from the start (it never uses fileUrl). This is the group Gate B is about.
Files changed: src/server/services/provider-document.service.ts (listTargetDocuments + safeScanLabel), src/app/provider/claims/[id]/page.tsx (context-resolved + Documents section), tests/services/provider-document-list.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Behavior delivered: listTargetDocuments authorizes the target (VIEW) then returns a SAFE projection (id/fileName/category/size/createdAt/statusLabel/usable/downloadHref) — never fileUrl, storageKey, or sha256. Only CLEAN docs get an authorized /provider/documents/[id]/download href; PENDING/QUARANTINED/REJECTED/ERROR/legacy show a safe label and NO link. Provider claim detail now renders the section; a caller lacking provider.claim.read (legacy, un-migrated) gets no section at all — today's page exactly, never a broken one.
Authorization evidence: 3 tests — safe labels leak no scanner detail; list denies without permission (FORBIDDEN_PERMISSION) and for another provider's claim (NOT_FOUND); serialized payload contains no fileUrl/storageKey.
Privacy/security evidence: legacy (null scanStatus) documents are deliberately NOT served via a public URL on this surface — private-by-default; the public fileUrl is never emitted to the provider client.
Focused tests and results: 3/3. Full suite (no DB env) 1172 passed / 179 skipped (+1 pure, +2 DB). tsc 0; brand PASS; currency PASS (679).
Manual/visual evidence: page typechecks; browser QA deferred (no seeded provider session). Section is additive + permission-guarded, so the legacy rendering path is unchanged.
Known limitations: one group only (stop condition). Admin/member fileUrl consumers still direct — they need an operator-scoped download path (separate unit) before F2.9 can remove public read.
Next allowed package: F2.9 — Remove provider public-object access (M) — GATED on security approval + zero active direct consumers
Stop condition observed: yes — one consumer group.
```

---

## F2.9 — Remove provider public-object access (MECHANISM BUILT; BLOCKED — gate not ready)

```text
Work package: F2.9
Status: PARTIAL / BLOCKED. The mechanism + gate evidence are built and tested; the public-read switch is deliberately NOT thrown. Its precondition ("prove zero active direct consumers", step 1) is objectively UNMET.
Proof-before-build: re-ran the inventory — 15 source files still dereference a document `fileUrl` (admin providers/claims/preauth pages, HR endorsements, member documents/health-vault/preauth, DocumentList, FileUpload, member-app/health-vault/preauth services, quotation-builder, secure-checkin, contracts/intake routers). Those are operator/member-scoped and need an operator download path (not built — F2.2 scoped it out). Removing public read now WOULD break live pages.
Files changed: src/lib/minio.ts (publicDocumentsEnabled flag; ensureBucket only applies the public policy when enabled), scripts/pnos-document-privacy-readiness.ts (new — gate evidence), tests/services/document-public-policy.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Behavior delivered: (a) NEW buckets can be created private-by-default via MINIO_PUBLIC_DOCUMENTS=false; default remains the legacy public policy so nothing flips silently, and an EXISTING bucket's policy is never touched by code. (b) A read-only readiness report answering the three gate questions: backfill progress (docs with/without private storageKey, by scanStatus), remaining direct-fileUrl consumers (static scan), and current public-read posture (+ optional anonymous --probe of a real object URL). It prints an explicit GATE ready/NOT-ready verdict.
Authorization evidence: n/a (posture/config)
Privacy/security evidence: the report is the §11.4 artifact. Current verdict on the throwaway: NOT ready (consumers remain, un-backfilled docs remain). Anonymous-GET probe is available but was NOT run against any real environment.
Focused tests and results: 2/2 (default = legacy public, fail-safe: only an explicit "false" disables). Full suite (no DB env) 1174 passed / 179 skipped (+2 pure). tsc 0; brand PASS; currency PASS.
Feature-flag state: MINIO_PUBLIC_DOCUMENTS unset ⇒ legacy public (unchanged everywhere).
Known limitations / TO CLOSE THE GATE: (1) remaining F2.7 backfill batches (PREAUTH/CASE/group/etc. classes); (2) remaining F2.8 consumer groups — needs an OPERATOR-scoped authorized download path for admin/member/HR; (3) security sign-off; (4) then set MINIO_PUBLIC_DOCUMENTS=false for new envs and have an operator remove the policy on existing buckets, re-running this report + the anonymous probe as evidence. Legacy DB fileUrl values are retained either way (stop condition).
Next allowed package: F3.1 — Freeze PA submission and decision contracts (S)
Stop condition observed: yes — legacy DB URLs untouched; no bucket policy changed anywhere.
```

---

# Phase F2 COMPLETE (2026-07-23) — private document foundation

F2.1–F2.8 built and proven the whole engine: §7.4 metadata + single-use upload intents, resource-level target authorization, policy-gated intent creation, finalize with magic-byte content validation + sha256 + atomic single-use consume, lease-based scan/quarantine with retry exhaustion, authorized minute-scale signed download (+ MinIO adapter + provider download route), legacy backfill (CLAIM class), and the provider claim-documents consumer that never touches `fileUrl`. **F2.9's public-read switch is deliberately NOT thrown** — its own readiness report proves the gate is not met (15 direct-`fileUrl` consumers remain; admin/member/HR need an operator download path) and security must sign off. **Gate B therefore remains OPEN by design.** Suite at phase end: 1174 passed / 179 skipped.

---

## F3.1 — Freeze PA submission and decision contracts

```text
Work package: F3.1
Status: COMPLETE
Proof-before-build: field union taken from the real rails — /api/v1/preauth body (memberNumber, providerCode, benefitCategory, estimatedCost, diagnoses, notes; procedures hardcoded []) and ClaimsService.createPreAuth (memberId, providerId, serviceType, expectedDateOfService?, diagnoses[], procedures[], estimatedCost, clinicalNotes?, benefitCategory, submittedBy). Confirmed PreAuthorization.serviceType is NOT required by the schema, matching the API rail that omits it.
Files changed: src/server/services/preauth-intake/contract.ts (new, pure), tests/services/preauth-contract.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none — NOTHING is persisted through the new contract (stop condition)
Behavior delivered: PreauthSubmissionV1 (untrusted) + PreauthCallerContext (trusted) + NormalizedPreauthV1; deterministic normalization (codes upper-trim, whitespace-collapsed text, EXACT 2dp decimal strings via Prisma.Decimal — never floats, date-level YYYY-MM-DD with no timezone drift, derived procedure totals); per-channel required-field matrix; resolveProviderId; canonical sha256 request hash scoped by tenant+provider; safe error-code union; receipt shape; documented handoff to preauthAdjudicationService as the sole decision/hold owner.
Authorization evidence: provider-bound channels take providerId from the trusted context and return PROVIDER_FORGERY when the body disagrees; the API channel refuses an internal memberId (external callers identify by memberNumber); admin/member channels may choose a facility (service validates in-tenant later).
Idempotency/concurrency evidence: request hash is stable for equivalent submissions and differs across providers for the same payload — the basis for same-key replay vs conflict (D26).
Privacy/security evidence: no PHI in error codes; money never floats.
Focused tests and results: 14/14 pure. Full suite (no DB env) 1188 passed / 179 skipped (+14). tsc 0; brand PASS; currency PASS (680).
Known limitations: two divergent auto-approve policies (member 15k vs pipeline 50k) remain a CONFLICTING decision recorded in F0.3 — the contract does not resolve it; that is an architecture decision for F3.3's handoff. The API rail's missing fraud/benefit-in-package gates are likewise recorded, not silently changed.
Next allowed package: F3.2 — Add PA intake receipt and event schema (S)
Stop condition observed: yes — nothing persisted through the new contract.
```

---

## F3.2 — PA intake receipt + event schema

```text
Work package: F3.2
Status: COMPLETE
Files changed: prisma/schema.prisma (PreauthIntakeStatus enum + PreauthIntakeReceipt + PreAuthorizationEvent), src/server/services/preauth-intake/events.ts (new), tests/factories/provider-network.ts (teardown clears the new tables), tests/services/preauth-intake-schema.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: additive via db push (in sync). Both models are relation-less (scalar ids) — consistent with the other PNOS evidence models and leaves the shared PreAuthorization model untouched; existing PA rows stay readable.
Behavior delivered: receipt carries provider/client/member/branch/channel + idempotencyKey + requestHash + status + preAuthorizationId|failureCode + actor/credential/requestId, with the idempotency scope enforced as UNIQUE(tenantId, providerId, channel, idempotencyKey). Events are append-only with an explicit per-PA `sequence` (UNIQUE(preAuthorizationId, sequence)); appendPreauthEvent derives the next sequence and validates metadata; listPreauthEvents returns the ordered timeline. assertSafeEventMetadata rejects clinical/raw keys (notes/body/payload/document/description…), over-long strings and nested structures.
Authorization evidence: n/a (schema + helpers)
Idempotency/concurrency evidence: DB test proves the same tenant+provider+channel+key is rejected outright (the caller must be given a replay or conflict, never a 2nd row), while a different provider or channel may reuse the key value. A duplicate event sequence is impossible — history cannot be silently reordered or overwritten.
Privacy/security evidence: a REJECTED receipt is fully expressible with ids + a structural failure code (no PA, no clinical body); unsafe event metadata is refused BEFORE any write.
Focused tests and results: 7/7 (3 pure metadata + 4 DB). Full suite (no DB env) 1191 passed / 183 skipped (+3 pure, +4 DB). tsc 0; brand PASS; currency PASS (681).
Known limitations: no route migration (stop condition) — nothing writes receipts/events yet; F3.3 does. NOTE: `prisma generate` must run WITH DIRECT_URL set (prisma.config.ts reads it) or it fails silently and tests run against a stale client — that bit once here and cost a red run.
Next allowed package: F3.3 — Implement PreauthIntakeService (M)
Stop condition observed: yes — no route migration.
```

---

## F3.3 — Implement PreauthIntakeService

```text
Work package: F3.3
Status: COMPLETE
Files changed: src/server/services/preauth-intake/service.ts (new), tests/services/preauth-intake-service.test.ts, PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none (uses F3.2 receipt/event models + existing PreAuthorization + createWithDocumentNumber)
Behavior delivered: PreauthIntakeService.submit(ctx, submission, deps, db) — normalize+validate (F3.1) → replay/conflict on the existing receipt → entitlement-aware member resolution (reuses ProviderAccessSettings flag + entitledMemberWhere at the service date, like F1.12; default OFF ⇒ tenant-only) → member-active + provider-active gates → ONE transaction {PA via collision-safe numbering + receipt(PROCESSING) + SUBMITTED event + SLA deadline} → post-commit handoff to the injectable adjudicate port → flip receipt ACCEPTED on success. NEVER decides or touches a hold — the port is the canonical owner (D5/D6). No existing rail migrated (stop condition).
Authorization evidence: provider-bound channel forgery (body providerId≠context) → REJECTED with PROVIDER_FORGERY; cross-tenant/entitlement-excluded member → REJECTED; provider-not-active → REJECTED. All rejects create a receipt with NO PA.
Idempotency/concurrency evidence: same key+hash → replay (same PA, adjudicate NOT called again — spy proves exactly-once); same key+different hash → PreauthIntakeConflict, zero rows created; the receipt UNIQUE(tenant,provider,channel,key) is the concurrency guard — a racing submit that loses the receipt insert re-reads and replays the winner.
Privacy/security evidence: money as exact Decimal strings (F3.1); event metadata safe-only (F3.2); a REJECTED submission persists ids + failureCode, no clinical body.
Money/reconciliation evidence: no hold/decision here — those stay with preauthAdjudicationService; a handoff failure never double-decides (port must be idempotent).
Focused tests and results: 7/7 (happy one-PA+once, replay no-re-adjudicate, conflict no-mutation, validation reject no-PA, cross-tenant+inactive member reject, forgery reject, adjudication-failure ⇒ receipt PROCESSING + PA SUBMITTED + AUTO_DECISION_DEFERRED event). Full suite 1191 passed / 190 skipped (+7 DB). tsc 0 (fixed Json casts via `as unknown as Prisma.InputJsonValue`); brand PASS; currency PASS.
Feature-flag state: none (service is inert until a rail calls it — F3.4/F3.5)
Known limitations: create-time fraud + benefit-in-package gates (ClaimsService.createPreAuth has them) are NOT replicated — the canonical auto-decision pipeline runs FRAUD_SCREENING + BENEFIT_CAP, so intake creates + routes (Autopilot D6 accept-and-route). The CONFLICTING dual auto-approve policy is untouched — it is F3.5's decision when the member rail migrates. Clean-document validation at submit deferred to F3.9 (the submission page attaches docs via the F2 flow). Production adjudicate adapter (wraps preauthAdjudicationService.executeAutoDecision + a system actor) is wired at the F3.4/F3.5 call sites, not here.
Next allowed package: F3.4 — Migrate provider B2B PA submit (S)
Stop condition observed: yes — no rail migrated.
```

---

## F3.4 — Migrate provider B2B PA submit

```text
Work package: F3.4
Status: COMPLETE
Files changed: src/app/api/v1/preauth/route.ts (rewritten as an adapter over PreauthIntakeService), src/server/services/preauth-intake/service.ts (resolveMember: channel-based entitlement default — PROVIDER_API always entitled, PROVIDER_PORTAL flag-gated, admin/member tenant-only), tests/api/preauth-intake-route.test.ts (new), tests/api/provider-preauth-scope.test.ts (rewritten for the new architecture), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: /api/v1/preauth no longer creates a PA directly — it derives the PROVIDER_API context from the credential, resolves the provider (code→id) with the spoof-block preserved, maps the body to PreauthSubmissionV1, requires the api.preauth.write scope (F1.7 providerScopeError; unscoped legacy keys pass), delegates to PreauthIntakeService.submit with the production adjudicate adapter (executeAutoDecision + getSystemActorId), and returns the versioned receipt envelope while KEEPING the legacy success/reference/status fields. Rejections map to safe HTTP: member→404, provider/active/forgery→403, other→422; idempotency conflict→409; replay→200.
Authorization evidence: scoped key without api.preauth.write → 403 FORBIDDEN_SCOPE, service never called; provider-key providerCode spoof → 403, service never called; operator resolves provider from providerCode. 15 route tests across the two files pass.
Idempotency/concurrency evidence: Idempotency-Key header threaded to the canonical command (falls back to the content hash); conflict→409; replay→200. The exactly-once + durability guarantees are the service's (F3.3).
CATCH (security): a naive migration would have REGRESSED the B2B rail's member scoping — the API was ALREADY deny-by-default (E2E-D02, scopeMembersByEntitlement:true) but F3.3's resolveMember was flag-gated. Fixed resolveMember to be channel-based so PROVIDER_API stays always-entitled; F3.3's 7 tests re-verified green after the change.
Privacy/security evidence: rejection envelope carries a code + safe message + fieldErrors only — the rewritten E2E-D04 test asserts no internal tenant/client/group identifiers leak; cross-tenant is now a SAFE 404 (no-enumeration) rather than the old 403.
Focused tests and results: preauth-intake-route 8/8 + provider-preauth-scope 7/7 + F3.3 re-run 7/7. Full suite (no DB env) 1198 passed / 190 skipped. tsc 0; brand PASS; currency PASS (682).
Feature-flag state: none new (PROVIDER_PORTAL entitlement still behind the F1.11 flag; PROVIDER_API always entitled)
Known limitations: only the B2B rail migrated (stop condition). The old test was REWRITTEN, not deleted — its E2E-D04 intent is preserved at the route seam and the real-entitlement proof relocated to F3.3 (real DB, stronger than the old mock).
Next allowed package: F3.5 — Migrate one internal PA rail (S per rail) — RESOLVE the CONFLICTING dual auto-approve policy here (member 15k vs pipeline 50k). Surface to the user before picking.
Stop condition observed: yes — one rail (B2B) migrated.
```

---

## F3.5a — Migrate the MEMBER PA rail (converge on the canonical pipeline)

```text
Work package: F3.5a (member rail; F3.5 is per-rail a/b/c)
Status: COMPLETE
Commit: d005b3a
Files changed: src/server/services/member-preauth.service.ts (request() migrated), tests/services/member-preauth-rail.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none (receipt/event schema landed in F3.2; no prisma db push)
Behavior delivered: MemberPreAuthService.request no longer calls ClaimsService.createPreAuth and no longer runs its own auto-decision. It submits through PreauthIntakeService on channel MEMBER_APP with a server-derived caller context {channel, tenantId, providerId, actorType:USER, actorId:userId} and the mapped canonical command (memberId, providerId, serviceType, diagnoses:[{description,isPrimary}], procedures:[{cptCode,label,qty1,unitCost=total=estimatedCost}], estimatedCost, benefitCategory). The post-commit adjudicate port is wired to the SAME pipeline the B2B rail uses (preauthAdjudicationService.executeAutoDecision + getSystemActorId). After the handoff it reads the persisted PA status (single source of truth) and maps it to the member decision + notification: APPROVED→AUTO_APPROVED/HIGH, DECLINED→AUTO_DECLINED/HIGH, else PENDING_HUMAN_REVIEW/NORMAL. A REJECTED submission surfaces as a friendly thrown error (first error message) with no notification.
DECISION — dual auto-approve policy RESOLVED (per user: "converge on the canonical pipeline"): DELETED the member rail's bespoke AUTO_APPROVE_CEILING (15,000) + AUTO_APPROVE_CPT_CODES allowlist and its hand-rolled approveByHuman / declineByHuman(BENEFIT_EXHAUSTED) branches. The 10-gate canonical pipeline (benefit cap, exclusions, fraud, credential, 50k ceiling) is now the single decision owner for member-originated PAs — parity with every other rail.
Preserved (rail's own concern, unchanged): member authorization (self or an ACTIVE dependant only — allowedMemberIds), the friendly provider-active pre-check, and the friendly benefit-exists-in-package pre-check. Trimmed two now-dead member includes (group.status, benefitUsages).
Authorization evidence (seam test): a request for a non-self/non-active-dependant member → throws "…yourself or an active dependant", submit NEVER called; a SUSPENDED dependant is likewise blocked; no linked member profile → throws, no submit; inactive provider and no-cover-in-package → friendly throw, no submit.
Convergence evidence (seam test): submit called with the exact MEMBER_APP context (derived from session, not body); the injected adjudicate calls executeAutoDecision(paId, tenantId, systemActor); the removed approveByHuman/declineByHuman NEVER run; a 40,000 estimate (> old 15k ceiling) still routes to the pipeline (no rail-level block). status→decision→notification mapping proven for APPROVED/DECLINED/UNDER_REVIEW; REJECTED bubbles as a friendly error with no notification.
Why mocks here (not real DB): the intake→receipt→SUBMITTED-event→adjudicate-handoff MECHANICS (incl. the deferral case where a failing adjudicate still yields ACCEPTED + durable PA) already have REAL-DB proof in tests/services/preauth-intake-service.test.ts (F3.3). The rail now calls that exact proven path, so F3.5a asserts only the rail's delegation CONTRACT deterministically — a heavy real-DB member-rail test would re-prove F3.3 and risk non-deterministic pipeline side-effects (holds/GOP) on teardown.
Behavioral note: the server action's returned `warnings` is now always [] (createPreAuth warnings are gone; detailed reasons live on the PA + events / the PA detail page). The decision union is unchanged, so the sole caller (src/app/member/preauth/actions.ts:15) is type-compatible (tsc clean).
Focused tests and results: member-preauth-rail 13/13. Full suite (no DB env) 1211 passed / 190 skipped (+13 pure). tsc 0; brand PASS; currency PASS (682).
Feature-flag state: none (member rail is always-on for logged-in members; entitlement scoping does not apply to the member's own/dependant PAs).
Remaining internal PA rails (grounded via createPreAuth callers): F3.5b = admin UI (src/app/(admin)/preauth/new/actions.ts:24), F3.5c = tRPC (src/server/trpc/routers/preauth.ts:47) — both still on ClaimsService.createPreAuth. The adjudication-amendment create (preauth-adjudication.service.ts:708) is lifecycle, NOT an intake rail (F3.12). ClaimsService.createPreAuth stays as the legacy creator until F3.6 (retire fragmented persistence) once all rails migrate.
Next allowed package: F3.5b — Migrate the admin PA creation rail (S).
Stop condition observed: yes — only the member rail migrated (no sweeping change).
```

---

## F3.5b — Migrate the ADMIN PA creation rail

```text
Work package: F3.5b (admin UI rail)
Status: COMPLETE
Commit: c889da7
Files changed: src/app/(admin)/preauth/new/actions.ts (submitPreAuthAction migrated), tests/actions/admin-preauth-action.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: submitPreAuthAction submits through PreauthIntakeService on channel ADMIN_PORTAL with a server-derived context {channel, tenantId, providerId(form), actorType:USER, actorId:session.user.id} and the mapped canonical command (memberId, providerId, serviceType, expectedDateOfService, diagnoses:[{description,isPrimary}], procedures:[{description||"Medical services", unitCost=total=estimatedCost}], estimatedCost, clinicalNotes, benefitCategory). Auto-decision port → preauthAdjudicationService.executeAutoDecision + getSystemActorId. No direct createPreAuth.
Convergence/behavior change: the old admin rail created a SUBMITTED PA and surfaced createPreAuth fraud warnings INLINE (advisory; submission still succeeded). Under convergence, fraud is ENFORCED by the pipeline's FRAUD_SCREENING gate (route-to-human/decline), so the warnings-then-stay-on-form branch is REMOVED. Return type keeps `warnings?` for useActionState compat (never populated); PreAuthNewForm renders it optionally so nothing breaks.
Preserved: requireRole(ROLES.CLINICAL) RBAC gate; PREAUTH_SUBMITTED audit (now incl. preauthId/receiptId/replayed); redirect("/preauth"). On REJECTED → return { error: firstMessage } (parity with the old try/catch), NO audit, NO redirect. redirect() stays OUTSIDE the try/catch so NEXT_REDIRECT propagates.
Robustness: a cptCode-less free-text procedure normalizes fine (kept by description; contract line ~149-151); a NaN/absent estimate → normMoney null → "" → INVALID_ESTIMATE reject (no throw) — SAFER than the old raw Number() passed straight to createPreAuth.
Authorization evidence (seam test): requireRole called with the CLINICAL role set before any work.
Convergence evidence (seam test): submit called once with the exact ADMIN_PORTAL context (derived from session, providerId from form); the injected adjudicate calls executeAutoDecision(paId, tenantId, systemActor); accepted → PREAUTH_SUBMITTED audit + redirect("/preauth"); REJECTED → { error } with no audit/redirect; a thrown service error → { error } with no redirect; missing procedure defaults to "Medical services".
Why mocks here (not real DB): same rationale as F3.5a — intake mechanics have real-DB proof in F3.3; this asserts the rail's delegation contract deterministically (server action; mirrors tests/actions/tenant-onboarding redirect-mock pattern).
Focused tests and results: admin-preauth-action 7/7. Full suite (no DB env) 1218 passed / 190 skipped (+7 pure). tsc 0; brand PASS; currency PASS (682).
Feature-flag state: none (admin rail is RBAC-gated, always-on for CLINICAL+).
Next allowed package: F3.5c — Migrate the tRPC PA create rail (server/trpc/routers/preauth.ts:47).
Stop condition observed: yes — only the admin UI rail migrated.
```

---

## F3.5c — Migrate the tRPC PA create rail (F3.5 COMPLETE)

```text
Work package: F3.5c (tRPC rail) — completes F3.5
Status: COMPLETE
Commit: 8c883c5
Files changed: src/server/trpc/routers/preauth.ts (create mutation migrated), tests/routers/preauth-router.test.ts (new), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none
Behavior delivered: preauthRouter.create submits through PreauthIntakeService on channel ADMIN_TRPC with context {channel, tenantId: ctx.tenantId, providerId: input.providerId, actorType:USER, actorId: ctx.session.user.id} and the submission = { ...input } (the zod input is already canonical-shaped: diagnoses use icdCode, procedures carry cptCode/unitCost/total — spreads straight into PreauthSubmissionV1, no remapping). Auto-decision port → executeAutoDecision + getSystemActorId. On REJECTED → throw TRPCError BAD_REQUEST (first validation message). On success → return ClaimsService.getPreAuthById(tenantId, preauthId) so the mutation's return contract (the PA) is preserved.
Input contract: UNCHANGED (same zod schema) — existing tRPC callers are unaffected.
Convergence evidence (seam test, caller + mocks): ADMIN_TRPC context derived from ctx; mapped command; PA returned via getPreAuthById("t1","pa-1"); ClaimsService.createPreAuth NEVER called (behavioral) AND the router source has no createPreAuth( call (structural guard, mirrors the F5.3 claims-router removal test); adjudicate → executeAutoDecision(paId, tid, systemActor); REJECTED → TRPCError BAD_REQUEST with no PA read-back.
Why mocks here (not real DB): same as F3.5a/b — intake mechanics proven on real DB in F3.3; this asserts the rail's delegation contract via the standard tRPC createCallerFactory pattern.
Focused tests and results: preauth-router 5/5. Full suite (no DB env) 1223 passed / 190 skipped (+5 pure). tsc 0 (fixed a test-only type: cast the .catch() result to {code?,message?} since .catch widens to PA|error); brand PASS; currency PASS (682).
Feature-flag state: none.
F3.5 COMPLETE — all three internal PA rails (member/admin-UI/tRPC) + the B2B rail (F3.4) now go through PreauthIntakeService. Direct preAuthorization.create sites remaining: (1) the canonical intake itself (service.ts:131 — the target), (2) the adjudication AMENDMENT create (preauth-adjudication.service.ts:708 — lifecycle, F3.12), (3) ClaimsService.createPreAuth (claims.service.ts:495-506 — now called by NO rail; F3.6 retires it).
Next allowed package: F3.6 — Retire fragmented PA persistence (M).
Stop condition observed: yes — only the tRPC rail migrated in this package.
```

---

## F3.6 — Retire fragmented PA persistence (single canonical creator)

```text
Work package: F3.6 (+ a discovered CATCH)
Status: COMPLETE
Commits: eeb1d65 (CATCH — intake benefit-in-package gate), e4e752a (retire createPreAuth)
Files changed: src/server/services/preauth-intake/contract.ts (new BENEFIT_NOT_IN_PACKAGE code), src/server/services/preauth-intake/service.ts (benefit-in-package gate), src/server/services/claims.service.ts (createPreAuth DELETED + orphaned imports removed), tests/services/preauth-intake-benefit-gate.test.ts (new), tests/services/preauth-intake-service.test.ts (+1 real-DB), tests/services/preauth-persistence-retirement.test.ts (new guard), PROGRESS.md + IMPLEMENTATION_LOG.md
Schema/data changes: none

CATCH (found in proof-before-build, fixed FIRST — commit eeb1d65):
  Retiring createPreAuth surfaced that F3.5b/c (admin + tRPC) had dropped its PR-024
  benefit-in-package THROW, and the auto-decision pipeline does NOT backstop it:
  BENEFIT_CAP calls availableLimit → null for a missing config → `if (balance)` skips;
  the approval hold-recheck calls computeAvailability → null for a missing config →
  the route-to-human is skipped; the PA auto-approves, a BenefitHold row is written,
  and placeHold no-ops (`if (!cfg) return`). Net: an admin/tRPC PA for a not-in-package
  benefit could auto-approve into an unpayable GOP + a stranded phantom hold.
  Fix: PreauthIntakeService now runs a benefit-in-package gate (BenefitUsageService
  .resolveConfig, after the provider-active gate, before the tx) — missing config →
  REJECTED receipt (BENEFIT_NOT_IN_PACKAGE, new PreauthErrorCode), NO PA. Enforced
  UNIFORMLY for every rail (member/admin/tRPC/B2B) in the canonical place. B2B route
  maps it to 422; admin → { error }; tRPC → BAD_REQUEST; member shows its friendly
  pre-check first (now a duplicate of the canonical gate). F3.3's OUTPATIENT tests
  still pass (benefit seeded); its rejection tests reject before the gate.

Retirement (commit e4e752a):
  With all rails on the intake and the guard living canonically, ClaimsService
  .createPreAuth is dead → removed (method + orphaned FraudService / BenefitUsageService
  / createWithDocumentNumber imports + the unused BenefitCategory type import). Net
  -112 lines in claims.service.ts. The ONLY remaining `preAuthorization.create(` sites
  are the canonical intake (all rails) and the adjudication amendment (F3.12 lifecycle).

Invariant evidence: preauth-persistence-retirement.test.ts (3, repo-wide, executable):
  ClaimsService has no createPreAuth; claims.service.ts has no PA-create path;
  `preAuthorization.create(` appears ONLY in preauth-intake/service.ts and
  preauth-adjudication.service.ts. Locks single-creator against silent regression.
Benefit-gate evidence: preauth-intake-benefit-gate.test.ts (2, mock db + REAL
  resolveConfig): phantom benefit → REJECTED/no PA/no tx/receipt failureCode; in-package
  → reaches tx. Plus a real-DB DENTAL-not-in-package case in preauth-intake-service.test.ts.

Follow-up (NOT done — out of F3.6 scope): FraudService.evaluatePreAuth is now dead code
  (createPreAuth was its only caller) and the fraud.service.ts:342 section comment is
  stale. Left untouched to avoid churn in the security-sensitive fraud service; the
  canonical pipeline runs its own FRAUD_SCREENING gate.
Focused tests and results: 2 + 3 new pure + 1 real-DB. Full suite (no DB env) 1228 passed
  / 191 skipped. tsc 0; brand PASS; currency PASS (682).
Feature-flag state: none.
Next allowed package: F3.7 — Canonical PA list read model (S).
Stop condition observed: yes — persistence consolidation only; no read-model/UI work.
```

---
