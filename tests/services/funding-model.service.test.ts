import { describe, it, expect, beforeEach, vi } from "vitest";

const db = vi.hoisted(() => ({
  claim: { findUnique: vi.fn(), update: vi.fn(async (a: any) => a.data) },
  benefitConfig: { findFirst: vi.fn() },
  serviceCategory: { findMany: vi.fn(async (): Promise<any[]> => []) },
  claimLine: { updateMany: vi.fn(async () => ({ count: 1 })) },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { FundingModelService } from "@/server/services/funding-model.service";

// Taxonomy: LAB (tier LABORATORY) → LAB_BIOCHEM (child, inherits); PHARM (tier PHARMACY).
const categories = [
  { id: "lab", parentId: null, tier: "LABORATORY" },
  { id: "lab-bio", parentId: "lab", tier: null },
  { id: "pharm", parentId: null, tier: "PHARMACY" },
];

const claimRow = (over: any = {}) => ({
  benefitCategory: "OUTPATIENT",
  member: { packageVersionId: "pv1" },
  claimLines: [
    { id: "l1", serviceCategoryId: "lab-bio" }, // lab line (inherits LABORATORY)
    { id: "l2", serviceCategoryId: "pharm" },   // pharmacy line
  ],
  ...over,
});

describe("FundingModelService.resolveForClaim (WP-F2 / D8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.claim.findUnique.mockResolvedValue(claimRow());
    db.serviceCategory.findMany.mockResolvedValue(categories);
  });

  it("defaults to FFS when the benefit has no funding model set up", async () => {
    db.benefitConfig.findFirst.mockResolvedValue({ fundingModel: "FEE_FOR_SERVICE", fundingOverrides: null });
    const f = await FundingModelService.resolveForClaim("t1", "clm1");
    expect(f.model).toBe("FEE_FOR_SERVICE");
    expect(f.anyCapitated).toBe(false);
  });

  it("defaults to FFS when the member has no package version", async () => {
    db.claim.findUnique.mockResolvedValue(claimRow({ member: { packageVersionId: null } }));
    const f = await FundingModelService.resolveForClaim("t1", "clm1");
    expect(f.model).toBe("FEE_FOR_SERVICE");
  });

  it("CAPITATION benefit capitates every line", async () => {
    db.benefitConfig.findFirst.mockResolvedValue({ fundingModel: "CAPITATION", fundingOverrides: null });
    const f = await FundingModelService.resolveForClaim("t1", "clm1");
    expect(f.lines.every((l) => l.capitated)).toBe(true);
    expect(f.poolTag).toBe("BENEFIT_CAPITATION_POOL");
  });

  it("HYBRID capitates only the overridden tiers — lab pool, pharmacy FFS", async () => {
    db.benefitConfig.findFirst.mockResolvedValue({
      fundingModel: "HYBRID",
      fundingOverrides: [{ tier: "LABORATORY", model: "CAPITATION" }],
    });
    const f = await FundingModelService.resolveForClaim("t1", "clm1");
    const byId = new Map(f.lines.map((l) => [l.lineId, l]));
    expect(byId.get("l1")?.capitated).toBe(true); // inherits LABORATORY from parent
    expect(byId.get("l1")?.tier).toBe("LABORATORY");
    expect(byId.get("l2")?.capitated).toBe(false); // PHARMACY not overridden
    expect(f.anyCapitated).toBe(true);
  });

  it("HYBRID leaves unmapped lines (no category) on FFS", async () => {
    db.claim.findUnique.mockResolvedValue(
      claimRow({ claimLines: [{ id: "l3", serviceCategoryId: null }] }),
    );
    db.benefitConfig.findFirst.mockResolvedValue({
      fundingModel: "HYBRID",
      fundingOverrides: [{ tier: "LABORATORY", model: "CAPITATION" }],
    });
    const f = await FundingModelService.resolveForClaim("t1", "clm1");
    expect(f.lines[0].capitated).toBe(false);
  });
});

describe("FundingModelService.applyToDecidedClaim", () => {
  beforeEach(() => vi.clearAllMocks());

  it("zeroes capitated lines and tags the pool", async () => {
    await FundingModelService.applyToDecidedClaim("t1", "clm1", {
      model: "HYBRID",
      capitatedTiers: ["LABORATORY"],
      lines: [
        { lineId: "l1", tier: "LABORATORY", capitated: true },
        { lineId: "l2", tier: "PHARMACY", capitated: false },
      ],
      anyCapitated: true,
      poolTag: "BENEFIT_CAPITATION_POOL",
    });
    expect(db.claimLine.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["l1"] } }) }),
    );
    expect(db.claim.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { avgCostPoolId: "BENEFIT_CAPITATION_POOL" } }),
    );
  });

  it("is a no-op for pure FFS claims", async () => {
    await FundingModelService.applyToDecidedClaim("t1", "clm1", {
      model: "FEE_FOR_SERVICE", capitatedTiers: [], lines: [], anyCapitated: false, poolTag: null,
    });
    expect(db.claimLine.updateMany).not.toHaveBeenCalled();
    expect(db.claim.update).not.toHaveBeenCalled();
  });
});
