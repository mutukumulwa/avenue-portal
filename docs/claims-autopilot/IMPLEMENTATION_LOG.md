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
