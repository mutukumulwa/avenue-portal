/**
 * Family Hospital UAT plan P01.03 (acceptance) and §8.1 (pricing oracle).
 *
 * ONE fixture, four readers, one answer: for every Family service the facility
 * can select, the provider catalogue, the submit-time canonicaliser, the legacy
 * rate resolver (decision ceiling / PA gate / tariff stamp) and the contract
 * engine (adjudication) must name the SAME tariff row at the SAME rate. The
 * fixture also carries a standalone row, a row on another contract and an
 * inactive row with the same service names — none may ever surface or price.
 *
 * The mock database evaluates the engine's real `where` clauses, so a reader
 * that asked for the wrong rows would get them here too.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

const FROM = new Date("2026-08-28T00:00:00Z");
const DAY = new Date("2026-09-11T00:00:00Z");

type Row = Record<string, unknown> & { id: string };
function tariff(id: string, serviceName: string, rate: string, categoryId: string, over: Record<string, unknown> = {}): Row {
  return {
    id, providerId: "prov-fh", contractId: "con-fh", versionId: "ver-fh", branchId: null, clientId: null,
    cptCode: null, providerServiceCode: null, serviceName, standardDescription: null, providerDescription: serviceName,
    agreedRate: new Prisma.Decimal(rate), currency: "UGX", tariffType: "NEGOTIATED", requiresPreauth: false, maxQuantityPerVisit: null,
    serviceCategoryId: categoryId, codingSystem: null, rateType: "FIXED", discountPct: null, markupPct: null, maxPayableAmount: null,
    minPayableAmount: null, unitOfMeasure: "PER_ITEM", quantityLimit: null, frequencyLimit: null, frequencyPeriod: null,
    genderRestriction: null, ageMin: null, ageMax: null, diagnosisRestriction: null, requiresReferral: false, rateMissing: false,
    externalScheme: null, externalRebateAmount: null, sourceRef: null, notes: null, effectiveFrom: FROM, effectiveTo: null,
    isActive: true, createdAt: FROM, ...over,
  };
}

const FAMILY: Row[] = [
  tariff("t1-consult", "General Doctor Consult", "25000", "cat-consult", { unitOfMeasure: "PER_CONSULTATION" }),
  tariff("t2-azi-tab", "Azithromycin 500Mg (Tab)", "4807", "cat-drugs", { notes: "Unit: Tab" }),
  tariff("t3-azi-vial", "Azithromycin 500Mg (Vial)", "70000", "cat-drugs", { notes: "Unit: Vial" }),
  tariff("t4-fbc", "Full Blood Count", "25000", "cat-lab"),
  tariff("t5-bed", "Bed Fee – PRIVATE", "120000", "cat-ip", { unitOfMeasure: "PER_DAY" }),
];
// Same names, but none of these may ever be read or priced:
const DECOYS: Row[] = [
  tariff("z1-standalone", "General Doctor Consult", "1000", "cat-consult", { contractId: null, versionId: null }),
  tariff("z2-other-contract", "Full Blood Count", "9999", "cat-lab", { contractId: "con-other" }),
  tariff("z3-inactive", "Azithromycin 500Mg (Tab)", "1", "cat-drugs", { isActive: false }),
];
const ALL = [...DECOYS, ...FAMILY];

const CATEGORIES = [
  { id: "cat-consult", code: "CONSULTATION", name: "Consultation", tier: "HEADLINE", parentId: null },
  { id: "cat-ph", code: "PHARMACY", name: "Pharmacy", tier: "PHARMACY", parentId: null },
  { id: "cat-drugs", code: "PHARMACY_DRUGS", name: "Drugs / Medication", tier: null, parentId: "cat-ph" },
  { id: "cat-lab", code: "LABORATORY", name: "Laboratory", tier: "LABORATORY", parentId: null },
  { id: "cat-ip", code: "IP_SERVICES", name: "Inpatient Services", tier: "HEADLINE", parentId: null },
];

const CONTRACT = {
  id: "con-fh", contractNumber: "PC-2026-202", title: "Family trial", status: "ACTIVE", branchScope: "ALL_BRANCHES",
  currentVersionId: "ver-fh", parentContractId: null, currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW",
  unlistedDiscountPct: null, invoiceDiscountPct: null, balanceBillingPolicy: null, submissionWindowDays: null,
  submissionWindowBasis: null, startDate: FROM, endDate: new Date("2027-08-27T00:00:00Z"), contractBranches: [],
  applicability: [{ clientId: "client-trial", inclusionType: "INCLUDE", isActive: true }],
};

/** Evaluates the engine's candidate `where` (tariff-selection.candidateTariffWhere). */
function matchesWhere(row: Row, where: Record<string, any>): boolean {
  if ("contractId" in where && row.contractId !== where.contractId) return false;
  if ("isActive" in where && row.isActive !== where.isActive) return false;
  if (where.effectiveFrom?.lte && (row.effectiveFrom as Date) > where.effectiveFrom.lte) return false;
  if (where.OR && !where.OR.some((c: any) => (c.effectiveTo === null ? row.effectiveTo === null : row.effectiveTo !== null && (row.effectiveTo as Date) >= c.effectiveTo.gte))) return false;
  for (const clause of where.AND ?? []) {
    const ok = clause.OR.some((c: any) => {
      const [key, value] = Object.entries(c)[0] as [string, unknown];
      return value === undefined ? true : row[key] === value;
    });
    if (!ok) return false;
  }
  return true;
}

