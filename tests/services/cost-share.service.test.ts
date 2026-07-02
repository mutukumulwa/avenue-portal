import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeCostShare, CostShareResolver, benefitPeriodFor } from "@/server/services/cost-share.service";

describe("computeCostShare — co-insurance & deductibles (G9.1)", () => {
  it("no cost-share configured → plan pays all", () => {
    const r = computeCostShare({ serviceCost: 100000, coInsurancePct: 0, deductibleAmount: 0, deductibleMetToDate: 0 });
    expect(r.memberPays).toBe(0);
    expect(r.planPays).toBe(100000);
  });

  it("deductible fully unmet + co-insurance: member pays deductible then % of the rest", () => {
    // deductible 50k unmet; cost 100k → 50k deductible + 20% of 50k = 10k → member 60k
    const r = computeCostShare({ serviceCost: 100000, coInsurancePct: 20, deductibleAmount: 50000, deductibleMetToDate: 0 });
    expect(r.deductibleApplied).toBe(50000);
    expect(r.coInsuranceApplied).toBe(10000);
    expect(r.memberPays).toBe(60000);
    expect(r.planPays).toBe(40000);
    expect(r.newDeductibleMet).toBe(50000);
  });

  it("deductible already met → only co-insurance applies", () => {
    // deductible 50k fully met; cost 100k → 20% co-insurance = 20k
    const r = computeCostShare({ serviceCost: 100000, coInsurancePct: 20, deductibleAmount: 50000, deductibleMetToDate: 50000 });
    expect(r.deductibleApplied).toBe(0);
    expect(r.coInsuranceApplied).toBe(20000);
    expect(r.memberPays).toBe(20000);
  });

  it("deductible partially met → applies only the remaining deductible", () => {
    // 30k of 50k met → 20k remaining; cost 100k → 20k deductible + 20% of 80k (16k) = 36k
    const r = computeCostShare({ serviceCost: 100000, coInsurancePct: 20, deductibleAmount: 50000, deductibleMetToDate: 30000 });
    expect(r.deductibleApplied).toBe(20000);
    expect(r.coInsuranceApplied).toBe(16000);
    expect(r.memberPays).toBe(36000);
    expect(r.newDeductibleMet).toBe(50000);
  });

  it("cost below the remaining deductible → member pays all, no co-insurance", () => {
    const r = computeCostShare({ serviceCost: 10000, coInsurancePct: 20, deductibleAmount: 50000, deductibleMetToDate: 0 });
    expect(r.deductibleApplied).toBe(10000);
    expect(r.coInsuranceApplied).toBe(0);
    expect(r.memberPays).toBe(10000);
    expect(r.planPays).toBe(0);
  });
});

describe("CostShareResolver.applyForClaim — adjudication wire-in (G9.1)", () => {
  const db = {
    member: { findUnique: vi.fn() },
    benefitConfig: { findFirst: vi.fn() },
    benefitUsage: { findUnique: vi.fn(), upsert: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.member.findUnique.mockResolvedValue({ packageVersionId: "pv1", enrollmentDate: new Date("2025-03-15") });
    db.benefitConfig.findFirst.mockResolvedValue({ id: "bc1", coInsurancePct: 20, deductibleAmount: 50000, copayPercentage: 10 });
    db.benefitUsage.findUnique.mockResolvedValue(null);
    db.benefitUsage.upsert.mockResolvedValue({});
  });

  it("computes the split from BenefitConfig and persists deductibleMet", async () => {
    const r = await CostShareResolver.applyForClaim(db as never, "m1", "OUTPATIENT", 100000);
    expect(r.deductibleApplied).toBe(50000);
    expect(r.coInsuranceApplied).toBe(10000);
    expect(r.memberPays).toBe(60000);
    expect(r.planPays).toBe(40000);
    expect(r.copayPercentage).toBe(10);
    expect(db.benefitUsage.upsert).toHaveBeenCalledTimes(1);
  });

  it("uses the running deductibleMet from BenefitUsage", async () => {
    db.benefitUsage.findUnique.mockResolvedValue({ deductibleMet: 50000 });
    const r = await CostShareResolver.applyForClaim(db as never, "m1", "OUTPATIENT", 100000);
    expect(r.deductibleApplied).toBe(0);
    expect(r.coInsuranceApplied).toBe(20000);
    expect(db.benefitUsage.upsert).not.toHaveBeenCalled(); // nothing to add to the deductible
  });

  it("no cost-share configured → plan pays all (copay % still surfaced)", async () => {
    db.benefitConfig.findFirst.mockResolvedValue({ id: "bc1", coInsurancePct: 0, deductibleAmount: 0, copayPercentage: 10 });
    const r = await CostShareResolver.applyForClaim(db as never, "m1", "OUTPATIENT", 100000);
    expect(r.memberPays).toBe(0);
    expect(r.planPays).toBe(100000);
    expect(r.copayPercentage).toBe(10);
  });

  it("no benefit config / no package → zero cost-share, plan pays all", async () => {
    db.benefitConfig.findFirst.mockResolvedValue(null);
    const r = await CostShareResolver.applyForClaim(db as never, "m1", "OUTPATIENT", 100000);
    expect(r.memberPays).toBe(0);
    expect(r.planPays).toBe(100000);
    db.member.findUnique.mockResolvedValue({ packageVersionId: null, enrollmentDate: new Date() });
    const r2 = await CostShareResolver.applyForClaim(db as never, "m1", "OUTPATIENT", 100000);
    expect(r2.planPays).toBe(100000);
  });
});

describe("benefitPeriodFor — enrollment-anniversary period", () => {
  it("anchors the period to the most recent anniversary", () => {
    const { periodStart, periodEnd } = benefitPeriodFor(new Date("2023-03-15"), new Date("2026-06-01"));
    expect(periodStart.getFullYear()).toBe(2026);
    expect(periodStart.getMonth()).toBe(2); // March
    expect(periodEnd.getFullYear()).toBe(2027);
  });

  it("rolls back a year when the anniversary is still ahead", () => {
    const { periodStart } = benefitPeriodFor(new Date("2023-09-15"), new Date("2026-06-01"));
    expect(periodStart.getFullYear()).toBe(2025);
    expect(periodStart.getMonth()).toBe(8); // September
  });
});
