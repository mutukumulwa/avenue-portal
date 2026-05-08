import { prisma } from "@/lib/prisma";

const SENSITIVE_FAMILY_CATEGORIES = new Set(["MATERNITY", "MENTAL_HEALTH"]);

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function normalizePhone(phone: string) {
  const compact = phone.replace(/[^\d+]/g, "");
  if (compact.startsWith("+254")) return compact;
  if (compact.startsWith("254")) return `+${compact}`;
  if (compact.startsWith("0")) return `+254${compact.slice(1)}`;
  return compact;
}

function benefitPeriod(enrollmentDate: Date) {
  const now = new Date();
  const enrolled = new Date(enrollmentDate);
  let periodStart = new Date(now.getFullYear(), enrolled.getMonth(), enrolled.getDate());
  if (periodStart > now) {
    periodStart = new Date(now.getFullYear() - 1, enrolled.getMonth(), enrolled.getDate());
  }
  const periodEnd = new Date(periodStart.getFullYear() + 1, enrolled.getMonth(), enrolled.getDate());
  const elapsed = now.getTime() - periodStart.getTime();
  const duration = periodEnd.getTime() - periodStart.getTime();
  const elapsedPct = duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 0;

  return { periodStart, periodEnd, elapsedPct };
}

function paceLabel(usedPct: number, elapsedPct: number) {
  if (usedPct >= 1) return "Cap reached";
  if (usedPct >= 0.9) return "Near cap";
  if (usedPct > elapsedPct + 0.2) return "Ahead of expected use";
  return "On track";
}

function ageFromDate(dateOfBirth: Date) {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = now.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dateOfBirth.getDate())) age -= 1;
  return age;
}

function isSensitiveFamilyCategory(category: string) {
  return SENSITIVE_FAMILY_CATEGORIES.has(category);
}

function buildBenefitStates(member: {
  enrollmentDate: Date;
  package: {
    currentVersion: {
      benefits: Array<{
        id: string;
        category: string;
        customCategoryName: string | null;
        annualSubLimit: unknown;
        perVisitLimit: unknown | null;
        copayPercentage: unknown;
        waitingPeriodDays: number;
        notes: string | null;
        exclusions: string[];
      }>;
    } | null;
  };
  benefitUsages: Array<{
    benefitConfigId: string;
    amountUsed: unknown;
    claimCount: number;
    lastUpdated: Date;
  }>;
}) {
  const benefits = member.package.currentVersion?.benefits ?? [];
  const usageMap = new Map(member.benefitUsages.map((usage) => [usage.benefitConfigId, usage]));
  const period = benefitPeriod(member.enrollmentDate);

  const benefitStates = benefits.map((benefit) => {
    const usage = usageMap.get(benefit.id);
    const limit = toMoney(benefit.annualSubLimit);
    const used = toMoney(usage?.amountUsed);
    const remaining = Math.max(0, limit - used);
    const usedPct = limit > 0 ? Math.min(1, used / limit) : 0;

    return {
      id: benefit.id,
      category: benefit.category,
      name: benefit.customCategoryName ?? benefit.category.replace(/_/g, " "),
      limit,
      used,
      remaining,
      usedPct,
      perVisitLimit: benefit.perVisitLimit ? toMoney(benefit.perVisitLimit) : null,
      copayPercentage: toMoney(benefit.copayPercentage),
      waitingPeriodDays: benefit.waitingPeriodDays,
      notes: benefit.notes,
      exclusions: benefit.exclusions,
      claimCount: usage?.claimCount ?? 0,
      lastUpdated: usage?.lastUpdated ?? null,
      pace: paceLabel(usedPct, period.elapsedPct),
    };
  });

  const totalLimit = benefitStates.reduce((sum, benefit) => sum + benefit.limit, 0);
  const totalUsed = benefitStates.reduce((sum, benefit) => sum + benefit.used, 0);
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const overallUsedPct = totalLimit > 0 ? Math.min(1, totalUsed / totalLimit) : 0;
  const pressureBenefits = [...benefitStates].sort((a, b) => b.usedPct - a.usedPct).slice(0, 3);

  return {
    period,
    benefitStates,
    pressureBenefits,
    summary: {
      totalLimit,
      totalUsed,
      totalRemaining,
      overallUsedPct,
      elapsedPct: period.elapsedPct,
      pace: paceLabel(overallUsedPct, period.elapsedPct),
    },
  };
}

