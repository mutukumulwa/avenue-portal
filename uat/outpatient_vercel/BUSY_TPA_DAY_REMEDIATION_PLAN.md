# Busy TPA Day Remediation Plan

**Created:** 2026-07-08  
**Source artifacts:** `BUSY_TPA_DAY_GO_NO_GO.md`, `BUSY_TPA_DAY_DEFECT_REGISTER.md`, `BUSY_TPA_DAY_E2E_UAT_RUN_LOG.md`  
**Target outcome:** Return the busy-day UAT verdict from **NO-GO** to **GO** by fixing all Critical/High blockers, retiring the untested IDOR/privacy risk register, and proving that the changes do not regress the already-strong claims, settlement, GL, currency, notification, and RBAC controls.

## 1. Executive Summary

The money spine works: provider intake -> claims adjudication -> maker/checker settlement -> voucher -> GL is balanced, and rejected/declined amounts are excluded. The NO-GO is caused by three fix-required defects plus one unverified high-consequence control area:

| ID | Severity | Decision | Remediation objective |
|---|---|---|---|
| BD-03 | Critical | Fix first | Remove the intermittent `/post-login` / RSC 503 outage and prove login reliability for every role. |
| BD-04 | High | Fix second | Make contract ceiling enforcement safe when CPT is omitted or service coding is weak; remove the fail-toward-full-billed default. |
| BD-05 | High | Fix third | Allow later-approved claims for an already-run provider/month to be settled via explicit supplementary batches, with clear UI feedback. |
| IDOR unverified | High-risk open item | Re-test before GO | Re-run provider/member/HR/fund/report direct-URL and scope probes blocked by BD-03. |
| BD-01 | High until verified | Fix or retire by test | Ensure provider users cannot be silently escalated by the Settings "Update Access" dropdown. |
| BD-02 | Low/Medium mitigated | Tighten if feasible | Keep duplicate detection routed and visible; optionally prevent obvious duplicate intake/re-submit. |

Do not mix these changes into broad refactors. Each workstream should ship with small, targeted tests and then the existing full gates.

## 2. Guardrails

1. Read the local Next.js documentation in `node_modules/next/dist/docs/` before changing routing, redirects, server actions, or RSC behavior.
2. Do not weaken any control that passed: contract ceiling with CPT, maker/checker segregation, GL balance, currency guardrails, fraud-gate service behavior, provider API scoping, member full-name search, notifications, or settlement Mark Paid scale fix.
3. No production hotfix through manual DB edits. Schema changes must be migrations; data repairs must be explicit code/jobs with audit where needed.
4. Preserve UI-only UAT execution. Any test-data user creation for verification must still happen through `/settings`.
5. Every fix must include a regression test that would have failed under the busy-day finding.
6. The final GO re-test must start with login and IDOR before continuing to inpatient/preauth breadth.

## 3. Workstream A - BD-03 Login / RSC 503 Outage

**Problem:** Correct credentials intermittently reach `/post-login?_rsc=...` and return 503 with React #419. The sign-in button hangs, no session lands, and all subsequent testing is blocked. Similar 503s were seen on provider RSC routes and a provider claim POST that still created a claim.

**Likely risk area:** `/post-login` is a Server Component that does no rendering and only redirects after `getCachedSession()`. In a production RSC request, any intermittent auth/session/database/render abort strands users at login. This route should be a boring HTTP redirect endpoint, not an RSC page.

### Fix Plan

1. Inspect Vercel logs for the exact failing request IDs around `/post-login`, `/provider/settlements`, `/provider/api-keys`, and `/provider/claims/new`.
2. Confirm whether the 503 is caused by RSC render abort, auth callback/session lookup, Prisma connection pressure, or a thrown redirect in an instrumented wrapper.
3. Replace `/post-login` with a route-handler redirect flow:
   - Add `src/app/post-login/route.ts`.
   - Use the non-RSC auth/session primitive directly.
   - Return `NextResponse.redirect(new URL(target, request.url))`.
   - Preserve exact role routing: broker, member, HR, fund, provider, default staff dashboard.
   - Avoid React `cache()` and Server Component rendering in this path.
