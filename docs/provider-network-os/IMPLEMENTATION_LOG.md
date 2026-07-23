# Provider Network Operating System — Implementation Log

One entry per completed work package, appended in order, in the spec's §24.5 result-note
format. "Implemented" or "tests pass" alone is invalid — every entry states observable
behavior, forbidden effects explicitly checked, and exact test results.

Execution model: strict dependency order from F0.1 on branch `feat/provider-network-os`
(off `feat/claims-autopilot` @ `015cb31`). Each package keeps `npm run typecheck` and its
focused tests green; `npm run brand:guard` / `npm run currency:guard` at commit
boundaries; Prisma changes only via the sanctioned db-push workflow (docs/INSTALL.md §3).
Unrelated dirty UAT worktree files are never staged. The Claims Autopilot branch and its
pending F8.2/F8.3 work are never touched from this engagement.

Result-note template (§24.5):

```text
Work package:
Status: COMPLETE | PARTIAL | BLOCKED
Proof-before-build classification:
Files changed:
Schema/data changes:
Behavior delivered:
Authorization evidence:
Idempotency/concurrency evidence:
Privacy/security evidence:
Money/reconciliation evidence:
Focused tests and results:
Typecheck/schema result:
Manual/visual evidence:
Feature-flag state:
Backfill/rollout impact:
Known limitations:
Unrelated worktree changes preserved:
Next allowed package:
Stop condition observed:
```

---

## F0.1 — Freeze the current provider route inventory

```text
Work package: F0.1
Status: COMPLETE
Proof-before-build classification: MISSING (no prior provider route inventory existed; docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md covers claim creators only)
Files changed: docs/provider-network-os/PROVIDER_ROUTE_INVENTORY.md (new); PROGRESS.md row update
Schema/data changes: none
Behavior delivered: none (read-only characterization, per package rule 5 "Do not change behavior")
Authorization evidence: every provider page/action/API's auth + scoping recorded with file:line; rubric SAFE/PARTIAL/UNSCOPED applied; 5 UNSCOPED surfaces named (browser eligibility entitlement, claim-submit member resolution, api-key admin permission, /api/v1/upload target+content, /api/upload target ownership)
Idempotency/concurrency evidence: n/a (no writes); existing idempotency facts recorded (claim action draft-UUID, B2B canonical adapter)
Privacy/security evidence: inventory §8 crosswalks spec §4.2 gaps #1-#8,#10,#16,#18 to exact code evidence; no secrets/PHI in the doc
Money/reconciliation evidence: n/a this package (F0.5 owns it)
Focused tests and results: none required by package; route-count verification via file enumeration (13 provider files, 8 API v1 routes — §7 of inventory, no unexplained route)
Typecheck/schema result: npm run typecheck PASS; npx vitest run baseline at this tree: 1124 passed / 109 skipped (142 files; skips = real-DB suites w/o AUTOPILOT_TEST_DB — expected)
Manual/visual evidence: n/a
Feature-flag state: none introduced
Backfill/rollout impact: none
Known limitations: tRPC admin routers recorded at head-level only (their full audit belongs to F0.3/F5.1/F7); build-output route comparison not run (find-based enumeration used, "where available" clause)
Unrelated worktree changes preserved: yes — uat/*, scripts/uat-*, root plan .md files remain unstaged/untouched
Next allowed package: F0.3 (F0.2 characterization tests deferred until after F0.3-F0.5 reads per dependency note below — F0.2 depends only on F0.1, but writing leak tests benefits from the F0.3/F0.4 path facts; board order kept)
Stop condition observed: yes — inventory written and reviewed; no route fixed
```

---

## F0.3 — Characterize claim and PA ownership paths

