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

## F5.16 — Execute reconsideration outcome

```text
Work package: F5.16
Status: COMPLETE
Commit: 2ac57e6
Proof-before-build classification: PRESENT. Read the linked-child prior art before building: F5.10 claim-resubmission/submit.service.ts (the reserveReceipt-before-tx idempotency + CAS + retry pattern) and case.service.ts (the caseSystem caller that spawns a canonical child from a CASE — the direct template: parseClaimSubmissionV1 → normalizeSubmission → getSystemActorId → resolveIntakeContext({kind:"caseSystem",caseId,isFinal,providerId,systemActorId}) → reserveReceipt → submitWithinTransaction); claim-replacement/submission.ts buildReplacementSubmission (the shared full-form builder); the ClaimSubmissionType enum already reserves RECONSIDERATION for F5.11-F5.16; ContractEngine/ClaimDecisionService.decide confirmed the decision path posts fund/GL (COA-dependent) ⇒ NOT called inline. No proof MISSING.
Files changed: src/server/services/claim-reconsideration/outcome.service.ts (new — ReconsiderationOutcomeService.execute + ReconsiderationOutcomeDecision/ReconsiderationOutcomeResult types), tests/services/claim-reconsideration-outcome.service.test.ts (new, real-DB opt-in).
Schema/data changes: NONE (reuses F5.11 ClaimReconsideration/Line + the canonical Claim + the Claims Autopilot intake; submissionType RECONSIDERATION already in the enum).
Behavior delivered: the reviewer records a frozen, capped outcome on a reconsideration case. (1) Reviewer-gated (RECONSIDERATION_REVIEWER_ROLES); a safe outcome reasonCode + provider-facing safeExplanation are required (internalNotes stays internal, §9). (2) Replay: a case already in a terminal outcome (ACCEPTED/PARTIALLY_ACCEPTED/UPHELD/WITHDRAWN/CLOSED) returns its recorded result idempotently — no re-write. (3) Each awarded increment is validated ≥ 0 and HARD-CAPPED to the F5.15 maximum (computeMaxDelta with the same injectable repricer; prior accepted supplemental awards already subtracted there) — an award above the line max is refused INVALID. (4) Disposition ↔ award consistency: UPHELD must award zero (else INVALID); ACCEPTED/PARTIALLY_ACCEPTED must award a positive total (else INVALID). (5) When money moves, the child is built from the ORIGINAL claim (serviceType/benefitCategory/dateOfService/diagnoses) + the awarded positive per-line deltas as billed lines, via buildReplacementSubmission, and an idempotent receipt is reserved BEFORE the tx (idempotencyKey recon-outcome:<id>) so a same-content retry resolves to the same child; a same-key different-content reserve is a CONFLICT. (6) ATOMIC tx: a status- AND version-guarded CAS on the case (updateMany WHERE version + status ∈ {TRIAGE,UNDER_REVIEW,PROVIDER_RESPONDED}) claims the one outcome (zero rows ⇒ classify STALE/INVALID_STATE, rollback); the per-line awardedIncrement/maxIncrement/reviewerCorrectedEntitlement/outcomeReasonCode are frozen; when accepted, the child is created through the CANONICAL Claims Autopilot intake (D5 — caseSystem caller, CASE_FINAL channel, submitWithinTransaction), stamped submissionType RECONSIDERATION + chainRootClaimId, linked via the case's supplementalClaimId, with a RECEIVED adjudicationLog; the outcome event (UPHELD/ACCEPTED/PARTIALLY_ACCEPTED) is appended. (7) A hash-chain audit (RECONSIDERATION:OUTCOME) + a safe provider notification fire AFTER a consistent commit. A claim-number/serialization collision retries the whole tx (buildReplacementSubmission's isRetryableWrite/MAX_TX_ATTEMPTS); a STALE/INVALID_STATE race is a domain result and is NOT retried.
Authorization evidence: reviewer-gated (defence-in-depth role membership behind the action's requireRole); the child intake authorizes through the caseSystem system actor (getSystemActorId) on the CASE_FINAL channel (isSystemActor, providerDerived from the original's provider). Test: a non-reviewer (CUSTOMER_SERVICE) is refused FORBIDDEN.
Idempotency/concurrency evidence: TWO layers. The case-status CAS makes a concurrent double-outcome resolve to exactly ONE winner (the loser gets STALE/INVALID_STATE and its tx — including any child insert — rolls back); the receipt (recon-outcome:<id>) makes the child intake idempotent. Test: two concurrent execute() ⇒ exactly one fulfilled + exactly one child row; a re-execution of a decided case replays (same supplementalClaimId, no second child); a stale expectedVersion ⇒ STALE.
Privacy/security evidence: the outcome carries a safe reasonCode + provider-facing safeExplanation (the notification/event message); internalNotes is written to the case's outcomeInternalNotes (never in the provider projection/timeline, F5.11/F5.14).
Money/reconciliation evidence: the ORIGINAL claim + its lines are byte-for-byte untouched (D13 — test asserts status/updatedAt/approvedAmount unchanged across the outcome). The child bills EXACTLY the award: Σ child line billedAmount = the awarded total (test: 300 single, 300+100=400 multi), each capped to the F5.15 max (an over-max award refused; a prior accepted award of 200 lowers the cap from 300 to 100). A zero/negative award creates NO financial child (UPHELD). No duplicate payment: the original stands, the child adds only the delta. The child is created RECEIVED — its settlement (benefit/GL/fund) is the canonical pipeline's exactly-once concern (F5.16 does not post GL/fund; verified decide() posts fund/GL and is not called here).
Focused tests and results: 9 opt-in DB — ACCEPT creates one linked child (submissionType RECONSIDERATION, chainRootClaimId = original) billing the award, capped, original untouched (D13); UPHOLD/zero ⇒ no child; multiple awarded lines sum to the award; award above max refused (case untouched); prior accepted supplemental subtracts from the cap; concurrent double-outcome ⇒ exactly one child; re-execution replays (no second child); a child build failure (no diagnosis) leaves the case UNDER_REVIEW @ same version with no orphan child (recoverable); reviewer role gate + version guard. Full no-DB suite 1364 pass / 289 skip; the 9 outcome tests pass on the throwaway PG (--no-file-parallelism); claim-status-mutation-guard green; audit-coverage green; tsc clean; brand + currency green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service, no UI (the reviewer admin UI is deferred with the F5.14 reviewer surface). Proven on a real Postgres: the canonical intake genuinely creates a RECEIVED child via the caseSystem channel in the harness; the money math + concurrency + immutability are asserted directly.
Feature-flag state: none. Reviewer-role gated.
Backfill/rollout impact: none (additive service). New enqueue eventType RECONSIDERATION_DECIDED (in-app).
Known limitations / delegations (flagged): (a) The child's SETTLEMENT (approval-matrix approval of the supplemental + benefit/GL/fund posting) is delegated to the canonical pipeline — the child is a normal RECEIVED claim that flows through the standard approval/settlement owners; F5.16 does not re-implement settlement (mirrors F5.10, and the COA-less test harness cannot E2E GL/fund). "benefit/GL/fund/settlement exactly once" is therefore proven at F5.16's level as "exactly ONE financial child, idempotent, Σ child lines = award, hard-capped" — the child's own settlement exactly-once is the pipeline's guarantee. (b) The declined-original and partial/paid paths are UNIFIED: the child always bills the awarded positive deltas (for a declined original the award equals the full corrected entitlement, since prior approved is 0), differing only in that the original is never superseded (D13 — additive supplemental, linked via supplementalClaimId + chainRootClaimId, not a chain-pointer advance) — a stricter declined→RESUBMISSION-that-supersedes is the alternative but D13 + the unified award-billing model keeps "Σ child lines = award" holding uniformly. (c) A reviewer ADMIN UI + server action to invoke execute() is deferred with the rest of the reviewer surface (F5.14). (d) The child idempotency key is per-case (recon-outcome:<id>), so revising the award after a hard (non-retryable) build failure with different content returns CONFLICT — safety-first (one outcome per case); the reviewer retries the same content, or the case is reopened.
Unrelated worktree changes preserved: yes — worktree contained only F5.16 changes; the main-checkout dirty UAT files are untouched; prisma/schema.prisma unchanged.
Next allowed package: F5.17 — Consolidate legacy appeal semantics (M). Depends on F5.16. Inventory historic APPEALED / APPEAL_APPROVED / APPEAL_DECLINED (claim-adjudication.service initiateAppeal); define a safe mapping with product/claims/finance; new actions use reconsideration ONLY; legacy same-claim appeals become read-only/mapped or migrated with explicit evidence.
Stop condition observed: yes — outcome execution only; NO legacy appeal migration (F5.17).
```

---

## F5.17 — Consolidate legacy appeal semantics

```text
Work package: F5.17
Status: COMPLETE
Commit: 79af013
Proof-before-build classification: PRESENT. Inventoried the legacy appeal surface before changing it: claim-adjudication.service.ts::initiateAppeal (the only writer of status:"APPEALED"); (admin)/claims/[id]/adjudication-actions.ts::initiateAppealAction (the action); (admin)/claims/[id]/page.tsx (the "Initiate Appeal" form + canAppeal); the ClaimStatus enum (APPEALED/APPEAL_APPROVED/APPEAL_DECLINED); claim-lifecycle.ts TRANSITIONS (…→APPEALED, APPEALED→APPEAL_*); report-exclusions.ts + claim-autopilot/evaluate.ts (APPEAL_DECLINED historic handling); page.tsx audit-icon display for APPEAL_APPROVED/DECLINED. Confirmed via grep that APPEAL_APPROVED/APPEAL_DECLINED have NO status writer anywhere (dead targets — the resolution flow was never built); only APPEALED was ever written. Mirrored the existing claim-status-mutation-guard.test.ts for the architecture-guard scan. No proof MISSING.
Files changed: src/server/services/claim-adjudication.service.ts (initiateAppeal retired → throws), src/app/(admin)/claims/[id]/adjudication-actions.ts (initiateAppealAction removed), src/app/(admin)/claims/[id]/page.tsx (form + canAppeal + import removed), src/server/services/claim-lifecycle.ts (APPEALED edges annotated retired, kept), src/server/services/claim-reconsideration/legacy-appeal.ts (new — pure mapping), tests/audit-coverage/catalogue.ts (drop the stale initiateAppealAction entry), tests/services/legacy-appeal-consolidation.test.ts (new), docs/provider-network-os/LEGACY_APPEAL_CONSOLIDATION.md (new).
Schema/data changes: NONE. The legacy ClaimStatus values are kept (no deletion — the Stop condition).
Behavior delivered: (1) initiateAppeal is RETIRED — it throws PRECONDITION_FAILED directing to reconsideration and no longer performs the prisma.claim.update({ status: "APPEALED", appealDate, appealNotes, appealReviewerId }) or the CLAIM:APPEAL_INITIATED audit. (2) The admin action initiateAppealAction and the "Initiate Appeal" form (+ the canAppeal gate + the page import) are removed — new same-claim appeals cannot be created; the historic APPEALED status badge and audit log render unchanged. (3) The claim-lifecycle TRANSITIONS graph keeps its APPEALED edges (annotated retired) so historic APPEALED / APPEAL_APPROVED / APPEAL_DECLINED records stay valid; no code performs those transitions anymore. (4) A pure legacy-appeal module DEFINES the safe mapping (LEGACY_APPEAL_TO_RECONSIDERATION: APPEALED→UNDER_REVIEW, APPEAL_APPROVED→ACCEPTED, APPEAL_DECLINED→UPHELD) and mapLegacyAppealToReconsideration(claim) — a read-only projection to the reconsideration case a legacy appeal would become (reasonCode LEGACY_APPEAL, narrative from appealNotes, originalAdjudicatorId + filedAt preserved), flagging migratable ONLY for records with unambiguous facts (notes present AND a reviewer distinct from the adjudicator). It never touches a claim (D13). (5) An architecture-guard test scans the source tree for any legacy-appeal status write.
Authorization evidence: N/A — this REMOVES a privileged mutation path (the CLINICAL-gated appeal action) and adds a pure mapping + a scan-based guard; no new authority surface.
Idempotency/concurrency evidence: N/A — no new writes. The point is that the old status-mutation path is gone.
Privacy/security evidence: no new data exposure; the mapping is a pure staff-side projection. Historic appeal display is unchanged.
Money/reconciliation evidence: no money touched. The mapping/migration NEVER edits a claim (D13); a future migration adds reconsideration cases only, so migrated totals/decisions stay unchanged. The dead APPEAL_APPROVED path (a favourable historic appeal) does NOT retroactively create a supplemental — any owed money is a separate explicit F5.16 outcome (documented in the migration gate).
Focused tests and results: 8 pure — ARCHITECTURE GUARD: the scanner runs over the source tree (>100 files) and finds NO status write to APPEALED/APPEAL_APPROVED/APPEAL_DECLINED (comment-aware regex), and nothing outside the service invokes initiateAppeal; the mapping maps each legacy status to the right reconsideration state, preserves the record's identity facts, returns null for a non-appeal status, and flags migratable only with notes + a distinct reviewer; the legacy ClaimStatus enum values still exist (no deletion). Full no-DB suite 1372 pass / 289 skip; audit-coverage green (the stale initiateAppealAction catalogue entry removed); claim-status-mutation-guard green (initiateAppeal no longer writes a status; the service is still an allowlisted settlement-status writer); tsc clean; brand + currency green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: the change removes an admin form; live visual verification deferred (worktree has no .env / seeded admin session) — same convention as F3.7-F5.14. The removal is tsc-verified + the guard test proves the mutation path is gone; historic display code (status badge, audit icons) is untouched.
Feature-flag state: none.
Backfill/rollout impact: none in code. A future legacy-appeal DATA migration is gated (below).
Known limitations / deferrals (flagged): (a) the DATA migration — creating reconsideration cases for migratable legacy appeals — is GATED on product/claims/finance sign-off + a production dry-run inventory (likely zero rows: the appeal-resolution flow was never built, so at most APPEALED records exist, and ambiguous ones are not migrated). It adds cases only and never edits a claim, so totals/decisions stay unchanged. Documented in docs/provider-network-os/LEGACY_APPEAL_CONSOLIDATION.md. (b) The TRANSITIONS graph keeps the APPEALED edges (rather than deleting them) — the scan guard is the enforcement; a stricter future hardening could also remove the inbound edges so assertClaimTransition rejects →APPEALED, at the cost of updating the shared claim-lifecycle test. (c) initiateAppeal survives as a throwing stub (signature stability) rather than being deleted — the guard test asserts nothing invokes it.
Unrelated worktree changes preserved: yes — worktree contained only F5.17 changes; the main-checkout dirty UAT files are untouched; prisma/schema.prisma unchanged.
Next allowed package: F6.1 — Specify frozen remittance formula and field dictionary (S; depends F0.5 + finance sign-off). This BEGINS phase F6 (remittance/disbursement/payment queries, 12 packages) and is finance-sign-off-gated — a documentation/spec package mapping every provider-visible amount to stored source facts. F5 (claim lifecycle) is COMPLETE (all 17 packages).
Stop condition observed: yes — legacy statuses consolidated + guarded; NO deletion of the legacy statuses; NO data migration run (gated).
```

---

## F6.1 — Specify frozen remittance formula and field dictionary

```text
Work package: F6.1 (BEGINS phase F6 — remittance, disbursement, payment queries)
Status: SPEC COMPLETE — GATED(finance sign-off) for downstream activation
Commit: this documentation-only commit (no feat commit — F6.1 delivers a spec, not code)
Proof-before-build classification: PARTIAL. The stored settlement/voucher/GL facts exist and were characterized in F0.5 (SETTLEMENT_MONEY_MAP.md); the canonical remittance READ MODEL does not exist (§4.2 #16) and ProviderDisbursement does not exist (§4.2 #17, D16). F6.1 is the first mapping of those stored facts to the provider-visible amount definitions, the I5/I6 conservation contract, and the data-gap register. Two read-only evidence agents re-verified every field:line against schema + services before writing. No CONFLICTING path; nothing rebuilt.
Files changed: docs/provider-network-os/REMITTANCE_FIELD_DICTIONARY.md (new — the F6.1 deliverable); docs/provider-network-os/PROGRESS.md (F6.1 row → SPEC COMPLETE · GATED); docs/provider-network-os/IMPLEMENTATION_LOG.md (this note).
Schema/data changes: NONE. No prisma change, no migration, no backfill, no db push. Stop condition is "no code".
Behavior delivered: a finance-approval-gated specification that maps EVERY provider-visible settlement amount to a real stored source fact (each row cites model.field @ schema.prisma:line on this branch). Contents: (1) the central architectural finding that claim money is written by TWO independent unreconciled tracks — Track A decision (Claim.approvedAmount→paidAmount, claim aggregates, per-line ClaimLine.approvedAmount; settlement-authoritative) vs Track B contract-engine provenance (per-line contractedAmount/disallowedAmount/shortfallAmount/providerWriteOff/payerLiability/memberLiability; persist.ts writes provenance-only and never overwrites approvedAmount) which CAN diverge — resolved by rule R-1 (claim header authoritative for money, line breakdown indicative, per-claim residual surfaced); (2) definitions for billed/contracted-allowed/disallowed/member-share/provider-writeoff/approved-payable/settled-paid (steps 1-2) with currency axes (txn vs base, single-currency-per-batch Phase-1 refused-if-mixed) and Decimal HALF_UP-2dp boundary rounding; (3) supplemental/reconsideration lineage display (submissionType/chainRootClaimId/supplementalClaimId/awardedIncrement, I4 ceiling, D13 original-immutable) (step 3); (4) provider-safe reason mapping via ReasonCodeService.resolve → AdjudicationReasonCode.providerDescription/remedy/resubmissionAllowed/category/severity, severity→money meaning, FRAUD_SUSPECTED neutralised, NEVER internalDescription/declineNotes/free-text/ruleTrace/GL codes/maker-checker (step 4, D18); (5) batch/voucher/disbursement/GL formulas with I5 (Σ line payable = Σ claim payable = batch total = voucher amount = successful disbursement [MISSING]) and I6 (base/GL Dr 2010 Claims-payable-settled / Cr 1010 Bank, independent axis) mapped to exact fields + the atomic exactly-once mark-paid gate (step 5); (6) a 12-entry data-gap register (D-1 track divergence; D-2 no claim-level breakdown columns; D-3 dead Claim.excessAmount; D-4 shortfallAmount vs providerWriteOff overlap; D-5 no per-line paid; D-6 no per-line base/currency; D-7 ProviderDisbursement MISSING; D-8 non-uniform precision 65,30 vs 14,2 vs 19,4; D-9 batch baseTotalAmount 0 until mark-paid; D-10 human-decline null reasonCodeId; D-11 legacy voucherless PAID claims; D-12 unenforced batch↔voucher scalar link) each with impact + closing package + finance-decision flag (step 6); plus 6 worked examples (full / partial-writeoff / decline-exclusion / multi-line-costshare / supplemental / multi-currency) as F6.2 + F11.3 fixtures; a §11 handoff to F6.2; and a §12 sign-off block (Q1-Q5) left PENDING.
Authorization evidence: N/A — documentation. It DEFINES the provider-safe field subset (the "Provider-safe?" column) and the never-expose list that F6.2/F6.3 will enforce; it grants no new access and touches no auth code.
Idempotency/concurrency evidence: N/A — no writes. It documents (does not alter) the atomic exactly-once mark-paid gate (updateMany CHECKER_APPROVED→SETTLED, count!==1 → CONFLICT) as an invariant F6.7/F6.8 must not weaken.
Privacy/security evidence: the dictionary is the privacy contract — every field is tagged provider-safe Y/N; the never-expose list (internalDescription, declineNotes, line free-text declineReason/adjustmentReason, ruleTrace/matchedRuleType, internal GL accounts/journalEntryId, makerId/checkerId, peer providers, fraud signals) is spelled out; FRAUD_SUSPECTED maps to neutral text (D18); this document itself contains no member/provider PII (illustrative amounts only).
Money/reconciliation evidence: I5 and I6 are stated as exact-decimal equalities mapped to real columns; today the batch-total = voucher-total = Σ paidAmount = Σ approvedAmount equalities hold by construction in markSettlementBatchPaid, while the line→header equality (D-1) and the disbursement leg (D-7) are named as NOT-yet-enforced with the packages that close them (F6.2 per-claim reconciliation, F6.9 batch job, F6.7/F6.8 disbursement). No money moved; nothing recomputed.
Focused tests and results: none (spec, no code). The 6 worked examples are the acceptance fixtures F6.2/F11.3 will encode. No suite run required for a doc-only change; brand + currency guards run at the commit boundary (below).
Typecheck/schema result: no code/schema ⇒ tsc/prisma unaffected; brand:guard + currency:guard run before commit.
Manual/visual evidence: N/A — no UI.
Feature-flag state: none introduced. Documents that providerRemittanceV2 (§11.1) stays OFF and no provider-facing remittance read activates until the §12 sign-off (claims + network + finance) is complete — §11.6 stage 1 "internal evidence only".
Backfill/rollout impact: none. This is stage-1 internal evidence. Downstream gap closures (ProviderDisbursement additive schema, backfills, reconciliation job) belong to F6.2/F6.7/F6.8/F6.9 under the §11.2 additive sequence.
Known limitations / deferrals (flagged): (a) the whole of F6 remains finance-sign-off-gated — F6.1 delivers the artifact TO be signed (§12 Q1-Q5 PENDING); the downstream reads do not activate until then. (b) The two-track divergence (D-1) is a genuine pre-existing data-quality risk this spec surfaces rather than fixes — R-1 makes the claim header authoritative and mandates F6.2 to surface a residual; a stricter reconciliation (forcing Σ line = header at decision time) is a claims-engine change out of F6 scope. (c) ProviderDisbursement (D-7) is entirely missing — until F6.8, "paid" on a statement means accounting-settled, and the spec requires the statement to label this honestly. (d) Multi-currency-per-statement aggregation (Q4) is deferred; Phase-1 is single-currency-per-batch (already enforced in code).
Unrelated worktree changes preserved: yes — worktree contained only the F6.1 docs; the main-checkout dirty UAT files (uat/*, scripts/uat-*, the two root plan .md files) are untouched; prisma/schema.prisma unchanged; no src change.
Next allowed package: F6.2 — Build canonical ProviderRemittanceService (M; depends F6.1 + F1.3). One scoped read model producing batch/claim/line/reason/voucher/current-disbursement detail per §4, computing the §8 conservation result with Decimal, excluding "Provider-safe? = N" fields, surfacing the R-1 per-claim residual (D-1). Per §11.6 stage 1 the SERVICE + its tests (the §10 worked examples, cross-provider denial, no-live-recompute, pagination-reconciles) may be BUILT as internal evidence WITHOUT finance sign-off — but no provider PAGE (F6.4) / no providerRemittanceV2 read activates until §12 is signed. Stop: no page/export.
Stop condition observed: yes — definitions + worked examples + data-gap register + sign-off block delivered; NO code, NO schema, NO data. §12 sign-off left PENDING by design.
```

---

## F6.2 — Build canonical `ProviderRemittanceService`

```text
Work package: F6.2
Status: COMPLETE (stage-1 internal evidence; provider-facing read remains F6.1 §12 finance-sign-off-gated)
Commit: feat 3f580cf + docs (this commit)
Proof-before-build classification: MISSING → built only F6.2. No ProviderRemittanceService exists (F0.5 §4.2 #16); provider + admin each query settlement tables directly. Read the F1.3 ProviderAccessContext (requirePermission/assertProviderOwned/NOT_FOUND-safe), the F3.7 PreauthReadService non-enumerating scope pattern, the F5.9 LEGACY_DECLINE_RESUBMISSION safe decline map (reused), the decimal.js precedent (claim-reconsideration/policy.ts), the current raw provider settlements page, the tests/factories/provider-network.ts factory, and confirmed provider.settlement.read exists in prisma/seeds/provider-rbac.ts. No CONFLICTING path.
Files changed: src/server/services/provider-remittance/projection.ts (new, pure — money/reason/line/claim/batch projection + computeConservation), src/server/services/provider-remittance/service.ts (new — getBatchRemittance + listBatches + ProviderRemittanceError), tests/factories/provider-network.ts (added createSettlementBatch fixture + batch/voucher/reason-code teardown + batchSeq), tests/services/provider-remittance-projection.test.ts (new, pure, always-run), tests/services/provider-remittance.service.test.ts (new, opt-in DB).
Schema/data changes: NONE. Read-only over existing ProviderSettlementBatch/PaymentVoucher/Claim/ClaimLine/AdjudicationReasonCode. No prisma change, no db push against a real DB (only the throwaway pnos_uat@54329 was touched, for tests).
Behavior delivered: the ONE scoped frozen read model implementing the F6.1 field dictionary. getBatchRemittance(ctx, batchId, {page,pageSize}): (1) authorizes via ProviderAccessService.requirePermission('provider.settlement.read'); (2) loads the batch provider-scoped and NON-ENUMERATING (findFirst {id,tenantId,providerId} → ProviderRemittanceError NOT_FOUND, identical to an absent id — a caller cannot probe another provider's batch ids, §9.1); (3) projects the §4 dictionary (batch header, voucher, per-claim, per-line) from STORED snapshots ONLY — it never imports or calls ContractEngine/FxService, so no live tariff/FX/contract recompute (D15); (4) reads the voucher by the scalar settlementBatchId link, provider-scoped, and never projects journalEntryId; (5) computes the §8 conservation over the WHOLE batch via DB aggregates (Σ claim approvedAmount / paidAmount / approvedBaseAmount and Σ line approvedAmount), so I5/I6 are invariant across pagination — reporting each transaction-axis leg (lineToHeader R-1/D-1, headerToBatch, batchToVoucher, paidToApproved) and base-axis leg (I6, only once SETTLED, D-9), all with decimal.js HALF_UP 2dp, plus the R-1 per-claim residual (lineResidual/linesReconciled: header authoritative for money, divergence surfaced not hidden) and disbursementLeg:"MISSING" (D-7); (6) paginates claim/line detail deterministically (orderBy [claimNumber, id]); (7) excludes every "Safe? = N" field by construction (no makerId/checkerId/notes/journalEntryId/internalDescription/declineNotes/free-text declineReason/adjustmentReason/ruleTrace/matchedRuleType/contractedRate). Provider-safe reasons reuse the F5.9 LEGACY_DECLINE_RESUBMISSION map for the claim-level enum (FRAUD_SUSPECTED already neutralised) and the ClaimLine.reasonCode relation (providerDescription/remedy/resubmissionAllowed/category/severity — never internalDescription) for line-level (§7/D18). Track A Claim.approvedAmount is the authoritative payable; Track B ClaimLine.payerLiability is shown as clearly-labelled provenance (may diverge, D-1). listBatches(ctx) adds the provider-scoped settlement list read (voucher ref + payment status) for F6.4.
Authorization evidence: every entry requires provider.settlement.read (ProviderAccessError FORBIDDEN_PERMISSION otherwise — tested) and scopes every query by ctx.tenantId + ctx.providerId. Cross-provider (provider B → provider A's batch) and cross-tenant (provider C/Beta → Alpha's batch) both resolve to NOT_FOUND, non-enumerating (tested). Settlement batches carry no branch column, so scoping is provider-level (documented — a branch-restricted finance user still sees the provider's full batch, since a batch aggregates across branches).
Idempotency/concurrency evidence: N/A — pure read model, no writes, no status transition (mutation-guard not applicable — nothing added to the allowlist), no server action (audit-coverage not applicable).
Privacy/security evidence: the projection is the privacy boundary — the "Safe? = N" columns are never selected/returned; a test asserts the batch/claim/line snapshots omit maker/checker/notes/journalEntryId/declineNotes/contractedRate/ruleTrace/matchedRuleType/free-text declineReason. Payment facts are labelled honestly: batch.disbursement is null and paymentFactsRecorded=false with a note that "paid" is accounting-settled only (D-7/D16), never implying a bank fact we do not have.
Money/reconciliation evidence: conservation is computed with decimal.js against stored snapshots. I5 (Σ line payable = Σ claim payable = stored batch total = voucher amount = Σ paid) and I6 (base axis) are asserted true for the reconciled worked examples (E1/E4/E6) and FALSE — with the exact failing leg + a D-1 note — when line Σ diverges from the header or the stored batch total drifts. The disbursement leg is reported MISSING (D-7) rather than silently assumed. No money is mutated; the original claim/line/batch/voucher facts are read byte-for-byte.
Focused tests and results: 20 pure (money HALF_UP incl. Prisma.Decimal-like + null; safe reason mapping incl. FRAUD_SUSPECTED neutralised + generic fallback; projectLine derived paid + contracted-null passthrough + A-vs-B payable; projectClaim residual + lineage isSupplemental; computeConservation for E1 full / E2 writeoff / D-1 divergence / batch-total drift / pre-settlement N/A legs / E6 multi-currency; projectBatch D-7 null disbursement + D-9 base-only-when-settled + no journalEntryId) + 10 opt-in DB (E4 project+conserve I5&I6; no-recompute shows frozen approvedAmount 2500 not engine payerLiability 9999; cross-provider NOT_FOUND; cross-tenant NOT_FOUND; permission FORBIDDEN; unknown id NOT_FOUND; provider-safe snapshot omits internals; pagination page-slices differ but conservation totals invariant + no claim on two pages; D-1 service-level residual surfaced + i5Holds false; listBatches provider isolation). Full no-DB suite 1392 pass / 299 skip (was 1372/289 at F5.17: +20 pure, +10 DB-skipped); DB suite 10/10 on the throwaway PG (--no-file-parallelism); tsc --noEmit clean; brand + currency guards green; audit-coverage + mutation-guard green (no action/no status writer).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service only, no page (stop condition). Proven on real Postgres: the service reads genuine ProviderSettlementBatch/PaymentVoucher/Claim/ClaimLine rows and conserves; the frozen-fact behaviour is proven by the no-recompute test.
Feature-flag state: none introduced. This is §11.6 stage-1 internal evidence; the provider-facing read stays OFF behind the F6.1 §12 finance sign-off (providerRemittanceV2, §11.1) — F6.2 wires NO provider page/route (F6.4) and no flag flip.
Backfill/rollout impact: none (additive read-only service). No data migration.
Known limitations / deferrals (flagged): (a) provider read activation is gated on the F6.1 §12 finance sign-off — F6.2 is the internal read model, not a provider surface (F6.4). (b) The admin extension (F6.3) — the authorized "Safe? = N" finance fields — is intentionally NOT built here; the provider-safe model is structured so F6.3 layers it via a separate operator permission. (c) The successful-disbursement leg of I5 stays unverifiable until ProviderDisbursement exists (D-7 → F6.7/F6.8); the service already reports disbursementLeg:"MISSING". (d) Batch↔voucher is a scalar link (D-12); the service joins by scalar and F6.9 will assert 1:1. (e) Settlement is provider-level (no branch column), so branch-restricted finance users are not branch-narrowed on settlements — documented.
Unrelated worktree changes preserved: yes — worktree contained only F6.2 changes; scratchpad/ (throwaway db.env) is untracked and NOT staged; the main-checkout dirty UAT files are untouched; prisma/schema.prisma unchanged.
Next allowed package: F6.3 — Migrate admin settlement detail to the remittance service (S; depends F6.2). Make the existing admin settlement detail consume ProviderRemittanceService without losing authorized finance fields: compare current vs target fields, separate the provider-safe model from the admin extension (the Safe?=N fields behind a separate operator permission), replace the duplicate select/arithmetic, add parity snapshot/conservation tests, retain admin-only evidence explicitly. Stop: no provider page.
Stop condition observed: yes — read model + tests only; NO provider page, NO CSV/PDF export, NO admin migration (F6.3), NO flag flip.
```

