/**
 * F6.9 — reconciliation classifier (pure; always runs). One fixture per mismatch type.
 */
import { describe, it, expect } from "vitest";
import { classifyBatchReconciliation, type BatchReconFacts } from "@/server/services/settlement-reconciliation/classify";

const clean = (over: Partial<BatchReconFacts> = {}): BatchReconFacts => ({
  batchId: "b1", currency: "UGX", baseCurrency: "UGX", hasVoucher: true,
  batchTotal: 1000, batchBaseTotal: 1000, voucherTotal: 1000,
  sumClaimApproved: 1000, sumClaimBase: 1000, sumLineApproved: 1000,
  sumSuccessfulDisbursement: 1000,
  ...over,
});

describe("F6.9 classifyBatchReconciliation", () => {
  it("a fully-conserved, fully-disbursed batch has no exceptions", () => {
    const r = classifyBatchReconciliation(clean());
    expect(r.reconciled).toBe(true);
    expect(r.i5Holds).toBe(true);
    expect(r.disbursement.fullyDisbursed).toBe(true);
    expect(r.disbursement.remaining).toBe("0.00");
  });

  it("under-disbursement is informational, not an exception", () => {
    const r = classifyBatchReconciliation(clean({ sumSuccessfulDisbursement: 400 }));
    expect(r.reconciled).toBe(true); // still conserved on the accounting spine
    expect(r.disbursement.fullyDisbursed).toBe(false);
    expect(r.disbursement.remaining).toBe("600.00");
    expect(r.disbursement.overDisbursed).toBe(false);
  });

  it("LINE_HEADER_MISMATCH: Σ line ≠ Σ claim", () => {
    const r = classifyBatchReconciliation(clean({ sumLineApproved: 900 }));
    expect(r.exceptions.map((e) => e.type)).toContain("LINE_HEADER_MISMATCH");
    expect(r.legs.lineToClaim).toBe(false);
    expect(r.reconciled).toBe(false);
  });

  it("CLAIM_BATCH_MISMATCH: Σ claim ≠ stored batch total", () => {
    const r = classifyBatchReconciliation(clean({ batchTotal: 1200, voucherTotal: 1200, batchBaseTotal: 1200 }));
    // Σ claim 1000 ≠ batch 1200 (and voucher matches batch) ⇒ claim↔batch mismatch
    expect(r.exceptions.map((e) => e.type)).toContain("CLAIM_BATCH_MISMATCH");
  });

  it("VOUCHER_MISMATCH: batch total ≠ voucher amount", () => {
    const r = classifyBatchReconciliation(clean({ voucherTotal: 950 }));
    expect(r.exceptions.map((e) => e.type)).toContain("VOUCHER_MISMATCH");
    expect(r.legs.batchToVoucher).toBe(false);
  });

  it("MISSING_VOUCHER: a settled batch with no voucher", () => {
    const r = classifyBatchReconciliation(clean({ hasVoucher: false, voucherTotal: null }));
    expect(r.exceptions.map((e) => e.type)).toContain("MISSING_VOUCHER");
    expect(r.legs.batchToVoucher).toBeNull();
    expect(r.i5Holds).toBe(false);
  });

  it("OVER_DISBURSED: Σ successful > batch total (a leak)", () => {
    const r = classifyBatchReconciliation(clean({ sumSuccessfulDisbursement: 1200 }));
    expect(r.exceptions.map((e) => e.type)).toContain("OVER_DISBURSED");
    expect(r.disbursement.overDisbursed).toBe(true);
    expect(r.disbursement.remaining).toBe("-200.00");
  });

  it("BASE_GL_MISMATCH: Σ claim base ≠ stored batch base (I6)", () => {
    const r = classifyBatchReconciliation(clean({ sumClaimBase: 999 }));
    expect(r.exceptions.map((e) => e.type)).toContain("BASE_GL_MISMATCH");
    expect(r.legs.baseClaimToBatch).toBe(false);
  });

  it("multi-currency: currency propagates; the base axis is independent", () => {
    const r = classifyBatchReconciliation({ batchId: "b2", currency: "USD", baseCurrency: "UGX", hasVoucher: true, batchTotal: 100, batchBaseTotal: 390000, voucherTotal: 100, sumClaimApproved: 100, sumClaimBase: 390000, sumLineApproved: 100, sumSuccessfulDisbursement: 100 });
    expect(r.currency).toBe("USD");
    expect(r.reconciled).toBe(true);
  });
});
