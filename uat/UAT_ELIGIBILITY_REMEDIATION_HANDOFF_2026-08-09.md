# Client, Scheme and Member Onboarding → Live Eligibility

## UAT Remediation Handoff

**Run:** `UAT-ELIG-20260809-03`  
**Environment:** `https://avenue-portal.vercel.app`  
**Build tested:** `39bb24eeddf6790892a43485ff55f2772410bb02`  
**Test date:** 2026-08-09  
**Decision:** **NO-GO**  
**Primary gate:** `DEF-027` — contradictory member cost-share caps persisted  
**Authoritative workbook:** `outputs/019fe1e4-8895-7fc3-972b-3968d0231d7c/runs/UAT-ELIG-20260809-03/client_scheme_member_onboarding_live_eligibility_UAT_RUN_UAT-ELIG-20260809-03.xlsx`  
**Evidence directory:** `outputs/019fe1e4-8895-7fc3-972b-3968d0231d7c/runs/UAT-ELIG-20260809-03/evidence`

This document is the implementation handoff for the building agent. The workbook remains the source of truth if any description here appears ambiguous.

## 1. Outcome and interpretation

The run terminalized all planned rows:

| Measure | Pass | Fail | Blocked | N/A | Not Run | Total |
|---|---:|---:|---:|---:|---:|---:|
| Scenarios | 6 | 18 | 167 | — | 0 | 191 |
| Atomic steps | 72 | 23 | 669 | 26 | 0 | 790 |
| Reconciliation rows | 1 | 9 | 29 | — | 0 | 39 |

The 167 blocked scenarios are not 167 independent product defects. `DEF-027` triggered the mandatory material-benefit stop line at scenario `P-014`. All later authenticated scenarios were then truthfully marked Blocked rather than executed or inferred.

There are **24 open records**:

- 16 product defects: 1 S1, 10 S2 and 5 S3.
- 8 source, UAT-control or controlled-data dependencies.
- Three execution incidents (`DEF-007`, `DEF-011`, `DEF-016`) are Closed and are retained only for audit history. They are not product backlog items.

The earlier Underwriter claims/privacy exposure did **not** recur in this run. Do not remove additional Underwriter permissions merely because of the prior run; any RBAC change must be justified by a current permission specification and a focused authorization test.

## 2. Instructions to the building agent

1. Work from the tested build and confirm whether the current branch is ahead of or behind commit `39bb24e` before interpreting a defect as already fixed.
2. Read the relevant guide under `node_modules/next/dist/docs/` before changing Next.js code, as required by the repository instructions.
3. Fix `DEF-027` first. No other work makes the release eligible for GO while this invariant can be bypassed.
4. Enforce critical invariants at all write paths: UI, server action/service, API/router and database where practical. UI-only validation is insufficient.
5. Preserve tenant scoping, immutable package-version history, audit events and effective dates.
6. Do not hard-delete or directly edit UAT-created records in the database. Prepare an approved, auditable cleanup operation after uniqueness and validation controls are deployed.
7. Add automated tests for every defect. A code change without a regression test does not close the defect.
8. Deploy to UAT and rerun the exact failed scenario through the front end. Unit tests alone do not close a UAT defect.
9. Update the workbook defect row with the deployment build, retest result and new evidence. Do not rewrite the original Actual or Reproduction fields.

## 3. Recommended delivery order

### Wave 0 — Release stop line

- `DEF-027`: family annual cap below individual annual cap.
- Audit existing data for contradictory caps before enabling the release.
- Rerun `P-014` immediately after deployment. Continue the larger UAT only when this passes.

### Wave 1 — Client and member-identity integrity

- `DEF-013`, `DEF-014`: duplicate legal names and silent defaults.
- `DEF-015`, `DEF-017`: member-prefix uniqueness and unsafe input.
- `DEF-012`: persisted prefix/slug cannot be audited from normal UI.

These changes should ship together because validation, database constraints, display and cleanup all affect the same records.

### Wave 2 — Benefit configuration completeness

- `DEF-021`: currency-label integrity.
- `DEF-022`: outpatient per-visit limit.
- `DEF-023`: structured treatment exclusions.
- `DEF-024`: structured referral rule and emergency exception.
- `DEF-026`: maternity family shared limit does not save.

