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

## F3.7 — Canonical PA list read model

```text
Work package: F3.7
Status: COMPLETE
Commit: ffd576f
ASSUMPTION (board-only): the detailed plan is not in-repo; "Canonical PA list read model" is interpreted as a single scoped list mirroring the claims read model's confinement (G2.1). Flagged to the user.
Files changed: src/server/services/preauth-read.service.ts (new), src/server/trpc/routers/preauth.ts (list), src/app/(admin)/preauth/page.tsx, src/server/services/claims.service.ts (getPreAuthorizations removed + PreauthStatus import dropped), tests/services/preauth-read.service.test.ts (new), tests/routers/preauth-router.test.ts (+2)
Schema/data changes: none
Behavior delivered: PreauthReadService.list({ tenantId, clientId?, providerId?, status? }) builds a layered where — tenant always; clientId ⇒ member.group.clientId (G2.1, null/undefined ⇒ operator); providerId ⇒ own-facility; status optional — with the same member+provider projection and createdAt-desc order the old read used. Consolidates + removes ClaimsService.getPreAuthorizations (tenant-only, 0 callers left).
Security fix (not just a refactor): the PA list was tenant-only, so a client-confined operator saw every client's PAs (the claims list was already confined — PA was the gap). tRPC preauth.list now passes ctx.clientId ?? null; admin /preauth/page.tsx passes session.user.clientId ?? null (matches the claims admin page). Gap closed at both surfaces.
FLAGS: (1) PreAuthorization has no branch column ⇒ provider scoping is provider-level only; F1.2 branch assignments cannot narrow a PA list. Noted for F3.8/F3.9. (2) The tRPC getById lacks the claims-router NOT_FOUND confinement check — left for F3.10 (PA detail read model), not widened here.
Evidence: preauth-read.service.test.ts (6, mock prisma) — operator/confined/provider/status/combined where + stable include+order; preauth-router (+2) — list forwards ctx.clientId (confined) vs null (operator). Full suite 1236 pass / 191 skip. tsc 0; brand PASS; currency PASS (683).
Verification note: the admin page change is a consumer swap preserving the exact projection (asserted by the read-model test); full browser verification needs a seeded authed session not available in this worktree — F3.8 (provider PA page) is the natural browser-verification point.
Feature-flag state: none (client confinement is always-on, session-derived).
Next allowed package: F3.8 — Provider PA list page (S).
Stop condition observed: yes — list read model + its existing consumers only (no provider page).
```

---

## F3.8 — Provider PA list page

```text
Work package: F3.8
Status: COMPLETE
Commit: 7406e54
ASSUMPTION (board-only): "Provider PA list page" = a provider-facing read-only list of the provider's own PAs, mirroring the provider claims page + consuming the F3.7 read model. Flagged to the user.
Files changed: src/app/provider/preauth/page.tsx (new), src/components/layouts/provider-nav-model.ts (Pre-auth def + preauth iconKey + providerPermits guard), src/components/layouts/ProviderNav.tsx (preauth→ShieldCheck), tests/components/provider-nav-model.test.ts (+4)
Schema/data changes: none
Behavior delivered: /provider/preauth resolves the F1.3 access context (resolveUserContext), server-authorizes via providerPermits(ctx.permissions, "provider.preauth.read") [nav ≠ boundary, §10.1], and lists PreauthReadService.list({ tenantId, providerId, status }) — provider-scoped (own facility only) with tenant + status filters. Read-only table (PA number, member, service, benefit, estimated, status). No create (F3.9) / no detail link (F3.10) yet.
Nav: added the Pre-auth item (group Care, requiredPermission provider.preauth.read) that the nav model's comment reserved for the F3–F9 packages; new "preauth" iconKey → ShieldCheck. New pure providerPermits(permissions, code) = server-side page-access guard mirroring computeProviderNav's legacy posture (migrated needs the perm; un-migrated allowed) — reusable by F3.9–F3.14.
Authorization posture: legacy-compatible — a migrated user (any provider.* perm) needs provider.preauth.read; an un-migrated user is allowed so the portal isn't broken pre-F1.9. Consistent with the nav so nav and page agree.
Evidence: provider-nav-model.test.ts (13, +4): /provider/preauth removed from the unfinished-route forbidden list (now finished); Pre-auth emitted iff provider.preauth.read; providerPermits allows migrated-with-perm + legacy, denies migrated-without-perm. Read-model provider scoping proven in F3.7. Full suite 1240 pass / 191 skip. tsc 0; brand PASS; currency PASS (684).
Verification: NOT browser-verified — worktree has no .env, port 3000 is held by a different (main-checkout) server lacking this branch's route, and no seeded provider session is available. The page is a read-only mirror of the proven provider claims page; its logic (scoping/gate/nav) is unit-covered. Visual confirmation deferred to a run with env + seed (or post-merge deploy).
FLAGS: (1) PA has no branch column — provider scoping is provider-level (branch assignments don't narrow; carried from F3.7). (2) The provider claims page (mirror) does not server-authorize per-page; this NEW page does (provider.preauth.read) — deliberate hardening for the new page, not applied retroactively to claims here.
Feature-flag state: none (permission-gated + session-derived).
Next allowed package: F3.9 — Provider PA submission page (M).
Stop condition observed: yes — list page only (no submission form, no detail page).
```

---

## F3.9 — Provider PA submission page (PROVIDER_PORTAL rail)

```text
Work package: F3.9
Status: COMPLETE
Commit: c0f5e04
ASSUMPTION (board-only): "Provider PA submission page" = a provider form submitting a PA through the canonical intake on the PROVIDER_PORTAL channel, mirroring provider claims/new. Flagged.
Files changed: src/app/provider/preauth/new/{page.tsx, ProviderPreauthForm.tsx, actions.ts} (new), src/app/provider/preauth/page.tsx (New button + submitted banner), tests/actions/provider-preauth-action.test.ts (new)
Schema/data changes: none
Behavior delivered: /provider/preauth/new server-authorizes via providerPermits(provider.preauth.create), blocks a non-ACTIVE contract, and renders a form (member number, service type, benefit, expected date, ICD diagnosis w/ datalist autofill, optional CPT + requested service, estimated cost, notes; draft-UUID idempotency key). The action submits PreauthIntakeService on the PROVIDER_PORTAL (provider-bound) channel — facility identity from the session ctx, NEVER the body (D1); member resolved + entitlement-gated inside the intake per the D3 flag (default OFF ⇒ tenant-only). Post-commit auto-decision = executeAutoDecision (same 10-gate pipeline as all rails). REJECTED → friendly error (member path names the entered number); success → redirect to the list with the PA number (+ replayed marker). List page (F3.8) gains a permission-gated "New pre-auth" button + submitted/replayed banner.
Authorization posture: legacy-compatible providerPermits (migrated needs provider.preauth.create; un-migrated allowed) — consistent with the list page + nav.
Evidence (action, security-critical): provider-preauth-action.test.ts (7): PROVIDER_PORTAL ctx from session + no body providerId; mapped command (diagnoses/procedures/estimate/idempotencyKey); executeAutoDecision handoff w/ system actor; success + replay redirects; deny without provider.preauth.create (no submit); member/estimate validation (no submit); REJECTED → friendly error. Full suite 1247 pass / 191 skip. tsc 0; brand PASS; currency PASS (687).
Verification: the ACTION carries the security/correctness weight and is unit-tested. The FORM (presentation) mirrors the proven provider claims form. NOT browser-verified — worktree has no .env, :3000 is held by a different (main-checkout) server lacking this branch's routes, no seeded provider session. Deferred to a run with env + seed (or post-merge deploy).
FLAG: member picker is a free-text member-number input (like claims/new); an entitlement-scoped async picker is not built here (the intake enforces entitlement server-side regardless).
Feature-flag state: none new (PROVIDER_PORTAL entitlement still behind the F1.11 D3 flag inside the intake).
Next allowed package: F3.10 — Canonical PA detail read model/page (M).
Stop condition observed: yes — submission page + its list-page affordances only.
```

---

## F3.10 — Canonical PA detail read model + provider detail page

```text
Work package: F3.10
Status: COMPLETE
Commit: 1b1fba7
ASSUMPTION (board-only): "detail read model/page" = non-enumerating scoped getById consolidating getPreAuthById + provider detail page + close the tRPC getById confinement gap (flagged in F3.7).
Files changed: src/server/services/preauth-read.service.ts (getById + PreauthDetailScope), src/server/trpc/routers/preauth.ts (getById + create read-back), src/app/(admin)/preauth/[id]/page.tsx (read swap), src/server/services/claims.service.ts (getPreAuthById removed), src/app/provider/preauth/[id]/page.tsx (new), src/app/provider/preauth/page.tsx (detail link), tests/services/preauth-read.service.test.ts (+5), tests/routers/preauth-router.test.ts (+3, create assertion updated)
Schema/data changes: none
Behavior delivered: PreauthReadService.getById({ tenantId, clientId?, providerId? }, id) — findFirst composing id+tenant+client-confinement(member.group.clientId)+provider scope; out-of-scope ⇒ null (NON-ENUMERATING, no existence probing); same include shape (member+group, provider, claim, documents) as the retired getPreAuthById. Provider detail page (read-only) resolves the F1.3 context, providerPermits(provider.preauth.read) gate, getById({tenantId,providerId}) → notFound() when null; renders core PA fields + diagnoses/procedures (PA JSON) + clinical notes + a canonical event timeline (listPreauthEvents, F3.2) showing PROVIDER-SAFE fields only (eventType/newStatus/safeReasonCode/date — never internalReasonRef). F3.8 list rows link to it.
Consolidation + security fix: retired ClaimsService.getPreAuthById (0 callers left). tRPC getById now reads through getById with ctx.clientId ?? null and NOT_FOUNDs a null — CLOSES a real gap (the old PA getById was tenant-only, unlike the claims router's already-confined getById). Admin detail page confined via session.user.clientId. tRPC create read-back is unscoped ({tenantId}) so a confined operator still receives the PA it just created.
Evidence: preauth-read.service (+5): getById where for operator/client/provider, non-enumerating null vs found row, include shape. preauth-router (+3): getById forwards ctx.clientId (confined) / null (operator), null ⇒ NOT_FOUND; create read-back asserted on getById({tenantId}). Full suite 1255 pass / 191 skip. tsc 0; brand PASS; currency PASS (688).
FLAG: the provider detail omits a documents section — the F2.8 authorized-download pattern (built for provider claim detail) has a PA analogue but is deferred here. Verification: read model + tRPC seam unit-tested; the provider detail PAGE is NOT browser-verified (worktree env — no .env, foreign :3000 server, no seeded provider session), consistent with F3.8/F3.9.
Feature-flag state: none (permission-gated + session-derived scope).
Next allowed package: F3.11 — Provider PA cancellation (M).
Stop condition observed: yes — detail read model + provider detail page + read-consumer consolidation only (no cancel/amend).
```

---

## F3.11 — Provider PA cancellation

```text
Work package: F3.11
Status: COMPLETE
Commit: 4997b30
ASSUMPTION (board-only): "Provider PA cancellation" = a provider cancels its OWN pre-use PA via the canonical cancel (not a bespoke transition). Flagged.
Files changed: src/app/provider/preauth/[id]/actions.ts (new), src/app/provider/preauth/[id]/CancelPreauthButton.tsx (new), src/app/provider/preauth/[id]/page.tsx (wire button), tests/actions/provider-preauth-cancel-action.test.ts (new)
Schema/data changes: none
Behavior delivered: cancelProviderPreauthAction — providerPermits(provider.preauth.cancel) gate; OWNERSHIP via the F3.10 non-enumerating scoped read (getById({tenantId,providerId}) null ⇒ safe not-found, no cross-provider probe); PRE-USE state gate (SUBMITTED/UNDER_REVIEW/APPROVED only — ATTACHED/UTILISED/terminal are not provider-cancellable, matching "before use"); then delegates to preauthAdjudicationService.cancelPreAuth (releases the benefit hold PR-011#3, sets CANCELLED, hash-chained audit). Canonical errors surface as friendly messages; success revalidates the detail page. CancelPreauthButton (client: reason + confirm + error) shows only when the viewer holds provider.preauth.cancel AND the PA is pre-use.
Evidence: provider-preauth-cancel-action.test.ts (6): canonical cancel called (id, tenant, actor, reason) + provider-scoped ownership read + revalidate on success; default reason; deny without permission (no read/cancel); safe not-found for another facility's PA (no cancel); refuse ATTACHED (no cancel); canonical error surfaced without revalidate. Full suite 1261 pass / 191 skip. tsc 0; brand PASS; currency PASS (690).
Verification: ACTION unit-tested (permission + ownership + state + canonical delegation); button (presentation) NOT browser-verified (worktree env, as F3.8–F3.10).
Feature-flag state: none.
Next allowed package: F3.12 — Provider PA amendment (M).
Stop condition observed: yes — cancellation only (no amendment).
```

---

## F3.12 — Provider PA amendment

```text
Work package: F3.12
Status: COMPLETE
Commit: 55226e4
ASSUMPTION (board-only): "Provider PA amendment" = a provider requests ADDITIONAL cover on its own APPROVED PA, via the canonical amendment creator + the same pipeline. No dedicated provider.preauth.amend permission exists ⇒ gated on provider.preauth.create (flagged).
Files changed: src/app/provider/preauth/[id]/actions.ts (amendProviderPreauthAction added), src/app/provider/preauth/[id]/AmendPreauthForm.tsx (new), src/app/provider/preauth/[id]/page.tsx (wire form), tests/actions/provider-preauth-amend-action.test.ts (new)
Schema/data changes: none
Behavior delivered: amendProviderPreauthAction — providerPermits(provider.preauth.create) gate; PARENT ownership + APPROVED via the F3.10 non-enumerating scoped read (blocks cross-provider amendment; createPaAmendment is only tenant-scoped); delegates to preauthAdjudicationService.createPaAmendment (a new PA-AMD linked via parentPreAuthId, inheriting member/provider/benefit — canonical, and UNWIRED until now: F3.12 is its first caller); then decides the amendment through the SAME executeAutoDecision pipeline as every rail (BENEFIT_CAP checks additional cost vs remaining). Handoff failure ⇒ amendment durable + SUBMITTED (deferred), request never fails. Redirects to the amendment detail. AmendPreauthForm (client: CPT + additional service + additional cost + notes) shows on the detail page only when the viewer holds provider.preauth.create AND the PA is APPROVED.
Evidence: provider-preauth-amend-action.test.ts (7): canonical createPaAmendment with mapped additional data + provider-scoped ownership read + pipeline decide + redirect; deny without permission (no read/create); safe not-found for another facility's parent; refuse non-APPROVED parent; validate cost + service; canonical error surfaced (no redirect); pipeline deferral still redirects. Full suite 1268 pass / 191 skip. tsc 0; brand PASS; currency PASS (691).
Verification: ACTION unit-tested; form (presentation) NOT browser-verified (worktree env, as F3.8–F3.11).
FLAG: amendment auto-decides via executeAutoDecision (chosen, since createPaAmendment had no prior caller/behavior to mirror) — consistent with the convergence; a plan that wanted amendments to always route-to-human would omit this.
Feature-flag state: none.
Next allowed package: F3.13 — PA-to-claim prefill and submit (M).
Stop condition observed: yes — amendment only (no PA→claim).
```

