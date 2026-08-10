import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * WP-N4 (N-014) — a SUSPENDED facility must not leak eligibility or member PII,
 * and a manual suspension must survive a contract lifecycle transition
 * (GAP-A1.2: syncProviderSummary must not silently revert it to ACTIVE).
 */

const db = vi.hoisted(() => ({
  provider: { findFirst: vi.fn() },
  member: { findFirst: vi.fn() },
  memberCoveragePeriod: { findMany: vi.fn(async () => []) },
  providerEligibilityCheck: { create: vi.fn(async () => ({ id: "chk-1" })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

vi.mock("@/server/services/provider-access-settings.service", () => ({
  ProviderAccessSettingsService: { isEntitlementEnforced: vi.fn(async () => false) },
  PROVIDER_ACCESS_DEFAULTS: {},
}));
vi.mock("@/server/services/provider-entitlement.service", () => ({
  ProviderEntitlementService: { entitledMemberWhere: vi.fn(async () => ({})) },
}));
vi.mock("@/server/services/provider-entitlement-shadow.service", () => ({
  ProviderEntitlementShadowService: { shadowCompareMemberLookup: vi.fn(async () => {}) },
}));

import { ProviderEligibilityService } from "@/server/services/provider-eligibility.service";
import { ProviderContractsService } from "@/server/services/provider-contracts.service";

const ctx = { tenantId: "tenant-1", providerId: "prov-1", actorType: "PROVIDER_USER", actorId: "u1", allowedProviderBranchIds: [], requestId: "req-1" } as never;

const activeMember = {
  id: "m1", firstName: "A", lastName: "B", memberNumber: "M-1", status: "ACTIVE", relationship: "PRINCIPAL",
  dateOfBirth: new Date("1990-01-01"), enrollmentDate: new Date("2025-01-01"), coverEndDate: null, packageVersionId: "pv1",
  groupId: "g1", packageId: "pk1",
  group: { name: "Scheme", status: "ACTIVE", clientId: "c1", effectiveDate: new Date("2025-01-01"), renewalDate: new Date("2027-01-01"), client: { status: "ACTIVE" } },
  package: { name: "Gold", maxAge: 200, dependentMaxAge: 200 },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.member.findFirst.mockResolvedValue(activeMember);
  db.memberCoveragePeriod.findMany.mockResolvedValue([]);
});

describe("ProviderEligibilityService.check — facility status gate", () => {
  it("a SUSPENDED facility is NOT_ELIGIBLE with no member, before any member lookup", async () => {
    db.provider.findFirst.mockResolvedValue({ contractStatus: "SUSPENDED" });
    const res = await ProviderEligibilityService.check({ ctx, memberNumber: "M-1" });
    expect(res.resultCode).toBe("NOT_ELIGIBLE");
    expect(res.found).toBe(false);
    expect(res.member).toBeUndefined();
    expect(db.member.findFirst).not.toHaveBeenCalled(); // no PII lookup for a blocked facility
    expect(db.providerEligibilityCheck.create).toHaveBeenCalledOnce(); // evidence still recorded
  });

  it("an EXPIRED facility is likewise blocked", async () => {
    db.provider.findFirst.mockResolvedValue({ contractStatus: "EXPIRED" });
    const res = await ProviderEligibilityService.check({ ctx, memberNumber: "M-1" });
    expect(res.found).toBe(false);
    expect(db.member.findFirst).not.toHaveBeenCalled();
  });

  it("an ACTIVE facility resolves the member verdict (SP-6 path preserved)", async () => {
    db.provider.findFirst.mockResolvedValue({ contractStatus: "ACTIVE" });
    const res = await ProviderEligibilityService.check({ ctx, memberNumber: "M-1" });
    expect(db.member.findFirst).toHaveBeenCalledOnce();
    expect(res.found).toBe(true);
    expect(res.resultCode).toBe("ELIGIBLE");
  });
});

describe("ProviderContractsService.syncProviderSummary — GAP-A1.2", () => {
  function fakeTx(currentStatus: string) {
    return {
      provider: {
        findUnique: vi.fn(async () => ({ contractStatus: currentStatus })),
        update: vi.fn(async (_a?: any) => ({})),
      },
      providerContract: {
        findFirst: vi.fn(async () => ({ startDate: new Date("2026-01-01"), endDate: new Date("2027-01-01"), paymentTermDays: 30, creditLimit: null })),
      },
    };
  }

  it("does NOT revert a manual SUSPENDED to ACTIVE when an active contract exists", async () => {
    const tx = fakeTx("SUSPENDED");
    await ProviderContractsService.syncProviderSummary(tx as never, "prov-1");
    expect(tx.provider.update).toHaveBeenCalledOnce();
    expect((tx.provider.update.mock.calls[0]![0] as any).data.contractStatus).toBe("SUSPENDED");
  });

  it("still syncs an unsuspended provider to ACTIVE from its active contract", async () => {
    const tx = fakeTx("PENDING");
    await ProviderContractsService.syncProviderSummary(tx as never, "prov-1");
    expect((tx.provider.update.mock.calls[0]![0] as any).data.contractStatus).toBe("ACTIVE");
  });
});
