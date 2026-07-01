import { describe, it, expect } from "vitest";
import { niraService, isPlausibleNin } from "@/server/services/integrations/nira.service";

describe("NIRA identity adapter (G5.9)", () => {
  it("accepts a plausible NIN format", () => {
    expect(isPlausibleNin("CM12345678ABCD")).toBe(true);
    expect(isPlausibleNin("CF90010112345")).toBe(true);
  });

  it("rejects an implausible NIN", () => {
    expect(isPlausibleNin("123")).toBe(false);
    expect(isPlausibleNin("")).toBe(false);
    expect(isPlausibleNin("has spaces!!")).toBe(false);
  });

  it("validate() returns invalid for a bad NIN (no manual note)", async () => {
    const r = await niraService.validate("123");
    expect(r.valid).toBe(false);
    expect(r.source).toBe("stub");
  });

  it("validate() returns a manual-verification stub result for a plausible NIN", async () => {
    const r = await niraService.validate("CM12345678ABCD");
    expect(r.valid).toBe(true);
    expect(r.source).toBe("stub");
    expect(r.note).toMatch(/NIRA/);
  });
});
