import { describe, it, expect, beforeEach, vi } from "vitest";

// Family Hospital UAT P01.03: the resolver reads exactly what the contract
// engine reads — the contract from the engine's precheck (findMany + include),
// the full row by id, and contract-bound candidate rows only.
const db = vi.hoisted(() => ({
  providerContract: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  providerTariff: { findMany: vi.fn() },
  providerContractExclusion: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ProviderContractsService } from "@/server/services/provider-contracts.service";

const contract = {
  id: "con-1", contractNumber: "PC-2026-001", title: "OP schedule", status: "ACTIVE",
  unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, invoiceDiscountPct: null,
  startDate: new Date("2026-01-01"), endDate: new Date("2030-01-01"),
};
const precheckRow = (over: Record<string, unknown> = {}) => ({
  ...contract, branchScope: "ALL_BRANCHES", currentVersionId: "v1", contractBranches: [], applicability: [], ...over,
});

const tariff = (over: any) => ({
  id: over.id, providerId: "p1", contractId: "con-1", branchId: null, clientId: null, cptCode: "99213",
  providerServiceCode: null, serviceName: "Consult", standardDescription: null, providerDescription: null,
  agreedRate: over.agreedRate, currency: "UGX", tariffType: "NEGOTIATED",
  requiresPreauth: false, maxQuantityPerVisit: null, effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null, isActive: true, ...over,
});

const line = { id: "l1", cptCode: "99213", description: "Consult", unitCost: 150, quantity: 1 };

describe("Per-client provider tariffs (G5.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.providerContract.findMany.mockResolvedValue([precheckRow()]);
    db.providerContract.findUnique.mockResolvedValue(contract);
  });

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

describe("P01.03 — the resolver reads only what the engine reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks for contract-bound candidate rows only — never standalone ones", async () => {
    db.providerContract.findMany.mockResolvedValue([precheckRow()]);
    db.providerContract.findUnique.mockResolvedValue(contract);
    db.providerTariff.findMany.mockResolvedValue([]);
    await ProviderContractsService.resolveClaimLineRates("t1", "p1", new Date("2026-06-01"), [line], "c1", "br-1");
    const where = db.providerTariff.findMany.mock.calls[0][0].where;
    expect(where.contractId).toBe("con-1");
    expect(JSON.stringify(where)).not.toContain('"contractId":null');
    expect(where.AND[0]).toEqual({ OR: [{ branchId: "br-1" }, { branchId: null }] });
  });

  it("with no matching contract, standalone rates do not price the line", async () => {
    db.providerContract.findMany.mockResolvedValue([]); // CON-001
    db.providerTariff.findMany.mockResolvedValue([tariff({ id: "standalone", contractId: null, agreedRate: 100 })]);
    const res = await ProviderContractsService.resolveClaimLineRates("t1", "p1", new Date("2026-06-01"), [line], "c1");
    expect(db.providerTariff.findMany).not.toHaveBeenCalled();
    expect(res.lines[0]).toMatchObject({ agreedRate: null, allowedUnit: null, ruleApplied: "NO_CONTRACT" });
    expect(res.contractResolution).toMatchObject({ matched: false, reasonCode: "CON-001" });
  });

  it("reports several matching contracts as CON-010 instead of picking the latest", async () => {
    db.providerContract.findMany.mockResolvedValue([precheckRow({ id: "con-a" }), precheckRow({ id: "con-b" })]);
    const res = await ProviderContractsService.resolveClaimLineRates("t1", "p1", new Date("2026-06-01"), [line], "c1");
    expect(res.contract).toBeNull();
    expect(res.contractResolution).toMatchObject({ matched: false, reasonCode: "CON-010" });
    expect(res.lines[0].ruleApplied).toBe("NO_CONTRACT");
  });
});
