# F6.1 — Frozen Remittance Formula and Field Dictionary

**Work package:** F6.1 (BEGINS phase F6 — remittance, disbursement, payment queries)
**Size:** S · **Type:** documentation / specification (**no code**)
**Status:** SPEC COMPLETE · **GATED(finance sign-off)** — §11.8 go-live evidence; ratification block at §12 is PENDING and must be signed by claims, network operations, and finance before F6.2 activates any provider-facing remittance read.
**Branch/commit:** `feat/provider-network-os` @ F5-complete tip `f04a959` (this doc is the F6.1 deliverable)
**Depends on:** F0.5 (`SETTLEMENT_MONEY_MAP.md`) · **Feeds:** F6.2 (`ProviderRemittanceService`), F6.3–F6.6 (admin/provider/CSV/PDF views), F6.7–F6.9 (disbursement + reconciliation), F11.3 (money-conservation suite)
**Authority in the plan:** §8.9 (remittance detail), §16 I5/I6 (conservation invariants), decisions **D15** (one canonical read model, frozen facts), **D16** (voucher ≠ disbursement), **D25** (exact decimal conservation), §11.1 (`providerRemittanceV2` flag defaults off), §11.6 stages 1/6.

> **Frozen-fact rule (D15, non-negotiable).** A remittance is a historical explanation of what a *specific settlement paid*. Every amount below is read from a **stored snapshot** captured at decision/settlement time. The remittance read model (F6.2) **must never** recompute an amount from *today's* contract, tariff, eligibility, benefit balance, or FX rate. Where a value is derived, it is derived **only** from other stored snapshots on the same claim/line/batch, never from a live pricing call.

---

## 0. Proof-before-build (§0.3)

```text
Work package: F6.1 — Specify frozen remittance formula and field dictionary
Capability searched for: an existing canonical definition of provider-visible settlement amounts + their stored source facts
Search terms used: ProviderSettlementBatch, PaymentVoucher, approvedAmount, paidAmount, payerLiability, providerWriteOff,
  disallowedAmount, shortfallAmount, contractedAmount, memberLiability, postSettlementBatchPaid, markSettlementBatchPaid,
  ReasonCodeService.resolve, AdjudicationReasonCode, ClaimReconsiderationLine, JournalLine 1010/2010
Files inspected: prisma/schema.prisma (Claim 2249-2504, ClaimLine 2533-2596, AdjudicationReasonCode 2505-2531,
  ReasonSeverity 2498, ClaimSubmissionType 2205, SettlementStatus 2464, ProviderSettlementBatch 6280-6312,
  PaymentVoucher 4667-4696, JournalEntry 5165-5188, JournalLine 5190-5202, ClaimReconsideration/Line 7034-7113);
  src/server/services/claim-adjudication.service.ts (createSettlementBatch 347-491, markSettlementBatchPaid 546-720);
  src/server/services/claim-decision.service.ts (assessCeiling 138-230, FX 564-592, member/cost-share 640-668, line stamp 673-677, persist 766-786);
  src/server/services/contract-engine/{engine.ts,persist.ts,types.ts}; src/server/services/auto-adjudication.service.ts;
  src/server/services/cost-share.service.ts; src/server/services/gl.service.ts (postSettlementBatchPaid 253-268);
  src/server/services/reason-codes.service.ts (resolve 125, catalog 26-...); scripts/data-integrity-check.ts (checkSettlementReconciliation 55-94);
  src/app/provider/settlements/page.tsx (current list); src/server/services/case.service.ts (getCaseReconciliation 788-848).
Existing implementation found: settlement batch / voucher / GL money path fully implemented and characterized in F0.5.
  NO canonical remittance read model exists (§4.2 #16); NO ProviderDisbursement exists (§4.2 #17, D16 gap).
Existing tests found: scripts/data-integrity-check.ts::checkSettlementReconciliation (claim→GL leg only).
Live behavior checked: read-only characterization by two evidence agents; no DB run (no sanctioned DB in worktree).
Classification: PARTIAL — the stored facts exist and are documented; the *definitions* mapping them to provider-visible
  amounts, the conservation contract, and the data gaps are specified here for the first time.
Smallest required change: this document only. No code, no schema, no data.
Files expected to change: docs/provider-network-os/REMITTANCE_FIELD_DICTIONARY.md (new); trackers (PROGRESS.md, IMPLEMENTATION_LOG.md).
Data migration/backfill needed: none for F6.1. (Gap closures in §11 belong to F6.2/F6.7/F6.8/F6.9.)
Security or money invariants touched: none mutated. This *defines* I5/I6 for the phase; it changes no behavior.
```

**Stop condition:** definitions + worked examples + gap register + sign-off block delivered. **No code.**

---

## 1. Purpose and how downstream packages consume this

F6.1 is the finance-approved contract that every later F6 package is built against:

