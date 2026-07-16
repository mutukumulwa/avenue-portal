# Medvex TPA — Priority Six Execution Plan

**Status:** implementation-ready plan; no feature implementation is performed by this document  
**Prepared:** 2026-07-13  
**Scope:** the first six table-stakes capabilities from the TPA product assessment  
**Audience:** implementation agents, including weak or highly literal AI models  

---

## 1. Objective

This plan closes the six highest-priority operational gaps without rebuilding capabilities that already exist:

1. Benefit-limit enforcement at the payment decision.
2. Complete eligibility and membership lifecycle.
3. A complete provider operating channel.
4. Claims intake and adjudication integrity.
5. Production-grade inpatient and case management.
6. Hard data isolation.

The intended end state is:

> For every treatment event, the system can prove that the member was eligible on the service date, the provider was entitled to treat the member, the service was covered, the available benefit and authorization were sufficient, the contracted price was applied, the event was recorded once, and every resulting clinical and financial record stayed inside the correct scope.

This is not a greenfield build. The repository already contains most of the structural pieces. Agents must extend the named canonical services instead of creating parallel implementations.

---

## 2. Scope boundaries

### 2.1 Included

- Benefit availability, holds, usage, shared limits, family limits, concurrency and reversals.
- Point-in-time eligibility, membership coverage history and lifecycle propagation.
- Provider eligibility, pre-authorization, claim, document, correction and remittance workflows.
- Convergence of UI, API, import, offline, reimbursement and case claim-intake rails.
- Inpatient admission, service accrual, date validation, utilization edits, discharge and filing.
- Tenant, client, group, provider, member, family and document isolation.
- Automated tests and front-end UAT needed to prove these six areas.

### 2.2 Explicitly excluded unless a work package says otherwise

- Rebuilding the contract engine, GL, settlement maker-checker, fraud engine, terminology engine, TOTP, member portal, HR portal or broker portal.
- New AI adjudication or predictive models.
- New wellness, health-vault, biometric or gamification features.
- Replacing the current `Tenant -> Client -> Group -> Member` hierarchy.
- Changing the current one-case-to-one-claim rule without a recorded TPA product decision.
- A migration-history re-baseline. The repository is currently `prisma db push` managed; see `docs/INSTALL.md`.

### 2.3 Dependencies that may be touched

The six priorities depend on existing financial and security controls. Agents may make the smallest necessary changes to those controls but must not broaden scope. Examples: passing a benefit ceiling into `ClaimDecisionService`, adding client scope to an existing provider query, or making PA update and hold placement one transaction.

---

## 3. Mandatory execution protocol for every agent

This section is compulsory. Do not begin a work package by coding.

### 3.1 Read before changing code

1. Read `AGENTS.md`.
2. Read `docs/INSTALL.md`, especially the database-management warning.
3. Read this entire plan.
4. Read the files listed under the selected work package.
5. Before changing Next.js pages, routes, server actions, caching or request APIs, read the relevant guide under `node_modules/next/dist/docs/`. This repository explicitly warns that its Next.js conventions differ from model training data.
6. Read the tests named by the work package before adding new tests.

### 3.2 Mandatory proof-before-build gate

For each work package, create a short evidence note in the PR description or implementation log using this template:

```text
Work package:
Capability searched for:
Search terms used:
Files inspected:
Existing implementation found:
Existing tests found:
Live/UI behaviour checked:
Classification: COVERED | PARTIAL | MISSING | CONFLICTING
Smallest required change:
Files expected to change:
```

Classification rules:

- `COVERED`: the code and tests already satisfy every acceptance criterion. Do not reimplement it. Add only a missing regression test or documentation if needed.
- `PARTIAL`: extend the existing canonical service or component.
- `MISSING`: add a new component only after proving no current owner exists.
- `CONFLICTING`: two implementations already exist or the plan conflicts with a recorded business decision. Stop that work package and request a product/architecture decision.

### 3.3 Search rules

Use `rg` before assuming something is absent. At minimum, search:

- Prisma model and enum names.
- Service method names and related business terms.
- All `prisma.<model>.create/update` calls for the affected record.
- Page, API, tRPC, import, job and offline entry points.
- Existing tests and UAT defect references.

For example, before adding another claim intake function:

```bash
rg -n "runClaimIntake|createClaim\(|claim\.create\(" src tests
```

### 3.4 One owner per business rule

The following are the current canonical owners. Extend them; do not create competing services.

| Rule | Canonical owner to retain |
|---|---|
| Benefit arithmetic, holds and usage | `src/server/services/benefit-usage.service.ts` |
| Human/automatic PA decisions and hold creation | `src/server/services/preauth-adjudication.service.ts` |
| Final claim decision, approval matrix, ceilings, GL, usage | `src/server/services/claim-decision.service.ts` |
| Direct admin/provider claim intake | `src/server/services/claim-intake.ts` |
| Contract pricing | `src/server/services/contract-engine/` and `provider-contracts.service.ts` |
| Provider-to-member entitlement | `src/server/services/provider-entitlement.service.ts` |
| Member creation and dependant linkage | `src/server/services/members.service.ts` |
| Membership changes | `lifecycle.service.ts`, `endorsement.service.ts`, `reinstatement.service.ts` |
| Cases, case services and case filing | `src/server/services/case.service.ts` |
| HMS case-service ingestion | `src/server/services/hms-batch.service.ts` |
| Offline operation reconciliation | `src/server/services/sync.service.ts` |
| Client-confined tRPC access | `src/server/trpc/clientScope.ts` |

If a new helper is required, place it under one of these owners unless it represents a genuinely separate concept documented by this plan.

### 3.5 Data and schema rules

- The current sanctioned schema path is `npm run db:push`, not `prisma migrate dev/reset`. Follow `docs/INSTALL.md`.
- Never use `--accept-data-loss`.
- Every schema addition requires:
  - a reversible or idempotent backfill script where existing records need data;
  - an update to `prisma/seed.ts` for reference/configuration data;
  - a data-integrity assertion or test;
  - an update to `docs/INSTALL.md` if deployment steps change.
- Do not rename or remove populated fields as part of these epics.
- Effective-dated and financial records use the repository's never-delete convention.

### 3.6 Work-package size

- Implement one numbered work package at a time.
- Do not combine schema, five workflows and visual polish in one change.
- Run the named focused tests after every package.
- Do not start the next package while a new Critical/High regression is open.

### 3.7 Required result note

At completion, append to the work package's implementation record:

```text
Result: IMPLEMENTED | VERIFIED-EXISTING | BLOCKED
Files changed:
Tests added/changed:
Commands run:
Observed result:
Remaining conditions:
```

---

## 4. Current-state map: what already exists and must be reused

This map is based on the code as of 2026-07-13. Agents must still run the proof gate because the repository may change after this plan.

| Priority | Existing capability — do not rebuild | Confirmed or strongly evidenced gap |
|---|---|---|
| P1 Benefit limits | `BenefitConfig`, `BenefitUsage`, `SharedLimitGroup`, `BenefitHold`; `BenefitUsageService`; PA cap gate and holds; claim usage/reversal | Claim finalization does not enforce available benefit before incrementing usage; family shared limits are calculated using one member's rows; hold/consume operations are not consistently atomic; current inpatient UAT proved an exhausted limit could be paid |
| P2 Eligibility/lifecycle | Member/group statuses and dates; dependants; waiting-period and exclusion models; endorsements, reinstatement and lifecycle services; provider eligibility API/UI; offline `EligibilitySnapshot` | Eligibility decisions differ by channel and are mostly current-status checks; provider page and direct intake do not use full provider entitlement; historical coverage is not represented by a single effective-dated source |
| P3 Provider channel | Provider role and scoping; dashboard; eligibility; claim create/list/detail; settlements list; API key management; claims/preauth APIs | No provider preauth UI; no provider response-to-query workflow; no claim attachment/correction/resubmission flow; no provider settlement detail/remittance download; provider member lookups are tenant-wide |
| P4 Claims integrity | Canonical claim decision stack; `runClaimIntake` for admin/provider UI; contract engine; fraud and auto-adjudication; UI duplicate warning; DB invoice uniqueness; offline op keys | API v1, tRPC create, CSV import, offline sync, reimbursement and case filing still create claims through separate logic; API validation/idempotency differs; source and reason data can diverge |
| P5 Inpatient/cases | `ClinicalCase`, `CaseServiceEntry`, PA/LOU attachment, HMS push, idempotent HMS lines, close-and-file, contract pricing | Case entries allow future/post-discharge dates; no ward/ICU overlap edit; case close is vulnerable to concurrent filing; provider has no admission/case UI; one-case-many-claims remains intentionally undecided |
| P6 Isolation | Tenant/client/group model; user client/group/provider bindings; provider API keys; `ProviderEntitlementService` already supports client and group applicability; many scoped portals and negative tests | Provider portal eligibility, claim prefill and submission look up any member in the tenant; offline packs do not use contract applicability; shared Default Client data can unintentionally broaden access; operator integration key is not a database-managed per-tenant credential |

