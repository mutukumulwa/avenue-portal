/**
 * F8.2 — provider performance score projection + visibility (pure).
 *
 * Pins the single provider-visibility predicate (published + complete + sampled +
 * not suppressed) and the provider-safe projection (own numbers only; never the
 * cohort key, control totals, or source watermark).
 */
import { describe, it, expect } from "vitest";
import { isProviderVisibleScore, isBranchInScope, projectScoreForProvider, MIN_COMPLETENESS_VISIBLE, type PerformanceScoreRow } from "@/server/services/provider-performance/projection";

function row(over: Partial<PerformanceScoreRow> = {}): PerformanceScoreRow {
  return {
    status: "PUBLISHED", completeness: 1, sampleSize: 40, meetsMinimumSample: true, suppressedForAnonymity: false,
    metricKey: "A2_clean_claim_rate", definitionVersion: "PNMC-1.0", period: "2026-07",
    periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31"), value: 0.92, unit: "RATE",
    numerator: 92, denominator: 100, providerBranchId: "",
    ...over,
  };
}

describe("F8.2 isProviderVisibleScore", () => {
  it("a published, complete, sampled, unsuppressed score is visible", () => {
    expect(isProviderVisibleScore(row())).toBe(true);
  });
  it("DRAFT / FROZEN are not visible", () => {
    expect(isProviderVisibleScore(row({ status: "DRAFT" }))).toBe(false);
    expect(isProviderVisibleScore(row({ status: "FROZEN" }))).toBe(false);
  });
  it("incomplete (below the floor) is not visible", () => {
    expect(isProviderVisibleScore(row({ completeness: MIN_COMPLETENESS_VISIBLE - 0.01 }))).toBe(false);
    expect(isProviderVisibleScore(row({ completeness: 0 }))).toBe(false);
  });
  it("below minimum sample is not visible", () => {
    expect(isProviderVisibleScore(row({ meetsMinimumSample: false }))).toBe(false);
  });
  it("anonymity-suppressed is not visible", () => {
    expect(isProviderVisibleScore(row({ suppressedForAnonymity: true }))).toBe(false);
  });
});

describe("F8.2 projectScoreForProvider", () => {
  it("carries the own numbers (num/den/sample/completeness/version) and a data-quality warning flag", () => {
    const v = projectScoreForProvider(row({ completeness: 0.8 }));
    expect(v.metricKey).toBe("A2_clean_claim_rate");
    expect(v.definitionVersion).toBe("PNMC-1.0");
    expect(v.numerator).toBe("92");
    expect(v.denominator).toBe("100");
    expect(v.sampleSize).toBe(40);
    expect(v.dataQualityWarning).toBe(true); // completeness < 1
    expect(projectScoreForProvider(row({ completeness: 1 })).dataQualityWarning).toBe(false);
    expect(v.scope).toBe("PROVIDER");
  });
  it("NEVER exposes the cohort key, control totals, or source watermark", () => {
    const r = { ...row({ providerBranchId: "br-1" }), cohortKey: "t|HOSPITAL|PARTNER", controlTotals: { secret: 1 }, sourceWatermark: "wm-secret-abc" } as unknown as PerformanceScoreRow;
    const v = projectScoreForProvider(r);
    const flat = JSON.stringify(v);
    for (const s of ["cohortKey", "controlTotals", "sourceWatermark", "wm-secret", "HOSPITAL|PARTNER"]) {
      expect(flat).not.toContain(s);
    }
    expect(v.scope).toBe("BRANCH");
    expect(v.branchId).toBe("br-1");
  });
});

describe("F8.2 isBranchInScope", () => {
  it("provider-level ('') is always own; a branch is in scope only when authorized", () => {
    expect(isBranchInScope([], "")).toBe(true);
    expect(isBranchInScope(["br-1"], "br-1")).toBe(true);
    expect(isBranchInScope(["br-1"], "br-2")).toBe(false);
  });
});