- **F6.2 `ProviderRemittanceService`** projects exactly the fields in §4, using the formulas in §5/§8, and computes the §8 conservation result with `Decimal`. Its tests ("worked examples", "pagination totals still reconcile") assert the §10 examples.
- **F6.3–F6.6** (admin detail, provider page, CSV, PDF/print) render **only** this dictionary; a provider-safe subset (the "Provider-safe?" column) is enforced for provider audiences, an admin extension is layered explicitly (F6.3).
- **F6.7/F6.8** add the missing `ProviderDisbursement` leg (§9 gap D-7) so I5's final equality (`… = successful disbursement amount`) becomes checkable.
- **F6.9** builds the batch/voucher/disbursement/GL reconciliation job from §8.
- **F11.3** turns §8's I5/I6 into an automated release-blocking suite.

If a later package needs an amount not defined here, it stops and amends this dictionary (with finance re-sign-off) rather than inventing a field — that is the anti-"hanging wiring" rule for this phase.

---

## 2. The two money tracks (the central architectural fact finance must ratify)

Claim money is written by **two independent code paths that are not reconciled into each other**:

| Track | Writer | Writes | Grain |
|---|---|---|---|
| **A — Decision (settlement-authoritative)** | `ClaimDecisionService.decide` (human maker/checker) and `auto-adjudication.service.ts` (auto) | `Claim.approvedAmount`, `Claim.approvedBaseAmount`, `Claim.copayAmount`, `Claim.memberLiability`, cost-share, FX snapshot; the operational per-line `ClaimLine.approvedAmount` | claim header + line |
| **B — Contract-engine provenance (explanatory)** | `ContractEngine` → `contract-engine/persist.ts` | per-line `ClaimLine.contractedAmount`, `shortfallAmount`, `disallowedAmount`, `memberLiability`, `payerLiability`, `providerWriteOff`, `reasonCodeId`, `declineReason` | line only |

`contract-engine/persist.ts:17-23,66-89` states it writes **provenance only** and **does not overwrite** the adjudicator's `approvedAmount`. Consequently the engine's per-line `payerLiability` (track B) and the claim's `approvedAmount` (track A) are produced by different code and **can diverge**, most notably on human-overridden claims.

**Settlement, voucher, GL, and `paidAmount` are driven exclusively by Track A** (`Claim.approvedAmount` / `approvedBaseAmount`). Therefore:

> **RULE R-1 (settlement-authoritative source).** The frozen remittance **money spine** — batch total, claim payable, claim paid, voucher, GL — is Track A (`Claim.approvedAmount` → `paidAmount`). Track B's per-line columns are the **breakdown/explanation** of *how* a claim's approved amount decomposes (contracted, disallowed, member share, writeoff). The remittance must present Track B for transparency **and** verify it reconciles to the Track A claim header; where it does not, **the claim header (Track A) is authoritative for money** and the line breakdown is labelled *indicative/provenance*. See gap **D-1**.

Finance/claims must ratify R-1 (§12, decision Q1).

---

## 3. Currency axes and rounding (steps 1–2)

Two amount axes exist on every settlement fact and must never be summed across each other:

- **Transaction currency** (`Claim.currency`, default `UGX`): `Claim.approvedAmount`, `paidAmount`, `billedAmount`; batch/voucher `totalAmount`.
- **Base currency** (`Claim.baseCurrency` = `UGX`): `Claim.approvedBaseAmount`, `billedBaseAmount`; batch/voucher `baseTotalAmount`; **all GL**. Base is snapshotted at decision date via `FxService.normalise` (fail-closed if no rate — `claim-decision.service.ts:564-592`) and frozen (`fxRateToBase`, `fxRateDate`). Settlement reuses the frozen `approvedBaseAmount`; it never re-fetches FX (D15/I6).

**Single-currency batching (Phase 1, finance decision).** `createSettlementBatch` and `markSettlementBatchPaid` both **refuse** a mixed-currency batch (`claim-adjudication.service.ts:441-453` and `:592-603`). A batch/voucher therefore has exactly one transaction currency. Multi-currency settlement is **deferred** and is a §12 finance decision (Q4), not a Phase-1 capability.

**Rounding.** All arithmetic uses `Decimal`/`decimal.js` (D25), never JS floats. Display, CSV, and PDF round **HALF_UP to 2 decimal places at the boundary only**; intermediate sums stay full-precision. Stored DB precision is **not uniform** (recorded per field in §4; see gap **D-8**): core columns are unannotated `Decimal` → Postgres `DECIMAL(65,30)`; newer line columns are `@db.Decimal(14,2)`; base + batch columns are `@db.Decimal(19,4)`.

---

## 4. Field dictionary

Columns: **Provider label** (audience-facing name) · **Definition** · **Source fact** (`model.field` @ `schema.prisma:line`) · **Track** (A/B/settlement) · **Stored | Derived** · **DB precision** · **Provider-safe?** (Y = may show to a provider audience; N = admin/internal only).