---

## F6.3 — Migrate admin settlement detail to the remittance service

```text
Work package: F6.3
Status: COMPLETE
Commit: feat 32792a8 + docs (this commit)
Proof-before-build classification: PARTIAL → migrated the existing admin detail onto the F6.2 read model. Characterized src/app/(admin)/settlement/[id]/page.tsx (requireRole(FINANCE), tenant-scoped, duplicate direct selects of batch/claims/voucher + Number() arithmetic, an admin-only Journal Entry cross-link, hardcoded "UGX"), src/app/(admin)/settlement/page.tsx (list, out of scope), and confirmed F6.2's getBatchRemittance is provider-scoped (so the admin needs an operator entry). No CONFLICTING path.
Files changed: src/server/services/provider-remittance/service.ts (extracted a shared assembleCore + added getBatchRemittanceForOperator + RemittanceAdminExtension/OperatorBatchRemittance types + raised MAX_PAGE_SIZE 200→1000), src/app/(admin)/settlement/[id]/page.tsx (consumes the operator read model), tests/factories/provider-network.ts (createSettlementBatch gained withJournal/notes + JournalEntry teardown), tests/services/provider-remittance.service.test.ts (+6 operator/parity tests, e4 now withJournal+notes, added provider-B/C batches).
Schema/data changes: NONE. Read-only migration.
Behavior delivered: (1) A shared assembleCore(db, batch, scope, opts) now does the claim/line/voucher load + aggregates + projection + conservation ONCE, consumed by BOTH the provider entry (getBatchRemittance) and the new operator entry — so the operator/admin view and the provider view can never drift (F6.3 step 3, replaces the page's duplicate select/arithmetic). (2) getBatchRemittanceForOperator({tenantId}, batchId, opts): tenant-scoped (an operator views any provider's batch in their tenant — settlement batches are provider-level, not client-level, so there is no client confinement); authorization stays the caller's operator-role gate (the page keeps requireRole(FINANCE)); returns null (→ notFound) rather than throwing, since an internal operator is trusted and enumeration is not a concern within their own tenant (contrast the provider entry, which throws a non-enumerating NOT_FOUND at the untrusted provider boundary); returns the SAME provider-safe model as the provider entry PLUS an admin extension — the F6.1 "Safe? = N" fields: maker/checker {id,name}, batch notes, provider contact (name/type/email/phone/address), and the GL journalEntry {entryNumber, entryDate, description}. (3) The provider entry is unchanged and NEVER carries the admin extension (separation-of-model proven by test). (4) The admin page now sources every field from the read model (member, billed, approved/paid, voucher, journal), uses batch.currency instead of a hardcoded "UGX" label, adds a finance conservation badge (lines = claims = batch = voucher ✓/⚠) + maker/checker names, and shows an explicit "showing N of M claims" note (MAX_PAGE_SIZE raised to 1000 so a statement renders every claim for any realistic batch; no silent truncation). Admin-only evidence (journal entry, provider contact, maker/checker) is retained explicitly in the admin extension.
Authorization evidence: the page keeps requireRole(FINANCE); the operator service method scopes strictly by scope.tenantId (an Alpha operator reading a Beta batch resolves to null — tested) and can read any provider's batch within the tenant (tested against provider A and provider B batches). The provider entry retains its provider.settlement.read + providerId scoping unchanged (F6.2 tests still green).
Idempotency/concurrency evidence: N/A — read-only, no writes, no status transition, no server action (audit-coverage/mutation-guard not applicable).
Privacy/security evidence: the admin extension is returned ONLY by the operator entry; the provider entry's shape is unchanged and carries no admin field (tested: p.admin is undefined). The GL journalEntryId is selected in the shared assembler but the provider-safe projectBatch strips it — only the operator entry surfaces the resolved journal entry. No provider is exposed to another (the operator view is a single batch, provider-level).
Money/reconciliation evidence: parity test asserts the operator view's claim set (claimNumbers), per-claim billed/approved, batch total, and voucher number equal a direct DB query of the same batch — the migration loses no field and changes no amount. Conservation (I5) is displayed on the admin page from the read model and asserted true for the reconciled fixture.
Focused tests and results: +6 opt-in DB (operator returns provider-safe model + admin extension with resolved maker/checker/notes/provider/journalEntry; parity vs a direct query — no lost fields; operator sees any in-tenant provider's batch incl. provider B; Alpha operator on a Beta batch ⇒ null; unknown id ⇒ null not throw; provider entry carries no admin). All prior F6.2 tests still green under the assembleCore refactor. DB suite 16/16; full no-DB suite 1392 pass / 305 skip (+6 DB-skipped vs F6.2); tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: admin page migration is tsc-verified + backed by service parity tests; live visual verification deferred (the worktree has no .env / seeded admin session and :3000 is a foreign main-checkout server — the F3.7–F5.x convention). The page renders the same fields as before, now sourced from the canonical read model, plus a conservation badge and correct currency label.
Feature-flag state: none. This migrates an EXISTING operator-only admin page (already gated by requireRole(FINANCE)); it introduces no provider-facing surface, so the F6.1 §12 finance sign-off / providerRemittanceV2 gate is not implicated here (that gate governs F6.4's provider page).
Backfill/rollout impact: none (read-only migration).
Known limitations / deferrals (flagged): (a) the admin settlement LIST page (src/app/(admin)/settlement/page.tsx) still uses a direct query — out of F6.3's "detail" scope; a later cleanup can move it onto listBatches (operator variant not yet built — the current listBatches is provider-scoped). (b) The admin detail shows the claim-level statement (as before) plus conservation; the per-line breakdown available in the read model is intentionally not surfaced on the admin page yet (kept the statement layout). (c) Client confinement (G2.1) is deliberately NOT applied to settlement (a batch is provider-level and can pay claims across clients) — documented. (d) A batch beyond 1000 claims shows a "first N of M" note and relies on the F6.5 CSV export for the full set.
Unrelated worktree changes preserved: yes — worktree contained only F6.3 changes; scratchpad/ (throwaway db.env) untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F6.4 — Build provider settlement detail (M; depends F6.2). /provider/settlements/[id] renders the §8.9 detail accessibly and securely from getBatchRemittance — this is the FIRST provider-FACING remittance surface, so it is gated on the F6.1 §12 finance sign-off + providerRemittanceV2 (§11.1) before it can serve a provider. Stop: page only, no export.
Stop condition observed: yes — admin detail migrated onto the read model with parity; NO provider page (F6.4), NO export, NO schema change, NO flag flip.
```

---

## F6.4 — Build provider settlement detail

```text
Work package: F6.4
Status: COMPLETE (behind providerRemittanceV2, default OFF — the F6.1 §12 finance-sign-off gate)
Commit: feat 4877679 + docs (this commit)
Proof-before-build classification: MISSING (the /provider/settlements/[id] detail page did not exist — only the list). Read the F6.4 + §8.9 spec, the F1.11 ProviderAccessSettingsService flag pattern (extended, not replaced), the provider detail-page precedent (provider/preauth/[id]: resolveUserContext → guard → scoped read → notFound), providerPermits (legacy-loose nav guard — deliberately NOT used here), and the current /provider/settlements list + nav (already gated by provider.settlement.read). No CONFLICTING path.
Files changed: src/server/services/provider-access-settings.service.ts (added providerRemittanceV2 + remittanceV2ProviderIds + isRemittanceV2Enabled), src/app/provider/settlements/[id]/page.tsx (new — the detail page), src/app/provider/settlements/page.tsx (flag-gated link to the detail), tests/services/provider-access-settings.test.ts (new, pure), tests/services/provider-eligibility.service.test.ts (updated the F1.11 parse-shape assertion for the additive fields).
Schema/data changes: NONE. The flag lives in Tenant.config.providerAccess (untyped JSON, same as F1.11) — no schema, no migration.
Behavior delivered: the FIRST provider-facing remittance surface, §8.9. (1) Server-authorize via ProviderAccessService.resolveUserContext(); the F6.2 service is the single authority (strict provider.settlement.read + provider scope, non-enumerating) — the page translates its errors (FORBIDDEN_PERMISSION → redirect /unauthorized; ProviderRemittanceError NOT_FOUND → notFound, so an absent id and another provider's batch are an identical 404). (2) GATED behind providerRemittanceV2 (§11.1): isRemittanceV2Enabled(tenantId, providerId) is checked first and the route notFounds when off — so a provider gets a 404 until the tenant-global flag or the per-provider allow-list is set (the F6.1 §12 finance sign-off). (3) Renders only the provider-safe read model: batch identity/status/settledAt; summary cards (total payable, voucher number/amount/status, and an honest "payment facts not yet recorded" note per D-7/D16 — never implies a bank fact we do not have); a role=status conservation strip (lines = claims = batch = voucher, ✓ balances / ⚠ under review); per-claim sections linking claim# → /provider/claims/[id], member, service date, a supplemental-lineage badge linking to the original claim, approved/paid, and the provider-safe claim decline reason; an accessible, responsive per-line table (caption sr-only, th scope=col/row, overflow-x-auto + min-w) showing billed / contracted-allowed / disallowed / member share / provider write-off / approved / paid + the provider-safe line reason (remedy in title); and a per-claim residual note when lines ≠ header (R-1). (4) The list page links each row to the detail ONLY when the flag is on (legacy list behaviour otherwise). Step 5 (lineage links) done; step 6 (payment-query action) deferred — it depends on F6.10/F6.11 and the stop condition excludes a query submit.
Authorization evidence: two independent gates — the providerRemittanceV2 flag (feature availability) and the F6.2 service's strict permission + provider scope (access). A provider without provider.settlement.read → /unauthorized; a batch of another provider (or absent) → 404, non-enumerating; the flag off → 404 regardless of permission. providerPermits' legacy-loose fallback is intentionally NOT used for this finance surface (the strict service permission is the authority, matching F5.6).
Idempotency/concurrency evidence: N/A — read-only page, no writes, no server action (audit-coverage/mutation-guard not applicable).
Privacy/security evidence: the page renders getBatchRemittance's provider-safe shape verbatim — the admin extension (maker/checker/notes/journalEntryId, F6.3) exists ONLY on the operator entry and is structurally absent here; no GL account, internal reason, fraud flag, peer provider, or bank plaintext is reachable. The "no GL/internal/bank leakage" acceptance is inherited from the F6.2 provider-safe snapshot test (the page adds no new field).
Money/reconciliation evidence: totals and conservation come straight from the F6.2 read model (I5 legs, R-1 residual), which is DB-tested to conserve; the page displays them and labels a non-reconciled claim honestly (claim header is the settled amount). No amount is computed on the page.
Focused tests and results: +7 pure (ProviderAccessSettingsService.parse defaults on empty/garbage, reads the F6.4 flags + filters non-string ids, only ===true enables; isRemittanceV2Enabled off-by-default / tenant-global-on / per-provider-allow-list-only; entitlement mirror). Updated the F1.11 parse-shape test to the additive defaults (PROVIDER_ACCESS_DEFAULTS). Full no-DB suite 1399 pass / 305 skip; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green. The F6.2/F6.3 DB suites are unaffected (the service core was not touched).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: the page is a provider-facing surface, but visual verification is deferred — the flag is OFF by default (the route 404s) and the worktree has no .env / seeded provider session (the :3000 server is a foreign main checkout), the F3.7–F5.x convention. The gate + service authority are unit-tested; the render is tsc-clean and consumes the DB-tested provider-safe model; accessibility (caption, th scope, role=status) and responsiveness (overflow-x-auto) are in the markup.
Feature-flag state: providerRemittanceV2 introduced, DEFAULT OFF (Tenant.config.providerAccess.providerRemittanceV2 / remittanceV2ProviderIds). No flag flipped. Flipping it on for a tenant/provider is the F6.1 §12 finance-sign-off action, made as an explicit settings change — this code only reads it.
Backfill/rollout impact: none (additive flag defaulting off; a new page reachable only when the flag is on).
Known limitations / deferrals (flagged): (a) the whole provider-facing surface stays dark until the F6.1 §12 sign-off flips providerRemittanceV2 — F6.4 ships the page behind the gate (§11.6 stages: this is the pilot-read surface, not yet activated). (b) Payment-query action (spec step 6) is deferred to F6.10/F6.11 (schema/service/pages do not exist yet); the stop condition excludes a query submit. (c) CSV/PDF/print (F6.5/F6.6) are separate packages — the page has no export button yet. (d) Visual/a11y/responsive UAT on a seeded session is deferred to a run with env+seed or post-merge (F11.6 also covers accessibility formally).
Unrelated worktree changes preserved: yes — worktree contained only F6.4 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F6.5 — Generate CSV remittance export (M; depends F6.2). Authorized export derived from the SAME view model with a stable column/version dictionary, frozen filters, async generation for large output, spreadsheet-formula-injection protection, and stored row-count/totals/checksum/requester/expiry delivered through short-lived authorized access. Stop: no PDF.
Stop condition observed: yes — provider detail page behind the flag + list link + flag service + tests; NO export (F6.5), NO PDF (F6.6), NO payment-query submit (F6.11), NO schema change, NO flag flip.
```

---

## F6.5 — Generate CSV remittance export

```text
Work package: F6.5
Status: COMPLETE (synchronous authorized download; async job / stored-artifact-with-expiry deferred — see below)
Commit: feat ba64adb + docs (this commit)
Proof-before-build classification: MISSING (no remittance CSV export existed). Read the existing app CSV export pattern (src/app/api/fund/[groupId]/statement/export/route.ts — a synchronous GET returning text/csv, and notably WITHOUT formula-injection protection), the provider route-handler auth pattern (F2.6 /provider/documents/[id]/download: resolveUserContext → service → map code to 403/404), confirmed provider.settlement.export in prisma/seeds/provider-rbac.ts (granted to finance), and the writeAudit helper (src/lib/audit.ts). Decision: a synchronous authorized download matching the app's established exports, ADDING the formula-injection protection they lack; the async-job + stored-artifact + short-lived-expiring-link infra does not exist in the app and is a flagged scale deferral.
Files changed: src/server/services/provider-remittance/csv.ts (new — pure serializer), src/server/services/provider-remittance/service.ts (exportBatchCsv + REMITTANCE_EXPORT_PERMISSION), src/app/provider/settlements/[id]/export/route.ts (new — route adapter + egress audit), src/app/provider/settlements/[id]/page.tsx (flag+perm-gated Export CSV link), tests/services/provider-remittance-csv.test.ts (new, pure), tests/services/provider-remittance.service.test.ts (+5 export tests).
Schema/data changes: NONE. Read-only export. (Throwaway pnos_uat cluster was recreated this session — see the DB-harness note at the end.)
Behavior delivered: (1) A PURE, versioned CSV serializer (provider-remittance/csv.ts) that derives a line-grain CSV from the SAME provider-safe read model — no separate query/arithmetic (D15). It has a stable versioned column dictionary (REMITTANCE_CSV_VERSION 1.0 + REMITTANCE_CSV_COLUMNS, append-only), spreadsheet formula-injection protection (OWASP: a cell starting with = + - @ TAB CR is neutralized with a leading apostrophe — the existing fund/report CSV exports lack this), RFC-4180 quoting, a UTF-8 BOM so Excel reads Unicode, decimal totals, and a deterministic sha256 checksum of the exact delivered bytes (no wall-clock in the body). (2) ProviderRemittanceService.exportBatchCsv(ctx, batchId, {pageSize?}): requires provider.settlement.export, then reuses getBatchRemittance (which also enforces settlement.read + provider scope + non-enumerating NOT_FOUND) and PAGES THE READ MODEL TO EXHAUSTION so pagination never omits a row (a tiny pageSize still exports every claim), returns {filename, csv, evidence:{version,rowCount,totals,checksum}}. (3) The route /provider/settlements/[id]/export (thin adapter, F2.6 pattern): resolveUserContext → providerRemittanceV2 flag gate (404 when off, like the F6.4 page) → exportBatchCsv → text/csv download with Content-Disposition + X-Remittance-{Csv-Version,Row-Count,Checksum} headers, and writeAudit('SETTLEMENT:EXPORT') recording requester/rowCount/totals/checksum; FORBIDDEN_PERMISSION/BRANCH → 403, everything else → 404. (4) The F6.4 detail page gains an Export CSV link gated by both the flag and provider.settlement.export.
Authorization evidence: export requires provider.settlement.export (read alone ⇒ FORBIDDEN — tested); provider scope + non-enumerating NOT_FOUND are inherited from the reused getBatchRemittance (cross-provider export ⇒ NOT_FOUND, tested); the route also flag-gates (404 when providerRemittanceV2 off) so the export is dark until the finance sign-off; the egress is audited.
Idempotency/concurrency evidence: N/A — read-only export, no writes to domain state (the only write is the append-only audit egress record, in the route).
Privacy/security evidence: the CSV is built from getBatchRemittance's provider-safe shape only (no admin/GL/internal/bank field is reachable); formula-injection is neutralized (a hostile line description like "=cmd|'…'!A1" is rendered inert — tested); no internal reason text (only providerDescription / safe decline text). The download is no-store.
Money/reconciliation evidence: the CSV totals equal the read model — evidence.totals.approved === conservation.sumLinePayable (tested), and the per-line rows sum (decimal) to the TOTAL row; pagination-to-exhaustion guarantees every settled line is present (row count = lines, tested with a tiny pageSize). Nothing recomputed.
Focused tests and results: 10 pure (csvCell neutralizes = + - @ TAB CR incl. neutralize-then-RFC-quote for CR, RFC-4180 quoting, plain/positive-money untouched; buildRemittanceCsv BOM + versioned header + column dictionary, one row per line + TOTAL row, totals equal the read model, hostile description inert, deterministic sha256 + change-detection, Unicode preserved) + 5 opt-in DB (export requires settlement.export; totals match the read model + rowCount; tiny pageSize omits no rows; cross-provider ⇒ NOT_FOUND; unknown ⇒ NOT_FOUND). Full no-DB suite 1409 pass / 310 skip (+10 pure, +5 DB-skipped); DB suite 21/21 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: the export is a route handler + a page link; visual verification deferred (providerRemittanceV2 OFF ⇒ the page/route 404; worktree has no .env/seeded provider session — the F3.x–F5.x convention). The CSV bytes, headers, injection-safety, totals, and no-omission are proven by the pure + DB tests.
Feature-flag state: none new. The export route + page link are gated by the existing providerRemittanceV2 (default OFF) — dark until the F6.1 §12 finance sign-off.
Backfill/rollout impact: none (additive read-only export behind the flag).
Known limitations / deferrals (flagged): (a) ASYNC generation for very large output + a STORED export artifact (row-count/totals/checksum/requester/EXPIRY) + a short-lived signed link (spec steps 3/5/6) are DEFERRED — the app has no async-export/job infra, and every existing app CSV export is synchronous; F6.5 stores the evidence via the audit log + response headers instead of an artifact table, and because there is no persisted link there is no separate link to expire (the "result-link expiry" acceptance sub-test is N/A for the synchronous model — cross-provider denial is enforced at the export entry itself, tested). When async export infra lands, add a RemittanceExport artifact + signed short-lived delivery and move the checksum/expiry there. (b) The whole export surface stays dark until providerRemittanceV2 is flipped (F6.1 §12). (c) PDF/print is F6.6.
Unrelated worktree changes preserved: yes — worktree contained only F6.5 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
DB-harness note (for the next resume): the throwaway PG16 cluster from earlier sessions had lost its PG_VERSION (corrupt); recreated fresh this session — initdb → pg_ctl start on port 54329 (socket /tmp/pnospg) → createdb pnos_uat → `npx prisma db push` (NOT `--skip-generate`; that flag is unrecognized by this Prisma's db push and only prints help — the earlier "aborted, needs --accept-data-loss" reads were actually the help text). New pgdata lives in THIS session's scratchpad (…/7be16b45-…/scratchpad/pgdata-pnos2). db.env in the worktree scratchpad points DATABASE_URL=DIRECT_URL=AUTOPILOT_TEST_DB at pnos_uat@54329.
Next allowed package: F6.6 — Generate PDF/print remittance (M; depends F6.2). A provider-safe PDF/print remittance from the SAME view model (the app already uses @react-pdf — see the F3.14 GOP artifact). Stop: no disbursement schema.
Stop condition observed: yes — CSV export (serializer + service + route + page link + tests); NO PDF (F6.6), NO async-artifact/expiry infra, NO schema change, NO flag flip.
```

---

## F6.6 — Generate PDF/print remittance

```text
Work package: F6.6
Status: COMPLETE
Commit: feat 9491624 + docs (this commit)
Proof-before-build classification: MISSING (no provider remittance PDF existed). Read the F3.14 GOP @react-pdf artifact — gop-artifact.ts (pure data builder), GopDocument.tsx (@react-pdf Document), GopButton.tsx ("use client", pdf().toBlob() download) — the app renders PDFs CLIENT-SIDE from a server-built provider-safe DTO. Mirrored that pattern exactly.
Files changed: src/app/provider/settlements/[id]/remittance-pdf.ts (new — pure DTO builder), src/app/provider/settlements/[id]/RemittanceDocument.tsx (new — @react-pdf template), src/app/provider/settlements/[id]/RemittancePdfButton.tsx (new — "use client" button), src/app/provider/settlements/[id]/page.tsx (build the DTO + render the button), tests/services/provider-remittance-pdf.test.ts (new, pure).
Schema/data changes: NONE.
Behavior delivered: a human-readable remittance statement rendered from the SAME read model. (1) buildRemittancePdfData(remittance, {generatedAt}) (pure) flattens getBatchRemittance into a versioned DTO (REMITTANCE_PDF_VERSION 1.0) — provider-safe by construction (it only reads the provider-safe projection, so no admin/GL/internal/bank field can reach the PDF), with money kept as the read model's 2dp strings and the generated time passed IN (not the wall clock) so it is deterministic. (2) RemittanceDocument.tsx (@react-pdf) is the versioned template: a fixed page header (brand, cycle, currency, voucher reference, generated time, version) and a fixed footer with page numbers that repeat across pages; a control-total box (the stored batch total) + a conservation line (balances ✓ / under review ⚠) + the honest payment-facts note (D-7/D16); and a claim/line table (billed / allowed / disallowed / member / write-off / approved / paid + a safe reason sub-row) that wraps and page-breaks for long, multi-page detail, with each row wrap={false} so a row never splits across a page. (3) RemittancePdfButton.tsx ("use client", mirrors GopButton) renders the PDF in the browser via pdf(<RemittanceDocument/>).toBlob() and downloads it. (4) The F6.4 page builds the DTO server-side (generatedAt = new Date()) and renders the button next to Export CSV.
Authorization evidence: the PDF is generated CLIENT-SIDE from data the F6.4 page already fetched under the strict provider.settlement.read + provider scope + providerRemittanceV2 gate — the button is only reachable on that gated, authorized page. There is no new server delivery: the data egress happened at page load (the access event), exactly like the GOP. So no separate export authorization/audit is introduced (and none is needed — the DTO carries only provider-safe fields).
Idempotency/concurrency evidence: N/A — pure client render, no writes.
Privacy/security evidence: the DTO is built solely from the provider-safe projection; a test asserts the claim/line shapes carry none of the internal keys (no makerId/journalEntryId/payerLiability/ruleTrace). The reason text is the safe providerDescription / safe decline text only.
Money/reconciliation evidence: the PDF prints the same totals as the view — the control total is the stored batch total and each line amount is the read model's frozen string; a test asserts claim/line amounts + the control total match. "Identical totals" (F6.6 outcome) holds because the PDF renders the exact projection values, never a recomputation.
Focused tests and results: 6 pure (version/cycle/currency/voucher/control-total; claim/line amount + safe reason parity; supplemental lineage; provider-safe — no internal keys; generatedAt is a deterministic input, omitted ⇒ null; honest payment-facts note for a not-yet-settled batch). Full no-DB suite 1415 pass / 310 skip (+6 pure); tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green. The DB suites are unaffected (no service change).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: the @react-pdf Document is tsc-verified and mirrors the proven F3.14 GOP template; VISUAL QA of short and long examples (spec step 5) is deferred to a seeded run — the surface is behind providerRemittanceV2 (OFF) and the worktree has no .env/seeded provider session (the F3.x–F5.x convention). The data mapping, provider-safety, and totals parity are proven by the pure tests; page breaks / fixed header+footer / wrap are standard @react-pdf features exercised the same way as the GOP.
Feature-flag state: none new. The PDF button lives on the F6.4 page, already gated by providerRemittanceV2 (OFF) — dark until the F6.1 §12 finance sign-off.
Backfill/rollout impact: none.
Known limitations / deferrals (flagged): (a) VISUAL QA (short + long multi-page examples; no clipped/overlapping fields) is deferred to a seeded run — automated PDF-pixel testing is not in the repo and the GOP set the client-render/visual-deferred convention. (b) The client-rendered PDF renders the page's LOADED claims (pageSize 1000); a >1000-claim batch's PDF is capped like the page (with the "first N of M" note), and the CSV export (server, paged to exhaustion) is the complete-data path for huge batches — same trade-off as F6.4. (c) "Deliver securely and audit" (step 6): the client render introduces no new server egress, so the page-load access event is the audit point (matching the GOP); a server-rendered+audited PDF route is a heavier alternative not warranted here. (d) The surface stays dark until providerRemittanceV2 is flipped (F6.1 §12).
Unrelated worktree changes preserved: yes — worktree contained only F6.6 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F6.7 — Add provider disbursement schema/state machine (M; depends F6.1). The D-7/D16 gap: an ADDITIVE ProviderDisbursement model (§7.9 — status PENDING/RELEASED/PROCESSING/SUCCEEDED/FAILED/REVERSED, amount/currency + base + frozen FX ref, method/channel, masked destination, external reference, value date, actors/times, safe-vs-internal failure reason, idempotency key, reconciliation status) + its state machine, pushed to the throwaway PG (prod applies additively on the next build). It must NOT weaken the FG-C7 atomic exactly-once mark-paid gate. Stop: schema + state machine only, no record/confirm service (F6.8).
Stop condition observed: yes — PDF/print (DTO builder + @react-pdf Document + client button + page wiring + tests); NO disbursement schema (F6.7), NO schema change, NO flag flip.
```

