# UAT-HF-20260811-01: end-to-end remediation implementation plan

Status: implementation-ready plan; no product remediation has been applied by this document  
Prepared: 2026-08-12  
Source run: `outputs/019fe1e4-8895-7fc3-972b-3968d0231d7c/runs/UAT-HF-20260811-01/`  
Tested build: `53df0ab39815746...`  
Workspace at analysis: `ff26e3b`, branch `fix/eligibility-uat-remediation`  
Release verdict inherited from the run: **NO-GO**

This is the execution specification for remediating the human-factors UAT. It is deliberately more prescriptive than a normal engineering plan. An implementer must work in task order, meet every stated acceptance condition, and must not infer missing business policy.

---

## 1. What the run actually proved

The workbook and exported planning pack contain 456 executed steps across 114 scenarios:

| Result | Count |
|---|---:|
| Pass | 246 |
| Fail | 179 |
| Blocked | 31 |
| Total | 456 |

The register has 82 numbered rows. `DEF-002` was withdrawn, so there are **81 open product findings**: 3 S1, 28 S2, 45 S3, and 5 S4. Some summaries report 6 S4/open rows because the withdrawn row is still counted. Fix the reporting formula in the next run, but do not create product work for `DEF-002`.

The reconciliation sheet recorded 10 matches, 13 mismatches, and 1 not run. A blocked scenario is unverified scope, not a pass. Every scenario blocked by the contract crash or empty eligibility result must be rerun after the upstream repair.

### 1.1 The root causes are systemic, not 81 unrelated defects

1. **Mutations lack a durable intent/receipt contract.** A dropped response can crash the React tree, lose form state, or leave the user unable to determine whether a write committed. Client-side disabled buttons are being used where server-side idempotency and reconciliation are required.
2. **Policy is authored in one place and evaluated or displayed somewhere else.** Waiting periods, referrals, exclusions, network rules, status, and benefit usability have divergent read paths. The empty provider result currently masks the opposite future risk: returning a provider that is nearby but outside the member's package network.
3. **Database invariants are implemented only as pre-write probes.** Member identity, family ownership, member-number allocation, imports, and optimistic concurrency are race-prone. Several multi-write operations are not transactions.
4. **Governance is concentrated on terminal actions but missing on reversible-looking actions.** Package edits, archiving, lapse, reinstate, suspension, cancellation, rule deletion, and endorsement approval need the same command/event discipline.
5. **Errors are framework-shaped rather than task-shaped.** There is no route/global error boundary, no consistent correlation reference, and no user-safe distinction between validation, conflict, unavailable, unknown outcome, and forbidden.
6. **Cross-cutting UX primitives are absent.** Forms hand-roll labels, focus, dates, money, responsive tables, confirmation, empty states, and privacy disclosure, so the same defect repeats across modules.
7. **Code exists without complete wiring.** The browser outbox and sync rail exist, but portal mutations do not enqueue work. Worse, the sync service marks every non-Claim entity type `SYNCED` without applying it.

### 1.2 Adjacent high-risk problems found outside the scripted failures

These are mandatory scope because leaving them would make the visible fixes unsafe:

- Deleting a `PackageVersion` sets `TreatmentExclusionRule.packageVersionId` to null under the current relation behavior, contradicting the database owner-XOR check that requires exactly one of `packageVersionId` and `providerContractId`.
- Member import reserves a batch and then creates rows sequentially outside a transaction. A mid-loop interruption can leave a partially committed family and an unfinished batch; an identical retry can then return the unfinished batch as an idempotent success.
- `MembersService.createMember()` performs duplicate probes, max-plus-one numbering, member creation, and coverage-period creation as separate operations. Concurrent requests can duplicate identity or number allocation, or create a member without coverage history.
- `MembersService.updateMember()` has no expected version and overwrites all editable fields, including lifecycle status. It also contains a duplicated `where` key in the phone query.
- `SyncService.reconcile()` treats unsupported `PreAuth`, `CheckIn`, and `Image` operations as successfully synchronized without executing them.
- Audit and notification writes often happen after the state transaction. The member page reads `ActivityLog`, while lifecycle writes use the audit-chain model, explaining “No activity recorded” even after a transition.
- The current branch does not typecheck: code reads/writes `User.mustChangePassword`, but the Prisma client/schema does not expose the field. Five TypeScript errors were reproduced on 2026-08-12.
- The repository instruction requires reading `node_modules/next/dist/docs/` before App Router changes. That directory is absent. Installed Next is 15.5.15 while `eslint-config-next` is 16.2.2. This must be resolved before route code is edited.
- Repository-wide ESLint traverses `.claude/worktrees/**/.next/**` and does not finish in a useful time. Verification must be made deterministic before it can be a release gate.

---

## 2. Rules every implementing model must follow

1. Never edit the source UAT run or its evidence. A retest gets a new run ID and directory.
2. The findings describe the build at `53df0ab`. Before changing a file, inspect its current content and the diff from `53df0ab`; preserve or reconcile the 12 existing eligibility-remediation commits.
3. Do not work in the dirty analysis worktree. Create a clean `codex/uat-hf-remediation-*` branch/worktree from the agreed integration base. Do not discard the user's existing changes.
4. Before any `src/app/**` edit, complete `P00.02` and read the restored version-matched Next guide named by that task.
5. One task ID per commit unless a schema migration and its inseparable service change require one atomic commit. Put the task ID and covered defect IDs in the commit body.
6. A UI restriction is never the security or integrity boundary. Recheck tenant, role, current state, object version, and idempotency on the server.
7. Never retry a mutation automatically when the server may have committed it. Query the operation receipt first.
8. Never expose a conflicting member's name, member number, phone, email, or ID in a uniqueness error. Use an authorized potential-match workflow.
9. Never add a database constraint before running and archiving a read-only collision/preflight report. Backfill, rerun the report, then add the constraint.
10. Never treat a queue enqueue as the business transaction. Persist the business event/outbox row in the same database transaction; the worker delivers it later.
11. Never mark an offline operation synchronized until its canonical online command has executed or returned an idempotent replay. Unsupported entity types must be rejected, not acknowledged.
12. Never directly mutate historical package/lifecycle/rule records. Supersede or compensate them with effective-dated events.
13. Every task must add unit or integration coverage for the failure and one adjacent/race case. User-facing work also needs a browser test at 360 px, desktop, keyboard-only, and 200% zoom where applicable.
14. Verification commands are `npm run typecheck`, targeted `npx eslint <changed-files>`, and targeted `npx vitest run <test-files>`. There is no `npm test` script. Run the full `npx vitest run` only at phase gates.
15. Stop and ask for a decision only at an explicit `DEC-*` gate below. Do not invent policy.

### 2.1 Standard task completion record

For every task, add a row to a new `docs/uat-human-factors-remediation/IMPLEMENTATION_LOG.md` containing:

- task ID and defect IDs;
- commit SHA;
- migrations/backfills executed and their output artifact paths;
- tests added and exact commands/results;
- routes exercised and screenshots/evidence paths;
- feature flags changed;
- remaining risks or `none`.

---

## 3. Decisions that must be signed before dependent work

Record answers in `docs/uat-human-factors-remediation/DECISIONS.md`. The recommended default is stated so a decision-maker can accept it without redesigning the plan.

