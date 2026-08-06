/**
 * Diagnosis Gate C2.1 — pure helpers of the CLINICAL stage.
 *
 * These two functions decide whether the gate can see anything at all. If
 * `extractDiagnosisCodes` misses a shape, the stage silently resolves nothing and every
 * claim looks clean; if `lineMatchKeys` disagrees with how aliases were normalised at
 * import, no billed line is ever recognised as a test and every rule is inert. Both
 * failure modes look exactly like "no problems found", which is why they are pinned here
 * rather than left to the integration tests.
 */
import { describe, it, expect } from "vitest";
import { extractDiagnosisCodes, lineMatchKeys } from "@/server/services/claim-autopilot/stage-clinical";
import { normaliseAliasValue } from "@/server/services/diagnosis-gate/pack-types";

describe("DG C2.1 — extractDiagnosisCodes reads BOTH persisted shapes", () => {
  // The canonical intake path writes { icdCode }; claims.service and
  // reimbursement.service write { code }. Both shapes exist in the live table, and the
  // claim detail screen already hedges with `d.code ?? d.icdCode`.
  it("reads the canonical intake shape { icdCode }", () => {
    const r = extractDiagnosisCodes([{ icdCode: "1F40", description: "Malaria", isPrimary: true }]);
    expect(r.primary).toEqual(["1F40"]);
    expect(r.all).toEqual(["1F40"]);
  });

  it("reads the claims.service / reimbursement shape { code }", () => {
    const r = extractDiagnosisCodes([{ code: "B50.9", description: "Malaria", isPrimary: true }]);
    expect(r.primary).toEqual(["B50.9"]);
  });

  it("reads a mixed array, which is what the live table actually contains", () => {
    const r = extractDiagnosisCodes([
      { code: "B50.9", isPrimary: true },
      { icdCode: "1F40", isPrimary: false },
    ]);
    expect(r.all).toEqual(["B50.9", "1F40"]);
    expect(r.primary).toEqual(["B50.9"]);
  });

  it("prefers `code` when both keys are present and non-empty", () => {
    expect(extractDiagnosisCodes([{ code: "A00", icdCode: "B11", isPrimary: true }]).primary).toEqual(["A00"]);
  });

  it("falls back to `icdCode` when `code` is present but blank", () => {
    expect(extractDiagnosisCodes([{ code: "   ", icdCode: "1F40", isPrimary: true }]).all).toEqual(["1F40"]);
  });

  it("normalises case and stray whitespace so lookups match stored memberships", () => {
    expect(extractDiagnosisCodes([{ code: " 1f40 ", isPrimary: true }]).all).toEqual(["1F40"]);
  });

  it("separates primary from secondary diagnoses", () => {
    const r = extractDiagnosisCodes([
      { code: "1F40", isPrimary: false },
      { code: "GC08", isPrimary: true },
    ]);
    expect(r.primary).toEqual(["GC08"]);
    expect(r.all).toEqual(["1F40", "GC08"]);
  });

  it("survives every malformed value the JSON column can hold", () => {
    for (const bad of [null, undefined, {}, "string", 42, [], [null], [{}], [{ isPrimary: true }], [{ code: null }], [{ code: "" }]]) {
      const r = extractDiagnosisCodes(bad);
      expect(r.all).toEqual([]);
      expect(r.primary).toEqual([]);
    }
  });
});

describe("DG C2.1 — lineMatchKeys mirrors import-time alias normalisation", () => {
  it("offers a key per identifier a line can carry", () => {
    expect(lineMatchKeys({ cptCode: "87880", drugCode: "J01CA04", description: "Malaria RDT" })).toEqual([
      { matchType: "CPT_CODE", value: "87880" },
      { matchType: "SERVICE_CODE", value: "J01CA04" },
      { matchType: "NORMALIZED_NAME", value: "MALARIA RDT" },
    ]);
  });

  it("normalises description exactly as the importer normalises an alias", () => {
    const messy = "  malaria   rdt  ";
    const [nameKey] = lineMatchKeys({ description: messy }).filter((k) => k.matchType === "NORMALIZED_NAME");
    expect(nameKey.value).toBe(normaliseAliasValue(messy));
  });

  it("omits absent and blank identifiers rather than emitting empty keys", () => {
    expect(lineMatchKeys({ cptCode: null, drugCode: "   ", description: "CBC" })).toEqual([
      { matchType: "NORMALIZED_NAME", value: "CBC" },
    ]);
    expect(lineMatchKeys({})).toEqual([]);
  });
});
