/**
 * Outstanding-Conditions Ticket 2 — OBS-7 fraud approval gate.
 *
 * Drives ClaimControlService.enforceFraudGate against a mocked Prisma layer
 * (with the REAL TenantSettingsService reading Tenant.config) and asserts the
 * plan's required cases: off → no block, on → block at/above threshold, decline
 * always allowed, cleared alert permits approval, dual-approval satisfies once,
 * and a below-threshold alert does not block.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  claimFraudAlert: { findMany: vi.fn(async (): Promise<any[]> => []) },
  approvalRequest: {
    findFirst: vi.fn(async (): Promise<any> => null),
    update: vi.fn(async (a: any) => a.data),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const approvalReq = vi.hoisted(() => ({ create: vi.fn(async () => null) }));
vi.mock("@/server/services/approval-request.service", () => ({ ApprovalRequestService: approvalReq }));

const audit = vi.hoisted(() => ({ append: vi.fn(async () => ({})) }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: audit }));

import { ClaimControlService } from "@/server/services/claim-control.service";

const T = "t1";
const ctx = (over: Partial<any> = {}): any => ({
  claimId: "clm1",
  claimNumber: "CLM-2026-00042",
  currency: "UGX",
  serviceType: "OUTPATIENT",
  benefitCategory: "OUTPATIENT",
  action: "APPROVED" as const,
  approvedAmount: 50_000,
  clientId: "c1",
  reviewerId: "u1",
  ...over,
});

function gateOn(mode = "CLEAR_ALERT_OR_DUAL_APPROVAL", threshold = "MEDIUM") {
  db.tenant.findUnique.mockResolvedValue({
    config: {
      claims: {
        requireFraudClearanceBeforeApproval: true,
        fraudApprovalSeverityThreshold: threshold,
        fraudApprovalGateMode: mode,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.tenant.findUnique.mockResolvedValue({ config: {} }); // gate OFF by default
  db.claimFraudAlert.findMany.mockResolvedValue([]);
  db.approvalRequest.findFirst.mockResolvedValue(null);
  approvalReq.create.mockResolvedValue(null);
});

describe("enforceFraudGate", () => {
  it("setting OFF: an open alert does not block (and alerts are not even queried)", async () => {
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "HIGH", rule: "Velocity" }]);
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).resolves.toBeUndefined();
    expect(db.claimFraudAlert.findMany).not.toHaveBeenCalled();
  });

  it("setting ON: an open MEDIUM alert blocks approval with an operator-readable error", async () => {
    gateOn();
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "MEDIUM", rule: "Unauth High Value" }]);
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).rejects.toThrow(
      /Fraud control:.*unresolved fraud alert/i,
    );
    expect(audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CLAIM:FRAUD_GATE_BLOCKED" }),
    );
  });

  it("setting ON: a DECLINE is always allowed", async () => {
    gateOn();
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "CRITICAL", rule: "x" }]);
    await expect(
      ClaimControlService.enforceFraudGate(T, ctx({ action: "DECLINED", approvedAmount: 0 })),
    ).resolves.toBeUndefined();
  });

  it("setting ON: a resolved alert (none unresolved) permits approval", async () => {
    gateOn();
    db.claimFraudAlert.findMany.mockResolvedValue([]); // resolved=false filter returns nothing
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).resolves.toBeUndefined();
  });

  it("setting ON: a below-threshold LOW alert does not block when threshold is MEDIUM", async () => {
    gateOn("CLEAR_ALERT_OR_DUAL_APPROVAL", "MEDIUM");
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "LOW", rule: "noise" }]);
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).resolves.toBeUndefined();
  });

  it("dual-approval mode: a completed fraud-clearance request satisfies the gate and is marked applied", async () => {
    gateOn("CLEAR_ALERT_OR_DUAL_APPROVAL");
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "HIGH", rule: "x" }]);
    db.approvalRequest.findFirst.mockResolvedValueOnce({ id: "far1" }); // the completed clearance
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).resolves.toBeUndefined();
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "far1" }, data: expect.objectContaining({ appliedAt: expect.any(Date) }) }),
    );
  });

  it("dual-approval mode: with no completed clearance, opens a routing request under the dedicated entityType and blocks", async () => {
    gateOn("CLEAR_ALERT_OR_DUAL_APPROVAL");
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "HIGH", rule: "x" }]);
    db.approvalRequest.findFirst.mockResolvedValue(null); // no completed, no pending
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).rejects.toThrow(/Fraud control/);
    expect(approvalReq.create).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ entityType: "ClaimFraudClearance", entityId: "clm1" }),
    );
  });

  it("CLEAR_ALERT_ONLY mode: never opens an approval request", async () => {
    gateOn("CLEAR_ALERT_ONLY");
    db.claimFraudAlert.findMany.mockResolvedValue([{ id: "a1", severity: "HIGH", rule: "x" }]);
    await expect(ClaimControlService.enforceFraudGate(T, ctx())).rejects.toThrow(/Fraud console/);
    expect(approvalReq.create).not.toHaveBeenCalled();
  });
});