### 4.1 Batch level — `ProviderSettlementBatch` (schema 6280-6312)

| Provider label | Definition | Source fact | Stored/Derived | Precision | Safe? |
|---|---|---|---|---|---|
| Settlement cycle | Payment cycle the batch settles | `cycleMonth` @6284, `cycleYear` @6285, `sequence` @6289 | Stored | int | Y |
| Currency | Transaction currency of the batch | `currency` @6295 | Stored | — | Y |
| Base currency | Ledger/base currency | `baseCurrency` @6296 | Stored | — | Y |
| Claim count | Claims in the batch | `claimCount` @6298 | Stored (frozen at build) | int | Y |
| Batch amount | Σ claim payable, transaction ccy | `totalAmount` @6291 | Stored (frozen at **creation**) | `Decimal(19,4)` | Y |
| Batch base amount | Σ claim payable, base ccy | `baseTotalAmount` @6297 | Stored (set at **mark-paid**; `0` before — gap **D-9**) | `Decimal(19,4)` | Y |
| Status | Settlement lifecycle | `status` @6290 (`SettlementStatus` 2464: PENDING, MAKER_SUBMITTED, CHECKER_APPROVED, SETTLED, REJECTED) | Stored | — | Y |
| Settled at | When the batch was marked paid | `settledAt` @6301 | Stored | — | Y |
| Maker / checker | Settlement maker/checker actors | `makerId` @6299, `checkerId` @6300 | Stored | — | **N** (internal actors) |
| Notes | Free-text batch note | `notes` @6302 | Stored | — | **N** (may contain internal text) |

### 4.2 Voucher level — `PaymentVoucher` (schema 4667-4696)

| Provider label | Definition | Source fact | Stored/Derived | Precision | Safe? |
|---|---|---|---|---|---|
| Voucher reference | Internal payment-authorisation doc number | `voucherNumber` @4669 | Stored | — | Y |
| Voucher amount | Authorised amount, transaction ccy | `totalAmount` @4672 | Stored | **unannotated → `DECIMAL(65,30)`** (gap **D-8**) | Y |
| Voucher base amount | Authorised amount, base ccy | `baseTotalAmount` @4676 | Stored | `Decimal(19,4)` | Y |
| Voucher status | `PENDING`/`APPROVED`/`PROCESSED` (free-form string, not enum) | `status` @4678 | Stored | — | Y |
| Processed at | Voucher processing time | `processedAt` @4679 | Stored | — | Y |
| GL reference | Journal entry the voucher posted | `journalEntryId` @4689 | Stored (plain scalar, no relation) | — | **N** (internal GL) |
| Batch link | Batch this voucher pays | `settlementBatchId` @4688 | Stored (plain scalar, unenforced FK — see note) | — | Y |

> **Batch↔voucher link is one-directional and DB-unenforced.** There is no `PaymentVoucher` relation on the batch; the link lives on `PaymentVoucher.settlementBatchId` (plain `String?`). One-voucher-per-batch is enforced by the **status machine + atomic gate**, not a DB constraint (schema comment 4683-4687). F6.2 must join by scalar and F6.9 must assert 1:1.

> **`PaymentVoucher` authorises payment; it is not proof of disbursement (D16).** A `PROCESSED` voucher means the payment was *authorised and GL-posted*, not that money left the bank with a real reference/value date. The actual-disbursement fact is **missing** (gap **D-7**, built by F6.7/F6.8).

### 4.3 Claim level — `Claim` (schema 2249-2504), per claim in the batch

