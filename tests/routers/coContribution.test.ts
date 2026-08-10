/**
 * DEF-027 — the tRPC `coContribution.upsertCap` mutation is the SECOND,
 * independently-reachable door to the same caps table. Before WP-0.1 it took
 * bare `z.number()` inputs and blind-upserted with no cross-field rule and no
 * tenant-ownership check. These assert both doors now enforce the same contract:
 *
 *   - the family>=individual rule cannot be bypassed via tRPC (BAD_REQUEST,
 *     nothing written),
 *   - a packageId the caller's tenant does not own is a non-enumerating
 *     NOT_FOUND (nothing written),
 *   - valid + owned input writes exactly once, scoped to the caller's tenant.
 *
 * Seam test (caller + mocked prisma), mirroring tests/routers/preauth-router.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  package: { findFirst: vi.fn() },
  annualCoContributionCap: { upsert: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));
// Router imports the service at module load; we never call its procedures here.
vi.mock("@/server/services/coContribution/coContribution.service", () => ({
  CoContributionService: {},
}));

import { coContributionRouter } from "@/server/trpc/routers/coContribution";
import { createCallerFactory } from "@/server/trpc/trpc";

// WP-3.5B: coContribution mutations are now role-gated (upsertCap →
// underwritingProcedure). The caller must therefore carry an authorised role;
// SUPER_ADMIN passes every gate. This test still exercises the validation +
// tenant-ownership contract, not the authorization (that lives in
// tests/security/trpc-mutation-authorization.test.ts).
const caller = () =>
  createCallerFactory(coContributionRouter)({
    session: { user: { id: "u1", role: "SUPER_ADMIN", tenantId: "t1" } },
    tenantId: "t1",
    clientId: undefined,
  } as never);

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.annualCoContributionCap.upsert.mockResolvedValue({ id: "cap-1" });
});

describe("coContribution.upsertCap — DEF-027 parallel door", () => {
  it("cannot bypass the family>=individual rule (BAD_REQUEST, no write)", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg-1" });
    const err = (await caller()
      .upsertCap({ packageId: "pkg-1", individualCap: 300000, familyCap: 299999 })
      .catch((e: unknown) => e)) as { code?: string };
    expect(err.code).toBe("BAD_REQUEST");
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-positive individual cap (bare z.number() used to allow it)", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg-1" });
    const err = (await caller()
      .upsertCap({ packageId: "pkg-1", individualCap: 0, familyCap: null })
      .catch((e: unknown) => e)) as { code?: string };
    expect(err.code).toBe("BAD_REQUEST");
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled();
  });

  it("rejects a cross-tenant packageId with NOT_FOUND and writes nothing", async () => {
    mockPrisma.package.findFirst.mockResolvedValue(null); // not owned by tenant t1
    const err = (await caller()
      .upsertCap({ packageId: "pkg-other", individualCap: 300000, familyCap: 600000 })
      .catch((e: unknown) => e)) as { code?: string };
    expect(err.code).toBe("NOT_FOUND");
    expect(mockPrisma.package.findFirst).toHaveBeenCalledWith({
      where: { id: "pkg-other", tenantId: "t1" },
      select: { id: true },
    });
    expect(mockPrisma.annualCoContributionCap.upsert).not.toHaveBeenCalled();
  });

  it("writes once, tenant-scoped, for a valid + owned package", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg-1" });
    await caller().upsertCap({ packageId: "pkg-1", individualCap: 300000, familyCap: 600000 });
    expect(mockPrisma.annualCoContributionCap.upsert).toHaveBeenCalledOnce();
    const call = mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ packageId: "pkg-1" });
    expect(call.update).toEqual({ individualCap: 300000, familyCap: 600000 });
    expect(call.create.tenantId).toBe("t1");
    expect(call.create.familyCap).toBe(600000);
  });

  it("accepts a null family cap (D4: optional)", async () => {
    mockPrisma.package.findFirst.mockResolvedValue({ id: "pkg-1" });
    await caller().upsertCap({ packageId: "pkg-1", individualCap: 300000, familyCap: null });
    expect(mockPrisma.annualCoContributionCap.upsert).toHaveBeenCalledOnce();
    expect(mockPrisma.annualCoContributionCap.upsert.mock.calls[0][0].update.familyCap).toBeNull();
  });
});