---

## F3.13 — PA-to-claim prefill and submit

```text
Work package: F3.13
Status: COMPLETE
Commit: 735bc6c
ASSUMPTION (board-only): "PA-to-claim prefill and submit" = a provider starts a claim from its own APPROVED PA via the canonical conversion (prefills from the PA + submits through the claim intake). Gated on provider.claim.create (flagged).
Files changed: src/app/provider/preauth/[id]/actions.ts (fileClaimFromPreauthAction added + writeAudit), src/app/provider/preauth/[id]/FileClaimButton.tsx (new), src/app/provider/preauth/[id]/page.tsx (wire button), tests/actions/provider-preauth-fileclaim-action.test.ts (new)
Schema/data changes: none
Behavior delivered: fileClaimFromPreauthAction — providerPermits(provider.claim.create) gate; ownership via the F3.10 scoped read; delegates to ClaimsService.createClaimWithPreauth (canonical PA→claim conversion: prefills member/provider/serviceType/benefit/DOS/diagnoses + ONE aggregate pre-authorised line at the approved amount, submits through ClaimIntakeService kind:preauthConversion, idempotent via preauthId:claim-create:v1, enforces APPROVED — returns the existing claim for a converted PA); writes a PREAUTH_ATTACHED audit (mirrors the admin convertToClaimAction); redirects to the new provider claim. FileClaimButton (client) shows on the detail page only when the viewer holds provider.claim.create AND the PA is APPROVED.
Audit-coverage CATCH: the PR-020 harness flagged fileClaimFromPreauthAction because ClaimsService.createClaimWithPreauth is not in its recognized-auditing-service set (unlike PreauthIntakeService.submit / cancelPreAuth / executeAutoDecision used by the other rails, which were NOT flagged). Fixed by adding the explicit PREAUTH_ATTACHED writeAudit (also the correct behavior — mirrors admin).
Evidence: provider-preauth-fileclaim-action.test.ts (4): canonical conversion + provider-scoped ownership read + PREAUTH_ATTACHED audit + redirect; deny without provider.claim.create (no read/convert); safe not-found for another facility's PA; canonical error surfaced without redirect. Audit-coverage harness green. Full suite 1272 pass / 191 skip. tsc 0; brand PASS; currency PASS (692).
Verification: ACTION unit-tested; button (presentation) NOT browser-verified (worktree env, as F3.8–F3.12).
Feature-flag state: none.
Next allowed package: F3.14 — Authorized GOP/LOU artifact (M).
Stop condition observed: yes — PA→claim conversion only (no GOP artifact).
```

---

## F3.14 — Authorized GOP artifact (Phase F3 COMPLETE)

```text
Work package: F3.14 — completes Phase F3
Status: COMPLETE
Commit: 55f860b
ASSUMPTION (board-only): "Authorized GOP/LOU artifact" = a downloadable Guarantee of Payment for an APPROVED PA, on the already-authorized provider detail page. LOU = the existing admin/cross-border artifact; this is the provider GOP. Flagged.
Files changed: src/app/provider/preauth/[id]/{gop-artifact.ts, GopDocument.tsx, GopButton.tsx} (new), src/app/provider/preauth/[id]/page.tsx (wire button), tests/services/gop-artifact.test.ts (new)
Schema/data changes: none
Behavior delivered: buildGopData(pa) (pure) → printable GOP fields, null unless APPROVED AND gopNumber issued. GopDocument (@react-pdf/renderer, mirrors DebitNote house style) renders GOP/PA refs, provider, member, authorized service + validity, guaranteed amount, and a guarantee statement (payment scoped to active cover/benefit limits/valid claim; void if cancelled/expired). GopButton (client) downloads GOP-<n>.pdf via pdf().toBlob(). Detail page shows the download whenever buildGopData(pa) is non-null.
Authorization: generated on-the-fly from PA data the already-authorized detail page provided (provider.preauth.read + F3.10 provider-scoped non-enumerating getById) — not a stored file, so NO F2 storage/download flow and no new gate.
Brand: "Medvex" (house PDF brand, like DebitNote); the brand guard flags only legacy "avenue" + rendered "AiCare" — both absent (guard green, 695 files).
Evidence: gop-artifact.test.ts (4): maps APPROVED+GOP (fields + humanized benefit + amount); null for non-APPROVED + APPROVED-without-gopNumber; tolerates null amount(→0)/dates(→"—"). Full suite 1276 pass / 191 skip. tsc 0; brand PASS; currency PASS (695).
Verification: pure mapper unit-tested; PDF document + button (presentation) NOT browser-verified (worktree env, as F3.8–F3.13).
Feature-flag state: none.

*** PHASE F3 COMPLETE (F3.1–F3.14). The canonical PA rail: single write path (intake+pipeline, all rails converged, one creator), scoped read models (list+detail, client-confined + non-enumerating), and the full provider PA surface (list/submit/detail/cancel/amend/PA→claim/GOP). F3.7–F3.14 were executed from the board's one-line descriptions (detailed plan not in-repo) with per-package assumptions flagged; all provider UI is service/action-unit-tested but NOT browser-verified. ***
Next allowed package: F4.1 — Information-request schema + catalogs (M).
Stop condition observed: yes — GOP artifact only.
```

---

## F4.1 — Information-request schema + catalog

```text
Work package: F4.1 (Phase F4 begins)
Status: COMPLETE
Commit: 105a7a6
ASSUMPTION (board-only): "Information-request schema + catalogs" = the model + catalog for the F4 clinical-info-request lifecycle (reviewer asks a provider for more before deciding; open→respond→accept/reopen/close). Model shape inferred from the F4.2–F4.10 board rows. Flagged.
Files changed: prisma/schema.prisma (PreauthInfoRequest model + PreauthInfoRequestStatus enum), src/server/services/preauth-info-request/catalog.ts (new), tests/services/preauth-info-request-catalog.test.ts (new), tests/services/preauth-info-request-schema.test.ts (new)
Schema/data changes: ADDITIVE — new table PreauthInfoRequest + new enum PreauthInfoRequestStatus, no change to existing tables. Pushed to the throwaway PG (127.0.0.1:54329/pnos_uat, DIRECT_URL confirmed, datasource line verified). Applies to prod on the next build's prisma db push. Client regenerated WITH DIRECT_URL (F3.2 landmine) — preauthInfoRequest accessor present (186 type refs).
Behavior delivered: PreauthInfoRequest — relation-less PA satellite (F3.2 pattern): scoped by tenantId + preAuthorizationId + providerId (clientId/memberId for inbox/confinement); per-PA sequence with UNIQUE(preAuthorizationId, sequence); catalog-coded requestedItems (String[]); reviewer prompt; SLA dueAt; open/respond/decide actor+timestamp fields; MUTABLE status OPEN→RESPONDED→ACCEPTED|REOPENED|CLOSED|CANCELLED. Indexes: (tenant,provider,status) provider inbox, (tenant,status,dueAt) SLA sweeper, (preAuthorizationId). Catalog (pure): INFO_REQUEST_ITEMS (8 types) + isValidInfoRequestItem / normalizeRequestedItems (upcase/trim, drop-unknown, de-dupe, order-preserving) / infoRequestItemLabel. No service/UI/lifecycle here (F4.2+).
Evidence: catalog test (5, pure) — integrity/normalize/validate/label; schema test (4, REAL DB on throwaway PG) — default OPEN + array persist + null response fields; UNIQUE(paId,sequence) enforced; OPEN→RESPONDED→ACCEPTED mutation; inbox-scope query. Full suite (no DB env) 1281 pass / 195 skip. tsc 0; brand PASS; currency PASS (696).
Feature-flag state: none (inert schema + pure catalog until F4.2 wires the service).
Next allowed package: F4.2 — Request open/cancel service (M).
Stop condition observed: yes — schema + catalog only.
```

---

## F4.2 — Information-request open/cancel service

```text
Work package: F4.2
Status: COMPLETE
Commit: 5787af9
ASSUMPTION (board-only): "Request open/cancel service" = reviewer-side OPEN + CANCEL on the F4.1 schema; provider response (F4.3) + reviewer accept/reopen/close (F4.4) separate. Flagged.
Files changed: src/server/services/preauth-info-request/service.ts (new), src/server/services/preauth-intake/events.ts (+INFO_REQUEST_CANCELLED type), tests/factories/provider-network.ts (teardown clears preauthInfoRequest), tests/services/preauth-info-request-service.test.ts (new)
Schema/data changes: none (uses the F4.1 model + F3.2 event log)
Behavior delivered: PreauthInfoRequestService.open — normalizes requestedItems against the F4.1 catalog (empty ⇒ NO_ITEMS), requires a prompt (NO_PROMPT), loads the tenant-scoped PA (PA_NOT_FOUND), requires SUBMITTED/UNDER_REVIEW (PA_NOT_OPENABLE); in ONE tx derives the per-PA sequence, creates the OPEN request (provider/member/clientId from the PA, dueAt = now + 72h default), and appends an INFO_REQUESTED PA event with SAFE metadata { infoRequestId, sequence, itemCount } (never the prompt/clinical text). Does NOT change PA status. cancel — withdraws OPEN/RESPONDED/REOPENED → CANCELLED + INFO_REQUEST_CANCELLED event; guards terminal states (NOT_CANCELLABLE) + NOT_FOUND. Typed InfoRequestError(code,message) for all business violations. Constants exported: INFO_REQUEST_OPENABLE_PA_STATUSES, INFO_REQUEST_CANCELLABLE_STATUSES, DEFAULT_INFO_REQUEST_DUE_HOURS.
No UI/permission here (actor-parameterized; F4.4 surface enforces the reviewer permission). Added INFO_REQUEST_CANCELLED to PREAUTH_EVENT_TYPES (the union already had INFO_REQUESTED/RESPONSE_SUBMITTED/RESPONSE_ACCEPTED). Factory teardown extended for the F4.1 satellite.
Evidence: service test (4, REAL DB throwaway PG): open normalizes items + provider/member scope + SLA + INFO_REQUESTED event (prompt NOT in metadata); per-PA sequence 1,2; rejects empty-items/empty-prompt/unknown-PA/non-pre-decision-PA with correct codes; cancel → CANCELLED + event, guards NOT_CANCELLABLE + NOT_FOUND. Full suite (no DB env) 1281 pass / 199 skip. tsc 0; brand PASS; currency PASS (697).
Feature-flag state: none.
Next allowed package: F4.3 — Provider draft + explicit response submit (M).
Stop condition observed: yes — open/cancel only (no provider response, no reviewer decision).
```

---

## F4.3 — Provider explicit response submit

```text
Work package: F4.3
Status: COMPLETE
Commit: f366374
ASSUMPTION (board-only): "draft" read as CLIENT-SIDE form state (F4.7 respond form); "explicit submit" = the deliberate server-persisted submit. NO server-persisted resumable-draft field added (schema gold-plating the plan may not intend). Flagged.
Files changed: src/server/services/preauth-info-request/service.ts (+submitResponse, +INFO_REQUEST_RESPONDABLE_STATUSES), src/app/provider/preauth/[id]/info-request-actions.ts (new), tests/services/preauth-info-request-service.test.ts (+1 real-DB), tests/actions/provider-info-response-action.test.ts (new)
Schema/data changes: none
Behavior delivered: PreauthInfoRequestService.submitResponse — requires a non-empty response (NO_RESPONSE); loads the request scoped by tenant + optional providerId (a request not this facility's ⇒ non-enumerating NOT_FOUND); requires RESPONDABLE (OPEN/REOPENED, else NOT_RESPONDABLE); ONE tx sets RESPONDED + responseNote + respondedBy/At + a RESPONSE_SUBMITTED PA event (safe metadata; response text stays on the row). Provider action submitInfoResponseAction: gated provider.preauth.respond; passes ctx.providerId (facility ownership); validates non-empty; on success writes a compliance PREAUTH_INFO_RESPONSE_SUBMITTED audit (PA event = domain timeline, writeAudit = tamper-evident trail; satisfies PR-020, mirrors F3.13) + revalidates the PA detail. No page (F4.7).
Audit-coverage: harness flagged the new action (PreauthInfoRequestService.submitResponse is not a KNOWN_AUDITING_TOKEN — it appends a PA event, not a chain audit). Fixed by the explicit writeAudit in the action (honest + minimal, no catalogue change).
Evidence: service test +1 (REAL DB): OPEN→RESPONDED + RESPONSE_SUBMITTED, guards NO_RESPONSE / cross-facility NOT_FOUND / NOT_RESPONDABLE. action test (4, mock): facility-scoped submit + audit + revalidate; deny without permission; empty-response validation; service error surfaced without revalidate. Audit-coverage green. Full suite (no DB env) 1285 pass / 200 skip. tsc 0; brand PASS; currency PASS (698).
Feature-flag state: none.
Next allowed package: F4.4 — Reviewer accept/reopen/close (M).
Stop condition observed: yes — provider response submit only (no reviewer decision, no page).
```

---

## F4.4 — Reviewer accept/reopen/close