4. Remove or neutralize `src/app/post-login/page.tsx` so the route is not served as RSC.
5. Add a defensive fallback: if authenticated but role is missing, redirect to `/unauthorized`; if unauthenticated, redirect to `/login`.
6. Review login form redirect target. If it explicitly calls `/post-login`, keep that path but make it route-handler based.
7. Investigate the provider claim POST 503 that still created a claim:
   - Ensure server actions that mutate and then redirect do not leave the client in a hung/error state.
   - Prefer idempotency protection at submission time for provider claim creation, or disable the submit button until the action returns.
8. Add application-level logging around auth redirect failures using safe metadata only: route, role if available, user id hash or id, duration, no secrets/passwords.

### Tests

1. Add an auth routing test for the post-login target resolver covering `PROVIDER_USER`, `MEMBER_USER`, `HR_MANAGER`, `FUND_ADMINISTRATOR`, `BROKER_USER`, and staff fallback.
2. If route handlers are testable in this repo setup, add a route-handler test that unauthenticated requests redirect to `/login` and each mocked role redirects to the correct portal.
3. Add a regression test that does not import React/RSC for post-login.
4. Keep existing auth/session tests passing.

### Live Verification

1. Deploy to Vercel.
2. Run 20 consecutive login/logout cycles for each role: admin, provider A, provider B, claims, medical, finance maker, finance checker, HR, fund, reports, member.
3. Confirm no `/post-login?_rsc=` request is used; `/post-login` returns a normal redirect.
4. Confirm no 503 or React #419 appears in browser console or Vercel logs.
5. Re-run one provider claim submit and confirm success/redirect is unambiguous and a reload/back action does not create a duplicate.

**Exit:** 0 login failures across the role matrix, no `/post-login` RSC 503, no session-stranded Access Denied after successful credentials.

## 4. Workstream B - BD-01 Provider User Role Dropdown Escalation Risk

**Problem:** `/settings` "Update Access" dropdown is built from `ROLE_PERMISSIONS` plus HR/fund roles, omitting `PROVIDER_USER`, `MEMBER_USER`, `BROKER_USER`, and possibly `REPORTS_VIEWER`. A provider row renders as `SUPER ADMIN` because the current value is not in the options. Saving could post `role=SUPER_ADMIN`.

### Fix Plan

1. Replace the ad hoc role option list in `src/app/(admin)/settings/page.tsx` with one canonical list of every `UserRole` enum value that the UI supports:
   - `SUPER_ADMIN`
   - `CLAIMS_OFFICER`
   - `FINANCE_OFFICER`
   - `UNDERWRITER`
   - `CUSTOMER_SERVICE`
   - `MEDICAL_OFFICER`
   - `REPORTS_VIEWER`
   - `BROKER_USER`
   - `MEMBER_USER`
   - `HR_MANAGER`
   - `FUND_ADMINISTRATOR`
   - `PROVIDER_USER`
2. In `updateUserAccessAction`, validate posted role against the same allowlist.
3. Add server-side safety for portal-bound roles:
   - Do not allow changing into `PROVIDER_USER` unless the user already has a valid `providerId` or the action is extended to select one.
   - Do not allow changing into `MEMBER_USER` without `memberId`.
   - Do not allow changing into `BROKER_USER` without `brokerId`.
   - Do not allow changing into `HR_MANAGER` without `groupId`.
   - Do not allow changing into `FUND_ADMINISTRATOR` unless managed fund groups already exist or the form supports selecting them.
4. If the inline row is meant only for simple staff role/status changes, lock portal-role rows so the inline form can toggle active/inactive but cannot accidentally change role. Route role re-binding through Invite/User management enhancement later.
5. Add clear UI text or disabled state for portal role conversion so admins understand why facility/member/group scope must be managed separately.

### Tests

1. Component or DOM test: a provider user row renders `PROVIDER USER`, not `SUPER ADMIN`.
2. Server action test: posting invalid role is rejected.
3. Server action test: posting `PROVIDER_USER` for a user with no provider binding is rejected.
4. Server action test: updating only `isActive` for an existing provider user preserves `role=PROVIDER_USER` and `providerId`.
5. Audit test: successful access update still writes `USER_ACCESS_UPDATED`.

### Live Verification

1. Create a throwaway provider user through `/settings`.
2. Confirm row dropdown/value displays `PROVIDER USER`.
3. Toggle Active -> Inactive -> Save, then Active -> Save.
4. Log in as the throwaway provider user and confirm provider portal only.
5. Confirm the user did not gain admin navigation or `/dashboard` access.

**Exit:** BD-01 is either fixed and verified, or safely retired as non-reproducible with proof that Save cannot escalate.

