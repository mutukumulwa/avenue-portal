import { describe, it, expect } from "vitest";
import {
  treatmentExclusionSchema,
  resolveExclusionOwner,
  detectExclusionOverlap,
  type ExclusionOverlapView,
} from "@/lib/validation/exclusion";
import {
  referralRuleSchema,
  detectReferralOverlap,
  type ReferralOverlapView,
} from "@/lib/validation/referral";

/** WP-2.3 / WP-2.4 — SP-1 canonical validation (both doors route through these). */

const baseExclusion = {
  ruleCategory: "COSMETIC",
  exclusionType: "ABSOLUTE",
  benefitCategories: ["SURGICAL"],
  serviceCodes: [],
  diagnosisCodes: [],
  procedureCodes: ["15788"],
  exceptionLogic: null,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  sourceClause: null,
  internalNote: null,
  memberSafeExplanation: "Cosmetic surgery is not covered.",
};

describe("treatmentExclusionSchema", () => {
  it("accepts a valid absolute exclusion", () => {
    expect(treatmentExclusionSchema.safeParse(baseExclusion).success).toBe(true);
  });

  it("rejects effectiveTo on/before effectiveFrom", () => {
    const r = treatmentExclusionSchema.safeParse({ ...baseExclusion, effectiveTo: "2026-01-01" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.effectiveTo?.length).toBeGreaterThan(0);
  });

  it("rejects a rule with no scope dimension", () => {
    const r = treatmentExclusionSchema.safeParse({
      ...baseExclusion,
      benefitCategories: [],
      procedureCodes: [],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.benefitCategories?.length).toBeGreaterThan(0);
  });

  it("rejects a CONDITIONAL rule with no exception", () => {
    const r = treatmentExclusionSchema.safeParse({ ...baseExclusion, exclusionType: "CONDITIONAL", exceptionLogic: null });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.exceptionLogic?.length).toBeGreaterThan(0);
  });

  it("rejects an ABSOLUTE rule that carries an exception", () => {
    const r = treatmentExclusionSchema.safeParse({
      ...baseExclusion,
      exclusionType: "ABSOLUTE",
      exceptionLogic: { type: "RECONSTRUCTIVE_AFTER_TRAUMA", requiresPriorCoveredTrauma: true },
    });
    expect(r.success).toBe(false);
  });

  it("accepts a CONDITIONAL rule with a reconstructive exception + normalizes codes", () => {
    const r = treatmentExclusionSchema.safeParse({
      ...baseExclusion,
      exclusionType: "CONDITIONAL",
      procedureCodes: [" 15788 "],
      exceptionLogic: { type: "RECONSTRUCTIVE_AFTER_TRAUMA", requiresPriorCoveredTrauma: true },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.procedureCodes).toEqual(["15788"]); // trimmed + upper-cased
  });
});

describe("resolveExclusionOwner — N-012 XOR", () => {
  it("accepts exactly a package version", () => {
    const r = resolveExclusionOwner({ packageVersionId: "pv1", providerContractId: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.owner).toEqual({ packageVersionId: "pv1" });
  });

  it("accepts exactly a provider contract", () => {
    const r = resolveExclusionOwner({ packageVersionId: null, providerContractId: "pc1" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.owner).toEqual({ providerContractId: "pc1" });
  });

  it("rejects zero owners", () => {
    expect(resolveExclusionOwner({}).ok).toBe(false);
  });

  it("rejects both owners", () => {
    expect(resolveExclusionOwner({ packageVersionId: "pv1", providerContractId: "pc1" }).ok).toBe(false);
  });
});

describe("detectExclusionOverlap", () => {
  const existing: ExclusionOverlapView[] = [
    {
      id: "e1",
      ruleCategory: "COSMETIC",
      benefitCategories: ["SURGICAL"],
      serviceCodes: [],
      diagnosisCodes: [],
      procedureCodes: ["15788"],
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
      isActive: true,
    },
  ];

  it("flags a same-category, overlapping-scope, overlapping-window rule", () => {
    const conflict = detectExclusionOverlap(existing, {
      ruleCategory: "COSMETIC",
      benefitCategories: ["SURGICAL"],
      serviceCodes: [],
      diagnosisCodes: [],
      procedureCodes: ["15788"],
      effectiveFrom: new Date("2026-06-01"),
      effectiveTo: null,
    });
    expect(conflict?.id).toBe("e1");
  });

  it("does NOT flag a different category", () => {
    const conflict = detectExclusionOverlap(existing, {
      ruleCategory: "EXPERIMENTAL",
      benefitCategories: ["SURGICAL"],
      serviceCodes: [],
      diagnosisCodes: [],
      procedureCodes: ["15788"],
      effectiveFrom: new Date("2026-06-01"),
      effectiveTo: null,
    });
    expect(conflict).toBeNull();
  });

  it("does NOT flag a non-overlapping window", () => {
    const conflict = detectExclusionOverlap(existing.map((e) => ({ ...e, effectiveTo: new Date("2026-03-31") })), {
      ruleCategory: "COSMETIC",
      benefitCategories: ["SURGICAL"],
      serviceCodes: [],
      diagnosisCodes: [],
      procedureCodes: ["15788"],
      effectiveFrom: new Date("2026-04-01"),
      effectiveTo: null,
    });
    expect(conflict).toBeNull();
  });

  it("ignores itself (same id) on edit", () => {
    const conflict = detectExclusionOverlap(existing, { ...existing[0], id: "e1" });
    expect(conflict).toBeNull();
  });
});

// ── Referral ────────────────────────────────────────────────────────────────

const baseReferral = {
  benefitCategories: ["OUTPATIENT"],
  serviceCodes: [],
  providerSpecialties: ["Cardiology"],
  requiresReferral: true,
  emergencyException: true,
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  sourceClause: null,
  memberSafeExplanation: "Specialist visits require a referral.",
};

describe("referralRuleSchema", () => {
  it("accepts a valid referral rule", () => {
    expect(referralRuleSchema.safeParse(baseReferral).success).toBe(true);
  });

  it("rejects a rule with no scope dimension", () => {
    const r = referralRuleSchema.safeParse({ ...baseReferral, benefitCategories: [], providerSpecialties: [] });
    expect(r.success).toBe(false);
  });

  it("rejects effectiveTo on/before effectiveFrom", () => {
    const r = referralRuleSchema.safeParse({ ...baseReferral, effectiveTo: "2025-12-31" });
    expect(r.success).toBe(false);
  });
});

describe("detectReferralOverlap", () => {
  const existing: ReferralOverlapView[] = [
    {
      id: "r1",
      benefitCategories: ["OUTPATIENT"],
      serviceCodes: [],
      providerSpecialties: ["Cardiology"],
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
      isActive: true,
    },
  ];

  it("flags an overlapping-scope, overlapping-window rule", () => {
    const conflict = detectReferralOverlap(existing, {
      benefitCategories: [],
      serviceCodes: [],
      providerSpecialties: ["cardiology"], // case-insensitive
      effectiveFrom: new Date("2026-06-01"),
      effectiveTo: null,
    });
    expect(conflict?.id).toBe("r1");
  });

  it("does NOT flag a disjoint scope", () => {
    const conflict = detectReferralOverlap(existing, {
      benefitCategories: ["DENTAL"],
      serviceCodes: [],
      providerSpecialties: ["Oncology"],
      effectiveFrom: new Date("2026-06-01"),
      effectiveTo: null,
    });
    expect(conflict).toBeNull();
  });
});
