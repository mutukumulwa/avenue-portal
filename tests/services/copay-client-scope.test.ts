import { describe, it, expect } from "vitest";
import { resolveRule } from "@/server/services/coContribution/ruleResolver";

const rule = (over: any): any => ({
  id: over.id, tenantId: "t1", packageId: "pkg1", clientId: null,
  benefitCategory: null, networkTier: "TIER_1", type: "PERCENTAGE",
  percentage: 20, fixedAmount: null, isActive: true,
  effectiveFrom: null, effectiveTo: null, ...over,
});

const date = new Date("2026-06-01");

describe("Copay per-client override (G3.4/G5.7)", () => {
  it("a client-specific rule wins over the package rule", () => {
    const picked = resolveRule(
      [rule({ id: "pkg", clientId: null, percentage: 20 }), rule({ id: "client", clientId: "c1", percentage: 10 })],
      "TIER_1",
      null,
      date,
      "c1",
    );
    expect(picked?.id).toBe("client");
  });

  it("another client's rule never applies", () => {
    const picked = resolveRule(
      [rule({ id: "pkg", clientId: null, percentage: 20 }), rule({ id: "otherClient", clientId: "c2", percentage: 5 })],
      "TIER_1",
      null,
      date,
      "c1",
    );
    expect(picked?.id).toBe("pkg");
  });

  it("falls back to the package rule when the client has no override", () => {
    const picked = resolveRule([rule({ id: "pkg", clientId: null })], "TIER_1", null, date, "c1");
    expect(picked?.id).toBe("pkg");
  });
});
