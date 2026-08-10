import { describe, it, expect } from "vitest";
import {
  evaluateReferral,
  memberSafeReferralView,
  type ReferralRuleView,
} from "@/server/services/eligibility/rules/referral";

/**
 * WP-2.4 (DEF-024) — pure referral evaluator.
 * CT-025 (specialist-outpatient referral required except emergency) /
 * EO-021 (missing referral → MISSING_REFERRAL) /
 * EO-022 (emergency → EMERGENCY_REFERRAL_EXCEPTION).
 */

const specialistRule: ReferralRuleView = {
  id: "ref-1",
  benefitCategories: ["OUTPATIENT"],
  serviceCodes: [],
  providerSpecialties: ["Cardiology"],
  requiresReferral: true,
  emergencyException: true,
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  memberSafeExplanation: "Specialist outpatient visits require a referral except in an emergency.",
  isActive: true,
};

const SD = new Date("2026-06-15");
const inScope = { serviceDate: SD, benefitCategory: "OUTPATIENT", providerSpecialty: "Cardiology" };

describe("evaluateReferral — CT-025", () => {
  it("EO-021 referral required + none on file → blocked MISSING_REFERRAL", () => {
    const res = evaluateReferral([specialistRule], { ...inScope, hasReferral: false, isEmergency: false });
    expect(res.blocked).toBe(true);
    expect(res.reasonCode).toBe("MISSING_REFERRAL");
    expect(res.emergencyExceptionApplied).toBe(false);
    expect(res.matchedRuleId).toBe("ref-1");
  });

  it("a valid referral on file passes", () => {
    const res = evaluateReferral([specialistRule], { ...inScope, hasReferral: true });
    expect(res.blocked).toBe(false);
    expect(res.reasonCode).toBeNull();
  });

  it("EO-022 emergency lifts the requirement → EMERGENCY_REFERRAL_EXCEPTION, not blocked", () => {
    const res = evaluateReferral([specialistRule], { ...inScope, hasReferral: false, isEmergency: true });
    expect(res.blocked).toBe(false);
    expect(res.reasonCode).toBe("EMERGENCY_REFERRAL_EXCEPTION");
    expect(res.emergencyExceptionApplied).toBe(true);
  });

  it("emergency does NOT lift the requirement when the rule disables the exception", () => {
    const noException: ReferralRuleView = { ...specialistRule, emergencyException: false };
    const res = evaluateReferral([noException], { ...inScope, hasReferral: false, isEmergency: true });
    expect(res.blocked).toBe(true);
    expect(res.reasonCode).toBe("MISSING_REFERRAL");
  });

  it("BOUNDARY: a service date before effectiveFrom is not blocked", () => {
    const res = evaluateReferral([specialistRule], {
      serviceDate: new Date("2025-12-31"),
      benefitCategory: "OUTPATIENT",
      providerSpecialty: "Cardiology",
      hasReferral: false,
    });
    expect(res.blocked).toBe(false);
  });

  it("BOUNDARY: a service date after effectiveTo is not blocked", () => {
    const ended: ReferralRuleView = { ...specialistRule, effectiveTo: new Date("2026-03-31") };
    const res = evaluateReferral([ended], {
      serviceDate: new Date("2026-04-01"),
      benefitCategory: "OUTPATIENT",
      providerSpecialty: "Cardiology",
      hasReferral: false,
    });
    expect(res.blocked).toBe(false);
  });

  it("a rule out of scope (different specialty) does not apply", () => {
    const res = evaluateReferral([specialistRule], {
      serviceDate: SD,
      benefitCategory: "OUTPATIENT",
      providerSpecialty: "Dermatology",
      hasReferral: false,
    });
    expect(res.blocked).toBe(false);
  });

  it("a rule with requiresReferral=false never blocks", () => {
    const off: ReferralRuleView = { ...specialistRule, requiresReferral: false };
    const res = evaluateReferral([off], { ...inScope, hasReferral: false });
    expect(res.blocked).toBe(false);
  });

  it("inactive rules are ignored", () => {
    const res = evaluateReferral([{ ...specialistRule, isActive: false }], { ...inScope, hasReferral: false });
    expect(res.blocked).toBe(false);
  });
});

describe("memberSafeReferralView — safe surface", () => {
  it("exposes only member-safe fields, never sourceClause", () => {
    const view = memberSafeReferralView({
      ...specialistRule,
      ...({ sourceClause: "Policy §9.1" } as object),
    } as ReferralRuleView);
    expect(view.memberSafeExplanation).toContain("referral");
    expect(JSON.stringify(view)).not.toContain("Policy §9.1");
    expect(view).not.toHaveProperty("sourceClause");
  });
});
