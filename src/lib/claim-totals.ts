/**
 * Which claims count in TOTALS — Family Hospital UAT decision DEC-FH-X11
 * (owner, 2026-09-11).
 *
 * Two statuses never count:
 *  - WITHDRAWN — abandoned before any decision; never adjudicated, paid or
 *    settled;
 *  - SUPERSEDED — replaced by a correction; the claim that replaced it carries
 *    the encounter, so counting both would count one visit twice.
 *
 * Such a claim stays in every LOG — claim lists and detail pages, timelines,
 * audit and lifecycle logs, and per-status breakdowns where it is its own
 * labelled bucket — but in no TOTAL: counts, billed/approved/paid sums,
 * averages, ratios, KPI cards, charts, report summaries, exports' summary rows
 * or analytics.
 *
 * Pure data, no server imports, so dashboards, reports and client components
 * share the one rule.
 */
import type { ClaimStatus } from "@prisma/client";

/** Statuses a claim can be in and still never count in a total. */
export const CLAIM_STATUSES_OUT_OF_TOTALS: readonly ClaimStatus[] = ["WITHDRAWN", "SUPERSEDED"];

/**
 * The Prisma condition for "counts in totals", for a `where` that has no status
 * filter of its own: `{ tenantId, ...COUNTED_IN_TOTALS }`.
 */
export const COUNTED_IN_TOTALS = { status: { notIn: [...CLAIM_STATUSES_OUT_OF_TOTALS] } };

/** For totals computed in code from claims that were fetched for a list. */
export function countsInTotals(claim: { status: ClaimStatus | string }): boolean {
  return !(CLAIM_STATUSES_OUT_OF_TOTALS as readonly string[]).includes(claim.status);
}