| ID | Decision | Recommended default | Blocks |
|---|---|---|---|
| DEC-01 | Operational timezone and locale | `Africa/Nairobi`, `en-UG`, currency `UGX`; store instants in UTC and coverage dates as calendar-day semantics | P01.05 onward |
| DEC-02 | Contract technical date range | accept four-digit ISO dates from 1900-01-01 through 9999-12-31; require end >= start; do not invent a narrower commercial duration | P02 |
| DEC-03 | Package/rule approval | every coverage-affecting edit creates a draft version; a different authorized checker approves; activation is effective-dated | P09 |
| DEC-04 | Provider rule precedence | specific provider EXCLUDE > specific provider INCLUDE > tier rule; ties use explicit priority; ambiguous overlapping ties are invalid | P03/P09 |
| DEC-05 | Import commit policy | prevalidate the entire file; persist a job; process each principal plus its dependants as one atomic, idempotent family unit; resume unfinished units | P06 |
| DEC-06 | XLSX import | support `.xlsx` through the same canonical row pipeline because ExcelJS is already installed; never maintain a second validator | P06.06 |
| DEC-07 | Phone identity | canonicalize Uganda phones but do not make phone globally unique; shared household numbers are allowed | P05 |
| DEC-08 | Offline capability | provider Claim, PreAuth, CheckIn, and Image may be store-and-forward after each handler is complete; admin/member enrollment and import are online-only with draft preservation | P04 |
| DEC-09 | Formula-shaped names | store the legitimate raw/display value; neutralize only when generating CSV/Excel cells; keep import source value in restricted provenance | P06.07 |
| DEC-10 | Sensitive member detail | minimum-necessary masked default; permission-gated explicit reveal is audited and expires on navigation | P11.05 |
| DEC-11 | Lockout feedback | keep account-enumeration-safe primary copy, but show wait/recovery guidance after a failed attempt and provide an audited admin unlock flow | P10.02 |
| DEC-12 | Lifecycle effective date | entered date means last covered day; ineligibility begins the following local calendar day | P07 |

---

## 4. Dependency order

```text
P00 baseline and branch reconciliation
  -> P01 shared correctness primitives
      -> P02 contract crash containment
      -> P03 entitlement/network foundation
      -> P04 reliable mutations and explicit offline behavior
      -> P05 member integrity
          -> P06 durable imports
          -> P07 lifecycle governance
              -> P08 HR, endorsements, renewal
      -> P09 package/policy governance and delivery
          -> P03.06 final eligibility parity
      -> P10 authentication/session hardening
      -> P11 accessibility, responsive, privacy, localization
  -> P12 migration, release, observability, full retest
```

`P02`, `P03.01-P03.04`, and `P04.01-P04.04` are the first S1 release blockers. No production GO is possible until **all** phases and the blocked-scenario retest are complete.

---

## P00 — Reconstruct a trustworthy baseline

### P00.01 — Freeze evidence and choose the integration base

**Fixes:** execution ambiguity; protects all findings.  
**Files:** new `BASELINE.md`, no product files.  
**Steps:**

1. Record the source run path, tested SHA `53df0ab`, current SHA, Node/npm versions, installed Next/Prisma versions, database migration head, flags, worker topology, and timezone.
2. Save `git diff --name-status 53df0ab...ff26e3b` and identify which current commits already address eligibility findings.
3. Decide whether the existing `fix/eligibility-uat-remediation` branch is the integration base or is cherry-picked into a clean branch. Do not duplicate its work.
4. Confirm the source UAT directory hash/list is unchanged.
5. List all 31 blocked steps and their upstream blocker in the baseline document.

**Acceptance:** a reviewer can reproduce the exact tested/current comparison and every blocked step has a planned retest owner.

### P00.02 — Restore the mandated Next documentation and align dependencies

**Fixes:** implementation drift risk.  
**Files:** `package.json`, lockfile, `.eslintignore` or flat ESLint config, `AGENTS.md` only if the owner changes its rule.  
**Steps:**

1. Determine why installed Next 15.5.15 lacks `node_modules/next/dist/docs/`.
2. Select one supported Next + React + `eslint-config-next` set. Do not leave Next 15 with ESLint config 16 unless official compatibility documentation explicitly permits it.
3. Reinstall from the lockfile, verify the mandated docs exist, and record the exact guide paths for Server Actions, error boundaries, caching/revalidation, forms, and route handlers.
4. Exclude `.next`, `.claude/worktrees`, `outputs`, and generated evidence from ESLint. Do not exclude `src`, `tests`, `scripts`, or `prisma`.
5. Run typecheck, a no-database Next build mode if available, and targeted lint. Archive the result.

**Stop:** if official version-matched docs cannot be restored, do not edit `src/app/**`; obtain approval to amend `AGENTS.md` with an authoritative alternative.  
**Acceptance:** dependency versions are coherent; required docs are readable; lint does not traverse generated worktrees.

### P00.03 — Reconcile and repair the existing eligibility branch

**Fixes:** prevents reimplementation and incomplete branch integration.  
**Files:** existing eligibility branch files, `prisma/schema.prisma`, generated Prisma client, existing `docs/eligibility-remediation/REMEDIATION_PLAN.md`.  
**Steps:**

1. Map commits `f97b5b7` through `ff26e3b` to tasks already completed.
2. Add the missing `User.mustChangePassword` schema field and migration if it is still the intended design, or remove all incomplete callers. The chosen path must make typecheck pass.
3. Regenerate Prisma client from the committed schema.
4. Run every eligibility/provider/authz test added by the branch plus `npm run typecheck`.
5. Update the older eligibility plan's status truthfully; do not leave “not started” on completed tasks.
6. Produce a merge/cherry-pick manifest and resolve conflicts before any new eligibility change.

**Acceptance:** the integration base typechecks and its eligibility tests pass; no current commit is silently overwritten.

### P00.04 — Make schema deployment reproducible

**Fixes:** adjacent migration drift and exclusion-owner invalidation.  
**Files:** `prisma/schema.prisma`, new reviewed migrations, existing collision/backfill scripts.  
**Steps:**

1. Reconcile Prisma migrations with the full schema on a disposable database; `migrate deploy`, seed, and drift check must agree.
2. Generate read-only reports for every proposed unique/check/FK change.
3. Change `TreatmentExclusionRule` ownership so deletion cannot produce a zero-owner row. Prefer explicit owner tables; if retaining the XOR shape, use restrictive/cascading referential actions consistent with approved history semantics and test both owner deletions.
4. Add a database XOR check in the migration and test package-version and provider-contract ownership.
5. Never apply constraints to shared environments until preflight reports are zero and signed.

**Acceptance:** fresh and upgraded disposable databases converge with zero drift; deletion tests cannot violate the XOR invariant.

### P00.05 — Close UAT governance gaps

**Fixes:** `DEF-001`.  
**Files:** new run preflight script and retest templates, not the closed run.  
**Steps:** require named business, security, operations, and accessibility owners; replace placeholders with signed values; validate actors/fixtures/flags/build SHA/timezone before step 1; fail the run if any required oracle or owner is missing.

**Acceptance:** a deliberately missing owner or oracle prevents run start with a precise message.

---

## P01 — Shared correctness primitives

### P01.01 — Extend the server-action result into a mutation envelope

