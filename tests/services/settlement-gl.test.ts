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
      findMany: vi.fn(async (): Promise<any[]> => []),
      create: vi.fn(async (a: any) => ({ id: "batchNew", ...a.data })),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      // FG-C7: atomic settlement claim — winner gets count 1.
      updateMany: vi.fn(async () => ({ count: 1 })),
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
    // OBS-H1: settlement now reads the fraud-gate setting (config null → gate off,
    // behaviour unchanged) and checks for unresolved fraud alerts.
    tenant: { findUnique: vi.fn(async () => ({ config: null })) },
    claimFraudAlert: { findMany: vi.fn(async (): Promise<any[]> => []) },
    // PR-V02: settle now writes set-based (updateMany + one raw UPDATE) instead
    // of a per-claim loop, so the transaction cannot time out on large batches.
    $executeRaw: vi.fn(async () => 2),
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

    // PR-V02: claims are settled with set-based writes (no per-claim loop, so a
    // 46-claim batch can't blow the interactive-transaction timeout). One
    // updateMany stamps the constant fields for the whole batch...
    expect(db.claim.update).not.toHaveBeenCalled();
    expect(db.claim.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settlementBatchId: "batch1" },
        data: expect.objectContaining({ status: "PAID", paymentVoucherId: "pv1", paidAt: expect.any(Date) }),
      }),
    );
    // ...and one raw UPDATE sets paidAmount = approvedAmount per row (NW-D05, so
    // member "plan paid" + statements reflect settled money).
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);

    // FG-C7: batch settled via the ATOMIC status-guarded claim (only a
    // CHECKER_APPROVED batch flips to SETTLED), not an unconditional update.
    expect(db.providerSettlementBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "batch1", tenantId: T, status: "CHECKER_APPROVED" }),
        data: expect.objectContaining({ status: "SETTLED" }),
      }),
    );
  });

  it("FG-C7: a concurrent/retried Mark Paid is atomically rejected — no second voucher or JE", async () => {
    // The winner already flipped the batch to SETTLED, so the atomic claim
    // matches 0 rows for the loser (the outer status read still saw
    // CHECKER_APPROVED — this is exactly the double-pay race window).
    db.providerSettlementBatch.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance2"),
    ).rejects.toThrow(/no longer awaiting payment/i);

    // The atomic claim is the FIRST write, so nothing financial was created:
    // no second voucher, no second JE, no claim re-stamp.
    expect(db.paymentVoucher.create).not.toHaveBeenCalled();
    expect(db.journalEntry.create).not.toHaveBeenCalled();
    expect(db.claim.updateMany).not.toHaveBeenCalled();
  });

  it("OBS-2 Ticket 6: a KES batch posts the BASE total to GL and stamps voucher base fields", async () => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1", tenantId: T, providerId: "prov1", status: "CHECKER_APPROVED",
      totalAmount: 50000, claimCount: 2, makerId: "maker", currency: "KES",
    });
    db.claim.findMany.mockResolvedValue([
      { id: "c1", approvedAmount: 30000, approvedBaseAmount: 810000, currency: "KES" }, // ×27
      { id: "c2", approvedAmount: 20000, approvedBaseAmount: 540000, currency: "KES" },
    ]);

    await claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1");

    // GL clears the base-currency liability: 1,350,000 UGX, not 50,000 raw KES.
    const je = db.journalEntry.create.mock.calls[0][0].data;
    expect(je.lines.create.find((l: any) => l.debit === 1350000).accountId).toBe("acc-2010");
    expect(je.lines.create.find((l: any) => l.credit === 1350000).accountId).toBe("acc-1010");

    // Voucher carries the KES transaction total + the UGX base total.
    const voucher = db.paymentVoucher.create.mock.calls[0][0].data;
    expect(voucher.totalAmount).toBe(50000);
    expect(voucher.currency).toBe("KES");
    expect(voucher.baseTotalAmount).toBe(1350000);
    expect(voucher.baseCurrency).toBe("UGX");
  });

  it("blocks with a config error when a GL account mapping is missing (no silent skip)", async () => {
    db.chartOfAccount.findUnique.mockResolvedValue(null);
    await expect(
      claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1"),
    ).rejects.toThrow(/GL account .* not found/);
    expect(db.claim.updateMany).not.toHaveBeenCalled();
    expect(db.$executeRaw).not.toHaveBeenCalled();
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

describe("createSettlementBatch — currency guardrail (OBS-2 Ticket 4)", () => {
  beforeEach(() => {
    // BD-05: prior-run lookup is now a findMany (supplementary runs); empty = no
    // batch yet for this provider+cycle.
    db.providerSettlementBatch.findMany.mockResolvedValue([]);
  });

  it("single-currency scoop creates a batch stamped with that currency", async () => {
    db.claim.findMany.mockResolvedValue([
      { id: "c1", approvedAmount: 30000, currency: "UGX" },
      { id: "c2", approvedAmount: 20000, currency: "UGX" },
    ]);
    await claimAdjudicationService.createSettlementBatch(T, "prov1", 7, 2026, "maker1");
    expect(db.providerSettlementBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: "UGX", totalAmount: 50000 }) }),
    );
  });

  it("blocks a mixed-currency scoop and creates no batch", async () => {
    db.claim.findMany.mockResolvedValue([
      { id: "c1", approvedAmount: 30000, currency: "UGX" },
      { id: "c2", approvedAmount: 20000, currency: "KES" },
    ]);
    await expect(
      claimAdjudicationService.createSettlementBatch(T, "prov1", 7, 2026, "maker1"),
    ).rejects.toThrow(/single currency|2 currencies/i);
    expect(db.providerSettlementBatch.create).not.toHaveBeenCalled();
  });

  it("mark-paid refuses a legacy batch whose claims span currencies (defence in depth)", async () => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1", tenantId: T, providerId: "prov1", status: "CHECKER_APPROVED",
      totalAmount: 50000, claimCount: 2, makerId: "maker", currency: "UGX",
    });
    db.claim.findMany.mockResolvedValue([
      { id: "c1", approvedAmount: 30000, currency: "UGX" },
      { id: "c2", approvedAmount: 20000, currency: "KES" },
    ]);
    await expect(
      claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1"),
    ).rejects.toThrow(/mixes 2 currencies/i);
    expect(db.journalEntry.create).not.toHaveBeenCalled();
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
    // SYS-1: the transition is now an atomic status-guarded claim, not a bare update.
    expect(db.providerSettlementBatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "batch1", tenantId: T, status: "MAKER_SUBMITTED" }),
        data: expect.objectContaining({ status: "CHECKER_APPROVED", checkerId: "checker" }),
      }),
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

  it("a concurrent second approval loses the atomic gate → CONFLICT (SYS-1)", async () => {
    db.providerSettlementBatch.findUnique.mockResolvedValue({
      id: "batch1", tenantId: T, providerId: "prov1", status: "MAKER_SUBMITTED",
      totalAmount: 50000, makerId: "maker",
    });
    db.providerSettlementBatch.updateMany.mockResolvedValueOnce({ count: 0 }); // winner already approved
    await expect(
      claimAdjudicationService.approveSettlementBatch("batch1", T, "checker2"),
    ).rejects.toThrow(/just actioned by another checker/i);
  });
});
