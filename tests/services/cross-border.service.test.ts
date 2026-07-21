import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  crossBorderFacility: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    create: vi.fn(async (a: any) => ({ id: "f1", ...a.data })),
    update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
  },
  crossBorderCase: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findMany: vi.fn(async (): Promise<any[]> => []),
    create: vi.fn(async (a: any) => ({ id: "case1", ...a.data })),
    update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
    count: vi.fn(async () => 0),
  },
  crossBorderLineItem: {
    findMany: vi.fn(async (): Promise<any[]> => []),
    create: vi.fn(async (a: any) => ({ id: "li1", ...a.data })),
    createMany: vi.fn(async () => ({ count: 0 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  member: { findFirst: vi.fn(async (): Promise<any> => null) },
  adminFeeAgreement: { findFirst: vi.fn(async (): Promise<any> => null) },
  adminFeeLedgerEntry: { create: vi.fn(async (a: any) => ({ id: "le1", ...a.data })) },
  fxRate: { findFirst: vi.fn(async (): Promise<any> => null) },
  $transaction: vi.fn(async (fn: any) => fn(db)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { CrossBorderService } from "@/server/services/cross-border.service";

beforeEach(() => vi.clearAllMocks());

describe("CrossBorderService.openCase (G5.15)", () => {
  it("opens a SOURCING case with a sequential CBC number when the member belongs to the client", async () => {
    db.member.findFirst.mockResolvedValue({ id: "m1", group: { clientId: "c1" } });
    db.crossBorderCase.findFirst.mockResolvedValue({ caseNumber: `CBC-${new Date().getFullYear()}-00004` }); // latest → next is 00005
    const c = await CrossBorderService.openCase("t1", { clientId: "c1", memberId: "m1", diagnosis: "Oncology" });
    expect(db.crossBorderCase.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SOURCING", caseNumber: `CBC-${new Date().getFullYear()}-00005` }),
      }),
    );
    expect(c.status).toBe("SOURCING");
  });

  it("rejects a member that belongs to a different client (isolation)", async () => {
    db.member.findFirst.mockResolvedValue({ id: "m1", group: { clientId: "OTHER" } });
    await expect(
      CrossBorderService.openCase("t1", { clientId: "c1", memberId: "m1", diagnosis: "X" }),
    ).rejects.toThrow(/does not belong/i);
  });
});

describe("CrossBorderService.captureEstimate (FX normalisation)", () => {
  it("normalises foreign-currency lines to UGX and totals them", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "SOURCING" });
    // 1 USD = 3800 UGX
    db.fxRate.findFirst.mockResolvedValue({ rate: 3800 });
    const updated = await CrossBorderService.captureEstimate("t1", "case1", [
      { description: "Surgery", amount: 100, currency: "USD" },
      { description: "Ward", amount: 50, currency: "USD" },
    ]);
    expect(db.crossBorderLineItem.deleteMany).toHaveBeenCalledWith({ where: { caseId: "case1", kind: "ESTIMATE" } });
    expect(updated).toEqual(
      expect.objectContaining({
        estimatedAmount: 150, // uniform currency raw total
        estimatedCurrency: "USD",
        estimatedAmountUgx: 570000, // 150 × 3800
        status: "ESTIMATED",
      }),
    );
  });

  it("leaves raw total null for mixed-currency estimates", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "SOURCING" });
    db.fxRate.findFirst.mockResolvedValue(null); // identity — no rate
    const updated = await CrossBorderService.captureEstimate("t1", "case1", [
      { description: "A", amount: 100, currency: "USD" },
      { description: "B", amount: 200, currency: "EUR" },
    ]);
    expect(updated).toEqual(expect.objectContaining({ estimatedAmount: null, estimatedCurrency: null, estimatedAmountUgx: 300 }));
  });
});

