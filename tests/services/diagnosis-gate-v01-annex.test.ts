/**
 * Diagnosis Gate C7.4 — v0.1 annex ground truth.
 *
 * The v0.1 workbook proposes content the clinical team has NOT signed off: two name
 * aliases that need a scope decision, and two confirmatory tests marked as candidates.
 * The whole point of the intake is that proposals are reported and refused, not quietly
 * accepted — a spreadsheet column is not a clinician's signature.
 *
 * These tests pin that behaviour against the committed artifacts, so a future converter
 * change that starts trusting the annex fails here rather than silently switching a
 * clinical rule on. They also pin the v0 pack, because the annex path must not disturb
 * the legacy path.
 *
 * Everything asserted below was measured from the real workbook — see
 * `docs/diagnosis-gate/source/SOURCE_NOTES.md` §v0.1.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProtocolPack } from "@/server/services/diagnosis-gate/pack-types";

const DOCS = resolve(process.cwd(), "docs/diagnosis-gate");
const PACK_V0 = resolve(DOCS, "source/pack-v0.json");
const PACK_V01 = resolve(DOCS, "source/pack-v0.1.json");
const REPORT_V01 = resolve(DOCS, "reports/v0.1-validation.md");
const PROPOSALS_V01 = resolve(DOCS, "reports/v0.1-proposals.md");

const readPack = (p: string) => JSON.parse(readFileSync(p, "utf8")) as ProtocolPack;
const have = existsSync(PACK_V0) && existsSync(PACK_V01);

describe.skipIf(!have)("DG C7.4 — v0.1 annex intake", () => {
  it("takes the authored group codes, so no code is invented by the converter", () => {
    const pack = readPack(PACK_V01);
    expect(pack.groups).toHaveLength(40);
    // v0 had no codes at all and the converter refused to number them (GROUP_CODES_NOT_AUTHORED).
    for (const g of pack.groups) expect(g.groupCode).toMatch(/^CIG-\d{3}$/);
    expect(pack.groups.map((g) => g.groupCode)).toContain("CIG-001");
    expect(pack.groups.map((g) => g.groupCode)).toContain("CIG-040");
  });

  it("imports the three catch-alls, which bars them from live routing forever (DG-D8)", () => {
    const catchAlls = readPack(PACK_V01).groups.filter((g) => g.isCatchAll);
    expect(catchAlls.map((g) => g.groupCode).sort()).toEqual(["CIG-002", "CIG-031", "CIG-032"]);
  });

  it("imports NO confirmatory link, because both candidates are pending sign-off", () => {
    const pack = readPack(PACK_V01);
    expect(pack.links.filter((l) => l.linkType === "CONFIRMATORY")).toHaveLength(0);
    expect(pack.links.filter((l) => l.linkType === "SUPPORTED")).toHaveLength(10);
    // The rule is present and inert — and the report says so out loud rather than
    // leaving a reader to infer that R4 does nothing.
    expect(readFileSync(REPORT_V01, "utf8")).toContain("NO_CONFIRMATORY_LINKS");
  });

  it("holds the pending proposals in the proposals report instead of the pack", () => {
    const proposals = readFileSync(PROPOSALS_V01, "utf8");
    expect(proposals).toContain("awaiting clinical sign-off");
    expect(proposals).toContain("PENDING_CLINICAL_SIGNOFF");
    expect(proposals).toContain("SCOPE_REVIEW_REQUIRED");
  });

  it("refuses the two scope-review aliases, which is why 2 feature names still fail", () => {
    // 14 unresolved names in v0 → 2 here. The 12 that cleared were spelling; these two
    // ask whether "Eczema" and "Eczema (Atopic Dermatitis)" are one condition, which is
    // a clinical judgement the converter must not make.
    const report = readFileSync(REPORT_V01, "utf8");
    expect(report).toMatch(/`UNRESOLVED_FEATURES_NAME`\s*\|\s*2\s*\|/);
    expect(report).not.toContain("UNRESOLVED_SUPPORTED_DIAGNOSIS");
    expect(report).not.toContain("GROUP_CODES_NOT_AUTHORED");
  });

  it("prefers the provider-facing message over v0's clinician shorthand (DG-D17)", () => {
    const v01 = readPack(PACK_V01);
    const v0 = readPack(PACK_V0);
    const byCode = new Map(v0.labRules.map((r) => [r.testCode, r]));
    expect(v01.labRules).toHaveLength(22);
    for (const rule of v01.labRules) {
      expect(rule.failureMessage, rule.testCode).not.toBe(byCode.get(rule.testCode)?.failureMessage);
      expect(rule.failureMessage.length, rule.testCode).toBeGreaterThan(0);
    }
  });

  it("records the ICD release verbatim as a target, not as a validation claim", () => {
    expect(readPack(PACK_V01).meta.icdRelease).toContain("ICD-11 MMS 2026-01");
    expect(readPack(PACK_V0).meta.icdRelease).toBeUndefined();
  });

  it("leaves the 85 overlapping codes untouched — the real blocker is not a data-cleaning one", () => {
    const v0 = readPack(PACK_V0);
    const v01 = readPack(PACK_V01);
    // Memberships are the ICD assignments themselves. v0.1 renamed and re-keyed; it did
    // not move a single code between conditions, so the pack still cannot be imported.
    expect(v01.memberships).toEqual(v0.memberships);
    expect(readFileSync(REPORT_V01, "utf8")).toMatch(/`CODE_IN_MULTIPLE_GROUPS`\s*\|\s*85\s*\|/);
    expect(readFileSync(REPORT_V01, "utf8")).toContain("**NOT IMPORTABLE**");
  });

  it("does not disturb the v0 pack, whose groups still carry no authored codes", () => {
    const v0 = readPack(PACK_V0);
    expect(v0.groups.every((g) => g.isCatchAll === false)).toBe(true);
    expect(v0.links.filter((l) => l.linkType === "CONFIRMATORY")).toHaveLength(0);
    expect(v0.meta.sourceFileName).toBe("ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx");
  });
});