## 5. Workstream C - BD-04 CPT-Less Contract Ceiling Bypass

**Problem:** A CPT-coded consultation matched the tariff and enforced a UGX 3,500 ceiling. A similar consultation without CPT showed "No contract ceiling", pre-filled the approved amount to full billed, and allowed reviewer judgement. This fails toward overpayment when providers omit or alter codes.

**Root code area:**
- `ClaimDecisionService.assessCeiling`
- `ClaimsService.resolveClaimContractRates`
- `ProviderContractsService.resolveClaimLineRates`
- adjudication form default value in `src/app/(admin)/claims/[id]/page.tsx`

### Design Decision

The system needs two layers:

1. **Better matching:** Resolve tariffs by more than CPT where possible.
2. **Safer fallback:** If a provider has an active contract and the line is unpriced/unlisted/refer-for-review, the UI and decision stack must not default to full billed approval.

### Fix Plan

1. Extend tariff matching in `ProviderContractsService.resolveClaimLineRates`:
   - Keep CPT matching as strongest.
   - Add provider service code matching where claim line `cptCode` or future `serviceCode` maps to `ProviderTariff.providerServiceCode`.
   - Add exact normalized description matching against `serviceName`, `providerDescription`, and `standardDescription`.
   - Add conservative service-category matching only if a tariff/category mapping is unique for that provider/client/contract/date. If multiple candidates exist, do not guess; mark ambiguous.
2. Preserve tariff precedence:
   - client-specific before master
   - contract-scoped before standalone
   - negotiated before gazetted before published
   - latest effective date
3. Return a richer rule result for unmatched active-contract lines:
   - `UNLISTED_REFER` remains non-deterministic.
   - Add an `ambiguousTariffCandidates` or equivalent trace if multiple text/category matches exist.
   - Ensure the claim detail panel clearly says "Unpriced/uncoded service - approval must be line-adjusted or override-approved."
4. Change `ClaimDecisionService.assessCeiling` policy:
   - If at least one line has an enforceable ceiling, keep current behavior: enforce ceiling on priced lines and allow billed amount only for explicitly pended judgement lines.
   - If the claim has an active contract but zero enforceable lines because codes are missing or unlisted rule is `REFER_FOR_REVIEW`, do **not** return `null` as if no contract exists.
   - Return a deterministic safe ceiling of `0` or a new blocked/manual state for fully unpriced active-contract claims unless an override is approved.
   - Preferred: block approval of unpriced active-contract claims with a message requiring either code correction, line-level adjustment to a documented amount, or approved `PAY_ABOVE_CONTRACT_RATE` / `UNLISTED_SERVICE_PAY` override.
5. Adjust the adjudication UI default:
   - When `ceiling.ceiling` is null or the assessment says unpriced/ambiguous, default `approvedAmount` to `0`, not billed.
   - Render warning copy in the existing adjudication panel: "No enforceable price was found; approval defaults to 0 until coding/pricing is corrected or an override is approved."
   - Hide or discourage "Approve Full" for unpriced claims, or make the amount field explicit and empty/0.
6. Tie line-level decisions into the final amount:
   - If line decisions produced a computed net amount, prefill from that computed amount instead of full billed.
   - If no lines are decided and no ceiling exists, default to 0.
7. Add audit/notes:
   - If an unpriced claim is approved after override, adjudication log must include the override id or explicit note.
8. Keep no-contract provider behavior distinct:
   - If there is truly no active contract, retain "reviewer judgement" only if product accepts no-contract payment.
   - Consider routing no-contract claims to provider relations/override, but do not mix this into the BD-04 fix unless tests show it is necessary.

### Tests

1. Provider contract service:
   - CPT omitted but exact `serviceName` matches "GP consultation" -> agreed rate applies.
   - CPT omitted but `standardDescription` matches -> agreed rate applies.
   - CPT omitted and multiple possible consultation tariffs exist -> ambiguous/unpriced, no guessed ceiling.
   - Client-specific text match beats master rate.
2. Claim decision service:
   - Active contract + CPT-less exact service match enforces ceiling.
   - Active contract + unmatched unlisted/refer line cannot approve full billed without override.
   - Approval above resolved text-match ceiling is blocked.
   - Approved override permits above ceiling and logs note.
   - Existing CPT-coded ceiling tests still pass.
   - True no-contract scenario remains as explicitly designed.
