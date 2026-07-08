# Defect and Issue Remediation Plan - Outpatient Vercel UAT

**Created:** 2026-07-08  
**Source documents:** `GO_NO_GO_READINESS.md`, `DEFECT_REGISTER.md`, `E2E_SCENARIO_RUN_LOG.md` where referenced by those files  
**Current readiness position:** NO-GO until provider API scoping is fixed, deployed, and re-verified.

## 1. Purpose

This plan converts the go/no-go findings into a practical engineering work plan. It deliberately favours narrow, low-blast-radius changes: fix the failing control at the smallest stable boundary, add regression tests around that boundary, and avoid broad rewrites of working outpatient claim, adjudication, settlement, GL, and portal flows.

## 2. Delivery Principles

1. **Patch the boundary that leaks, not the whole workflow.** API-scope defects should be fixed at the API-auth/service-scope layer and then reused by each affected route.
2. **Fail closed.** If a provider key has no entitlement, missing contract applicability, mismatched tenant/provider, missing FX rate, or ambiguous currency, return a controlled denial instead of falling back to broad access or raw arithmetic.
3. **Preserve verified money flows.** The front-end claim spine, settlement maker/checker flow, payment voucher creation, GL balancing, member notifications, and PDF export have all had passing evidence. Do not refactor them unless a listed issue requires it.
4. **Use existing helpers first.** Prefer `getApiCredential`, `providerScopeWhere`, `ProviderEntitlementService`, `formatMoney`, `formatBaseMoney`, existing approval services, existing audit helpers, and current settlement services.
5. **Add tests before expanding scope.** Every blocker gets focused API/service tests that reproduce the UAT failure and prove the negative case returns 404/403 without PII.
6. **Separate defect remediation from product decisions.** Fraud gating, FX accounting policy, and member notification rules may need product sign-off; put them behind tenant settings or fail-safe guardrails instead of changing all tenants silently.
7. **Keep UI changes surgical.** For member search and member-user linking, fix only the lookup behaviour. Do not redesign the settings page, member registry, or invite flow.

## 3. Prioritised Workstreams

| Priority | Item | Severity | Type | Target outcome |
|---|---:|---|---|---|
| P0 | E2E-D02 provider API read scoping | Critical | Security blocker | Provider keys cannot read cross-provider claims or cross-client member PII. |
| P0 | E2E-D04 provider API preauth create scoping | Critical | Security blocker | Provider keys cannot create preauths for arbitrary members or facilities. |
| P1 | E2E-D01 member full-name search | Medium | Admin workflow | `First Last` searches return expected members without weakening tenant/client filters. |
| P1 | E2E-OBS-MEMSEL member invite selector cap | Low/Medium | Provisioning | Admin can link member users across the full roster via searchable lookup. |
| P1 | E2E-OBS-CUR / OBS-2 residual currency labels | Low/Medium | Display/control | Operational money screens consistently show row currency or UGX base. |
| P1/P2 | OBS-2 FX and mixed-currency controls | Condition | Finance control | No raw cross-currency settlement or GL posting; non-base claims use auditable FX. |
| P2 | OBS-7 fraud approval gate | Condition | Money control | Fraud-flagged payable claims require clearance or second approval when tenant setting is enabled. |
| P2 | GL coverage confidence | Condition | Finance assurance | Fresh UI-created claims and settlements have observable GL posting coverage. |
| P2 | Scale/load proof | Condition | Operational assurance | Settlement timeout class and core outpatient paths have repeatable performance tests. |
| P3 | OBS-1, PR-V01, PR-V02, OBS-4, OBS-5, OBS-CLOSURE-1, OBS-CLOSURE-2 | Fixed/low | Regression | Keep fixed behaviour covered; do not reopen. |
| P3 | OBS-6 clinical nav link | Low | UX/RBAC | Hide inaccessible link or align role permission without reducing route protection. |
| P3 | Documentation consistency | Low | Governance | Readiness scoreboard reflects current blockers and fixed items consistently. |

## 4. P0 - E2E-D02 Provider API Read Scoping

### Finding

