import { describe, it, expect, beforeEach, vi } from "vitest";

// Mutable fixture the mocked Prisma returns for every findMany.
let mockEntries: any[] = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    terminologyEntry: {
      findMany: vi.fn(async () => mockEntries),
    },
  },
}));

import { TerminologyService } from "@/server/services/terminology.service";

const T = "t1";
const entry = (over: Partial<any>) => ({
  scope: "SYSTEM",
  clientId: null,
  locale: null,
  key: "policy",
  displayText: "Policy",
  ...over,
});

describe("TerminologyService.resolve — 4-level precedence (G2.4)", () => {
  beforeEach(() => {
    mockEntries = [];
    TerminologyService.invalidate(T);
  });

  it("falls back to the provided fallback when no entry matches", async () => {
    expect(
      await TerminologyService.resolve({ tenantId: T, key: "premium", fallback: "Premium" }),
    ).toBe("Premium");
  });

  it("falls back to the key itself when no entry and no fallback", async () => {
    expect(await TerminologyService.resolve({ tenantId: T, key: "premium" })).toBe("premium");
  });

  it("uses SYSTEM when it is the only scope present", async () => {
    mockEntries = [entry({ scope: "SYSTEM", displayText: "Policy" })];
    expect(await TerminologyService.resolve({ tenantId: T, key: "policy" })).toBe("Policy");
  });

  it("HOUSE overrides SYSTEM", async () => {
    mockEntries = [
      entry({ scope: "SYSTEM", displayText: "Policy" }),
      entry({ scope: "HOUSE", displayText: "Cover" }),
    ];
    expect(await TerminologyService.resolve({ tenantId: T, key: "policy" })).toBe("Cover");
  });

  it("CLIENT override beats HOUSE and SYSTEM (for that client only)", async () => {
    mockEntries = [
      entry({ scope: "SYSTEM", displayText: "Policy" }),
      entry({ scope: "HOUSE", displayText: "Cover" }),
      entry({ scope: "CLIENT", clientId: "c1", displayText: "Membership" }),
    ];
    expect(
      await TerminologyService.resolve({ tenantId: T, key: "policy", clientId: "c1" }),
    ).toBe("Membership");
    // A different client does not see c1's override.
    TerminologyService.invalidate(T);
    expect(
      await TerminologyService.resolve({ tenantId: T, key: "policy", clientId: "c2" }),
    ).toBe("Cover");
  });

  it("a locale-specific entry beats a locale-agnostic one of the same scope", async () => {
    mockEntries = [
      entry({ scope: "CLIENT", clientId: "c1", locale: null, displayText: "Membership" }),
      entry({ scope: "CLIENT", clientId: "c1", locale: "lg-UG", displayText: "Bbaluwa" }),
    ];
    expect(
      await TerminologyService.resolve({ tenantId: T, key: "policy", clientId: "c1", locale: "lg-UG" }),
    ).toBe("Bbaluwa");
  });

  it("a locale-specific entry does NOT apply when the locale differs", async () => {
    mockEntries = [
      entry({ scope: "HOUSE", locale: "lg-UG", displayText: "Bbaluwa" }),
      entry({ scope: "SYSTEM", locale: null, displayText: "Policy" }),
    ];
    expect(
      await TerminologyService.resolve({ tenantId: T, key: "policy", locale: "en-UG" }),
    ).toBe("Policy");
  });
});
