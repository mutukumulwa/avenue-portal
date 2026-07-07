/**
 * PR-018 acceptance — settlement Mark Paid: one balanced JE per batch, one
 * numbered PaymentVoucher with claim links, every claim PAID with paidAt, and
 * checker approval no longer marks claims paid.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    providerSettlementBatch: {
      findUnique: vi.fn(),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
    },
    claim: {
      findMany: vi.fn(async (): Promise<any[]> => []),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      updateMany: vi.fn(async () => ({ count: 2 })),
    },
    paymentVoucher: {
      count: vi.fn(async () => 0),
      create: vi.fn(async (a: any) => ({ id: "pv1", ...a.data })),
    },
    chartOfAccount: {
      findUnique: vi.fn(async (a: any) => ({ id: `acc-${a.where.tenantId_code.code}`, code: a.where.tenantId_code.code })),
    },
    journalEntry: { count: vi.fn(async () => 0), create: vi.fn(async (a: any) => ({ id: "je1", ...a.data })) },
    auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";

const T = "t1";

beforeEach(() => {
  vi.clearAllMocks();
  db.providerSettlementBatch.findUnique.mockResolvedValue({
    id: "batch1", tenantId: T, providerId: "prov1", status: "CHECKER_APPROVED",
    totalAmount: 50000, claimCount: 2, makerId: "maker",
  });
  db.claim.findMany.mockResolvedValue([
    { id: "c1", approvedAmount: 30000 },
    { id: "c2", approvedAmount: 20000 },
  ]);
});

describe("markSettlementBatchPaid (PR-018 D1)", () => {
  it("posts one balanced SETTLEMENT_PAID JE, creates a numbered voucher with cross-links, marks claims PAID with paidAt", async () => {
    await claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1");

    // One balanced JE: Dr 2010 / Cr 1010 for the batch total.
    expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
    const je = db.journalEntry.create.mock.calls[0][0].data;
    expect(je.sourceType).toBe("SETTLEMENT_PAID");
    expect(je.sourceId).toBe("batch1");
    const lines = je.lines.create;
    expect(lines.find((l: any) => l.debit === 50000).accountId).toBe("acc-2010");
    expect(lines.find((l: any) => l.credit === 50000).accountId).toBe("acc-1010");

    // Voucher: sequence number, batch + JE cross-links, claim-level totals.
    const voucher = db.paymentVoucher.create.mock.calls[0][0].data;
    expect(voucher.voucherNumber).toMatch(/^PV-\d{4}-00001$/);
    expect(voucher.settlementBatchId).toBe("batch1");
    expect(voucher.journalEntryId).toBe("je1");
    expect(voucher.totalAmount).toBe(50000);
    expect(voucher.claimCount).toBe(2);

    // Claims paid, stamped, voucher-linked — and paidAmount = approved payable
    // per claim (NW-D05, so member "plan paid" + statements reflect settled money).
    expect(db.claim.update).toHaveBeenCalledTimes(2);
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1" },
        data: expect.objectContaining({ status: "PAID", paymentVoucherId: "pv1", paidAt: expect.any(Date), paidAmount: 30000 }),
      }),
    );
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c2" },
        data: expect.objectContaining({ status: "PAID", paidAmount: 20000 }),
      }),
    );

    // Batch settled.
    expect(db.providerSettlementBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SETTLED" }) }),
    );
  });

  it("blocks with a config error when a GL account mapping is missing (no silent skip)", async () => {
    db.chartOfAccount.findUnique.mockResolvedValue(null);
    await expect(
      claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1"),
    ).rejects.toThrow(/GL account .* not found/);
    expect(db.claim.update).not.toHaveBeenCalled();
  });

  it("only CHECKER_APPROVED batches can be marked paid", async () => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1", tenantId: T, providerId: "prov1", status: "MAKER_SUBMITTED", totalAmount: 50000,
    });
    await expect(
      claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1"),
    ).rejects.toThrow(/not approved/);
  });
});

describe("approveSettlementBatch — checker step (PR-018)", () => {
  it("no longer marks claims PAID at checker approval", async () => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1", tenantId: T, providerId: "prov1", status: "MAKER_SUBMITTED",
      totalAmount: 50000, makerId: "maker",
    });
    await claimAdjudicationService.approveSettlementBatch("batch1", T, "checker");
    expect(db.claim.update).not.toHaveBeenCalled();
    expect(db.providerSettlementBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CHECKER_APPROVED" }) }),
    );
  });

  it("maker cannot be the checker", async () => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1", tenantId: T, providerId: "prov1", status: "MAKER_SUBMITTED",
      totalAmount: 50000, makerId: "same",
    });
    await expect(
      claimAdjudicationService.approveSettlementBatch("batch1", T, "same"),
    ).rejects.toThrow(/different users/);
  });
});