**Fixes:** `DEF-034`, `DEF-065`, `DEF-068`, `DEF-070`, `DEF-071`, `DEF-075`; supports all mutations.  
**Files:** `src/lib/action-result.ts`; new `src/lib/mutation-contract.ts`; new component hook; representative action tests.  
**Contract:**

```ts
type MutationResult<T> =
  | { ok: true; data: T; operationId: string; entityRef?: string; replayed: boolean; nextAction?: string }
  | { ok: false; kind: "VALIDATION" | "CONFLICT" | "FORBIDDEN" | "UNAVAILABLE" | "UNKNOWN_OUTCOME"; message: string; fieldErrors?: Record<string,string[]>; operationId?: string; correlationId: string; retryable: boolean };
```

**Steps:**

1. Preserve compatibility with existing `ActionResult` consumers while adding the envelope.
2. Add one error mapper from domain/Prisma/network errors to safe kinds; log the original error server-side.
3. Forbid raw exception messages and PII in client responses.
4. Add a client hook that catches rejected Server Action promises, preserves the submitted snapshot, and renders `UNKNOWN_OUTCOME` rather than throwing.
5. Add an error summary with focus management and field-error links.

**Acceptance:** validation, conflict, server unavailable, and dropped-response tests render distinct states without losing inputs or crashing the tree.

### P01.02 — Add correlation and durable operation receipts

**Fixes:** `DEF-065`, `DEF-068`, `DEF-070`, `DEF-075`.  
**Files:** schema/migration; new `src/server/services/operation-receipt.service.ts`; request context; status API/page.  
**Steps:**

1. Add `OperationReceipt` with tenant, actor, operation type, client idempotency key, request hash, state (`RECEIVED/PROCESSING/SUCCEEDED/FAILED/UNKNOWN`), entity type/id, safe result code, timestamps, and unique `(tenantId, actorId, operationType, idempotencyKey)`.
2. Reserve a receipt before every high-risk command. Same key + same hash replays; same key + different hash is a conflict.
3. Update the receipt in the same transaction as the business write when possible.
4. Build an authorized status lookup by opaque operation ID. Never accept PII as the lookup key.
5. Put the correlation ID in structured logs and user-safe error copy; never expose stack traces.

**Acceptance:** simulate a response loss after commit, reopen by operation ID, and prove exactly one entity exists and its status is discoverable.

### P01.03 — Transactional audit/notification outbox

**Fixes:** `DEF-040`, `DEF-041`, `DEF-042`, `DEF-045`, `DEF-048`, `DEF-059`, `DEF-077`, `DEF-081`; adjacent post-commit gaps.  
**Files:** schema/migration; new outbox service/worker; audit projection.  
**Steps:** add immutable domain event and delivery outbox rows; write state + event + receipt in one transaction; project events into the activity log and notifications idempotently; expose failed delivery and replay operations; never roll back committed state because SMS/email is down.

**Acceptance:** kill the worker during a lifecycle command; state/event/receipt commit once, activity appears after worker restart, notification retries once without duplicate delivery.

### P01.04 — Error boundaries and recovery surfaces

**Fixes:** `DEF-050`, `DEF-065`, `DEF-070`.  
**Files:** `src/app/error.tsx`, `src/app/global-error.tsx`, route-segment `error.tsx` where local recovery is possible, `not-found.tsx`.  
**Steps:** follow restored Next docs; show safe explanation, correlation ID, retry only for safe reads, reload/dashboard/support actions; keep local forms handled by P01.01; instrument boundary events.

**Acceptance:** injected render, loader, and action-transport errors never expose framework copy or blank the entire application; support can find the log by correlation ID.

### P01.05 — Canonical Uganda date, money, phone, and country configuration

**Fixes:** `DEF-006`, `DEF-017`, `DEF-020`, `DEF-049`, `DEF-052`, `DEF-063`; supports `DEF-018`, `DEF-029`, `DEF-032`, `DEF-039`.  
**Files:** new `src/lib/locale-config.ts`, `src/lib/calendar-date.ts`, `src/lib/money.ts`; existing normalization helpers; guard script.  
**Steps:**

1. Centralize locale `en-UG`, timezone from `DEC-01`, currency `UGX`, country `UG`, calling code `+256`, and Uganda administrative labels.
2. Separate calendar dates (`YYYY-MM-DD`, no UTC shift) from instants.
3. Provide safe parse/format/readback functions; no component may call `toISOString()` on unvalidated user/DB data.
4. Provide Decimal-based money parsing that accepts only explicitly supported formats and never treats `300k` as 300.
5. Expand the guard to flag hardcoded `KES`, `+254`, Nairobi fallback coordinates, `County`, and ambiguous user-facing date formatting. Allow annotated legitimate multi-currency cases.

**Acceptance:** timezone-boundary, leap-day, invalid-date, `300k`, zero, decimal, and Uganda phone tests pass; guard has documented exemptions only.

### P01.06 — Accessible form, table, dialog, and empty-state primitives

**Fixes:** `DEF-008`, `DEF-009`, `DEF-016`, `DEF-019`, `DEF-056`, `DEF-073`, `DEF-074`, `DEF-076`, `DEF-081`, `DEF-082`.  
**Files:** new shared components and styles; component tests.  
**Steps:** create labeled field primitives (`id/htmlFor`, hint, required, `aria-invalid`, `aria-describedby`), focus-visible ring, live error summary, dirty-form guard, named icon button, typed confirmation dialog, responsive data table, mobile nav, and actionable empty state. Do not mass-rewrite screens in this task; later tasks adopt the primitives.

**Acceptance:** axe/accessibility-tree tests find named inputs/buttons; keyboard focus is always visible; dialog traps/restores focus; table scrolls at 360 px; empty state names reason and next step.

---

## P02 — Contract date crash containment and repair

### P02.01 — Validate contract dates at every write boundary

**Fixes:** `DEF-050`, `DEF-051`, `DEF-020`.  
**Files:** `src/app/(admin)/contracts/actions.ts`, contract manage actions/services, new `src/lib/validation/provider-contract.ts`, contract import path, API paths.  
**Steps:** use strict four-digit calendar-date parsing; enforce `DEC-02`, `end >= start`, and valid optional review/effective relationships; return field errors through P01.01; repeat validation in the service so imports/APIs cannot bypass it.

**Acceptance:** five/six-digit years, impossible dates, inverted ranges, malformed imports, and direct forged actions produce no write and a field-specific error.

### P02.02 — Make all contract reads non-crashing

**Fixes:** `DEF-050`.  
**Files:** contract list/detail/provider/export/projection components and services; all date renderers found by `rg 'toISOString\('`.  
**Steps:** replace direct rendering with safe calendar helpers; one bad row must render an “Invalid date—repair required” status and keep other contracts usable; disable date-dependent actions for the quarantined row; route exports through the same guard.

**Acceptance:** seed a legacy absurd/invalid date and prove list, detail, provider view, and export remain usable; error telemetry contains contract ID but the UI contains no stack.

### P02.03 — Repair legacy contract data through a governed command

**Fixes:** recovery portion of `DEF-050`, `DEF-051`.  
**Files:** new preflight/backfill script; contract repair UI/action; audit event.  
**Steps:** dry-run report invalid/suspicious rows; require authorized maker/checker repair with before/after, reason, source document, expected version; do not delete the contract; rerun report to zero.

