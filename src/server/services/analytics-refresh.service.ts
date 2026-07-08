import {
  AnalyticsAlertSeverity,
  AnalyticsAlertType,
  Prisma,
  RiskTier,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type RefreshRange = {
  tenantId?: string;
  groupId?: string;
  from?: Date;
  to?: Date;
};

type ClaimWithAnalyticsDimensions = Prisma.ClaimGetPayload<{
  include: {
    claimLines: true;
    coContributionTransaction: true;
    member: {
      include: {
        group: true;
        dependents: { select: { id: true } };
        principal: { include: { dependents: { select: { id: true } } } };
      };
    };
    provider: true;
  };
}>;

type InvoiceWithAnalyticsDimensions = Prisma.InvoiceGetPayload<{
  include: {
    group: true;
  };
}>;

type MlrSourceRow = {
  tenantId: string;
  groupId: string | null;
  packageId: string | null;
  benefitTierId: string | null;
  intermediaryId: string | null;
  period: string;
  periodStart: Date;
  grossContribution: Prisma.Decimal;
  paidContribution: Prisma.Decimal;
  grossCost: Prisma.Decimal;
  benefitPaid: Prisma.Decimal;
  memberCoContribution: Prisma.Decimal;
};

type DiagnosisShape = {
  icdCode?: string;
  code?: string;
  diagnosisCode?: string;
  isPrimary?: boolean;
};

const DEFAULT_CASE_MIX_WEIGHT = new Prisma.Decimal(1);
const DEFAULT_TARGET_MLR = 0.75;
const DEFAULT_INFLATION_ASSUMPTION = 0.08;
const DEFAULT_RISK_CAP = 1_000_000;
const GENERATED_ALERT_SOURCE = "analytics-refresh";

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parsePeriod(period: string) {
  const [yearText, monthText] = period.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    const now = new Date();
    return { start: monthStart(now), end: monthEnd(now) };
  }

  const start = new Date(year, month - 1, 1);
  return { start, end: monthEnd(start) };
}

function calculateAge(dateOfBirth: Date, atDate: Date) {
  let age = atDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = atDate.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && atDate.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return Math.max(age, 0);
}

function ageBand(age: number | null) {
  if (age === null) return null;
  if (age <= 4) return "0-4";
  if (age <= 17) return "5-17";
  if (age <= 29) return "18-29";
  if (age <= 44) return "30-44";
  if (age <= 59) return "45-59";
  return "60+";
}

function familySizeBand(count: number) {
  if (count <= 1) return "1";
  if (count <= 3) return "2-3";
  if (count <= 5) return "4-5";
  return "6+";
}

function primaryDiagnosisFromJson(value: Prisma.JsonValue): DiagnosisShape | null {
  if (!Array.isArray(value)) return null;

  const diagnoses = value.filter((item): item is DiagnosisShape => {
    return typeof item === "object" && item !== null && !Array.isArray(item);
  });

  return diagnoses.find((item) => item.isPrimary) ?? diagnoses[0] ?? null;
}

function normalizeIcdFamily(icdCode: string | null | undefined) {
  if (!icdCode) return null;
  const normalized = icdCode.trim().toUpperCase();
  if (!normalized) return null;
  const [family] = normalized.split(".");
  return family.slice(0, 3);
}

function nonNegativeDecimal(value: number) {
  return new Prisma.Decimal(Math.max(value, 0).toFixed(2));
}

function decimalRatio(numerator: number, denominator: number, precision = 4) {
  if (denominator <= 0) return new Prisma.Decimal(0);
  return new Prisma.Decimal((numerator / denominator).toFixed(precision));
}

function periodFromDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function lineShare(lineBilled: number, claimBilled: number, lineCount: number) {
  if (claimBilled > 0) return lineBilled / claimBilled;
  if (lineCount > 0) return 1 / lineCount;
  return 1;
}

function chronicTagForIcdFamily(icdFamily: string | null) {
  if (!icdFamily) return null;
  if (icdFamily === "E10" || icdFamily === "E11") return "diabetes";
  if (icdFamily >= "I10" && icdFamily <= "I15") return "hypertension";
  if (icdFamily === "J45" || icdFamily === "J46") return "asthma";
  if (icdFamily === "N18" || icdFamily === "N19") return "renal-risk";
  if (icdFamily.startsWith("C")) return "oncology";
  if (icdFamily === "B20" || icdFamily === "B24") return "hiv-care";
  if (icdFamily.startsWith("O")) return "maternity";
  if (icdFamily.startsWith("F")) return "mental-health";
  if (icdFamily === "J18") return "respiratory-risk";
  if (icdFamily === "K35") return "surgical-risk";
  if (icdFamily.startsWith("M")) return "musculoskeletal";
  return null;
}

function riskTierForScore(score: number): RiskTier {
  if (score >= 0.85) return RiskTier.CRITICAL;
  if (score >= 0.65) return RiskTier.HIGH;
  if (score >= 0.4) return RiskTier.MODERATE;
  return RiskTier.LOW;
}