describe("CrossBorderService.issueGop (GOP within limits)", () => {
  it("commits a GOP that fits within the approved limit", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "ESTIMATED" });
    db.fxRate.findFirst.mockResolvedValue({ rate: 3800 });
    const updated = await CrossBorderService.issueGop("t1", "case1", {
      amount: 100,
      currency: "USD",
      approvedLimitUgx: 500000,
    });
    expect(updated).toEqual(
      expect.objectContaining({ gopAmountUgx: 380000, gopWithinLimit: true, status: "GOP_ISSUED" }),
    );
  });

  it("rejects a GOP that exceeds the approved limit", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "ESTIMATED" });
    db.fxRate.findFirst.mockResolvedValue({ rate: 3800 });
    await expect(
      CrossBorderService.issueGop("t1", "case1", { amount: 200, currency: "USD", approvedLimitUgx: 500000 }),
    ).rejects.toThrow(/exceeds the approved limit/i);
    expect(db.crossBorderCase.update).not.toHaveBeenCalled();
  });

  it("blocks issuing a GOP from an invalid state (e.g. SOURCING)", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "SOURCING" });
    await expect(
      CrossBorderService.issueGop("t1", "case1", { amount: 1, currency: "UGX", approvedLimitUgx: 10 }),
    ).rejects.toThrow(/Invalid transition/i);
  });
});

describe("CrossBorderService.consolidateInvoice", () => {
  it("sums INVOICE lines into a single UGX total + reference", async () => {
    db.crossBorderCase.findFirst.mockImplementation(async (args: any) =>
      args?.where?.invoiceReference?.startsWith
        ? { invoiceReference: `CBI-${new Date().getFullYear()}-00002` } // latest → next is 00003
        : { id: "case1", status: "IN_TREATMENT", invoiceReference: null },
    );
    db.crossBorderLineItem.findMany.mockResolvedValue([{ amountUgx: 380000 }, { amountUgx: 190000 }]);
    const updated = await CrossBorderService.consolidateInvoice("t1", "case1");
    expect(updated).toEqual(
      expect.objectContaining({
        invoiceTotalUgx: 570000,
        invoiceReference: `CBI-${new Date().getFullYear()}-00003`,
        status: "INVOICED",
      }),
    );
  });

  it("refuses to consolidate with no invoice lines", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "IN_TREATMENT", invoiceReference: null });
    db.crossBorderLineItem.findMany.mockResolvedValue([]);
    await expect(CrossBorderService.consolidateInvoice("t1", "case1")).rejects.toThrow(/No invoice lines/i);
  });
});

describe("CrossBorderService.settle (coordination fee)", () => {
  it("accrues a CROSS_BORDER admin fee when the client has an active agreement", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "INVOICED", clientId: "c1", adminFeeLedgerEntryId: null });
    db.adminFeeAgreement.findFirst.mockResolvedValue({ id: "a1", clientId: "c1", method: "CROSS_BORDER", rate: 250000, currency: "UGX", isActive: true });
    const updated = await CrossBorderService.settle("t1", "case1");
    expect(db.adminFeeLedgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ method: "CROSS_BORDER", amount: 250000 }) }),
    );
    expect(updated).toEqual(expect.objectContaining({ status: "SETTLED", adminFeeLedgerEntryId: "le1" }));
  });

  it("settles cleanly when the client has no CROSS_BORDER agreement", async () => {
    db.crossBorderCase.findFirst.mockResolvedValue({ id: "case1", status: "INVOICED", clientId: "c1", adminFeeLedgerEntryId: null });
    db.adminFeeAgreement.findFirst.mockResolvedValue(null);
    const updated = await CrossBorderService.settle("t1", "case1");
    expect(db.adminFeeLedgerEntry.create).not.toHaveBeenCalled();
    expect(updated).toEqual(expect.objectContaining({ status: "SETTLED", adminFeeLedgerEntryId: null }));
  });
});

describe("CrossBorderService.assignFacility (vetting gate)", () => {
  it("rejects an unvetted facility", async () => {
    db.crossBorderFacility.findFirst.mockResolvedValue({ isVetted: false });
    await expect(CrossBorderService.assignFacility("t1", "case1", "f1")).rejects.toThrow(/not vetted/i);
  });
});
