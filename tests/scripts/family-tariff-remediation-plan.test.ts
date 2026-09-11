/**
 * Family Hospital UAT plan P01.02 — the remediation planner
 * (scripts/lib/family-tariff-remediation-plan.ts).
 *
 * Fixtures reproduce the five collision classes the 2026-09-11 production
 * preflight found (ids invented; names, rates and units as loaded). The planner
 * must classify each by rule, never apply the lower-price rule to different
 * products, and leave a post-state in which every row is selectable.
 */
import { describe, it, expect } from "vitest";
import {
  compareDecimalText,
  planTariffRemediation,
  recordedUnit,
  spellComparisonSymbols,
  type RemediationTariff,
} from "../../scripts/lib/family-tariff-remediation-plan";

const FROM = new Date("2026-08-28T00:00:00Z");
function row(id: string, serviceName: string, agreedRate: string, over: Partial<RemediationTariff> = {}): RemediationTariff {
  return {
    id,
    providerId: "prov",
    contractId: "con",
    versionId: "ver",
    branchId: null,
    clientId: null,
    cptCode: null,
    providerServiceCode: null,
    serviceName,
    standardDescription: null,
    providerDescription: serviceName,
    tariffType: "NEGOTIATED",
    effectiveFrom: FROM,
    effectiveTo: null,
    agreedRate,
    currency: "UGX",
    rateType: "FIXED",
    serviceCategoryId: "cat",
    unitOfMeasure: "PER_ITEM",
    notes: null,
    ...over,
  };
}

// Candidate order = id order here (all share effectiveFrom), as in production.
const candidates: RemediationTariff[] = [
  row("a1", "Dextrose 5% 500Ml", "7590", { notes: "Unit: Bottle", serviceCategoryId: "drugs" }),
  row("a2", "Dextrose 5% 500Ml", "7590", { notes: "Unit: Bottle", serviceCategoryId: "consumables" }),
  row("b1", "Azithromycin 500Mg", "70000", { notes: "Unit: Vial" }),
  row("b2", "Azithromycin 500Mg", "4807", { notes: "Unit: Tab" }),
  row("c1", "Excision of Dermatosis papulosa nigra (>5 lesions)", "500000"),
  row("c2", "Excision of Dermatosis papulosa nigra (<5 lesions)", "270000"),
  row("d1", "Neogen Locking Head Screw 3.5Mm(14Mm)", "143000", { notes: "Unit: Piece" }),
  row("d2", "Neogen Locking Head Screw 3.5Mm (14Mm)", "132000", { notes: "Unit: Piece" }),
  row("e1", "Surgical Extraction", "200000"),
  row("e2", "Surgical Extraction -", "150000"),
  row("u1", "General Doctor Consult", "25000"),
];

const manifest = planTariffRemediation({ batchRef: "FH-P0102-TEST", contractId: "con", currency: "UGX", taxInclusive: "INCLUSIVE", candidates });
const group = (key: string) => manifest.groups.find((g) => g.key === key)!;

describe("planTariffRemediation", () => {
  it("keeps the engine's row for a same-price twin and deactivates the other", () => {
    expect(group("dextrose 5 500ml")).toMatchObject({ disposition: "EQUIVALENT_DUPLICATE", keepIds: ["a1"], deactivateIds: ["a2"], replacements: [] });
  });

  it("treats a Vial and a Tab as different products — the lower-price rule is NOT applied", () => {
    const g = group("azithromycin 500mg");
    expect(g.disposition).toBe("DISTINCT_BY_UNIT");
    expect(g.deactivateIds).toEqual(["b1", "b2"]);
    expect(g.replacements.map((r) => [r.supersedesId, r.serviceName, r.providerDescription])).toEqual([
      ["b1", "Azithromycin 500Mg (Vial)", "Azithromycin 500Mg (Vial)"],
      ["b2", "Azithromycin 500Mg (Tab)", "Azithromycin 500Mg (Tab)"],
    ]);
  });

  it("spells < and > out when they are the only difference", () => {
    const g = group("excision of dermatosis papulosa nigra 5 lesions");
    expect(g.disposition).toBe("DISTINCT_BY_SYMBOL");
    expect(g.replacements.map((r) => r.serviceName)).toEqual([
      "Excision of Dermatosis papulosa nigra (more than 5 lesions)",
      "Excision of Dermatosis papulosa nigra (less than 5 lesions)",
    ]);
  });

  it("applies the facility's lower-price rule to a true duplicate", () => {
    expect(group("neogen locking head screw 3 5mm 14mm")).toMatchObject({ disposition: "TRUE_DUPLICATE", keepIds: ["d2"], deactivateIds: ["d1"] });
    expect(group("surgical extraction")).toMatchObject({ disposition: "TRUE_DUPLICATE", keepIds: ["e2"], deactivateIds: ["e1"] });
  });

  it("leaves unique rows alone and produces a clean post-state", () => {
    expect(manifest.groups.flatMap((g) => g.rows.map((r) => r.id))).not.toContain("u1");
    expect(manifest.totals).toMatchObject({ candidateRows: 11, groups: 5, deactivate: 7, create: 4, activeAfter: 8, logicalServicesAfter: 8, unresolvedGroups: 0 });
    expect(manifest.postStateCheck).toEqual({ selectable: 8, shadowed: 0, ambiguous: 0, descriptionKeyCollisions: 0 });
  });

  it("marks a group it cannot decide as UNRESOLVED instead of guessing", () => {
    const m = planTariffRemediation({
      batchRef: "FH-P0102-TEST",
      contractId: "con",
      currency: "UGX",
      taxInclusive: "INCLUSIVE",
      candidates: [row("x1", "Thing", "100", { requiresPreauth: true }), row("x2", "Thing", "100")],
    });
    expect(m.groups[0].disposition).toBe("UNRESOLVED");
    expect(m.totals.unresolvedGroups).toBe(1);
  });

  it("is deterministic: same input, same hash; a different batch is a different manifest", () => {
    const again = planTariffRemediation({ batchRef: "FH-P0102-TEST", contractId: "con", currency: "UGX", taxInclusive: "INCLUSIVE", candidates });
    expect(again.manifestHash).toBe(manifest.manifestHash);
    const other = planTariffRemediation({ batchRef: "FH-P0102-OTHER", contractId: "con", currency: "UGX", taxInclusive: "INCLUSIVE", candidates });
    expect(other.manifestHash).not.toBe(manifest.manifestHash);
  });
});

describe("helpers", () => {
  it("recordedUnit reads the facility's Unit column as loaded into notes", () => {
    expect(recordedUnit("Unit: Vial")).toBe("Vial");
    expect(recordedUnit("PROVISIONAL — lower of two; Unit: Tab")).toBe("Tab");
    expect(recordedUnit(null)).toBeNull();
    expect(recordedUnit("Scope of cover")).toBeNull();
  });

  it("spellComparisonSymbols writes the symbol, not a paraphrase", () => {
    expect(spellComparisonSymbols("Excision (>5 lesions)")).toBe("Excision (more than 5 lesions)");
    expect(spellComparisonSymbols("Dose < 2 years")).toBe("Dose less than 2 years");
  });

  it("compareDecimalText never goes through floating point", () => {
    expect(compareDecimalText("132000", "143000")).toBeLessThan(0);
    expect(compareDecimalText("4807.0", "4807")).toBe(0);
    expect(compareDecimalText("0.30000000000000004", "0.3")).toBeGreaterThan(0);
    expect(compareDecimalText("-5", "3")).toBeLessThan(0);
  });
});
