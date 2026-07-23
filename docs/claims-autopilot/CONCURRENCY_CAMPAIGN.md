# Claims Autopilot — Real-DB Concurrency & Failure Campaign (F7.4)

**Date:** 2026-07-23 · disposable Postgres 16 + Redis, seeded · all suites run
`--no-file-parallelism`, two consecutive full passes at every milestone boundary.

Acceptance for every scenario: one authoritative receipt/claim/effect, no lost
accepted claim, clean integrity report (`scripts/claims-autopilot-integrity.ts`
exits 0), no raw 500 for an expected conflict.

| # | Scenario | Proof (suite → test) | Result |
|---|---|---|---|
| 1 | 20 concurrent IDENTICAL API submissions | `claim-intake-api` → "20-way IDENTICAL … exactly ONE claim" (+F2.2 20-way receipt reservation) | ONE claim; rivals replay/202 |
| 2 | 40 concurrent DISTINCT submissions | `claim-intake-api` → "20-way DISTINCT" (jitter-paced persist; plus the direct-entry + case suites' concurrent creates in the same runs) | every 201 = one claim, zero duplicate numbers; failures only clean retryable 503s (receipt PROCESSING, no claim) |
| 3 | Same key / different payload race | `claim-intake-api` → 409 `IDEMPOTENCY_KEY_REUSED`; F2.2 diff-hash reservation (1 reserved + 9 conflicts, original never overwritten) | conflict, no mutation |
| 4 | Portal/API exact cross-rail event race | `claim-autopilot-campaign` → S4 (same invoice via API + CSV **concurrently**) | ONE claim; loser LINKED via the invoice-namespace strong fingerprint |
| 5 | Two legitimate similar visits | `claim-autopilot-campaign` → S5; `claim-autopilot-fidelity` (fuzzy dup routes for review, never merged) | both persist (D7) |
| 6 | Worker killed after claim commit, before processing | `claim-autopilot-recovery` → "sweep processes runs whose enqueue never happened" (accepted claim, PENDING run, no worker) | sweeper completes it |
| 7 | Worker killed mid-stage | `claim-autopilot-recovery` → "sweep reclaims a crashed worker's stale-leased run" (expired lease reclaim, `now() AT TIME ZONE 'UTC'` fix) | reclaimed + completed once |
| 8 | Redis unavailable during acceptance | `claim-intake-service` → "throwing enqueuer still ACCEPTED (run PENDING)" (D8: enqueue is an accelerator only) | acceptance unaffected |
| 9 | DB serialization conflict during automatic decision | `claim-autopilot-execute` → rollback + concurrent-execute tests (serializable `decide`; persist P2034 retry) | exactly one commit; loser retries/aborts clean |
| 10 | Two claims competing for one benefit balance | `claim-autopilot-execute` → "two concurrent ⇒ exactly one, benefit consumed once (300 not 600)"; legacy `benefit-race` suite | benefit conserved |
| 11 | Two claims consuming one PA/hold | `claim-intake-preauth` → concurrent conversion ⇒ ONE claim; hold untouched until decision; IPL A4 (sibling slices, PA-utilised exactly 2×ENTRY) | PA/hold conserved |
| 12 | Breaker opens during evaluation | `claim-autopilot-breaker` → commit-time `breakerCheck` ⇒ `StalePlanError`, no write | no money after open |
| 13 | Policy superseded during evaluation | `claim-autopilot-execute` → stale-revision gate (D17); F2.5 supersession | stale plan never commits |
| 14 | Notification/audit transient failure | `claim-autopilot-reconcile` → "terminal audit fires exactly once even if processed twice"; all notify/audit best-effort `.catch` with run state authoritative | processing unaffected; exact-once effects |

**Campaign execution record (2026-07-23):** full integration battery
**100 passed / 9 skipped** sequentially (the 9 = two pre-existing non-autopilot
P1_TEST_DB suites), repeated on THREE consecutive full passes; full-DB integrity
gate **exit 0 ("all invariants hold")** immediately after the final battery
pass; seeded-broken-invariant probe run exits 1 with exact refs for every
invariant family (F7.2 proof — see `IMPLEMENTATION_LOG.md` F7.2).

**Defect found BY the gate during this campaign (fixed):** the campaign suite's
own `afterAll` collected claims by invoice prefix only, so S5's claims (no
invoice) kept their runs while the receipt `deleteMany` matched their `f74-*`
receipts → the delete hit the `ClaimProcessingRun.receiptId` FK, the whole
statement threw, a `.catch(() => undefined)` swallowed it, and every execution
stranded ONE orphaned VOID claim with a SUCCEEDED receipt and zero runs — which
the integrity gate correctly flagged CRITICAL. Fix: cleanup ids are now the
union of invoice-matched AND receipt-linked claims, deletes run stages→runs→
receipts with NO swallowed errors (a future FK break fails the suite loudly),
and the stranded residue was purged. The gate catching a real orphan-producing
bug on its first full-DB run is the F7.2 acceptance working as designed.
