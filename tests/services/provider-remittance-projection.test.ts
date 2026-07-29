/**
 * F6.2 — pure remittance projection + conservation (no DB; always runs).
 *
 * Encodes the F6.1 worked examples (docs/provider-network-os/
 * REMITTANCE_FIELD_DICTIONARY.md §10) as conservation fixtures and proves the
 * provider-safe reason mapping + Decimal money rendering.
 */
import { describe, it, expect } from "vitest";
import {
  money,
  safeClaimDeclineReason,
  safeLineReason,
  projectLine,
  projectClaim,
  projectBatch,
  computeConservation,
  type ConservationInput,
  type RemittanceLineInput,
  type RemittanceClaimInput,
} from "@/server/services/provider-remittance/projection";

describe("F6.2 money() — HALF_UP 2dp boundary (D-8/D25)", () => {
  it("renders number/string/Decimal-like/null", () => {
    expect(money(10000)).toBe("10000.00");
    expect(money("2500.5")).toBe("2500.50");
    expect(money({ toString: () => "390000" })).toBe("390000.00"); // Prisma.Decimal-like
    expect(money(null)).toBe("0.00");
  });
  it("rounds half up", () => {
    expect(money("1.005")).toBe("1.01");
    expect(money("1.004")).toBe("1.00");
  });
});

describe("F6.2 provider-safe reason mapping (§7/D18)", () => {
  it("claim decline: FRAUD_SUSPECTED is neutralised (no fraud word)", () => {
    const r = safeClaimDeclineReason("FRAUD_SUSPECTED");
    expect(r).not.toBeNull();
    expect(r!.text.toLowerCase()).not.toContain("fraud");
    expect(r!.resubmissionAllowed).toBe(false);
  });
  it("claim decline: null → null; unknown code → generic fallback", () => {
    expect(safeClaimDeclineReason(null)).toBeNull();
    expect(safeClaimDeclineReason("WHATEVER")!.text).toMatch(/declined/i);
  });
  it("claim decline: known code maps to safe text", () => {
    expect(safeClaimDeclineReason("EXCLUSION")!.text).toMatch(/excluded/i);
  });
  it("line reason: uses providerDescription, never internalDescription (structurally)", () => {
    const r = safeLineReason({ code: "PRC-001", category: "Pricing", providerDescription: "Paid to the contracted amount.", remedy: "Bill to contract.", resubmissionAllowed: false, defaultSeverity: "SHORTFALL" });
    expect(r!.text).toBe("Paid to the contracted amount.");
    expect(r!.severity).toBe("SHORTFALL");
    expect(safeLineReason(null)).toBeNull();
  });
});

describe("F6.2 projectLine (§4.4)", () => {
  const base: RemittanceLineInput = {
    id: "l1", lineNumber: 1, description: "Consult", cptCode: "99213", quantity: 1,
    billedAmount: 12000, contractedAmount: 10000, disallowedAmount: 0, memberLiability: 0,
    providerWriteOff: 2000, approvedAmount: 10000, payerLiability: 10000, reasonCode: null,
  };
  it("derives paid from claim PAID state (§5)", () => {
    expect(projectLine(base, true).paid).toBe("10000.00");
    expect(projectLine(base, false).paid).toBe("0.00");
  });
  it("passes contractedAllowed null through", () => {
    expect(projectLine({ ...base, contractedAmount: null }, true).contractedAllowed).toBeNull();
  });
  it("exposes both approvedPayable (A) and enginePayable (B)", () => {
    const l = projectLine({ ...base, approvedAmount: 10000, payerLiability: 9000 }, true);
    expect(l.approvedPayable).toBe("10000.00");
    expect(l.enginePayable).toBe("9000.00");
  });
});

describe("F6.2 projectClaim (§4.3) — residual + lineage", () => {
  const mk = (over: Partial<RemittanceClaimInput> = {}): RemittanceClaimInput => ({
    id: "c1", claimNumber: "CLM-1", status: "PAID", currency: "UGX", baseCurrency: "UGX",
    serviceType: "OUTPATIENT", dateOfService: new Date("2026-07-01"),
    billedAmount: 10000, approvedAmount: 7500, paidAmount: 7500, memberLiability: 750,
    approvedBaseAmount: 7500, billedBaseAmount: 10000, declineReasonCode: null,
    submissionType: "ORIGINAL", chainRootClaimId: "c1", supersedesClaimId: null, supersededByClaimId: null,
    member: { memberNumber: "ALP-1", firstName: "Test", lastName: "Member" },
    lines: [
      { id: "l1", lineNumber: 1, description: "A", cptCode: null, quantity: 1, billedAmount: 5000, contractedAmount: 5000, disallowedAmount: 0, memberLiability: 0, providerWriteOff: 0, approvedAmount: 5000, payerLiability: 5000, reasonCode: null },
      { id: "l2", lineNumber: 2, description: "B", cptCode: null, quantity: 1, billedAmount: 3000, contractedAmount: 2500, disallowedAmount: 0, memberLiability: 0, providerWriteOff: 500, approvedAmount: 2500, payerLiability: 2500, reasonCode: null },
      { id: "l3", lineNumber: 3, description: "C", cptCode: null, quantity: 1, billedAmount: 2000, contractedAmount: null, disallowedAmount: 2000, memberLiability: 0, providerWriteOff: 0, approvedAmount: 0, payerLiability: 0, reasonCode: null },
    ],
    ...over,
  });

  it("E4: lines reconcile to the header (residual 0)", () => {
    const c = projectClaim(mk());
    expect(c.approved).toBe("7500.00");
    expect(c.lineResidual).toBe("0.00");
    expect(c.linesReconciled).toBe(true);
    expect(c.member!.name).toBe("Test Member");
  });
  it("D-1: header ≠ Σ lines ⇒ residual surfaced, not hidden", () => {
    const c = projectClaim(mk({ approvedAmount: 8000 })); // lines still sum to 7500
    expect(c.lineResidual).toBe("500.00");
    expect(c.linesReconciled).toBe(false);
  });
  it("lineage: a RECONSIDERATION child is a supplemental line (§6)", () => {
    const c = projectClaim(mk({ submissionType: "RECONSIDERATION", chainRootClaimId: "orig" }));
    expect(c.lineage.isSupplemental).toBe(true);
  });
});

