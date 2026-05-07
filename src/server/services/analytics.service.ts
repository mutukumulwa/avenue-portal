import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AnalyticsScope = {
  tenantId: string;
  groupId?: string;
  intermediaryId?: string;
};

function currentYearStart() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function latestPeriodStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export class AnalyticsService {
  static async getPortfolioSummary(scope: AnalyticsScope) {
    const periodStart = latestPeriodStart();
    const ytdStart = currentYearStart();

    const [latestSnapshot, activeMembers, ytdContribution, ytdClaims, openAlerts] = await Promise.all([
      prisma.analyticsMlrSnapshot.findFirst({
        where: {
          tenantId: scope.tenantId,
          grain: "PORTFOLIO",
          periodStart: { lte: periodStart },
        },
        orderBy: { periodStart: "desc" },
      }),
      prisma.member.count({
        where: {
          tenantId: scope.tenantId,
          status: "ACTIVE",
          ...(scope.groupId ? { groupId: scope.groupId } : {}),
        },
      }),
      prisma.analyticsContributionFact.aggregate({
        where: {
          tenantId: scope.tenantId,
          periodStart: { gte: ytdStart },
          ...(scope.groupId ? { groupId: scope.groupId } : {}),
          ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
        },
        _sum: { grossContribution: true, paidContribution: true },
      }),
      prisma.analyticsEncounterFact.aggregate({
        where: {
          tenantId: scope.tenantId,
          encounterDate: { gte: ytdStart },
          ...(scope.groupId ? { groupId: scope.groupId } : {}),
          ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
        },
        _sum: { grossCost: true, benefitPaid: true, memberCoContribution: true },
        _count: { id: true },
      }),
      prisma.analyticsAlert.count({
        where: {
          tenantId: scope.tenantId,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
          ...(scope.groupId ? { groupId: scope.groupId } : {}),
          ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
        },
      }),
    ]);

    const claimsYtd = toNumber(ytdClaims._sum.benefitPaid) + toNumber(ytdClaims._sum.memberCoContribution);
    const contributionYtd = toNumber(ytdContribution._sum.grossContribution);

    return {
      period: latestSnapshot?.period ?? null,
      portfolioMlr: latestSnapshot ? toNumber(latestSnapshot.mlr) : ratio(claimsYtd, contributionYtd),
      trailing12Mlr: latestSnapshot ? toNumber(latestSnapshot.trailing12Mlr) : ratio(claimsYtd, contributionYtd),
      activeMembers,
      contributionYtd,
      paidContributionYtd: toNumber(ytdContribution._sum.paidContribution),
      claimsYtd,
      grossClaimsYtd: toNumber(ytdClaims._sum.grossCost),
      claimCountYtd: ytdClaims._count.id,
      openAlerts,
    };
  }

  static async getSchemeGrid(scope: AnalyticsScope) {
    const groups = await prisma.group.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(scope.groupId ? { id: scope.groupId } : {}),
        ...(scope.intermediaryId ? { brokerId: scope.intermediaryId } : {}),
      },
      select: {
        id: true,
        name: true,
        renewalDate: true,
        brokerId: true,
        broker: { select: { name: true, intermediaryCategory: true } },
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { name: "asc" },
    });

    const groupIds = groups.map((group) => group.id);
    const [snapshots, alerts] = await Promise.all([
      prisma.analyticsMlrSnapshot.findMany({
        where: {
          tenantId: scope.tenantId,
          grain: "SCHEME",
          groupId: { in: groupIds },
        },
        orderBy: [{ groupId: "asc" }, { periodStart: "desc" }],
      }),
      prisma.analyticsAlert.groupBy({
        by: ["groupId"],
        where: {
          tenantId: scope.tenantId,
          groupId: { in: groupIds },
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        _count: { id: true },
      }),
    ]);

    const snapshotsByGroup = new Map<string, typeof snapshots>();
    for (const snapshot of snapshots) {
      if (!snapshot.groupId) continue;
      snapshotsByGroup.set(snapshot.groupId, [...(snapshotsByGroup.get(snapshot.groupId) ?? []), snapshot]);
    }
    const alertCountByGroup = new Map(alerts.map((alert) => [alert.groupId, alert._count.id]));

    return groups.map((group) => {
      const groupSnapshots = snapshotsByGroup.get(group.id) ?? [];
      const latest = groupSnapshots[0];
      const sparkline = groupSnapshots
        .slice(0, 12)
        .reverse()
        .map((snapshot) => ({
          period: snapshot.period,
          mlr: toNumber(snapshot.mlr),
          trailing12Mlr: toNumber(snapshot.trailing12Mlr),
        }));

      return {
        groupId: group.id,
        name: group.name,
        memberCount: group._count.members,
        renewalDate: group.renewalDate,
        intermediaryId: group.brokerId,
        intermediaryName: group.broker?.name ?? null,
        intermediaryCategory: group.broker?.intermediaryCategory ?? null,
        period: latest?.period ?? null,
        contribution: toNumber(latest?.grossContribution),
        paidContribution: toNumber(latest?.paidContribution),
        claims: toNumber(latest?.benefitPaid) + toNumber(latest?.memberCoContribution),
        mlr: toNumber(latest?.mlr),
        trailing12Mlr: toNumber(latest?.trailing12Mlr),
        alertCount: alertCountByGroup.get(group.id) ?? 0,
        sparkline,
      };
    });
  }

  static async getProviderScorecard(scope: AnalyticsScope, limit = 20) {
    const latest = await prisma.providerScorecard.findFirst({
      where: { tenantId: scope.tenantId },
      orderBy: { periodStart: "desc" },
      select: { period: true },
    });

    if (!latest) return [];

    return prisma.providerScorecard.findMany({
      where: {
        tenantId: scope.tenantId,
        period: latest.period,
      },
      orderBy: [{ adjustedCost: "desc" }, { claimCount: "desc" }],
      take: limit,
    });
  }

  static async getRiskComposition(scope: AnalyticsScope) {
    const tiers = await prisma.memberRiskProfile.groupBy({
      by: ["riskTier"],
      where: {
        tenantId: scope.tenantId,
        ...(scope.groupId ? { groupId: scope.groupId } : {}),
      },
      _count: { id: true },
    });
    const total = tiers.reduce((sum, tier) => sum + tier._count.id, 0);

    return tiers.map((tier) => ({
      riskTier: tier.riskTier,
      count: tier._count.id,
      percentage: total > 0 ? tier._count.id / total : 0,
    }));
  }

  static async getRenewalPipeline(scope: AnalyticsScope, daysAhead = 90) {
    const now = new Date();
    const horizon = addDays(now, daysAhead);
    const analyses = await prisma.renewalAnalysis.findMany({
      where: {
        tenantId: scope.tenantId,
        renewalDate: { gte: now, lte: horizon },
        ...(scope.groupId ? { groupId: scope.groupId } : {}),
      },
      orderBy: { renewalDate: "asc" },
      take: 12,
    });

    const groupIds = analyses.map((analysis) => analysis.groupId);
    const groups = await prisma.group.findMany({
      where: {
        id: { in: groupIds },
        ...(scope.intermediaryId ? { brokerId: scope.intermediaryId } : {}),
      },
      select: {
        id: true,
        name: true,
        brokerId: true,
        broker: { select: { name: true, intermediaryCategory: true } },
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
    });
    const groupById = new Map(groups.map((group) => [group.id, group]));

    return analyses
      .map((analysis) => {
        const group = groupById.get(analysis.groupId);
        if (!group) return null;
        const daysToRenewal = Math.ceil((analysis.renewalDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        return {
          analysisId: analysis.id,
          groupId: analysis.groupId,
          groupName: group.name,
          renewalDate: analysis.renewalDate,
          daysToRenewal,
          activeMembers: group._count.members,
          intermediaryId: group.brokerId,
          intermediaryName: group.broker?.name ?? null,
          intermediaryCategory: group.broker?.intermediaryCategory ?? null,
          trailing12Mlr: toNumber(analysis.trailing12Mlr),
          currentYearMlr: toNumber(analysis.currentYearMlr),
          targetMlr: toNumber(analysis.targetMlr),
          currentContribution: toNumber(analysis.currentContribution),
          projectedClaims: toNumber(analysis.projectedClaims),
          recommendedContribution: toNumber(analysis.recommendedContribution),
          recommendedAdjustmentPct: toNumber(analysis.recommendedAdjustmentPct),
          topIcdDrivers: analysis.topIcdDrivers,
          lastCalculatedAt: analysis.lastCalculatedAt,
        };
      })
      .filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null);
  }
}
