import { referralWarningForProcedure } from "@/lib/member-policy-copy";
import { prisma } from "@/lib/prisma";
import { MemberAppService } from "@/server/services/member-app.service";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import { ProvidersService } from "@/server/services/providers.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import type { BenefitCategory, ServiceType } from "@prisma/client";

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

    /**
     * UAT-HF P09.07 — DEF-060's third surface.
     *
     * The run scanned three member surfaces for referral copy and found none.
     * Two were fixed; this one — where the member actually commits to a request
     * — was recorded as "still silent". It is the surface where silence costs
     * most: on Find Care a member plans a visit, here they submit one, and a
     * request that a referral rule will refuse is a wasted wait rather than a
     * wasted look.
     *
     * Read from the member's OWN pinned version, not the package's latest, and
     * only `memberSafeExplanation` is selected — `sourceClause` is the internal
     * contract reference and is never fetched.
     */
    const procedures = ProvidersService.getMemberProcedureCatalog();
    // The pinned version when there is one; otherwise the package's current
    // version, resolved rather than assumed — F-PIN-1.
    const packageVersionId =
      context.packageVersionId ??
      (
        await prisma.package.findFirst({
          where: { id: context.packageId, tenantId },
          select: { currentVersionId: true },
        })
      )?.currentVersionId ??
      null;

    const rules = packageVersionId
      ? await prisma.referralRule.findMany({
      where: { packageVersionId },
      select: {
        benefitCategories: true,
        serviceCodes: true,
        requiresReferral: true,
        memberSafeExplanation: true,
        isActive: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
        })
      : [];

    const referralWarnings: Record<string, string> = {};
    for (const procedure of procedures) {
      const warning = referralWarningForProcedure(rules, {
        serviceCode: procedure.cptCode,
        category: procedure.benefitCategory,
      });
      if (warning) referralWarnings[procedure.cptCode] = warning;
    }

    return {
      members: members.map((member) => ({
        ...member,
        name: member.id === context.id ? "You" : memberName(member),
      })),
      providers,
      procedures,
      referralWarnings,
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

    const healthShares = await prisma.memberHealthShare.findMany({
      where: {
        tenantId,
        memberId: preauth.memberId,
        preauthId: preauth.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        healthFile: true,
        journalEntry: true,
      },
      orderBy: { createdAt: "desc" },
    });

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
      sharedHealthRecords: healthShares.map((share) => ({
        id: share.id,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
        file: share.healthFile ? {
          id: share.healthFile.id,
          title: share.healthFile.title,
          category: share.healthFile.category,
          fileName: share.healthFile.fileName,
          fileUrl: share.healthFile.fileUrl,
          fileSize: share.healthFile.fileSize,
          mimeType: share.healthFile.mimeType,
          capturedAt: share.healthFile.capturedAt,
          notes: share.healthFile.notes,
        } : null,
        journalEntry: share.journalEntry ? {
          id: share.journalEntry.id,
          entryType: share.journalEntry.entryType,
          noteText: share.journalEntry.noteText,
          audioUrl: share.journalEntry.audioUrl,
          transcriptText: share.journalEntry.transcriptText,
          tags: share.journalEntry.tags,
          recordedAt: share.journalEntry.recordedAt,
        } : null,
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
          package: { include: { currentVersion: { include: { benefits: true } } } },
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
    if (!provider || provider.contractStatus !== "ACTIVE") throw new Error("Select an active Medvex or partner facility.");

    const benefitCategory = procedure.benefitCategory as BenefitCategory;
    const benefit = member.package.currentVersion?.benefits.find((item) => item.category === benefitCategory);
    if (!benefit) throw new Error(`Your package does not currently show ${benefitCategory.replace(/_/g, " ").toLowerCase()} cover.`);

    const estimatedCost = tariff ? toMoney(tariff.agreedRate) : procedure.fallbackCost;

    // F3.5: converge on the canonical pipeline. The member rail submits through
    // PreauthIntakeService (channel MEMBER_APP) → the SAME auto-decision pipeline
    // the B2B rail uses. It NO LONGER runs its own 15k/CPT auto-approve or its own
    // benefit-exhaustion decline: preauthAdjudicationService's 10-gate pipeline
    // (benefit cap, exclusions, fraud, credential, 50k ceiling) is now the single
    // decision owner. Member authorization (self/active-dependant, above) and the
    // friendly benefit-existence pre-check are preserved as the rail's own concern.
    const submitResult = await PreauthIntakeService.submit(
      { channel: "MEMBER_APP", tenantId, providerId: input.providerId, actorType: "USER", actorId: userId },
      {
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
      },
      {
        adjudicate: async (preauthId, tid) => {
          await preauthAdjudicationService.executeAutoDecision(preauthId, tid, await getSystemActorId(tid));
        },
      },
    );

    if (submitResult.status === "REJECTED" || !submitResult.preauthId) {
      throw new Error(submitResult.errors?.[0]?.message ?? "Your pre-authorization could not be submitted.");
    }
    const preauthId = submitResult.preauthId;

    // The canonical pipeline ran during the post-commit handoff — reflect its
    // decision to the member. Read the persisted status (single source of truth)
    // rather than re-deriving it here.
    const decided = await prisma.preAuthorization.findUnique({ where: { id: preauthId }, select: { status: true } });
    const decision =
      decided?.status === "APPROVED" ? ("AUTO_APPROVED" as const)
      : decided?.status === "DECLINED" ? ("AUTO_DECLINED" as const)
      : ("PENDING_HUMAN_REVIEW" as const);

    const NOTICE = {
      AUTO_APPROVED: { priority: "HIGH" as const, title: "Pre-authorization approved", body: `${procedure.label} has been approved for ${provider.name}.` },
      AUTO_DECLINED: { priority: "HIGH" as const, title: "Pre-authorization could not be approved", body: "This request was not approved. A care reviewer can advise on next steps." },
      PENDING_HUMAN_REVIEW: { priority: "NORMAL" as const, title: "Pre-authorization under review", body: `${procedure.label} has been sent to a care reviewer.` },
    }[decision];
    await MemberNotificationService.create({
      tenantId,
      memberId,
      type: "PREAUTH_STATUS",
      priority: NOTICE.priority,
      title: NOTICE.title,
      body: NOTICE.body,
      href: `/member/preauth/${preauthId}`,
      metadata: { preauthId, decision },
    });
    return { preauthId, decision, warnings: [] as string[] };
  }
}
