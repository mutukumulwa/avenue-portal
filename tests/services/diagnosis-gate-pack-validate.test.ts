/**
 * Diagnosis Gate C1.3 — protocol-pack validation guard.
 *
 * The validator is the anti-hallucination boundary (DG-D7): it is what makes it
 * impossible for a gap in the clinical workbook to become an invented rule. Each test
 * below takes a known-good pack and breaks exactly one thing, so a regression in any
 * single rule is attributable.
 *
 * The final block locks the measured ground truth of the vendored v0 workbook, so a
 * change in converter behaviour cannot silently drift away from the source of record.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  type ProtocolPack,
  PACK_FORMAT_VERSION,
  normaliseAliasValue,
  normaliseCode,
  looseNameKey,
  canonicalisePack,
  serialisePack,
} from "@/server/services/diagnosis-gate/pack-types";
import { validatePack, renderValidationMarkdown } from "@/server/services/diagnosis-gate/pack-validate";

/** Minimal pack that passes every rule — the control for the mutation tests. */
function goodPack(): ProtocolPack {
  return {
    meta: { formatVersion: PACK_FORMAT_VERSION, sourceFileName: "test.xlsx" },
    groups: [
      { groupCode: "CIG-001", name: "Malaria", isCatchAll: false, confirmationLookbackHours: 72 },
      { groupCode: "CIG-002", name: "Urinary Tract Infection", isCatchAll: false },
    ],
    memberships: [
      { groupCode: "CIG-001", codeSystem: "ICD11", code: "1F40", provenance: "AUTHORED" },
      { groupCode: "CIG-001", codeSystem: "ICD10", code: "B50.9", provenance: "GENERATED_CROSSWALK" },
      { groupCode: "CIG-002", codeSystem: "ICD11", code: "GC08", provenance: "AUTHORED" },
    ],
    labRules: [
      { testCode: "LAB003", testName: "Malaria RDT", requiresDiagnosis: true, repeatWindowHours: 12, failureMessage: "Malaria RDT lacks a supporting diagnosis" },
      { testCode: "LAB007", testName: "Urinalysis", requiresDiagnosis: false, repeatWindowHours: 24, failureMessage: "Urinalysis repeat inside window" },
    ],
    links: [
      { testCode: "LAB003", groupCode: "CIG-001", linkType: "SUPPORTED" },
      { testCode: "LAB003", groupCode: "CIG-001", linkType: "CONFIRMATORY" },
      { testCode: "LAB007", groupCode: "CIG-002", linkType: "SUPPORTED" },
    ],
    aliases: [
      { testCode: "LAB003", matchType: "NORMALIZED_NAME", value: "MALARIA RDT" },
      { testCode: "LAB007", matchType: "NORMALIZED_NAME", value: "URINALYSIS" },
    ],
  };
}

const knownCodes = { ICD11: new Set(["1F40", "GC08"]), ICD10: new Set(["B50.9"]) };
const codesOf = (issues: Array<{ code: string }>) => issues.map((i) => i.code);

describe("DG C1.3 — pack validator: a well-formed pack passes", () => {
  it("reports no errors and is importable", () => {
    const r = validatePack(goodPack(), { knownCodes });
    expect(r.errors).toEqual([]);
    expect(r.importable).toBe(true);
  });

  it("counts content accurately for the reviewer", () => {
    const r = validatePack(goodPack(), { knownCodes });
    expect(r.stats).toMatchObject({
      groups: 2,
      memberships: 3,
      icd10Memberships: 1,
      icd11Memberships: 2,
      generatedCrosswalkMemberships: 1,
      labRules: 2,
      rulesRequiringDiagnosis: 1,
      rulesWithRepeatWindow: 2,
      supportedLinks: 2,
      confirmatoryLinks: 1,
      aliases: 2,
    });
  });
});

