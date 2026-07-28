import { prisma } from "@/lib/prisma";
import type { PrismaClient } from "@prisma/client";
import { auditChainService } from "@/server/services/audit-chain.service";
import { csvCell } from "@/server/services/provider-remittance/csv";

/**
 * PNOS F8.6 — TPA network performance workspace read model.
 *
 * Authorized network managers compare NAMED providers on a metric, spot outliers,
 * and export — gated on an EXPLICIT network-analytics permission (not merely a role).
 * It reads the versioned scores only; it NEVER mutates a rate, tier, or provider
 * status, and it exposes NO clinical detail (only aggregate score numbers + the
 * provider name). Exports are audited. Improvement plans are created through the
 * existing F7.7 service (no new mutation here). Stop (F8.6): no automated network
 * decision.
 */

export const NETWORK_ANALYTICS_PERMISSION = "network.analytics.read";

export interface NetworkAnalyticsActor { userId: string; tenantId: string; permissions: string[] }

export class NetworkAnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkAnalyticsError";
  }
}

function assertNetworkAnalyst(actor: NetworkAnalyticsActor): void {
  if (!actor.permissions?.includes(NETWORK_ANALYTICS_PERMISSION)) {
    throw new NetworkAnalyticsError("The network-analytics permission is required.");
  }
}

const str = (v: unknown): string | null => (v == null ? null : String(v));

export interface NetworkComparisonRow {
  providerId: string;
  providerName: string;
  value: string | null;
  numerator: string;
  denominator: string;
  sampleSize: number;
  meetsMinimumSample: boolean;
  unit: string;
  isOutlier: boolean;
}

export const NetworkPerformanceService = {
  /**
   * Named-provider comparison for one metric+period (published or draft — the
   * operator sees the full network). Flags the top/bottom-decile outliers among the
   * sampled providers. Contains NO clinical detail — only the aggregate score.
   */
  async listComparison(
    actor: NetworkAnalyticsActor,
    input: { period: string; metricKey: string; definitionVersion?: string },
    db: PrismaClient = prisma,
  ): Promise<NetworkComparisonRow[]> {
    assertNetworkAnalyst(actor);
    const definitionVersion = input.definitionVersion ?? "PNMC-1.0";
    const scores = await db.providerPerformanceScore.findMany({
      where: { tenantId: actor.tenantId, period: input.period, metricKey: input.metricKey, definitionVersion, providerBranchId: "" },
      orderBy: [{ value: "desc" }],
    });
    const providerIds = [...new Set(scores.map((s) => s.providerId))];
    const providers = await db.provider.findMany({ where: { id: { in: providerIds }, tenantId: actor.tenantId }, select: { id: true, name: true } });
    const nameOf = new Map(providers.map((p) => [p.id, p.name]));

    const sampled = scores.filter((s) => s.value != null && s.meetsMinimumSample).map((s) => Number(s.value)).sort((a, b) => a - b);
    const n = sampled.length;
    const p90 = n ? sampled[Math.min(n - 1, Math.ceil(0.9 * n) - 1)] : null;
    const p10 = n ? sampled[Math.max(0, Math.ceil(0.1 * n) - 1)] : null;

    return scores.map((s) => ({
      providerId: s.providerId, providerName: nameOf.get(s.providerId) ?? "Unknown provider",
      value: str(s.value), numerator: String(s.numerator), denominator: String(s.denominator),
      sampleSize: s.sampleSize, meetsMinimumSample: s.meetsMinimumSample, unit: s.unit,
      isOutlier: s.value != null && s.meetsMinimumSample && n >= 3 && p90 != null && p10 != null && (Number(s.value) >= p90 || Number(s.value) <= p10),
    }));
  },

  /** An audited CSV export of the comparison — the "sensitive export" is logged (F8.6 step 5). */
  async exportComparisonCsv(
    actor: NetworkAnalyticsActor,
    input: { period: string; metricKey: string; definitionVersion?: string },
    db: PrismaClient = prisma,
  ): Promise<{ filename: string; csv: string; rowCount: number }> {
    const rows = await this.listComparison(actor, input, db); // assertNetworkAnalyst inside
    const COLUMNS = ["Provider", "Value", "Numerator", "Denominator", "Sample", "Meets sample", "Outlier"];
    const line = (cells: (string | number | null)[]) => cells.map(csvCell).join(",");
    const body: string[] = [line([`Network performance — ${input.metricKey} — ${input.period}`]), "", line(COLUMNS)];
    for (const r of rows) body.push(line([r.providerName, r.value ?? "", r.numerator, r.denominator, r.sampleSize, r.meetsMinimumSample ? "Yes" : "No", r.isOutlier ? "Yes" : "No"]));
    const csv = `﻿${body.join("\r\n")}\r\n`;

    await auditChainService.append({
      actorId: actor.userId, action: "NETWORK_ANALYTICS:EXPORT", module: "PROVIDER",
      entityType: "ProviderPerformanceScore", entityId: `${input.period}:${input.metricKey}`, tenantId: actor.tenantId,
      payload: { period: input.period, metricKey: input.metricKey, rowCount: rows.length }, description: `Network performance export (${input.metricKey}, ${input.period}): ${rows.length} providers.`,
    });
    return { filename: `network-performance-${input.metricKey}-${input.period}.csv`.replace(/[^\w.-]+/g, "_"), csv, rowCount: rows.length };
  },

  /** The distinct metrics + periods available for the workspace filters. */
  async listAvailable(actor: NetworkAnalyticsActor, db: PrismaClient = prisma) {
    assertNetworkAnalyst(actor);
    const rows = await db.providerPerformanceScore.findMany({ where: { tenantId: actor.tenantId, providerBranchId: "" }, select: { metricKey: true, period: true }, distinct: ["metricKey", "period"], orderBy: [{ period: "desc" }, { metricKey: "asc" }], take: 500 });
    return { metrics: [...new Set(rows.map((r) => r.metricKey))], periods: [...new Set(rows.map((r) => r.period))] };
  },
} as const;
