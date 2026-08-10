import { describe, it, expect } from "vitest";
import {
  evaluateExclusions,
  memberSafeExclusionView,
  type ExclusionRuleView,
} from "@/server/services/eligibility/rules/exclusion";

/**
 * WP-2.3 (DEF-023) — pure treatment-exclusion evaluator.
 * CT-023 (cosmetic excluded unless reconstructive after covered trauma) +
 * CT-024 (experimental excluded). These are the SAME functions the preauth gate,
 * SP-6, and the claims path consume.
 */

// A cosmetic exclusion scoped to two cosmetic procedure codes, with the CT-023
// exception (reconstructive after a covered trauma).
const cosmeticRule: ExclusionRuleView = {
  id: "ex-cosmetic",
  ruleCategory: "COSMETIC",
  exclusionType: "CONDITIONAL",
  benefitCategories: [],
  serviceCodes: [],
  diagnosisCodes: [],
  procedureCodes: ["15788", "15792"],
  exceptionLogic: {
    type: "RECONSTRUCTIVE_AFTER_TRAUMA",
    triggerDiagnosisCodes: ["S02.1"],
    requiresPriorCoveredTrauma: true,
  },
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  memberSafeExplanation: "Cosmetic procedures are not covered unless reconstructive following a covered injury.",
  isActive: true,
};

const experimentalRule: ExclusionRuleView = {
  id: "ex-experimental",
  ruleCategory: "EXPERIMENTAL",
  exclusionType: "ABSOLUTE",
  benefitCategories: [],
  serviceCodes: [],
  diagnosisCodes: [],
  procedureCodes: ["0XYZ9"],
  exceptionLogic: null,
  effectiveFrom: new Date("2026-01-01"),
  effectiveTo: null,
  memberSafeExplanation: "Experimental treatments are not covered.",
  isActive: true,
};

const SD = new Date("2026-06-15");

describe("evaluateExclusions — CT-023 cosmetic", () => {
  it("ELIGIBLE: a non-cosmetic procedure does not match the rule", () => {
    const res = evaluateExclusions([cosmeticRule], { serviceDate: SD, procedureCodes: ["99213"] });
    expect(res.excluded).toBe(false);
    expect(res.reasonCode).toBeNull();
  });

  it("EXCLUDED: a cosmetic procedure with no exception evidence → TREATMENT_EXCLUDED", () => {
    const res = evaluateExclusions([cosmeticRule], { serviceDate: SD, procedureCodes: ["15788"] });
    expect(res.excluded).toBe(true);
    expect(res.reasonCode).toBe("TREATMENT_EXCLUDED");
    expect(res.memberSafeExplanation).toContain("Cosmetic");
    expect(res.matchedRuleId).toBe("ex-cosmetic");
  });

  it("EXCEPTION: reconstructive after a covered trauma → not excluded", () => {
    const res = evaluateExclusions([cosmeticRule], {
      serviceDate: SD,
      procedureCodes: ["15788"],
      diagnosisCodes: ["S02.1"], // trauma diagnosis marks reconstructive intent
      priorCoveredTrauma: true,
    });
    expect(res.excluded).toBe(false);
  });

  it("EXCEPTION denied: reconstructive intent but NO prior covered trauma → still excluded", () => {
    const res = evaluateExclusions([cosmeticRule], {
      serviceDate: SD,
      procedureCodes: ["15788"],
      diagnosisCodes: ["S02.1"],
      priorCoveredTrauma: false,
    });
    expect(res.excluded).toBe(true);
    expect(res.reasonCode).toBe("TREATMENT_EXCLUDED");
  });

  it("BOUNDARY: a service date before effectiveFrom is not excluded", () => {
    const res = evaluateExclusions([cosmeticRule], {
      serviceDate: new Date("2025-12-31"),
      procedureCodes: ["15788"],
    });
    expect(res.excluded).toBe(false);
  });

  it("BOUNDARY: a service date after effectiveTo is not excluded", () => {
    const ended: ExclusionRuleView = { ...cosmeticRule, effectiveTo: new Date("2026-03-31") };
    const res = evaluateExclusions([ended], { serviceDate: new Date("2026-04-01"), procedureCodes: ["15788"] });
    expect(res.excluded).toBe(false);
  });

  it("inactive rules are ignored", () => {
    const res = evaluateExclusions([{ ...cosmeticRule, isActive: false }], {
      serviceDate: SD,
      procedureCodes: ["15788"],
    });
    expect(res.excluded).toBe(false);
  });
});

describe("evaluateExclusions — CT-024 experimental", () => {
  it("EXCLUDED: an experimental procedure → EXPERIMENTAL_EXCLUDED (distinct code)", () => {
    const res = evaluateExclusions([experimentalRule], { serviceDate: SD, procedureCodes: ["0XYZ9"] });
    expect(res.excluded).toBe(true);
    expect(res.reasonCode).toBe("EXPERIMENTAL_EXCLUDED");
  });

  it("case/whitespace-insensitive code matching", () => {
    const res = evaluateExclusions([experimentalRule], { serviceDate: SD, procedureCodes: [" 0xyz9 "] });
    expect(res.excluded).toBe(true);
  });
});

describe("evaluateExclusions — benefit-category scope + AND across dimensions", () => {
  const surgicalCosmetic: ExclusionRuleView = {
    ...cosmeticRule,
    id: "ex-and",
    exclusionType: "ABSOLUTE",
    exceptionLogic: null,
    benefitCategories: ["SURGICAL"],
    procedureCodes: ["15788"],
  };

  it("matches only when BOTH the category and the procedure match", () => {
    // category matches but procedure does not → no match
    expect(
      evaluateExclusions([surgicalCosmetic], { serviceDate: SD, benefitCategory: "SURGICAL", procedureCodes: ["99213"] }).excluded,
    ).toBe(false);
    // both match → excluded
    expect(
      evaluateExclusions([surgicalCosmetic], { serviceDate: SD, benefitCategory: "SURGICAL", procedureCodes: ["15788"] }).excluded,
    ).toBe(true);
  });
});

describe("memberSafeExclusionView — safe surface (WP-2.3 §6)", () => {
  it("exposes ONLY member-safe fields, never internalNote / sourceClause", () => {
    const view = memberSafeExclusionView({
      ...cosmeticRule,
      // simulate a row that carries internal fields
      ...({ internalNote: "SECRET underwriting note", sourceClause: "Policy §7.3(b)" } as object),
    } as ExclusionRuleView);
    expect(view.memberSafeExplanation).toContain("Cosmetic");
    expect(JSON.stringify(view)).not.toContain("SECRET");
    expect(JSON.stringify(view)).not.toContain("Policy §7.3");
    expect(view).not.toHaveProperty("internalNote");
    expect(view).not.toHaveProperty("sourceClause");
  });
});
