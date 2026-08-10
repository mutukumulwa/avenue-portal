/**
 * PRIVACY-S1-A — the provider eligibility DEFAULT (enforcement-OFF) path must be
 * entitlement-scoped.
 *
 * Because ProviderAccessSettings.entitlementEnforcement defaults FALSE, the
 * default path is the LIVE path. Before WP-3.5B it did a tenant-only
 * member.findFirst and returned the real first/last name + scheme/package for
 * ANY member number in the tenant, from ANY provider login — a card-number
 * enumeration + name-disclosure oracle. This suite pins the fix: the default
 * path scopes the lookup by ProviderEntitlementService.entitledMemberWhere, an
 * out-of-entitlement number is indistinguishable from an absent one, and no name
 * is ever disclosed for a not-found result. Mock-based (tests/services convention).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const ENTITLEMENT_WHERE = { group: { clientId: { in: ["entitled-client"] } } } as const;

const settings = vi.hoisted(() => ({ enforced: false }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/server/services/provider-access-settings.service", () => ({
  ProviderAccessSettingsService: { isEntitlementEnforced: async () => settings.enforced },
}));
vi.mock("@/server/services/provider-entitlement.service", () => ({
  ProviderEntitlementService: { entitledMemberWhere: vi.fn(async () => ENTITLEMENT_WHERE) },
}));
vi.mock("@/server/services/provider-entitlement-shadow.service", () => ({
  ProviderEntitlementShadowService: { shadowCompareMemberLookup: vi.fn(async () => "AGREE_ALLOW") },
}));

import { ProviderEligibilityService } from "@/server/services/provider-eligibility.service";
import { ProviderEntitlementService } from "@/server/services/provider-entitlement.service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

function makeDb(memberRow: AnyRow) {
  const captured: { where: AnyRow } = { where: null };
  const db: AnyRow = {
    member: {
      findFirst: vi.fn(async ({ where }: AnyRow) => {
        captured.where = where;
        return memberRow;
      }),
    },
    providerEligibilityCheck: { create: vi.fn(async () => ({ id: "chk_1" })) },
  };
  return { db, captured };
}

const ctx: AnyRow = {
  tenantId: "t1",
  providerId: "pA",
  actorType: "PROVIDER_USER",
  actorId: "user-1",
  allowedProviderBranchIds: [],
  requestId: "req-1",
};

const ENTITLED_MEMBER = {
  id: "m1",
  firstName: "Grace",
  lastName: "Namono",
  memberNumber: "MVX-1",
  status: "ACTIVE",
  group: { name: "Lakeview Staff", status: "ACTIVE", clientId: "entitled-client" },
  groupId: "g1",
  package: { name: "Gold" },
  packageId: "pkg1",
};

beforeEach(() => {
  vi.clearAllMocks();
  settings.enforced = false; // DEFAULT path — the live path
});

describe("PRIVACY-S1-A provider eligibility default path is entitlement-scoped", () => {
  it("merges the provider entitlement filter into the member lookup (not tenant-only)", async () => {
    const { db, captured } = makeDb(null);
    await ProviderEligibilityService.check({ ctx, memberNumber: "MVX-1" }, db);
    expect(ProviderEntitlementService.entitledMemberWhere).toHaveBeenCalledWith("pA", expect.any(Date));
    expect(captured.where).toMatchObject({ tenantId: "t1", ...ENTITLEMENT_WHERE });
    expect(captured.where.memberNumber).toMatchObject({ equals: "MVX-1", mode: "insensitive" });
  });

  it("out-of-entitlement (or absent) member: non-enumerating not-found, NO name/scheme disclosed", async () => {
    const { db } = makeDb(null); // entitlement-scoped query finds nothing
    const res = await ProviderEligibilityService.check({ ctx, memberNumber: "MVX-outside" }, db);
    expect(res.found).toBe(false);
    expect(res.resultCode).toBe("NOT_ELIGIBLE");
    expect(res.member).toBeUndefined();
    expect(res.schemeName ?? null).toBeNull();
    expect(res.packageName ?? null).toBeNull();
    expect(JSON.stringify(res)).not.toMatch(/outside|firstName|lastName|Namono/i);
  });

  it("an entitled, active member still resolves and is ELIGIBLE", async () => {
    const { db } = makeDb(ENTITLED_MEMBER);
    const res = await ProviderEligibilityService.check({ ctx, memberNumber: "MVX-1" }, db);
    expect(res.found).toBe(true);
    expect(res.resultCode).toBe("ELIGIBLE");
    expect(res.member).toEqual({ firstName: "Grace", lastName: "Namono", memberNumber: "MVX-1" });
  });

  it("not-found message is identical for absent vs out-of-entitlement (no existence oracle)", async () => {
    const absent = await ProviderEligibilityService.check({ ctx, memberNumber: "MVX-absent" }, makeDb(null).db);
    const outside = await ProviderEligibilityService.check({ ctx, memberNumber: "MVX-outside" }, makeDb(null).db);
    expect(absent.safeExplanation).toBe(outside.safeExplanation);
    expect(absent.found).toBe(false);
    expect(outside.found).toBe(false);
  });
});
