/**
 * Outstanding-Conditions Ticket 8 (Workstream D2) — settlement batch scale
 * regression.
 *
 * The original PR-V02 defect: a per-claim `tx.claim.update()` loop issued one
 * round-trip per claim and blew the 5s interactive-transaction limit on a
 * normal 46-claim monthly batch, stranding it at CHECKER_APPROVED. This suite
 * is the permanent guard: for batch sizes 1 → 250, `markSettlementBatchPaid`
 * must use SET-BASED writes (one updateMany + one raw UPDATE), create exactly
 * one voucher and one JE, and NEVER reintroduce a per-claim write loop — so the
 * work is O(1) statements regardless of batch size.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    providerSettlementBatch: {
      findUnique: vi.fn(),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      // FG-C7: atomic settlement claim — winner gets count 1.
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    claim: {
      findMany: vi.fn(async (): Promise<any[]> => []),
      update: vi.fn(async (a: any) => ({ id: a.where.id, ...a.data })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    paymentVoucher: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (a: any) => ({ id: "pv1", ...a.data })),
    },
    chartOfAccount: {
      findUnique: vi.fn(async (a: any) => ({ id: `acc-${a.where.tenantId_code.code}`, code: a.where.tenantId_code.code })),
    },
    journalEntry: { count: vi.fn(async () => 0), findFirst: vi.fn(async () => null), create: vi.fn(async (a: any) => ({ id: "je1", ...a.data })) },
    auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    // OBS-H1: markSettlementBatchPaid now reads the fraud-gate setting (config
    // null → gate off, behaviour unchanged) and checks for unresolved alerts.
    tenant: { findUnique: vi.fn(async () => ({ config: null })) },
    claimFraudAlert: { findMany: vi.fn(async (): Promise<any[]> => []) },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));

// Member notifications run after commit; stub so the stress test stays focused.
vi.mock("@/server/services/member-notification.service", () => ({
  MemberNotificationService: { notifyPaidBatch: vi.fn(async () => ({})) },
}));

import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";

const T = "t1";

function seedBatch(size: number) {
  db.providerSettlementBatch.findUnique.mockResolvedValue({
    id: "batch1", tenantId: T, providerId: "prov1", status: "CHECKER_APPROVED",
    totalAmount: size * 1000, claimCount: size, makerId: "maker", currency: "UGX",
  });
  const claims = Array.from({ length: size }, (_, i) => ({
    id: `c${i}`, approvedAmount: 1000, approvedBaseAmount: 1000, currency: "UGX",
  }));
  db.claim.findMany.mockResolvedValue(claims);
}

beforeEach(() => vi.clearAllMocks());

describe("markSettlementBatchPaid — set-based writes at scale", () => {
  for (const size of [1, 46, 100, 250]) {
    it(`${size}-claim batch settles with O(1) statements (no per-claim loop)`, async () => {
      seedBatch(size);
      const start = Date.now();
      await claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1");
      const elapsed = Date.now() - start;

      // Set-based: exactly one updateMany + one raw UPDATE, regardless of size.
      expect(db.claim.updateMany).toHaveBeenCalledTimes(1);
      expect(db.$executeRaw).toHaveBeenCalledTimes(1);
      // The per-claim loop must never come back.
      expect(db.claim.update).not.toHaveBeenCalled();
      // One voucher, one JE per batch.
      expect(db.paymentVoucher.create).toHaveBeenCalledTimes(1);
      expect(db.journalEntry.create).toHaveBeenCalledTimes(1);
      // Batch flips to SETTLED via the FG-C7 atomic status-guarded claim.
      expect(db.providerSettlementBatch.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "CHECKER_APPROVED" }),
          data: expect.objectContaining({ status: "SETTLED" }),
        }),
      );
      // Sanity: the mocked path is trivially fast — the point is that write
      // COUNT does not scale with batch size (the real timeout cause).
      expect(elapsed).toBeLessThan(2000);
    });
  }

  it("base + transaction totals scale correctly for a large batch", async () => {
    seedBatch(250);
    await claimAdjudicationService.markSettlementBatchPaid("batch1", T, "finance1");
    const voucher = db.paymentVoucher.create.mock.calls[0][0].data;
    expect(voucher.totalAmount).toBe(250000);
    expect(voucher.baseTotalAmount).toBe(250000);
    const je = db.journalEntry.create.mock.calls[0][0].data;
    const dr = je.lines.create.reduce((s: number, l: any) => s + (l.debit ?? 0), 0);
    expect(dr).toBe(250000);
  });
});
