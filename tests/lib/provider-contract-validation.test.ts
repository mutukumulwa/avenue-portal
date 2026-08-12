/**
 * UAT-HF P02.01 — contract date validation (DEC-02).
 *
 * DEF-050 (S1): one ordinary "Create draft" persisted a contract with
 * **startDate 60901-02-20 and endDate 70831-02-20**, after which `/contracts` and
 * `/contracts/{id}` threw for EVERY persona on EVERY load. `/contracts/{id}/edit`
 * returned Page Not Found, so no UI route could reach the row — the module was
 * dead until someone edited the database directly.
 *
 * The first test below is that exact row.
 */
import { describe, it, expect } from "vitest";
import {
  isRenderableContractDate,
  validateContractTerm,
  validateContractTermPatch,
} from "@/lib/validation/provider-contract";

const term = (startDate: string, endDate: string, reviewDueDate?: string) =>
  validateContractTerm({ startDate, endDate, reviewDueDate });

describe("P02.01 validateContractTerm — the DEF-050 row", () => {
  it("REJECTS the exact dates that killed the module", () => {
    const result = term("60901-02-20", "70831-02-20");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Both fields are named, not one generic "invalid input".
    expect(result.fieldErrors.startDate?.[0]).toMatch(/between 1900-01-01 and 9999-12-31/);
    expect(result.fieldErrors.endDate?.[0]).toMatch(/between 1900-01-01 and 9999-12-31/);
  });

  it.each(["12026-08-11", "60901-02-20", "202600-08-11", "226-08-11"])(
    "rejects the out-of-range year %s",
    (bad) => {
      expect(term(bad, "2027-08-11").ok).toBe(false);
    },
  );
});

describe("P02.01 validateContractTerm — DEC-02 rules and nothing more", () => {
  it("accepts a normal term and converts to midnight UTC", () => {
    const result = term("2026-08-11", "2027-08-10");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    // Midnight UTC, so the stored day cannot drift with the server timezone.
    expect(result.dates.startDate.toISOString()).toBe("2026-08-11T00:00:00.000Z");
    expect(result.dates.endDate.toISOString()).toBe("2027-08-10T00:00:00.000Z");
    expect(result.dates.reviewDueDate).toBeNull();
  });

  it("accepts the DEC-02 boundaries exactly", () => {
    expect(term("1900-01-01", "9999-12-31").ok).toBe(true);
    expect(term("1899-12-31", "2027-01-01").ok).toBe(false);
  });

  it("requires end >= start, and ALLOWS a single-day term", () => {
    expect(term("2026-08-11", "2026-08-10").ok).toBe(false);
    // DEC-02 says end >= start. Refusing equality would be an invented
    // commercial rule — and the plan forbids inventing one.
    expect(term("2026-08-11", "2026-08-11").ok).toBe(true);
  });

  it("names the end date when the range is inverted", () => {
    const result = term("2027-01-01", "2026-01-01");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.fieldErrors.endDate?.[0]).toMatch(/on or after the start date/i);
  });

  it("rejects impossible days rather than rolling them forward", () => {
    // `new Date("2026-02-30")` silently becomes 2 March.
    expect(term("2026-02-30", "2027-01-01").ok).toBe(false);
    expect(term("2026-04-31", "2027-01-01").ok).toBe(false);
    // A real leap day is fine.
    expect(term("2024-02-29", "2025-02-28").ok).toBe(true);
  });

  it("rejects a missing or non-ISO date", () => {
    expect(validateContractTerm({}).ok).toBe(false);
    expect(term("", "2027-01-01").ok).toBe(false);
    expect(term("01/02/2026", "2027-01-01").ok).toBe(false);
    expect(term("2026-08-11T00:00:00Z", "2027-01-01").ok).toBe(false);
  });

  it("treats an absent review date as absent, not as damage", () => {
    // The run explicitly DISPROVED the theory that a null reviewDueDate caused
    // DEF-050: 9 of 201 contracts had one and rendered correctly.
    for (const value of [undefined, null, ""]) {
      const result = validateContractTerm({ startDate: "2026-08-11", endDate: "2027-08-10", reviewDueDate: value });
      expect(result.ok, String(value)).toBe(true);
      if (result.ok) expect(result.dates.reviewDueDate).toBeNull();
    }
  });

  it("validates a supplied review date to the same bound", () => {
    expect(term("2026-08-11", "2027-08-10", "2027-01-01").ok).toBe(true);
    expect(term("2026-08-11", "2027-08-10", "70831-02-20").ok).toBe(false);
  });

  it("does NOT invent a maximum term length", () => {
    // DEC-02: "do not invent a narrower commercial duration."
    expect(term("1900-01-01", "9999-12-31").ok).toBe(true);
  });
});

describe("P02.01 validateContractTermPatch — the draft-header edit", () => {
  const current = { startDate: new Date("2026-08-11T00:00:00.000Z"), endDate: new Date("2027-08-10T00:00:00.000Z") };

  it("leaves an absent field absent", () => {
    const result = validateContractTermPatch({}, current);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dates).toEqual({});
  });

  it("catches editing ONE date into an inverted term", () => {
    // Moving the start past the untouched end. Checking only the supplied field
    // would let this through.
    const result = validateContractTermPatch({ startDate: "2028-01-01" }, current);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.endDate?.[0]).toMatch(/on or after the start date/i);
  });

  it("rejects an out-of-range edit", () => {
    const result = validateContractTermPatch({ endDate: "70831-02-20" }, current);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.endDate).toBeTruthy();
  });

  it("allows clearing the optional review date", () => {
    const result = validateContractTermPatch({ reviewDueDate: "" }, current);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dates.reviewDueDate).toBeNull();
  });

  it("accepts a valid single-field edit", () => {
    const result = validateContractTermPatch({ endDate: "2027-12-31" }, current);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.dates.endDate?.toISOString()).toBe("2027-12-31T00:00:00.000Z");
  });
});

describe("P02.01 isRenderableContractDate — the read guard's predicate", () => {
  it("accepts a normal stored date and a null optional", () => {
    expect(isRenderableContractDate(new Date("2026-08-11T00:00:00.000Z"))).toBe(true);
    expect(isRenderableContractDate(null)).toBe(true);
    expect(isRenderableContractDate(undefined)).toBe(true);
  });

  it("rejects the shapes that made the register throw", () => {
    expect(isRenderableContractDate(new Date("invalid"))).toBe(false);
    expect(isRenderableContractDate(new Date(Date.UTC(60901, 1, 20)))).toBe(false);
    expect(isRenderableContractDate(new Date(Date.UTC(1899, 11, 31)))).toBe(false);
  });
});
