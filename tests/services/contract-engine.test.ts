import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Prisma client the engine + precheck read from.
const db = vi.hoisted(() => ({
  providerContract: {
    findMany: vi.fn(async (): Promise<any[]> => []),
    findUnique: vi.fn(async (): Promise<any> => null),
  },
  providerTariff: { findMany: vi.fn(async (): Promise<any[]> => []) },
  serviceMappingMemory: { findMany: vi.fn(async (): Promise<any[]> => []) },
  contractPackage: { findMany: vi.fn(async (): Promise<any[]> => []) },
  pricingRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
  providerContractExclusion: { findMany: vi.fn(async (): Promise<any[]> => []) },
  preauthRule: { findMany: vi.fn(async (): Promise<any[]> => []) },
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
  db.contractPackage.findMany.mockResolvedValue([]);
  db.pricingRule.findMany.mockResolvedValue([]);
  db.providerContractExclusion.findMany.mockResolvedValue([]);
  db.preauthRule.findMany.mockResolvedValue([]);
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

describe("ContractEngine — Phase 3 stages 5-8 (spec §10.3 examples 2-9)", () => {
  it("Example 2: PER_VISIT_CASE_RATE folds all lines into a fixed 3,900 payable (AS_CONTRACTED)", async () => {
    db.providerTariff.findMany.mockResolvedValue([]);
    db.pricingRule.findMany.mockResolvedValue([
      { id: "r1", scope: "CONTRACT", ruleKind: "PER_VISIT_CASE_RATE", isActive: true, params: { rate: 3900, label: "FCM per visit" } },
    ]);
    const result = await ContractEngine.evaluateClaim(
      ctx([
        { id: "L1", cptCode: null, description: "Consultation", quantity: 1, unitCost: 800, billedAmount: 800 },
        { id: "L2", cptCode: null, description: "Labs", quantity: 1, unitCost: 2400, billedAmount: 2400 },
        { id: "L3", cptCode: null, description: "Pharmacy", quantity: 1, unitCost: 1900, billedAmount: 1900 },
      ]),
    );
    expect(result.totals.payable).toBe(3900);
    const caseLine = result.lines.find(l => l.matchedRuleType === "PER_VISIT_CASE_RATE");
    expect(caseLine?.payableAmount).toBe(3900);
    expect(result.lines.filter(l => l.reasonCode === "PRC-005").length).toBe(3); // folded lines
    expect(result.claimDecision).toBe("AUTO_APPROVED");
  });

  it("Example 3: case-rate carve-out (MRI) without pre-auth → MRI line AUTH-001 pended, visit still pays 3,900", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({ id: "tm", serviceName: "MRI Brain", agreedRate: 18400 })]);
    db.pricingRule.findMany.mockResolvedValue([
      { id: "r1", scope: "CONTRACT", ruleKind: "PER_VISIT_CASE_RATE", isActive: true, params: { rate: 3900, carveOutDescriptions: ["MRI"] } },
    ]);
    db.preauthRule.findMany.mockResolvedValue([
      { triggerType: "SERVICE_LIST", serviceRefs: ["MRI"], emergencyExempt: false, retrospectiveAllowed: false, consequenceIfMissing: "ROUTE_MANUAL", admissionRequired: false, thresholdAmount: null },
    ]);
    const result = await ContractEngine.evaluateClaim(
      ctx([
        { id: "L1", cptCode: null, description: "Consultation", quantity: 1, unitCost: 800, billedAmount: 800 },
        { id: "MRI", cptCode: null, description: "MRI Brain", quantity: 1, unitCost: 18400, billedAmount: 18400 },
      ]),
    );
    const mri = result.lines.find(l => l.lineId === "MRI");
    expect(mri?.reasonCode).toBe("AUTH-001");
    expect(mri?.decision).toBe("PENDED");
    const caseLine = result.lines.find(l => l.matchedRuleType === "PER_VISIT_CASE_RATE");
    expect(caseLine?.payableAmount).toBe(3900);
    expect(result.assignedQueue).toBe("MISSING_PREAUTH");
  });

  it("Example 4: package beats itemised bill — components PRC-005, disallowed excess", async () => {
    db.providerTariff.findMany.mockResolvedValue([]);
    db.contractPackage.findMany.mockResolvedValue([
      {
        id: "pkg1", name: "Caesarean Section Package", packagePrice: 120000, triggerType: "PROCEDURE_CODE",
        triggerCodes: ["59510"], unbundlingAllowed: false, packageOverridesLineItems: true, components: [],
      },
    ]);
    const result = await ContractEngine.evaluateClaim(
      ctx([
        { id: "L1", cptCode: "59510", description: "Theatre", quantity: 1, unitCost: 60000, billedAmount: 60000 },
        { id: "L2", cptCode: null, description: "Ward", quantity: 1, unitCost: 30000, billedAmount: 30000 },
        { id: "L3", cptCode: null, description: "Drugs", quantity: 1, unitCost: 25000, billedAmount: 25000 },
        { id: "L4", cptCode: null, description: "Doctor", quantity: 1, unitCost: 30000, billedAmount: 30000 },
      ]),
    );
    const pkgLine = result.lines.find(l => l.matchedRuleType === "PACKAGE" && l.matchedRuleId === "pkg1");
    expect(pkgLine?.payableAmount).toBe(120000);
    expect(pkgLine?.disallowedAmount).toBe(25000); // 145,000 billed − 120,000
    expect(result.lines.filter(l => l.reasonCode === "PRC-005").length).toBe(4);
    expect(result.totals.payable).toBe(120000);
  });

  it("Example 5: package + NICU complication (EXCLUDED component) → NICU priced separately", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({ id: "tn", serviceName: "NICU Care", agreedRate: 30000 })]);
    db.contractPackage.findMany.mockResolvedValue([
      {
        id: "pkg1", name: "Caesarean Section Package", packagePrice: 120000, triggerType: "PROCEDURE_CODE",
        triggerCodes: ["59510"], unbundlingAllowed: false, packageOverridesLineItems: true,
        components: [{ type: "EXCLUDED", description: "NICU", code: null }],
      },
    ]);
    const result = await ContractEngine.evaluateClaim(
      ctx([
        { id: "L1", cptCode: "59510", description: "Theatre", quantity: 1, unitCost: 60000, billedAmount: 60000 },
        { id: "NICU", cptCode: null, description: "NICU Care", quantity: 1, unitCost: 30000, billedAmount: 30000 },
      ]),
    );
    const nicu = result.lines.find(l => l.lineId === "NICU");
    expect(nicu?.payableAmount).toBe(30000); // priced separately, not folded
    expect(nicu?.reasonCode).not.toBe("PRC-005");
    const pkgLine = result.lines.find(l => l.matchedRuleId === "pkg1");
    expect(pkgLine?.payableAmount).toBe(120000);
    expect(result.totals.payable).toBe(150000);
  });

  it("Example 6: service requires referral, self-referred → EXC-004 declined", async () => {
    db.providerTariff.findMany.mockResolvedValue([tariff({ id: "tmri", serviceName: "MRI Lumbar", agreedRate: 15000, requiresReferral: true })]);
    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: null, description: "MRI Lumbar", quantity: 1, unitCost: 15000, billedAmount: 15000 }]),
    );
    const line = result.lines[0];
    expect(line.reasonCode).toBe("EXC-004");
    expect(line.decision).toBe("DECLINED");
    expect(line.payableAmount).toBe(0);
  });

  it("Example 7: claim submitted 12 days post-discharge, window 7 (DISCHARGE_DATE) → SUB-001 late", async () => {
    const shaContract = { ...CIC_CONTRACT, submissionWindowDays: 7, submissionWindowBasis: "DISCHARGE_DATE" };
    db.providerContract.findMany.mockResolvedValue([shaContract]);
    db.providerContract.findUnique.mockResolvedValue(shaContract);
    db.providerTariff.findMany.mockResolvedValue([tariff({ serviceName: "IP Consult", agreedRate: 1000 })]);
    const result = await ContractEngine.evaluateClaim({
      tenantId: "t", providerId: "prov1", clientId: "cli1",
      dateOfService: new Date("2025-03-01"),
      dischargeDate: new Date("2025-03-03"),
      submissionDate: new Date("2025-03-15"), // 12 days after discharge
      lines: [{ id: "L1", cptCode: null, description: "IP Consult", quantity: 1, unitCost: 1000, billedAmount: 1000 }],
    });
    expect(result.submissionLate).toBe(true);
    expect(result.reasonCode).toBe("SUB-001");
    expect(result.claimDecision).toBe("UNDER_REVIEW");
  });

  it("Example 9: AVERAGE_COST_POOL — line pays billed, no shortfall, claim tagged to pool", async () => {
    db.providerTariff.findMany.mockResolvedValue([]);
    db.pricingRule.findMany.mockResolvedValue([
      { id: "r1", scope: "CONTRACT", ruleKind: "AVERAGE_COST_POOL", isActive: true, params: { poolId: "OM-2025-Q1" } },
    ]);
    const result = await ContractEngine.evaluateClaim(
      ctx([{ id: "L1", cptCode: null, description: "OP visit", quantity: 1, unitCost: 6200, billedAmount: 6200 }]),
    );
    expect(result.avgCostPoolTag).toBe("OM-2025-Q1");
    expect(result.lines[0].payableAmount).toBe(6200);
    expect(result.lines[0].shortfallAmount).toBe(0);
    expect(result.totals.shortfall).toBe(0);
  });
});
