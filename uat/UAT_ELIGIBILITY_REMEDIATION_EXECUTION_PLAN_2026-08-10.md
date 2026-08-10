# Onboarding → Live Eligibility — Remediation & Hardening Execution Plan

**Plan version:** 1.0 — 2026-08-10
**Responds to:** `uat/UAT_ELIGIBILITY_REMEDIATION_HANDOFF_2026-08-09.md` (run `UAT-ELIG-20260809-03`, NO-GO, gate `DEF-027`)
**Baseline build:** `39bb24eeddf6790892a43485ff55f2772410bb02` == current `main` HEAD (verified — nothing in the handoff is pre-fixed)
**Authoritative truth:** run workbook + `04 Contract Truth` (CT-001..035) + `06 Eligibility Oracle` (EO-001..024). The workbook wins over this plan on any conflict of expected behaviour.
**Prepared by:** planning agent, with a 7-track code sweep of the working tree at `39bb24e`. Every file:line in this plan was read at that commit, not inferred.

---

## 0. Read this first (executing agent)

1. **Why this plan is different from the last two.** Runs 1–3 each died early on a *different instance of the same five defect classes*. This plan therefore has two mandates: (a) close the 24 open records from run -03, and (b) **pre-harden every surface the 167 blocked scenarios will exercise**, using the workbook itself as a published test oracle. Section 6 walks phase-by-phase (S, N, M, B, E, L, V, Q, X, U, Z) through exactly what the retest will do and what must be true first. Do not treat §6 as optional polish: the next stop-line lives there.
2. **Ground rules carried over from the handoff (§2, binding):** enforce invariants at every write path (UI + server action + tRPC/API + DB where practical); UI-only validation closes nothing; preserve tenant scoping, immutable version history, audit events, effective dates; no hard-deletes of UAT records; every defect needs a failing-then-passing regression test; a defect is closed only after front-end retest on the deployed UAT build; update workbook defect rows without rewriting original Actual/Reproduction fields.
3. **AGENTS.md landmine:** `node_modules/next/dist/docs/` **does not exist** in the installed `next@15.5.15` (verified 2026-08-10). Do not fabricate fork differences: validate against `node_modules/next/dist/` types and empirical behaviour. Known real behaviours to respect: `redirect()` throws — never call it inside a `try/catch` that swallows; server actions return values must be serializable.
4. **iCloud duplicates:** files with a `" 2"` suffix (`src/lib/session-policy 2.ts`, `tests/lib/auth-lockout.test 2.ts`, …) are sync artifacts, NOT alternates. Never edit or import them; deleting them is a pre-approved cleanup (a prior commit `a1bd147` already did this once).
5. **Schema-change strategy (critical, this repo is db-push–operated):** `prisma/migrations/` exists but the operational workflow for UAT/prod has been `prisma db push` (see §9 landmines: `db push` ignores `--env-file`; prod pooler on 6543 cannot run DDL — use the 5432 direct connection). Therefore:
   - Anything expressible in `schema.prisma` (`@@unique`, `@unique`, indexes, enums, defaults) goes in the schema so `db push` manages it.
   - CHECK constraints are NOT expressible in Prisma schema. Put them in **versioned idempotent SQL files under `prisma/sql/`** (pattern already exists there) applied explicitly per environment (direct 5432 connection), each paired with a **preflight audit query** and recorded in the run log. Add a real-DB test that asserts the constraint exists (query `pg_constraint`) so drift is caught.
   - Every uniqueness constraint ships **after** its collision report runs clean (§7).
6. **Definition of done per defect** = handoff §8, verbatim. Deploy to Vercel UAT, rerun the exact scenario through the visible front end, index evidence, update the workbook row.
7. **Test gate for every wave:** `npm run typecheck` && `npm test` && `npm run build` (build catches Next-specific breakage that tsc+vitest miss — lesson recorded from the PNOS merge) && targeted real-DB suites where they exist. CI-equivalent local run before every deploy.
8. **Credentials:** the run-03 credential pack was destroyed. Provision fresh UAT personas + TOTP via `scripts/uat/provision-live-uat-users.ts` (extend for the 3 missing personas, §7.3). Never store secrets in the workbook or evidence.

---

## 1. Diagnosis — why three runs died early, and what actually fixes it

Chronology (each run renumbers DEF-IDs — never match numbers across documents):

| Run | Build | Stop-line | Class |
|---|---|---|---|
| 20260808-02 | `720a5b8` | Membership Officer dashboard leaked tenant-wide claims | authorization fragmentation |
| 20260809-01 | `a1bd147` | Underwriter had claims/claim-money access | authorization fragmentation |
| 20260809-02 | `39bb24e` | (tooling incident, not product) | — |
| 20260809-03 | `39bb24e` | Family cap 299,999 persisted below individual cap 300,000 | unguarded write path |

The five recurring defect classes, with their run-03 instances:

- **C1 — Unguarded/divergent write paths.** Validation, when it exists, lives in exactly one layer while sibling paths (tRPC router, second action, seed, import) write raw. Instances: DEF-027 (action *and* router both raw), DEF-013 (silent defaults), DEF-017 (`trim().toUpperCase()` is the entire prefix sanitation).
- **C2 — Missing relational/cross-field invariants.** Single-field checks pass while the *relationship* between fields is never asserted. Instances: DEF-027 (family ≥ individual), and the blocked P-006..P-013 boundary scenarios were pointed straight at more of these (copay bounds, waiting bounds, sublimit ≤ overall, precision).
- **C3 — Identity without normalization or DB backstop.** Uniqueness by incidental side-effect (slug collision) instead of normalized keys + unique indexes. Instances: DEF-013/014/015/017; Group has **no unique constraint at all**.
- **C4 — Silent failure / silent defaults.** Saves that no-op without error (DEF-026), forms that redirect away losing input (DEF-013), business rules hidden in `disabled=` conditions, thin or missing audit on state changes.
- **C5 — Split-brain reads.** The same fact computed differently per surface: currency labels hard-coded (DEF-021), eligibility computed per-channel (Q-phase risk), `/api/v1/benefits` resolving latest version while adjudication uses the member pin (§6.1 finding F-PIN-1).

**Strategy:** build the small shared plumbing that kills each class once (§3), apply it to the run-03 defects in handoff wave order (§4–§5), then sweep it across every surface the blocked phases will test (§6), with fixtures (§7) so the next run never blocks on data, and consistency gates (§8) so the classes cannot silently return.

### 1.1 Systemic discoveries beyond the 16 workbook defects (verified this pass)

A 7-track sweep of the working tree found that the run-03 defects are the visible tip. The blocked phases would have hit these next, one after another. Each is a real, file:line-verified defect at `39bb24e`; none was reachable by the run because it died at P-014. These **expand the scope** and several are more severe than anything the workbook recorded:

- **PROD-BLOCKER-1 — dynamic-RBAC surfaces fail closed in prod (bigger than DEF-027 for go-live).** Prod has zero `Role`/`Permission`/`UserRoleAssignment` rows. Every surface gated **only** on `rbacService.*` returns `[]`/`false`/throws `FORBIDDEN` for everyone including SUPER_ADMIN: quotation issue/decline (`quotations.ts:118,137,160,172`), underwriting intake decisions (`intake.ts:91,103,114,122,135`), binding/member-create/binder-approve (`binding.ts:33,41,49`), overrides (`overrides.ts:99,111`), **role administration itself** (`roles.ts:11,18,23,33`) — and `rbac.service.ts:121` requires `ROLE:ASSIGN` to create the first assignment, a **bootstrap deadlock**: no one can grant the rows that would unbreak the rest. Provider persona-role assignment (`provider-user-admin.service.ts:82`) is in the same trap, which is the upstream reason DEF-002's real provider role labels have no data to render. **This must be fixed (seed baseline RBAC rows + make these gates fall back to the role baseline, per SP-7) or the app is non-functional in prod regardless of the UAT.** Not in the workbook because these surfaces sit past the P-014 stop-line.
- **PROD-BLOCKER-2 — the ENTIRE tRPC mutation surface is auth-only, no role gate, no middleware.** Not just packages: all ~130 `.mutation` procedures across all 30 routers use `protectedProcedure` (session-exists check only, `trpc.ts:26-31`); `adminProcedure` is defined (`trpc.ts:44-53`) but **used by zero routers**; there is **no `middleware.ts` anywhere in the repo**. So any authenticated user of any role — a member, a provider biller, a reports viewer — can `POST /api/trpc/contracts.activate`, `contracts.terminate`, `providers.create`/`update` (arbitrary `contractStatus`), `providers.addTariff`, `coContribution.*`, `packages.*` (create/edit/delete shared limits + caps), `binding.*`, `intake.*`, `quotations.*`, `settings.*`. Several also take `packageVersionId`/`packageId`/`providerId`/`backdateOverrideId` straight from the client with **no tenant-ownership check** (cross-tenant write/delete; unverified backdate override at `contracts.ts:231`). The server-action layer is correctly `requireRole`-guarded; **the tRPC layer is an unguarded parallel door to the same services.** X-002/X-008 fail the moment they are reached. This is the DEF-027 divergent-write-path class at authorization scale.
- **PROD-BLOCKER-3 — report exports have no role check and ignore data scope.** `api/reports/[reportType]/export/route.ts:901-914` authorizes on `tenantId` alone; only 5 of 33 report types apply the analytics group scope — the other ~28 (`claims`, `membership`, `utilization`, `member-statements`, `exceeded-limits`, …) query `where:{tenantId}` unscoped. Any authenticated user (HR, member, provider) can `GET /api/reports/claims/export` and download the tenant's entire named claim register. `api/reports/pdf/route.ts:106` is the same. Feeds X-008 (reports viewer read-only) and RBAC/privacy.
- **PRIVACY-S1-A — provider portal enumerates member PII tenant-wide.** `provider-eligibility.service.ts:114-131` — the **default** path (`entitlementEnforcement` defaults `false`, `provider-access-settings.service.ts:45`, so this is live) does a tenant-only `member.findFirst` with no entitlement filter and returns `firstName`, `lastName`, `memberNumber`, `schemeName`, `packageName` for **any member number in the tenant**, from **any** provider login — including employers the facility has no contract with. Absent number → "No member found"; valid number → a card with the real name = a card-number enumeration oracle. This is the same S1 class (cross-scope member PII from a portal) that stop-lined runs 1 and 2; it sits past P-014 so run-03 never reached it. Will stop-line X-004/X-010/Q-phase.
- **PRIVACY-S1-B — N3 cross-tenant DOB leak still live on one HR page.** `(hr)/hr/roster/[memberId]/page.tsx:13-17` filters `{ id, groupId: session.user.groupId! }`; when `groupId` is undefined (SUPER_ADMIN is in `ROLES.HR`; or any ungrouped HR user) Prisma **drops the key** and the query degrades to `findFirst({where:{id}})` across all groups and all tenants, then renders DOB/idNumber/phone/email. Every sibling HR page got an explicit `if(!groupId)` guard; this one and `hr/utilization` + `hr/support` did not. Confirmed at HEAD — this is the live form of the long-standing N3 business-decision item, now a concrete code defect. Stop-lines X-003.
- **CONTRACT-RULE-FAIL — bound members get the wrong member-number prefix.** `binding.service.ts:266,335` call `nextMemberNumber(tenantId)` omitting `clientId`, so every quotation-bound member is minted `MVX-YYYY-NNNNN` instead of the client prefix (`LMU-…`). One-line fix, but it directly violates CT-004 and would fail M-phase and Z-phase reconciliation.
- **EIGHT eligibility evaluators, not two.** The parity sweep found 8 distinct "is-eligible" evaluators and 7 distinct "remaining-benefit" calculators; no two of the four parity channels share both, and the **HR channel has neither** (24 of the 96 Q-phase oracle cells are unexecutable as specified). Admin is wrong in two directions at once (over-reports by ignoring holds, under-reports by summing lifetime usage with no period filter). Three different package-version resolutions give three different answers for the same member. Detail + fix shape: §6.7.
- **Age rules 24/65 are inert everywhere.** `Package.minAge/maxAge/dependentMaxAge` exist as columns and are enforced at **zero** read sites — not at enrolment, renewal, or eligibility. A 70-year-old principal and a 40-year-old "child" enrol cleanly. The renewal age-band reclassifier computes crossings and **writes nothing**. Fails M-008/009/010, EO-015/016, V-004.
- **Manually enrolled members get no `MemberCoveragePeriod`.** Only quotation-binding opens coverage periods; the point-in-time eligibility engine (`coverageService`) is therefore blind to every manually or endorsement-enrolled member and **fails open**. This is the substrate under the entire L-phase (point-in-time coverage) and Q-phase.
- **Two co-contribution engines double-charge.** `claim-decision` applies `BenefitConfig.copayPercentage` + cost-share, while `CoContributionService` independently charges the same billed amount via `CoContributionRule` — with no awareness of each other. A package with both configured charges the member twice, and their `planShare`/`memberLiability` disagree. Feeds P-013 (copay precedence) and the money-path recon.
- **Silent data loss on every package edit.** `SharedLimitGroup` and `PackageProviderEligibility` hang off `packageVersionId`; `updatePackageAction` mints a new version copying only benefits, so **every save orphans all shared limits and provider rules onto the old version** and the edit screen then renders empty lists — no warning. Compounds DEF-026 and P-011/P-015/P-016.
- **Nested-`<form>` corruption is the true DEF-026 mechanism.** `SharedLimitsManager` (and `ProviderEligibilityManager`) render their `<form>` *inside* the outer package-edit `<form>`; the HTML parser drops the inner tag and its submit posts to `updatePackageAction`, not `createSharedLimitAction`. The shared limit is never created; the user silently bumps a package version instead. The `length < 2` rule is a second, independent silent-failure on the same screen.
- **No maker-checker and no audit on ANY package-config mutation.** 22 package write sites, zero audit rows, no `PACKAGE_CHANGE` approval action type exists. A single underwriter unilaterally changes limits/copays/caps and activates a version affecting every enrolled member. Fails P-018/P-019 and CT-035.
- **`ARCHIVED` package status is cosmetic.** No read path filters on it; archived packages remain selectable for new groups and still adjudicate. Fails P-021.
- **`SIBLING` relationship does not exist**; binding derives relationship from **gender** (female→spouse, male→child), silently corrupting family data. **Newborn rule (30-day / DOB-effective) is wholly absent.** **Leaver inclusive-last-day is unimplementable as built** (`lastDay` discarded, every lifecycle path hard-codes `new Date()`, `coverEndDate` never written). Bulk import has **no transaction, no idempotency, and re-posts client rows unvalidated**. Detail: §6.4–§6.6.

