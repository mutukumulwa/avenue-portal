import { describe, it, expect } from "vitest";
import { computeCostShare } from "@/server/services/cost-share.service";

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