Important corrections to older backlog documents:

- TOTP, password reset, single-session control, terminology, fraud investigations, claim appeals, provider vouchers and remittance surfaces exist in code.
- Dependant linkage from the admin member screen has a recorded `NW-D02` fix in `members.service.ts` and the member actions. Verify it; do not rebuild it.
- `ProviderEntitlementService` already supports `ContractApplicability.groupId`. The sibling-employer problem may be resolved through correct data and contract applicability rather than a new entitlement schema.

---

## 5. Recommended delivery order

The epic numbers preserve the six original priorities. The implementation order is dependency-driven:

1. **Foundation F0:** freeze baselines and create characterization tests.
2. **P6.1 immediate isolation repair:** stop tenant-wide provider member lookups.
3. **P2 eligibility decision core:** create one point-in-time eligibility answer.
4. **P1 benefit enforcement:** create an atomic payable/hold ceiling.
5. **P4 claim-rail convergence:** make every rail use the same eligibility and validation.
6. **P3 provider workflow completion:** build screens on the safe services.
7. **P5 inpatient hardening:** use the safe eligibility, limits and intake services.
8. **Integrated UAT:** run the complete cross-role stories.

Do not build the provider preauth/case screens before the isolation and eligibility foundations are complete.

---

# Foundation F0 — Baseline and characterization

## F0.1 Record the starting point

Run and record:

```bash
git status --short
npx vitest run tests/services/claim-decision.service.test.ts
npx vitest run tests/services/preauth-holds.test.ts
npx vitest run tests/services/case.service.test.ts
npx vitest run tests/api/provider-read-scope.test.ts tests/api/provider-preauth-scope.test.ts
npx vitest run tests/services/clientScope.test.ts
npm run typecheck
```

Do not clean or overwrite unrelated worktree changes.

## F0.2 Create a claim-creation inventory test

Before refactoring, add a characterization document or test listing every production claim creator:

- `runClaimIntake`.
- `ClaimsService.createClaim` and `createClaimWithPreauth`.
- tRPC claims create.
- `/api/v1/claims`.
- `/api/claims/import`.
- `SyncService` offline reconcile.
- `CaseService.closeAndFile`.
- reimbursement action and `reimbursement.service.ts`.

The eventual target is one validation/persistence pipeline, not necessarily one public function. Case and reimbursement workflows may need transaction-aware adapters, but they must not independently reproduce core eligibility, amount, coding, idempotency and post-intake rules.

## F0.3 Create a scope matrix

Create `uat/priority-six/SCOPE_MATRIX.md` with rows for:

- Operator staff, client-confined staff, provider A, provider B, HR A, HR B, fund admin A, broker A, member A and member B.
- Member identity, eligibility, benefits, claims, preauth, case, documents, settlements, reports and API resources.
- `ALLOW`, `DENY-404`, or `DENY-UNAUTHORIZED` expected outcome.

This matrix becomes the source for P6 tests. Do not rely only on menu visibility.

---

# P1 — Benefit-limit enforcement at the payment decision

## P1 outcome

No claim or PA can create payer exposure beyond the applicable per-visit, category, overall, shared or family limit. Two concurrent requests cannot both spend the same remaining balance. Holds, reversals and PA consumption reconcile exactly.

## P1 existing components to reuse

- `Package.annualLimit`, `Package.perVisitLimit`.
- `BenefitConfig.annualSubLimit`, `BenefitConfig.perVisitLimit`.
- `SharedLimitGroup.limitAmount` and `appliesTo` (`MEMBER` or `FAMILY`).
- `BenefitUsage.amountUsed`, `activeHoldAmount`, period fields.
- `BenefitHold` and PA hold lifecycle.
- `BenefitUsageService.resolveConfig`, `availableLimit`, `remainingAfter`, `recordUsage`, `placeHold`, `releaseHold`, `reverseUsage`.
- PA Gate 5 in `preauth-adjudication.service.ts`.
- `ClaimDecisionService.decide`, including contract, PA, cost-share, usage, GL and fund operations.

Do not add a second benefit ledger.

## P1 confirmed gaps

1. `ClaimDecisionService.decide` proves the benefit exists but does not compare the approval amount to available benefit before `recordUsage`.
2. `recordUsage` increments first and floors the returned remaining value at zero; it does not reject an over-limit write.
3. `SharedLimitGroup.appliesTo = FAMILY` is not reflected in `remainingAfter`; it sums usage rows for the current member only.
4. PA update and hold placement are not consistently one atomic transaction.
5. Two decisions can read the same availability and both proceed unless the final transaction is serializable/retried or the rows are locked.
6. Offline reconciliation totals all benefit categories instead of resolving the submitted category through `BenefitUsageService`.

## P1 decisions that must be recorded before implementation

Create `uat/priority-six/P1_BENEFIT_DECISIONS.md` and record:

1. Does utilization consume the covered allowed amount or only the payer-paid share? **Default until explicitly changed:** preserve the current `approvedAmount` basis.
2. Is `Package.annualLimit` a hard overall ceiling in addition to category sublimits? **Default:** yes when populated and contractually presented as an annual limit.
3. When an approval request exceeds available benefit, should the system hard-block, cap to available and create member excess, or require an override? **Safe default:** hard-block and offer an explicit partial-approval amount equal to availability; never silently cap.
4. Does a dependant consume a family pool rooted at the principal? **Default:** yes for `SharedLimitGroup.appliesTo = FAMILY`.
5. What happens if a dependant is temporarily orphaned? **Safe default:** fail closed for family-limit calculation and raise a data-quality exception.

If product owners choose different answers, update this plan before coding.

## P1 stories

### Story P1-A — two simultaneous claims

Grace has UGX 100,000 remaining. Provider A and Provider B each submit a UGX 80,000 covered claim. Two reviewers approve at nearly the same time.

Expected:

- At most one claim finalizes at UGX 80,000.
- The other decision is rejected or routed with `BENEFIT_LIMIT_EXCEEDED`; no GL, fund, usage or settlement side effect is created for it.
- Remaining benefit is UGX 20,000, never negative.

### Story P1-B — PA hold conversion

A PA holds UGX 200,000. A related claim is approved for UGX 150,000.

Expected:

- The claim may consume the amount already reserved by its own PA.
- Used increases by 150,000.
- The PA's utilized amount increases by 150,000.
- The active hold falls by 150,000; the unconsumed 50,000 remains available under the PA.
- Availability is not reduced twice by both the hold and the claim.

### Story P1-C — family optical pool

A principal and two children share a UGX 500,000 FAMILY optical pool. The principal has used 200,000 and child one has used 250,000. Child two requests 100,000.

Expected:

- Family available is 50,000.
- A 100,000 full approval is blocked.
- A deliberate 50,000 partial approval can proceed if the user chooses it.

### Story P1-D — reversal

A UGX 70,000 approved claim is voided or overturned on appeal.

Expected:

