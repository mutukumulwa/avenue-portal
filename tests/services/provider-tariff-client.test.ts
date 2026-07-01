import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  providerContract: { findFirst: vi.fn(async () => null) },
  providerTariff: { findMany: vi.fn() },
  providerContractExclusion: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ProviderContractsService } from "@/server/services/provider-contracts.service";

const tariff = (over: any) => ({
  id: over.id, providerId: "p1", contractId: null, clientId: null, cptCode: "99213",
  serviceName: "Consult", agreedRate: over.agreedRate, currency: "UGX", tariffType: "NEGOTIATED",
  requiresPreauth: false, maxQuantityPerVisit: null, effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null, isActive: true, ...over,
});

const line = { id: "l1", cptCode: "99213", description: "Consult", unitCost: 150, quantity: 1 };

describe("Per-client provider tariffs (G5.4)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the client-specific rate over the shared master rate", async () => {
    db.providerTariff.findMany.mockResolvedValue([
      tariff({ id: "master", clientId: null, agreedRate: 100 }),
      tariff({ id: "clientC1", clientId: "c1", agreedRate: 80 }),
    ]);
    const res = await ProviderContractsService.resolveClaimLineRates("t1", "p1", new Date("2026-06-01"), [line], "c1");
    expect(res.lines[0].agreedRate).toBe(80);
  });

  it("falls back to the master rate when the client has no specific tariff", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({ id: "master", clientId: null, agreedRate: 100 })]);
    const res = await ProviderContractsService.resolveClaimLineRates("t1", "p1", new Date("2026-06-01"), [line], "c1");
    expect(res.lines[0].agreedRate).toBe(100);
  });
});
