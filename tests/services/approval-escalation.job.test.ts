import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  approvalRequest: {
    findMany: vi.fn(),
    update: vi.fn(async () => ({})),
  },
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { runApprovalEscalationJob } from "@/server/jobs/approval-escalation.job";

const matrix = {
  steps: [{ level: 1, requiredRole: "CLAIMS_OFFICER", slaMinutes: 30, escalationTargetRole: "UNDERWRITER" }],
  requiredRole: "CLAIMS_OFFICER",
  requiresDual: false,
  slaMinutes: null,
  escalationTargetRole: null,
};

const req = (over: any = {}) => ({
  id: "r1",
  tenantId: "t1",
  status: "PENDING",
  currentLevel: 1,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  matrix,
  decisions: [],
  ...over,
});

describe("runApprovalEscalationJob (G3.1 slice 5)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("escalates a request whose level SLA has elapsed", async () => {
    db.approvalRequest.findMany.mockResolvedValue([req()]);
    // 31 minutes after creation — past the 30m SLA.
    const now = new Date("2026-07-01T00:31:00Z");
    const res = await runApprovalEscalationJob(now);
    expect(res.escalatedCount).toBe(1);
    expect(res.alerts[0].targetRole).toBe("UNDERWRITER");
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "ESCALATED" } }),
    );
  });

  it("does not escalate before the SLA elapses", async () => {
    db.approvalRequest.findMany.mockResolvedValue([req()]);
    const now = new Date("2026-07-01T00:20:00Z"); // 20m < 30m
    const res = await runApprovalEscalationJob(now);
    expect(res.escalatedCount).toBe(0);
    expect(db.approvalRequest.update).not.toHaveBeenCalled();
  });

  it("ignores steps without an SLA", async () => {
    const noSla = { ...matrix, steps: [{ level: 1, requiredRole: "CLAIMS_OFFICER", slaMinutes: null, escalationTargetRole: null }] };
    db.approvalRequest.findMany.mockResolvedValue([req({ matrix: noSla })]);
    const res = await runApprovalEscalationJob(new Date("2026-07-02T00:00:00Z"));
    expect(res.escalatedCount).toBe(0);
  });
});
