import { prisma } from "@/lib/prisma";
import type { PrismaClient, PerformanceScoreStatus } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { isBranchInScope, isProviderVisibleScore, projectScoreForProvider, type ProviderScoreView } from "./projection";
import { buildCohortKey } from "./cohort";
import { periodBounds } from "./refresh.service";

const str = (v: unknown): string | null => (v == null ? null : String(v));

/**
 * PNOS F8.2 — provider performance score read model.
 *
 * The ONE provider-safe read of the versioned `ProviderPerformanceScore` rows. It
 * enforces the §8.13 provider view rule — own provider + authorized branches only,
 * and ONLY scores that are PUBLISHED, complete, sufficiently sampled, and not
 * anonymity-suppressed (unpublished/incomplete are excluded). It NEVER computes a
 * score (that is F8.3) and never mutates anything. The network read returns full rows
 * for an operator and is role-gated (the explicit network-analytics permission arrives
 * in F8.6). The legacy cost `ProviderScorecard` and its analytics readers are untouched.
 */

export const PERFORMANCE_READ_PERMISSION = "provider.performance.read";
const NETWORK_ANALYTICS_ROLES = ["SUPER_ADMIN"];

export interface NetworkAnalyticsActor { userId: string; tenantId: string; role: string }

export const ProviderPerformanceScoreService = {
  /** The provider's own visible scores (published + complete + sampled + not suppressed). */
  async listForProvider(ctx: ProviderAccessContext, opts: { period?: string; metricKey?: string } = {}, db: PrismaClient = prisma): Promise<ProviderScoreView[]> {
    ProviderAccessService.requirePermission(ctx, PERFORMANCE_READ_PERMISSION);
    const rows = await db.providerPerformanceScore.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, status: "PUBLISHED", ...(opts.period ? { period: opts.period } : {}), ...(opts.metricKey ? { metricKey: opts.metricKey } : {}) },
      orderBy: [{ period: "desc" }, { metricKey: "asc" }],
      take: 1000,
    });
    return rows
      .filter((s) => isBranchInScope(ctx.allowedProviderBranchIds, s.providerBranchId) && isProviderVisibleScore(s))
      .map(projectScoreForProvider);
  },

  /** A single metric's trend for the provider (visible published points only, oldest → newest). */
  async getProviderMetricTrend(ctx: ProviderAccessContext, metricKey: string, db: PrismaClient = prisma): Promise<ProviderScoreView[]> {
    const rows = await this.listForProvider(ctx, { metricKey }, db);
    return [...rows].sort((a, b) => a.period.localeCompare(b.period));
  },

  /**
   * F8.5 — the anonymized cohort benchmark for the provider's OWN cohort (its
   * type+tier). Provider-safe: it returns the distribution + the peer-group SIZE
   * only — never a named peer (the benchmark model carries no provider id). Returns
   * null when the cohort was suppressed (too small) or nothing is published.
   */
  async getCohortBenchmarkForProvider(ctx: ProviderAccessContext, input: { metricKey: string; period: string; definitionVersion?: string }, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, PERFORMANCE_READ_PERMISSION);
    const provider = await db.provider.findFirst({ where: { id: ctx.providerId, tenantId: ctx.tenantId }, select: { type: true, tier: true } });
    if (!provider) return null;
    const cohortKey = buildCohortKey(ctx.tenantId, provider.type, provider.tier);
    const b = await db.performanceCohortBenchmark.findFirst({
      where: { tenantId: ctx.tenantId, period: input.period, metricKey: input.metricKey, cohortKey, definitionVersion: input.definitionVersion ?? "PNMC-1.0" },
      orderBy: { publicationVersion: "desc" },
    });
    if (!b) return null;
    return {
      metricKey: b.metricKey, period: b.period, unit: b.unit, peerGroupSize: b.providerCount,
      min: str(b.minValue), p25: str(b.p25), median: str(b.median), p75: str(b.p75), p90: str(b.p90), max: str(b.maxValue),
      // NOTE: the raw cohortKey / any provider identity is NOT projected.
    };
  },

  /**
   * F8.5 — the provider's OWN contributing records for a submission-quality metric,
   * scoped to the provider. The record count reconciles to the metric denominator
   * (A1/E1 use the ORIGINAL-received-in-period set; the drilldown never crosses the
   * provider boundary). Own records only (§8.13 drilldown).
   */
  async getSubmissionDrilldown(ctx: ProviderAccessContext, input: { metricKey: string; period: string }, db: PrismaClient = prisma) {
    ProviderAccessService.requirePermission(ctx, PERFORMANCE_READ_PERMISSION);
    const { start, end } = periodBounds(input.period);
    // A1/E1 denominator = ORIGINAL claims received in period, not superseded/void/withdrawn.
    const claims = await db.claim.findMany({
      where: { tenantId: ctx.tenantId, providerId: ctx.providerId, receivedAt: { gte: start, lte: end }, submissionType: "ORIGINAL", status: { notIn: ["SUPERSEDED", "VOID", "WITHDRAWN"] } },
      select: { id: true, claimNumber: true, source: true, status: true, receivedAt: true },
      orderBy: { receivedAt: "asc" },
      take: 1000,
    });
    return {
      metricKey: input.metricKey, period: input.period, count: claims.length,
      records: claims.map((c) => ({ claimId: c.id, claimNumber: c.claimNumber, channel: c.source === "MANUAL" ? "manual" : "digital", status: c.status, receivedAt: c.receivedAt })),
    };
  },

  // ── network (operator) reads — full rows incl. DRAFT; role-gated (F8.6 adds the explicit perm) ──
  async listForNetwork(actor: NetworkAnalyticsActor, opts: { providerId?: string; period?: string; metricKey?: string; status?: PerformanceScoreStatus } = {}, db: PrismaClient = prisma) {
    if (!NETWORK_ANALYTICS_ROLES.includes(actor.role)) throw new Error("Network analytics role required.");
    return db.providerPerformanceScore.findMany({
      where: { tenantId: actor.tenantId, ...(opts.providerId ? { providerId: opts.providerId } : {}), ...(opts.period ? { period: opts.period } : {}), ...(opts.metricKey ? { metricKey: opts.metricKey } : {}), ...(opts.status ? { status: opts.status } : {}) },
      orderBy: [{ period: "desc" }, { providerId: "asc" }, { metricKey: "asc" }],
      take: 2000,
    });
  },
} as const;