This wave must cover storage, package versioning, eligibility, pre-authorisation/claims consumption and member/provider-safe display—not only configuration screens.

### Wave 3 — Authentication, attribution and operator usability

- `DEF-005`: lockout policy and recovery observability.
- `DEF-006`: accessible required-field validation.
- `DEF-010`: delayed/silent session-expiry enforcement.
- `DEF-002`: provider role attribution.
- `DEF-004`: Membership Officer navigation/discoverability.

### Wave 4 — UAT governance and controlled fixtures

- `DEF-001`, `DEF-003`, `DEF-008`, `DEF-009`, `DEF-018`, `DEF-019`, `DEF-020`, `DEF-025`.

These are required to unlock full acceptance coverage but should not be disguised as production-code fixes.

## 4. Product defect specifications

### DEF-027 — S1: family annual cap can persist below individual cap

**Observed:** `Individual = UGX 300,000` and `Family = UGX 299,999` persisted without relational validation. Safe values were restored to `300,000 / 600,000` after evidence capture.

**Risk:** Incorrect member liability, contradictory benefit configuration and inconsistent adjudication. This is a release stop line.

**Required implementation:**

- Require `familyCap >= individualCap` when a family cap is supplied.
- Reject non-finite, zero or negative values as appropriate.
- Apply the rule to every write path, including the server action and tRPC/API mutation.
- Reject the write transactionally and return a field-level message; do not partially persist either cap.
- Add a database check constraint such as `familyCap IS NULL OR familyCap >= individualCap` after auditing and repairing historical data.
- Record the actor, prior values and accepted new values in the normal audit trail.
- Keep the family cap optional if that is the approved product rule.

**Likely code areas:**

- `src/app/(admin)/packages/[id]/coContribution.actions.ts`
- `src/server/trpc/routers/coContribution.ts`
- `src/app/(admin)/packages/[id]/CoContributionRulesManager.tsx`
- `prisma/schema.prisma` and a new migration
- `tests/actions/coContribution.actions.test.ts`

**Required tests:**

- Reject family `299999` when individual is `300000`; assert no upsert.
- Accept equality `300000 / 300000`.
- Accept greater family cap `300000 / 600000`.
- Accept a null/omitted family cap if approved.
- Prove the API/router cannot bypass the server-action rule.
- Prove the database constraint rejects an invalid direct write.
- Front-end retest of `P-014`, including close/reopen persistence.

### DEF-013 — S2: name-only submission creates duplicate ACTIVE client with silent defaults

**Observed:** Supplying only an existing legal name created another ACTIVE client and silently defaulted type, currency and slug.

**Required implementation:**

- Make required fields explicit in the UI and server validation.
- Do not silently select payer type or currency unless the UI clearly presents an intentional default before submission.
- Reject duplicate controlled identity before persistence.
- Return field-specific errors without redirecting away from the form or discarding valid inputs.
- Ensure concurrent submissions cannot create duplicates.

**Likely code areas:**

- `src/app/(admin)/clients/new/page.tsx`
- `src/app/(admin)/clients/new/actions.ts`
- `src/server/services/clients.service.ts`
- `prisma/schema.prisma` and a migration for normalized identity

**Acceptance:** Blank and name-only submissions remain on the form with accessible errors; no client is created. Two concurrent equivalent submissions result in at most one accepted client.

### DEF-014 — S2: legal-name uniqueness ignores case and surrounding spaces

**Observed:** A lowercase, space-padded version of the controlled legal name was accepted as a separate ACTIVE client.

**Required implementation:**

- Define and persist a canonical legal-name key, at minimum Unicode normalization, trim and case folding.
- Enforce uniqueness within the operator tenant at the database layer.
- Decide and document treatment of repeated internal whitespace and punctuation.
- Provide an explicit duplicate/conflict message and a link to the existing client where authorized.

**Acceptance:** Exact, case-variant, leading/trailing-space and concurrent variants cannot create separate governed clients within the same operator tenant.

### DEF-015 — S2: member prefix is reusable across ACTIVE clients

**Observed:** `LMU` was accepted for a different ACTIVE client.

**Risk:** Ambiguous or colliding member identifiers.

**Required implementation:**