| Provider label | Definition | Source fact | Track | Stored/Derived | Precision | Safe? |
|---|---|---|---|---|---|---|
| Billed | What the provider billed (header) | `billedAmount` @2298 | A | Stored (at capture) | 65,30 | Y |
| Approved / payable | Amount the payer approved to pay | `approvedAmount` @2299 | **A (spine)** | Stored (at decision) | 65,30 | Y |
| Member share | Total member pays = copay + cost-share | `memberLiability` @2303 | A | Stored | 65,30 | Y |
| — copay component | Copay portion | `copayAmount` @2300 | A | Stored | 65,30 | Y |
| — deductible / co-insurance | Cost-share split | `costShareDeductible` @2361, `costShareCoInsurance` @2362 | A | Stored | 14,2 | Y |
| Paid | Actually settled amount (`:= approvedAmount` at mark-paid) | `paidAmount` @2302 | **settlement** | Stored (raw SQL `claim-adjudication.service.ts:695`) | 65,30 | Y |
| Approved (base) | Approved, base ccy (FX-frozen) | `approvedBaseAmount` @2311 | A | Stored | 19,4 | Y |
| Billed (base) | Billed, base ccy | `billedBaseAmount` @2312 | A | Stored | 19,4 | Y |
| FX rate / date | Frozen decision-date FX | `fxRateToBase` @2313, `fxRateDate` @2314 | A | Stored | 19,8 rate | Y (rate) |
| Currency | Claim transaction currency | `currency` @2250 | — | Stored | — | Y |
| Decline reason (claim) | Claim-level outcome reason (enum) | `declineReasonCode` @2375 | A | Stored | — | Y **via §7 mapping only** |
| Decline notes | Internal decision narrative | `declineNotes` @2376 | A | Stored | — | **N** |
| Contracted-rate signal | Σ contracted over tariffed lines (fraud/variance signal) | `contractedRate` @2321, `contractedVariancePct` @2322 | derived-at-decision | Stored | 14,2 / 5,4 | **N** (internal signal — **not** the remittance "allowed") |
| Lineage | Correction/resubmission/reconsideration chain | `submissionType` @2420 (`ClaimSubmissionType` 2205), `chainRootClaimId` @2421, `supersedesClaimId` @2422, `supersededByClaimId` @2423 | — | Stored | — | Y (see §6) |
| Settlement / voucher link | Batch & voucher this claim belongs to | `settlementBatchId` @2337, `paymentVoucherId` @2401 | settlement | Stored | — | Y |

> **`Claim.excessAmount` @2301 is DEAD** — declared but never written anywhere in `src/` (over-limit is hard-blocked at decision, not capped: `claim-decision.service.ts:640-661`). It is always `0`. **Do not use it** in the remittance (gap **D-3**).
> **There is no claim-level `disallowedAmount` / `shortfallAmount` / `providerWriteOff` / `payerLiability` column.** Those exist only per line (§4.4). At claim level a writeoff survives only as narrative text in adjudication notes (`claim-decision.service.ts:529-532`) — **not** a structured amount (gap **D-2**).

### 4.4 Line level — `ClaimLine` (schema 2533-2596), per line

| Provider label | Definition | Source fact | Track | Stored/Derived | Precision | Safe? |
|---|---|---|---|---|---|---|
| Billed (line) | Provider charge for the line (`qty × unitCost`) | `billedAmount` @2545 (`unitCost` @2544, `quantity` @2543) | A | Stored (at capture) | 65,30 | Y |
| Contracted allowed | Tariff-priced allowed (`qty × contracted unit`) | `contractedAmount` @2567 (`tariffRate` @2546) | B | Stored (engine) | 14,2 | Y |
| Disallowed | Components rejected outright | `disallowedAmount` @2569 | B | Stored (engine) | 14,2 | Y |
| Member share (line) | Balance-billed to member (only where policy permits) | `memberLiability` @2570 | B | Stored (engine) | 14,2 | Y |
| Provider writeoff | Contractual short-pay the provider absorbs (not member-billable) | `providerWriteOff` @2572 (**and** `shortfallAmount` @2568 — see gap **D-4**) | B | Stored (engine) | 14,2 | Y |
| Approved / payable (line) | Operational per-line approved (Track A) | `approvedAmount` @2547 (`adjustedAmount` @2553 when adjusted) | **A (spine)** | Stored (decision) | 65,30 | Y |
| Engine payable (line) | Engine's computed payer liability (Track B provenance) | `payerLiability` @2571 | B | Stored (engine) | 14,2 | Y (labelled provenance) |
| Paid (line) | **No stored field** — derived per §5 | *(derived from `approvedAmount` at settlement)* | settlement | **Derived** | — | Y |
| Approved quantity | Payable units after caps | `quantityApproved` @2574 | B | Stored | int | Y |
| Line reason (safe) | Structured provider-safe reason | `reasonCodeId` @2565 → `AdjudicationReasonCode` (§7) | B | Stored | — | Y **via §7 mapping** |
| Line reason (raw) | Free-text engine/human reason | `declineReason` @2555, `adjustmentReason` @2554 | A/B | Stored | — | **N** (may contain internal text) |
| Rule trace | Engine rule trace | `ruleTrace` @2575, `matchedRuleType` @2562, `payableSource` @2564 | B | Stored | — | **N** |

> **No per-line `paidAmount`, `currency`, or base-currency column exists** (confirmed — `ClaimLine` carries only transaction-ccy amounts). Line "paid" and line base amounts are **derived**, not stored (gaps **D-5**, **D-6**).

---

## 5. Derived-field formulas (from stored snapshots only)

All derivations use **other stored snapshots on the same record** — never a live pricing/FX call (D15).

- **Line paid** (no stored field, gap D-5). Because `Claim.paidAmount := Claim.approvedAmount` batch-wide at mark-paid, and Track A line `approvedAmount` is the line payable, define:
  `remittance.line.paid = ClaimLine.approvedAmount` **iff** the claim is `PAID` (else `0`). This holds exactly when Σ line `approvedAmount` = claim `approvedAmount` (Track A invariant — F6.2 asserts; see D-1). If a claim's lines do **not** reconcile to its header, F6.2 falls back to allocating `Claim.paidAmount` across lines pro-rata by line `approvedAmount`, and flags the claim as *line-indicative* (R-1).
