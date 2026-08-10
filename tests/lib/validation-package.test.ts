/**
 * WP-2.0 — canonical package/shared-limit/co-contribution-rule validation.
 *
 * These lock the invariant classes that persisted from bare
 * `Number(formData.get())` / `z.number().min(0)` doors: negative/NaN money,
 * `copay = 500%`, `minAge >= maxAge`, `sublimit > annualLimit`, a zero/negative
 * shared pool, the D1 min-category rule, and the type↔amount rule.
 */
import { describe, it, expect } from "vitest";
import {
  packageCreateSchema,
  packageBenefitInputSchema,
  packageCoreSchema,
} from "@/lib/validation/package";
import {
  sharedLimitSchema,
  sharedLimitMinBenefits,
  sharedLimitRuleText,
} from "@/lib/validation/shared-limit";
import { coContributionRuleSchema } from "@/lib/validation/co-contribution";

const baseBenefit = { category: "OUTPATIENT", annualSubLimit: 100_000 };

describe("packageBenefitInputSchema", () => {
  it("accepts a valid benefit with a positive per-visit limit", () => {
    const r = packageBenefitInputSchema.safeParse({ ...baseBenefit, perVisitLimit: 300_000 });
    expect(r.success).toBe(true);
  });

  it("accepts a null per-visit limit (no per-visit cap)", () => {
    const r = packageBenefitInputSchema.safeParse({ ...baseBenefit, perVisitLimit: null });
    expect(r.success).toBe(true);
  });

  it.each([
    ["negative sub-limit", { annualSubLimit: -1 }],
    ["NaN sub-limit", { annualSubLimit: Number.NaN }],
    ["fractional cents (>2dp)", { annualSubLimit: 100.005 }],
    ["copay above 100", { copayPercentage: 500 }],
    ["negative copay", { copayPercentage: -5 }],
    ["zero per-visit limit", { perVisitLimit: 0 }],
    ["negative per-visit limit", { perVisitLimit: -1 }],
  ])("rejects %s", (_label, patch) => {
    const r = packageBenefitInputSchema.safeParse({ ...baseBenefit, ...patch });
    expect(r.success).toBe(false);
  });
});

