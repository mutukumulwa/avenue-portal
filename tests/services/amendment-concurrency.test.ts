/**
 * SYS-1 (WP-B3): amendment (endorsement) transitions must be concurrency-safe.
 * Every state change is an atomic status-guarded updateMany — a concurrent actor
 * matches 0 rows and throws BEFORE any side effect (member mutation, pro-rata
 * invoice, commission clawback). applyAmendment additionally reverts to APPROVED
 * if a side effect fails after the claim (stays pending + retryable).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  endorsement: {
    findUnique: vi.fn(),
    updateMany: vi.fn(async () => ({ count: 1 })),
    update: vi.fn(async (a: any) => a.data),
  },
  groupBenefitTier: { findUnique: vi.fn(async () => ({ packageId: "pkg1" })) },
  member: { update: vi.fn(async () => ({ id: "m1" })), findUnique: vi.fn(async () => null) },
  invoice: { count: vi.fn(async () => 0), create: vi.fn(async () => ({})) },
  group: { findUnique: vi.fn(async () => null), update: vi.fn(async () => ({})) },
  commissionLedgerEntry: { create: vi.fn(async () => ({})) },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: vi.fn(async () => ({})) } }));
vi.mock("@/server/services/override.service", () => ({ overrideService: {} }));

import { amendmentService } from "@/server/services/amendment.service";

const endo = (over: any = {}) => ({
  id: "e1", tenantId: "t1", endorsementNumber: "END-2026-00001",
  type: "CORRECTION", status: "DRAFT", makerId: "maker1", groupId: "g1",
  backDated: false, overrideRecordId: null, changeDetails: {},
  proRataCalculation: null, member: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.endorsement.updateMany.mockResolvedValue({ count: 1 });
});

describe("submitForApproval — atomic DRAFT→SUBMITTED (SYS-1)", () => {
  it("claims via a status-guarded updateMany", async () => {
    db.endorsement.findUnique.mockResolvedValue(endo({ status: "DRAFT" }));
    await amendmentService.submitForApproval("e1", "t1", "maker1");
    expect(db.endorsement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "e1", tenantId: "t1", status: "DRAFT" }),
        data: expect.objectContaining({ status: "SUBMITTED" }),
      }),
    );
  });

  it("a concurrent submit loses the claim → CONFLICT", async () => {
    db.endorsement.findUnique.mockResolvedValue(endo({ status: "DRAFT" }));
    db.endorsement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(amendmentService.submitForApproval("e1", "t1", "maker1")).rejects.toThrow(/just actioned/i);
  });
});

describe("approveAmendment — atomic decision gate (SYS-1)", () => {
  it("a concurrent approval loses the gate → CONFLICT", async () => {
    db.endorsement.findUnique.mockResolvedValue(endo({ status: "SUBMITTED", makerId: "maker1" }));
    db.endorsement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(amendmentService.approveAmendment("e1", "t1", "checker1")).rejects.toThrow(
      /just actioned by another reviewer/i,
    );
  });

  it("still blocks self-approval (SoD) before the gate", async () => {
    db.endorsement.findUnique.mockResolvedValue(endo({ status: "SUBMITTED", makerId: "maker1" }));
    await expect(amendmentService.approveAmendment("e1", "t1", "maker1")).rejects.toThrow(/different users/i);
    expect(db.endorsement.updateMany).not.toHaveBeenCalled();
  });
});

describe("applyAmendment — atomic APPROVED→APPLIED before side effects (SYS-1)", () => {
  const approvedTierChange = () =>
    endo({ status: "APPROVED", type: "TIER_CHANGE", memberId: "m1", toBenefitTierId: "tier1" });

  it("a concurrent apply loses the claim → CONFLICT, no member mutation / pro-rata", async () => {
    db.endorsement.findUnique.mockResolvedValue(approvedTierChange());
    db.endorsement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(amendmentService.applyAmendment("e1", "t1", "applier1")).rejects.toThrow(/just actioned/i);
    expect(db.member.update).not.toHaveBeenCalled();
    expect(db.invoice.create).not.toHaveBeenCalled();
  });

  it("reverts to APPROVED when a side effect fails after the claim", async () => {
    db.endorsement.findUnique.mockResolvedValue(approvedTierChange());
    db.endorsement.updateMany.mockResolvedValueOnce({ count: 1 }); // claim wins
    db.member.update.mockRejectedValueOnce(new Error("boom")); // side effect fails
    await expect(amendmentService.applyAmendment("e1", "t1", "applier1")).rejects.toThrow(/boom/);
    const reverted = db.endorsement.updateMany.mock.calls.some((c: any[]) => c[0]?.data?.status === "APPROVED");
    expect(reverted).toBe(true);
  });
});

describe("rejectAmendment — atomic guarded reject (SYS-1)", () => {
  it("a reject that races an apply loses the guard → CONFLICT", async () => {
    db.endorsement.findUnique.mockResolvedValue(endo({ status: "APPLIED" }));
    db.endorsement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(amendmentService.rejectAmendment("e1", "t1", "u1", "no")).rejects.toThrow(
      /no longer be rejected/i,
    );
  });
});
