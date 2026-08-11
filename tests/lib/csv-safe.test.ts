import { describe, it, expect } from "vitest";
import { neutralizeFormula, csvSafeCell, toCsvRow, buildCsv } from "@/lib/csv-safe";

describe("neutralizeFormula (WP-B2)", () => {
  it("defangs a leading =, +, - or @ formula", () => {
    expect(neutralizeFormula("=HYPERLINK(\"http://x\")")).toBe("'=HYPERLINK(\"http://x\")");
    expect(neutralizeFormula("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(neutralizeFormula("+cmd|'/c calc'!A1")).toBe("'+cmd|'/c calc'!A1");
    expect(neutralizeFormula("-2+3+cmd")).toBe("'-2+3+cmd");
  });

  it("defangs a leading Tab or CR (used to sneak past naive first-char checks)", () => {
    expect(neutralizeFormula("\t=1+1")).toBe("'\t=1+1");
    expect(neutralizeFormula("\r=1+1")).toBe("'\r=1+1");
  });

  it("LEAVES signed plain numbers untouched (they are data, not formulas)", () => {
    expect(neutralizeFormula("-500.25")).toBe("-500.25");
    expect(neutralizeFormula("+256700123456")).toBe("+256700123456");
    expect(neutralizeFormula("1000")).toBe("1000");
    expect(neutralizeFormula("+7")).toBe("+7");
  });

  it("leaves ordinary text untouched and is a no-op on empty", () => {
    expect(neutralizeFormula("Grace Nakato")).toBe("Grace Nakato");
    expect(neutralizeFormula("")).toBe("");
  });

  it("is idempotent — already-quoted values are not double-prefixed", () => {
    const once = neutralizeFormula("=evil");
    expect(neutralizeFormula(once)).toBe(once);
  });
});

describe("csvSafeCell (WP-B2)", () => {
  it("neutralizes AND quotes a formula that also needs quoting", () => {
    expect(csvSafeCell("=1+2,3")).toBe("\"'=1+2,3\"");
  });

  it("RFC-4180 quotes commas, quotes and newlines", () => {
    expect(csvSafeCell("a,b")).toBe('"a,b"');
    expect(csvSafeCell('he "said"')).toBe('"he ""said"""');
    expect(csvSafeCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("passes plain values, numbers and null through cleanly", () => {
    expect(csvSafeCell("plain")).toBe("plain");
    expect(csvSafeCell(42)).toBe("42");
    expect(csvSafeCell(null)).toBe("");
    expect(csvSafeCell(undefined)).toBe("");
  });
});

describe("buildCsv / toCsvRow", () => {
  it("builds a CRLF document with every cell made safe", () => {
    // "=cmd()" is neutralized to "'=cmd()" (defanged); it needs no quoting since it
    // has no comma/quote/newline. "bad, row" is quoted for its comma.
    const csv = buildCsv(["Row", "Name", "Reason"], [[2, "=cmd()", "bad, row"]]);
    expect(csv).toBe("Row,Name,Reason\r\n2,'=cmd(),\"bad, row\"");
  });

  it("toCsvRow joins safe cells with commas", () => {
    expect(toCsvRow(["a", "=b", "c,d"])).toBe("a,'=b,\"c,d\"");
  });
});