- Enforce operator-wide prefix uniqueness, or implement an explicitly documented namespace that makes collisions impossible.
- Add a database constraint against the normalized prefix.
- Check compatibility with `src/server/services/member-numbering.service.ts` before migration.
- Prevent reactivation of a conflicting prefix.

**Acceptance:** A second ACTIVE client cannot persist the same normalized prefix; concurrent attempts are safe; existing member-number generation remains stable.

### DEF-017 — S2: unsafe member prefixes persist and cannot be audited

**Observed:** Lowercase, whitespace, slash, apostrophe, emoji and formula-like categories were accepted as client records. The UI `maxlength=6` stopped only the seventh character.

**Required implementation:**

- Establish a strict server-side allow-list, recommended `^[A-Z][A-Z0-9]{1,5}$` unless the approved business rule differs.
- Normalize before uniqueness checking; never rely on the CSS uppercase class or HTML `maxlength`.
- Reject rather than silently transform ambiguous characters.
- Display clear, accessible field guidance and an error.
- Display the persisted normalized value on detail and Edit.

**Acceptance:** Unsafe categories fail without a write; safe uppercase controls pass; API/direct-action attempts are equally protected.

### DEF-012 — S3: persisted member prefix and slug are not auditable

**Observed:** The prefix entered at creation was absent from client list/detail/edit; Edit also omitted the slug.

**Required implementation:**

- Display member prefix and slug on the client detail page.
- Display them on Edit as read-only or controlled editable fields according to governance.
- If mutable, require collision checks, audit history and impact warning for existing member numbers/links.
- Include the fields in an authorized UI export if one exists.

**Likely code areas:**

- `src/app/(admin)/clients/[id]/page.tsx`
- `src/app/(admin)/clients/[id]/edit/page.tsx`
- `src/app/(admin)/clients/[id]/edit/actions.ts`
- `src/server/services/clients.service.ts`

**Acceptance:** Create, list/detail, Edit and reopen show the same controlled prefix and slug without database intervention.

### DEF-021 — S2: package contribution label uses KES in a UGX package

**Observed:** Package details displayed `Contribution (KES/yr)` while benefit and annual limits used UGX.

**Required implementation:**

- Remove hard-coded currency labels.
- Bind all package monetary displays to one authoritative client/package currency projection.
- Verify builder, list, detail, scheme selection, member benefits and provider-facing surfaces.
- Make it explicit whether contribution values are stored in the client currency; do not imply an FX conversion that did not occur.

**Likely code area:** `src/app/(admin)/packages/[id]/page.tsx` currently contains the hard-coded label.

**Acceptance:** The controlled package displays UGX consistently everywhere and no remaining package money label is hard-coded to KES.

### DEF-022 — S2: no user-visible OUTPATIENT per-visit limit

**Observed:** The model and downstream usage logic contain per-visit concepts, but Package Edit does not configure or display the controlled OUTPATIENT `UGX 300,000` per-visit limit.

**Required implementation:**

- Add `perVisitLimit` to each enabled benefit configuration in the builder/Edit flow.
- Preserve the value in immutable `PackageVersion` data.
- Display it on package detail, member benefits, provider eligibility/pre-auth and claims decision explanations.
- Enforce it consistently in eligibility, holds, pre-authorisation and claims.
- Include effective-from/effective-to semantics through version selection; free text is not configuration.

**Likely code areas:**

- `src/app/(admin)/packages/[id]/edit/page.tsx`
- `src/app/(admin)/packages/[id]/edit/actions.ts`
- `src/app/(admin)/packages/builder/actions.ts`
- `src/server/services/packages.service.ts`
- `src/server/services/benefit-usage.service.ts`
- member, provider, pre-auth and claim benefit displays

**Acceptance:** Configure `OUTPATIENT = UGX 300,000 per visit`, reopen it, and prove requests at/below/above the threshold receive correct available-benefit and reason-code behavior.

### DEF-023 — S2: no structured treatment-exclusion configuration

**Observed:** Package Edit provides benefit, provider eligibility and shared-limit controls, but no structured cosmetic/experimental treatment exclusion with source clause, exception and effective date.

**Required implementation:**

