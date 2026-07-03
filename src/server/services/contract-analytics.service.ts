import { prisma } from "@/lib/prisma";

// ─── CONTRACT ANALYTICS (spec §15, Phase 5) ──────────────────────────────────
// Datasets keyed by (contractId, contractVersionId, ruleRef, reasonCode) — all
// derivable because per-line provenance is persisted (§5.13). Pure computation
// helpers are separated from the DB queries so the arithmetic is unit-tested.

// ── Pure helpers ──

/** Average-cost pool recovery (spec §15.12; Old Mutual 1.1-1.3). */
export function computeReconciliation(agreedAverage: number, claimCount: number, billedTotal: number) {
  const agreedTotal = Math.round(agreedAverage * claimCount * 100) / 100;
  const recovery = Math.max(0, Math.round((billedTotal - agreedTotal) * 100) / 100);
  return { agreedTotal, recovery };
}

export interface BacklogRow { description: string; count: number; billedAtRisk: number }
/** Rank the unmapped/rate-missing amendment backlog (dataset 5) by volume then value. */
export function rankAmendmentBacklog(rows: BacklogRow[]): BacklogRow[] {
  return [...rows].sort((a, b) => b.count - a.count || b.billedAtRisk - a.billedAtRisk);
}

export interface VarianceInput { service: string; providerId: string; rate: number }
export interface VarianceRow { service: string; providerCount: number; min: number; max: number; avg: number; spreadPct: number }
/** Cross-provider rate variance for the same service (dataset 11 / O12). */
export function summarizeRateVariance(rows: VarianceInput[]): VarianceRow[] {
  const byService = new Map<string, VarianceInput[]>();
  for (const r of rows) {
    const key = r.service.trim().toLowerCase();
    if (!byService.has(key)) byService.set(key, []);
    byService.get(key)!.push(r);
  }
  const out: VarianceRow[] = [];
  for (const [, group] of byService) {
    const providers = new Set(group.map(g => g.providerId));
    if (providers.size < 2) continue; // variance only meaningful across ≥2 providers
    const rates = group.map(g => g.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const avg = Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 100) / 100;
    const spreadPct = min > 0 ? Math.round(((max - min) / min) * 1000) / 10 : 0;
    out.push({ service: group[0].service, providerCount: providers.size, min, max, avg, spreadPct });
  }
  return out.sort((a, b) => b.spreadPct - a.spreadPct);
}

// ── DB-backed datasets ──

export class ContractAnalyticsService {
  /** Dataset 1 — claims paid by contract (billed/payable/shortfall/write-off). */
  static async claimsByContract(tenantId: string) {
    const grouped = await prisma.claimLine.groupBy({
      by: ["contractId"],
      where: { contractId: { not: null }, claim: { tenantId } },
      _count: { _all: true },
      _sum: { billedAmount: true, payerLiability: true, shortfallAmount: true, disallowedAmount: true, providerWriteOff: true },
    });
    const contractIds = grouped.map(g => g.contractId!).filter(Boolean);
    const contracts = await prisma.providerContract.findMany({ where: { id: { in: contractIds } }, select: { id: true, contractNumber: true, title: true } });
    const byId = new Map(contracts.map(c => [c.id, c]));
    return grouped.map(g => ({
      contractId: g.contractId,
      contractNumber: byId.get(g.contractId!)?.contractNumber ?? "—",
      title: byId.get(g.contractId!)?.title ?? "",
      lineCount: g._count._all,
      billed: Number(g._sum.billedAmount ?? 0),
      payable: Number(g._sum.payerLiability ?? 0),
      shortfall: Number(g._sum.shortfallAmount ?? 0),
      disallowed: Number(g._sum.disallowedAmount ?? 0),
      providerWriteOff: Number(g._sum.providerWriteOff ?? 0),
    })).sort((a, b) => b.billed - a.billed);
  }

  /** Dataset 3 — short-paid (PRC-001) volume + shortfall total. */
  static async shortPaidSummary(tenantId: string) {
    const rows = await prisma.claimLine.aggregate({
      where: { reasonCode: { code: "PRC-001" }, claim: { tenantId } },
      _count: { _all: true },
      _sum: { shortfallAmount: true },
    });
    return { lines: rows._count._all, shortfallTotal: Number(rows._sum.shortfallAmount ?? 0) };
  }

  /** Dataset 5 — amendment backlog: unmapped (SVC-002) / rate-missing (PRC-002) service clusters. */
  static async amendmentBacklog(tenantId: string): Promise<BacklogRow[]> {
    const grouped = await prisma.claimLine.groupBy({
      by: ["description"],
      where: { reasonCode: { code: { in: ["SVC-002", "PRC-002"] } }, claim: { tenantId } },
      _count: { _all: true },
      _sum: { billedAmount: true },
    });
    return rankAmendmentBacklog(
      grouped.map(g => ({ description: g.description, count: g._count._all, billedAtRisk: Number(g._sum.billedAmount ?? 0) })),
    );
  }

  /** Dataset 6 — expiring & review-due contracts within a horizon. */
  static async expiringContracts(tenantId: string, days = 60) {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);
    const now = new Date();
    return prisma.providerContract.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        OR: [{ endDate: { gte: now, lte: horizon } }, { reviewDueDate: { lte: horizon } }],
      },
      select: { id: true, contractNumber: true, title: true, endDate: true, reviewDueDate: true, provider: { select: { name: true } } },
      orderBy: { endDate: "asc" },
    });
  }

  /** Dataset 11 — cross-provider rate variance for the same canonical service. */
  static async rateVariance(tenantId: string): Promise<VarianceRow[]> {
    const tariffs = await prisma.providerTariff.findMany({
      where: { isActive: true, provider: { tenantId } },
      select: { serviceName: true, providerId: true, agreedRate: true },
      take: 5000,
    });
    return summarizeRateVariance(tariffs.map(t => ({ service: t.serviceName, providerId: t.providerId, rate: Number(t.agreedRate) })));
  }

  /** Dataset 14 — turnaround impact: auto-adjudicated share + averages. */
  static async turnaround(tenantId: string) {
    const [total, auto, tat] = await Promise.all([
      prisma.claim.count({ where: { tenantId } }),
      prisma.claim.count({ where: { tenantId, autoAdjDecision: "AUTO_APPROVE" } }),
      prisma.claim.aggregate({ where: { tenantId, turnaroundDays: { not: null } }, _avg: { turnaroundDays: true } }),
    ]);
    return {
      totalClaims: total,
      autoApproved: auto,
      autoApprovedPct: total > 0 ? Math.round((auto / total) * 1000) / 10 : 0,
      avgTurnaroundDays: tat._avg.turnaroundDays != null ? Math.round(Number(tat._avg.turnaroundDays) * 10) / 10 : null,
    };
  }

  /** Queue load (§8.5) — claims per assigned digital-contract queue. */
  static async queueLoad(tenantId: string) {
    const grouped = await prisma.claim.groupBy({
      by: ["assignedQueue"],
      where: { tenantId, assignedQueue: { not: null } },
      _count: { _all: true },
    });
    return grouped.map(g => ({ queue: g.assignedQueue, count: g._count._all })).sort((a, b) => b.count - a.count);
  }
}
