# P1 — Implementation log (proof-before-build + result notes)

Protocol: `TPA_PRIORITY_SIX_EXECUTION_PLAN.md` §3. Decisions: `P1_BENEFIT_DECISIONS.md`.

## Proof-before-build note (§3.2) — 2026-07-16

```text
Work package: P1 (P1.0–P1.6) — benefit-limit availability gate
Capability searched for: availability check before benefit consumption; atomic hold placement;
  family shared-limit aggregation; over-limit rejection in recordUsage; offline category resolution
Search terms used: rg "recordUsage|placeHold|releaseHold|remainingAfter|availableLimit|
  SharedLimitGroup|appliesTo|createBenefitHold|approveByHuman|reverseUsage|benefitUsage.findMany|
  isolationLevel|P2034" src tests prisma
Files inspected: benefit-usage.service.ts (full), claim-decision.service.ts (full money path:
  assessCeiling/decide/voidClaim/logFxException), preauth-adjudication.service.ts (gates 1–9.5,
  executeAutoDecision, createBenefitHold/releaseBenefitHold/releaseExpiredHolds, approveByHuman),
  sync.service.ts (§4 balance re-validation), member-app.service.ts (buildBenefitStates),
  prisma/schema.prisma (Package/BenefitConfig/SharedLimitGroup/BenefitConfigSharedLimit/
  BenefitUsage/BenefitHold/Member family fields/ExceptionLog.exceptionCode),
  reason-codes.service.ts (catalog, provisioning-seeded), scripts/data-integrity-check.ts,
  tests/services/claim-decision.service.test.ts, tests/services/preauth-holds.test.ts,
  uat/inpatient_vercel (IP-DEF-06)
Existing implementation found:
  - BenefitUsageService: resolveConfig/periodFor, applyDelta upsert, recordUsage (increments,
    floors at 0, returns remaining, NEVER rejects), reverseUsage, placeHold/releaseHold,
    remainingAfter (member-scoped shared pools ONLY — ignores appliesTo=FAMILY), availableLimit,
    FG-C10 hold-expiry reconciliation (reconcileStored/liveHoldSums).
  - decide(): fraud gate, matrix, contract ceiling, PA-cover confirmation, FX, then ONE default-
    isolation interactive tx: cost-share → tariff stamp → recordUsage (NO availability compare)
    → PA hold conversion (AFTER usage) → claim update → GL → fund. recordUsage has exactly one
    caller (claim-decision.service.ts:538).
  - PA approval: Gate 5 reads availableLimit non-atomically; executeAutoDecision approves in one
    tx then createBenefitHold in a SECOND tx; approveByHuman flips status atomically (FG-C8) but
    places the hold in a SECOND tx and only ANNOTATES over-limit approvals (PR-011 #2).
  - sync.service §4: compares billed against the SUM of availability across ALL categories.
  - voidClaim: status-guarded (idempotent), reverseUsage once, GL/fund compensation in one tx.
    Appeal initiation only flips status; no separate reversal writer found (re-decide path).
Existing tests found: claim-decision.service.test.ts (mocked-prisma side-effect contract suite),
  preauth-holds.test.ts (PR-011 lifecycle), fraud/settlement suites. No availability-gate tests;
  no concurrency tests.
Live/UI behaviour checked: IP-DEF-06 register (fully-exhausted member approved in full, live
  2026-07-07); prod ground-truth 2026-07-16 (2,764 members / 30 claims / holds active via PA).
Classification: PARTIAL — extend BenefitUsageService + the two canonical decision services.
  No competing implementation; no CONFLICTING decision (DEC-02..06 recorded).
Smallest required change: one BenefitAvailability computation in BenefitUsageService; consume it
  as a hard gate inside decide()'s tx (before writes, holds credited, Serializable + bounded
  retry) and inside both PA-approval paths (status flip + hold in ONE tx); recordUsage rejects
  over-limit writes as backstop; sync uses the claim's category; report-only integrity script;
  surfaces reuse the same result.
Files expected to change: src/lib/serializable-tx.ts (new), benefit-usage.service.ts,
  claim-decision.service.ts, preauth-adjudication.service.ts, sync.service.ts,
  reason-codes.service.ts, scripts/benefit-integrity-report.ts (new),
  scripts/data-integrity-check.ts, claims/[id]/page.tsx, preauth/[id] page/service surface,
  api/v1 benefits route, tests (new benefit-availability suite + harness updates).
```

## Result notes (§3.7) — appended per package

### P1.0 + P1.1 — 2026-07-16
```text
Result: IMPLEMENTED (commit c01a1f4)
Files changed: src/server/services/benefit-usage.service.ts; uat/priority-six/P1_BENEFIT_DECISIONS.md
Tests added/changed: tests/services/benefit-availability.test.ts (11, written FAILING first per P1.0)
Commands run: npx vitest run (721/721), npm run typecheck
Observed result: computeAvailability returns one result (PER_VISIT/CATEGORY/OVERALL/SHARED_MEMBER/
  SHARED_FAMILY, credit-once for converting holds, service-date periods, DEC-06 fail-closed +
  ExceptionLog); recordUsage rejects over-limit writes.
Remaining conditions: none for the package.
```