---

## F6.7 — Add provider disbursement schema/state machine

```text
Work package: F6.7
Status: COMPLETE
Commit: feat dcfaefd + docs (this commit)
Proof-before-build classification: MISSING (F0.5 §4.2 #17 + F6.1 D-7/D16: ProviderDisbursement does not exist; "paid" today is an accounting state with no actual bank fact). Read the §7.9 field list + the F6.7 steps, the satellite-schema convention (F3.2/F5.11 relation-less id pointers) and the claim-lifecycle TRANSITIONS state-machine pattern, and confirmed no name collision. No CONFLICTING path.
Files changed: prisma/schema.prisma (ADDITIVE: ProviderDisbursement model + DisbursementStatus enum at EOF), src/server/services/provider-disbursement/state-machine.ts (new — pure), tests/factories/provider-network.ts (createDisbursement helper + teardown), tests/services/provider-disbursement.test.ts (new — pure + opt-in DB).
Schema/data changes: ADDITIVE ONLY — a new ProviderDisbursement table + DisbursementStatus enum; no change to any existing model. Pushed to the throwaway PG (prisma validate — NOT format; then db push + explicit generate WITH DIRECT_URL). Prod applies additively on the next build's prisma db push (same as F4.1/F4.8/F5.11). No backfill (new empty table).
Behavior delivered: (1) The ProviderDisbursement model (§7.9) records actual payment facts distinct from the voucher/batch that authorize them (D16): relation-less pointers tenantId/providerId/settlementBatchId/voucherId; status; amount + currency + baseAmount + baseCurrency + fxRateRef (a frozen FX reference — the disbursement never recomputes base from live FX); method/channel; maskedDestination (masked-only — never a plaintext account/MSISDN, §9/D27); externalReference (the bank/channel reference, distinct from the internal voucher number); valueDate; initiated/confirmed/failed/reversed actor ids + times; failureReasonSafe vs failureReasonInternal (separated, §9); reversalOfDisbursementId (a compensating REVERSED record points at what it reverses); idempotencyKey; reconciliationStatus (default UNRECONCILED); version. @@unique([tenantId, idempotencyKey]) (PG treats NULLs as distinct, so keyless rows are unaffected) with NO batch-level unique — the default is one disbursement per batch, but split/partial disbursements are permitted (§I5 "if partial/multiple disbursements are approved later"). (2) The pure state machine: DISBURSEMENT_TRANSITIONS (PENDING→{RELEASED,FAILED}, RELEASED→{PROCESSING,FAILED}, PROCESSING→{SUCCEEDED,FAILED}, SUCCEEDED→REVERSED, FAILED/REVERSED terminal); canTransitionDisbursement / assertDisbursementTransition (throws DisbursementTransitionError); isDisbursementTerminal; isSuccessfulDisbursement (ONLY SUCCEEDED counts for I5's successful-disbursement leg — REVERSED does not, since a reversed payment came back); and DISBURSEMENT_TRANSITION_ACTOR, the maker/checker model (RELEASED=MAKER, SUCCEEDED/REVERSED=CHECKER, FAILED=SYSTEM) which F6.8 binds to the concrete finance roles + actor-id separation. The Record is compile-forced over the DisbursementStatus type (a new enum value breaks it) while import type keeps the module free of a runtime @prisma/client dependency, so it is unit-testable with no client.
Authorization evidence: N/A — schema + pure state machine, no writer, no authorization surface. The maker/checker model is DEFINED here (as pure metadata) and ENFORCED in F6.8.
Idempotency/concurrency evidence: the schema provides the idempotency spine — @@unique([tenantId, idempotencyKey]) (a duplicate same-key record is rejected P2002, tested) + a version column for optimistic concurrency (F6.8 uses it). The state machine's terminal FAILED/REVERSED encodes that a retry is a NEW record, never a resurrection.
Privacy/security evidence: sensitive fields are structurally safe — maskedDestination holds only a masked value (the service will never store plaintext), and failureReasonSafe (provider-facing) is a separate column from failureReasonInternal (a DB test asserts the internal compliance detail is NOT in the safe field). No raw bank/mobile detail column exists.
Money/reconciliation evidence: amount is Decimal(19,4) with an explicit currency + a frozen base snapshot + FX reference (never a live recompute, D15/I6). isSuccessfulDisbursement scopes the future I5 "= sum(successful disbursement amount)" leg (F6.9) to SUCCEEDED only. Crucially, this package makes NO paid-state change: the FG-C7 atomic exactly-once markSettlementBatchPaid gate is untouched (an additive table + a pure module cannot weaken it) — F6.8 is where the disbursement flow integrates with settlement, and it must preserve that gate.
Focused tests and results: 7 pure (forward payment lifecycle; failure from each pre-success state; FAILED/REVERSED terminal; forbids skipping/resurrecting; assert throws on an illegal move; only SUCCEEDED counts for I5; maker/checker actor model) + 4 opt-in DB (round-trip persists status/amount/currency/maskedDestination/externalReference + reconciliationStatus/version defaults; safe-vs-internal failure reason separation; idempotency duplicate rejected P2002; split/partial disbursements on one batch allowed). Full no-DB suite 1422 pass / 314 skip (+7 pure, +4 DB-skipped); DB suite 11/11 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green (no ClaimStatus writer added — DisbursementStatus is a separate enum).
Typecheck/schema result: tsc --noEmit clean; prisma validate passes; schema change is additive (a new table + enum only).
Manual/visual evidence: N/A — schema + pure module, no UI.
Feature-flag state: none. The new table is inert until F6.8 writes to it (and the whole surface stays behind providerRemittanceV2 for provider reads).
Backfill/rollout impact: additive schema; prod applies on the next build's prisma db push. No backfill. No legacy path touched.
Known limitations / deferrals (flagged): (a) NO record/confirm SERVICE — F6.8 builds the writer that drives these transitions (maker/checker via finance roles + actor separation) and integrates with settlement WITHOUT weakening the FG-C7 atomic mark-paid gate. (b) The maker/checker model is metadata here; F6.8 binds MAKER/CHECKER to the concrete ROLES.FINANCE and enforces maker ≠ checker by actor id. (c) The batch↔disbursement cardinality is "1:1 by default, split allowed" — F6.8/F6.9 enforce/reconcile the sum across split disbursements against the batch total (I5).
Unrelated worktree changes preserved: yes — worktree contained only F6.7 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; the schema change is a single additive hunk at EOF (no reflow — prisma format was NOT run).
DB-harness note: this Prisma's `prisma db push` does NOT auto-generate the client — run `npx prisma generate` explicitly (WITH DIRECT_URL) after a push, or tsc/tests won't see the new model (hit this: db push said "in sync" but the client lacked ProviderDisbursement until an explicit generate).
Next allowed package: F6.8 — Implement disbursement record/confirm service (M; depends F6.7). A maker/checker service that records a PENDING disbursement, releases + confirms it through the state machine (maker ≠ checker via finance roles + actor id), records actual method/reference/value date, is idempotent (idempotencyKey) and version-guarded, and integrates with settlement WITHOUT weakening the FG-C7 atomic exactly-once mark-paid gate; a failed/reversed disbursement records a compensating fact and never silently marks a batch unpaid. Stop: no reconciliation dashboard (F6.9).
Stop condition observed: yes — schema + enum + pure state machine + tests; NO record/confirm service (F6.8), NO paid-state change, NO existing-model change.
```

---

## F6.8 — Implement disbursement record/confirm service

```text
Work package: F6.8
Status: COMPLETE
Commit: feat cb94e14 + docs (this commit)
Proof-before-build classification: MISSING (no disbursement writer). Re-read the FG-C7 atomic markSettlementBatchPaid gate (must not weaken), the F5.14 reconsideration-review status+version-guarded CAS (runTransition), inSerializableTx, ROLES.FINANCE (= SUPER_ADMIN, FINANCE_OFFICER), and the DB-safe post-commit audit (auditChainService.append) + NotificationOutboxService.enqueue used by the F5 services (NOT writeAudit, which needs request headers). No CONFLICTING path.
Files changed: src/server/services/provider-disbursement/service.ts (new), tests/services/provider-disbursement-service.test.ts (new, opt-in DB).
Schema/data changes: NONE (writes the F6.7 ProviderDisbursement table; no schema change).
Behavior delivered: finance records/releases/confirms the ACTUAL provider payment for an already accounting-settled batch (§7.9/D16), driving the F6.7 state machine. (1) record (maker) runs in a serializable tx: the batch must be SETTLED and have a voucher; the currency must match the voucher; an over-disbursement guard sums all live disbursements ({PENDING,RELEASED,PROCESSING,SUCCEEDED}) and refuses if that + the new amount exceeds the voucher total (so split/partial disbursements are allowed but the batch can never be over-paid); idempotent on idempotencyKey (a pre-tx replay check + a P2002-race fallback that returns the winner); creates a PENDING row stamped with initiatedById. (2) release (PENDING→RELEASED) and markProcessing (RELEASED→PROCESSING) are maker steps. (3) confirm (PROCESSING→SUCCEEDED) is the checker step — it REQUIRES an external payment reference + a value date (missing either is denied), enforces maker ≠ checker (the confirmer must differ from initiatedById ⇒ SEPARATION_OF_DUTY), stamps confirmedById/valueDate/externalReference, and is the "actually paid" fact. (4) fail ({PENDING,RELEASED,PROCESSING}→FAILED) records a safe + a separate internal reason. (5) reverse (SUCCEEDED→REVERSED) is a checker compensating action. Every transition is role-gated (finance roles as string literals — no rbac/next-auth import), passes assertDisbursementTransition (defence in depth), and is a status- AND version-guarded CAS (updateMany WHERE version = expected AND status ∈ from; zero rows ⇒ re-read to classify NOT_FOUND/STALE/INVALID_STATE — never a blind overwrite), followed by a post-commit auditChainService.append(DISBURSEMENT:*) and, on confirm/reverse, a provider outbox notification.
Authorization evidence: every method asserts a finance role (SUPER_ADMIN/FINANCE_OFFICER); a PROVIDER_USER is refused FORBIDDEN (tested). confirm/reverse additionally enforce maker ≠ checker by actor id vs initiatedById (SEPARATION_OF_DUTY, tested). The service is tenant-scoped (an operator finance actor); every query filters by actor.tenantId.
Idempotency/concurrency evidence: record is idempotent on idempotencyKey (a replay returns the same row, tested) and the @@unique race is caught and resolved to the winner. Every transition is version-guarded — a stale expectedVersion is STALE (tested), and two concurrent confirms resolve to exactly ONE SUCCEEDED (the loser is STALE/INVALID_STATE, tested).
Privacy/security evidence: failureReasonSafe (provider-facing) is written separately from failureReasonInternal (a test asserts the internal "hold #9" detail is not in the safe field); the destination is stored masked (maskedDestination); the provider notification body is PHI-free and links to the settlement.
Money/reconciliation evidence: the over-disbursement guard makes the sum of live disbursements ≤ the voucher total (no over-pay), and split disbursements are permitted (F6.9 reconciles the SUCCEEDED sum to the batch/voucher for I5). CRITICALLY, disbursement operations NEVER mutate the batch/voucher/GL — a test loads the batch + voucher (status/total/settledAt) before and after a full record→release→processing→confirm cycle and asserts they are byte-for-byte unchanged (equal). The FG-C7 atomic markSettlementBatchPaid gate is untouched and unbypassed: the batch is SETTLED only by that canonical owner, which this service requires as a precondition (record refuses a non-SETTLED batch) and never re-implements (spec step 5). "Actually paid" is the disbursement's SUCCEEDED fact, not a new batch state.
Focused tests and results: 10 opt-in DB (record on a SETTLED batch → PENDING; refuse a non-settled batch; refuse currency mismatch + over-disbursement, incl. a valid 600 then a further 600 > 1000; idempotent replay; full lifecycle with maker ≠ checker + confirm-needs-reference/value-date + separation-of-duty; illegal transition (confirm from PENDING) + stale version refused; concurrent confirmation ⇒ exactly one SUCCEEDED; fail safe-vs-internal separation + reverse compensates a succeeded payment; finance role required; FG-C7 batch+voucher byte-for-byte unchanged). Full no-DB suite 1422 pass / 324 skip (+10 DB-skipped); DB suite 10/10 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green (no server action, no ClaimStatus writer).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service, no UI. Proven on a real Postgres: the full maker/checker lifecycle, concurrency, idempotency, over-disbursement, separation-of-duty, and the FG-C7 no-mutation invariant are asserted directly.
Feature-flag state: none. The service is inert until an admin finance UI/action invokes it (deferred, below); the provider-facing remittance that surfaces the disbursement stays behind providerRemittanceV2.
Backfill/rollout impact: none (additive service over the F6.7 table).
Known limitations / deferrals (flagged): (a) the admin finance UI + server action that call record/release/confirm/fail/reverse are deferred (the F5.14 convention — the service is the tested substance; the thin action adds the PR-020 audit-coverage token when it lands). (b) No bank integration (stop) — confirm records the reference/value date a human enters; there is no automated channel callback. (c) The batch's "actually paid" state is the disbursement SUCCEEDED fact; if the business later wants the batch's SETTLED transition itself deferred until disbursement success, that is a canonical settlement-owner change (not this service re-implementing the gate). (d) Reconciling the SUCCEEDED-disbursement sum to the batch/voucher/GL (I5's disbursement leg) is F6.9.
Unrelated worktree changes preserved: yes — worktree contained only F6.8 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged (F6.8 writes the F6.7 table).
Next allowed package: F6.9 — Add settlement reconciliation job/dashboard (M; depends F6.8). A job that verifies, per settlement batch/currency, the I5 chain — Σ remittance line payable = Σ claim payable = stored batch total = voucher amount = Σ successful disbursement — and I6 base/GL, flags exceptions (never auto-repairs), and an operator dashboard. Stop: no query model (F6.10).
Stop condition observed: yes — record/confirm service (record/release/markProcessing/confirm/fail/reverse + maker/checker + CAS + idempotency + over-disbursement + audit + notify); NO bank integration, NO batch/voucher/GL mutation, NO reconciliation job (F6.9), NO admin UI.
```

---

## F6.9 — Add settlement reconciliation job/dashboard

```text
Work package: F6.9
Status: COMPLETE
Commit: feat 5f16c6c + docs (this commit)
Proof-before-build classification: MISSING/PARTIAL (F0.5 §6: the shipped data-integrity-check ties claim→GL only; there is NO independent batch/voucher/disbursement reconciliation, and no disbursement leg existed until F6.7/F6.8). Read the F6.9 steps + tests, the existing checkSettlementReconciliation, the F4.10 sweeper (idempotent job pattern), the admin billing/reconciliation page (requireRole(FINANCE)), and the reuse points (F6.7 isSuccessfulDisbursement, the I5/I6 legs). No CONFLICTING path.
Files changed: prisma/schema.prisma (ADDITIVE: SettlementReconciliationRun + SettlementReconciliationException + ReconciliationExceptionType + ReconciliationInvestigationStatus), src/server/services/settlement-reconciliation/classify.ts (new, pure), src/server/services/settlement-reconciliation/service.ts (new), src/app/(admin)/settlement/reconciliation/page.tsx (new, operator dashboard), scripts/pnos-reconcile-settlements.ts (new, job runner), tests/factories/provider-network.ts (teardown for the 2 tables), tests/services/settlement-reconciliation-classify.test.ts + settlement-reconciliation.service.test.ts (new).
Schema/data changes: ADDITIVE ONLY — two new tables + two enums to STORE runs/watermarks/results + investigation status (spec step 2/5). No existing model changed. Pushed to the throwaway PG (validate, not format; then db push + explicit generate WITH DIRECT_URL). Prod applies additively on the next build. No backfill.
Behavior delivered: a scheduled/operator control that INDEPENDENTLY verifies the I5 chain per settled batch and records mismatches without ever fixing money. (1) classifyBatchReconciliation (pure) recomputes the chain from raw aggregates (NOT the read model, so it can catch drift the read model would inherit): Σ line payable = Σ claim payable = stored batch total = voucher amount, plus the disbursement leg (Σ SUCCEEDED disbursement) and the I6 base axis; it classifies the EXACT mismatch type (LINE_HEADER_MISMATCH, CLAIM_BATCH_MISMATCH, VOUCHER_MISMATCH, MISSING_VOUCHER, OVER_DISBURSED, BASE_GL_MISMATCH). Under-disbursement is informational (a settled batch may not be fully paid yet — the remaining balance is shown per I5's partial-disbursement provision); only OVER-disbursement is a leak/exception. (2) reconcileBatch loads the raw DB aggregates and classifies (read-only). (3) runReconciliation sweeps SETTLED batches (optionally only those settled after a prior watermark, for incremental repeat runs), reconciles each, and STORES a run + its exceptions + the new watermark + counts; idempotent within a run. (4) updateInvestigation (finance) moves an exception through OPEN→INVESTIGATING→RESOLVED/ACCEPTED with a note + resolver — investigation metadata only, never a financial fact. (5) A read-only operator dashboard ((admin)/settlement/reconciliation, requireRole(FINANCE), accessible responsive table) shows the latest run + open exceptions. (6) A job script (scripts/pnos-reconcile-settlements.ts) runs it from cron/operator and exits 2 when exceptions are found.
Authorization evidence: the dashboard is requireRole(FINANCE); updateInvestigation asserts a finance role (a PROVIDER_USER is refused, tested). reconcileBatch/runReconciliation are tenant-scoped operator jobs. No provider is exposed to another (operator-only, single tenant).
Idempotency/concurrency evidence: a run classifies each batch once; a repeat FULL run over unchanged data produces the same exception count (tested). The watermark supports incremental repeat runs (settledAt > watermark).
Privacy/security evidence: exception detail carries only safe references + amounts (batch id prefix, decimal expected/actual); no internal GL account, no provider PII. The dashboard is operator-only.
Money/reconciliation evidence: this IS the money-conservation control (I5/I6) — decimal arithmetic, exact 2dp comparison. Critically it NEVER mutates a financial fact (spec step 6): the only writes are its own run/exception rows + the human investigation status. A test loads the batch + voucher before and after reconcileBatch + runReconciliation and asserts they are byte-for-byte unchanged. The disbursement leg reuses F6.7 isSuccessfulDisbursement semantics (only SUCCEEDED counts).
Focused tests and results: 9 pure (one fixture per mismatch type — LINE_HEADER/CLAIM_BATCH/VOUCHER/MISSING_VOUCHER/OVER_DISBURSED/BASE_GL — plus a clean fully-disbursed run, under-disbursement-is-informational, and multi-currency) + 7 opt-in DB (reconcile a fully-disbursed batch = clean; OVER_DISBURSED via a direct-insert disbursement that bypasses the F6.8 guard; MISSING_VOUCHER; CLAIM_BATCH_MISMATCH via an overridden batch total; runReconciliation stores a COMPLETED run + the exact exception rows and repeats deterministically; investigation status is finance-updatable and provider-refused; never mutates the batch/voucher). Full no-DB suite 1431 pass / 331 skip (+9 pure, +7 DB-skipped); DB suite 7/7 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green.
Typecheck/schema result: tsc --noEmit clean; prisma validate passes; additive schema only.
Manual/visual evidence: the dashboard is an operator page; visual verification deferred (the worktree has no .env/seeded admin session — the F3.x convention). The classifier + service (the substance) are unit-tested on a real Postgres; the dashboard renders the tested read model with an accessible table (caption, th scope, overflow-x-auto).
Feature-flag state: none. Operator-only control; no provider-facing surface.
Backfill/rollout impact: additive schema + a read-only control; prod applies on the next build's prisma db push. The job is ops-invocable now; a cron registration is an ops step.
Known limitations / deferrals (flagged): (a) the investigation-update UI (a server action calling updateInvestigation) is deferred — the service method is the tested substance (F5.14 convention); the dashboard shows the status read-only. When the action lands it adds the PR-020 audit-coverage token. (b) The cron/worker schedule that calls runReconciliation is an ops registration; the script is provided. (c) Under-disbursement is intentionally NOT an exception (a settled batch may legitimately await disbursement); a future SLA-aware "stale under-disbursed" check could add an advisory. (d) The exception dedupe across runs is by-run (each run stores its findings); the dashboard shows the latest — a future enhancement could carry an investigation status forward across runs by (batch, type).
Unrelated worktree changes preserved: yes — worktree contained only F6.9 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; the schema change is a single additive hunk at EOF (prisma format NOT run).
Next allowed package: F6.10 — Add payment-query schema/service (M; depends F6.2). The ProviderPaymentQuery model (§7.9) + its service: a provider raises a query about a settlement/claim/line/disbursement (category, prefilled immutable facts, SLA, messages/documents, status lifecycle), finance responds WITHOUT changing a claim decision, and a decision dispute requires an explicit reconsideration link/conversion. Stop: no query→reconsideration conversion (F6.12).
Stop condition observed: yes — reconciliation classifier + service + stored runs/exceptions + dashboard + job + tests; NEVER auto-repairs money; NO payment-query model (F6.10).
```

---

## F6.10 — Add payment-query schema/service

```text
Work package: F6.10
Status: COMPLETE
Commit: feat 8a8702b + docs (this commit)
Proof-before-build classification: MISSING (no ProviderPaymentQuery model/service, §4.2 gap). Confirmed provider.payment_query.manage exists in prisma/seeds/provider-rbac.ts and DocumentTargetType already has PAYMENT_QUERY (so documents reuse the generic DocumentUploadIntent — no doc schema change); the reconsideration services (F5.11 submit / F5.14 review) are the template. No CONFLICTING path.
Files changed: prisma/schema.prisma (ADDITIVE: ProviderPaymentQuery + ProviderPaymentQueryMessage + PaymentQueryStatus + PaymentQueryCategory), src/server/services/provider-payment-query/policy.ts (new, pure), src/server/services/provider-payment-query/service.ts (new), tests/factories/provider-network.ts (teardown), tests/services/provider-payment-query-policy.test.ts + provider-payment-query.service.test.ts (new).
Schema/data changes: ADDITIVE ONLY — the query + its message satellite + two enums. No existing model changed. Pushed to the throwaway PG (validate, not format; then db push + explicit generate WITH DIRECT_URL). Prod applies additively on the next build. No backfill.
Behavior delivered: a provider idempotently opens and collaborates on a payment discrepancy WITHOUT any claim decision being touched (D17). (1) raise (provider, provider.payment_query.manage): scopes the settlement batch and any claim/disbursement target to the caller's provider (non-enumerating — an out-of-scope batch is NOT_FOUND, a claim not in the batch is INVALID), validates the category (enum), narrative, and non-negative discrepancy, is idempotent on idempotencyKey (pre-check + P2002-race fallback), and creates an OPEN query + a first RAISED (SHARED) message. (2) respondToInformation (INFORMATION_REQUIRED→PROVIDER_RESPONDED) and withdraw (→WITHDRAWN, pre-resolution) are provider actions scoped by ownership + version. (3) acknowledge / requestInformation / resolve / reject are finance actions (FINANCE roles) — resolve/reject record a SAFE explanation (+ an internal note kept off the provider projection); NONE of them writes a Claim/decision/settlement. (4) Every transition is a status- AND version-guarded CAS with a message append (SHARED for the provider timeline), a hash-chain audit, and a provider outbox notification; runTransition asserts canTransition for every from-state (defence in depth against method↔table drift). (5) getForProvider/listForProvider return the provider-safe projection (allow-list) + the SHARED-only timeline. Documents reuse the generic DocumentUploadIntent targetType PAYMENT_QUERY (the F6.11 UI wires the upload flow).
Authorization evidence: provider actions require provider.payment_query.manage + provider ownership (a cross-provider raise is NOT_FOUND, non-enumerating — tested); finance actions require a finance role (a PROVIDER_USER is refused FORBIDDEN — tested). Every query is tenant + provider scoped.
Idempotency/concurrency evidence: raise is idempotent on idempotencyKey (replay returns the same query — tested); every transition is version-guarded (a stale expectedVersion is STALE — tested) with a status-guarded CAS.
Privacy/security evidence: the provider projection is an allow-list (assignedReviewerId, assignedTeam, resolutionInternalNote are never carried — tested); the provider timeline surfaces only SHARED messages (INTERNAL dropped — tested); the resolution explanation is the safe text, the internal note is separate.
Money/reconciliation evidence: D17 — the service writes ONLY the ProviderPaymentQuery + its messages; it never touches a claim, decision, or settlement. A test runs the full lifecycle (raise→acknowledge→requestInfo→respond→resolve) and asserts the referenced claim is byte-for-byte unchanged (status/approvedAmount/paidAmount/updatedAt). A decision dispute is NOT resolved here — it becomes an explicit reconsideration through the F6.12 handoff (linkedReconsiderationId is left null).
Focused tests and results: 5 pure (transition graph incl. no-resolve-from-OPEN + no-resurrect-terminal, terminal/withdrawable sets, provider-safe projection drops internal fields + keeps the safe explanation, timeline is SHARED-only) + 5 opt-in DB (raise prefills the targets + a SHARED RAISED message + no internal note in the projection; a claim not in the batch is INVALID and a cross-provider batch is NOT_FOUND; idempotent replay; the full finance/provider lifecycle with the exact SHARED timeline AND the claim byte-for-byte unchanged (D17); provider withdraw pre-resolution + stale-version STALE + finance-role FORBIDDEN). Full no-DB suite 1436 pass / 336 skip (+5 pure, +5 DB-skipped); DB suite 10/10 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green.
Typecheck/schema result: tsc --noEmit clean; prisma validate passes; additive schema only.
Manual/visual evidence: N/A — schema + service, no UI (F6.11). Proven on a real Postgres: the lifecycle, scope, idempotency, and the D17 no-claim-mutation invariant are asserted directly.
Feature-flag state: none. The provider-facing payment-query pages (F6.11) will sit behind providerRemittanceV2; the service is inert until a UI/action invokes it.
Backfill/rollout impact: additive schema; prod applies on the next build's prisma db push. No backfill.
Known limitations / deferrals (flagged): (a) NO UI — the provider raise/respond/withdraw + finance lifecycle pages are F6.11 (they add the server actions + the PR-020 audit-coverage tokens). (b) NO query→reconsideration conversion — that explicit handoff (setting linkedReconsiderationId + creating a reconsideration) is F6.12; the field exists here but is never set. (c) The document-attachment flow reuses the generic DocumentUploadIntent (targetType PAYMENT_QUERY); wiring it is part of F6.11. (d) A CATCH worth remembering: resolve/reject's from-set must be reachable in the TRANSITIONS table — INFORMATION_REQUIRED→RESOLVED was added so finance can resolve a query still awaiting provider info; runTransition's per-from-state assert is what surfaces such method↔table drift.
Unrelated worktree changes preserved: yes — worktree contained only F6.10 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; the schema change is a single additive hunk at EOF (prisma format NOT run).
Next allowed package: F6.11 — Build provider/finance payment-query pages (M; depends F6.10). Provider raise/list/detail (prefilled immutable facts, category, narrative, document upload, respond/withdraw) + finance queue/detail (acknowledge/request-info/resolve/reject) — all gated (providerRemittanceV2 for the provider side). Stop: no conversion.
Stop condition observed: yes — payment-query schema + policy + service + tests; NO UI (F6.11), NO query→reconsideration conversion (F6.12), NO claim mutation.
```