- Usage is reduced exactly once.
- The corresponding GL/fund compensation follows existing reversal rules.
- Repeating the void/reversal is idempotent.

## P1 work packages

### P1.0 — Prove current behaviour

Inspect:

- `benefit-usage.service.ts`.
- `claim-decision.service.ts`.
- `preauth-adjudication.service.ts`.
- `sync.service.ts`.
- `tests/services/claim-decision.service.test.ts`.
- `tests/services/preauth-holds.test.ts`.
- inpatient UAT defect `IP-DEF-06`.

Add failing characterization tests for P1-A, P1-B and P1-C before changing behavior.

### P1.1 — Define one availability result

Extend `BenefitUsageService`; do not introduce a competing `LimitService`.

Add a method with a result equivalent to:

```ts
type BenefitAvailability = {
  memberId: string;
  familyRootId: string;
  benefitConfigId: string;
  periodStart: Date;
  periodEnd: Date;
  requestedAmount: number;
  payableCeiling: number;
  constraints: Array<{
    kind: "PER_VISIT" | "CATEGORY" | "OVERALL" | "SHARED_MEMBER" | "SHARED_FAMILY";
    limit: number;
    used: number;
    held: number;
    available: number;
  }>;
};
```

Implementation rules:

1. Resolve the benefit version effective for the service date, not automatically `now`.
2. Resolve the principal/family member IDs once.
3. For `MEMBER` limits, query only the treated member.
4. For `FAMILY` limits, aggregate the principal and all dependants.
5. Include active holds but allow the caller to identify holds being converted by this same claim so they are credited once.
6. `payableCeiling` is the minimum available amount across all applicable constraints.
7. Return reason-ready constraint details; do not return only a number.

### P1.2 — Atomic hold placement

Refactor PA approval so these events happen in one transaction:

1. Lock or serializably read the applicable benefit rows.
2. Recompute availability.
3. Reject or route if the requested hold exceeds availability.
4. Update PA status/GOP fields.
5. Create/update `BenefitHold`.
6. Increment `activeHoldAmount`.
7. Write audit data.

Use Prisma's supported transaction isolation for the installed Prisma version. Verify the API against installed types/documentation; do not assume training-data syntax. Implement bounded retry for serialization conflicts. Never approve the PA first and place the hold later.

### P1.3 — Atomic claim consumption

Inside the existing `ClaimDecisionService` transaction, before cost-share/GL/fund/usage writes:

1. Recompute benefit availability using the claim service date.
2. Credit the remaining amount of attached PA holds that this claim will convert.
3. Compare the requested approved amount with `payableCeiling`.
4. If exceeded, throw an operator-readable error containing requested amount, ceiling, binding constraint and safe next action.
5. Only after the check, record usage and convert/release holds.
6. Run the transaction at a concurrency level that prevents two approvals spending the same balance; retry serialization conflicts a small bounded number of times.

No approval failure may leave GL, fund, benefit usage, PA or notification side effects.

### P1.4 — Reversals and data reconciliation

1. Verify `voidClaim` and appeal reversal call `reverseUsage` once.
2. Add idempotency guards for repeated reversals.
3. Add an idempotent script under `scripts/` that reports, but does not silently correct:
   - negative usage/holds;
   - usage above category/overall/shared limits;
   - hold totals differing from active `BenefitHold` rows;
   - family pools calculated as member-only.
4. Require an explicit `--apply` or separate approved remediation step before changing production data.
5. Extend `scripts/data-integrity-check.ts` with the permanent invariants.

### P1.5 — Surfaces and reason codes

Reuse the availability result on:

- Claim adjudication detail.
- PA detail and approval form.
- Provider eligibility/benefits response.
- Member benefit view.
- Offline data packs.

Display each binding constraint separately. Do not show one misleading “remaining” number when category, overall and family pools differ.

Add or reuse reason codes:

- `BENEFIT_CATEGORY_EXHAUSTED`.
- `BENEFIT_OVERALL_EXHAUSTED`.
- `BENEFIT_SHARED_LIMIT_EXHAUSTED`.
- `BENEFIT_FAMILY_LIMIT_EXHAUSTED`.
- `BENEFIT_CONCURRENCY_RETRY` for an operator-facing retry condition, not a claim denial.

### P1.6 — Required automated tests

- No usage row yet.
- Exact-limit approval.
- Approval one cent/unit above limit.
- Per-visit lower than category balance.
- Overall lower than category balance.
- MEMBER shared limit.
- FAMILY shared limit across three members.
- PA hold blocks unrelated claim.
- Attached PA hold is credited during its claim.
- Partial PA consumption.
- Concurrent approvals against one remaining balance.
- Void and appeal reversal once.
- New benefit period.
- Offline reconciliation uses the correct category.
- Self-funded failure produces no fund/GL side effects.

## P1 definition of done

- P1-A through P1-D pass through services and UI.
- `BenefitUsage.amountUsed` and `activeHoldAmount` never become negative or exceed contractual limits without a named approved override path.
- A concurrency test proves one remaining balance cannot be double-spent.
- Inpatient `IP-DEF-06` is independently re-run and closed.

---

# P2 — Complete eligibility and membership lifecycle

## P2 outcome

Every channel receives the same answer to “was this member entitled to this benefit at this facility on this date?” The answer includes reason codes and an immutable snapshot of the inputs used.

## P2 existing components to reuse

- Member status, `coverStartDate`, `coverEndDate`, `activationDate`, `waitingPeriodEnd`, relationship and principal link.
- Group status, `effectiveDate`, `renewalDate`, suspension and termination fields.
- `MembershipExclusion`, `WaitingPeriodApplication`, package benefit versions and provider eligibility rules.
- `MembersService`, `lifecycleService`, `EndorsementsService`, `ReinstatementService`.
- Admin/HR member import and dependant linking.
- `/api/v1/eligibility`, `/api/v1/benefits` and `/provider/eligibility`.
- Offline `EligibilitySnapshot` and encrypted facility pack.
- Partial PA eligibility gates.

Do not rebuild member CRUD, dependant linkage, endorsements or reinstatement screens.

## P2 confirmed gaps

1. `/api/v1/eligibility` determines eligibility from current member/group status only.
2. `/provider/eligibility` does the same and is not provider-entitlement scoped.
3. `runClaimIntake` blocks only a subset of ineligible statuses and does not evaluate cover dates, waiting periods or provider contract applicability.
4. Different channels implement different eligibility rules.
5. Current member fields cannot faithfully answer a historical service-date query after multiple retroactive changes.

## P2 stories

### Story P2-A — historical service date

Daniel was active through 30 June and terminated effective 1 July. A claim for treatment on 29 June arrives on 10 July.

Expected: eligible on 29 June even though his current status is terminated.

### Story P2-B — waiting period

Sarah is active, but maternity cover starts after a 90-day waiting period. She requests maternity treatment before the waiting period ends.

Expected: member is generally active but ineligible for `MATERNITY`; response names the waiting-period end date.

### Story P2-C — provider network

A provider is contracted for Client A only. It searches a Client B member number.

Expected: 404/no PII, not a detailed “not covered” response.

### Story P2-D — retroactive transfer

A member is transferred from Group A to Group B effective 1 May, entered on 15 May. Claims dated before 1 May remain under Group A; claims on/after 1 May use Group B benefits and network.

## P2 work packages

### P2.0 — Eligibility rule inventory

Search all checks of:

- `member.status`, `group.status`.
- cover/effective/renewal dates.
- waiting periods and exclusions.
- `PackageProviderEligibility` and `ContractApplicability`.
- preauth-required benefits.

Produce `uat/priority-six/ELIGIBILITY_RULE_INVENTORY.md` listing each channel and its current rules. Mark differences before consolidating.

### P2.1 — One eligibility decision service

Create `src/server/services/eligibility.service.ts` only after proving no equivalent service exists. This is a genuinely separate domain decision and should call existing services rather than duplicate them.

Input:

```ts
type EligibilityInput = {
  tenantId: string;
  memberId?: string;
  memberNumber?: string;
  providerId?: string;
  providerBranchId?: string;
  benefitCategory?: BenefitCategory;
  serviceDate: Date;
  source: "ADMIN" | "PROVIDER_PORTAL" | "API" | "PREAUTH" | "OFFLINE" | "HMS" | "MEMBER";
};
```

Output must include:

- `eligible` boolean.
- Safe public reason code and internal reason detail.
- Member, client, group, package and package-version identifiers used.
- Service date and evaluation timestamp.
- Member/general coverage outcome.
- Benefit-specific outcome.
- Provider/network outcome.
- Waiting-period/exclusion outcome.
- Warnings that do not make the member ineligible.
- A minimal snapshot payload suitable for audit/offline use.

Evaluation order:

1. Resolve member inside tenant and, when provider-originated, inside `ProviderEntitlementService` scope.
2. Resolve effective membership coverage for the service date.
3. Require an eligible coverage state. Only `ACTIVE` is eligible unless an explicit emergency override is invoked.
4. Resolve effective group/client status and period.
5. Resolve package version effective on service date.
6. Resolve benefit presence.
7. Apply waiting period and member-specific exclusion.
8. Apply package/provider inclusion/exclusion.
9. Apply provider contract applicability and branch status.
10. Return one decision; do not mutate claims or usage.

Preauthorization requirements are a treatment/claim workflow gate, not proof that membership itself is inactive. Return them as requirements/warnings rather than `eligible = false` unless the specific operation asks for claim-submission eligibility.

### P2.2 — Effective-dated coverage history

First search for an existing effective-dated member coverage model. If none exists, add one model, provisionally named `MemberCoveragePeriod`, with:

- tenant, member, client, group, package, package version and benefit tier IDs;
- effective from/to;
- coverage status/reason;
- source endorsement/lifecycle record;
- created/approved actor IDs;
- immutable timestamps.

Rules:

1. Periods for a member must not overlap.
2. A retroactive change splits/ends prior periods; it never deletes history.
3. Current `Member` fields remain the current-state projection for existing screens.
4. New member, binding, endorsement, transfer, suspension, termination, lapse, renewal and reinstatement flows update the period and current projection in one transaction.
5. Backdated changes retain existing approval/override rules.

Backfill:

- Create one period from the best available `coverStartDate/enrollmentDate/activationDate` to `coverEndDate` for existing members.
- Report ambiguous members rather than inventing dates.

### P2.3 — Replace channel-specific decisions

Migrate in this order, with focused tests after each:

1. `/provider/eligibility`.
2. `/api/v1/eligibility` and `/api/v1/benefits`.
3. `runClaimIntake`.
4. external `/api/v1/claims` and preauth API through P4 convergence.
5. PA auto/human decision gates.
6. offline pack generation and sync reconciliation.
7. member facility/benefit previews.

The UI may format the result differently, but no channel may recompute its own eligibility boolean.

### P2.4 — Eligibility snapshots

Inspect whether the existing `EligibilitySnapshot` can safely become the shared audit record. Prefer extending it rather than adding a duplicate model if it can represent:

- provider/branch;
- client/group/package version;
- service date;
- source/channel;
- outcome and reason codes;
- balance reference, not necessarily duplicated balance arithmetic;
- evaluated and valid-until times.

If extending it would break its offline-pack meaning, document that conflict before adding a separate `EligibilityDecision` model.

Persist snapshots for:

- provider/API eligibility answers used to start treatment;
- preauth submission;
- claim intake;
- offline pack generation and sync revalidation.

Never expose internal fraud, blacklist or unrelated medical details in provider/member-facing reason text.

### P2.5 — Membership data quality and duplicate warnings

Do not make `idNumber` globally unique; the same person may legitimately exist across payer records. Instead:

1. Add a reusable duplicate-candidate query to `MembersService` using normalized national ID first, then name+DOB+gender and optional phone.
2. Show warnings during single create, HR create and import preview.
3. Require a reason to proceed with a high-confidence duplicate.
4. Never automatically merge members.
5. Add a report/queue for unresolved duplicate candidates only if no equivalent exception queue exists; prefer `ExceptionLog`.

### P2.6 — Required tests

- Every non-active member status.
- Active member before cover start and after cover end.
- Group before effective date, suspended and terminated.
- Benefit absent.
- Waiting period active/elapsed.
- Member-specific exclusion.
- Provider allowed/excluded by package and contract applicability.
- Branch active/inactive.
- Historical claim after current termination.
- Retroactive group transfer boundary.
- Reinstatement with and without reset waiting period.
- Dependant follows the correct principal/family but retains individual coverage dates.
- Provider receives 404 for out-of-scope member.
- Offline snapshot and online revalidation disagree: sync becomes a visible conflict.

## P2 definition of done

- All channels call the same eligibility service.
- P2-A through P2-D pass.
- Historical eligibility remains correct after a later endorsement or termination.
- Every treatment-starting decision can be traced to an eligibility snapshot and reason code.

---

# P3 — Complete provider operating channel

## P3 outcome

A facility can perform its complete operational handoff with the TPA without staff re-keying: verify entitlement, request authorization, submit supporting information, file/correct claims, track outcomes and reconcile payment.

## P3 existing components to reuse

- `PROVIDER_USER`, `requireProvider`, provider-bound user and API-key models.
- Provider nav/dashboard.
- Eligibility, claim create/list/detail and settlements list.
- `/api/v1/preauth` and `/api/v1/claims`.
- Admin and member preauth pages/services.
- `Document`, upload APIs, `DocumentList`, admin `ClaimDocuments` and `PreAuthDocuments`.
- Payment vouchers and admin settlement/remittance detail.
- Provider practitioners, branches and credentials.

Do not recreate document storage, preauth adjudication, settlement math or provider scoping.

## P3 stories

### Story P3-A — provider preauth

Reception verifies a member, starts a preauth for an MRI, uploads referral notes and tracks the request. The TPA requests one more report. The provider uploads it, and the medical officer approves a GOP.

### Story P3-B — claim information request

A claim is pended because an invoice is missing. The provider sees the request, uploads the invoice and responds. The same claim returns to the appropriate review queue; no duplicate claim is created.

### Story P3-C — corrected claim

A provider submitted the wrong service code. Before decision it withdraws/replaces the submission. After a denial, it submits a linked reconsideration. Original history remains immutable.

### Story P3-D — remittance reconciliation

The provider opens a settled batch, sees every claim, billed/allowed/disallowed/member-share/paid values, voucher and payment reference, then downloads/prints the remittance.

## P3 work packages

### P3.0 — Immediate provider member-scope repair

This is also P6.1 and must ship before other provider work.

Update these queries to combine tenant and `ProviderEntitlementService.entitledMemberWhere(provider.id)`:

- `/provider/eligibility` member lookup.
- `/provider/claims/new` prefill lookup.
- `submitProviderClaimAction` member lookup.

Do not merely hide the result in the UI. The server action must reject an out-of-scope member with the same not-found response as a nonexistent member.

### P3.1 — Provider preauth workbench

Add provider-scoped routes:

- `/provider/preauth` list.
- `/provider/preauth/new`.
- `/provider/preauth/[id]` detail.

Reuse `ClaimsService.createPreAuth` or the canonical PA creation service found during the proof gate. Refactor `/api/v1/preauth` to call it rather than directly creating a row.

New/provider UI requirements:

1. Start from a scoped eligibility decision.
2. Select benefit, expected service date, diagnosis, procedures and estimated cost.
3. Upload documents using existing document infrastructure.
4. Show status, SLA, reason, approved amount, validity, GOP and related case/claim.
5. Provider can view only its own facility's requests.
6. Provider cannot approve, decline, alter benefit balances or select another provider ID.

### P3.2 — Information request workflow

Search for an existing provider-query or information-request model. `ServiceRequest` is HR/support-oriented and should not be forced into clinical claim/preauth handling unless its fields and scope already fit.