**Acceptance:** correction preserves history and dependent applicability/tariffs; stale repair is rejected; audit shows old/new/reason/checker.

### P02.04 — Remove Kenyan currency defaults from contract creation

**Fixes:** `DEF-052`.  
**Files:** contract new page/action, `ProviderContract.currency` default/migration, seeds/fixtures.  
**Steps:** default from tenant config, not literal `KES`; require explicit currency where tenant config is absent; preflight legacy KES rows and classify legitimate multi-currency vs mistaken defaults before backfill.

**Acceptance:** Uganda tenant creates UGX contract; genuine KES contract remains KES only when explicitly selected and audited.

---

## P03 — Canonical eligibility and network resolution

### P03.01 — Deploy provider entitlement data before fail-closed evaluation

**Fixes:** `DEF-007`, `DEF-053`; incorporates existing eligibility branch.  
**Files:** existing provider-network seed/backfill/fixture scripts, readiness report, deployment flags.  
**Steps:** run seed/backfill dry-run; require every active provider used in care to have branch, active contract/version, effective INCLUDE applicability, and scoped provider users; publish counts and unresolved gaps; apply; rerun to zero; only then enable fail-closed entitlement.

**Acceptance:** known in-network and out-of-network controls return opposite results for the right reason; no active provider user is unprovisioned.

### P03.02 — Define one eligibility decision contract

**Fixes:** `DEF-053`, `DEF-058`, `DEF-060`, `DEF-061`, `DEF-062`.  
**Files:** `src/server/services/provider-eligibility.service.ts`, eligibility evaluator/reason catalog, shared DTO tests.  
**Result must include:** verdict, stable reason code, member-safe explanation, operator guidance, evaluated service date, data-as-of time, valid-until, package/version, provider/network decision, cover status, benefit decision, waiting eligible date, referral requirement, remaining limit when authorized, request/correlation ID.

**Steps:** collapse privacy-sensitive `NOT_FOUND`/`NOT_ENTITLED` outward where required; retain internal reason in protected audit; distinguish system unavailable from true ineligibility; never return a generic empty set for all causes.

**Acceptance:** table-driven tests cover active, future, lapsed, suspended, excluded, out-of-network, waiting, referral, exhausted, stale, and unavailable states.

### P03.03 — Make every eligibility consumer use the canonical evaluator

**Fixes:** `DEF-007`, `DEF-053`, `DEF-058`, `DEF-060`, `DEF-061`.  
**Files:** provider portal/API, member benefits/facilities, claim/preauth gates, SMS query if retained.  
**Steps:** remove local status/network approximations; pass provider, branch, benefit/service context, and service date; enforce the result server-side before protected operations; map safe copy by audience.

**Acceptance:** the same fixture/date returns the same reason code in provider UI, API, claim/preauth gate, and member surface; audience copy differs only where privacy requires it.

### P03.04 — Correct Find Care geolocation and network filtering

**Fixes:** `DEF-007`, `DEF-033`, `DEF-049`.  
**Files:** `src/app/member/facilities/**`, provider nearby service, member location/address model from P05.  
**Steps:** remove Nairobi fallback; explicitly handle permission denied/unavailable; provide manual Uganda location search; require valid coordinates; filter nearby results through effective package/provider rules from P03/P09; show distance and network tier; make no-result distinguish location, range, missing coordinates, and no in-network facility.

**Acceptance:** Kampala control finds the expected in-network facility; denied geolocation does not silently move the member to Nairobi; an equally nearby excluded provider is absent.

### P03.05 — Remove member identifiers from URLs and examples

**Fixes:** `DEF-057`, `DEF-079`.  
**Files:** provider eligibility form/page, logs/analytics filters.  
**Steps:** submit via Server Action/POST state; do not reflect member number in query string/history/referrer; use tenant-configured generic example, never `NWSC-2026-00001`; redact structured logs.

**Acceptance:** browser history, URL, server access log, analytics event, and referrer contain no member/card number.

### P03.06 — Final policy parity gate

**Depends on:** P09.  
Run the full canonical eligibility table after package rules are versioned. Release fails if authoring projection, member display, provider decision, and claim/preauth enforcement disagree.

---

## P04 — Reliable online mutations and honest offline behavior

### P04.01 — Convert critical forms to the mutation envelope

**Fixes:** `DEF-034`, `DEF-065`, `DEF-070`, `DEF-071`, `DEF-075`.  
**Files:** member create, import confirm, lifecycle, package, endorsement, contract forms/actions first; then inventory all remaining Server Actions.  
**Steps:** stable client idempotency key per draft; P01.01 result rendering; pending state; safe local snapshot; success reference and next action; local catch for transport rejection; status lookup before retry.

**Acceptance:** double-click, refresh, tab close, 500-before-write, and response-loss-after-write tests produce zero or one write—never two—and always yield a discoverable outcome.

### P04.02 — Add bounded draft persistence for online-only forms

**Fixes:** `DEF-008`, `DEF-016`, `DEF-071`.  
**Files:** new draft store; member/client/package/contract/import metadata forms.  
**Steps:** store only approved non-secret fields, keyed by tenant/user/form/draft; encrypt sensitive drafts or keep session-memory only; show saved timestamp; restore explicitly; clear on success/logout/expiry; add dirty-navigation confirmation.

**Acceptance:** offline/refresh preserves the approved fields; another user on the same browser cannot see them; success and logout purge them.

### P04.03 — Make offline authentication state explicit

**Fixes:** `DEF-003`, `DEF-066`.  
**Files:** `public/sw.js`, PWA registration/layout/banner.  
**Steps:** never serve cached `/login` as if online; show a dedicated offline shell; display persistent connection and freshness state; distinguish “cached read,” “queued,” and “online”; exclude admin routes from offline mutation claims.

**Acceptance:** airplane mode at login shows “Internet required to sign in”; cached protected data is clearly marked with as-of time and cannot masquerade as a live session.

### P04.04 — Finish or reject every sync entity type

**Fixes:** `DEF-067`; adjacent silent data loss.  
**Files:** `src/lib/offline/outbox.ts`, `src/server/services/sync.service.ts`, `/api/v1/sync`, provider Claim/PreAuth/CheckIn/Image forms.  
**Steps:**

1. Enforce `DEC-08` allowlist at client and server.
2. Until a handler exists, return `REJECTED_UNSUPPORTED`; remove the default `SYNCED` branch.
3. For each allowed type, enqueue from the actual form with versioned payload, operation key, device/user/tenant ownership, captured time, and policy snapshot ID.
4. Execute the canonical online service on reconcile; return per-operation accepted/replayed/conflict/rejected state.
5. Encrypt local payloads, purge on logout/revocation/expiry, and limit storage/retention.
6. Add an Outbox page showing pending/conflict/rejected/synced items and safe remediation.

**Acceptance:** each of four types has an end-to-end offline capture/reconnect test; an unsupported fake type is rejected and remains visible, never marked synced.

### P04.05 — Add freshness and conflict rules

**Fixes:** `DEF-062`, `DEF-066`, `DEF-067`, `DEF-077`.  
**Steps:** show snapshot as-of/valid-until; revalidate eligibility/balances/current entity version on reconnect; never silently overwrite; route clinical/financial conflict to review; expose provisional-versus-final delta.

**Acceptance:** stale offline eligibility cannot authorize silently; two-device edits create an explicit conflict and preserve both submitted/current values.