---

## F6.11 — Build provider/finance payment-query pages

```text
Work package: F6.11
Status: COMPLETE
Commit: feat a8942a3 + docs (this commit)
Proof-before-build classification: MISSING (no payment-query UI). Read the F5.13 provider server-action pattern (resolveUserContext → providerPermits gate → validate → service → error/refresh map → redirect), the admin requireRole(FINANCE) action pattern, the audit-coverage KNOWN_AUDITING_TOKENS mechanism, and the provider nav model. No CONFLICTING path.
Files changed: src/server/services/provider-payment-query/service.ts (added listForFinance/getForFinance + version on getForProvider), src/app/provider/payment-queries/{page.tsx, actions.ts, new/page.tsx, new/RaiseQueryForm.tsx, [id]/page.tsx, [id]/ProviderQueryActions.tsx} (new), src/app/(admin)/settlement/payment-queries/{page.tsx, actions.ts, [id]/page.tsx, [id]/FinanceQueryActions.tsx} (new), src/app/provider/settlements/[id]/page.tsx ("Query a payment" link), src/components/layouts/provider-nav-model.ts (nav item), tests/audit-coverage/catalogue.ts (7 service tokens), tests/components/provider-nav-model.test.ts (forbidden-list update), tests/services/provider-payment-query.service.test.ts (+1 finance-reads test).
Schema/data changes: NONE (UI over the F6.10 schema/service).
Behavior delivered: both permitted sides of the payment-query lifecycle. PROVIDER (gated behind providerRemittanceV2 + provider.payment_query.manage): a list (/provider/payment-queries), a detail ([id]) showing the immutable batch/claim facts, the SHARED-only collaboration timeline, the status/resolution, and the permitted actions, and a raise flow (new?batch=…) prefilled + re-scoped to the provider; the server actions raise/respond/withdraw adapt to ProviderPaymentQueryService with the F5.13 gate + error/refresh mapping; the F6.4 settlement detail gains a "Query a payment" link and the provider nav a "Payment queries" item. FINANCE (admin, requireRole(FINANCE)): a queue (/settlement/payment-queries) and a detail showing the FULL row (including INTERNAL messages + the internal resolution note), with acknowledge/requestInformation/resolve/reject actions that expose only the transitions legal from the current status. The service gained listForFinance/getForFinance (role-gated, full row) and getForProvider now returns the version concurrency token for the guarded actions.
Authorization evidence: provider pages/actions require providerRemittanceV2 + provider.payment_query.manage (an off flag ⇒ notFound / a permissionless caller ⇒ error); the provider detail/list are provider-scoped and non-enumerating (via the F6.10 service); finance pages/actions are requireRole(FINANCE) and listForFinance/getForFinance assert the finance role (a PROVIDER_USER is refused — tested). Every mutating transition is version-guarded server-side.
Idempotency/concurrency evidence: the raise form carries a client idempotencyKey (the service dedupes); each action passes expectedVersion and the service's CAS returns STALE on drift (the client refreshes).
Privacy/security evidence: the provider surface renders only the F6.10 provider-safe projection + the SHARED-only timeline (INTERNAL messages and the internal resolution note never reach the provider pages by construction — the service does the filtering); the finance surface is the only place the internal fields render, behind the FINANCE role.
Money/reconciliation evidence: D17 holds end-to-end — no page or action writes a claim/decision/settlement; the actions are thin adapters over the D17-safe service. A decision dispute is deferred to the explicit reconsideration handoff (F6.12).
Focused tests and results: +1 opt-in DB (listForFinance/getForFinance are role-gated and carry the full row incl. internal messages + version; a provider role is refused). Updated the F1.4 nav test (removed /provider/payment-queries from the forbidden set — it is now a finished route). The audit-coverage suite validates the 7 new ProviderPaymentQueryService.* tokens (the actions delegate to the service, which hash-chain audits PAYMENT_QUERY:* internally). Full no-DB suite 1436 pass / 337 skip; DB payment-query suite 6/6 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: the pages are provider/operator surfaces; visual verification deferred — the provider side is behind providerRemittanceV2 (OFF) and the worktree has no .env/seeded session (the F3.x–F5.x convention). The server actions + service are DB-tested; the pages/forms are tsc-clean and mirror the proven F5.13 forms (accessible labels, role=alert errors, disabled-while-pending, version-guarded).
Feature-flag state: none new. The provider payment-query pages/actions sit behind providerRemittanceV2 (OFF); the finance pages are requireRole(FINANCE) (no flag, an existing operator surface).
Backfill/rollout impact: none (UI over an additive service).
Known limitations / deferrals (flagged): (a) the document-attachment flow (uploading a bank slip via DocumentUploadIntent targetType PAYMENT_QUERY) is deferred — the reusable FileUpload component + the intent target exist; wiring it is a small follow-up. (b) The query→reconsideration conversion (linkedReconsiderationId) is F6.12 — not wired here (stop condition). (c) Visual/a11y UAT on a seeded session is deferred (F11.6 covers accessibility formally). (d) The finance actions revalidatePath the detail; the client also router.refresh — belt and braces for the operator view.
Unrelated worktree changes preserved: yes — worktree contained only F6.11 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F6.12 — Explicit payment-query to reconsideration handoff (S; depends F6.10, F5). When a payment query is really a decision dispute, an authorized actor explicitly converts/links it to a reconsideration (validating reconsideration eligibility first) — setting ProviderPaymentQuery.linkedReconsiderationId and creating/linking the F5.11 case; no status/amount changes silently (D17). This CLOSES phase F6. Stop: the conversion only; no new capitation/other work.
Stop condition observed: yes — provider + finance pages + actions + nav + audit tokens + tests; NO query→reconsideration conversion (F6.12), NO document-attach wiring, NO claim mutation, NO schema change.
```

---

## F6.12 — Explicit payment-query to reconsideration handoff

```text
Work package: F6.12 (CLOSES phase F6)
Status: COMPLETE
Commit: feat f8f09f7 + docs (this commit)
Proof-before-build classification: MISSING (no handoff). Confirmed ClaimReconsiderationService.checkEligibility(ctx, claimId, {reasonCode}) + submit(ctx, SubmitReconsiderationCommand) signatures and that importing that service into ProviderPaymentQueryService introduces no cycle. No CONFLICTING path.
Files changed: src/server/services/provider-payment-query/service.ts (convertToReconsideration + INELIGIBLE code + ClaimReconsiderationService import), tests/audit-coverage/catalogue.ts (convert token), tests/services/provider-payment-query-convert.service.test.ts (new).
Schema/data changes: NONE (reuses the F6.10 ProviderPaymentQuery.linkedReconsiderationId field + the F5.11 reconsideration models).
Behavior delivered: the explicit handoff (D17). ProviderPaymentQueryService.convertToReconsideration(ctx, paymentQueryId, {reasonCode, providerNarrative, requestedAmount, lines, idempotencyKey}, expectedVersion): (1) requires provider.claim.reconsider AND an explicit reasonCode — a query is NEVER auto-converted on its category/text alone (the stop condition); (2) the query must reference a claim (else INVALID), be non-terminal, and not already be linked (an already-linked query returns its existing reconsideration idempotently); (3) runs ClaimReconsiderationService.checkEligibility FIRST — an ineligible or expired dispute is refused INELIGIBLE with the safe reason; (4) creates the governed F5.12 reconsideration via ClaimReconsiderationService.submit (idempotent on the supplied key; D13 — the claim is NOT touched); (5) links the query in a version+status-guarded CAS — the query's ONLY change: status → RESOLVED, linkedReconsiderationId = the case, resolutionCode CONVERTED_TO_RECONSIDERATION, plus a CONVERTED_TO_RECONSIDERATION SHARED event; then a PAYMENT_QUERY:CONVERT audit. A concurrent double-convert resolves to a single case (the CAS's linkedReconsiderationId-null guard).
Authorization evidence: requires provider.claim.reconsider (the reconsideration permission, not just payment_query.manage) + the query is provider-scoped and non-enumerating (a provider-B convert of a provider-A query is NOT_FOUND — tested). Eligibility (status/deadline/branch/reason) is delegated to the canonical checkEligibility.
Idempotency/concurrency evidence: the reconsideration submit is idempotent on the supplied idempotencyKey; a duplicate handoff returns the same reconsiderationId with no second case (tested — count stays 1); the query-link CAS guards on linkedReconsiderationId IS NULL + version + non-terminal status, so a race links exactly once.
Privacy/security evidence: the query's linked event is a SHARED message; the safe resolution explanation is provider-facing; no internal fields are exposed by the conversion.
Money/reconciliation evidence: D13/D17 — the claim is NOT touched (the reconsideration is a governed additive case, not a claim mutation); a test loads the claim (status/approvedAmount/paidAmount/updatedAt) before and after the conversion and asserts it is byte-for-byte unchanged. The payment query changes only its linked status/event (spec step 4). No amount/status changes silently — the conversion is an explicit, permission-gated, eligibility-checked act.
Focused tests and results: 5 opt-in DB (converts + creates the case + links the query + claim byte-for-byte unchanged; an ineligible reason (INCORRECT_DECLINE on a PAID claim) ⇒ INELIGIBLE; a query with no claim ⇒ INVALID; a duplicate handoff returns the same reconsideration with no second case; a cross-provider convert ⇒ NOT_FOUND). Full no-DB suite 1436 pass / 342 skip (+5 DB-skipped); DB suite 5/5 on the throwaway PG; tsc --noEmit clean; brand + currency + audit-coverage + mutation-guard green.
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service method. Proven on a real Postgres: the eligibility gate, the governed-case creation, the idempotent link, and the D13/D17 no-claim-mutation invariant are asserted directly.
Feature-flag state: none. The conversion is a service method; a UI entry (a button on the F6.11 provider payment-query detail that opens the F5.13 reconsideration form and calls this on submit) is a thin follow-up.
Backfill/rollout impact: none (reuses existing fields/models).
Known limitations / deferrals (flagged): (a) the convert UI FORM is deferred — the reconsideration form (F5.13) already collects the reason/amount/lines this method needs; the escalation UX reuses it and calls convertToReconsideration on submit (a thin action, which will register with the already-added audit token). (b) The finance-initiated LINK-to-an-existing-reconsideration variant is not built — the provider CREATE-and-link path is the primary handoff; a finance link-to-existing is a small additive method if the business needs it. (c) The audit-coverage token for convert is pre-registered so the follow-up action needs no change there.
Unrelated worktree changes preserved: yes — worktree contained only F6.12 changes; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
★ PHASE F6 COMPLETE — all 12 packages (F6.1 spec → F6.12 handoff): the frozen remittance dictionary (F6.1), the canonical ProviderRemittanceService read model (F6.2), admin (F6.3) + provider (F6.4) detail, CSV (F6.5) + PDF (F6.6) exports, the ProviderDisbursement schema/state machine (F6.7) + record/confirm service (F6.8), the I5/I6 reconciliation control (F6.9), and the payment-query schema/service (F6.10) + pages (F6.11) + reconsideration handoff (F6.12). Gate E is CODE-MET (views match + conservation proven end-to-end); provider-facing activation remains gated on the F6.1 §12 finance sign-off + providerRemittanceV2 (default OFF).
Next allowed package: F7.1 — Define provider-visible contract field policy (S; GATED network/legal/security review). Begins phase F7 (contract visibility, provider master data, network self-service). A documentation/policy package (like F6.1) — build the field-visibility policy and surface it for the network/legal/security sign-off; do not activate.
Stop condition observed: yes — the explicit eligibility-gated handoff + tests; NO auto-conversion on text/category alone; NO claim mutation; NO new capitation/F7 work.
```

---

## F7.1 — Define provider-visible contract field policy

```text
Work package: F7.1 (BEGINS phase F7 — contract visibility, provider master data, network self-service)
Status: SPEC COMPLETE — GATED(network operations / legal / security review) for downstream activation
Commit: this documentation-only commit (no feat commit — F7.1 delivers a policy, not code)
Proof-before-build classification: PARTIAL — the contract/rate fields exist; the provider-visibility classification, download policy, and gap register are specified here for the first time. Inventoried by two direct schema reads + one read-only evidence agent (cross-checked). No CONFLICTING path.
Files changed: docs/provider-network-os/CONTRACT_VISIBILITY_FIELD_POLICY.md (new — the F7.1 deliverable); docs/provider-network-os/PROGRESS.md (F7.1 row → SPEC COMPLETE · GATED); docs/provider-network-os/IMPLEMENTATION_LOG.md (this note).
Schema/data changes: NONE. No prisma change, no migration, no db push. Stop condition is "no code".
Behavior delivered: a network/legal/security-approval-gated field-by-field policy that classifies EVERY provider contract/rate/applicability/branch/PA-doc/window/payment/capitation field as VISIBLE / CONDITIONAL / INTERNAL (each row cites model.field @ schema.prisma:line on this branch). Contents: (1) the visibility rule (D2/§8.10 — provider sees only the effective, in-force, own-provider portion, resolved through the canonical ContractLifecycleService.precheck, projected via a per-field allow-list); (2) scope + effective-dating (own-provider only + non-enumerating; current/future/expired from ContractVersion windows; only ACTIVE/EXPIRED/TERMINATED/SUPERSEDED visible — negotiation states DRAFT/UNDER_REVIEW/PENDING_CLARIFICATION/VOIDED hidden); (3) the field dictionary across ProviderContract (header/commercial terms/windows/policies), ContractVersion, ContractApplicability (derived served-scope), ProviderBranch/ContractBranch, ProviderTariff + ProviderDiagnosisTariff + PricingRule (rate/method/limits/restrictions/requirements), PreauthRule, DocumentationRule, ProviderContractExclusion, and the capitation representation (PricingRule ruleKind=CAPITATION + params.carveOutCodes + BenefitConfig.fundingModel — no dedicated model, full ledger F10-deferred); (4) the absolute never-expose list — extraction confidence (ProviderTariff.sourceRef{page,rawText,confidence} + the entire ContractExtraction model), internal notes, credit limit, ownership/approval actor fields, contract-version snapshot/validationReport, the scanned-agreement documentUrl, other providers/clients, signatories PII; (5) conflicting/missing-config display (rateMissing → "rate under confirmation"; CON-010 ambiguity → "coverage under review"; no-tariff → "not on your rate schedule"); (6) the download policy — the F6.5 CSV machinery (versioned columns + formula-injection guard + BOM + sha256) + a mandatory watermark, audited, no internal data; (7) a 4-entry data-gap register (D-CAP capitation ledger → F10; D-RECON-WINDOW reconsideration window is computed by the F5.11 policy not stored on the contract; D-CURRENCY tariff line currency wins over the contract default; D-STATUS negotiation states hidden); (8) worked examples for an FFS RATE_SCHEDULE contract and a capitated contract; (9) the F7.2 handoff; (10) a §10 sign-off block (Q1-Q5) left PENDING.
Authorization evidence: N/A — documentation. It DEFINES the provider-visibility boundary (the VISIBLE/CONDITIONAL/INTERNAL classification + the never-expose list) that F7.2's per-field allow-list projection and its "field leakage snapshot" test will enforce; it grants no access and touches no auth code.
Idempotency/concurrency evidence: N/A — no writes.
Privacy/security evidence: the policy IS the privacy contract for contract data — the never-expose list is spelled out (extraction confidence, negotiation deliberation, ownership, other parties, PII, the scanned agreement link); the CONDITIONAL commercial-term fields (discounts, external ref) are flagged for legal sign-off; this document contains no real contract/provider data (illustrative examples only).
Money/reconciliation evidence: N/A — no money touched. It documents that rate facts are read from the effective ProviderTariff/PricingRule (never a live recompute for the provider view) and that capitation coverage is projected without the internal pool/ledger.
Focused tests and results: none (policy, no code). The two worked examples are the F7.2/F7.3 acceptance fixtures. brand + currency guards run at the commit boundary.
Typecheck/schema result: no code/schema ⇒ tsc/prisma unaffected; brand:guard + currency:guard green.
Manual/visual evidence: N/A — no UI.
Feature-flag state: none introduced. Documents that no provider-facing contract read (F7.2) activates until the §10 network/legal/security sign-off — §11.6 stage 1 "internal evidence only".
Backfill/rollout impact: none. Downstream (F7.2 read service, F7.3 pages/export) build against this policy.
Known limitations / deferrals (flagged): (a) the whole provider contract-view surface remains sign-off-gated — F7.1 delivers the artifact TO be signed (§10 Q1-Q5 PENDING). (b) Capitation is coverage-only (D-CAP) pending the F10 capitation ledger. (c) The reconsideration window (D-RECON-WINDOW) is not a stored contract field; F7.2 derives + labels it. (d) The CONDITIONAL commercial-term fields need an explicit legal call (some payers treat negotiated discounts as confidential).
Unrelated worktree changes preserved: yes — worktree contained only the F7.1 docs; the main-checkout dirty UAT files are untouched; prisma/schema.prisma unchanged; no src change.
Next allowed package: F7.2 — Build provider contract/rate read service (M; depends F7.1 + F1.3). ProviderContractViewService returning provider-safe effective contract/applicability/rates via ContractLifecycleService.precheck, with service-date + code/name search, pagination, a per-field allow-list projection (only §3 VISIBLE + approved CONDITIONAL), current/future/expired labels, and no internal-field leakage. Per §11.6 stage 1 the SERVICE + tests may be BUILT as internal evidence WITHOUT the sign-off — but no provider PAGE (F7.3) activates until §10 is signed. Stop: no page/export.
Stop condition observed: yes — field classification + scope/effective-date + download policy + gap register + worked examples + sign-off block delivered; NO code, NO schema, NO data. §10 sign-off left PENDING by design.
```

---

## F7.2 — Provider contract/rate read service

```text
Work package: F7.2 (phase F7 — contract visibility)
Status: SERVICE COMPLETE — GATED(no provider PAGE until F7.1 §10 network/legal/security sign-off; per §11.6 stage 1 the service + tests are internal evidence and MAY be built now)
Commit: this feat commit (service + tests + factory helper) + the paired docs commit (this note + PROGRESS row)
Proof-before-build classification: BUILD-NEW behind a proven boundary — the contract/rate/rule schema, the F1.3 access context, and the F7.1 field policy all exist; F7.2 is the first provider-safe READ over them. EVERY field/relation/enum was grounded against prisma/schema.prisma BEFORE writing (no invented names): ProviderContract header + relations (versions/applicability/contractBranches/preauthRules/documentationRules/exclusions/pricingRules @3678-3689), ContractVersion (3704), ContractApplicability (3738), ContractBranch/ProviderBranch (3766/3190-ish), ProviderTariff (3327), PreauthRule (4061), DocumentationRule (4120), ProviderContractExclusion, PricingRule (3954); and the enums ProviderContractStatus/ContractVersionStatus/PricingRuleKind + the fixture enums (SubmissionWindowBasis/BalanceBillingPolicy/TaxInclusivity/ReconciliationCadence/UnlistedServiceRule/PreauthTriggerType/PreauthConsequence/ExclusionLevel/CodingSystem/PaymentTermType). No CONFLICTING prior path — no provider contract read existed.
Files changed: src/server/services/provider-contract-view/projection.ts (new — pure allow-list projection); src/server/services/provider-contract-view/service.ts (new — ProviderContractViewService); tests/services/provider-contract-view-projection.test.ts (new — 22 pure); tests/services/provider-contract-view.service.test.ts (new — 19 opt-in DB); tests/factories/provider-network.ts (added seedContractDetail helper + a provider-scoped ProviderTariff teardown — tariffs do NOT cascade on contract delete: optional contract FK → SetNull, required provider FK would then block provider deletion); docs PROGRESS.md (F7.2 row) + this note.
Schema/data changes: NONE. No prisma change, no migration, no db push — F7.2 reads existing models only.
Behavior delivered: ProviderContractViewService.{list, getById, getRates}. list = the provider's own in-force + historical contract headers (safe fields + CURRENT/FUTURE/EXPIRED label). getById = one contract (provider-scoped, non-enumerating) → header + versions + derived served-scope (active INCLUDE only) + covered branches + PA rules + doc rules + exclusions + a capitation summary. getRates = the effective rate lines at a service date, engine-parity window (effectiveFrom ≤ endOfDay ∧ (effectiveTo null ∨ ≥ startOfDay)), code/name search (CPT or provider code; service or standard description; case-insensitive), deterministic pagination. projection.ts is a PURE per-field allow-list implementing the F7.1 policy: a field reaches the caller ONLY if named, so a newly-added internal schema field is hidden by default. rateMissing → { rate:null, rateUnderConfirmation:true } (never the extraction detail).
Authorization evidence: every method calls F1.3 ProviderAccessService.requirePermission(ctx, "provider.contract.read") (seeded provider-rbac.ts) first, then constrains EVERY query with tenantId + providerId + status ∈ {ACTIVE,EXPIRED,TERMINATED,SUPERSEDED}. A contract that is another provider's, another tenant's, or in a hidden negotiation/future-APPROVED state is indistinguishable from absent (list omits it; getById/getRates return null) — non-enumerating (§9.1). Scope is server-derived from ctx; no request field can widen it. The service never writes (owns no contract state).
Idempotency/concurrency evidence: N/A — read-only, no writes, no transactions.
Privacy/security evidence: the allow-list is the enforcement of the F7.1 never-expose list. Proven by two field-leakage layers: (1) 22 pure tests build rows that CARRY every internal field (creditLimit, notes, documentUrl, signatories, ownership/approver ids, ContractVersion snapshot/validationReport, tariff sourceRef{page,rawText,confidence}+notes+scoping ids, PricingRule params.poolId) and assert none — by key AND by full JSON.stringify substring — appears in the projection; (2) 19 DB tests seed a real contract with those same sensitive values and assert list/getById/getRates payloads never contain creditLimit/documentUrl/signatories/poolId/sourceRef/snapshot or the raw scan text. CONDITIONAL commercial terms (unlisted/early-settlement/invoice discounts, external ref) are isolated in a header.conditional{} bucket for the pending legal call — they are not blended into the always-safe fields.
Money/reconciliation evidence: N/A — no money moved. Rate facts are read from the effective ProviderTariff/PricingRule (a stored fact at the service date), never a live recompute for the provider; capitation is projected as coverage (ruleKind + rate + basis + carveOutCodes) with no pool/ledger internals (D-CAP → F10).
Focused tests and results: 22 pure (effective-label matrix; CONTRACT_VIEW_STATUSES excludes negotiation states; header/version/tariff/exclusion/capitation leakage snapshots; rateMissing transform; served-scope INCLUDE-only; malformed-params tolerance) + 19 opt-in DB (provider sees own in-force+historical but not future-APPROVED; cross-provider list isolation; getById full detail incl. served-scope INCLUDE-only + branches + PA/doc/exclusion/capitation; getById internal-leak sweep; future-APPROVED + cross-provider + unknown ⇒ null; missing-permission ⇒ FORBIDDEN_PERMISSION; getRates today=3 effective lines with no legacy/future line; rateMissing→under-confirmation; sourceRef/notes never leak; future service-date pulls the future line in; historical service-date pulls the expired line back; code search on CPT/provider-code; name search; stable non-overlapping pagination; cross-provider + missing-permission). All 41 green. tsc --noEmit clean project-wide (0 errors). Full no-DB suite 1458 pass / 361 skip. All factory-consuming DB suites together (remittance/disbursement/payment-query/reconciliation/contract-view/smoke) 56/56 — proving the shared-factory teardown change is FK-safe. brand + currency guards green. (Noted, NOT F7.2-caused: running the ENTIRE DB integration tree in one serial process surfaces 12 pre-existing failures in unrelated claims-autopilot/preauth-intake integration files — proven pre-existing: preauth-intake fails identically with the factory change git-stashed, and the 4 claims-intake/execute/breaker files have zero references to F7.2 code; the normal per-package workflow runs these individually.)
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service layer; no UI in F7.2 (page is F7.3, gated). The two F7.1 worked examples (FFS + capitated) are realised as the DB-test fixtures.
Feature-flag state: none introduced. F7.2 ships no provider-reachable surface — the service is stage-1 internal evidence. F7.3 will add the providerContractView flag + the page, and MUST NOT activate until the F7.1 §10 sign-off.
Backfill/rollout impact: none (reads existing rows; adds no column).
Known limitations / deferrals (flagged): (a) no provider page/export — F7.3 (gated). (b) Capitation is coverage-only (D-CAP → F10 ledger). (c) CONDITIONAL commercial-term fields are projected into a separate bucket but their provider exposure still needs the legal sign-off (F7.1 §10 Q-commercial). (d) The reconsideration window (D-RECON-WINDOW) is not surfaced here — it is an F5.11-policy derivation, to be labelled on the F7.3 page.
Unrelated worktree changes preserved: yes — worktree contained only F7.2 files; scratchpad/ (throwaway db.env) untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F7.3 — Contracts/rates provider pages + safe export (M). A /provider/contracts list + detail + rate table consuming ProviderContractViewService, plus a watermarked CSV via the F6.5 machinery, behind a NEW providerContractView flag (default OFF). Activation of the page/flag is GATED on the F7.1 §10 network/legal/security sign-off.
Stop condition observed: yes — service + projection + tests + factory support delivered as internal evidence; NO provider page, NO export, NO flag, NO schema, NO §10 activation.
```

---

## F7.3 — Build contracts/rates pages and safe export