```text
Work package: F0.3
Status: COMPLETE
Proof-before-build classification: PARTIAL (claim side COVERED by docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md + guard tests — reconciled, not rebuilt; PA side was MISSING — built here)
Files changed: docs/provider-network-os/CLAIM_PA_OWNERSHIP_PATHS.md (new); PROGRESS.md row
Schema/data changes: none
Behavior delivered: none (read-only characterization; package rule "Do not refactor" observed)
Authorization evidence: per-rail auth recorded (B2B entitledMemberWhere + tenant cross-check; admin/tRPC protectedProcedure; member self+dependants scope)
Idempotency/concurrency evidence: recorded, not built — ALL 5 PA rails have NO idempotency (D26 gap; B2B retry duplicates); decision txns use inSerializableTx; PA-conversion has durable key <preauthId>:claim-create:v1; consumption inside decision tx (IPL-PA-01)
Privacy/security evidence: B2B PA rail skips fraud screen + benefit-in-package gate that other rails enforce (recorded as CONFLICTING for F3.1); no PHI in the doc
Money/reconciliation evidence: hold placement/release/consumption ownership mapped (approveByHuman always places hold; decision-tx consumption; case close/cancel guards) — conservation queries deferred to F0.5 as scoped
Focused tests and results: none required (characterization); existing per-path evidence mapped in doc §6; two named coverage holes (member 15k auto path, B2B duplicate-on-retry)
Typecheck/schema result: no code changed; tree baseline unchanged (typecheck PASS at cb28605)
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: none
Known limitations: LOU (letterOfUndertaking) lifecycle only touched where case close consumes it — full GOP/LOU characterization lands in F3.14 proof-before-build; escalation job read at excerpt level
Unrelated worktree changes preserved: yes
Next allowed package: F0.4
Stop condition observed: yes — call graph + path matrix complete; no refactor performed
```

---

## F0.4 — Characterize document storage and consumers

```text
Work package: F0.4
Status: COMPLETE
Proof-before-build classification: MISSING (no prior storage/consumer inventory; spec §7.4 target fields almost entirely absent on Document)
Files changed: docs/provider-network-os/DOCUMENT_STORAGE_MAP.md (new); PROGRESS.md row
Schema/data changes: none — bucket policy NOT touched (stop condition)
Behavior delivered: none (read-only)
Authorization evidence: per-target app-level "who is handed the URL" matrix + the overriding fact that public-read bucket makes effective viewer = anyone with the URL, unauthenticated (minio.ts:14-36); U1 accepts unvalidated target IDs (api/upload/route.ts:60-67); U2 no auth-scope/validation/record at all
Idempotency/concurrency evidence: n/a (characterization)
Privacy/security evidence: PUBLIC-READ bucket + permanent guessable URLs confirmed (gap #8); SSRF surface found (intake.parseCensusFile arbitrary-URL fetch, trpc/routers/intake.ts:58); counter-example recorded (autopilot evaluate reads metadata only). No object contents downloaded/logged (package rule)
Money/reconciliation evidence: n/a
Focused tests and results: none required; migration-count SQL drafted (§6) for later read-only run (no prod DB access from workstation)
Typecheck/schema result: no code changed
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: documented F2.7 legacy inputs + F2.9 gate blockers (9 consumer groups, break-glass on ensureBucket policy re-application)
Known limitations: row/object counts require environment DB access (queries provided, not executed); MemberHealthShare share-grant lifecycle read at model level only
Unrelated worktree changes preserved: yes
Next allowed package: F0.5
Stop condition observed: yes — inventory complete; no bucket-policy change
```

---

## F0.5 — Characterize settlement and money conservation

```text
Work package: F0.5
Status: COMPLETE
Proof-before-build classification: PARTIAL (settlement path + atomic paid-gate + existing recon invariant COVERED and shipping; ProviderDisbursement + ProviderRemittanceService + payment-query MISSING — confirmed gaps #16/#17)
Files changed: docs/provider-network-os/SETTLEMENT_MONEY_MAP.md (new); PROGRESS.md rows
Schema/data changes: none — no production mutation (stop condition)
Behavior delivered: none (read-only)
Authorization evidence: n/a this package
Idempotency/concurrency evidence: documented the shipped FG-C7 atomic exactly-once Mark-Paid gate (updateMany status guard = first write, count!=1 → rollback) — must be preserved by F6
Privacy/security evidence: n/a
Money/reconciliation evidence: full claim→decision→batch→voucher→GL path traced with file:line; the ONE paid-setter identified (markSettlementBatchPaid); existing data-integrity invariant formula captured (claim approvedAmount ↔ 1010 SETTLEMENT_PAID credits); spec D25/I5 target formula documented; frozen-example capture SQL drafted (not run — no sanctioned DB from workstation); ProviderDisbursement absence confirmed (paid = accounting state, no real reference/value-date)
Focused tests and results: none required (characterization)
Typecheck/schema result: no code changed
Manual/visual evidence: n/a
Feature-flag state: none
Backfill/rollout impact: F6.7/6.8 disbursement additive; F6.9 recon extends shipped check; single-currency Phase-1 = finance decision (F6.1)
Known limitations: admin settlement pages/actions read at service level only (full admin-field parity is F6.3's proof-before-build); frozen examples require environment DB (queries provided)
Unrelated worktree changes preserved: yes
Next allowed package: F0.6
Stop condition observed: yes — path traced, baseline queries written, no disbursement added, no production mutation
```

---
