import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma for the engine (evaluateClaimById → evaluateClaim) + persist.
const claimLineUpdate = vi.fn(async () => ({}));
const claimUpdate = vi.fn(async () => ({}));

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn(async (): Promise<any> => null), update: vi.fn(async () => ({})) },
  group: { findUnique: vi.fn(async (): Promise<any> => ({ clientId: "cli1" })) },
  providerContract: { findMany: vi.fn(async (): Promise<any[]> => []), findUnique: vi.fn(async (): Promise<any> => null) },
  providerTariff: { findMany: vi.fn(async (): Promise<any[]> => []) },
  serviceMappingMemory: { findMany: vi.fn(async (): Promise<any[]> => []) },
  contractPackage: { findMany: vi.fn(async (): Promise<any[]> => []) },
  pricingRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
  providerContractExclusion: { findMany: vi.fn(async (): Promise<any[]> => []) },
  preauthRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
  adjudicationReasonCode: { findMany: vi.fn(async (): Promise<any[]> => []) },
  claimLine: { findMany: vi.fn(async (): Promise<any[]> => []) },
  $transaction: vi.fn(async (fn: any) => fn({ claimLine: { update: claimLineUpdate }, claim: { update: claimUpdate } })),
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ContractEngineIntegration } from "@/server/services/contract-engine/persist";

const CIC = {
  id: "con-cic", contractNumber: "PC-2025-001", title: "CIC", status: "ACTIVE", branchScope: "ALL_BRANCHES",
  currentVersionId: "ver-1", parentContractId: null, balanceBillingPolicy: "PROHIBITED",
  unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null,
  startDate: new Date("2025-02-01"), endDate: new Date("2026-01-31"), contractBranches: [], applicability: [],
  submissionWindowDays: null, submissionWindowBasis: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.claim.findUnique.mockResolvedValue({
    id: "clm1", providerId: "prov1", providerBranchId: null, serviceType: "OUTPATIENT",
    dateOfService: new Date("2025-03-10"), admissionDate: null, dischargeDate: null, lengthOfStay: null,
    procedures: [], member: { groupId: "g1" },
    claimLines: [{ id: "CL1", cptCode: null, description: "Outpatient Consultation Fees", serviceCategory: "CONSULTATION", icdCode: null, quantity: 1, unitCost: 1500, billedAmount: 1500 }],
  });
  db.group.findUnique.mockResolvedValue({ clientId: "cli1" });
  db.providerContract.findMany.mockResolvedValue([CIC]);
  db.providerContract.findUnique.mockResolvedValue(CIC);
  db.providerTariff.findMany.mockResolvedValue([
    { id: "t1", contractId: "con-cic", branchId: null, cptCode: null, providerServiceCode: null, serviceName: "Outpatient Consultation Fees", standardDescription: null, providerDescription: null, agreedRate: 1000, rateType: "FIXED", rateMissing: false, quantityLimit: null, maxQuantityPerVisit: null, discountPct: null, markupPct: null, minPayableAmount: null, maxPayableAmount: null, unitOfMeasure: "PER_ITEM", requiresReferral: false },
  ]);
  db.adjudicationReasonCode.findMany.mockResolvedValue([{ id: "rc-prc001", code: "PRC-001" }]);
  db.claimLine.findMany.mockResolvedValue([{ id: "CL1" }]);
});

describe("ContractEngineIntegration.evaluateAndPersist (spec §8.3)", () => {
  it("persists per-line contract provenance + reason code onto the ClaimLine", async () => {
    const outcome = await ContractEngineIntegration.evaluateAndPersist("t", "clm1");
    expect(outcome.persisted).toBe(true);
    expect(outcome.linesUpdated).toBe(1);

    expect(claimLineUpdate).toHaveBeenCalledTimes(1);
    const arg = claimLineUpdate.mock.calls[0][0] as any;
    expect(arg.where).toEqual({ id: "CL1" });
    expect(arg.data.contractId).toBe("con-cic");
    expect(arg.data.contractVersionId).toBe("ver-1");
    expect(arg.data.matchedRuleType).toBe("CONTRACT_TARIFF");
    expect(arg.data.reasonCodeId).toBe("rc-prc001"); // PRC-001 resolved
    expect(Number(arg.data.shortfallAmount)).toBe(500);
    expect(Number(arg.data.providerWriteOff)).toBe(500);
    expect(arg.data.ruleTrace).toBeTruthy();
  });

  it("stamps the claim-level contract match", async () => {
    await ContractEngineIntegration.evaluateAndPersist("t", "clm1");
    const arg = claimUpdate.mock.calls[0][0] as any;
    expect(arg.where).toEqual({ id: "clm1" });
    expect(arg.data.contractId).toBe("con-cic");
    expect(arg.data.contractFamilyIds).toEqual(["con-cic"]);
    expect(arg.data.assignedQueue).toBeNull(); // clean shortfall, no pend
  });

  it("swallows errors by default (never loses a claim)", async () => {
    db.claim.findUnique.mockRejectedValueOnce(new Error("db down"));
    const outcome = await ContractEngineIntegration.evaluateAndPersist("t", "clm1");
    expect(outcome.persisted).toBe(false);
  });
});
