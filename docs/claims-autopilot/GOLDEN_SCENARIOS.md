# Claims Autopilot — Golden Scenarios (F0.3)

**Work package:** F0.3 — Create golden claim scenarios
**Plan:** [`CLAIMS_AUTOPILOT_EXECUTION_PLAN.md`](../../CLAIMS_AUTOPILOT_EXECUTION_PLAN.md) §16 F0.3, §17 (acceptance catalogue)
**Fixtures:** [`tests/fixtures/claims-autopilot.ts`](../../tests/fixtures/claims-autopilot.ts)
**Self-check:** [`tests/fixtures/claims-autopilot.fixtures.test.ts`](../../tests/fixtures/claims-autopilot.fixtures.test.ts) (115 assertions)

These are the **shared oracle** for the whole epic. Every later layer references a
named scenario instead of re-inventing inputs — the F1.1 schema must accept all of
them, F1.2/F1.3 must normalize/fingerprint them identically per rail, F4.4 must
produce the disposition below, and F5.x cross-rail tests (CA-070..079) feed the
same payload through each rail and assert the same oracle.

## Conventions

- **Neutral synthetic IDs only** (`GOLDEN_IDS`) — no real patient data.
- **Money is decimal strings**; `billedAmount = quantity × unitCost` exactly;
  `totalBilled = Σ line billed`. Never floats.
- **Oracles encode TARGET behavior (D6):** a business-rule failure is
  `ACCEPT` + `ROUTE` with a reason — not a thrown error. Where a current rail
  still throws (e.g. `benefitNotConfigured` in `runClaimIntake`), the divergence
  is intentional and closed in F3.2 / F5.x.
- **Policy modes (D2):** `underOff` always `ROUTE`; `underShadow` proposes but
  moves no money; `underLive` may move money only for a clean, fully-priced,
  LIVE-eligible claim (`moneyMayMoveUnderLive = true`).
- Route codes come from §10.3 (`ROUTE`); queues from §10.4 (`QUEUE`).

## The 19 fixtures

| # | Fixture name | Structural | Under LIVE | Route code | Queue | Money may move | Backs (CA) |
|---|---|---|---|---|---|:--:|---|
| 1 | `cleanOutpatientTwoLines` | ACCEPT | AUTO_APPROVE | — | — | ✅ | 001, 030/031, 070–072 |
| 2 | `contractedAdjustmentShortfall` | ACCEPT | AUTO_APPROVE¹ | — | — | ✅ | 037 |
| 3 | `oneCodedOneUncoded` | ACCEPT | ROUTE | `PRICING_INCOMPLETE` | `PRICING_REVIEW` | ❌ | 036, 038 |
| 4 | `missingPaRequiredService` | ACCEPT | ROUTE | `PREAUTH_REQUIRED` | `CLINICAL_AUTH_REVIEW` | ❌ | 040 |
| 5 | `expiredPa` | ACCEPT | ROUTE | `PREAUTH_REQUIRED` | `CLINICAL_AUTH_REVIEW` | ❌ | 040 |
| 6 | `insufficientPaCover` | ACCEPT | ROUTE | `PREAUTH_COVER_INSUFFICIENT` | `CLINICAL_AUTH_REVIEW` | ❌ | 040 |
| 7 | `missingRequiredDocument` | ACCEPT | ROUTE | `DOCUMENTS_INCOMPLETE` | `PROVIDER_QUERY` | ❌ | 039 |
| 8 | `benefitNotConfigured` | ACCEPT | ROUTE | `BENEFIT_NOT_CONFIGURED` | `BENEFIT_REVIEW` | ❌ | 042, 012 |
| 9 | `benefitInsufficient` | ACCEPT | ROUTE | `BENEFIT_LIMIT_REVIEW` | `BENEFIT_REVIEW` | ❌ | 042 |
| 10 | `openFraudAlert` | ACCEPT | ROUTE | `FRAUD_REVIEW` | `FRAUD_REVIEW` | ❌ | 043, 044 |
| 11 | `exactReplay` | ACCEPT | REPLAY | — | — | ❌ | 020, 021, 024 |
| 12 | `sameKeyDifferentPayload` | ACCEPT | CONFLICT | — | — | ❌ | 022 |
| 13 | `strongCrossRailDuplicate` | ACCEPT | STRONG_LINK | — | — | ❌ | 026 |
| 14 | `fuzzySecondVisit` | ACCEPT | ROUTE | `DUPLICATE_REVIEW` | `DUPLICATE_REVIEW` | ❌ | 027 |
| 15a | `nonBaseCurrencyNoFx` | ACCEPT | ROUTE | `FX_RATE_MISSING` | `CONFIGURATION_REVIEW` | ❌ | 010 |
| 15b | `nonBaseCurrencyWithFx` | ACCEPT | AUTO_APPROVE | — | — | ✅ | 011 |
| 16 | `reimbursementWithProof` | ACCEPT | ROUTE | `REIMBURSEMENT_PROOF_REVIEW` | `REIMBURSEMENT_REVIEW` | ❌ | 045, 076 |
| 17 | `interimInpatientSlice` | ACCEPT | ROUTE² | `INPATIENT_SHADOW_ONLY` | — | ❌ | 046, 078 |
| 18 | `finalCaseResidual` | ACCEPT | ROUTE² | `INPATIENT_SHADOW_ONLY` | — | ❌ | 046, 079 |

¹ Full claim **approval** at the contracted rate; the reduced line is
`APPROVED_WITH_ADJUSTMENT` with a stamped shortfall — this is contract pricing,
**not** a partial decline (which stays opt-in, D4).
² Inpatient is forced `SHADOW` in v1 (D14); it never moves money until the
separate inpatient release gate, even where an outpatient LIVE policy exists.

## Duplicate/idempotency scenarios

Scenarios 11–14 carry a `secondSubmission` expressing the follow-up:

- **`exactReplay`** — identical payload, same `idempotencyKey`. Second call replays
  the original receipt/claim; exactly one financial effect.
- **`sameKeyDifferentPayload`** — same key, a changed line amount ⇒
  `IDEMPOTENCY_KEY_REUSED` (409); the original is never mutated.
- **`strongCrossRailDuplicate`** — different transport keys, same authoritative
  invoice/external ref ⇒ the later receipt **links** to the first claim (no new
  claim). A suspected/fuzzy match may never take this branch.
- **`fuzzySecondVisit`** — same content, a later legitimate visit, **no**
  authoritative identity ⇒ persists and routes `DUPLICATE_REVIEW` with safe
  candidate references; never auto-linked.

The distinction between scenarios 13 and 14 encodes D7 (transport replay and
authoritative event-linking are safe; content similarity alone is never safe to
auto-merge).

## Money oracle note

`expectedTotalPayable` is `null` at the unit layer for auto-approvable scenarios
because payable depends on the seeded contract. DB-specific builders (added when
F5 integration tests need them) resolve real seeded IDs and assert the concrete
contracted/payable/shortfall figures. Unit fixtures assert only what is
deterministic without a database (billed totals, disposition, route, queue,
money-may-move).