describe("F6.2 computeConservation (§8/I5/I6) — worked examples", () => {
  const settled = (over: Partial<ConservationInput> = {}): ConservationInput => ({
    currency: "UGX", baseCurrency: "UGX", status: "SETTLED",
    batchTotal: 10000, batchBaseTotal: 10000,
    voucher: { totalAmount: 10000, baseTotalAmount: 10000 },
    sumClaimApproved: 10000, sumClaimPaid: 10000, sumClaimBase: 10000, sumLineApproved: 10000,
    disbursementRecorded: false,
    ...over,
  });

  it("E1 full pay: every applicable leg holds; I5 & I6 hold", () => {
    const c = computeConservation(settled());
    expect(c.i5Holds).toBe(true);
    expect(c.i6Holds).toBe(true);
    expect(c.legs.lineToHeader).toBe(true);
    expect(c.legs.paidToApproved).toBe(true);
    expect(c.disbursementLeg).toBe("MISSING"); // D-7 always today
  });

  it("E2 partial writeoff: payable spine still conserves (writeoff not in payable)", () => {
    // billed 12000 but approved/paid/batch/voucher all 10000; writeoff 2000 is off-spine
    const c = computeConservation(settled({ sumClaimApproved: 10000, sumLineApproved: 10000, sumClaimPaid: 10000, batchTotal: 10000, voucher: { totalAmount: 10000, baseTotalAmount: 10000 } }));
    expect(c.i5Holds).toBe(true);
  });

  it("D-1: line Σ diverges from header ⇒ i5Holds false + D-1 note", () => {
    const c = computeConservation(settled({ sumLineApproved: 9000 }));
    expect(c.legs.lineToHeader).toBe(false);
    expect(c.i5Holds).toBe(false);
    expect(c.notes.join(" ")).toMatch(/D-1/);
  });

  it("header↔batch mismatch (stored total drift) ⇒ headerToBatch false", () => {
    const c = computeConservation(settled({ batchTotal: 9999 }));
    expect(c.legs.headerToBatch).toBe(false);
    expect(c.i5Holds).toBe(false);
  });

  it("pre-settlement batch: paid/base legs are N/A (null), i6 null", () => {
    const c = computeConservation(settled({ status: "CHECKER_APPROVED", voucher: null, sumClaimPaid: 0, batchBaseTotal: 0 }));
    expect(c.legs.paidToApproved).toBeNull();
    expect(c.legs.batchToVoucher).toBeNull();
    expect(c.i6Holds).toBeNull();
    expect(c.i5Holds).toBe(true); // spine (line=header=batch) still holds
    expect(c.notes.join(" ")).toMatch(/not yet SETTLED/);
  });

  it("E6 multi-currency: currency propagated; base axis independent", () => {
    const c = computeConservation({
      currency: "USD", baseCurrency: "UGX", status: "SETTLED",
      batchTotal: 100, batchBaseTotal: 390000,
      voucher: { totalAmount: 100, baseTotalAmount: 390000 },
      sumClaimApproved: 100, sumClaimPaid: 100, sumClaimBase: 390000, sumLineApproved: 100,
      disbursementRecorded: false,
    });
    expect(c.currency).toBe("USD");
    expect(c.sumClaimPayable).toBe("100.00");
    expect(c.sumClaimBase).toBe("390000.00");
    expect(c.i5Holds).toBe(true);
    expect(c.i6Holds).toBe(true);
  });
});

describe("F6.2 projectBatch (§4.1/§4.2) — safe header + honest payment facts", () => {
  const batch = { id: "b1", cycleMonth: 7, cycleYear: 2026, sequence: 1, currency: "UGX", baseCurrency: "UGX", status: "SETTLED", settledAt: new Date(), claimCount: 2, totalAmount: 10000, baseTotalAmount: 10000 };
  it("D-7: disbursement is null + payment facts flagged not-recorded", () => {
    const h = projectBatch(batch, { voucherNumber: "PV-1", totalAmount: 10000, baseTotalAmount: 10000, status: "PROCESSED", processedAt: new Date() });
    expect(h.disbursement).toBeNull();
    expect(h.paymentFactsRecorded).toBe(false);
    expect(h.voucher!.voucherNumber).toBe("PV-1");
    expect((h.voucher as Record<string, unknown>).journalEntryId).toBeUndefined(); // never projected
  });
  it("D-9: base total only shown once SETTLED", () => {
    const h = projectBatch({ ...batch, status: "CHECKER_APPROVED", settledAt: null, baseTotalAmount: 0 }, null);
    expect(h.baseTotalAmount).toBeNull();
    expect(h.voucher).toBeNull();
  });
});
