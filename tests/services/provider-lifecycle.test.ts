/**
 * PR-005/PR-006 acceptance — duplicate-name policy, shared operational
 * selectability helper, status lifecycle guards.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  provider: {
    findFirst: vi.fn(async (_a?: any): Promise<unknown> => null),
    findUnique: vi.fn(),
    create: vi.fn(async (a: any) => ({ id: "prov-new", ...a.data })),
    update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
    findMany: vi.fn(async (): Promise<any[]> => []),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ProvidersService, DuplicateProviderNameError } from "@/server/services/providers.service";

const T = "t1";
const base = {
  name: "LifeCare Hospital",
  type: "HOSPITAL" as never,
  tier: "PARTNER" as never,
  servicesOffered: ["Outpatient"],
  paymentTermDays: 30,
  contractStatus: "PENDING",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.provider.findFirst.mockResolvedValue(null);
});

describe("duplicate-name policy (PR-005 #3)", () => {
  it("warns (typed error with the existing record) on a tenant-scoped case-insensitive duplicate", async () => {
    db.provider.findFirst.mockResolvedValue({ id: "prov-1", name: "LifeCare Hospital" });
    await expect(ProvidersService.createProvider(T, base)).rejects.toBeInstanceOf(DuplicateProviderNameError);
    const where = db.provider.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(T);
    expect(where.name.mode).toBe("insensitive");
  });

  it("create-anyway proceeds past the duplicate warning", async () => {
    db.provider.findFirst.mockResolvedValue({ id: "prov-1", name: "LifeCare Hospital" });
    const created = await ProvidersService.createProvider(T, { ...base, allowDuplicateName: true });
    expect(created.id).toBe("prov-new");
  });
});

describe("operational selectability (PR-006 #3)", () => {
  it("only ACTIVE providers are operational for new encounters", () => {
    expect(ProvidersService.isOperational("ACTIVE")).toBe(true);
    for (const s of ["PENDING", "SUSPENDED", "EXPIRED"]) {
      expect(ProvidersService.isOperational(s)).toBe(false);
    }
  });

  it("the shared where-clause filters to encounter statuses", () => {
    expect(ProvidersService.operationalWhere(T)).toEqual({
      tenantId: T,
      contractStatus: { in: ["ACTIVE"] },
    });
  });

  it("settlement keeps suspended/expired providers payable — only PENDING is excluded", () => {
    expect([...ProvidersService.SETTLEMENT_STATUSES]).toEqual(["ACTIVE", "SUSPENDED", "EXPIRED"]);
  });
});

describe("status lifecycle (PR-006 #2)", () => {
  it("activates a PENDING provider with a reason", async () => {
    db.provider.findUnique.mockResolvedValue({ contractStatus: "PENDING", name: "LifeCare" });
    const { previousStatus } = await ProvidersService.setProviderStatus(T, "prov-1", "ACTIVE", "onboarding complete");
    expect(previousStatus).toBe("PENDING");
    expect(db.provider.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contractStatus: "ACTIVE" } }),
    );
  });

  it("requires a reason", async () => {
    db.provider.findUnique.mockResolvedValue({ contractStatus: "PENDING", name: "LifeCare" });
    await expect(ProvidersService.setProviderStatus(T, "prov-1", "ACTIVE", "")).rejects.toThrow(/reason/);
  });

  it("rejects a no-op transition", async () => {
    db.provider.findUnique.mockResolvedValue({ contractStatus: "ACTIVE", name: "LifeCare" });
    await expect(ProvidersService.setProviderStatus(T, "prov-1", "ACTIVE", "why not")).rejects.toThrow(/already ACTIVE/);
  });
});