`GET /api/v1/eligibility` and `GET /api/v1/claims?claimNumber=` authenticated Bearer/provider keys but allowed a provider key to read out-of-scope member PII and out-of-facility claim financials. Sequential member and claim numbers make this enumerable, so this is a hard NO-GO.

### Minimal Design

Use the authenticated API key identity as the source of truth.

- Provider key:
  - Eligibility/benefits member lookup must be confined to members covered by that provider's active contract applicability.
  - Claim lookup must be confined to claims belonging to that provider facility.
- Operator/global integration key:
  - May retain broad tenant/system access where explicitly intended.
- No valid credential:
  - 401 through `withApiKey`.
- Provider with no active INCLUDE applicability:
  - Deny by default; return the same 404 shape as a missing member.

### Implementation Steps

1. Confirm or keep `src/lib/apiAuth.ts` as the common credential boundary:
   - `getApiCredential(req)` returns `{ kind: "provider", tenantId, providerId, keyId }` for provider keys.
   - `providerScopeWhere(credential)` returns `{ providerId }` for provider keys and `{}` only for operator credentials.
2. Confirm or keep `src/server/services/provider-entitlement.service.ts`:
   - Resolve entitlement through Provider -> active ProviderContract -> ContractApplicability.
   - Include client-level and group-level INCLUDE rows.
   - Subtract EXCLUDE rows.
   - Return an impossible filter if there is no include.
3. In `src/app/api/v1/eligibility/route.ts`:
   - Load `credential` inside the handler.
   - For provider credentials, spread `ProviderEntitlementService.entitledMemberWhere(providerId)` into the member lookup.
   - Return 404 without member details when out of scope.
4. In `src/app/api/v1/benefits/route.ts`, apply the same member entitlement guard. The go/no-go calls out eligibility, but the same member PII/benefit surface should share the scope rule.
5. In `src/app/api/v1/claims/route.ts` GET:
   - Spread `providerScopeWhere(credential)` into the claim lookup.
   - Return 404 without member/provider/amount fields when out of scope.
6. Do not change the POST claim flow unless tests show a regression. The UAT evidence says provider claim creation was already scoped to the key's facility.

### Tests

Create or preserve focused API tests in `tests/api/provider-read-scope.test.ts`.

Required cases:

1. Provider A can read a member under a contracted client.
2. Provider A gets 404 for a member outside contracted clients; response contains no PII.
3. Provider B gets 404 for Provider A's claim; response contains no member/amount/provider detail.
4. Provider with no active INCLUDE applicability gets 404 for all members.
5. Operator key retains intended cross-provider/system read access.
6. EXCLUDE applicability removes an otherwise included group/client.

### Acceptance Criteria

- The exact UAT exploit pattern returns 404 for out-of-scope members and claims.
- Garbage key still returns 401.
- No front-end outpatient flow changes.
- Regression tests pass locally and in CI.
- Production/Vercel verification repeats the negative curl checks with real provider keys.

## 5. P0 - E2E-D04 Provider API Preauth Create Scoping

### Finding

`POST /api/v1/preauth` authenticates the API key but currently trusts the submitted `memberNumber` and `providerCode`. A provider key can create a preauth for an arbitrary member and attribute it to an arbitrary provider. This is a cross-tenant/cross-facility write defect.

### Minimal Design

Mirror the safe POST-claim behaviour:

- Provider key:
  - Provider identity comes from the key, not from the body.
  - `providerCode` is optional for compatibility but cannot override the key.
  - Member must belong to the same tenant as the key's provider.
  - Member must also satisfy provider entitlement if preauth should only be allowed for contracted clients/groups.
- Operator key:
  - May use `providerCode` to resolve the provider.
- All created preauths:
  - `tenantId` must come from the validated member/provider relationship, not from caller input.
  - `providerId` must be the resolved provider.

### Implementation Steps

1. Update `src/app/api/v1/preauth/route.ts` to import `getApiCredential` and `ProviderEntitlementService`.
2. Resolve `credential` once at the start of the handler.
3. Resolve provider:
   - If provider credential: `providerId = credential.providerId`; ignore or validate `providerCode` only as a consistency check.
   - If operator credential: require `providerCode` and resolve by `slade360ProviderId`.
