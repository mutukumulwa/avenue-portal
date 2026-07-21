/**
 * Claims Autopilot F0.4 — CHARACTERIZATION of current automation behavior.
 *
 * ⚠️  This file pins the CURRENT behavior of AutoAdjudicationService, including
 *     the parts that are UNSAFE by the settled decisions (D1, D10, D11) and MUST
 *     change. It is a before/after anchor, NOT a statement of desired behavior.
 *
 *     - The "UNSAFE current behavior" block WILL be deleted/flipped in F4.1
 *       (remove implicit no-policy auto-approval) and F4.5 (atomic execution).
 *       Do NOT leave "unsafe behavior expected" tests after those packages
 *       (F0.4 instruction; §19 "Do not leave unsafe-behavior tests after
 *       remediation").
 *     - The "SAFE current behavior" block captures guarantees that must be
 *       PRESERVED through the refactor (reimbursement routes, unpriced routes).
 *
 * Mock harness mirrors tests/services/auto-adjudication.service.test.ts.
 */
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
const decisionSvc = vi.hoisted(() => ({
  decide: vi.fn(async () => ({})),
  assessCeiling: vi.fn(async () => ({ ceiling: 1_000_000, deterministic: true, source: "Provider tariff schedule", enginePayable: null, contractNumber: null })),
}));
const engineMock = vi.hoisted(() => ({ evaluateClaimById: vi.fn(async (): Promise<any> => null) }));
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

const claim = (over: any = {}) => ({
  providerId: "p1", memberId: "m1", dateOfService: new Date("2026-06-01"),
  benefitCategory: "OUTPATIENT", invoiceNumber: "INV-1", billedAmount: 50000, currency: "UGX",
  member: { group: { clientId: "c1" } }, ...over,
});
const intakeClaim = (over: any = {}) => ({
  ...claim(), isReimbursement: false, claimNumber: "CLM-2026-00001", status: "RECEIVED",
  claimLines: [{ id: "l1" }], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.claim.findUnique.mockResolvedValue(intakeClaim());
  db.autoAdjudicationPolicy.findMany.mockResolvedValue([]); // NO configured policy
  db.claimFraudAlert.count.mockResolvedValue(0);
  db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 50000 }]);
  gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
  exclusions.applyToClaim.mockResolvedValue({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 });
  engineMock.evaluateClaimById.mockResolvedValue(null);
  decisionSvc.assessCeiling.mockResolvedValue({ ceiling: 1_000_000, deterministic: true, source: "Provider tariff schedule", enginePayable: null, contractNumber: null });
});

describe("F0.4 UNSAFE current behavior — MUST be flipped in F4.1/F4.5 (do not preserve)", () => {
  // #1 — D1 VIOLATION: no configured policy resolves to built-in LIVE approval.
  it("[UNSAFE:D1] with NO policy, a clean claim AUTO_APPROVEs under the built-in default", async () => {
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("AUTO_APPROVE"); // ← F4.1 must make this ROUTE (AUTO_POLICY_NOT_LIVE)
    expect(r.policyId).toBeNull(); // approving with no policy id at all
  });

  // #2 — D1 VIOLATION: the no-ceiling fallback approves an arbitrarily large claim.
  it("[UNSAFE:D1] the no-ceiling fallback AUTO_APPROVEs a deterministically priced high-value claim", async () => {
    db.claim.findUnique.mockResolvedValue(intakeClaim({ billedAmount: 5_000_000 }));
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 5_000_000 }]);
    decisionSvc.assessCeiling.mockResolvedValue({ ceiling: 10_000_000, deterministic: true, source: "tariff", enginePayable: null, contractNumber: null });
    const r = await AutoAdjudicationService.evaluateClaim("t1", "clm1");
    expect(r.decision).toBe("AUTO_APPROVE"); // ← 5,000,000 auto-approved with NO policy ceiling
    expect(r.approveAmount).toBe(5_000_000);
  });

  // #3 — D11 VIOLATION: per-line stamping happens BEFORE ClaimDecisionService.decide.
  it("[UNSAFE:D11] line updates run BEFORE the decision (non-atomic ordering)", async () => {
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.executed).toBe(true);
    const firstLineUpdate = db.claimLine.update.mock.invocationCallOrder[0];
    const firstDecide = decisionSvc.decide.mock.invocationCallOrder[0];
    expect(firstLineUpdate).toBeDefined();
    expect(firstDecide).toBeDefined();
    expect(firstLineUpdate).toBeLessThan(firstDecide); // ← F4.5 folds both into one transaction
  });

  // #4 — D11 VIOLATION: a failure mid-loop leaves a partially-stamped line, no rollback.
  it("[UNSAFE:D11] a failure after the first line update leaves partial line state", async () => {
    db.claimLine.findMany.mockResolvedValue([
      { id: "l1", billedAmount: 25000 },
      { id: "l2", billedAmount: 25000 },
    ]);
    db.claimLine.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("db write failed on l2"));
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    // l1 was already stamped APPROVED and is NOT rolled back...
    expect(db.claimLine.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ adjudicationDecision: "APPROVED" }) }),
    );
    // ...while the claim never decided and routes as a technical failure.
    expect(decisionSvc.decide).not.toHaveBeenCalled();
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("PIPELINE_ERROR"); // ← F4.5: no partial write can survive
  });

  // #5 — no durable run/stage: a pipeline error records only a claim flag.
  it("[GAP] a pipeline error writes only the claim route flag, with no durable run/stage", async () => {
    exclusions.applyToClaim.mockRejectedValue(new Error("boom"));
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.failingGate).toBe("PIPELINE_ERROR");
    expect(r.executed).toBe(false);
    // The ONLY durable trace is a Claim column update — there is no ClaimProcessingRun
    // / ClaimProcessingStage in the model yet (F2.3 adds it; F3.6 makes it recoverable).
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ autoAdjDecision: "ROUTE", autoAdjFailingGate: "PIPELINE_ERROR" }) }),
    );
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });
});

describe("F0.4 SAFE current behavior — MUST be preserved through the refactor", () => {
  // #6 — reimbursements route manually (D13 already holds today).
  it("[PRESERVE] reimbursement claims always ROUTE for manual proof review", async () => {
    db.claim.findUnique.mockResolvedValue(intakeClaim({ isReimbursement: true }));
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("REIMBURSEMENT_MANUAL_REVIEW");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });

  // #7 — engine-pended / unpriced lines route (D5 already holds today).
  it("[PRESERVE] an engine-pended line ROUTEs (never auto-pays a refer-for-review service)", async () => {
    engineMock.evaluateClaimById.mockResolvedValue({
      matched: true, claimDecision: "UNDER_REVIEW", reasonCode: "SVC-002",
      totals: { payable: 0 }, lines: [{ lineId: "l1", decision: "PENDED", reasonCode: "SVC-002", payableAmount: 0 }],
    });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("PRICING_COMPLETE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });

  it("[PRESERVE] no deterministic price at all ROUTEs (NO_ENFORCEABLE_PRICE)", async () => {
    engineMock.evaluateClaimById.mockResolvedValue(null);
    decisionSvc.assessCeiling.mockResolvedValue({ ceiling: null, deterministic: false, source: null, enginePayable: null, contractNumber: null } as any);
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("NO_ENFORCEABLE_PRICE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });
});
