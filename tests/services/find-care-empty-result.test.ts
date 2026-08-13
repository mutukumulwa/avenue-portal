import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UAT-HF P03.03 — Find Care must not claim there is no covered care (DEF-007).
 *
 * The run: "The Find Care page returns 'No facilities found within 20 km' …
 * and still 'No facilities found within 100 km'. The deployed network contains
 * 195 providers." Its own note is that the mechanism was "not diagnosed from
 * the front end" — no back-end inspection was performed.
 *
 * It was diagnosed here, against production: 195 providers, 195 with
 * `contractStatus = ACTIVE`, and **zero** with `geoLatitude`/`geoLongitude`.
 * The distance query requires coordinates, so no radius could ever have
 * returned a row. The search was not broken; the network was never mapped.
 *
 * Two things follow, and both are tested here:
 *
 *   1. An empty list is not evidence of an empty network. The page has to
 *      distinguish "nothing within this radius" from "nothing can be measured"
 *      before it says either.
 *   2. The nearby list must be filtered through the member's own package
 *      provider rules (DEC-04), or it commits the mirror-image error — offering
 *      and pricing a facility the member's package excludes.
 */

const mockPrisma = vi.hoisted(() => ({
  provider: { count: vi.fn(), findMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/rbac", () => ({
  requireRole: vi.fn(async () => ({ user: { id: "u1", tenantId: "t1", role: "MEMBER" } })),
  ROLES: { MEMBER: ["MEMBER"] },
}));
vi.mock("@/server/services/providers.service", () => ({
  ProvidersService: { getNearbyProvidersWithMemberEstimates: vi.fn() },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { explainEmptyFacilityResultAction } from "@/app/member/facilities/actions";
import { resolveProviderRule } from "@/lib/provider-precedence";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DEF-007 — why Find Care found nothing", () => {
  it("reports NO_MAPPED_FACILITIES when the network exists but is not geocoded", async () => {
    // Exactly production's shape on 2026-08-13.
    mockPrisma.provider.count.mockResolvedValue(0);
    mockPrisma.provider.findMany.mockResolvedValue([
      { id: "p1", name: "Kampala Hospital", tier: "TIER_1", type: "HOSPITAL", address: "Nakasero" },
      { id: "p2", name: "Mengo Clinic", tier: "TIER_2", type: "CLINIC", address: null },
    ]);

    const result = await explainEmptyFacilityResultAction();

    expect(result.reason).toBe("NO_MAPPED_FACILITIES");
    expect(result.mappableCount).toBe(0);
    // The member still gets somewhere to go. An honest "we cannot measure
    // distance" with no list is more truthful than the old message but no more
    // useful; the fallback directory is what makes it actionable.
    expect(result.directory.map((d) => d.name)).toEqual(["Kampala Hospital", "Mengo Clinic"]);
  });

  it("reports NONE_IN_RADIUS — and does NOT list a directory — when facilities are mapped", async () => {
    mockPrisma.provider.count.mockResolvedValue(195);

    const result = await explainEmptyFacilityResultAction();

    expect(result.reason).toBe("NONE_IN_RADIUS");
    expect(result.mappableCount).toBe(195);
    expect(result.directory).toEqual([]);
    // Distance genuinely applies here, so dumping the whole network would
    // undo the filter the member just asked for.
    expect(mockPrisma.provider.findMany).not.toHaveBeenCalled();
  });

  it("scopes both queries to the caller's tenant", async () => {
    mockPrisma.provider.count.mockResolvedValue(0);
    mockPrisma.provider.findMany.mockResolvedValue([]);

    await explainEmptyFacilityResultAction();

    expect(mockPrisma.provider.count.mock.calls[0][0].where.tenantId).toBe("t1");
    expect(mockPrisma.provider.findMany.mock.calls[0][0].where.tenantId).toBe("t1");
  });

  it("only counts ACTIVE contracts as mappable", async () => {
    mockPrisma.provider.count.mockResolvedValue(0);
    mockPrisma.provider.findMany.mockResolvedValue([]);

    await explainEmptyFacilityResultAction();

    const where = mockPrisma.provider.count.mock.calls[0][0].where;
    expect(where.contractStatus).toBe("ACTIVE");
    expect(where.geoLatitude).toEqual({ not: null });
    expect(where.geoLongitude).toEqual({ not: null });
  });
});

describe("DEF-007 — the nearby list respects the member's own network", () => {
  // The filter the service now applies. Asserted at the decision level because
  // that is the contract the service depends on; provider-precedence.test.ts
  // covers the ladder itself.
  // Specificity is DERIVED (a rule naming a provider outranks a tier rule), so
  // the stored value is just INCLUDE/EXCLUDE — there is no "SPECIFIC_EXCLUDE"
  // column to set.
  const excludeMengo = [
    { id: "r1", providerId: "p2", providerTier: null, inclusionType: "EXCLUDE" as const, priority: 0, effectiveFrom: null, effectiveTo: null, isActive: true },
  ];

  it("drops a facility the member's package excludes", () => {
    expect(resolveProviderRule(excludeMengo, { id: "p2", tier: "TIER_2" }).payable).toBe(false);
  });

  it("keeps a facility no rule names", () => {
    expect(resolveProviderRule(excludeMengo, { id: "p1", tier: "TIER_1" }).payable).toBe(true);
  });

  it("treats a package with no rules as unrestricted, not as excluding everything", () => {
    // The failure mode to avoid: a fail-closed default would have turned every
    // member on a rule-free package into a second, self-inflicted DEF-007.
    const verdict = resolveProviderRule([], { id: "p1", tier: "TIER_1" });
    expect(verdict.decision).toBe("UNRESTRICTED");
    expect(verdict.payable).toBe(true);
  });
});