3. Claim detail UI:
   - CPT-less/unpriced claim default approved amount is 0.
   - Warning banner renders.
   - CPT-coded claim still defaults to min(ceiling, billed).
4. Regression:
   - Existing partial approval, decline, PA cover, FX, fraud gate, and GL tests still pass.

### Live Verification

1. File a new provider claim with a consultation description but no CPT.
2. Confirm claim detail resolves tariff by text and shows the enforceable ceiling, or blocks approval at 0 if ambiguous.
3. Try approving full billed; must fail before usage/GL/fund/notification.
4. Correct code or approve with documented override; only then can money post.
5. Re-run OP-1 and OP-6 from the busy-day plan and confirm no overpayment path.

**Exit:** A provider cannot bypass contract ceilings by omitting CPT or using weak service coding.

## 6. Workstream D - BD-05 Supplementary Settlement Batches

**Problem:** `ProviderSettlementBatch` has `@@unique([tenantId, providerId, cycleMonth, cycleYear])`. Once a provider/month batch exists, later-approved claims for that same month cannot be settled in-cycle. The UI also surfaces the conflict poorly.

### Design Decision

Support explicit supplementary batches for the same provider/cycle while preserving maker/checker, single-currency, voucher, GL, provider statement, duplicate-payment protection, and traceability.

### Fix Plan

1. Add schema support for supplementary runs:
   - Add `sequence Int @default(1)` or `runNumber Int @default(1)` to `ProviderSettlementBatch`.
   - Change the unique key to `[tenantId, providerId, cycleMonth, cycleYear, sequence]`.
   - Keep indexes on tenant/status and provider.
   - Add a display label such as "Jul 2026 Run 2" or "Jul 2026 Supplement 1".
2. Migration strategy:
   - Existing batches get `sequence = 1`.
   - No manual production DB edits; ship as a Prisma migration.
3. Update `createSettlementBatch`:
   - Remove the hard conflict on provider+cycle.
   - Find existing batches for provider+cycle and set `sequence = max + 1`.
   - Only scoop claims where `settlementBatchId = null`, status is APPROVED/PARTIALLY_APPROVED, non-reimbursement, provider matches, decided at or before cycle end.
   - If there are no eligible claims, show a clear "No unsettled approved claims" message.
   - Keep mixed-currency guard exactly as-is.
4. Prevent accidental empty/supplement spam:
   - If all eligible claims are already batched, block with clear message.
   - Optionally show a preview count/total before creating the batch.
5. Update UI:
   - Settlement list and detail show sequence/supplement label.
   - Conflict errors render as visible banners. Do not rely only on `?error=`.
   - The create form should explain that a second batch creates a supplement for late approvals.
6. Update provider settlement portal:
   - Show all runs for the cycle; totals should sum correctly.
   - Voucher lookup still maps one voucher per batch.
7. Update reports:
   - Provider statement and settlement reports must include sequence/run label and must not collapse multiple same-cycle batches incorrectly.

### Tests

1. `createSettlementBatch` creates sequence 1 when none exists.
2. If sequence 1 is SETTLED and new approved claims exist, a sequence 2 supplementary batch is created.
3. If sequence 1 is MAKER_SUBMITTED/CHECKER_APPROVED and new claims exist, decide whether to block or create sequence 2:
   - Recommended: block while an open batch exists for the same provider/cycle to avoid operational confusion.
   - Allow supplement only when prior same-cycle batches are SETTLED or REJECTED.
4. Claims already linked to any batch are never re-scooped.
5. Supplement batch total equals only late unbatched claims.
6. Maker/checker and Mark Paid behavior unchanged for supplements.
7. Provider statement/report includes both cycle runs and correct grand total.
8. Migration test or schema assertion confirms old unique constraint is replaced.

### Live Verification

1. Use a provider/cycle with an existing settled batch.
2. Approve a new claim for the same cycle through UI.
3. Create a batch for that same provider/cycle.
4. Confirm UI creates "Run 2"/supplement, includes only late claim(s), and shows visible success.
5. Maker self-approval blocked; checker approve and Mark Paid.
6. Confirm voucher, GL, provider portal, and reports reconcile for both runs.

**Exit:** Late-approved claims are settleable in their real provider/cycle without duplicate payment risk.

## 7. Workstream E - Server Action Error Feedback / Blank Page UX

**Problem:** Several controls worked but feedback was poor: settlement conflict, maker/checker block, and over-ceiling block were carried in `?error=` and sometimes rendered as blank/no-banner. This invites repeat clicks and duplicate risk.

