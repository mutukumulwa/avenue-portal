import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type RefreshRange = {
  tenantId?: string;
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
    const renewalAnalyses = await this.refreshRenewalAnalyses(range);

    return {
      caseMixWeights,
      encounterFacts,
      contributionFacts,
      mlrSnapshots,
      providerScorecards,
      renewalAnalyses,
    };
  }
}
