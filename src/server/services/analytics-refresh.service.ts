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

type DiagnosisShape = {
  icdCode?: string;
  code?: string;
  diagnosisCode?: string;
  isPrimary?: boolean;
};

const DEFAULT_CASE_MIX_WEIGHT = new Prisma.Decimal(1);

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

    return {
      caseMixWeights,
      encounterFacts,
      contributionFacts,
    };
  }
}