### Fix Plan

1. Inventory pages using server-action redirects with `?error=`:
   - `/settlement`
   - `/settlement/[id]`
   - `/claims/[id]`
   - `/cases/[id]`
   - settings and contract pages as needed
2. For each core money page, ensure:
   - `searchParams` is read and rendered in a persistent banner.
   - The page does not blank when `error` is present.
   - Actions revalidate and redirect back to a valid page state.
3. For high-risk buttons, use client-side pending/disabled state if already available in local patterns.
4. Ensure raw internal errors are still sanitized through `safeActionError`.
5. Add UI tests for the two observed money cases:
   - `/settlement?error=Maker...` shows visible banner.
   - `/claims/[id]?error=Contract enforcement...` shows visible banner and claim content.

### Exit

Every blocked control gives clear feedback and leaves the user on the correct page with no blank content.

## 8. Workstream F - Duplicate Claim Tightening

**Problem:** BD-02 was mitigated because duplicate claims were detected and routed at adjudication, but intake still created the duplicate. A 503-after-create increases the chance of repeated submissions.

### Fix Plan

1. Keep the existing adjudication-time duplicate routing and tests.
2. Add provider-claim form submit idempotency:
   - Disable submit while pending.
   - Include a client-generated idempotency key per form render if the schema supports it, or reuse provider invoice number if present.
3. Add an intake warning or soft block for exact duplicates:
   - same tenant/provider/member/date/benefit/service category/amount within a short window.
   - If product wants "route not block", create claim but visibly label duplicate at creation and in provider portal.
4. Do not add a hard DB unique index until seed data and legitimate repeat-visit patterns are understood.

### Tests

1. Double-click provider submit creates one claim.
2. Browser retry/back submit with same idempotency key returns existing claim or blocks.
3. Legitimate second service category on same day is still allowed/routed per product rule.
4. Existing double-capture route-to-review behavior remains.

## 9. Workstream G - Cross-Scope / IDOR Re-Verification

**Problem:** Prior critical D02/D04 defects were fixed and live-verified earlier, but the busy-day run could not re-run the direct URL/provider/member/HR/fund probes after BD-03 blocked login. This is not a code fix unless tests fail, but it is mandatory before GO.

### Re-Test Plan After Workstream A

1. Provider B login:
   - Try Provider A claim detail URL.
   - Try Provider A settlement/batch URL.
   - Try Provider A provider statement/remittance if direct URL exists.
   - Try Provider A API keys page context if direct/provider id is guessable.
   - Expected: not found/access denied; no names, member numbers, claim amounts, voucher totals.
2. Provider A login:
   - Confirm own claim/batch still visible.
3. Member principal login:
   - Confirm own claim/utilisation/notification reflection.
   - Try another member claim/utilisation URL.
   - Expected: denied/no data.
4. HR login:
   - Confirm assigned group only.
   - Try another group/member/admin route.
5. Fund admin login:
   - Confirm own fund balance and claim drawdown.
   - Try unrelated fund/group.
6. Reports viewer login:
   - Confirm exports/read-only access.
   - Try claim decision, settlement action, settings.
7. Provider API scope:
   - Re-run existing API regression tests locally.
   - If live API keys are used, use read-only/controlled probes and delete temporary keys through UI where applicable.

### Tests

1. Keep `tests/api/provider-read-scope.test.ts` and `tests/api/provider-preauth-scope.test.ts` in the full gate.
2. Add UI/route-level tests where feasible for provider claim and settlement page scoping.

**Exit:** Spine Q3 moves from partial/unproven to YES.

## 10. Workstream H - Remaining Observations and Configuration Gaps

These do not block the first fix deployment if Critical/High are addressed, but they need ownership before final GO.

| Item | Plan |
|---|---|
| OBS-1 Kenya/Aga Khan KES magnitude now labelled UGX | Decide product/data policy. Either convert legacy Kenya tariffs using FX with audited migration, or mark Kenya facility rates as KES and ensure FX-normalised approval/settlement. Do not silently relabel. Add data-integrity report for providers whose rates look foreign-currency magnitude. |
| OBS-3 approval matrix missing OUTPATIENT > UGX 200,000 | Add explicit matrix rule through `/settings/approval-matrix` or seed/config migration. Recommended: high-value outpatient requires Medical Officer or dual approval depending policy. Test with high outpatient claim. |
| OBS-4 CLM display number URL 404 | Add search/redirect route for `/claims/CLM-YYYY-NNNNN` or keep internal-id routes but make claim search prominent. Low priority. |
| Credential hygiene for @test.local | Create a controlled UAT persona procedure: users created through `/settings`, temporary passwords stored in the run log, then deactivated after UAT. |
| Scale unproven | After fixes, run load test or scripted UI/API-safe workload in a non-production clone: login concurrency, claim intake, adjudication, settlement 50/100/500 claim batches. |