describe("packageCreateSchema", () => {
  const valid = {
    name: "Gold",
    type: "GROUP",
    annualLimit: 500_000,
    contributionAmount: 25_000,
    minAge: 0,
    maxAge: 65,
    benefits: [{ category: "INPATIENT", annualSubLimit: 500_000 }],
  };

  it("accepts a valid package", () => {
    expect(packageCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("allows a zero contribution (fully subsidised) but not a zero annual limit", () => {
    expect(packageCreateSchema.safeParse({ ...valid, contributionAmount: 0 }).success).toBe(true);
    expect(packageCreateSchema.safeParse({ ...valid, annualLimit: 0 }).success).toBe(false);
  });

  it("rejects minAge >= maxAge with the error keyed to minAge", () => {
    const r = packageCreateSchema.safeParse({ ...valid, minAge: 70, maxAge: 65 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "minAge")).toBe(true);
  });

  it("rejects a benefit sub-limit above the package annual limit", () => {
    const r = packageCreateSchema.safeParse({
      ...valid,
      annualLimit: 500_000,
      benefits: [{ category: "OUTPATIENT", annualSubLimit: 600_000 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "benefits" && i.path[2] === "annualSubLimit")).toBe(true);
    }
  });

  it("requires at least one benefit", () => {
    expect(packageCreateSchema.safeParse({ ...valid, benefits: [] }).success).toBe(false);
  });

  it("coerces FormData-style string inputs (money/age)", () => {
    const r = packageCreateSchema.safeParse({
      ...valid,
      annualLimit: "500000",
      minAge: "0",
      maxAge: "65",
      benefits: [{ category: "INPATIENT", annualSubLimit: "500000" }],
    });
    expect(r.success).toBe(true);
  });
});

describe("packageCoreSchema", () => {
  it("rejects an out-of-range age", () => {
    const r = packageCoreSchema.safeParse({
      name: "P", type: "GROUP", status: "ACTIVE",
      annualLimit: 100_000, contributionAmount: 1_000,
      minAge: 0, maxAge: 200, dependentMaxAge: 24,
    });
    expect(r.success).toBe(false);
  });
});

describe("sharedLimitSchema (D1)", () => {
  it("sharedLimitMinBenefits: FAMILY→1, MEMBER→2", () => {
    expect(sharedLimitMinBenefits("FAMILY")).toBe(1);
    expect(sharedLimitMinBenefits("MEMBER")).toBe(2);
  });

  it("rule text differs by scope", () => {
    expect(sharedLimitRuleText("FAMILY")).not.toBe(sharedLimitRuleText("MEMBER"));
  });

  it("accepts a single-category FAMILY pool (the CT-015 maternity pool)", () => {
    const r = sharedLimitSchema.safeParse({
      name: "Maternity family pool",
      limitAmount: 3_000_000,
      appliesTo: "FAMILY",
      benefitConfigIds: ["bc-maternity"],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a single-benefit MEMBER (combined) pool — needs two", () => {
    const r = sharedLimitSchema.safeParse({
      name: "Combined", limitAmount: 100_000, appliesTo: "MEMBER", benefitConfigIds: ["bc1"],
    });
    expect(r.success).toBe(false);
  });

  it("accepts a two-benefit MEMBER pool", () => {
    const r = sharedLimitSchema.safeParse({
      name: "Combined", limitAmount: 100_000, appliesTo: "MEMBER", benefitConfigIds: ["bc1", "bc2"],
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["zero amount", 0],
    ["negative amount", -1],
  ])("rejects a %s pool (P-011)", (_l, amt) => {
    const r = sharedLimitSchema.safeParse({
      name: "X", limitAmount: amt, appliesTo: "FAMILY", benefitConfigIds: ["bc1"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects duplicate benefit membership (P-011)", () => {
    const r = sharedLimitSchema.safeParse({
      name: "X", limitAmount: 100_000, appliesTo: "MEMBER", benefitConfigIds: ["bc1", "bc1"],
    });
    expect(r.success).toBe(false);
  });

  it("rejects a blank name", () => {
    const r = sharedLimitSchema.safeParse({
      name: "   ", limitAmount: 100_000, appliesTo: "FAMILY", benefitConfigIds: ["bc1"],
    });
    expect(r.success).toBe(false);
  });
});

describe("coContributionRuleSchema", () => {
  it("rejects percentage above 100 (the unclamped-copay class)", () => {
    const r = coContributionRuleSchema.safeParse({
      networkTier: "TIER_1", type: "PERCENTAGE", percentage: 500,
    });
    expect(r.success).toBe(false);
  });

  it("rejects a negative fixed amount", () => {
    const r = coContributionRuleSchema.safeParse({
      networkTier: "TIER_1", type: "FIXED_AMOUNT", fixedAmount: -100,
    });
    expect(r.success).toBe(false);
  });

  it("requires a fixed amount for a FIXED_AMOUNT rule", () => {
    const r = coContributionRuleSchema.safeParse({ networkTier: "TIER_1", type: "FIXED_AMOUNT" });
    expect(r.success).toBe(false);
  });

  it("requires a percentage for a PERCENTAGE rule", () => {
    const r = coContributionRuleSchema.safeParse({ networkTier: "TIER_1", type: "PERCENTAGE" });
    expect(r.success).toBe(false);
  });

  it("accepts a NONE rule with no amounts", () => {
    const r = coContributionRuleSchema.safeParse({ networkTier: "TIER_2", type: "NONE" });
    expect(r.success).toBe(true);
  });

  it("accepts a valid percentage rule (20%)", () => {
    const r = coContributionRuleSchema.safeParse({
      networkTier: "TIER_1", type: "PERCENTAGE", percentage: 20,
    });
    expect(r.success).toBe(true);
  });
});
