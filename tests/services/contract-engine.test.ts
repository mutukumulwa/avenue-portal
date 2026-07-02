import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Prisma client the engine + precheck read from.
const db = vi.hoisted(() => ({
  providerContract: {
    findMany: vi.fn(async (): Promise<any[]> => []),
    findUnique: vi.fn(async (): Promise<any> => null),
  },
  providerTariff: { findMany: vi.fn(async (): Promise<any[]> => []) },
  serviceMappingMemory: { findMany: vi.fn(async (): Promise<any[]> => []) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { ContractEngine } from "@/server/services/contract-engine/engine";
import type { EngineClaimContext } from "@/server/services/contract-engine/types";

const DAY = new Date("2025-03-10");

const CIC_CONTRACT = {
  id: "con-cic",
  contractNumber: "PC-2025-001",
  title: "CIC Insurance Pricelist Agreement",
  status: "ACTIVE",
  branchScope: "ALL_BRANCHES",
  currentVersionId: "ver-1",
  parentContractId: null,
  balanceBillingPolicy: "PROHIBITED",
  unlistedServiceRule: "REFER_FOR_REVIEW",
  unlistedDiscountPct: null,
  startDate: new Date("2025-02-01"),
  endDate: new Date("2026-01-31"),
  contractBranches: [],
  applicability: [],
};

function tariff(overrides: Record<string, unknown>) {
  return {
    id: "t1",
    contractId: "con-cic",
    branchId: null,
    cptCode: null,
    providerServiceCode: null,
    serviceName: "Outpatient Consultation Fees",
    standardDescription: null,
    providerDescription: null,
    agreedRate: 1000,
    rateType: "FIXED",
    rateMissing: false,
    quantityLimit: null,
    maxQuantityPerVisit: null,
    discountPct: null,
    markupPct: null,
    minPayableAmount: null,
    maxPayableAmount: null,
    unitOfMeasure: "PER_ITEM",
    ...overrides,
  };
}

function ctx(lines: EngineClaimContext["lines"]): EngineClaimContext {
  return { tenantId: "t", providerId: "prov1", clientId: "cli1", dateOfService: DAY, lines };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.providerContract.findMany.mockResolvedValue([CIC_CONTRACT]);
  db.providerContract.findUnique.mockResolvedValue(CIC_CONTRACT);
  db.serviceMappingMemory.findMany.mockResolvedValue([]);
});

describe("ContractEngine — spec §10.3 worked examples", () => {
  it("Example 1: OP consultation billed 1,500 vs contracted 1,000 → pay 1,000, shortfall 500, PRC-001, write-off (balance billing prohibited)", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({})]);

    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: null, description: "Outpatient Consultation Fees", quantity: 1, unitCost: 1500, billedAmount: 1500 }]),
    );

    expect(result.matched).toBe(true);
    expect(result.contractNumber).toBe("PC-2025-001");
    const line = result.lines[0];
    expect(line.decision).toBe("APPROVED_WITH_ADJUSTMENT");
    expect(line.matchedRuleType).toBe("CONTRACT_TARIFF");
    expect(line.matchMethod).toBe("DESCRIPTION");
    expect(line.contractedAmount).toBe(1000);
    expect(line.payableAmount).toBe(1000);
    expect(line.shortfallAmount).toBe(500);
    expect(line.providerWriteOff).toBe(500); // PROHIBITED → provider absorbs
    expect(line.memberLiability).toBe(0);
    expect(line.reasonCode).toBe("PRC-001");
    expect(result.claimDecision).toBe("PARTIALLY_APPROVED");
  });

  it("Example 1b: billed below contracted → LOWER_OF pays the billed amount, no shortfall", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({})]);
    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: null, description: "Outpatient Consultation Fees", quantity: 1, unitCost: 800, billedAmount: 800 }]),
    );
    const line = result.lines[0];
    expect(line.payableAmount).toBe(800);
    expect(line.shortfallAmount).toBe(0);
    expect(line.decision).toBe("AUTO_APPROVED");
    expect(result.claimDecision).toBe("AUTO_APPROVED");
  });

  it("Example 8: service not on any schedule + unlisted rule REFER → SVC-002, pended", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({})]);
    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: "ROBO", description: "Robotic knee arthroplasty", quantity: 1, unitCost: 450000, billedAmount: 450000 }]),
    );
    const line = result.lines[0];
    expect(line.matchedRuleType).toBe("UNLISTED_REFER");
    expect(line.reasonCode).toBe("SVC-002");
    expect(line.decision).toBe("PENDED");
    expect(result.assignedQueue).toBe("SERVICE_NOT_MAPPED");
  });

  it("No contract matched → CON-001, all lines pend to NO_CONTRACT queue", async () => {
    db.providerContract.findMany.mockResolvedValue([]);
    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: null, description: "Anything", quantity: 1, unitCost: 100, billedAmount: 100 }]),
    );
    expect(result.matched).toBe(false);
    expect(result.reasonCode).toBe("CON-001");
    expect(result.assignedQueue).toBe("NO_CONTRACT");
    expect(result.lines[0].decision).toBe("PENDED");
  });

  it("Quantity over cap → excess disallowed (LIM-001)", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({ serviceName: "GP Review", agreedRate: 500, maxQuantityPerVisit: 1 })]);
    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: null, description: "GP Review", quantity: 3, unitCost: 500, billedAmount: 1500 }]),
    );
    const line = result.lines[0];
    expect(line.quantityApproved).toBe(1);
    expect(line.payableAmount).toBe(500);
    expect(line.disallowedAmount).toBe(1000); // 2 excess × 500
    expect(line.reasonCode).toBe("LIM-001");
  });

  it("Deterministic: same input twice → identical payable + trace length", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({})]);
    const line = { id: "L1", cptCode: null, description: "Outpatient Consultation Fees", quantity: 1, unitCost: 1500, billedAmount: 1500 };
    const a = await ContractEngine.evaluateClaim(ctx([{ ...line }]));
    const b = await ContractEngine.evaluateClaim(ctx([{ ...line }]));
    expect(a.lines[0].payableAmount).toBe(b.lines[0].payableAmount);
    expect(a.lines[0].trace.length).toBe(b.lines[0].trace.length);
  });
});
