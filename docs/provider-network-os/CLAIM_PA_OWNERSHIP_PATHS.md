# F0.3 — Claim and PA Ownership Paths (characterized 2026-07-23)

**Branch/commit:** `feat/provider-network-os` @ `cb28605`
**Scope:** every PA create/decide/hold path and every provider claim create path; direct DB writes vs canonical service calls; transaction boundaries; idempotency; entitlement per path. Read-only — nothing refactored.
**Claim-side authority reconciled:** `docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md` (guard-locked: the ONLY `Claim.create` in `src/**` is `claim-intake/persist.ts`; 9 rails converged at M5; status writes locked by `claim-status-mutation-guard`).

---

## 1. PA creation rails — the complete set

`grep -rn "preAuthorization.create" src` → exactly **3 create sites**, reached by **5 rails**:

| # | Rail | Entry | Persistence path | Gates on the way in | Idempotency | Adjudication invoked? | Txn boundary |
|---|---|---|---|---|---|---|---|
| PA-R1 | **B2B API** | `POST /api/v1/preauth` (`route.ts:16-102`) | **DIRECT** `prisma.preAuthorization.create` (`:72-86`) | key auth + `entitledMemberWhere` (`:42`) + tenant cross-check (`:60`) + member ACTIVE (`:64`) — **NO fraud screen, NO benefit-in-package gate** | **NONE** — retry = duplicate PA | No — status `SUBMITTED`, waits for humans | single create (collision-safe number via `createWithDocumentNumber` reservation-retry) |
| PA-R2 | **Admin browser** | `(admin)/preauth/new/actions.ts:24` | `ClaimsService.createPreAuth` (`claims.service.ts:~440-530`) → create at `:506` | member exists + provider ACTIVE (PR-006 `:457-466`) + **fraud screen** (CRITICAL throws, `:471-479`) + **benefit-in-package** (PR-024 `:486-492`) | **NONE** | No | single create (reservation-retry number) |
| PA-R3 | **Admin tRPC** | `routers/preauth.ts:47` (`protectedProcedure`) | same `ClaimsService.createPreAuth`, `submittedBy:"ADMIN"` | same as PA-R2 | **NONE** | No | same |
| PA-R4 | **Member app** | `member-preauth.service.ts:228` (via memberApp router) | same `ClaimsService.createPreAuth`, `submittedBy:"MEMBER"` | same as PA-R2, member restricted to self+active dependants (`:36`) | **NONE** | **Conditionally, immediately** (see §3) | create, then separate decision call (not one txn) |
| PA-R5 | **Amendment** | `preauthAdjudicationService.createPaAmendment` (`:684`) | DIRECT create `:708` inside the canonical owner | parent must be approved/active | **NONE** | via owner | owner-managed |