### 1.2 Honest production-readiness recalibration

The two-week target needs to be split into two different claims:

- **Achievable in ~2 weeks:** close the release-gate (DEF-027), the identity/validation classes (Wave 1), the benefit-config classes (Wave 2), the auth-finishing defects (Wave 3), the two prod-blockers above, and the single canonical eligibility evaluator (Q-phase substrate) — i.e. get the *next* UAT run to run **deep** instead of dying at P-014, and remove the prod-blockers that would brick go-live.
- **NOT achievable in 2 weeks, and must be said plainly:** a defensible GO. GO requires the rerun to clear all S1/S2 with 100% reconciliation and **real owner signatures on a signed real-client source pack (DEF-001) that does not exist yet**. It also requires the deeper domain rebuilds the sweeps exposed — renewal actually transitioning members, coverage periods for all enrolment paths, the age/newborn/leaver rules, maker-checker on package config — which are real engineering, not validation tweaks. Code hardening can land in two weeks; **acceptance cannot finish until the real-client pack is supplied and the deep domain work is verified.** Escalate DEF-001 to the business owner on Day 1 in parallel (§10).

---

## 2. Decision gates (defaults chosen — build proceeds on defaults unless Arthur countermands)

Each prior plan stalled work on open decisions. This plan pre-selects a default for every decision so the executing agent is never blocked; flag the decision in the PR description instead.

| ID | Decision | Default (build this) | Rationale |
|---|---|---|---|
| D1 | Shared-limit group minimum categories. **The truth pack contradicts itself:** CT-015/P-010/DEF-026 require a *single-category* MATERNITY family pool; P-011/step 3 expects "at least two benefits are required". | Allow **≥ 1** category for `FAMILY`-scope pools; keep ≥ 2 only for cross-benefit combined pools if the model distinguishes them; otherwise ≥ 1 everywhere with explicit staged-row UI. File a workbook correction note for P-011 wording. | "Contract truth wins" is the workbook's own rule (00 Start Here); CT-015 is P0. |
| D2 | Membership Officer access to Clients/Packages (DEF-004). | **Read-only**: `CUSTOMER_SERVICE` gets Clients + Packages list/detail (no create/edit/approve controls, guards server-side), plus breadcrumb terminology `Client → Group/Scheme → Package → Members`. | Matches run-0808 decision D1 branch A (membership-only role) already shipped in WP-3; X-001/X-002 will verify mutation stays denied. |
| D3 | Member-prefix format. | `^[A-Z][A-Z0-9]{2,5}$` server-side allow-list (3–6 chars total), reject — never transform — anything else. | Handoff recommendation, existing prefixes `MVX`/`LMU`/`NWSC` all conform; forbids the six unsafe categories from C-004. |
| D4 | Family cap optionality (DEF-027). | Family cap stays **optional** (null = no family cap); when present must be ≥ individual. | Handoff explicitly permits; matches schema `familyCap Decimal?`. |
| D5 | Copay unit convention (P-006: "10 means 10%"). | Percent scale **0–100**, integer or ≤ 2dp, stored as Decimal; every UI label says `%`; fixed amounts are separate fields in client currency. Never a 0–1 fraction anywhere user-visible. | CT-013 = `0.1` in the truth table is a *fraction* — display and entry must still be `10%`; conversion happens exactly once at the storage boundary. Document in the validation module. |
| D6 | Lockout policy numbers (DEF-005). | 5 consecutive failures → 15-minute lock; exponential backoff not required; successful reset clears the lock; lock/unlock emit audit events; admin Users & Access shows lock state + remaining time. Public messaging stays generic/non-enumerating. | Must be *some* documented policy to be testable; these match the WP-R3 implementation's shape. Confirm actual constants in code and align docs to code (or code to this) — do not leave them undocumented. |
| D7 | Dependant portal visibility (X-007). | Dependants may sign in and see **own** data + shared family pools only (no principal claims detail, no sibling utilization). Record as product policy in `docs/`. | X-007 explicitly demands an explicit decision; least-privacy-risk default. |
| D8 | Client currency change (C-005/CT-003). | Currency becomes **immutable once the client has any scheme, member, invoice, claim or GL activity**; before that, editable with allowlist (UGX/KES/USD). Change attempt after activity → blocking error naming the reason. | C-005's oracle ("currency cannot silently change"); avoids FX-restatement scope in this window. |
| D9 | Scheme/member terminal-state machine. | Explicit transition tables (§6.2, §6.6); terminal states (`TERMINATED*`) reversible only via a governed reinstate/override flow with reason + audit, never via the general edit dropdown. | S-006, L-017, M-019 all test exactly this. |

---

## 3. Shared plumbing (build once, wire everywhere) — SP work packages

These are the class-killers. SP-1..SP-4 are prerequisites for Waves 0–2; SP-5..SP-8 land with their first consumer and are then reused.

### SP-1 — Canonical validation module per entity (kills C1)

`src/lib/validation/` — one zod schema module per entity: `client.ts`, `group.ts`, `package.ts`, `co-contribution.ts`, `shared-limit.ts`, `member.ts`, `tariff.ts`, `endorsement.ts`. Rules:

- The **same schema object** is imported by the server action, the tRPC procedure, and any API route that writes the entity. Actions parse `FormData` through a helper (`parseForm(schema, formData)`) — the pattern `Number(formData.get(...))` becomes lint-forbidden in actions (§8.4).
- Money fields: `z.coerce.number().finite().nonnegative()` (or `.positive()` where zero is invalid) plus `.multipleOf(0.01)` where 2dp applies; percent fields `.min(0).max(100)`; day counts `.int().min(0).max(3650)`; dates `z.coerce.date()` with explicit range refinements. **No bare `z.number()` for money/percent/dates anywhere.**
- Cross-field invariants live in `.superRefine` on the same schema (e.g. `familyCap >= individualCap`, `endDate > startDate`) so every consumer gets them for free.
- Every schema exports a `FIELD_LABELS` map so field errors render human labels consistently.

### SP-2 — ActionResult error contract + form wiring (kills C4)

`src/lib/action-result.ts`: `type ActionResult<T> = { ok: true; data: T } | { ok: false; formError?: string; fieldErrors?: Record<string, string[]> }`.

- Every onboarding-chain server action returns `ActionResult` (no throw-for-validation, no redirect-on-error). Redirect only on success, outside try/catch.
- Every form uses `useActionState`; on failure: render field messages adjacent to inputs with `role="alert"`, set `aria-invalid`, link via `aria-describedby`, focus the first invalid field, **preserve entered values**. Build one small client helper/component and reuse it (login page a11y work in Wave 3 uses the same helper — one implementation, two defects closed).
- Any UI rule that disables a control (`disabled={...}`) must render an adjacent visible reason. Grep-audit in §8.4 enforces this for the known instances.

### SP-3 — Normalization + identity keys (kills C3)

