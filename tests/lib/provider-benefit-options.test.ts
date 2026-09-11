/**
 * Family Hospital UAT plan P03.05 / FH-12 — one provider benefit list, derived
 * from the enum: inpatient and surgical present, CUSTOM hidden (DEC-FH-02),
 * nothing else missing. (That every provider form reads this list is guarded
 * in tests/consistency/provider-capture-forms.test.ts, with P04.)
 */
import { describe, it, expect } from "vitest";
import { BenefitCategory } from "@prisma/client";
import { ALL_BENEFIT_CATEGORIES, PROVIDER_BENEFIT_OPTIONS, isProviderBenefit, benefitLabel } from "@/lib/provider-benefit-options";

describe("PROVIDER_BENEFIT_OPTIONS", () => {
  it("offers every BenefitCategory except CUSTOM, each exactly once", () => {
    const expected = Object.values(BenefitCategory).filter((b) => b !== "CUSTOM").sort();
    expect(PROVIDER_BENEFIT_OPTIONS.map((o) => o.value).sort()).toEqual(expected);
    expect(new Set(ALL_BENEFIT_CATEGORIES).size).toBe(Object.values(BenefitCategory).length);
  });

  it("includes the inpatient and surgical benefits the trial needs", () => {
    expect(isProviderBenefit("INPATIENT")).toBe(true);
    expect(isProviderBenefit("SURGICAL")).toBe(true);
    expect(isProviderBenefit("CUSTOM")).toBe(false);
    expect(isProviderBenefit("NOT_A_BENEFIT")).toBe(false);
  });

  it("uses business labels", () => {
    expect(benefitLabel("AMBULANCE_EMERGENCY")).toBe("Emergency/Ambulance");
    expect(PROVIDER_BENEFIT_OPTIONS[0]).toEqual({ value: "OUTPATIENT", label: "Outpatient" });
  });
});
