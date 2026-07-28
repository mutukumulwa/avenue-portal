/**
 * F6.5 — remittance CSV serializer (pure; always runs).
 *
 * Formula-injection neutralization, RFC-4180 quoting, a stable versioned column
 * dictionary, deterministic sha256 checksum, UTF-8 BOM, and totals that match the
 * read model. No DB.
 */
import { describe, it, expect } from "vitest";
import { csvCell, buildRemittanceCsv, REMITTANCE_CSV_COLUMNS, REMITTANCE_CSV_VERSION } from "@/server/services/provider-remittance/csv";
import { projectBatch, projectClaim, computeConservation, type RemittanceClaimInput } from "@/server/services/provider-remittance/projection";

describe("F6.5 csvCell", () => {
  it("neutralizes spreadsheet-formula-injection leads (= + - @ TAB CR)", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("\tx")).toBe("'\tx"); // TAB is neutralized but not an RFC-4180 quote trigger
    expect(csvCell("\rx")).toBe(`"'\rx"`); // CR is neutralized AND forces RFC-4180 quoting
  });
  it("RFC-4180 quotes delimiters/quotes/newlines and doubles quotes", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("leaves a plain value and a positive money string untouched", () => {
    expect(csvCell("Consultation")).toBe("Consultation");
    expect(csvCell("7500.00")).toBe("7500.00");
    expect(csvCell(null)).toBe("");
  });
  it("neutralizes then quotes a hostile cell that is both", () => {
    // starts with '=' AND contains a comma
    expect(csvCell("=1,2")).toBe('"\'=1,2"');
  });
});

// Build a realistic model via the projection helpers (as the DB path does).
function model(over: Partial<RemittanceClaimInput> = {}) {
  const batch = projectBatch(
    { id: "b1", cycleMonth: 7, cycleYear: 2026, sequence: 1, currency: "UGX", baseCurrency: "UGX", status: "SETTLED", settledAt: new Date("2026-07-31"), claimCount: 1, totalAmount: 7500, baseTotalAmount: 7500 },
    { voucherNumber: "PV-1", totalAmount: 7500, baseTotalAmount: 7500, status: "PROCESSED", processedAt: new Date("2026-07-31") },
  );
  const claimInput: RemittanceClaimInput = {
    id: "c1", claimNumber: "CLM-1", status: "PAID", currency: "UGX", baseCurrency: "UGX",
    serviceType: "OUTPATIENT", dateOfService: new Date("2026-07-01"),
    billedAmount: 10000, approvedAmount: 7500, paidAmount: 7500, memberLiability: 0,
    approvedBaseAmount: 7500, billedBaseAmount: 10000, declineReasonCode: null,
    submissionType: "ORIGINAL", chainRootClaimId: "c1", supersedesClaimId: null, supersededByClaimId: null,
    member: { memberNumber: "ALP-1", firstName: "Amina", lastName: "Namárközy" }, // Unicode
    lines: [
      // a HOSTILE description that a spreadsheet would evaluate
      { id: "l1", lineNumber: 1, description: "=cmd|' /C calc'!A1", cptCode: null, quantity: 1, billedAmount: 5000, contractedAmount: 5000, disallowedAmount: 0, memberLiability: 0, providerWriteOff: 0, approvedAmount: 5000, payerLiability: 5000, reasonCode: null },
      { id: "l2", lineNumber: 2, description: "Ward, private", cptCode: "X1", quantity: 1, billedAmount: 5000, contractedAmount: 2500, disallowedAmount: 0, memberLiability: 0, providerWriteOff: 2500, approvedAmount: 2500, payerLiability: 2500, reasonCode: { code: "PRC-001", category: "Pricing", providerDescription: "Paid to the contracted amount.", remedy: null, resubmissionAllowed: false, defaultSeverity: "SHORTFALL" } },
    ],
    ...over,
  };
  const claim = projectClaim(claimInput);
  const conservation = computeConservation({
    currency: "UGX", baseCurrency: "UGX", status: "SETTLED", batchTotal: 7500, batchBaseTotal: 7500,
    voucher: { totalAmount: 7500, baseTotalAmount: 7500 }, sumClaimApproved: 7500, sumClaimPaid: 7500, sumClaimBase: 7500, sumLineApproved: 7500, disbursementRecorded: false,
  });
  return { batch, claims: [claim], conservation };
}

describe("F6.5 buildRemittanceCsv", () => {
  it("has a UTF-8 BOM, the versioned header, and the stable column dictionary", () => {
    const { csv } = buildRemittanceCsv(model());
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(`Remittance export v${REMITTANCE_CSV_VERSION}`);
    expect(csv).toContain(REMITTANCE_CSV_COLUMNS.join(","));
  });

  it("emits one data row per claim line + a TOTAL row; rowCount = lines", () => {
    const { csv, evidence } = buildRemittanceCsv(model());
    expect(evidence.rowCount).toBe(2);
    expect(csv).toContain("\r\nTOTAL,");
  });

  it("totals equal the read model (Σ line approved/paid/billed)", () => {
    const { evidence } = buildRemittanceCsv(model());
    expect(evidence.totals.approved).toBe("7500.00"); // 5000 + 2500
    expect(evidence.totals.paid).toBe("7500.00");
    expect(evidence.totals.billed).toBe("10000.00");
  });

  it("neutralizes a hostile line description in the output", () => {
    const { csv } = buildRemittanceCsv(model());
    expect(csv).not.toContain(",=cmd"); // never a raw formula lead after a delimiter
    expect(csv).toContain("'=cmd|' /C calc'!A1"); // rendered inert (contains no comma ⇒ unquoted)
  });

  it("checksum is a deterministic sha256 of identical input", () => {
    const a = buildRemittanceCsv(model()).evidence.checksum;
    const b = buildRemittanceCsv(model()).evidence.checksum;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    // a CSV-visible change (member name is on every row) ⇒ a different checksum
    const c = buildRemittanceCsv(model({ member: { memberNumber: "ALP-1", firstName: "Zed", lastName: "X" } })).evidence.checksum;
    expect(c).not.toBe(a);
  });

  it("preserves Unicode in member names", () => {
    const { csv } = buildRemittanceCsv(model());
    expect(csv).toContain("Namárközy");
  });
});