- **Line base amount** (no stored field, gap D-6). Not derivable per line from stored facts (no line FX). The remittance shows line amounts in **transaction currency only**; base-currency conservation (I6) is asserted at **claim/batch** grain, where `approvedBaseAmount` exists.
- **Disallowed vs writeoff distinction** (§8.9 requires both). `disallowedAmount` = components rejected outright (REJECT severity). `providerWriteOff`/`shortfallAmount` = billed-above-contract short-pay absorbed by the provider (SHORTFALL severity), **not** member-billable. These are distinct; do not merge them into one "not paid" bucket.
- **Header identity (target, per claim).** `billedAmount ?= approvedAmount + memberLiability + Σ line(disallowedAmount + providerWriteOff)`. This is the *intended* decomposition but is **not guaranteed today** across the two tracks — F6.2 computes it and surfaces a per-claim residual; a non-zero residual is a data-quality flag, not a hard error (R-1). Finance decision Q1.

---

## 6. Supplemental / reconsideration lineage display (step 3)

A settlement batch may contain a **supplemental** claim produced by an accepted reconsideration (F5.16). It is a normal claim on the money spine, distinguished only by lineage.

| Display element | Source fact |
|---|---|
| "Supplemental / correction / resubmission of claim #X" | `Claim.submissionType` @2420, `chainRootClaimId` @2421, `supersedesClaimId` @2422 |
| Reconsideration case it settles | `ClaimReconsideration.supplementalClaimId` @7063 → this claim |
| Per-line incremental award (what the supplemental bills) | `ClaimReconsiderationLine.awardedIncrement` @7107; frozen originals `originalBilled/Allowed/Payable/MemberShare/Writeoff` @7093-7097 |
| Prior settled facts / ceiling | `ClaimReconsiderationLine.alreadyApproved` @7104, `alreadyPaid` @7105, `maxIncrement` @7106 |

**Rules.** (a) A supplemental claim's `billedAmount`/`approvedAmount` reflect **only the awarded positive delta**, not the original tariff (F5.16 — never pays the original twice). (b) The remittance shows the supplemental **linked** to its original with the frozen original amounts for context, but the money spine counts each claim's own `approvedAmount`/`paidAmount` once. (c) The original claim is **never** superseded by a reconsideration (D13): both the original and the supplemental may appear across different batches. (d) **Ceiling invariant I4:** `Σ(original approved + all approved supplemental deltas) ≤ latest corrected full entitlement`; a zero/negative award produced **no** financial child, so it never appears on a statement.

---

## 7. Provider-safe reason mapping (step 4)

Provider-facing reason text comes **only** from the approved catalog `AdjudicationReasonCode` (schema 2505-2531), resolved by `ReasonCodeService.resolve(tenantId, code)` (`reason-codes.service.ts:125`).

| Show to provider | Source | Never show |
|---|---|---|
| Safe explanation | `AdjudicationReasonCode.providerDescription` @2512 | `internalDescription` @2511 |
| Remedy / next step | `remedy` @2516 | — |
| Resubmission eligibility | `resubmissionAllowed` @2517, `requiredDocsForReconsideration` @2520 | `escalationRoute` @2521 (internal queue) |
| Category | `category` @2510 | — |
| Severity semantics | `defaultSeverity` @2515 (`ReasonSeverity` 2498) | — |

**Severity → money meaning** (drives how an amount is labelled): `SHORTFALL` = provider writeoff (billed above contract; difference not member-billable, e.g. `PRC-001`, `LIM-001/002`); `REJECT` = disallowed outright (`EXC-*`, `SVC-003`); `INFO` = informational (e.g. `PRC-005` package-bundled); `PEND` = pending manual pricing.

**Where the code comes from.** Line: `ClaimLine.reasonCodeId` @2565 → catalog (structured, engine-populated in the auto path). Claim: `Claim.declineReasonCode` @2375 (enum: PREEXISTING, EXCLUSION, BENEFIT_EXHAUSTED, WAITING_PERIOD, INVALID_DOCS, NON_COVERED_FACILITY, FRAUD_SUSPECTED, OTHER) → mapped to safe text; **`FRAUD_SUSPECTED` maps to a neutral "declined after review — contact the payer"** and never reveals fraud (D18, matches F5.9).

**Never expose** (D18/§9): `internalDescription`, `declineNotes`, line free-text `declineReason`/`adjustmentReason`, `ruleTrace`, `matchedRuleType`, internal GL account codes/`journalEntryId`, `makerId`/`checkerId`, peer-provider identity, or any fraud signal.