```text
Work package: F7.3 (phase F7 — contract visibility)
Status: PAGES COMPLETE — GATED(flag `providerContractView` default OFF until the F7.1 §10 network/legal/security sign-off). Per §11.6 the surface is BUILT now but dark; flipping the flag is the human gate, not a code change.
Commit: this feat commit (flag + serializer + export method + pages + route + nav) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW over proven owners — reused verbatim: the F6.4 `providerRemittanceV2` flag shape (`provider-access-settings.service.ts`), the F6.4 gated-page pattern (resolveUserContext → flag notFound → service try/catch: FORBIDDEN→/unauthorized, absent→notFound), the F6.5 CSV machinery (`csvCell` OWASP guard + BOM + sha256 + versioned columns) + its audited export route, the F1.4 nav model + its test's `forbidden` list, and the F7.2 ProviderContractViewService (list/getById/getRates). Read the F7.3 plan section (main-checkout root) for the 6 steps + 4 tests + the "no active contract editing" stop. No CONFLICTING prior path.
Files changed: src/server/services/provider-access-settings.service.ts (added `providerContractView` + `contractViewProviderIds` + `isContractViewEnabled`, DEFAULT OFF); src/server/services/provider-contract-view/csv.ts (new — rate-schedule serialiser reusing csvCell); src/server/services/provider-contract-view/service.ts (added `exportRatesCsv`); src/app/provider/contracts/page.tsx (new — list); src/app/provider/contracts/[id]/page.tsx (new — detail + searchable rate table + discrepancy affordance); src/app/provider/contracts/[id]/export/route.ts (new — audited CSV endpoint); src/components/layouts/provider-nav-model.ts (+ optional `flags` arg + `flagKey`-gated Contracts item) + ProviderNav.tsx (contracts icon) + src/app/provider/layout.tsx (resolve the flag, pass it); tests (+ CSV pure, + nav flag-gating, + access-settings flag, + DB export) ; docs PROGRESS + this note.
Schema/data changes: NONE. The flag lives in the existing untyped `Tenant.config.providerAccess` JSON (no migration). Reads existing contract/rate rows only.
Behavior delivered (the 6 plan steps): (1) list + detail + rate routes; (2) CURRENT/FUTURE/EXPIRED labels on the contract, each version, and derived from the effective window; (3) rate currency + PA rules + document rules + submission-window/payment terms + balance-billing/tax/reconciliation shown; (4) a versioned, checksummed, watermarked provider-safe CSV export; (5) a discrepancy entry point (see deferral (b)); (6) the export egress is audited `CONTRACT:EXPORT` with row-count + checksum + service-date. Rate table supports code/name/service-date search via a plain GET form (no client JS) → getRates.
Authorization evidence: the pages + route gate on `isContractViewEnabled(tenantId, providerId)` (notFound/404 when OFF — the default), then delegate ALL data + authz to ProviderContractViewService (requirePermission `provider.contract.read` + provider scope + non-enumerating). A cross-provider / hidden-state / absent contract is an identical notFound/404/null. Nav visibility is convenience only (F1.4) and is ALSO flag-gated so a permitted user sees no dead "Contracts" link before sign-off. The export route maps FORBIDDEN→403, absent/cross-provider→404.
Idempotency/concurrency evidence: N/A — read-only (no writes; the audit row is an append, not a mutation of contract state).
Privacy/security evidence: the CSV serialises the SAME F7.2 allow-listed TariffView the page shows — no separate field set — so an internal field (sourceRef{page,rawText,confidence}, notes, poolId, creditLimit) cannot appear; proven by a pure test (columns == the dictionary; no internal token in the bytes) AND a DB test (a rate seeded WITH sourceRef+notes exports without the raw scan text / note). Spreadsheet formula-injection is neutralised (reused F6.5 csvCell). A watermark names the recipient provider so a leaked file is traceable; it carries NO wall-clock so the checksum stays deterministic (the export instant is in the audit + HTTP header). The CONDITIONAL commercial terms (discounts, external ref) render only inside the surface the §10 sign-off gates, in their own labelled block.
Money/reconciliation evidence: N/A — no money moved. Rates are read from the effective ProviderTariff (a stored fact at the service date), never recomputed for the provider; capitation shows coverage only (no pool/ledger).
Focused tests and results: +7 CSV pure (BOM + versioned header + row-per-rate; watermark/confidential; formula-injection neutralised; RFC-4180 comma quoting; rateMissing→"under confirmation"; no internal token; deterministic sha256) + nav flag-gating (hidden w/o flag even with the perm; shown w/ flag+perm; hidden w/ flag but no perm; legacy "full set" excludes flag-gated) + access-settings (parse default OFF/only-===true/allow-list; isContractViewEnabled global+per-provider; independent of the remittance flag) + 4 DB export (row-count+names parity with getRates at a service date; historical-date parity; watermark provider-name + no sourceRef/notes leak; cross-provider null + FORBIDDEN). All green: 34 pure + 23 DB (F7.2+F7.3) on the throwaway PG. tsc --noEmit clean project-wide; brand + currency + audit-coverage green; full no-DB suite 1471 pass / 365 skip. (Updated one stale full-shape settings literal in provider-eligibility.service.test.ts to include the two new fields — same maintenance F6.4 did.)
Typecheck/schema result: tsc clean; no schema change.
Manual/visual evidence: N/A — the worktree has no .env / seeded provider session (the F3.7+ convention); the pages are server-authorized + unit-tested at the service/serialiser/nav layer. Browser verification lands when the flag is signed on against a seeded env.
Feature-flag state: NEW `providerContractView` (§11.1), DEFAULT OFF. The entire surface (list, detail, export, nav item) is dark until a tenant-global or per-provider flip — the F7.1 §10 sign-off. No activation performed.
Backfill/rollout impact: none (additive JSON flag; reads existing rows).
Known limitations / deferrals (flagged): (a) the whole surface stays sign-off-gated (F7.1 §10 PENDING). (b) The step-5 "change-request entry point" ships as an HONEST static affordance (contact your network manager) — NOT a dead link — because the payment-query raise flow hard-requires a settlement batch and the dedicated rate change-request / TPA queue is F7.6; it will be wired to that flow then. (c) No browser/visual verification in-worktree (env). (d) Rate table caps the rendered page (500) with a "refine/export" note; the export itself omits nothing (pages to exhaustion).
Unrelated worktree changes preserved: yes — worktree contained only F7.3 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F7.4 — Add provider master-data change-request schema/service (M; §7.10 `ProviderMasterDataChangeRequest`, D22). An ADDITIVE satellite model + a maker/checker change-request service for provider profile/master-data edits (the F7.5 sensitive bank-change verification builds on it). Additive schema via `prisma db push` to the throwaway PG.
Stop condition observed: yes — pages + export + flag + nav delivered; NO active contract editing, NO schema change, NO §10 activation, NO F7.4 master-data work.
```

---

## F7.4 — Add provider master-data change-request schema/service

```text
Work package: F7.4 (phase F7 — provider master data)
Status: SCHEMA + SERVICE COMPLETE (no pages, no bank activation — those are F7.6 / F7.5). A provider can now PROPOSE an allow-listed change through a maker/checker lifecycle; sensitive (bank) changes are reviewed but not activated.
Commit: this feat commit (schema + policy + service + factory teardown + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW on a proven pattern — the F6.10 ProviderPaymentQuery satellite + message (audience SHARED|INTERNAL) + version-CAS + idempotencyKey + auditChain + outbox is reused verbatim; read §7.10 for the model fields, the Provider model (contact fields direct; bank behind `bankDetailsRef` in the settlement module), ProviderBranch (name/code/address/county — NO phone), the UserRole enum (operator reviewer = SUPER_ADMIN; there is no network-manager role), and the seeded `provider.profile.change_request` perm. No CONFLICTING path — no master-data change flow existed.
Files changed: prisma/schema.prisma (+ ProviderMasterDataChangeRequest + ProviderMasterDataChangeEvent + enums MasterDataChangeCategory/Status/Risk — additive, pushed to the throwaway PG); src/server/services/provider-master-data-change/policy.ts (new — pure); src/server/services/provider-master-data-change/service.ts (new — ProviderMasterDataChangeService); tests/factories/provider-network.ts (teardown deletes the two new models by tenant); tests/services/provider-master-data-change-policy.test.ts (new — 10 pure); tests/services/provider-master-data-change.service.test.ts (new — 13 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE only — two new models + three enums, relation-less to Provider/Tenant (plain ids, like ProviderPaymentQuery); the event→request FK is the only relation. `prisma validate` clean, `prisma db push` + explicit `prisma generate` to the throwaway PG. Applies to prod on the next build's db push (additive, safe). No existing column changed.
Behavior delivered (the 6 plan steps): (1) the §7.10 schema + immutable events; (2) a per-category policy (allow-listed fields, sensitive-field set, evidence requirement, risk, SLA, auto-apply, owning-record scope); (3) a MASKED current snapshot + MASKED proposed values (the full sensitive value never persists); (4) idempotent submit with audit + SLA dueAt + (on reviewer transitions) provider outbox notifications; (5) reviewer requestInformation / reject + provider respondToInformation / withdraw; (6) on approval an auto-apply category is applied to the canonical owner through an injectable port (default = Provider/Branch updater), in the approval tx, exactly once. Sensitive (bank) approval is a two-person control (maker → PENDING_CHECKER, a distinct checker → APPROVED) and is deliberately NOT activated (F7.5).
Authorization evidence: provider side gates F1.3 requirePermission(provider.profile.change_request) + provider/branch scope (a branch from another provider ⇒ NOT_FOUND, non-enumerating). Reviewer side gates an operator role (SUPER_ADMIN) — a PROVIDER_USER reviewer is FORBIDDEN. The provider never mutates master data: only an approved SAFE change, applied by the service through the canonical applier, changes the Provider/Branch row (proven: the record is unchanged while the request is open, changes only after approve, and a second approve at the stale version cannot re-apply — version+status CAS).
Idempotency/concurrency evidence: submit is idempotent on (tenantId, idempotencyKey) — a replay returns the same row (replayed:true), and a P2002 race is caught outside the tx. Every transition is a version+status CAS in a serializable-safe updateMany; count===0 re-reads to distinguish STALE (version moved) from INVALID_STATE. The maker/checker two-step cannot be collapsed by one reviewer (checker ≠ maker enforced on userId).
Privacy/security evidence: sensitive fields (bank accountName/accountNumber) are masked to a trailing hint BEFORE storage — the full value never reaches this row, log, or audit (§7.10 / the F7.5 out-of-band-value rule). SHARED vs INTERNAL events are separated: the maker-approval event is INTERNAL; the provider read projects SHARED events only and never the decisionInternalNote or the maker/checker/verification ids (asserted — the internal note text does not appear in the provider payload). Evidence is required for credential/bank changes.
Money/reconciliation evidence: N/A — no money. Bank changes are the sensitive case and are explicitly NOT activated here; F7.5 adds the independent verification + activation before any payout destination changes.
Focused tests and results: 10 pure (allow-list rejects a disallowed field; sensitive masking; current-snapshot masking; maskSensitive; risk/auto-apply per category; transition table incl. no SUBMITTED→APPROVED jump; terminal dead-ends) + 13 DB (disallowed field, missing permission, BANK evidence + HIGH risk, masked-persist [full account absent], idempotent replay, branch cross-provider NOT_FOUND, approve-applies-once + original-unchanged-before + stale-second-approve, request-info→respond→approve, reject-leaves-unchanged, bank maker≠checker + not-activated [activatedAt/verifiedAt null, bankDetailsRef unchanged], INTERNAL/SHARED separation, cross-provider read null, reviewer role gate). All green. tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1481 pass / 378 skip; the 5 factory-consuming DB suites pass 65/65 together (the new teardown is FK-safe).
Typecheck/schema result: tsc clean; schema additive + pushed.
Manual/visual evidence: N/A — service layer, no UI (pages are F7.6, gated). The lifecycle is proven on real Postgres.
Feature-flag state: none. F7.4 ships no provider-reachable surface (no page/route); it is the schema + service the F7.6 pages + the F7.5 bank verification build on.
Backfill/rollout impact: none (additive models; no existing row touched).
Known limitations / deferrals (flagged): (a) no pages (F7.6) and no bank activation (F7.5) — the bank verification-fact columns + maker/checker exist but F7.4 leaves verifiedAt/activatedAt null for HIGH-risk changes. (b) The default applier activates only CONTACT + BRANCH (the clearly-safe categories); PRACTITIONER/CREDENTIAL/INTEGRATION approve to APPROVED but await a dedicated owning-service applier (activatedAt null) — a richer applier is injected when those owners land (INTEGRATION → F7.11). (c) Evidence documents are stored as relation-less ids and validated for PRESENCE only; per-document provider-ownership validation (reusing the F2 ProviderDocumentService) is a small additive follow-up.
Unrelated worktree changes preserved: yes — worktree contained only F7.4 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
Next allowed package: F7.5 — Implement sensitive bank-change verification (M). Builds on the F7.4 BANK category: maker ≠ checker (already enforced) + an out-of-band independent verification (the verificationMethod/Reference/verifiedById/verifiedAt fields) that must complete before the change is activated; the full account number NEVER appears in a log / UI / audit / email. Then F7.6 (profile/change pages + TPA queue) and F7.7 (network improvement plan).
Stop condition observed: yes — schema + policy + service + tests delivered; NO pages, NO bank activation, NO §10 contract work.
```

---

## F7.5 — Implement sensitive bank-change verification

```text
Work package: F7.5 (phase F7 — provider master data; sensitive controls)
Status: SERVICE COMPLETE (no bank API integration). A bank destination change now requires the F7.4 maker/checker PLUS an independent out-of-band verification and a payment-window-safe activation before it takes effect.
Commit: this feat commit (service extension + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW, ADDITIVE to F7.4 — the F7.4 BANK category (masked proposed, HIGH risk, maker≠checker, verification-fact columns) already exists; F7.5 adds the verify + activate steps on top WITHOUT changing the F7.4 submit/approve behaviour (so every F7.4 test stays green). Read §8.11 (masked destination, maker/checker, out-of-band verification, effective date, change freeze near payment, notify without full account) + confirmed the SettlementStatus (PENDING/MAKER_SUBMITTED/CHECKER_APPROVED/SETTLED/REJECTED) and DisbursementStatus (PENDING/RELEASED/PROCESSING/SUCCEEDED/FAILED/REVERSED) enums for the freeze signal. No CONFLICTING path.
Files changed: src/server/services/provider-master-data-change/service.ts (+ BANK_CHANGE_VERIFY_CAP / BANK_CHANGE_ACTIVATE_CAP, BankChangeActor, BankDestinationApplyPort + defaultBankDestinationApplier, PaymentWindowPort + defaultPaymentWindowCheck, verifyBankChange, activateBankChange, + UNVERIFIED/FROZEN error codes); tests/services/provider-bank-change.service.test.ts (new — 7 DB); docs PROGRESS + this note.
Schema/data changes: NONE — reuses the F7.4 verification-fact columns (verificationMethod/Reference/verifiedById/verifiedAt) + effectiveAt/activatedAt/activatedById. No new column, no push.
Behavior delivered (the 6 plan steps): (1) masked bank-data handling — the account was masked at F7.4 submit; F7.5 stores only a method + a safe out-of-band reference; (2) SEPARATE capabilities gate the verify and the activate steps (distinct from the F7.4 approval); (3) verifyBankChange records the out-of-band method/reference/time, never full data; (4) activateBankChange enforces a payment-window freeze/escalation (imminent batch or in-flight disbursement) and blocks an unverified change; (5) activation runs through an injectable canonical payment-destination owner (default points Provider.bankDetailsRef at the verified reference) — no bank API; (6) audit + a HIGH-priority provider notification, both free of account data.
Authorization evidence: verify requires BANK_CHANGE_VERIFY_CAP and an INDEPENDENT actor — not the maker (makerId), not the requester (providerRequesterId): a requester/maker cannot self-check (proven — both are FORBIDDEN even holding the cap). activate requires BANK_CHANGE_ACTIVATE_CAP (a distinct grant — a verify-only actor is FORBIDDEN). The whole chain is now four controls: maker approve, checker approve, independent verify, capable activate.
Idempotency/concurrency evidence: verify and activate are each a version+status CAS (verifiedAt:null / activatedAt:null guards) — a change verifies once and activates once. Concurrent activation of the same change ⇒ exactly one succeeds (Promise.allSettled → 1 fulfilled), the loser gets STALE/INVALID_STATE. Effective date is recorded on activation (a future effectiveAt round-trips).
Privacy/security evidence: the full account (submitted masked at F7.4) never reaches this layer; verification stores a method + reference (an out-of-band ticket, not an account); the audit payloads carry only the method / effectiveAt (no reference, no account); the provider notification says "updated and verified" with no number; the destination applier writes the verified reference, not an account. A DB assertion proves the full account string appears NOWHERE on the request or its events. Verify is an INTERNAL event (an operator control fact); activation is a SHARED event (the provider sees it).
Money/reconciliation evidence: the payment-window freeze is the money-safety control — a change cannot activate while a payment to the provider is imminent (MAKER_SUBMITTED/CHECKER_APPROVED batch) or in flight (PENDING/RELEASED/PROCESSING disbursement); it is escalated (an INTERNAL ACTIVATION_FROZEN event) and blocked (FROZEN). Proven with both an injected window and the DEFAULT check against a real MAKER_SUBMITTED batch.
Focused tests and results: 7 DB — verify independence (no-cap / maker / requester all FORBIDDEN, a distinct capable verifier succeeds + records method/verifiedById); unverified activate ⇒ UNVERIFIED; injected frozen window ⇒ FROZEN + not activated + INTERNAL ACTIVATION_FROZEN event; the DEFAULT window freezes on an imminent batch; verified + clear window activates via the owner (bankDetailsRef → the verified reference), sets the effective date, and the full account is absent everywhere; activate requires the activate cap; concurrent activation ⇒ exactly one. All green; the 13 F7.4 tests still pass unchanged (20/20 together). tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1481 pass / 385 skip.
Typecheck/schema result: tsc clean; no schema change.
Manual/visual evidence: N/A — service layer, no UI (the bank-change UI is F7.6). Proven on real Postgres.
Feature-flag state: none. F7.5 adds no provider-reachable surface — it hardens the F7.4 bank path. The two new capabilities are operator grants the F7.6 pages / ops config assign; the service trusts the passed capability set (like the F7.4 reviewer role), and identity separation is enforced server-side regardless.
Backfill/rollout impact: none (no schema/data change).
Known limitations / deferrals (flagged): (a) no bank API integration (stop) — activation updates the canonical reference, it does not call a bank; (b) no UI — the maker/checker/verify/activate operator surface + the provider view are F7.6; (c) the payment-window policy is a boolean freeze (imminent/in-flight) — a configurable freeze-window duration + an auto-escalation queue is a policy refinement; (d) the two capabilities are not seeded into an operator role yet (assigned via ops/F7.6), mirroring F7.4's reviewer-role trust.
Unrelated worktree changes preserved: yes — worktree contained only the F7.5 service edit + its test; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F7.6 — Build provider profile/change pages and TPA queue (M). Provider profile (read-only) + a "request a change" flow over the F7.4 service, and a TPA operator queue to review/approve/reject + the F7.5 verify/activate for bank — behind the appropriate gate. Then F7.7 (network improvement plan).
Stop condition observed: yes — verify + activate + freeze + effective-date + concurrency delivered; NO bank API, NO UI, NO schema change.
```

---

## F7.6 — Build provider profile/change pages and TPA queue

```text
Work package: F7.6 (phase F7 — provider master data; UI)
Status: PAGES COMPLETE. The provider profile + change-request flow and the TPA review queue (incl. the F7.5 bank verify/activate) are built over the F7.4/F7.5 service.
Commit: this feat commit (read + pages + actions + nav + audit-coverage token + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW on a proven UI pattern — the F6.11 provider payment-query pages + the operator queue are the exact precedent (provider action = resolveUserContext + real providerPermits gate → service → redirect; operator action = requireRole(ROLES) → actor → service → revalidatePath; the audit-coverage token mechanism). Confirmed session.user carries {id,tenantId,role,permissions} (auth.ts augmentation) so the operator bank actor can carry the F7.5 caps; ROLES.ADMIN_ONLY = [SUPER_ADMIN] is the reviewer gate. No CONFLICTING path.
Files changed: src/server/services/provider-master-data-change/service.ts (+ MASTER_DATA_READ_PERMISSION + getMaskedProfile); src/app/provider/profile/{page.tsx, actions.ts, new/{page.tsx,RequestChangeForm.tsx}, [id]/{page.tsx,ChangeRequestActions.tsx}} (new); src/app/(admin)/provider-changes/{page.tsx, actions.ts, [id]/{page.tsx,ReviewActions.tsx}} (new); src/components/layouts/provider-nav-model.ts + ProviderNav.tsx (Profile nav item + icon); tests/audit-coverage/catalogue.ts (+ ProviderMasterDataChangeService. token); tests (+ nav Profile, + provider action seam, + operator action seam, + ReviewActions component, + getMaskedProfile DB); docs PROGRESS + this note.
Schema/data changes: NONE — reads/writes the existing F7.4 models.
Behavior delivered (the 6 plan steps): (1) getMaskedProfile — a read-only masked projection of the provider's own contact/credential/bank/branches (bank reference masked, sensitive fields masked, no plaintext); (2) a category/permission-specific request form driven by the F7.4 policy allow-list; (3) the provider request list (profile tracker) + detail (current-vs-proposed diff + SHARED timeline + respond/withdraw); (4) the TPA queue + detail + the full review controls (start/request-info/approve/reject + bank verify/activate); (5) SHARED vs INTERNAL messages, evidence ids, SLA due date, and the reviewer/provider notifications the service already enqueues; (6) the current-vs-proposed diff on both the provider and operator detail pages, safely (masked values).
Authorization evidence: provider pages/actions gate on provider.profile.read (profile) / provider.profile.change_request (change) via real providerPermits + the service's own requirePermission; a cross-provider request is a non-enumerating not-found (service). Operator pages/actions gate requireRole(ADMIN_ONLY); the bank verify/activate actions build a BankChangeActor from session.user.permissions, so the F7.5 caps are enforced end-to-end. Server-computed availability: ReviewActions renders only the controls the current status/category allows, but the service is the authority — maker≠checker, the independent verify (verifier ≠ maker ≠ requester), and the payment-window freeze all still fire, so a hand-crafted call cannot bypass a control (direct-action enforcement, asserted at the service layer in F7.4/F7.5).
Idempotency/concurrency evidence: the request form mints a stable idempotencyKey (submit is idempotent); every action carries the version token and maps STALE/INVALID_STATE/NOT_FOUND to a friendly refresh.
Privacy/security evidence: getMaskedProfile masks the bank reference (proven: a seeded SECRET-REF-1234 surfaces as ••••1234 and the plaintext appears nowhere in the payload); the provider detail projects SHARED events only (never the INTERNAL note or maker/checker/verification ids); the request form + the verify form both warn against entering a full account number, and the sensitive fields are labelled. The operator detail shows the verification method/reference/time but the account plaintext never exists (masked at F7.4 submit).
Money/reconciliation evidence: N/A at the UI layer — the money-safety controls (payment-window freeze, maker/checker, independent verify) live in F7.4/F7.5 and are surfaced, not re-implemented.
Focused tests and results: nav (Profile shows with provider.profile.read, hidden for a migrated user without it; the forbidden-route test updated — /provider/profile is now built) + a provider action seam test (delegation + redirect + the migrated-no-perm refusal + a stale→refresh) + an operator action seam test (reviewer/bank actors built from the session, the bank actor carries the caps, reject needs a reason, stale→refresh) + a ReviewActions component test (availability per status incl. the checker-labelled approve + the accessible verify form + terminal shows nothing) + a getMaskedProfile DB test (masking + permission). All green: 35 no-DB (nav+actions+component) + 14 master-data DB (incl. getMaskedProfile). tsc --noEmit clean; brand + currency + audit-coverage green (the ProviderMasterDataChangeService. prefix token covers the six new actions); full no-DB suite 1500 pass / 386 skip.
Typecheck/schema result: tsc clean; no schema change.
Manual/visual evidence: N/A — the worktree has no .env / seeded provider or operator session (the F3.7+ convention); the pages are server-authorized + unit-tested at the read/action/component layer. Browser verification lands against a seeded env.
Feature-flag state: none — the whole flow is permission-gated (profile.read / profile.change_request / ADMIN_ONLY / the F7.5 caps), not flag-gated. There is no §10-style gate on master-data (unlike the F7.3 contract surface).
Backfill/rollout impact: none. Note (carried from F7.5): the two bank capabilities (provider.bank_change.verify/activate) still need granting to the appropriate operator role for the bank verify/activate UI to be usable — until then those controls correctly return FORBIDDEN.
Known limitations / deferrals (flagged): (a) no in-worktree browser verification (env); (b) evidence is referenced by document id (the F2 upload UI is separate) — a picker that lists the provider's uploaded documents is a follow-up; (c) the practitioner/credential/integration categories submit + review but their canonical appliers are deferred (F7.4 (b) / F7.11); (d) the bank caps are not seeded (F7.5 (d)).
Unrelated worktree changes preserved: yes — worktree contained only the F7.6 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged.
Next allowed package: F7.7 — Add provider network improvement plan (S). A structured improvement-plan / corrective-action record over the network relationship — NO automated sanctions (advisory only). This CLOSES phase F7.
Stop condition observed: yes — profile + change pages + TPA queue + bank verify/activate UI delivered; NO contract mutation self-service, NO schema change, NO new flag.
```

---

## F7.7 — Add provider network improvement plan

```text
Work package: F7.7 (phase F7 — network self-service) — CLOSES PHASE F7
Status: COMPLETE. An advisory, human-owned improvement plan between a named network manager and the provider — with zero automated sanctions.
Commit: this feat commit (schema + service + factory teardown + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW, additive — read the F7.7 plan (minimal plan/action/milestone/evidence/status model; named owners; objective+baseline ref+due dates; shared vs internal; audit/notify; forbid rate/tier/suspension mutation; stop: no scoring engine) + D21 (scorecards/improvement plans are advisory) + the §0 prohibition (no auto-suspend / rate / tier change from a scorecard). Confirmed there is no existing improvement-plan model (only a ProviderScorecard F8 stub) and that provider.performance.read is seeded. Reused the satellite + SHARED/INTERNAL update pattern.
Files changed: prisma/schema.prisma (+ ProviderImprovementPlan + ProviderImprovementAction + ProviderImprovementUpdate + enums ImprovementPlanStatus/ImprovementActionStatus/ImprovementOwnerRole — additive, pushed); src/server/services/provider-improvement-plan/service.ts (new); tests/factories/provider-network.ts (teardown deletes plans by tenant; actions/updates cascade); tests/services/provider-improvement-plan.service.test.ts (new — 6 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE only — three new models (updates + actions cascade on plan delete) + three enums, relation-less to Provider/Tenant. prisma validate clean; db push + generate to the throwaway PG. Applies to prod on the next build's db push.
Behavior delivered (the 6 plan steps): (1) a minimal plan/action/update model with evidence + status; (2) named network + provider owners; (3) create requires an objective, a baseline metric REFERENCE (free-text/id — F8 metrics stubbed, no scoring engine), and a target date; (4) SHARED updates vs INTERNAL notes are separate audiences; (5) audit (IMPROVEMENT_PLAN:CREATE/:STATUS) + a provider notification on open + on a shared update; (6) the service writes ONLY its own three models — it never mutates a rate/tier/contract/provider status.
Authorization evidence: network methods (create/addAction/updateActionStatus/postNetworkUpdate/setStatus/network reads) are role-gated to the network manager (SUPER_ADMIN) — a PROVIDER_USER role is FORBIDDEN. Provider methods (getForProvider/listForProvider/providerUpdateActionStatus/postProviderUpdate) require provider.performance.read + are provider-scoped (another provider's plan is a non-enumerating not-found). A provider can update ONLY a PROVIDER-owned action (a NETWORK-owned action is FORBIDDEN) and can post ONLY a SHARED update — there is no API surface for a provider to write an internal note.
Idempotency/concurrency evidence: setStatus is a version+status CAS against an advisory transition table (DRAFT→ACTIVE→ACHIEVED/CLOSED, any→CANCELLED) — a stale version is STALE, an illegal jump is INVALID_STATE.
Privacy/security evidence: provider-safe notes — the provider read includes SHARED updates ONLY; an INTERNAL note is invisible to the provider (asserted: the internal text appears nowhere in the provider payload), while the network read sees both. Provider updates are forced to SHARED.
Money/reconciliation evidence: N/A — no money. The load-bearing safety property is the ABSENCE of a side effect: a full lifecycle (create → add action → shared update → ACTIVE → CANCELLED) leaves the provider's tier + contractStatus and the contract's status byte-for-byte unchanged (asserted). No sanction, no rate/tier/suspension mutation, no scoring engine.
Focused tests and results: 6 DB — create role/objective/target gate; provider scope + cross-provider not-found + missing-permission; provider-safe notes (INTERNAL hidden, SHARED visible, provider posts SHARED only, network sees all 3); action ownership (provider updates own PROVIDER action, not a NETWORK one; network can); advisory status transitions + version CAS + illegal-jump blocked; NO automated side effect (provider tier/contractStatus + contract status unchanged across the lifecycle). All green. tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1500 pass / 392 skip; the factory-consuming DB suites pass 46/46 together (the new teardown is FK-safe).
Typecheck/schema result: tsc clean; schema additive + pushed.
Manual/visual evidence: N/A — service layer, no UI (F7.7 is model+service; a provider /performance page + a network plan console are F8 territory).
Feature-flag state: none — role/permission-gated. Advisory by construction.
Backfill/rollout impact: none (additive models).
Known limitations / deferrals (flagged): (a) no UI — the provider performance page + the network plan console land with F8 scorecards; (b) the baseline metric is a free-text/id reference until F8 defines the versioned metric catalog (by design — no scoring engine here); (c) a NETWORK_MANAGER operator role does not exist, so the network side is gated to SUPER_ADMIN (a dedicated role is an RBAC refinement).
Unrelated worktree changes preserved: yes — worktree contained only the F7.7 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
★ PHASE F7 COMPLETE — all 7 packages (F7.1 field policy → F7.2 contract read service → F7.3 contract pages + CSV → F7.4 master-data change schema/service → F7.5 sensitive bank-change verification → F7.6 profile/change pages + TPA queue → F7.7 advisory improvement plan). Provider contract visibility (F7.1-F7.3) remains GATED on the F7.1 §10 network/legal/security sign-off (flag providerContractView default OFF); the master-data change + bank-verification + improvement-plan surfaces are permission-gated and live once their permissions/caps are granted.
Next allowed package: F8.1 — Approve the versioned metric catalog (begins phase F8, provider performance scorecards). A metric-catalog approval (like F6.1/F7.1 — a governance artifact); build the versioned metric definitions + surface for sign-off; do not activate scoring.
Stop condition observed: yes — model + service + tests delivered; NO scoring engine, NO rate/tier/suspension side effect, NO UI.
```