- Introduce a version-owned structured exclusion model; do not rely solely on string arrays or free-text notes.
- Required fields: rule/category, included service/diagnosis/procedure scope, exclusion type, exception logic, effective period, source clause, internal explanation and member-safe explanation.
- Validate overlapping/conflicting rules and keep old versions immutable.
- Apply the rule in eligibility, pre-authorisation and claims using stable reason codes.
- Expose safe explanations to members/providers without leaking internal notes.

**Likely code areas:**

- `prisma/schema.prisma` and migration
- package builder/Edit/detail
- `src/server/services/contract-engine/engine.ts`
- canonical eligibility/pre-auth/claim decision services
- reason-code catalog

**Acceptance:** Configure cosmetic and experimental-treatment exclusions, including their approved exception/effective date, and prove eligible, excluded, exception and boundary-date outcomes.

### DEF-024 — S2: no referral requirement or emergency exception configuration

**Observed:** No package-version control exists for specialist outpatient referral, emergency exception or effective date. Existing provider rules do not represent referral logic.

**Required implementation:**

- Add a versioned referral-rule model scoped to benefit/service/provider speciality as required.
- Store requirement, emergency exception, effective period, source clause and safe explanation.
- Evaluate the rule in eligibility and pre-authorisation; do not reuse provider INCLUDE/EXCLUDE rules.
- Ensure emergency exception evidence and overrides are auditable.

**Acceptance:** Specialist outpatient care without referral fails with the approved reason; a valid referral passes; a qualifying emergency follows the exception; effective-date boundaries are correct.

### DEF-026 — S2: valid maternity FAMILY shared limit cannot be saved

**Observed:** Exact `Maternity family pool / UGX 3,000,000 / FAMILY / MATERNITY` values produced no staged row, error or validation. Current code requires at least two selected benefits.

**Required implementation:**

- Confirm the contract rule: the UAT truth requires a single-category MATERNITY family pool.
- Permit one selected category, or expose the exact additional required category in the controlled truth and UI. Do not fail silently.
- Validate tenant/package/version ownership of every submitted benefit ID.
- Write the group and links atomically.
- Revalidate the package route by package ID, not by package-version ID.
- Show success and field-level errors; preserve form values on failure.
- Include the pool in immutable version display and downstream family usage calculations.

**Likely code areas:**

- `src/app/(admin)/packages/[id]/edit/SharedLimitsManager.tsx`
- `src/app/(admin)/packages/[id]/edit/actions.ts`
- `prisma/schema.prisma`
- `src/server/services/benefit-usage.service.ts`

**Acceptance:** The exact controlled group saves once, reopens once, applies across the family correctly, and cannot be duplicated accidentally.

### DEF-005 — S2: lockout policy and recovery are not objectively observable

**Observed:** Ten wrong attempts and an immediate correct-password attempt all returned the same generic error. A lock appears to occur, but threshold, duration and authorized recovery could not be verified.

**Required implementation:**

- Keep responses non-enumerating and timing-resistant.
- Define one lockout/throttle policy with threshold, duration, backoff and reset path.
- Expose generic public guidance that does not confirm account existence, for example that repeated attempts may require waiting or password recovery.
- Provide an authorized admin/UAT surface or audit event for objective policy verification.
- Ensure successful password reset clears the correct lockout state.

**Likely code areas:**

- `src/lib/auth.ts`
- `src/lib/rate-limit.ts`
- login and reset actions/pages
- `tests/lib/auth-lockout.test.ts`
- `tests/services/password-reset*.test.ts`

**Acceptance:** Threshold, locked-period rejection, generic messaging, unlock/recovery and audit behavior are all deterministic and testable without account enumeration.

### DEF-006 — S3: Sign In lacks accessible required-field behavior

**Observed:** On the deployed build, blank submit did not expose required messages or required/invalid semantics. The current checkout may contain partial remediation, so compare it to the tested commit and deployed artifact.

**Required implementation:**

- Add native `required` and appropriate `aria-required` semantics to Email and Password only.
- On submit, show field-level messages with `role=alert`, set `aria-invalid`, link messages via `aria-describedby`, and focus the first invalid field.
- Preserve logical Tab/Shift+Tab order and a visible focus indicator.
- Keep authenticator code optional unless the account requires it after identity verification.

**Likely code areas:**

