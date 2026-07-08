import { describe, it, expect, beforeEach, vi } from "vitest";

// BD-04: a contracted service billed WITHOUT its CPT must still bind to the
// tariff by exact service description — otherwise a provider escapes the ceiling
// simply by omitting the code.
const activeContract = {
  id: "c1",
  contractNumber: "PC-2026-001",
  title: "Aga Khan OP",
  status: "ACTIVE",
  unlistedServiceRule: "REFER_FOR_REVIEW",
  unlistedDiscountPct: null,
  invoiceDiscountPct: null,
  startDate: new Date("2026-01-01"),
  endDate: new Date("2030-01-01"),
};

const db = vi.hoisted(() => ({
  providerContract: { findFirst: vi.fn() },
  providerTariff: { findMany: vi.fn() },
  providerContractExclusion: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ProviderContractsService } from "@/server/services/provider-contracts.service";

const tariff = (over: Record<string, unknown>) => ({
  id: "t1", providerId: "p1", contractId: "c1", clientId: null, cptCode: "99213",
  serviceName: "GP Consultation", standardDescription: null, providerDescription: null,
  agreedRate: 3500, currency: "UGX", tariffType: "NEGOTIATED",
  requiresPreauth: false, maxQuantityPerVisit: null, effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null, isActive: true, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.providerContract.findFirst.mockResolvedValue(activeContract);
});

describe("resolveClaimLineRates — CPT-less description match (BD-04)", () => {
  it("binds a CPT-less line to the contracted rate via exact serviceName", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({ cptCode: "99213" })]);
    const line = { id: "l1", cptCode: null, description: "gp consultation", unitCost: 80000, quantity: 1 };

    const res = await ProviderContractsService.resolveClaimLineRates(
      "t1", "p1", new Date("2026-06-01"), [line], null,
    );

    expect(res.lines[0].agreedRate).toBe(3500);
    expect(res.lines[0].allowedUnit).toBe(3500); // min(agreedRate, billed)
    expect(res.lines[0].ruleApplied).toBe("CONTRACT_TARIFF");
  });

  it("matches on standardDescription too", async () => {
    db.providerTariff.findMany.mockResolvedValue([
      tariff({ serviceName: "OPD Consult", standardDescription: "General Practitioner Visit" }),
    ]);
    const line = { id: "l1", cptCode: null, description: "general practitioner visit", unitCost: 80000, quantity: 1 };

    const res = await ProviderContractsService.resolveClaimLineRates(
      "t1", "p1", new Date("2026-06-01"), [line], null,
    );

    expect(res.lines[0].agreedRate).toBe(3500);
    expect(res.lines[0].ruleApplied).toBe("CONTRACT_TARIFF");
  });

  it("leaves a genuinely unlisted CPT-less line as UNLISTED_REFER (no guessed ceiling)", async () => {
    db.providerTariff.findMany.mockResolvedValue([]); // nothing matches the description
    const line = { id: "l1", cptCode: null, description: "bespoke concierge service", unitCost: 80000, quantity: 1 };

    const res = await ProviderContractsService.resolveClaimLineRates(
      "t1", "p1", new Date("2026-06-01"), [line], null,
    );

    expect(res.lines[0].allowedUnit).toBeNull();
    expect(res.lines[0].ruleApplied).toBe("UNLISTED_REFER");
  });
});
