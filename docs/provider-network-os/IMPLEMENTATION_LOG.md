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
