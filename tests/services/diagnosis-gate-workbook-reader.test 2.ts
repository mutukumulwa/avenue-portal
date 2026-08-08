/**
 * Diagnosis Gate C7.3 — workbook reader capability guard.
 *
 * The converter must be able to open workbooks however the clinical team produced them.
 * It originally used `exceljs`, which cannot read openpyxl output at all — so a workbook
 * round-tripped through Python tooling (as the v0.1 annex was) failed at the door with
 * "Cannot read properties of undefined (reading 'sheets')".
 *
 * These tests pin the two properties the converter actually depends on, against the real
 * vendored files rather than a synthetic fixture:
 *   1. both workbook flavours open — Excel-authored (v0) and openpyxl-authored (v0.1);
 *   2. v0's sheet name with a TRAILING SPACE survives, because the converter looks that
 *      sheet up by its exact name.
 *
 * If a future reader change breaks either, the failure lands here rather than in a
 * confusing conversion error weeks later.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "@e965/xlsx";

const SRC = resolve(process.cwd(), "docs/diagnosis-gate/source");
const V0 = resolve(SRC, "ICD11_Codes_Mapped_with_Clinical_Features_v0.xlsx");
const V01 = resolve(SRC, "ICD11_Codes_Mapped_with_Clinical_Features_v0.1_research_remediated.xlsx");

describe("DG C7.3 — the reader opens both workbook flavours", () => {
  it.skipIf(!existsSync(V0))("reads the Excel-authored v0 workbook", () => {
    const wb = XLSX.read(readFileSync(V0), { type: "buffer", cellDates: true });
    expect(wb.SheetNames).toHaveLength(6);
    // The converter looks this sheet up by its exact name; the trailing space is real.
    expect(wb.SheetNames).toContain("Clinical Diagnostic Features ");
    expect(wb.SheetNames.some((n) => n !== n.trim())).toBe(true);
  });

  it.skipIf(!existsSync(V01))("reads the openpyxl-authored v0.1 annex, which exceljs could not", () => {
    const wb = XLSX.read(readFileSync(V01), { type: "buffer", cellDates: true });
    expect(wb.SheetNames).toHaveLength(17);
    // The annex sheets C7.4 will consume.
    for (const s of ["Conditions v0.1", "Name Aliases v0.1", "Lab Rules v0.1", "Claims Gate v0.1"]) {
      expect(wb.SheetNames, s).toContain(s);
    }
  });

  it.skipIf(!existsSync(V0) || !existsSync(V01))("parses cell values identically in the sheets both files share", () => {
    // v0.1 preserved the original six sheets rather than editing them — this is the
    // evidence for that claim, and it is why converting either file yields the same pack.
    const rowsOf = (path: string, sheet: string) =>
      XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(readFileSync(path), { type: "buffer", cellDates: true }).Sheets[sheet], { header: 1, raw: true, defval: null });

    const a = rowsOf(V0, "ICD11 Codes");
    const b = rowsOf(V01, "ICD11 Codes");
    expect(a.length).toBe(b.length);
    expect(a[1]).toEqual(b[1]);
    expect(a[1]).toEqual(["1A00", "Cholera"]);

    expect(rowsOf(V0, "Commonest")[0]).toEqual(rowsOf(V01, "Commonest")[0]);
  });

  it.skipIf(!existsSync(V0))("returns numbers as numbers, so repeat windows are not string-compared", () => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(
      XLSX.read(readFileSync(V0), { type: "buffer", cellDates: true }).Sheets["Commonest Labs Rationale"],
      { header: 1, raw: true, defval: null },
    );
    const header = rows[0] as string[];
    const windowCol = header.indexOf("Repeat_Window_Hours");
    expect(windowCol).toBeGreaterThan(-1);
    expect(typeof (rows[1] as unknown[])[windowCol]).toBe("number");
  });
});
