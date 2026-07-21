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

---

## F1.2 — Canonical normalization for dates, text, codes, quantities and money

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F1.2 commit)
- **Files changed:** `src/server/services/claim-intake/normalize.ts` (new), `tests/services/claim-intake-normalize.test.ts` (new).
- **Decisions enforced:** hard prohibition "no float money" — all money via `Decimal`; §7.4 recompute totals (don't trust supplied billed); §7.5 code normalization without inventing codes; §8.2 canonical ordering by source line ref.
- **Acceptance scenarios covered:** underpins the cross-rail equivalence matrix CA-070..079 (same normalized business payload ⇒ same canonical object).
- **Observable behavior before:** each rail parsed money/dates/codes differently (float vs Decimal, varied whitespace, mixed case) — no shared canonical form.
- **Observable behavior after:** `normalizeSubmission(ClaimSubmissionV1)` → one `NormalizedSubmission`: Decimal money (billed/total recomputed + 2dp HALF_UP round, unit cost as no-trailing-zero canonical string), calendar-date vs instant date semantics, uppercased codes, collapsed text, source-ref line ordering with stable `lineNumber`, sorted PA refs, optional-absent→null.
- **Forbidden effects explicitly checked:** no float arithmetic (Decimal only, proven via large-integer test with no overflow); `canonicalDecimal` throws on NaN/Infinity/exponent (defence in depth); no code invented (undefined→null); no DB/clock.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-normalize.test.ts` → **11 passed**, including the Done-when: four rail representations (API numbers, UI strings+whitespace, CSV lowercase+reversed order, offline numbers) normalize to one identical object.
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** n/a (pure function). Every golden fixture normalizes with total == Σ line billed.
- **Creator allowlist change:** none.
- **Known gaps or skips:** currency-aware money scale fixed at 2dp (`MONEY_SCALE`); true per-currency minor-unit scaling refined in context where the currency table is available. idempotencyKey/timestamps are normalized but treated as transport fields (excluded from the hash in F1.3).
- **Security/privacy review:** no PII beyond neutral ids; no logging.
- **Next eligible task:** F1.3 — Request hash and separated duplicate fingerprints.
- **Blocker/options, if blocked:** n/a.

---

## F1.3 — Request hash and separated duplicate fingerprints

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F1.3 commit)
- **Files changed:** `src/server/services/claim-intake/fingerprint.ts` (new), `tests/services/claim-intake-fingerprint.test.ts` (new).
- **Decisions enforced:** D7 (transport replay vs authoritative event-link vs content-similarity are three separate things); §8.2/§8.3/§8.4; "no readable PII in fingerprint columns" (all SHA-256 hex).
- **Acceptance scenarios covered:** CA-020/024 (replay via request hash), CA-022 (changed-payload conflict via request hash), CA-026 (strong cross-rail link), CA-027 (fuzzy candidate never linked).
- **Observable behavior before:** rails relied on ad-hoc `externalRef`/invoice checks; no separation of identity vs similarity, no request-content hash.
- **Observable behavior after:** three versioned hashes — `computeRequestHash` (`req:v1:` over content minus transport fields), `computeStrongEventFingerprint` (`strong:v1:` by authoritative precedence invoice→external→case→preauth, else `null`), `computeSuspectedDuplicateFingerprint` (`suspect:v1:`, order-independent content signature, always non-null) plus `buildSuspectedDuplicateDescriptor` for windowed candidate search.
- **Forbidden effects explicitly checked:** strong fp is `null` without authoritative identity (never fabricated); suspect fp can never take the strong-link branch (separate functions, separate prefixes); no PII leaks (asserted fp values contain no "SECRET"/"member" substrings, only `kind:v1:<64hex>`); request hash excludes idempotencyKey/timestamps; tenant-scoped (same invoice, different tenant ⇒ different strong fp).
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-fingerprint.test.ts` → **13 passed** (request-hash key-independence + content-sensitivity; strong precedence/null/change/tenant-scope; suspect equality for identical content + order-independence + fuzzy-visit-is-candidate-not-event; PII-safety).
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** n/a (pure crypto). Uniqueness/link semantics land at the DB boundary in F2.1/F3.3.
- **Creator allowlist change:** none.
- **Known gaps or skips:** `entrySetHash`, `integrationKeyId`, `preauthConversionMarker`, `providerOwnsInvoiceNamespace` are caller-supplied (assembled from context in F3.x). Version bump procedure documented in `FINGERPRINT_VERSIONS`.
- **Security/privacy review:** SHA-256 only; no reversible identifiers stored; descriptor (raw ids) is ephemeral query input, never a persisted fingerprint.
- **Next eligible task:** F1.4 — Structured intake errors and response mapping.
- **Blocker/options, if blocked:** n/a.

---

## F1.4 — Structured intake errors and response mapping

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F1.4 commit)
- **Files changed:** `src/server/services/claim-intake/errors.ts` (new), `tests/services/claim-intake-errors.test.ts` (new), `tests/services/auto-adjudication-characterization.test.ts` (lint cleanup — removed `any` from the F0.4 test).
- **Decisions enforced:** §7.3/§11.5 (never leak raw Zod/Prisma/SQL/stack); D6 (structural rejection vs business route separation reflected in error kinds vs non-error outcome codes). No business rules in the mapper.
- **Acceptance scenarios covered:** CA-003/CA-005 (safe field issues), CA-022 (409 conflict body), CA-086/CA-087/CA-090 (non-enumerating, redacted errors), and the F1.4 "stable 401/403/409/422/503 mapping".
- **Observable behavior before:** each rail hand-rolled error responses; some surfaced raw thrown messages (Next masks server-action throws, so the admin wizard already RETURNs strings, but there was no shared safe mapper).
- **Observable behavior after:** `IntakeError` (kinds VALIDATION/AUTHENTICATION/AUTHORIZATION/IDEMPOTENCY_CONFLICT/RETRYABLE/INTERNAL → 422/401/403/409/503/500), `zodToIntakeIssues` (safe `IntakeIssue[]`), `IntakeError.from(unknown)` (wraps any thrown value as generic 500, original captured only in `logContext`), `toHttpResponse`/`toActionResult` transport mappers, and stable `INTAKE_CODES` including non-error outcome codes (ACCEPTED/REPLAYED/ROUTED) for the F3.4 result type.
- **Forbidden effects explicitly checked:** serialized bodies asserted free of `ZodError`/`PrismaClient`/`SELECT…FROM`/stack-frame/`node_modules` markers; a Prisma-like error's `constraint`/`claimNumber`/message text never reaches the body but IS in `logContext`; authorization message never enumerates the attempted id; action results strip `ECONNREFUSED`/port.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-errors.test.ts` → **13 passed**.
  - `npx vitest run tests/services/auto-adjudication-characterization.test.ts` → **8 passed** (post lint cleanup).
  - **M1 boundary full gate:** `npm run typecheck` PASS; `npx vitest run` → **1013 passed / 9 skipped**; `npm run brand:guard` PASS; `npm run currency:guard` PASS.
  - **Lint:** my new files are eslint-clean. Full `npm run lint` has one PRE-EXISTING `no-explicit-any` error in `tests/services/claim-intake-enrollment-gate.test.ts:12` (not part of this epic; left untouched to preserve unrelated code). Full-lint was therefore already non-clean at baseline (F0.1 did not capture lint).
