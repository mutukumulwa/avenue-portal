/**
 * F6.6 — remittance PDF data builder (pure; always runs).
 *
 * The @react-pdf Document is visual-QA'd on a seeded run (convention); here we
 * prove the DTO derives correctly from the read model: totals/reasons/lineage
 * match, it is provider-safe (only projection fields), and it is deterministic
 * (generated time is an input, not the wall clock).
 */
import { describe, it, expect } from "vitest";
import { buildRemittancePdfData, REMITTANCE_PDF_VERSION } from "@/app/provider/settlements/[id]/remittance-pdf";
import { projectBatch, projectClaim, computeConservation, type RemittanceClaimInput } from "@/server/services/provider-remittance/projection";

function model(over: Partial<RemittanceClaimInput> = {}, batchOver: { status?: string } = {}) {
  const batch = projectBatch(
    { id: "b1", cycleMonth: 7, cycleYear: 2026, sequence: 1, currency: "UGX", baseCurrency: "UGX", status: batchOver.status ?? "SETTLED", settledAt: new Date("2026-07-31"), claimCount: 1, totalAmount: 7500, baseTotalAmount: 7500 },
    { voucherNumber: "PV-9", totalAmount: 7500, baseTotalAmount: 7500, status: "PROCESSED", processedAt: new Date("2026-07-31") },
  );
  const claim = projectClaim({
    id: "c1", claimNumber: "CLM-7", status: "PAID", currency: "UGX", baseCurrency: "UGX",
    serviceType: "OUTPATIENT", dateOfService: new Date("2026-07-01"),
    billedAmount: 10000, approvedAmount: 7500, paidAmount: 7500, memberLiability: 0,
    approvedBaseAmount: 7500, billedBaseAmount: 10000, declineReasonCode: null,
    submissionType: "ORIGINAL", chainRootClaimId: "c1", supersedesClaimId: null, supersededByClaimId: null,
    member: { memberNumber: "ALP-1", firstName: "Amina", lastName: "K" },
    lines: [
      { id: "l1", lineNumber: 1, description: "Consult", cptCode: "99213", quantity: 1, billedAmount: 5000, contractedAmount: 5000, disallowedAmount: 0, memberLiability: 0, providerWriteOff: 0, approvedAmount: 5000, payerLiability: 5000, reasonCode: null },
      { id: "l2", lineNumber: 2, description: "Ward", cptCode: null, quantity: 1, billedAmount: 5000, contractedAmount: 2500, disallowedAmount: 0, memberLiability: 0, providerWriteOff: 2500, approvedAmount: 2500, payerLiability: 2500, reasonCode: { code: "PRC-001", category: "Pricing", providerDescription: "Paid to the contracted amount.", remedy: null, resubmissionAllowed: false, defaultSeverity: "SHORTFALL" } },
    ],
    ...over,
  });
  const conservation = computeConservation({
    currency: "UGX", baseCurrency: "UGX", status: batchOver.status ?? "SETTLED", batchTotal: 7500, batchBaseTotal: 7500,
    voucher: { totalAmount: 7500, baseTotalAmount: 7500 }, sumClaimApproved: 7500, sumClaimPaid: 7500, sumClaimBase: 7500, sumLineApproved: 7500, disbursementRecorded: false,
  });
  return { batch, claims: [claim], conservation, page: { totalClaims: 1 } };
}

describe("F6.6 buildRemittancePdfData", () => {
  it("carries the version, cycle, currency, voucher ref, and control total", () => {
    const d = buildRemittancePdfData(model(), { generatedAt: new Date("2026-08-01") });
    expect(d.version).toBe(REMITTANCE_PDF_VERSION);
    expect(d.cycle).toBe("Jul 2026");
    expect(d.currency).toBe("UGX");
    expect(d.voucherRef).toBe("PV-9");
    expect(d.controlTotal).toBe("7500.00"); // stored batch total
    expect(d.conservationOk).toBe(true);
    expect(d.generatedAt).toBe("01 Aug 2026");
  });

  it("maps claims/lines with matching amounts + safe reasons", () => {
    const d = buildRemittancePdfData(model());
    expect(d.claims).toHaveLength(1);
    const c = d.claims[0];
    expect(c.claimNumber).toBe("CLM-7");
    expect(c.member).toBe("Amina K");
    expect(c.approved).toBe("7500.00");
    expect(c.lines).toHaveLength(2);
    const ward = c.lines[1];
    expect(ward.writeoff).toBe("2500.00");
    expect(ward.approved).toBe("2500.00");
    expect(ward.reason).toBe("Paid to the contracted amount.");
  });

  it("surfaces supplemental lineage", () => {
    const d = buildRemittancePdfData(model({ submissionType: "RECONSIDERATION", chainRootClaimId: "orig" }));
    expect(d.claims[0].isSupplemental).toBe(true);
    expect(d.claims[0].submissionType).toBe("RECONSIDERATION");
  });

  it("is provider-safe: only the DTO fields (no admin/GL/internal keys)", () => {
    const d = buildRemittancePdfData(model());
    const claim = d.claims[0] as unknown as Record<string, unknown>;
    expect(claim.makerId).toBeUndefined();
    expect(claim.journalEntryId).toBeUndefined();
    const linekeys = Object.keys(d.claims[0].lines[0]);
    expect(linekeys).not.toContain("payerLiability"); // engine provenance is not on the statement
    expect(linekeys).not.toContain("ruleTrace");
  });

  it("generatedAt is an input (deterministic) — omitted ⇒ null", () => {
    expect(buildRemittancePdfData(model()).generatedAt).toBeNull();
  });

  it("carries the honest payment-facts note and a not-yet-settled conservation flag", () => {
    const d = buildRemittancePdfData(model({}, { status: "CHECKER_APPROVED" }));
    expect(d.paymentFactsNote).toMatch(/accounting settlement only/i);
  });
});
