# Claims Autopilot — Implementation Log

One entry per completed micro-task, appended in order (§19.6). A note saying only
"implemented" or "tests pass" is invalid. Every entry states observable behavior
before/after and the forbidden effects explicitly checked.

Execution model for this run: work proceeds in strict dependency order from F0.1.
Each package keeps `npm run typecheck`, `npx vitest run`, `npm run brand:guard`,
and `npm run currency:guard` green. Commits land on branch `feat/claims-autopilot`
(off `main` at `c56eaf1`); nothing is pushed. Unrelated dirty UAT files are never
staged.

---

## F0.1 — Freeze the automated and repository baseline

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (baseline docs commit)
- **Files changed:** `docs/claims-autopilot/BASELINE.md` (new), `docs/claims-autopilot/IMPLEMENTATION_LOG.md` (new).
- **Decisions enforced:** none changed; this package only records state (§16 F0.1 "Do not repair failures").
- **Acceptance scenarios covered:** none (baseline capture).
- **Observable behavior before:** no `docs/claims-autopilot/` baseline record existed.
- **Observable behavior after:** reproducible baseline recorded at HEAD `c56eaf1`; no code behavior changed.
- **Forbidden effects explicitly checked:** no source/schema files touched; no unrelated dirty UAT files staged; no secrets or PII written into the baseline doc; production DB read = "not run" (no sanctioned read-only DB).
- **Tests run and exact results:**
  - `npm run typecheck` → PASS (no errors).
  - `npx vitest run` → 96 files passed / 2 skipped; **791 passed / 9 skipped**; ~8.9 s.
  - `npm run brand:guard` → PASS.
  - `npm run currency:guard` → PASS (635 files scanned).
  - 9 skips = the two `skipIf(!URL_SET)` real-DB integration suites (`benefit-race`, `interim-settlement`); no `DATABASE_URL` in env — expected.
- **Database/audit/reconciliation evidence:** none run this package; prior UAT evidence linked in `BASELINE.md` §4.
- **Creator allowlist change:** none (F0.2 introduces the guard).
- **Known gaps or skips:** production data snapshot deferred to F8.1; `npm run lint` not captured at baseline (run at merge boundaries).
- **Security/privacy review:** baseline doc contains no credentials, keys, or patient data — verified by inspection.
- **Next eligible task:** F0.2 — Build the production claim-creator inventory.
- **Blocker/options, if blocked:** n/a.

---