4. Resolve member:
   - Always search by `memberNumber`.
   - For provider credentials, also apply `ProviderEntitlementService.entitledMemberWhere(provider.id)`.
5. Enforce same-tenant:
   - If `provider.tenantId !== member.tenantId`, return 403.
6. Preserve existing active-member validation and response shape.
7. Add controlled error messages only. Do not leak Prisma, tenant, client, or provider internal details.

### Tests

Add `tests/api/provider-preauth-scope.test.ts`.

Required cases:

1. Provider key can create preauth for an entitled active member at its own facility.
2. Provider key cannot spoof `providerCode` to another facility.
3. Provider key cannot create preauth for member outside entitlement; returns 404 or 403 with no PII.
4. Provider key cannot create preauth across tenant.
5. Operator key can create with a valid `providerCode`.
6. Missing/invalid key returns 401 through wrapper.
7. Inactive member still returns the existing safe denial.

### Acceptance Criteria

- Live route remains active but cross-scope write attempts are blocked before `preAuthorization.create`.
- No preauth records are written on denied attempts.
- Existing member portal/admin preauth pages are untouched.

## 6. P1 - E2E-D01 Member Full-Name Search

### Finding

Admin member registry search works for single tokens such as `Mark` or `Kato`, but `Mark Kato` returns zero even when that exact member exists.

### Minimal Design

Add token-aware search while preserving the existing tenant/client/status/relationship filters.

### Implementation Steps

1. In `src/app/(admin)/members/page.tsx`, normalise `q`:
   - Trim whitespace.
   - Split on whitespace into tokens.
   - Keep the existing single-field contains search.
2. Add an AND token clause:
   - For each token, allow match against `firstName`, `lastName`, `memberNumber`, email, phone, ID, or group name.
   - This lets `Mark Kato` match first and last name in either order without requiring a database full-text index.
3. Keep pagination at 50 and all existing access filters.
4. Do not introduce raw SQL unless performance evidence requires it.

### Tests

Add a small pure helper test if the search predicate is extracted, or a page/query integration test if the project pattern supports it.

Required cases:

1. `Mark` finds Mark Kato.
2. `Kato` finds Mark Kato.
3. `Mark Kato` finds Mark Kato.
4. `Kato Mark` finds Mark Kato if token matching is order-insensitive.
5. A client-scoped user cannot find a member outside their client even with exact full name.

### Acceptance Criteria

- Full-name query returns expected member.
- Existing single-token and member-number searches still work.
- No change to member creation, detail, or import flows.

## 7. P1 - E2E-OBS-MEMSEL Member Invite Selector Cap

### Finding

Invite User -> Member User uses a preloaded `<select>` containing only about 250 members, so most of a 2,999-member roster cannot be linked to a portal login.

### Minimal Design

Replace only the member picker with a tenant/client-scoped searchable lookup. Leave the invite modal and invite action intact.

### Implementation Options

Preferred light option:

1. Add a small internal admin route such as `GET /api/admin/members/search?q=...`.
2. Require admin/session role using existing RBAC/session helpers.
3. Apply the same tenant/client filters as the member registry.
4. Return at most 20-50 results with `id`, display name, member number, and group.
5. Update only the `MEMBER_USER` branch of `InviteUserModal` to use the existing `SearchSelect` component if it supports async search, or a small local search input if not.

Alternative even lighter interim option:

- Add a member-number field to the Member User invite form and resolve it server-side in `inviteUserAction`.
- This is less friendly but removes the cap without building a new picker.

### Implementation Steps

1. Inspect `src/components/ui/SearchSelect.tsx` and reuse it if it already supports query-driven options.
2. Add the member lookup route or server action.
3. In `src/app/(admin)/settings/InviteUserModal.tsx`, replace only the member `<select>` branch.
4. In `src/app/(admin)/settings/actions.ts`, keep accepting `memberId`; optionally add server-side validation that the chosen member belongs to the actor's tenant/client scope.
5. Stop passing the full `members` array to the modal once the async lookup is in place.

