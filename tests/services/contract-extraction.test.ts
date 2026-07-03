import { describe, it, expect } from "vitest";
import { ContractExtractionService } from "@/server/services/contract-extraction.service";

// Corpus-like markdown (CIC pricelist shape): OCR-mangled rate table with some
// readable rows and some unreadable ones, conflicting effective dates, and
// review-based validity. The extractor must NOT guess missing amounts.
const CIC_MD = `# CIC Insurance tariff

_Source: \`Contracts/FFS RATES/CIC Insurance tariff.pdf\`_

## Page 1

RE: PRICELIST AGREEMENT EFFECTIVE 04: February 2025.

we are pleased to present the agreed-upon rate that will be implemented across our hospital
network starting from 01st February 2025. These packages will remain valid for a period of
one year, after which they will be subject to review.

|  Category            Item Name                          Agreed Rates
| CONSULTATION         Outpatient Consultation Fees        1,000.00      |
| CONSULTATION         Specialist Consultation Fees (OP)   2,000.00      |
| Procedure            Oxygen Therapy Per Hour             650.00        _|
| IP SERVICES          NUTRITIONIST REVIEW                 1,500.00      |
| Mo Minor Procedure   PLEURAL TAPPING
| Mo Minor Procedure   LUMBER PUNTURE
| Mo Minor Procedure   VENTILATOR
| AMBULANCE            AMBULANCE WITHIN 50KM               10,000.00     |
`;

describe("ContractExtractionService.parse", () => {
  const result = ContractExtractionService.parse(CIC_MD);

  it("extracts readable rate rows with correct amounts", () => {
    const consult = result.tariffCandidates.find(c => /Outpatient Consultation/i.test(c.description));
    expect(consult?.amount).toBe(1000);
    expect(consult?.rateMissing).toBe(false);
    expect(consult?.canonicalCategory).toBe("CONSULTATION");

    const oxygen = result.tariffCandidates.find(c => /Oxygen Therapy/i.test(c.description));
    expect(oxygen?.amount).toBe(650);

    const ambulance = result.tariffCandidates.find(c => /AMBULANCE WITHIN 50KM/i.test(c.description));
    expect(ambulance?.amount).toBe(10000);
  });

  it("flags unreadable rows as rateMissing — never guesses an amount", () => {
    const missing = result.tariffCandidates.filter(c => c.rateMissing);
    const descrs = missing.map(c => c.description.toUpperCase());
    expect(descrs.some(d => d.includes("PLEURAL TAPPING"))).toBe(true);
    expect(descrs.some(d => d.includes("LUMBER PUNTURE"))).toBe(true);
    expect(descrs.some(d => d.includes("VENTILATOR"))).toBe(true);
    // Zero-hallucination: every rate-missing candidate has a null amount + provenance.
    for (const m of missing) {
      expect(m.amount).toBeNull();
      expect(m.sourceRef.rawText.length).toBeGreaterThan(0);
      expect(m.sourceRef.page).toBe(1);
    }
    expect(result.stats.rowsMissingRate).toBe(missing.length);
    expect(result.stats.rowsMissingRate).toBeGreaterThanOrEqual(3);
  });

  it("detects conflicting effective dates and blocks (O3)", () => {
    expect(result.entities.effectiveDateCandidates).toContain("2025-02-04");
    expect(result.entities.effectiveDateCandidates).toContain("2025-02-01");
    const amb = result.ambiguities.find(a => a.type === "AMBIGUOUS_EFFECTIVE_DATE");
    expect(amb).toBeTruthy();
    expect(amb?.blocking).toBe(true);
  });

  it("detects review-based validity (O4)", () => {
    expect(result.entities.reviewBased).toBe(true);
    expect(result.ambiguities.some(a => a.type === "VALIDITY_REVIEW_BASED")).toBe(true);
  });

  it("raises a blocking rate-missing ambiguity", () => {
    const amb = result.ambiguities.find(a => a.type === "RATE_MISSING_ROWS");
    expect(amb?.blocking).toBe(true);
  });

  it("no amount is fabricated — every non-missing candidate's amount appears in its source text", () => {
    for (const c of result.tariffCandidates) {
      if (c.rateMissing) continue;
      const raw = c.sourceRef.rawText.replace(/,/g, "");
      expect(raw).toContain(String(c.amount));
    }
  });

  it("is deterministic — same markdown yields identical candidate count", () => {
    const again = ContractExtractionService.parse(CIC_MD);
    expect(again.tariffCandidates.length).toBe(result.tariffCandidates.length);
    expect(again.entities.effectiveDateCandidates).toEqual(result.entities.effectiveDateCandidates);
  });
});