---

## P05 — Member identity, enrollment, search, and profile integrity

### P05.01 — Add canonical identity and concurrency fields

**Fixes:** `DEF-026`, `DEF-027`, `DEF-028`, `DEF-029`, `DEF-030`, `DEF-031`, `DEF-043`, `DEF-064`, `DEF-077`, `DEF-078`.  
**Files:** Member schema/migration, normalization service, preflight/backfill scripts.  
**Steps:** add `nationalIdNormalized`, `phoneNormalized`, `emailNormalized`, `searchNameNormalized`, and integer `version`; backfill with reports; unique tenant + non-null national ID only; do not unique phone/name+DOB; add canonical search indexes; add dependant/principal database checks where expressible.

**Acceptance:** preflight is zero; national-ID variants conflict atomically; shared phones and twins are allowed; malformed phone is rejected instead of stored raw.

### P05.02 — Replace max-plus-one member numbering

**Fixes:** adjacent race behind `DEF-034`, `DEF-057`.  
**Files:** `src/server/services/member-numbering.service.ts`, schema/migration.  
**Steps:** create an atomic counter per tenant/client prefix; allocate inside the enrollment transaction; preserve formatted prefix/year semantics; detect existing max during backfill; retry serialization conflicts.

**Acceptance:** 50 parallel enrollments receive 50 unique monotonic numbers with no P2002 and no gaps caused by rolled-back transactions unless documented.

### P05.03 — Make enrollment one idempotent transaction

**Fixes:** `DEF-031`, `DEF-034`, `DEF-075`; adjacent partial coverage.  
**Files:** `MembersService`, member create action/form, operation receipt.  
**Steps:** validate group/package/version/current state; require `principalId` for every non-principal and verify same group; reserve operation; allocate number; create member and coverage period; write event/receipt—all in one transaction using the transaction client throughout.

**Acceptance:** forced failure after member insert rolls everything back; double-submit creates one member/period/event and returns the same reference.

### P05.04 — Centralize privacy-safe duplicate handling

**Fixes:** `DEF-026`, `DEF-027`, `DEF-028`, `DEF-078`.  
**Files:** new identity-match service and authorized review route; manual/HR/import callers.  
**Steps:** exact national ID is a hard conflict; phone/email/name+DOB are candidate warnings according to signed policy; ordinary error says only that details may match an existing record; authorized reviewers open an audited potential-match screen with minimum necessary data; use identical rules in all channels.

**Acceptance:** unprivileged responses never disclose the existing person; authorized review is tenant/client scoped and audited; concurrent exact-ID creation is stopped by DB constraint.

### P05.05 — Remove lifecycle status from generic profile editing

**Fixes:** `DEF-041`, `DEF-043`, `DEF-077`.  
**Files:** member edit form/action/service, P07 commands.  
**Steps:** profile edit accepts demographic fields only and requires expected `version`; conditional update `where id/tenant/version`; stale result displays submitted/current comparison; lifecycle transitions route only through P07.

**Acceptance:** stale profile save changes nothing; profile form cannot suspend/lapse/reinstate even with forged form data.

### P05.06 — Correct member inputs, address, and date semantics

**Fixes:** `DEF-006`, `DEF-008`, `DEF-029`, `DEF-032`, `DEF-033`, `DEF-039`, `DEF-074`, `DEF-075`.  
**Files:** member create/edit/dependent forms and schemas; address model.  
**Steps:** adopt P01.06 labels/focus/errors/cancel/dirty guard; Uganda phone hint; calendar-date parsing; explicit cover-start readback and newborn exact birth date; capture structured Uganda address plus optional consented coordinates; return member reference and next actions.

**Acceptance:** leap day and timezone-edge dates round-trip exactly; newborn cover starts on exact DOB under rule; address is available to authorized workflows; cancel creates no write.

### P05.07 — Canonical multi-identifier search

**Fixes:** `DEF-030`, `DEF-064`.  
**Files:** `src/lib/member-search.ts`, admin/provider search routes, indexes.  
**Steps:** normalize `+256/256/0` phones, punctuation/case in card/member numbers, national ID spaces/case, and legal-name whitespace; retain tenant/client/provider entitlement scope before search; cap results and prevent enumeration.

**Acceptance:** equivalent formats find the same authorized record; out-of-scope records never change result shape or timing materially.

---

## P06 — Durable bulk import

### P06.01 — Extract one shared row validator/preflight

**Fixes:** `DEF-035`, `DEF-069`.  
**Files:** new import domain module; current parse/confirm actions.  
**Steps:** parse source into typed raw rows; run field, date, normalization, identity, group, principal, package, and DB conflict checks in preview; rerun the same function at commit against current DB; never trust posted `error` flags.

**Acceptance:** every row predicted accepted/rejected remains so at commit unless explicitly reported as a stale preflight conflict.

### P06.02 — Introduce a durable import job and row/family-unit ledger

**Fixes:** `DEF-036`, `DEF-068`; adjacent partial batch.  
**Files:** ImportBatch expansion, new ImportRow/ImportUnit schema, service/worker.  
**States:** `UPLOADED/PREFLIGHTED/QUEUED/PROCESSING/SUCCEEDED/PARTIAL/FAILED/UNKNOWN`; rows/units have terminal accepted/rejected/conflict states.

**Steps:** assign public opaque batch reference; persist source hash, uploader, target group, counts, statuses, timestamps, failure code; persist every row's normalized input and preflight result; never infer completion from non-null batch existence.

**Acceptance:** batch status/counts can be reconstructed solely from row/unit ledger; a reserved-but-unprocessed batch is visibly queued, never “already imported.”

### P06.03 — Commit atomically per family unit and resume safely

**Fixes:** `DEF-031`, `DEF-034`, `DEF-068`; adjacent orphan/partial writes.  
**Steps:** group principal plus dependants; assign unit idempotency key; in one transaction enroll principal/dependants via transaction-aware member service and finalize unit rows; worker leases units; retry only nonterminal units; finalize aggregate status after all units terminal.

**Acceptance:** kill process after principal creation and prove rollback or same-unit recovery produces a complete family exactly once; other completed units remain discoverable.

### P06.04 — Build history, status, recovery, and reject download UI

**Fixes:** `DEF-036`, `DEF-068`, `DEF-070`, `DEF-075`, `DEF-082`.  
**Files:** `/members/imports`, `/members/imports/[batchRef]`, import client.  
**Steps:** show batch ref immediately; poll/status refresh; counts and row reasons; resume/retry only safe failed units; download injection-safe rejects; empty states explain prerequisites.

**Acceptance:** dropped confirm response is recovered through history using batch reference/source hash; no re-upload is needed to learn outcome.

### P06.05 — Restore native and accessible form validation

**Fixes:** `DEF-069`, `DEF-074`.  
**Steps:** associate labels; avoid custom submission that bypasses `required`; programmatically focus the first invalid field; render parser/server errors in live summary; validate file type/size before parse and again server-side.

**Acceptance:** missing group/file is blocked with named field errors via keyboard and screen reader.

### P06.06 — Route CSV and XLSX through the same pipeline

**Fixes:** `DEF-037`.  
**Depends on:** `DEC-06`.  
Use ExcelJS only for cell extraction; reject formulas/macros/merged ambiguous headers according to policy; preserve leading zeros and Unicode; hand identical strings to P06.01.

