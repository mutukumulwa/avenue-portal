# F0.5 — Settlement and Money-Conservation Baseline (characterized 2026-07-23)

**Branch/commit:** `feat/provider-network-os` @ `0f6064c`
**Scope:** trace claim line → decision → batch → voucher → GL/fund → current payment evidence; identify where "paid" is set and what actual payment facts exist; compare admin/provider outputs; write baseline conservation queries. Read-only — **no production mutation**.

---

## 1. The money path (verified, end to end)

```
claim line (approvedAmount, approvedBaseAmount, currency)
  → ClaimDecisionService (decision-time: books Claims Payable liability in BASE ccy; consumes hold/benefit)
  → ProviderSettlementBatch  [claim-adjudication.service.ts:366 createSettlementBatch]
  → maker/checker (SettlementStatus: PENDING → MAKER_SUBMITTED → CHECKER_APPROVED)
  → markSettlementBatchPaid [claim-adjudication.service.ts:565]  ← THE money moment
       ├─ batch CHECKER_APPROVED → SETTLED (atomic updateMany guard, first write)
       ├─ GLService.postSettlementBatchPaid (JE clears Claims Payable in base ccy)
       ├─ PaymentVoucher.create (status PROCESSED, links batch + JE)
       └─ claims → PAID, paidAmount = approvedAmount (set-based)
```

## 2. Where "paid" is set — single owner

`ProviderClaimAdjudicationService.markSettlementBatchPaid` (`claim-adjudication.service.ts:565-720`) is the **only** provider-settlement paid-setter. Key properties verified:

- **Atomic exactly-once gate (FG-C7):** `tx.providerSettlementBatch.updateMany({where:{status:"CHECKER_APPROVED"}, data:{status:"SETTLED"}})` is the FIRST write; `claimed.count !== 1` → CONFLICT → whole tx rolls back before any voucher/GL. Prevents double voucher / double bank-credit (`:642-665`).
- **Single-currency invariant** enforced at both creation (`:459-472`) and pay time (`:613-620`) — never sums across currencies.
- **Two totals:** `total` = Σ `approvedAmount` (transaction ccy, → voucher `totalAmount`); `baseTotal` = Σ `approvedBaseAmount` (base UGX, → GL JE + `baseTotalAmount`). Legacy claims w/o base snapshot fall back to transaction amount (`:626-633`).
- **Fraud gate (OBS-H1):** unresolved alerts ≥ threshold block Mark Paid (`:589-608`).
- **Lifecycle guard (F7.1):** `assertClaimTransition(status,"PAID")` per claim before the set-based `updateMany` + raw `paidAmount = approvedAmount` (`:704-712`).
- Timings: `maxWait 15000, timeout 60000` (PR-V02 set-based fix — per-claim loop previously blew the 5s limit).

