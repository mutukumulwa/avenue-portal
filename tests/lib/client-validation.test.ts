import { describe, it, expect } from "vitest";
import {
  clientCreateSchema,
  clientEditSchema,
  ALLOWED_CURRENCIES,
  PAYER_TYPE_VALUES,
} from "@/lib/validation/client";

const base = { name: "Lakeview", type: "INSURER", currency: "UGX" };

describe("clientCreateSchema (SP-1 / DEF-013/014/015/017)", () => {
  it("requires name, type and currency — no silent defaults (C-002)", () => {
    const r = clientCreateSchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) {
      const f = r.error.flatten().fieldErrors;
      expect(f.name?.length).toBeGreaterThan(0);
      expect(f.type?.length).toBeGreaterThan(0);
      expect(f.currency?.length).toBeGreaterThan(0);
    }
  });

  it("rejects a name-only submit (type + currency still required) (C-002)", () => {
    const r = clientCreateSchema.safeParse({ name: "Lakeview" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const f = r.error.flatten().fieldErrors;
      expect(f.type?.length).toBeGreaterThan(0);
      expect(f.currency?.length).toBeGreaterThan(0);
    }
  });

  it("trims + collapses the name (so C-003 duplicates share a key)", () => {
    const r = clientCreateSchema.safeParse({ ...base, name: "  Lake   view  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe("Lake view");
  });

  it("rejects a name over 160 chars", () => {
    const r = clientCreateSchema.safeParse({ ...base, name: "x".repeat(161) });
    expect(r.success).toBe(false);
  });

  it("accepts ALL five PayerType values (DEF-013)", () => {
    for (const t of PAYER_TYPE_VALUES) {
      expect(clientCreateSchema.safeParse({ ...base, type: t }).success).toBe(true);
    }
  });

  it("rejects a type outside the enum", () => {
    expect(clientCreateSchema.safeParse({ ...base, type: "BANK" }).success).toBe(false);
  });

  it("enforces the currency allow-list", () => {
    for (const c of ALLOWED_CURRENCIES) {
      expect(clientCreateSchema.safeParse({ ...base, currency: c }).success).toBe(true);
    }
    expect(clientCreateSchema.safeParse({ ...base, currency: "EUR" }).success).toBe(false);
    expect(clientCreateSchema.safeParse({ ...base, currency: "ugx" }).success).toBe(false);
  });

  it("treats blank slug/prefix as omitted (undefined)", () => {
    const r = clientCreateSchema.safeParse({ ...base, slug: "", memberNumberPrefix: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.slug).toBeUndefined();
      expect(r.data.memberNumberPrefix).toBeUndefined();
    }
  });

  it("validates the optional slug regex", () => {
    expect(clientCreateSchema.safeParse({ ...base, slug: "lake-view" }).success).toBe(true);
    expect(clientCreateSchema.safeParse({ ...base, slug: "ab" }).success).toBe(false); // too short
    expect(clientCreateSchema.safeParse({ ...base, slug: "Lake View" }).success).toBe(false); // spaces/caps
  });

  it("accepts a clean lowercase prefix as its uppercase form (D3 courtesy)", () => {
    const r = clientCreateSchema.safeParse({ ...base, memberNumberPrefix: "lmu" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.memberNumberPrefix).toBe("LMU");
  });

  it.each([
    ["whitespace", "L M U"],
    ["slash", "LM/U"],
    ["apostrophe", "LM'U"],
    ["emoji", "LM😀"],
    ["formula-like", "=SUM("],
    ["out-of-format", "1LM"],
  ])("rejects an unsafe prefix (%s) — C-004", (_label, value) => {
    const r = clientCreateSchema.safeParse({ ...base, memberNumberPrefix: value });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.memberNumberPrefix?.length).toBeGreaterThan(0);
  });
});

describe("clientEditSchema", () => {
  it("REQUIRES currency (kills the omission-rewrite bug)", () => {
    const r = clientEditSchema.safeParse({ name: "Lakeview", type: "INSURER", status: "ACTIVE" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.currency?.length).toBeGreaterThan(0);
  });

  it("does not accept slug or prefix (immutable — DEF-012)", () => {
    const r = clientEditSchema.safeParse({
      name: "Lakeview",
      type: "INSURER",
      currency: "UGX",
      status: "ACTIVE",
      slug: "hacked",
      memberNumberPrefix: "HAX",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("slug" in r.data).toBe(false);
      expect("memberNumberPrefix" in r.data).toBe(false);
    }
  });

  it("validates the status enum", () => {
    expect(
      clientEditSchema.safeParse({ name: "L", type: "INSURER", currency: "UGX", status: "ZOMBIE" }).success,
    ).toBe(false);
  });
});
