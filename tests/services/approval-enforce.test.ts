import { describe, it, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const db = vi.hoisted(() => ({
  approvalMatrix: { findMany: vi.fn() },
  fxRate: { findFirst: vi.fn(async () => null) },
  approvalRequest: { findFirst: vi.fn(async (): Promise<any> => null), create: vi.fn(async () => ({ id: "req1" })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ApprovalRequestService } from "@/server/services/approval-request.service";

const rule = (over: any = {}) => ({
  id: "r", clientId: null, actionType: "FUND_TOPUP", claimValueMin: null, claimValueMax: null,
  currency: "UGX", serviceType: null, benefitCategory: null, requiredRole: "FINANCE_OFFICER",
  requiresDual: false, slaMinutes: null, escalationTargetRole: null,
  effectiveFrom: new Date("2026-01-01"), steps: [], ...over,
});

const base = {
  actionType: "FUND_TOPUP" as const, entityType: "FundTransaction", entityId: "ft1",
  actorId: "u1", actorRole: "SUPER_ADMIN", amount: 1_000_000, currency: "UGX",
};

describe("ApprovalRequestService.enforce (G3.1 wiring)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes silently when no rule applies", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([]);
    await expect(ApprovalRequestService.enforce("t1", base)).resolves.toBeUndefined();
  });

  it("passes a single-level rule when the actor's role is senior enough", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([rule()]);
    await expect(ApprovalRequestService.enforce("t1", base)).resolves.toBeUndefined();
  });

  it("blocks a single-level rule when the actor's role is too junior", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([rule({ requiredRole: "FINANCE_OFFICER" })]);
    await expect(
      ApprovalRequestService.enforce("t1", { ...base, actorRole: "CUSTOMER_SERVICE" }),
    ).rejects.toThrow(TRPCError);
  });

  it("opens an ApprovalRequest and blocks for a multi-level rule", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([
      rule({
        steps: [
          { level: 1, requiredRole: "FINANCE_OFFICER", slaMinutes: null, escalationTargetRole: null },
          { level: 2, requiredRole: "SUPER_ADMIN", slaMinutes: null, escalationTargetRole: null },
        ],
      }),
    ]);
    await expect(ApprovalRequestService.enforce("t1", base)).rejects.toThrow(/2-level approval/);
    expect(db.approvalRequest.create).toHaveBeenCalled();
  });

  it("does not open a duplicate request when one is already pending", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([
      rule({ steps: [
        { level: 1, requiredRole: "FINANCE_OFFICER", slaMinutes: null, escalationTargetRole: null },
        { level: 2, requiredRole: "SUPER_ADMIN", slaMinutes: null, escalationTargetRole: null },
      ] }),
    ]);
    db.approvalRequest.findFirst.mockResolvedValue({ id: "existing" });
    await expect(ApprovalRequestService.enforce("t1", base)).rejects.toThrow(TRPCError);
    expect(db.approvalRequest.create).not.toHaveBeenCalled();
  });
});