## 11. Implementation Sequence

Do not start with broad UAT reruns. Fix and prove in this order:

1. **A: Login/RSC 503 fix**
   - Small code change, auth route tests, deploy, 20x role login matrix.
2. **B: Settings role dropdown**
   - Prevent accidental provider escalation, local tests, live throwaway user verification.
3. **C: CPT-less ceiling bypass**
   - Pricing/service tests first, then UI default/warning, then live no-CPT claim test.
4. **D: Supplementary settlement batches**
   - Schema migration, service tests, report/provider portal checks, live same-cycle supplement test.
5. **E/F: Error feedback and duplicate tightening**
   - Can be shipped with A-D if small, but do not delay Critical/High fixes for cosmetic breadth.
6. **G: IDOR and blocked UAT register**
   - Re-run as soon as login is stable.
7. **H: Conditions**
   - Assign owners and acceptance dates before GO.

## 12. Required Local Verification Gate

Run these before deployment:

1. `npm run typecheck`
2. Targeted tests:
   - `tests/services/claim-decision.service.test.ts`
   - `tests/services/provider-tariff-client.test.ts`
   - `tests/services/contracted-rate-variance.test.ts`
   - `tests/services/settlement-gl.test.ts`
   - `tests/services/settlement-stress.test.ts`
   - `tests/api/provider-read-scope.test.ts`
   - `tests/api/provider-preauth-scope.test.ts`
   - new settings role tests
   - new post-login route tests
3. Full test suite: `npx vitest run`
4. `npm run currency:guard`
5. `npm run brand:guard`
6. `npm run build`

If any existing test fails, fix the regression or document why the test expectation must change. Do not skip money, scope, or GL tests.

## 13. Vercel Deployment Verification Gate

After deploying the fix branch:

1. Confirm deployment is READY and points at the intended commit.
2. Run the role login reliability matrix.
3. Run BD-01 throwaway provider-user role test.
4. Run BD-04 no-CPT claim:
   - no CPT exact text match -> ceiling enforced, or ambiguous -> approval blocked/default 0.
   - full billed approval attempt leaves no usage/GL/fund/notification.
5. Run BD-05 supplementary settlement:
   - create same provider/month supplement after existing settled batch.
   - settle it maker/checker.
   - confirm voucher and balanced GL.
6. Re-run IDOR/scope probes.
7. Re-run busy-day blocked register in this order:
   - FIN-09/10 provider statement and Provider B IDOR
   - VIS-01/02 member reflection and member IDOR
   - HR/fund/reports scopes
   - ADJ-12 fraud gate ON
   - PA preauth/LOU
   - IP inpatient lifecycle
   - OPS service request/complaint/fraud/override workload
   - OP-10 ineligible member
8. Update `BUSY_TPA_DAY_DEFECT_REGISTER.md` statuses with evidence.
9. Update `BUSY_TPA_DAY_E2E_UAT_RUN_LOG.md` with exact claim/batch/voucher/GL IDs.
10. Only then update `BUSY_TPA_DAY_GO_NO_GO.md`.

## 14. GO Criteria

Return to GO only when:

1. BD-03 is fixed and login has 0 failures in the role matrix.
2. BD-04 is fixed and no-CPT/ambiguous services cannot bypass contract controls.
3. BD-05 is fixed and later-approved claims can settle in the correct provider/cycle through supplementary batches.
4. BD-01 is fixed or verified non-exploitable.
5. Provider/member/HR/fund/reports IDOR probes all pass.
6. The original money spine still passes: OP clean claim, partial, decline, settlement, voucher, GL, provider/member/report reflection.
7. Inpatient and preauth blocked registers are run to PASS, PASS WITH OBSERVATION, or NOT APPLICABLE - CONFIG NOT ENABLED.
8. No Critical or High defect remains open.
9. Medium observations have owner, target date, and business acceptance.