describe("DG C1.3 — pack validator: each rule catches its own defect", () => {
  it("V0 rejects an unsupported format version", () => {
    const p = goodPack();
    p.meta.formatVersion = 99;
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("FORMAT_VERSION");
  });

  it("V1 rejects a missing group code, a duplicate code, and an empty pack", () => {
    const missing = goodPack();
    missing.groups[0].groupCode = "";
    expect(codesOf(validatePack(missing, { knownCodes }).errors)).toContain("GROUP_CODE_MISSING");

    const dup = goodPack();
    dup.groups[1].groupCode = "CIG-001";
    expect(codesOf(validatePack(dup, { knownCodes }).errors)).toContain("GROUP_CODE_DUPLICATE");

    const empty: ProtocolPack = { ...goodPack(), groups: [], memberships: [], links: [] };
    expect(codesOf(validatePack(empty, { knownCodes }).errors)).toContain("NO_GROUPS");
  });

  it("V1 rejects a membership pointing at a group that does not exist", () => {
    const p = goodPack();
    p.memberships.push({ groupCode: "CIG-999", codeSystem: "ICD11", code: "1F40", provenance: "AUTHORED" });
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("MEMBERSHIP_UNKNOWN_GROUP");
  });

  it("V2 rejects an empty code — the condition listed but never mapped", () => {
    const p = goodPack();
    p.memberships.push({ groupCode: "CIG-002", codeSystem: "ICD11", code: "", provenance: "AUTHORED" });
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("CODE_EMPTY");
  });

  it("V2 rejects a malformed code", () => {
    const p = goodPack();
    p.memberships.push({ groupCode: "CIG-002", codeSystem: "ICD11", code: "NOT A CODE!!", provenance: "AUTHORED" });
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("CODE_MALFORMED");
  });

  it("V3 rejects a code absent from the reference set", () => {
    const p = goodPack();
    p.memberships.push({ groupCode: "CIG-002", codeSystem: "ICD11", code: "9Z99", provenance: "AUTHORED" });
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("UNKNOWN_CODE");
  });

  it("V3 warns rather than silently trusting when no reference set is supplied", () => {
    const r = validatePack(goodPack(), {});
    expect(codesOf(r.warnings)).toContain("CODE_SET_UNAVAILABLE");
    expect(r.importable).toBe(true);
  });

  it("V5 flags an alias that maps to two different tests as ambiguous", () => {
    const p = goodPack();
    p.aliases.push({ testCode: "LAB007", matchType: "NORMALIZED_NAME", value: "MALARIA RDT" });
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("ALIAS_AMBIGUOUS");
  });

  it("V5 flags a duplicate test code and downgrades a duplicate membership to a warning", () => {
    const dupTest = goodPack();
    dupTest.labRules.push({ ...dupTest.labRules[0] });
    expect(codesOf(validatePack(dupTest, { knownCodes }).errors)).toContain("TEST_CODE_DUPLICATE");

    const dupMem = goodPack();
    dupMem.memberships.push({ ...dupMem.memberships[0] });
    const r = validatePack(dupMem, { knownCodes });
    expect(codesOf(r.warnings)).toContain("MEMBERSHIP_DUPLICATE");
    expect(r.importable).toBe(true);
  });

  it("V4 rejects links and aliases pointing at unknown tests or groups", () => {
    const badTest = goodPack();
    badTest.links.push({ testCode: "LAB999", groupCode: "CIG-001", linkType: "SUPPORTED" });
    expect(codesOf(validatePack(badTest, { knownCodes }).errors)).toContain("LINK_UNKNOWN_TEST");

    const badGroup = goodPack();
    badGroup.links.push({ testCode: "LAB003", groupCode: "CIG-999", linkType: "SUPPORTED" });
    expect(codesOf(validatePack(badGroup, { knownCodes }).errors)).toContain("LINK_UNKNOWN_GROUP");

    const badAlias = goodPack();
    badAlias.aliases.push({ testCode: "LAB999", matchType: "CPT_CODE", value: "87880" });
    expect(codesOf(validatePack(badAlias, { knownCodes }).errors)).toContain("ALIAS_UNKNOWN_TEST");
  });

  it("V4 rejects a test with no provider-facing failure message", () => {
    const p = goodPack();
    p.labRules[0].failureMessage = "";
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("FAILURE_MESSAGE_MISSING");
  });

  it("V4 rejects a non-positive repeat window", () => {
    const p = goodPack();
    p.labRules[0].repeatWindowHours = 0;
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("REPEAT_WINDOW_INVALID");
  });

  it("V6 rejects a diagnosis-requiring test with no supported condition — it would flag every claim", () => {
    const p = goodPack();
    p.links = p.links.filter((l) => !(l.testCode === "LAB003" && l.linkType === "SUPPORTED"));
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("REQUIRES_DIAGNOSIS_NO_SUPPORT");
  });

  it("V9 rejects a group with no codes — nothing could ever resolve to it", () => {
    const p = goodPack();
    p.groups.push({ groupCode: "CIG-003", name: "COPD", isCatchAll: false });
    expect(codesOf(validatePack(p, { knownCodes }).errors)).toContain("GROUP_HAS_NO_CODES");
  });

  it("V10 warns that a test with no alias is inert rather than pretending it works", () => {
    const p = goodPack();
    p.aliases = p.aliases.filter((a) => a.testCode !== "LAB007");
    const r = validatePack(p, { knownCodes });
    expect(codesOf(r.warnings)).toContain("RULE_HAS_NO_ALIAS");
    expect(r.importable).toBe(true);
  });

  it("V7 warns on a catch-all group (DG-D8 bars it from live routing)", () => {
    const p = goodPack();
    p.groups[0].isCatchAll = true;
    expect(codesOf(validatePack(p, { knownCodes }).warnings)).toContain("CATCH_ALL_GROUP");
  });

  it("V8 warns when no confirmatory link exists, so R4 cannot fire", () => {
    const p = goodPack();
    p.links = p.links.filter((l) => l.linkType !== "CONFIRMATORY");
    expect(codesOf(validatePack(p, { knownCodes }).warnings)).toContain("NO_CONFIRMATORY_LINKS");
  });

  it("carries conversion issues through into the result", () => {
    const r = validatePack(goodPack(), {
      knownCodes,
      conversionIssues: [{ rule: "C", code: "UNRESOLVED_MAPPING_NAME", severity: "ERROR", message: "x" }],
    });
    expect(codesOf(r.errors)).toContain("UNRESOLVED_MAPPING_NAME");
    expect(r.importable).toBe(false);
  });
});