```text
Work package: F4.4
Status: COMPLETE
Commit: a252014
ASSUMPTION (board-only): reviewer decision on a submitted response; no dedicated reviewer permission ⇒ admin actions gated on the CLINICAL review role (like PA adjudication). Flagged.
Files changed: src/server/services/preauth-info-request/service.ts (+accept/reopen/close + applyDecision helper + constants), src/server/services/preauth-intake/events.ts (+RESPONSE_REOPENED, +INFO_REQUEST_CLOSED), src/app/(admin)/preauth/[id]/info-request-actions.ts (new), tests/services/preauth-info-request-service.test.ts (+1 real-DB), tests/actions/admin-info-request-decision-action.test.ts (new)
Schema/data changes: none
Behavior delivered: service accept/reopen/close via a shared applyDecision (guard from-state → flip status + decision actor/timestamp → matching PA event). accept RESPONDED→ACCEPTED+RESPONSE_ACCEPTED (sanctions reprocessing, F4.5); reopen RESPONDED→REOPENED+RESPONSE_REOPENED (REOPENED respondable again per F4.3); close any-live(OPEN/RESPONDED/REOPENED/ACCEPTED)→CLOSED+INFO_REQUEST_CLOSED. Typed InfoRequestError (NOT_ACCEPTABLE/NOT_REOPENABLE/NOT_CLOSABLE/NOT_FOUND). Constants exported. Admin actions requireRole(ROLES.CLINICAL) → delegate → PREAUTH_INFO_ACCEPTED/REOPENED/CLOSED compliance audit → revalidate the PA detail. Object inputs (UI wired in F4.7).
Evidence: service +1 (REAL DB): accept (early-accept blocked, RESPONDED→ACCEPTED+event), reopen (→REOPENED, provider re-responds), close (→CLOSED+event, re-close NOT_CLOSABLE). admin actions (5, mock): CLINICAL gate + delegate + audit + revalidate for accept/reopen/close, service error surfaced, missing-id validation. Audit-coverage green. Full suite (no DB env) 1290 pass / 201 skip. tsc 0; brand PASS; currency PASS (699).
Feature-flag state: none.
Next allowed package: F4.5 — Sanctioned claim reprocessing after acceptance (S).
Stop condition observed: yes — reviewer decisions only (no reprocessing hook, no page).
```

---

## F4.5 — Sanctioned-reprocessing read

```text
Work package: F4.5
Status: COMPLETE
Commit: f208141
DECISION (user-ratified): "mark sanctioned, human re-decides" — acceptance (RESPONSE_ACCEPTED, F4.4) IS the sanction marker; F4.5 adds NO automatic decision-pipeline re-run (money spine untouched — PNOS never creates a second decision path).
Files changed: src/server/services/preauth-info-request/service.ts (+listReprocessable), tests/services/preauth-info-request-service.test.ts (+1 real-DB)
Schema/data changes: none
Behavior delivered: PreauthInfoRequestService.listReprocessable(scope) — surfaces PAs whose info request is ACCEPTED while the PA is still UNDECIDED (SUBMITTED/UNDER_REVIEW), i.e. info in-hand + awaiting a human re-decision on the existing PA workbench. Two-step (relation-less): accepted requests in scope → filter to still-undecided PAs. Scoped like F3.7 (client confinement + optional provider). Pure read — never decides, never touches a hold.
FLAG: the queue UI (reviewer "ready to re-decide" list) is F4.6/F4.7. The board's "claim reprocessing" is realized as PA re-decision surfacing — info requests are PA-scoped throughout F4.1–F4.4 (no claim link); the reviewer re-decides the PA via existing tools, unblocking any downstream claim.
Evidence: service test +1 (REAL DB): includes accepted-and-still-undecided; excludes accepted-then-decided + responded-but-not-accepted; other client sees none. Full suite (no DB env) 1290 pass / 202 skip. tsc 0; brand PASS; currency PASS (699).
Feature-flag state: none.
Next allowed package: F4.6 — Canonical provider inbox projection (M).
Stop condition observed: yes — read model only (no UI, no auto re-decision).
```

---

## F4.6 — Canonical provider inbox projection

```text
Work package: F4.6
Status: COMPLETE
Commit: d962299
ASSUMPTION (board-only): projection of the provider's actionable info requests (F4 domain). Flagged.
Files changed: src/server/services/preauth-info-request/inbox.ts (new), tests/services/preauth-info-request-inbox.test.ts (new)
Schema/data changes: none
Behavior delivered: providerInboxProjection(scope) — provider's info requests AWAITING it (default OPEN/REOPENED via PROVIDER_INBOX_DEFAULT_STATUSES; callers may widen), joined with PA+member context (preauthNumber, member name/number) via a relation-less two-step, ordered by dueAt asc then openedAt, with an `overdue` flag (dueAt < now; now injectable). Provider-scoped. Pure read.
FLAG: info-requests only for now (other actionable families unionable later without changing callers); the inbox list + detail UI is F4.7.
Evidence: inbox test (1, REAL DB): OPEN+REOPENED projected (RESPONDED excluded by default) + PA/member context; overdue sorts before 48h + overdue=true; another facility sees none; widened statuses surface RESPONDED. Full suite (no DB env) 1290 pass / 203 skip. tsc 0; brand PASS; currency PASS (700).
Feature-flag state: none.
Next allowed package: F4.7 — Inbox list + info-request detail pages (M).
Stop condition observed: yes — projection only (no pages).
```

---

## F4.7 — Provider inbox list + info-request detail pages

```text
Work package: F4.7
Status: COMPLETE
Commit: 6193427
ASSUMPTION (board-only): the PROVIDER inbox (list + detail-to-respond) on F4.6 projection + F4.3 action. Flagged.
Files changed: src/server/services/preauth-info-request/service.ts (+getForProvider), src/components/layouts/provider-nav-model.ts (+Inbox item, +inbox iconKey), src/components/layouts/ProviderNav.tsx (+Inbox icon), src/app/provider/inbox/page.tsx (new), src/app/provider/inbox/[id]/page.tsx (new), src/app/provider/inbox/[id]/RespondForm.tsx (new), tests/components/provider-nav-model.test.ts (+1), tests/services/preauth-info-request-service.test.ts (+1 real-DB)
Schema/data changes: none
Behavior delivered: /provider/inbox (providerPermits(provider.preauth.read) gate → providerInboxProjection list, SLA order + overdue + catalog labels, rows link to detail); /provider/inbox/[id] (getForProvider non-enumerating null⇒404 + F3.10 PA context; requested items + reviewer note + prior response; respond form only when provider.preauth.respond + OPEN/REOPENED); RespondForm (client → F4.3 submitInfoResponseAction → refresh). New nav Inbox item (Home group, provider.preauth.read) → Inbox icon. New service getForProvider (provider-scoped, non-enumerating).
FLAG: the REVIEWER admin UI (triggers for F4.2 open/cancel + F4.4 accept/reopen/close on the admin PA detail) is NOT built — the actions exist + are tested, but their admin-surface wiring is a remaining gap (F4.7 is the provider inbox; reviewer panel = targeted follow-up). Pages NOT browser-verified (worktree env, as F3.8+).
Evidence: provider-nav-model (+1): /provider/inbox now finished, Inbox follows provider.preauth.read. service (+1 real DB): getForProvider owns-only (null for another facility). Full suite (no DB env) 1291 pass / 204 skip. tsc 0; brand PASS; currency PASS (703).
Feature-flag state: none.
Next allowed package: F4.8 — Notification/outbox schema + dispatcher (M). DESIGN NOTE: email worker unprovisioned → plan an OUTBOX (persist rows + pluggable delivery; in-app now, email deferred to a future worker draining pending rows).
Stop condition observed: yes — provider inbox pages only.
```

---

## F4.8 — Notification outbox schema + dispatcher

```text
Work package: F4.8
Status: COMPLETE
Commit: f76bf95
ASSUMPTION + DESIGN (board-only): transactional OUTBOX chosen because the email worker is unprovisioned + no provider-notification model exists — persist intent now, deliver email later with zero schema/producer change. Flagged.
Files changed: prisma/schema.prisma (NotificationOutbox model + NotificationOutboxStatus enum), src/server/services/notifications/outbox.ts (new), tests/services/notification-outbox.test.ts (new)
Schema/data changes: ADDITIVE — new NotificationOutbox table + enum. Pushed to throwaway PG (54329, datasource verified); prod applies on next build. Client regenerated WITH DIRECT_URL (F3.2 landmine) — accessor present.
Behavior delivered: NotificationOutboxService.enqueue (PENDING; idempotent on dedupeKey — @@unique(tenantId,dedupeKey), NULLs distinct so keyless enqueues aren't blocked); dispatch(opts, deps) drains PENDING via a pluggable delivery port — IN_APP→SENT immediately (row = in-app notice); EMAIL+deps.deliverEmail→SENT/SKIPPED per the port; EMAIL with NO port (today)→SKIPPED "email delivery not provisioned"; error→FAILED+attempts++; returns {processed,sent,skipped,failed}, re-runnable. listProviderNotifications (SENT in-app for a provider, unreadOnly option); markRead (provider-scoped updateMany). Relation-less. No producer enqueues yet (F4.9) and no sweeper runs dispatch (F4.10).
Evidence: outbox test (4, REAL DB): enqueue PENDING + dedupe idempotency (1 row); dispatch IN_APP→SENT + EMAIL-no-port→SKIPPED(not provisioned); EMAIL-with-port→SENT; listProviderNotifications + provider-scoped unreadOnly + markRead (cross-provider markRead false). Full suite (no DB env) 1291 pass / 208 skip. tsc 0; brand PASS; currency PASS (704).
Feature-flag state: none (inert until F4.9 producers + F4.10 sweeper).
Next allowed package: F4.9 — Migrate provider events to dispatcher (per family) (XS/fam).
Stop condition observed: yes — outbox + dispatcher only (no producers wired, no sweeper).
```

---

## F4.9 — Migrate the info-request family to the outbox dispatcher

```text
Work package: F4.9
Status: COMPLETE
Commit: 18d9d6d
ASSUMPTION (board-only): "per family" ⇒ do the info-request family now; claims/settlements families later. Flagged.
Files changed: src/server/services/preauth-info-request/service.ts (enqueue in open/cancel/applyDecision), tests/factories/provider-network.ts (teardown clears notificationOutbox), tests/services/preauth-info-request-service.test.ts (+1 real-DB)
Schema/data changes: none (uses the F4.8 outbox)
Behavior delivered: the provider-directed transitions enqueue an IN_APP provider notification via NotificationOutboxService.enqueue IN THE SAME TX as the state change (transactional outbox ⇒ exactly-once). open→INFO_REQUESTED(HIGH); reopen→RESPONSE_REOPENED(HIGH); accept→RESPONSE_ACCEPTED; cancel→INFO_REQUEST_CANCELLED; close→INFO_REQUEST_CLOSED. Each has href /provider/inbox/<id> + safe metadata {infoRequestId,preauthId}. applyDecision/cancel selects gained providerId; accept/reopen/close pass notify copy via the spec. Reviewer-directed transition (submitResponse) is a separate reviewer family — deferred.
Evidence: service +1 (REAL DB): open enqueues PENDING INFO_REQUESTED IN_APP (HIGH, correct href); reopen→RESPONSE_REOPENED; accept→RESPONSE_ACCEPTED; cancel→INFO_REQUEST_CANCELLED (matched via JSON metadata infoRequestId). Rows are PENDING until a dispatcher runs (F4.10). Full suite (no DB env) 1291 pass / 209 skip. tsc 0; brand PASS; currency PASS (704).
Feature-flag state: none.
Next allowed package: F4.10 — SLA sweepers + operational queues (M).
Stop condition observed: yes — info-request family only (reviewer family + other families deferred).
```

---

## F4.10 — Info-request SLA sweeper + operational queue (Phase F4 COMPLETE)

```text
Work package: F4.10 — completes Phase F4
Status: COMPLETE
Commit: e0bdccb
ASSUMPTION (board-only): info-request SLA sweeper + overdue queue (the F4 domain). Flagged.
Files changed: src/server/services/preauth-info-request/sweeper.ts (new), tests/services/preauth-info-request-sweeper.test.ts (new)
Schema/data changes: none
Behavior delivered: PreauthInfoRequestSweeper.sweepOverdueInfoRequests — idempotent batch job: awaiting-provider (OPEN/REOPENED) + dueAt<now → HIGH provider reminder via the F4.8 outbox, deduped per request per calendar day (dedupeKey INFO_OVERDUE:<id>:<day>); no PA event, no info-request mutation; returns {overdue}. overdueInfoRequests — scoped operational-queue read. Notification delivery = NotificationOutboxService.dispatch (F4.8) on the same schedule. Plain services (a future cron/worker invokes them; none provisioned here).
Evidence: sweeper test (1, REAL DB): overdue→reminded; not-due→not; RESPONDED-but-overdue→not (not awaiting provider); re-sweep same day→deduped (1 reminder); overdueInfoRequests queue matches. Full suite (no DB env) 1291 pass / 210 skip. tsc 0; brand PASS; currency PASS (705).
Feature-flag state: none.

*** PHASE F4 COMPLETE (F4.1–F4.10). Clinical-information-request rail: lifecycle (schema/open/cancel/respond/accept/reopen/close/sanctioned-read) + provider inbox pages + transactional notification outbox/dispatcher (email deferred) + in-tx family emit + SLA sweeper. Built from the board's one-line rows with per-package assumptions flagged; services/projections REAL-DB tested on the throwaway PG; F4.7 pages not browser-verified. Flagged gaps: reviewer admin UI (F4.2/F4.4 triggers) + reviewer notification family. ***
Next allowed package: F5.1 (first row of Phase F5 — claim withdrawal/correction/resubmission/reconsideration, 17 pkgs).
Stop condition observed: yes — SLA sweeper + queue only.
```

---

## F5.1 — Characterize every claim-status consumer (Phase F5 begins)