> **Gap D-10:** human-adjudicated declines set free-text `declineReason`/`adjustmentReason` but may leave `reasonCodeId` **null**. Those lines have **no structured safe reason**; the remittance must show an approved generic fallback ("This line was not paid in full — contact the payer for details") rather than the raw text. Finance/claims decision Q3.

---

## 8. Batch / voucher / disbursement / GL formulas (step 5) — the conservation contract

**Money path** (F0.5, verified): `Claim.approvedAmount` → batch → maker/checker → `markSettlementBatchPaid` (the money moment) → GL clears Claims Payable, `PaymentVoucher` created `PROCESSED`, claims → `PAID`, `paidAmount := approvedAmount`. The **atomic exactly-once gate** (`updateMany` `CHECKER_APPROVED`→`SETTLED`, `count !== 1` → `CONFLICT` rollback) is the first write and must not be weakened by anything F6 layers on top.

**GL posting** (`gl.service.ts:253-268`), base currency: **Dr `2010` Claims payable settled / Cr `1010` Bank — operating**, amount = `baseTotal`, `sourceType = SETTLEMENT_PAID`, `JournalEntry.status = POSTED`. `JournalLine` has no currency column (base-only ledger).

### I5 — remittance conservation (per SETTLED batch, single currency)

```text
Σ over claims c in batch b :  c.approvedAmount           [Claim.approvedAmount, txn ccy]
   = b.totalAmount                                        [ProviderSettlementBatch.totalAmount @6291, frozen at creation]
   = voucher(b).totalAmount                               [PaymentVoucher.totalAmount @4672]
   = Σ over claims c in b :  c.paidAmount                 [Claim.paidAmount @2302, := approvedAmount at mark-paid]
   = Σ successful disbursement amount                     [ProviderDisbursement — MISSING, gap D-7 → F6.7/F6.8]

per claim :  c.approvedAmount = Σ over lines : line.<payable>   [line.<payable> = ClaimLine.approvedAmount (Track A); see D-1]
```

Today the middle equalities hold **by construction** in `markSettlementBatchPaid` (batch total, voucher total, and paid are all Σ `approvedAmount`). The **line→header** equality and the **disbursement** equality are **not yet enforced** (D-1, D-7). F6.9 adds an independent job asserting stored `batch.totalAmount == Σ claim approvedAmount == voucher.totalAmount`, and — once D-7 lands — `== Σ successful disbursement`. If partial/multiple disbursements are later allowed, compare the **successful total + explicit remaining balance**, not 1:1 (I5).

### I6 — base-currency / GL conservation (independent axis)

```text
Σ over claims c in b :  c.approvedBaseAmount             [Claim.approvedBaseAmount @2311, FX-frozen]
   = b.baseTotalAmount                                    [ProviderSettlementBatch.baseTotalAmount @6297, set at mark-paid]
   = voucher(b).baseTotalAmount                           [PaymentVoucher.baseTotalAmount @4676]
   = JournalEntry credit(account 1010)  = JournalEntry debit(account 2010)   [gl.service.ts:262-265]
```

The transaction axis (I5) and base axis (I6) reconcile **independently**; they are equal only for base-currency (UGX) claims. The provider statement never recomputes base from current FX (D15). The shipped check `scripts/data-integrity-check.ts:55-94` currently ties the txn-ccy left leg (`Σ approvedAmount` of voucher-linked PAID claims) to the base-ccy GL credit — exact only under single/base-currency settlement (documented limitation; F6.9 separates the axes).

---

## 9. Data-gap register (step 6) — missing/ambiguous facts, each with owner + closing package

