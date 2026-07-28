/**
 * F7.3 — contract rate-schedule CSV serializer (pure).
 *
 * Proves the export carries ONLY the allow-listed rate columns (an internal
 * field cannot appear because it is not on the TariffView it serialises),
 * neutralises spreadsheet formula-injection, watermarks the recipient, surfaces
 * rateMissing safely, and is byte-deterministic (stable sha256).
 */
import { describe, it, expect } from "vitest";
import { buildContractRatesCsv, CONTRACT_RATES_CSV_COLUMNS, CONTRACT_RATES_CSV_VERSION } from "@/server/services/provider-contract-view/csv";
import type { ContractHeaderView, TariffView } from "@/server/services/provider-contract-view/projection";

const header = {
  contractNumber: "PC-2026-001", title: "2026 MSA", effectiveLabel: "CURRENT", currency: "UGX",
} as unknown as ContractHeaderView;

function rate(over: Partial<TariffView> = {}): TariffView {
  return {
    id: "t1", service: "General Consultation", cptCode: "99213", providerCode: "SER001", codingSystem: "CPT",
    rate: "1500", currency: "UGX", rateType: "FIXED", tariffType: "NEGOTIATED",
    discountPct: null, markupPct: null, maxPayable: null, minPayable: null, unit: "PER_ITEM",
    maxQuantityPerVisit: 1, quantityLimit: null, frequencyLimit: null, frequencyPeriod: null,
    genderRestriction: null, ageMin: null, ageMax: null, requiresPreauth: false, requiresReferral: false,
    externalRebate: null, rateUnderConfirmation: false, effectiveFrom: new Date("2026-01-01"), effectiveTo: null,
    ...over,
  };
}

describe("F7.3 buildContractRatesCsv", () => {
  it("has a BOM, the versioned column header, and one row per rate", () => {
    const { csv, evidence } = buildContractRatesCsv({ header, providerName: "Aga Khan", rates: [rate(), rate({ id: "t2", service: "FBC" })] });
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain(CONTRACT_RATES_CSV_COLUMNS.join(","));
    expect(evidence.version).toBe(CONTRACT_RATES_CSV_VERSION);
    expect(evidence.rowCount).toBe(2);
    expect(evidence.contractNumber).toBe("PC-2026-001");
  });

  it("watermarks the recipient and marks the file confidential (traceable if leaked)", () => {
    const { csv } = buildContractRatesCsv({ header, providerName: "Aga Khan Hospital", rates: [rate()] });
    expect(csv).toContain("CONFIDENTIAL");
    expect(csv).toContain("Aga Khan Hospital");
    expect(csv).toContain("do not redistribute");
  });

  it("neutralises spreadsheet formula-injection in a service name", () => {
    const { csv } = buildContractRatesCsv({ header, providerName: "P", rates: [rate({ service: "=cmd|'/c calc'!A1" })] });
    // OWASP: a leading = is rendered inert with a leading apostrophe.
    expect(csv).toContain("'=cmd");
    expect(csv).not.toMatch(/(^|,)=cmd/m);
  });

  it("RFC-4180 quotes a cell containing a comma", () => {
    const { csv } = buildContractRatesCsv({ header, providerName: "P", rates: [rate({ service: "Consult, extended" })] });
    expect(csv).toContain('"Consult, extended"');
  });

  it("rateMissing surfaces as 'under confirmation', never a blank price", () => {
    const { csv } = buildContractRatesCsv({ header, providerName: "P", rates: [rate({ rate: null, rateUnderConfirmation: true })] });
    expect(csv).toContain("under confirmation");
  });

  it("carries no internal token (the serialiser reads only the allow-listed view)", () => {
    const { csv } = buildContractRatesCsv({ header, providerName: "P", rates: [rate()] });
    for (const tok of ["sourceRef", "confidence", "rawText", "poolId", "creditLimit", "notes"]) {
      expect(csv).not.toContain(tok);
    }
  });

  it("is byte-deterministic — the checksum is stable across calls (no wall-clock in the body)", () => {
    const a = buildContractRatesCsv({ header, providerName: "P", rates: [rate(), rate({ id: "t2", service: "FBC" })] });
    const b = buildContractRatesCsv({ header, providerName: "P", rates: [rate(), rate({ id: "t2", service: "FBC" })] });
    expect(a.csv).toBe(b.csv);
    expect(a.evidence.checksum).toBe(b.evidence.checksum);
    expect(a.evidence.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
