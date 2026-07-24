# F5.1 — Claim-status consumer characterization

Read-only inventory (no code changed) of every consumer of `Claim.status`, produced
before Phase F5 adds new lifecycle states (provider **withdrawal**, **supersession**/
correction, **resubmission**, **reconsideration**). It is the authoritative reference
for F5.2–F5.17: any new status must be threaded through the groups below or it will
silently vanish from a queue/report or bypass a gate.

`ClaimStatus` enum (`prisma/schema.prisma:2203-2215`):
`INCURRED, RECEIVED, CAPTURED, UNDER_REVIEW, APPROVED, PARTIALLY_APPROVED, DECLINED, PAID, APPEALED, APPEAL_APPROVED, APPEAL_DECLINED, VOID`.

## 0. Central authority + guards (the safety net)

- **`src/server/services/claim-lifecycle.ts`** — the ONE transition graph.
  - `:16-29` `TRANSITIONS: Record<ClaimStatus, ClaimStatus[]>` — legal from→to edges.
    Because it is a `Record<ClaimStatus, …>`, **adding an enum value is a COMPILE ERROR
    here until its row is added** — the single place TypeScript forces new-status handling.
  - `:32` `AUTO_DECIDABLE_STATUSES = [RECEIVED, CAPTURED, UNDER_REVIEW]`.
  - `:48-60` `canTransitionClaim` / `assertClaimTransition` / `isTerminalClaimStatus`
    (terminal ⇔ empty edge list — graph-derived, so a new terminal state is detected
    automatically once its empty row exists).
- **`tests/services/claim-status-mutation-guard.test.ts`** — walks `src/**` and FAILS the
  build if `*.claim.update(...{ status })` / `updateMany` appears in a file NOT on the
  `ALLOWLIST` (path→why), AND fails on stale allowlist entries. **Every F5 status-writer
  MUST (a) be added to this allowlist and (b) go through `assertClaimTransition`.**
  Graph test: `tests/services/claim-lifecycle.test.ts`.

Transition-graph edges (reference): INCURRED→{RECEIVED,CAPTURED,VOID}; RECEIVED→{CAPTURED,UNDER_REVIEW,APPROVED,PARTIALLY_APPROVED,DECLINED}; CAPTURED→{UNDER_REVIEW,APPROVED,PARTIALLY_APPROVED,DECLINED}; UNDER_REVIEW→{APPROVED,PARTIALLY_APPROVED,DECLINED,CAPTURED}; APPROVED/PARTIALLY_APPROVED→{PAID,VOID,APPEALED}; DECLINED→{APPEALED}; APPEALED→{APPEAL_APPROVED,APPEAL_DECLINED}; APPEAL_APPROVED→{PAID,VOID}; APPEAL_DECLINED/PAID/VOID→terminal.

## 1. Transition authorities (writers of claim.status)

- **Creation** (not an update; not guard-covered): `claim-intake/persist.ts:125,145` — the SOLE intake creator, `status: "RECEIVED"` for every channel.
- **`claim-decision.service.ts` (D10, atomic with money):** `decide()` gate {RECEIVED,CAPTURED,UNDER_REVIEW} (pre-tx `:284`, in-tx re-check `:620`) → `assertClaimTransition` `:765` → APPROVED/PARTIALLY_APPROVED/DECLINED `:766-798`. `voidClaim()` gate {APPROVED,PARTIALLY_APPROVED} + `!settlementBatchId` `:956-959` → VOID `:1010`. `executeAutoPlan()` delegates to `decide`.
- **`claim-adjudication.service.ts`:** `appeal()` gate {DECLINED,PARTIALLY_APPROVED} → APPEALED `:295` (the ONLY APPEAL* writer). `markSettlementBatchPaid()` → PAID `:710`.
- **`reimbursement.service.ts:214`:** disburse gate {APPROVED,PARTIALLY_APPROVED}+`!reimbursedAt` → PAID `:239`.
- **Pre-decision admin/fraud actions:** `(admin)/claims/[id]/actions.ts:36` → CAPTURED; `(admin)/fraud/[id]/actions.ts:63` + `fraud/actions.ts:70` → UNDER_REVIEW (fraud hold).
- **Delegators (write no status):** `trpc/routers/claims.ts` adjudicate→decide; `auto-adjudication.service.ts`→decide; `claim-autopilot/processor.ts`→executeAutoPlan.