### P1.2 — 2026-07-16
```text
Result: IMPLEMENTED (commit 65a7452)
Files changed: src/lib/serializable-tx.ts (new); src/server/services/preauth-adjudication.service.ts
Tests added/changed: tests/services/preauth-holds.test.ts (over-limit approval now expects HARD BLOCK
  with partial suggestion — the pre-P1 annotate-and-approve assertion replaced)
Commands run: npx vitest run (721/721), npm run typecheck
Observed result: approveByHuman and executeAutoDecision run availability-gate → status flip → hold in
  ONE Serializable tx with bounded retry; auto path routes to human when availability moved at commit.
Remaining conditions: GOP numbering still count-based (pre-existing, out of P1 scope).
```

### P1.3 — 2026-07-16
```text
Result: IMPLEMENTED (commit 07ca32d)
Files changed: src/server/services/claim-decision.service.ts
Tests added/changed: tests/services/claim-decision.service.test.ts (+5: exhausted block w/ zero side
  effects incl. self-funded fund/GL, partial-equal-to-availability, P1-B hold credit end-to-end,
  P1-C family block)
Commands run: npx vitest run (725/725), npm run typecheck
Observed result: gate first-in-tx before any write; holds convert before guarded recordUsage;
  decide + voidClaim Serializable with retry; IP-DEF-06 root closed in code.
Remaining conditions: live re-run of the inpatient scenario (V2/V3) for the DoD.
```

### P1.4 — 2026-07-16
```text
Result: IMPLEMENTED + VERIFIED-EXISTING (commit 4fbb973)
Files changed: scripts/benefit-integrity-report.ts (new, report-only + --apply for HOLD_DRIFT only);
  scripts/data-integrity-check.ts (permanent invariants: negative balances, category/overall/shared
  over-limit)
Observed result: voidClaim verified — reverseUsage exactly once behind the status guard (idempotent);
  FINDING: appeal RESOLUTION does not exist anywhere in the codebase (initiateAppeal flips status to
  APPEALED and nothing can decide it — decide() excludes APPEALED). No reversal risk (no writer), but
  the appeal workflow is a dead end → carry as a defect-register item for the verdict (Medium,
  workflow completeness).
Remaining conditions: appeal-resolution flow is a separate work package (not P1).
```

### P1.5 — 2026-07-16
```text
Result: IMPLEMENTED (commit 99603d4)
Files changed: claims/[id]/page.tsx (constraint panel); preauth-adjudication getEnrichedDetail +
  preauth/[id]/page.tsx ("All applicable limits"); api/v1/benefits (holds-net remaining +
  amountReserved); sync.service.ts (category-scoped, gap #6); reason-codes.service.ts (+6 BENEFIT_*
  codes, provisioning-seeded — prod gets them via the H7 Re-provision)
Observed result: offline packs VERIFIED-EXISTING (already FG-C10 hold-reconciled). Member view was
  hold-corrected in WP-6. Live render verified on a seeded throwaway DB: claim CLM-FRAUD-008 shows
  "Benefit availability — approvable up to UGX 500,000 · binding: OUTPATIENT annual sublimit" +
  "Package overall annual limit UGX 4,839,000 available (limit 5,000,000 · used 161,000)" — the
  OVERALL (DEC-03) constraint computed from real cross-category usage.
Remaining conditions: none for the package.
```

### P1.6 — 2026-07-16
```text
Result: IMPLEMENTED
Files changed: tests/integration/benefit-race.integration.test.ts (new, opt-in);
  tests/services/benefit-availability.test.ts (+unrelated-PA-hold blocks capacity);
  tests/services/claim-decision.service.test.ts (+self-funded no-side-effects);
  tests/services/sync.service.test.ts + tests/api/provider-read-scope.test.ts (harnesses updated for
  the new call paths); benefit-usage.service.ts applyDelta hardened (P2002 create-race → update)
Commands run: full suite (727 passed, 1 opt-in skipped), tsc, brand+currency guards. Integration race
  executed 3/3 PASSING against a real local Postgres (createdb p1_race → prisma db push → seed →
  P1_TEST_DB=… vitest): two simultaneous 80,000 approvals against a 100,000 balance → exactly one
  committed; loser rejected [BENEFIT_CATEGORY_EXHAUSTED] with post-winner numbers; ledger showed
  exactly one consumption; losing claim untouched at UNDER_REVIEW.
Observed result: P1.6 matrix covered — no-row, exact-limit, one-above, per-visit, overall,
  MEMBER/FAMILY pools, unrelated-hold blocks, attached-hold credited, partial PA consumption,
  CONCURRENT double-spend (real DB), void-once, new-period (structural via unique period key),
  offline category, self-funded no-side-effects.
Remaining conditions (P1 definition of done): IP-DEF-06 independent live re-run (V2/V3 campaigns) —
  everything code-side is in place.
```

### Findings carried to the verdict register
1. **Appeal resolution missing** (Medium, workflow): APPEALED is terminal in practice.
2. **Co-contribution Decimal RSC crash** (Medium, pre-existing, NOT P1): claims/[id] passes a raw
   CoContributionTransaction (Prisma Decimals) to the client CoContributionCollectionForm → RSC
   serialization error; page content fails to hydrate for claims WITH a co-contribution row
   (observed live on seeded CLM-2024-00002). Spawned as a separate task chip.