```text
Work package: F5.1
Status: COMPLETE
Commit: fef86a6
Files changed: docs/provider-network-os/CLAIM_STATUS_CONSUMERS.md (new). No code/schema — read-only characterization (like F0.x).
Method: full src/ sweep (search agent) + verified against claim-lifecycle.ts and the mutation-guard test.
Findings (authoritative for F5.2–F5.17): ClaimStatus has 12 values. THE central authority is claim-lifecycle.ts — TRANSITIONS is a Record<ClaimStatus, ClaimStatus[]> so adding an enum value is a COMPILE ERROR there until handled (the one forced point); isTerminalClaimStatus is graph-derived. claim-status-mutation-guard.test.ts walks src/** and fails on any claim.update({status}) outside its ALLOWLIST (and on stale entries) — every F5 status-writer must be allowlisted + go through assertClaimTransition. Writers today: persist.ts (create RECEIVED), claim-decision (decide/void), claim-adjudication (appeal→APPEALED, settle→PAID), reimbursement (→PAID), pre-decision admin/fraud actions. Terminal/"open"/"decided" assumptions are scattered across ~15 gates (group 3) + report-exclusions.FULLY_DECLINED (group 5) — the silent-omission risk. APPEAL_APPROVED/APPEAL_DECLINED are UNREACHABLE (never written) — appeal-resolution unimplemented (F5.17 consolidates). Exhaustiveness: only TRANSITIONS is compiler-forced; curated arrays + includes/in gates are silent; badge renderers are cosmetic (default fallback).
Deliverable: the doc's "Implications for F5" is an ordered threading checklist + a flagged DESIGN FORK — F5 prefers a submission-chain/supersession model (a corrected/resubmitted claim is a NEW linked claim, original superseded) over in-place status flips, to keep already-posted GL/settlement/usage intact. Confirm at F5.2/F5.3.
Quality: docs only; brand PASS; currency PASS (705). No tsc/test run needed.
Next allowed package: F5.2 — Claim submission-chain schema (M).
Stop condition observed: yes — characterization only.
```

---

## F5.2 — Claim submission-chain schema + read

```text
Work package: F5.2
Status: COMPLETE
Commit: fc063c2
Files changed: prisma/schema.prisma (Claim lineage fields + ClaimSubmissionType enum + 2 indexes), src/server/services/claim-submission-chain/service.ts (new), tests/services/claim-submission-chain.test.ts (new)
Schema/data changes: ADDITIVE — Claim gains submissionType (ClaimSubmissionType @default ORIGINAL), chainRootClaimId?, supersedesClaimId?, supersededByClaimId?, supersededAt? + indexes(chainRootClaimId, supersedesClaimId); new enum ClaimSubmissionType. Does NOT touch the mutation-guarded `status` field. Pushed to throwaway PG (54329, verified); prod on next build. Client regenerated WITH DIRECT_URL.
Behavior delivered: the supersession model (F5.1-flagged) — a corrected/resubmitted/reconsidered claim is a NEW claim linked to a superseded original (chainRootClaimId=root, supersedesClaimId=predecessor, original.supersededByClaimId=successor), so posted GL/settlement/usage on the original is untouched. ClaimSubmissionChainService.getChain(scope, claimId): resolve root (chainRootClaimId ?? self) → all versions oldest-first with lineage+display fields; scoped (tenant + optional client/provider), out-of-scope ⇒ [] non-enumerating. Pure read. Un-backfilled claim = singleton chain. Population deferred to F5.4 (backfill/new original) + F5.7 (atomic replacement).
Evidence: chain test (2, REAL DB): chain resolved from either end oldest-first, provider-scoped (out-of-scope ⇒ []); unlinked claim = singleton (ORIGINAL, null supersededByClaimId). Full suite (no DB env) 1291 pass / 212 skip. tsc 0; brand PASS; currency PASS (706).
Feature-flag state: none (inert schema + read until F5.4/F5.7).
Next allowed package: F5.3 — Lifecycle: withdrawal/supersession terminal (M). NOTE: this ADDS claim statuses → must thread claim-lifecycle.ts TRANSITIONS (compile-forced) + mutation-guard ALLOWLIST + the terminal-status assumptions from F5.1 (ACTIVE_QUEUE_STATUSES, report-exclusions, editable/decided gates).
Stop condition observed: yes — chain schema + read only (no population, no lifecycle statuses).
```

---

## F5.3 — Withdrawal/supersession terminal claim statuses

```text
Work package: F5.3
Status: COMPLETE
Commit: 538e5f6
Files changed: prisma/schema.prisma (ClaimStatus +=WITHDRAWN,SUPERSEDED), claim-lifecycle.ts (TRANSITIONS), report-exclusions.ts, claim-autopilot/evaluate.ts, claims.service.ts, (admin)/claims/page.tsx, (admin)/claims/[id]/{PreauthPanel,AutomationPanel}.tsx, automation-actions.ts, tests/services/claim-lifecycle.test.ts (+1)
Schema/data changes: ADDITIVE — ClaimStatus enum += WITHDRAWN, SUPERSEDED. Pushed to throwaway PG (verified), prod on next build. Does NOT add a status-WRITER (F5.5/F5.7 do), so the claim-status-mutation-guard ALLOWLIST is unchanged.
Behavior delivered: two terminal statuses. WITHDRAWN = provider abandoned pre-decision; SUPERSEDED = replaced by a corrected chain version. Transition graph (compile-forced authority): both terminal, reachable ONLY from pre-decision states (RECEIVED/CAPTURED/UNDER_REVIEW → {WITHDRAWN,SUPERSEDED}; INCURRED → WITHDRAWN). Decided/settled claims can never be silently withdrawn/superseded; DECLINED stays DECLINED (resubmission LINKS, F5.10). Preserves posted GL/settlement/usage.
Threaded consumers (F5.1 checklist): report-exclusions.FULLY_DECLINED (excluded from paid/AR); dup-detection notIn (superseded/withdrawn original does NOT block resubmission — critical F5.10); claims.service PA-attach block; (admin)/claims STATUSES dropdown + decided set; PreauthPanel editable + AutomationPanel/automation-actions decidable. isTerminalClaimStatus + ACTIVE_QUEUE_STATUSES unchanged (graph-derived / open whitelist). Badge renderers auto-fallback (cosmetic).
Evidence: lifecycle test +1: both terminal; legal from pre-decision (+INCURRED→WITHDRAWN); illegal from APPROVED/PARTIALLY_APPROVED/PAID/VOID/DECLINED + out of terminals. Full suite (no DB env) 1292 pass / 212 skip; mutation-guard GREEN (no new writer). tsc 0; brand PASS; currency PASS (706).
Feature-flag state: none (statuses inert until F5.5/F5.7 write them).
Next allowed package: F5.4 — Create/backfill original chains (per batch) (S/batch).
Stop condition observed: yes — statuses + graph + read-consumer threading only (no writer service).
```

---

## F5.4 — Create/backfill original submission chains

```text
Work package: F5.4
Status: COMPLETE
Commit: 91517ba
Files changed: src/server/services/claim-intake/persist.ts (self-root new claims), src/server/services/claim-submission-chain/backfill.ts (new), scripts/pnos-backfill-claim-chains.ts (new), tests/services/claim-chain-backfill.test.ts (new), tests/services/claim-intake-persist.test.ts (mock tx +claim.update)
Schema/data changes: none (data migration only — sets chainRootClaimId on existing rows via the ops script)
Behavior delivered: every claim is self-rooted (chainRootClaimId = own id). persist.ts self-roots new claims in the same tx after create (a chainRootClaimId update — NOT a status write, so the mutation guard is unaffected; verified green). backfillOriginalChains({tenantId?, batchSize?, dryRun?}) — batched, idempotent (only null-root rows; processed rows drop out so the loop advances cursorless and a re-run is a no-op), resumable; dryRun counts. scripts/pnos-backfill-claim-chains.ts wraps it (dry-run default, --apply, --tenant). New claims are born self-rooted, so the backfill is a one-time migration for pre-F5.4 rows.
Evidence: backfill test (1, REAL DB): dry-run counts + no write; apply self-roots all null-root (batchSize 2 ⇒ ≥2 batches); re-run no-op. mutation-guard 3/3 (persist's chainRootClaimId update not flagged). persist unit 5/5 (mock tx gained claim.update). Full suite (no DB env) 1292 pass / 213 skip. tsc 0; brand PASS; currency PASS (707).
Feature-flag state: none.
Next allowed package: F5.5 — Simple provider withdrawal service (M). NOTE: F5.5 is the FIRST F5 status-WRITER (writes WITHDRAWN) → must add its file to the claim-status-mutation-guard ALLOWLIST + go through assertClaimTransition. Pre-decision withdrawal is "simple" (no posted GL/hold to reverse).
Stop condition observed: yes — self-root create + backfill only (no withdrawal service).
```

---

## F5.5 — Simple provider withdrawal service

```text
Work package: F5.5
Status: COMPLETE
Commit: 21d0e68
Proof-before-build classification: MISSING (no claim WITHDRAWN writer existed; all dependencies — F5.3 statuses, F5.4 chains, F1.1 provider.claim.withdraw perm, F1.3 ProviderAccessService, F4.8 outbox, inSerializableTx, auditChainService — already in place).
Files changed: src/server/services/claim-withdrawal/catalog.ts (new — closed reason catalog + normalize), src/server/services/claim-withdrawal/service.ts (new — ClaimWithdrawalService.withdraw), tests/services/claim-status-mutation-guard.test.ts (ALLOWLIST +1: the new writer), tests/factories/provider-network.ts (teardown clears AdjudicationLog before claims), tests/services/claim-withdrawal.service.test.ts (new — 21 real-DB tests).
Schema/data changes: NONE. Uses the F5.3 WITHDRAWN status + existing Claim fields only. No prisma db push needed (DB already at F5.4 schema).
Behavior delivered: the FIRST F5 status-WRITER. An entitled provider abandons an UNDECIDED claim it owns → terminal WITHDRAWN. "Simple" = pre-decision, so there is NO posted GL/usage/hold/voucher/settlement to reverse (a hold is a PA concept, never placed on a claim at intake) — the service mutates ZERO money. Flow: authorize (requirePermission provider.claim.withdraw) → normalize catalog reason → load claim SCOPED to ctx.providerId (out-of-scope ⇒ non-enumerating NOT_FOUND) → branch guard on a branch-stamped claim → idempotent fast-path (already WITHDRAWN ⇒ alreadyWithdrawn:true) → pre-tx guards (NOT_WITHDRAWABLE for decided/terminal; HAS_FINANCIAL_EFFECT for any money fact) → inSerializableTx { in-tx fund re-check; assertClaimTransition; **status-guarded CAS** updateMany WHERE status IN {INCURRED,RECEIVED,CAPTURED,UNDER_REVIEW}; AdjudicationLog(action WITHDRAWN); F4.8 outbox CLAIM_WITHDRAWN } → post-commit hash-chain audit CLAIM:WITHDRAW. CLAIM_WITHDRAWABLE_STATUSES is DERIVED from claim-lifecycle canTransitionClaim(s,WITHDRAWN) — single source of truth, cannot drift from the graph.
Authorization evidence: server-derived F1.3 ctx only (command never establishes scope; tenant mismatch ⇒ NOT_FOUND). Tests: missing perm ⇒ ProviderAccessError FORBIDDEN_PERMISSION; another provider's claim ⇒ NOT_FOUND (non-enumerating, row untouched); branch-stamped claim with actor lacking the branch ⇒ FORBIDDEN_BRANCH, with the branch ⇒ allowed.
Idempotency/concurrency evidence: (a) same-key replay ⇒ second call alreadyWithdrawn:true, exactly ONE AdjudicationLog/audit/outbox; (b) two concurrent withdrawals ⇒ exactly one transition (CAS), one log; (c) decision-committed-first (simulated APPROVED) ⇒ withdrawal refuses NOT_WITHDRAWABLE; (d) withdrawal-committed-first ⇒ the REAL ClaimDecisionService.decide refuses the WITHDRAWN claim (pre-tx status guard) — claim stays WITHDRAWN, amounts 0; (e) withdrawal racing a status-guarded serializable decision ×6 iterations ⇒ exactly one of {APPROVED, WITHDRAWN} wins, never both/neither, log counts consistent.
Privacy/security evidence: reason is a closed catalog code (no free-form clinical text); audit + outbox payloads carry ids/reasonCode/fromStatus only — PHI-free. Non-enumerating cross-provider NOT_FOUND.
Money/reconciliation evidence: zero-money test — after withdrawing a RECEIVED claim: status WITHDRAWN, approvedAmount 0, paidAmount 0, paymentVoucherId/settlementBatchId/benefitUsageId null; no fundTransaction, no benefitHold (convertedToClaimId), member benefitUsage count unchanged.
Focused tests and results: claim-withdrawal.service.test.ts 21/21 (opt-in DB) + claim-status-mutation-guard 3/3 (allowlist correct + new writer detected). Factory-using DB batch (7 files) 53/53 — teardown change regression-free.
Typecheck/schema result: tsc --noEmit clean. No schema change.
Manual/visual evidence: N/A — service only (F5.5 stop = no UI). F5.6 wires the provider UI (browser-verifiable).
Feature-flag state: none. The writer is live behind the provider.claim.withdraw permission (persona-gated, F1.1); no separate flag.
Backfill/rollout impact: none (no schema/data change).
Known limitations / flagged follow-up: ClaimDecisionService.decide re-reads+re-validates claim status INSIDE its serializable tx ONLY when decision.expectedRevision is set (automatic decisions); HUMAN decisions (no expectedRevision) keep only the pre-tx status guard and do an unconditional update-by-id. F5.5 introduces the first pre-decision→terminal (WITHDRAWN) transition that can race a human decision, so a true-concurrent human decide whose pre-tx read saw a decidable status, committing AFTER a withdrawal, could overwrite WITHDRAWN→APPROVED. Impact: the withdrawal is lost and the claim is APPROVED (a GL/usage accrual, NOT a payment — settlement is a later maker/checker step; fully reversible via void). Non-exploitable, self-correcting, and NOT reproducible deterministically in the test harness (the minimal world has no chart-of-accounts, so a full decide() cannot commit). The withdrawal side is provably safe (CAS) and decide() already refuses a withdrawn claim at its pre-tx guard. Recommended fix (own package / F11.2 concurrency suite): generalize decide()'s in-tx status re-check to run for ALL decisions (extend lines ~616-621 so the status guard is unconditional; keep the revision check gated on expectedRevision). Not shipped here to avoid untested code in the canonical decision owner and scope creep beyond "simple withdrawal service".
Unrelated worktree changes preserved: yes — worktree contained only F5.5 changes; the main-checkout dirty UAT files are untouched (separate working tree).
Next allowed package: F5.6 — Provider withdrawal UI (S) — claim detail shows a guarded withdrawal action (server-computed allowed-action, catalog reason + confirmation, immutable-history wording, stale/replay-safe), calling ClaimWithdrawalService through a server action. Browser-verifiable (needs env+seed or post-merge).
Stop condition observed: yes — service + focused tests only; no UI, no replacement (F5.7).
```