## 2. Status-gated reads / queues / filters

- **`claims.service.ts` (read hub):** `:14-21` `ACTIVE_QUEUE_STATUSES = [INCURRED,RECEIVED,CAPTURED,UNDER_REVIEW,APPROVED,PARTIALLY_APPROVED]` (the "open/pre-terminal" set); `getActiveQueues`/`getQueueFacilitySummary`/`getClaims` (optional status filter)/`getClaimStatusCounts`.
- **Ops queues/admin list:** `(admin)/claims/queues/page.tsx` LANES + `lane.statuses.includes`; `ExceptionQueues.tsx:11` `[RECEIVED,CAPTURED,UNDER_REVIEW]`; `queues/actions.ts` count RECEIVED; `(admin)/claims/page.tsx:12` `STATUSES` dropdown.
- **Portal/detail/fund:** `provider/claims/page.tsx` FILTERS+badge; `fund/[groupId]/claims` buckets; `fund/dashboard:52` `[APPROVED,PARTIALLY_APPROVED]`; `(admin)/fraud/[id]:59` `[APPROVED,PAID,PARTIALLY_APPROVED]`; `groups/[id]/reprice:43`; analytics provider/scheme pages; `api/v1/claims/route.ts:283,344`; `member-app.service.ts:577` (+ display projections, `:615` masks to "Private").

## 3. Terminal-status assumptions — MOST IMPORTANT for F5

New terminal states (withdrawal, supersession) MUST be threaded here or they take the
untested branch (usually "not terminal"/"not decided"):

- `claim-lifecycle.ts:58-60` `isTerminalClaimStatus` — generic, graph-derived (auto once the empty row is added).
- `claims.service.ts:14-21` `ACTIVE_QUEUE_STATUSES` — defines "open"; a new non-terminal state omitted here disappears from every work queue.
- `claims.service.ts:298` blocks PA-attach when {PAID,DECLINED,VOID}.
- `(admin)/claims/page.tsx:175` `decided = [APPROVED,PARTIALLY_APPROVED,DECLINED,PAID,VOID]` (excludes APPEALED).
- `(admin)/claims/[id]/page.tsx` gates: `:94` canCapture; `:95` canAdjudicate; `:110` isOutcomeSet; `:111` canVoid (+`!settlementBatchId`); `:112` canAppeal; `:1093` reimburse.
- `PreauthPanel.tsx:42` `editable = NOT [PAID,DECLINED,VOID,APPROVED,PARTIALLY_APPROVED]` (editable only pre-decision).
- `AutomationPanel.tsx:37` + `automation-actions.ts:24` `decidable = NOT [APPROVED,PARTIALLY_APPROVED,DECLINED,VOID,SETTLED,PAID]` — NOTE the phantom `"SETTLED"` (not a ClaimStatus; harmless).
- `financial-posting-coverage.service.ts:43` `APPROVED_STATES = [APPROVED,PARTIALLY_APPROVED,PAID]`.
- `fund/[groupId]/claims/page.tsx:49/51` approved/pending buckets.

## 4. APPEAL* legacy usage (F5.17 input)

- Only **`APPEALED`** is ever written (`claim-adjudication.service.ts:295`). **No code writes `APPEAL_APPROVED`/`APPEAL_DECLINED`** — those graph targets are UNREACHABLE; the appeal-resolution path is effectively unimplemented (an APPEALED claim has no coded exit). F5.11–F5.17 (reconsideration) supersede this; F5.17 consolidates.
- `(admin)/claims/[id]/page.tsx:482-483` render APPEAL_APPROVED/DECLINED — but from `AdjudicationLog.action`, NOT claim.status.
- `report-exclusions.ts:25` `FULLY_DECLINED` includes `APPEAL_DECLINED`; `claim-autopilot/evaluate.ts:147` dup-detect `notIn [VOID,DECLINED,APPEAL_DECLINED]`.

## 5. Reports / analytics / exclusions