If missing, add one generic effective/audited concept, such as `ClinicalInformationRequest`, that can attach to `CLAIM`, `PREAUTH` or `CASE` and includes:

- tenant, provider, entity type/id;
- status `OPEN`, `RESPONDED`, `ACCEPTED`, `CLOSED`, `CANCELLED`;
- request text and requested document types;
- requested-by and due date;
- provider response and responded-by/date;
- review acceptance/closure actor/date;
- audit timestamps.

Workflow:

1. TPA reviewer opens request.
2. Claim/preauth is routed to a named awaiting-provider queue; do not convert a final claim status to a new financial outcome.
3. Provider sees only its requests.
4. Provider uploads documents and response.
5. Reviewer accepts response and the work item returns to review.
6. SLA pauses/resumes only if the SLA policy explicitly allows it; record both times.

### P3.3 — Provider claim attachments

Reuse `Document`, upload route and document UI components.

- Provider can upload to its own claim while it is not settled/voided.
- Validate MIME type, size and malware-scanning integration point.
- Do not trust a client-supplied claim/provider/member ID.
- Store uploader identity and source.
- Sensitive document download must be authorized at request time; a copied URL must not bypass scope.

### P3.4 — Withdrawal, correction, resubmission and reconsideration

Proof gate: search for existing claim revision/resubmission fields and services.

Required semantics:

- A provider may withdraw only its own undecided claim.
- A decided or paid claim is never edited in place.
- A corrected/resubmitted claim is a new claim linked to the original.
- Store `resubmissionOfId`/sequence or an equivalent existing relation.
- Original decision, documents, audit and financial records remain intact.
- Rapid retry with the same idempotency key returns the existing claim, not a new resubmission.
- Reconsideration follows the existing appeal/reviewer separation rules.

Do not reuse `VOID` ambiguously without recording who can void, at which statuses, and whether it has financial reversal semantics. If provider withdrawal differs from staff financial void, represent that distinction clearly.

### P3.5 — Provider remittance detail

Add `/provider/settlements/[id]` with hard `tenantId + providerId + batchId` scope.

Extract and reuse the admin remittance calculation/view model rather than querying and totaling independently. Show:

- batch cycle and run sequence;
- claim number/member number/service date;
- billed, allowed, disallowed, member liability and paid;
- reason codes;
- voucher, payment reference/date and currency;
- totals that tie exactly to batch, voucher and GL source amount.

Provide print/PDF/CSV using existing report/PDF infrastructure. Do not add a new PDF engine.

### P3.6 — Provider profile and credentials, conditional

Verify operational need before building. Admin provider/branch/practitioner management already exists.

If self-service is required, providers submit change requests; they do not directly activate contracts, branches or credentials. Sensitive changes require TPA approval and audit.

### P3.7 — Required tests

- Provider A cannot search, prefill, submit for or open Provider/Client B resources.
- Provider can create and track its own preauth with documents.
- Information request round trip.
- Attachment authorization and copied-link denial.
- Withdrawal allowed before decision and denied after payment.
- Corrected claim linked and original immutable.
- Settlement detail ties to voucher and list total.
- Provider cannot change providerId/memberId through form/API tampering.
- Mobile-width navigation includes new provider pages.

## P3 definition of done

- P3-A through P3-D pass as real provider and TPA users.
- No TPA staff re-keying is required for the tested workflows.
- Every provider read/write is scoped server-side.

---

# P4 — Claims intake and adjudication integrity

## P4 outcome

Every claim channel validates and records the same clinical event the same way, returns an idempotent receipt, uses the same eligibility/contract/fraud/decision pipeline and produces explainable line outcomes.

## P4 existing components to reuse

- `runClaimIntake` for admin/provider direct entry.
- `ClaimsService.createClaim`, PA attachment and currency resolution.
- `ClaimDecisionService` as the only final decision stack.
- Contract engine, reason-code service, fraud gate and auto-adjudication.
- `SyncOperation.opKey`, HMS line hashes and provider invoice uniqueness.
- `ClaimLine` line decisions and adjudication logs.
- `assertServiceDateNotFuture`.

Do not create another adjudication or pricing engine.

## P4 confirmed gaps

- `/api/v1/claims` directly creates a claim and does not call `runClaimIntake`.
- tRPC create calls a different `ClaimsService.createClaim` path.
- CSV import, offline sync, reimbursements and case filing each persist claims separately.
- External API accepts a weaker schema and historically accepted invalid amount shapes.
- Idempotency rules differ by channel.

## P4 stories

### Story P4-A — identical event over two rails

A facility submits the same claim through API and then retries through the portal after a timeout.

Expected: one intake receipt and one claim; the retry returns the existing reference.

### Story P4-B — invalid negative line

API submits quantity 1 and unit amount -5,000.

Expected: structured 4xx with field path; no claim, usage, fraud alert, notification or audit-as-success.

### Story P4-C — mixed coded and uncoded lines

One line has a valid contracted CPT; one is uncoded.

Expected: coded line prices; uncoded line routes to a clear queue/reason and cannot ride into the payable ceiling without the existing approved override.

### Story P4-D — same claim from case/offline/import

Regardless of source, eligibility, provider, benefit, date, amount, coding, contract, fraud and auto-adjudication checks produce equivalent outcomes and reason codes.

## P4 work packages

### P4.0 — Shared intake contract

Create one Zod schema module only after inventorying existing route schemas. It must validate:

- supported service/benefit/category enums;
- parseable service/admission/discharge dates;
- service date not in future;
- admission <= discharge;
- at least one diagnosis when required by configured policy;
- at least one line;
- nonblank description;
- quantity positive integer/allowed decimal by unit type;
- unit/billed amount finite and nonnegative, with total equality tolerance;
- currency ISO code when supplied;
- code formats and code existence, without forcing a code where contract policy allows unlisted services;
- provider branch ownership;
- attachment metadata;
- maximum list/file sizes.

Return field-level 400/422 errors. Do not return raw Prisma errors or schema dumps.

### P4.1 — Refactor canonical intake into stages

Keep `runClaimIntake` as the public direct-entry owner, but extract reusable internal stages so transaction-bound workflows can participate:

1. `parse/normalise` — shared schema and money/date normalization.
2. `validateContext` — P2 eligibility, provider/branch, benefit and PA requirements.
3. `claimFingerprint` — normalized duplicate fingerprint.
4. `persistWithinTransaction(tx, ...)` — claim, lines, PA link and intake receipt.
5. `postIntake` — notification, fraud evaluation, auto-adjudication and audit with failure visibility.

Naming can differ, but responsibilities must be explicit and tested.

### P4.2 — Durable idempotency receipts

Search for a reusable general idempotency model. `SyncOperation` is offline-specific and should not be overloaded if that would mix meanings.

If absent, add a minimal `ClaimIntakeReceipt` (or equivalent) with:

- tenant, source/channel and idempotency key unique together;
- request hash/fingerprint;
- claim ID/reference;
- state `PROCESSING`, `SUCCEEDED`, `FAILED`;
- safe response/error metadata;
- timestamps.

Rules:

- Same key + same request returns the original result.
- Same key + different request returns conflict.
- Concurrent same-key requests create one claim.
- A server timeout after commit can be retried safely.
- Keys are scoped to tenant and authenticated facility/integration identity.

Channel key sources:

- API: required `Idempotency-Key` or documented external transaction ID.
- Provider/admin UI: client-generated submission UUID retained across retry.
- CSV: file hash + sheet/row + provider identity.
- Offline: existing `opKey` mapped into canonical receipt.
- Case filing: case ID + filing sequence/episode decision.
- Reimbursement: request UUID.

Clinical duplicate detection remains separate from transport idempotency.

### P4.3 — Migrate claim creators one at a time

For each rail, add equivalence tests before deleting duplicated logic:

1. `/api/v1/claims` — highest security risk.
2. tRPC claims create.
3. CSV claim import.
4. offline sync claim reconciliation.
5. admin reimbursement action and reimbursement service.
6. `ClaimsService.createClaimWithPreauth`.
7. `CaseService.closeAndFile` using transaction-aware persistence.

