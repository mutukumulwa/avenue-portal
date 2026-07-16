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

_(pending)_
