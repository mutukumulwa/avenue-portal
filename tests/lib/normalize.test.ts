import { describe, it, expect } from "vitest";
import {
  normalizeLegalName,
  normalizePrefix,
  normalizePhone,
  normalizeNationalId,
  PREFIX_RE,
} from "@/lib/normalize";

describe("normalizeLegalName (SP-3)", () => {
  it("casefolds so case-only differences collide (C-003)", () => {
    expect(normalizeLegalName("Lakeview")).toBe("lakeview");
    expect(normalizeLegalName("LAKEVIEW")).toBe("lakeview");
    expect(normalizeLegalName("Lakeview")).toBe(normalizeLegalName("LAKEVIEW"));
  });

  it("trims and collapses so space-padding differences collide (C-003)", () => {
    expect(normalizeLegalName("  Lakeview  ")).toBe("lakeview");
    expect(normalizeLegalName("Lake   view")).toBe("lake view");
    expect(normalizeLegalName(" lakeview ")).toBe(normalizeLegalName("LAKEVIEW"));
  });

  it("applies Unicode NFKC (compatibility forms fold together)", () => {
    // Fullwidth 'Ａ' (U+FF21) → 'A'; ligature 'ﬁ' (U+FB01) → 'fi'.
    expect(normalizeLegalName("Ａcme")).toBe("acme");
    expect(normalizeLegalName("ﬁrst")).toBe("first");
  });

  it("keeps genuinely different names distinct", () => {
    expect(normalizeLegalName("Lakeview")).not.toBe(normalizeLegalName("Lakeside"));
    expect(normalizeLegalName("Lake view")).not.toBe(normalizeLegalName("Lakeview"));
  });
});

describe("normalizePrefix (SP-3 / D3)", () => {
  it("accepts conforming prefixes unchanged", () => {
    expect(normalizePrefix("MVX")).toBe("MVX");
    expect(normalizePrefix("LMU")).toBe("LMU");
    expect(normalizePrefix("NWSC")).toBe("NWSC"); // 4 chars
    expect(normalizePrefix("A1B2C3")).toBe("A1B2C3"); // 6 chars, mixed
  });

  it("uppercases a lowercase input as a courtesy BEFORE validating", () => {
    expect(normalizePrefix("lmu")).toBe("LMU");
    expect(normalizePrefix("  lmu  ")).toBe("LMU"); // trim too
  });

  it("REJECTS the unsafe categories (never silently transforms) — C-004", () => {
    expect(normalizePrefix("L M")).toBeNull(); // whitespace
    expect(normalizePrefix("L/M")).toBeNull(); // slash
    expect(normalizePrefix("O'B")).toBeNull(); // apostrophe
    expect(normalizePrefix("AB😀")).toBeNull(); // emoji
    expect(normalizePrefix("=SUM(")).toBeNull(); // formula-like
    expect(normalizePrefix("=CMD")).toBeNull(); // formula-like
  });

  it("REJECTS out-of-format lengths and leading non-letters", () => {
    expect(normalizePrefix("AB")).toBeNull(); // too short (min 3)
    expect(normalizePrefix("ABCDEFG")).toBeNull(); // too long (max 6)
    expect(normalizePrefix("1AB")).toBeNull(); // must start with a letter
    expect(normalizePrefix("")).toBeNull();
  });

  it("PREFIX_RE matches the D3 decision exactly", () => {
    expect(PREFIX_RE.source).toBe("^[A-Z][A-Z0-9]{2,5}$");
  });
});

describe("normalizePhone (member-wave stub)", () => {
  it("folds Uganda formats to E.164", () => {
    expect(normalizePhone("0700123456")).toBe("+256700123456");
    expect(normalizePhone("256700123456")).toBe("+256700123456");
    expect(normalizePhone("+256700123456")).toBe("+256700123456");
    expect(normalizePhone("+256 700 123 456")).toBe("+256700123456");
  });
  it("returns null for unparseable input", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("normalizeNationalId (member-wave stub)", () => {
  it("uppercases and strips internal spaces", () => {
    expect(normalizeNationalId("  cm 123 ab ")).toBe("CM123AB");
  });
});