`src/lib/normalize.ts`:
- `normalizeLegalName(s)`: Unicode NFKC → trim → collapse internal whitespace runs → casefold. Stored in new column `Client.nameNormalized`.
- `normalizePrefix(s)`: trim → must already match D3 regex (reject, don't transform, except uppercase of lowercase input is allowed as an explicit UX courtesy **before** validation, mirrored in UI).
- `normalizePhone(s)`: Uganda-first E.164 (`0.. / 256.. / +256..` → `+256..`), returns null for non-parseable. Used by member duplicate detection (M-006) and bulk import (B-010/B-013).
- `normalizeNationalId(s)`: trim, uppercase, strip internal spaces.

Schema additions (db-push-managed): `Client.nameNormalized String` + `@@unique([operatorTenantId, nameNormalized])`; `@@unique([operatorTenantId, memberNumberPrefix])`; `Group` gains `@@unique([clientId, nameNormalized])` (add `Group.nameNormalized`); member identity uniques per §6.6. **Each unique ships only after its §7.1 collision report is clean.**

### SP-4 — DB constraint pack (kills C2 at the last line of defense)

`prisma/sql/2026-08-10_onboarding_invariants.sql` (idempotent `DO $$ ... IF NOT EXISTS` blocks), applied per §0.5, each preceded by its audit query:

```sql
-- preflight: SELECT id FROM "PackageCoContributionCaps" WHERE "familyCap" IS NOT NULL AND "familyCap" < "individualCap";
ALTER TABLE "PackageCoContributionCaps" ADD CONSTRAINT caps_family_gte_individual
  CHECK ("familyCap" IS NULL OR "familyCap" >= "individualCap");
ALTER TABLE "PackageCoContributionCaps" ADD CONSTRAINT caps_positive
  CHECK ("individualCap" > 0 AND ("familyCap" IS NULL OR "familyCap" > 0));
-- copay bounds, waiting-period bounds, tariff amount > 0, group date order, benefit sublimit >= 0 …
-- exact table/column names to be confirmed against schema.prisma at implementation time; keep one
-- constraint per invariant listed in §5/§6 tables.
```

A real-DB test (`tests/db/constraints.test.ts`, self-skipping unless the test DB env var is present — copy the AUTOPILOT_TEST_DB pattern) asserts via `pg_constraint` that every named constraint exists, and that a direct raw insert violating each one is rejected. This is the handoff's "prove the database constraint rejects an invalid direct write".

### SP-5 — Mutation envelope: transaction + audit + idempotency (kills C4 residue + U-phase)

`src/lib/mutation.ts` helper (or per-service convention, but one shape): every create/state-change =
1. zod-validated input (SP-1),
2. single `$transaction` (no partial writes — DEF-026's group+links, tier default flips, member+number),
3. `writeAudit` **inside the service** with `{ before, after }` metadata (stops the caller-forgets-audit class — scheme edits are currently silent),
4. unique-constraint-backstopped idempotency; P2002 mapped to a friendly `ActionResult` error (`isP2002` helper exists at `src/app/(admin)/settings/tenants/actions.ts` — extract and reuse),
5. client-side: submit buttons disabled-while-pending with visible pending state (U-003).

### SP-6 — One eligibility evaluator, five channels (kills C5; prerequisite for Q-phase)

Single service `evaluateEligibility({ tenantId, memberRef, serviceDate, benefitCode?, providerId?, branchId? })` returning `{ conclusion, reasonCode, memberStatusAsOf, policyWindow, packageVersionId, limit, used, held, remaining, explanations[] }`.

- **Reason codes are a closed enum matching the oracle exactly:** `ACTIVE, POLICY_NOT_STARTED, NOT_YET_ENROLLED, WAITING_PERIOD, SUSPENDED, ACTIVE_AS_OF_SERVICE_DATE, TERMINATED, LAPSED, COVERAGE_GAP, REINSTATED, AGE_BOUNDARY, OVER_AGE_DEPENDANT, LIMIT_EXHAUSTED, PROVIDER_EXCLUDED, MISSING_REFERRAL, EMERGENCY_REFERRAL_EXCEPTION, RENEWAL_VERSION, NOT_FOUND` (EO-001..024).
- **As-of-service-date semantics everywhere** (L-012/L-013/Q-phase): evaluation consults coverage periods, not just current status; a terminated member is eligible for service dates inside a covered period (`ACTIVE_AS_OF_SERVICE_DATE`).
- Consumes the **member's pinned package version** (never "latest"), group status, policy window, waiting periods (benefit-level), age rules, annual/sub/shared limits net of usage **and holds**, provider network/tier rules, and (once Wave 2 lands) exclusions + referral rules.
- All five channels rewire to it: admin member view, HR view, member portal `/benefits`, provider portal eligibility, provider API routes, plus preauth/claims decision services' eligibility gate. Channel adapters may *project* (hide fields from providers) but never *recompute*.
- Detailed current-state divergence map and rewiring order: §6.8.

### SP-7 — Authorization stays single-source (protects Waves 3–4 from re-fragmenting)

The canonical catalog + persona matrix from WP-2/WP-R6 (`tests/security/persona-authority-matrix.ts`) remains the only authority. D2's new read surfaces = catalog change + sidebar derives from catalog + route guards enforce. **Never gate anything on `rbacService.hasPermission` alone** — prod has zero Role/Permission/UserRoleAssignment rows; dynamic-permission gates fail closed in prod (verified previously; restated as landmine L-6).

### SP-8 — Drift detectors (makes the classes un-regressable)

- `tests/consistency/validation-coverage.test.ts`: statically walks `src/app/**/actions.ts` exports + tRPC routers touching the onboarding entities and asserts each imports its `src/lib/validation/*` schema (convention: schema module name per entity; test greps import graph). New write path without canonical schema = red CI.
- `tests/consistency/currency-labels.test.tsx` (§5 W2): no user-visible hard-coded currency literal outside the formatter/allowlist module.
- Extend `tests/audit-coverage/catalogue.ts` with CLIENT/GROUP/TIER/PACKAGE_CAPS/SHARED_LIMIT/MEMBER_LIFECYCLE actions so the audit-coverage suite polices this surface (it currently has zero entries for them).
- Reason-code enum test: evaluator's enum === oracle list, no strays.

---

## 4. Wave 0 — release stop line (ship first, alone, same day)

### WP-0.1 — DEF-027: family cap can persist below individual cap (S1)

Verified current state (all three layers open):
- Action: `src/app/(admin)/packages/[id]/coContribution.actions.ts:95-106` — `Number(formData.get(...))` for both caps, direct upsert, no relational/finite/positive checks, no audit.
- Router: `src/server/trpc/routers/coContribution.ts:83-90` — `setCaps` with bare `z.number()`, same blind upsert (a second, independently reachable write path).
- Schema: `PackageCoContributionCaps` (`prisma/schema.prisma:5391-5392`) `individualCap Decimal @db.Decimal(12,2)`, `familyCap Decimal?` — no constraint.

Fix (apply SP-1/2/4/5 in miniature — this WP is the template PR for everything after):
1. `src/lib/validation/co-contribution.ts`: `capsSchema = z.object({ individualCap: money.positive(), familyCap: money.positive().nullable() }).superRefine(family >= individual when non-null)`.
2. Action: parse via schema → `ActionResult` with field-level message on `familyCap`; upsert inside transaction; `writeAudit` with `{ actor, before: {individualCap, familyCap}, after }`; `revalidatePath` the package detail route by **packageId**.
3. Router `setCaps`: same schema via `.input(capsSchema.extend({ packageId }))`; tenant-scope the upsert (assert package belongs to `ctx.tenantId` — check current code, add if missing).
4. UI `CoContributionRulesManager.tsx`: render field errors (SP-2 helper), client-side mirror check for instant feedback (UI is a courtesy, not the control).
5. SP-4 constraints `caps_family_gte_individual`, `caps_positive` + preflight audit of existing rows (report any `familyCap < individualCap` rows for governed repair — expect none in prod besides UAT leftovers; the run restored 300,000/600,000).
6. Tests (`tests/actions/coContribution.actions.test.ts` + router + db):
   - reject 300000/299999 (assert **no** upsert occurred), accept 300000/300000, accept 300000/600000, accept null family, reject 0/negative/NaN/Infinity/non-numeric strings,
   - router cannot bypass (same asserts through tRPC caller),
   - real-DB: raw SQL insert violating constraint rejected,
   - regression must **fail on `39bb24e`** before the fix (run once to prove, per handoff §8).
7. Deploy → rerun **P-014 through the front end** including close/reopen persistence (P-014/4) → update workbook row → only then proceed to Wave 1.

**Exit gate for Wave 0:** P-014 passes on the deployed UAT build; DEF-027 workbook row shows build, retest result, evidence.

---

## 5. Waves 1–4 — the remaining 15 product defects (handoff order, enriched with verified code state)

### Wave 1 — client & member-identity integrity (DEF-013, -014, -015, -017, -012)

Verified current state (sweep track 1; all at `39bb24e`):
- Create path `src/app/(admin)/clients/new/actions.ts:9-42`: only `name`/`type` required; `currency = formData.get("currency") || "UGX"` silent default; no zod; no name uniqueness; prefix optional → defaults `"MVX"`.
- Service `src/server/services/clients.service.ts`: `slugify` (`:12-19`) lossy (`"L&M"`/`"L M"`/`"L/M"` collide; symbol-only names → literal `"client"`); the **only** uniqueness check is slug `findFirst` (`:56-62`) — TOCTOU, name-dedup only incidental, **explicit distinct slug bypasses name dedup entirely**; prefix sanitation is `trim().toUpperCase()` (`:80`) — spaces, `/`, `'`, emoji, `=SUM(` all survive; `status: "ACTIVE"` hard-coded (`:82`).
- Update path `clients/[id]/edit/actions.ts:9-36`: **omitting `currency` in the POST silently rewrites the client to UGX** (`:16`); no rename uniqueness re-check; prefix and slug not editable/visible; reactivation doesn't clear `effectiveTo` (`clients.service.ts:117/:133`); no state machine on `status`.
- Model `prisma/schema.prisma:147-206`: sole unique = `[operatorTenantId, slug]`; **no** name-normalized column, **no** prefix unique; `PayerType` has 5 values but all three client forms/pages expose only 3 (`GOVERNMENT_SCHEME`, `TPA_CLAIMS_MANAGER` uncreatable and render raw).
- No clients tRPC router, no REST client writes (single-action surface — good: fewer paths to guard). Seeds/provisioning duplicate slugify inline (`prisma/seed.ts:53-62` fork) and default prefix `"MVX"` everywhere (`tenant-provisioning.service.ts:60-72`).
- Concurrency: P2002 from the slug unique bubbles raw to the user; no `isP2002` mapping (tenant actions have the pattern to copy, `settings/tenants/actions.ts:94-97`).

**WP-1.1 (DEF-013 + DEF-014) — required fields, explicit defaults, normalized name uniqueness.**
- `src/lib/validation/client.ts`: required `name` (trim, collapse, max 160), `type` (full 5-value enum), `currency` (allowlist UGX/KES/USD — reuse tenant path's list), optional `slug` (explicit regex `^[a-z0-9-]{3,60}$`), optional prefix (D3 regex). UI: no implicit defaults — currency and type are explicit selects with visible preselected values (intentional-default disclosure per handoff).
- Add `Client.nameNormalized` + `@@unique([operatorTenantId, nameNormalized])` (SP-3). Backfill script + §7.1 collision report BEFORE the unique lands. Create + rename paths write it; rename re-checks; P2002 → friendly duplicate error **with link to the existing client** (authorized users).
- Form stays on page with field errors and preserved input (SP-2); concurrency = unique backstop + mapped error (two concurrent identical submits → exactly one client).
- Also fix in passing (same files, same class): expose all 5 `PayerType` values with labels; reactivation clears `effectiveTo`; currency-omission rewrite bug (edit schema requires currency explicitly); status transitions per D8/D9 (currency immutability rule here too — this pre-answers **C-005** so it stops being a blocked scenario).
- Tests: blank submit / name-only submit create nothing and render accessible errors (C-002); exact/case/space-padded duplicates rejected (C-003); concurrent duplicate → one row; currency change blocked once schemes exist (C-005 oracle); edit-omitting-currency does not mutate currency.

**WP-1.2 (DEF-015 + DEF-017) — prefix uniqueness + strict format.**
- D3 regex server-side in `client.ts` schema (reject, don't transform); `@@unique([operatorTenantId, memberNumberPrefix])` after §7.1 prefix collision report (note: **every default-client currently holds `"MVX"`** — the report will collide; resolution: exempt/retire the default-client rows via governed rename before the unique, or scope the unique to non-default clients — decide from report data, document in PR).
- Compatibility check `src/server/services/member-numbering.service.ts` (it builds member numbers from the raw prefix with zero re-validation — after this WP it can trust format; add a defensive assert).
- Prevent conflicting-prefix reactivation (status change re-validates uniqueness among ACTIVE clients if the unique is scoped that way; simpler: operator-wide unique regardless of status — default).
- Tests: six unsafe categories from C-004 (lowercase, whitespace, slash, apostrophe, emoji, formula-like) each rejected with field error + no write; `LMU` on second client rejected; concurrent same-prefix creates → one winner.

**WP-1.3 (DEF-012) — prefix + slug auditable on normal UI.**
- Client detail (`src/app/(admin)/clients/[id]/page.tsx`) gains Member prefix + Slug rows; edit page shows both **read-only** (governance default: immutable post-creation — mutation would orphan member numbers; revisit only with a governed migration flow).
- Reopen test: create → list → detail → edit all show identical persisted normalized values (C-001/3-4 acceptance, REC-004).

### Wave 2 — benefit configuration completeness (DEF-021, -022, -023, -024, -026)

Verified current state (sweep track 2; 22 package write sites, **0 audited**, all at `39bb24e`). This wave carries more hidden defects than any other — the five workbook DEFs are the reachable subset. Fix these as one benefit-config track because they share the version model, the edit-form plumbing, and the tRPC guard gap:

- **Caps/copay/limit invariants all missing at all layers** (the DEF-027 class repeated): `familyCap≥individualCap` (fixed in Wave 0); copay % bound only enforced on the tRPC `BenefitSchema` (`packages.ts:22`) and nowhere on the two action paths (`edit/actions.ts:48`, `coContribution.actions.ts:17` — `500%` and negatives persist; consumed unclamped at `claim-decision.service.ts:667`); fixed copay has no `≥0`/`≤service cost` (negative `planShare`/member credit possible, `calculator.ts:92`); waiting period no `.int()`/max; benefit sublimit never checked `≤` overall annual limit; contribution/premium allows `0`; **money precision drifts** (two confirmed sites: `coContribution.service.ts` rounds `finalAmount`+`planShare` independently so they can miss `serviceCost` by a cent; and the annual accumulator stores `.toFixed(2)` on first claim but `increment`s an unrounded double thereafter, shifting the exact claim where the cap binds).
- **`coInsurancePct` and both `perVisitLimit` columns have NO write path** — schema fields with business meaning that no UI/action/router/service can set (`schema.prisma:2025,2031`); the per-visit *enforcement* machinery is fully built and dead (`benefit-usage.service.ts:486-494`). DEF-022 is "wire the write path to the existing enforcement," not "build enforcement."
- **Two co-contribution engines double-charge** (see §1.1): `claim-decision` copay + cost-share stacks additively with `CoContributionService`'s independent charge on the same billed amount; no precedence across engines. P-013 tests exactly this.
- **Version immutability is half-real**: `BenefitConfig` rows are immutable (no update path), but `SharedLimitGroup`/`PackageProviderEligibility` hang off `packageVersionId` and are mutated in place via three unguarded paths taking a client-supplied `versionId` with no tenant/ownership/"is-current" check (`edit/actions.ts:79,112`, `packages.ts:67`) — **historical versions can be retroactively rewritten**, changing terms for already-enrolled members with no audit. Conversely `updatePackageAction` copies only benefits into the new version, **orphaning all shared limits + provider rules onto the old version** on every save (silent data loss). Version numbering derives `nextVersion` from `currentVersion` not `MAX` (`edit/actions.ts:53`) → P2002 500 when the pointer isn't the latest.
- **No maker-checker, no `PACKAGE_CHANGE` action type, no audit** on any of the 22 sites; a single UNDERWRITER activates a version affecting every member. `ARCHIVED` is cosmetic (still selectable for new groups, still adjudicates).
- **`revalidatePath` bugs**: `edit/actions.ts:96` revalidates `/packages/{packageVersionId}/edit` (a nonexistent path — should be `packageId`); three more revalidate `/packages` instead of the edit page; `updatePackageAction` and `builder` revalidate nothing; no member-surface revalidation after a benefit change (stale terms shown to members).

**WP-2.0 — package-config plumbing (prerequisite for 2.1–2.5, ships first in the wave).** Apply SP-1/2/5/7 across the package surface as one PR: `src/lib/validation/package.ts`, `co-contribution.ts`, `shared-limit.ts` schemas with all money/percent/age/date bounds + cross-field refinements; route **both** the server actions and the tRPC procedures through them; **add role gate to every package tRPC mutation** (part of PROD-BLOCKER-2 fix — `adminProcedure`/`requireRole` equivalent + tenant-ownership assertion on `packageId`/`packageVersionId`); tenant-scope the four unguarded delete/create-by-versionId paths; fix the nested-`<form>` structure (lift the shared-limit and provider-eligibility forms out of the outer form, or convert to imperative `startTransition` calls that don't rely on nested `<form>`); make `updatePackageAction` **copy-forward** shared limits + provider rules into the new version (kill the orphaning); compute `nextVersion` from `MAX(versionNumber)`; fix all `revalidatePath` targets incl. member surfaces; add `writeAudit` with before/after to all 22 sites (extends SP-8 catalogue); add `PACKAGE_CHANGE` approval action type and a version-numbering test.

**WP-2.1 (DEF-021) — currency-label integrity.** Remove hard-coded `Contribution (KES/yr)` at `packages/[id]/page.tsx:84` **and** its twins `edit/page.tsx:88` and `BenefitTiersCard.tsx:82` (all three say KES on a UGX platform where `Package` has no currency column — package money inherits `Client.currency`). Bind every package/tier money label to the client-currency projection (SP formatter). The full needle list of KES literals + UGX-ignoring-record-currency labels (100+ sites across billing/claims/member/provider/reports) is §6.10; Wave 2 fixes the package/scheme/tier subset, the rest ship with their surfaces. Consistency test (SP-8) locks it. Retest P-001/REC-003; P-022 becomes pass-through.

**WP-2.2 (DEF-022) — OUTPATIENT per-visit limit, end to end.** Add write path for the existing `BenefitConfig.perVisitLimit`/`Package.perVisitLimit` columns in builder + edit UI (per-benefit, carried immutably in `PackageVersion`); display on package detail, member benefits, provider eligibility, preauth/claim explanations; the enforcement path already exists (`benefit-usage.service.ts:486-494`) — just turn it on and unit-test at/below/above 300,000. Also wire `coInsurancePct` write path while here (same class of orphaned field) or explicitly document it as unused.

**WP-2.3 (DEF-023) — structured treatment exclusions.** Version-owned model `{ ruleCategory, scope (service/diagnosis/procedure codes), exclusionType, exceptionLogic, effectiveFrom/To, sourceClause, internalNote, memberSafeExplanation }`; overlap/conflict validation at write; immutable on historical versions; evaluated in the SP-6 evaluator + preauth/claims with stable reason codes; member/provider see `memberSafeExplanation` only. Note `BenefitConfig.exclusions[]` (string array) exists but is read only for a "No listed exclusions" chip and enforced nowhere — replace, don't extend. Design so a **package version and a provider contract** can both own rules (N-012 needs contract-scoped exclusions) over one evaluation path. Acceptance = CT-023/CT-024 eligible/excluded/exception/boundary outcomes.

**WP-2.4 (DEF-024) — referral rule + emergency exception.** Versioned model scoped to benefit/service/provider-specialty `{ requiresReferral, emergencyException, effectiveFrom/To, sourceClause, memberSafeExplanation }`; do NOT reuse provider INCLUDE/EXCLUDE rules; evaluated in SP-6 (`MISSING_REFERRAL`/`EMERGENCY_REFERRAL_EXCEPTION`) + preauth; emergency use auditable. Acceptance = CT-025/EO-021/EO-022.

**WP-2.5 (DEF-026) — maternity FAMILY pool saves.** The real mechanism is **two silent failures**, both fixed by WP-2.0's nested-form fix + SP-2 error contract: (1) `SharedLimitsManager.tsx:71` hard-disables the add button below 2 benefits with no message — change to D1's ≥1 rule and render the rule as visible helper text; (2) the nested `<form>` posts to `updatePackageAction` instead of `createSharedLimitAction` (WP-2.0). Then: validate every submitted benefit ID belongs to tenant+package+version; write group+links atomically; the `revalidatePath` version-id bug is WP-2.0; duplicate-group guard; include pool in immutable version display + family usage math. Acceptance = exact CT-015 saves once, reopens once, enforces across family (P-010), P-011 negatives (zero/negative/duplicate/overlap) all get explicit validation.

**Wave 2 exit:** P-001..P-014 rerun clean; REC-003/012/013/015/023/024/025 reconcile; package tRPC mutations role-gated (X-002 pre-cleared).

### Wave 3 — authentication, attribution, operator usability (DEF-005, -006, -010, -002, -004)

These are *finishing* defects on WP-R work already on main — do not rebuild. Verified current state (sweep track 6):

- Lockout exists and works (`auth-credentials.ts`: `MAX_FAILED_ATTEMPTS=5`, `LOCK_DURATION_MS=15m`, state on `User.failedLoginCount/lastFailedLoginAt/lockedUntil`); all three cases (unknown email / locked / wrong password) return an identical generic message by construction — good for enumeration, but the reason it's "unobservable" is there's no locked-state signal, no `retryAfter`, no admin surface reading `lockedUntil`, and **admin password reset does not clear the lock** (`settings/actions.ts:229-232` writes only hash+sessionVersion). Self-service reset does clear it.
- Idle timeout is JWT-`exp` only (`auth.ts:42`, 30m/5m); **no middleware, no per-request check, no client `SessionProvider`** → expiry only materializes when a page/action calls `auth()`, and `requireRole` redirects to `/login` with no `callbackUrl`/reason. Register Member's native `required` attributes block submit before the action runs, masking expiry (the retest symptom).
- Login page has `aria-invalid`/`aria-describedby`/`role=alert`/focus-first-invalid already, but **`required`/`aria-required` are absent on email+password** with `noValidate` on the form (`login/page.tsx:129,149-163,180-194`) — the exact gap; the test suite never asserts requiredness.
- `ProviderNav.tsx:81,93` passes literal `role="PROVIDER_USER"`; no `PROVIDER_ROLE_LABELS` map exists; the six persona role codes live in `UserRoleAssignment→Role.code` and `provider/layout.tsx` is one `rbacService.getUserRoles(ctx.actorId, ctx.tenantId)` call from the real labels. `BrokerSidebar` has **no** `SignedInIdentity` at all (DEF-001 incomplete there). `portal-identity.test.tsx:40-45` currently *pins the wrong behaviour* — amend it.
- Membership Officer nav: sidebar and guards **agree** that Clients (`ADMIN_ONLY`) and Packages (`UNDERWRITING`) are hidden — so this is a governed catalog change (D2), not drift. But the sweep found **real remaining drift** to fix alongside: 4 dead sidebar links CUSTOMER_SERVICE sees but is denied (`AdminSidebar.tsx:78,79,82,127` → `CLAIMS_READ` guards — Offline Capture, Offline Work Codes, Override Queue, Fraud Alerts); `/approvals` authorized for FINANCE_OFFICER but hidden from them; and `CUSTOMER_SERVICE ∈ ANY_STAFF` reaches `/analytics` with no `ANALYTICS:VIEW` grant and no internal narrowing.

- **WP-3.1 (DEF-005) lockout observability:** document D6 policy and align code constants to it; emit `AUTH_ACCOUNT_LOCKED` **and a new unlock/expiry/reset-clears event** (currently only the lock event exists, and it omits `tenantId` so it's outside the hash chain — add `tenantId`); make the admin Users & Access detail read `lockedUntil` + remaining time; **fix admin reset to clear `lockedUntil`+`failedLoginCount`** (`settings/actions.ts:229`); keep public messaging generic. Extend `tests/lib/auth-lockout.test.ts` with duration/recovery/admin-reset-clears cases.
- **WP-3.2 (DEF-006) login a11y:** add `required`+`aria-required="true"` to email+password only (`login/page.tsx:149-194`); keep the existing `role=alert`/`aria-invalid`/`aria-describedby`/focus machinery; set `aria-invalid="false"` (not `undefined`) when valid; add the missing assertion to `tests/components/login-accessibility.test.tsx`. Compare deployed behaviour, not just source.
- **WP-3.3 (DEF-010) idle expiry at point of action:** add a lightweight client session-expiry check (mount a `SessionProvider` or a poll) that fires **before** native field validation on protected forms (Register Member first); on expiry show a consistent message + redirect carrying `?reason=expired`, and have `/login` render an expiry banner; state that no unsaved data survives (default); server actions already fail closed — verify each onboarding mutation redirects with reason not silently; zero partial members (SP-5 transactionality). Tests: `tests/lib/session-policy.test.ts` (add a behavioural expired-session case) + a form-level test. **Note:** the absence of `middleware.ts` is the structural cause — consider adding one as the single expiry+auth chokepoint (also helps PROD-BLOCKER-2), but scope that carefully against the per-page-guard model.
- **WP-3.4 (DEF-002) provider role label:** add `PROVIDER_ROLE_LABELS` map (six personas); call `rbacService.getUserRoles` in `provider/layout.tsx`, thread the label into `ProviderNav`→`SignedInIdentity` (replace the literal at `:81,93`); **also add `SignedInIdentity` to `BrokerSidebar`** (DEF-001 completion); correct across logout/login + multi-tab. Amend `portal-identity.test.tsx:40-45`. **Depends on PROD-BLOCKER-1** — provider persona roles can't be assigned in prod until RBAC rows are seeded, so this label is empty in prod until then; sequence WP-3.4 after the RBAC seed.
- **WP-3.5 (DEF-004) Membership Officer discoverability:** per D2 — catalog grant + sidebar + read-only Clients/Packages pages + breadcrumbs `Client → Group/Scheme → Package → Members`; server-side guards keep mutations closed (X-001/X-002 pre-check). Fix the 4 dead links (narrow the sidebar `roles` to match the `CLAIMS_READ` guards — never widen the guards; `claims-surface-authorization.test.ts` pins this direction), the `/approvals` finance visibility, and the `/analytics` catalog/enum divergence in the same PR. Add a consistency test cross-checking every nav item's `roles` set against its target page's `requireRole` (GAP-13 — nothing does this today, which is why the dead links survived two prior waves). Fresh-eye acceptance = locate all five concepts < 60s (R-004 rerun).

### Wave 3.5 — production-blockers & member-integrity core (NOT in the workbook; several are S1-class)

These were found this pass and sit behind the P-014 stop-line. They must ship before the deep phases run, and two are prerequisites for a functional prod at all. Sequence: 3.5A/B early (prod-blockers), 3.5C-G with their phases.

- **WP-3.5A (PROD-BLOCKER-1) — seed baseline RBAC + fallback gates.** Seed `Role`/`Permission`/`UserRoleAssignment` rows for prod (and every environment), and make the `rbacService`-only gates fall back to the role baseline via `effectivePermissions()` (the hybrid path already exists at `catalog.ts:163-193` — the failing surfaces just don't use it). Fixes the quotation/intake/binding/override/**role-admin bootstrap deadlock**/provider-persona-assignment lockout (`rbac.service.ts:121`, etc.). Without this, prod is non-functional regardless of the UAT. Real-DB test that a freshly provisioned tenant can assign the first role.
- **WP-3.5B (PROD-BLOCKER-2/3 + PRIVACY-S1-A/B) — close the parallel authorization doors.** (1) Role-gate every tRPC mutation: migrate the 30 routers to `adminProcedure`/`permissionProcedure` (or add a tRPC auth middleware), **but first fix `adminProcedure` — it currently admits `REPORTS_VIEWER`** via `INTERNAL_STAFF_ROLES` (`catalog.ts:216`, flagged as an open matrix item); add tenant-ownership assertions on client-supplied ids. (2) Add role checks + analytics scope to `api/reports/[reportType]/export` and `api/reports/pdf` (28 of 33 reports currently unscoped). (3) Fix `provider-eligibility.service.ts:114-131` default path to entitlement-scope the member lookup (or flip `entitlementEnforcement` default to true) — no tenant-wide name disclosure from a provider login; this is an S1 privacy fix. (4) Fix N3: add `if(!groupId) notFound()` guards + `tenantId` filter to `hr/roster/[memberId]`, `hr/utilization`, `hr/support` (`page.tsx`). Each with a focused authorization test. This wave pre-clears X-002/X-003/X-004/X-008/X-010.
- **WP-3.5C — member numbering + prefix integrity.** Fix `binding.service.ts:266,335` to pass `clientId` (bound members currently get `MVX-` not `LMU-`); the `@@unique([operatorTenantId, memberNumberPrefix])` is Wave 1 (WP-1.2); guard the `orderBy: memberNumber desc` string-sort against >99999 padding; block silent prefix change on a client with members (or version it). Pre-clears M-001, Z-002.
- **WP-3.5D — age rules 24/65 enforced.** One shared `computeAge(dob, asOf)` helper (calendar-correct — replace the 3 divergent 365.25 copies); enforce `dependentMaxAge`/`maxAge`/`minAge` at every enrolment path (manual, tRPC, both imports, endorsement, binding), at renewal (wire the dead `reclassifyAgeBands` output to an age-out endorsement or exception list), and in the SP-6 evaluator (`AGE_BOUNDARY`/`OVER_AGE_DEPENDANT`). Add `.int().min(0).max(120)` to the age zod. Pre-clears M-008/009/010/011, EO-015/016, V-004.
- **WP-3.5E — coverage periods for every enrolment path + inclusive leaver dates.** Open a `MemberCoveragePeriod` on manual, endorsement, and import enrolment (only binding does today) so the point-in-time engine sees every member; accept and honour an **operator/endorsement effective date** (manual path hard-codes `new Date()`); make leaver termination use the approved `lastDay` (`endorsement.service.ts:172-179` discards it) and write `coverEndDate`; `closeOpenPeriods` on SUSPEND too. Pre-clears L-001..017, EO-010/011/013/014, and the entire as-of-service-date basis of Q-phase.
- **WP-3.5F — HR enrolment channel parity + relationship integrity.** Route `endorsement.service.ts:150-171` (the HR/endorsement member-create) through `MembersService.createMember` so it gets duplicate detection + fraud screen + principal validation + audit, and stop dropping `idNumber`/`phone`/`email` and `principalIdNumber` (dependants currently created unlinked). Fix binding's gender→relationship derivation (`binding.service.ts:331-333`). Add `SIBLING` to `MemberRelationship` (migration) or a documented mapping + `relationshipNote`. Newborn rule (30-day window, DOB-as-effective). Pre-clears M-002/003/012/013, B-007/008/009, E-001..015.
- **WP-3.5G — member lifecycle state machine + edit-form lockdown.** Explicit `MemberStatus` transition table (D9); block the free status `<select>` in `MemberEditForm.tsx:107` from moving terminal→active (route through governed reinstatement); guard terminal re-termination; distinct audit action per transition (not generic `MEMBER_UPDATED`); dedicated audit events on the currently-silent paths (endorsement approve/reject, HR add/import, auto-suspension, reinstatement). Pre-clears M-019, L-017, X-009.

### Wave 4 — UAT governance & controlled fixtures (DEF-001, -003, -008, -009, -018, -019, -020, -025)

Not production code (except one small product field), but they gate full coverage — see §7. One product change hides here: **DEF-019 wants a safe, reversible client field for audit testing** — add `Client.operationalNotes` (nullable text, editable, audited with before/after). That simultaneously gives C-007/CT-035 its safe mutation target and improves ops. Everything else in §7.

---

## 6. Forward-hardening — phase-by-phase against the published oracle

Scope note: each subsection lists (a) what the blocked scenarios will do (from workbook step level), (b) verified current-state gaps, (c) required work. Where current state is already adequate, the entry says "verify only" — do not gold-plate. Ship §6 items **in the retest's execution order** (S → N → M → B → E → L → V → Q → X/U/Z) so partial deployment still extends run depth.

### 6.1 Cross-cutting findings already confirmed (fix with their nearest wave)

- **F-PIN-1 (S2-equivalent, money-affecting):** `/api/v1/benefits/route.ts:62-66` resolves the **latest** `PackageVersion` by `versionNumber desc`, while cost-share/usage/preauth all use `member.packageVersionId`. Facility-facing quoted limits can diverge from what adjudication pays. Fix inside SP-6 rewiring (evaluator uses the pin; the API becomes a projection of the evaluator).
- **F-PIN-2:** `binding.service.ts:205-224` and `quotations/[id]/actions.ts:56-73` create Groups with `packageVersionId = null`; `cost-share.service.ts:106-111` / `benefit-usage.service.ts:102-107` **fail open** (zero cost-share / null usage) on null pins. Fix: backfill pins (§7.1 report), make pin required at create, fail **closed** with explicit error when unpinned.
- **F-PIN-3:** `amendment.service.ts:359-392` updates `packageId` but not `packageVersionId` on package change — leaves group/member pinned to a version of a *different* package. Fix in the same amendment transaction; add invariant test (pin's package must equal `packageId` — also a §SP-4 candidate as a trigger-less consistency check in the recon script).
- **F-TEN-1 (security):** `clientResolve.ts:11-18` returns caller-supplied `clientId` without tenant validation → forged POST attaches a scheme to a foreign tenant's client. Fix immediately in Wave 1 (one-line ownership check + test), regardless of S-phase timing.
- **F-CUR-1:** `Group.currency` defaults UGX and is never synced from client — schemes under KES clients are stamped UGX and consolidation FX-converts mismatched values. Fix: set from client at create; recon report for existing rows (§7.1).

### 6.2 S-phase — Scheme & Policy (S-001..S-012)

What the run will do: create `Lakeview Staff Medical Scheme 2026/27` bound to client+package with effective 2026-08-01 (renewal derived 2027-08-01, UGX); blank/duplicate-name (case/space)/duplicate-registration negatives; date validations incl. leap-day and renewal-before-start; future/past-start scheme eligibility; ACTIVE→SUSPENDED cascade with **immediate** member-parity + governed restore; LAPSED/TERMINATED terminal, no casual reactivation; tiers (exactly one default, default auto-assignment, in-use tier change requires migration, unused tier delete audited); version pinning (old service dates resolve old version after v2 approval); cross-client package binding blocked server-side; contact/payment-frequency edit audited with before/after and zero eligibility impact.

Verified gaps at `39bb24e` (sweep track 1):
- Duplicate-name check is tenant-scoped not client-scoped, un-trimmed, and **create-only** (`groups.service.ts:63-68`); rename never re-checks; **Group has no unique constraint of any kind**; quotation/binding/individual paths skip the check entirely (`quotations/[id]/actions.ts:56`, `binding.service.ts:205`, `groups/new/individual/actions.ts:48-66`).
- `effectiveDate` parsed unguarded (`new Date(...)` → Invalid Date reaches Prisma); **no `effectiveDate < renewalDate` check anywhere in src**; update writes both dates unconditionally (`groups.service.ts:133-134`).
- tRPC `groups.create` (`routers/groups.ts:16-31`) — `effectiveDate: z.string()` (anything passes), no trim/max; **no update procedure** (updates go through the zodless action `groups/[id]/edit/actions.ts`).
- Status: free `<select>` (`GroupEditForm.tsx:95-101`) → unconditional write (`groups.service.ts:135`). Terminal states reversible; `suspendedAt/suspensionReason/terminatedAt` never set on manual path; **manual suspension does not cascade to members** (only `suspension-check.job.ts:53-56` does); reactivation never un-suspends members; **scheme edits and status changes emit no audit events at all** (no `writeAudit` in `groups/[id]/edit/actions.ts`).
- Autopilot eligibility deny-list omits `PROSPECT`/`PENDING` (`claim-autopilot/evaluate.ts:107`) while UI/API sites require `=== "ACTIVE"` — split-brain.
- Tiers (`groups/[id]/tiers/actions.ts`): `Number()` NaN into Decimal; packageId not tenant-verified; default-flip not transactional (crash → zero defaults); no default auto-assign at enrolment (`members.service.ts:143-161` leaves `benefitTierId` null); delete-with-members guard EXISTS (`:82` — verify only); tier actions unaudited; no guard on deleting the default tier; tier package change doesn't migrate members.
- `registrationNumber` max+1 non-transactional, no unique (`groups/new/individual/actions.ts:38-46`).

Work (WP-S1..S4, sized as one PR each):
- **WP-S1 validation+identity:** `src/lib/validation/group.ts` (trimmed name ≤ 160, client-scoped duplicate rule, registration format, `z.coerce.date()` + `effectiveDate < renewalDate` + sane horizon, paymentFrequency enum); apply to service + router + all four create paths (quotation/binding/individual paths route through `GroupsService.createGroup` or at minimum the schema); `Group.nameNormalized` + `@@unique([clientId, nameNormalized])` + unique on `registrationNumber` where non-null (post §7.1 report); tenant-check fix F-TEN-1; date semantics documented (inclusive end, Africa/Nairobi — L-016 will probe the 00:00 boundary).
- **WP-S2 lifecycle state machine + cascade:** explicit transition table per D9 (`PROSPECT→PENDING→ACTIVE→{SUSPENDED↔ACTIVE, LAPSED, TERMINATED}`; terminal exits only via governed override); dedicated Suspend/Reactivate/Terminate flows with reason + effective time; manual suspend cascades member eligibility **immediately** (via status or via SP-6 consulting group status as-of — SP-6 already consults group status: verify all channels do; the cascade for member rows then only matters for list displays — decide and document); reactivate restores; `suspendedAt/terminatedAt/reason` set on every path; audit with before/after on every transition; align autopilot deny-list (`PENDING`/`PROSPECT` not eligible).
- **WP-S3 tiers:** transactional default flip; exactly-one-default enforced (partial unique index `ON (groupId) WHERE isDefault`); default auto-assign at enrolment; tenant-verify packageId; NaN guards via schema; audit all three actions; in-use tier package change requires the member-transfer flow (block direct edit with pointer); protect default-tier delete.
- **WP-S4 pinning:** F-PIN-2/F-PIN-3 fixes; scheme detail displays pinned version; version resolution by service date honoured in SP-6 (S-009 acceptance: old service dates resolve old version after v2).

### 6.3 N-phase — Provider network & tariffs (N-001..N-015)

Much of this domain is well-built (lifecycle transition map, FULLY_EXECUTED enforcement chain, 90-day backdate override, LISTED-scope V1, overlap auto-suspend). The gaps that will fail the run (sweep track 7):

- **WP-N1 tariff validation (blocker, N-009):** `providers/[id]/actions.ts:248,316-317` — `agreedRate`/`bundledRate`/`perDayRate` have **no server validation**; zero/negative/NaN persist. Add `src/lib/validation/tariff.ts` (`.positive().finite().multipleOf(0.01)`, `effectiveFrom<effectiveTo`), apply to the action + the tRPC `providers.addTariff` (which has `.positive()` but no date check and **no tenant-verify of `providerId`**, `providers.ts:103-111`) + diagnosis-tariff path. Field-level errors, no partial row.
- **WP-N2 tariff overlap + deterministic pricing (blocker, N-010):** there is **no effective-date overlap detection for tariffs anywhere**, and the two resolvers disagree — `provider-contracts.service.ts:118` picks latest `effectiveFrom`, while the engine's `findMany` (`contract-engine/engine.ts:160-170`) has **no `orderBy`** → non-deterministic price on overlap. Add overlap detection at write (block or deterministic priority), and give the engine query a deterministic `orderBy` matching the legacy resolver, or (better) unify both on one resolver. Compare with the contract-level `CON-010` which already fails loud.
- **WP-N3 in-use tariff delete (blocker, N-011):** `providers/[id]/actions.ts:303,351` **hard-delete** tariffs despite the schema's "never delete — deactivate" contract, with no check for referencing claims / `ServiceMappingMemory.tariffId` (required non-cascading FK → raw P2003 to user). Convert to soft-deactivate (prospective), block/guard when referenced, keep historical pricing reconstructable.
- **WP-N4 provider suspension propagation (blocker, N-014):** `provider-eligibility.service.ts` never reads `contractStatus`, and neither do `/api/v1/eligibility` or `/api/v1/benefits` — a SUSPENDED provider still returns ELIGIBLE + member PII. Add the status gate to all three (claim/preauth intake already check it). Also fix **GAP-A1.2**: `syncProviderSummary` (`provider-contracts.service.ts:338`) unconditionally rewrites `contractStatus` to ACTIVE on any contract transition, **silently reverting a manual suspension** — make it respect a manual-suspension flag. And `ProviderApiKeyService.verify` doesn't check provider status — a suspended facility's API keys keep working.
- **WP-N5 unsigned-activation + backdate governance (N-005, N-006):** the `allowUnsigned` waiver is a bare checkbox (`contracts/actions.ts:109`) with no override record/second approver, and the tRPC path takes it + `backdateOverrideId` **straight from client input, unverified** (`contracts.ts:229-231`). Require an approved override record for both (mirror the UI backdate path); role-gate the tRPC (PROD-BLOCKER-2). Fix `attachBranchAction` (`manage-actions.ts:119`) which attaches a branch **without verifying it belongs to the contract's provider** (foreign branch satisfies V1/CON-008).
- **WP-N6 contract-level exclusions (N-012):** pair with WP-2.3 — the structured exclusion model must be ownable by a provider contract, not only a package version.
- **Provider portal scoping (N-015):** correctly own-scoped already (`provider-contract-view/service.ts`) — verify only; low-priority GAP-A6.1 (own-contract rate view shows all-payer client-specific rates) is a policy call, flag don't fix.

### 6.4 M-phase — Manual enrolment (M-001..M-019)

Substrate fixes are WP-3.5C/D/E/F/G. Verified current state (sweep track 3) + M-specific work:

- Duplicate detection: national-ID and phone are exact-match tenant-wide (no normalization → `M-005` case/space and `M-006` `+256/256/0` formats slip through); name+DOB is group-scoped only; **email has no duplicate check at all**. Add `normalizePhone`/`normalizeNationalId` (SP-3) + email dedup; back these with DB uniques where safe, since the probes are read-then-write with no unique backstop (concurrent M-017 double-submit passes both — add transactional create + unique).
- DOB sanity: `MemberNewForm.tsx:109` has no `max`; future DOB reaches Prisma as `Invalid Date` raw error. Add DOB refinements (no future, sane floor) to `src/lib/validation/member.ts`, applied to action + tRPC (`members.ts:23` is bare `z.string()`).
- `members.service.ts:160` hard-codes `status:"ACTIVE"` (bypasses `PENDING_ACTIVATION` + payment gate) and `:159` `enrollmentDate:new Date()` (admin form has no effective-date field — fix in WP-3.5E). Number allocation + create are **not transactional** (WP-3.5C/SP-5).
- Age boundaries (M-008/009/010/011): WP-3.5D. Newborn without ID (M-012): WP-3.5F. Dependant-owns-dependant (M-013) is guarded (`members.service.ts:77-79` — verify only); dependant cross-scheme (M-014) inherits silently (`:80-83`) — make the rejection explicit server-side.
- Unicode/search (M-015), email/phone format (M-016): add format validation + ensure normalized storage stays searchable.
- Idempotency (M-017): SP-5 disabled-while-pending + transactional create + unique backstop.
- Member edit lifecycle bypass (M-019): WP-3.5G.
- Test scaffolding: `tests/routers/members.test.ts` is a literal placeholder — build real coverage here.

### 6.5 B-phase — Bulk enrolment (B-001..B-017)

Verified current state (sweep track 3) — the import surface is the least safe write path in the app:

- **WP-B1 re-validate server-side + transaction + idempotency (blocker):** `confirmImportAction` (`members/import/actions.ts:123-208`) `JSON.parse`s the client-posted `rows` and filters only `!r.error` — `validateRow` is **never re-run server-side**; a tampered/stale payload bypasses every check. It's a bare `for` loop with per-row try/catch, **no transaction, no batch record, no idempotency** — a failure at row 400/500 leaves 399 members; re-uploading relies entirely on the (weak) per-row probes and re-creates duplicates if a different group is selected. Add: server-side re-validation, a persisted `ImportBatch` with an idempotency key, per-row upsert semantics, and a downloadable reject file (counts are currently ephemeral React state — the failed-row list is lost on navigate).
- **WP-B2 parser safety (B-003/004/005/014):** empty/header-only refuse Confirm (guard exists — verify no audit claims success); malformed CSV / wrong type rejected safely; header aliases/reorder mapped, unknown columns ignored-with-note, missing required = row errors (no column shift); `isExample=true` aborts the whole parse (guard exists `:96-104`); **CSV formula injection** (`=`,`+`,`-`,`@`,tab) neutralized on import **and every export** — this is a real gap and also a Z-phase/export concern.
- **WP-B3 linkage + dedup (B-007/008/009/010/011):** two-pass principal→dependant linking exists but the dependant lookup is **unscoped by group** (`:171-175`) so members land in the wrong scheme; unknown principal → dependant created **unlinked as its own root, counted imported** (silent orphan). Fix with WP-3.5F duplicate detection + explicit principal-specific failures + group scoping. Idempotent re-import (B-011) via WP-B1's batch key.
- **WP-B4 HR-lane parity (B-016/017):** HR import correctly creates one `Endorsement` per row (not live members) — but `endorsementNumber` is `REQ-${random 5-digit}` with **no uniqueness** (collides ~350/yr, pollutes the shared `END-` sequence), `effectiveDate` hard-codes today, `idNumber/phone/email/principalIdNumber` are written to `changeDetails` then **discarded on approval** (WP-3.5F), and there's no bulk-approve (500 rows = 500 manual approvals). No audit anywhere in the HR import file. Fix numbering (sequence, not random), carry the fields through approval, add audit; consider a bulk-approve surface.
- Date/age rules identical to manual (WP-3.5D); 5,000-row SLA (B-015) is a perf check — verify progress UI + exact reconciliation after WP-B1's batch model lands.

### 6.6 E/L/V-phases — Endorsements, lifecycle, renewal (E-001..015, L-001..017, V-001..008)

Verified structural findings (sweep track 3) that must be resolved before these phases run:

- **Two non-interoperating endorsement engines.** Legacy `EndorsementsService` (SUBMITTED→APPLIED one click, handles ADD/DELETE, no approver-role check, no back-date control, no snapshots, crude pro-rata) vs Process-7 `amendmentService` (full DRAFT→SUBMITTED→APPROVED→APPLIED, approver matrix, back-date override, snapshots, day-count pro-rata — but handles only TIER/TRANSFER/PKG/CORRECTION, **not** ADD/DELETE). The UI "Approve & Apply" calls the **legacy** service, so `MEMBER_ADDITION`/`MEMBER_DELETION` — the most-tested types — get no approver-role check (E-004), no back-date control (E-007), no snapshots. **WP-E1: converge on one engine** (route ADD/DELETE through the governed `amendmentService` path or backport its controls to the legacy path). Maker≠checker exists on legacy (`endorsement.service.ts:114`) but with no role check; `rejectEndorsement` is a bare update with no status guard and discards the required reason.
- **Legacy MEMBER_ADDITION bypasses `MembersService`** (raw `prisma.member.create`, `endorsement.service.ts:150`) → no dup/fraud/principal checks, drops `idNumber/phone/email`, never links `principalId`, no audit — WP-3.5F. **MEMBER_DELETION discards `lastDay`, ignores `effectiveDate`, never sets `coverEndDate`, never closes coverage periods** (`:172-179`) — WP-3.5E. `BENEFICIARY_UPDATE` is routed but has no apply case (`default:break`) — approves-and-applies while changing nothing.
- **Lifecycle: no state machine, free status `<select>` defeats every control** (WP-3.5G); every lifecycle path hard-codes `new Date()` so **inclusive-last-day is unimplementable** (WP-3.5E); `case.service.ts:49` deny-list omits the `TERMINATED_*`/`CANCELLED_*` variants (a fraud-terminated member can have a case opened); auto-suspension writes no audit.
- **Renewal transitions NO members** (`renewal.service.ts:258-291` touches two Group rows only) — members keep the superseded group + old `packageVersionId`, so post-renewal claims price on last year's config and renewed members vanish from the pipeline. Usage counters anchor to the **member's `enrollmentDate` anniversary**, not the scheme year (mid-year joiners get a fresh annual limit inside the same scheme period). **WP-V1: renewal must reassign `groupId`+`packageVersionId` and re-anchor the benefit period**; wire the dead age-band reclassifier to age-outs (V-004). Waiting periods are preserved correctly (but `Member.waitingPeriodEnd` is written only by reinstatement and **read nowhere** — inert).

Oracle demands (compressed to the invariants), each now backed by the WPs above:
- **Endorsements:** HR request → SUBMITTED, scoped, inert until approval; approve+apply exactly once (member created once, eligible no earlier than effective date, maker/checker audit); reject with visible reason, Apply unavailable; **maker blocked at every approval route** (E-004); **two-checker race → exactly one winner, loser sees already-actioned** (E-005); leaver inclusive last day (Grace: covered 08-06, not 08-07); backdated leaver flagged/authorised, history intact; add/remove dependant precision (remove Chantal ends only Chantal); tier change pro-rata day-count correct; benefit modification governed/effective-dated/immutable history; data correction re-runs duplicate/age rules; admin-only changes touch nothing financial/eligibility; **material change unapprovable without source evidence attachment** (E-015).
- **Lifecycle:** explicit suspend/reinstate/lapse/cancel/terminate flows with reason+effective time; parity ≤ 5s; reinstate does not silently reset waiting/usage; catch-up window honoured, gap dates stay uncovered; member self-service reinstatement request queue with explicit reset-waiting choice; cooling-off vs standard cancel distinct (window, once, refund vs notice period, future-effective, no backdate w/o override); breach/fraud termination (fraud = SA-only + blacklist, not reversible via edit); death workflow with explicit dependant disposition; **point-in-time eligibility honours historical coverage windows** (L-012/013 — this is SP-6 as-of semantics); family independence (suspend Brian ≠ suspend household); **open preauth holds released or explicitly retained on termination, never double-restored/negative** (L-015); 00:00 Africa/Nairobi boundary exact (L-016); invalid transitions blocked with current-state message, no duplicate coverage periods (L-017).
- **Renewal:** preview reconciles without mutating live cover; renew-unchanged carries members exactly once, usage resets only at period boundary; renewal version resolution by service date; age-outs flagged pre-bind, no silent continuation or mass termination; **expired-without-approved-renewal = not eligible, reason RENEWAL_VERSION/pending, draft benefits never apply** (V-005 / EO-005); backdated approval explicit+authorised+audited, interim treatment deterministic; usage reset exactly once (V-007, Patience's exhausted balance); preauth hold belongs to exactly one benefit period (V-008).

### 6.7 Q-phase — Eligibility parity (Q-001..Q-019 × 4 channels, 96 oracle cells)

This phase is SP-6. The 19 scenarios open the same member on admin, provider, member/HR and API and require **exact** match of: status, policy dates, package version, benefit limit/remaining, waiting/referral/network explanation, last-updated — against EO-001..024 including boundary dates (policy start/end, leaver ±1 day, reinstatement gap, exact-age vs day-over), holds (EO-019 reserved amount deducted), shared-pool balance (EO-017), exhausted-but-active distinction (EO-018 `LIMIT_EXHAUSTED` with member still eligible), provider exclusion (EO-020), referral pair (EO-021/22), unknown member `NOT_FOUND` with zero existence leakage (EO-024).

**Verified scope (sweep track 4) — worse than the handoff stated:** there are **8 verdict evaluators and 7 remaining-benefit calculators**, no two of the four channels share both, and the **HR channel has neither** (24 of the 96 cells are unexecutable as specified — descope the HR column or file it as a Critical absence, GAP-1). Admin is wrong in two directions at once (`(admin)/members/[id]/page.tsx:127` over-reports by never subtracting holds, under-reports by summing lifetime usage with no period filter). `/api/v1/benefits` over-reports (ignores OVERALL cap + shared pools, and resolves the **highest** package version instead of the member's pin — three version resolutions → three answers). Dead preauth chip; `safeExplanation` computed but rendered nowhere; result codes `NEEDS_PREAUTH/DATA_INCOMPLETE/MANUAL_CONFIRMATION` unreachable.

**Fix shape (adopt verbatim — the sweep verified the base implementations):**
- **Money base = `BenefitUsageService.computeAvailability` (`benefit-usage.service.ts:417-630`)** — the only calculator handling per-visit + category + OVERALL + shared-member + shared-family with expiry-reconciled holds and PA credit-back, on the member's **pinned** version.
- **Entitlement base = preauth Gates 1–4 (`preauth-adjudication.service.ts:102-186`)** — the only chain consulting `coverEndDate`, `PackageProviderEligibility`, `MembershipExclusion`, `WaitingPeriodApplication`.
- **Extend the union with the four inputs no evaluator consults:** group status (preauth omits it), `Group.effectiveDate/renewalDate`, `Client.status`, and `coverageService.evaluate` promoted from its single autopilot caller to the canonical as-of-service-date test — plus the four inert config fields (`BenefitConfig.waitingPeriodDays`, `BenefitConfig.exclusions[]`, tariff age/gender).
- **Rewire order:** provider portal (`provider/eligibility/page.tsx:24` — widen the form to send `serviceDate`+`benefitCategory`, render `safeExplanation`); provider API (delete inline verdicts in `api/v1/eligibility:42` + `benefits:50,96-118`, add the missing `providerScopeError` on `/benefits` — GAP-3/SCOPE-05); member portal (`member-app.service.ts:51-145` → inherits OVERALL/shared/holds/pin for `/benefits`, dashboard, family, USSD, SMS); admin (highest-value single fix); **HR (build the surface that doesn't exist)**. Keep `availableLimit`/`remainingAfter` as private internals or delete (`remainingAfter` has zero external callers).
- **Cheapest proof before the UI run:** an EO oracle unit suite — all 24 EO rows as cases against a seeded fixture DB (SP-8). Also add a parity test asserting the channels agree (none exists — GAP-2).

### 6.8 X-phase — RBAC & privacy (X-001..X-010)

Most of this phase is **pre-cleared by WP-3.5B** (tRPC role-gating, report scoping, provider-portal PII fix, N3). Remaining verified items:

- X-001/X-002 deep-link mutation denial: server-action guards already deny (sidebar+guards agree); the hole is the tRPC twin door — WP-3.5B closes it. Verify both the UI deep-link *and* a raw `POST /api/trpc/packages.*` are denied.
- X-003 HR isolation: N3 fix (WP-3.5B) + `hr/utilization`/`hr/support` group guards + add `tenantId` to the 6 HR reads that lack it (defence-in-depth).
- **X-004 provider branch isolation (real gap):** provider claims list/detail and the portal eligibility lookup are provider-wide, not branch-scoped (`provider/claims/page.tsx:32`, `[id]/page.tsx:37` selects but never checks `providerBranchId`, `eligibility/page.tsx:24` sends no branch); **and the API-key `allowsBranch` helper is never called** (`apiAuth.ts` — branch-restricted keys are unrestricted in practice, GAP-B9.5). Add branch scoping to these reads + wire `allowsBranch` into `apiAuth`.
- X-005 provider persona nav: WP-3.4 labels + the PNOS nav-model already falls back safely; verify no dead-end links per persona.
- X-006/X-007 member/dependant privacy: the member portal visibility rule is correctly implemented (dependant sees self only; sensitive-category masking principal→dependant) — **verify only**, apply D7 as the documented policy; low-priority GAP-B8.1 (private-event count disclosed to principal) is a policy call.
- X-008 reports viewer read-only: WP-3.5B report role-gate + `analytics/alerts/actions.ts` currently lets `ANY_STAFF` (incl. REPORTS_VIEWER) acknowledge/resolve alerts — narrow it.
- X-009 maker≠checker in audit: depends on the audit events WP-3.5G/WP-2.0/Wave-1 add (many governed actions emit nothing today).
- X-010 non-enumerating errors: the API pair is safe; the **provider portal default path is the leak** (PRIVACY-S1-A, WP-3.5B).

### 6.9 U-phase — UX, resilience, concurrency (U-001..U-010)

Oracle demands: unsaved-change warning on package edit (no partial version on abandon); server-validation failures preserve entered data (SP-2 gives this everywhere it's applied); slow-network: pending state + disabled control + **exactly one transaction**; network drop mid-save: committed state determinable + idempotent retry, no half-version (SP-5); **concurrent package edits (U-005): conflict detected or two ordered versions, no silent lost update** — the current `updatePackageAction` is last-write-wins with a version-number derived from `currentVersion` not `MAX` (so concurrent edits either lost-update or P2002-500); add optimistic concurrency (compare base `versionNumber` at submit, reject stale with reload) as part of WP-2.0; eligibility during concurrent status change (U-006): SP-6 computes live — verify no channel caches (the 24h `displayValidUntil`/offline-pack windows are the real staleness, flag them); refresh/back after approval (U-007): the legacy endorsement apply has an atomic status-guarded claim (`endorsement.service.ts:125-139`) — verify it covers the browser-resubmit path; search normalization + "no result ≠ not eligible" (U-008); keyboard-only package edit (U-009); member portal at 390×844 (U-010).

### 6.10 Cross-cutting needle lists (from sweep track 5)

These are the full needle sweeps — the executing agent should treat each as a checklist and clear it so no instance of the class survives. Full file:line lists are in the sweep transcript; the load-bearing ones:

- **Hard-coded currency (100+ sites).** BUG class (a): KES literals — the three package/tier labels (WP-2.1), plus `members/[id]/card` fee, billing reconciliation text, fund dashboard, report CSV headers, and two local `money()` formatters defaulting to KES (`provider/claims/[id]/page.tsx:18`, `format-pricing-rule.ts:14`). Plus KES **write-path defaults** that persist to the DB (`contracts/actions.ts:61`, several tRPC `z.string().default("KES")`). BUG class (b): hard-coded `UGX ` prefixes on per-record-currency surfaces (package/claim/invoice) that ignore `Client/Group/Claim/Invoice.currency` — ~80 sites across billing, claims, member, provider, reports. Fix: route all money display through `formatMoney(amount, record.currency)`; SP-8 lint test forbids new literals. Legitimate (leave): the formatter itself, currency `<option>` lists, `@default("UGX")` columns, FX/parser code.
- **Unguarded numeric coercion.** The `Number(formData.get(x) || 0)` idiom (guards empty, not NaN) at 20+ sites and bare `Number(formData.get())` at ~30 — highest blast: package builder/edit money+age, `billing/actions.ts:103` payment amount (negative reverses a payment, no `Payment` unique → double-submit double-credits), tier `contributionRate`, co-contribution fields (150%/negative), preauth money. Plus `z.number()` without bounds in ~15 router fields (preauth, coContribution caps, claims `approvedAmount`, contract pcts, package ages). Fix: SP-1 schemas everywhere; reference the gold-standard guard at `compliance/actions.ts:84`.
- **Silent-failure actions.** `redirect()`-in-try-catch: **ZERO instances** (codebase is clean here — no work). Real ones: empty catches swallowing GL posting (`billing/actions.ts:92,145`, `claims/[id]/actions.ts:284,320` — invoice/claim proceeds, GL silently unposted); console-only catches on PDF/pack generation (button appears dead); `BenefitTiersCard.tsx:38-46` try/finally with no catch (duplicate tier name fails silently). Fix with SP-2 error contract.
- **Disabled-without-explanation.** `SharedLimitsManager.tsx:71` (WP-2.5) plus ~15 others (`cases/[id]/page.tsx:199,376`, `quotations/[id]/bind/page.tsx:232`, wizard `canNext` gates). Fix: adjacent visible reason (SP-2 convention).
- **revalidatePath.** The mismatches/misses are all in the package surface (WP-2.0) plus the clients paths that revalidate nothing (Wave 1). `revalidateTag`: 0 uses.
- **UI-only constraints.** `clients/new` currency/prefix are `maxLength`+CSS-uppercase only, no server check (Wave 1 fixes); TOTP/OTP `maxLength`, free-text `maxLength` without server cap (add server-side length validation to the SP-1 schemas).
- **Duplicate-submit exposure.** Package builder, individual-client enrol, contracts new, `billing` payment — no pending guard + no DB unique. The schema already has an idempotency-key convention (`@@unique([tenantId, idempotencyKey])`) used on B2B paths but **none of the admin create forms** — apply it (SP-5) to the create paths that mint client/package/scheme/member/payment/shared-limit rows.

### 6.11 Z-phase — Reconciliation & sign-off (Z-001..Z-006)

Mostly execution, but two product prerequisites: (1) **Z-003 needs a front-end/API member-benefit export** for the UAT client (member → scheme/tier/package version/limits/waits/copays/network/status). Verify one exists; if not, add a scoped export on the admin reports surface (read-only, authorized roles) — small WP, do early enough to be tested. (2) Z-004 needs audit completeness across client/package/scheme/provider/tariff/member/import/endorsement/lifecycle/renewal/approval actions — §5/§6 audit work feeds this; the extended audit-coverage catalogue (SP-8) is the internal proof.

---

## 7. Data, fixtures & UAT governance (Wave 4 + handoff §5/§6)

### 7.1 Preflight reports → constraints → governed cleanup (strict order)

1. **Collision reports** (read-only scripts under `scripts/uat/`, run against UAT + prod): normalized client legal names per tenant; member prefixes per tenant (expect: `MVX` default-client mass-collision + `LMU` UAT duplicates); group names per client; `familyCap < individualCap` rows; groups with null `packageVersionId`; pins whose version.packageId ≠ packageId; `Group.currency` ≠ `Client.currency`.
2. **Ship validation + unique/check constraints** (Waves 0–2, §SP-3/SP-4) — only after each report is clean or exceptions are dispositioned.
3. **Governed cleanup of UAT-created records** (the duplicate Lakeviews from C-002/C-003, six unsafe-prefix clients from C-004 — identify via Evidence Index + client references): deactivate/mark-as-UAT-fixture through product workflows (status → TERMINATED + `operationalNotes` disposition), **no SQL hard-deletes**; audit record with actor/reason/canonical-client pointer. Prefix `MVX` default-client resolution per WP-1.2 report.

### 7.2 Fixture pack (unblocks DEF-025/018/020 + B/N/M phases)

- **Disposable package lane:** seed script `scripts/uat/seed-disposable-fixtures.ts` (idempotent, tenant-scoped, run via authorized API/action path where possible) creating `Lakeview UAT Disposable — <scenario> — <run>` packages with exact CT baselines for P-006..P-009/P-011/P-013 + disposable schemes for S-004/S-006 + disposable tariff rows for N-009/N-011. Naming per workbook lane rules (00 Start Here rows 38–43).
- **Control client** (non-Lakeview) for isolation negatives — exists in prod data (NWSC etc.) but must be *named* in the workbook control row.
- **Lakeview-confined Underwriter** (DEF-020): provision a UW account scoped to Lakeview only; record exact scope in `02 Roles & Accounts`. If operator-wide UW is the only product construct, this needs the group/client confinement mechanism verified first — flag to Arthur if absent (that would itself be an X-phase risk).
- **Import fixture files** (B-phase names are contractual): `member_import_happy_path.csv` exists in the source pack; **create** `mixed_partial`, `empty`, `header_only`, `malformed`, header-alias/reorder variants, `isExample`, duplicates, formula-injection, 5,000-row perf file, `member_import_hr_happy_path.csv` — generated by script, checksummed into the source pack.
- **Roles & Accounts completion** (DEF-003): add `medical_officer`, `provider_finance`, `provider_admin` rows; reconcile to the 21-persona credential set; provision fresh credentials + TOTP (§0.8).
- **Principal-member crosswalk** (DEF-009): map the portal principal account to a named Lakeview fixture (or add the NWSC row to `05 Member Data`) — workbook edit, not code.
- **C-005 resequencing** (DEF-018): move currency-change scenario after scheme creation in the next run plan; D8 makes the product behaviour deterministic either way.
- **Reset mailbox** (DEF-008): human-controlled UAT mailbox + human completes the final password change; agent records evidence without touching the secret.

### 7.3 Workbook corrections (do not rewrite executed rows)

New-run workbook only: P-011 wording per D1; C-005 position per DEF-018; Roles & Accounts additions; EO placeholder balances replaced from controlled setup.

---

## 8. Test & consistency strategy (maps handoff §7's 12 required areas)

1. Caps relational validation — WP-0.1 (action + router + DB).
2. Client name/prefix normalization + uniqueness incl. concurrency — WP-1.1/1.2.
3. Unsafe prefix categories + field errors — WP-1.2.
4. Currency projection across surfaces — WP-2.1 + SP-8 label test.
5. Per-visit limit config/versioning/adjudication — WP-2.2.
6. Exclusion + referral effective dates/exceptions/reason codes — WP-2.3/2.4.
7. Maternity FAMILY pool atomic persistence + family usage — WP-2.5.
8. Lockout threshold/timing/recovery/non-enumeration — WP-3.1.
9. Login required-field a11y + keyboard — WP-3.2.
10. Idle-session first-action enforcement + zero partial member — WP-3.3 (+M-phase transactionality).
11. Provider role attribution through logout/login/multi-tab — WP-3.4.
12. Membership Officer read-only discoverability + forbidden-mutation — WP-3.5 + persona matrix.

Plus the SP-8 drift detectors, §SP-4 real-DB constraint tests, SP-6 oracle-table test (all 24 EO rows as unit cases against a seeded fixture DB — the cheapest way to prove Q-phase before the UI run), and per-§6 phase suites where gaps were fixed. Every PR: failing test first, `typecheck` + `test` + `build` green before deploy.

---

## 9. Landmines appendix (verified/institutional — violating any of these has already cost a day each)

- L-1 `prisma db push` **ignores `--env-file`** — export `DATABASE_URL`/`DIRECT_URL` explicitly per environment before any schema/DDL operation.
- L-2 Prod pooler (port 6543) cannot run DDL — use the direct 5432 connection for SQL constraint packs.
- L-3 Local throwaway DB when needed: `initdb -D /tmp/pnos-pgdata -U postgres --auth=trust --locale=C` → `pg_ctl start -o "-p 54329 -k /tmp/pnospg"` → `createdb` → export URLs → `npx prisma db push`. Long-paused local DBs get reaped — rebuild, don't debug.
- L-4 Browsers hold stale JWTs across DB swaps — `/signout` before judging auth behaviour.
- L-5 Next.js `redirect()` throws — never inside try/catch (SP-2 pattern already avoids).
- L-6 Prod has ZERO Role/Permission/UserRoleAssignment rows — no dynamic-permission-only gates (SP-7).
- L-7 `Claim.diagnoses` has two shapes in the wild — any Q/N-phase code touching claim diagnoses must handle both.
- L-8 `node_modules/next/dist/docs/` does not exist (§0.3).
- L-9 iCloud `" 2"` duplicate files (§0.4).
- L-10 `npm run build` runs `scripts/db-sync.mjs` first — build needs a reachable DB; use the UAT/local env when building.
- L-11 Real-DB tests self-skip unless the dedicated env var matches (AUTOPILOT_TEST_DB pattern) — copy the pattern, never hard-require a DB in the default `npm test`.
- L-12 Raw SQL timestamps: `now() AT TIME ZONE 'UTC'` convention in this codebase.
- L-13 The tRPC layer is a parallel, currently-unguarded door to the same services as the server actions (PROD-BLOCKER-2). Any fix that guards a server action must guard its tRPC twin too, or the fix is bypassable. `adminProcedure` exists but admits `REPORTS_VIEWER` — fix it before relying on it.
- L-14 `entitlementEnforcement` and `providerContractView` default **false/off** — provider-portal behaviour under test is the permissive path, not the enforced one. Know which flag state the run exercises.
- L-15 A `groupId!`/non-null assertion on a session field is a data leak when the field is undefined (Prisma drops the key). Never assert; guard with `if (!x) notFound()`. This is the N3 root cause and likely recurs — grep for `session.user.*!` in query `where` clauses.
- L-16 Renewal does not move members today; any test that renews a scheme and then checks a member will read stale pre-renewal state until WP-V1 lands.

---

## 10. Sequencing — two weeks to a deep rerun (not to GO)

The scope grew this pass (§1.1/§1.2). Two weeks now targets a *deep* rerun + a functional prod, not a signed GO. Staff the two long poles first — the SP-6 evaluator and WP-3.5A/B (prod-blockers) — because everything downstream depends on them.

**Day 1 (stop-line + escalation):** WP-0.1 shipped + P-014 front-end retest same day. **Escalate DEF-001 (signed real-client pack) to the business owner** — it is the long pole for GO and needs a human, start it now. Collision reports run (§7.1).
**Days 1–3 (prod-blockers + plumbing, in parallel):** WP-3.5A (seed RBAC + fallback gates — unbreaks prod) and WP-3.5B (close the tRPC/reports/provider-PII/N3 doors — the S1-class fixes). SP-1/2/3/5 scaffolding + F-TEN-1 hotfix + WP-3.5C (member-number `clientId`). These are prerequisites for honestly testing anything authenticated.
**Days 3–6 (Wave 1 + S-phase):** WP-1.1/1.2/1.3, WP-S1/S2/S3/S4, WP-3.5D (age rules) + WP-3.5E (coverage periods) since S/M/L/Q all sit on them; governed cleanup of UAT duplicates after constraints land. Deploy; C-001..C-008 + S-phase self-retest via front end.
**Days 4–9 (Wave 2 + evaluator, parallel):** WP-2.0 plumbing first, then WP-2.1 (small) + WP-2.2/2.3/2.4 as one benefit-config track + WP-2.5. **SP-6 evaluator staffed from Day 4** (longest build) with F-PIN-1/2/3; WP-Z export check.
**Days 8–11 (Wave 3 + N/M/B + HR-channel):** WP-3.1..3.5 (3.4 after the RBAC seed); N-phase (WP-N1..N6); WP-3.5F (HR enrolment parity) + M/B gaps (dup detection, idempotency, import safety).
**Days 10–13 (E/L/V + Q wiring):** WP-E1 engine convergence, WP-3.5G lifecycle machine, WP-V1 renewal-moves-members; all channels rewired to SP-6; EO oracle unit suite green.
**Days 13–14:** fixture pack + workbook corrections + fresh credentials (§7); full self-test sweep in retest order; deploy final build; **hand off to the formal rerun** (handoff §9: P-014 → C-001:C-006 → P-001:P-014 → resume blocked scenarios in workbook order).

Checkpoints: Day 1 (P-014 green on UAT), Day 3 (prod-blockers closed — prod functional, S1 leaks shut), Day 6 (client/scheme self-tested), Day 9 (package config + evaluator green vs EO table), Day 13 (all phases self-tested). Miss a checkpoint → cut from the §6 tail (U-phase niceties, Z-export polish, cosmetic currency labels) — **never** from Wave 0, the prod-blockers, or the S1 privacy fixes.

**Production-readiness caveat (state plainly to the owner):** two weeks buys a *deep, honest rerun* and a *functional, leak-free prod build* — not a defensible GO. GO additionally requires: the signed real-client pack (DEF-001, human, not started); the deep domain rebuilds the sweeps exposed (renewal-moves-members, coverage-periods-everywhere, age/newborn/leaver rules, package maker-checker); a clean rerun with 100% reconciliation; and real owner signatures. Those are real engineering + real governance, and they will not all land in two weeks. The right framing for the deadline: *"we can be safe to demo and safe in prod on the tested paths in two weeks; a signed production GO across the full onboarding+eligibility journey is a few weeks beyond that, gated on the real-client pack."*

---

## 11. Traceability

**Workbook defect → work package:** DEF-027→WP-0.1 · DEF-013→WP-1.1 · DEF-014→WP-1.1 · DEF-015→WP-1.2 · DEF-017→WP-1.2 · DEF-012→WP-1.3 · DEF-021→WP-2.1 · DEF-022→WP-2.2 · DEF-023→WP-2.3 · DEF-024→WP-2.4 · DEF-026→WP-2.5 (via WP-2.0) · DEF-005→WP-3.1 · DEF-006→WP-3.2 · DEF-010→WP-3.3 · DEF-002→WP-3.4 · DEF-004→WP-3.5 · DEF-001/003/008/009/018/019/020/025→§7 (DEF-019 incl. `operationalNotes` field).

**Newly-found (not in workbook) → work package:** PROD-BLOCKER-1 (RBAC prod-empty/bootstrap deadlock)→WP-3.5A · PROD-BLOCKER-2 (tRPC auth-only)/PROD-BLOCKER-3 (reports scope)/PRIVACY-S1-A (provider PII)/PRIVACY-S1-B (N3)→WP-3.5B · member-number MVX→WP-3.5C · age rules→WP-3.5D · coverage-periods/leaver-dates→WP-3.5E · HR-channel/relationship/SIBLING/newborn→WP-3.5F · lifecycle-machine/audit→WP-3.5G · package plumbing (tRPC guard, nested-form, version orphaning, maker-checker, revalidate)→WP-2.0 · 8-evaluator convergence→SP-6 · tariff validation/overlap/delete/suspension→WP-N1..N6 · renewal-moves-members→WP-V1 · endorsement-engine convergence→WP-E1 · import safety→WP-B1..B4.

**Phase → coverage:** Readiness/Auth→Wave 3+§7 · Client Master→Wave 1 (+D8 for C-005) · Plan & Benefits→Waves 0+2+§6.9(U-005) · Scheme→§6.2 · Provider/Tariffs→§6.3 · Manual Enrol→§6.4+WP-3.5C-G · Bulk→§6.5 · Endorse/Lifecycle/Renewal→§6.6 · Parity→SP-6/§6.7 · RBAC/Privacy→§6.8+WP-3.5A/B+SP-7 · UX/Resilience→§6.9+SP-2/SP-5 · Recon/Sign-off→§6.11+§7.

## 12. Plan self-consistency check (for the executing agent to re-verify, not assume)

- [ ] All 16 workbook product defects have a WP with file-level targets and tests.
- [ ] All 8 governance/fixture records have a §7 action and owner.
- [ ] All newly-found blockers (§1.1) map to a WP-3.5x / WP-2.0 / SP-6 / WP-N/V/E/B item.
- [ ] Every §6 phase section lists concrete gaps or "verify only" — no phase skipped.
- [ ] Every unique/check constraint has a preflight report in §7.1.
- [ ] Every decision D1–D9 has a default; none blocks the build.
- [ ] Every guarded server action has its tRPC twin guarded too (L-13) — no bypass door left.
- [ ] No WP instructs a hard-delete, an unaudited state change, a dynamic-permission-only gate, or a `session.user.*!` in a query filter (L-15).
- [ ] Retest happens through the deployed front end for every closed defect.

---

## 13. Execution status & deploy actions (updated 2026-08-10, branch `feat/uat-elig-remediation`)

**Landed on-branch (typecheck clean; `tests/{actions,routers,services,security,api,db,integration,lib}` = 1708 passed / 0 failed / 558 opt-in DB skips):**
- **WP-0.1 (DEF-027)** ✓ — `familyCap ≥ individualCap` enforced at action + `upsertCap` router (+ new tenant-ownership check) + UI + DB constraint file; SP-2 `action-result.ts` + SP-1 `validation/money.ts`+`validation/co-contribution.ts` scaffolding established. Failing-then-passing proof captured (18/19 fail on pre-fix code).
- **WP-3.5A (PROD-BLOCKER-1)** ✓ — `rbacService` = enum baseline ∪ dynamic overlay (never a superset); bootstrap deadlock broken; seed verified idempotent.
- **WP-3.5B parts 2/3/4** ✓ — reports export role-gate (403, `ANY_STAFF`) + deny-for-scoped-roles; provider-eligibility default path entitlement-scoped (no tenant-wide PII); N3 `notFound` guards + `tenantId` on the three leaking HR pages + defence-in-depth elsewhere.
- **WP-3.5B part 1 (tRPC role-gating)** — in progress at time of writing.

**DEPLOY ACTIONS (these fixes are partly INERT until done — do not mark blockers closed in prod without them):**
1. Apply `prisma/sql/2026-08-10_onboarding_invariants.sql` (caps CHECK constraints) to UAT then prod via the **direct 5432** connection with `DATABASE_URL`/`DIRECT_URL` exported (L-1/L-2); run the preflight audit queries first and remediate any `familyCap < individualCap` rows through a governed path.
2. Run the RBAC seed / `provisionTenant` against prod to create the `Role`/`Permission`/`UserRoleAssignment` catalog rows (the baseline fallback makes SUPER_ADMIN work immediately, but role administration and provider-persona assignment need the actual rows).
3. New self-skipping DB test env vars to register in the run log: `ONBOARDING_INVARIANTS_TEST_DB` (caps constraints; passes only after action 1) alongside `AUTOPILOT_TEST_DB`.
4. Every closed defect still needs the front-end retest on the deployed UAT build (handoff §8) — on-branch green is necessary, not sufficient.

**Follow-ups flagged by the executing agents (fold into their waves, don't lose):**
- SP-8 audit-coverage: add a `PACKAGE_CAPS` entry to `tests/audit-coverage/catalogue.ts` (new `PACKAGE_CAPS_UPSERT` action type shipped in WP-0.1).
- WP-3.4: `rbacService.getUserRoles` was intentionally left dynamic-only; if provider role labels must reflect the baseline enum role in prod (zero dynamic rows), address it there.
- Reports scoping (WP-3.5B/2) is currently belt-and-suspenders "deny for group-scoped roles"; if a scoped role must ever export, thread real group filters through the ~28 tenant-wide report queries.
- `entitlementEnforcement` flag left `false` (leak closed by scoping regardless); flipping it + the provider branch-in-context check are X-004 (separate WP).
- Router `upsertCap` `familyCap` is `.nullable()` (explicit `null`, not omitted) — future tRPC callers must send `null`.