function alertSeverityForRatio(value: number, critical: number, warning: number): AnalyticsAlertSeverity {
  if (value >= critical) return AnalyticsAlertSeverity.CRITICAL;
  if (value >= warning) return AnalyticsAlertSeverity.WARNING;
  return AnalyticsAlertSeverity.INFO;
}

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function moneyShort(value: number) {
  if (value >= 1_000_000) return `UGX ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `UGX ${(value / 1_000).toFixed(0)}K`;
  return `UGX ${value.toLocaleString()}`;
}

export class AnalyticsRefreshService {
  static async refreshCaseMixWeights() {
    const defaults = [
      { icdFamily: "A09", label: "Gastroenteritis and diarrhoeal disease", weight: 0.85 },
      { icdFamily: "B54", label: "Malaria, unspecified", weight: 0.9 },
      { icdFamily: "E11", label: "Type 2 diabetes mellitus", weight: 1.35 },
      { icdFamily: "I10", label: "Essential hypertension", weight: 1.2 },
      { icdFamily: "J06", label: "Acute upper respiratory infections", weight: 0.75 },
      { icdFamily: "J18", label: "Pneumonia", weight: 1.6 },
      { icdFamily: "K35", label: "Acute appendicitis", weight: 1.75 },
      { icdFamily: "M54", label: "Back pain", weight: 0.95 },
      { icdFamily: "N39", label: "Urinary tract disorders", weight: 0.9 },
      { icdFamily: "O80", label: "Single spontaneous delivery", weight: 1.45 },
      { icdFamily: "R50", label: "Fever of other and unknown origin", weight: 0.8 },
      { icdFamily: "S09", label: "Head injury", weight: 1.25 },
      { icdFamily: "Z00", label: "General examination", weight: 0.7 },
    ];

    for (const item of defaults) {
      await prisma.caseMixWeight.upsert({
        where: { icdFamily: item.icdFamily },
        update: { label: item.label, weight: item.weight, isActive: true },
        create: item,
      });
    }

    return defaults.length;
  }

  static async refreshEncounterFacts(range: RefreshRange = {}) {
    const caseMixWeights = await prisma.caseMixWeight.findMany({
      where: { isActive: true },
      select: { icdFamily: true, weight: true },
    });
    const caseMixByFamily = new Map(caseMixWeights.map((weight) => [weight.icdFamily, weight.weight]));

    const claims = await prisma.claim.findMany({
      where: {
        tenantId: range.tenantId,
        dateOfService: {
          gte: range.from,
          lte: range.to,
        },
      },
      include: {
        claimLines: true,
        coContributionTransaction: true,
        member: {
          include: {
            group: true,
            dependents: { select: { id: true } },
            principal: { include: { dependents: { select: { id: true } } } },
          },
        },
        provider: true,
      },
      orderBy: { dateOfService: "asc" },
    });

    let upserted = 0;
    for (const claim of claims) {
      upserted += await this.upsertEncounterFactsForClaim(claim, caseMixByFamily);
    }

    return { claims: claims.length, facts: upserted };
  }

  private static async upsertEncounterFactsForClaim(
    claim: ClaimWithAnalyticsDimensions,
    caseMixByFamily: Map<string, Prisma.Decimal>,
  ) {
    const claimLines = claim.claimLines.length > 0 ? claim.claimLines : [null];
    const claimDiagnosis = primaryDiagnosisFromJson(claim.diagnoses);
    const claimIcdCode = claimDiagnosis?.icdCode ?? claimDiagnosis?.code ?? claimDiagnosis?.diagnosisCode ?? null;
    const claimBilled = Number(claim.billedAmount);
    const claimApproved = Number(claim.approvedAmount);
    const claimMemberShare = claim.coContributionTransaction
      ? Number(claim.coContributionTransaction.finalAmount)
      : Number(claim.memberLiability);
    const age = calculateAge(claim.member.dateOfBirth, claim.dateOfService);
    const dependentCount = claim.member.relationship === "PRINCIPAL"
      ? claim.member.dependents.length
      : claim.member.principal?.dependents.length ?? 0;
    const sourceFamilySize = 1 + dependentCount;

    for (const line of claimLines) {
      const sourceKey = line ? `claim-line:${line.id}` : `claim:${claim.id}`;
      const lineBilled = line ? Number(line.billedAmount) : claimBilled;
      const lineApproved = line ? Number(line.approvedAmount) : claimApproved;
      const share = lineShare(lineBilled, claimBilled, claimLines.length);
      const memberShare = claimMemberShare * share;
      const icdCode = line?.icdCode ?? claimIcdCode;
      const icdFamily = normalizeIcdFamily(icdCode);
      const caseMixWeight = icdFamily ? caseMixByFamily.get(icdFamily) : undefined;
      const usedDefaultCaseMix = !caseMixWeight;

      await prisma.analyticsEncounterFact.upsert({
        where: { sourceKey },
        update: {
          sourceClaimId: claim.id,
          sourceClaimLineId: line?.id ?? null,
          tenantId: claim.tenantId,
          groupId: claim.member.groupId,
          packageId: claim.member.packageId,
          benefitTierId: claim.member.benefitTierId,
          intermediaryId: claim.member.group.brokerId,
          memberId: claim.memberId,
          providerId: claim.providerId,
          providerTier: claim.provider.tier,
          providerType: claim.provider.type,
          isInternalProvider: claim.provider.tier === "OWN",
          encounterDate: claim.dateOfService,
          encounterMonth: monthStart(claim.dateOfService),
          encounterType: claim.serviceType,
          benefitCategory: claim.benefitCategory,
          icdCode,
          icdFamily,
          memberAge: age,
          memberAgeBand: ageBand(age),
          memberGender: claim.member.gender,
          memberRelationship: claim.member.relationship,
          familySizeBand: familySizeBand(sourceFamilySize),
          memberCounty: null,
          groupCounty: claim.member.group.county,
          providerCounty: claim.provider.county,
          grossCost: nonNegativeDecimal(lineBilled),
          benefitPaid: nonNegativeDecimal(lineApproved),
          memberCoContribution: nonNegativeDecimal(memberShare),
          rejectedAmount: nonNegativeDecimal(lineBilled - lineApproved),
          caseMixWeight: caseMixWeight ?? DEFAULT_CASE_MIX_WEIGHT,
          usedDefaultCaseMix,
          status: claim.status,
        },
        create: {
          sourceKey,
          sourceClaimId: claim.id,
          sourceClaimLineId: line?.id ?? null,
          tenantId: claim.tenantId,
          groupId: claim.member.groupId,
          packageId: claim.member.packageId,
          benefitTierId: claim.member.benefitTierId,
          intermediaryId: claim.member.group.brokerId,
          memberId: claim.memberId,
          providerId: claim.providerId,
          providerTier: claim.provider.tier,
          providerType: claim.provider.type,
          isInternalProvider: claim.provider.tier === "OWN",
          encounterDate: claim.dateOfService,
          encounterMonth: monthStart(claim.dateOfService),
          encounterType: claim.serviceType,
          benefitCategory: claim.benefitCategory,
          icdCode,
          icdFamily,
          memberAge: age,
          memberAgeBand: ageBand(age),
          memberGender: claim.member.gender,
          memberRelationship: claim.member.relationship,
          familySizeBand: familySizeBand(sourceFamilySize),
          memberCounty: null,
          groupCounty: claim.member.group.county,
          providerCounty: claim.provider.county,
          grossCost: nonNegativeDecimal(lineBilled),
          benefitPaid: nonNegativeDecimal(lineApproved),
          memberCoContribution: nonNegativeDecimal(memberShare),
          rejectedAmount: nonNegativeDecimal(lineBilled - lineApproved),
          caseMixWeight: caseMixWeight ?? DEFAULT_CASE_MIX_WEIGHT,
          usedDefaultCaseMix,
          status: claim.status,
        },
      });
    }

    return claimLines.length;
  }

  static async refreshContributionFacts(range: RefreshRange = {}) {
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: range.tenantId,
        createdAt: {
          gte: range.from,
          lte: range.to,
        },
      },
      include: {
        group: true,
      },
      orderBy: { period: "asc" },
    });

    for (const invoice of invoices) {
      await this.upsertContributionFactForInvoice(invoice);
    }

    return { invoices: invoices.length, facts: invoices.length };
  }

  static async refreshMlrSnapshots(range: RefreshRange = {}) {
    const contributionFacts = await prisma.analyticsContributionFact.findMany({
      where: {
        tenantId: range.tenantId,
        periodStart: { gte: range.from, lte: range.to },
      },
      select: {
        tenantId: true,
        groupId: true,
        packageId: true,
        benefitTierId: true,
        intermediaryId: true,
        period: true,
        periodStart: true,
        grossContribution: true,
        paidContribution: true,
      },
    });

    const encounterFacts = await prisma.analyticsEncounterFact.findMany({
      where: {
        tenantId: range.tenantId,
        encounterDate: { gte: range.from, lte: range.to },
      },
      select: {
        tenantId: true,
        groupId: true,
        packageId: true,
        benefitTierId: true,
        intermediaryId: true,
        encounterMonth: true,
        grossCost: true,
        benefitPaid: true,
        memberCoContribution: true,
      },
    });

    const aggregates = new Map<string, MlrSourceRow>();
    const addRow = (keyParts: {
      tenantId: string;
      groupId?: string | null;
      packageId?: string | null;
      benefitTierId?: string | null;
      intermediaryId?: string | null;
      period: string;
      periodStart: Date;
      grain: string;
    }, values: Partial<Pick<MlrSourceRow, "grossContribution" | "paidContribution" | "grossCost" | "benefitPaid" | "memberCoContribution">>) => {
      const key = [
        keyParts.tenantId,
        keyParts.grain,
        keyParts.period,
        keyParts.groupId ?? "",
        keyParts.packageId ?? "",
        keyParts.benefitTierId ?? "",
        keyParts.intermediaryId ?? "",
      ].join("|");
      const existing = aggregates.get(key) ?? {
        tenantId: keyParts.tenantId,
        groupId: keyParts.groupId ?? null,
        packageId: keyParts.packageId ?? null,
        benefitTierId: keyParts.benefitTierId ?? null,
        intermediaryId: keyParts.intermediaryId ?? null,
        period: keyParts.period,
        periodStart: keyParts.periodStart,
        grossContribution: new Prisma.Decimal(0),
        paidContribution: new Prisma.Decimal(0),
        grossCost: new Prisma.Decimal(0),
        benefitPaid: new Prisma.Decimal(0),
        memberCoContribution: new Prisma.Decimal(0),
      };

      existing.grossContribution = existing.grossContribution.plus(values.grossContribution ?? 0);
      existing.paidContribution = existing.paidContribution.plus(values.paidContribution ?? 0);
      existing.grossCost = existing.grossCost.plus(values.grossCost ?? 0);
      existing.benefitPaid = existing.benefitPaid.plus(values.benefitPaid ?? 0);
      existing.memberCoContribution = existing.memberCoContribution.plus(values.memberCoContribution ?? 0);
      aggregates.set(key, existing);
    };

    for (const fact of contributionFacts) {
      const values = {
        grossContribution: fact.grossContribution,
        paidContribution: fact.paidContribution,
      };
      addRow({ tenantId: fact.tenantId, period: fact.period, periodStart: fact.periodStart, grain: "PORTFOLIO" }, values);
      addRow({ tenantId: fact.tenantId, groupId: fact.groupId, period: fact.period, periodStart: fact.periodStart, grain: "SCHEME" }, values);
      if (fact.intermediaryId) {
        addRow({ tenantId: fact.tenantId, intermediaryId: fact.intermediaryId, period: fact.period, periodStart: fact.periodStart, grain: "INTERMEDIARY" }, values);
      }
    }

    for (const fact of encounterFacts) {
      const period = periodFromDate(fact.encounterMonth);
      const values = {
        grossCost: fact.grossCost,
        benefitPaid: fact.benefitPaid,
        memberCoContribution: fact.memberCoContribution,
      };
      addRow({ tenantId: fact.tenantId, period, periodStart: fact.encounterMonth, grain: "PORTFOLIO" }, values);
      addRow({ tenantId: fact.tenantId, groupId: fact.groupId, period, periodStart: fact.encounterMonth, grain: "SCHEME" }, values);
      if (fact.intermediaryId) {
        addRow({ tenantId: fact.tenantId, intermediaryId: fact.intermediaryId, period, periodStart: fact.encounterMonth, grain: "INTERMEDIARY" }, values);
      }
    }

    const periods = [...new Set([...aggregates.values()].map((row) => row.period))];
    if (periods.length > 0) {
      await prisma.analyticsMlrSnapshot.deleteMany({
        where: {
          tenantId: range.tenantId,
          period: { in: periods },
        },
      });
    }

    const rows = [...aggregates.values()].map((row) => {
      const numerator = Number(row.benefitPaid.plus(row.memberCoContribution));
      const denominator = Number(row.grossContribution);
      return {
        ...row,
        grain: row.groupId ? "SCHEME" : row.intermediaryId ? "INTERMEDIARY" : "PORTFOLIO",
        mlr: decimalRatio(numerator, denominator),
        trailing12Mlr: decimalRatio(numerator, denominator),
      };
    });

    if (rows.length > 0) {
      await prisma.analyticsMlrSnapshot.createMany({ data: rows });
    }

    return { snapshots: rows.length };
  }

  static async refreshProviderScorecards(range: RefreshRange = {}) {
    const facts = await prisma.analyticsEncounterFact.findMany({
      where: {
        tenantId: range.tenantId,
        encounterDate: { gte: range.from, lte: range.to },
      },
      select: {
        tenantId: true,
        providerId: true,
        providerTier: true,
        providerType: true,
        encounterMonth: true,
        memberId: true,
        grossCost: true,
        benefitPaid: true,
        rejectedAmount: true,
        caseMixWeight: true,
      },
    });

    const providerIds = [...new Set(facts.map((fact) => fact.providerId))];
    const providers = await prisma.provider.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, name: true },
    });
    const providerNameById = new Map(providers.map((provider) => [provider.id, provider.name]));

    const aggregates = new Map<string, {
      tenantId: string;
      providerId: string;
      providerTier: typeof facts[number]["providerTier"];
      providerType: typeof facts[number]["providerType"];
      period: string;
      periodStart: Date;
      members: Set<string>;
      claimCount: number;
      grossCost: Prisma.Decimal;
      adjustedCost: Prisma.Decimal;
      rejectedAmount: Prisma.Decimal;
      benefitPaid: Prisma.Decimal;
      caseMixTotal: Prisma.Decimal;
    }>();

    for (const fact of facts) {
      const period = periodFromDate(fact.encounterMonth);
      const key = `${fact.tenantId}|${fact.providerId}|${period}`;
      const existing = aggregates.get(key) ?? {
        tenantId: fact.tenantId,
        providerId: fact.providerId,
        providerTier: fact.providerTier,
        providerType: fact.providerType,
        period,
        periodStart: fact.encounterMonth,
        members: new Set<string>(),
        claimCount: 0,
        grossCost: new Prisma.Decimal(0),
        adjustedCost: new Prisma.Decimal(0),
        rejectedAmount: new Prisma.Decimal(0),
        benefitPaid: new Prisma.Decimal(0),
        caseMixTotal: new Prisma.Decimal(0),
      };

      const weight = Number(fact.caseMixWeight) > 0 ? fact.caseMixWeight : DEFAULT_CASE_MIX_WEIGHT;
      existing.members.add(fact.memberId);
      existing.claimCount += 1;
      existing.grossCost = existing.grossCost.plus(fact.grossCost);
      existing.adjustedCost = existing.adjustedCost.plus(fact.grossCost.div(weight));
      existing.rejectedAmount = existing.rejectedAmount.plus(fact.rejectedAmount);
      existing.benefitPaid = existing.benefitPaid.plus(fact.benefitPaid);
      existing.caseMixTotal = existing.caseMixTotal.plus(weight);
      aggregates.set(key, existing);
    }

    const periods = [...new Set([...aggregates.values()].map((row) => row.period))];
    if (periods.length > 0) {
      await prisma.providerScorecard.deleteMany({
        where: {
          tenantId: range.tenantId,
          period: { in: periods },
        },
      });
    }

    const rows = [...aggregates.values()].map((row) => {
      const grossCost = Number(row.grossCost);
      const rejected = Number(row.rejectedAmount);
      const benefitPaid = Number(row.benefitPaid);
      return {
        tenantId: row.tenantId,
        providerId: row.providerId,
        providerName: providerNameById.get(row.providerId) ?? "Unknown Provider",
        providerTier: row.providerTier,
        providerType: row.providerType,
        period: row.period,
        periodStart: row.periodStart,
        claimCount: row.claimCount,
        memberCount: row.members.size,
        grossCost: row.grossCost,
        adjustedCost: row.adjustedCost,
        averageCost: row.claimCount > 0 ? new Prisma.Decimal((grossCost / row.claimCount).toFixed(2)) : new Prisma.Decimal(0),
        caseMixIndex: row.claimCount > 0 ? new Prisma.Decimal((Number(row.caseMixTotal) / row.claimCount).toFixed(4)) : DEFAULT_CASE_MIX_WEIGHT,
        rejectionRate: decimalRatio(rejected, benefitPaid + rejected),
      };
    });

    if (rows.length > 0) {
      await prisma.providerScorecard.createMany({ data: rows });
    }

    return { scorecards: rows.length };
  }

  static async refreshMemberRiskProfiles(range: RefreshRange = {}) {
    const now = new Date();
    const trailingStart = range.from ?? addMonths(now, -12);
    const trailingEnd = range.to ?? now;
    const recentStart = addMonths(now, -3);

    const memberAggregates = await prisma.analyticsEncounterFact.groupBy({
      by: ["tenantId", "groupId", "memberId"],
      where: {
        tenantId: range.tenantId,
        groupId: range.groupId,
        encounterDate: { gte: trailingStart, lte: trailingEnd },
      },
      _sum: {
        grossCost: true,
        benefitPaid: true,
        memberCoContribution: true,
        caseMixWeight: true,
      },
      _count: { id: true },
    });

    const memberIds = memberAggregates.map((row) => row.memberId);
    if (memberIds.length === 0) {
      return { riskProfiles: 0 };
    }

    const [members, icdFacts, recentFacts, preauthCounts] = await Promise.all([
      prisma.member.findMany({
        where: {
          id: { in: memberIds },
          tenantId: range.tenantId,
          groupId: range.groupId,
        },
        select: {
          id: true,
          package: { select: { annualLimit: true } },
        },
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["memberId", "icdFamily"],
        where: {
          tenantId: range.tenantId,
          groupId: range.groupId,
          memberId: { in: memberIds },
          encounterDate: { gte: trailingStart, lte: trailingEnd },
          icdFamily: { not: null },
        },
        _sum: { benefitPaid: true, grossCost: true },
        _count: { id: true },
        orderBy: { _sum: { grossCost: "desc" } },
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["memberId"],
        where: {
          tenantId: range.tenantId,
          groupId: range.groupId,
          memberId: { in: memberIds },
          encounterDate: { gte: recentStart, lte: trailingEnd },
        },
        _count: { id: true },
      }),
      prisma.preAuthorization.groupBy({
        by: ["memberId"],
        where: {
          tenantId: range.tenantId,
          memberId: { in: memberIds },
          createdAt: { gte: recentStart, lte: trailingEnd },
        },
        _count: { id: true },
      }),
    ]);

    const memberById = new Map(members.map((member) => [member.id, member]));
    const recentClaimsByMember = new Map(recentFacts.map((fact) => [fact.memberId, fact._count.id]));
    const preauthsByMember = new Map(preauthCounts.map((preauth) => [preauth.memberId, preauth._count.id]));
    const chronicTagsByMember = new Map<string, Set<string>>();

    for (const fact of icdFacts) {
      const tag = chronicTagForIcdFamily(fact.icdFamily);
      if (!tag) continue;
      const tags = chronicTagsByMember.get(fact.memberId) ?? new Set<string>();
      tags.add(tag);
      chronicTagsByMember.set(fact.memberId, tags);
    }

    let upserted = 0;
    for (const aggregate of memberAggregates) {
      const member = memberById.get(aggregate.memberId);
      if (!member) continue;

      const trailing12ClaimCost = Number(aggregate._sum.benefitPaid ?? 0) + Number(aggregate._sum.memberCoContribution ?? 0);
      const annualLimit = Number(member.package?.annualLimit ?? DEFAULT_RISK_CAP) || DEFAULT_RISK_CAP;
      const utilizationToCap = annualLimit > 0 ? trailing12ClaimCost / annualLimit : 0;
      const claimCount = aggregate._count.id;
      const averageCaseMix = claimCount > 0 ? Number(aggregate._sum.caseMixWeight ?? 0) / claimCount : 1;
      const chronicTags = Array.from(chronicTagsByMember.get(aggregate.memberId) ?? []);
      const recentClaimCount = recentClaimsByMember.get(aggregate.memberId) ?? 0;
      const recentPreauthCount = preauthsByMember.get(aggregate.memberId) ?? 0;

      const utilizationScore = Math.min(utilizationToCap / 1.1, 1) * 0.4;
      const frequencyScore = Math.min(claimCount / 12, 1) * 0.2;
      const chronicScore = Math.min(chronicTags.length / 3, 1) * 0.2;
      const caseMixScore = Math.min(Math.max(averageCaseMix - 1, 0) / 1.5, 1) * 0.1;
      const recentActivityScore = Math.min((recentClaimCount + recentPreauthCount) / 6, 1) * 0.1;
      const riskScore = Math.min(
        utilizationScore + frequencyScore + chronicScore + caseMixScore + recentActivityScore,
        1,
      );
      const riskTier = riskTierForScore(riskScore);

      const elapsedDays = Math.max(
        1,
        Math.ceil((Math.min(trailingEnd.getTime(), now.getTime()) - trailingStart.getTime()) / (1000 * 3600 * 24)),
      );
      const dailyBurn = trailing12ClaimCost / elapsedDays;
      const projectedExceedDate = dailyBurn > 0 && utilizationToCap >= 0.55
        ? addDays(trailingStart, Math.ceil(annualLimit / dailyBurn))
        : null;

      await prisma.memberRiskProfile.upsert({
        where: { memberId: aggregate.memberId },
        update: {
          tenantId: aggregate.tenantId,
          groupId: aggregate.groupId,
          riskTier,
          riskScore: new Prisma.Decimal(riskScore.toFixed(4)),
          chronicTags,
          utilizationToCap: new Prisma.Decimal(utilizationToCap.toFixed(4)),
          projectedExceedDate,
          trailing12ClaimCost: new Prisma.Decimal(trailing12ClaimCost.toFixed(2)),
          trailing12ClaimCount: claimCount,
          lastCalculatedAt: now,
        },
        create: {
          tenantId: aggregate.tenantId,
          groupId: aggregate.groupId,
          memberId: aggregate.memberId,
          riskTier,
          riskScore: new Prisma.Decimal(riskScore.toFixed(4)),
          chronicTags,
          utilizationToCap: new Prisma.Decimal(utilizationToCap.toFixed(4)),
          projectedExceedDate,
          trailing12ClaimCost: new Prisma.Decimal(trailing12ClaimCost.toFixed(2)),
          trailing12ClaimCount: claimCount,
          lastCalculatedAt: now,
        },
      });

      upserted += 1;
    }

    return { riskProfiles: upserted };
  }

  static async refreshRenewalAnalyses(options: RefreshRange & { daysAhead?: number } = {}) {
    const now = new Date();
    const horizon = addDays(now, options.daysAhead ?? 90);
    const trailingStart = addMonths(now, -12);
    const currentYearStart = new Date(now.getFullYear(), 0, 1);

    const groups = await prisma.group.findMany({
      where: {
        tenantId: options.tenantId,
        status: "ACTIVE",
        renewalDate: {
          gte: now,
          lte: horizon,
        },
      },
      select: {
        id: true,
        tenantId: true,
        renewalDate: true,
        contributionRate: true,
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
      },
      orderBy: { renewalDate: "asc" },
    });

    for (const group of groups) {
      const [trailingClaims, trailingContribution, currentClaims, currentContribution, topIcdFacts, topUtilizerFacts] = await Promise.all([
        prisma.analyticsEncounterFact.aggregate({
          where: {
            tenantId: group.tenantId,
            groupId: group.id,
            encounterDate: { gte: trailingStart, lte: now },
          },
          _sum: { benefitPaid: true, memberCoContribution: true, grossCost: true },
          _count: { id: true },
        }),
        prisma.analyticsContributionFact.aggregate({
          where: {
            tenantId: group.tenantId,
            groupId: group.id,
            periodStart: { gte: trailingStart, lte: now },
          },
          _sum: { grossContribution: true, paidContribution: true },
        }),
        prisma.analyticsEncounterFact.aggregate({
          where: {
            tenantId: group.tenantId,
            groupId: group.id,
            encounterDate: { gte: currentYearStart, lte: now },
          },
          _sum: { benefitPaid: true, memberCoContribution: true },
        }),
        prisma.analyticsContributionFact.aggregate({
          where: {
            tenantId: group.tenantId,
            groupId: group.id,
            periodStart: { gte: currentYearStart, lte: now },
          },
          _sum: { grossContribution: true },
        }),
        prisma.analyticsEncounterFact.groupBy({
          by: ["icdFamily"],
          where: {
            tenantId: group.tenantId,
            groupId: group.id,
            encounterDate: { gte: trailingStart, lte: now },
            icdFamily: { not: null },
          },
          _sum: { grossCost: true, benefitPaid: true },
          _count: { id: true },
          orderBy: { _sum: { grossCost: "desc" } },
          take: 5,
        }),
        prisma.analyticsEncounterFact.groupBy({
          by: ["memberId"],
          where: {
            tenantId: group.tenantId,
            groupId: group.id,
            encounterDate: { gte: trailingStart, lte: now },
          },
          _sum: { grossCost: true, benefitPaid: true },
          _count: { id: true },
          orderBy: { _sum: { grossCost: "desc" } },
          take: 10,
        }),
      ]);

      const trailingClaimsCost = Number(trailingClaims._sum.benefitPaid ?? 0) + Number(trailingClaims._sum.memberCoContribution ?? 0);
      const trailingContributions = Number(trailingContribution._sum.grossContribution ?? 0);
      const currentClaimsCost = Number(currentClaims._sum.benefitPaid ?? 0) + Number(currentClaims._sum.memberCoContribution ?? 0);
      const currentContributions = Number(currentContribution._sum.grossContribution ?? 0);
      const projectedClaims = trailingClaimsCost * (1 + DEFAULT_INFLATION_ASSUMPTION);
      const recommendedContribution = DEFAULT_TARGET_MLR > 0 ? projectedClaims / DEFAULT_TARGET_MLR : 0;
      const recommendedAdjustmentPct = trailingContributions > 0
        ? (recommendedContribution - trailingContributions) / trailingContributions
        : 0;

      const topIcdDrivers = topIcdFacts.map((driver) => ({
        icdFamily: driver.icdFamily,
        grossCost: Number(driver._sum.grossCost ?? 0),
        benefitPaid: Number(driver._sum.benefitPaid ?? 0),
        encounterCount: driver._count.id,
      }));
      const anonymizedTopUtilizers = topUtilizerFacts.map((utilizer, index) => ({
        label: `Member ${index + 1}`,
        memberHash: utilizer.memberId.slice(-6),
        grossCost: Number(utilizer._sum.grossCost ?? 0),
        benefitPaid: Number(utilizer._sum.benefitPaid ?? 0),
        encounterCount: utilizer._count.id,
      }));

      await prisma.renewalAnalysis.upsert({
        where: {
          groupId_renewalDate: {
            groupId: group.id,
            renewalDate: group.renewalDate,
          },
        },
        update: {
          tenantId: group.tenantId,
          trailing12Mlr: decimalRatio(trailingClaimsCost, trailingContributions),
          currentYearMlr: decimalRatio(currentClaimsCost, currentContributions),
          targetMlr: DEFAULT_TARGET_MLR,
          currentContribution: new Prisma.Decimal(trailingContributions.toFixed(2)),
          projectedClaims: new Prisma.Decimal(projectedClaims.toFixed(2)),
          recommendedContribution: new Prisma.Decimal(recommendedContribution.toFixed(2)),
          recommendedAdjustmentPct: new Prisma.Decimal(recommendedAdjustmentPct.toFixed(4)),
          topIcdDrivers,
          anonymizedTopUtilizers,
          simulatorDefaults: {
            targetMlr: DEFAULT_TARGET_MLR,
            inflationAssumption: DEFAULT_INFLATION_ASSUMPTION,
            activeMembers: group._count.members,
            currentRatePerMember: Number(group.contributionRate),
          },
          lastCalculatedAt: now,
        },
        create: {
          tenantId: group.tenantId,
          groupId: group.id,
          renewalDate: group.renewalDate,
          trailing12Mlr: decimalRatio(trailingClaimsCost, trailingContributions),
          currentYearMlr: decimalRatio(currentClaimsCost, currentContributions),
          targetMlr: DEFAULT_TARGET_MLR,
          currentContribution: new Prisma.Decimal(trailingContributions.toFixed(2)),
          projectedClaims: new Prisma.Decimal(projectedClaims.toFixed(2)),
          recommendedContribution: new Prisma.Decimal(recommendedContribution.toFixed(2)),
          recommendedAdjustmentPct: new Prisma.Decimal(recommendedAdjustmentPct.toFixed(4)),
          topIcdDrivers,
          anonymizedTopUtilizers,
          simulatorDefaults: {
            targetMlr: DEFAULT_TARGET_MLR,
            inflationAssumption: DEFAULT_INFLATION_ASSUMPTION,
            activeMembers: group._count.members,
            currentRatePerMember: Number(group.contributionRate),
          },
          lastCalculatedAt: now,
        },
      });
    }

    return { renewalAnalyses: groups.length };
  }

  static async refreshAnalyticsAlerts(range: RefreshRange = {}) {
    const now = new Date();
    const horizon = addDays(now, 90);
    const recentStart = addMonths(now, -3);
    const previousStart = addMonths(now, -6);

    await prisma.analyticsAlert.deleteMany({
      where: {
        tenantId: range.tenantId,
        groupId: range.groupId,
        context: { path: ["source"], equals: GENERATED_ALERT_SOURCE },
      },
    });

    const alerts: Prisma.AnalyticsAlertCreateManyInput[] = [];
    const groups = await prisma.group.findMany({
      where: {
        tenantId: range.tenantId,
        ...(range.groupId ? { id: range.groupId } : {}),
      },
      select: { id: true, name: true, brokerId: true },
    });
    const groupById = new Map(groups.map((group) => [group.id, group]));

    const [renewalAnalyses, contributionFacts, criticalRiskProfiles, latestScorecard, recentGroupFacts, previousGroupFacts] = await Promise.all([
      prisma.renewalAnalysis.findMany({
        where: {
          tenantId: range.tenantId,
          ...(range.groupId ? { groupId: range.groupId } : {}),
        },
        orderBy: { renewalDate: "asc" },
      }),
      prisma.analyticsContributionFact.groupBy({
        by: ["tenantId", "groupId", "intermediaryId"],
        where: {
          tenantId: range.tenantId,
          groupId: range.groupId,
          periodStart: { gte: recentStart, lte: now },
        },
        _sum: { grossContribution: true, paidContribution: true, outstandingAmount: true },
      }),
      prisma.memberRiskProfile.findMany({
        where: {
          tenantId: range.tenantId,
          groupId: range.groupId,
          riskTier: { in: [RiskTier.HIGH, RiskTier.CRITICAL] },
        },
        orderBy: [{ riskTier: "desc" }, { riskScore: "desc" }],
        take: 100,
      }),
      prisma.providerScorecard.findFirst({
        where: { tenantId: range.tenantId },
        orderBy: { periodStart: "desc" },
        select: { period: true },
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["tenantId", "groupId"],
        where: {
          tenantId: range.tenantId,
          groupId: range.groupId,
          encounterDate: { gte: recentStart, lte: now },
        },
        _sum: { benefitPaid: true, memberCoContribution: true },
        _count: { id: true },
      }),
      prisma.analyticsEncounterFact.groupBy({
        by: ["tenantId", "groupId"],
        where: {
          tenantId: range.tenantId,
          groupId: range.groupId,
          encounterDate: { gte: previousStart, lt: recentStart },
        },
        _sum: { benefitPaid: true, memberCoContribution: true },
        _count: { id: true },
      }),
    ]);

    for (const analysis of renewalAnalyses) {
      const group = groupById.get(analysis.groupId);
      const groupName = group?.name ?? "Scheme";
      const trailingMlr = Number(analysis.trailing12Mlr);
      const targetMlr = Number(analysis.targetMlr);
      const adjustment = Number(analysis.recommendedAdjustmentPct);
      const daysToRenewal = Math.ceil((analysis.renewalDate.getTime() - now.getTime()) / (1000 * 3600 * 24));

      if (trailingMlr >= Math.max(0.85, targetMlr + 0.08)) {
        alerts.push({
          tenantId: analysis.tenantId,
          groupId: analysis.groupId,
          intermediaryId: group?.brokerId,
          type: AnalyticsAlertType.MLR_DRIFT,
          severity: alertSeverityForRatio(trailingMlr, 1, 0.85),
          status: "OPEN",
          title: `${groupName} MLR above target`,
          message: `Trailing MLR is ${pct(trailingMlr)} against a ${pct(targetMlr)} target.`,
          metricKey: "trailing12Mlr",
          metricValue: new Prisma.Decimal(trailingMlr.toFixed(4)),
          thresholdValue: new Prisma.Decimal(targetMlr.toFixed(4)),
          context: { source: GENERATED_ALERT_SOURCE, renewalAnalysisId: analysis.id },
        });
      }

      if (analysis.renewalDate <= horizon && adjustment >= 0.1) {
        alerts.push({
          tenantId: analysis.tenantId,
          groupId: analysis.groupId,
          intermediaryId: group?.brokerId,
          type: AnalyticsAlertType.RENEWAL_RISK,
          severity: alertSeverityForRatio(adjustment, 0.2, 0.1),
          status: "OPEN",
          title: `${groupName} renewal needs pricing action`,
          message: `Recommended contribution adjustment is ${pct(adjustment)} with renewal due in ${daysToRenewal} days.`,
          metricKey: "recommendedAdjustmentPct",
          metricValue: new Prisma.Decimal(adjustment.toFixed(4)),
          thresholdValue: new Prisma.Decimal("0.1000"),
          context: { source: GENERATED_ALERT_SOURCE, renewalAnalysisId: analysis.id, dueInDays: daysToRenewal },
        });
      }
    }

    for (const fact of contributionFacts) {
      const gross = Number(fact._sum.grossContribution ?? 0);
      if (gross <= 0) continue;
      const paid = Number(fact._sum.paidContribution ?? 0);
      const outstanding = Number(fact._sum.outstandingAmount ?? 0);
      const collectionRate = paid / gross;
      if (collectionRate >= 0.9 && outstanding < gross * 0.15) continue;

      const group = groupById.get(fact.groupId);
      alerts.push({
        tenantId: fact.tenantId,
        groupId: fact.groupId,
        intermediaryId: fact.intermediaryId,
        type: AnalyticsAlertType.CONTRIBUTION_SHORTFALL,
        severity: collectionRate < 0.75 ? AnalyticsAlertSeverity.CRITICAL : AnalyticsAlertSeverity.WARNING,
        status: "OPEN",
        title: `${group?.name ?? "Scheme"} contribution collection shortfall`,
        message: `Collection rate is ${pct(collectionRate)} with ${moneyShort(outstanding)} outstanding over the recent period.`,
        metricKey: "collectionRate",
        metricValue: new Prisma.Decimal(collectionRate.toFixed(4)),
        thresholdValue: new Prisma.Decimal("0.9000"),
        context: { source: GENERATED_ALERT_SOURCE, outstandingAmount: outstanding, grossContribution: gross },
      });
    }

    const previousByGroup = new Map(previousGroupFacts.map((fact) => [fact.groupId, fact]));
    for (const fact of recentGroupFacts) {
      const previous = previousByGroup.get(fact.groupId);
      const recentCost = Number(fact._sum.benefitPaid ?? 0) + Number(fact._sum.memberCoContribution ?? 0);
      const previousCost = Number(previous?._sum.benefitPaid ?? 0) + Number(previous?._sum.memberCoContribution ?? 0);
      const spikeRatio = previousCost > 0 ? recentCost / previousCost : 0;
      if (spikeRatio < 1.35 || fact._count.id < 3) continue;

      const group = groupById.get(fact.groupId);
      alerts.push({
        tenantId: fact.tenantId,
        groupId: fact.groupId,
        intermediaryId: group?.brokerId,
        type: AnalyticsAlertType.UTILIZATION_SPIKE,
        severity: alertSeverityForRatio(spikeRatio, 1.75, 1.35),
        status: "OPEN",
        title: `${group?.name ?? "Scheme"} utilization spike`,
        message: `Recent claim cost is ${spikeRatio.toFixed(2)}x the prior comparable period.`,
        metricKey: "recentCostIndex",
        metricValue: new Prisma.Decimal(spikeRatio.toFixed(4)),
        thresholdValue: new Prisma.Decimal("1.3500"),
        context: { source: GENERATED_ALERT_SOURCE, recentCost, previousCost },
      });
    }

    if (latestScorecard?.period) {
      const scorecards = await prisma.providerScorecard.findMany({
        where: {
          tenantId: range.tenantId,
          period: latestScorecard.period,
          claimCount: { gte: 3 },
        },
      });
      const byTier = new Map<string, typeof scorecards>();
      for (const scorecard of scorecards) {
        const key = `${scorecard.providerTier}:${scorecard.providerType}`;
        byTier.set(key, [...(byTier.get(key) ?? []), scorecard]);
      }

      for (const scorecard of scorecards) {
        const peers = byTier.get(`${scorecard.providerTier}:${scorecard.providerType}`) ?? [];
        if (peers.length < 2) continue;
        const peerAverage = peers.reduce((sum, peer) => sum + Number(peer.adjustedCost), 0) / peers.length;
        const adjustedCost = Number(scorecard.adjustedCost);
        const index = peerAverage > 0 ? adjustedCost / peerAverage : 0;
        if (index < 1.25) continue;

        alerts.push({
          tenantId: scorecard.tenantId,
          providerId: scorecard.providerId,
          type: AnalyticsAlertType.PROVIDER_ANOMALY,
          severity: alertSeverityForRatio(index, 1.6, 1.25),
          status: "OPEN",
          title: `${scorecard.providerName} adjusted cost above peer benchmark`,
          message: `Case-mix-adjusted cost is ${index.toFixed(2)}x the peer average for ${latestScorecard.period}.`,
          metricKey: "adjustedCostIndex",
          metricValue: new Prisma.Decimal(index.toFixed(4)),
          thresholdValue: new Prisma.Decimal("1.2500"),
          context: { source: GENERATED_ALERT_SOURCE, period: latestScorecard.period, peerAverage, adjustedCost },
        });
      }
    }

    for (const profile of criticalRiskProfiles) {
      if (profile.riskTier !== RiskTier.CRITICAL && Number(profile.utilizationToCap) < 0.85) continue;
      const group = groupById.get(profile.groupId);
      alerts.push({
        tenantId: profile.tenantId,
        groupId: profile.groupId,
        memberId: profile.memberId,
        intermediaryId: group?.brokerId,
        type: AnalyticsAlertType.MEMBER_RISK,
        severity: profile.riskTier === RiskTier.CRITICAL ? AnalyticsAlertSeverity.CRITICAL : AnalyticsAlertSeverity.WARNING,
        status: "OPEN",
        title: `${group?.name ?? "Scheme"} member risk escalation`,
        message: `A member is ${profile.riskTier.toLowerCase()} risk with ${pct(Number(profile.utilizationToCap))} utilization to cap.`,
        metricKey: "riskScore",
        metricValue: profile.riskScore,
        thresholdValue: new Prisma.Decimal("0.6500"),
        context: {
          source: GENERATED_ALERT_SOURCE,
          utilizationToCap: Number(profile.utilizationToCap),
          chronicTags: profile.chronicTags,
        },
      });
    }

    if (alerts.length > 0) {
      await prisma.analyticsAlert.createMany({ data: alerts });
    }

    return { alerts: alerts.length };
  }

  private static async upsertContributionFactForInvoice(invoice: InvoiceWithAnalyticsDimensions) {
    const { start, end } = parsePeriod(invoice.period);
    const sourceKey = `invoice:${invoice.id}`;

    await prisma.analyticsContributionFact.upsert({
      where: { sourceKey },
      update: {
        sourceInvoiceId: invoice.id,
        sourcePaymentId: null,
        tenantId: invoice.tenantId,
        groupId: invoice.groupId,
        packageId: invoice.group.packageId,
        benefitTierId: null,
        intermediaryId: invoice.group.brokerId,
        period: invoice.period,
        periodStart: start,
        periodEnd: end,
        memberCount: invoice.memberCount,
        grossContribution: invoice.totalAmount,
        paidContribution: invoice.paidAmount,
        outstandingAmount: invoice.balance,
      },
      create: {
        sourceKey,
        sourceInvoiceId: invoice.id,
        sourcePaymentId: null,
        tenantId: invoice.tenantId,
        groupId: invoice.groupId,
        packageId: invoice.group.packageId,
        benefitTierId: null,
        intermediaryId: invoice.group.brokerId,
        period: invoice.period,
        periodStart: start,
        periodEnd: end,
        memberCount: invoice.memberCount,
        grossContribution: invoice.totalAmount,
        paidContribution: invoice.paidAmount,
        outstandingAmount: invoice.balance,
      },
    });
  }

  static async refreshFoundation(range: RefreshRange = {}) {
    const caseMixWeights = await this.refreshCaseMixWeights();
    const encounterFacts = await this.refreshEncounterFacts(range);
    const contributionFacts = await this.refreshContributionFacts(range);
    const mlrSnapshots = await this.refreshMlrSnapshots(range);
    const providerScorecards = await this.refreshProviderScorecards(range);
    const memberRiskProfiles = await this.refreshMemberRiskProfiles(range);
    const renewalAnalyses = await this.refreshRenewalAnalyses(range);
    const analyticsAlerts = await this.refreshAnalyticsAlerts(range);

    return {
      caseMixWeights,
      encounterFacts,
      contributionFacts,
      mlrSnapshots,
      providerScorecards,
      memberRiskProfiles,
      renewalAnalyses,
      analyticsAlerts,
    };
  }
}