---

## F5.6 — Provider withdrawal UI

```text
Work package: F5.6
Status: COMPLETE
Commit: 2cf830b
Proof-before-build classification: MISSING (no provider claim-withdrawal UI existed). The provider claim detail page (claims/[id]/page.tsx), the F1.3 ctx resolution, and the F5.5 service already existed; the closest analog is the F3.11 provider PA cancel (CancelPreauthButton + cancelProviderPreauthAction).
Files changed: src/server/services/claim-withdrawal/policy.ts (new — pure providerCanWithdraw + CLAIM_WITHDRAWABLE_STATUSES + WITHDRAW_PERMISSION, extracted from the service), src/server/services/claim-withdrawal/service.ts (now imports the withdrawable set + permission from policy; re-exports CLAIM_WITHDRAWABLE_STATUSES for compat), src/app/provider/claims/[id]/actions.ts (new — withdrawProviderClaimAction), src/app/provider/claims/[id]/WithdrawClaimButton.tsx (new — accessible confirmation dialog), src/app/provider/claims/[id]/page.tsx (server-computes canWithdraw + renders the guarded control), tests/audit-coverage/catalogue.ts (KNOWN_AUDITING_TOKENS += ClaimWithdrawalService.withdraw(), tests/services/claim-withdrawal-policy.test.ts (new), tests/actions/provider-claim-withdrawal-action.test.ts (new), tests/components/provider-withdraw-claim-button.test.tsx (new).
Schema/data changes: NONE.
Behavior delivered: the claim detail page shows a guarded "Withdraw claim" control ONLY when the server computes the action is allowed — providerCanWithdraw(ctx, claim) is the SAME predicate the F5.5 service enforces (strict provider.claim.withdraw permission [a new capability requires the explicit permission — no legacy full-access fallback], pre-decision status, branch scope, no money fact), evaluated purely so the client only ever consumes an allowed action (step 1). The confirmation is an accessible alert dialog (role=alertdialog, aria-modal, aria-labelledby/aria-describedby) that states the permanent, immutable-history consequence (step 2), requires a catalog reason and an explicit confirm (step 3), and calls the F5.5 service through withdrawProviderClaimAction (step 4). Stale/replay handled: an idempotent replay reports success; a claim decided/withdrawn under the actor surfaces the server message and triggers router.refresh() + revalidatePath so the detail re-renders (steps 5-6). The confirm is disabled until a reason is chosen and while the request is in flight (double-click safe; the service is idempotent as a backstop).
Authorization evidence: the action's real authority is the F5.5 service (requirePermission + provider-scoped load + branch), covered by the F5.5 DB tests. The action adds a friendly early providerPermits gate. Page button visibility uses the strict providerCanWithdraw. Tests: policy (permission absent/wrong-status/wrong-branch/financial ⇒ false) + action (no-permission ⇒ no service call/no revalidate; missing id ⇒ no service call).
Idempotency/concurrency evidence: action reports alreadyWithdrawn as success; component is double-click safe (a second click while pending is a no-op — proven with a deferred action, action called once). Underlying service idempotency/CAS proven in F5.5.
Privacy/security evidence: reason is a closed catalog; the note field is labelled "no clinical details"; the dialog never renders cross-provider data (the whole control is absent unless the claim is the provider's and withdrawable). Non-enumerating NOT_FOUND inherited from the service.
Money/reconciliation evidence: N/A — the UI performs no money mutation; the service (F5.5) mutates zero money.
Focused tests and results: policy 6/6 + action 6/6 + component 6/6 (18 new) + F5.5 DB suite 21/21 re-run after the policy extraction. Full suite 1310 pass / 234 skip; audit-coverage green (token added, not a redundant audit).
Typecheck/schema result: tsc --noEmit clean. No schema change.
Manual/visual evidence: the confirmation dialog is rendered and asserted HEADLESSLY via testing-library (role/aria/label/keyboard-Escape/disabled-states/success+error flows) — stronger evidence for the accessibility requirement than a screenshot. VISUAL check on a live page is deferred (the worktree has no .env and the throwaway DB has 0 seeded provider users/branches, so no provider session can be raised) — same convention as the F3.7-F3.14 provider UI; visual verification belongs to a run with env+seed or post-merge.
Feature-flag state: none. The control is gated by the provider.claim.withdraw permission (persona-scoped).
Backfill/rollout impact: none.
Known limitations: visual/browser verification deferred (above). The residual decide()-side true-concurrent window flagged in F5.5 is unchanged (belongs to F11.2).
Unrelated worktree changes preserved: yes — worktree contained only F5.6 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.7 — Atomic claim replacement service (L; split persistence/orchestration if over two days). A correction creates ONE canonical linked claim and atomically supersedes the predecessor (SUPERSEDED) through the Claims Autopilot intake — read CLAIMS_AUTOPILOT_EXECUTION_PLAN intake sections first (D5: never a second intake engine).
Stop condition observed: yes — withdrawal UI only; NO correction form (that is F5.7/F5.8).
```

---

## F5.7 — Atomic claim replacement service

```text
Work package: F5.7
Status: COMPLETE
Commit: ff1d519
Proof-before-build classification: MISSING (the replacement service) atop a PARTIAL intake seam — ClaimIntakeService.submitWithinTransaction was built "for F5.7-5.9"; schema.replacementOfClaimRef/correctionReason + NormalizedSubmission already carry them; no service wrote submissionType=CORRECTION / supersedesClaimId / the SUPERSEDED status.
Files changed: src/server/services/claim-replacement/service.ts (new — ClaimReplacementService.replace + CLAIM_SUPERSEDABLE_STATUSES), tests/services/claim-status-mutation-guard.test.ts (ALLOWLIST +1 — the SUPERSEDED writer), tests/factories/provider-network.ts (teardown now tenant-scopes claims + clears ClaimLine/ClaimProcessingRun/ClaimIntakeReceipt for intake-created children), tests/services/claim-replacement.service.test.ts (new — 8 real-DB tests).
Schema/data changes: NONE. Uses the existing WITHDRAWN/SUPERSEDED statuses + F5.2 chain fields + the intake's within-tx path. No prisma db push.
Behavior delivered: the FIRST SUPERSEDED writer. A provider corrects an UNDECIDED claim → ONE new canonical claim created THROUGH the Claims Autopilot intake (submitWithinTransaction — D5, never a 2nd intake engine) and the predecessor atomically SUPERSEDED, linked into an F5.2 submission chain. member/provider/branch are DERIVED from the predecessor (a correction fixes CONTENT, never re-identifies the claim — the chain's versions must share tenant+provider+member); the corrected content is a FULL claim input validated by the ONE canonical submission schema (≥1 line, one primary dx, billed==qty×unit…), so a patch/partial is rejected. The correction carries an explicit replacementOfClaimRef (predecessor number) + correctionReason and NO invoice number ⇒ null strong event fingerprint ⇒ a NEW linked claim, never a strong-link/conflict against the predecessor (autopilot plan §"correction rules must use an explicit replacement reference; a changed payload with the same authoritative identity is a conflict, not a new claim"). Flow: authorize (provider.claim.correct) → load predecessor scoped to ctx.providerId (non-enum NOT_FOUND) → branch guard → build+parse+normalize+resolve-context → reserveReceipt (REPLAY ⇒ return existing child; CONFLICT ⇒ IDEMPOTENCY_CONFLICT) → friendly eligibility (supersedable + no money) → tx { CAS-supersede predecessor FIRST (status-guarded updateMany, assertClaimTransition) → submitWithinTransaction (child) → wire chain (child.supersedesClaimId/chainRootClaimId/submissionType=CORRECTION; predecessor.supersededByClaimId) → AdjudicationLog on both ends } with claim-number/serialization retry → post-commit hash-chain audit CLAIM:REPLACE + outbox CLAIM_CORRECTED.
Authorization evidence: server-derived F1.3 ctx (permission + provider ownership + branch). Test: missing permission ⇒ FORBIDDEN_PERMISSION; another provider ⇒ non-enumerating NOT_FOUND; branch-stamped predecessor without the branch ⇒ FORBIDDEN_BRANCH; predecessor untouched by every rejected attempt.
Idempotency/concurrency evidence: (a) two concurrent corrections ⇒ exactly ONE current child, loser NOT_CORRECTABLE, predecessor superseded by the winner (CAS-first claims the supersession slot before any child is created); (b) same-key + same-content replay ⇒ returns the same child (replayed), one child only; (c) same-key + CHANGED payload ⇒ IDEMPOTENCY_CONFLICT, still one child. Idempotency is resolved (reserveReceipt) BEFORE the eligibility check so a replay of an already-superseded predecessor returns its child rather than failing.
Privacy/security evidence: correctionReason is bounded no-HTML text (schema); audit/outbox payloads carry ids/numbers only. Non-enumerating NOT_FOUND. member/provider cannot be re-assigned by the command.
Money/reconciliation evidence: the ORIGINAL is immutable — only status/supersededAt/supersededByClaimId change; billedAmount/approvedAmount/lines unchanged. Zero-money test: predecessor approvedAmount/paidAmount 0, no voucher/settlement/benefitUsage/fundTransaction. A pre-decision claim has no posted GL/usage/hold to reverse ("simple" supersession).
Focused tests and results: claim-replacement.service.test.ts 8/8 (real DB) + mutation-guard 3/3 (allowlisted + detected). Factory-using DB batch (9 files) 67/67 — the tenant-scoped teardown change is regression-free.
Typecheck/schema result: tsc --noEmit clean. No schema change.
Manual/visual evidence: N/A — service only (F5.7 stop = no provider correction page). F5.8 builds the correction form + lineage UI (browser-verifiable).
Feature-flag state: none. Gated by the provider.claim.correct permission (persona-scoped).
Backfill/rollout impact: none. NOTE: the correction's child is left PENDING (a processing run) for the normal enqueuer/recovery path — F5.7 does NOT inline-process (consistent with the case rails); the child adjudicates through the standard pipeline, where the SUPERSEDED predecessor is excluded from its duplicate candidate set.
Known limitations: the correction carries NO invoice number by design (the lineage is the identity; reusing the predecessor's invoice would collide on the (provider,invoice) unique AND strong-link to the predecessor). If the business wants an invoice to carry forward onto a correction, F5.8 must supply a distinct one and the strong fingerprint would need a replacement-marker precedence (additive) — flagged, not built. The decide()-side true-concurrent window flagged in F5.5 is unchanged.
Unrelated worktree changes preserved: yes — worktree contained only F5.7 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.8 — Build correction form and lineage UI (M) — provider claim-detail "Correct claim" flow that pre-fills from the predecessor, submits via ClaimReplacementService through a server action, and shows the submission-chain lineage (F5.2 getChain). Browser-verifiable (needs env+seed or post-merge).
Stop condition observed: yes — the replacement SERVICE + focused tests only; no provider correction page.
```

---

## F5.8 — Correction form and lineage UI

```text
Work package: F5.8
Status: COMPLETE
Commit: faf7aad
Proof-before-build classification: MISSING (no provider correction UI). The claim detail page, ProviderClaimForm (F3.9), and the F5.7 service existed; the closest analogs are ProviderClaimForm/new-claim action (the form) + the F5.6 withdrawal UI (policy/action/gating pattern).
Files changed: src/server/services/claim-replacement/policy.ts (new — pure providerCanCorrect + CLAIM_SUPERSEDABLE_STATUSES + CORRECT_PERMISSION, extracted from the service; service re-exports for compat), src/app/provider/claims/[id]/correct/{page.tsx,CorrectClaimForm.tsx,actions.ts} (new), src/app/provider/claims/[id]/ClaimLineageTable.tsx (new), src/app/provider/claims/[id]/page.tsx (lineage section + "Correct claim" link, both server-gated), tests/audit-coverage/catalogue.ts (KNOWN_AUDITING_TOKENS += ClaimReplacementService.replace(), tests/services/claim-replacement-policy.test.ts + tests/actions/provider-claim-correct-action.test.ts + tests/components/{provider-correct-claim-form,provider-claim-lineage-table}.test.tsx (new).
Schema/data changes: NONE.
Behavior delivered: the claim detail page shows a "Correct claim" entry ONLY when the server computes it is allowed (providerCanCorrect — the SAME predicate the F5.7 service enforces). The correct route builds a SAFE prefill DTO from the predecessor (member number/name + branch shown READ-ONLY; service type/benefit/date/attending/diagnosis/lines editable) — the form is NOT bound to a direct claim update; it prepares a FULL corrected claim and submits via correctProviderClaimAction → the F5.7 ClaimReplacementService, which supersedes the predecessor and creates a linked child. The action passes ONLY the corrected content (never member/provider/branch), so a correction can never re-identify the claim (altered member/provider/branch is structurally impossible). Submit is gated on an explicit confirmation checkbox (confirm member/branch/dates/codes/quantities/charges) and a stable draft-UUID idempotency key (double-click/refresh replays the same receipt). On success it redirects to the child (?corrected=1); a stale/decided predecessor surfaces the message and refreshes. The detail page renders the F5.2 submission chain (ClaimLineageTable) — an accessible table of every version oldest-first with the billed change and superseded-vs-current status (both immutable records and current status).
Authorization evidence: server-derived F1.3 ctx everywhere. Page button visibility = strict providerCanCorrect; correct page redirects an un-correctable claim; the action's real authority is the F5.7 service (perm + provider ownership + branch, covered by the F5.7 DB tests) plus a friendly providerPermits early gate. Tests: policy (permission/superseded/status/branch/financial ⇒ false); action (no-permission ⇒ no service call/no redirect; identity fields NEVER passed); form (member/branch read-only+disabled).
Idempotency/concurrency evidence: draft-UUID key (service idempotency proven in F5.7); action reports stale with a refresh signal; form double-submit safe (confirm-gated + disabled while pending).
Privacy/security evidence: prefill exposes only this provider's own claim (scoped load); member/branch cannot be altered; the reason field is labelled "no clinical detail". Non-enumerating NOT_FOUND inherited from the service.
Money/reconciliation evidence: N/A — the UI performs no money mutation; the F5.7 service preserves the original and touches no money.
Focused tests and results: policy 6/6 + action 4/4 + form 3/3 + lineage 3/3 (16 new) + F5.7 DB suite 8/8 re-run after the policy extraction. Full suite 1326 pass / 242 skip; audit-coverage green (token, not a redundant audit); tsc clean; brand + currency green.
Typecheck/schema result: tsc --noEmit clean.
Manual/visual evidence: the form (prefill, locked identity, confirmation-gated + double-submit-safe submit, accessible error) and the lineage (accessible <table>/<caption> differences summary, aria-current) are proven HEADLESSLY via testing-library. VISUAL check on a live page is deferred (worktree has no .env / no seeded provider session) — same convention as F3.7-F3.14; visual verification belongs to a run with env+seed or post-merge.
Feature-flag state: none. Gated by the provider.claim.correct permission (persona-scoped).
Backfill/rollout impact: none.
Known limitations: visual/browser verification deferred (above). The correction still carries no invoice number (F5.7 decision); the decide()-side true-concurrent window flagged in F5.5 is unchanged.
Unrelated worktree changes preserved: yes — worktree contained only F5.8 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.9 — Implement provider-correctable resubmission eligibility (S) — a read/eligibility service that decides whether a DECLINED claim may be resubmitted (distinct from correction: F5.10 LINKS a new claim post-decline without re-marking DECLINED). Read the F5.1 status-consumer characterization + F5.3 (DECLINED stays DECLINED; resubmission links).
Stop condition observed: yes — correction form + lineage only; NO post-decline resubmission (that is F5.9/F5.10).
```

