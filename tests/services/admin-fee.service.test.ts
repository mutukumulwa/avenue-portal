import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  adminFeeAgreement: { findMany: vi.fn(async (): Promise<any[]> => []), findFirst: vi.fn() },
  member: { count: vi.fn(async () => 0) },
  adminFeeLedgerEntry: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    count: vi.fn(async () => 0),
    create: vi.fn(async (a: any) => ({ id: "le1", ...a.data })),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { AdminFeeService } from "@/server/services/admin-fee.service";

describe("AdminFeeService.computeAccrual (G2.3)", () => {
  it("PMPM = rate × members", () => {
    expect(AdminFeeService.computeAccrual("PMPM", 500, 120)).toEqual({ amount: 60000, basis: 120 });
  });
  it("FLAT_PER_INSURED = rate × insured", () => {
    expect(AdminFeeService.computeAccrual("FLAT_PER_INSURED", 1000, 50)).toEqual({ amount: 50000, basis: 50 });
  });
  it("PCT_OF_CLAIMS = rate% × claims paid", () => {
    expect(AdminFeeService.computeAccrual("PCT_OF_CLAIMS", 5, 2_000_000)).toEqual({ amount: 100000, basis: 2_000_000 });
  });
  it("event-driven (card replacement) = rate × count", () => {
    expect(AdminFeeService.computeAccrual("CARD_REPLACEMENT", 500, 3)).toEqual({ amount: 1500, basis: 3 });
  });
});

describe("AdminFeeService.accruePmpmForPeriod (G2.3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes a ledger entry per PMPM agreement from the active-member count", async () => {
    db.adminFeeAgreement.findMany.mockResolvedValue([{ id: "a1", clientId: "c1", groupId: null, rate: 500, currency: "UGX" }]);
    db.member.count.mockResolvedValue(120);
    db.adminFeeLedgerEntry.findFirst.mockResolvedValue(null);
    const written = await AdminFeeService.accruePmpmForPeriod("t1", "2026-07");
    expect(written).toEqual([{ agreementId: "a1", amount: 60000, members: 120 }]);
    expect(db.adminFeeLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ method: "PMPM", period: "2026-07", amount: 60000, basis: 120 }) }),
    );
  });

  it("is idempotent — refreshes an existing (non-invoiced) entry for the period", async () => {
    db.adminFeeAgreement.findMany.mockResolvedValue([{ id: "a1", clientId: "c1", groupId: null, rate: 500, currency: "UGX" }]);
    db.member.count.mockResolvedValue(100);
    db.adminFeeLedgerEntry.findFirst.mockResolvedValue({ id: "existing" });
    await AdminFeeService.accruePmpmForPeriod("t1", "2026-07");
    expect(db.adminFeeLedgerEntry.update).toHaveBeenCalled();
    expect(db.adminFeeLedgerEntry.create).not.toHaveBeenCalled();
  });
});

describe("AdminFeeService.invoiceAccrued (G5.8)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rolls accrued entries into one invoice and marks them INVOICED", async () => {
    db.adminFeeLedgerEntry.findMany.mockResolvedValue([
      { id: "e1", amount: 60000, currency: "UGX" },
      { id: "e2", amount: 15000, currency: "UGX" },
    ]);
    db.adminFeeLedgerEntry.count.mockResolvedValue(0);
    const res = await AdminFeeService.invoiceAccrued("t1", "c1", "2026-07");
    expect(res).toMatchObject({ total: 75000, currency: "UGX", entryCount: 2 });
    expect(res!.reference).toMatch(/^AFI-\d{4}-00001$/);
    expect(db.adminFeeLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "INVOICED" }) }),
    );
  });

  it("returns null when nothing is accrued", async () => {
    db.adminFeeLedgerEntry.findMany.mockResolvedValue([]);
    expect(await AdminFeeService.invoiceAccrued("t1", "c1")).toBeNull();
  });
});