| # | Gap | Impact on remittance | Closes in | Finance decision? |
|---|---|---|---|---|
| **D-1** | Track A vs Track B may diverge: line `payerLiability` (engine) ≠ line `approvedAmount` (decision) ≠ Σ to claim header | Which per-line "payable" is authoritative; whether line breakdown conserves to header | R-1 rule + F6.2 per-claim reconciliation + F6.9 batch check | **Yes — Q1** |
| **D-2** | No claim-level `disallowedAmount`/`shortfallAmount`/`providerWriteOff`/`payerLiability` (line-only; claim writeoff is narrative text) | Claim-level breakdown must be **aggregated from lines**, not read from a header field | F6.2 (aggregate from lines) | Informational |
| **D-3** | `Claim.excessAmount` is dead (never written, always 0) | Must not appear; member share = `copayAmount` + cost-share only | — (documented) | No |
| **D-4** | `shortfallAmount` and `providerWriteOff` both written by engine (`persist.ts:80,84`) with overlapping intent | Which is the displayed "provider writeoff"; risk of double-count if summed | F6.2 (define `providerWriteOff` as the display field; treat `shortfallAmount` as the pre-policy magnitude) | **Yes — Q2** |
| **D-5** | No per-line `paidAmount` | Line paid is **derived** (`= line approvedAmount` when PAID; pro-rata fallback) | F6.2 (§5 formula) | Informational |
| **D-6** | No per-line currency/base amount | No per-line base reconciliation; I6 asserted at claim/batch grain only | F6.2 (txn-ccy lines; base at claim/batch) | Informational |
| **D-7** | **`ProviderDisbursement` does not exist** (D16). "Paid" = accounting state, not actual bank fact (no method/reference/value-date/status) | I5's final equality (`= successful disbursement`) is uncheckable; §8.9 "disbursement facts" column is empty | **F6.7/F6.8** (additive; must not weaken the atomic gate) | **Yes — Q5** (state machine) |
| **D-8** | Precision non-uniform: `PaymentVoucher.totalAmount`, `Claim.approvedAmount/paidAmount/billedAmount`, `ClaimLine.approvedAmount`, `JournalLine.debit/credit` are unannotated → `DECIMAL(65,30)`; others `(14,2)`/`(19,4)` | Comparisons/exports must round HALF_UP 2dp at the boundary; conservation uses `Decimal` with an explicit epsilon | F6.2 (Decimal + boundary rounding); optional later constraint tightening (§11.2) | Informational |
| **D-9** | `ProviderSettlementBatch.baseTotalAmount` is `0` until mark-paid (only txn `totalAmount` frozen at creation) | Base total is meaningful only for SETTLED batches; earlier states show base as pending | F6.2 (guard by status) | Informational |
| **D-10** | Human-adjudicated declines may have `reasonCodeId = null` (only free text) | No structured safe reason → generic safe fallback required | F6.2 (fallback text) | **Yes — Q3** |
| **D-11** | Legacy PAID claims with `paymentVoucherId = null` predate the voucher/GL trail | Excluded from strict conservation; reported informationally (as today) | F6.9 (carve-out, non-failing) | Informational |
| **D-12** | Batch↔voucher link is a plain scalar (no DB relation/constraint) | 1:1 not DB-enforced | F6.2 (scalar join) + F6.9 (assert 1:1) | Informational |

---

## 10. Worked examples (evidence requirement)

All amounts illustrative; **UGX** unless stated. Each shows the §4 fields and the §8 conservation check. These become F6.2/F11.3 test fixtures.

### E1 — Full pay, single line
Billed 10,000; contracted allowed 10,000; no member share.
- Line: `billedAmount` 10,000 · `contractedAmount` 10,000 · `disallowedAmount` 0 · `memberLiability` 0 · `providerWriteOff` 0 · `approvedAmount` 10,000 · derived paid 10,000.
- Claim: `approvedAmount` 10,000 = `paidAmount` 10,000; `memberLiability` 0.
- Batch (1 claim): `totalAmount` 10,000 = voucher 10,000 = Σ paid 10,000. **I5 ✅**. Base = 10,000 (UGX). **I6 ✅**.

### E2 — Partial pay: billed above contract (provider writeoff)
Billed 12,000; contract rate 10,000 (`PRC-001`, SHORTFALL).
- Line: `billedAmount` 12,000 · `contractedAmount` 10,000 · `disallowedAmount` 0 · `providerWriteOff` 2,000 · `memberLiability` 0 · `approvedAmount` 10,000 · paid 10,000.
- Reason shown: `PRC-001.providerDescription` "Billed above the contracted rate; paid to the contracted amount. The difference is not payable and may not be billed to the member."
- Claim: `approvedAmount` = `paidAmount` = 10,000. Header identity: 12,000 billed = 10,000 approved + 0 member + 2,000 writeoff. **✅**
- Batch: `totalAmount` 10,000 = voucher = paid. **I5 ✅**.

### E3 — Decline / exclusion (disallowed outright)
Billed 8,000; service excluded (`EXC-001`, REJECT).
- Line: `billedAmount` 8,000 · `contractedAmount` 0/null · `disallowedAmount` 8,000 · `approvedAmount` 0 · paid 0.
- Reason: `EXC-001.providerDescription` "This service is excluded by your agreement."
- If the **whole claim** declines, it never enters a settlement batch (batch scoops only APPROVED/PARTIALLY_APPROVED, `claim-adjudication.service.ts:383-393`) — so it appears on the **claim/exception** surface, not a remittance. A declined **line** within an otherwise-approved claim appears on the remittance with paid 0 and the safe reason.

### E4 — Multi-line, mixed outcomes + member cost-share
Line 1 billed 5,000 → allowed 5,000, approved 5,000. Line 2 billed 3,000 → `PRC-001` writeoff 500, approved 2,500. Line 3 billed 2,000 → `EXC-001` disallowed 2,000, approved 0. Plan copay 10% on approved.
- Line approved: 5,000 + 2,500 + 0 = **7,500** = claim `approvedAmount`.
- Member share (Track A, claim-level): copay 10% × 7,500 = 750 → `Claim.memberLiability` 750; `paidAmount`/`approvedAmount` = 7,500 (payer liability; member pays the copay to the provider directly).
- Provider writeoff Σ = 500; disallowed Σ = 2,000. Header: 10,000 billed = 7,500 approved + 2,000 disallowed + 500 writeoff. **✅**
- Batch: `totalAmount` = 7,500 = paid. **I5 ✅** (line approved Σ = header — D-1 satisfied here).