---

## F5.9 — Provider-correctable resubmission eligibility

```text
Work package: F5.9
Status: COMPLETE
Commit: 72d9e72
Proof-before-build classification: MISSING. The reason catalog (AdjudicationReasonCode.resubmissionAllowed + safe providerDescription vs internalDescription) and the contract submission window (ProviderContract.submissionWindowDays/Basis) EXIST; no resubmission eligibility service and no deadline-computation helper did. Declined lines do NOT persist reasonCodeId → the live reason source is the legacy Claim.declineReasonCode.
Files changed: src/server/services/claim-resubmission/policy.ts (new — pure resolveResubmissionReason + resubmissionDeadline + RESUBMIT_PERMISSION + LEGACY_DECLINE_RESUBMISSION), src/server/services/claim-resubmission/eligibility.service.ts (new — ClaimResubmissionEligibilityService.check, READ-ONLY), tests/services/claim-resubmission-policy.test.ts + claim-resubmission-eligibility.test.ts (new).
Schema/data changes: NONE. READ-ONLY service — no status write, so NO mutation-guard entry and NO audit token needed.
Behavior delivered: ONE read-only service computes whether/why/until-when a DECLINED claim may be resubmitted, returning a code + a SAFE provider reason + the deadline. resolveResubmissionReason precedence: (1) line-level catalog reasons (every declining reason must permit it); (2) the claim-level decline code resolved against the catalog; (3) a legacy Claim.declineReasonCode map. It ONLY ever returns provider-facing text — an internal/fraud rationale is never disclosed (FRAUD_SUSPECTED ⇒ resubmissionAllowed:false + "declined after review — contact the payer"). resubmissionDeadline from the contract submission window, computed in UTC with the deadline DAY inclusive so a claim on the boundary is not mis-judged by the host timezone (SERVICE_DATE / DISCHARGE_DATE [falls back to service] / INVOICE_DATE [→ service, no field] / MONTHLY_BATCH [end of the service month]); no window ⇒ no time limit. Eligibility order: NOT_FOUND (provider-scoped, non-enumerating) → FORBIDDEN (permission then branch) → NOT_DECLINED → ALREADY_RESUBMITTED (supersededByClaimId set OR a claim with supersedesClaimId = this id — current-chain scope) → REASON_NOT_RESUBMITTABLE → DEADLINE_PASSED → ELIGIBLE. `at` is injectable for deterministic boundary testing.
Authorization evidence: server-derived F1.3 ctx. NOT_FOUND for a foreign/absent claim (non-enumerating); FORBIDDEN for a missing permission (provider.claim.correct) or an out-of-access branch. Tests cover cross-provider, missing permission, and branch.
Idempotency/concurrency evidence: N/A — pure read (no writes). "Already resubmitted" enforces one current chain head.
Privacy/security evidence: the reason is ALWAYS safe (providerDescription / the legacy safe map) — internalDescription is never read into the result; the fraud path is proven not to leak (reason does not match /fraud|fwa|abuse|suspect|investigat/i).
Money/reconciliation evidence: N/A — read-only, no money.
Focused tests and results: policy 10/10 (reason resolver incl. fraud-never-disclosed + precedence; deadline UTC/basis/boundary) + eligibility 8/8 (real DB: reason allowed/forbidden, fraud, not-declined, already-resubmitted, cross-provider, permission+branch, boundary-timezone inclusive/expired). Full suite 1336 pass / 250 skip; tsc clean; brand + currency green.
Typecheck/schema result: tsc --noEmit clean. No schema change.
Manual/visual evidence: N/A — read-only service, no UI (F5.9 stop = no submit).
Feature-flag state: none.
Backfill/rollout impact: none.
Known limitations: (a) the resubmit permission reuses provider.claim.correct (no dedicated resubmit permission in the F1.1 catalog) — flagged; (b) step-4 "required request/doc response accepted" is a documented no-op — no claim-side info-request model exists and a DECLINED claim carries no outstanding response (that is the PENDED / PA-side F4 flow); wire here when a claim info-request model is added; (c) deadline resolution uses the claim's contract window only — a provider/client-level default could be layered later. The F5.5 decide()-concurrency window is unchanged.
Unrelated worktree changes preserved: yes — worktree contained only F5.9 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.10 — Submit linked post-decline resubmission (M) — reuse the F5.7 replacement full-form contract; recheck F5.9 eligibility/deadline in-tx; create a canonical RESUBMISSION claim through the intake; advance the chain pointer WITHOUT changing the original DECLINED decision; preserve the sanctioned duplicate relation; no automatic inheritance of pricing/approval.
Stop condition observed: yes — eligibility service + focused tests only; no submit (F5.10).
```

---

## F5.10 — Submit linked post-decline resubmission

```text
Work package: F5.10
Status: COMPLETE
Commit: 0425f99
Proof-before-build classification: MISSING (the submit service + UI) atop the F5.7 replacement pattern + F5.9 eligibility. Reused the "replacement full-form contract" by extracting it from F5.7.
Files changed: src/server/services/claim-replacement/submission.ts (new — shared ReplaceClaimCommand + buildReplacementSubmission + MAX_TX_ATTEMPTS/isRetryableWrite/sleep), src/server/services/claim-replacement/service.ts (refactored to consume submission.ts — behavior identical), src/server/services/claim-resubmission/submit.service.ts (new — ClaimResubmissionService.submit), src/app/provider/claims/[id]/correct/CorrectClaimForm.tsx (generalized: optional mode + submitAction props, correction defaults preserved), src/app/provider/claims/[id]/resubmit/{page.tsx,actions.ts} (new), src/app/provider/claims/[id]/page.tsx (gated "Resubmit" entry for eligible declined claims), tests/audit-coverage/catalogue.ts (KNOWN_AUDITING_TOKENS += ClaimResubmissionService.submit(), tests/services/claim-resubmission-submit.service.test.ts + tests/actions/provider-claim-resubmit-action.test.ts (new).
Schema/data changes: NONE. Writes NO claim status (the original stays DECLINED; only the chain pointer advances) ⇒ NO mutation-guard entry needed.
Behavior delivered: an ELIGIBLE (F5.9) declined claim produces a FULL new canonical claim through the Claims Autopilot intake (submitWithinTransaction — D5) as a RESUBMISSION, linked into the F5.2 chain. Unlike a correction (F5.7 supersedes a pre-decision claim to SUPERSEDED), the original is NOT superseded in STATUS — it STAYS DECLINED (its decision + money are immutable); only the chain-head pointer (supersededByClaimId) advances to the new claim. The resubmission is a fresh RECEIVED claim with a PENDING processing run — full new adjudication, NO automatic inheritance of the original's pricing/approval/decline. Flow: load original (scoped) → build+validate (shared buildReplacementSubmission; explicit replacementOfClaimRef, no invoice ⇒ null strong fingerprint ⇒ new linked claim) → resolve context → reserveReceipt (REPLAY ⇒ return child; CONFLICT ⇒ throw) → F5.9 eligibility (AFTER idempotency) → tx(retry) { in-tx recheck still-DECLINED+not-resubmitted → submitWithinTransaction → CAS advance supersededByClaimId WHERE null (NO status write) → wire chain submissionType=RESUBMISSION → AdjudicationLogs } → audit CLAIM:RESUBMIT + outbox CLAIM_RESUBMITTED. UI: the F5.8 correction form was generalized (backward-compatible mode/submitAction props) and reused by the resubmit route; the DECLINED claim detail shows a "Resubmit" entry gated by F5.9 eligibility; the F5.8 lineage already renders RESUBMISSION versions.
Authorization evidence: the service enforces F5.9 eligibility (permission provider.claim.correct + provider ownership + branch + status + reason + deadline + not-already-resubmitted). The action adds a friendly providerPermits gate and passes ONLY content (never member/provider/branch). Tests: no-permission ⇒ no service call; identity fields never passed; non-declined ⇒ NOT_DECLINED.
Idempotency/concurrency evidence: two concurrent resubmissions ⇒ exactly ONE current child (the loser ALREADY_RESUBMITTED — the CAS on supersededByClaimId serializes; the in-tx recheck + claim-number retry back it); same-key replay ⇒ the same child; the original stays DECLINED throughout.
Privacy/security evidence: the ineligible/denial reason surfaced by the action is the SAFE F5.9 reason (fraud never disclosed). Non-enumerating NOT_FOUND. member/provider/branch cannot be re-identified.
Money/reconciliation evidence: the original's DECLINED decision + money are IMMUTABLE (status/declineReasonCode/approvedAmount/paidAmount/billedAmount unchanged; only supersededByClaimId set). The resubmission inherits NO pricing/approval (approvedAmount 0, declineReasonCode null, status RECEIVED).
Focused tests and results: submit service 5/5 (real DB: immutable original + no inheritance + chain; ineligible-denied; not-declined; replay; concurrency=one-child) + resubmit action 4/4 (delegation, no identity fields, permission gate, ineligible+refresh) + the F5.8 form/correct-action tests re-run green after the form generalization. Full suite 1340 pass / 255 skip; F5-lifecycle DB batch 47/47; audit-coverage green; tsc + brand + currency green.
Typecheck/schema result: tsc --noEmit clean.
Manual/visual evidence: the resubmit form (reused, mode="resubmit") + gated entry are proven headlessly (the generalized form's F5.8 test stays green). VISUAL check deferred (worktree has no .env / seeded provider session) — same convention as F3.7-F3.14.
Feature-flag state: none. Gated by provider.claim.correct (the resubmit permission — no dedicated one in the F1.1 catalog, flagged in F5.9).
Backfill/rollout impact: none.
Known limitations: visual/browser verification deferred; the resubmit permission reuses provider.claim.correct (F5.9 flag). The F5.5 decide()-concurrency window is unchanged.
Unrelated worktree changes preserved: yes — worktree contained only F5.10 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.11 — Add reconsideration schema and reason policy (M) — models/enums/indexes from §7.8 (Reconsideration + line + event/message/document/SLA relations), reason eligibility by decision/line/category, deadline resolution order, requested/awarded decimal invariants. Distinct from resubmission: a reconsideration asks the payer to re-decide the SAME claim (not a new linked claim).
Stop condition observed: yes — the resubmission submit + its UI; NO reconsideration (F5.11+).
```

---

## F5.11 — Reconsideration schema and reason policy