### Tests

1. Search by full name, member number, and group returns expected scoped members.
2. Search does not return out-of-tenant/client members.
3. Invite action rejects a memberId outside actor scope even if posted manually.
4. UI can link a member beyond the first 250 records.

### Acceptance Criteria

- Admin can invite/link Mark Kato or any member past the old cap.
- No change to non-member roles in the invite modal.
- No large client-side roster payload.

## 8. P1/P2 - E2E-OBS-CUR and OBS-2 Currency / FX

### Finding

The UGX tenant still shows residual KES labels on provider dashboard/eligibility, settlement detail/voucher/statement, GL page, admin dashboard chart, and some service/preauth/package surfaces. The deeper finance risk is raw mixed-currency settlement and accounting.

### Phase 1 - Display Label Sweep

Use the existing shared helpers in `src/lib/utils.ts`:

- `formatMoney(amount, currency)`
- `formatBaseMoney(amount)`
- `BASE_CURRENCY`

Steps:

1. Extend `scripts/check-currency-labels.mjs` to include the exact surfaces found in E2E-OBS-CUR:
   - provider dashboard and provider claim/eligibility surfaces
   - settlement detail, voucher, provider statement
   - GL page and ledger
   - admin dashboard chart money labels
   - member/provider portal claim money labels
2. Replace operational `KES ...` labels with row currency or base UGX.
3. Do not replace Kenya-specific seed/demo text, currency picker options, tests intentionally modelling KES, or contract import defaults unless those are on live Ugandan operational surfaces.
4. Adjust tests to expect explicit currency codes, not hardcoded KES.

Acceptance:

- CLM-2026-00287 and related PV/JE/provider-statement surfaces render UGX consistently where the underlying row is UGX.
- `npm run currency:guard` passes with the expanded surface list.

### Phase 2 - Mixed-Currency Settlement Guardrail

Steps:

1. In settlement batch creation, select each eligible claim's `currency`.
2. Group by currency.
3. If more than one currency is present, fail closed with a friendly error or create one batch per currency if product approves auto-split.
4. Stamp settlement batch and payment voucher with transaction currency.

Acceptance:

- A batch cannot silently sum UGX and KES.
- Existing single-currency settlement flow remains unchanged.
- Maker/checker and duplicate-batch controls remain intact.

### Phase 3 - FX-Normalised Accounting

Steps:

1. Continue using `FxService` for non-base conversion.
2. On approval/partial approval:
   - Persist transaction amount, transaction currency, base amount, FX rate, rate date, and base currency.
   - Fail closed if a non-base rate is missing.
3. On settlement:
   - Post GL in base currency.
   - Preserve voucher transaction amount and base equivalent.
4. Display both transaction and base amounts for non-base claims where finance users need auditability.

Acceptance:

- KES claim with in-force rate posts UGX base amount to GL.
- KES claim without FX rate cannot be approved/settled.
- Reports can tie transaction totals and base totals without guessing historical FX.

## 9. P2 - OBS-7 Fraud Approval Gate

### Finding

A single claims officer can approve or partially approve a fraud-flagged claim when the amount is within the normal payable ceiling. This is a money-control condition, not currently the NO-GO blocker, but it should be fixed before broader production rollout.

### Minimal Design

Add a tenant-controlled gate:

```json
{
  "claims": {
    "requireFraudClearanceBeforeApproval": true,
    "fraudApprovalSeverityThreshold": "MEDIUM",
    "fraudApprovalGateMode": "CLEAR_ALERT_OR_DUAL_APPROVAL"
  }
}
```

Default should be off unless product explicitly approves enabling it globally. Enable it for the UAT tenant.

### Implementation Steps

1. Add or reuse a typed tenant-settings helper for claim controls.
2. Add `ClaimControlService.enforceFraudGate(...)` rather than embedding fraud logic throughout the decision service.
3. In `ClaimDecisionService.decide`, enforce the gate after basic decision validation but before:
   - utilisation updates
   - fund movements
   - GL posting
   - member notifications
   - settlement eligibility