describe("DG C1.3 — normalisation is shared by the converter and the stage", () => {
  it("normalises alias values to a single matching key", () => {
    expect(normaliseAliasValue("  malaria   rdt ")).toBe("MALARIA RDT");
  });

  it("strips whitespace from codes but preserves the dotted extension", () => {
    expect(normaliseCode(" b50.9 ")).toBe("B50.9");
  });

  it("matches names differing only in case or punctuation, and NOT misspellings or synonyms", () => {
    expect(looseNameKey("OtitisExterna")).toBe(looseNameKey("Otitis Externa"));
    expect(looseNameKey("Viraemia of unknown origin")).toBe(looseNameKey("Viraemia Of Unknown Origin"));
    // Deliberately unequal: correcting these is a clinical decision, not a string op.
    expect(looseNameKey("Tonsilitis")).not.toBe(looseNameKey("Tonsillitis"));
    expect(looseNameKey("Acne")).not.toBe(looseNameKey("Acne Vulgaris"));
  });
});

describe("DG C1.3 — packs serialise deterministically", () => {
  it("produces byte-identical output regardless of input ordering", () => {
    const a = goodPack();
    const b = goodPack();
    b.groups.reverse();
    b.memberships.reverse();
    b.links.reverse();
    b.aliases.reverse();
    expect(serialisePack(a)).toBe(serialisePack(b));
  });

  it("canonicalisation pins the format version", () => {
    const p = goodPack();
    p.meta.formatVersion = 0;
    expect(canonicalisePack(p).meta.formatVersion).toBe(PACK_FORMAT_VERSION);
  });
});

describe("DG C1.3 — report rendering", () => {
  it("states the verdict and never claims importable while errors exist", () => {
    const p = goodPack();
    p.groups[0].groupCode = "";
    const md = renderValidationMarkdown(validatePack(p, { knownCodes }), { sourceFileName: "test.xlsx", generatedAt: "2026-08-06" });
    expect(md).toContain("NOT IMPORTABLE");
    expect(md).toContain("GROUP_CODE_MISSING");
  });

  it("explains that nothing is guessed — the anti-hallucination promise is in the artifact", () => {
    const md = renderValidationMarkdown(validatePack(goodPack(), { knownCodes }), { sourceFileName: "test.xlsx", generatedAt: "2026-08-06" });
    expect(md).toContain("never guesses");
    expect(md).toContain("IMPORTABLE");
  });
});

// ── Ground-truth lock on the vendored v0 workbook ────────────────────────────
// These numbers were measured directly from the source file and are recorded in
// docs/diagnosis-gate/source/SOURCE_NOTES.md. If the converter drifts, this fails.
describe("DG C1.3 — vendored v0 pack matches the recorded ground truth", () => {
  const packPath = resolve(process.cwd(), "docs/diagnosis-gate/source/pack-v0.json");
  const present = existsSync(packPath);

  it.skipIf(!present)("reproduces the measured counts and stays NOT importable", () => {
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as ProtocolPack;
    expect(pack.groups).toHaveLength(40); // the "top 40" list
    expect(pack.memberships).toHaveLength(669); // 671 rows − 2 with empty codes
    expect(pack.labRules).toHaveLength(22);
    expect(pack.aliases).toHaveLength(22); // one derived name alias per test

    // R4 is provably inert on v0: the workbook states confirmation only in prose.
    expect(pack.links.filter((l) => l.linkType === "CONFIRMATORY")).toHaveLength(0);

    // Every ICD-11 membership resolved against the workbook's own master sheet, so the
    // only V3 finding should be the absent ICD-10 reference set (a warning).
    const r = validatePack(pack, {});
    expect(r.importable).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