export class MemberAppService {
  static async getLowBandwidthSnapshotByPhone(phone: string, options?: { tenantSlug?: string }) {
    const normalizedPhone = normalizePhone(phone);
    const candidates = await prisma.member.findMany({
      where: {
        phone: { in: [phone, normalizedPhone, normalizedPhone.replace(/^\+/, ""), normalizedPhone.replace(/^\+254/, "0")] },
        status: "ACTIVE",
        ...(options?.tenantSlug ? { group: { tenant: { slug: options.tenantSlug } } } : {}),
      },
      include: {
        group: { include: { tenant: { select: { id: true, slug: true } } } },
        package: {
          include: {
            currentVersion: {
              include: { benefits: { orderBy: { category: "asc" } } },
            },
          },
        },
        benefitUsages: {
          include: { benefitConfig: { select: { category: true, customCategoryName: true } } },
        },
        claims: {
          orderBy: { dateOfService: "desc" },
          take: 3,
          select: {
            id: true,
            claimNumber: true,
            benefitCategory: true,
            serviceType: true,
            dateOfService: true,
            status: true,
            provider: { select: { name: true } },
          },
        },
      },
    });

    const tenantIds = new Set(candidates.map((member) => member.tenantId));
    if (candidates.length !== 1 || tenantIds.size !== 1) return null;

    const member = candidates[0];
    const state = buildBenefitStates(member);

    return {
      tenantId: member.tenantId,
      tenantSlug: member.group.tenant.slug,
      memberId: member.id,
      memberName: `${member.firstName} ${member.lastName}`,
      memberNumber: member.memberNumber,
      groupName: member.group.name,
      renewalDate: member.group.renewalDate,
      benefitSummary: state.summary,
      pressureBenefits: state.pressureBenefits.slice(0, 2).map((benefit) => ({
        name: benefit.name,
        remaining: benefit.remaining,
        pace: benefit.pace,
      })),
      recentEncounters: member.claims
        .filter((claim) => !isSensitiveFamilyCategory(claim.benefitCategory))
        .map((claim) => ({
          providerName: claim.provider.name,
          serviceType: claim.serviceType,
          dateOfService: claim.dateOfService,
          status: claim.status.replace(/_/g, " "),
        })),
    };
  }

  static async getLowBandwidthProvidersByArea(input: { phone: string; area: string; tenantSlug?: string }) {
    const snapshot = await this.getLowBandwidthSnapshotByPhone(input.phone, { tenantSlug: input.tenantSlug });
    if (!snapshot) return null;

    const area = input.area.trim();
    const providers = await prisma.provider.findMany({
      where: {
        tenantId: snapshot.tenantId,
        contractStatus: "ACTIVE",
        OR: [
          { county: { contains: area, mode: "insensitive" } },
          { address: { contains: area, mode: "insensitive" } },
          { name: { contains: area, mode: "insensitive" } },
        ],
      },
      select: { name: true, type: true, county: true, phone: true },
      orderBy: [{ tier: "asc" }, { name: "asc" }],
      take: 3,
    });

    return {
      ...snapshot,
      area,
      providers,
    };
  }

