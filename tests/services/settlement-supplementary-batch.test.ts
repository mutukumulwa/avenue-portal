/**
 * BD-05: later-approved claims for an already-settled provider+cycle must be
 * settleable via a supplementary run — not stranded by a hard one-batch-per-cycle
 * unique constraint. An OPEN prior run still blocks a new one (keeps maker/checker
 * + voucher/GL reconciliation unambiguous).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => {
  const state: any = {
    providerSettlementBatch: {
      findMany: vi.fn(async (): Promise<any[]> => []),
      create: vi.fn(async (a: any) => ({ id: "batchNew", ...a.data })),
    },
    claim: {
      findMany: vi.fn(async (): Promise<any[]> => []),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    auditLog: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: any) => fn(state)),
  };
  return state;
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { claimAdjudicationService } from "@/server/services/claim-adjudication.service";

const T = "t1";
const PROV = "prov1";

beforeEach(() => {
  vi.clearAllMocks();
  db.claim.findMany.mockResolvedValue([{ id: "cLate", approvedAmount: 12000, currency: "UGX" }]);
});

describe("createSettlementBatch — supplementary runs (BD-05)", () => {
  it("creates Run 1 (sequence 1) when no batch exists for the cycle", async () => {
    db.providerSettlementBatch.findMany.mockResolvedValue([]);

    await claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker");

    const created = db.providerSettlementBatch.create.mock.calls[0][0].data;
    expect(created.sequence).toBe(1);
    expect(created.status).toBe("MAKER_SUBMITTED");
  });

  it("creates a supplementary Run 2 when the prior same-cycle batch is SETTLED", async () => {
    db.providerSettlementBatch.findMany.mockResolvedValue([{ sequence: 1, status: "SETTLED" }]);

    await claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker");

    const created = db.providerSettlementBatch.create.mock.calls[0][0].data;
    expect(created.sequence).toBe(2);
    // Only the late, still-unbatched claim is scooped.
    expect(created.claimCount).toBe(1);
    expect(Number(created.totalAmount)).toBe(12000);
  });

  it("blocks a new run while an OPEN batch (MAKER_SUBMITTED) exists for the cycle", async () => {
    db.providerSettlementBatch.findMany.mockResolvedValue([{ sequence: 1, status: "MAKER_SUBMITTED" }]);

    await expect(
      claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker"),
    ).rejects.toThrow(/open settlement batch/i);
    expect(db.providerSettlementBatch.create).not.toHaveBeenCalled();
  });

  it("only scoops unbatched approved claims (settlementBatchId: null)", async () => {
    db.providerSettlementBatch.findMany.mockResolvedValue([{ sequence: 1, status: "SETTLED" }]);

    await claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker");

    const where = db.claim.findMany.mock.calls[0][0].where;
    expect(where.settlementBatchId).toBeNull();
    expect(where.status).toEqual({ in: ["APPROVED", "PARTIALLY_APPROVED"] });
  });

  it("reports 'nothing to settle' clearly when a supplement finds no late claims", async () => {
    db.providerSettlementBatch.findMany.mockResolvedValue([{ sequence: 1, status: "SETTLED" }]);
    db.claim.findMany.mockResolvedValue([]);

    await expect(
      claimAdjudicationService.createSettlementBatch(T, PROV, 7, 2026, "maker"),
    ).rejects.toThrow(/supplementary run|already in a settled batch/i);
  });
});