4. Only gate payable decisions: APPROVED and PARTIALLY_APPROVED. Declines should remain allowed.
5. Allow satisfaction by either:
   - all applicable fraud alerts resolved, or
   - a completed dual approval request, if product wants this path.
6. Show a clear banner/error on claim detail and approval screens.
7. Audit every clearance and every gate-triggered approval request.

### Tests

1. Setting off preserves current behaviour.
2. Setting on blocks approval for unresolved medium/high fraud alert.
3. Decline is allowed with unresolved alert.
4. Resolved alert permits approval.
5. Dual approval path cannot be satisfied by the same maker/checker.
6. Blocked fraud approval creates no GL, utilisation, settlement eligibility, or member approved/paid notification.

### Acceptance Criteria

- Fraud-flagged payable claims cannot become payable without clearance/second approval when setting is enabled.
- False-positive fraud alerts can still be resolved by authorised roles.
- Existing non-fraud claim approvals remain unchanged.

## 10. P2 - GL Coverage Confidence

### Finding

The readiness document originally raised concern that GL revenue/claims figures looked small versus claim volume. Later closure evidence suggests fresh UI-processed claims post correctly and the gap may be seed/import artifact. The remaining work is observability and proof, not a wholesale GL rewrite.

### Minimal Design

Add reconciliation checks that prove fresh claim/settlement events have matching GL postings.

### Implementation Steps

1. Preserve current settlement JE behaviour verified by PR-V02 closure.
2. Extend or run `scripts/gl-coverage-report.ts` to produce:
   - approved/paid claims missing claim-incurred journal
   - paid claims missing cash settlement journal
   - journals with amount mismatch
   - seed/imported records separated from UI-created records
3. Add service-level tests around claim approval and settlement posting if not already present.
4. Add a finance-facing admin report only if stakeholders need recurring visibility; otherwise keep as a CLI/CI reconciliation script first.

### Acceptance Criteria

- Fresh UAT claim approval creates expected claims-incurred GL.
- Fresh settlement creates expected payable/cash GL.
- Historical gaps are listed separately with remediation owner: data migration, seed cleanup, or accepted demo artifact.

## 11. P2 - Scale and Load Proof

### Finding

The original settlement timeout was fixed, but broader concurrent-load proof remains unproven.

### Minimal Design

Use repeatable synthetic load tests without changing working application code.

### Implementation Steps

1. Extend `loadtest/outpatient.k6.js` or add scoped scripts for:
   - provider eligibility lookup
   - claim intake
   - claim list/detail reads
   - settlement batch creation/approval/mark-paid where safe in non-production
2. Add a settlement stress test that covers at least:
   - 50 claims
   - 250 claims
   - duplicate settlement prevention
   - maker/checker enforcement
3. Define non-production environment and reset data rules.
4. Track p95/p99 latency, error rate, and DB timeout indicators.

### Acceptance Criteria

- 46-claim batch class is covered by automated regression.
- Load test results are attached to readiness evidence.
- Any failing threshold creates a performance ticket instead of silently becoming a go-live risk.

## 12. P3 - Fixed Items to Protect With Regression Tests

These items are not current blockers if the fixed code is deployed, but they should remain protected.

| Item | Current UAT state | Regression protection |
|---|---|---|
| PR-V02 settlement Mark Paid timeout/raw error | Fixed and live-verified | Settlement stress test; safe error assertion; GL balanced assertion. |
| PR-V01 provider search | Fixed and live-verified | Search test for provider name/code aliases. |
| OBS-4 contract preview payable 0 | Fixed and live-verified | Component/service test that preview and adjudication use same contract result/caveat. |
| OBS-5 fraud variance false positive | Fixed and live-verified | Contracted-rate variance test uses line-level basis, not whole-claim vs one line. |
| OBS-1 invite blank pane | Code-verified | Invite action/modal test confirms modal closes and list refreshes. |
| OBS-CLOSURE-1 PDF export | Fixed and live-verified | Keep `ReportDocument` PDF-byte test; avoid serverless Puppeteer route dependency. |
| OBS-CLOSURE-2 member notifications | Fixed and live-verified | Service tests for intake, decision, settlement, and dependant-to-principal notification. |

