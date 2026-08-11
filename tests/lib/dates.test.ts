/**
 * ELIG-GAP-007 — the shared valid-date guard. `new Date("not-a-date")` is an
 * Invalid Date (not null, not a throw); these helpers turn that into a controlled
 * null / fallback so it never reaches Prisma or date arithmetic.
 */
import { describe, it, expect } from "vitest";
import { parseValidDate, parseValidDateOr, isValidDateInput } from "@/lib/dates";

describe("parseValidDate", () => {
  it("returns a Date for a valid ISO / date string", () => {
    expect(parseValidDate("2026-08-11")).toBeInstanceOf(Date);
    expect(parseValidDate("2026-08-11T09:30:00Z")?.getUTCFullYear()).toBe(2026);
  });

  it("returns null for an invalid, empty, or missing value", () => {
    expect(parseValidDate("not-a-date")).toBeNull();
    expect(parseValidDate("")).toBeNull();
    expect(parseValidDate(null)).toBeNull();
    expect(parseValidDate(undefined)).toBeNull();
    expect(parseValidDate("2026-13-45")).toBeNull(); // impossible month/day
  });
});

describe("parseValidDateOr", () => {
  const fb = new Date("2000-01-01T00:00:00Z");
  it("uses the parsed date when valid, the fallback otherwise", () => {
    expect(parseValidDateOr("2026-08-11", fb).getUTCFullYear()).toBe(2026);
    expect(parseValidDateOr("garbage", fb)).toBe(fb);
    expect(parseValidDateOr(undefined, fb)).toBe(fb);
  });
});

describe("isValidDateInput", () => {
  it("treats empty/undefined as 'not provided' (valid) and rejects only malformed values", () => {
    expect(isValidDateInput("")).toBe(true);
    expect(isValidDateInput(undefined)).toBe(true);
    expect(isValidDateInput("2026-08-11")).toBe(true);
    expect(isValidDateInput("not-a-date")).toBe(false);
  });
});