---

## F8.1 — Approve the versioned metric catalog

```text
Work package: F8.1 (BEGINS phase F8 — provider performance scorecards)
Status: SPEC COMPLETE — GATED(product / claims / clinical / finance / network / analytics approval, §8.13). A documentation/governance package (like F6.1 and F7.1) — it defines the metrics; it activates no calculation.
Commit: this documentation-only commit (no feat commit — F8.1 delivers a catalog, not code).
Proof-before-build classification: PARTIAL — the fact sources all exist; the metric DEFINITIONS (numerator/denominator/inclusions/exclusions/event-time/late-arrival/freeze/min-sample/cohort/version/owner/drilldown) are specified here for the first time. Grounded by (a) reading the F8 plan + §8.13 (the 16-metric catalog + the 13-field template + the provider/TPA view rules + "cost is not a proxy for quality") + the D21 advisory decision + the §0 prohibition; (b) a read-only Explore fact-source inventory that returned every field with a schema line number + enum values (Claim/ClaimLine lineage+timestamps+status; ClaimProcessingRun/Stage + IntakeReceipt; AdjudicationReasonCode/Log + the autopilot route catalog; PreAuthorization + PreauthInfoRequest; ProviderSettlementBatch/PaymentVoucher/ProviderDisbursement; ClaimReconsideration; the duplicate fingerprints; and the ABSENCE of an HMS delivery model); (c) reading the existing legacy producer AnalyticsRefreshService.refreshProviderScorecards + the legacy cost ProviderScorecard @ 5652 and its 4 readers (analytics service/job/tRPC/admin page). No CONFLICTING path — no operational/quality metric catalog existed.
Files changed: docs/provider-network-os/PROVIDER_PERFORMANCE_METRIC_CATALOG.md (new — the F8.1 deliverable); docs/provider-network-os/PROGRESS.md (F8.1 row → SPEC COMPLETE · GATED); docs/provider-network-os/IMPLEMENTATION_LOG.md (this note).
Schema/data changes: NONE. No prisma change, no migration, no db push, no service. Stop condition is "no calculations".
Behavior delivered: the versioned catalog PNMC-1.0 — (§0) advisory/own-provider/cost-is-not-quality framing; (§1) the six load-bearing definitions each grounded in fields: clean-claim = the INITIAL canonical run (ClaimProcessingRun.sequence=1 + trigger=INITIAL + state=AUTO_DECIDED + modeResolved=LIVE, no routed stage, hasException=false); provider-controlled vs TPA-controlled time (with the clock pausing on the party not holding the item); initial (first decidedAt) vs final/overturned (reconsideration ACCEPTED/PARTIALLY_ACCEPTED); suspected (suspectedDuplicateFingerprint + routeCode DUPLICATE_REVIEW) vs confirmed (terminal DECLINED/VOID with a DUP-category reason) duplicate — KEPT SEPARATE because there is no DUPLICATE status; the four event timestamps (service/receipt/decision/payment) with the payment fact = ProviderDisbursement.confirmedAt (D16) and its documented fallbacks; late-arrival re-run + a 45-day freeze + min-sample 20 + cohort ≥5 providers; (§2) the metric catalog Families A–F (submission quality, response/SLA p50/p90, PA discipline, payment timeliness, correction/reconsideration, contract variance) via the §8.13 template; (§3) six worked edge cases (late re-run doesn't launder clean-claim; suspected≠confirmed; overturn doesn't rewrite turnaround; zero-denominator suppression; payment fallback order; provider clock excludes TPA hold); (§4) cohort/anonymity; (§5) versioning + owners + drilldown permissions; (§6) a 6-entry data-gap register; (§7) the six-owner sign-off block, PENDING.
Authorization evidence: N/A — documentation. It DEFINES the drilldown-permission column (provider = provider.performance.read own-records; TPA = the F8.6 network-analytics permission) that the F8.5/F8.6 pages will enforce; it grants no access and touches no auth code.
Idempotency/concurrency evidence: N/A — no writes. It specifies the determinism the F8.3 refresh must honour (versioned facts within period/timezone; late-arrival re-run; frozen periods only re-opened by an explicit corrected republish).
Privacy/security evidence: the catalog IS the anonymity contract — the cohort rules (min 5 providers, min 20 own sample, percentile/median/range with no named peer, suppression of reverse-derivable single peers) are spelled out for F8.4; the provider view is own-provider/own-branch only; "confirmed duplicate" is derived from a decline reason, not a status, so no new sensitive flag is introduced.
Money/reconciliation evidence: N/A — no money. It documents that payment timeliness reads the disbursement confirmed-payment fact (ProviderDisbursement.confirmedAt), not the batch authorization time, and that contract variance sums ClaimLine.providerWriteOff — read from stored facts, never recomputed.
Focused tests and results: none (catalog, no code). The six worked edge cases are the F8.3/F8.4 acceptance fixtures. brand + currency guards run at the commit boundary.
Typecheck/schema result: no code/schema ⇒ tsc/prisma unaffected; brand + currency guards green.
Manual/visual evidence: N/A — no UI.
Feature-flag state: none. Documents that no provider-facing performance score is published until the §7 sign-off — the F8.2+ build is internal evidence only until then.
Backfill/rollout impact: none. Downstream (F8.2 versioned score schema, F8.3 refresh, F8.4 cohort publication, F8.5/F8.6 pages) build against this catalog.
Known limitations / deferrals (flagged): (a) the whole catalog is approval-gated (§7 PENDING) — F8.1 delivers the artifact TO be signed. (b) HMS delivery success/retry/quarantine (G1) is DEFERRED — no ProviderIntegrationDelivery model exists (only IntegrationConfig @ 5205 + ProviderApiKey health); it joins the catalog when F9 lands a delivery record. (c) Member-experience metrics are deferred per §8.13 ("only when methodology exists"). (d) Several source fields are free strings not enums (Claim.declineReasonCode, PaymentVoucher.status, AdjudicationReasonCode.category, AdjudicationLog.action) — F8.3 must pin the accepted value sets from the seed. (e) There is no Claim.submittedAt and no auto-vs-manual flag on AdjudicationLog — the catalog documents the receipt-time + run-state derivations.
Unrelated worktree changes preserved: yes — worktree contained only the F8.1 docs; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched; prisma/schema.prisma unchanged; no src change.
Next allowed package: F8.2 — Extend scorecard schema and fact watermarks (M; depends F8.1). ADDITIVELY add a versioned provider performance-score model that retains numerator/denominator/definition version/completeness/cohort/source watermark + a publication/freeze state + the period/provider/branch/metric/version unique key + min-sample/cohort-anonymity fields, WITHOUT breaking the legacy cost ProviderScorecard readers. Per §11.6 the schema may be BUILT as internal evidence without the §7 sign-off; no provider-facing score publishes until it is signed. Stop: no refresh.
Stop condition observed: yes — metric definitions + the 13-field template per metric + core definitions + worked edge cases + cohort rules + gap register + sign-off block delivered; NO calculation, NO schema, NO code. §7 sign-off left PENDING by design.
```

---

## F8.2 — Extend scorecard schema and fact watermarks

```text
Work package: F8.2 (phase F8 — performance scorecards)
Status: SCHEMA COMPLETE (no refresh). The versioned/published performance-score model + its provider-safe read model exist; F8.3 fills it.
Commit: this feat commit (schema + projection + read service + factory teardown + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW, additive — the F8.1 catalog defines what a score means; §8.13 requires "score values retain numerators, denominators, definition version, completeness, cohort, and source watermark" + a publication/freeze state; F8.2 step 2 requires the legacy readers be preserved. Confirmed the legacy cost ProviderScorecard @ 5652 (unique [tenantId, providerId, period], delete-recreate, cost-only) + its producer AnalyticsRefreshService.refreshProviderScorecards + its 4 readers (analytics.service / analytics-refresh.job / analytics tRPC / (admin)/analytics page). Decision: ADD a new model rather than mutate the legacy one, so no reader breaks. No CONFLICTING path.
Files changed: prisma/schema.prisma (+ ProviderPerformanceScore + PerformanceScoreStatus — additive, pushed); src/server/services/provider-performance/projection.ts (new — pure); src/server/services/provider-performance/score.service.ts (new — read model); tests/factories/provider-network.ts (teardown deletes scores by tenant); tests/services/provider-performance-projection.test.ts (new — 8 pure) + provider-performance-score.service.test.ts (new — 7 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE only — one new model + one enum, relation-less to Provider/Tenant. The legacy ProviderScorecard is UNCHANGED. prisma validate clean; db push + generate to the throwaway PG. Applies to prod on the next build's db push.
Behavior delivered (the 6 plan steps): (1)+(3) a new ProviderPerformanceScore with numerator/denominator/value/unit/completeness/sampleSize/meetsMinimumSample + metricKey + definitionVersion + cohortKey/suppressedForAnonymity + excludedCount/controlTotals + sourceWatermark/computedAt + a publication/freeze state (status DRAFT/PUBLISHED/FROZEN + publishedAt/frozenAt/publicationVersion); (2) the legacy scorecard + readers are untouched (a legacy-row-readable test proves it); (4) indexes on [provider,period], [metric,period], [status,period], [cohort,period,metric]; (5) the min-sample (sampleSize + meetsMinimumSample) + cohort-anonymity (cohortKey + suppressedForAnonymity) fields; (6) prisma validate clean. A pure isProviderVisibleScore + projectScoreForProvider + isBranchInScope encode the §8.13 provider view rule, and a thin read service applies it.
Authorization evidence: listForProvider requires provider.performance.read + scopes to ctx.providerId (non-enumerating — another provider's score is simply absent from the result) + own/authorized branches only (provider-level "" always own; a branch id must be in ctx.allowedProviderBranchIds). listForNetwork is operator-role-gated (SUPER_ADMIN for now; the explicit network-analytics permission arrives F8.6). The service never writes.
Idempotency/concurrency evidence: the unique key [tenantId, period, providerId, providerBranchId, metricKey, definitionVersion] makes a re-computed score an upsert target (F8.3 will upsert by watermark); a new definitionVersion or a branch-level row is a distinct row (both proven). The non-null providerBranchId default ("") is the deliberate fix for nullable-in-unique (a null branch would make every provider-level row distinct in Postgres and defeat uniqueness).
Privacy/security evidence: the provider view is PUBLISHED + complete (≥0.5) + meets-sample + not-suppressed only — a DRAFT, incomplete, under-sample, or anonymity-suppressed score is excluded (proven for each). The projection carries the provider's OWN numbers (num/den/sample/completeness/version) but NEVER the internal cohortKey, controlTotals, or sourceWatermark (proven: none of those tokens appears in the projected payload). A data-quality warning flag is surfaced when completeness < 1 (feeds the F8.5 advisory warning) without hiding the number down to the 0.5 floor.
Money/reconciliation evidence: N/A — no money. controlTotals is the audit slot F8.3 uses to reconcile numerator/exclusions against the source facts; sourceWatermark is the determinism marker (a re-run over identical frozen facts is a no-op).
Focused tests and results: 8 pure (visibility true/false across published/draft/frozen/incomplete/under-sample/suppressed; projection number-carry + data-quality warning; no-leak of cohort/control/watermark; branch scope) + 7 DB (unique-key P2002 + new-version/new-branch distinct; provider view excludes the four hidden classes; branch scope; cross-provider absent + missing-permission FORBIDDEN; projection no-leak on real rows; the legacy ProviderScorecard round-trips readable; the network read role-gates + returns DRAFT). All green. tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1508 pass / 399 skip; the factory-consuming DB suites pass 30/30 together (the new teardown is FK-safe).
Typecheck/schema result: tsc clean; schema additive + pushed.
Manual/visual evidence: N/A — schema + read model, no UI (the provider dashboard is F8.5).
Feature-flag state: none. The read model returns nothing until F8.3 computes + F8.4 publishes real scores; no provider-facing performance score is published before the F8.1 §7 sign-off.
Backfill/rollout impact: none (additive model; the legacy scorecard rail is untouched).
Known limitations / deferrals (flagged): (a) no refresh (F8.3) — the model is empty until a metric family is computed. (b) The cohort BENCHMARK values (percentile/median/range) are F8.4; F8.2 stores only a cohortKey membership + the suppression flag. (c) MIN_COMPLETENESS_VISIBLE = 0.5 and the min-sample thresholds are constants here; F8.4/config may make them tenant-tunable.
Unrelated worktree changes preserved: yes — worktree contained only the F8.2 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
Next allowed package: F8.3 — Implement deterministic scorecard refresh for ONE metric family (M per family; depends F8.2). Pick one family (e.g. submission quality), query the versioned source facts within period/timezone, compute numerator/denominator/completeness, upsert a DRAFT score by watermark/version, record exclusions + control totals, and compare the F8.1 worked examples. Stop: after one family.
Stop condition observed: yes — schema + read model + tests delivered; NO refresh, NO calculation of a real score, NO UI, legacy readers preserved.
```

---

## F8.3 — Implement deterministic scorecard refresh (submission-quality family)

```text
Work package: F8.3 (phase F8 — performance scorecards) — ONE metric family
Status: DONE for the submission-quality family. The other families add the same way (F8.3 stop: after one family).
Commit: this feat commit (refresh service + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW over proven facts — the F8.1 PNMC-1.0 catalog defines each metric; the F8.2 ProviderPerformanceScore holds the output; the fact-source inventory pinned every field. Chose the submission-quality family because its metrics are grounded in Claim-level facts the factory can produce faithfully (source, submissionType, status, decidedAt/receivedAt, a Duplicate-category line reason) WITHOUT the claim-level clean-claim proxy that would contradict PNMC §1.1's "initial canonical run" (A2 is deferred to a ClaimProcessingRun-fact query). No CONFLICTING path.
Files changed: src/server/services/provider-performance/refresh.service.ts (new); tests/services/provider-performance-refresh.service.test.ts (new — 6 DB); docs PROGRESS + this note. No schema change (F8.2 already added the model). No factory change (the test creates its own claims/lines + reason codes and cleans them).
Schema/data changes: NONE — reads canonical Claim/ClaimLine facts, writes ProviderPerformanceScore rows (added in F8.2).
Behavior delivered (the 6 plan steps): (1) one family = submission quality; (2) query the versioned source facts within the period (UTC month bounds via periodBounds — tz-awareness is an F8.4 refinement) — claims whose receivedAt OR decidedAt is in the period, with their line reason categories; (3) compute A1 (digital = source ≠ MANUAL; den = ORIGINAL received minus SUPERSEDED/VOID/WITHDRAWN), A7 (den = decided minus SUPERSEDED/WITHDRAWN, VOID kept; num = terminal DECLINED/VOID with a Duplicate-category line reason — §1.4), E1 (num = CORRECTION/RESUBMISSION received; den = the A1 ORIGINAL base), each with completeness; (4) upsert a DRAFT score by the unique [period, provider, "", metric, definitionVersion] keyed on a deterministic sourceWatermark; (5) record excludedCount + a controlTotals JSON; (6) the six worked-example fixtures compare against the numbers.
Authorization evidence: N/A at the refresh layer — this is a server-side batch computation over canonical facts scoped to (tenantId, providerId); it is invoked by a job/operator, not a provider. The provider-visibility gate is the F8.2 read model (published + complete + sampled). Scores are written DRAFT, so nothing is provider-visible until F8.4 publishes.
Idempotency/concurrency evidence: the sourceWatermark (sha256 of the sorted contributing facts + period + version + metric + num + den) makes a re-run over identical facts a NO-OP — the row and its computedAt are preserved (proven). A late arrival (a new in-period claim) changes the fact set → the watermark changes → the row updates value + num + den (proven). A new definitionVersion is a distinct row (proven). Upsert is by the F8.2 unique key.
Privacy/security evidence: the refresh writes only the provider's own aggregate score rows; controlTotals holds counts (not member/claim identifiers); no cross-provider data enters a score.
Money/reconciliation evidence: N/A — no money. controlTotals is the audit slot that reconciles numerator/exclusions against the source facts; a zero denominator is never divided (value = null, meetsMinimumSample = false — proven), so a small/empty provider never yields a spurious 0% or 100%.
Focused tests and results: 6 DB — A1/E1 with period + exclusion boundaries (3 digital + 2 manual + 1 boundary-in ⇒ A1 den 6 / num 3 / value 0.5 / excludedCount 2 [a superseded + a correction]; a boundary-out claim is not even queried); A7 confirmed duplicate (a DECLINED-dup + a VOID-dup ⇒ num 2, den 4, VOID kept in the decision denominator); a late-arrival re-run (den 2 → 3, num held, watermark changed); a zero denominator (value null, sample not met, no throw); current-vs-prior definition versions as two distinct rows; an idempotent identical re-run (all changed:false, computedAt + watermark preserved). All green. tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1508 pass / 405 skip; the factory-consuming DB suites pass 30/30 together.
Typecheck/schema result: tsc clean; no schema change.
Manual/visual evidence: N/A — batch service, no UI (F8.5).
Feature-flag state: none. Scores are written DRAFT and are not provider-visible until F8.4 publishes; nothing publishes before the F8.1 §7 sign-off.
Backfill/rollout impact: none (reads existing facts; writes F8.2 rows).
Known limitations / deferrals (flagged): (a) only the submission-quality family (A1/A7/E1) is implemented — F8.3 stop is one family; B (SLA), C (PA), D (payment), E (reconsideration), F (variance) add the same way, and A2 clean-claim needs the ClaimProcessingRun initial-run fact query (deferred within F8.3's family-by-family model to keep A2 faithful to §1.1, not a hasException proxy). (b) Period bounds are UTC month (tz-awareness is an F8.4 refinement). (c) completeness is 1 for this family (submission facts are fully observable in-period); a nuanced expected-vs-present completeness is a refinement. (d) Free-string source fields (Claim.source, reason category) are matched against the seed's documented value sets.
Unrelated worktree changes preserved: yes — worktree contained only the F8.3 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
Next allowed package: F8.4 — Publish anonymized cohort benchmarks (M; depends on sufficient F8.3 metrics). Define cohort dimensions + minimum provider/sample thresholds, exclude a provider when anonymity fails, compute percentile/median/range with no named peers, freeze a publication watermark/version, audit publication, and support a corrected republish as a new publication version. Stop: no UI.
Stop condition observed: yes — one family computed deterministically with watermark/version/exclusions/control totals + the worked examples; NO second family, NO publication, NO cohort benchmark, NO UI.
```

---

## F8.4 — Publish anonymized cohort benchmarks

```text
Work package: F8.4 (phase F8 — performance scorecards)
Status: SERVICE COMPLETE (no UI). A published period now freezes anonymity-safe cohort benchmarks and marks the provider scores PUBLISHED.
Commit: this feat commit (schema + cohort math + publish service + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW, additive — F8.3 produces DRAFT scores; §8.13/F8.1 §4 require a peer distribution with a minimum cohort, no named peer, a freeze watermark/version, and a corrected republish. Confirmed the cohort dimension = Provider.type + tier (already on the model), and the F8.2 score model's cohortKey/status/publicationVersion fields. No CONFLICTING path.
Files changed: prisma/schema.prisma (+ PerformanceCohortBenchmark — additive, pushed); src/server/services/provider-performance/cohort.ts (new — pure) + publication.service.ts (new); tests/factories/provider-network.ts (teardown deletes benchmarks by tenant); tests/services/provider-performance-cohort.test.ts (new — 5 pure) + provider-performance-publication.service.test.ts (new — 5 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE only — one new model, relation-less to Tenant, carrying NO provider identity. prisma validate clean; db push + generate to the throwaway PG.
Behavior delivered (the 6 plan steps): (1) cohort dimensions = tenant|type|tier + MIN_COHORT_PROVIDERS = 5 + the per-provider minimum sample (from F8.2); (2) a provider whose cohort is below the anonymity threshold is excluded — the benchmark is not written; (3) percentile/median/range via nearest-rank over the sampled providers' values, with no named peer; (4) each benchmark is frozen with a publicationVersion + a sha256 publicationWatermark; (5) publication is audited (PERFORMANCE:PUBLISH with the benchmark/suppressed/published counts); (6) a corrected republish re-runs and writes a NEW publicationVersion (the prior remains as history), and the provider score's publicationVersion advances.
Authorization evidence: publishPeriod is role-gated to the network operator (SUPER_ADMIN for now; the explicit network-analytics permission arrives F8.6) — a PROVIDER_USER is rejected. The benchmark rows are tenant-scoped and identity-free.
Idempotency/concurrency evidence: the benchmark unique key includes publicationVersion, so a republish never collides — it appends a new version; the watermark is a deterministic hash of the frozen distribution. Publishing an already-PUBLISHED period bumps the score's publicationVersion (a corrected republish), leaving the prior benchmark as history.
Privacy/security evidence: THE anonymity contract in code — a cohort with < 5 distinct sampled providers is SUPPRESSED (no benchmark row is created; proven), and the benchmark row carries only the aggregate distribution + a providerCount — no providerId/name (proven: no provider id string appears in the row). An under-sample provider does not contribute a peer value and does not pull a small cohort over the threshold (proven). A provider's OWN score is still published (its own value is visible via the F8.2 read model) — only the peer comparison is withheld.
Money/reconciliation evidence: N/A — no money. Benchmarks are advisory (D21) and never mutate a rate/tier/provider status.
Focused tests and results: 5 pure (nearest-rank percentiles + the worked distribution [0.5,0.6,0.7,0.8,0.9] ⇒ min .5 / p25 .6 / median .7 / p75 .8 / p90 .9 / max .9; the cohort key carries no identity; the anonymity threshold) + 5 DB (a 5-provider cohort publishes a benchmark with median/min/max and NO peer id in the row + the scores become PUBLISHED with their cohortKey; a 4-provider cohort is suppressed with no benchmark row; an under-sample fifth provider is excluded so the cohort is still suppressed; a corrected republish yields publicationVersion 1 then 2 and advances the score version; publish is role-gated). All green. tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1513 pass / 410 skip; the factory-consuming DB suites pass 21/21 together (the extra test providers are cleaned before teardown drops the tenant).
Typecheck/schema result: tsc clean; schema additive + pushed.
Manual/visual evidence: N/A — service, no UI (F8.5).
Feature-flag state: none. Publication is an explicit operator action; nothing publishes before the F8.1 §7 sign-off (this is the mechanism the sign-off gates).
Backfill/rollout impact: none (additive model; reads F8.2/F8.3 rows).
Known limitations / deferrals (flagged): (a) no UI (F8.5/F8.6). (b) The per-provider percentile band is derived at read time (F8.5) from the benchmark + the provider's own value, not stored on the score (kept the F8.2 model unchanged). (c) MIN_COHORT_PROVIDERS = 5 and the sample thresholds are constants; a tenant-tunable config is a refinement. (d) Cohort facets (serviceType/region) beyond type+tier are a refinement.
Unrelated worktree changes preserved: yes — worktree contained only the F8.4 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
Next allowed package: F8.5 — Build the provider performance dashboard (M; depends F8.4). Authorize performance/provider/branches; show definitions/sample/completeness/version; show trends + the anonymized benchmark; drilldown only to own source records; link the F7.7 improvement plans; include the advisory-not-a-sanction warning. Stop: no automatic action.
Stop condition observed: yes — cohort benchmarks + publication + versioned republish + the anonymity suppression + tests delivered; NO UI, NO rate/tier/status side effect.
```

---

## F8.5 — Build the provider performance dashboard

