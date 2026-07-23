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

---

## Environment — disposable Postgres provisioned (per user decision 2026-07-22)

Stood up a throwaway Postgres 16.14 in the session scratchpad (no Docker; `initdb`
+ `pg_ctl` on port 55432, short socket dir `/tmp/ap_uat_sock` to dodge the 103-byte
socket-path limit). DB `autopilot_uat`, schema pushed (`prisma db push` → 181
tables incl. `ClaimIntakeReceipt` with all indexes). Connection env at
`<scratchpad>/db.env`; recipe + teardown in `docs/claims-autopilot/VERIFICATION.md`.
Integration suites gate on `AUTOPILOT_TEST_DB === DATABASE_URL` so they can only
ever touch this throwaway. This unblocks the mandated real-DB proofs (F2.2, F3.5/6,
F4.5, F7.4).

---

## F2.2 — Implement receipt reservation and replay semantics

- **Status:** COMPLETE (incl. real-DB concurrency proof)
- **Commit/branch:** `feat/claims-autopilot` (F2.2 commit)
- **Files changed:** `src/server/services/claim-intake/receipt.ts` (new), `tests/services/claim-intake-receipt.test.ts` (new, mocked), `tests/integration/claim-intake-receipt.integration.test.ts` (new, real DB), `docs/claims-autopilot/VERIFICATION.md` (new).
- **Decisions enforced:** §8.6 replay/conflict semantics; §11.4 exact-once (one receipt per scoped key); D16 (no payload in receipt).
- **Acceptance scenarios covered:** CA-020/CA-021 (same key sequential/concurrent ⇒ one receipt), CA-022 (different hash ⇒ conflict, original unchanged), CA-024 (lost response retry returns durable state).
- **Observable behavior before:** no durable reservation; concurrent same-key submissions on most rails could create duplicate claims.
- **Observable behavior after:** `reserveReceipt(db, input)` → RESERVED | REPLAY | CONFLICT via the DB unique constraint; `markReceipt{Succeeded,Rejected,Failed}` transition ONLY from PROCESSING (`updateMany where state=PROCESSING`, returns whether this call won); `assertValidScopeKey`, `findReceiptByKey`. Takes an explicit client/tx (composes in the F3.3 intake transaction; constructs no client on import).
- **Forbidden effects explicitly checked:** CONFLICT never mutates the original (asserted `updateMany` not called; real-DB row hash unchanged); a late terminal transition returns false and does not overwrite success (real-DB SUCCEEDED survives a later markFailed); non-P2002 errors rethrown unchanged.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-receipt.test.ts` → **20 passed** (mocked).
  - **Real DB** (`source db.env`): `npx vitest run tests/integration/claim-intake-receipt.integration.test.ts` → **3 passed** — 20 concurrent same key+hash ⇒ exactly 1 RESERVED + 19 REPLAY + 1 DB row; 10 concurrent same key/diff hash ⇒ 1 RESERVED + 9 CONFLICT + 1 DB row (winner hash intact, all conflicts reference it); one-way terminal.
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** real Postgres 16.14; the compound unique `(tenantId, scopeKey, channel, idempotencyKey)` enforces exactly-once under 20-way concurrency.
- **Creator allowlist change:** none (no Claim.create here — receipts only).
- **Known gaps or skips:** notification/audit exact-once and claim linkage happen in F3.3/F3.7 (receipt.claimId populated there).
- **Security/privacy review:** scope-key format validated; receipt stores hashes/outcome only.
- **Next eligible task:** F2.3 — Add processing run and stage schema.
- **Blocker/options, if blocked:** n/a.

---

## F2.3 — Add processing run and stage schema

- **Status:** COMPLETE (schema applied to throwaway DB + tests)
- **Commit/branch:** `feat/claims-autopilot` (F2.3 commit)
- **Files changed:** `prisma/schema.prisma` (additive: 4 enums + `ClaimProcessingRun` + `ClaimProcessingStage` + 6 Claim provenance columns + 3 back-relations + uniques/indexes), `tests/services/claim-processing-schema.test.ts` (new), `docs/claims-autopilot/DEPLOYMENT.md` (F2.3 section).
- **Decisions enforced:** D8 (DB is authoritative — durable run/stage state); §6.4 state machine; §6.5 14-stage vocabulary; §9.3–§9.5.
- **Acceptance scenarios covered:** foundation for CA-025/CA-048/CA-101..104 (durable runs, retry, recovery) and CA-026 (Claim strong-fp unique = one claim per authoritative event).
- **Observable behavior before:** automation had no durable run/stage; a pipeline error left only a `Claim.autoAdj*` flag (characterized in F0.4 #5).
- **Observable behavior after:** `ClaimProcessingRun` (revision/workflow/sequence unique, lease fields, `nextAttemptAt`, supersession) + `ClaimProcessingStage` (`(runId, stage)` unique, safe `result` JSON) exist; Claim carries `claimRevision`/`strongEventFingerprint`(unique)/`suspectedDuplicateFingerprint`/`processingState`/`processingRouteCode`/`intakeSchemaVersion`. No runtime behavior yet (F3.5 wires the repository).
- **Forbidden effects explicitly checked:** additive only; legacy `autoAdj*` columns retained (not removed) per §9.5; `stage.result`/`run.safeMessage` documented as safe-only (no raw docs/credentials/stack); strong-fp unique permits multiple NULLs (verified).
- **Tests run and exact results:**
  - `npx prisma validate` OK; `npx prisma generate` OK; `npx prisma db push --accept-data-loss` → in sync (0 rows affected).
  - `npx vitest run tests/services/claim-processing-schema.test.ts` → **8 passed**.
  - `npm run typecheck` → PASS.
- **Database/audit/reconciliation evidence:** applied to `autopilot_uat`; `ClaimProcessingRun`/`ClaimProcessingStage` tables + run compound unique + `Claim_tenantId_strongEventFingerprint_key` all present.
- **Creator allowlist change:** none.
- **Known gaps or skips:** `run.modeResolved` is `String?` (decoupled from the F2.4 `AutoAdjudicationMode` enum — the run is a trace). **Deploy finding:** the Claim strong-fp unique triggers a conservative `db push` data-loss warning that is a false positive (new all-NULL column, NULLs distinct) — documented in `DEPLOYMENT.md` with the `--accept-data-loss` flag and a pre-prod dup-check query.
- **Security/privacy review:** run/stage store safe messages/reason codes/JSON refs only.
- **Next eligible task:** F2.4 — Add policy modes and fail-safe schema defaults.
- **Blocker/options, if blocked:** n/a.

---

## F2.4 — Add policy modes and fail-safe schema defaults

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F2.4 commit)
- **Files changed:** `prisma/schema.prisma` (2 enums + governed fields on `AutoAdjudicationPolicy`), `src/server/services/claim-autopilot/policy.ts` (new), `tests/services/claim-autopilot-policy.test.ts` (new), `docs/claims-autopilot/DEPLOYMENT.md` (F2.4 section).
- **Decisions enforced:** D1 (no implicit live), D2 (OFF/SHADOW/LIVE), D4 (`allowAutoPartial` default false), D15 (governed activation via approval fields).
- **Acceptance scenarios covered:** CA-032 (no/OFF/draft/pending/rejected ⇒ route — `effectivePolicyMode` returns OFF for all), CA-081/CA-082 (approved finite scope required for LIVE).
- **Observable behavior before:** the only policy control was `enabled` + `maxAutoApproveAmount` (null = no ceiling) — the D1-violating shape.
- **Observable behavior after:** `AutoAdjudicationPolicy` has `mode @default(OFF)`, `status @default(DRAFT)`, explicit inclusion arrays, per-gate requirements, and approval/version/deactivation fields. `policy.ts` provides `validateLivePolicy` (APPROVED + finite positive ceiling + all required gates on + explicit inclusions), `effectivePolicyMode` (**fail-closed** — an invalid "LIVE" row ⇒ OFF), `canExecuteLive`, and `classifyHistoricalPolicyMode` (never LIVE).
- **Forbidden effects explicitly checked:** column defaults make every existing row OFF/DRAFT (no implicit LIVE); `effectivePolicyMode` proven to return OFF for a malformed LIVE row; `classifyHistoricalPolicyMode` never returns LIVE; existing legacy columns retained.
- **Tests run and exact results:**
  - `npx prisma validate/generate/db push --accept-data-loss` → in sync (no data-loss warning; all additive nullable/defaulted).
  - `npx vitest run tests/services/claim-autopilot-policy.test.ts` → **18 passed**.
  - `npm run typecheck` → PASS; eslint on new files → clean.
- **Database/audit/reconciliation evidence:** applied to `autopilot_uat`; new policy columns present.
- **Creator allowlist change:** none.
- **Known gaps or skips:** actual policy RESOLUTION still runs the legacy path in `AutoAdjudicationService` until F4.1 removes the D1 fallback and switches to `effectivePolicyMode`. Backfill script is F2.6.
- **Security/privacy review:** policy is a money-control; the fail-closed resolver is the core D1 safety at the data layer.
- **Next eligible task:** F2.5 — Add policy approval action and application contract.
- **Blocker/options, if blocked:** n/a.

---

## F2.5 — Add policy approval action and application contract

- **Status:** COMPLETE (incl. real-DB maker-checker proof)
- **Commit/branch:** `feat/claims-autopilot` (F2.5 commit)
- **Files changed:** `prisma/schema.prisma` (`AUTO_ADJ_POLICY_CHANGE` enum value), `src/server/services/claim-autopilot/policy-approval.ts` (new), `src/server/services/approval-request.service.ts` (dispatch branch, +REJECTED handler), `tests/services/claim-autopilot-policy-approval.test.ts` (new, mocked), `tests/integration/claim-autopilot-policy-approval.integration.test.ts` (new, real DB), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** D15 (governed activation via maker-checker; maker ≠ checker; immediate reason-required deactivation).
- **Acceptance scenarios covered:** CA-080 (self-approval blocked, independent checker required), CA-081 (approved version activates once in scope), CA-084 (immediate deactivation).
- **Observable behavior before:** policy `enabled` could be toggled directly with no maker-checker governance.
- **Observable behavior after:** `submitPolicyChange` (DRAFT/REJECTED ⇒ PENDING_APPROVAL + approval request with a SAFE payload), `applyApprovedPolicyChange` (activates + supersedes prior approved in scope; idempotent; maker-guard), `deactivatePolicy` (immediate, reason-required). `ApprovalRequestService.decide` dispatches activation on final APPROVED and returns the policy to REJECTED on rejection — reusing the existing SoD/matrix path, not bypassing it.
- **Forbidden effects explicitly checked:** maker cannot approve own policy (SoD in `decide` + defence-in-depth guard in apply — both proven); rejection never activates (policy → REJECTED, `effectivePolicyMode` OFF); apply is idempotent (already-APPROVED ⇒ no-op, no updateMany); payload is the safe subset (id/version/mode/ceiling/scope), not raw form; apply-failure closes the request REJECTED.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-autopilot-policy-approval.test.ts` → **10 passed** (mocked).
  - **Real DB:** `npx vitest run tests/integration/claim-autopilot-policy-approval.integration.test.ts` → **4 passed** — full maker→checker activation, supersession, rejection→REJECTED, immediate deactivation, all against Postgres with a minimal matrix.
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; policy status transitions PENDING_APPROVAL→APPROVED/REJECTED/DEACTIVATED verified; prior version → SUPERSEDED.
- **Creator allowlist change:** none.
- **Known gaps or skips:** provisioning a default `AUTO_ADJ_POLICY_CHANGE` approval matrix per tenant is an ops/seed concern (surfaced as a clear PRECONDITION_FAILED if absent); the policy console UI is F6.5.
- **Security/privacy review:** activation is a money-control governed by maker-checker; audit events for policy change land in F3.7/F4.7 (AUTO_ADJ_POLICY:* chain events).
- **Next eligible task:** F2.6 — Add schema deployment, backfill and integrity scripts.
- **Blocker/options, if blocked:** n/a.

