import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeReconciliation, rankAmendmentBacklog, summarizeRateVariance } from "@/server/services/contract-analytics.service";

describe("contract-analytics pure helpers (spec §15)", () => {
  it("computeReconciliation: recovery = billed − agreed average × claims (Old Mutual 1.1-1.3)", () => {
    // Agreed gross average 4,000 × 10 claims = 40,000; billed 50,000 → recover 10,000.
    expect(computeReconciliation(4000, 10, 50000)).toEqual({ agreedTotal: 40000, recovery: 10000 });
  });

  it("computeReconciliation: no recovery when billed is under the agreed total", () => {
    expect(computeReconciliation(4000, 10, 38000)).toEqual({ agreedTotal: 40000, recovery: 0 });
  });

  it("rankAmendmentBacklog: sorts by volume then value (dataset 5)", () => {
    const ranked = rankAmendmentBacklog([
      { description: "A", count: 2, billedAtRisk: 100 },
      { description: "B", count: 5, billedAtRisk: 10 },
      { description: "C", count: 5, billedAtRisk: 999 },
    ]);
    expect(ranked.map(r => r.description)).toEqual(["C", "B", "A"]);
  });

  it("summarizeRateVariance: cross-provider spread for the same service (dataset 11 / O12)", () => {
    const rows = summarizeRateVariance([
      { service: "OP Consultation", providerId: "p1", rate: 1000 },
      { service: "OP Consultation", providerId: "p2", rate: 4000 },
      { service: "Solo Service", providerId: "p1", rate: 500 }, // single provider → excluded
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].service).toBe("OP Consultation");
    expect(rows[0].min).toBe(1000);
    expect(rows[0].max).toBe(4000);
    expect(rows[0].providerCount).toBe(2);
    expect(rows[0].spreadPct).toBe(300); // (4000-1000)/1000
  });
});

// ── Reconciliation maker-checker ──
const db = vi.hoisted(() => ({
  claim: { aggregate: vi.fn(async (): Promise<any> => ({ _count: { _all: 10 }, _sum: { billedAmount: 50000 } })) },
  contractReconciliation: {
    create: vi.fn(async (a: any): Promise<any> => ({ id: "rec1", status: "COMPUTED", ...a.data })),
    findUnique: vi.fn(async (): Promise<any> => null),
    update: vi.fn(async (a: any): Promise<any> => ({ id: "rec1", ...a.data })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: vi.fn(async () => ({})) } }));

import { ContractReconciliationService } from "@/server/services/contract-reconciliation.service";

describe("ContractReconciliationService (finance maker-checker)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("computes recovery from pool claims and persists a COMPUTED proposal", async () => {
    const recon = await ContractReconciliationService.compute("t", {
      poolId: "OM-Q1", periodStart: new Date("2025-01-01"), periodEnd: new Date("2025-03-31"), agreedAverage: 4000, computedById: "u1",
    });
    const created = db.contractReconciliation.create.mock.calls[0][0] as any;
    expect(created.data.claimCount).toBe(10);
    expect(Number(created.data.billedTotal)).toBe(50000);
    expect(Number(created.data.agreedTotal)).toBe(40000);
    expect(Number(created.data.recovery)).toBe(10000);
    expect(recon.status).toBe("COMPUTED");
  });

  it("blocks approval by the same person who computed it (segregation of duties)", async () => {
    db.contractReconciliation.findUnique.mockResolvedValue({ id: "rec1", status: "COMPUTED", computedById: "u1", recovery: 10000 });
    await expect(ContractReconciliationService.approve("t", "rec1", "u1")).rejects.toThrow(/Segregation of duties/);
  });

  it("allows a different approver to approve", async () => {
    db.contractReconciliation.findUnique.mockResolvedValue({ id: "rec1", status: "COMPUTED", computedById: "u1", recovery: 10000 });
    const updated = await ContractReconciliationService.approve("t", "rec1", "u2");
    expect(updated.status).toBe("APPROVED");
  });
});