```text
Work package: F8.5 (phase F8 — performance scorecards; UI)
Status: PAGE COMPLETE. The provider sees its own advisory scores, the anonymized benchmark, own-record drilldowns, and improvement-plan links.
Commit: this feat commit (2 reads + page + nav + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW on proven owners — the F8.2 read model (listForProvider), the F8.4 benchmark, the F7.7 improvement plans, and the F7.6 nav pattern. Confirmed the cohort dimension is Provider.type+tier and the F8.4 benchmark carries no provider id. No CONFLICTING path.
Files changed: src/server/services/provider-performance/score.service.ts (+ getCohortBenchmarkForProvider + getSubmissionDrilldown); src/app/provider/performance/page.tsx (new); src/components/layouts/provider-nav-model.ts + ProviderNav.tsx (Performance nav item + icon); tests/components/provider-nav-model.test.ts (forbidden update + a positive test); tests/services/provider-performance-dashboard.service.test.ts (new — 3 DB); docs PROGRESS + this note.
Schema/data changes: NONE — reads the F8.2/F8.4 rows.
Behavior delivered (the 6 plan steps): (1) authorize performance/provider/branches — the reads gate on provider.performance.read and scope to ctx.providerId + own/authorized branches (the F8.2 read model); (2) show definitions/sample/completeness/version — each metric card shows num/den, sample size, completeness (a data-quality warning below full), and the definition version; (3) trends + anonymized benchmark — the latest period's scores + the own-cohort benchmark (median + range + peer-group size); (4) drilldown only to own source records — getSubmissionDrilldown returns the provider's own contributing claims, and its count reconciles to the metric denominator; (5) link the human improvement plans (F7.7 listForProvider); (6) a prominent advisory-not-a-sanction warning banner.
Authorization evidence: getCohortBenchmarkForProvider + getSubmissionDrilldown + listForProvider all requirePermission(provider.performance.read) and are provider-scoped; the page redirects FORBIDDEN→/unauthorized. The drilldown never crosses the provider boundary (a provider-B claim in the same period is absent — proven). The benchmark read resolves the provider's OWN cohort only.
Idempotency/concurrency evidence: N/A — read-only.
Privacy/security evidence: the provider-safe benchmark read returns the distribution + peerGroupSize ONLY — never the raw cohortKey and never a provider id (proven: neither the cohortKey token nor any peer provider id appears in the payload). The drilldown is own-records-only. The scores shown are already the F8.2 published+complete+sampled set (unpublished/incomplete/under-sample never reach the provider). The advisory banner states the scores never trigger a suspension/rate/tier change.
Money/reconciliation evidence: N/A — advisory metrics; the drilldown-to-denominator reconciliation is the integrity check (the own-record count equals the metric denominator — proven for A1).
Focused tests and results: nav (Performance shows with provider.performance.read, hidden without; the forbidden-route test updated) + 3 DB (the own-cohort benchmark returns the distribution + peer-group size with NO cohortKey/peer-id + null when unpublished + FORBIDDEN without the permission; the drilldown count reconciles to the A1 score denominator and contains own records only). All green. tsc --noEmit clean; brand + currency + audit-coverage green; full no-DB suite 1514 pass / 413 skip; the factory-consuming DB suites pass 17/17 together.
Typecheck/schema result: tsc clean; no schema change.
Manual/visual evidence: N/A — the worktree has no .env / seeded provider session (the F3.7+ convention); the page is server-authorized + the reads are unit-tested. Browser verification lands against a seeded env.
Feature-flag state: none — permission-gated (provider.performance.read). No page publishes a score before the F8.1 §7 sign-off (publication is the F8.4 operator action gated by the sign-off).
Backfill/rollout impact: none.
Known limitations / deferrals (flagged): (a) no in-worktree browser verification (env). (b) The drilldown is implemented for the submission-quality denominator (A1/E1 ORIGINAL-received set); other families' drilldowns add the same way. (c) The per-provider percentile band is shown as the own value beside the peer median/range (not a computed banding) to avoid over-interpreting a rate whose "good" direction differs by metric. (d) The trend view shows the latest period + the provider's history via listForProvider; a charted multi-period trend is a UI refinement.
Unrelated worktree changes preserved: yes — worktree contained only the F8.5 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
Next allowed package: F8.6 — Build the TPA network performance workspace (M; depends F8.4, F7.7). Require an explicit network-analytics permission; add filters/trends/outliers/data-completeness over named providers; add safe drilldowns + metric-definition links; add the improvement-plan action; audit sensitive exports; and DO NOT add any rate/tier/suspension mutation. Stop: no automated network decision.
Stop condition observed: yes — the dashboard + the two provider-safe reads + the advisory framing + tests delivered; NO automatic action, NO schema change.
```

---

## F8.6 — Build the TPA network performance workspace

```text
Work package: F8.6 (phase F8 — performance scorecards; UI) — CLOSES PHASE F8
Status: PAGE COMPLETE. Authorized network managers compare named providers, spot outliers, export (audited), and open human improvement plans.
Commit: this feat commit (service + page + form + export route + action + audit-coverage tokens + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: BUILD-NEW on proven owners — the F8.2/F8.4 score+benchmark rows, the F7.6 operator page/action pattern, the F6.5 csvCell, and the F7.7 improvement-plan service. Confirmed session.user.permissions carries the explicit capability and ROLES.ADMIN_ONLY is the baseline. No CONFLICTING path.
Files changed: src/server/services/provider-performance/network.service.ts (new); src/app/(admin)/network-performance/{page.tsx, actions.ts, NetworkImprovementPlanButton.tsx, export/route.ts} (new); tests/audit-coverage/catalogue.ts (+ ProviderImprovementPlanService. + NetworkPerformanceService.exportComparisonCsv( tokens); tests/services/provider-performance-network.service.test.ts (new — 4 DB) + tests/actions/provider-network-improvement-action.test.ts (new — 3 seam); docs PROGRESS + this note.
Schema/data changes: NONE — reads the F8.2/F8.4 rows; the only write is a F7.7 improvement plan.
Behavior delivered (the 6 plan steps): (1) an EXPLICIT network-analytics permission (network.analytics.read) gates every read/export/action — a SUPER_ADMIN without the cap is refused; (2) metric/period filters (listAvailable) + a named-provider comparison with a top/bottom-decile outlier flag; (3) the comparison links to the metric catalog (definitions) and drills into named providers' aggregate scores; (4) the improvement-plan action opens a F7.7 plan for a provider; (5) the CSV export is audited (NETWORK_ANALYTICS:EXPORT); (6) NO rate/tier/suspension mutation exists — the only mutation is the human improvement plan.
Authorization evidence: assertNetworkAnalyst requires the explicit capability on every service method; the page redirects a capless operator to /unauthorized; the export route 403s without the cap; the action refuses without the cap (proven). The comparison is tenant-scoped.
Idempotency/concurrency evidence: N/A for the reads; the improvement-plan create is the F7.7 idempotent-by-design path (unchanged).
Privacy/security evidence: the comparison carries provider name + aggregate score numbers ONLY — no member/claim/clinical detail (proven: no member/icd/cpt/diagnosis/notes token appears in the payload). The export is audited. This is the §8.13 TPA view (named providers where the role permits) — distinct from the anonymized provider view (F8.5).
Money/reconciliation evidence: N/A — advisory; no money, no rate/tier/status side effect (the load-bearing prohibition — the workspace has no such mutation at all).
Focused tests and results: 4 DB (the explicit-permission gate on listComparison + exportComparisonCsv; the named comparison flags the 0.1 and 0.9 values as outliers and not the 0.5s; no clinical token in the payload; the audited CSV exports 5 rows with a BOM) + 3 action seam (delegation to F7.7 create with a parsed target date + revalidate; the cap gate refuses a capless operator; title/objective/target validation). All green. tsc --noEmit clean; brand + currency + audit-coverage green (the two new tokens cover the export + the plan action); full no-DB suite 1517 pass / 417 skip; the factory-consuming DB suites pass 16/16 together.
Typecheck/schema result: tsc clean; no schema change.
Manual/visual evidence: N/A — the worktree has no seeded operator session (the F3.7+ convention); the service + action + audit are unit-tested. Browser verification lands against a seeded env with the cap granted.
Feature-flag state: none — gated on the explicit capability. The cap is an operator grant (like the F7.5 bank caps) assigned via ops; until granted the whole workspace + export + action refuse.
Backfill/rollout impact: none. Note: grant network.analytics.read to the network-manager operator role to enable the workspace.
Known limitations / deferrals (flagged): (a) no in-worktree browser verification (env). (b) The outlier rule is a simple top/bottom-decile flag; a configurable z-score/threshold is a refinement. (c) The metric-definition link is a placeholder anchor (the PNMC catalog is a repo doc, not a served page). (d) The capability is not seeded to an operator role (an ops grant, like the F7.5 bank caps).
Unrelated worktree changes preserved: yes — worktree contained only the F8.6 files; scratchpad/ untracked and NOT staged; the main-checkout dirty UAT files untouched.
★ PHASE F8 COMPLETE — all 6 packages (F8.1 metric catalog PNMC-1.0 → F8.2 versioned/published score schema → F8.3 deterministic submission-quality refresh → F8.4 anonymized cohort benchmarks + publication → F8.5 provider dashboard → F8.6 TPA network workspace). The whole rail is ADVISORY (D21) — no scorecard ever auto-suspends a provider, changes a rate, or alters tiering. Nothing publishes a provider-facing score before the F8.1 §7 six-owner sign-off. Deferred within F8: the non-submission metric families (B SLA / C PA / D payment / E reconsideration / F variance) and A2 clean-claim (needs the ClaimProcessingRun initial-run query) — each adds the same way as F8.3; the network-analytics capability + the F7.5 bank caps need operator-role grants.
Next allowed package: F9.1 — Inventory current integration configs, secrets, and payload paths (begins phase F9, HMS integration control plane; a read-only inventory/evidence artifact like F0.x).
Stop condition observed: yes — the workspace + comparison + audited export + improvement-plan action + tests delivered; NO automated network decision, NO rate/tier/suspension mutation, NO schema change.
```

---

## F9.1 — Inventory current integration configs, secrets, and payload paths

