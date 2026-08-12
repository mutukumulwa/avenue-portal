/**
 * UAT-HF P01.05 — money parsing must never change a magnitude silently.
 *
 * DEF-018 (S2): typing "300k" into a UGX benefit-limit field silently became
 * 300 — a 1000x understatement of a member's cover, with no warning. The native
 * `<input type="number">` discarded the trailing "k".
 *
 * DEF-021: a 0% co-contribution was rejected as if missing, contradicting the
 * field's own 0-100 range — the classic `if (!value)` truthiness bug.
 */
import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { MONEY_INPUT_HINT, formatMoneyReadback, parseMoney, parsePercent } from "@/lib/money";

const value = (input: unknown, options = {}) => {
  const result = parseMoney(input, options);
  if (!result.ok) throw new Error(`expected ${String(input)} to parse, got ${result.reason}`);
  return result.value.toString();
};

describe("P01.05 parseMoney — the DEF-018 defence", () => {
  it("REJECTS a magnitude suffix instead of truncating it", () => {
    // The exact input that became 300.
    const result = parseMoney("300k");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("MAGNITUDE_SUFFIX");
    // And the message tells the user what to do, naming the real amount.
    expect(result.message).toContain("300000");
  });

  it.each(["300k", "300K", "1.2m", "1.2M", "5bn", "300 k", "2 million", "3thousand"])(
    "rejects %s",
    (input) => {
      const result = parseMoney(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("MAGNITUDE_SUFFIX");
    },
  );

  it("never silently partially-parses, the way parseFloat does", () => {
    // parseFloat("300k") === 300, which is the whole bug.
    expect(parseFloat("300k")).toBe(300);
    expect(parseMoney("300k").ok).toBe(false);
  });

  it("accepts the supported grammar exactly", () => {
    expect(value("300000")).toBe("300000");
    expect(value("300,000")).toBe("300000");
    expect(value("1,196,212.33")).toBe("1196212.33"); // the DEF-040 refund figure
    expect(value("300000.50")).toBe("300000.5");
    expect(value("0")).toBe("0");
    expect(value("0.00")).toBe("0");
  });

  it("tolerates a pasted currency code but ignores it", () => {
    expect(value("UGX 300,000")).toBe("300000");
    expect(value("300000 UGX")).toBe("300000");
  });

  it("treats zero as a real amount, not as absent", () => {
    const result = parseMoney("0");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.isZero()).toBe(true);
  });

  it.each([
    ["", "EMPTY"],
    ["   ", "EMPTY"],
    ["abc", "NOT_A_NUMBER"],
    ["1e5", "NOT_A_NUMBER"],
    ["3.4.5", "NOT_A_NUMBER"],
    ["1,00,000", "NOT_A_NUMBER"],
    ["300.123", "TOO_MANY_DECIMALS"],
    ["-500", "NEGATIVE"],
  ])("rejects %s as %s", (input, reason) => {
    const result = parseMoney(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("allows a negative only when the caller opts in", () => {
    expect(parseMoney("-500").ok).toBe(false);
    expect(value("-500", { allowNegative: true })).toBe("-500");
  });

  it("treats blank as zero only when the caller opts in", () => {
    expect(parseMoney("").ok).toBe(false);
    expect(value("", { blankIsZero: true })).toBe("0");
  });

  it("rejects an absurd magnitude rather than storing it", () => {
    const result = parseMoney("9".repeat(20));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("TOO_LARGE");
  });

  it("handles numbers and rejects NaN/Infinity", () => {
    expect(value(300000)).toBe("300000");
    expect(parseMoney(NaN).ok).toBe(false);
    expect(parseMoney(Infinity).ok).toBe(false);
    expect(parseMoney({}).ok).toBe(false);
  });

  it("returns a Decimal, not a float, so money arithmetic stays exact", () => {
    // The point of Decimal: 0.1 + 0.2 !== 0.3 in binary floating point, and a
    // benefit balance computed that way drifts.
    const a = parseMoney("0.1");
    const b = parseMoney("0.2");
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) throw new Error("unreachable");
    expect(a.value.plus(b.value).toString()).toBe("0.3");
    expect(0.1 + 0.2).not.toBe(0.3); // what we are avoiding

    // And a full-width UGX figure round-trips without rounding.
    const big = parseMoney("999999999999.99");
    expect(big.ok).toBe(true);
    if (big.ok) expect(big.value.toString()).toBe("999999999999.99");
  });

  it("publishes the grammar as user-facing copy", () => {
    expect(MONEY_INPUT_HINT).toContain("300000");
    expect(MONEY_INPUT_HINT).toMatch(/do not use 'k'/i);
  });
});

describe("P01.05 formatMoneyReadback", () => {
  it("reads back what the system understood, in UGX by default", () => {
    // DEF-018's other half: show the user the parsed value before saving.
    expect(formatMoneyReadback(new Prisma.Decimal(300000))).toContain("300,000");
    expect(formatMoneyReadback(new Prisma.Decimal(300000))).toContain("UGX");
  });

  it("shows decimals only when there are any", () => {
    expect(formatMoneyReadback(new Prisma.Decimal("300000"))).not.toContain(".00");
    expect(formatMoneyReadback(new Prisma.Decimal("1196212.33"))).toContain("1,196,212.33");
  });

  it("honours an explicit foreign currency", () => {
    expect(formatMoneyReadback(new Prisma.Decimal(500), "KES")).toContain("KES");
  });

  it("never throws on rubbish", () => {
    expect(formatMoneyReadback("not-money")).toBe("—");
  });
});

describe("P01.05 parsePercent — the DEF-021 defence", () => {
  it("accepts 0 as a real percentage", () => {
    const result = parsePercent("0");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.isZero()).toBe(true);
  });

  it("accepts the boundaries and a trailing sign", () => {
    for (const input of ["0", "10", "10%", "100", "12.5"]) {
      expect(parsePercent(input).ok, input).toBe(true);
    }
  });

  it("rejects out-of-range and non-numeric values with the field's own range", () => {
    for (const input of ["101", "-1"]) {
      const result = parsePercent(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("OUT_OF_RANGE");
    }
    expect(parsePercent("ten").ok).toBe(false);
    expect(parsePercent("").ok).toBe(false);
    expect(parsePercent(null).ok).toBe(false);
  });

  it("distinguishes 0 from absent — the actual bug", () => {
    const zero = parsePercent("0");
    const absent = parsePercent("");
    expect(zero.ok).toBe(true);
    expect(absent.ok).toBe(false);
  });
});
