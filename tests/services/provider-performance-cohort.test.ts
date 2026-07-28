/**
 * F8.4 — cohort math (pure). Percentile/median/range worked examples + the
 * anonymity threshold + the peer-set key (no provider identity).
 */
import { describe, it, expect } from "vitest";
import { buildCohortKey, cohortDistribution, cohortMeetsAnonymity, percentileNearestRank, MIN_COHORT_PROVIDERS } from "@/server/services/provider-performance/cohort";

describe("F8.4 percentileNearestRank", () => {
  it("nearest-rank over 5 values", () => {
    const v = [0.9, 0.5, 0.7, 0.6, 0.8]; // unsorted
    expect(percentileNearestRank(v, 50)).toBe(0.7);
    expect(percentileNearestRank(v, 25)).toBe(0.6);
    expect(percentileNearestRank(v, 75)).toBe(0.8);
    expect(percentileNearestRank(v, 90)).toBe(0.9);
  });
  it("empty ⇒ NaN", () => {
    expect(Number.isNaN(percentileNearestRank([], 50))).toBe(true);
  });
});

describe("F8.4 cohortDistribution", () => {
  it("min/p25/median/p75/p90/max for a worked example", () => {
    const d = cohortDistribution([0.5, 0.6, 0.7, 0.8, 0.9]);
    expect(d).toEqual({ min: 0.5, p25: 0.6, median: 0.7, p75: 0.8, p90: 0.9, max: 0.9 });
  });
});

describe("F8.4 cohort key + anonymity", () => {
  it("the cohort key carries no provider identity (tenant|type|tier)", () => {
    expect(buildCohortKey("t1", "HOSPITAL", "PARTNER")).toBe("t1|HOSPITAL|PARTNER");
    expect(buildCohortKey("t1", null, null)).toBe("t1|UNKNOWN|UNKNOWN");
  });
  it("anonymity requires at least the minimum providers", () => {
    expect(cohortMeetsAnonymity(MIN_COHORT_PROVIDERS)).toBe(true);
    expect(cohortMeetsAnonymity(MIN_COHORT_PROVIDERS - 1)).toBe(false);
  });
});