  static async resolveMemberContext(userId: string, tenantId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        member: {
          include: {
            dependents: { select: { id: true, status: true } },
            principal: { select: { id: true } },
          },
        },
      },
    });

    if (!user?.member || user.member.tenantId !== tenantId) return null;
    return user.member;
  }

  static async getDashboardForUser(userId: string, tenantId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        member: {
          include: {
            group: { select: { id: true, name: true, renewalDate: true, status: true } },
            package: {
              include: {
                currentVersion: {
                  include: { benefits: { orderBy: { category: "asc" } } },
                },
              },
            },
            benefitUsages: {
              include: { benefitConfig: { select: { id: true, category: true, customCategoryName: true, annualSubLimit: true } } },
            },
            dependents: {
              where: { status: "ACTIVE" },
              select: { id: true, firstName: true, lastName: true, relationship: true, memberNumber: true },
              orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
            },
            claims: {
              orderBy: { createdAt: "desc" },
              take: 6,
              include: {
                provider: { select: { name: true, type: true } },
                coContributionTransaction: {
                  select: { finalAmount: true, amountCollected: true, collectionStatus: true, paymentMethod: true, collectedAt: true },
                },
              },
            },
            preauths: {
              orderBy: { createdAt: "desc" },
              take: 6,
              include: { provider: { select: { name: true } } },
            },
            coContributionTransactions: {
              orderBy: { createdAt: "desc" },
              take: 6,
              include: {
                claim: {
                  select: {
                    claimNumber: true,
                    dateOfService: true,
                    provider: { select: { name: true } },
                  },
                },
              },
            },
            notifications: {
              orderBy: { createdAt: "desc" },
              take: 4,
            },
          },
        },
      },
    });

    const member = user?.member;
    if (!member || member.tenantId !== tenantId) return null;

    const benefitState = buildBenefitStates(member);

    const outstandingMemberShare = member.coContributionTransactions
      .filter((transaction) => ["PENDING", "PARTIAL"].includes(transaction.collectionStatus))
      .reduce((sum, transaction) => sum + Math.max(0, toMoney(transaction.finalAmount) - toMoney(transaction.amountCollected)), 0);

    const recentActivity = [
      ...member.claims.map((claim) => ({
        id: `claim-${claim.id}`,
        type: "CARE_VISIT" as const,
        title: claim.provider.name,
        description: `${claim.serviceType.replace(/_/g, " ")} visit recorded`,
        amount: toMoney(claim.approvedAmount || claim.billedAmount),
        status: claim.status.replace(/_/g, " "),
        date: claim.dateOfService,
        href: "/member/utilization",
      })),
      ...member.preauths.map((preauth) => ({
        id: `preauth-${preauth.id}`,
        type: "PREAUTH" as const,
        title: preauth.provider.name,
        description: `${preauth.serviceType.replace(/_/g, " ")} pre-authorization`,
        amount: toMoney(preauth.approvedAmount ?? preauth.estimatedCost),
        status: preauth.status.replace(/_/g, " "),
        date: preauth.createdAt,
        href: "/member/preauth",
      })),
      ...member.coContributionTransactions.map((transaction) => ({
        id: `share-${transaction.id}`,
        type: "MEMBER_SHARE" as const,
        title: transaction.claim.provider.name,
        description: `Member share for ${transaction.claim.claimNumber}`,
        amount: toMoney(transaction.finalAmount),
        status: transaction.collectionStatus.replace(/_/g, " "),
        date: transaction.collectedAt ?? transaction.createdAt,
        href: "/member/utilization",
      })),
    ]
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);

    return {
      member: {
        id: member.id,
        memberNumber: member.memberNumber,
        firstName: member.firstName,
        lastName: member.lastName,
        relationship: member.relationship,
        status: member.status,
        phone: member.phone,
      },
      group: member.group,
      package: {
        id: member.package.id,
        name: member.package.name,
      },
      period: benefitState.period,
      summary: {
        totalLimit: benefitState.summary.totalLimit,
        totalUsed: benefitState.summary.totalUsed,
        totalRemaining: benefitState.summary.totalRemaining,
        overallUsedPct: benefitState.summary.overallUsedPct,
        outstandingMemberShare,
        activeDependentCount: member.dependents.length,
      },
      benefitStates: benefitState.benefitStates,
      pressureBenefits: benefitState.pressureBenefits,
      dependents: member.dependents,
      recentActivity,
      recentClaims: member.claims,
      recentPreauths: member.preauths,
      notifications: member.notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        priority: notification.priority,
        title: notification.title,
        body: notification.body,
        href: notification.href,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
    };
  }

  static async getBenefitStateForUser(userId: string, tenantId: string, targetMemberId?: string) {
    const context = await this.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const allowedMemberIds = new Set([context.id, ...context.dependents.map((dependent) => dependent.id)]);
    const memberId = targetMemberId ?? context.id;
    if (!allowedMemberIds.has(memberId)) return null;

    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: {
        group: { select: { id: true, name: true, renewalDate: true } },
        package: {
          include: {
            currentVersion: {
              include: { benefits: { orderBy: { category: "asc" } } },
            },
          },
        },
        benefitUsages: {
          include: { benefitConfig: { select: { category: true } } },
        },
      },
    });

    if (!member) return null;
    const state = buildBenefitStates(member);
    return {
      viewerMemberId: context.id,
      member: {
        id: member.id,
        memberNumber: member.memberNumber,
        firstName: member.firstName,
        lastName: member.lastName,
        relationship: member.relationship,
        status: member.status,
      },
      group: member.group,
      package: { id: member.package.id, name: member.package.name },
      ...state,
      canViewCategoryDetail: member.id === context.id,
    };
  }

  static async getFamilyViewForUser(userId: string, tenantId: string) {
    const context = await this.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const principalId = context.principal?.id ?? context.id;
    const isPrincipalViewer = context.id === principalId;
    const memberIds = isPrincipalViewer ? [context.id, ...context.dependents.map((dependent) => dependent.id)] : [context.id];

    const members = await prisma.member.findMany({
      where: { tenantId, id: { in: memberIds } },
      include: {
        package: {
          include: {
            currentVersion: {
              include: { benefits: { orderBy: { category: "asc" } } },
            },
          },
        },
        benefitUsages: true,
        claims: {
          orderBy: { dateOfService: "desc" },
          take: 3,
          select: {
            id: true,
            claimNumber: true,
            benefitCategory: true,
            dateOfService: true,
            approvedAmount: true,
            memberLiability: true,
            status: true,
            provider: { select: { name: true } },
          },
        },
      },
      orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
    });

    const familyMembers = members.map((member) => {
      const state = buildBenefitStates(member);
      const isSelf = member.id === context.id;
      const categoryDetails = state.benefitStates.map((benefit) => {
        const masked = !isSelf && isSensitiveFamilyCategory(benefit.category);
        return {
          ...benefit,
          masked,
          used: masked ? null : benefit.used,
          remaining: masked ? null : benefit.remaining,
          usedPct: masked ? null : benefit.usedPct,
          claimCount: masked ? null : benefit.claimCount,
          pace: masked ? "Private category" : benefit.pace,
        };
      });

      return {
        id: member.id,
        memberNumber: member.memberNumber,
        firstName: member.firstName,
        lastName: member.lastName,
        relationship: member.relationship,
        status: member.status,
        age: ageFromDate(member.dateOfBirth),
        isSelf,
        packageName: member.package.name,
        summary: state.summary,
        categoryDetails,
        recentVisibleEncounters: member.claims
          .filter((claim) => isSelf || !isSensitiveFamilyCategory(claim.benefitCategory))
          .map((claim) => ({
            id: claim.id,
            claimNumber: claim.claimNumber,
            providerName: claim.provider.name,
            benefitCategory: claim.benefitCategory,
            dateOfService: claim.dateOfService,
            approvedAmount: toMoney(claim.approvedAmount),
            memberLiability: toMoney(claim.memberLiability),
            status: claim.status.replace(/_/g, " "),
          })),
        hiddenSensitiveEncounterCount: isSelf
          ? 0
          : member.claims.filter((claim) => isSensitiveFamilyCategory(claim.benefitCategory)).length,
      };
    });

    const familyTotalLimit = familyMembers.reduce((sum, member) => sum + member.summary.totalLimit, 0);
    const familyTotalUsed = familyMembers.reduce((sum, member) => sum + member.summary.totalUsed, 0);

    return {
      viewer: {
        id: context.id,
        isPrincipalViewer,
      },
      familySummary: {
        memberCount: familyMembers.length,
        totalLimit: familyTotalLimit,
        totalUsed: familyTotalUsed,
        totalRemaining: Math.max(0, familyTotalLimit - familyTotalUsed),
        usedPct: familyTotalLimit > 0 ? Math.min(1, familyTotalUsed / familyTotalLimit) : 0,
      },
      privacyNote: "Sensitive categories are summarized for family members and only shown in detail to the member they belong to.",
      members: familyMembers,
    };
  }

  static async getEncounterHistoryForUser(userId: string, tenantId: string, filters?: {
    memberId?: string;
    status?: string;
    benefitCategory?: string;
    period?: "30d" | "90d" | "ytd" | "all";
  }) {
    const context = await this.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const principalId = context.principal?.id ?? context.id;
    const isPrincipalViewer = context.id === principalId;
    const allowedMemberIds = isPrincipalViewer ? [context.id, ...context.dependents.map((dependent) => dependent.id)] : [context.id];
    const selectedMemberIds = filters?.memberId && allowedMemberIds.includes(filters.memberId) ? [filters.memberId] : allowedMemberIds;

    const now = new Date();
    let periodFrom: Date | undefined;
    if (filters?.period === "30d") periodFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    if (filters?.period === "90d") periodFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
    if (filters?.period === "ytd") periodFrom = new Date(now.getFullYear(), 0, 1);

    const claims = await prisma.claim.findMany({
      where: {
        tenantId,
        memberId: { in: selectedMemberIds },
        ...(filters?.status ? { status: filters.status as never } : {}),
        ...(filters?.benefitCategory ? { benefitCategory: filters.benefitCategory as never } : {}),
        ...(periodFrom ? { dateOfService: { gte: periodFrom } } : {}),
      },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, relationship: true } },
        provider: { select: { name: true, type: true } },
        coContributionTransaction: {
          select: { finalAmount: true, amountCollected: true, collectionStatus: true, paymentMethod: true },
        },
      },
      orderBy: { dateOfService: "desc" },
      take: 100,
    });

    const encounters = claims.map((claim) => {
      const isSelf = claim.memberId === context.id;
      const masked = !isSelf && isSensitiveFamilyCategory(claim.benefitCategory);
      const memberShare = claim.coContributionTransaction
        ? toMoney(claim.coContributionTransaction.finalAmount)
        : toMoney(claim.memberLiability);

      return {
        id: claim.id,
        claimNumber: masked ? "Private family event" : claim.claimNumber,
        memberId: claim.memberId,
        memberName: claim.member.id === context.id ? "You" : `${claim.member.firstName} ${claim.member.lastName}`,
        relationship: claim.member.relationship,
        providerName: masked ? "Private provider" : claim.provider.name,
        providerType: claim.provider.type,
        serviceType: claim.serviceType,
        benefitCategory: claim.benefitCategory,
        dateOfService: claim.dateOfService,
        billedAmount: masked ? null : toMoney(claim.billedAmount),
        planApprovedAmount: masked ? null : toMoney(claim.approvedAmount),
        planPaidAmount: masked ? null : toMoney(claim.paidAmount),
        memberShare: masked ? null : memberShare,
        collectionStatus: masked ? null : claim.coContributionTransaction?.collectionStatus ?? null,
        status: masked ? "Private" : claim.status.replace(/_/g, " "),
        masked,
        href: masked ? null : `/member/utilization/${claim.id}`,
      };
    });

    const visibleEncounters = encounters.filter((encounter) => !encounter.masked);
    const summary = {
      totalBilled: visibleEncounters.reduce((sum, encounter) => sum + (encounter.billedAmount ?? 0), 0),
      planApproved: visibleEncounters.reduce((sum, encounter) => sum + (encounter.planApprovedAmount ?? 0), 0),
      planPaid: visibleEncounters.reduce((sum, encounter) => sum + (encounter.planPaidAmount ?? 0), 0),
      memberShare: visibleEncounters.reduce((sum, encounter) => sum + (encounter.memberShare ?? 0), 0),
      encounterCount: encounters.length,
      privateEncounterCount: encounters.filter((encounter) => encounter.masked).length,
    };

    const familyOptions = isPrincipalViewer
      ? await prisma.member.findMany({
          where: { tenantId, id: { in: allowedMemberIds } },
          select: { id: true, firstName: true, lastName: true, relationship: true },
          orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
        })
      : [];

    return {
      viewer: { id: context.id, isPrincipalViewer },
      filters: {
        memberId: filters?.memberId ?? "all",
        status: filters?.status ?? "all",
        benefitCategory: filters?.benefitCategory ?? "all",
        period: filters?.period ?? "all",
      },
      familyOptions: familyOptions.map((member) => ({
        id: member.id,
        name: member.id === context.id ? "You" : `${member.firstName} ${member.lastName}`,
        relationship: member.relationship,
      })),
      summary,
      encounters,
    };
  }

  static async getEncounterDetailForUser(userId: string, tenantId: string, claimId: string) {
    const context = await this.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const principalId = context.principal?.id ?? context.id;
    const isPrincipalViewer = context.id === principalId;
    const allowedMemberIds = isPrincipalViewer ? [context.id, ...context.dependents.map((dependent) => dependent.id)] : [context.id];

    const claim = await prisma.claim.findFirst({
      where: { id: claimId, tenantId, memberId: { in: allowedMemberIds } },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, relationship: true } },
        provider: { select: { name: true, type: true, phone: true, address: true, tier: true } },
        claimLines: { orderBy: { lineNumber: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        coContributionTransaction: true,
      },
    });

    if (!claim) return null;
    const isSelf = claim.memberId === context.id;
    if (!isSelf && isSensitiveFamilyCategory(claim.benefitCategory)) return null;

    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      member: {
        id: claim.member.id,
        name: claim.member.id === context.id ? "You" : `${claim.member.firstName} ${claim.member.lastName}`,
        relationship: claim.member.relationship,
      },
      provider: claim.provider,
      serviceType: claim.serviceType,
      benefitCategory: claim.benefitCategory,
      dateOfService: claim.dateOfService,
      status: claim.status.replace(/_/g, " "),
      amounts: {
        billed: toMoney(claim.billedAmount),
        planApproved: toMoney(claim.approvedAmount),
        planPaid: toMoney(claim.paidAmount),
        memberShare: claim.coContributionTransaction ? toMoney(claim.coContributionTransaction.finalAmount) : toMoney(claim.memberLiability),
        memberShareCollected: claim.coContributionTransaction ? toMoney(claim.coContributionTransaction.amountCollected) : 0,
        collectionStatus: claim.coContributionTransaction?.collectionStatus ?? null,
      },
      services: claim.claimLines.map((line) => ({
        id: line.id,
        description: line.description,
        category: line.serviceCategory,
        quantity: line.quantity,
        billedAmount: toMoney(line.billedAmount),
        planApprovedAmount: toMoney(line.approvedAmount),
      })),
      documents: claim.documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        category: document.category,
        createdAt: document.createdAt,
      })),
    };
  }

  static async getDocumentsForUser(userId: string, tenantId: string) {
    const context = await this.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const principalId = context.principal?.id ?? context.id;
    const isPrincipalViewer = context.id === principalId;
    const allowedMemberIds = isPrincipalViewer ? [context.id, ...context.dependents.map((dependent) => dependent.id)] : [context.id];

    const members = await prisma.member.findMany({
      where: { tenantId, id: { in: allowedMemberIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        memberNumber: true,
        relationship: true,
        groupId: true,
        package: { select: { id: true, name: true } },
      },
      orderBy: [{ relationship: "asc" }, { firstName: "asc" }],
    });

    const groupIds = [...new Set(members.map((member) => member.groupId))];

    const [groupDocuments, claimDocuments, preauthDocuments] = await Promise.all([
      prisma.document.findMany({
        where: {
          groupId: { in: groupIds },
          category: { in: ["BENEFIT_GUIDE", "BENEFIT_SCHEDULE", "MEMBERSHIP_CERTIFICATE", "MEMBER_LIST", "AGREEMENT"] },
        },
        include: { group: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.document.findMany({
        where: {
          claim: {
            tenantId,
            memberId: { in: allowedMemberIds },
          },
        },
        include: {
          claim: {
            select: {
              id: true,
              claimNumber: true,
              memberId: true,
              benefitCategory: true,
              provider: { select: { name: true } },
              member: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.document.findMany({
        where: {
          preauth: {
            tenantId,
            memberId: { in: allowedMemberIds },
          },
        },
        include: {
          preauth: {
            select: {
              id: true,
              preauthNumber: true,
              memberId: true,
              benefitCategory: true,
              provider: { select: { name: true } },
              member: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const membershipDocuments = members.map((member) => ({
      id: `virtual-card-${member.id}`,
      fileName: `${member.firstName} ${member.lastName} digital member card`,
      fileUrl: `/members/${member.id}/card`,
      fileSize: null,
      mimeType: "text/html",
      category: "MEMBERSHIP_CARD",
      source: "Generated",
      ownerName: member.id === context.id ? "You" : `${member.firstName} ${member.lastName}`,
      createdAt: null as Date | null,
    }));

    const visibleClaimDocuments = claimDocuments
      .filter((document) => {
        if (!document.claim) return false;
        return document.claim.memberId === context.id || !isSensitiveFamilyCategory(document.claim.benefitCategory);
      })
      .map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        category: document.category,
        source: document.claim ? `${document.claim.provider.name} · ${document.claim.claimNumber}` : "Claim",
        ownerName: document.claim?.memberId === context.id
          ? "You"
          : document.claim
            ? `${document.claim.member.firstName} ${document.claim.member.lastName}`
            : "Family member",
        createdAt: document.createdAt,
      }));

    const visiblePreauthDocuments = preauthDocuments
      .filter((document) => {
        if (!document.preauth) return false;
        return document.preauth.memberId === context.id || !isSensitiveFamilyCategory(document.preauth.benefitCategory);
      })
      .map((document) => ({
        id: document.id,
        fileName: document.fileName,
        fileUrl: document.fileUrl,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        category: document.category,
        source: document.preauth ? `${document.preauth.provider.name} · ${document.preauth.preauthNumber}` : "Pre-authorization",
        ownerName: document.preauth?.memberId === context.id
          ? "You"
          : document.preauth
            ? `${document.preauth.member.firstName} ${document.preauth.member.lastName}`
            : "Family member",
        createdAt: document.createdAt,
      }));

    const planDocuments = groupDocuments.map((document) => ({
      id: document.id,
      fileName: document.fileName,
      fileUrl: document.fileUrl,
      fileSize: document.fileSize,
      mimeType: document.mimeType,
      category: document.category,
      source: document.group?.name ?? "Group plan",
      ownerName: "Plan document",
      createdAt: document.createdAt,
    }));

    return {
      viewer: {
        id: context.id,
        isPrincipalViewer,
      },
      members: members.map((member) => ({
        id: member.id,
        name: member.id === context.id ? "You" : `${member.firstName} ${member.lastName}`,
        memberNumber: member.memberNumber,
        relationship: member.relationship,
        packageName: member.package.name,
      })),
      privacyNote: "Family claim and pre-authorization documents are hidden when they relate to sensitive categories.",
      sections: [
        { id: "membership", title: "Membership", documents: membershipDocuments },
        { id: "plan", title: "Benefit and plan documents", documents: planDocuments },
        { id: "preauth", title: "Pre-authorization letters", documents: visiblePreauthDocuments },
        { id: "claims", title: "Care and claim documents", documents: visibleClaimDocuments },
      ],
      totalCount: membershipDocuments.length + planDocuments.length + visiblePreauthDocuments.length + visibleClaimDocuments.length,
      hiddenSensitiveCount:
        claimDocuments.filter((document) => document.claim && document.claim.memberId !== context.id && isSensitiveFamilyCategory(document.claim.benefitCategory)).length
        + preauthDocuments.filter((document) => document.preauth && document.preauth.memberId !== context.id && isSensitiveFamilyCategory(document.preauth.benefitCategory)).length,
    };
  }
}