## 13. P3 - OBS-6 Clinical Nav Link

### Finding

Claims officer sees a Clinical -> Exceptions nav link that routes to branded Access Denied. Security is correct; UX is noisy.

### Minimal Plan

1. Find the nav definition for Clinical/Exceptions.
2. Hide the link for CLAIMS_OFFICER if that role is not meant to access it.
3. Do not loosen the `/settings/exceptions` route guard.
4. Add a nav smoke test if current menu tests support role snapshots.

Acceptance:

- Claims officer no longer sees dead-end nav link.
- Direct URL remains Access Denied.

## 14. Documentation Cleanup

The UAT docs contain a few time-layered statements: PR-V02 is fixed, E2E-D02 is the current read-scope blocker, and the defect register also adds E2E-D04 as a critical preauth write-scope blocker.

After remediation:

1. Update the go/no-go blocker scoreboard to include E2E-D02 and E2E-D04, not only PR-V02.
2. Mark each item with one of:
   - OPEN
   - FIXED-CODE
   - FIXED-VERIFIED-LOCAL
   - FIXED-VERIFIED-LIVE
   - ACCEPTED/INTENTIONAL
3. Keep evidence links or screenshot IDs with the relevant item.
4. Move fixed observations out of "open" sections but keep them in the regression table.

## 15. Suggested Execution Order

### Day 0 / Hotfix Branch

1. E2E-D02 read scoping verification and tests.
2. E2E-D04 preauth create scoping and tests.
3. Deploy to Vercel.
4. Run negative production verification with real provider keys.
5. Update readiness status for security blockers.

### Day 1

1. Member full-name search.
2. Member-user invite searchable lookup.
3. OBS-6 nav cleanup if trivial.
4. Run admin/member provisioning regression.

### Day 2-3

1. Currency display sweep for the exact residual surfaces.
2. Expand currency guard allowlist/surface list.
3. Add mixed-currency settlement guardrail.
4. Verify the original money spine still passes.

### Day 4+

1. FX-normalised accounting if multi-currency go-live is in scope.
2. Fraud approval gate behind tenant setting.
3. GL coverage report and evidence.
4. Load/stress run and evidence.

## 16. Verification Matrix

| Area | Command / Method | Must prove |
|---|---|---|
| Type safety | `npm run typecheck` | No TypeScript regressions. |
| Lint | `npm run lint` | No lint regressions. |
| Currency guard | `npm run currency:guard` | Core money surfaces do not hardcode KES. |
| API scoping | `npx vitest run tests/api/provider-read-scope.test.ts tests/api/provider-preauth-scope.test.ts` | Cross-scope read/write attempts fail closed. |
| Money services | `npx vitest run tests/services/claim-decision.service.test.ts tests/services/settlement-gl.test.ts tests/services/fx.service.test.ts` | FX, GL, settlement guardrails hold. |
| Member search/provisioning | Focused tests or browser pass | Full-name search and member-link lookup work past 250 roster items. |
| Live UAT | Browser/curl evidence | E2E-D02 and E2E-D04 exploit paths blocked on deployed build. |
| Regression spine | Front-end UAT smoke | Eligibility -> intake -> adjudication -> settlement -> voucher -> GL -> statement still works. |

## 17. Definition of Done

The remediation is complete when:

1. E2E-D02 and E2E-D04 are fixed in code, covered by regression tests, deployed, and live-verified.
2. E2E-D01 and E2E-OBS-MEMSEL no longer block admin/member provisioning workflows.
3. Residual KES labels are removed from the listed UGX operational surfaces, and the guard script covers those surfaces.
4. Mixed-currency settlement cannot silently sum different currencies.
5. Fraud-gate policy is either implemented behind a tenant setting or explicitly accepted as a documented product risk.
6. GL coverage and load-test evidence are attached to the readiness folder.
7. The go/no-go and defect register are updated so open/fixed states no longer conflict.

