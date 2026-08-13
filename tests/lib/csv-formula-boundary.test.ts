/**
 * UAT-HF P06.07 — the formula defence belongs on the way OUT (DEF-038).
 *
 * DEF-038 (S4): "Values beginning with =, +, @ or - are rendered and stored with
 * a leading apostrophe: '=2+2' becomes \"'=2+2\", '+SUM(1,2)' becomes
 * \"'+SUM(1,2)\", '@CMD' becomes \"'@CMD\" and '-1+cmd' becomes \"'-1+cmd\".
 * Ordinary values are untouched."
 *
 * The register is scrupulous about what it is objecting to: the behaviour is
 * "a deliberate CSV/spreadsheet formula-injection defence, and a good one", and
 * the finding is Low "purely because the scenario requires exact source-text
 * preservation and the transformation is real".
 *
 * So the defence stays; it moves. A stored name is data. The risk exists only
 * when a spreadsheet OPENS an export, and `csvSafeCell` neutralizes every
 * exported cell whatever the database holds. Removing the import-side call
 * therefore loses no protection and restores "the committed roster preserves the
 * source text exactly".
 *
 * These tests hold BOTH halves. Dropping the import call would be a regression,
 * not a fix, if the export half were not solid.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildCsv, csvSafeCell, neutralizeFormula } from "@/lib/csv-safe";

/** Every shape the run actually tried. */
const RUN_VALUES = ["=2+2", "+SUM(1,2)", "@CMD", "-1+cmd"];

describe("DEF-038 the export boundary still neutralizes every one", () => {
  it.each(RUN_VALUES)("defangs %s on the way to a spreadsheet", (value) => {
    expect(csvSafeCell(value).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
  });

  it("a formula name stored verbatim is still safe once exported", () => {
    // The whole argument for moving the defence, in one assertion.
    const stored = '=HYPERLINK("http://evil","click")';
    const csv = buildCsv(["firstName"], [[stored]]);
    expect(csv).toContain("'=HYPERLINK");
  });

  it("leaves an ordinary name alone", () => {
    expect(csvSafeCell("Grace Nakato")).toBe("Grace Nakato");
  });

  it("still does not mangle signed numbers", () => {
    // Money, balances and phone columns lead with + or - legitimately; treating
    // them as formulas would corrupt every numeric column in the exports.
    expect(csvSafeCell("-500.25")).toBe("-500.25");
    expect(csvSafeCell("+256")).toBe("+256");
  });

  it("is idempotent, so a re-export cannot stack apostrophes", () => {
    expect(neutralizeFormula(neutralizeFormula("=2+2"))).toBe("'=2+2");
  });
});

describe("DEF-038 the import boundary stores what was sent", () => {
  const preflight = readFileSync("src/server/services/member-import-preflight.service.ts", "utf8");

  it("no longer neutralizes a name on ingest", () => {
    // "The committed roster preserves the source text exactly."
    expect(preflight).not.toContain("neutralizeFormula");
  });

  it("takes the raw field values", () => {
    expect(preflight).toMatch(/const firstName = get\("firstName"\);/);
    expect(preflight).toMatch(/const lastName = get\("lastName"\);/);
  });
});

describe("DEF-038 the defence has exactly one home", () => {
  it("neutralizeFormula is applied on no write path", () => {
    // A new call on a write path is almost certainly this defect returning, so
    // the constraint is asserted rather than left to the module comment.
    const callers = ["src/server/services/member-import-preflight.service.ts"];
    for (const f of callers) {
      expect(readFileSync(f, "utf8"), f).not.toContain("neutralizeFormula");
    }
  });

  it("csvSafeCell is what applies it", () => {
    const mod = readFileSync("src/lib/csv-safe.ts", "utf8");
    const cell = mod.slice(mod.indexOf("export function csvSafeCell"));
    expect(cell.slice(0, 300)).toContain("neutralizeFormula(raw)");
  });

  it("the module says where the boundary is, so the next caller is warned", () => {
    const mod = readFileSync("src/lib/csv-safe.ts", "utf8");
    expect(mod).toMatch(/Defend on the way OUT only/i);
    expect(mod).toMatch(/Do not use this on a value being stored/i);
  });
});