- `report-exclusions.ts:25` `FULLY_DECLINED = [DECLINED,VOID,APPEAL_DECLINED]` (whole-claim `in` `:31`; line-level `notIn` `:44`). **A new withdrawal terminal falls into the `notIn`/"still counts" branch unless added here.**
- `analytics.service.ts:489,1272` + `analytics-refresh.service.ts:332,368` (→ FactClaimLine, untyped passthrough).
- `api/reports/[reportType]/export/route.ts` + `(admin)/reports/[reportType]/page.tsx` — paid-basis `[APPROVED,PARTIALLY_APPROVED,PAID]`, declined `[DECLINED,VOID]`, AR `notIn [VOID,PAID]`, settlement-eligible `[APPROVED,PARTIALLY_APPROVED]&&settlementBatchId:null`.
- `client-consolidation.service.ts:27`; `contract-analytics`/`contract-reconciliation` (mostly not status-filtered).

## 6. Money / settlement coupling

- `claim-decision.service.ts` — APPROVE: benefit gate `:640`, recordUsage `:757`, GL `postClaimApproved` `:804`, self-funded drawdown. VOID: reverseUsage `:975`, GL `postClaimVoidReversal` `:981`, fund refund. Void↔settlement mutual exclusion `:959`.
- `claim-adjudication.service.ts` — `addToSettlementBatch` scoops `[APPROVED,PARTIALLY_APPROVED]&&settlementBatchId:null` `:407`; `markSettlementBatchPaid` → PAID+voucher+GL.
- `reimbursement.service.ts:234-255` PAID ↔ voucher/disbursement. `financial-posting-coverage.service.ts` posting audit. `admin-fee.service.ts:104` PCT_OF_CLAIMS aggregates `status:"PAID"`.

## 7. Exhaustiveness map

- **Compiler-forced:** ONLY `claim-lifecycle.ts:16` `TRANSITIONS` (Record over the enum). Add the new row there first — everything graph-derived (`isTerminalClaimStatus`) follows.
- **Silent (needs manual threading):** curated `ClaimStatus[]` arrays (`ACTIVE_QUEUE_STATUSES`, `STATUSES` dropdown, `AUTO_DECIDABLE_STATUSES`) + every `.includes(status)` / `in|notIn` gate in groups 2–6. Highest risk: `claims.service.ts:298`, `(admin)/claims/[id]/page.tsx:94-112,1093`, `PreauthPanel.tsx:42`, `AutomationPanel.tsx:37`, `report-exclusions.ts:25`, `ACTIVE_QUEUE_STATUSES`.
- **Cosmetic:** status→badge renderers all have a `default` fallback (new status → neutral grey badge). Note `member/utilization/[claimId]/page.tsx:21` substring-matches, so any `*APPROVED*` renders green.

## Implications for F5 (the threading checklist)

Adding **withdrawal / supersession** (terminal) or **resubmission / reconsideration** (transient) statuses requires, in order:
1. Add the enum value(s) → fix the COMPILE ERROR in `claim-lifecycle.ts:TRANSITIONS` (define legal edges; empty edge = terminal).
2. Add the writing service file to the mutation-guard `ALLOWLIST` + write via `assertClaimTransition`.
3. Terminal states: audit group 3 — decide "open"/"decided"/"editable"/"settlement-eligible" membership; add to `report-exclusions.FULLY_DECLINED`-equivalent if it should be excluded from paid/AR bases.
4. Transient states (resubmission/reconsideration in-flight): add to `ACTIVE_QUEUE_STATUSES` (+ relevant queue LANES) or they vanish from work queues.
5. Money coupling (group 6): a withdrawal/supersession of a settled or PAID claim must NOT bypass void/reversal semantics — F5 likely forbids withdrawal once `settlementBatchId`/PAID (mirror the `canVoid`/void-settlement exclusion).
6. APPEAL* (group 4): reconsideration (F5.11–F5.16) should supersede the dead APPEAL_APPROVED/DECLINED targets; F5.17 consolidates.

**Design fork flagged for later packages:** F5 prefers a **submission-chain / supersession** model (F5.2 chain schema, F5.7 atomic replacement) over in-place status flips — i.e. a corrected/resubmitted claim is a NEW claim linked to a superseded original, not a mutation of the original. This keeps the money spine (GL/settlement/usage already posted against the original) intact. Confirm the supersession-vs-mutate model at F5.2/F5.3.
