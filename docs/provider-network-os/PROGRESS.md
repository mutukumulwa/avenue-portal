# Provider Network Operating System — Progress Board

**Spec:** `PROVIDER_NETWORK_OPERATING_SYSTEM_EXECUTION_PLAN.md` (repo root, 12 phases / 119 packages / 6 gates / 124 scenarios)
**Branch:** `feat/provider-network-os` — created off `feat/claims-autopilot` @ `015cb31` (2026-07-23)
**Why that base:** PNOS consumes the Claims Autopilot rail (§0.1/D5); the rail exists only on `feat/claims-autopilot` (43 commits ahead of `main`, 0 behind, at branch time).
**Isolation rule:** the Claims Autopilot engagement (its F8.2 worker provisioning + human F7.6 campaign + F8.3 k6 staging) continues on ITS branch/prod untouched. Nothing from this engagement is committed to `feat/claims-autopilot` or `main`, and the dirty UAT worktree files (uat/*, scripts/uat-*, the two root plan .md files) are NEVER staged here.

**WORKTREE ISOLATION (2026-07-23):** a concurrent claims-autopilot session shares the main checkout's HEAD. To stop interleaving, `feat/provider-network-os` now lives in a dedicated git worktree at `.claude/worktrees/pnos` (main checkout returned to `feat/claims-autopilot` for the concurrent session). **All PNOS work happens in the worktree.** `node_modules` is symlinked from the main checkout; there is no `.env` in the worktree (intentional — prisma/tests take explicit `DIRECT_URL`/`DATABASE_URL` exports, never the real `aicare_uat`). Throwaway test DB: `postgresql://postgres@127.0.0.1:54329/pnos_uat` (see `TEST_DB_HARNESS.md`).

---

## RESUME PROTOCOL (read this first after any interruption)

1. `cd .claude/worktrees/pnos` (the PNOS worktree; HEAD = `feat/provider-network-os`). If the worktree is gone, recreate: `git worktree add .claude/worktrees/pnos feat/provider-network-os` then `ln -s ../../../node_modules node_modules`. Dirty UAT files live in the MAIN checkout, not here.
2. Read this file's status board; the next package = first `NOT_STARTED` whose dependencies are `COMPLETE` (respect gates below).
3. Read `IMPLEMENTATION_LOG.md` last entry — it names "Next eligible task" and any in-flight partial state.
4. Follow the spec's §0.2 mandatory protocol + §0.3 proof-before-build for that one package. One package per unit of work. Stop at its stop condition, append the §24.5 result note, update this board, commit.
5. Quality bars every package: `npm run typecheck` green; focused tests green; `npm run brand:guard` + `npm run currency:guard` at commit boundaries; schema changes only via sanctioned `prisma db push` workflow (docs/INSTALL.md §3 — never `migrate dev/reset`).

**Statuses:** `NOT_STARTED` · `IN_PROGRESS` · `PARTIAL` · `COMPLETE` · `BLOCKED(reason)` · `GATED(human sign-off named by spec)`

---

## Gates

| Gate | Exit criterion (abbrev.) | Status |
|---|---|---|
| A (F1) | provider/permission/branch scope server-derived on every provider route/API under test | OPEN |
| B (F2) | provider clinical files private, target-authorized, scanned, no permanent public URLs | OPEN |
| C (F4) | structured request completable with independent state/SLA/audit/notification, no financial mutation | OPEN |
| D (F5) | concurrency proves one active sibling; money proves no original mutation/double pay | OPEN |
| E (F6) | provider/admin/export views match; batch/voucher/disbursement/GL conserve | OPEN |
| F (F9) | delivery receipts survive queue/app failure; first real connector passes replay/retry/mapping/reconciliation UAT | OPEN |

## F0 — Baseline and safety characterization

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F0.1 | Freeze current provider route inventory | XS | COMPLETE | `PROVIDER_ROUTE_INVENTORY.md` |
| F0.2 | Characterize provider access leakage (tests) | S | COMPLETE | `tests/api/provider-access-characterization.test.ts` (4 pass) + existing scope suites |
| F0.3 | Characterize claim and PA ownership paths | S | COMPLETE | `CLAIM_PA_OWNERSHIP_PATHS.md` |
| F0.4 | Characterize document storage and consumers | S | COMPLETE | `DOCUMENT_STORAGE_MAP.md` |
| F0.5 | Characterize settlement and money conservation | S | COMPLETE | `SETTLEMENT_MONEY_MAP.md` |
| F0.6 | Create deterministic provider test fixtures | S | COMPLETE | `tests/factories/provider-network.ts` + smoke (3 pass on DB, skip w/o) |

**Phase F0 COMPLETE** (2026-07-23) — all 6 characterization/fixture packages done. Next: **F1 Provider access foundation**, starting F1.1 (seed provider permission catalog). F1 begins actual schema+code changes (additive; flags default OFF). Gate A is the F1 exit.

## F1 — Provider access and entitlement foundation

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F1.1 | Define and seed provider permission catalog | S | COMPLETE | `prisma/seeds/provider-rbac.ts` + `tests/services/provider-rbac-catalog.test.ts` (7 pass) |
| F1.2 | Add provider branch assignments | S | COMPLETE | `ProviderUserBranchAssignment` + `provider-branch-assignment.service.ts` + test (7 pass on DB) |
| F1.3 | Build canonical ProviderAccessService | M | COMPLETE | `provider-access.service.ts` + test (10 pass); dashboard = proof route |
| F1.4 | Migrate provider layout/navigation guards | S | COMPLETE | `provider-nav-model.ts` + `ProviderNav.tsx`/`layout.tsx` migrated + test (9 pass) |
| F1.5 | Harden provider user administration/offboarding | M | COMPLETE | `provider-user-admin.service.ts` + test (6 pass) |
| F1.6 | Extend API keys: scope, expiry, branch, rotation | M | COMPLETE | `ProviderApiKey` fields + service + `provider-api-scopes.ts` + test (7 pass) |
| F1.7 | Enforce API scopes route by route (per group: a,b,c…) | S/grp | PARTIAL | (a) eligibility group DONE — `providerScopeError` + test (4 pass); remaining groups per-unit |
| F1.8 | Audit applicability data readiness | M | COMPLETE | `provider-applicability-readiness.service.ts` + script + test (8 pass) |
| F1.9 | Backfill applicability (reviewed batches) | S/batch | BUILT · GATED(prod --apply needs network-ops signed input) | `provider-applicability-backfill.service.ts` + test (3 pass) |
| F1.10 | Add entitlement shadow comparison | M | COMPLETE | `provider-entitlement-shadow.service.ts` + `ProviderEntitlementShadowSample` + test (4 pass) |
| F1.11 | Make provider browser eligibility canonical | M | BUILT · GATED(enforcement flip needs D3 sign-off; default OFF) | `provider-eligibility.service.ts` + `ProviderEligibilityCheck` + flag + eligibility page rewired + test (5 pass) |
| F1.12 | Enforce entitlement on provider claim submission | M | BUILT · GATED(bypass removed only under D3 flag; default OFF) | `provider-claim-entitlement-gate.service.ts` + claim action wired + test (3 pass) |

**Phase F1 COMPLETE (2026-07-23)** — all 12 packages built. Foundation: permission catalog + persona roles (F1.1), branch assignments (F1.2), ProviderAccessService (F1.3), permission-filtered nav (F1.4), user admin/offboarding (F1.5), scoped/expiring/rotatable API keys (F1.6), per-route scope enforcement — eligibility group (F1.7a), applicability readiness report (F1.8), reviewed backfill mechanism (F1.9), entitlement shadow comparison (F1.10), canonical eligibility (F1.11), claim-submission entitlement gate (F1.12). **Deny-by-default entitlement enforcement (F1.11/F1.12) + backfill apply (F1.9) default OFF/unrun — flipping requires the D3 network-ops/claims/security sign-off (Gate A activation).** Remaining F1.7 route groups (benefits/preauth/claims/upload/hms-batch) are separate per-group units. **Gate A:** foundation server-derived + tested; full per-route permission/branch enforcement activates via the D3 flags at the pilot gate — not flipped in code.

## F2 — Private document foundation

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F2.1 | Private doc metadata + upload-intent schema | M | COMPLETE | `Document` §7.4 fields + `DocumentUploadIntent` + `provider-document.service.ts` + test (6 pass) |
| F2.2 | Resource-level document authorization | M | COMPLETE | `ProviderDocumentService.authorizeTarget` + factory createClaim/createPreauth + test (6 pass) |
| F2.3 | Upload intent creation | S | COMPLETE | `createUploadIntent`/`resolveOpenIntent` + `DOCUMENT_UPLOAD_POLICY` + test (5 pass) |
| F2.4 | Upload finalize + content validation | M | COMPLETE | `finalizeUpload` + `document-mime.ts` (magic-byte) + staging port + test (5 pass) |
| F2.5 | Malware scan + quarantine lifecycle | M | COMPLETE | `provider-document-scan.service.ts` (lease/retry) + `isDocumentUsable` + test (5 pass) |
| F2.6 | Authorized document download | M | COMPLETE | `authorizeDownload` + `document-storage.ts` (MinIO port) + download route (proof) + test (4 pass) |
| F2.7 | Backfill legacy document metadata (per class/batch) | S/batch | COMPLETE (CLAIM class) | `provider-document-backfill.service.ts` + test (4 pass) |
| F2.8 | Migrate document consumers (per group) | S/grp | COMPLETE (provider claim-docs group) | `listTargetDocuments` + `safeScanLabel` + provider claim detail section + test (3 pass) |
| F2.9 | Remove provider public-object access | M | MECHANISM BUILT · BLOCKED(gate NOT ready) | `publicDocumentsEnabled` flag (default=legacy public) + `pnos-document-privacy-readiness.ts` + test (2 pass). Report says NOT ready: 15 direct-`fileUrl` consumers remain + un-backfilled docs. Needs remaining F2.7 batches + F2.8 groups (operator download path) + security sign-off. |

**Phase F2 status:** the private-document engine is COMPLETE and proven (F2.1–F2.8). F2.9's switch is deliberately NOT thrown — flipping it today would break the live admin/member/HR pages that still render public `fileUrl`. **Gate B remains OPEN** pending those consumer migrations + security approval.

## F3 — Canonical PA intake and provider workbench

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F3.1 | Freeze PA submission/decision contracts | S | COMPLETE | `preauth-intake/contract.ts` (v1 normalize/validate/hash) + test (14 pass) |
| F3.2 | PA intake receipt + event schema | S | COMPLETE | `PreauthIntakeReceipt` + `PreAuthorizationEvent` + `preauth-intake/events.ts` + test (7 pass) |
| F3.3 | Implement PreauthIntakeService | M | COMPLETE | `preauth-intake/service.ts` (tx-aware, receipt PROCESSING→ACCEPTED, injectable adjudicate handoff) + test (7 pass) |
| F3.4 | Migrate provider B2B PA submit | S | COMPLETE | `/api/v1/preauth` now adapts over `PreauthIntakeService` (no direct create) + api.preauth.write scope + receipt envelope; route test (8) + E2E-D04 test rewritten (7) |
| F3.5 | Migrate internal PA rails (a/b/c per rail) | S/rail | COMPLETE | **All 3 rails converged on canonical intake+pipeline.** F3.5a member (`d005b3a`, MEMBER_APP, bespoke 15k/CPT auto-approve DELETED, seam test 13). F3.5b admin UI (`c889da7`, ADMIN_PORTAL, fraud now pipeline-enforced, seam test 7). F3.5c tRPC (`8c883c5`, ADMIN_TRPC, input contract unchanged, seam test 5). `ClaimsService.createPreAuth` now called by NO rail → retire in F3.6 |
| F3.6 | Retire fragmented PA persistence | M | COMPLETE | `ClaimsService.createPreAuth` DELETED (`e4e752a`); `preAuthorization.create(` now ONLY in the canonical intake + amendment lifecycle (repo-wide guard test, 3). **CATCH first** (`eeb1d65`): F3.5b/c had dropped the PR-024 benefit-in-package throw and the pipeline's BENEFIT_CAP doesn't backstop it (skips on null config) → added a benefit-in-package gate to the canonical intake (rejects for ALL rails; new `BENEFIT_NOT_IN_PACKAGE` code; 2 mock + 1 real-DB tests). Follow-up: `FraudService.evaluatePreAuth` now dead (fraud.service.ts out of scope) |
| F3.7 | Canonical PA list read model | S | COMPLETE | `preauth-read.service.ts` `PreauthReadService.list(scope)` (`ffd576f`) — tenant + client-confinement (G2.1) + provider-scope + status; consolidates+removes tenant-only `getPreAuthorizations`; tRPC list + admin page rewired WITH confinement (**closed a real gap — PA list wasn't client-confined**). ASSUMPTION: scope inferred from board (mirrors claims read model). FLAG: PA has no branch col (provider-level scope only); tRPC getById confinement deferred to F3.10. Tests 8 |
| F3.8 | Provider PA list page | S | COMPLETE | `app/provider/preauth/page.tsx` (`7406e54`) — read-only provider PA list via F3.7 read model (providerId-scoped), server-authorized by `providerPermits(perms,"provider.preauth.read")` (new pure guard, legacy-compatible). Nav gains Pre-auth item (Care group, `preauth`→ShieldCheck). Tests +4. **NOT browser-verified** (no .env in worktree; :3000 held by main-checkout server; no seeded provider session) — read-only mirror of proven claims page, logic unit-covered. Read-only: create=F3.9, detail=F3.10 |
| F3.9 | Provider PA submission page | M | COMPLETE | `app/provider/preauth/new/{page,form,actions}` (`c0f5e04`) — submits via `PreauthIntakeService` on the **PROVIDER_PORTAL** (provider-bound) channel: facility from session (D1), member entitlement-gated inside intake (D3 flag OFF=tenant-only), `executeAutoDecision` handoff; gated by `provider.preauth.create`; ACTIVE-contract required. List page gains permission-gated "New" button + submitted banner. Action unit-tested (7). **NOT browser-verified** (env). ASSUMPTION: mirrors claims/new |
| F3.10 | Canonical PA detail read model/page | M | COMPLETE | `PreauthReadService.getById(scope,id)` (`1b1fba7`) — non-enumerating (out-of-scope→null), tenant+client+provider scope; retired `ClaimsService.getPreAuthById` (all 3 callers migrated). **Closed tRPC getById confinement gap** (was tenant-only)→NOT_FOUND; admin detail confined. New `app/provider/preauth/[id]/page.tsx` read-only detail (provider-scoped 404, event timeline via F3.2, provider-safe fields); list rows link to it. Tests +8. FLAG: provider-detail documents section deferred (F2.8 analogue). NOT browser-verified |
| F3.11 | Provider PA cancellation | M | COMPLETE | `provider/preauth/[id]/actions.ts` `cancelProviderPreauthAction` (`4997b30`) — `provider.preauth.cancel` gate + ownership via F3.10 scoped read (non-enum not-found) + pre-use state gate (SUBMITTED/UNDER_REVIEW/APPROVED) → canonical `preauthAdjudicationService.cancelPreAuth` (releases hold PR-011#3, CANCELLED, audit). `CancelPreauthButton` on detail page (reason+confirm). Action tested (6). NOT browser-verified |
| F3.12 | Provider PA amendment | M | COMPLETE | `amendProviderPreauthAction` (`55226e4`) — gate `provider.preauth.create` (no dedicated amend perm; ASSUMPTION flagged) + ownership/APPROVED-parent via F3.10 scoped read → canonical `preauthAdjudicationService.createPaAmendment` (linked PA-AMD; was UNWIRED, F3.12 first caller) → same `executeAutoDecision` pipeline. `AmendPreauthForm` on detail page (APPROVED only). Action tested (7). NOT browser-verified |
| F3.13 | PA-to-claim prefill and submit | M | COMPLETE | `fileClaimFromPreauthAction` (`735bc6c`) — gate `provider.claim.create` + ownership via F3.10 scoped read → canonical `ClaimsService.createClaimWithPreauth` (prefills from PA + submits via ClaimIntakeService `preauthConversion`, idempotent, APPROVED-only) + `PREAUTH_ATTACHED` audit → redirect to claim. `FileClaimButton` on detail (APPROVED). Action tested (4); audit-coverage green. NOT browser-verified |
| F3.14 | Authorized GOP/LOU artifact | M | COMPLETE | `gop-artifact.ts` `buildGopData` + `GopDocument`/`GopButton` (`55f860b`) — downloadable Guarantee of Payment (@react-pdf, DebitNote pattern) for an APPROVED PA on the provider-scoped detail page; pure mapper returns null unless APPROVED+gopNumber. Authorized by the page's existing gate (not a stored file → no F2 flow). Mapper tested (4). NOT browser-verified. LOU = existing admin/cross-border artifact |

**Phase F3 COMPLETE (2026-07-24, tip after `55f860b`)** — the canonical PA rail end-to-end. **Write:** contract (F3.1) + receipt/event schema (F3.2) + PreauthIntakeService (F3.3); every rail converged on it — B2B API (F3.4), member (F3.5a), admin UI (F3.5b), tRPC (F3.5c); fragmented persistence retired to a single creator (F3.6) + a benefit-in-package guard added canonically (F3.6 CATCH, restores PR-024 for all rails). **Read:** canonical scoped list (F3.7, client-confined) + detail (F3.10, non-enumerating); retired `getPreAuthorizations`/`getPreAuthById`. **Provider surface:** list (F3.8), submission (F3.9), detail (F3.10), cancellation (F3.11), amendment (F3.12), PA→claim (F3.13), GOP artifact (F3.14) — all server-authorized via `providerPermits` + provider-scoped reads. **CAVEATS:** F3.7+ built from the board's one-line descriptions (detailed plan not in-repo) with assumptions flagged per package (see IMPLEMENTATION_LOG); all provider UI is service/action-unit-tested but **NOT browser-verified** (worktree has no .env; :3000 is a foreign server) — visual check deferred to a run with env+seed or post-merge. Suite 1276 pass/191 skip; tsc+brand+currency green. **Next: F4** (information requests, inbox, SLAs, notifications) — 10 packages.

## F4 — Information requests, inbox, SLAs, notifications

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F4.1 | Information-request schema + catalogs | M | COMPLETE | `PreauthInfoRequest` model + `PreauthInfoRequestStatus` enum (`105a7a6`) — relation-less PA satellite (F3.2 pattern), UNIQUE(paId,sequence), inbox+SLA indexes, mutable OPEN→RESPONDED→ACCEPTED/REOPENED/CLOSED/CANCELLED. Pure catalog `preauth-info-request/catalog.ts` (8 item types + normalize/validate/label). Additive schema (pushed to throwaway PG; prod via build). Tests: catalog 5 + **real-DB schema 4**. ASSUMPTION: model shape inferred from the F4 lifecycle rows |
| F4.2 | Request open/cancel service | M | COMPLETE | `PreauthInfoRequestService.open/cancel` (`5787af9`) — open: catalog-normalized items + prompt + PA pre-decision gate → tx {seq + OPEN row (provider/member/client scope, 72h SLA) + INFO_REQUESTED event, safe metadata}; cancel: live→CANCELLED + INFO_REQUEST_CANCELLED event, terminal-state guards; typed `InfoRequestError`. No PA status change. Added `INFO_REQUEST_CANCELLED` event type; factory teardown clears the satellite. **Real-DB test (4)**. Actor-parameterized (perms gated by F4.4 surface) |
| F4.3 | Provider draft + explicit response submit | M | COMPLETE | `submitResponse` service + `submitInfoResponseAction` (`f366374`) — RESPONDABLE gate (OPEN/REOPENED), facility ownership via providerId scope (non-enum NOT_FOUND), tx {RESPONDED + responseNote + RESPONSE_SUBMITTED event}; action gated `provider.preauth.respond` + compliance `PREAUTH_INFO_RESPONSE_SUBMITTED` audit. **ASSUMPTION: "draft"=client-side form (F4.7); server persists only the explicit submit** (no resumable-draft field). Real-DB service (5) + action (4). Page=F4.7 |
| F4.4 | Reviewer accept/reopen/close | M | COMPLETE | `accept/reopen/close` service (shared `applyDecision`) + admin actions (`a252014`) — accept: RESPONDED→ACCEPTED+RESPONSE_ACCEPTED (sanctions F4.5); reopen: →REOPENED+RESPONSE_REOPENED (respondable again); close: live→CLOSED+INFO_REQUEST_CLOSED; typed guards. Admin actions `requireRole(CLINICAL)` + `PREAUTH_INFO_ACCEPTED/REOPENED/CLOSED` audit. Added 2 event types. Real-DB service (6) + actions (5). ASSUMPTION: reviewer=CLINICAL role (no dedicated perm). UI=F4.7 |
| F4.5 | Sanctioned claim reprocessing after acceptance | S | COMPLETE | `PreauthInfoRequestService.listReprocessable(scope)` (`f208141`) — **DECISION (user): mark-sanctioned/human-re-decides, NO auto pipeline re-run** (money spine untouched). Surfaces PAs with an ACCEPTED info request + still-undecided PA (client-confined); RESPONSE_ACCEPTED is the sanction marker; human re-adjudicates via the existing workbench. Pure read (no decide/hold). Real-DB test (7). FLAG: queue UI = F4.6/F4.7; "claim"→PA re-decision (info reqs are PA-scoped) |
| F4.6 | Canonical provider inbox projection | M | COMPLETE | `preauth-info-request/inbox.ts` `providerInboxProjection(scope)` (`d962299`) — provider's awaiting-it info requests (OPEN/REOPENED default; widenable) + PA/member context (relation-less 2-step), dueAt-asc SLA order + `overdue` flag, provider-scoped. Pure read. Real-DB test (1). FLAG: info-requests only (unionable later); UI=F4.7 |
| F4.7 | Inbox list + info-request detail pages | M | COMPLETE | Provider `/provider/inbox` (list via F4.6 projection) + `/provider/inbox/[id]` (detail + respond via F4.3) + `RespondForm` (`6193427`); new `getForProvider` (non-enum) + nav "Inbox" item (Home, `provider.preauth.read`)→Inbox icon. Nav test (+1) + real-DB service (+1). **FLAG: reviewer admin UI (open/accept/reopen/close triggers on admin PA detail) NOT built — F4.2/F4.4 actions exist but need UI wiring (follow-up).** Pages NOT browser-verified |
| F4.8 | Notification/outbox schema + dispatcher | M | COMPLETE | `NotificationOutbox` model + `NotificationOutboxService` (`f76bf95`) — **transactional outbox** (chosen: email worker unprovisioned): enqueue (idempotent dedupeKey) → dispatch via **pluggable delivery port** (IN_APP→SENT now; EMAIL→port, default SKIPPED "not provisioned"→future worker plugs in) + `listProviderNotifications`/`markRead` (provider-scoped). Additive schema (throwaway PG; prod via build). Real-DB test (4). No producer/sweeper yet (F4.9/F4.10) |
| F4.9 | Migrate provider events to dispatcher (per family) | XS/fam | COMPLETE | Info-request family → outbox (`18d9d6d`): open/reopen/cancel/accept/close each `NotificationOutboxService.enqueue` an IN_APP provider notification **in the same tx** (transactional, exactly-once) w/ href + safe metadata. Reviewer family (submitResponse) deferred. Real-DB test (+1, JSON-metadata match). Rows PENDING until F4.10 sweeper |
| F4.10 | SLA sweepers + operational queues | M | COMPLETE | `preauth-info-request/sweeper.ts` (`e0bdccb`) — `sweepOverdueInfoRequests` (idempotent: awaiting-provider + past-due → HIGH outbox reminder, deduped per request/day; no PA event, no mutation) + `overdueInfoRequests` scoped queue read. Closes dueAt(F4.1)→breach→reminder(F4.8/F4.9). Notification delivery = `NotificationOutboxService.dispatch`. Real-DB test (1). No worker provisioned (plain service for a future cron) |

**Phase F4 COMPLETE (2026-07-24, tip after `e0bdccb`)** — the clinical-information-request rail end-to-end. **Lifecycle:** schema+catalog (F4.1) → reviewer open/cancel (F4.2) → provider response (F4.3) → reviewer accept/reopen/close (F4.4) → sanctioned-reprocessing read (F4.5, *user decision: mark-sanctioned/human-re-decides, no auto pipeline re-run*). **Read/UI:** provider inbox projection (F4.6) + inbox list/detail pages with respond form (F4.7). **Notifications:** transactional outbox + pluggable dispatcher (F4.8, *email deferred — worker unprovisioned*) ← info-request family enqueues in-tx (F4.9) ← SLA sweeper reminds overdue, deduped (F4.10). **CAVEATS (flagged per package):** built from the board's one-line rows (detailed plan not in-repo); F4.1/F4.8 added ADDITIVE schema (pushed to the throwaway PG; prod applies on next build's `prisma db push`); every service/projection is REAL-DB tested on the throwaway PG, but the F4.7 pages are NOT browser-verified (worktree env). **Two gaps flagged:** (a) reviewer admin UI to invoke F4.2/F4.4 (actions exist, need wiring on the admin PA detail); (b) reviewer-directed notification family (submitResponse) deferred. Suite 1291 pass/210 skip; tsc+brand+currency green. **Next: F5** (claim withdrawal/correction/resubmission/reconsideration) — 17 packages.

## F5 — Claim withdrawal, correction, resubmission, reconsideration

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F5.1 | Characterize every claim-status consumer | M | COMPLETE | `CLAIM_STATUS_CONSUMERS.md` (`fef86a6`) — read-only inventory of all `Claim.status` consumers (23 files): transition authorities, queues, **terminal-status assumptions (highest-risk group)**, APPEAL* legacy (APPEAL_APPROVED/DECLINED UNREACHABLE), reports/exclusions, money coupling, exhaustiveness map. **Key constraint: `claim-lifecycle.ts:TRANSITIONS` (Record⇒compile-forced) + `claim-status-mutation-guard.test.ts` ALLOWLIST** gate every new status-writer. Includes an F5 threading checklist + flagged supersession-vs-mutate fork (confirm F5.2/F5.3) |
| F5.2 | Claim submission-chain schema | M | COMPLETE | Claim lineage fields (`submissionType` + `chainRootClaimId`/`supersedesClaimId`/`supersededByClaimId`/`supersededAt`) + `ClaimSubmissionType` enum (`fc063c2`) — supersession model (new linked claim, not in-place mutation). `ClaimSubmissionChainService.getChain(scope,id)` resolves the full chain from either end, scoped/non-enum. Additive schema (throwaway PG; prod via build; does NOT touch guarded `status`). Real-DB test (2). Populated by F5.4/F5.7 |
| F5.3 | Lifecycle: withdrawal/supersession terminal | M | COMPLETE | `ClaimStatus += WITHDRAWN, SUPERSEDED` (terminal) (`538e5f6`) — reachable ONLY from pre-decision states (never post-decision; DECLINED stays DECLINED). Threaded ALL money/logic consumers per F5.1: TRANSITIONS (compile-forced), report-exclusions FULLY_DECLINED, dup-detection notIn (critical for F5.10), PA-attach block, editable/decided/decidable gates, STATUSES dropdown. NO status-writer (F5.5/F5.7 write them → mutation guard untouched). Lifecycle test (+1). Additive schema |
| F5.4 | Create/backfill original chains (per batch) | S/batch | COMPLETE | Self-root every claim (`chainRootClaimId=id`) (`91517ba`): persist.ts self-roots new claims in-tx (not a status write — guard green); `backfillOriginalChains` (batched, idempotent, dry-run, tenant-scoped) + `scripts/pnos-backfill-claim-chains.ts` for pre-F5.4 rows. Real-DB test (1) + persist mock fix. One-time migration |
| F5.5 | Simple provider withdrawal service | M | COMPLETE | `claim-withdrawal/{catalog,service}.ts` — FIRST F5 status-WRITER. Entitled provider (F1.3 ctx: `provider.claim.withdraw` + provider-owned + branch) idempotently withdraws an UNDECIDED claim → terminal `WITHDRAWN` via `assertClaimTransition` + a **status-guarded CAS** (`updateMany WHERE status IN {INCURRED,RECEIVED,CAPTURED,UNDER_REVIEW}`) so a decision + a withdrawal can NEVER both take effect. ZERO money/hold mutation (pre-decision ⇒ nothing to reverse). AdjudicationLog + hash-chain audit + F4.8 outbox `CLAIM_WITHDRAWN`. Added to mutation-guard ALLOWLIST; factory teardown clears AdjudicationLog. Real-DB test (21): allowed states, decided/terminal/financial denial, authz (perm/provider/branch), invalid reason, idempotent replay, **concurrency (both commit orders + concurrent double-withdraw + withdraw-vs-decision race ×6)**, zero-money. Suite 1292 pass/234 skip; tsc+brand+currency green. **Residual flagged:** decide() human path re-reads status in-tx only when `expectedRevision` set → a true-concurrent human decide could overwrite a mid-tx withdrawal (accrual not payment; reversible) — hand to F11.2/decide-hardening |
| F5.6 | Provider withdrawal UI | S | NOT_STARTED | — |
| F5.7 | Atomic claim replacement service | L | NOT_STARTED | — |
| F5.8 | Correction form + lineage UI | M | NOT_STARTED | — |
| F5.9 | Resubmission eligibility service | S | NOT_STARTED | — |
| F5.10 | Linked post-decline resubmission | M | NOT_STARTED | — |
| F5.11 | Reconsideration schema + reason policy | M | NOT_STARTED | — |
| F5.12 | Reconsideration eligibility + submit | M | NOT_STARTED | — |
| F5.13 | Provider reconsideration form/detail | M | NOT_STARTED | — |
| F5.14 | TPA reconsideration triage + info flow | M | NOT_STARTED | — |
| F5.15 | Reconsideration maximum-delta calculation | M | NOT_STARTED | — |
| F5.16 | Execute reconsideration outcome | L | NOT_STARTED | — |
| F5.17 | Consolidate legacy appeal semantics | M | NOT_STARTED | — |

## F6 — Remittance, disbursement, payment queries

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F6.1 | Frozen remittance formula + field dictionary | S | GATED(finance sign-off) | — |
| F6.2 | Canonical ProviderRemittanceService | M | NOT_STARTED | — |
| F6.3 | Migrate admin settlement detail to service | S | NOT_STARTED | — |
| F6.4 | Provider settlement detail page | M | NOT_STARTED | — |
| F6.5 | CSV remittance export | M | NOT_STARTED | — |
| F6.6 | PDF/print remittance | M | NOT_STARTED | — |
| F6.7 | Disbursement schema/state machine | M | NOT_STARTED | — |
| F6.8 | Disbursement record/confirm service | M | NOT_STARTED | — |
| F6.9 | Settlement reconciliation job/dashboard | M | NOT_STARTED | — |
| F6.10 | Payment-query schema/service | M | NOT_STARTED | — |
| F6.11 | Provider/finance payment-query pages | M | NOT_STARTED | — |
| F6.12 | Payment-query → reconsideration handoff | S | NOT_STARTED | — |

## F7 — Contract visibility, master data, network self-service

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F7.1 | Provider-visible contract field policy | S | GATED(network/legal/security review) | — |
| F7.2 | Provider contract/rate read service | M | NOT_STARTED | — |
| F7.3 | Contracts/rates pages + safe export | M | NOT_STARTED | — |
| F7.4 | Master-data change-request schema/service | M | NOT_STARTED | — |
| F7.5 | Sensitive bank-change verification | M | NOT_STARTED | — |
| F7.6 | Profile/change pages + TPA queue | M | NOT_STARTED | — |
| F7.7 | Network improvement plan | S | NOT_STARTED | — |

## F8 — Provider performance scorecards

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F8.1 | Approve versioned metric catalog | M | GATED(multi-owner approval §8.13) | — |
| F8.2 | Extend scorecard schema + watermarks | M | NOT_STARTED | — |
| F8.3 | Deterministic scorecard refresh (per family) | M/fam | NOT_STARTED | — |
| F8.4 | Anonymized cohort benchmarks | M | NOT_STARTED | — |
| F8.5 | Provider performance dashboard | M | NOT_STARTED | — |
| F8.6 | TPA network performance workspace | M | NOT_STARTED | — |

## F9 — HMS integration control plane

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F9.1 | Inventory integration configs/secrets/paths | S | NOT_STARTED | — |
| F9.2 | Integration connection/delivery schema | M | NOT_STARTED | — |
| F9.3 | Connection + credential administration | M | NOT_STARTED | — |
| F9.4 | Durable inbound delivery receipt | M | NOT_STARTED | — |
| F9.5 | Route inbound HMS records canonically (per type) | M/type | NOT_STARTED | — |
| F9.6 | Retry, poison quarantine, sweeper | M | NOT_STARTED | — |
| F9.7 | One contracted outbound pull adapter | L | GATED(signed contract + sandbox) | — |
| F9.8 | Provider/admin integration ops views | M | NOT_STARTED | — |
| F9.9 | Cut over legacy HMS configuration/path | M | GATED(pilot sign-off) | — |

## F10 — Capitation/PMPM extension

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F10.1 | Approve arrangement/accounting spec | M | GATED(finance/legal/network/client/provider) | — |
| F10.2 | Capitation arrangement/period/adjustment schema | M | NOT_STARTED | — |
| F10.3 | Eligible-life snapshot | M | NOT_STARTED | — |
| F10.4 | Calculate/freeze capitation accrual | M | NOT_STARTED | — |
| F10.5 | Link encounters + protect carve-outs | M | NOT_STARTED | — |
| F10.6 | Capitation statement, approval, payment | L | NOT_STARTED | — |
| F10.7 | Capitation pilot: three reconciled periods | gate | GATED(pilot sign-off) | — |

## F11 — System hardening, UAT, rollout

| Pkg | Title | Size | Status | Evidence |
|---|---|---|---|---|
| F11.1 | Cross-provider/branch/role security suite | M | NOT_STARTED | — |
| F11.2 | Concurrency/idempotency suite | M | NOT_STARTED | — |
| F11.3 | Money conservation suite | M | NOT_STARTED | — |
| F11.4 | Privacy/log/export scan | M | NOT_STARTED | — |
| F11.5 | Performance/load tests | M | NOT_STARTED | — |
| F11.6 | Accessibility + responsive UAT | M | NOT_STARTED | — |
| F11.7 | Operations + incident runbooks | M | NOT_STARTED | — |
| F11.8 | Actor-based end-to-end UAT | gate | GATED(human actors + sign-off) | — |
| F11.9 | Pilot-provider activation | gate | GATED(sign-offs + runbooks) | — |
| F11.10 | GA + legacy retirement (multiple pkgs) | multi | GATED(pilot + product sign-off) | — |