**Other `status:"SETTLED"` setters** (NOT provider settlement — recorded so F6 doesn't conflate): `cross-border.service.ts:299` (cross-border settlement), `reimbursement.service.ts:243` (member reimbursement disbursement), `bank-reconciliation.service.ts:189` (group-invoice `Payment.paidAmount` increment). These are distinct ledgers.

## 3. What "actual payment facts" exist today — the D16 gap

| Spec §7.9 `ProviderDisbursement` field | Exists today? |
|---|---|
| method/channel | ❌ |
| external payment reference | ❌ (voucher number is an internal doc number, not a bank reference) |
| value date | ❌ (only `settledAt` = the DB write time) |
| masked destination | ❌ |
| status PENDING/RELEASED/PROCESSING/SUCCEEDED/FAILED/REVERSED | ❌ (only batch `SETTLED` + voucher `PROCESSED`) |
| reversal facts | ❌ |
| idempotency key | ⚠️ atomic status-gate substitutes, but no explicit key |

**Finding (matches spec §4.2 #17):** "paid" is an internal accounting state, not evidence of actual disbursement. `PaymentVoucher` "authorizes/represents" payment (D16's voucher role) but there is **no `ProviderDisbursement` recording real method/reference/value-date**. The generic `Payment` model (`schema:4373`) is group-invoice receivables, not provider disbursement (spec §4.2 #17 confirmed). **F6.7/F6.8 build this — additive.**

## 4. Admin vs provider settlement output comparison

| Surface | Source | Fields shown |
|---|---|---|
| Provider `/provider/settlements` | direct prisma (`settlements/page.tsx:22-41`): batch + `aggregate(SETTLED)` + vouchers | cycle/seq, claim count, `totalAmount`, voucher #, status, settledAt — **list only, no line detail, no reasons, no conservation, no disbursement facts** |
| Provider `/provider/cases` | `CaseService.getCaseReconciliation` (shared read-model) | per-case billed/approved/paid/outstanding/remaining-guarantee (A6 parity) |
| Admin settlement | tRPC/admin pages (not read in full here — F6.3 characterizes) | maker/checker + batch build + Mark Paid |

**No canonical `ProviderRemittanceService` exists** (spec §4.2 #16 confirmed) — provider and admin each query settlement tables directly. F6.2 introduces the one read model; F6.3 migrates admin onto it.

## 5. GL / fund

- `GLService.postSettlementBatchPaid` (`gl.service.ts`) posts the settlement JE (base ccy) inside the Mark-Paid tx; JE `sourceType:"SETTLEMENT_PAID"`, bank account code `1010`.
- Decision-time posting books the Claims Payable liability (cleared at settlement) — `financial-posting-coverage.service.ts` is the coverage reporter.
- `FundTransaction` (`schema:1477`) + `funding-model.service.ts` = self-funded client fund ledger (separate conservation; NWSC fund-deposit ties from the inpatient engagement).
- FX: `fx.service.ts` + frozen `approvedBaseAmount` snapshots on the claim; settlement never recomputes base from current FX (D6/D15/I6 already respected at settlement — remittance must preserve this).

## 6. Baseline conservation queries (the existing invariant + the ones F6/F11.3 extend)

**Existing (shipped in `scripts/data-integrity-check.ts:55-93`), verified formula:**
```
Σ approvedAmount over PAID claims WHERE paymentVoucherId IS NOT NULL, !isReimbursement
  == Σ credit over JournalLine WHERE account.code='1010' AND JE.sourceType='SETTLEMENT_PAID', POSTED
  (EPS tolerance; legacy voucherless PAID claims reported informationally, not failed)
```
This is the current settlement recon invariant. It ties **claim → GL** but NOT batch total ↔ voucher amount ↔ disbursement (no disbursement exists yet).

**Spec §D25/I5 target (F6/F11.3 must add):**
```
Σ(remittance line payable) = Σ(remittance claim payable) = batch.totalAmount
  = voucher.totalAmount = Σ(successful disbursement amount)      [per batch/currency]
Σ(baseTotalAmount) reconciles independently via frozen FX to the GL JE.
```
Today the middle links (batch.totalAmount ↔ voucher.totalAmount) hold by construction in `markSettlementBatchPaid` (both = Σ approvedAmount of batch claims), but there is **no independent verification job** comparing stored `batch.totalAmount` against Σ claim `approvedAmount` after the fact, and **no disbursement leg** — F6.9 builds the reconciliation job.

**Frozen-example capture (run read-only when a seeded/UAT DB is available — not run here, no sanctioned DB):**
```sql
-- pick representative batches: full, partial (claim approved<billed), multi-line, and any multi-run (sequence>1)
SELECT b.id, b."cycleMonth", b."cycleYear", b.sequence, b.status, b.currency,
       b."totalAmount", b."baseTotalAmount", b."claimCount",
       (SELECT COUNT(*) FROM "Claim" c WHERE c."settlementBatchId"=b.id) AS actual_claims,
       (SELECT COALESCE(SUM(c."approvedAmount"),0) FROM "Claim" c WHERE c."settlementBatchId"=b.id) AS sum_approved,
       (SELECT COALESCE(SUM(c."paidAmount"),0) FROM "Claim" c WHERE c."settlementBatchId"=b.id) AS sum_paid,
       v."voucherNumber", v."totalAmount" AS voucher_total, v."journalEntryId"
FROM "ProviderSettlementBatch" b
LEFT JOIN "PaymentVoucher" v ON v."settlementBatchId"=b.id
ORDER BY b."createdAt" DESC LIMIT 25;
-- assert per SETTLED row: totalAmount == sum_approved == sum_paid == voucher_total; claimCount == actual_claims
```

## 7. What F6 inherits (gate E input)

1. `ProviderRemittanceService` (F6.2) — does not exist; provider+admin query tables directly. Frozen-fact read model, no live recompute (D15/I6 already honored via `approvedBaseAmount`).
2. `ProviderDisbursement` (F6.7/F6.8) — entirely missing; "paid" today = accounting state. Additive; must not weaken the FG-C7 atomic gate.
3. Reconciliation job (F6.9) — the shipped integrity check ties claim→GL; extend to batch/voucher/disbursement per I5, never auto-repair.
4. Single-currency batching is Phase-1 by finance decision; multi-currency settlement is deferred (F6.1 finance sign-off territory).
5. Payment queries (F6.10) — no model/surface exists.
6. **Do not disturb** the atomic exactly-once Mark-Paid gate, the frozen base-amount FX behavior, or the existing data-integrity invariant when layering remittance/disbursement on top.
