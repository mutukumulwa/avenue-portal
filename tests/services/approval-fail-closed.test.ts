/**
 * PR-023 / PR-025 regression guard.
 *
 * PR-023: the approval matrix fails CLOSED — an amount outside every
 * configured band (gap, above the top band, uncovered dimension) resolves to
 * the MOST DEMANDING configured path, flagged failSafe/BAND_UNCOVERED.
 * Amounts below the lowest configured floor stay ungoverned by design.
 *
 * PR-025: a fully approved chain APPLIES the decision it gated (via
 * ClaimDecisionService.decide with matrixSatisfied) and never completes into
 * a no-op; a downstream control failure rejects the request loudly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  approvalMatrix: { findMany: vi.fn(async (): Promise<any[]> => []) },
  approvalRequest: {
    findFirst: vi.fn(async (): Promise<any> => null),
    findUnique: vi.fn(async (): Promise<any> => ({ id: "ar1", status: "APPROVED" })),
    create: vi.fn(async (a: any) => ({ id: "ar1", ...a.data })),
    update: vi.fn(async (a: any) => a.data),
  },
  approvalDecision: { create: vi.fn(async () => ({})) },
  fxRate: { findFirst: vi.fn(async (): Promise<any> => null) },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const fx = vi.hoisted(() => ({
  normalise: vi.fn(async (_t: string, amount: number, currency: string) => ({
    baseAmount: currency === "KES" ? amount * 29 : amount,
    rate: currency === "KES" ? 29 : 1,
    identity: currency === "UGX",
  })),
}));
vi.mock("@/server/services/fx.service", () => ({ FxService: fx }));

const decisionSvc = vi.hoisted(() => ({ decide: vi.fn(async () => ({ id: "clm1" })) }));
vi.mock("@/server/services/claim-decision.service", () => ({ ClaimDecisionService: decisionSvc }));

import { ApprovalMatrixService } from "@/server/services/approval-matrix.service";
import { ApprovalRequestService } from "@/server/services/approval-request.service";

const T = "t1";

// The W5 seeded shape: three bands, DAY_CASE uncovered above 199,999 UGX.
const rules = () => [
  { id: "r1", clientId: null, serviceType: null, benefitCategory: null, claimValueMin: 50_000, claimValueMax: 149_999, currency: "UGX", requiredRole: "CLAIMS_OFFICER", requiresDual: false, steps: [], slaMinutes: null, escalationTargetRole: null },
  { id: "r2", clientId: null, serviceType: null, benefitCategory: "SURGICAL", claimValueMin: 150_000, claimValueMax: 199_999, currency: "UGX", requiredRole: "MEDICAL_OFFICER", requiresDual: false, steps: [], slaMinutes: null, escalationTargetRole: null },
  { id: "r3", clientId: null, serviceType: "INPATIENT", benefitCategory: null, claimValueMin: 200_000, claimValueMax: null, currency: "UGX", requiredRole: "UNDERWRITER", requiresDual: true, steps: [], slaMinutes: null, escalationTargetRole: null },
];

describe("PR-023 — approval matrix fails CLOSED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.approvalMatrix.findMany.mockResolvedValue(rules());
  });

  it("a DAY_CASE claim above every matching band routes to the MOST demanding path (dual)", async () => {
    // 86,000 KES ≈ 2,494,000 UGX; DAY_CASE matches r1 (band exceeded) only.
    const r = await ApprovalMatrixService.resolve(T, {
      actionType: "CLAIM_PAYMENT" as never, amount: 86_000, currency: "KES",
      serviceType: "DAY_CASE" as never, benefitCategory: "INPATIENT" as never,
    });
    expect(r).not.toBeNull();
    expect(r!.failSafe).toBe(true);
    expect(r!.failSafeReason).toBe("BAND_UNCOVERED");
    expect(r!.steps.length).toBe(2); // dual — most demanding configured path
    expect(r!.matrix.id).toBe("r3");
  });

  it("below the lowest configured floor stays ungoverned (small-value lane)", async () => {
    // 1,000 KES ≈ 29,000 UGX < 50,000 floor.
    const r = await ApprovalMatrixService.resolve(T, {
      actionType: "CLAIM_PAYMENT" as never, amount: 1_000, currency: "KES",
      serviceType: "DAY_CASE" as never, benefitCategory: "INPATIENT" as never,
    });
    expect(r).toBeNull();
  });

  it("an in-band claim still resolves its own rule (no over-routing)", async () => {
    // 3,600 KES ≈ 104,400 UGX → r1 single Claims Officer.
    const r = await ApprovalMatrixService.resolve(T, {
      actionType: "CLAIM_PAYMENT" as never, amount: 3_600, currency: "KES",
      serviceType: "OUTPATIENT" as never, benefitCategory: "OUTPATIENT" as never,
    });
    expect(r).not.toBeNull();
    expect(r!.failSafe).toBe(false);
    expect(r!.matrix.id).toBe("r1");
  });

  it("no rules configured for the action → null (matrix not in force)", async () => {
    db.approvalMatrix.findMany.mockResolvedValue([]);
    const r = await ApprovalMatrixService.resolve(T, {
      actionType: "CLAIM_PAYMENT" as never, amount: 9_999_999, currency: "UGX",
    });
    expect(r).toBeNull();
  });
});

describe("PR-025 — a completed chain applies the gated decision", () => {
  const pendingReq = (over: any = {}) => ({
    id: "ar1", tenantId: T, status: "PENDING", currentLevel: 2, makerId: "maker1",
    entityType: "Claim", entityId: "clm1", actionType: "CLAIM_PAYMENT",
    matrix: { id: "r3", requiredRole: "UNDERWRITER", requiresDual: true, steps: [], slaMinutes: null, escalationTargetRole: null },
    decisions: [{ decidedById: "uw1", level: 1, decision: "APPROVED" }],
    payload: { action: "APPROVED", approvedAmount: 10_000, reviewerId: "maker1", reviewerRole: "MEDICAL_OFFICER" },
    ...over,
  });

  beforeEach(() => vi.clearAllMocks());

  it("final-level approval executes ClaimDecisionService.decide with matrixSatisfied and stamps appliedAt", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(pendingReq());
    await ApprovalRequestService.decide(T, "ar1", { id: "admin1", role: "SUPER_ADMIN" }, "APPROVED");
    expect(decisionSvc.decide).toHaveBeenCalledWith(T, "clm1", expect.objectContaining({
      action: "APPROVED", approvedAmount: 10_000, matrixSatisfied: true, reviewerId: "maker1",
    }));
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ar1" }, data: expect.objectContaining({ appliedAt: expect.any(Date) }) }),
    );
  });

  it("a downstream control failure REJECTS the request loudly (no silent limbo)", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(pendingReq());
    decisionSvc.decide.mockRejectedValueOnce(new Error("Contract enforcement: ceiling exceeded"));
    await expect(
      ApprovalRequestService.decide(T, "ar1", { id: "admin1", role: "SUPER_ADMIN" }, "APPROVED"),
    ).rejects.toThrow(/downstream control.*ceiling exceeded/i);
    expect(db.approvalRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "ar1" }, data: { status: "REJECTED" } }),
    );
  });

  it("a REJECTED level never applies the decision", async () => {
    db.approvalRequest.findFirst.mockResolvedValue(pendingReq());
    await ApprovalRequestService.decide(T, "ar1", { id: "admin1", role: "SUPER_ADMIN" }, "REJECTED");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });
});
