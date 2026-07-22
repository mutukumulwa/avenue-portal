/**
 * Claims Autopilot F2.5 — governed policy change (unit, mocked prisma).
 * The full maker→checker→activation chain runs against a real DB in
 * tests/integration/claim-autopilot-policy-approval.integration.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  autoAdjudicationPolicy: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}));
const approvals = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/approval-request.service", () => ({ ApprovalRequestService: approvals }));

import {
  buildPolicyChangePayload,
  submitPolicyChange,
  applyApprovedPolicyChange,
  deactivatePolicy,
} from "@/server/services/claim-autopilot/policy-approval";

const policy = (over: Record<string, unknown> = {}) => ({
  id: "pol-1", clientId: null, version: 1, mode: "LIVE", status: "DRAFT", currency: "UGX",
  createdById: "maker-1", maxAutoApproveAmount: { toString: () => "50000" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.autoAdjudicationPolicy.findFirst.mockResolvedValue(policy());
  db.autoAdjudicationPolicy.updateMany.mockResolvedValue({ count: 1 });
  approvals.create.mockResolvedValue({ id: "req-1" });
});

describe("F2.5 — buildPolicyChangePayload is a safe subset", () => {
  it("includes identity/scope, not raw editable form", () => {
    const p = buildPolicyChangePayload(policy() as never);
    expect(p).toEqual({ policyId: "pol-1", version: 1, mode: "LIVE", ceiling: "50000", currency: "UGX", clientId: null });
  });
});

describe("F2.5 — submitPolicyChange", () => {
  it("opens an approval and moves the policy to PENDING_APPROVAL", async () => {
    const r = await submitPolicyChange("t1", "pol-1", "maker-1");
    expect(r.requestId).toBe("req-1");
    expect(approvals.create).toHaveBeenCalledWith("t1", expect.objectContaining({ actionType: "AUTO_ADJ_POLICY_CHANGE", entityType: "AutoAdjudicationPolicy", entityId: "pol-1", makerId: "maker-1" }));
    expect(db.autoAdjudicationPolicy.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PENDING_APPROVAL", approvalRequestId: "req-1" }) }));
  });

  it("refuses to submit a non-DRAFT/REJECTED policy", async () => {
    db.autoAdjudicationPolicy.findFirst.mockResolvedValue(policy({ status: "APPROVED" }));
    await expect(submitPolicyChange("t1", "pol-1", "maker-1")).rejects.toThrow(/DRAFT or REJECTED/);
  });

  it("fails clearly when no approval matrix is configured", async () => {
    approvals.create.mockResolvedValue(null);
    await expect(submitPolicyChange("t1", "pol-1", "maker-1")).rejects.toThrow(/No approval matrix/);
  });
});

describe("F2.5 — applyApprovedPolicyChange", () => {
  it("activates the version and supersedes the prior approved one", async () => {
    db.autoAdjudicationPolicy.findFirst.mockResolvedValue(policy({ status: "PENDING_APPROVAL" }));
    await applyApprovedPolicyChange("t1", "pol-1", "checker-1");
    // supersede prior + activate this = two updateMany calls in a transaction
    expect(db.$transaction).toHaveBeenCalledOnce();
    expect(db.autoAdjudicationPolicy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "APPROVED", id: { not: "pol-1" } }) }));
    expect(db.autoAdjudicationPolicy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pol-1", status: { not: "APPROVED" } }, data: expect.objectContaining({ status: "APPROVED", approvedById: "checker-1" }) }));
  });

  it("is idempotent — an already-APPROVED policy is a no-op (replay-safe)", async () => {
    db.autoAdjudicationPolicy.findFirst.mockResolvedValue(policy({ status: "APPROVED" }));
    await applyApprovedPolicyChange("t1", "pol-1", "checker-1");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.autoAdjudicationPolicy.updateMany).not.toHaveBeenCalled();
  });

  it("blocks the maker from approving their own policy (defence in depth)", async () => {
    db.autoAdjudicationPolicy.findFirst.mockResolvedValue(policy({ status: "PENDING_APPROVAL", createdById: "maker-1" }));
    await expect(applyApprovedPolicyChange("t1", "pol-1", "maker-1")).rejects.toThrow(/maker cannot approve their own/);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("F2.5 — deactivatePolicy", () => {
  it("requires a reason", async () => {
    await expect(deactivatePolicy("t1", "pol-1", "op-1", "   ")).rejects.toThrow(/reason is required/);
  });
  it("immediately deactivates with the reason recorded", async () => {
    await deactivatePolicy("t1", "pol-1", "op-1", "safety: false approvals observed");
    expect(db.autoAdjudicationPolicy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "DEACTIVATED", deactivatedById: "op-1", deactivationReason: "safety: false approvals observed" }) }));
  });
  it("throws when the policy does not exist", async () => {
    db.autoAdjudicationPolicy.updateMany.mockResolvedValue({ count: 0 });
    await expect(deactivatePolicy("t1", "missing", "op-1", "reason")).rejects.toThrow(/not found/);
  });
});
