import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  claimLine: { findMany: vi.fn(async (): Promise<unknown[]> => []), update: vi.fn(async () => ({})) },
  adjudicationLog: { create: vi.fn(async () => ({})) },
  autoAdjudicationPolicy: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  claimFraudAlert: { count: vi.fn(async () => 0) },
}));
const gate = vi.hoisted(() => ({ runHardGateValidation: vi.fn(async () => ({ passed: true, errors: [] as string[] })) }));
const exclusions = vi.hoisted(() => ({
  applyToClaim: vi.fn(async () => ({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 })),
}));
type CeilingAssessment = { ceiling: number | null; deterministic: boolean; source: string | null; enginePayable: number | null; contractNumber: string | null };
const decisionSvc = vi.hoisted(() => ({
  decide: vi.fn(async () => ({})),
  assessCeiling: vi.fn(async (): Promise<CeilingAssessment> => ({ ceiling: 1_000_000, deterministic: true, source: "Provider tariff schedule", enginePayable: null, contractNumber: null })),
}));
const engineMock = vi.hoisted(() => ({ evaluateClaimById: vi.fn(async (): Promise<unknown> => null) }));
const audit = vi.hoisted(() => ({ append: vi.fn(async () => ({})) }));
const contractPersist = vi.hoisted(() => ({ evaluateAndPersist: vi.fn(async () => ({})) }));
const fx = vi.hoisted(() => ({ normalise: vi.fn(async (_t: string, a: number) => ({ baseAmount: a, identity: false })) }));

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/claim-adjudication.service", () => ({ claimAdjudicationService: gate }));
vi.mock("@/server/services/drug-exclusion.service", () => ({ DrugExclusionService: exclusions }));
vi.mock("@/server/services/claim-decision.service", () => ({ ClaimDecisionService: decisionSvc }));
vi.mock("@/server/services/contract-engine/engine", () => ({ ContractEngine: engineMock }));
vi.mock("@/server/services/contract-engine/persist", () => ({ ContractEngineIntegration: contractPersist }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: audit }));
vi.mock("@/server/services/fx.service", () => ({ FxService: fx }));

import { AutoAdjudicationService } from "@/server/services/auto-adjudication.service";

const claim = (over: Record<string, unknown> = {}) => ({
  providerId: "p1", memberId: "m1", dateOfService: new Date("2026-06-01"),
  benefitCategory: "OUTPATIENT", invoiceNumber: "INV-1", billedAmount: 50000, currency: "UGX",
  member: { group: { clientId: "c1" } }, ...over,
});

/** A fully-specified, approved LIVE policy — the ONLY thing that permits auto-approval (D1). */
const livePolicy = (over: Record<string, unknown> = {}) => ({
  id: "pol-live", clientId: "c1", mode: "LIVE", status: "APPROVED",
  maxAutoApproveAmount: 1_000_000, currency: "UGX",
  requireCleanFraud: true, requireAllLinesPriced: true, requireDocumentsComplete: true,
  requireEligibilityClear: true, requirePreauthWhenNeeded: true,
  allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"],
  isActive: true, effectiveFrom: new Date("2020-01-01"), effectiveTo: null,
  ...over,
});

describe("AutoAdjudicationService.evaluateClaim (G3.7) — LIVE-policy gated (D1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(claim());
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([livePolicy()]);
    db.claimFraudAlert.count.mockResolvedValue(0);
    gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
    engineMock.evaluateClaimById.mockResolvedValue(null);
    decisionSvc.assessCeiling.mockResolvedValue({ ceiling: 1_000_000, deterministic: true, source: "Provider tariff schedule", enginePayable: null, contractNumber: null });
  });

  // ── D1 policy matrix ────────────────────────────────────────────────────────
  it("NO policy ⇒ ROUTE AUTO_POLICY_NOT_LIVE (never auto-approves)", async () => {
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("AUTO_POLICY_NOT_LIVE");
    expect(r.policyId).toBeNull();
  });

  it.each([
    ["OFF mode", { mode: "OFF", status: "APPROVED" }],
    ["DRAFT status", { status: "DRAFT" }],
    ["PENDING_APPROVAL status", { status: "PENDING_APPROVAL" }],
    ["REJECTED status", { status: "REJECTED" }],
    ["approved SHADOW (not live)", { mode: "SHADOW", status: "APPROVED" }],
    ["LIVE but no ceiling", { maxAutoApproveAmount: null }],
    ["LIVE but a required gate off", { requireCleanFraud: false }],
    ["LIVE but no allowed sources", { allowedSources: [] }],
  ])("a non-LIVE policy (%s) ⇒ ROUTE AUTO_POLICY_OFF", async (_n, over) => {
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([livePolicy(over)]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("AUTO_POLICY_OFF");
  });

  it("an approved LIVE policy AUTO_APPROVEs a clean claim", async () => {
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("AUTO_APPROVE");
    expect(r.policyId).toBe("pol-live");
  });

  // ── Gates (only reachable under a LIVE policy) ──────────────────────────────
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

  it("ROUTEs when the payable exceeds the LIVE policy ceiling", async () => {
    db.claim.findUnique.mockResolvedValue(claim({ billedAmount: 500000 }));
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([livePolicy({ maxAutoApproveAmount: 100000 })]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("ABOVE_CEILING");
    expect(r.policyId).toBe("pol-live");
  });

  it("prefers a client-specific LIVE policy over the operator default", async () => {
    db.claim.findUnique.mockResolvedValue(claim({ billedAmount: 200000 }));
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([
      livePolicy({ id: "op", clientId: null, maxAutoApproveAmount: 1_000_000 }),
      livePolicy({ id: "cl", clientId: "c1", maxAutoApproveAmount: 100000 }),
    ]);
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.policyId).toBe("cl");
    expect(r.decision).toBe("ROUTE"); // client ceiling 100k < 200k
  });
});