**Acceptance:** equivalent CSV/XLSX produce identical normalized row hashes and verdicts.

### P06.07 — Separate stored names from export escaping

**Fixes:** `DEF-038`.  
**Depends on:** `DEC-09`.  
Store legitimate display value unchanged; keep restricted source provenance; apply apostrophe/escaping only while generating spreadsheet output; escape every exported cell, not just names.

**Acceptance:** formula-shaped legitimate name displays faithfully in the portal and exports as a non-executable cell.

---

## P07 — Governed member lifecycle

### P07.01 — Define the lifecycle transition command and policy table

**Fixes:** `DEF-040`, `DEF-041`, `DEF-042`, `DEF-043`, `DEF-058`, `DEF-059`, `DEF-077`, `DEF-081`.  
**Files:** new lifecycle policy/command types; replace fragmented direct actions.  
**Command fields:** member, from status/version, to status, reason code/note, last covered day, requested/effective time, maker, checker/approval where needed, idempotency key.

**Steps:** enumerate allowed transitions and roles; enforce `DEC-12`; require consequences preview; encode terminal/reversible rules; use compensating correction/withdrawal events, never history edit.

**Acceptance:** table-driven test covers every from/to pair, including forbidden same-form and stale transitions.

### P07.02 — Execute state, coverage, financial effects, event, and receipt atomically

**Fixes:** same as P07.01 plus missing audit.  
**Files:** `lifecycle.service.ts`, coverage/hold/refund collaborators made transaction-aware.  
**Steps:** pass the same transaction client through all writes; conditional version update; close/open coverage periods with exact day semantics; calculate consequences before write; persist event/outbox/receipt; deliver external notifications later.

**Acceptance:** injected failure at each write boundary rolls back the entire command; worker failure does not lose event/notification.

### P07.03 — Replace destructive micro-forms with preview and named confirmation

**Fixes:** `DEF-040`, `DEF-048`, `DEF-059`, `DEF-081`.  
**Files:** member lifecycle UI/actions.  
**Steps:** one action menu; preview target member, current→new state, last covered day, reason, dependants, holds/refund consequences; require explicit confirmation; no default Enter target; show operation/member reference and notification status.

**Acceptance:** Enter in a reason/date field cannot trigger transition; cancel changes nothing; confirm creates one event and clear receipt.

### P07.04 — Add correction and withdrawal as compensating events

**Fixes:** `DEF-042`.  
**Steps:** authorized user opens original lifecycle event, supplies reason/source/effective correction; different checker when policy requires; append reversal/correction; recalculate coverage and dependent effects idempotently; retain original.

**Acceptance:** history shows original and correction chain; point-in-time eligibility uses corrected effective timeline.

### P07.05 — Build a canonical lifecycle activity projection

**Fixes:** `DEF-040`, `DEF-045`, `DEF-048`.  
**Steps:** project domain events into the member activity UI; show human actor name/role, effective date, reason, reference, approval, and delivery status; backfill legacy audit-chain lifecycle events where safe.

**Acceptance:** every lifecycle command appears once in member activity after projection; a missing projection is observable/replayable.

### P07.06 — Enforce status-aware actions and freshness

**Fixes:** `DEF-043`, `DEF-058`, `DEF-062`, `DEF-077`.  
**Files:** member detail/profile tabs/family/benefit actions.  
**Steps:** server checks current status/version on every action; hide or explain unavailable claim/preauth/endorsement/add-dependent actions; mark limits “not currently usable”; refresh on focus and after events; stale tab displays conflict and current state.

**Acceptance:** lapsed member cannot invoke protected action through UI or forged request; stale tab cannot restore old state.

---

## P08 — HR leavers, endorsements, and renewal

### P08.01 — Add a first-class HR leaver/end-cover request

**Fixes:** `DEF-004`, `DEF-039`.  
**Files:** HR roster/endorsement routes and forms.  
**Steps:** separate “Add member/dependant” from “Report employee leaving”; client/group-scoped member selector; last covered day with readback; reason/source documents; cancel/withdraw before approval; create governed deletion/end-cover endorsement.

**Acceptance:** HR can submit a leaver without route knowledge; request has member, group, last covered day, reason, source, maker, and reference; no cover changes before approval.

### P08.02 — Unify the two endorsement engines and action sets

**Fixes:** `DEF-005`, `DEF-045`, `DEF-046`, `DEF-047`.  
**Files:** endorsement detail `page.tsx`, `actions.ts`, `amendment-actions.ts`, endorsement/amendment services.  
**Steps:** select one canonical state machine/service; route all actions through it; remove duplicate Approve/Reject controls; use business labels; every failure returns P01.01 state; maker cannot approve own request; require current version.

**Acceptance:** exactly one control per valid transition; maker self-approval and stale approval are rejected visibly with no write.

### P08.03 — Capture and validate source/document control at creation

**Fixes:** `DEF-046`, `DEF-047`.  
**Steps:** creation form requires approved source reference or attached document for governed types; show document status at review; do not wait until approval to discover missing E-015 data; show maker name and object version instead of opaque ID.

**Acceptance:** incomplete request cannot enter an unapprovable state; valid request proceeds through checker to apply once.

### P08.04 — Make endorsement numbering atomic and outcomes legible

**Fixes:** `DEF-048`; adjacent collision.  
Use atomic counter, operation receipt, event/outbox, result reference, and member/HR notifications. Approval and application must be explicit states; if separate, UI must not label approval “Approve & Apply.”

**Acceptance:** parallel creation has unique numbers; dropped approval response is recoverable; notification retry does not reapply change.

### P08.05 — Expose a governed scheme renewal path

**Fixes:** `DEF-044`.  
**Files:** group detail/actions, existing renewal service/jobs, renewal review UI.  
**Steps:** reachable launch; eligibility window; package-version carry-forward preview; effective dates; member exceptions; maker/checker approval; notification/outbox; pin renewed groups/members to approved version.

**Acceptance:** renewal is discoverable from scheme detail and produces one approved effective-dated version without mutating prior-period truth.

---

## P09 — Package and policy governance, precedence, and delivery

### P09.01 — Replace direct active edits with draft/approval/activation

**Fixes:** `DEF-024`, `DEF-025`, `DEF-048`.  
**Files:** package builder/edit actions/forms, schema/status/state service, approval queue.  
**Steps:** new package/version starts `DRAFT`; every coverage change creates a new draft; different checker approves; scheduled activation updates current pointer atomically; schemes/members remain pinned until governed migration; success names draft/version/reference.

**Acceptance:** maker save cannot change live member eligibility; approval activates exactly one version at effective time; history is immutable.

### P09.02 — Build safe money/percentage inputs

**Fixes:** `DEF-018`, `DEF-021`.  
**Files:** package builder/edit, co-contribution validation/actions, P01 money field.  
**Steps:** use text input with explicit supported grammar and formatted readback; reject suffixes unless intentionally implemented; use nullish—not truthy—checks so 0% is valid; Decimal server validation; accessible names.

**Acceptance:** `300k` never becomes 300; `300000` reads back `UGX 300,000`; 0%, 100%, boundaries, decimal and invalid formats round-trip correctly.

### P09.03 — Model waiting periods with a basis and eligible date