**PNO-relevant absences (all rails):** no `PreauthIntakeReceipt`, no `PreAuthorizationEvent`, no durable idempotency (D26 violation everywhere — a timed-out B2B POST retried = second PA), no channel normalization (F3.1-F3.3's job). **There is NO provider-browser PA rail at all** — `/provider/preauth*` does not exist (route inventory §1).

**Divergence that F3.1 must resolve as CONFLICTING:** PA-R1 skips the fraud screen and benefit-in-package gate that PA-R2/R3/R4 enforce — same business object, different admission rules by channel.

## 2. PA decision + hold — canonical owner

`src/server/services/preauth-adjudication.service.ts` ("Process 8"; comment at `claims.service.ts:551-553` confirms the ONLY decision entry points):

| Entry point | Line | Behavior |
|---|---|---|
| `runAutoDecision` | `:68` | Pure gate pipeline, pass-labels observed in order: `ELIGIBILITY_ACTIVE`, `PROCEDURE_COVERED`, `EXCLUSION_CHECK`, `WAITING_PERIOD`, `BENEFIT_CAP`, `AUTO_APPROVE_CEILING` (50,000), `PROCEDURE_NEVER_AUTO`, `FRAUD_SCREENING`, `PROVIDER_NETWORK`, `PRACTITIONER_CREDENTIAL` |
| `executeAutoDecision` | `:288` | Executes the auto result (approve w/ hold or route to human) |
| `approveByHuman` | `:510` | Approval **always places the BenefitHold** (PR-011 fix) |
| `declineByHuman` | `:634` | Decline + hold handling |
| `createBenefitHold` / `releaseBenefitHold` / `releaseExpiredHolds` | `:429/:458/:481` | Hold ledger owner |
| `getSlaDeadline` | `:498` | SLA minutes per request type (EMERGENCY 30, INPATIENT_PREADMISSION 60, …) |
| `createPaAmendment` | `:684` | Child-PA amendment |
| `cancelPreAuth` | `:732` | Cancellation + hold release (`:746`) |

Uses `inSerializableTx` (`@/lib/serializable-tx`) for decision transactions. Constants: `PA_VALIDITY_DAYS = 14`, always-auto CPT set, never-auto CPT set.

**Callers of decision entry points** (grep, complete): admin detail actions (`(admin)/preauth/[id]/actions.ts:28,37`), admin process-8 actions (`preauth-process8-actions.ts:10,29` — auto-decision + cancel), tRPC `preauth.approve/decline` (`routers/preauth.ts:69,78`), member auto path (`member-preauth.service.ts:258,280`). No provider-facing caller exists.

## 3. The TWO auto-approve rule sets (must be frozen in F3.1)

| Property | Member-app path (`member-preauth.service.ts`) | Canonical auto pipeline (`preauth-adjudication.service.ts`) |
|---|---|---|
| Ceiling | `AUTO_APPROVE_CEILING = 15_000` (`:10`) | `AUTO_APPROVE_CEILING_KES = 50_000` (`:22`) |
| CPT allowlist | `{99213,99214,85025,71046,76700,92004}` (`:11`) | always-auto adds `80053`; separate never-auto set (`:25-33`) |
| Gates | member/group/provider ACTIVE + zero fraud warnings | 10-gate pipeline (§2) |
| Executes via | `approveByHuman(systemActor, min(cost, remaining), …, 14)` (`:258`) | `executeAutoDecision` (`:288`) |
| Decline path | `declineByHuman("BENEFIT_EXHAUSTED")` when remaining ≤ 0 (`:280`) | pipeline routes to human |

Both end at the canonical owner (hold always placed) — the *rules* differ, not the executor. Proof-before-build classification for F3.1: **CONFLICTING** (two admission/auto policies), to be resolved by decision, not by a third path.

## 4. PA lifecycle mutations outside the adjudication owner (complete map)

`grep -rln "preAuthorization.update" src` → 6 files, each purpose verified:

| Site | Purpose | Txn |
|---|---|---|
| `claim-intake/persist.ts:209` | PREAUTH_CONVERSION intake marks PA `ATTACHED` atomically **inside the claim-create txn** | ✅ same tx |
| `claims.service.ts:330` (`attachPreauth`) | attach APPROVED PA to claim — validates same member (`:321`), same provider (`:324`), validity window (`:327`) | single update |
| `claims.service.ts:348` (`detachPreauth`) | detach → back to `APPROVED`; `UTILISED` cannot detach (`:345`) | single update |
| `claims.service.ts:543` (`markPreAuthUnderReview`) | SUBMITTED → UNDER_REVIEW (stage 1 of review) | single update |
| `claim-decision.service.ts:729-747` | **decision-time consumption** (IPL-PA-01): fully consumed → `UTILISED` + consuming-claim stamp; partial → back to `APPROVED` + `utilisedAmount`, detached (episode keeps reservation); declined → claim-attached PAs reset to `APPROVED` (case-attached untouched). Hold updated + `BenefitUsageService.releaseHold` **in the same decision tx** | ✅ decision tx |
| `case.service.ts:281` | link PA to inpatient case | single |
| `case.service.ts:690` | `closeAndFile`: residual APPROVED case PAs re-point at final claim (`ATTACHED`), LOUs `UTILISED` — inside the close txn | ✅ close tx |
| `case.service.ts:729` | `cancelCase`: release PAs (`caseId:null`) — guarded: refuses if live slice claims exist (A8) | single |
| `jobs/preauth-escalation.job.ts:46,85` | ops job: `escalatedAt` stamp + email + activity log; SLA-breach marking (`UNDER_REVIEW` past `slaDeadlineAt`); calls `releaseExpiredHolds` per tenant | job loop |

**Reading for PNOS:** PA state ownership is *mostly* converged (decisions/holds in one service; consumption in the decision tx) — the missing pieces are intake normalization (receipt/events/idempotency), provider-facing surfaces, and audience-safe reason codes. F3 does NOT need to rebuild decision/hold machinery (D5/D6 hold as designed).

## 5. Provider claim creation (reconciliation with Claims Autopilot)

- Sole creator: `claim-intake/persist.ts` (`persistClaimWithinTransaction`) — guard test `tests/services/claim-creator-consolidation.test.ts` fails CI on any new direct `Claim.create` in `src/**`. Status writes similarly guard-locked.
- Channel matrix (`claim-intake/context.ts:86-104`) — provider-relevant rows:

| CallerIdentity | Channel → Source | providerDerived | `scopeMembersByEntitlement` |
|---|---|---|---|
| `adminUser` | ADMIN_PORTAL → MANUAL | ❌ | ❌ |
| `providerUser` | PROVIDER_PORTAL → MANUAL | ✅ (session-forced) | **❌ ← the F1.12 bypass** |
| `apiProvider` | API_V1 → HMS | ✅ (key-bound) | ✅ |
| `apiOperator` | API_V1 → SMART | ❌ (system) | ❌ |
| `csvImport` | CSV_IMPORT → BATCH | ❌ | ❌ |
| `offlineSync` | OFFLINE_SYNC | ✅ | ✅ |
| `reimbursement` | REIMBURSEMENT | ❌ | ❌ |
| `preauthConversion` | PREAUTH_CONVERSION → PREAUTH | ✅ | ❌ (PA already entitled) |
| `case` | CASE_INTERIM/CASE_FINAL | ✅ | ❌ |

- Entitlement enforcement point when the flag is true: `context.ts:246` (`entitledMemberWhere` merged into member resolution).
- PA conversion: `ClaimsService.createClaimWithPreauth` (`claims.service.ts:~558+`) → canonical intake, durable key `<preauthId>:claim-create:v1`, replay returns existing claim, PA `ATTACHED` atomically via `origin.preauthId`; hold consumed only at decision (semantics unchanged). Deprecated `convertPreauthToClaim` delegates to it.

## 6. Existing test/observed evidence per path (F0.3 requirement)

| Path | Evidence |
|---|---|
| PA-R1 B2B scope | `tests/api/provider-preauth-scope.test.ts` |
| PA decision/holds | `tests/services/preauth-holds.test.ts`; `tests/services/benefit-availability.test.ts` |
| Decision-time consumption | `tests/services/claim-decision.service.test.ts`; `tests/services/decision-stack-consolidation.test.ts` |
| Case PA interplay | `tests/integration/interim-settlement.integration.test.ts` (real-DB, self-skipping); IPL A4 concurrency evidence (inpatient engagement, `4ed16b2`) |
| PA→claim conversion | `tests/integration/claim-intake-preauth.integration.test.ts` |
| Claim rails ×9 | `tests/integration/claim-intake-*.integration.test.ts` + autopilot battery (see CLAIM_CREATOR_INVENTORY) |
| Member auto-approve | observed in code only — **no dedicated test found** for the 15k member auto path (gap for F0.2/F3 tests) |
| PA-R1 duplicate-on-retry | **no test** (no idempotency exists to test) — F3.2/F3.4 closes |

## 7. What F3 inherits (summary for the phase gate)

1. Build `PreauthIntakeService` + receipt/event schema (F3.2/F3.3) — nothing exists.
2. Converge PA-R1..R4 into it (F3.4/F3.5a-c) — PA-R5 amendment already lives in the owner.
3. Resolve the CONFLICTING dual auto-approve policy at F3.1 (decision required — do not create a third).
4. B2B rail must gain the fraud + benefit-in-package gates via normalization (or an explicit decision to differ by channel).
5. Decision/hold/consumption machinery: REUSE as-is (D5/D6) — `preauthAdjudicationService` + decision-tx consumption are sound.
6. No provider PA UI exists — F3.7-F3.14 build it on the canonical read models.