describe("AutoAdjudicationService.processIntake — execution pipeline (LIVE only)", () => {
  const intakeClaim = (over: Record<string, unknown> = {}) => ({
    ...claim(), isReimbursement: false, claimNumber: "CLM-2026-00001", status: "RECEIVED",
    claimLines: [{ id: "l1" }], ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(intakeClaim());
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([livePolicy()]);
    db.claimFraudAlert.count.mockResolvedValue(0);
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 50000 }]);
    gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
    exclusions.applyToClaim.mockResolvedValue({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 });
    engineMock.evaluateClaimById.mockResolvedValue(null);
    decisionSvc.assessCeiling.mockResolvedValue({ ceiling: 1_000_000, deterministic: true, source: "Provider tariff schedule", enginePayable: null, contractNumber: null });
  });

  it("AUTO_APPROVE executes through the standard adjudication machinery", async () => {
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("AUTO_APPROVE");
    expect(r.executed).toBe(true);
    expect(decisionSvc.decide).toHaveBeenCalledWith("t1", "clm1", expect.objectContaining({ action: "APPROVED", approvedAmount: 50000, reviewerId: "u1", systemDecision: true }));
  });

  it("NO live policy ⇒ ROUTE AUTO_POLICY_NOT_LIVE, no execution", async () => {
    db.autoAdjudicationPolicy.findMany.mockResolvedValue([]);
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("AUTO_POLICY_NOT_LIVE");
    expect(r.executed).toBe(false);
    expect(decisionSvc.decide).not.toHaveBeenCalled();
    expect(db.adjudicationLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "ROUTED" }) }));
  });

  it("routes with the failing gate persisted + logged (no execution)", async () => {
    gate.runHardGateValidation.mockResolvedValue({ passed: false, errors: ["Double-capture: dup"] });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });

  it("excluded-drug lines make the approval PARTIAL on the payable net", async () => {
    exclusions.applyToClaim.mockResolvedValue({ excludedCount: 1, excludedAmount: 20000, payableAmount: 30000 });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.executed).toBe(true);
    expect(decisionSvc.decide).toHaveBeenCalledWith("t1", "clm1", expect.objectContaining({ action: "PARTIALLY_APPROVED", approvedAmount: 30000 }));
  });

  it("routes ALL_LINES_EXCLUDED when nothing is payable", async () => {
    exclusions.applyToClaim.mockResolvedValue({ excludedCount: 2, excludedAmount: 50000, payableAmount: 0 });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("ALL_LINES_EXCLUDED");
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

  it("PR-021: an engine-pended claim ROUTEs (never auto-pays refer-for-review services)", async () => {
    engineMock.evaluateClaimById.mockResolvedValue({ matched: true, claimDecision: "UNDER_REVIEW", reasonCode: "SVC-002", totals: { payable: 0 }, lines: [{ lineId: "l1", decision: "PENDED", reasonCode: "SVC-002", payableAmount: 0 }] });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("PRICING_COMPLETE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });

  it("PR-021: an engine-priced claim auto-approves at the ENGINE payable, not billed", async () => {
    db.claim.findUnique.mockResolvedValue(intakeClaim({ billedAmount: 86000 }));
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 86000 }]);
    engineMock.evaluateClaimById.mockResolvedValue({ matched: true, claimDecision: "PARTIALLY_APPROVED", totals: { payable: 3600 }, lines: [{ lineId: "l1", decision: "APPROVED_WITH_ADJUSTMENT", payableAmount: 3600 }] });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.executed).toBe(true);
    expect(decisionSvc.decide).toHaveBeenCalledWith("t1", "clm1", expect.objectContaining({ action: "PARTIALLY_APPROVED", approvedAmount: 3600 }));
  });

  it("PR-021: no deterministic price at all ROUTEs (NO_ENFORCEABLE_PRICE)", async () => {
    engineMock.evaluateClaimById.mockResolvedValue(null);
    decisionSvc.assessCeiling.mockResolvedValue({ ceiling: null, deterministic: false, source: null, enginePayable: null, contractNumber: null });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("NO_ENFORCEABLE_PRICE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });
});
