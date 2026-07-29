/**
 * PNOS F8.2 — provider performance score projection + visibility rules (pure).
 *
 * A provider sees a score ONLY when it is PUBLISHED, sufficiently complete, meets the
 * minimum sample, and is not anonymity-suppressed (§8.13). The provider-safe projection
 * carries the numbers behind the value (numerator/denominator/sample/completeness/version
 * — §8.13 "show definitions/sample/completeness/version") but NEVER the internal cohort
 * key, control totals, or source watermark. The scores are advisory (D21).
 */

/** Below this completeness a score is treated as too incomplete to show at all. */
export const MIN_COMPLETENESS_VISIBLE = 0.5;
/** Between MIN_COMPLETENESS_VISIBLE and this, the score shows WITH a data-quality warning. */
export const COMPLETENESS_WARN = 1.0;

export interface PerformanceScoreRow {
  status: string; // PerformanceScoreStatus
  completeness: unknown; // Decimal
  sampleSize: number;
  meetsMinimumSample: boolean;
  suppressedForAnonymity: boolean;
  metricKey: string;
  definitionVersion: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  value: unknown; // Decimal | null
  unit: string;
  numerator: unknown; // Decimal
  denominator: unknown; // Decimal
  providerBranchId: string;
}

const num = (v: unknown): number => (v == null ? 0 : Number(v as { toString(): string }));
const str = (v: unknown): string | null => (v == null ? null : String(v));

/** The single provider-visibility predicate (F8.2 test: unpublished/incomplete excluded). */
export function isProviderVisibleScore(s: Pick<PerformanceScoreRow, "status" | "completeness" | "meetsMinimumSample" | "suppressedForAnonymity">): boolean {
  return (
    s.status === "PUBLISHED" &&
    !s.suppressedForAnonymity &&
    s.meetsMinimumSample &&
    num(s.completeness) >= MIN_COMPLETENESS_VISIBLE
  );
}

export interface ProviderScoreView {
  metricKey: string;
  definitionVersion: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  value: string | null;
  unit: string;
  numerator: string;
  denominator: string;
  sampleSize: number;
  completeness: string;
  /** true when completeness is below full — the F8.5 dashboard renders an advisory warning. */
  dataQualityWarning: boolean;
  scope: "PROVIDER" | "BRANCH";
  branchId: string | null;
}

/** Provider-safe projection — own numbers only; NEVER cohortKey / controlTotals / sourceWatermark. */
export function projectScoreForProvider(s: PerformanceScoreRow): ProviderScoreView {
  return {
    metricKey: s.metricKey,
    definitionVersion: s.definitionVersion,
    period: s.period,
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    value: str(s.value),
    unit: s.unit,
    numerator: String(s.numerator),
    denominator: String(s.denominator),
    sampleSize: s.sampleSize,
    completeness: String(s.completeness),
    dataQualityWarning: num(s.completeness) < COMPLETENESS_WARN,
    scope: s.providerBranchId ? "BRANCH" : "PROVIDER",
    branchId: s.providerBranchId || null,
    // NOTE: cohortKey, controlTotals, sourceWatermark, status, publication ids are INTERNAL.
  };
}

/** A branch-level score is in a provider's scope only for an authorized branch; provider-level ("") is always own. */
export function isBranchInScope(allowedBranchIds: string[], providerBranchId: string): boolean {
  return providerBranchId === "" || allowedBranchIds.includes(providerBranchId);
}