```text
Work package: F5.11
Status: COMPLETE
Commit: f2654ba
Proof-before-build classification: MISSING. No ClaimReconsideration model/enum existed. RECONSIDERATION was already in DocumentTargetType + ClaimSubmissionType; DocumentUploadIntent uses a generic targetType/targetId so evidence needs no Document change; PreAuthorizationEvent is the event pattern (safeReasonCode vs internalReasonRef).
Files changed: prisma/schema.prisma (+ReconsiderationStatus enum + ClaimReconsideration + ClaimReconsiderationLine + ClaimReconsiderationEvent — ADDITIVE), src/server/services/claim-reconsideration/policy.ts (new — pure), tests/factories/provider-network.ts (teardown clears the 3 satellites), tests/services/claim-reconsideration-policy.test.ts + claim-reconsideration-schema.test.ts (new).
Schema/data changes: ADDITIVE. 3 new relation-less satellite models + 1 enum, pushed to the throwaway PG (54329, verified: tables + the 11-value enum). PROD applies on the next build's prisma db push (same as F4.1/F4.8). No status-writer (F5.16 executes outcomes) ⇒ NO mutation-guard entry.
Behavior delivered: the reconsideration schema (§7.8 / D13) + the pure reason/deadline/decimal/projection policy. ClaimReconsideration is a governed case challenging a DECIDED claim (D13 — the original claim status + money are NEVER mutated by a reconsideration). It carries tenant/client/provider/branch, the disputed claimId + chain root (relation-less), a catalog reason + provider narrative, the requested amount + currency, filing deadline + filed time, the 11-state status, triage/assignment (originalAdjudicatorId for the SoD warning), a SAFE-vs-INTERNAL outcome split, an accepted-outcome supplemental claim id, SLA fields, and idempotencyKey + version (optimistic concurrency / idempotent submit). ClaimReconsiderationLine freezes the original line economics + the requested/reviewer-corrected amounts + prior approved/paid + the maxIncrement ceiling + the awardedIncrement (all Decimal(14,2)). ClaimReconsiderationEvent mirrors PreAuthorizationEvent (append-only, seq-unique per case, safeReasonCode vs internalReasonRef pointer, a safe message field for the info-request/response exchange). The pure policy owns: the filing-reason catalog + eligibility by decision/line-category; the deadline resolution ORDER (contract → client → platform-default 60 days, from the DECISION date, UTC day-inclusive/timezone-safe); the exact decimal invariants (max increment = corrected full entitlement less all prior approved/paid, never negative; awarded 0..max; supplemental ceiling = sum of awarded deltas); the structural checks (a line must belong to the case's claim; provider + currency must match the claim); and the safe-vs-internal separation (the provider projection is an explicit allow-list that drops originalAdjudicatorId / outcomeInternalNotes / assignedReviewerId / assignedTeam / internal refs).
Authorization evidence: N/A — schema + pure policy (no service, no ctx; F5.12 adds the eligibility+submit service).
Idempotency/concurrency evidence: schema-level — ClaimReconsideration has version Int @default(1) (optimistic) + @@unique([tenantId, idempotencyKey]) (idempotent submit; NULLs distinct ⇒ keyless drafts unaffected); ClaimReconsiderationEvent @@unique([reconsiderationId, sequence]) (proven by the round-trip P2002 test).
Privacy/security evidence: the outcome/event models keep safeReasonCode (provider-safe) separate from internalReasonRef (a POINTER, never the detail) + outcomeInternalNotes; toProviderReconsiderationProjection is proven to exclude every internal field (no internal string leaks into the JSON).
Money/reconciliation evidence: the line decimal invariants are exact (Decimal): maxIncrement never negative; awarded cannot be negative or exceed the maximum; zero/negative award ⇒ no supplemental (the ceiling helper). Original claim money is untouched (D13; no writer here).
Focused tests and results: policy 10/10 (reason eligibility by decision incl. unknown/pre-decision; deadline resolution order UTC-inclusive; max-increment/awarded-bounds/sum; line-belongs-to-claim; provider/currency consistency; provider projection excludes internal) + schema round-trip 1/1 (real DB — case ← lines ← events relations, Decimal(14,2) values, per-case event sequence uniqueness = P2002, indexed claim lookup). Full suite 1350 pass / 256 skip; factory DB batch 46/46; tsc clean; brand + currency green.
Typecheck/schema result: prisma validate OK; prisma format OK; prisma db push → in sync (throwaway 54329); prisma generate OK; tsc --noEmit clean.
Manual/visual evidence: N/A — schema + policy (no UI, no service).
Feature-flag state: none. Inert schema + pure policy until the F5.12+ services read/write it.
Backfill/rollout impact: additive schema only; prod applies on next build's prisma db push. No data migration.
Known limitations: "message" is carried on the event model (a safe message field) rather than a separate thread model — sufficient for the info-request/response exchange; a richer thread can be added if F5.14 needs it. The shared node_modules Prisma client now includes these models (harmless superset to the concurrent claims-autopilot session — regenerate defensively).
Unrelated worktree changes preserved: yes — worktree contained only F5.11 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.12 — Implement reconsideration eligibility and submit (M). Depends on F5.9 + F5.11. Provider creates ONE governed reconsideration (idempotent, versioned) WITHOUT changing claim state/money; reuse the F5.11 policy for reason/deadline/decimal/consistency; SUBMITTED + a first event; no reviewer/outcome yet.
Stop condition observed: yes — schema + pure policy only; NO service.
```

---

## F5.12 — Reconsideration eligibility and submit

```text
Work package: F5.12
Status: COMPLETE
Commit: 1625bdc
Proof-before-build classification: MISSING (no reconsideration submit service; legacy same-claim appeal lives in claim-adjudication.service and is F5.17's concern — untouched here). Builds on the F5.11 schema + policy.
Files changed: src/server/services/claim-reconsideration/submit.service.ts (new — ClaimReconsiderationService.checkEligibility + submit), tests/services/claim-reconsideration-submit.service.test.ts (new). No schema change (F5.11 added the models).
Schema/data changes: NONE. Creates ClaimReconsideration + lines + a first event only — NO Claim write (D13), so no mutation-guard entry.
Behavior delivered: a provider files ONE governed reconsideration on a DECIDED claim without changing the claim's state or money (D13). submit(ctx, command): authorize (provider.claim.reconsider + provider/branch scope) → idempotent replay by idempotencyKey (resolved BEFORE the duplicate check, so a same-key retry returns the existing case) → eligibility (claim status in RECONSIDERABLE_CLAIM_STATUSES; reason eligible for that decision via F5.11 isReconsiderationReasonEligible; within the filing deadline via F5.11 resolveReconsiderationDeadline from decidedAt; no ACTIVE reconsideration already on the claim) → validate (non-blank narrative; requestedAmount > 0; every selected line belongs to the claim; any supplied evidence is scanned CLEAN, never PENDING/REJECTED/QUARANTINED/ERROR) → create the case (SUBMITTED, filingDeadline, currency + originalAdjudicatorId [SoD] derived from the claim, SLA policy/version/dueAt) with EXACT frozen line snapshots (originalBilled/allowed/payable/memberShare/writeoff read from the ClaimLine; maxIncrement/awardedIncrement stay 0 until the reviewer corrects entitlement, F5.15) + a first SUBMITTED event, all in one create; a concurrent same-key submit is caught by @@unique[tenant, idempotencyKey] (P2002 → return the winner). Post-commit hash-chain audit RECONSIDERATION:SUBMIT + outbox RECONSIDERATION_SUBMITTED. checkEligibility(ctx, claimId, {reasonCode?, at?}) returns a safe gate for the F5.13 form (ELIGIBLE / NOT_FOUND / FORBIDDEN / NOT_RECONSIDERABLE / DEADLINE_PASSED / REASON_NOT_ELIGIBLE / ALREADY_ACTIVE). A claim carries at most one ACTIVE reconsideration (TERMINAL = UPHELD/WITHDRAWN/CLOSED free it).
Authorization evidence: server-derived F1.3 ctx (requirePermission provider.claim.reconsider + provider-scoped claim load [non-enumerating NOT_FOUND] + branch). Tests: submit without the permission ⇒ ProviderAccessError FORBIDDEN_PERMISSION; checkEligibility cross-provider ⇒ NOT_FOUND, no-permission ⇒ FORBIDDEN.
Idempotency/concurrency evidence: same-key submit ⇒ replayed (one case); a different key while one is active ⇒ ALREADY_ACTIVE (one case); the @@unique[tenant, idempotencyKey] catches a concurrent same-key race (P2002 → winner).
Privacy/security evidence: currency + originalAdjudicatorId are derived from the claim (the command cannot set a foreign currency / spoof the adjudicator). Evidence must be scanned CLEAN. The event carries safeReasonCode; F5.11's provider projection keeps the internal fields out of the provider view.
Money/reconciliation evidence: D13 — the original claim row/benefit/GL/fund are UNTOUCHED (no claim write anywhere; test asserts claim.status/approvedAmount/updatedAt unchanged, benefitUsage count unchanged, no fundTransaction). The line snapshot is EXACT (frozen originalBilled/allowed/payable/writeoff/alreadyApproved match the ClaimLine).
Focused tests and results: 7/7 (real DB): file + exact snapshot + claim/benefit/fund untouched; every decided state (full/partial/declined/paid) eligible; pre-decision ⇒ NOT_RECONSIDERABLE; wrong reason ⇒ REASON_NOT_ELIGIBLE, line-not-in-claim ⇒ LINE_NOT_IN_CLAIM, expired ⇒ DEADLINE_PASSED; idempotent replay + one-active ⇒ ALREADY_ACTIVE; submit permission gate; checkEligibility gate (eligible/wrong-reason/cross-provider/no-permission). Full suite 1350 pass / 263 skip; tsc + brand + currency green.
Typecheck/schema result: tsc --noEmit clean. No schema change.
Manual/visual evidence: N/A — service only (F5.13 builds the provider form/detail).
Feature-flag state: none. Gated by provider.claim.reconsider (persona-scoped).
Backfill/rollout impact: none.
Known limitations: evidence is an OPTIONAL clean-scan validation here; the upload → finalize → scan → attach flow + the retarget to the reconsideration is F5.13. The maxIncrement/awardedIncrement remain 0 until the reviewer corrects entitlement (F5.15). Legacy same-claim appeal (claim-adjudication.service) is untouched — F5.17 consolidates it.
Unrelated worktree changes preserved: yes — worktree contained only F5.12 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.13 — Build provider reconsideration form/detail (M). Depends on F5.12. Provider selects lines, understands the original outcome (safe amounts/reasons), submits evidence, and tracks safe status. Reuse checkEligibility to gate; will add a server action ⇒ PR-020 audit-coverage catch (add ClaimReconsiderationService.submit token).
Stop condition observed: yes — eligibility + submit service + focused tests only; NO review/outcome (F5.14+).
```

---

## F5.13 — Provider reconsideration form and detail

```text
Work package: F5.13
Status: COMPLETE
Commit: bea749f
Proof-before-build classification: MISSING (no reconsideration UI). Builds on F5.12 (checkEligibility + submit) + F5.11 (reason catalog + provider projection). Reuses the FileUpload component pattern only conceptually (evidence deferred).
Files changed: src/server/services/claim-reconsideration/policy.ts (+ reconsiderationReasonsFor helper for the picker), src/app/provider/claims/[id]/reconsider/{page.tsx, ReconsiderClaimForm.tsx, actions.ts} (new), src/app/provider/claims/[id]/ReconsiderationPanel.tsx (new), src/app/provider/claims/[id]/page.tsx (gated "Reconsider" entry + the status panel, both server-computed), tests/audit-coverage/catalogue.ts (KNOWN_AUDITING_TOKENS += ClaimReconsiderationService.submit(), tests/actions/provider-claim-reconsider-action.test.ts + tests/components/{provider-reconsider-claim-form, provider-reconsideration-panel}.test.tsx (new).
Schema/data changes: NONE.
Behavior delivered: the provider reconsideration flow. The reconsider route is gated by F5.12 checkEligibility (an ineligible claim redirects to the detail); it loads the claim's lines with their FROZEN original economics (billed/allowed/payable/disallowed read from the ClaimLine) and the safe per-line reason (ClaimLine.declineReason). The form is an accessible table: each line has a dispute checkbox, its frozen billed/allowed + safe reason (read-only), and a requested-corrected-allowed input; the total additional requested is computed EXACTLY (Σ over selected lines of max(0, requested − original allowed), 2dp). A reason (from the F5.11 catalog filtered to the decision via reconsiderationReasonsFor + its safe description), a narrative, and an explicit accuracy declaration are required; the filing deadline is shown. Submit calls the F5.12 service through reconsiderProviderClaimAction — the service RE-checks eligibility, so a form built against stale eligibility (window closed / a case now active) is refused and the client refreshes. The claim detail page shows a gated "Reconsider" entry (F5.12 eligible) and, when a case exists, a ReconsiderationPanel that renders ONLY the F5.11 provider projection (status, requested amount, filing deadline, review-due SLA, safe outcome, the provider's own narrative) — no internal field (original adjudicator / internal notes / assigned reviewer/team) can reach the provider by construction.
Authorization evidence: the reconsider page hard-scopes the claim to the provider (NOT_FOUND ⇒ an inaccessible claim/line never renders); the action gates on providerPermits(provider.claim.reconsider) and delegates to the F5.12 service (which re-authorizes: permission + provider ownership + branch). Tests: action no-permission ⇒ no service call; the service-level cross-provider NOT_FOUND is covered by F5.12.
Idempotency/concurrency evidence: the form sends a stable draft-UUID idempotency key; the F5.12 service is idempotent + one-active (proven in F5.12). A stale gate ⇒ error + refresh.
Privacy/security evidence: the detail panel is fed EXCLUSIVELY by toProviderReconsiderationProjection (F5.11), so it structurally cannot leak the internal fields (panel test asserts no adjudicator/internal/reviewer text; the projection type has no such field). The form shows only the safe per-line reason (declineReason), never internal notes.
Money/reconciliation evidence: the requested total delta is EXACT (2dp; test asserts 300 + 250 = 550.00). The UI performs no money mutation; the F5.12 service leaves the claim untouched (D13).
Focused tests and results: action 4 (delegation, permission gate, stale ⇒ refresh, validation) + form 4 (frozen amounts in an accessible table with a caption, exact requested delta, all required gates before submit + correct command, stale error + refresh) + panel 2 (safe status render, no internal leak). Full suite 1360 pass / 263 skip; audit-coverage green; tsc + brand + currency green.
Typecheck/schema result: tsc --noEmit clean.
Manual/visual evidence: the form (accessible table, exact totals, required declaration, stale error) and the panel (safe projection) are proven HEADLESSLY via testing-library. VISUAL check on a live page deferred (worktree has no .env / seeded provider session) — same convention as F3.7-F3.14.
Feature-flag state: none. Gated by provider.claim.reconsider.
Backfill/rollout impact: none.
Known limitations: EVIDENCE UPLOAD is deferred — the F2 private-document flow (DocumentUploadIntent targetType RECONSIDERATION → finalize → scan → attach) is not wired into the form; F5.12 accepts optional pre-uploaded clean evidence ids, and a follow-up can add the upload widget (a reusable FileUpload exists). Visual verification deferred.
Unrelated worktree changes preserved: yes — worktree contained only F5.13 changes; the main-checkout dirty UAT files are untouched.
Next allowed package: F5.14 — Implement TPA reconsideration triage and information flow (M). Depends on F5.12. Reviewer triages jurisdiction/deadline/completeness, assigns a reviewer with the SoD warning (originalAdjudicatorId), requests structured information (INFORMATION_REQUIRED ↔ PROVIDER_RESPONDED), all via ClaimReconsiderationEvent transitions — no outcome/award yet (F5.15/F5.16).
Stop condition observed: yes — provider form + detail only; NO TPA decision (F5.14+).
```

---

## F5.14 — TPA reconsideration triage and information flow