After migration, direct `prisma.claim.create` should exist only inside the canonical persistence layer and approved seed/test utilities. Add a consolidation regression test similar to `decision-stack-consolidation.test.ts` that fails when a new production claim creator is added outside the allowlist.

### P4.4 — Provider/API entitlement and source accuracy

- For provider credentials, resolve members with `ProviderEntitlementService` before revealing PII or creating claims.
- Ignore/reject spoofed provider IDs; derive facility from authenticated key/session.
- Bind operator integration credentials to a tenant under P6.
- Persist actual `ClaimSource` per channel (`SMART`, `HMS`, `BATCH`, `OFFLINE_SYNC`, `REIMBURSEMENT`, etc.).
- Persist external references and intake receipts.

### P4.5 — Coding and line-level explanations

Reuse ICD/CPT tables, service-category resolution, contract engine and `reason-codes.service.ts`.

For each line persist:

- submitted code/description/quantity/rate;
- normalized/mapped service identity;
- contract/tariff source;
- allowed, member share, disallowed and payable amounts;
- decision and reason code;
- whether resubmission is permitted and required remedy.

Do not make arbitrary uncoded lines payable. Route them to the existing missing-rate/service-mapping queues or override workflow.

### P4.6 — Status transitions

Inventory direct `Claim.status` updates. If there is no single transition validator, add a small transition helper owned by claims, not a second adjudication service.

Prove:

- illegal backwards transitions fail;
- final/paid claims cannot be recaptured or silently edited;
- appeal and void paths use their existing guarded services;
- intake retry does not advance status twice;
- post-intake pipeline failure leaves a visible manual-review/exception state.

### P4.7 — Required tests

- Shared schema on every rail.
- Negative/zero/NaN/infinite/overflow amounts.
- Quantity and line-total mismatch.
- Future date and invalid inpatient chronology.
- Unknown member/provider/branch/code.
- Out-of-entitlement provider.
- Missing PA and wrong-member/provider/expired PA.
- Same idempotency key same/different payload.
- Concurrent duplicate requests.
- API timeout simulation after commit.
- CSV row retry.
- Offline replay.
- Mixed coded/uncoded payable ceiling.
- Contract preview equals enforced decision ceiling.
- Fraud/duplicate gate prevents finalization until cleared.
- No raw 500 for client validation errors.

## P4 definition of done

- P4-A through P4-D pass.
- The consolidation guard proves no unapproved production claim creator exists.
- Every channel produces the same normalized line/reason shape and uses `ClaimDecisionService` for final decisions.

---

# P5 — Production-grade inpatient and case management

## P5 outcome

An inpatient episode can be opened, authorized, accrued, extended, discharged, filed, adjudicated and settled without future/overlapping charges, duplicate filing or lost PA/LOU state.

## P5 existing components to reuse

- `ClinicalCase`, `CaseServiceEntry`, case statuses/types.
- `CaseService.openCase`, `addServiceEntry`, `voidServiceEntry`, PA/LOU attachment, `closeAndFile` and cancellation.
- Admin case pages and LOU pages.
- PA holds/GOP fields and amendment functions in `preauth-adjudication.service.ts`.
- HMS batch validation, line hashing, exception logging and `CaseService.addServiceEntry` call.
- Contract engine package, documentation, pricing and quantity rules.

Do not rebuild case storage, PA, LOU, HMS push or contract pricing.

## P5 confirmed gaps

- `CaseService.addServiceEntry` validates quantity/amount but not future, pre-admission or post-discharge dates.
- There is no ward/ICU mutually-exclusive bed-day edit.
- `closeAndFile` checks for an existing claim but two concurrent closes can race.
- Provider portal has no admission/case workflow.
- One case to many claims is intentionally not built and requires a TPA decision.

## P5 decisions required before optional scope

1. Keep one case -> one claim, or allow interim/final claims? **Default:** keep one case -> one claim.
2. For maternity/newborn, create linked mother/newborn cases or multiple claims under one case? **Safe default:** linked cases because members differ.
3. Is ward+ICU on the same day always mutually exclusive, or can partial-day billing coexist? Record configurable rule.
4. Can service entries be posted after discharge as late charges? **Default:** only through an explicit late-charge workflow with reason/approval; never by changing the historical discharge silently.

### Story P5-A — ordinary admission

Provider verifies eligibility, submits inpatient PA, receives GOP, opens admission, adds daily services, discharges, files once, and the approved payer share settles and ties to GL/remittance.

### Story P5-B — future/post-discharge charge

An HMS batch sends a service tomorrow or two days after discharge.

Expected: line is rejected/unmatched into a visible exception; accrued amount is unchanged.

### Story P5-C — overlapping bed day

Ward and ICU full-day charges are submitted for the same patient/date when contract policy makes them mutually exclusive.

Expected: second charge is blocked/pended with an explicit overlap reason.

### Story P5-D — concurrent close

Two operators click “Close & file” together.

Expected: one claim, one closed case and one set of PA/LOU transitions.

## P5 work packages

### P5.0 — Re-run and characterize inpatient defects

Create failing tests for:

- future service entry;
- entry before admission;
- entry after discharge;
- discharge before admission/latest service;
- overlapping bed day;
- concurrent close.

Re-run the relevant current inpatient UAT before and after fixes.

### P5.1 — Central case chronology validation

Extend `CaseService`; HMS already calls it and will inherit the rule.

Rules:

- Admission date cannot be future except a clearly separate pre-admission/planned case state.
- Expected discharge >= admission.
- Service entry >= admission for admitted cases.
- Service entry <= discharge when discharged.
- Service entry cannot be future in operating timezone.
- Close discharge >= admission and >= latest nonvoided service entry.
- `PENDING_CLOSURE`, closed and cancelled cases reject new ordinary entries.
- Late charges use a separately authorized action with reason and audit if product approves them.

All validation occurs server-side. UI `min/max` attributes are convenience only.

### P5.2 — Inpatient service edits

First inspect existing contract fields:

- tariff frequency/quantity limits;
- `ServiceTier`/service-category mappings;
- package components and pricing rules;
- per-diem rules.

Reuse them where possible. Add configuration only for genuinely missing clinical edits, including:

- mutually exclusive bed/service groups;
- maximum one full bed-day per date;
- oxygen/professional-round frequency;
- date-range quantity consistency;
- duplicate service code/date/provider;
- procedure package/unbundling where configured.

Each edit is `HARD_BLOCK`, `PEND` or `WARN`, effective dated and client/contract scoped. Do not hardcode one hospital's rules globally.

### P5.3 — Admission extensions and PA/LOU ceilings

Reuse existing PA amendment/hold machinery if present and complete it rather than adding an extension model.

Workflow:

1. Provider requests extension with revised discharge, services and estimate.
2. TPA reviews under SLA.
3. Approval extends PA validity/amount and adjusts the existing hold atomically under P1.
4. LOU/GOP revision is versioned; prior document remains accessible.
5. Case detail shows original and current authorized ceilings.
6. Claim decision enforces remaining PA/LOU and benefit ceilings.

### P5.4 — Race-safe case closure

Make close-and-file one idempotent transaction:

1. Compare-and-set case from `OPEN/PENDING_CLOSURE` to filing state inside the transaction.
2. Revalidate chronology, nonempty services, PA/LOU and benefit requirements.
3. Use P4 transaction-aware canonical claim persistence.
4. Link PAs, consume LOUs and close case.
5. Return existing claim on an exact retry after successful commit.
6. Concurrent loser receives the existing claim/reference, not a 500 or second claim.

Do not add a unique `caseId` constraint while the schema intentionally permits future multiple claims; use a filing idempotency key or guarded state transition.

### P5.5 — Provider admission/case workbench

After P3 preauth is complete, add provider-scoped:

- admission notification/start case;
- own open cases list/detail;
- PA/LOU attachment/view;
- manual service capture or HMS status view;
- extension request;
- discharge request/summary;
- case-filed claim link.

