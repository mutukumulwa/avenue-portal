import {
  AnalyticsAlertSeverity,
  AnalyticsAlertStatus,
  AnalyticsAlertType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AnalyticsScope = {
  tenantId: string;
  groupId?: string;
  intermediaryId?: string;
};

type AlertFilters = {
  status?: AnalyticsAlertStatus;
  severity?: AnalyticsAlertSeverity;
  type?: AnalyticsAlertType;
  groupId?: string;
  providerId?: string;
  memberId?: string;
  intermediaryId?: string;
  includeResolved?: boolean;
  limit?: number;
};

type RenewalSimulationInput = {
  targetMlr?: number;
  inflationAssumption?: number;
  membershipChangePct?: number;
  contributionAdjustmentPct?: number;
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

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function asArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value : [];
}

function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
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

  static async getSchemeDetail(scope: AnalyticsScope & { groupId: string }) {
    const group = await prisma.group.findFirst({
      where: {
        id: scope.groupId,
        tenantId: scope.tenantId,
        ...(scope.intermediaryId ? { brokerId: scope.intermediaryId } : {}),
      },
      select: {
        id: true,
        name: true,
        industry: true,
        county: true,
        renewalDate: true,
        contributionRate: true,
        package: { select: { name: true, annualLimit: true } },
        broker: { select: { id: true, name: true, intermediaryCategory: true } },
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
    });

    if (!group) return null;

    const [snapshots, categorySpend, icdDrivers, providerFacts, alerts, renewalAnalysis, recentClaims] = await Promise.all([
      prisma.analyticsMlrSnapshot.findMany({
        where: {
          tenantId: scope.tenantId,
          grain: "SCHEME",
          groupId: scope.groupId,
        },
        orderBy: { periodStart: "desc" },
        take: 18,
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["benefitCategory"],
        where: {
          tenantId: scope.tenantId,
          groupId: scope.groupId,
        },
        _sum: { grossCost: true, benefitPaid: true, memberCoContribution: true },
        _count: { id: true },
        orderBy: { _sum: { grossCost: "desc" } },
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["icdFamily"],
        where: {
          tenantId: scope.tenantId,
          groupId: scope.groupId,
          icdFamily: { not: null },
        },
        _sum: { grossCost: true, benefitPaid: true },
        _count: { id: true },
        orderBy: { _sum: { grossCost: "desc" } },
        take: 8,
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["providerId"],
        where: {
          tenantId: scope.tenantId,
          groupId: scope.groupId,
        },
        _sum: { grossCost: true, benefitPaid: true, rejectedAmount: true },
        _count: { id: true },
        orderBy: { _sum: { grossCost: "desc" } },
        take: 8,
      }),
      prisma.analyticsAlert.findMany({
        where: {
          tenantId: scope.tenantId,
          groupId: scope.groupId,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 8,
      }),
      prisma.renewalAnalysis.findFirst({
        where: {
          tenantId: scope.tenantId,
          groupId: scope.groupId,
        },
        orderBy: { renewalDate: "asc" },
      }),
      prisma.claim.findMany({
        where: {
          tenantId: scope.tenantId,
          member: { groupId: scope.groupId },
        },
        select: {
          id: true,
          claimNumber: true,
          dateOfService: true,
          serviceType: true,
          benefitCategory: true,
          billedAmount: true,
          approvedAmount: true,
          status: true,
          provider: { select: { name: true, tier: true } },
          member: { select: { memberNumber: true, firstName: true, lastName: true } },
        },
        orderBy: { dateOfService: "desc" },
        take: 10,
      }),
    ]);

    const providerIds = providerFacts.map((fact) => fact.providerId);
    const providers = await prisma.provider.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, name: true, tier: true, type: true, county: true },
    });
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));

    const latest = snapshots[0];
    const trend = snapshots
      .slice()
      .reverse()
      .map((snapshot) => ({
        period: snapshot.period,
        periodStart: snapshot.periodStart,
        contribution: toNumber(snapshot.grossContribution),
        paidContribution: toNumber(snapshot.paidContribution),
        claims: toNumber(snapshot.benefitPaid) + toNumber(snapshot.memberCoContribution),
        grossCost: toNumber(snapshot.grossCost),
        mlr: toNumber(snapshot.mlr),
        trailing12Mlr: toNumber(snapshot.trailing12Mlr),
      }));

    return {
      group: {
        id: group.id,
        name: group.name,
        industry: group.industry,
        county: group.county,
        renewalDate: group.renewalDate,
        packageName: group.package.name,
        annualLimit: toNumber(group.package.annualLimit),
        contributionRate: toNumber(group.contributionRate),
        activeMembers: group._count.members,
        intermediaryId: group.broker?.id ?? null,
        intermediaryName: group.broker?.name ?? null,
        intermediaryCategory: group.broker?.intermediaryCategory ?? null,
      },
      summary: {
        period: latest?.period ?? null,
        contribution: toNumber(latest?.grossContribution),
        paidContribution: toNumber(latest?.paidContribution),
        claims: toNumber(latest?.benefitPaid) + toNumber(latest?.memberCoContribution),
        grossCost: toNumber(latest?.grossCost),
        mlr: toNumber(latest?.mlr),
        trailing12Mlr: toNumber(latest?.trailing12Mlr),
        alertCount: alerts.length,
      },
      trend,
      categorySpend: categorySpend.map((row) => ({
        benefitCategory: row.benefitCategory ?? "UNKNOWN",
        grossCost: toNumber(row._sum.grossCost),
        benefitPaid: toNumber(row._sum.benefitPaid),
        memberCoContribution: toNumber(row._sum.memberCoContribution),
        encounterCount: row._count.id,
      })),
      icdDrivers: icdDrivers.map((row) => ({
        icdFamily: row.icdFamily ?? "UNKNOWN",
        grossCost: toNumber(row._sum.grossCost),
        benefitPaid: toNumber(row._sum.benefitPaid),
        encounterCount: row._count.id,
      })),
      providerMix: providerFacts.map((row) => {
        const provider = providerById.get(row.providerId);
        return {
          providerId: row.providerId,
          providerName: provider?.name ?? "Unknown Provider",
          providerTier: provider?.tier ?? null,
          providerType: provider?.type ?? null,
          county: provider?.county ?? null,
          grossCost: toNumber(row._sum.grossCost),
          benefitPaid: toNumber(row._sum.benefitPaid),
          rejectedAmount: toNumber(row._sum.rejectedAmount),
          encounterCount: row._count.id,
        };
      }),
      alerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        message: alert.message,
        metricKey: alert.metricKey,
        metricValue: toNumber(alert.metricValue),
        thresholdValue: toNumber(alert.thresholdValue),
        createdAt: alert.createdAt,
      })),
      renewalAnalysis: renewalAnalysis ? {
        id: renewalAnalysis.id,
        renewalDate: renewalAnalysis.renewalDate,
        trailing12Mlr: toNumber(renewalAnalysis.trailing12Mlr),
        currentYearMlr: toNumber(renewalAnalysis.currentYearMlr),
        targetMlr: toNumber(renewalAnalysis.targetMlr),
        currentContribution: toNumber(renewalAnalysis.currentContribution),
        projectedClaims: toNumber(renewalAnalysis.projectedClaims),
        recommendedContribution: toNumber(renewalAnalysis.recommendedContribution),
        recommendedAdjustmentPct: toNumber(renewalAnalysis.recommendedAdjustmentPct),
        topIcdDrivers: renewalAnalysis.topIcdDrivers,
        anonymizedTopUtilizers: renewalAnalysis.anonymizedTopUtilizers,
      } : null,
      recentClaims: recentClaims.map((claim) => ({
        id: claim.id,
        claimNumber: claim.claimNumber,
        dateOfService: claim.dateOfService,
        serviceType: claim.serviceType,
        benefitCategory: claim.benefitCategory,
        billedAmount: toNumber(claim.billedAmount),
        approvedAmount: toNumber(claim.approvedAmount),
        status: claim.status,
        providerName: claim.provider.name,
        providerTier: claim.provider.tier,
        memberNumber: claim.member.memberNumber,
        memberName: `${claim.member.firstName} ${claim.member.lastName}`,
      })),
    };
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

  static simulateRenewalFromBase(base: {
    currentContribution: number;
    projectedClaims: number;
    activeMembers: number;
    targetMlr: number;
    inflationAssumption: number;
  }, input: RenewalSimulationInput = {}) {
    const targetMlr = bounded(input.targetMlr, base.targetMlr, 0.45, 0.95);
    const inflationAssumption = bounded(input.inflationAssumption, base.inflationAssumption, -0.2, 0.6);
    const membershipChangePct = bounded(input.membershipChangePct, 0, -0.5, 1);
    const contributionAdjustmentPct = bounded(input.contributionAdjustmentPct, 0, -0.5, 1.5);
    const activeMembers = Math.max(1, Math.round(base.activeMembers * (1 + membershipChangePct)));
    const baseClaimsBeforeInflation = base.projectedClaims / Math.max(0.01, 1 + base.inflationAssumption);
    const projectedClaims = baseClaimsBeforeInflation * (1 + inflationAssumption) * (1 + membershipChangePct);
    const requiredContribution = targetMlr > 0 ? projectedClaims / targetMlr : 0;
    const proposedContribution = base.currentContribution * (1 + membershipChangePct) * (1 + contributionAdjustmentPct);
    const proposedRatePerMember = proposedContribution / activeMembers;
    const requiredRatePerMember = requiredContribution / activeMembers;
    const projectedMlr = ratio(projectedClaims, proposedContribution);
    const surplusShortfall = proposedContribution - requiredContribution;
    const breakEvenAdjustmentPct = base.currentContribution > 0
      ? (requiredContribution / Math.max(1, base.currentContribution * (1 + membershipChangePct))) - 1
      : 0;

    return {
      assumptions: {
        targetMlr,
        inflationAssumption,
        membershipChangePct,
        contributionAdjustmentPct,
      },
      activeMembers,
      projectedClaims,
      requiredContribution,
      proposedContribution,
      proposedRatePerMember,
      requiredRatePerMember,
      projectedMlr,
      surplusShortfall,
      breakEvenAdjustmentPct,
    };
  }

  static async getRenewalWorkspace(scope: AnalyticsScope & { groupId: string }, simulationInput: RenewalSimulationInput = {}) {
    const analysis = await prisma.renewalAnalysis.findFirst({
      where: {
        tenantId: scope.tenantId,
        groupId: scope.groupId,
      },
      orderBy: { renewalDate: "asc" },
    });

    if (!analysis) return null;

    const [group, snapshots, alerts] = await Promise.all([
      prisma.group.findFirst({
        where: {
          id: scope.groupId,
          tenantId: scope.tenantId,
          ...(scope.intermediaryId ? { brokerId: scope.intermediaryId } : {}),
        },
        select: {
          id: true,
          name: true,
          industry: true,
          county: true,
          renewalDate: true,
          contributionRate: true,
          package: { select: { id: true, name: true, annualLimit: true } },
          broker: { select: { id: true, name: true, intermediaryCategory: true } },
          _count: { select: { members: { where: { status: "ACTIVE" } } } },
        },
      }),
      prisma.analyticsMlrSnapshot.findMany({
        where: {
          tenantId: scope.tenantId,
          grain: "SCHEME",
          groupId: scope.groupId,
        },
        orderBy: { periodStart: "desc" },
        take: 12,
      }),
      prisma.analyticsAlert.findMany({
        where: {
          tenantId: scope.tenantId,
          groupId: scope.groupId,
          type: { in: ["RENEWAL_RISK", "MLR_DRIFT", "CONTRIBUTION_SHORTFALL"] },
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 6,
      }),
    ]);

    if (!group) return null;

    const simulatorDefaults = asRecord(analysis.simulatorDefaults);
    const inflationAssumption = typeof simulatorDefaults.inflationAssumption === "number"
      ? simulatorDefaults.inflationAssumption
      : 0.08;
    const activeMembers = typeof simulatorDefaults.activeMembers === "number"
      ? simulatorDefaults.activeMembers
      : group._count.members;
    const currentRatePerMember = typeof simulatorDefaults.currentRatePerMember === "number"
      ? simulatorDefaults.currentRatePerMember
      : toNumber(group.contributionRate);

    const simulation = this.simulateRenewalFromBase({
      currentContribution: toNumber(analysis.currentContribution),
      projectedClaims: toNumber(analysis.projectedClaims),
      activeMembers,
      targetMlr: toNumber(analysis.targetMlr),
      inflationAssumption,
    }, simulationInput);

    return {
      group: {
        id: group.id,
        name: group.name,
        industry: group.industry,
        county: group.county,
        renewalDate: group.renewalDate,
        packageId: group.package.id,
        packageName: group.package.name,
        annualLimit: toNumber(group.package.annualLimit),
        activeMembers: group._count.members,
        contributionRate: toNumber(group.contributionRate),
        intermediaryId: group.broker?.id ?? null,
        intermediaryName: group.broker?.name ?? null,
        intermediaryCategory: group.broker?.intermediaryCategory ?? null,
      },
      analysis: {
        id: analysis.id,
        renewalDate: analysis.renewalDate,
        trailing12Mlr: toNumber(analysis.trailing12Mlr),
        currentYearMlr: toNumber(analysis.currentYearMlr),
        targetMlr: toNumber(analysis.targetMlr),
        currentContribution: toNumber(analysis.currentContribution),
        projectedClaims: toNumber(analysis.projectedClaims),
        recommendedContribution: toNumber(analysis.recommendedContribution),
        recommendedAdjustmentPct: toNumber(analysis.recommendedAdjustmentPct),
        lastCalculatedAt: analysis.lastCalculatedAt,
        topIcdDrivers: asArray(analysis.topIcdDrivers),
        anonymizedTopUtilizers: asArray(analysis.anonymizedTopUtilizers),
        simulatorDefaults: {
          targetMlr: toNumber(analysis.targetMlr),
          inflationAssumption,
          activeMembers,
          currentRatePerMember,
        },
      },
      trend: snapshots
        .slice()
        .reverse()
        .map((snapshot) => ({
          period: snapshot.period,
          periodStart: snapshot.periodStart,
          contribution: toNumber(snapshot.grossContribution),
          claims: toNumber(snapshot.benefitPaid) + toNumber(snapshot.memberCoContribution),
          mlr: toNumber(snapshot.mlr),
          trailing12Mlr: toNumber(snapshot.trailing12Mlr),
        })),
      alerts: alerts.map((alert) => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        status: alert.status,
        title: alert.title,
        message: alert.message,
        createdAt: alert.createdAt,
      })),
      simulation,
    };
  }

  static async getAlerts(scope: AnalyticsScope, filters: AlertFilters = {}) {
    const where: Prisma.AnalyticsAlertWhereInput = {
      tenantId: scope.tenantId,
      ...(scope.groupId ? { groupId: scope.groupId } : {}),
      ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.providerId ? { providerId: filters.providerId } : {}),
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.intermediaryId ? { intermediaryId: filters.intermediaryId } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.status
        ? { status: filters.status }
        : filters.includeResolved
          ? {}
          : { status: { in: ["OPEN", "ACKNOWLEDGED"] } }),
    };

    const countScope: Prisma.AnalyticsAlertWhereInput = {
      tenantId: scope.tenantId,
      ...(scope.groupId ? { groupId: scope.groupId } : {}),
      ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
      ...(filters.groupId ? { groupId: filters.groupId } : {}),
      ...(filters.providerId ? { providerId: filters.providerId } : {}),
      ...(filters.memberId ? { memberId: filters.memberId } : {}),
      ...(filters.intermediaryId ? { intermediaryId: filters.intermediaryId } : {}),
    };

    const [alerts, statusCounts, severityCounts] = await Promise.all([
      prisma.analyticsAlert.findMany({
        where,
        orderBy: [
          { status: "asc" },
          { severity: "desc" },
          { createdAt: "desc" },
        ],
        take: filters.limit ?? 100,
      }),
      prisma.analyticsAlert.groupBy({
        by: ["status"],
        where: countScope,
        _count: { id: true },
      }),
      prisma.analyticsAlert.groupBy({
        by: ["severity"],
        where: {
          ...countScope,
          status: { in: ["OPEN", "ACKNOWLEDGED"] },
        },
        _count: { id: true },
      }),
    ]);

    const groupIds = [...new Set(alerts.map((alert) => alert.groupId).filter((id): id is string => Boolean(id)))];
    const providerIds = [...new Set(alerts.map((alert) => alert.providerId).filter((id): id is string => Boolean(id)))];
    const memberIds = [...new Set(alerts.map((alert) => alert.memberId).filter((id): id is string => Boolean(id)))];
    const intermediaryIds = [...new Set(alerts.map((alert) => alert.intermediaryId).filter((id): id is string => Boolean(id)))];

    const [groups, providers, members, intermediaries] = await Promise.all([
      prisma.group.findMany({
        where: { id: { in: groupIds } },
        select: { id: true, name: true },
      }),
      prisma.provider.findMany({
        where: { id: { in: providerIds } },
        select: { id: true, name: true, tier: true, type: true },
      }),
      prisma.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, memberNumber: true, firstName: true, lastName: true },
      }),
      prisma.broker.findMany({
        where: { id: { in: intermediaryIds } },
        select: { id: true, name: true, intermediaryCategory: true },
      }),
    ]);

    const groupById = new Map(groups.map((group) => [group.id, group]));
    const providerById = new Map(providers.map((provider) => [provider.id, provider]));
    const memberById = new Map(members.map((member) => [member.id, member]));
    const intermediaryById = new Map(intermediaries.map((intermediary) => [intermediary.id, intermediary]));

    return {
      alerts: alerts.map((alert) => {
        const member = alert.memberId ? memberById.get(alert.memberId) : null;
        const provider = alert.providerId ? providerById.get(alert.providerId) : null;
        const intermediary = alert.intermediaryId ? intermediaryById.get(alert.intermediaryId) : null;
        return {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          title: alert.title,
          message: alert.message,
          metricKey: alert.metricKey,
          metricValue: toNumber(alert.metricValue),
          thresholdValue: toNumber(alert.thresholdValue),
          context: alert.context,
          groupId: alert.groupId,
          groupName: alert.groupId ? groupById.get(alert.groupId)?.name ?? null : null,
          providerId: alert.providerId,
          providerName: provider?.name ?? null,
          providerTier: provider?.tier ?? null,
          providerType: provider?.type ?? null,
          memberId: alert.memberId,
          memberNumber: member?.memberNumber ?? null,
          memberName: member ? `${member.firstName} ${member.lastName}` : null,
          intermediaryId: alert.intermediaryId,
          intermediaryName: intermediary?.name ?? null,
          intermediaryCategory: intermediary?.intermediaryCategory ?? null,
          acknowledgedById: alert.acknowledgedById,
          acknowledgedAt: alert.acknowledgedAt,
          resolvedById: alert.resolvedById,
          resolvedAt: alert.resolvedAt,
          resolutionNote: alert.resolutionNote,
          createdAt: alert.createdAt,
          updatedAt: alert.updatedAt,
        };
      }),
      statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count.id])),
      severityCounts: Object.fromEntries(severityCounts.map((row) => [row.severity, row._count.id])),
    };
  }

  static async acknowledgeAlert(scope: AnalyticsScope, alertId: string, userId: string) {
    const alert = await prisma.analyticsAlert.findFirst({
      where: {
        id: alertId,
        tenantId: scope.tenantId,
        ...(scope.groupId ? { groupId: scope.groupId } : {}),
        ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
      },
      select: { id: true, status: true },
    });

    if (!alert) return null;
    if (alert.status !== "OPEN") return alert;

    return prisma.analyticsAlert.update({
      where: { id: alert.id },
      data: {
        status: "ACKNOWLEDGED",
        acknowledgedById: userId,
        acknowledgedAt: new Date(),
      },
    });
  }

  static async resolveAlert(scope: AnalyticsScope, alertId: string, userId: string, resolutionNote?: string) {
    const alert = await prisma.analyticsAlert.findFirst({
      where: {
        id: alertId,
        tenantId: scope.tenantId,
        ...(scope.groupId ? { groupId: scope.groupId } : {}),
        ...(scope.intermediaryId ? { intermediaryId: scope.intermediaryId } : {}),
      },
      select: { id: true, status: true },
    });

    if (!alert) return null;
    if (alert.status === "RESOLVED") return alert;

    return prisma.analyticsAlert.update({
      where: { id: alert.id },
      data: {
        status: "RESOLVED",
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionNote: resolutionNote?.trim() || null,
        acknowledgedById: alert.status === "OPEN" ? userId : undefined,
        acknowledgedAt: alert.status === "OPEN" ? new Date() : undefined,
      },
    });
  }
}