**Fixes:** `DEF-022`, `DEF-061`.  
**Steps:** store duration + basis event (`COVER_START/DEPENDANT_JOIN/REINSTATEMENT/OTHER_APPROVED`) and exception; evaluator calculates eligible calendar date; authoring preview and member/provider copy show it.

**Acceptance:** same rule/date yields identical eligible date in package, member, provider, and claim/preauth tests.

### P09.04 — Version and retire exclusions/referrals/provider rules

**Fixes:** `DEF-023`, `DEF-054`, `DEF-055`, `DEF-056`, `DEF-060`.  
**Files:** package rule actions/managers/schema; provider eligibility rule model; P00 XOR migration.  
**Steps:** rules belong to draft version; no hard delete—retire with reason/effectiveTo; icon controls have accessible names and confirmation; copy-forward only through version service; detail read model includes all effective rules.

**Acceptance:** historical version retains exact rules; removing a rule creates a new draft/retirement; detail/member/provider projections agree.

### P09.05 — Implement and validate deterministic rule precedence

**Fixes:** `DEF-054`, `DEF-055`.  
**Depends on:** `DEC-04`.  
**Steps:** add explicit priority/specificity/effective window; central overlap detector; reject ambiguous same-precedence overlaps for provider and co-contribution rules; evaluator returns winning rule ID/reason in protected trace.

**Acceptance:** conflict matrix tests every include/exclude, provider/tier, overlapping date, and co-contribution case; no order depends on database return order.

### P09.06 — Archive through dependency impact and migration control

**Fixes:** `DEF-025`.  
**Steps:** archive command lists active groups/members/current pointers/pending claims; block while active dependencies remain or require approved migration plan; confirmation names package/version/impact; event/receipt/audit.

**Acceptance:** in-use package cannot be silently archived; cancelled confirmation writes nothing; completed controlled migration leaves no dangling current reference.

### P09.07 — Deliver policy copy to all required audiences

**Fixes:** `DEF-023`, `DEF-060`, `DEF-061`, `DEF-082`.  
**Files:** package detail, member benefits, provider eligibility, claim/preauth decision.  
**Steps:** one effective policy read model; internal source clauses never leak; member-safe explanation shows referral/waiting/exclusion and remedy; empty states name missing prerequisite and owner.

**Acceptance:** seeded policy appears consistently on authoring detail, member benefits, provider decision, and enforcement trace.

---

## P10 — Authentication and session hardening

### P10.01 — Split password and TOTP into explicit challenge steps

**Fixes:** `DEF-011`, `DEF-012`, `DEF-014`.  
**Files:** auth credential flow, login page, challenge model/service.  
**Steps:** password step returns a short-lived opaque challenge, never account details; render TOTP only when required; clear code on failure; `autocomplete="one-time-code"`; store no TOTP in durable client state; retain enumeration-safe external errors.

**Acceptance:** users without TOTP never see an unexplained optional field; required user cannot bypass step; back/refresh does not retain code.

### P10.02 — Add safe lockout guidance and recovery

**Fixes:** `DEF-010`.  
**Depends on:** `DEC-11`.  
**Steps:** make credential service return internal typed failure without revealing existence; UI uses safe wait/reset/support guidance; audit lock/unlock; admin screen shows state and provides permission-gated unlock with reason; prevent concurrent lost increments with atomic update/transaction.

**Acceptance:** locked and nonexistent accounts do not become enumerable; legitimate locked user has a documented recovery; parallel bad attempts enforce policy reliably.

### P10.03 — Prevent TOTP replay

**Fixes:** `DEF-013`.  
**Files:** User or challenge schema, `totp.ts`, authorization transaction.  
**Steps:** verifier returns matched counter; atomically require counter > last accepted counter for that user/challenge; store acceptance with login/session creation; account for allowed clock window without accepting the same step twice.

**Acceptance:** first current code succeeds, immediate replay fails, next time-step succeeds, parallel same-code attempts yield exactly one session.

### P10.04 — Enforce true idle and absolute session limits

**Fixes:** `DEF-015`.  
**Files:** session policy/auth callbacks, server guard, client warning.  
**Steps:** persist/server-validate last meaningful user activity; background polling does not count; add absolute max; warn before expiry; protected action rechecks and returns expired while preserving draft; fail closed if authoritative session state cannot be verified for privileged write.

**Acceptance:** fake-clock test expires at policy threshold with no user activity; polling cannot extend it; active user rolls idle window only to absolute max; expired submit preserves draft and requires reauth.

---

## P11 — Accessibility, responsive behavior, privacy, localization, and copy

### P11.01 — Migrate tested forms to accessible primitives

**Fixes:** `DEF-019`, `DEF-073`, `DEF-074`.  
**Order:** package builder, member create/edit, import, client/group forms, contracts, lifecycle, endorsement, provider eligibility.  
**Acceptance per form:** every control has computed name; required/error relationships are announced; focus ring meets contrast; error summary moves focus and links to field; keyboard completes workflow.

### P11.02 — Add responsive table/nav behavior

**Fixes:** `DEF-009`, `DEF-072`, `DEF-076`.  
**Files:** shared table/nav then member/client/package/contract/provider tables.  
**Steps:** ensure `min-w-0/max-w-full`, real horizontal scroll port, scroll hint, sticky identity/action or mobile cards, responsive member nav; no page-level horizontal trap.

**Acceptance:** 360 px and 200% zoom preserve every row/action through keyboard/touch; member nav has no clipped unreachable item.

### P11.03 — Standardize dates, currency, country, and terminology

**Fixes:** `DEF-005`, `DEF-006`, `DEF-017`, `DEF-020`, `DEF-049`, `DEF-052`, `DEF-063`.  
**Steps:** replace ambiguous numeric output with `11 Aug 2026` or explicitly labeled input/readback; show timezone when an instant matters; use UGX consistently; Uganda labels/phones/locations; choose one user-facing term for endorsement/amendment and keep technical aliases internal.

**Acceptance:** guard finds no unapproved Kenyan/default/ambiguous strings; cross-surface snapshot shows one date/currency vocabulary.

### P11.04 — Add precise empty, success, failure, and offline copy

**Fixes:** `DEF-003`, `DEF-010`, `DEF-011`, `DEF-045`, `DEF-060`, `DEF-061`, `DEF-066`, `DEF-068`, `DEF-070`, `DEF-075`, `DEF-082`.  
**Copy rule:** state what happened, whether data may have committed, safe next action, privacy-safe reference, and freshness. Never say “no member” for system unavailable.

**Acceptance:** content test/copy oracle covers every mutation result kind and eligibility reason without raw exception/PII.

### P11.05 — Implement minimum-necessary member detail

**Fixes:** `DEF-080`.  
**Depends on:** `DEC-10`.  
**Files:** member profile/family tree, authorization/audit.  
**Steps:** role-specific view model; mask ID/phone and collapse household/minors by default; explicit permission-gated reveal with purpose; log reveal; revoke on navigation/session expiry; never serialize hidden full data into client HTML.

**Acceptance:** default operator DOM/network payload lacks full sensitive fields; authorized reveal is audited; unauthorized forged request fails.

### P11.06 — Make destructive icon actions explicit

**Fixes:** `DEF-056`, `DEF-081`.  
Adopt named buttons/dialogs everywhere found by the icon-button inventory, including package rules and lifecycle micro-forms. Confirmation states object, consequence, effective date, and reason.