The provider cannot select or alter another facility ID and cannot close/price/adjudicate beyond the actions explicitly delegated.

### P5.6 — Transfers, maternity and newborn, conditional

Do not implement until decisions are recorded.

Preferred transfer model:

- close/transfer the sending facility segment;
- create a linked receiving-facility case;
- preserve ambulance/referral authorization;
- never move historical charges by changing `providerId`.

Preferred newborn model:

- create/link the newborn member;
- open a linked newborn case;
- retain mother/newborn privacy and benefits independently;
- use explicit grace-period eligibility if contractually allowed.

### P5.7 — Required tests

- P5-A through P5-D.
- Manual and HMS paths share date validation.
- Batch replay remains idempotent.
- PA extension increases hold once.
- Declined extension changes neither hold nor case ceiling.
- Ward/ICU policy variants.
- Voided entry excluded from overlap and accrued totals.
- Close/retry/concurrent close.
- Benefit, contract, PA, LOU, settlement, fund and GL tie-out.
- Provider A cannot access Provider B case.

## P5 definition of done

- One long-stay admission completes through remittance and balanced GL.
- No invalid date/overlap contributes to accrued or payable amounts.
- One episode filing produces one result under concurrency.
- The one-case-many-claims decision is either explicitly deferred or separately approved and planned.

---

# P6 — Hard data isolation

## P6 outcome

Every read, write, background job, export, offline pack and document download is confined to the authenticated actor's tenant/client/group/provider/member scope. Missing scope fails closed.

## P6 existing components to reuse

- `Tenant`, `Client`, `Group`, `Member` hierarchy.
- `User.clientId`, `groupId`, `providerId`, broker/member bindings.
- `ProviderEntitlementService` with client and group applicability support.
- `src/server/trpc/clientScope.ts`.
- `requireProvider`, provider-scope API helpers and provider API keys.
- HR, fund, broker and member portal scope implementations.
- Existing provider/member/API IDOR tests.

Do not add another hierarchy or a second provider entitlement engine.

## P6 confirmed gaps

1. Provider portal eligibility, member prefill and submission query members by `tenantId` only.
2. Offline packs select all active tenant members and filter package eligibility, not provider contract applicability.
3. `/api/v1/claims` member lookup must apply provider entitlement when a provider key is used.
4. Multiple unrelated employers may sit below one Default Client, widening client-level applicability.
5. Operator integration credentials are environment-based and only conditionally tenant-bound, not a database-managed rotatable per-tenant key system.

## P6 stories

### Story P6-A — sibling employer

Provider A is entitled only to Scheme A. Scheme B is under the same operator/client. Provider A searches or submits Scheme B's member number.

Expected: 404/no PII and no write.

### Story P6-B — direct URL and copied document

Provider A copies Provider B's claim/case/document URL.

Expected: 404 or branded unauthorized with no metadata, file or timing distinction useful for enumeration.

### Story P6-C — client-confined staff

A staff user confined to Client A manually enters Client B IDs into routes, forms, tRPC calls and exports.

Expected: deny; no cross-client option lists or aggregate totals.

### Story P6-D — offline pack

Provider A downloads an offline roster.

Expected: only members of contracted clients/groups and eligible packages; no other tenant/client/group PII.

## P6 work packages

### P6.0 — Formal scope policy

Complete F0 `SCOPE_MATRIX.md`. Define:

- operator staff scope;
- client-confined staff scope;
- HR/fund group scope;
- broker book scope;
- provider facility + contracted client/group scope;
- member self/family scope, including sensitive dependant categories;
- reports/exports and background-job scope;
- object-storage document scope.

For PII lookups, prefer indistinguishable 404. For authenticated portal misuse where existence is already known, branded unauthorized is acceptable. Do not leak names/status in denial messages.

### P6.1 — Immediate provider read/write repairs

Implement P3.0 plus:

- Provider-key `/api/v1/claims` member lookup uses `ProviderEntitlementService`.
- Provider preauth API continues using entitlement and receives parity tests.
- Provider portal eligibility and benefits calculations use the same scoped member returned by P2.
- Claim/preauth/case provider IDs always come from session/key.

Add tests first because this is a privacy hotfix.

### P6.2 — Offline pack and sync scoping

In `OfflinePackService.buildPayload`:

1. Start from `ProviderEntitlementService.entitledMemberWhere(providerId)`.
2. Apply P2 point-in-time eligibility.
3. Apply package provider eligibility.
4. Include only the facility's effective client/group tariffs; do not use only `clientId: null` when client-specific rates apply.
5. Stamp client/group/provider into `EligibilitySnapshot`.

At sync:

- derive provider from the offline authorization;
- re-run provider entitlement and P2 eligibility;
- use P1 category-specific availability;
- mismatches become visible conflicts, never silent acceptance.

### P6.3 — Correct Client/Group data modelling

Do not blindly create one Client per Group.

Business rule:

- `Client` is the legal payer/risk/funding owner.
- Several schemes may share a Client when they genuinely share that payer and network.
- A self-funded employer should normally be its own Client.
- A provider contract may apply to a whole Client or selected `groupId`s; the schema and service already support both.

Create a read-only audit script/report listing:

- each group, funding mode and current client;
- count of sibling groups per client;
- provider applicability at client and group level;
- users scoped to client/group;
- member count exposed per provider under current rules.

Review and approve the mapping before applying changes. Then:

1. Create missing legal payer Clients.
2. Reassign Groups.
3. Backfill precise `ContractApplicability.groupId` where a contract does not cover every sibling group.
4. Preserve historical claim/client interpretation through snapshots; do not silently reprice old claims.
5. Apply new member-number prefixes only to future numbers unless an explicit renumber project is approved.

### P6.4 — Shared scope helpers for server components/actions

tRPC has `clientScope.ts`, but server components and actions often write Prisma filters directly.

After inventory, add or extend a small access-scope helper that derives immutable filters from the authenticated session. It should support:

- staff tenant/client;
- HR/fund group;
- provider facility + entitlement;
- broker;
- member/family.

Rules:

- IDs from form/query parameters narrow scope; they never broaden it.
- A caller cannot select a client/provider outside its binding.
- Missing expected binding fails closed.
- Services accept scope/context rather than trusting UI filtering.

Migrate the six-priority routes first. Do not attempt an uncontrolled whole-repo rewrite in one package.

### P6.5 — Integration credentials

Provider API keys already have a database model. Reuse their secure patterns: hash at rest, show plaintext once, revoke, rotate, last-used metadata and facility binding.

For operator/client integrations, verify whether a current general credential model exists. If missing, add a database-managed integration credential bound to:

- tenant;
- optional client/group;
- allowed endpoints/scopes;
- active/revoked and validity dates;
- key hash, prefix, created/last-used/revoked metadata.

Remove unbound operator behavior once all integrations are migrated. An unset credential configuration must fail closed.

### P6.6 — Documents, reports and jobs

Audit:

- `/api/upload` and document download URLs.
- claim/preauth/member health documents.
- CSV/PDF exports.
- board packs and scheduled reports.
- notification and worker jobs.

Requirements:

- authorize every download, not just the page linking to it;
- use short-lived signed URLs where applicable;
- exports receive the actor scope and cannot accept a broader client/group parameter;
- background jobs iterate explicit tenant/client scopes;
- logs do not include unnecessary PII.

### P6.7 — Required tests

Build tests from every `SCOPE_MATRIX` deny cell, prioritizing:

- Provider A -> Provider/Client/Group B eligibility, benefits, claims, preauth, cases, settlement and document.
- Same Client but excluded sibling Group.
- HR/fund cross-group.
- client-confined staff cross-client direct ID.
- member cross-member and sensitive dependant document.
- broker foreign group.
- API credential spoofed provider/client/group.
- offline pack content.
- report/export query tampering.
- inactive/revoked key.
- missing binding fails closed.

## P6 definition of done

