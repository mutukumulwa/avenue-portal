/**
 * PNOS F8.4 — cohort math (pure; no I/O).
 *
 * The anonymized peer set is keyed by tenant + provider type + tier (no provider
 * identity). A benchmark publishes ONLY the distribution (percentile/median/range)
 * and is written ONLY when the cohort has at least MIN_COHORT_PROVIDERS distinct
 * contributing providers — a smaller cohort is suppressed (§8.13 / F8.1 §4). No
 * named peer is ever derivable from the stats.
 */

/** Minimum distinct providers before a cohort benchmark may be published. */
export const MIN_COHORT_PROVIDERS = 5;

/** The anonymized peer-set key — carries no provider identity. */
export function buildCohortKey(tenantId: string, providerType: string | null | undefined, providerTier: string | null | undefined): string {
  return [tenantId, providerType ?? "UNKNOWN", providerTier ?? "UNKNOWN"].join("|");
}

/** Nearest-rank percentile over an array (q in 0..100). Empty ⇒ NaN. */
export function percentileNearestRank(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const rank = Math.min(s.length, Math.max(1, Math.ceil((q / 100) * s.length)));
  return s[rank - 1];
}

export interface CohortDistribution {
  min: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
}

/** The full percentile/median/range distribution over a non-empty value set. */
export function cohortDistribution(values: number[]): CohortDistribution {
  const s = [...values].sort((a, b) => a - b);
  return {
    min: s[0],
    p25: percentileNearestRank(s, 25),
    median: percentileNearestRank(s, 50),
    p75: percentileNearestRank(s, 75),
    p90: percentileNearestRank(s, 90),
    max: s[s.length - 1],
  };
}

/** Is the cohort large enough to publish a benchmark without revealing a peer? */
export function cohortMeetsAnonymity(distinctProviderCount: number): boolean {
  return distinctProviderCount >= MIN_COHORT_PROVIDERS;
}
