import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const tx = {
    providerContract: { create: vi.fn(async (a: any) => ({ id: "new1", contractNumber: "PC-2027-001", ...a.data })), update: vi.fn(async (a: any) => ({ a })) },
    providerTariff: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
    contractApplicability: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
    contractBranch: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
    pricingRule: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
    contractPackage: { create: vi.fn(async (a: any) => ({ a, id: "pkgN" })) },
    preauthRule: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
    documentationRule: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
    providerContractExclusion: { createMany: vi.fn(async (a: any) => ({ a, count: 0 })) },
  };
  return {
    tx,
    db: {
      providerContract: { findUnique: vi.fn(async (): Promise<any> => null) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: h.db }));
vi.mock("@/server/services/provider-contracts.service", () => ({ ProviderContractsService: { nextContractNumber: vi.fn(async () => "PC-2027-001") } }));
vi.mock("@/server/services/audit-chain.service", () => ({ auditChainService: { append: vi.fn(async () => ({})) } }));

import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";

const OLD = {
  id: "old1", providerId: "prov1", contractNumber: "PC-2025-001", title: "CIC Pricelist 2025", contractType: "RATE_SCHEDULE",
  branchScope: "ALL_BRANCHES", parentContractId: null, parentDigitised: true, externalContractRef: null,
  currency: "KES", country: null, region: null, paymentTermDays: 30, paymentTermType: "CALENDAR", creditLimit: null,
  invoiceDiscountPct: null, earlySettlementDiscountPct: null, earlySettlementWindowDays: null, submissionWindowDays: 7,
  submissionWindowBasis: "SERVICE_DATE", balanceBillingPolicy: "PROHIBITED", taxInclusive: "INCLUSIVE", reconciliationCadence: "NONE",
  unlistedServiceRule: "REFER_FOR_REVIEW", unlistedDiscountPct: null, autoRenew: false, notes: null, contractOwnerId: "u0",
  supersededById: null,
  tariffLines: [{ agreedRate: 1000, minPayableAmount: null, maxPayableAmount: 2000, externalRebateAmount: null, cptCode: null, serviceName: "OP Consult", currency: "KES", tariffType: "NEGOTIATED", requiresPreauth: false, maxQuantityPerVisit: null, branchId: null, clientId: null, serviceCategoryId: null, providerServiceCode: null, providerDescription: null, standardDescription: null, codingSystem: null, rateType: "FIXED", discountPct: null, markupPct: null, unitOfMeasure: "PER_ITEM", quantityLimit: null, frequencyLimit: null, frequencyPeriod: null, genderRestriction: null, ageMin: null, ageMax: null, diagnosisRestriction: null, requiresReferral: false, rateMissing: false, externalScheme: null }],
  applicability: [{ clientId: "cli1", groupId: null, packageId: null, packageVersionId: null, benefitCategory: null, networkTier: null, memberCategory: null, inclusionType: "INCLUDE" }],
  contractBranches: [],
  pricingRules: [{ scope: "CONTRACT", serviceCategoryId: null, tariffLineId: null, ruleKind: "PER_VISIT_CASE_RATE", params: { rate: 3600 }, priority: 100 }],
  contractPackages: [],
  preauthRules: [],
  documentationRules: [],
  exclusions: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.providerContract.findUnique.mockResolvedValue(OLD);
});

describe("ContractLifecycleService.renew (spec §4.4)", () => {
  it("clones into a DRAFT/UNSIGNED contract, applies uplift, and supersedes the old one", async () => {
    const renewed = await ContractLifecycleService.renew("t", "old1", {
      startDate: new Date("2026-02-01"), endDate: new Date("2027-01-31"), upliftPct: 10, userId: "u1",
    });
    expect(renewed.contractNumber).toBe("PC-2027-001");

    const created = h.tx.providerContract.create.mock.calls[0][0].data;
    expect(created.status).toBe("DRAFT");
    expect(created.executionStatus).toBe("UNSIGNED"); // must be re-signed
    expect(created.submissionWindowDays).toBe(7); // operational terms carried forward

    // 10% uplift on tariff rate + cap.
    const tariffs = h.tx.providerTariff.createMany.mock.calls[0][0].data;
    expect(tariffs[0].agreedRate).toBe(1100);
    expect(tariffs[0].maxPayableAmount).toBe(2200);
    expect(tariffs[0].rateType).toBe("FIXED"); // new field carried forward

    // Pricing-rule params.rate uplifted.
    const rules = h.tx.pricingRule.createMany.mock.calls[0][0].data;
    expect(rules[0].params.rate).toBe(3960); // 3600 × 1.1

    // Applicability carried forward.
    expect(h.tx.contractApplicability.createMany).toHaveBeenCalled();

    // Old contract superseded.
    expect(h.tx.providerContract.update).toHaveBeenCalledWith({ where: { id: "old1" }, data: { supersededById: "new1" } });
  });

  it("refuses to renew an already-superseded contract", async () => {
    h.db.providerContract.findUnique.mockResolvedValue({ ...OLD, supersededById: "someone" });
    await expect(ContractLifecycleService.renew("t", "old1", { startDate: new Date("2026-02-01"), endDate: new Date("2027-01-31"), upliftPct: 0 })).rejects.toThrow(/already been renewed/);
  });

  it("rejects an end date before the start date", async () => {
    await expect(ContractLifecycleService.renew("t", "old1", { startDate: new Date("2027-01-31"), endDate: new Date("2026-02-01"), upliftPct: 0 })).rejects.toThrow(/after the start date/);
  });
});
