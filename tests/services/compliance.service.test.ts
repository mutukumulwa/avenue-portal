import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  adminFeeLedgerEntry: { aggregate: vi.fn(async () => ({ _sum: { amount: 0 } })) },
  complianceLevyComputation: { upsert: vi.fn(async (a: any) => ({ id: "lv1", ...a.create, ...a.update })) },
  directorRegister: { findMany: vi.fn(async (): Promise<any[]> => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ComplianceService } from "@/server/services/compliance.service";

describe("ComplianceService.computeLevy (G1.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("levy = admin-fee ledger fees × rate% (reconciles to the ledger)", async () => {
    db.adminFeeLedgerEntry.aggregate.mockResolvedValue({ _sum: { amount: 10_000_000 } });
    await ComplianceService.computeLevy("t1", "2026", 0.5);
    expect(db.complianceLevyComputation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ feesReceivedBasis: 10_000_000, ratePercent: 0.5, amount: 50000 }),
      }),
    );
  });

  it("sums admin-fee entries whose period is within the levy year", async () => {
    await ComplianceService.computeLevy("t1", "2026", 1);
    expect(db.adminFeeLedgerEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ period: { startsWith: "2026" } }) }),
    );
  });
});

describe("ComplianceService.directorResidencyStatus (G1.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes with 3+ directors and a resident majority", async () => {
    db.directorRegister.findMany.mockResolvedValue([{ isResident: true }, { isResident: true }, { isResident: false }]);
    expect(await ComplianceService.directorResidencyStatus("t1")).toEqual({ total: 3, resident: 2, ok: true });
  });

  it("fails with fewer than 3 directors", async () => {
    db.directorRegister.findMany.mockResolvedValue([{ isResident: true }, { isResident: true }]);
    expect((await ComplianceService.directorResidencyStatus("t1")).ok).toBe(false);
  });

  it("fails without a resident majority", async () => {
    db.directorRegister.findMany.mockResolvedValue([{ isResident: true }, { isResident: false }, { isResident: false }]);
    expect((await ComplianceService.directorResidencyStatus("t1")).ok).toBe(false);
  });
});
