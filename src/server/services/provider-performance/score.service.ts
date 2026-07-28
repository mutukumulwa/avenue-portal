import { prisma } from "@/lib/prisma";
import type { PrismaClient, PerformanceScoreStatus } from "@prisma/client";
import { ProviderAccessService, type ProviderAccessContext } from "@/server/services/provider-access.service";
import { isBranchInScope, isProviderVisibleScore, projectScoreForProvider, type ProviderScoreView } from "./projection";

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