```text
Work package: F9.1 (phase F9 — HMS integration control plane) — OPENS PHASE F9
Status: COMPLETE. A read-only inventory/evidence artifact (like the F0.x maps) now traces every integration/data-exchange surface end to end: auth + provider/branch scope, secret storage + log exposure, payload → canonical/direct writes, and idempotency/receipt/reconciliation/retry.
Commit: this single docs commit (the inventory + this note + the PROGRESS row). No code/schema/seed/config touched.
Proof-before-build classification: CHARACTERIZE-ONLY (read-only). Search terms: "IntegrationConfig", "hms"/"integration" in src, "pollConfiguredEndpoints", "webhook|callback|hmac|signature", "slade|smart|sha|erp", the `/api/v1/*` route tree, "prisma.integrationConfig.", the §7.11 target models. Files inspected (read): prisma/schema.prisma (IntegrationConfig@5205, ProviderApiKey@2956, ProviderBranch@3190, CaseServiceEntry@2768, ClaimIntakeReceipt@6817, PreauthIntakeReceipt@3023, SyncOperation@1755), src/lib/apiAuth.ts, src/app/api/v1/{hms-batch,sync,claims,claims/receipts/[receiptId],preauth,eligibility,benefits}/route.ts, src/app/api/claims/import/route.ts, src/server/services/hms-batch.service.ts, src/server/services/sync.service.ts (grep), src/server/jobs/offline-pack.job.ts, src/lib/queue.ts (grep), src/app/(admin)/settings/integrations/page.tsx, src/app/(admin)/settings/actions.ts (upsertIntegrationAction), src/server/trpc/routers/settings.ts, src/server/services/member-payment.service.ts (grep — the only signed-callback precedent). Existing implementation found: the live HMS batch push + stubbed pull + offline sync + B2B claim/PA rails, all canonical-write; IntegrationConfig is the only connection record. Existing tests found: not surveyed in depth (inventory package); the delivery/receipt suites arrive with F9.2+. Live behavior checked: static trace only (worktree has no .env; no live HMS partner). Classification: MISSING (the §7.11 connection/delivery/attempt control plane) over a PARTIAL substrate (canonical writes + per-line/opKey idempotency exist; delivery-grain receipt, signature/replay, branch scope, config-secret protection, and HMS retry/reconciliation do not). Smallest required change: a documentation artifact — none to code. Files expected to change: docs only. Data migration/backfill needed: none. Security/money invariants touched: none (read-only).
Files changed: docs/provider-network-os/HMS_INTEGRATION_INVENTORY.md (new); docs/provider-network-os/PROGRESS.md (F9.1 row → COMPLETE); this note.
Schema/data changes: NONE.
Behavior delivered (the 5 plan steps): (1) searched integration/HMS routes/services/jobs/config → the 11-channel map I1–I11 + the poll stub I2 + the M-Pesa signed-callback precedent (§1/§2); (2) identified provider/branch mapping + missing scope → F9-SCOPE-1 (no branch resolution; allowedBranchIds unused by hms-batch/sync), F9-SCOPE-2 (sync tenant via findFirst scaffold), F9-SCOPE-3 (IntegrationConfig not facility-scoped) (§3); (3) classified secret storage + log exposure → IntegrationConfig secrets PLAINTEXT + echoed to the admin browser (page defaultValue) + returned by protectedProcedure tRPC, vs ProviderApiKey bcrypt; app logs clean; payload content lands in ExceptionLog.notes / SyncOperation.payload (§4); (4) traced payload → writes → 100% CANONICAL on every inbound path (CaseService/ClaimIntakeService/PreauthIntakeService); no adapter writes a domain table directly (§5); (5) recorded idempotency/receipt/reconciliation/retry → the maturity ladder import>claims>preauth>sync>hms-batch, and the HMS-channel gaps F9-IDEM-1..3 (no delivery receipt; hmsBatchRef @@index-not-@@unique check-then-act race; no source↔target reconciliation), F9-RETRY-1 (hms-batch synchronous, no retry/sweeper), F9-INGRESS-1/2 (no signature/replay-window; no body-size/entry-count cap) (§6).
Authorization evidence: N/A (no code path added). The inventory records the existing gates: withApiKey (operator/provider key, BD-06 no-default), the settings page ADMIN_ONLY vs the weaker protectedProcedure tRPC, and the per-facility key binding on hms-batch.
Idempotency/concurrency evidence: N/A to build. Recorded: the check-then-act double-apply race on CaseServiceEntry.hmsBatchRef (index, not unique) — flagged F9-IDEM-2 for F9.4.
Privacy/security evidence: read-only; nothing exposed. Recorded exposures for downstream: F9-SECRET-1/2/3 (config secret cleartext round-trip + weak tRPC gate + plaintext at rest).
Money/reconciliation evidence: N/A — no money moved. Recorded: HMS batch has no persisted control totals / source↔target reconciliation (F9-IDEM-3).
Focused tests and results: none — inventory package (no code). tsc/brand/currency untouched (docs-only change; nothing to run).
Typecheck/schema result: no code or schema change; not run (docs-only).
Manual/visual evidence: N/A — documentation artifact.
Feature-flag state: none.
Backfill/rollout impact: none.
Known limitations / deferrals (flagged): (a) static trace only — no live HMS partner / no .env in the worktree, so runtime behavior (actual header logging, real request sizes) is inferred from source, not observed; (b) test-suite coverage of the integration surface was not enumerated (belongs with F9.2+ when the delivery/receipt models exist); (c) the M-Pesa callback is catalogued as the signature-verify precedent but is out of HMS scope; (d) findings are characterization, not remediation — each is tagged to the F9.2–F9.9 package that closes it, and NONE is actioned here.
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked, NOT staged); the main-checkout dirty UAT files untouched.
Next allowed package: F9.2 — Add provider integration connection/delivery schema (M; depends F9.1, F1.6). Additive ProviderIntegrationConnection/Delivery/(record-result)/Attempt models per §7.11: provider + optional branch + secret reference; delivery idempotency/hash/control totals; attempts/retry/circuit/cursor; PRESERVE the existing IntegrationConfig during migration; validate schema. Tests: provider/branch/connection consistency, delivery idempotency uniqueness, attempt ordering, no secret/raw payload required. Stop: no live path.
Stop condition observed: yes — the inventory + findings register delivered; NO connector, route, schema, seed, or config changed.
```

---

## F9.2 — Add provider integration connection/delivery schema

```text
Work package: F9.2 (phase F9 — HMS integration control plane)
Status: COMPLETE. Additive §7.11 control-plane schema exists; NO live path wired.
Commit: this feat commit (schema + factory teardown + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: MISSING (the §7.11 connection/delivery/attempt models) over the PARTIAL substrate the F9.1 inventory characterized. Search terms: "model ProviderIntegration*", the target enum names — all confirmed ABSENT before adding (no collision). Files inspected: prisma/schema.prisma (ProviderPerformanceScore@7554 + PerformanceCohortBenchmark@7612 for the additive convention; IntegrationConfig@5205 preserved; CaseServiceEntry@2768 for the per-line-hash idempotency this generalizes), tests/factories/provider-network.ts (teardown + return shape), tests/services/provider-performance-publication.service.test.ts (the opt-in-DB test pattern), docs/INSTALL.md §3 (db push only), TEST_DB_HARNESS.md (throwaway pnos_uat + the DIRECT_URL landmine). Smallest required change: add the four models + five enums; extend the factory teardown; add one opt-in-DB test. No CONFLICTING path.
Files changed: prisma/schema.prisma (+ ProviderIntegrationConnection, ProviderIntegrationDelivery, ProviderIntegrationRecordResult, ProviderIntegrationAttempt; + enums ProviderIntegrationMode, ProviderIntegrationStatus, IntegrationCircuitState, IntegrationDeliveryDirection, IntegrationDeliveryStatus); tests/factories/provider-network.ts (FK-safe teardown for the four models); tests/services/provider-integration-schema.test.ts (new — 6 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE only. Four models, five enums. Relation-less to Tenant/Provider/Branch (plain String scope keys, matching the F8 performance models); providerBranchId uses `""` for provider-level so branch scope stays well-defined in the connection unique key. Internal relations only: Delivery→Connection, Attempt→Delivery, RecordResult→Delivery. The legacy IntegrationConfig is UNTOUCHED (preserved during migration, F9.2 step 5). prisma validate clean; db push + generate to the throwaway pnos_uat (datasource line confirmed "pnos_uat …127.0.0.1:54329", NOT the real aicare_uat). No migration files (db push only, INSTALL §3).
Behavior delivered (the 6 plan steps): (1) added the models/enums/indexes; (2) modelled provider + optional branch + a SECRET REFERENCE (secretRef + credentialVersion) — never the secret itself; (3) delivery idempotency (@@unique([connectionId, idempotencyKey])) + normalizedPayloadHash (same-key/different-hash conflict detection) + control totals (recordCount/amountTotal + applied/rejected/quarantined/replayed tallies); (4) attempts (append-only, @@unique([deliveryId, attemptNumber])) + retry (attemptCount/maxAttempts/nextAttemptAt + durable lease fields) + circuit (IntegrationCircuitState + circuitOpenedAt) + cursor (on the connection); (5) preserved IntegrationConfig; (6) validated the schema.
Authorization evidence: N/A — schema only, no service/route (F9.3 administers; F9.4 authenticates). The models CARRY the scope (tenantId + providerId + providerBranchId + scopes) the F9.3/F9.4 services will enforce.
Idempotency/concurrency evidence: the delivery idempotency uniqueness is a DB-enforced @@unique([connectionId, idempotencyKey]) (proven: a duplicate key on the same connection → P2002; the same key on another connection is allowed). Per-record idempotency is @@unique([deliveryId, recordHash]) (proven). Attempt ordering is @@unique([deliveryId, attemptNumber]) (proven: duplicate attemptNumber → P2002; orderBy returns [1,2,3]). This is the DB-level guard the F9.1 inventory flagged as MISSING on the legacy hms-batch path (F9-IDEM-2, a non-unique hmsBatchRef check-then-act race) — F9.4 will route hms-batch through this durable delivery.
Privacy/security evidence: the "no secret / raw-payload column" invariant is proven — the connection persists secretRef (a reference) + credentialVersion and has NO secret/apiSecret/apiKey/credential/password/rawPayload property; the delivery has normalizedPayloadHash and NO rawBody/payload/body/clinicalBody; the attempt has safeErrorCode and NO rawResponse/responseBody/headers/authorization. This is the schema-level closure of the F9.1 plaintext-secret finding (F9-SECRET-*) — the control plane structurally cannot store a secret or a raw clinical body.
Money/reconciliation evidence: N/A — no money moved. The control-total columns (amountTotal + the count tallies + the per-record amount) are the substrate F9.5's row/amount conservation will populate; none is computed here.
Focused tests and results: 6 DB (opt-in) — (1) connection scoped to provider+branch + duplicate (provider,branch,connector,mode) → P2002; (2) provider-level "" and branch-level rows coexist for the same connector+mode; (3) delivery idempotency per (connection,key) incl. same-key-other-connection allowed; (4) attempt ordering + duplicate attemptNumber → P2002; (5) per-record idempotency per (delivery,recordHash); (6) the no-secret/no-raw-body shape. All 6 pass on the throwaway PG; self-skip without AUTOPILOT_TEST_DB. Co-run with the performance-publication + disbursement factory suites: 22/22 together (teardown interplay clean).
Typecheck/schema result: tsc --noEmit clean; prisma validate clean; schema additive + pushed + generated.
Manual/visual evidence: N/A — schema only, no UI (F9.8 builds the ops views).
Feature-flag state: none — inert schema; no code reads/writes these tables yet (no live path, F9.2 stop). Nothing to flag until F9.3/F9.4.
Backfill/rollout impact: none (additive models; prod applies on the next build's prisma db push, per the established PNOS convention). No existing row touched; IntegrationConfig preserved.
Known limitations / deferrals (flagged): (a) no service/route/live path — F9.3 (connection admin), F9.4 (durable receipt), F9.5 (canonical mapping), F9.6 (retry/quarantine/sweeper) fill in; (b) relation-less to Tenant/Provider/Branch (no back-relations added) — cross-entity referential consistency (branch belongs to provider, etc.) is enforced in the F9.3 service, not by FK, matching the F8 convention; (c) businessObjectType / outcome / resultClass are Strings with documented value sets (connector-declared), not enums, to avoid churn before F9.5 fixes the mapping vocabulary; (d) the durable-lease + circuit fields are present but inert until F9.6.
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked, NOT staged) + the F9.2 files; the main-checkout dirty UAT files untouched; no migration files created.
Next allowed package: F9.3 — Implement connection and credential administration (M; depends F9.2, F1.3). Authorized integration admins create/test/rotate/pause connections WITHOUT seeing stored secrets: connector/version/endpoint/scope config; validate HTTPS/allowlist + secret-reference storage; reveal a locally-generated secret only once; test/activate/pause/disable/rotate transitions; audit + PHI-free notify; prevent a provider user from widening provider/branch/scope. Tests: role/provider/branch; SSRF URL forms; secret not returned/logged; rotation/expiry/revoke; inactive connection rejects delivery. Stop: no data delivery.
Stop condition observed: yes — the additive schema + tests delivered; NO service, route, live path, or IntegrationConfig change.
```

---

## F9.3 — Implement connection and credential administration

```text
Work package: F9.3 (phase F9 — HMS integration control plane)
Status: COMPLETE. Authorized integration admins manage their own connections + rotate secrets WITHOUT seeing stored secrets. NO data delivery (F9.3 stop).
Commit: this feat commit (schema + url-safety + secret store + admin service + factory teardown + 2 tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: MISSING (no connection-admin service, no secret store, no SSRF validator existed) over the F9.2 schema substrate. Search terms: "ssrf|isPrivateIp|allowlist|new URL", "reveal|rotate|bcrypt" (found the ProviderApiKey reveal-once pattern), "provider.integrations.manage" (found it ALREADY in the F1.1 catalogue — no new permission), the audit + NotificationOutbox helpers. Files inspected: prisma/schema.prisma (F9.2 connection model), src/server/services/provider-access.service.ts (requirePermission/assertProviderOwned/requireBranch — the anti-widening guards), src/server/services/provider-api-key.service.ts (bcrypt reveal-once/rotation to mirror), src/server/services/provider-user-admin.service.ts (audit shape + owned-target pattern), src/server/services/notifications/outbox.ts (PHI-free enqueue), prisma/seeds/provider-rbac.ts (the permission). Smallest required change: one SSRF helper + one secret store + one admin service + the secret table; reuse the access/audit/notify owners. No CONFLICTING path.
Files changed: prisma/schema.prisma (+ ProviderIntegrationSecret model + connection.secrets relation — ADDITIVE, pushed); src/lib/url-safety.ts (new — SSRF-safe URL form validation); src/server/services/provider-integration/secret-store.ts (new — bcrypt reveal-once/rotation over the secret table); src/server/services/provider-integration/connection-admin.service.ts (new — the admin service + state machine + the assertAcceptsDelivery guard); tests/factories/provider-network.ts (teardown for ProviderIntegrationSecret); tests/lib/url-safety.test.ts (new — 11 pure) + tests/services/provider-integration-admin.service.test.ts (new — 5 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE only — one model (ProviderIntegrationSecret: bcrypt secretHash + version + status, @@unique([connectionId, version])). The connection row holds only secretRef + credentialVersion; the secret MATERIAL is never on the connection and never returned. prisma validate + db push + generate to the throwaway pnos_uat (datasource confirmed 127.0.0.1:54329, NOT the real aicare_uat). No migration files.
Behavior delivered (the 6 plan steps): (1) connector/version/endpoint/scope config on create/updateConfig; (2) HTTPS/allowlist validation (assertSafeOutboundUrl on PULL/BIDIRECTIONAL) + secret-REFERENCE storage (the connection points at a ProviderIntegrationSecret, never holds material); (3) a locally-generated secret is revealed EXACTLY ONCE by rotateSecret (mvxi_-prefixed, bcrypt-stored); (4) test/activate/pause/resume/disable transitions guarded by a TRANSITIONS state machine (activate requires a secret + a prior TESTING; DISABLED terminal); (5) audit on every mutation (INTEGRATION_CONNECTION:*, version-only metadata) + PHI-free IN_APP notify on create/activate/disable; (6) anti-widening — the provider is always ctx.providerId (the input type has no providerId field), a named branch must be held (requireBranch), and a branch-scoped connection is invisible to an actor without that branch.
Authorization evidence: every method requirePermission(provider.integrations.manage); create pins providerId to the context; loadOwned enforces same-provider + branch-held (safe NOT_FOUND for a foreign/branch-mismatched connection — proven: provider A cannot read provider B's connection, and a branch-a2 connection is NOT_FOUND to an actor holding only branch-a1); no-permission → FORBIDDEN_PERMISSION; a foreign branch → FORBIDDEN_BRANCH (proven).
Idempotency/concurrency evidence: secret rotation runs in a tx (mint + connection.secretRef/credentialVersion update + audit atomic); mint retires the prior ACTIVE and creates version+1 so exactly one ACTIVE secret exists (proven: count===1 after two rotations); notify is dedupeKey-idempotent.
Privacy/security evidence: THE load-bearing proof — the secret is revealed once and NEVER again: rotateSecret returns the plaintext; the ConnectionView (list/get/create/rotate.connection) has NO plaintext/secret/secretHash/secretRef property (proven), and the SECRET_ROTATE audit row does not contain the plaintext (proven via a BigInt-safe stringify scan). SSRF: assertSafeOutboundUrl rejects non-HTTPS, embedded credentials, private/loopback/link-local/reserved IPv4, internal hostnames (localhost/.local/.internal/.lan), and IPv6 loopback/link-local/ULA/IPv4-mapped (incl. the URL-parser's hex-normalized ::ffff: form) — 11 pure cases; the service rejects an unsafe PULL endpoint (INVALID_CONFIG, proven). This closes the F9.1 findings F9-SECRET-1/2/3 (no cleartext secret is ever emitted by this rail) at the service layer. DOCUMENTED LIMITATION: DNS-rebinding (a hostname resolving to a private IP) is caught only by resolving at connect time — that runtime guard belongs to the F9.7 transport; F9.3 validates the URL form.
Money/reconciliation evidence: N/A — no money.
Focused tests and results: 11 pure url-safety (accept public https; reject non-absolute/non-https/embedded-creds/private-v4/internal-host/v6-special; allowlist exact+wildcard) + 5 DB admin (role/provider/branch scoping incl. cross-provider NOT_FOUND + branch invisibility; SSRF rejection on PULL; reveal-once + no-secret-in-view/audit + rotation-revokes-predecessor + one ACTIVE secret; full lifecycle DRAFT→TESTING→ACTIVE→PAUSED→DISABLED with activate-needs-secret/needs-TESTING + assertAcceptsDelivery gates on ACTIVE only). 16/16 pass on the throwaway PG; self-skip without AUTOPILOT_TEST_DB. Co-run with the schema + performance + disbursement factory suites: 27/27 together. tsc clean; brand + currency green; full no-DB suite 1528 pass / 428 skip (no regression; +11 pure url-safety pass, +5 admin skip).
Typecheck/schema result: tsc --noEmit clean; prisma validate clean; schema additive + pushed + generated.
Manual/visual evidence: N/A — service only, no UI (the provider/admin ops views are F9.8).
Feature-flag state: none — permission-gated (provider.integrations.manage, an existing F1.1 capability). No connection is ACTIVE until an admin tests + activates it; no delivery path reads these connections yet (F9.4+).
Backfill/rollout impact: none (additive model; prod applies on the next build's prisma db push). No existing row touched; IntegrationConfig preserved.
Known limitations / deferrals (flagged): (a) OUTBOUND partner-supplied credentials need reversible storage (to replay to the partner) — deferred to F9.7 when the contracted auth scheme is known; the store serves the locally-generated inbound signing secret (bcrypt, verify-only) today. (b) The admin service operates on a ProviderAccessContext (provider users); an operator-initiated setup path would act with an operator context and is a thin add when F9.8's ops views land. (c) DNS-rebinding runtime resolution is F9.7 (documented in url-safety.ts). (d) No UI (F9.8). (e) endpointAllowlistRef is treated as inline hosts only when it contains dots; a policy-store handle is resolved at F9.7 runtime.
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked, NOT staged) + the F9.3 files; the main-checkout dirty UAT files untouched; no migration files.
Next allowed package: F9.4 — Implement durable inbound delivery receipt (M; depends F9.2, F9.3). Every accepted inbound request durably records/replays/conflicts BEFORE domain processing: authenticate connection/signature/scope/replay window; enforce content-type/schema/body size; normalize safe identity/hash/control totals; create/replay/conflict delivery; enqueue/process from durable state; return a receipt/status URL; never store a raw clinical body in log metadata. Tests: replay/conflict/signature/clock-skew; oversize/schema/provider/branch; app failure after receipt; accepted receipt survives queue outage. Stop: no HMS apply.
Stop condition observed: yes — connection + credential administration delivered; NO data delivery, NO HMS apply, NO route wired (the admin service + its tests are the substance; the UI is F9.8).
```

---

## F9.4 — Implement durable inbound delivery receipt

```text
Work package: F9.4 (phase F9 — HMS integration control plane) — the Gate F reliability core
Status: COMPLETE. Every accepted inbound request is authenticated, validated, and DURABLY RECORDED before any domain processing. NO HMS apply (F9.4 stop).
Commit: this feat commit (the InboundDeliveryService + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: MISSING (no inbound-receipt service existed) over the F9.2 delivery schema + the F9.3 connection/secret owners. Files inspected: the F9.2 ProviderIntegrationDelivery model (idempotencyKey/normalizedPayloadHash/control totals/status/nextAttemptAt — all present, NO schema change needed), src/server/services/provider-integration/secret-store.ts (verify) + connection-admin.service.ts (assertAcceptsDelivery, ACTIVE gate), src/server/services/notifications/outbox.ts (the P2002 idempotent-create pattern to mirror), the legacy hms-batch.service.ts (the check-then-act race F9-IDEM-2 this replaces). Smallest required change: one service (receive + getReceipt) reusing the F9.2 schema + F9.3 secret store. No schema. No CONFLICTING path.
Files changed: src/server/services/provider-integration/inbound-delivery.service.ts (new); tests/services/provider-integration-delivery.service.test.ts (new — 11 DB); docs PROGRESS + this note.
Schema/data changes: NONE — the F9.2 delivery model already carries every field (idempotency/hash/control totals/status/nextAttemptAt). No db push, no generate.
Behavior delivered (the 7 plan steps): (1) authenticate connection (resolve by id, ACTIVE-only) + shared secret (bcrypt via the F9.3 store) + scope (businessObjectType ∈ connection.scopes when non-empty) + replay window (timestamp within ±5 min, else CLOCK_SKEW); (2) enforce content-type (application/json), body size (≤1 MB default, injectable), and well-formed JSON — all BEFORE unbounded processing; (3) normalize a sha256 payload hash + carry the declared record/amount control totals; (4) create / replay / conflict — one durable delivery per (connection, idempotencyKey): same key+same hash REPLAYS (idempotent, no second row), same key+different hash CONFLICTS (no mutation), and a concurrent unique-race is caught (P2002 → re-read → decide) so it is race-safe — the exact guard the legacy hms-batch check-then-act lacked (F9-IDEM-2); (5) enqueue/process FROM DURABLE STATE — the row is persisted ACCEPTED with nextAttemptAt=now (the DB row IS the queue), and an injectable onAccepted fast-path enqueue is best-effort (a throw is swallowed — the delivery is already durable); (6) return a receipt with a status URL (/api/v1/integration/deliveries/{id}) + getReceipt for that URL; (7) the raw body is hashed and NEVER stored or logged — the row holds only the hash.
Authorization evidence: the connection must be ACTIVE (INACTIVE rejected — proven), the presented secret must verify against the connection's ACTIVE secret (UNAUTHENTICATED on a wrong secret, with NO row written — proven), and the object type must be in scope (FORBIDDEN_SCOPE — proven). provider/branch are SERVER-DERIVED from the connection, never the body (proven: the delivery's providerId = the connection's provider; a branch-scoped connection stamps its branch).
Idempotency/concurrency evidence: @@unique([connectionId, idempotencyKey]) + the P2002-catch make create/replay/conflict correct under concurrency: replay returns the same deliveryId with no second row (count===1 — proven), conflict throws and mutates nothing (count stays 1, the stored hash is unchanged — proven). This is the durable, race-free replacement for the legacy per-line find-then-create.
Privacy/security evidence: the raw body is hashed, never persisted/logged (proven: the stored row contains no body field content); getReceipt returns a secret-free, payload-free projection (no rawBody/payload/secret/hash keys — proven) scoped to the connection (a wrong connection → null, non-enumerating — proven). DOCUMENTED: authentication is bearer-secret + replay-window; a cryptographic body-HMAC (binding the signature to the payload bytes, needing a reversibly-stored per-connector signing key) is a F9.7 refinement — consistent with the F9.3 deferral of reversible secret storage.
Money/reconciliation evidence: control totals (recordCount/amountTotal) are captured as DECLARED on the delivery; reconciliation of declared-vs-applied is F9.5's per-record mapping (no money moves at receipt time).
Focused tests and results: 11 DB — fresh ACCEPTED + server-derived scope + no-body-stored; idempotent replay (no 2nd row); conflict (no mutation); bad-credential UNAUTHENTICATED (no row); CLOCK_SKEW (no row); OVERSIZE/SCHEMA/UNSUPPORTED_MEDIA (no row); INACTIVE connection; FORBIDDEN_SCOPE; branch derivation; queue-outage survival (onAccepted throws → receipt still returned + row durable ACCEPTED); scoped secret-free getReceipt (+ wrong-connection null). All pass on the throwaway PG; self-skip without AUTOPILOT_TEST_DB. Co-run with the schema+admin+performance suites: 27/27 together. tsc clean; brand + currency green; full no-DB suite 1528 pass / 439 skip (no regression; +11 delivery skips).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service only; the HTTP route that calls receive() lands with F9.5 (where the ACCEPTED delivery is mapped to canonical records) and the ops view is F9.8. receive() returns the status-URL string contract now.
Feature-flag state: none — the service is inert until a caller (F9.5 route / F9.9 cutover) invokes it. No live route accepts deliveries yet.
Backfill/rollout impact: none.
Known limitations / deferrals (flagged): (a) NO HTTP route yet (F9.4 stop = no HMS apply) — F9.5 adds the route that calls receive() then maps the ACCEPTED delivery through a canonical service; the status-URL GET route lands with it / F9.8. (b) authentication is bearer-secret + replay-window; body-HMAC is F9.7 (see above). (c) the fast-path onAccepted enqueue is injectable and defaults to none — the real integration queue + the DB-state sweeper are F9.6; durability does not depend on them (the DB row is the queue). (d) schema validation is well-formed-JSON only; the per-object-type schema/mapping is F9.5.
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked, NOT staged) + the F9.4 files; the main-checkout dirty UAT files untouched; no schema/migration change.
Next allowed package: F9.5 — Route inbound HMS records through canonical domain services (M per object type; depends F9.4 + the relevant PA/claim/case canonical service). Pick ONE object type (e.g. CASE_SERVICE via CaseService, mirroring the legacy hms-batch), define an external→canonical mapping version + golden fixtures, validate provider/branch/member/contract, call the canonical service (NO direct table writes), record per-record ProviderIntegrationRecordResult + the delivery aggregate, and classify terminal/retryable/quarantine. Tests: golden mapping fixtures; mixed-batch partial outcome; row/amount conservation; same-record replay; canonical effects once. Stop: after one object type.
Stop condition observed: yes — the durable receipt (authenticate/validate/create-replay-conflict/durable-accept/receipt) delivered; NO HMS apply, NO canonical domain write, NO route wired.
```

---

## F9.5 — Route inbound HMS records through canonical domain services (CASE_SERVICE)

```text
Work package: F9.5 (phase F9 — HMS integration control plane), object type CASE_SERVICE
Status: COMPLETE for ONE object type (CASE_SERVICE via CaseService). Stop honored — PA/claim/case-activity NOT built.
Commit: this feat commit (mapper + processor + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: MISSING (no external→canonical routing over the durable delivery) but the CANONICAL owner already exists — CaseService.addServiceEntry (the legacy hms-batch's target). Files inspected: src/server/services/case.service.ts (addServiceEntry signature/validation/return — NOT idempotent on hmsBatchRef; the legacy route guarded before calling), the legacy hms-batch.service.ts (envelope + lineHash + case matching to mirror), src/lib/safe-action-error.ts (looksLowLevel — infra-vs-business classifier), the F9.2 ProviderIntegrationRecordResult/@@unique + F9.4 delivery states. Smallest change: one versioned mapper + one processor; reuse CaseService (no direct writes). No schema. No CONFLICTING path.
Files changed: src/server/services/provider-integration/mappers/case-service-v1.ts (new — pure versioned mapper); src/server/services/provider-integration/delivery-processor.service.ts (new — the processor); tests/services/provider-integration-processor.service.test.ts (new — 4 pure golden + 6 DB); docs PROGRESS + this note.
Schema/data changes: NONE — reuses F9.2 (ProviderIntegrationRecordResult + the delivery aggregate columns) and writes domain state ONLY through CaseService.
Behavior delivered (the 6 plan steps): (1) selected CASE_SERVICE → CaseService.addServiceEntry (mirrors the legacy hms-batch channel); (2) a VERSIONED external→canonical mapper CASE_SERVICE.v1 (`parseCaseServiceBatchV1` version-gated envelope + `mapCaseServiceRecordV1` per-record validate/normalize + `recordHashV1` per-record identity) with golden fixtures; (3) validate provider (+ optional branch) / member / open-case — the case is matched by caseNumber or member's single open case at the DELIVERY's provider+branch (server-derived, never the body); contract enforcement stays at billing time (adding a case service line has no contract gate — faithful to the legacy); (4) call the CANONICAL CaseService.addServiceEntry — NO direct domain table write (the only writes here are the integration RecordResult + the delivery aggregate); (5) per-record ProviderIntegrationRecordResult (APPLIED/REPLAYED/UNMATCHED/REJECTED/QUARANTINED/RETRYING + canonical entity ref + amount + safe reason) + the delivery aggregate (appliedCount/replayedCount/rejectedCount[=+unmatched]/quarantinedCount + status COMPLETED/PARTIAL/RETRYING); (6) classify terminal (applied/unmatched/rejected) vs retryable (looksLowLevel infra ⇒ RETRYING, left for the F9.6 sweeper) vs quarantine (deterministic business/data failure at apply, e.g. future-dated entry ⇒ QUARANTINED with a safe reason).
Authorization evidence: the case must belong to the DELIVERY's provider (+ branch when scoped) — a provider-A delivery naming provider-B's case is UNMATCHED and provider-B's case gets ZERO entries (proven). Scope is server-derived from the delivery, never the payload.
Idempotency/concurrency evidence: per-record idempotency via ProviderIntegrationRecordResult @@unique([deliveryId, recordHash]) — a terminal result short-circuits to REPLAYED (canonical effect once), proven by re-driving a processed delivery (applied 1 → replayed 1, still ONE CaseServiceEntry). Crash-recovery: if the canonical entry exists for the record's hmsBatchRef (`${deliveryId}#${recordHash}`) but no terminal result (a crash between apply and result), it is adopted, never re-applied. A structural envelope failure REJECTS the whole delivery with nothing applied. (Concurrent-processor safety within one delivery relies on the F9.6 lease; within a lease, the result + hmsBatchRef guards give effects-once.)
Privacy/security evidence: the RecordResult stores a hash + canonical entity ref + a SAFE reason — never the raw clinical record. Unmatched/quarantine reasons are safe strings (no member/clinical body).
Money/reconciliation evidence: ROW conservation — total = applied + replayed + unmatched + rejected + quarantined + retrying (proven for a 4-record mixed batch: 1+1+1+1). AMOUNT conservation — the report's appliedAmount equals the sum of the applied records' amounts AND the sum of the created CaseServiceEntry.totalAmount (proven: 5000.00 = the single good row = Σ created entries). No money is created or lost in mapping; the canonical service computes the entry totals.
Focused tests and results: 4 pure golden (versioned envelope parse + version reject; record→canonical mapping with category/quantity defaults + control amount; safe-error for bad records; deterministic 32-char record hash) + 6 DB (clean batch all-applied COMPLETED; idempotent re-drive effects-once; mixed-batch PARTIAL with applied/unmatched/quarantined/rejected + row+amount conservation + aggregate counts; cross-provider case never touched; body/receipt HASH_MISMATCH; NOT_PROCESSABLE on a COMPLETED delivery). 10/10 pass on the throwaway PG; the golden fixtures self-run in the no-DB suite, the processor tests self-skip without AUTOPILOT_TEST_DB. Co-run with schema+admin+delivery+disbursement: 43/43 together. tsc clean; brand + currency green; full no-DB suite 1532 pass / 445 skip (no regression; +4 golden pass, +6 processor skip).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service only; the HTTP route that calls receive()→process() (and the legacy hms-batch cutover) is F9.9; ops views are F9.8.
Feature-flag state: none — the processor is inert until a caller invokes it. The legacy /api/v1/hms-batch route is UNCHANGED and remains the live push path until F9.9 cuts it over.
Backfill/rollout impact: none.
Known limitations / deferrals (flagged): (a) ONE object type only (CASE_SERVICE) — PA (PreauthIntakeService) / claim (ClaimIntakeService) / case-activity each add the same way behind their own versioned mapper (F9.5 is "M per object type"); (b) no HTTP route / no legacy cutover (F9.9); (c) the retryable path leaves a RETRYING record for the F9.6 sweeper — the sweeper + its re-drive (which needs the body: client re-POST or, for PULL, a re-fetch — no raw body is server-retained) is F9.6; (d) concurrent-processor exclusivity relies on the F9.6 delivery lease; (e) contract validation is intentionally not applied at case-service-line time (it applies when the case is billed into a claim through the canonical pipeline) — faithful to the legacy hms-batch.
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked, NOT staged) + the F9.5 files; the main-checkout dirty UAT files untouched; no schema change.
Next allowed package: F9.6 — Implement retry, poison quarantine, and sweeper (M; depends F9.4/F9.5). Define safe retry classification/backoff/max attempts; lease attempts durably; retry idempotently; quarantine terminal/poison with a safe reason; add a sweeper for abandoned/retry-due deliveries; add an authorized manual retry after remediation. Tests: timeout/5xx/4xx/schema/poison; worker crash + lease expiry; retry exhaustion; unaffected rows complete; manual retry does not duplicate. Stop: no outbound pull.
Stop condition observed: yes — ONE object type (CASE_SERVICE) mapped through the canonical service with per-record results + conservation; NO second object type, NO direct table write, NO route, NO schema change.
```

---

## F9.6 — Implement retry, poison quarantine, and sweeper

```text
Work package: F9.6 (phase F9 — HMS integration control plane)
Status: COMPLETE. Retryable deliveries recover with backoff + a durable lease; poison/exhausted deliveries quarantine visibly without blocking others; a sweeper + an authorized manual retry drain durable state. NO outbound pull (F9.6 stop).
Commit: this feat commit (DeliveryRetryService + test) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: MISSING (no retry/lease/sweeper) but ALL fields exist — the F9.2 delivery carries attemptCount/maxAttempts/nextAttemptAt/leaseOwner/leaseExpiresAt/quarantineReason and the ProviderIntegrationAttempt ledger. Files inspected: the F9.2 delivery/attempt models, the F9.5 processor (the retry UNIT + its RETRYING classification), src/lib/safe-action-error.ts (looksLowLevel), the F9.3 access guards (manual-retry permission). Smallest change: one service over the existing fields; NO schema. No CONFLICTING path.
Files changed: src/server/services/provider-integration/delivery-retry.service.ts (new); tests/services/provider-integration-retry.service.test.ts (new — 1 pure + 7 DB); docs PROGRESS + this note.
Schema/data changes: NONE — uses the F9.2 lease/attempt/backoff fields.
Behavior delivered (the 6 plan steps): (1) safe retry classification (looksLowLevel infra ⇒ retry; deterministic business failure ⇒ poison) + exponential backoff (backoffMs: 30s×2^(n-1), capped 1h) + maxAttempts (from the delivery); (2) a DURABLE lease — acquireLease is an atomic compare-and-set (conditional updateMany: claim when free/expired/mine) so one worker processes a delivery at a time and a crashed worker's lease is reclaimed after expiry; (3) retry idempotently — runAttempt wraps the F9.5 processor whose per-record results already make canonical effects once; (4) quarantine — a fatal/poison attempt or attempt-exhaustion sets status QUARANTINED with a SAFE reason (never a raw body); (5) sweep — drains ACCEPTED/RETRYING deliveries whose nextAttemptAt is due and whose lease is free/expired: exhausted ones quarantine, the rest surface as retry-due (because no raw body is retained, the sweeper does NOT re-fetch a PUSH body — that is a client re-POST / manual retry / the F9.7 PULL re-fetch); (6) manualRetry — permission-gated (provider.integrations.manage) + provider-scoped ownership (foreign delivery ⇒ safe NOT_FOUND); resets a stuck delivery to ACCEPTED and re-drives it through the standard lease/attempt lifecycle with a RE-SUPPLIED body.
Authorization evidence: manualRetry requirePermission + ownership (a provider-B actor is refused NOT_FOUND for a provider-A delivery — proven). The sweeper is a system job (no external actor).
Idempotency/concurrency evidence: the lease is an atomic CAS — a second live worker is refused (acquireLease false; runAttempt returns "skipped"), and a crashed worker's lease is reclaimed only after expiry (proven). Manual retry re-drives idempotently — an already-applied record REPLAYS, so a re-drive of a processed delivery adds ZERO canonical entries (proven). The attempt ledger is append-only + ordered (F9.2 @@unique).
Idempotency/concurrency evidence (retry lifecycle): a retryable attempt records the attempt (retryable=true, resultClass) + schedules nextAttemptAt = now+backoff + RETRYING; at the ceiling it QUARANTINES (retryable=false, "exhausted"); a fatal attempt QUARANTINES immediately. All proven.
Privacy/security evidence: attempts store a SAFE result class + error code only (no raw body/secret); quarantine reasons are safe strings. The sweeper never fetches or logs a body.
Money/reconciliation evidence: N/A — no money; the canonical financial effects are the F9.5 processor's (idempotent).
Focused tests and results: 1 pure (deterministic capped backoff) + 7 DB (lease + crash-expiry reclaim; skip when leased; retryable attempt + backoff + attempt-ledger row; exhaustion ⇒ QUARANTINED with 3 attempts; fatal ⇒ immediate QUARANTINED; sweep quarantines exhausted + surfaces retry-due + leaves not-due; manual retry re-drives idempotently [no duplicate entry] + foreign-provider NOT_FOUND). 8/8 pass on the throwaway PG; self-skip without AUTOPILOT_TEST_DB. Co-run of all 5 integration suites: 40/40 together. tsc clean; brand + currency green; full no-DB suite 1533 pass / 452 skip (no regression).
Typecheck/schema result: tsc --noEmit clean; no schema change.
Manual/visual evidence: N/A — service only; the ops view that shows attempts/retries + drives manual retry is F9.8.
Feature-flag state: none — the sweeper is not yet scheduled (no cron entry added); it is invoked explicitly/tested. Wiring it into the daily/interval scheduler is an ops step (like the F4.10 sweeper) — deferred with F9.8/F9.9 so a half-built pull path isn't swept prematurely.
Backfill/rollout impact: none.
Known limitations / deferrals (flagged): (a) the sweeper does NOT re-drive PUSH deliveries (no retained body) — it manages lease/quarantine + surfaces retry-due; autonomous re-drive is the F9.7 PULL re-fetch or a client re-POST; (b) the retry UNIT is the CASE_SERVICE processor (F9.5's one object type) — other types plug in the same way; (c) no scheduler entry yet (F9.8/F9.9); (d) backoff is deterministic (no jitter) for testability — jitter is a trivial refinement.
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked) + the F9.6 files; the main-checkout dirty UAT files untouched; no schema change.
Next allowed package: F9.7 — Implement one contracted outbound pull adapter (L; split transport/mapping/activation). GATED on a signed sample contract + sandbox; the buildable part is the SSRF-safe transport (runtime DNS-rebind resolution — closes the F9.3/F9.4 form-only limitation), timeouts/body caps/pagination, cursor persisted only past a durable-accepted boundary, mapping via F9.5, bounded retry/circuit, source↔target reconciliation, sandbox replay/failure tests. Activation of a real pilot connection stays GATED. Stop: after one connector; no generic protocol engine.
Stop condition observed: yes — retry/lease/backoff/quarantine/sweeper/manual-retry delivered; NO outbound pull, NO schema change.
```

---

## F9.7 — Implement one contracted outbound pull adapter (BUILT · activation GATED)

```text
Work package: F9.7 (phase F9 — HMS integration control plane), object type CASE_SERVICE
Status: BUILT · GATED. The SSRF-safe transport + the pull orchestration + reconciliation are built and tested against an INJECTED transport (no network). Activation of a real pilot connection stays GATED on a signed sample contract + sandbox (the spec's step-1 "freeze endpoint contract/sample/auth/SLAs" + step-8 "activate only after sign-off"). No real endpoint is polled.
Commit: this feat commit (transport + adapter + inbound refactor + schema field + tests) + the paired docs commit (this note + PROGRESS row).
Proof-before-build classification: MISSING (no outbound transport / pull orchestration). Reuses the F9.4 receipt + F9.5 processor + F9.6 circuit fields + the F9.3 url-safety. Smallest change: an SSRF-safe transport, a shared receivePulled (refactor of the F9.4 create block into persistDelivery — receive() behavior byte-identical, re-verified), the pull orchestrator, and one additive circuit-counter field. No CONFLICTING path.
Files changed: src/lib/http-safe.ts (new — SSRF-safe fetch + runtime DNS-rebind resolution); src/server/services/provider-integration/inbound-delivery.service.ts (extracted persistDelivery + decideReceipt shared helpers; added receivePulled — receive() unchanged, its 11 tests re-pass); src/server/services/provider-integration/pull-adapter.service.ts (new — CaseServicePullAdapter.pollOnce); prisma/schema.prisma (+ ProviderIntegrationConnection.consecutiveFailures — additive, pushed); tests/lib/http-safe.test.ts (new — 6 pure) + tests/services/provider-integration-pull.service.test.ts (new — 5 DB); docs PROGRESS + this note.
Schema/data changes: ADDITIVE — one Int field (consecutiveFailures) for the durable circuit threshold. prisma validate + db push + generate to pnos_uat.
Behavior delivered (the split transport/mapping/activation, minus gated activation): (1) endpoint contract freeze = GATED (needs the signed sample) — NOT done; (2) SSRF-safe transport — http-safe.ts: HTTPS-only + allowlist + form check, then RUNTIME DNS resolution with an all-IP private/reserved re-check (closes the F9.3/F9.4 form-only limitation — a host that RESOLVES to a private address is blocked), a hard timeout, a response body cap, and NO redirect following; resolver + fetcher injectable for hermetic tests; (3) cursor persists only PAST the durable accepted + processed boundary — pollOnce fetches → receivePulled (durable ACCEPTED) → processes idempotently → THEN advances the cursor, so a crash before that boundary re-fetches + replays the same page (no loss, no double-apply); (4) maps via the F9.5 CASE_SERVICE processor (no direct writes); (5) bounded circuit — consecutiveFailures ≥ threshold ⇒ OPEN + circuitOpenedAt; OPEN within cooldown short-circuits; after cooldown ⇒ HALF_OPEN trial; a successful poll ⇒ CLOSED + reset; (6) reconciliation — source entry count vs the sum of per-record outcomes; (7) sandbox replay/failure tests via the injected transport; (8) pilot activation = GATED.
Authorization evidence: the pull path authenticates OUTBOUND to the partner (the safe transport is the trust boundary); receivePulled skips the caller-secret/replay-window (there is no inbound caller) but keeps scope + size + JSON + the durable create/replay/conflict identical to push — provider/branch are still server-derived from the connection.
Idempotency/concurrency evidence: one delivery per (connection, cursor) via the idempotencyKey `pull:<conn>:<cursor>`; a re-polled page REPLAYS the same delivery with NO duplicate canonical entry (proven by rewinding the cursor and re-polling). The cursor-after-boundary ordering makes a crash re-fetch safe.
Privacy/security evidence: THE runtime SSRF closure — a DNS-rebind endpoint (host resolves to 10.x/169.254.x/127.x/etc.) is blocked BEFORE the fetch and counted as a failure without advancing the cursor (proven); non-HTTPS / off-allowlist are refused before any fetch (proven — the fetcher is never called); a redirect is refused; an oversized body is rejected. No secret or raw body is logged. Residual TOCTOU (global fetch re-resolves DNS) is documented in http-safe.ts as requiring connection-pinning at pilot activation.
Money/reconciliation evidence: reconciled flag = (applied+replayed+unmatched+rejected+quarantined+retrying == source count) — proven true on a clean page; the money effects are the F9.5 processor's (idempotent).
Focused tests and results: 6 pure transport (public-resolve pass; private/empty resolve reject; DNS-rebind block; non-https/off-allowlist refused before fetch; redirect refusal; oversize) + 5 DB pull (page → durable rail → applied + cursor advanced only after the boundary; re-poll replays with no duplicate; DNS-rebind blocked + failure counted + cursor not advanced; circuit opens after the threshold then short-circuits; circuit recovers on a post-cooldown success). 11/11 pass; the transport tests self-run in the no-DB suite, the pull tests self-skip without AUTOPILOT_TEST_DB. All 6 integration suites co-run 45/45. F9.4 receive() re-verified unchanged (11/11). tsc clean; brand + currency green; full no-DB suite 1539 pass / 457 skip.
Typecheck/schema result: tsc --noEmit clean; schema additive + pushed.
Manual/visual evidence: N/A — service only; the ops view is F9.8.
Feature-flag state: GATED — no scheduler invokes pollOnce against a live connection; there is no seeded PULL connection with a real endpoint. Activation is an explicit ops + sign-off step (freeze the contract, provision the sandbox, run replay/reconciliation UAT, THEN activate one pilot connection).
Backfill/rollout impact: none (additive field; no live poll).
Known limitations / deferrals (flagged): (a) ACTIVATION GATED — the endpoint contract/sample/auth/SLA freeze + the pilot connection activation need the signed contract + sandbox (not fabricated); (b) residual DNS TOCTOU — full closure needs undici connection-pinning to the validated IP, landing at pilot activation with the concrete endpoint/TLS; (c) ONE object type (CASE_SERVICE) — other types reuse their F9.5 processor; (d) the page envelope shape ({entries, nextCursor}) is a placeholder until the real connector contract fixes it; (e) outbound partner-credential (reversible) storage — still deferred until the contracted auth scheme is known (the transport currently sends no partner auth header; that's added at activation).
Unrelated worktree changes preserved: yes — worktree contained only scratchpad/ (untracked) + the F9.7 files; the main-checkout dirty UAT files untouched.
Next allowed package: F9.8 — Build provider/admin integration operations views (M; depends F9.3–F9.6). Scoped health/delivery read models + pages: connection health, deliveries, safe errors, receipts, retries, reconciliation; status/counts/timestamps/attempt+error code/next action; manual retry/pause only with permission; link canonical result receipts; EXCLUDE raw payload/PHI/secrets/headers; alerts/runbooks. Tests: provider/branch/role; secret/raw-body leakage; action concurrency; pagination. Stop: no domain-data editing.
Stop condition observed: yes — one connector's transport + orchestration + reconciliation built and tested; NO generic protocol engine, NO real endpoint activated, NO second object type.
```

---
