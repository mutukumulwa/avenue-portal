/**
 * Claims Autopilot — CHARACTERIZATION of current automation behavior.
 *
 * ⚠️  Pins CURRENT behavior as a before/after anchor, NOT desired behavior.
 *
 *  - The D1 "no-policy auto-approves" tests were REMOVED here: F4.1 fixed that
 *    (no LIVE policy ⇒ route). The safe behavior is now asserted in
 *    tests/services/auto-adjudication.service.test.ts (the D1 policy matrix).
 *  - The D11 block below still pins the UNSAFE pre-F4.5 behavior (line stamping
 *    before `decide`, partial line state on failure). F4.5 replaces these
 *    expectations with atomic execution; they MUST NOT remain after F4.5.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
  claimLine: { findMany: vi.fn(async (): Promise<unknown[]> => []), update: vi.fn(async () => ({})) },
  adjudicationLog: { create: vi.fn(async () => ({})) },
  autoAdjudicationPolicy: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  claimFraudAlert: { count: vi.fn(async () => 0) },
}));
const gate = vi.hoisted(() => ({ runHardGateValidation: vi.fn(async () => ({ passed: true, errors: [] as string[] })) }));
const exclusions = vi.hoisted(() => ({ applyToClaim: vi.fn(async () => ({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 })) }));
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
const intakeClaim = (over: Record<string, unknown> = {}) => ({
  ...claim(), isReimbursement: false, claimNumber: "CLM-2026-00001", status: "RECEIVED",
  claimLines: [{ id: "l1" }], ...over,
});
// A LIVE policy is now REQUIRED to reach the execution path (F4.1, D1).
const livePolicy = (over: Record<string, unknown> = {}) => ({
  id: "pol-live", clientId: "c1", mode: "LIVE", status: "APPROVED", maxAutoApproveAmount: 1_000_000, currency: "UGX",
  requireCleanFraud: true, requireAllLinesPriced: true, requireDocumentsComplete: true, requireEligibilityClear: true, requirePreauthWhenNeeded: true,
  allowedSources: ["MANUAL"], allowedServiceTypes: ["OUTPATIENT"], allowedBenefitCategories: ["OUTPATIENT"],
  isActive: true, effectiveFrom: new Date("2020-01-01"), effectiveTo: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.claim.findUnique.mockResolvedValue(intakeClaim());
  db.autoAdjudicationPolicy.findMany.mockResolvedValue([livePolicy()]); // LIVE ⇒ execution path reachable
  db.claimFraudAlert.count.mockResolvedValue(0);
  db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 50000 }]);
  gate.runHardGateValidation.mockResolvedValue({ passed: true, errors: [] });
  exclusions.applyToClaim.mockResolvedValue({ excludedCount: 0, excludedAmount: 0, payableAmount: 50000 });
  engineMock.evaluateClaimById.mockResolvedValue(null);
  decisionSvc.assessCeiling.mockResolvedValue({ ceiling: 1_000_000, deterministic: true, source: "Provider tariff schedule", enginePayable: null, contractNumber: null });
});

describe("UNSAFE current behavior — MUST be flipped in F4.5 (do not preserve)", () => {
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
    db.claimLine.findMany.mockResolvedValue([{ id: "l1", billedAmount: 25000 }, { id: "l2", billedAmount: 25000 }]);
    db.claimLine.update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("db write failed on l2"));
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(db.claimLine.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "l1" }, data: expect.objectContaining({ adjudicationDecision: "APPROVED" }) }));
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
    expect(db.claim.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ autoAdjDecision: "ROUTE", autoAdjFailingGate: "PIPELINE_ERROR" }) }));
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });
});

describe("SAFE current behavior — MUST be preserved through the refactor", () => {
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
    engineMock.evaluateClaimById.mockResolvedValue({ matched: true, claimDecision: "UNDER_REVIEW", reasonCode: "SVC-002", totals: { payable: 0 }, lines: [{ lineId: "l1", decision: "PENDED", reasonCode: "SVC-002", payableAmount: 0 }] });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("PRICING_COMPLETE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });

  it("[PRESERVE] no deterministic price at all ROUTEs (NO_ENFORCEABLE_PRICE)", async () => {
    engineMock.evaluateClaimById.mockResolvedValue(null);
    decisionSvc.assessCeiling.mockResolvedValue({ ceiling: null, deterministic: false, source: null, enginePayable: null, contractNumber: null });
    const r = await AutoAdjudicationService.processIntake("t1", "clm1", "u1");
    expect(r.decision).toBe("ROUTE");
    expect(r.failingGate).toBe("NO_ENFORCEABLE_PRICE");
    expect(decisionSvc.decide).not.toHaveBeenCalled();
  });
});
