import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  claimLine: { findMany: vi.fn(async (): Promise<any[]> => []), update: vi.fn(async () => ({})) },
  adjudicationLog: { create: vi.fn(async () => ({})) },
  autoAdjudicationPolicy: { findMany: vi.fn(async (): Promise<any[]> => []) },
  claimFraudAlert: { count: vi.fn(async () => 0) },
}));
const gate = vi.hoisted(() => ({ runHardGateValidation: vi.fn(async () => ({ passed: true, errors: [] as string[] })) }));
const exclusions = vi.hoisted(() => ({
  applyToClaim: vi.fn(async () => ({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 })),
}));
const decisionSvc = vi.hoisted(() => ({ decide: vi.fn(async () => ({})) }));
const audit = vi.hoisted(() => ({ append: vi.fn(async () => ({})) }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/claim-adjudication.service", () => ({ claimAdjudicationService: gate }));
vi.mock("@/server/services/drug-exclusion.service", () => ({ DrugExclusionService: exclusions }));
vi.mock("@/server/services/claim-decision.service", () => ({ ClaimDecisionService: decisionSvc }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: audit }));

import { AutoAdjudicationService } from "@/server/services/auto-adjudication.service";

const claim = (over: any = {}) => ({
  providerId: "p1", memberId: "m1", dateOfService: new Date("2026-06-01"),
  benefitCategory: "OUTPATIENT", invoiceNumber: "INV-1", billedAmount: 50000,
  member: { group: { clientId: "c1" } }, ...over,
});

describe("AutoAdjudicationService.evaluateClaim (G3.7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(claim());
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([]);
    db.claimFraudAlert.count.mockResolvedValue(0);
    gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
  });

  it("AUTO_APPROVEs a clean claim under the default policy", async () => {
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("AUTO_APPROVE");
  });

  it("ROUTEs with the failing gate named when a hard gate fails", async () => {
    gate.runHardGateValidation.mockResolvedValue({ passed: false, errors: ["Double-capture: ..."] });
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toMatch(/Double-capture/);
  });

  it("ROUTEs when an open fraud flag exists", async () => {
    db.claimFraudAlert.count.mockResolvedValue(2);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("FRAUD_FLAG");
  });

  it("ROUTEs when billed exceeds the client's auto-approve ceiling", async () => {
    db.claim.findUnique.mockResolvedValue(claim({ billedAmount: 500000 }));
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      { id: "pol1", clientId: "c1", enabled: true, maxAutoApproveAmount: 100000, requireCleanFraud: true, effectiveFrom: new Date() },
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("ABOVE_CEILING");
    expect(r.policyId).toBe("pol1");
  });

  it("ROUTEs when the policy is disabled", async () => {
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      { id: "pol2", clientId: "c1", enabled: false, maxAutoApproveAmount: null, requireCleanFraud: true, effectiveFrom: new Date() },
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("AUTO_ADJ_DISABLED");
  });

  it("prefers a client-specific policy over the operator default", async () => {
    db.claim.findUnique.mockResolvedValue(claim({ billedAmount: 200000 }));
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      { id: "op", clientId: null, enabled: true, maxAutoApproveAmount: null, requireCleanFraud: true, effectiveFrom: new Date() },
      { id: "cl", clientId: "c1", enabled: true, maxAutoApproveAmount: 100000, requireCleanFraud: true, effectiveFrom: new Date() },
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    // The client policy's ceiling (100k) applies → routes; proves client wins.
    expect(r.policyId).toBe("cl");
    expect(r.decision).toBe("ROUTE");
  });
});

describe("AutoAdjudicationService.processIntake — execution pipeline (G3.7/G9.5)", () => {
  const intakeClaim = (over: any = {}) => ({
    ...claim(),
    isReimbursement: false,
    claimNumber: "CLM-2026-00001",
    status: "RECEIVED",
    claimLines: [{ id: "l1" }],
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(intakeClaim());
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([]);
    db.claimFraudAlert.count.mockResolvedValue(0);
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 50000 }]);
    gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
    exclusions.applyToClaim.mockResolvedValue({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 });
  });

  it("AUTO_APPROVE executes through the standard adjudication machinery", async () => {
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("AUTO_APPROVE");
    expect(r.executed).toBe(true);
    // Undecided lines approved at billed
    expect(db.claimLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ adjudicationDecision: "APPROVED" }) }),
    );
    expect(decisionSvc.decide).toHaveBeenCalledWith("t1", "clm1", expect.objectContaining({
      action: "APPROVED", approvedAmount: 50000, reviewerId: "u1", systemDecision: true,
    }));
    expect(audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "CLAIM:AUTO_APPROVED" }));
    // Provenance persisted on the claim
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ autoAdjDecision: "AUTO_APPROVE" }) }),
    );
  });

  it("routes with the failing gate persisted + logged (no execution)", async () => {
    gate.runHardGateValidation.mockResolvedValue({ passed: false, errors: ["Double-capture: dup"] });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.executed).toBe(false);
    expect(decisionSvc.decide).not.toHaveBeenCalled();
    expect(db.adjudicationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ROUTED" }) }),
    );
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ autoAdjDecision: "ROUTE" }) }),
    );
  });

  it("excluded-drug lines make the approval PARTIAL on the payable net", async () => {
    exclusions.applyToClaim.mockResolvedValue({ excludedCount: 1, excludedAmount: 20000, payableAmount: 30000 });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.executed).toBe(true);
    expect(decisionSvc.decide).toHaveBeenCalledWith("t1", "clm1", expect.objectContaining({
      action: "PARTIALLY_APPROVED", approvedAmount: 30000,
    }));
  });

  it("routes ALL_LINES_EXCLUDED when nothing is payable", async () => {
    exclusions.applyToClaim.mockResolvedValue({ excludedCount: 2, excludedAmount: 50000, payableAmount: 0 });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("ALL_LINES_EXCLUDED");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });

  it("reimbursements always route for manual proof verification", async () => {
    db.claim.findUnique.mockResolvedValue(intakeClaim({ isReimbursement: true }));
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("REIMBURSEMENT_MANUAL_REVIEW");
  });

  it("never throws — a pipeline error routes to manual review", async () => {
    exclusions.applyToClaim.mockRejectedValue(new Error("boom"));
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("PIPELINE_ERROR");
    expect(r.executed).toBe(false);
  });
});
