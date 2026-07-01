import { describe, it, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const db = vi.hoisted(() => ({
  approvalRequest: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
    findUnique: vi.fn(async () => ({ id: "req1" })),
    create: vi.fn(async (a: any) => ({ id: "req1", ...a.data })),
  },
  approvalDecision: { create: vi.fn(async () => ({})) },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ApprovalRequestService } from "@/server/services/approval-request.service";

// A resolved matrix with two sequential levels.
const twoLevelMatrix = {
  steps: [
    { level: 1, requiredRole: "CLAIMS_OFFICER", slaMinutes: 30, escalationTargetRole: "UNDERWRITER" },
    { level: 2, requiredRole: "FINANCE_OFFICER", slaMinutes: null, escalationTargetRole: null },
  ],
  requiredRole: "CLAIMS_OFFICER",
  requiresDual: false,
  slaMinutes: null,
  escalationTargetRole: null,
};

const request = (over: any = {}) => ({
  id: "req1",
  tenantId: "t1",
  status: "PENDING",
  currentLevel: 1,
  makerId: "maker",
  matrix: twoLevelMatrix,
  decisions: [],
  ...over,
});

describe("ApprovalRequestService.decide — multi-level + SoD (G3.1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks the maker from deciding (segregation of duties)", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(request());
    await expect(
      ApprovalRequestService.decide("t1", "req1", { id: "maker", role: "SUPER_ADMIN" }, "APPROVED"),
    ).rejects.toThrow(TRPCError);
  });

  it("blocks a checker whose role is below the level requirement", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(request());
    await expect(
      ApprovalRequestService.decide("t1", "req1", { id: "u2", role: "CUSTOMER_SERVICE" }, "APPROVED"),
    ).rejects.toThrow(/requires/i);
  });

  it("advances to the next level on level-1 approval (stays PENDING)", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(request({ currentLevel: 1 }));
    await ApprovalRequestService.decide("t1", "req1", { id: "u2", role: "CLAIMS_OFFICER" }, "APPROVED");
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING", currentLevel: 2 }) }),
    );
  });

  it("finalises APPROVED when the last level approves", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(request({ currentLevel: 2 }));
    await ApprovalRequestService.decide("t1", "req1", { id: "u3", role: "FINANCE_OFFICER" }, "APPROVED");
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }),
    );
  });

  it("finalises REJECTED at any level", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(request({ currentLevel: 1 }));
    await ApprovalRequestService.decide("t1", "req1", { id: "u2", role: "SUPER_ADMIN" }, "REJECTED");
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) }),
    );
  });

  it("blocks a checker who already decided on this request", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(
      request({ currentLevel: 2, decisions: [{ decidedById: "u2", decidedAt: new Date() }] }),
    );
    await expect(
      ApprovalRequestService.decide("t1", "req1", { id: "u2", role: "SUPER_ADMIN" }, "APPROVED"),
    ).rejects.toThrow(/already decided/i);
  });
});