## F0.2 — Build the production claim-creator inventory

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F0.2 commit)
- **Files changed:** `docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md` (new), `tests/services/claim-creator-consolidation.test.ts` (new).
- **Decisions enforced:** groundwork for the hard prohibition "no second public claim-intake entry point" and D-consolidation; no behavior change.
- **Acceptance scenarios covered:** none directly; underpins CA-073 and the F5 cross-rail matrix by pinning the creator set.
- **Observable behavior before:** no inventory; a new direct `Claim.create` could land unnoticed.
- **Observable behavior after:** all 9 production creators documented with per-rail auth/source/idempotency/fraud/automation/audit/txn detail; a guard test fails CI if a new un-allowlisted `Claim.create` appears or an allowlisted file stops creating claims.
- **Forbidden effects explicitly checked:** guard scans `src/**` only (seed/test creators excluded by design); no runtime code changed; meta-test confirmed the guard *fails* on a planted probe creator and passes once removed (probe file deleted, no residue).
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-creator-consolidation.test.ts` → **3 passed**.
  - Scanner dump → exactly 9 create sites across 8 files, matching the allowlist 1:1.
  - Meta-test → guard FAILS with actionable message on a planted creator; PASSES 3/3 after removal.
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** n/a (static source scan).
- **Creator allowlist change:** established the initial allowlist of 8 files (claim-intake, claims.service, api/v1/claims, api/claims/import, admin claims/new actions, reimbursement.service, sync.service, case.service). Shrinks per F5 migration; canonical `claim-intake/persist.ts` joins at F3.3 and is the last entry after F5.10.
- **Known gaps or skips:** none. `createClaimWithPreauth` and the `@deprecated convertPreauthToClaim` are wrappers over `createClaim` (no independent create site) — recorded in the inventory, not the allowlist.
- **Security/privacy review:** inventory records auth scope per rail; no secrets/PII; documents the fraud/automation coverage gaps (#2 tRPC, #4 CSV, #6 reimbursement service run neither) that M5 closes.
- **Next eligible task:** F0.3 — Create golden claim scenarios.
- **Blocker/options, if blocked:** n/a.

---

## F0.3 — Create golden claim scenarios

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F0.3 commit)
- **Files changed:** `tests/fixtures/claims-autopilot.ts` (new), `tests/fixtures/claims-autopilot.fixtures.test.ts` (new), `docs/claims-autopilot/GOLDEN_SCENARIOS.md` (new).
- **Decisions enforced:** D2 (three policy modes reflected in every oracle), D4 (partial opt-in — scenario 2 is contract adjustment not partial), D5 (uncoded line routes whole claim), D6 (business failures ACCEPT+ROUTE not throw), D7 (strong-link vs fuzzy-suspect separation), D13 (reimbursement always manual), D14 (inpatient shadow-only).
- **Acceptance scenarios covered:** fixtures back CA-001, 010–012, 020–022, 024, 026–027, 030–031, 036–040, 042–046, 070–072, 076, 078–079 (recorded per-fixture in `acceptanceScenarioIds`).
- **Observable behavior before:** no shared fixture set; each test would invent its own inputs and disagree on expected disposition.
- **Observable behavior after:** 19 named `GoldenScenario` fixtures (18 required + FX split) with a full oracle (structural disposition, route code, queue, per-mode outcome, decimal-string line totals, money-may-move, duplicate kind, CA refs); a registry and `goldenByName` index; a 115-assertion self-consistency guard.
- **Forbidden effects explicitly checked:** no floats (all money is decimal strings validated `^\d+(\.\d{1,2})?$`); no PHI (neutral synthetic IDs only); routed claims never move money (asserted); money-may-move implies AUTO_APPROVE + null route (asserted); no DB access in fixtures.
- **Tests run and exact results:**
  - `npx vitest run tests/fixtures/claims-autopilot.fixtures.test.ts` → **115 passed**.
  - `npm run typecheck` → PASS.
  - Full suite → see F0.4 boundary run (recorded there / this commit).
- **Database/audit/reconciliation evidence:** n/a (unit fixtures). `expectedTotalPayable` deliberately `null` for auto-approve cases — resolved in DB builders later.
- **Creator allowlist change:** none.
- **Known gaps or skips:** DB-specific builders (seeded IDs + concrete payable/shortfall) deferred to when F5 integration tests need them (F0.3 step 1). FX scenario split into with/without ⇒ 19 fixtures.
- **Security/privacy review:** neutral IDs, no names/DOB/documents; attachment refs are synthetic hashes.
- **Next eligible task:** F0.4 — Characterize current automation and failure behavior.
- **Blocker/options, if blocked:** n/a.

---

## F0.4 — Characterize current automation and failure behavior

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F0.4 commit)
- **Files changed:** `tests/services/auto-adjudication-characterization.test.ts` (new).
- **Decisions enforced:** none yet — this package *documents* the D1/D11 violations before F4 removes them. Read: `auto-adjudication.service.ts`, `settings/auto-adjudication/page.tsx` + `actions.ts`, existing `auto-adjudication.service.test.ts` (claim-decision.service read via its `decide`/`assessCeiling` interface; deep read deferred to F4.5 as the package directs).
- **Acceptance scenarios covered:** anchors CA-032 (no-policy must route — currently violated), CA-050 (partial-write rollback — currently violated), CA-045 (reimbursement manual — currently holds), CA-036 (unpriced routes — currently holds).
- **Observable behavior before:** the unsafe/partial behaviors were undocumented; a refactor could silently change them with no before/after anchor.
- **Observable behavior after:** 8 characterization tests pin current behavior, split into two blocks:
  - **UNSAFE (flip in F4.1/F4.5):** #1 no-policy ⇒ AUTO_APPROVE (policyId null); #2 no-ceiling fallback approves a 5,000,000 priced claim; #3 line stamping runs *before* `decide` (`invocationCallOrder` proof); #4 a mid-loop failure leaves line `l1` stamped APPROVED while the claim routes PIPELINE_ERROR (partial state, no rollback); #5 pipeline error writes only the claim flag, no durable run/stage.
  - **SAFE (preserve):** #6 reimbursement always routes; #7 engine-pended ⇒ `PRICING_COMPLETE` route, no-price ⇒ `NO_ENFORCEABLE_PRICE` route.
- **Forbidden effects explicitly checked:** every UNSAFE test carries a `[UNSAFE:Dx]` marker and an inline "F4.x must flip this" note so it cannot be mistaken for desired behavior and will be removed at remediation (F0.4 instruction). No production code touched.
- **Tests run and exact results:**
  - `npx vitest run tests/services/auto-adjudication-characterization.test.ts tests/services/auto-adjudication.service.test.ts` → **23 passed** (8 new + 15 existing).
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** n/a (mock harness mirroring the existing unit test).
- **Creator allowlist change:** none.
- **Known gaps or skips:** the F4.1 UI copy target is pinned — `settings/auto-adjudication/page.tsx:110` currently reads "No policies — the conservative built-in default applies (auto-approve clean claims, no ceiling)"; F4.1 changes it to "No approved live policy — claims route to review." `DEFAULT` object at `auto-adjudication.service.ts:42` is the D1-violating fallback F4.1 removes.
- **Security/privacy review:** no secrets/PII; tests use neutral mock ids.
- **Next eligible task:** F1.1 — Add the versioned Zod claim envelope (M1). **M0 complete.**
- **Blocker/options, if blocked:** n/a.

---

## F1.1 — Add the versioned Zod claim envelope

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F1.1 commit)
- **Files changed:** `src/server/services/claim-intake/schema.ts` (new), `tests/services/claim-intake-schema.test.ts` (new).
- **Decisions enforced:** §7.2 privilege-field rejection (top-level `.strict()` rejects tenantId/clientId/decision/payableAmount/policyId/receiptState/…); §7.3 structural rules; hard prohibition "no float money" (money validated as bounded decimal strings, no exponent/NaN/Infinity). No DB access, no value transformation (normalization is F1.2).
- **Acceptance scenarios covered:** CA-002 (maximal envelope), CA-004 (unknown version), CA-005 (injection/oversize), CA-006 (privilege fields ignored/rejected), CA-007 (billed ≠ qty×unit), CA-009 (malformed dates/codes); backs the F1.1 "Done when" (accepts every golden scenario).
- **Observable behavior before:** each rail had its own ad-hoc Zod/validation with divergent bounds and no shared privilege-field guard.
- **Observable behavior after:** `ClaimSubmissionV1Schema` + `parseClaimSubmissionV1()` validate the §7.1 envelope; inferred types (`ClaimSubmissionV1`, line/diagnosis/attachment) exported; named `LIMITS` constants for reuse by route body guards.
- **Forbidden effects explicitly checked:** no DB lookup in schema; no wall-clock dependency (service-date-not-future deferred to normalization/context, documented in the header); money never parsed as float — bounded decimal-string regex + `Decimal` for the billed=qty×unit check.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-schema.test.ts` → **59 passed** (19 golden accepted + 28 structural rejections + 9 privilege-field rejections + minimal/maximal/version).
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** n/a (pure schema).
- **Creator allowlist change:** none.
- **Known gaps or skips:** "service date not in the future", currency existence/FX, and service-category mapping are intentionally NOT in the schema (need clock/DB); enforced in F1.2/F3.1. Schema is validate-only; F1.2 owns canonical transformation.
- **Security/privacy review:** anti-HTML text guard blocks tag-starts + `javascript:`; `.strict()` blocks privilege injection; no PII in schema or tests (neutral ids).
- **Next eligible task:** F1.2 — Canonical normalization for dates, text, codes, quantities and money.
- **Blocker/options, if blocked:** n/a.
