/**
 * Outstanding-Conditions Ticket 3 — shared money formatter (OBS-2).
 */
import { describe, it, expect } from "vitest";
import { formatMoney, formatBaseMoney, formatCurrency, BASE_CURRENCY } from "@/lib/utils";

describe("formatMoney", () => {
  it("renders the row's actual currency, not a hardcoded one", () => {
    expect(formatMoney(1000, "UGX")).toContain("UGX");
    expect(formatMoney(1000, "KES")).toMatch(/KES|KSh|Ksh/);
  });

  it("defaults to base currency (UGX) when none is given", () => {
    expect(BASE_CURRENCY).toBe("UGX");
    expect(formatMoney(1000)).toContain("UGX");
    expect(formatBaseMoney(1000)).toContain("UGX");
  });

  it("renders CODE + number for unrecognised currencies without throwing", () => {
    // Well-formed but unknown ISO code — code display keeps it readable.
    expect(formatMoney(1234, "ZZZ")).toMatch(/ZZZ\s*1,234/);
  });

  it("falls back to plain CODE + number for a malformed currency code", () => {
    // 2-letter code is invalid → Intl throws → catch-branch fallback.
    expect(formatMoney(1234, "XX")).toBe("XX 1,234");
  });

  it("coerces non-finite input to 0", () => {
    expect(formatMoney(NaN, "UGX")).toContain("0");
    expect(formatMoney("not-a-number", "UGX")).toContain("0");
  });

  it("honours showDecimals", () => {
    expect(formatMoney(1234.5, "UGX", { showDecimals: true })).toMatch(/1,234\.50/);
    expect(formatMoney(1234.5, "UGX")).not.toMatch(/\.50/);
  });

  it("formatCurrency stays back-compatible but now defaults to base (UGX)", () => {
    expect(formatCurrency(500)).toContain("UGX");
    expect(formatCurrency(500, "KES")).toMatch(/KES|KSh|Ksh/);
  });
});