const db = vi.hoisted(() => ({
  providerTariff: { findMany: vi.fn() },
  serviceCategory: { findMany: vi.fn() },
  providerContract: { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  providerContractExclusion: { findMany: vi.fn(async () => []) },
  serviceMappingMemory: { findMany: vi.fn(async () => []) },
  contractPackage: { findMany: vi.fn(async () => []) },
  pricingRule: { findMany: vi.fn(async () => []) },
  preauthRule: { findMany: vi.fn(async () => []) },
  documentationRule: { findMany: vi.fn(async () => []) },
  externalTariffTable: { findMany: vi.fn(async () => []) },
  auditLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/server/services/capture-telemetry", () => ({ captureEvent: vi.fn() }));

import { ProviderServiceCatalogService, resetCatalogueCache } from "@/server/services/provider-service-catalog.service";
import { ProviderContractsService } from "@/server/services/provider-contracts.service";
import { ContractEngine } from "@/server/services/contract-engine/engine";
import type { TrustedCaseContext } from "@/server/services/provider-case-context.service";
import { resetRateLimiter } from "@/lib/rate-limit";

const context: TrustedCaseContext = {
  tenantId: "tenant-1", providerId: "prov-fh", actorId: "user-biller", purpose: "CLAIM", memberId: "mem-1", clientId: "client-trial",
  branchId: "br-main", serviceDate: DAY, serviceDateIso: "2026-09-11", benefitCategory: "OUTPATIENT", eligible: true,
  contractId: "con-fh", contractVersionId: "ver-fh", currency: "UGX", unlistedServiceRule: "REFER_FOR_REVIEW",
  unlistedDiscountPct: null, catalogueEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  resetCatalogueCache();
  resetRateLimiter();
  db.providerTariff.findMany.mockImplementation(async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
    const rows = ALL.filter((r) => matchesWhere(r, args.where));
    // Candidate order: effectiveFrom desc, id asc (all share effectiveFrom).
    return rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  });
  db.serviceCategory.findMany.mockResolvedValue(CATEGORIES);
  db.providerContract.findMany.mockResolvedValue([CONTRACT]);
  db.providerContract.findUnique.mockResolvedValue(CONTRACT);
});

const EXPECTED: Array<{ id: string; name: string; rate: string; category: string; query: string }> = [
  { id: "t1-consult", name: "General Doctor Consult", rate: "25000", category: "CONSULTATION", query: "doctor con" },
  { id: "t2-azi-tab", name: "Azithromycin 500Mg (Tab)", rate: "4807", category: "PHARMACY", query: "azith tab" },
  { id: "t3-azi-vial", name: "Azithromycin 500Mg (Vial)", rate: "70000", category: "PHARMACY", query: "azith vial" },
  { id: "t4-fbc", name: "Full Blood Count", rate: "25000", category: "LABORATORY", query: "blood" },
  { id: "t5-bed", name: "Bed Fee – PRIVATE", rate: "120000", category: "OTHER", query: "bed fee" },
];

describe.each(EXPECTED)("parity for $name", ({ id, name, rate, category, query }) => {
  it("catalogue display, canonical line, legacy resolver and engine agree on the row and the rate", async () => {
    // 1. Provider catalogue (what the facility sees).
    const search = await ProviderServiceCatalogService.search(context, { category, query });
    expect(search.ok).toBe(true);
    if (!search.ok) return;
    const shown = search.rows.find((r) => r.tariffId === id);
    expect(shown).toMatchObject({ serviceName: name, unitRate: rate, currency: "UGX", selectable: true });

    // 2. Submit-time canonicalisation (what the claim line stores).
    const canon = await ProviderServiceCatalogService.canonicalizeLines(context, [
      { selectedProviderTariffId: id, serviceCategory: category as never, quantity: 1, billedUnitPrice: rate },
    ]);
    expect(canon.ok).toBe(true);
    if (!canon.ok) return;
    expect(canon.lines[0]).toMatchObject({ selectedProviderTariffId: id, description: name, tariffRate: rate, currency: "UGX" });

    // 3. Legacy resolver (decision ceiling, PA gate, tariff stamp).
    const legacy = await ProviderContractsService.resolveClaimLineRates(
      "tenant-1", "prov-fh", DAY, [{ id: "l1", cptCode: null, description: name, unitCost: Number(rate), quantity: 1 }], "client-trial", "br-main",
    );
    expect(legacy.lines[0]).toMatchObject({ agreedRate: Number(rate), ruleApplied: "CONTRACT_TARIFF" });

    // 4. Contract engine (adjudication), fed the canonical line.
    const engine = await ContractEngine.evaluateClaim({
      tenantId: "tenant-1", providerId: "prov-fh", providerBranchId: "br-main", clientId: "client-trial", serviceType: "OUTPATIENT", dateOfService: DAY,
      lines: [{ id: "l1", cptCode: canon.lines[0].cptCode, providerServiceCode: null, description: canon.lines[0].description, quantity: 1, unitCost: Number(rate), billedAmount: Number(rate) }],
    });
    expect(engine.matched).toBe(true);
    expect(engine.lines[0]).toMatchObject({ matchedRuleId: id, matchedRuleType: "CONTRACT_TARIFF", contractedAmount: Number(rate), decision: "AUTO_APPROVED" });
  });
});

describe("decoys never surface or price", () => {
  it("the standalone, other-contract and inactive rows are absent from every search", async () => {
    for (const [category, query] of [["CONSULTATION", "consult"], ["LABORATORY", "blood"], ["PHARMACY", "azith"]] as const) {
      const r = await ProviderServiceCatalogService.search(context, { category, query });
      expect(r.ok && r.rows.map((x) => x.tariffId).filter((x) => x.startsWith("z"))).toEqual([]);
    }
  });

  it("a selected decoy id is rejected at submit — it is not in the engine's candidate set", async () => {
    for (const id of ["z1-standalone", "z2-other-contract", "z3-inactive"]) {
      const r = await ProviderServiceCatalogService.canonicalizeLines(context, [
        { selectedProviderTariffId: id, serviceCategory: "CONSULTATION", quantity: 1, billedUnitPrice: "1000" },
      ]);
      expect(r).toMatchObject({ ok: false, fieldErrors: { "lines.0.service": expect.stringMatching(/select the service again/i) } });
    }
  });
});

describe("§8.1 oracle — billed and contracted stay distinct", () => {
  it("a billed price above the contracted rate is preserved; the contracted rate is re-read from the row", async () => {
    const r = await ProviderServiceCatalogService.canonicalizeLines(context, [
      { selectedProviderTariffId: "t4-fbc", serviceCategory: "LABORATORY", quantity: 2, billedUnitPrice: "30,000" },
    ]);
    expect(r.ok && r.lines[0]).toMatchObject({ unitCost: "30000", billedAmount: "60000", tariffRate: "25000" });
    const engine = await ContractEngine.evaluateClaim({
      tenantId: "tenant-1", providerId: "prov-fh", providerBranchId: "br-main", clientId: "client-trial", dateOfService: DAY,
      lines: [{ id: "l1", description: "Full Blood Count", quantity: 2, unitCost: 30000, billedAmount: 60000 }],
    });
    expect(engine.lines[0]).toMatchObject({ contractedAmount: 50000, payableAmount: 50000, shortfallAmount: 10000 });
  });
});