- **Database/audit/reconciliation evidence:** n/a (pure mapper).
- **Creator allowlist change:** none.
- **Known gaps or skips:** replay/route are success OUTCOMES (codes exported here) rendered by the F3.4 submit result, not thrown errors — intentionally out of `IntakeError`.
- **Security/privacy review:** the core privacy guarantee of the epic's transport layer; verified by anti-leakage assertions.
- **Next eligible task:** F2.1 — Add intake receipt schema (M2). **M1 complete.**
- **Blocker/options, if blocked:** n/a.

---

## F2.1 — Add intake receipt schema

- **Status:** COMPLETE (schema + client + tests; live `db push` deferred — no DB in env)
- **Commit/branch:** `feat/claims-autopilot` (F2.1 commit)
- **Files changed:** `prisma/schema.prisma` (additive: 2 enums + `ClaimIntakeReceipt` model + Tenant/Claim back-relations), `tests/services/claim-intake-receipt-schema.test.ts` (new), `docs/claims-autopilot/DEPLOYMENT.md` (new).
- **Decisions enforced:** D16 (receipt stores hashes + safe outcomes only, never raw payloads); §9.8 (additive only, no rename/removal, `db push`).
- **Acceptance scenarios covered:** foundation for CA-020..029 (idempotency/duplicate) — the durable `(tenantId, scopeKey, channel, idempotencyKey)` uniqueness boundary now exists in the model.
- **Observable behavior before:** no durable receipt; idempotency was rail-specific (`externalRef` unique on Claim only).
- **Observable behavior after:** `ClaimIntakeReceipt` model with the compound unique + 4 indexes; `ClaimIntakeChannel`/`ClaimIntakeReceiptState` enums; Prisma client regenerated. No runtime behavior change (model unwired until F3.x).
- **Forbidden effects explicitly checked:** additive only (existing Claim/Tenant columns untouched — only new relation fields added); `prisma validate` OK; no `prisma migrate/reset` run; the `db push`-managed rule honored.
- **Tests run and exact results:**
  - `npx prisma validate` → valid; `npx prisma generate` → client generated (v7.7.0).
  - `npx vitest run tests/services/claim-intake-receipt-schema.test.ts` → **5 passed** (enum values, field set via dmmf, compound-unique + create-input compile-time proofs).
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** offline only. Live `db push` + row-level concurrency proof is F2.2/F8.1 territory (needs a disposable DB with `DATABASE_URL`).
- **Creator allowlist change:** none.
- **Known gaps or skips:** `npm run db:push` NOT run — no `DATABASE_URL` configured; documented in `DEPLOYMENT.md`. `replayedFromReceiptId` is a plain nullable ref (no self-relation FK) to keep queries simple.
- **Security/privacy review:** model carries only hashes/safe messages/outcome codes; no PHI columns.
- **Next eligible task:** F2.2 — Implement receipt reservation and replay semantics.
- **Blocker/options, if blocked:** n/a.