**Acceptance:** accessibility tree has no unnamed trash/action button; Enter never activates an unintended destructive default.

---

## P12 — Observability, migration, release, and retest

### P12.01 — Add service-level observability and support lookup

**Fixes:** `DEF-065`, `DEF-068`, `DEF-070`.  
**Metrics:** mutation unknown outcomes/replays/conflicts, import state age, outbox backlog/conflicts, eligibility reasons/unavailable, invalid legacy dates, stale writes, lifecycle projection lag, notification failures, error-boundary events.  
**Acceptance:** alert thresholds and runbook link to operation/correlation lookup without database console access.

### P12.02 — Execute data migrations in safe order

1. Deploy additive schema and dual-read compatibility.
2. Run dry-run reports for identity, numbering, invalid dates, orphan dependants, unfinished imports, package owner XOR, provider entitlement completeness, currency defaults, and audit projection gaps.
3. Obtain signed reports; backfill in bounded idempotent batches.
4. Deploy dual-write/services and observe.
5. Add constraints and switch reads.
6. Remove old paths only after parity window.

**Acceptance:** every script is dry-run by default, idempotent, resumable, tenant-scoped, and emits before/after counts; rollback does not require deleting evidence/history.

### P12.03 — Feature-flag and deploy by dependency

**Order:** foundations/error containment → data backfills → contract guard → entitlement shadow mode → member/import/lifecycle → package policy → auth/UX → fail-closed flags. Use separate flags for entitlement enforcement, new imports, lifecycle commands, offline sync types, package approvals, and privacy reveal. Do not use one global flag.

**Acceptance:** rollback disables new entry paths while existing receipts/jobs/events remain readable and finish safely.

### P12.04 — Automated verification gate

Run, in order:

1. `npm run typecheck`.
2. Targeted ESLint for changed files, then repository `npm run lint` after P00.02 exclusions.
3. Targeted Vitest per task, then full `npx vitest run`.
4. Fresh database migrate/seed/drift test.
5. Upgrade database preflight/backfill/migrate test.
6. Browser tests on Chromium plus one non-Chromium engine for date/input behavior.
7. Network fault tests: before-write failure, after-write response loss, worker stop/restart, duplicate replay, stale tab, offline reconnect.
8. Accessibility checks: computed names, keyboard, focus, 360 px, 200% zoom, reduced motion.

**Acceptance:** zero unexplained failure; flaky or skipped critical test is a release failure.

### P12.05 — Re-execute the human-factors run

Create a new run, copy the signed oracle—not old outcomes—and execute all 456 steps. Rerun all 31 blocked steps. Add targeted scenarios for adjacent findings: concurrent member allocation, partial import kill/recovery, unsupported sync type, package deletion/XOR, projection worker outage, rule precedence overlap, and current-branch migration upgrade.

**GO criteria:**

- 456/456 terminal with zero blocked/not-run;
- zero open S1/S2;
- every S3/S4 either fixed and passed or explicitly accepted by named business/security/accessibility owner with expiry;
- reconciliation all Match;
- operation receipts prove one intent → at most one business effect;
- migration and rollback rehearsal passed;
- support/operations sign-off on dashboards and runbooks;
- closed run and evidence remain immutable.

---

## 5. Defect-to-task coverage matrix

Every open finding appears once below as its primary owner. Supporting tasks may also name it.

| Primary task | Defects |
|---|---|
| P00.05 | DEF-001 |
| P04.03 | DEF-003, DEF-066 |
| P08.01 | DEF-004, DEF-039 |
| P08.02 / P11.03 | DEF-005 |
| P01.05 / P11.03 | DEF-006, DEF-017, DEF-020, DEF-049, DEF-052, DEF-063 |
| P03.01-P03.04 | DEF-007, DEF-053 |
| P04.02 / P01.06 | DEF-008, DEF-016, DEF-071 |
| P11.02 | DEF-009, DEF-072, DEF-076 |
| P10.02 | DEF-010 |
| P10.01 | DEF-011, DEF-012, DEF-014 |
| P10.03 | DEF-013 |
| P10.04 | DEF-015 |
| P09.02 | DEF-018, DEF-021 |
| P11.01 | DEF-019, DEF-073, DEF-074 |
| P09.03 | DEF-022 |
| P09.04 / P09.07 | DEF-023, DEF-056, DEF-060, DEF-061 |
| P09.01 | DEF-024 |
| P09.06 | DEF-025 |
| P05.01 / P05.04 | DEF-026, DEF-027, DEF-028, DEF-029, DEF-078 |
| P05.07 | DEF-030, DEF-064 |
| P05.03 / P06.03 | DEF-031 |
| P05.06 | DEF-032, DEF-033 |
| P04.01 / P05.03 | DEF-034, DEF-075 |
| P06.01 | DEF-035 |
| P06.02 / P06.04 | DEF-036, DEF-068 |
| P06.06 | DEF-037 |
| P06.07 | DEF-038 |
| P07.01-P07.05 | DEF-040, DEF-041, DEF-042, DEF-043, DEF-059, DEF-081 |
| P08.05 | DEF-044 |
| P08.02-P08.04 | DEF-045, DEF-046, DEF-047, DEF-048 |
| P02.01-P02.03 | DEF-050, DEF-051 |
| P09.05 | DEF-054, DEF-055 |
| P03.05 | DEF-057, DEF-079 |
| P07.06 | DEF-058, DEF-062, DEF-077 |
| P04.01 / P01.02 | DEF-065, DEF-070 |
| P04.04-P04.05 | DEF-067 |
| P06.05 | DEF-069 |
| P11.05 | DEF-080 |
| P11.04 / P01.06 | DEF-082 |

Withdrawn row 002 is intentionally absent. If the next report still counts it as open, fix the report formula rather than reopening product work.

### 5.1 Coverage sanity check

The matrix covers every ID from `DEF-001` through `DEF-082` except withdrawn `DEF-002`. Before implementation begins, add a small documentation test that extracts defect IDs from this section and fails unless the set equals the open defect register set.

---

## 6. End-to-end definition of done for any individual fix

A task is not complete merely because the visible symptom is gone. For every fix, the implementation log must prove:

1. **Entry:** every UI/API/import/offline path reaches the same domain validation.
2. **Authorization:** tenant, actor, scope, permission, current state, and object version are enforced server-side.
3. **Integrity:** database constraint or transaction closes the race where one exists.
4. **Idempotency:** repeated intent is replayed or rejected deterministically.
5. **Outcome:** success, validation, conflict, unavailable, and unknown outcome are distinguishable.
6. **Audit:** immutable event identifies actor, object, before/after or command, reason, and correlation.
7. **Notification:** delivery is asynchronous, observable, and idempotent.
8. **Read models:** admin, HR, member, provider, API, export, and search show consistent current truth where applicable.
9. **Recovery:** support can reconcile without undocumented URLs or direct database edits.
10. **Privacy/accessibility:** copy discloses minimum necessary data and the path works by keyboard/screen reader/mobile zoom.
11. **Migration:** legacy data is reported/backfilled before constraints and rollback is documented.
12. **Tests:** happy, negative, race, stale, response-loss, and adjacent cases pass.

If any applicable item is missing, the fix is half-wired and must not be marked complete.