- `src/app/(auth)/login/page.tsx`
- `tests/components/login-accessibility.test.tsx`

**Acceptance:** Screen-reader semantics, keyboard-only flow and visible validation pass in the deployed UAT build.

### DEF-010 — S3: expired session is enforced late and without recovery guidance

**Observed:** After at least 30 minutes idle, Register Member still performed client-side validation. Only later protected navigation redirected silently to Sign In. No partial member was created.

**Required implementation:**

- Detect session expiry before local business-field validation masks it.
- Every protected mutation must fail closed server-side when unauthenticated.
- Redirect or show a consistent expired-session message.
- State whether unsaved values can be recovered; preserve only non-sensitive draft data when approved.
- Never partially create a member.

**Likely code areas:**

- `src/lib/session-policy.ts`
- authentication middleware/server-action guards
- member registration form/action
- `tests/lib/session-policy.test.ts`

**Acceptance:** After the configured idle interval, the first protected action clearly requires reauthentication, explains recovery and leaves zero partial records.

### DEF-002 — S3: provider actor strip shows only generic Provider

**Observed:** All six provider users reached the correct portal, but the persistent actor strip displayed only `Provider`, not Front Desk, Clinician, Biller, Finance, Admin or Integration Admin.

**Required implementation:**

- Pass a safe human-readable assigned role label from the canonical provider access context into the persistent navigation shell.
- Do not infer role from visible navigation items.
- Preserve actor name, facility and role on desktop and mobile.

**Likely code areas:**

- `src/app/provider/layout.tsx`
- `src/components/layouts/ProviderNav.tsx`
- `src/components/layouts/SignedInIdentity.tsx`
- provider-access context/role catalog

**Acceptance:** Each of the six provider personas shows the exact controlled role and never another user's role after logout/login or multi-tab refresh.

### DEF-004 — S3: Membership Officer cannot discover Clients or Packages

**Observed:** The Membership Officer found Groups, Members and Endorsements, but no Clients or Packages within 60 seconds. `Groups` opened `Corporate Groups` without clarifying the client/scheme/package hierarchy.

**Required implementation:**

- Agree whether Membership Officers need read-only client/package access or a consolidated scheme-setup overview.
- Add visible navigation and terminology without granting unauthorized mutation rights.
- Use route guards/permissions for authorization; sidebar visibility alone is not a control.
- Clarify `Client → Group/Scheme → Package/Benefit Plan → Members` in labels or breadcrumbs.

**Likely code areas:**

- `src/components/layouts/AdminSidebar.tsx`
- client/package page guards and read projections
- terminology/breadcrumb components

**Acceptance:** A fresh Membership Officer locates and distinguishes all five concepts within 60 seconds while forbidden create/edit actions remain inaccessible server-side.

## 5. UAT, source and controlled-data dependencies

These records must be resolved before the next full acceptance run. They should usually be handled in the UAT pack, identity provisioning or controlled seed data—not by weakening production behavior.

| ID | Severity | Dependency | Required resolution |
|---|---|---|---|
| DEF-001 | S2 | No signed real-client source pack | Supply and independently approve a signed contract, benefit schedule, exclusions/referrals, tariffs/network terms and membership file. Retain the synthetic pack for functional tests only. |
| DEF-003 | S3 | Roles & Accounts omits three personas | Add controlled rows for `medical_officer`, `provider_finance` and `provider_admin`; reconcile exactly to the credential/persona set. |
| DEF-008 | S4 | Reset mailbox cannot be accessed through approved controls | Provide a dedicated UAT mailbox and a human-controlled final password-change step; record evidence without exposing the code/password. |
| DEF-009 | S3 | Principal-member account lacks source crosswalk | Link the account to a named Lakeview source member or add the exact NWSC member row to `05 Member Data`. |
| DEF-018 | S4 | Currency-change test is sequenced before scheme creation | Move `C-005` after scheme setup or provide an isolated client with an existing scheme and the same currency baseline. |
| DEF-019 | S4 | No safe non-critical field for audit mutation | Provide an isolated audit fixture or a reversible description/note field so audit evidence can be generated without changing critical master data. |
| DEF-020 | S4 | Scenario expects Lakeview confinement but UW is operator-wide | Provision a genuinely Lakeview-confined Underwriter and document its exact client/group scope before authorization tests. |
| DEF-025 | S4 | No disposable package for destructive boundary tests | Seed an isolated disposable package with exact baseline, approved destructive scope and cleanup governance for 0%, 10%, 100%, invalid copay, shared-limit and version-boundary tests. |