---

## F2.6 — Add schema deployment, backfill and integrity scripts

- **Status:** COMPLETE (incl. real-DB script smoke)
- **Commit/branch:** `feat/claims-autopilot` (F2.6 commit)
- **Files changed:** `scripts/backfill-claim-intake-provenance.ts` (new), `scripts/data-integrity-check.ts` (+`checkClaimsAutopilotInvariants`), `tests/services/backfill-claim-intake-provenance.test.ts` (new), `docs/claims-autopilot/DEPLOYMENT.md` (F2.6 section).
- **Decisions enforced:** §9.8 (additive deploy; never synthesize transport keys); §14.1 (safe rollback preserves accepted data); D1 (post-deploy verify no LIVE).
- **Acceptance scenarios covered:** CA-110 (rerunnable/idempotent backfill; no policy activated; stable integrity).
- **Observable behavior before:** no way to verify the additive schema deployed safely or that no policy is live post-deploy.
- **Observable behavior after:** `runBackfill` (report-only default, `--apply` idempotent, computes non-unique `suspectedDuplicateFingerprint` from claim content — never invents keys), `verifyPoliciesNonLive` (fail-closed gate), `rollbackDisableLive` (non-OFF → OFF/DEACTIVATED, never deletes receipts/runs), `claimSuspectFingerprint`; integrity script now also asserts receipt→claim linkage, strong-fp uniqueness, terminal-run completion.
- **Forbidden effects explicitly checked:** report-only writes nothing (asserted `update` uncalled); apply idempotent (0 missing ⇒ 0 updates); rollback never deletes receipts/runs (only policy updateMany); no transport-key/receipt fabrication; `--verify-non-live` exits non-zero on any LIVE.
- **Tests run and exact results:**
  - `npx vitest run tests/services/backfill-claim-intake-provenance.test.ts` → **9 passed**.
  - **Real DB:** `npx tsx scripts/data-integrity-check.ts` → "✓ … claims autopilot"; `npx tsx scripts/backfill-claim-intake-provenance.ts --verify-non-live` → report + "✓ Report-only", exit 0.
  - **M2 boundary full gate:** `npm run typecheck` PASS; `npx vitest run` → **1083 passed / 16 skipped** (16 = 9 original + 7 autopilot integration, correctly gated); `brand:guard` + `currency:guard` PASS; eslint new files clean.
- **Database/audit/reconciliation evidence:** scripts execute against real Postgres; integrity invariants hold on the (near-empty) `autopilot_uat`.
- **Creator allowlist change:** none.
- **Known gaps or skips:** legacy `legacy:<claimId>` receipts intentionally NOT created (product-owner-gated, §9.8); full §11.7 reconciliation report is F7.2. **M2 COMPLETE.**
- **Security/privacy review:** scripts use safe identifiers; backfill computes only non-unique content hashes; no PHI printed.
- **Next eligible task:** F3.1 — Implement derived intake context (M3).
- **Blocker/options, if blocked:** n/a.

---

