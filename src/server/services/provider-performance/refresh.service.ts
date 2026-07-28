import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma, type PrismaClient } from "@prisma/client";

/**
 * PNOS F8.3 — deterministic scorecard refresh for ONE metric family (submission
 * quality). It reads the canonical Claim facts within the period, computes each
 * metric's numerator/denominator/completeness + exclusions + control totals, and
 * UPSERTS a DRAFT ProviderPerformanceScore keyed by (period, provider, metric,
 * definitionVersion). The result is deterministic: a `sourceWatermark` hashes the
 * exact contributing facts, so a re-run over identical facts is a no-op, and a late
 * arrival re-run updates the numbers and mints a new watermark. It NEVER publishes
 * (that is F8.4) and NEVER computes a cohort benchmark. Only the submission-quality
 * family is implemented (F8.3 stop: after one family); other families are added the
 * same way. The metric definitions are the F8.1 PNMC-1.0 catalog.
 */

export const DEFAULT_DEFINITION_VERSION = "PNMC-1.0";
export const SUBMISSION_QUALITY_MIN_SAMPLE = 20;

export const SUBMISSION_QUALITY_METRIC_KEYS = ["A1_digital_submission_rate", "A7_confirmed_duplicate_rate", "E1_correction_resubmission_rate"] as const;
export type SubmissionQualityMetricKey = (typeof SUBMISSION_QUALITY_METRIC_KEYS)[number];

// A1: a claim is "digital" when it did NOT arrive by manual capture (PNMC A1 / §1.1).
const isDigitalSource = (source: string) => source !== "MANUAL";
// Excluded from SUBMISSION denominators (A1/E1): superseded/void/withdrawn are not real originals.
const EXCLUDED_STATUSES = new Set(["SUPERSEDED", "VOID", "WITHDRAWN"]);
// Excluded from the DECISION denominator (A7): only pre-decision/lineage states — VOID stays,
// because a confirmed duplicate can be terminally VOIDed (it IS a decision outcome).
const DECISION_EXCLUDED_STATUSES = new Set(["SUPERSEDED", "WITHDRAWN"]);
// A7 confirmed duplicate: a terminal reject carrying a Duplicate-category reason (§1.4 — no dedicated status).
const TERMINAL_DECLINE_STATUSES = new Set(["DECLINED", "VOID"]);
const DUPLICATE_REASON_CATEGORY = "Duplicate";

/** UTC month bounds for a "YYYY-MM" period (tz-awareness is an F8.4 refinement — documented). */
export function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
}

type ClaimFact = {
  id: string;
  status: string;
  source: string;
  submissionType: string;
  receivedAt: Date;
  decidedAt: Date | null;
  claimLines: { reasonCode: { category: string } | null }[];
};

interface MetricComputation {
  metricKey: SubmissionQualityMetricKey;
  numerator: number;
  denominator: number;
  /** ids of the facts that fed the numerator+denominator, in stable order — hashed into the watermark. */
  contributingIds: string[];
  excludedCount: number;
  controlTotals: Record<string, number>;
  completeness: number;
}