```text
Work package: F5.14
Status: COMPLETE
Commit: da9565a
Proof-before-build classification: PRESENT (partial). The reconsideration case + status enum + event/line satellites are the F5.11 schema (read the ClaimReconsideration/ClaimReconsiderationEvent models + the ReconsiderationStatus enum before building — no new schema needed). The transition + event + outbox pattern is PRESENT: mirrored the PA info-request rail (preauth-info-request/service.ts applyDecision + preauth-intake/events.ts appendPreauthEvent). The reviewer role is PRESENT (requireRole(ROLES.CLINICAL) = the admin info-request actions' gate). The provider-response authz is PRESENT (ProviderAccessContext, F1.3). No proof MISSING.
Files changed: src/server/services/claim-reconsideration/events.ts (new — appendReconsiderationEvent + listReconsiderationEvents + RECONSIDERATION_EVENT_TYPES), src/server/services/claim-reconsideration/review.service.ts (new — ReconsiderationReviewService), src/server/services/claim-reconsideration/policy.ts (+ toProviderReconsiderationTimeline + PROVIDER_VISIBLE_RECONSIDERATION_EVENTS), tests/services/claim-reconsideration-timeline.test.ts (new, pure), tests/services/claim-reconsideration-review.service.test.ts (new, real-DB opt-in).
Schema/data changes: NONE (reuses the F5.11 ClaimReconsideration / ClaimReconsiderationEvent tables).
Behavior delivered: the reviewer side of a governed reconsideration. (1) triage(actor, id, {expectedVersion}) accepts jurisdiction (SUBMITTED → TRIAGE). (2) assign(actor, id, {expectedVersion, reviewerId, assignedTeam?, acknowledgeSelfReview?}) sets the owner and moves to UNDER_REVIEW; the SEPARATION-OF-DUTY RULE refuses assigning the reviewer who made the original decision (originalAdjudicatorId === reviewerId) unless acknowledgeSelfReview is set, and returns sodWarning so the caller shows a prominent banner; the ack is recorded in the ASSIGNED event metadata + audit. (3) requestInformation(actor, id, {expectedVersion, prompt}) moves to INFORMATION_REQUIRED, writes the safe prompt as the INFO_REQUESTED event message, and enqueues a SAFE provider notification (RECONSIDERATION_INFO_REQUESTED). (4) respondToInformation(ctx, id, {response, expectedVersion?}) is PROVIDER-authorised (ProviderAccessContext ownership + branch + provider.claim.reconsider), moving INFORMATION_REQUIRED → PROVIDER_RESPONDED with the response as a PROVIDER-actor event. (5) resumeReview(actor, id, {expectedVersion}) returns PROVIDER_RESPONDED → UNDER_REVIEW. (6) addInternalNote(actor, id, {note}) appends an INTERNAL_NOTE event that is kept OUT of provider-facing state (§9), with no status/version change. (7) queue(actor, {status?, assignedReviewerId?, providerId?, take?}) is the SLA-ordered (dueAt, then filedAt) reviewer work list, staff-facing (carries the internal assignment/adjudicator refs). NO financial outcome anywhere — the corrected entitlement / award / uphold / execute is F5.15-F5.16.
Authorization evidence: reviewer methods take an already-authorized actor (the admin action calls requireRole(ROLES.CLINICAL)) and re-assert reviewer-role membership (RECONSIDERATION_REVIEWER_ROLES = SUPER_ADMIN/CLAIMS_OFFICER/MEDICAL_OFFICER) as defence-in-depth — string literals, so the service carries NO next-auth import and stays unit-testable. Test: a non-reviewer role (HR_MANAGER / CUSTOMER_SERVICE) is refused FORBIDDEN on triage AND queue. The provider response authorizes through ProviderAccessContext and is NON-ENUMERATING: a case outside the provider's scope (or branch) is NOT_FOUND, indistinguishable from absent; a missing permission ⇒ ProviderAccessError. Test: cross-provider NOT_FOUND, no-permission ProviderAccessError.
Idempotency/concurrency evidence: every reviewer mutation is a status- AND version-guarded CAS — updateMany WHERE {id, tenantId, version: expectedVersion, status IN <from-set>} SET {status, version += 1}. Zero rows ⇒ a re-read classifies NOT_FOUND / STALE (version moved) / INVALID_STATE (wrong from-status) — never a blind overwrite. Test: triage with expectedVersion 99 ⇒ STALE and the row is unchanged (still v1); triage from TRIAGE ⇒ INVALID_STATE. The provider response uses the same guard (status INFORMATION_REQUIRED + optional expectedVersion). Event sequence = max+1 with a unique (reconsiderationId, sequence) that fails a concurrent double-append loudly (mirrors the PA log; no silent reorder). The version CAS serializes competing transitions, so only the winner appends.
Privacy/security evidence: toProviderReconsiderationTimeline enforces "the provider sees only shared state" with TWO independent allow-lists — internal workflow events (TRIAGED / ASSIGNED / UNDER_REVIEW / INTERNAL_NOTE) are dropped entirely, and message text is surfaced ONLY for the INFO_REQUESTED / PROVIDER_RESPONDED exchange; internalReasonRef, actorId, metadata and sequence are never carried (the entry shape is exactly {at, type, message}). Test (pure + real-DB): after a real requestInformation + addInternalNote, the provider timeline shows INFO_REQUESTED (with the safe prompt) but NOT the INTERNAL_NOTE, and the note body ("upcoding … fee schedule") + the internalReasonRef pointers never appear in the serialized projection. Event metadata is validated SAFE by the shared assertSafeEventMetadata (ids/codes/short labels only).
Money/reconciliation evidence: NONE by design — F5.14 writes no money and no claim (D13). Test asserts the disputed claim's status + updatedAt are byte-for-byte unchanged across the full triage→assign→request→note sequence.
Focused tests and results: timeline pure 4 (internal events dropped, message gated to the exchange types, no internal-note/ref leak + fixed entry shape, order-preserving + empty-safe) + reviewer real-DB 7 (role gate + triage→assign; SoD block-without-ack / allow-with-ack-and-warn; stale-version + wrong-state refusal; request→respond→resume with the exact ordered event log [SUBMITTED, TRIAGED, INFO_REQUESTED, PROVIDER_RESPONDED, UNDER_REVIEW] and safe messages + PROVIDER actorType; owner-only + pending-only provider response, non-enumerating; internal-activity-absent-from-timeline + claim-untouched; SLA queue + its role gate). Full no-DB suite 1364 pass / 270 skip; the 7 reviewer tests pass on the throwaway PG (54329/pnos_uat, --no-file-parallelism); audit-coverage green; tsc + brand + currency green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service + policy package, no UI in F5.14 (the reviewer admin UI is a flagged deferral, below). Behavior proven headlessly (pure) + on a real Postgres (opt-in).
Feature-flag state: none. Reviewer methods gated by role; the provider response by provider.claim.reconsider.
Backfill/rollout impact: none (additive service on existing F5.11 tables).
Known limitations / deferrals (flagged): (a) the reviewer ADMIN UI + server actions that INVOKE these methods (triage/assign/request/note buttons on an admin reconsideration detail, and the provider's respond form) are DEFERRED — same precedent as the F4 reviewer surface (F4's admin-UI gap is likewise flagged): the service is the tested substance and the UI is a thin invocation layer; the KNOWN_AUDITING_TOKENS entries (ReconsiderationReviewService.requestInformation( etc.) land WITH those actions (F5.14 adds no actions, so PR-020 has nothing to flag now). (b) PER-LINE review drafts (the reviewer's line-by-line notes) are NOT in F5.14 — they belong to F5.15 (reviewerCorrectedEntitlement / maxIncrement) and F5.16 (line outcomes); F5.14 records CASE-level internal notes only. (c) Deadline/completeness "checks" at triage are accept-the-case only (jurisdiction) — a hard completeness/deadline REJECT path (→ CLOSED with a safe reason) can be added when F5.16's outcome writer lands.
Unrelated worktree changes preserved: yes — worktree contained only F5.14 changes; the main-checkout dirty UAT files are untouched; prisma/schema.prisma unchanged.
Next allowed package: F5.15 — Calculate reconsideration maximum delta (M). Depends on F5.14 + the canonical pricing/benefit/decision services. A pure/orchestrated calculation returns corrected FULL entitlement, prior approved/paid, and the maximum POSITIVE delta per line (reuses the F5.11 reconsiderationMaxIncrement invariant). Stop before recording an outcome/award (F5.16).
Stop condition observed: yes — triage + assignment + information flow only; NO financial outcome (no corrected entitlement, no award, no uphold/accept — F5.15/F5.16).
```

---

## F5.15 — Calculate reconsideration maximum delta

```text
Work package: F5.15
Status: COMPLETE
Commit: 9428278
Proof-before-build classification: PRESENT. Read the canonical pricing path before building: the digital-contract engine ContractEngine.evaluateClaimById (contract-engine/engine.ts + types.ts) returns per-line payableAmount + payerLiability + contractVersionId and is READ-ONLY on the evaluate branch (verified: no create/update/upsert in engine.ts lines 70-320); auto-adjudication.service.ts is the reference consumer (it stamps line approvedAmount = engine payableAmount, and falls back to ClaimDecisionService.assessCeiling when unmatched); cost-share.service.ts computeCostShare is pure but CostShareResolver.applyForClaim MUTATES benefitUsage (NOT called here); F5.11 policy owns reconsiderationMaxIncrement. No proof MISSING.
Files changed: src/server/services/claim-reconsideration/calculation.service.ts (new — ReconsiderationCalculationService.computeMaxDelta + the ReconsiderationRepricer port + RepriceResult/RepricedLine/ReconsiderationLineDelta/ReconsiderationDeltaResult types), tests/services/claim-reconsideration-calculation.service.test.ts (new, real-DB opt-in).
Schema/data changes: NONE (reads F5.11 ClaimReconsideration/Line + the live Claim/ClaimLine).
Behavior delivered: a READ-ONLY per-line delta calculation. (1) Loads the case + its disputed lines (claimLineId refs) + the disputed claim's LIVE claim lines (the prior-approved base) + paid status, tenant-scoped. (2) Sums prior ACCEPTED supplemental awards (awardedIncrement) per line across every OTHER reconsideration on the same claim — the "sum all prior linked approved/paid" that prevents double-allowance (§7.8). (3) Re-prices the claim through a REPRICER PORT that defaults to ContractEngine.evaluateClaimById (the canonical pricing/cost-share/benefit logic — never copied) at the claim's governing service date; the default adapter interprets a PENDED line (or an unmatched claim) as NOT deterministically priced. (4) Per line: correctedEntitlement = engine payable, and maxIncrement = the F5.11 invariant reconsiderationMaxIncrement = max(0, correctedEntitlement − max(priorApproved, priorPaid)); a non-deterministic line yields maxIncrement 0 and an explanation asking for reviewer judgment. (5) Returns the per-line breakdown (correctedEntitlement, priorApproved, priorPaid, maxIncrement, deterministic, explanation, pricingSource) + the claim total (Σ maxIncrement = the supplemental ceiling) + the pricing version references (contractId, contractVersionId) + a claim-level deterministic flag. NO money, status, or line is written (F5.16 executes the outcome).
Authorization evidence: reviewer-gated — computeMaxDelta re-asserts RECONSIDERATION_REVIEWER_ROLES (imported from review.service; the admin action does requireRole). Test: a non-reviewer role (CUSTOMER_SERVICE) is refused FORBIDDEN. The case + claim are loaded tenant-scoped (NOT_FOUND otherwise).
Idempotency/concurrency evidence: N/A — pure read, no writes, no idempotency surface. Deterministic: identical inputs (same DB state + same injected repricer) yield an identical result (test asserts deepEqual across two calls).
Privacy/security evidence: the result is a reviewer-facing (internal) calculation — corrected entitlement + pricing provenance are staff data, not exposed to the provider (no provider projection here; F5.16/UI decides what a provider sees of the outcome).
Money/reconciliation evidence: all money is decimal.js, rounded HALF_UP to 2dp only at the string boundary — no float drift (test: 700.10 − 600.05 = 100.05 exact). max() clamps a corrected tariff below the prior to zero (test: 500 corrected vs 600 prior ⇒ 0). Prior awards are subtracted so nothing is allowed twice (test: 900 − (600 original + 200 prior award) = 100, not 300). On a PAID claim the prior is max(approved, paid) (test: 800 corrected − 600 paid = 200). The engine evaluate path performs no writes (verified) — the calculation cannot move money even transitively.
Focused tests and results: 10 opt-in DB — partial/underpaid positive delta + total ceiling; declined line priced from zero prior; PAID claim uses max(approved, paid); prior accepted award summed ⇒ no double-allowance; corrected tariff below prior ⇒ clamped to zero + "no additional amount"; fractional currency exact to 2dp; pended line AND unmatched claim ⇒ non-deterministic, maxIncrement 0, "reviewer judgment"; deterministic replay (identical result object); reviewer role gate + the claim's updatedAt/approvedAmount unchanged (D13); the DEFAULT port (no injected repricer) really calls ContractEngine and handles the no-tariff-fixture unmatched case gracefully (structured result, non-deterministic, no throw). Full no-DB suite 1364 pass / 280 skip; the 10 calc tests pass on the throwaway PG (--no-file-parallelism); audit-coverage green; tsc clean; brand + currency green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — calculation service, no UI. Proven on a real Postgres (opt-in) with an injected canonical-repricer stub for the math and the real engine for the wiring.
Feature-flag state: none. Reviewer-role gated.
Backfill/rollout impact: none (additive read-only service).
Known limitations / design notes: (a) The repricer PORT is injectable so the calculation math is deterministically testable without a full tariff/applicability fixture; the production default is the real ContractEngine — this honors "call existing logic, do not copy it" (the default path calls the engine; no pricing/cost-share/benefit is reimplemented). (b) An UNMATCHED claim (no contract prices it) is treated as non-deterministic per line (maxIncrement 0, flagged for reviewer judgment) rather than falling back to ClaimDecisionService.assessCeiling — a per-line FFS-ceiling fallback can be added if a real unmatched-reconsideration volume warrants it (assessCeiling is claim-level). (c) prior "paid" tracking of supplemental children is conservative: an accepted prior award counts toward priorApproved (committed), and priorPaid stays the original settlement — since max(approved, paid) is taken and priorApproved ≥ priorPaid, the ceiling is correct and never over-allows. (d) F5.15 does NOT persist maxIncrement / reviewerCorrectedEntitlement to the line — it returns them; F5.16 recomputes + persists atomically with the outcome (avoids a stale persisted ceiling).
Unrelated worktree changes preserved: yes — worktree contained only F5.15 changes; the main-checkout dirty UAT files are untouched; prisma/schema.prisma unchanged.
Next allowed package: F5.16 — Execute reconsideration outcome (L; split declined-full and partial-delta paths if necessary). Depends on F5.15 + the approval matrix + Claims Autopilot. Upheld cases close without money; accepted cases create the correct linked canonical child (supplemental) through the canonical intake and NO duplicate payment; require the approval matrix for the incremental award; create no financial child for a zero/negative award. This is the reconsideration line's first SUPERSEDED/supplemental money writer.
Stop condition observed: yes — calculation only; NO outcome execution (no award recorded, no supplemental claim, no money) — F5.16.
```

---