## F3.1 — Implement derived intake context

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F3.1 commit)
- **Files changed:** `src/server/services/claim-intake/context.ts` (new), `tests/services/claim-intake-context.test.ts` (new).
- **Decisions enforced:** D12 (provider/tenant identity derived; supplied provider rejected if it differs); §7.2 (no trusted body fields); §11.5 (non-enumerating scope errors).
- **Acceptance scenarios covered:** CA-006 (privilege/provider fields ignored/rejected), CA-071 (provider scope from membership), CA-086/CA-090 (foreign scope unreadable, non-enumerating).
- **Observable behavior before:** each rail derived scope ad hoc; provider portal trusted the session but there was no single scope resolver or spoof guard.
- **Observable behavior after:** `resolveIntakeContext(caller, submission)` derives tenant/provider/branch/client/member/scopeKey/channel/source/currency for all 9 caller kinds; provider rails derive providerId (spoof rejected, D12); operator rails select+validate a provider within tenant; members resolve scoped to tenant and (for provider rails) `entitledMemberWhere`; ambiguous member number and foreign member fail safe; frozen typed context, no mutation.
- **Forbidden effects explicitly checked:** body providerId spoof rejected on provider rails (proven); provider not in tenant → AUTHORIZATION; non-operational provider → AUTHORIZATION; foreign member → non-enumerating AUTHORIZATION; ambiguous number → VALIDATION; entitlement scoping applied for provider rails only (asserted); read-only (no writes).
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-context.test.ts` → **23 passed** (all 9 channels + spoof/cross-tenant/ambiguity/branch/currency).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** n/a (read-only resolver, mocked). Composes `ProviderEntitlementService`, `ProvidersService.isOperational`, `ClaimsService.resolveClaimCurrency` (existing owners).
- **Creator allowlist change:** none.
- **Known gaps or skips:** source for a provider API key defaults to HMS (SLADE360/SMART via `sourceHint`); integration key defaults to SMART with `providerOwnsInvoiceNamespace=false` (external ref authoritative per §8.3). These map cleanly to the fingerprint precedence in F1.3.
- **Security/privacy review:** THE intake security boundary; all scope is server-derived; errors never enumerate member/provider existence.
- **Next eligible task:** F3.2 — Separate structural acceptance from business routing.
- **Blocker/options, if blocked:** n/a.

---

## F3.2 — Separate structural acceptance from business routing

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F3.2 commit)
- **Files changed:** `src/server/services/claim-intake/reason-catalog.ts` (new), `tests/services/claim-intake-reason-catalog.test.ts` (new).
- **Decisions enforced:** D6 (business failures accept+route, not throw — structural/security stays pre-claim reject via `IntakeError`); §11.5 (audience-safe wording, no fraud leakage).
- **Acceptance scenarios covered:** underpins CA-012/CA-036/CA-038..043/CA-121/CA-128 (route codes, remedies, member-safe text).
- **Observable behavior before:** rails threw on business gate failures (coverage/benefit/PA), losing the claim; no shared route-code→queue→wording registry.
- **Observable behavior after:** `reason-catalog.ts` maps all 23 §10.3 route codes to their §10.4 queue plus internal/provider/member wording, remedy, resubmission/override flags; `getReason`/`queueFor`/`reasonForAudience` helpers; `StageDisposition` (PASS | ROUTE(code)) is the stage-ready finding vocabulary (defined, wired into the runner in F4.2 — kept unused by rails now per F3.2 step 5).
- **Forbidden effects explicitly checked:** no provider/member text contains "fraud"/"investigat"/"alert" (asserted for all 23 codes); fraud named only in `internal`; INPATIENT_SHADOW_ONLY + PIPELINE_RETRY have no human queue; `overrideAllowed=false ⇒ overrideType=NONE`.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-reason-catalog.test.ts` → **24 passed**, including golden-oracle consistency (every fixture route code → the fixture's expected queue).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** n/a (pure catalog). Single source of truth; the golden fixtures' queue expectations are validated against it.
- **Creator allowlist change:** none.
- **Known gaps or skips:** the classifier/stage-finding is defined but intentionally not wired into any rail until the processing runner exists (F4.2). Added `MANUAL_ADJUDICATION` queue for clean-but-not-auto-eligible routes (AUTO_POLICY_*/ABOVE_AUTO_CEILING) — a documented extension of the §10.4 suggested set.
- **Security/privacy review:** the audience-safe wording contract is the privacy core of routed-claim messaging.
- **Next eligible task:** F3.3 — Implement transaction-aware canonical persistence.
- **Blocker/options, if blocked:** n/a.

---

## F3.3 — Implement transaction-aware canonical persistence

- **Status:** COMPLETE (incl. real-DB proof)
- **Commit/branch:** `feat/claims-autopilot` (F3.3 commit)
- **Files changed:** `src/server/services/claim-intake/persist.ts` (new — THE canonical creator), `tests/services/claim-intake-persist.test.ts` (new, mocked), `tests/integration/claim-intake-persist.integration.test.ts` (new, real DB), `tests/services/claim-creator-consolidation.test.ts` (+persist.ts allowlist), `docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md` (persist.ts = canonical owner), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** D7/§8.3 (strong-fingerprint links, suspected never links), D8 (DB authoritative), D16 (no payload beyond claim/lines), §11.1 (intake transaction includes receipt success + claim + lines + run + origin links atomically), §F3.3 step 10 (no fraud/notify/decide here).
- **Acceptance scenarios covered:** CA-001 (accepted, normalized totals, run scheduled, one claim), CA-026 (strong link, no 2nd claim), CA-027 (suspected content persists separately), and the intake-transaction rollback (CA-050 foundation).
- **Observable behavior before:** 9 divergent `Claim.create` sites; no single atomic owner; no strong-fingerprint concurrency handling.
- **Observable behavior after:** `persistClaimWithinTransaction(tx, input)` = the sanctioned in-tx creator (claim+lines+run+receipt-success+PA/case/reimbursement origin links); `persistClaim(prisma, input)` = the tx-open wrapper with bounded retry that re-resolves a concurrent strong-fingerprint collision to a link. Now the ONLY allowlisted `Claim.create` for new rails.
- **Forbidden effects explicitly checked:** persist runs NO fraud/notification/decision (mocked tx exposes only claim/run/receipt/preauth — proven); sequential + concurrent strong-fp ⇒ exactly one claim (real DB); suspected-content ⇒ separate claims (real DB); FK failure mid-tx rolls back fully — receipt stays PROCESSING, no run, no claim (real DB); request-hash mismatch ⇒ idempotency conflict.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-persist.test.ts` → **5 passed** (mocked).
  - **Real DB:** `npx vitest run tests/integration/claim-intake-persist.integration.test.ts` → **5 passed** (totals/source/run/receipt/no-post-effects; strong-link seq+concurrent; suspected-separate; rollback).
  - `npm run typecheck` → PASS; eslint clean; consolidation guard PASS (persist.ts allowlisted).
- **Database/audit/reconciliation evidence:** seeded Postgres (`medvex` tenant, 6 providers, 249 members); a persisted claim has billed 3500 = Σ lines, 1 PENDING run, SUCCEEDED linked receipt; concurrent invoice ⇒ 1 claim by DB unique.
- **Creator allowlist change:** **ADDED** `src/server/services/claim-intake/persist.ts` (the canonical owner). This is the entry that remains after F5.10; every F5 rail migration removes another legacy entry.
- **Known gaps or skips:** case entry-freezing and ReimbursementRequest creation are the caller adapters' concern (F5.6/5.8/5.9) — persist accepts typed origin links (PA connect + ATTACHED implemented; case/reimbursement claim-level fields set). Notification/audit exact-once is F3.7.
- **Security/privacy review:** all scope comes from the derived context (F3.1); no body-trusted fields; fingerprints hashed.
- **Next eligible task:** F3.4 — Implement the one public `ClaimIntakeService.submit`.
- **Blocker/options, if blocked:** n/a.

---

## F3.4 — Implement the one public `ClaimIntakeService.submit`

- **Status:** COMPLETE (incl. real-DB matrix)
- **Commit/branch:** `feat/claims-autopilot` (F3.4 commit)
- **Files changed:** `src/server/services/claim-intake/intake.service.ts` (new), `tests/services/claim-intake-service.test.ts` (new), `tests/integration/claim-intake-service.integration.test.ts` (new), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** D8/D9 (DB authoritative; acceptance synchronous, enqueue is an optimization); §4.5 (chained audit, not plain writeAudit); D6 (structural throw vs business route — business routing runs later in the runner).
- **Acceptance scenarios covered:** CA-001/CA-020/CA-021/CA-024 (accept/replay), CA-022 (conflict), CA-100 (Redis unavailable ⇒ still accepted, DB authoritative), CA-107 (response-loss ⇒ getReceipt returns durable state).
- **Observable behavior before:** each rail hand-orchestrated intake; no single acceptance boundary; audit was plain `writeAudit`.
- **Observable behavior after:** `ClaimIntakeService.submit(caller, raw)` = parse→normalize→context→fingerprint→reserve→persist→enqueue(best-effort)→chained audit, returning a stable `SubmitResult` (ACCEPTED/REPLAYED/LINKED/PROCESSING) or throwing a safe `IntakeError` (422/401/403/409); `submitWithinTransaction` for case/preauth adapters; `getReceipt` (tenant-scoped); `setProcessingEnqueuer` hook (F3.6 wires BullMQ).
- **Forbidden effects explicitly checked:** structural failure throws VALIDATION before any DB write (no receipt); conflict throws 409 with the original untouched (billed still 3500); a THROWING enqueuer still yields ACCEPTED with the run left PENDING for the sweeper (proven); getReceipt returns null for a foreign tenant; audit is `CLAIM:INTAKE_ACCEPTED` via audit-chain (proven with a real user), never plain writeAudit.
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-intake-service.test.ts` → **3 passed** (structural reject + enqueuer hooks).
  - **Real DB:** `npx vitest run tests/integration/claim-intake-service.integration.test.ts` → **5 passed** (accepted+audit+enqueue; replayed; conflict; Redis-resilience; getReceipt).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** seeded Postgres; ACCEPTED submit created claim (3500), 1 PENDING run, SUCCEEDED receipt, INTAKE_ACCEPTED audit; replay created no 2nd claim.
- **Creator allowlist change:** none (submit delegates to persist.ts — the allowlisted owner).
- **Known gaps or skips:** the live admin/provider rails still call the legacy `runClaimIntake` — the compat switch is F5.1 (needs the runner from F4.2 so accepted claims actually adjudicate). enqueuer is a no-op until F3.6.
- **Security/privacy review:** all scope via derived context; SubmitResult carries no PHI; audit payload is safe totals/refs.
- **Next eligible task:** F3.5 — Implement processing-run lease and stage repository.
- **Blocker/options, if blocked:** n/a.

---

## F3.5 — Implement processing-run lease and stage repository

- **Status:** COMPLETE (incl. real-DB lease-race proof + a real timezone bug fixed)
- **Commit/branch:** `feat/claims-autopilot` (F3.5 commit)
- **Files changed:** `src/server/services/claim-intake/processing.ts` (new), `tests/integration/claim-intake-processing.integration.test.ts` (new), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** D8 (DB-authoritative run state); §6.4/§11.2 lease + retry rules; §9.3 sequence/supersession.
- **Acceptance scenarios covered:** CA-051 (two workers ⇒ one), CA-101/CA-104 (lease reclaim, two sweepers safe), CA-048/CA-049 (retryable reuse), CA-028/CA-059 (reprocess sequence), CA-103 (poison/terminal immutable).
- **Observable behavior before:** no durable lease/stage repository; automation had no worker-safe claiming.
- **Observable behavior after:** `claimNextRun`/`claimRunById` (atomic `FOR UPDATE SKIP LOCKED`), `extendLease`, `recordStage` (upsert on `(runId, stage)`), conditional terminal transitions `markRun{Routed,ShadowComplete,AutoDecided,Retryable,Failed}` (owner+RUNNING only), `createReprocessRun` (next sequence + supersession, single non-terminal run under concurrency), `safeErrorMessage`.
- **Forbidden effects explicitly checked:** two workers racing one run ⇒ exactly one wins (real DB); non-owner transition writes nothing; terminal run immutable to a later transition; concurrent reprocess ⇒ one non-terminal run; stage upsert keeps one row.
- **Real bug found + fixed:** the two-worker race initially DOUBLE-claimed because the DB session TZ is EAT (UTC+3) and raw SQL compared Prisma's UTC `timestamp` leases against `now()` (timestamptz), mis-reading a future lease as ~3h expired. Fixed by comparing/computing against `now() AT TIME ZONE 'UTC'`. This would have caused production lease double-processing — caught only by the real-DB test.
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-intake-processing.integration.test.ts` → **9 passed** (after the TZ fix; failed 1/9 before).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; SKIP LOCKED verified via a direct reproduction (A claims, B null, attemptCount 1).
- **Creator allowlist change:** none.
- **Known gaps or skips:** the worker/sweeper that DRIVES these (job + recurring recovery) is F3.6; the stage vocabulary is executed by the evaluator in F4.2.
- **Security/privacy review:** stored errors sanitized (`safeErrorMessage`, no stack); no PHI in run/stage.
- **Next eligible task:** F3.6 — Add processing job and recovery sweeper.
- **Blocker/options, if blocked:** n/a.

---

## F3.6 — Add processing job and recovery sweeper

- **Status:** COMPLETE (incl. real-DB recovery + Redis dedup proofs)
- **Commit/branch:** `feat/claims-autopilot` (F3.6 commit)
- **Files changed:** `src/lib/queue.ts` (+`claims` queue, `enqueueClaimAutopilotRun`, `scheduleClaimAutopilotRecovery`), `src/server/jobs/claim-autopilot.job.ts` (new), `src/server/jobs/worker.ts` (register claims worker + schedule recovery + graceful close), `tests/services/claim-autopilot-job.test.ts` (new), `tests/integration/claim-autopilot-recovery.integration.test.ts` (new), `tests/integration/claim-autopilot-queue.integration.test.ts` (new), `docs/claims-autopilot/{VERIFICATION,DEPLOYMENT}.md`.
- **Decisions enforced:** D8 (DB-authoritative; sweep recovers regardless of Redis); §11.2/§11.3 (lease, bounded retry, recovery sweep); §11.2 (exhausted ⇒ FAILED + alert-visible).
- **Acceptance scenarios covered:** CA-025 (dispatch fails ⇒ sweeper recovers), CA-100 (Redis unavailable ⇒ recoverable), CA-101/CA-104 (worker crash / two sweepers), CA-103 (poison claim exhausts ⇒ FAILED visible).
- **Observable behavior before:** accepted runs stayed PENDING with nothing to drive them (F3.4 enqueuer was a no-op).
- **Observable behavior after:** `claim-autopilot-run` job (keyed `car-<runId>`, dedup) + `claim-autopilot-recovery` recurring sweep (60s) claim and process runs; `processClaimRun` applies ROUTE/SHADOW/AUTO outcomes + mirrors to `Claim.processingState`/`processingRouteCode`/`assignedQueue`, retries below the cap, FAILS visibly at the cap; pluggable `setClaimProcessor` (fail-closed default routes to manual until F4.2).
- **Forbidden effects explicitly checked:** enqueue-never-happened ⇒ recovery sweep still processes (proven); crashed worker's stale lease reclaimed by the sweep (proven); processor error sanitized + retried, then FAILED at the cap with `assignedQueue=AUTOPILOT_FAILURE` (proven); duplicate enqueue ⇒ one job (Redis proven).
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-autopilot-job.test.ts` → **2 passed**.
  - **Real DB:** recovery suite → **4 passed** (route+mirror; retry→FAILED; sweep-recovers-unenqueued; sweep-reclaims-stale).
  - **Redis+DB:** queue suite → **2 passed** (enqueue dedup; handler processes).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres + throwaway Redis (`:56379`).
- **Creator allowlist change:** none.
- **Known gaps or skips:** web-side `setProcessingEnqueuer` wiring is F5.1 (the sweep covers latency meanwhile); intake/decision AUDIT for routed/failed runs is F3.7; the real stage evaluator (replacing the fail-closed default processor) is F4.2. BullMQ job ids may not contain `:` — used `car-<runId>`.
- **Security/privacy review:** stored run/stage errors sanitized; no PHI in job payloads (runId/tenantId only).
- **Next eligible task:** F3.7 — Make receipt, processing, notification and audit effects reconcilable.
- **Blocker/options, if blocked:** n/a.

---

## F3.7 — Make receipt, processing, notification and audit effects reconcilable

- **Status:** COMPLETE — **completes M3**
- **Commit/branch:** `feat/claims-autopilot` (F3.7 commit)
- **Files changed:** `src/server/jobs/claim-autopilot.job.ts` (+exact-once terminal audit + notification), `src/server/services/claim-intake/reconciliation.ts` (new — timeline + reconciliation queries), `tests/integration/claim-autopilot-reconcile.integration.test.ts` (new), plus test-isolation fixes to the F3.5/F3.6 integration files (disjoint `claimNumber` windows), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** §4.5 (audit-chain, not plain writeAudit — the canonical path already uses chained audit), §11.4 (exact-once notification/audit), §11.6 (chain-linked autopilot events), §11.7 (reconciliation invariants as queries).
- **Acceptance scenarios covered:** CA-060/CA-061 (notification/terminal-projection idempotent), CA-091 (audit present for privileged actions), CA-109/CA-126 (reconciliation of impossible states, safe correlation).
- **Observable behavior before:** terminal processing had no audit event and no member notification; no timeline/reconciliation queries.
- **Observable behavior after:** `processClaimRun` appends a chain-linked terminal audit (`CLAIM:AUTOPILOT_ROUTED` / `AUTOPILOT_SHADOW_PROPOSED` / `AUTO_APPROVED` / `AUTOPILOT_RETRY_EXHAUSTED`) + a member notification **exactly once** (gated on the terminal transition actually applying), using the existing `getSystemActorId` (worker-safe) and `MemberNotificationService`; `reconciliation.ts` provides `getClaimProcessingTimeline` and `find{AcceptedReceiptsWithoutClaim,ClaimsWithoutRun,StuckRuns,TerminalRunsWithoutAudit}`.
- **Forbidden effects explicitly checked:** terminal audit fires once even when `processClaimRun` is called twice (delta proven); audit/notification are best-effort (`.catch`) so a missing actor never breaks processing (fail-safe); processing runs in worker context (no request-scope headers) — proven; reconciliation flags a terminal run WITHOUT audit but not one WITH.
- **Tests run and exact results:**
  - **Real DB:** reconcile suite → **6 passed**.
  - **M3 boundary:** `npm run typecheck` PASS; `npx vitest run` (no env) → **1140 passed / 47 skipped**; `brand:guard` + `currency:guard` PASS; eslint clean. **All integration suites together** (`--no-file-parallelism`, DB+Redis) → **38 passed / 9 skipped**.
- **Database/audit/reconciliation evidence:** real Postgres; exact-once terminal audit + timeline + reconciliation queries verified.
- **Creator allowlist change:** none.
- **Known gaps or skips:** intake AUDIT on structural-reject/conflict is emitted at the transport by F1.4/F3.4 mapping; the full §11.7 report (assembling these queries with pass/fail gates) is F7.2. Integration suites must run sequentially (global sweep) — documented.
- **Security/privacy review:** audit/notification carry only safe refs (runId/claimId/routeCode); member notification uses the audience-safe reason text; timeline selects no PHI. **M3 COMPLETE.**
- **Next eligible task:** F4.1 — Remove implicit no-policy auto-approval (M4) — the D1 safety fix.
- **Blocker/options, if blocked:** n/a.

---

## F4.1 — Remove implicit no-policy auto-approval (D1 safety fix)

- **Status:** COMPLETE — **first package to change live production behavior**
- **Commit/branch:** `feat/claims-autopilot` (F4.1 commit)
- **Files changed:** `src/server/services/auto-adjudication.service.ts` (removed `DEFAULT` fallback; require approved LIVE via `effectivePolicyMode`), `src/app/(admin)/settings/auto-adjudication/page.tsx` (copy), `tests/services/auto-adjudication.service.test.ts` (rewritten to the LIVE-policy model + D1 matrix), `tests/services/auto-adjudication-characterization.test.ts` (D1 unsafe tests removed — remediated; D11 pinned for F4.5).
- **Decisions enforced:** **D1** (no implicit live automation — no policy is never permission to move money); D2 (only mode=LIVE executes).
- **Acceptance scenarios covered:** CA-032 (no/OFF/draft/pending/rejected/shadow ⇒ route regardless of value — proven for all cases).
- **Observable behavior before:** with no configured policy, `AutoAdjudicationService` auto-approved clean claims at any value (the `DEFAULT = { enabled:true, maxAutoApproveAmount:null }` fallback — the D1 violation characterized in F0.4 #1/#2).
- **Observable behavior after:** a claim auto-decides ONLY under a policy whose `effectivePolicyMode` is LIVE (approved + finite positive ceiling + all required gates + explicit inclusions). No policy ⇒ `AUTO_POLICY_NOT_LIVE`; an OFF/SHADOW/draft/pending/rejected/unapproved-LIVE policy ⇒ `AUTO_POLICY_OFF`. No production bypass.
- **⚠️ Live impact:** the existing rails (runClaimIntake→processIntake, sync, /api/v1/claims) call this service. Since all production policies are backfilled OFF/DRAFT (F2.4), **auto-approval now stops platform-wide until a governed LIVE policy is created + approved** (F2.5) — exactly the plan's fail-closed "deploy OFF" posture (§14.1). Clean claims route to manual meanwhile.
- **Forbidden effects explicitly checked:** no env bypass added (F4.1 "Do not"); the full D1 matrix routes (no policy, OFF, DRAFT, PENDING_APPROVAL, REJECTED, approved SHADOW, LIVE-without-ceiling, LIVE-with-a-gate-off, LIVE-without-inclusions — all ROUTE); only a fully-valid approved LIVE policy AUTO_APPROVEs.
- **Tests run and exact results:**
  - `npx vitest run tests/services/auto-adjudication.service.test.ts tests/services/auto-adjudication-characterization.test.ts` → **30 passed**.
  - Full suite `npx vitest run` → **1147 passed / 47 skipped**; no other suite depended on the old fallback. `npm run typecheck` PASS; eslint clean.
- **Database/audit/reconciliation evidence:** logic-level (mocked). The route reason flows through `processIntake`'s existing ROUTE handling (adjudicationLog "ROUTED — AUTO_POLICY_NOT_LIVE"); full audit/metric for the code is F4.2/F4.7.
- **Creator allowlist change:** none.
- **Known gaps or skips:** SHADOW proposals are just routed here (no proposal stored) — F4.6 adds shadow recording; the settings copy change is a static admin-page string (not browser-verified — trivial, no logic).
- **Security/privacy review:** the core D1 money-safety control; fail-closed.
- **Next eligible task:** F4.2 — Decompose automation evaluation into named read-only stages.
- **Blocker/options, if blocked:** n/a.

---

## F4.2 — Decompose automation evaluation into named read-only stages

- **Status:** COMPLETE (incl. real-DB proof)
- **Commit/branch:** `feat/claims-autopilot` (F4.2 commit)
- **Files changed:** `src/server/services/claim-autopilot/evaluate.ts` (new), `tests/integration/claim-autopilot-evaluate.integration.test.ts` (new).
- **Decisions enforced:** §6.5 (14-stage vocabulary; read-only trace, not a second engine), D1 (OFF/no-live routes without evaluating), D5 (uncoded line routes).
- **Acceptance scenarios covered:** CA-032 (OFF routes), CA-048/CA-049 (stage pass/route/skip), foundation for CA-030/037 (plan build, F4.4).
- **Observable behavior before:** evaluation was a monolithic `evaluateClaim` with no per-stage trace.
- **Observable behavior after:** `evaluateClaimStaged(db, tenantId, claimId, runId?)` runs the ordered stages (CONTEXT→POLICY), each a thin adapter over an existing owner (coverage, hard-gates, contract engine, PA, benefit, fraud, FX/ceiling), recording each via `recordStage`, stopping at the first route and marking later stages SKIPPED; returns `{ disposition: APPROVE|WOULD_APPROVE|ROUTE, mode, routeCode, lines, approveAmount }`.
- **Forbidden effects explicitly checked:** read-only w.r.t. claim/line money+status (proven: status/billed/approved unchanged, line `adjudicationDecision` null, `approvedAmount` 0 after evaluation); stops at first route with all later stages SKIPPED (proven, robust to which stage routes); OFF ⇒ POLICY routed + all others SKIPPED without running them; fraud screening is idempotent (`.catch`) and recorded as a stage effect.
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-autopilot-evaluate.integration.test.ts` → **3 passed** (OFF routing, stop-at-route+skip, read-only) against seeded contracts/benefits.
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; stage rows recorded in order; claim unchanged.
- **Creator allowlist change:** none.
- **Known gaps or skips:** DOCUMENTS + COST_SHARE stages are PASS-through placeholders — DOCUMENTS is completed in F4.3, COST_SHARE preview in F4.4. The evaluator is additive (wired into the processor via F4.4/F4.5; the old monolithic `evaluateClaim` still serves the legacy rails until F5.1).
- **Security/privacy review:** stage results store safe totals/counts only; no PHI.
- **Next eligible task:** F4.3 — Complete coding, document and duplicate route fidelity.
- **Blocker/options, if blocked:** n/a.

---

## F4.3 — Complete coding, document and duplicate route fidelity

- **Status:** COMPLETE (incl. real-DB proof)
- **Commit/branch:** `feat/claims-autopilot` (F4.3 commit)
- **Files changed:** `src/server/services/claim-autopilot/evaluate.ts` (DOCUMENTS stage + fuzzy DUPLICATE + clearing + claim-load additions), `tests/integration/claim-autopilot-fidelity.integration.test.ts` (new); test-hygiene: `claim-autopilot-evaluate.integration.test.ts` (pre-clean + dependent cleanup).
- **Decisions enforced:** D5 (uncoded routes), D7 (fuzzy candidate never auto-linked; strong-fp exact events resolved at intake), §11.5 (no arbitrary URL fetch — metadata only).
- **Acceptance scenarios covered:** CA-036/CA-038 (mixed coded/uncoded ⇒ CODING route), CA-039 (missing doc ⇒ DOCUMENTS_INCOMPLETE), CA-027 (fuzzy second visit routes with safe refs, never auto-linked), CA-028 (cleared duplicate reprocess proceeds).
- **Observable behavior before:** DOCUMENTS was a pass-through; no fuzzy duplicate detection or clearing in the staged evaluator.
- **Observable behavior after:** DOCUMENTS routes DOCUMENTS_INCOMPLETE when a mandatory, effective `DocumentationRule` for the provider's active contract has no matching claim document (reads document category metadata only — never fetches `fileUrl`); DUPLICATE routes DUPLICATE_REVIEW for a plausible repeat (same provider+member+benefit within ±3 days, no authoritative id) with safe candidate claim numbers, skippable via `duplicateCleared` (reprocess trigger DUPLICATE_CLEARED).
- **Forbidden effects explicitly checked:** exact strong-fp events never reach DUPLICATE (linked at intake — the fuzzy query excludes `strongEventFingerprint != null`); candidates are claim NUMBERS only (no PII — proven); no URL fetch (document category metadata only); cleared ⇒ DUPLICATE passes (proven).
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-autopilot-fidelity.integration.test.ts` → **3 passed** (mixed coded/uncoded → CODING; missing doc → DOCUMENTS + supply clears it; fuzzy second visit → DUPLICATE with candidate ref + cleared passes). Run with F4.2 sequentially → 6 passed.
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres. Test-hygiene: added policy/fraud/adjudication-dependent cleanup + defensive pre-clean; fuzzy test uses run-unique future dates so leftover claims can't pollute its window.
- **Creator allowlist change:** none.
- **Known gaps or skips:** contract documentation is ALSO enforced within the CONTRACT engine (pricing); the DOCUMENTS stage surfaces it as a distinct earlier route without duplicating the engine. Service-category mapping fidelity remains the CONTRACT engine's job (CODING catches missing codes).
- **Security/privacy review:** candidate refs are claim numbers; no PHI; no SSRF (no external fetch).
- **Next eligible task:** F4.4 — Build complete serializable `AutoDecisionPlan`.
- **Blocker/options, if blocked:** n/a.

---

## F4.4 — Build complete serializable `AutoDecisionPlan`

- **Status:** COMPLETE (unit + real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F4.4 commit)
- **Files changed:** `src/server/services/claim-autopilot/plan.ts` (new), `src/server/services/claim-autopilot/evaluate.ts` (per-line billed+decision+FFS pro-rata), `tests/services/claim-autopilot-plan.test.ts` (new), `tests/integration/claim-autopilot-plan.integration.test.ts` (new).
- **Decisions enforced:** §10.1 plan contract; §11.7 money conservation; no-float money; audience-safe route reasons (§10.3).
- **Acceptance scenarios covered:** CA-030/CA-037 (approve/adjustment plan), CA-036 (routed plan), CA-121 (plain-language reasons/remedy).
- **Observable behavior before:** evaluation produced a disposition but no immutable, serializable, money-conserving plan.
- **Observable behavior after:** `buildAutoDecisionPlan(db, tenantId, claimId, runId?)` assembles the §10.1 `AutoDecisionPlan` from the staged evaluation — disposition (ROUTE/APPROVE/PARTIAL/WOULD_APPROVE/WOULD_PARTIAL), per-line money (billed/contracted/payable/shortfall/disallowed/member/payer/writeoff), catalog reasons (internal/provider/member/remedy), and snapshots (claim updatedAt, contract versions, eligibility as-of); `validatePlanConservation` asserts the money invariants.
- **Forbidden effects explicitly checked:** money is decimal strings (`^\d+\.\d{2}$`, JSON round-trip proven); per-line `billed = payer + member + writeoff + disallowed` for decided plans; `totalBilled = Σ billed`, `totalPayable = Σ payer`; a ROUTE plan pays 0; every pended/adjusted/declined line carries a reason (validator flags violations).
- **Tests run and exact results:**
  - `npx vitest run tests/services/claim-autopilot-plan.test.ts` → **6 passed** (conservation: clean/adjustment/broken/total-mismatch/routed; serialization).
  - **Real DB:** `npx vitest run tests/integration/claim-autopilot-plan.integration.test.ts` → **2 passed** (routed plan: ROUTE + catalog reasons + 0 payable + conserves; any plan conserves + serializes).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; plan built from a persisted claim.
- **Creator allowlist change:** none.
- **Known gaps or skips:** member cost-share (copay/deductible) is set to 0 in the plan and applied by `ClaimDecisionService` at execution (F4.5) — the plan carries the CONTRACT-priced split; COST_SHARE stage deepening is optional. `policyVersion` null until the policy console (F6.5) stamps versions.
- **Security/privacy review:** plan stores safe totals + catalog wording; the safe projection avoids PHI duplication (line codes/ids only).
- **Next eligible task:** F4.5 — Execute automatic line and claim decision atomically (the money-spine [L]).
- **Blocker/options, if blocked:** n/a.

---

## F4.5 — Execute automatic line and claim decision atomically

- **Status:** COMPLETE — **STOP CONDITION MET (real-DB transaction/concurrency proof passes)**
- **Commit/branch:** `feat/claims-autopilot` (F4.5 commit)
- **Files changed:** `src/server/services/claim-decision.service.ts` (`StalePlanError`, `lineDecisions`/`expectedRevision` on the input, in-tx stale/fraud gates + atomic line stamping, `executeAutoPlan`), `src/server/services/auto-adjudication.service.ts` (removed the pre-decision line loop — F4.5f), `src/server/services/claim-autopilot/processor.ts` (new — the real evaluate→plan→execute processor), `src/server/jobs/worker.ts` (register the real processor), `tests/services/auto-adjudication-characterization.test.ts` (D11 remediated — unsafe tests removed), `tests/integration/claim-autopilot-execute.integration.test.ts` (new), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** **D10** (one money decision stack — auto executes through the same `decide`), **D11** (line stamping + decision + benefit/PA/GL/fund commit atomically), D17 (stale plan cannot commit), CA-044 (commit-time fraud gate).
- **Acceptance scenarios covered:** CA-050 (rollback), CA-051 (two concurrent ⇒ one), CA-052 (stale revision), CA-054 (benefit re-check at commit), CA-044 (fraud before commit), CA-058 (benefit consumed once), CA-061 (idempotent post-commit recovery).
- **Observable behavior before:** `processIntake` stamped per-line `adjudicationDecision`/`approvedAmount` OUTSIDE the decision tx (the D11 violation characterized in F0.4 #3/#4) — a mid-loop failure left partial line state.
- **Observable behavior after:** `ClaimDecisionService.decide` stamps line decisions INSIDE its existing `inSerializableTx` and re-checks revision/status + open fraud at commit; `executeAutoPlan(tenantId, claimId, plan, systemActorId)` maps an APPROVE/PARTIAL plan into that atomic transaction and returns `{ executed | stale }`; `processIntake` passes `lineDecisions` instead of the removed loop; the F3.6 processor is replaced by the real `evaluate→plan→execute` path (worker-registered), with idempotent post-commit reconciliation.
- **Forbidden effects explicitly checked (real DB):** money-tx failure ⇒ claim stays RECEIVED, line `adjudicationDecision` null (NO partial write); stale revision ⇒ no writes; open fraud alert ⇒ blocked, no writes; two concurrent executes ⇒ exactly one, benefit consumed once (300 not 600); executed claim: line stamped APPROVED, benefit decreased by exactly the approved amount.
- **Tests run and exact results:**
  - **Real DB (STOP CONDITION):** `npx vitest run tests/integration/claim-autopilot-execute.integration.test.ts` → **5 passed** (atomic execute + benefit-once; rollback; stale; fraud-at-commit; concurrent→one).
  - `npx vitest run tests/services/auto-adjudication.service.test.ts tests/services/auto-adjudication-characterization.test.ts` → **29 passed** (D11 remediation asserted: processIntake passes lineDecisions, no direct line writes).
  - Full suite `npx vitest run` → **1152 passed / 60 skipped**; no regression from the money-spine change. `npm run typecheck` PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; benefit conservation proven (consumed exactly once under concurrency); GL/fund effects run inside the same atomic `decide` tx (existing, unchanged) so approval either fully posts or rolls back.
- **Creator allowlist change:** none.
- **Known gaps or skips:** the SHADOW branch of the processor returns SHADOW_COMPLETE without storing the proposal projection yet — F4.6 adds the shadow store; the circuit-breaker commit gate is F4.7. The canonical processor is worker-registered but the live rails still create legacy claims (not canonical runs) until F5.1.
- **Security/privacy review:** all money flows through the single audited `decide` transaction; the auto path uses `systemDecision` + the F4.1 policy gates as its authorization; commit-time fraud re-check closes the eval→commit window.
- **Next eligible task:** F4.6 — Implement shadow mode.
- **Blocker/options, if blocked:** n/a.

---

## F4.6 — Implement shadow mode

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F4.6 commit)
- **Files changed:** `src/server/services/claim-autopilot/shadow.ts` (new), `src/server/services/claim-autopilot/processor.ts` (SHADOW branch stores proposal + routes to human), `tests/integration/claim-autopilot-shadow.integration.test.ts` (new).
- **Decisions enforced:** D2 (SHADOW proposes but moves no money); §14.2 (shadow accuracy evidence for the LIVE exit gate).
- **Acceptance scenarios covered:** CA-031 (shadow proposal + zero money mutation), CA-122/CA-127 (proposal visible to staff, agreement metrics).
- **Observable behavior before:** SHADOW mode just returned SHADOW_COMPLETE with no stored proposal or comparison.
- **Observable behavior after:** the processor's SHADOW branch stores the proposal on the run's DECISION stage (safe totals only) and routes the claim to `MANUAL_ADJUDICATION` for a human; `compareShadowToOutcome` computes disposition/amount agreement once the claim is humanly decided; `shadowAgreementMetrics` aggregates the agreement rate.
- **Forbidden effects explicitly checked:** SHADOW processing leaves the claim RECEIVED, approvedAmount 0, lines unstamped (proven — zero automatic money writes); comparison returns null while undecided; agreement true only when disposition AND amount match; amount overturn and disposition overturn both flagged.
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-autopilot-shadow.integration.test.ts` → **2 passed** (no-money under SHADOW; store + agreement/amount-overturn/disposition-overturn comparison).
  - `npm run typecheck` → PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; proposal stored as a DECISION stage result.
- **Creator allowlist change:** none.
- **Known gaps or skips:** capturing the human outcome is passive (read at comparison time); the ops dashboard surfaces the metrics in F6.5.
- **Security/privacy review:** proposal stores safe totals/disposition only (no PHI).
- **Next eligible task:** F4.7 — Add circuit breaker and live policy enforcement (completes M4).
- **Blocker/options, if blocked:** n/a.

---

## F4.7 — Circuit breaker + live policy enforcement (completes M4)

- **Status:** COMPLETE (real-DB) — **M4 CLOSED**
- **Commit/branch:** `feat/claims-autopilot` (F4.7 commit)
- **Files changed:** `prisma/schema.prisma` (new `ClaimAutopilotBreaker` model + `Tenant.autopilotBreakers` relation), `src/server/services/claim-autopilot/circuit-breaker.ts` (new — `isBreakerOpen`/`openBreaker`/`closeBreaker`/`tripBreaker`/`getBreakerState`), `src/server/services/claim-decision.service.ts` (`breakerCheck?` on the input + a commit-time gate inside `decide`'s tx; `executeAutoPlan` pre-checks the breaker and passes the commit-time check), `src/server/services/claim-autopilot/processor.ts` (breaker-blocked LIVE claims downgrade to a shadow proposal + route to a human), `tests/integration/claim-autopilot-breaker.integration.test.ts` (new), `docs/claims-autopilot/VERIFICATION.md`.
- **Decisions enforced:** **D18** (a circuit breaker can stop LIVE automatic decisions per tenant/client immediately, without deleting policy history; intake/receipts/evaluation/shadow/routing continue while open — only live money execution is blocked). **D1** reinforced (no live money when the breaker is open). §13.3 (manual + auto trip, both audited).
- **Acceptance scenarios covered:** breaker race with a decision (commit-time gate); client-specific breaker scoping; maker/checker (manual) activation; deactivation is immediate; no-live-bypass (an open breaker never lets money move).
- **Observable behavior before:** F4.5's `executeAutoPlan` always executed an APPROVE/PARTIAL plan; there was no operational kill-switch — stopping live automation meant deactivating each policy.
- **Observable behavior after:** `isBreakerOpen(db, tenantId, clientId?)` is true when a tenant-wide OR the client's breaker is open; `executeAutoPlan` pre-checks it (returns `{ executed:false, breakerOpen:true }`, moves no money) AND passes a `breakerCheck` closure that `decide` re-runs INSIDE its commit tx (a breaker opened during the eval→commit window throws `StalePlanError` before any write); the processor downgrades a breaker-blocked LIVE claim to a stored shadow proposal routed to `MANUAL_ADJUDICATION`; manual open/close (reason required to close) and auto-trips are hash-chain audited (`AUTO_ADJ:CIRCUIT_BREAKER_OPENED`/`CLOSED`).
- **Forbidden effects explicitly checked (real DB):** open breaker ⇒ `executeAutoPlan` moves no money, claim stays RECEIVED; commit-time `breakerCheck` true ⇒ `decide` throws `StalePlanError`, claim stays RECEIVED (no line/claim/money write); a client-scoped breaker does not block a different client or the tenant-wide path; closing the breaker immediately resumes live execution (same claim then APPROVED).
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-autopilot-breaker.integration.test.ts` → **5 passed** (manual open/close + audit + reason-required; client-scope isolation; open blocks live execution / close resumes; commit-time gate; auto-trip marked `autoTriggered`).
  - **M4 boundary:** full suite `npx vitest run` → **1152 passed / 67 skipped**; all autopilot integration together `npx vitest run tests/integration/ --no-file-parallelism` → **58 passed / 9 skipped** (the 9 = 2 pre-existing non-autopilot P1_TEST_DB suites). `npm run typecheck` PASS; `npm run brand:guard` + `npm run currency:guard` PASS; eslint clean.
- **Database/audit/reconciliation evidence:** real Postgres; breaker state persisted in `ClaimAutopilotBreaker` (`@@unique([tenantId, clientId])`); open/close/trip emit hash-chained audit rows; no money moves while open.
- **Creator allowlist change:** none.
- **Known gaps or skips:** the breaker's operator UI (a settings toggle) and the auto-trip wiring from F7.2 invariant alerts land in M6/M7 — the service + audit + enforcement are complete and covered here; `tripBreaker` is the ready hook.
- **Security/privacy review:** breaker mutations are RBAC-gated at the action layer (service takes an explicit `actorId`); close requires a reason; the enforcement is fail-safe (open ⇒ no money) and the commit-time re-check closes the eval→commit race.
- **Next eligible task:** **M4 COMPLETE.** M5 — F5.1 (route the live claim-creation rails through the canonical intake). Awaiting go-ahead (bounded request ended at F4.7).
- **Blocker/options, if blocked:** n/a.

---

## F5.1 — Admin & provider direct-entry adapters (M5 begins)

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F5.1 commit)
- **Files changed:** `src/server/services/claim-intake.ts` (`runClaimIntake` rewritten as the canonical direct-entry adapter — no direct `Claim.create`), `src/server/services/claim-intake/context.ts` (future-service-date structural guard; `scopeMembersByEntitlement` decoupled from `providerDerived`), `src/app/(admin)/claims/new/actions.ts` + `ClaimForm.tsx` (operator caller + draft UUID + receipt redirect; corrected PA copy), `src/app/provider/claims/new/actions.ts` + `ProviderClaimForm.tsx` (providerUser caller + draft UUID), `tests/services/claim-creator-consolidation.test.ts` (allowlist shrunk — `claim-intake.ts` removed), `tests/services/claim-intake-context.test.ts` (entitlement-decoupling assertion), `tests/integration/claim-intake-direct-entry.integration.test.ts` (new), retired `tests/services/claim-intake-validation.test.ts` + `tests/services/claim-intake-enrollment-gate.test.ts` (old direct-intake throw tests; their guarantees now live in the schema + `coverage.service`/`stageEligibility`, per §16 F1.x note). `docs/claims-autopilot/{CLAIM_CREATOR_INVENTORY,VERIFICATION}.md`.
- **Decisions enforced:** **D6** (structural rejection vs adjudication routing — eligibility/benefit/PA now accepted-and-routed, not thrown; only impossible/out-of-scope requests reject at the door), **D12** (provider derived from the session; a body provider that differs is rejected), D8/D9 (durable receipt + run; acceptance synchronous, adjudication runs inline when possible with the sweep as backstop), §8.3 (idempotency-key replay).
- **Acceptance scenarios covered:** admin/provider normalize identically (distinct channels); double-click / back-refresh replay one claim; provider spoof; route parity (business gate → accept+route, structural → reject); inline processing (not stuck PENDING).
- **Observable behavior before:** `runClaimIntake` created the claim directly (its own `Claim.create` + `createWithDocumentNumber`), ran the business gates as THROWS (coverage/benefit/PA rejected the submission with no record), had NO transport idempotency (a double-submit duplicated), used plain `writeAudit`, and ran fraud + `processIntake` as separate post-create awaits.
- **Observable behavior after:** both the admin wizard (operator selects a provider) and the provider portal (facility derived from session) build a `ClaimSubmissionV1` + `CallerIdentity` and call `ClaimIntakeService.submit` — one schema, one scope boundary, one canonical persist owner (`persist.ts`), a durable `ClaimIntakeReceipt` + `ClaimProcessingRun`, chain-linked `CLAIM:INTAKE_ACCEPTED` audit. A structurally-valid submission that fails eligibility/benefit/PA is now RECORDED and ROUTED (proof of receipt, D6); only impossible/out-of-scope requests (future service date, non-operational or foreign provider, inaccessible member, malformed money/lines) reject at the door with a friendly message. The form's draft UUID is the idempotency key, so a double-click or back/refresh REPLAYS the same receipt. The accepted claim is processed in-request (real evaluate→plan→execute) when possible; the recovery sweep is the authoritative backstop.
- **Forbidden effects explicitly checked (real DB):** provider spoof (providerUser A naming provider B) ⇒ rejected, no claim; future service date ⇒ rejected at the door; double-submit (same key + content) ⇒ exactly one receipt + one claim (replay); a business-gate claim (inpatient, no PA) ⇒ ACCEPTED (claim exists) but NOT APPROVED/PARTIALLY_APPROVED and `approvedAmount` 0 (no money moved) — routed, not thrown.
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-intake-direct-entry.integration.test.ts` → **6 passed**.
  - Full suite `npx vitest run` → **1139 passed / 73 skipped** (−13 = the two retired throw tests, whose cases are covered by `claim-intake-schema.test.ts` #103–115 + `coverage.service.test.ts`). All integration together (`tests/integration/ --no-file-parallelism`) → **64 passed / 9 skipped**. `npm run typecheck` PASS; `brand:guard` + `currency:guard` PASS; the consolidation guard passes with `claim-intake.ts` removed from the allowlist; eslint clean.
- **Database/audit/reconciliation evidence:** receipts recorded with the true channel (ADMIN_PORTAL vs PROVIDER_PORTAL, both source MANUAL); accepted claims reach a terminal `processingState` in-request; no money moves on a routed claim.
- **Creator allowlist change:** **`src/server/services/claim-intake.ts` REMOVED** from the allowlist + inventory (creator #1 migrated) — the consolidation guard now enforces that it never regains a `Claim.create`.
- **Landmine found + resolved (empirical):** the canonical context coupled member **entitlement** scoping to provider-derivation. The seed (and any tenant without `ContractApplicability`) has **0** applicability rows, so a `providerUser` path would resolve to `__no_provider_entitlement__` and block EVERY provider claim — a regression from the portal's tenant-wide member lookup. Proven on the disposable DB (0 active contracts/applicability, 6 providers, 247 members). Fixed by decoupling: added `scopeMembersByEntitlement` to the channel meta — the provider PORTAL keeps its D12 spoof guard but resolves members tenant-wide (no regression); the programmatic B2B/offline facility rails keep entitlement scoping (the correct boundary there, and unshipped through canonical intake, so no behavior change). `entitledMemberWhere` and its 4 other callers are untouched.
- **Known gaps or skips:** the web-side BullMQ enqueuer (`setProcessingEnqueuer`) is intentionally left UNSET — the interactive rails process inline (best-effort) + rely on the recovery sweep, so no worker dependency is introduced by F5.1; wiring the queue accelerator is an ops step for when a worker is provisioned. Reimbursement (creator #5, same admin file) still creates directly — migrates in F5.6.
- **Security/privacy review:** all scope is server-derived (tenant/provider/member never trusted from the body); the provider portal cannot file for another facility (D12) nor for a member outside the tenant; non-enumerating member errors preserved; the future-date guard is operating-timezone aware (Africa/Kampala).
- **Next eligible task:** F5.2 — Provider B2B API adapter (`src/app/api/v1/claims/route.ts`).
- **Blocker/options, if blocked:** n/a.

---

## F5.2 — Provider B2B API adapter

- **Status:** COMPLETE (real-DB, real key auth)
- **Commit/branch:** `feat/claims-autopilot` (F5.2 commit)
- **Files changed:** `src/app/api/v1/claims/route.ts` (POST rewritten as a canonical adapter; GET unchanged), `src/app/api/v1/claims/receipts/[receiptId]/route.ts` (new — authoritative receipt status, provider-scoped), `src/server/services/claim-intake/intake.service.ts` (`submit` gains `opts.origin` → strong fingerprint + atomic persist), `src/server/services/claim-intake/context.ts` (audit actor: key/device rails resolve the tenant system actor — `AuditLog.userId` is a required User FK, so keyId-as-actor silently lost EVERY API intake audit; also fixes the offline rail's invalid `"SYSTEM"` literal ahead of F5.5), `src/server/services/claim-intake/persist.ts` (jitter-paced retries, maxAttempts 5→8 — a 20-way burst previously exhausted lockstep retries: 10/20 got 503s; now ~all land), `src/server/services/claim-intake.ts` (`processAcceptedRunInline` exported), `tests/api/claims-{intake-validation,idempotency}.test.ts` (rewritten to the F5.2 contract), `tests/integration/claim-intake-api.integration.test.ts` (new), fixture hardening in `tests/integration/claim-autopilot-{recovery,reconcile}.integration.test.ts` (pools now select only untouched claims — canonical claims always carry a run + terminal audit) and cleanup hygiene in the F5.1/F5.2 integration files (stages→runs→receipts FK order; undecided leftovers flipped VOID — `voidClaim` rightly refuses undecided claims), `tests/services/claim-creator-consolidation.test.ts` (allowlist shrunk; sanity floor now tracks the allowlist size), docs.
- **Decisions enforced:** D6 (business gates accepted-and-routed — the route's coverage/status 403s are gone), **D12** (provider/tenant from the credential; facility key naming another facility ⇒ 403, never re-attributed; unbound operator key refused for writes — BD-06 posture), D8/D9 (durable receipt + inline processing + sweep backstop), §8.5 (**required `Idempotency-Key`**; body externalRef strengthens identity but does not replace the key), §8.6 (201/200-replayed/409-stable-code/422-issues/403-non-enumerating/503; timeout-retry returns authoritative state), §7.6 (source no longer hardcoded `SMART` — facility keys record HMS, operator records SMART, on both claim and receipt).
- **Acceptance scenarios covered:** existing API contract (rewritten tests) + changed-payload key (409), cross-provider key (entitlement + spoof), timeout after commit (same-key replay), 20-way identical and 20-way distinct concurrency, legacy externalRef replay across the migration boundary, PA attach, receipt status scope.
- **Observable behavior before:** the route ran its own Zod (400s), its own eligibility/coverage 403 gates, `count()+1` claim-number loop (TPA-DEF-01 mitigation), hardcoded `source:"SMART"`, optional idempotency (externalRef OR header; 2-minute heuristic dup-block when absent), non-atomic PA attach, fraud+`processIntake` as post-create awaits, and NO intake receipt/audit.
- **Observable behavior after:** the same integrator body shape maps onto `ClaimSubmissionV1`; the canonical schema/context/staged-evaluation own validation and business gates (structural ⇒ 422 with field issues; eligibility ⇒ accepted+routed); persistence is the one atomic owner with receipt + run + chain audit + PA attach (`origin.preauthId`); a required header key + request hash give replay/409 semantics while the legacy `(tenant, provider, externalRef)` replay still returns pre- AND post-migration originals; accepted claims are processed in-request; `GET /api/v1/claims/receipts/{id}` returns authoritative receipt state, facility-scoped (404 for another facility's key).
- **Forbidden effects explicitly checked (real DB, real minted `ProviderApiKey`s):** cross-provider spoof ⇒ 403 + zero claims for the spoofing facility; un-entitled facility ⇒ non-enumerating 403 (entitlement seeded via real ProviderContract+ContractApplicability); changed payload on a used key ⇒ 409, one claim; 20-way identical ⇒ exactly ONE claim; 20-way distinct ⇒ every 201 has exactly one claim, zero duplicate claim numbers, any failure is a clean 503 whose receipt stays PROCESSING with no claim (retryable, never lost); replay never re-processes.
- **Tests run and exact results:**
  - **Real DB:** `npx vitest run tests/integration/claim-intake-api.integration.test.ts` → **8 passed** (accept+channel/source/receipt; same-key replay; 409; legacy replay; cross-provider isolation; atomic PA attach; 20-way identical ⇒ 1; 20-way distinct ⇒ no loss/no dup).
  - Full suite `npx vitest run` → **1145 passed / 81 skipped**; API unit contract tests 20 passed. All integration together (`--no-file-parallelism`) → **72 passed / 9 skipped**, and a SECOND consecutive full pass → **72 passed** (re-runnable; fixture pollution class fixed). `npm run typecheck` PASS; brand/currency guards PASS; consolidation guard passes with the route removed; eslint clean.
- **Database/audit/reconciliation evidence:** receipts carry channel API_V1 + scopeKey `provider:<id>`; claims store `externalRef` (replay continuity) and true source; intake audit now actually lands for API claims (system-actor attribution).
- **Creator allowlist change:** **`src/app/api/v1/claims/route.ts` REMOVED** (creator #3 migrated). Two of nine rails now converged.
- **Known gaps or skips:** operator-channel writes require the tenant binding (`OPERATOR_TENANT_ID`) — matches the BD-06 ops runbook (the channel is dark in prod until `API_KEY` is restored); `preauthRefs` beyond the first `preauthReference` are carried in the envelope but only the legacy single-PA attach is wired (full PA-origination is F5.7); body field names keep the legacy shape (a v2 ClaimSubmissionV1-native surface can come later).
- **Security/privacy review:** tenant/provider/member never trusted from the body; member errors non-enumerating (404→403 existence-leak closed); entitlement scoping enforced for facility keys (consistent with the E2E-D02/D04 read-endpoint remediation — a key without ContractApplicability cannot file, which is a misconfigured key, not a regression: sibling eligibility/benefits endpoints already fail the same way); receipt lookups facility-scoped; no raw internals in any response (IntakeError mapping).
- **Next eligible task:** F5.3 — tRPC claim mutation adapter/deprecation.
- **Blocker/options, if blocked:** n/a.

---

## F5.3 — tRPC claim mutation removal + read scoping

- **Status:** COMPLETE
- **Commit/branch:** `feat/claims-autopilot` (F5.3 commit)
- **Files changed:** `src/server/trpc/routers/claims.ts` (create mutation REMOVED; list/getById client-confined), `src/server/trpc/trpc.ts` (`createCallerFactory` export), `tests/services/trpc-claims-router.test.ts` (new).
- **Decisions enforced:** the plan's F5.3 step 3 (unused ⇒ deprecate/REMOVE, never retain a convenience creator); D10 (adjudicate stays on `ClaimDecisionService.decide`); G2.1 client confinement on reads.
- **Acceptance scenarios covered:** explicit-removal guard; no `ClaimsService.createClaim` reachable from tRPC; confined list passes clientId; confined getById NOT_FOUND out of scope; adjudicate canonical.
- **Observable behavior before:** `claims.create` (protectedProcedure) called `ClaimsService.createClaim` with NO fraud, NO auto-adjudication, NO idempotency, caller-supplied source — reachable by any authenticated session via raw POST /api/trpc even though NO tRPC client exists anywhere in the app (verified: the only import of the router tree is the HTTP mount). `list`/`getById` ignored the session's client confinement (`ctx.clientId` derived but unused).
- **Observable behavior after:** the mutation is gone (router exposes exactly list/getById/adjudicate); a client-confined session's list is scoped to its client and an out-of-scope getById is a non-enumerating NOT_FOUND.
- **Forbidden effects explicitly checked:** router source contains no `createClaim(` and no `create:` procedure (source-scan guard will catch a reintroduction); out-of-scope getById never reaches the service.
- **Tests run and exact results:** `trpc-claims-router.test.ts` → **7 passed** (removal guard ×2, scoping ×4, canonical adjudicate). Full suite → **1152 passed / 81 skipped**. typecheck PASS; eslint clean.
- **Creator allowlist change:** none yet — `claims.service.ts` stays allowlisted until F5.7 removes the PA-conversion path (`createClaim` now has exactly one remaining caller: `createClaimWithPreauth`).
- **Known gaps or skips:** n/a.
- **Security/privacy review:** removes an unaudited authenticated write path; adds client confinement to two read procedures.
- **Next eligible task:** F5.4 — CSV import row receipts and canonical commit.

---

## F5.4 — CSV import row receipts and canonical commit

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F5.4 commit)
- **Files changed:** `src/app/api/claims/import/route.ts` (rewritten as a canonical adapter: preview mode, per-row submit, conservation report, JSON output for tests; direct `Claim.create` + `peekNextDocumentNumber` + hard-gate/variance calls removed), `src/app/(admin)/claims/import/page.tsx` (preview checkbox + copy), `tests/integration/claim-intake-csv.integration.test.ts` (new, node-env — undici formData parsing breaks under jsdom), `tests/integration/claim-autopilot-reconcile.integration.test.ts` (pool now also excludes claims with terminal autopilot audit — the suite polluted ITSELF across executions: it writes audit to pool claims, cleanup removed runs but audit is append-only), allowlist shrink in `claim-creator-consolidation.test.ts`.
- **Decisions enforced:** §8.5 CSV key `csv:<fileSha₁₆>:<sheet>:<row>:<providerId>`; D6 (member-status/coverage no longer import errors — accepted+routed; only structural rows skip); D7/§8.3.1 (a row whose invoice already exists on ANY rail LINKS, never duplicates); D8/D9 (durable per-row receipts; bounded in-request sweep of ≤25 accepted rows, recovery sweep the backstop); correct BATCH source / CSV_IMPORT channel / `user:<id>` scope.
- **Observable behavior before:** one-shot import, per-row direct `Claim.create`, NO idempotency (re-upload duplicated every row — the worst case in the divergence table), business-status rows rejected, HTML-only.
- **Observable behavior after:** `mode=preview` validates the whole file with ZERO writes; commit gives every row a terminal disposition (IMPORTED / REPLAYED / LINKED / skipped+reason) + receipt reference; re-uploading the same file replays row-by-row with zero new claims; a conservation block ties file total = imported + replayed + linked + skipped; ≤2000 rows enforced; per-row failures isolate (partial success explicit).
- **Forbidden effects explicitly checked (real DB):** duplicate-invoice row inside one file ⇒ LINKED (one claim); full-file replay ⇒ 3 REPLAYED, claim count unchanged; preview ⇒ zero receipts/claims; future-date row rejects while sibling rows import; 2001-row file ⇒ 400.
- **Tests run and exact results:** `claim-intake-csv.integration.test.ts` → **4 passed**. Full unit suite → **1152 passed / 85 skipped**; all integration together → **76 passed / 9 skipped ×2 consecutive runs**. typecheck PASS; eslint clean; consolidation guard passes with the import route removed.
- **Creator allowlist change:** **`src/app/api/claims/import/route.ts` REMOVED** (creator #4 migrated). 3/9 converged.
- **Known gaps or skips:** import stays single-request (preview is a dry-run of the same request rather than a stored two-phase batch); benefitCategory fixed to OUTPATIENT as before (column addition is a template change for later).
- **Security/privacy review:** role gate unchanged; HTML output escaped; canonical non-enumerating errors per row; bounded rows/bytes.
- **Next eligible task:** F5.5 — offline sync adapter.

---

## F5.5 — Offline sync adapter and result linkage

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F5.5 commit)
- **Files changed:** `src/server/services/sync.service.ts` (`reconcileClaim` rewritten as a canonical adapter; RETRY sentinel keeps transient failures PENDING), `prisma/schema.prisma` (`SyncOperation.receiptId`/`resultClaimId` + index — additive, pushed), `tests/services/sync.service.test.ts` (claim section rewritten to the new contract), `tests/integration/claim-intake-sync.integration.test.ts` (new), allowlist shrink.
- **Decisions enforced:** §8.5 (`SyncOperation.opKey` IS the canonical idempotency key; clientUuid rides as externalClaimRef for cross-boundary continuity); D6 (member-status/scheme problems are no longer CONFLICTs — the claim is accepted and ROUTED, the business exception visible on the claim, never a lost op); D8/D9 (op links receipt+claim BEFORE the SYNCED finalise; accepted claims processed in-request; RETRYABLE canonical failures leave the op PENDING for the next pass — never double-applied, never falsely SYNCED); PR-036 preserved (work-code provider authority; CONFLICT ⇒ exception register).
- **Observable behavior before:** reconcile created the claim directly (`peekNextDocumentNumber` + `claim.create`), CONFLICTed on member/scheme status, ran fraud+processIntake post-create, and recorded NO linkage from op to claim/receipt.
- **Observable behavior after:** clean captures submit through `ClaimIntakeService` as `offlineDevice` (channel OFFLINE_SYNC, scope `device:<provider>:<device>`, source OFFLINE_SYNC), the op stores `receiptId`+`resultClaimId`, and SYNCED is only ever set AFTER canonical acceptance + linkage; the offline-reservation overcommit check (canonical `BenefitUsageService`) stays a CONFLICT (the pack's provisional promise can no longer be honoured) — distinct from business gates, which route.
- **Forbidden effects explicitly checked (real DB):** retry ingest dedups the opKey and reconcile is an idempotency drop (1 claim); a NEW op for an already-created claim (same clientUuid, e.g. device reinstall) LINKS — zero duplicates across the migration boundary; overcommit ⇒ CONFLICT + exception-register row + zero claims; an un-entitled facility's op ⇒ non-enumerating CONFLICT + zero claims (entitlement seeded for facility A via real ProviderContract/ContractApplicability; facility B un-entitled).
- **Tests run and exact results:** integration → **5 passed**; sync unit suite → **17 passed** (incl. new D6/RETRY/linkage contracts); full unit → **1151 passed / 90 skipped**; all integration together → **81 passed / 9 skipped**; typecheck PASS; consolidation guard passes with sync.service removed. (12 pre-existing `no-explicit-any` lint hits in the sync unit test predate this change — count unchanged.)
- **Creator allowlist change:** **`src/server/services/sync.service.ts` REMOVED** (creator #7 migrated). 4/9 converged.
- **Known gaps or skips:** changed-payload-same-key is structurally unreachable through SyncOperation (opKey dedup at ingest) — the conflict contract is proven at the receipt layer (F2.2/F5.2); worker-down recovery is the F3.6-proven sweep (not re-simulated here); RETRY path unit-proven.
- **Security/privacy review:** offline devices remain entitlement-scoped (pack parity); tenant derived from the op row; non-enumerating scope errors; conflicts always land in the exception register.
- **Next eligible task:** F5.6 — reimbursement adapters.

---

## F5.6 — Reimbursement adapters (both creators collapsed)

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F5.6 commit)
- **Files changed:** `src/server/services/reimbursement.service.ts` (`submit` rewritten as THE single canonical reimbursement path — richer typed signature incl. payment destination + optional draft key), `src/app/(admin)/claims/new/actions.ts` (`submitReimbursementClaimAction` now DELEGATES to the service; direct create + `writeAudit`/fraud/processIntake imports gone; friendly `{ok:false}` errors — server-action throw messages are masked in prod), `src/app/(admin)/claims/new/reimbursement/ReimbursementClaimForm.tsx` (draft UUID + result handling), `src/server/services/claim-intake/context.ts` (**`requireOperationalProvider` channel flag** — reimbursement only requires the provider to EXIST: the member already paid, possibly out-of-network/expired), `src/server/services/claim-autopilot/evaluate.ts` (**D13 gate**: `isReimbursement` routes `REIMBURSEMENT_PROOF_REVIEW` AHEAD of the policy-off short-circuit so it lands in the reimbursement queue, not generic manual), `tests/audit-coverage/catalogue.ts` (`reimbursementService.submit(` recognised as an auditing delegate), `tests/integration/claim-intake-reimbursement.integration.test.ts` (new), F5.2 spoof-count hardened with a VOID filter, allowlist shrink ×2.
- **Decisions enforced:** F5.6 spec (two creators ⇒ one path; proof/window/destination/momo metadata preserved on `ReimbursementRequest`; source+channel REIMBURSEMENT; **always** `REIMBURSEMENT_PROOF_REVIEW`; **no automatic money decision**; disbursement untouched on the guarded `disburse`); D6 (inactive membership no longer blocks — reviewer decides); §8.5 (client draft UUID replays).
- **Observable behavior before:** TWO structurally different reimbursement creators — the admin action (`CLM` numbers, plain `writeAudit`, fraud+processIntake, destination fields) and the uncalled service `submit` (`CLM-REIMB` numbers, chain audit, tx-atomic request row, NO destination fields, dead `undefined` ternaries) — neither idempotent, neither guaranteed manual review.
- **Observable behavior after:** one adapter; canonical receipt (scope `reimbursement:<memberId>`); destination stamped atomically via `origin.reimbursement`; momo verification + window flag preserved on the request row; the staged evaluator routes EVERY reimbursement to `REIMBURSEMENT_PROOF_REVIEW`/queue `REIMBURSEMENT_REVIEW` regardless of automation mode — no reimbursement can ever auto-approve.
- **Forbidden effects explicitly checked (real DB):** routed claim has `approvedAmount` 0 + status not APPROVED (no money); draft-key replay ⇒ ONE claim; suspended-contract facility ACCEPTED (out-of-network is the business reality) and STILL routed to proof review; outside-window flag recorded while the claim still routes.
- **Tests run and exact results:** integration → **4 passed**; audit-coverage harness PASS (delegation token); full unit → **1151 passed / 94 skipped**; all integration together → **85 passed / 9 skipped**; typecheck + eslint clean.
- **Creator allowlist change:** **BOTH `src/app/(admin)/claims/new/actions.ts` and `src/server/services/reimbursement.service.ts` REMOVED** (creators #5+#6 collapsed). 6/9 converged.
- **Known gaps or skips:** `CLM-REIMB` number prefix retired (canonical CLM series; `isReimbursement` is the discriminator — existing CLM-REIMB numbers unaffected); the request row is written post-acceptance (best-effort — a failure leaves the claim safely in proof review, logged).
- **Security/privacy review:** destination/proof data on the request row as before; member NOT_FOUND stays structural; the out-of-network relaxation applies ONLY to the reimbursement channel (every other rail still requires an operational provider).
- **Next eligible task:** F5.7 — pre-auth-originated claim adapter.

---

## F5.7 — Pre-auth-originated claim adapter

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F5.7 commit)
- **Files changed:** `src/server/services/claims.service.ts` (`createClaimWithPreauth` rewritten as a canonical adapter; the `@deprecated convertPreAuthToClaim` alias REMOVED — no legacy converter), `src/server/trpc/routers/preauth.ts` (caller repointed), `tests/integration/claim-intake-preauth.integration.test.ts` (new).
- **Decisions enforced:** §8.5 key `<preauthId>:claim-create:v1`; §8.3.4 strong PA-conversion fingerprint via `origin.preauthId` (one claim per PA event); D12 (member/provider/benefit/currency all from the PA row through the canonical context — `preauthConversion` caller); PA connect + `ATTACHED` stamped ATOMICALLY inside the canonical persist (legacy did it in a separate write after create); the benefit HOLD is untouched at conversion — consumed only at decision (unchanged semantics, now proven).
- **Observable behavior before:** conversion called the legacy `createClaim` (no receipt/idempotency; a repeat threw "already attached"; a concurrent double-click could double-create; the claim shell had ZERO claim lines; PA stamping non-atomic).
- **Observable behavior after:** repeated OR concurrent conversion returns the SAME claim (pa.claimId short-circuit + canonical replay + a brief authoritative-receipt poll for the mid-persist race); the claim carries ONE aggregate pre-authorised line at the approved amount (adjudicable; the PA row keeps its own clinical itemization); receipt channel PREAUTH_CONVERSION / scope `preauth:<id>` / source PREAUTH; processed in-request.
- **Forbidden effects explicitly checked (real DB):** hold stays ACTIVE at 8000 after conversion; repeat + concurrent ⇒ exactly ONE claim; SUBMITTED PA ⇒ safe error, zero claims; suspended-facility PA ⇒ safe scope error, zero claims.
- **Tests run and exact results:** integration → **5 passed**; full unit → **1151 passed / 99 skipped**; all integration together → **90 passed / 9 skipped**; typecheck + eslint clean.
- **Creator allowlist change:** none this package — `claims.service.ts` stays allowlisted for the now-orphaned `createClaim` body itself, deleted in F5.10.
- **Known gaps or skips:** `ClaimsService.createClaim` now has ZERO callers (tRPC create removed in F5.3; conversion canonical here) — F5.10 deletes it and closes the allowlist.
- **Security/privacy review:** conversion identity fully server-derived from the PA row; tenant-scoped fetch; safe non-enumerating failures.
- **Next eligible task:** F5.8/F5.9 — inpatient interim + final canonical persistence.

---

## F5.8 + F5.9 — Inpatient interim slice & final claim canonical persistence

- **Status:** COMPLETE (real-DB)
- **Commit/branch:** `feat/claims-autopilot` (F5.8/F5.9 commit)
- **Files changed:** `src/server/services/case.service.ts` (`cutInterimSliceTx` + `closeAndFile` rewritten as DERIVED_TRANSACTIONAL canonical adapters: receipt reserved pre-tx, `submitWithinTransaction` inside the SAME case transaction, all case-side effects — first-write close guard, adjudication log, bed-day flags, PA re-point, LOU consumption, activity log — unchanged and still atomic; defensive entry→line + diagnoses mappers that CONSERVE totals and never fail a bill on cosmetic data), `src/server/services/claim-intake/persist.ts` (**the entry-set freeze moved INTO the canonical persist as a guarded `updateMany` — a relation `connect` would silently OVERWRITE a rival slice's freeze**; count-mismatch aborts the whole tx, SET-06 canonicalized), `src/server/services/claim-autopilot/evaluate.ts` (**inpatient release gate**: case-derived claims force `LIVE → SHADOW`), `tests/integration/claim-intake-case.integration.test.ts` (new), `tests/services/case.service.test.ts` (leaned to the logic the service still owns — the 18 old mocked claim-path tests are superseded by the real-DB suite), allowlist shrink.
- **Decisions enforced:** §8.5 keys `caseId:slice:<seq>:<entrySetHash>` / `caseId:final:<entrySetHash>`; §8.3.3 case strong fingerprint (identical concurrent cut ⇒ LINK); D6/D12; **no entry can belong to two non-void claims** (theft-proof canonical freeze); FG-C9 first-write close guard preserved; IPL-PA-01 read-through preserved (slices still never re-point PAs; final re-points residual APPROVED PAs); **shadow-only inpatient** (LIVE policies downgrade to SHADOW for any `caseId` claim).
- **Observable behavior before:** both case rails created claims directly inside their transactions (seed-only claim numbers, no receipts/idempotency — an aborted cut retried as a brand-new claim number; a crash after commit left no durable processing trail).
- **Observable behavior after:** every slice/final carries a canonical receipt (channel CASE_INTERIM/CASE_FINAL, scope `case:<id>`, source MANUAL parity) + durable run; an identical re-cut replays the SAME claim; an aborted attempt's PROCESSING receipt is reused on retry; slices/finals are processed in-request but can never auto-decide.
- **Forbidden effects explicitly checked (real DB):** TIME-05 cut-off day inclusive (entry ON the cut-off bills); IP-DEF-04 same-day bed-day HIGH flag written; entries frozen exactly once with one billing owner under CONCURRENT identical cuts (ONE slice total); conservation Σ(slice+final) = Σ(entries) (200 000 + 80 000 = 280 000 case ✓); all-sliced close ⇒ NO phantom claim, case still CLOSED_FILED; two concurrent closes ⇒ exactly one final claim; PA re-point + LOU + CLOSED_FILED verified; no case claim ever reaches AUTO_DECIDED.
- **Tests run and exact results:** case integration → **5 passed**; case unit (leaned) → 2 passed; fraud-case-slices unchanged → 5 passed; full unit (clean env) → **1115 passed / 104 skipped**; all integration together → **95 passed / 9 skipped**; typecheck + eslint clean.
- **Creator allowlist change:** **`src/server/services/case.service.ts` REMOVED** — it no longer contains ANY `Claim.create`; the canonical `persist.ts` runs inside the case transactions. Allowlist is now `persist.ts` + `claims.service.ts` (the orphaned `createClaim`, deleted next in F5.10). 8/9 converged.
- **Known gaps or skips:** claim `procedures` JSON now uses the canonical shape (cptCode/…/totalCost) instead of the case shape (code/qty/total) — display-equivalent; PA/hold decision-time semantics untouched (IPL suite remains authoritative).
- **Security/privacy review:** case identity fully server-derived; the case-system channel does not entitlement-scope (member fixed by the admission) but still validates member/provider in-tenant.
- **Next eligible task:** F5.10 — remove legacy creators and lock consolidation (closes M5).

---

## F5.10 — Remove legacy creators and lock consolidation (M5 CLOSED)

- **Status:** COMPLETE — **M5 CLOSED: every production rail converges on the canonical intake.**
- **Commit/branch:** `feat/claims-autopilot` (F5.10 commit)
- **Files changed:** `src/server/services/claims.service.ts` (legacy `createClaim` DELETED — zero callers remained), `tests/services/claim-creator-consolidation.test.ts` (allowlist = `persist.ts` ONLY), `tests/services/claim-status-mutation-guard.test.ts` (NEW second source guard: claim STATUS writes locked to the sanctioned lifecycle owners), `docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md` (final state recorded).
- **Exhaustive creator search (recorded):** `.claim.create(`/`.claim.createMany(` across `src/**` → exactly ONE file: `src/server/services/claim-intake/persist.ts`. `ClaimsService.createClaim` references → none (deleted). Status-write scan → exactly the six sanctioned owners (decision service, adjudication/settlement, guarded disburse, capture/fraud-hold actions) — zero strays.
- **Decisions enforced:** the M5 outcome ("no unapproved production claim creator remains"); D10 defence-in-depth via the new status guard (a stray decision/settlement path turns the build red).
- **Observable behavior before/after:** no runtime behavior change in this package — it deletes dead code and locks the invariants the previous nine packages established.
- **Tests run and exact results (M5 boundary):** full unit (clean env) → **1118 passed / 104 skipped**; both guards PASS; ALL integration together → **95 passed / 9 skipped ×2 consecutive runs**; consolidation guard green with the persist-only allowlist; status guard green; typecheck + eslint clean.
- **Creator allowlist change:** **FINAL — `src/server/services/claim-intake/persist.ts` is the only entry.** 9/9 rails converged (8 migrated + case rails DERIVED_TRANSACTIONAL through the same owner).
- **Known gaps or skips:** seed/test direct creates remain by design (guard scans `src/**` only, documented in the inventory).
- **Security/privacy review:** two independent source guards now police creation AND status mutation.
- **Next eligible task:** M6 — operational surfaces (F6.1 …).

---

## F6.1–F6.5 — Operational surfaces (M6 COMPLETE)

- **Status:** COMPLETE — **M6 CLOSED** (one commit; the packages share surfaces)
- **Commit/branch:** `feat/claims-autopilot` (M6 commit)
- **F6.1 (receipt lookup):** the B2B receipt-status route gains per-credential rate limiting (60/min sliding window, `src/lib/rate-limit.ts`), hash-chain audit of lookup MISSES (`CLAIM:RECEIPT_LOOKUP_MISS` — enumeration probes become visible), and a caller-actionable `nextAction` derived from the routed reason catalog. Scope/404-safety unchanged (F5.2-proven). `isRouteCode` guard added to the catalog.
- **F6.2 (submission result UX):** submit actions redirect with `?submitted[&replayed]`; the claim page shows a received/replayed banner ("nothing was duplicated" on replay) with a **bounded** processing poller (4 s × ≤10, stops at terminal state/unmount, `role=status` for screen readers); the provider claims list shows the same banner via `?submitted=<claimNumber>`. Draft-UUID retention was F5.1.
- **F6.3 (automation timeline):** `AutomationPanel` on the claim page renders every receipt + processing run + staged trace (append-only history), the routed reason with internal text/remedy AND what the provider/member were told, the automation audit trail, and an authorized **Reprocess** (CLINICAL roles) that creates a NEW run via `createReprocessRun` (idempotent, revision-guarded, chain-audited `CLAIM:REPROCESS_REQUESTED`) and processes it in-request. Decided claims cannot be reprocessed.
- **F6.4 (exception queues):** `/claims/queues` gains named autopilot exception queues — grouped counts by `assignedQueue` with per-route chips, the catalog remedy, oldest-age, and a drill-down list (50, oldest-first) linking to claims. A claim leaves the queue the moment it is decided (pre-decision statuses only).
- **F6.5 (ops console + governed policy):** `/settings/auto-adjudication` REWRITTEN — the legacy form (which silently created inert OFF/DRAFT rows post-F2.4) is gone. a) Dashboard: **circuit breaker prominent** (open/close with mandatory audited reason), pending/retryable backlog, stale >15 min, failed 24 h, worker freshness, shadow agreement %, 7-day processing-state distribution. b) Policy console: versioned DRAFT creation (LIVE requires a ceiling — unbounded live money is refused at the form), maker submit into the approval matrix (`AUTO_ADJ_POLICY_CHANGE`; checker approves in the approvals surface; SoD enforced in-service), immediate deactivation with reason. All console actions hash-chain audited (`AUTO_ADJ:POLICY_DRAFTED/SUBMITTED/DEACTIVATED`; breaker audits in-service); audit-coverage harness extended accordingly.
- **Tests/verification:** rate-limit unit 2 passed; audit-coverage 4 passed; full unit → **1120 passed / 104 skipped**; all integration → **95 passed / 9 skipped**; **`next build` PASSES** (every new/changed page+action compiles in production mode); typecheck + eslint clean.
- **Known gaps or skips:** shadow metrics compute per-claim (fine at console scale; a materialized read model can come later); queue "ownership" column deferred (no reviewer-assignment field exists on Claim — the plan allows assignment only by extending an existing field, which does not exist).
- **Security/privacy review:** console is ADMIN_ONLY; dashboards are counts/states only (no PHI); receipt lookups rate-limited + miss-audited; reprocess is role-gated and append-only.
- **Next eligible task:** M7 — hardening and proof.