function inPeriod(d: Date | null, start: Date, end: Date): boolean {
  return !!d && d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

function computeSubmissionQuality(claims: ClaimFact[], start: Date, end: Date): MetricComputation[] {
  // ── A1 · digital submission rate — den: ORIGINAL claims received in period (not excluded); num: digital source.
  const a1Den = claims.filter((c) => c.submissionType === "ORIGINAL" && inPeriod(c.receivedAt, start, end) && !EXCLUDED_STATUSES.has(c.status));
  const a1Num = a1Den.filter((c) => isDigitalSource(c.source));
  const a1Excluded = claims.filter((c) => inPeriod(c.receivedAt, start, end) && (c.submissionType !== "ORIGINAL" || EXCLUDED_STATUSES.has(c.status))).length;

  // ── E1 · correction/resubmission rate — num: CORRECTION|RESUBMISSION received in period; den: same ORIGINAL base as A1.
  const e1Num = claims.filter((c) => (c.submissionType === "CORRECTION" || c.submissionType === "RESUBMISSION") && inPeriod(c.receivedAt, start, end) && !EXCLUDED_STATUSES.has(c.status));

  // ── A7 · confirmed duplicate rate — den: claims DECIDED in period; num: terminal decline with a Duplicate reason.
  const a7Den = claims.filter((c) => inPeriod(c.decidedAt, start, end) && !DECISION_EXCLUDED_STATUSES.has(c.status));
  const a7Num = a7Den.filter((c) => TERMINAL_DECLINE_STATUSES.has(c.status) && c.claimLines.some((l) => l.reasonCode?.category === DUPLICATE_REASON_CATEGORY));

  return [
    {
      metricKey: "A1_digital_submission_rate",
      numerator: a1Num.length, denominator: a1Den.length,
      contributingIds: a1Den.map((c) => `${c.id}:${isDigitalSource(c.source) ? 1 : 0}`).sort(),
      excludedCount: a1Excluded,
      controlTotals: { digital: a1Num.length, original: a1Den.length, excluded: a1Excluded },
      completeness: 1,
    },
    {
      metricKey: "A7_confirmed_duplicate_rate",
      numerator: a7Num.length, denominator: a7Den.length,
      contributingIds: a7Den.map((c) => `${c.id}:${TERMINAL_DECLINE_STATUSES.has(c.status) && c.claimLines.some((l) => l.reasonCode?.category === DUPLICATE_REASON_CATEGORY) ? 1 : 0}`).sort(),
      excludedCount: 0,
      controlTotals: { confirmedDuplicates: a7Num.length, decided: a7Den.length },
      completeness: 1,
    },
    {
      metricKey: "E1_correction_resubmission_rate",
      numerator: e1Num.length, denominator: a1Den.length,
      contributingIds: [...a1Den.map((c) => `o:${c.id}`), ...e1Num.map((c) => `r:${c.id}`)].sort(),
      excludedCount: 0,
      controlTotals: { corrections: e1Num.length, originals: a1Den.length },
      completeness: 1,
    },
  ];
}

function watermark(period: string, definitionVersion: string, providerId: string, m: MetricComputation): string {
  const canonical = JSON.stringify({ period, definitionVersion, providerId, metricKey: m.metricKey, num: m.numerator, den: m.denominator, ids: m.contributingIds });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function ratio(num: number, den: number): Prisma.Decimal | null {
  if (den <= 0) return null; // zero denominator: never divide — the score is suppressed by min-sample
  return new Prisma.Decimal((num / den).toFixed(6));
}

export interface RefreshResult {
  period: string;
  definitionVersion: string;
  providerId: string;
  scores: { metricKey: string; numerator: number; denominator: number; value: string | null; changed: boolean }[];
}

export const ProviderPerformanceRefreshService = {
  /**
   * Recompute the submission-quality family for one (provider, period) and upsert the
   * DRAFT scores. Idempotent: an identical fact set leaves the row (and its
   * computedAt) unchanged; a changed fact set updates the value + mints a new
   * watermark. Provider/branch scope = provider-level ("") for this family.
   */
  async refreshSubmissionQuality(
    input: { tenantId: string; providerId: string; period: string; definitionVersion?: string; now?: Date },
    db: PrismaClient = prisma,
  ): Promise<RefreshResult> {
    const definitionVersion = input.definitionVersion ?? DEFAULT_DEFINITION_VERSION;
    const { start, end } = periodBounds(input.period);
    const now = input.now ?? new Date();

    const rows = (await db.claim.findMany({
      where: { tenantId: input.tenantId, providerId: input.providerId, OR: [{ receivedAt: { gte: start, lte: end } }, { decidedAt: { gte: start, lte: end } }] },
      select: { id: true, status: true, source: true, submissionType: true, receivedAt: true, decidedAt: true, claimLines: { select: { reasonCode: { select: { category: true } } } } },
      orderBy: { id: "asc" },
    })) as unknown as ClaimFact[];

    const computations = computeSubmissionQuality(rows, start, end);
    const out: RefreshResult["scores"] = [];

    for (const m of computations) {
      const wm = watermark(input.period, definitionVersion, input.providerId, m);
      const value = ratio(m.numerator, m.denominator);
      const meetsMinimumSample = m.denominator >= SUBMISSION_QUALITY_MIN_SAMPLE;
      const existing = await db.providerPerformanceScore.findFirst({
        where: { tenantId: input.tenantId, period: input.period, providerId: input.providerId, providerBranchId: "", metricKey: m.metricKey, definitionVersion },
        select: { id: true, sourceWatermark: true },
      });

      if (existing && existing.sourceWatermark === wm) {
        out.push({ metricKey: m.metricKey, numerator: m.numerator, denominator: m.denominator, value: value?.toString() ?? null, changed: false });
        continue; // identical facts → no-op (idempotent), computedAt preserved
      }

      const data = {
        numerator: new Prisma.Decimal(m.numerator), denominator: new Prisma.Decimal(m.denominator), value, unit: "RATE",
        completeness: new Prisma.Decimal(m.completeness), sampleSize: m.denominator, meetsMinimumSample,
        excludedCount: m.excludedCount, controlTotals: m.controlTotals as Prisma.InputJsonValue,
        sourceWatermark: wm, computedAt: now, status: "DRAFT" as const,
      };

      if (existing) {
        await db.providerPerformanceScore.update({ where: { id: existing.id }, data });
      } else {
        await db.providerPerformanceScore.create({
          data: {
            tenantId: input.tenantId, providerId: input.providerId, providerBranchId: "", period: input.period,
            periodStart: start, periodEnd: end, metricKey: m.metricKey, definitionVersion, ...data,
          },
        });
      }
      out.push({ metricKey: m.metricKey, numerator: m.numerator, denominator: m.denominator, value: value?.toString() ?? null, changed: true });
    }

    return { period: input.period, definitionVersion, providerId: input.providerId, scores: out };
  },
} as const;
