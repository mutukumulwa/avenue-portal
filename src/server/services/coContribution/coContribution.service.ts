import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { calculateCoContribution } from "./calculator";
import { providerToNetworkTier, resolveRule } from "./ruleResolver";

export interface CoContributionResult {
  finalAmount: Decimal;
  planShare: Decimal;
  transactionId: string;
}

export class CoContributionService {
  static async processClaimCoContribution(claimId: string): Promise<CoContributionResult> {
    const claim = await prisma.claim.findUniqueOrThrow({
      where: { id: claimId },
      include: {
        member: {
          include: {
            package: {
              include: {
                coContributionRules: true,
                annualCoContributionCap: true,
              },
            },
            principal: true,
            annualCoContributions: true,
          },
        },
        provider: true,
        claimLines: true,
      },
    });

    const { member, provider } = claim;
    const { package: pkg } = member;

    const networkTier = providerToNetworkTier(provider);
    const rule = resolveRule(
      pkg.coContributionRules,
      networkTier,
      claim.benefitCategory,
      claim.dateOfService,
    );

    // No rule configured — plan covers 100%
    if (!rule || rule.type === "NONE") {
      const tx = await prisma.coContributionTransaction.create({
        data: {
          claimId,
          memberId: member.id,
          tenantId: claim.tenantId,
          coContributionRuleId: rule?.id ?? undefined,
          serviceCost: claim.billedAmount,
          calculatedAmount: 0,
          cappedAmount: 0,
          finalAmount: 0,
          planShare: claim.billedAmount,
          annualCapApplied: false,
          capsApplied: [],
          collectionStatus: "COLLECTED",
        },
      });
      return {
        finalAmount: new Decimal(0),
        planShare: new Decimal(claim.billedAmount),
        transactionId: tx.id,
      };
    }

    // Determine annual cap data
    const capRecord = pkg.annualCoContributionCap;
    const membershipYear = claim.dateOfService.getFullYear();

    const memberYtd = await prisma.memberAnnualCoContribution.findUnique({
      where: { memberId_membershipYear: { memberId: member.id, membershipYear } },
    });

    const principalId = member.principalId ?? member.id;
    const familyYtd = await prisma.familyAnnualCoContribution.findUnique({
      where: { principalMemberId_membershipYear: { principalMemberId: principalId, membershipYear } },
    });

    const result = calculateCoContribution({
      rule,
      serviceCost: new Decimal(claim.billedAmount),
      memberYtdTotal: new Decimal(memberYtd?.totalCoContribution ?? 0),
      familyYtdTotal: new Decimal(familyYtd?.totalCoContribution ?? 0),
      individualCap: capRecord?.individualCap ? new Decimal(capRecord.individualCap) : null,
      familyCap: capRecord?.familyCap ? new Decimal(capRecord.familyCap) : null,
    });

    const tx = await prisma.$transaction(async (tx) => {
      const transaction = await tx.coContributionTransaction.create({
        data: {
          claimId,
          memberId: member.id,
          tenantId: claim.tenantId,
          coContributionRuleId: rule.id,
          serviceCost: claim.billedAmount,
          calculatedAmount: result.calculatedAmount.toFixed(2),
          cappedAmount: result.cappedAmount.toFixed(2),
          finalAmount: result.finalAmount.toFixed(2),
          planShare: result.planShare.toFixed(2),
          annualCapApplied: result.annualCapApplied,
          capsApplied: result.capsApplied,
          collectionStatus: "PENDING",
        },
      });

      // Upsert member annual accumulator
      await tx.memberAnnualCoContribution.upsert({
        where: { memberId_membershipYear: { memberId: member.id, membershipYear } },
        update: {
          totalCoContribution: { increment: result.finalAmount.toNumber() },
          capReached: result.annualCapApplied && result.capsApplied.includes("INDIVIDUAL_ANNUAL_CAP"),
        },
        create: {
          memberId: member.id,
          tenantId: claim.tenantId,
          membershipYear,
          totalCoContribution: result.finalAmount.toFixed(2),
          capReached: false,
        },
      });

      // Upsert family annual accumulator
      await tx.familyAnnualCoContribution.upsert({
        where: { principalMemberId_membershipYear: { principalMemberId: principalId, membershipYear } },
        update: {
          totalCoContribution: { increment: result.finalAmount.toNumber() },
          capReached: result.annualCapApplied && result.capsApplied.includes("FAMILY_ANNUAL_CAP"),
        },
        create: {
          principalMemberId: principalId,
          tenantId: claim.tenantId,
          membershipYear,
          totalCoContribution: result.finalAmount.toFixed(2),
          capReached: false,
        },
      });

      return transaction;
    });

    return {
      finalAmount: result.finalAmount,
      planShare: result.planShare,
      transactionId: tx.id,
    };
  }

  static async recordCollection(
    transactionId: string,
    amountCollected: Decimal,
    paymentMethod: string,
    mpesaRef?: string,
  ) {
    const existing = await prisma.coContributionTransaction.findUniqueOrThrow({
      where: { id: transactionId },
    });

    const finalAmount = new Decimal(existing.finalAmount);
    const status = amountCollected.gte(finalAmount) ? "COLLECTED" : "PARTIAL";

    return prisma.coContributionTransaction.update({
      where: { id: transactionId },
      data: {
        amountCollected: amountCollected.toFixed(2),
        collectionStatus: status,
        paymentMethod: paymentMethod as never,
        mpesaTransactionRef: mpesaRef,
      },
    });
  }

  static async waiveCoContribution(
    transactionId: string,
    reason: string,
    approvedBy: string,
  ) {
    return prisma.coContributionTransaction.update({
      where: { id: transactionId },
      data: {
        collectionStatus: "WAIVED",
        waiverReason: reason,
        waiverApprovedBy: approvedBy,
      },
    });
  }
}