- P6-A through P6-D pass.
- Every deny cell in the scope matrix has an automated or recorded UAT test.
- No provider/member lookup in priority-six routes is tenant-only.
- Shared-client arrangements are either legitimate and documented or narrowed with group applicability.

---

# 6. Integrated end-to-end UAT campaign

Create `uat/priority-six/` with a master run log, defect register and evidence index. Run through the UI as each actor; use API calls only for API stories. Database reads may verify side effects but must not create test data.

## Scenario E2E-01 — outpatient exact-once and limit

Actors: Provider A, Claims Officer, Finance Maker, Finance Checker, Member.

1. Member has 100,000 remaining outpatient benefit.
2. Provider verifies eligibility and captures the eligibility reference.
3. Provider submits an 80,000 claim with idempotency key X.
4. Retry key X; confirm same claim.
5. Submit a distinct second 80,000 claim.
6. Approve first.
7. Attempt full approval of second; confirm benefit block and no side effects.
8. Deliberately partially approve at remaining 20,000 if policy permits.
9. Settle maker/checker.
10. Tie claim, usage, member view, fund if self-funded, batch, voucher, provider remittance and GL.

## Scenario E2E-02 — historical eligibility and retroactive endorsement

Actors: HR Manager, Underwriter/Approver, Provider, Claims Officer.

1. Create/identify a member with Group A coverage.
2. Apply approved transfer to Group B effective on a known date.
3. Check eligibility one day before and on effective date.
4. File claims on both sides of boundary.
5. Confirm correct group/package/network/benefit snapshots and no rewriting of the earlier claim.

## Scenario E2E-03 — provider preauth query loop

Actors: Provider, Medical Officer, Member.

1. Provider verifies eligible member.
2. Submit PA with one document.
3. Medical Officer requests another document.
4. Provider responds and uploads.
5. Medical Officer approves GOP.
6. Verify hold, notification, SLA history, provider visibility and member visibility.

## Scenario E2E-04 — provider correction and remittance

Actors: Provider, Claims Officer, Finance.

1. Submit claim with incorrect code.
2. Withdraw/replace before decision.
3. Confirm original immutable and replacement linked.
4. Decide and settle replacement.
5. Provider opens remittance and reconciles exact values.

## Scenario E2E-05 — inpatient episode

Actors: Provider, Medical Officer, Case Manager/Claims Officer, Finance.

1. Verify inpatient eligibility.
2. Submit/approve PA and GOP hold.
3. Open case and add valid services.
4. Attempt future, pre-admission, post-discharge and overlapping bed charges.
5. Request/approve extension.
6. Discharge and double-click/concurrently invoke close-and-file.
7. Confirm one claim.
8. Adjudicate within contract, PA, LOU and benefit ceilings.
9. Settle and tie to usage, hold, fund, remittance and GL.

## Scenario E2E-06 — isolation attack matrix

Actors: Provider A/B, HR A/B, Fund A/B, Member A/B, client-confined staff, broker.

Run every high-risk deny cell by direct URL, query parameter, form tampering, API body and copied document link. Capture status, redirect, response body and absence of PII.

## Scenario E2E-07 — offline conflict

1. Generate Provider A offline pack.
2. Confirm roster has only entitled members.
3. Capture an operation against cached available benefit.
4. Spend the balance online before reconnect.
5. Sync offline operation twice.
6. Confirm one operation, visible conflict, no over-limit usage/payment and no data loss.

---

## 7. Test and verification commands

Focused tests belong to each work package. Before merging a completed epic run:

```bash
npx vitest run
npm run typecheck
npm run lint
npm run brand:guard
npm run currency:guard
npm run build
```

Notes:

- `npm test` is not a configured package script; use `npx vitest run`.
- Local `npm run build` skips production DB sync unless `VERCEL_ENV=production`.
- Never point schema/build tests at production.
- Run `npx tsx scripts/data-integrity-check.ts` only against an authorized environment and record which database was used without printing secrets.

For concurrency and idempotency work, mocked unit tests are not sufficient. Add integration tests against disposable PostgreSQL or execute a controlled local/UAT run proving concurrent transactions.

---

## 8. Release gates

No priority-six release is complete until all apply:

### Correctness

- Eligibility is service-date based and consistent across channels.
- Payer exposure cannot exceed contract, benefit, PA or LOU ceilings.
- Every transport retry is idempotent.
- Family/shared limits and PA holds reconcile.
- Inpatient invalid dates/overlaps cannot create payable money.

### Privacy

- Provider and client/group scope is server-enforced.
- Direct object and document-link probes fail safely.
- Offline packs and exports contain only authorized records.

### Financial integrity

- Approved payer share equals settlement, voucher and GL source amount.
- Failed decisions produce no partial GL, fund, usage or notification side effects.
- Reversals compensate exactly once.

### Operability

- Provider can complete preauth, information response, claim and remittance stories.
- Errors are visible and actionable.
- Async failures land in visible queues/exceptions.

### Evidence

- Focused automated tests pass.
- Full Vitest, typecheck, lint and build pass.
- Integrated UAT scenarios have actor, record IDs, screenshots, URLs and tie-out values.
- No open Critical or High defect in the six priority areas.

---

## 9. Agent handoff checklist

Every implementing agent must leave the next agent:

1. Proof-before-build note.
2. Exact files changed.
3. Schema/backfill/seed impact.
4. New service contracts and reason codes.
5. Tests and commands run with results.
6. UAT records created and their current status.
7. Known gaps not silently deferred.
8. Confirmation that no parallel business-rule implementation was introduced.

The next agent must re-run the proof gate. It must not trust a prior agent's “implemented” label without inspecting code and tests.

---

## 10. Master completion checklist

### Foundation

- [ ] F0 baselines recorded.
- [ ] Claim creator inventory complete.
- [ ] Scope matrix complete.

### P1 Benefit limits

- [ ] Decisions recorded.
- [ ] Unified availability result.
- [ ] Atomic PA holds.
- [ ] Atomic claim consumption.
- [ ] FAMILY shared limits.
- [ ] Concurrent double-spend test.
- [ ] Reconciliation script and permanent integrity checks.
- [ ] `IP-DEF-06` closed.

### P2 Eligibility/lifecycle

- [ ] Rule inventory.
- [ ] Canonical eligibility service.
- [ ] Effective-dated coverage history.
- [ ] All channels migrated.
- [ ] Eligibility snapshots.
- [ ] Duplicate-member warnings.
- [ ] Historical/retroactive UAT.

### P3 Provider channel

- [ ] Provider member-scope hotfix.
- [ ] Provider preauth list/create/detail.
- [ ] Clinical information requests.
- [ ] Claim documents.
- [ ] Withdrawal/correction/resubmission.
- [ ] Settlement/remittance detail.
- [ ] Provider end-to-end UAT.

### P4 Claims integrity

- [ ] Shared input schema.
- [ ] Canonical intake stages.
- [ ] Durable idempotency receipts.
- [ ] API migrated.
- [ ] tRPC/import/offline/reimbursement/case rails migrated.
- [ ] Claim-creator consolidation guard.
- [ ] Coding/reason parity.
- [ ] Status-transition guard.

### P5 Inpatient/cases

- [ ] Chronology validation.
- [ ] Configurable inpatient edits.
- [ ] PA extension/hold workflow.
- [ ] Race-safe case close.
- [ ] Provider case workbench.
- [ ] Optional transfer/maternity/newborn decisions recorded.
- [ ] Long-stay money-spine UAT.

### P6 Isolation

- [ ] Priority provider leaks fixed.
- [ ] Offline pack and sync scoped.
- [ ] Client/Group audit and approved data correction.
- [ ] Shared access-scope helpers.
- [ ] Tenant-bound integration credentials.
- [ ] Documents/reports/jobs audited.
- [ ] Full negative scope matrix executed.

### Release

- [ ] E2E-01 through E2E-07 passed.
- [ ] No Critical/High open.
- [ ] Full automated verification passed.
- [ ] Production backfill/deployment/rollback steps approved.