### E5 — Supplemental (reconsideration award)
Original claim approved 7,500 / paid 7,500 (from E4). Reconsideration accepts +1,000 on line 2 (`awardedIncrement` 1,000; `maxIncrement` ≥ 1,000; `alreadyApproved` 2,500).
- Supplemental child (`submissionType` RECONSIDERATION, `chainRootClaimId` = original): one line `billedAmount`/`approvedAmount` = **1,000** (the delta only). `ClaimReconsideration.supplementalClaimId` → child.
- Child settles in its own/next batch: batch `totalAmount` 1,000 = voucher = paid. **I5 ✅** for that batch.
- **I4 ceiling:** original 7,500 (line-2 portion 2,500) + supplemental 1,000 = 3,500 on line 2 ≤ corrected entitlement 3,500. **✅** Original claim untouched (D13).

### E6 — Multi-currency (Phase-1 boundary case)
Claim billed USD 100; decision-date FX 1 USD = 3,900 UGX → `approvedAmount` (txn) USD 100, `approvedBaseAmount` 390,000 UGX, `fxRateToBase` 3,900 (frozen).
- A batch is **single-currency**: this USD claim settles in a **USD batch** (`currency` USD). `totalAmount` USD 100; `baseTotalAmount` 390,000 UGX; GL posts 390,000 UGX (Dr 2010/Cr 1010).
- I5 asserts in **USD**: batch 100 = voucher 100 = paid 100. I6 asserts in **UGX**: 390,000 = base total = voucher base = GL. The two axes are **not** cross-summed. A UGX claim may **not** join this USD batch (mixed-currency refused). Multi-currency-per-statement aggregation is deferred — **Q4**.

---

## 11. Handoff to F6.2 (what to build from this)

1. `ProviderRemittanceService.getBatchRemittance(ctx, batchId)` authorizes provider/permission (F1.3), loads the frozen batch + its claims + lines + voucher **by stored snapshot** (no pricing call), projects **exactly** §4 (provider-safe subset for provider audiences), aggregates claim-level breakdown from lines (D-2), derives line paid (§5, D-5), maps reasons via §7, and returns the §8 conservation result computed with `Decimal`.
2. Deterministic pagination of claim/line detail such that **paginated page subtotals + carried totals still reconcile** to the batch (I5).
3. Exclude every "Safe? = N" field from provider output; expose them only through the F6.3 admin extension.
4. Emit a per-claim **residual/divergence flag** (R-1, D-1) rather than silently trusting either track.

---

## 12. Sign-off (PENDING — this is the gate)

F6.2 must not read to any provider audience, and `providerRemittanceV2` must stay **off** (§11.1), until this section is signed. Decisions to ratify:

- **Q1 (R-1, D-1).** Confirm `Claim.approvedAmount` (Track A) is the settlement-authoritative payable, that the per-line breakdown is *indicative provenance*, and that a per-claim residual is displayed (not suppressed) when lines don't reconcile to the header.
- **Q2 (D-4).** Confirm `providerWriteOff` is the displayed "provider writeoff" and `shortfallAmount` is the pre-policy magnitude (never summed together).
- **Q3 (D-10).** Approve the generic safe-reason fallback wording for human-adjudicated lines lacking `reasonCodeId`.
- **Q4 (currency).** Confirm **single-currency-per-batch** for Phase 1 and that multi-currency-per-statement aggregation is deferred.
- **Q5 (D-7, D16).** Approve the `ProviderDisbursement` state machine (`PENDING/RELEASED/PROCESSING/SUCCEEDED/FAILED/REVERSED`) and that "paid" on a provider statement means **accounting-settled** until F6.8 records real disbursement facts (statement must label this honestly).

| Role | Name | Decision | Date | Signature |
|---|---|---|---|---|
| Claims (reason mapping, Q1/Q3) | _pending_ | | | |
| Network operations (provider-safe field policy) | _pending_ | | | |
| Finance (conservation, Q2/Q4/Q5, GL) | _pending_ | | | |

**Until all three sign:** F6.1 stands as an internal specification (§11.6 stage 1 "internal evidence only"); no provider-facing remittance read is activated.

---

*F6.1 deliverable — no code, no schema, no data change. Every source fact above is a real column/service at the cited `schema.prisma`/service line on `feat/provider-network-os`. Downstream packages implement against this dictionary; amendments require finance re-sign-off.*
