import { prisma } from "@/lib/prisma";
import { ClaimsService } from "@/server/services/claims.service";
import { MemberAppService } from "@/server/services/member-app.service";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import { ProvidersService } from "@/server/services/providers.service";
import type { BenefitCategory, ServiceType } from "@prisma/client";

const AUTO_APPROVE_CEILING = 15000;
const AUTO_APPROVE_CPT_CODES = new Set(["99213", "99214", "85025", "71046", "76700", "92004"]);

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function memberName(member: { firstName: string; lastName: string }) {
  return `${member.firstName} ${member.lastName}`;
}

export type MemberPreAuthRequestInput = {
  memberId?: string;
  providerId: string;
  procedureCode: string;
  expectedDateOfService?: Date;
  diagnosis: string;
  clinicalNotes?: string;
};

export class MemberPreAuthService {
  static async getRequestOptions(userId: string, tenantId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const allowedMemberIds = [context.id, ...context.dependents.filter((dependent) => dependent.status === "ACTIVE").map((dependent) => dependent.id)];

    const [members, providers] = await Promise.all([
      prisma.member.findMany({
        where: { tenantId, id: { in: allowedMemberIds } },
        select: { id: true, firstName: true, lastName: true, memberNumber: true, relationship: true, status: true },
        orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
      }),
      prisma.provider.findMany({
        where: { tenantId, contractStatus: "ACTIVE" },
        select: { id: true, name: true, type: true, tier: true, servicesOffered: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return {
      members: members.map((member) => ({
        ...member,
        name: member.id === context.id ? "You" : memberName(member),
      })),
      providers,
      procedures: ProvidersService.getMemberProcedureCatalog(),
    };
  }

  static async getHistory(userId: string, tenantId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const allowedMemberIds = [context.id, ...context.dependents.map((dependent) => dependent.id)];
    const preauths = await prisma.preAuthorization.findMany({
      where: { tenantId, memberId: { in: allowedMemberIds } },
      include: {
        member: { select: { id: true, firstName: true, lastName: true } },
        provider: { select: { name: true, type: true, tier: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return preauths.map((preauth) => ({
      id: preauth.id,
      preauthNumber: preauth.preauthNumber,
      memberName: preauth.memberId === context.id ? "You" : memberName(preauth.member),
      providerName: preauth.provider.name,
      providerType: preauth.provider.type,
      status: preauth.status,
      serviceType: preauth.serviceType,
      benefitCategory: preauth.benefitCategory,
      expectedDateOfService: preauth.expectedDateOfService,
      estimatedCost: toMoney(preauth.estimatedCost),
      approvedAmount: preauth.approvedAmount ? toMoney(preauth.approvedAmount) : null,
      validUntil: preauth.validUntil,
      createdAt: preauth.createdAt,
    }));
  }

  static async getDetail(userId: string, tenantId: string, preauthId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const allowedMemberIds = [context.id, ...context.dependents.map((dependent) => dependent.id)];
    const preauth = await prisma.preAuthorization.findFirst({
      where: { id: preauthId, tenantId, memberId: { in: allowedMemberIds } },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, memberNumber: true, relationship: true } },
        provider: true,
        claim: { select: { id: true, claimNumber: true } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!preauth) return null;

    return {
      id: preauth.id,
      preauthNumber: preauth.preauthNumber,
      memberName: preauth.memberId === context.id ? "You" : memberName(preauth.member),
      provider: preauth.provider,
      status: preauth.status,
      serviceType: preauth.serviceType,
      benefitCategory: preauth.benefitCategory,
      expectedDateOfService: preauth.expectedDateOfService,
      estimatedCost: toMoney(preauth.estimatedCost),
      approvedAmount: preauth.approvedAmount ? toMoney(preauth.approvedAmount) : null,
      memberShare:
        preauth.approvedAmount && toMoney(preauth.estimatedCost) > toMoney(preauth.approvedAmount)
          ? toMoney(preauth.estimatedCost) - toMoney(preauth.approvedAmount)
          : null,
      benefitRemaining: preauth.benefitRemaining ? toMoney(preauth.benefitRemaining) : null,
      validFrom: preauth.validFrom,
      validUntil: preauth.validUntil,
      declineReasonCode: preauth.declineReasonCode,
      declineNotes: preauth.declineNotes,
      clinicalNotes: preauth.clinicalNotes,
      diagnoses: preauth.diagnoses,
      procedures: preauth.procedures,
      claim: preauth.claim,
      documents: preauth.documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        category: document.category,
        createdAt: document.createdAt,
      })),
      createdAt: preauth.createdAt,
    };
  }

  static async request(userId: string, tenantId: string, input: MemberPreAuthRequestInput) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    const allowedMemberIds = new Set([context.id, ...context.dependents.filter((dependent) => dependent.status === "ACTIVE").map((dependent) => dependent.id)]);
    const memberId = input.memberId || context.id;
    if (!allowedMemberIds.has(memberId)) throw new Error("You can only request pre-authorization for yourself or an active dependant.");

    const procedure = ProvidersService.getMemberProcedureCatalog().find((item) => item.cptCode === input.procedureCode)
      ?? ProvidersService.getMemberProcedureCatalog()[0];

    const [member, provider, tariff] = await Promise.all([
      prisma.member.findUnique({
        where: { id: memberId, tenantId },
        include: {
          group: { select: { status: true } },
          package: { include: { currentVersion: { include: { benefits: true } } } },
          benefitUsages: true,
        },
      }),
      prisma.provider.findUnique({ where: { id: input.providerId, tenantId } }),
      prisma.providerTariff.findFirst({
        where: {
          providerId: input.providerId,
          cptCode: procedure.cptCode,
          isActive: true,
          effectiveFrom: { lte: new Date() },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        orderBy: { effectiveFrom: "desc" },
      }),
    ]);

    if (!member) throw new Error("Member not found.");
    if (!provider || provider.contractStatus !== "ACTIVE") throw new Error("Select an active Avenue or partner facility.");

    const benefitCategory = procedure.benefitCategory as BenefitCategory;
    const benefit = member.package.currentVersion?.benefits.find((item) => item.category === benefitCategory);
    if (!benefit) throw new Error(`Your package does not currently show ${benefitCategory.replace(/_/g, " ").toLowerCase()} cover.`);

    const usage = member.benefitUsages.find((item) => item.benefitConfigId === benefit.id);
    const remaining = Math.max(0, toMoney(benefit.annualSubLimit) - toMoney(usage?.amountUsed));
    const estimatedCost = tariff ? toMoney(tariff.agreedRate) : procedure.fallbackCost;

    const result = await ClaimsService.createPreAuth(tenantId, {
      memberId,
      providerId: input.providerId,
      serviceType: (benefitCategory === "INPATIENT" || benefitCategory === "SURGICAL" || benefitCategory === "MATERNITY" ? "INPATIENT" : "OUTPATIENT") as ServiceType,
      expectedDateOfService: input.expectedDateOfService,
      diagnoses: [{ description: input.diagnosis, isPrimary: true }],
      procedures: [{
        cptCode: procedure.cptCode,
        description: procedure.label,
        quantity: 1,
        unitCost: estimatedCost,
        total: estimatedCost,
      }],
      estimatedCost,
      clinicalNotes: input.clinicalNotes,
      benefitCategory,
      submittedBy: "MEMBER",
    });

    const warnings = result.warnings ?? [];
    const canAutoApprove =
      member.status === "ACTIVE" &&
      member.group.status === "ACTIVE" &&
      provider.contractStatus === "ACTIVE" &&
      AUTO_APPROVE_CPT_CODES.has(procedure.cptCode) &&
      estimatedCost <= AUTO_APPROVE_CEILING &&
      warnings.length === 0;

    if (canAutoApprove) {
      await ClaimsService.adjudicatePreAuth(tenantId, result.preauth.id, {
        action: "APPROVED",
        approvedAmount: Math.min(estimatedCost, remaining),
        validDays: 14,
        reviewerId: "AUTO",
      });
      await MemberNotificationService.create({
        tenantId,
        memberId,
        type: "PREAUTH_STATUS",
        priority: "HIGH",
        title: "Pre-authorization approved",
        body: `${procedure.label} has been approved for ${provider.name}.`,
        href: `/member/preauth/${result.preauth.id}`,
        metadata: { preauthId: result.preauth.id, decision: "AUTO_APPROVED" },
      });
      return { preauthId: result.preauth.id, decision: "AUTO_APPROVED" as const, warnings };
    }

    if (estimatedCost > remaining && remaining <= 0) {
      await ClaimsService.adjudicatePreAuth(tenantId, result.preauth.id, {
        action: "DECLINED",
        declineReasonCode: "BENEFIT_EXHAUSTED",
        declineNotes: "The selected benefit does not have remaining balance for this request.",
        reviewerId: "AUTO",
      });
      await MemberNotificationService.create({
        tenantId,
        memberId,
        type: "PREAUTH_STATUS",
        priority: "HIGH",
        title: "Pre-authorization could not be approved",
        body: "The selected benefit does not have remaining balance for this request.",
        href: `/member/preauth/${result.preauth.id}`,
        metadata: { preauthId: result.preauth.id, decision: "AUTO_DECLINED" },
      });
      return { preauthId: result.preauth.id, decision: "AUTO_DECLINED" as const, warnings };
    }

    await ClaimsService.markPreAuthUnderReview(tenantId, result.preauth.id);
    await MemberNotificationService.create({
      tenantId,
      memberId,
      type: "PREAUTH_STATUS",
      title: "Pre-authorization under review",
      body: `${procedure.label} has been sent to a care reviewer.`,
      href: `/member/preauth/${result.preauth.id}`,
      metadata: { preauthId: result.preauth.id, decision: "PENDING_HUMAN_REVIEW" },
    });
    return { preauthId: result.preauth.id, decision: "PENDING_HUMAN_REVIEW" as const, warnings };
  }
}