The run's temporary credential pack was deleted after QA. Fresh secrets and TOTP seeds must be provisioned securely for the retest; do not attempt to recover old values from evidence.

## 6. Data cleanup and migration controls

The UAT created duplicate and deliberately malformed client records while testing validation boundaries. Cleanup must follow the product's governed lifecycle:

- Identify records using the Evidence Index and client references from `C-002`, `C-003` and `C-004`.
- Do not hard-delete through SQL.
- Introduce uniqueness/validation first so cleanup cannot recreate the problem.
- Decide whether records should be deactivated, merged or marked as UAT fixtures.
- Preserve an audit record of the decision, actor, time and replacement/canonical client.
- Before adding database unique constraints, produce a collision report for normalized legal names and member prefixes across every operator tenant.
- Before adding the cap check constraint, report every `familyCap < individualCap` row and remediate it through an approved process.

## 7. Minimum automated regression suite

At minimum, add or extend tests covering:

1. Cap relational validation in server action, API/router and database.
2. Client canonical-name and prefix normalization/uniqueness, including concurrency.
3. Unsafe prefix categories and field-level errors.
4. Currency projection across builder/list/detail/member/provider surfaces.
5. Per-visit limit configuration, versioning and adjudication.
6. Exclusion and referral rule effective dates, exceptions and reason codes.
7. Single-category maternity family shared pool, atomic persistence and family usage.
8. Lockout threshold, timing, recovery and non-enumerating response.
9. Login required-field accessibility and keyboard flow.
10. Idle-session first-action enforcement and zero partial member creation.
11. Exact provider role attribution through logout/login and multi-tab refresh.
12. Membership Officer read-only discoverability plus forbidden mutation checks.

Suggested existing suites to extend include:

- `tests/actions/coContribution.actions.test.ts`
- `tests/lib/auth-lockout.test.ts`
- `tests/components/login-accessibility.test.tsx`
- `tests/lib/session-policy.test.ts`
- `tests/components/provider-nav-model.test.ts`
- `tests/components/portal-identity.test.tsx`
- `tests/services/benefit-usage-expiry.test.ts`
- `tests/services/contract-engine.test.ts`
- `tests/routers/packages.test.ts`

Create focused client-master, shared-limit, exclusion and referral tests where no suitable suite exists.

## 8. Definition of done for each defect

A defect is closed only when all of the following are true:

- The authoritative Expected statement is met; the UI is not merely changed cosmetically.
- All alternate write paths are protected and tenant-scoped.
- A regression test fails before the change and passes after it.
- Required schema migrations are forward-safe and include a preflight data audit.
- Historical/versioned data remains immutable where required.
- Audit events and safe user-facing errors are present.
- The fix is deployed to UAT and the exact reproduction is rerun through the visible front end.
- Normal list/detail/Edit reopen confirms persistence or rejection.
- New evidence is indexed and hash-verified.
- The defect row records the build, retest result and evidence.
- `DEF-027`, and every other S1/S2 relevant to the release gate, is independently retested before a GO recommendation.

## 9. Required retest sequence

1. Run targeted `P-014` against the deployed `DEF-027` fix.
2. Run client-master scenarios `C-001:C-006`, then the audit/scope scenarios once controlled fixtures exist.
3. Run package configuration `P-001:P-014` with the disposable boundary fixture.
4. Resume all scenarios blocked after `P-014`, in original workbook order.
5. Reconcile every member, eligibility channel and benefit limit to the signed real-client source pack.
6. Issue GO only when there are no open S1/S2 defects, every mandatory reconciliation matches and owner sign-off is genuine.

## 10. Final caution

Do not interpret the current 6/191 pass count as the product's overall pass rate: the stop-line intentionally prevented later execution. Conversely, do not infer that blocked scenarios pass after fixing `DEF-027`. They must be executed. The next release decision depends on both closing the recorded defects and completing the coverage that this stop-line blocked.
