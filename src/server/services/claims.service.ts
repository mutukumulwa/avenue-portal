import { prisma } from "@/lib/prisma";
import type { ClaimStatus, PreauthStatus, BenefitCategory, ServiceType, Prisma } from "@prisma/client";
import { FraudService } from "./fraud.service";
import { ProviderContractsService, type ResolvedClaimRates } from "./provider-contracts.service";
import { CostShareResolver } from "./cost-share.service";

export class ClaimsService {
  // ─── CLAIMS ─────────────────────────────────────────────

  /**
   * Active claims work-queues (Medvex spec §3.3 / gap G3.3). Returns claims in
   * the pre-terminal lifecycle states for the ops console, scoped to the caller's
   * client when confined. Each carries member/provider/amount/receivedAt so the
   * UI can render SLA timers + drill-through.
   */
  static readonly ACTIVE_QUEUE_STATUSES: ClaimStatus[] = [
    "INCURRED",
    "RECEIVED",
    "CAPTURED",
    "UNDER_REVIEW",
    "APPROVED",
    "PARTIALLY_APPROVED",
  ];

  static async getActiveQueues(
    tenantId: string,
    clientId?: string | null,
    opts?: { take?: number; providerId?: string },
  ) {
    return prisma.claim.findMany({
      where: {
        tenantId,
        status: { in: ClaimsService.ACTIVE_QUEUE_STATUSES },
        ...(opts?.providerId ? { providerId: opts.providerId } : {}),
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      select: {
        id: true,
        claimNumber: true,
        status: true,
        source: true,
        serviceType: true,
        dateOfService: true,
        billedAmount: true,
        currency: true,
        receivedAt: true,
        providerId: true,
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
        // Contract-first SLA (WP-A1/D2): payment terms travel with the claim.
        contract: { select: { paymentTermDays: true, paymentTermType: true } },
      },
      orderBy: { receivedAt: "asc" }, // oldest first — SLA-critical ones surface
      ...(opts?.take ? { take: opts.take } : {}),
    });
  }

  /**
   * Facility-level roll-up for the queues console (WP-A1): active-claim counts
   * per provider so the UI can group facility-first and order by workload.
   */
  static async getQueueFacilitySummary(tenantId: string, clientId?: string | null) {
    const grouped = await prisma.claim.groupBy({
      by: ["providerId", "status"],
      where: {
        tenantId,
        status: { in: ClaimsService.ACTIVE_QUEUE_STATUSES },
        ...(clientId ? { member: { group: { clientId } } } : {}),
      },
      _count: { _all: true },
      _min: { receivedAt: true },
    });
    const providerIds = [...new Set(grouped.map((g) => g.providerId))];
    const providers = await prisma.provider.findMany({
      where: { id: { in: providerIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(providers.map((p) => [p.id, p.name]));
    const summary = new Map<
      string,
      { providerId: string; providerName: string; total: number; oldestReceivedAt: Date | null; byStatus: Record<string, number> }
    >();
    for (const g of grouped) {
      const row = summary.get(g.providerId) ?? {
        providerId: g.providerId,
        providerName: nameById.get(g.providerId) ?? "Unknown facility",
        total: 0,
        oldestReceivedAt: null as Date | null,
        byStatus: {} as Record<string, number>,
      };
      row.total += g._count._all;
      row.byStatus[g.status] = (row.byStatus[g.status] ?? 0) + g._count._all;
      if (g._min.receivedAt && (!row.oldestReceivedAt || g._min.receivedAt < row.oldestReceivedAt)) {
        row.oldestReceivedAt = g._min.receivedAt;
      }
      summary.set(g.providerId, row);
    }
    return [...summary.values()].sort((a, b) => b.total - a.total);
  }

  /**
   * List all claims for a tenant with related member/provider data
   */
  static async getClaims(tenantId: string, status?: ClaimStatus, clientId?: string | null) {
    return prisma.claim.findMany({
      // Client isolation (G2.1 / G5.6): confined users see only their client's claims.
      where: { tenantId, ...(status ? { status } : {}), ...(clientId ? { member: { group: { clientId } } } : {}) },
      include: {
        member:   { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true, type: true, tier: true } },
        _count:   { select: { exceptionLogs: { where: { status: "PENDING" } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single claim with full details
   */
  static async getClaimById(tenantId: string, id: string) {
    return prisma.claim.findUnique({
      where: { id, tenantId },
      include: {
        member: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
        provider: true,
        preauths: true,
        claimLines: { orderBy: { lineNumber: "asc" } },
        adjudicationLogs: { orderBy: { createdAt: "desc" } },
        exceptionLogs: {
          orderBy: { createdAt: "desc" },
          include: {
            raisedBy:   { select: { firstName: true, lastName: true } },
            resolvedBy: { select: { firstName: true, lastName: true } },
          },
        },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  /**
   * Resolve the contracted position (rate, exclusions, unlisted-service rule,
   * preauth/quantity flags) for every line on a claim.  Does NOT write to the DB.
   */
  static async getClaimTariffVariances(tenantId: string, claimId: string) {
    const resolved = await this.resolveClaimContractRates(tenantId, claimId);
    return resolved.lines;
  }

  /** Full contract-aware resolution incl. the governing contract itself. */
  static async resolveClaimContractRates(tenantId: string, claimId: string): Promise<ResolvedClaimRates> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        dateOfService: true,
        providerId: true,
        member: { select: { group: { select: { clientId: true } } } },
        claimLines: {
          orderBy: { lineNumber: "asc" },
          select: { id: true, cptCode: true, description: true, unitCost: true, quantity: true },
        },
      },
    });
    if (!claim) return { contract: null, lines: [] };

    return ProviderContractsService.resolveClaimLineRates(
      tenantId,
      claim.providerId,
      claim.dateOfService,
      claim.claimLines.map(l => ({
        id: l.id,
        cptCode: l.cptCode,
        description: l.description,
        unitCost: Number(l.unitCost),
        quantity: l.quantity,
      })),
      claim.member?.group?.clientId, // per-client tariff resolution (G5.4)
    );
  }

  /**
   * Submit a new claim
   */
  static async createClaim(tenantId: string, data: {
    memberId: string;
    providerId: string;
    serviceType: ServiceType;
    dateOfService: Date;
    admissionDate?: Date;
    dischargeDate?: Date;
    attendingDoctor?: string;
    diagnoses: Record<string, unknown>[];
    procedures: Record<string, unknown>[];
    billedAmount: number;
    benefitCategory: BenefitCategory;
    source?: string;
    preauthId?: string; // explicitly linked pre-auth
  }) {
    // ── Pre-auth gate ───────────────────────────────────────────────────────
    const member = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { packageId: true, packageVersionId: true },
    });
    if (member) {
      // Benefits that always require pre-auth
      const PREAUTH_REQUIRED = ["INPATIENT", "SURGICAL", "MATERNITY"] as const;
      const needsPreauth = (PREAUTH_REQUIRED as readonly string[]).includes(data.benefitCategory);
      if (needsPreauth && !data.preauthId) {
        // Check if there's an approved pre-auth for this member + benefit that hasn't been converted yet
        const linkedPreauth = await prisma.preAuthorization.findFirst({
          where: {
            memberId: data.memberId,
            benefitCategory: data.benefitCategory,
            status: "APPROVED",
            claimId: null,
          },
        });
        if (!linkedPreauth) {
          throw new Error(
            `A pre-authorization is required for ${data.benefitCategory.replace(/_/g, " ")} claims. ` +
            "Please submit and get a pre-auth approved before creating this claim."
          );
        }
        // Auto-link the approved pre-auth
        data.preauthId = linkedPreauth.id;
      }
    }

    // ── Provider gate ────────────────────────────────────────────────────────
    const provider = await prisma.provider.findUnique({
      where: { id: data.providerId },
      select: { contractStatus: true, name: true, tier: true },
    });
    if (provider && ["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      throw new Error(
        `Provider "${provider.name}" contract is ${provider.contractStatus}. Claims cannot be submitted against this provider.`
      );
    }

    // ── Package-level provider eligibility gate ──────────────────────────────
    const memberPkg = await prisma.member.findUnique({
      where: { id: data.memberId },
      select: { packageVersionId: true },
    });
    if (memberPkg?.packageVersionId && provider) {
      const rules = await prisma.packageProviderEligibility.findMany({
        where: { packageVersionId: memberPkg.packageVersionId },
      });
      if (rules.length > 0) {
        const includeRules = rules.filter(r => r.inclusionType === "INCLUDE");
        const excludeRules = rules.filter(r => r.inclusionType === "EXCLUDE");

        const matchesRule = (r: (typeof rules)[number]) =>
          (r.providerId === data.providerId) ||
          (r.providerTier !== null && r.providerTier === provider.tier);

        const isExcluded = excludeRules.some(matchesRule);
        if (isExcluded) {
          throw new Error(
            `Provider "${provider.name}" is explicitly excluded from this member's package. ` +
            "Please direct the member to an eligible facility."
          );
        }

        if (includeRules.length > 0) {
          const isIncluded = includeRules.some(matchesRule);
          if (!isIncluded) {
            throw new Error(
              `Provider "${provider.name}" is not in the list of eligible providers for this member's package. ` +
              "Please direct the member to an eligible facility."
            );
          }
        }
      }
    }

    const count = await prisma.claim.count({ where: { tenantId } });
    const claimNumber = `CLM-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    // Calculate length of stay for inpatient
    let lengthOfStay: number | undefined;
    if (data.admissionDate && data.dischargeDate) {
      const diff = new Date(data.dischargeDate).getTime() - new Date(data.admissionDate).getTime();
      lengthOfStay = Math.max(1, Math.ceil(diff / (1000 * 3600 * 24)));
    }

    return prisma.claim.create({
      data: {
        tenantId,
        claimNumber,
        memberId: data.memberId,
        providerId: data.providerId,
        // Attach the linked/auto-linked PA (WP-C1). Previously data.preauthId
        // was resolved but never persisted — the link silently went nowhere.
        preauths: data.preauthId ? { connect: [{ id: data.preauthId }] } : undefined,
        serviceType: data.serviceType,
        dateOfService: data.dateOfService,
        admissionDate: data.admissionDate,
        dischargeDate: data.dischargeDate,
        lengthOfStay,
        attendingDoctor: data.attendingDoctor,
        diagnoses: data.diagnoses as Prisma.InputJsonValue,
        procedures: data.procedures as Prisma.InputJsonValue,
        billedAmount: data.billedAmount,
        benefitCategory: data.benefitCategory,
        status: "RECEIVED",
        adjudicationLogs: {
          create: {
            userId: "SYSTEM",
            action: "RECEIVED",
            toStatus: "RECEIVED",
            notes: "Claim submitted for review.",
          },
        },
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
      },
    });
  }

  /**
   * Adjudicate (approve/decline) a claim.
   * On approval, reserves benefit usage — unless the claim originated from a pre-auth
   * (whose approval already reserved the usage).
   */
  static async adjudicateClaim(
    tenantId: string,
    claimId: string,
    decision: {
      action: "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";
      approvedAmount?: number;
      declineReasonCode?: string;
      declineNotes?: string;
      notes?: string;
      reviewerId: string;
    }
  ) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        id: true, claimNumber: true, status: true,
        memberId: true, benefitCategory: true,
        preauths: { select: { id: true } }, receivedAt: true,
      },
    });

    if (!claim) throw new Error("Claim not found");
    if (!["RECEIVED", "CAPTURED", "UNDER_REVIEW"].includes(claim.status)) {
      throw new Error("Claim cannot be adjudicated in current status");
    }

    // ── Practitioner credential gate ─────────────────────────────────────────
    const fullClaim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { attendingDoctor: true },
    });
    if (fullClaim?.attendingDoctor) {
      const practitioner = await prisma.practitioner.findFirst({
        where: { tenantId, licenseNumber: fullClaim.attendingDoctor },
        include: {
          credentials: {
            where: { status: "ACTIVE", expiryDate: { gte: new Date() } },
            take: 1,
          },
        },
      });
      if (practitioner && practitioner.credentials.length === 0) {
        if (decision.action !== "DECLINED") {
          throw new Error(
            `Practitioner license ${fullClaim.attendingDoctor} has no active credentials. ` +
            "Renew the credential in the provider's practitioner registry before approving."
          );
        }
      }
    }

    const approvedAmount = decision.approvedAmount ?? 0;
    const isApproved = decision.action !== "DECLINED";

    return prisma.$transaction(async (tx) => {
      // Cost-share (G9.1): deductible + co-insurance from the member's
      // BenefitConfig, plus its configured copay % (was a hard-coded 10%).
      const costShare = isApproved && approvedAmount > 0
        ? await CostShareResolver.applyForClaim(tx as never, claim.memberId, claim.benefitCategory, approvedAmount)
        : null;
      const copay = costShare ? approvedAmount * (costShare.copayPercentage / 100) : 0;
      const memberLiability = copay + (costShare?.memberPays ?? 0);

      // 1. Stamp contracted tariff rates onto claim lines (audit trail).
      // Resolution is contract-aware: the ACTIVE agreement's schedule governs,
      // standalone provider rates are the fallback.
      const resolved = await ClaimsService.resolveClaimContractRates(tenantId, claimId);
      for (const line of resolved.lines) {
        if (line.agreedRate !== null) {
          await tx.claimLine.update({ where: { id: line.lineId }, data: { tariffRate: line.agreedRate } });
        }
      }

      // 2. Reserve benefit usage only for direct (non-PA) claims that are approved.
      // PA-attached claims were already reserved at PA approval time.
      if (isApproved && approvedAmount > 0 && claim.preauths.length === 0) {
        await ClaimsService.reserveBenefitUsage(
          tx,
          claim.memberId,
          claim.benefitCategory,
          approvedAmount
        );
      }

      return tx.claim.update({
        where: { id: claimId },
        data: {
          status: decision.action,
          approvedAmount: isApproved ? approvedAmount : 0,
          copayAmount:    isApproved ? copay : 0,
          memberLiability: isApproved ? memberLiability : 0,
          costShareDeductible:  costShare?.deductibleApplied ?? 0,
          costShareCoInsurance: costShare?.coInsuranceApplied ?? 0,
          assignedReviewerId: decision.reviewerId,
          decidedAt: new Date(),
          turnaroundDays: Math.ceil(
            (new Date().getTime() - claim.receivedAt.getTime()) / (1000 * 3600 * 24)
          ),
          declineReasonCode: decision.declineReasonCode,
          declineNotes:      decision.declineNotes,
          adjudicationLogs: {
            create: {
              userId:     decision.reviewerId,
              action:     decision.action,
              fromStatus: claim.status,
              toStatus:   decision.action,
              amount:     approvedAmount,
              notes:      decision.notes || decision.declineNotes,
            },
          },
        },
      });
    });
  }

  // ─── PRE-AUTHORIZATIONS ─────────────────────────────────

  /**
   * List pre-authorizations
   */
  static async getPreAuthorizations(tenantId: string, status?: PreauthStatus) {
    return prisma.preAuthorization.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: {
        member: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Get a single pre-authorization with full details
   */
  static async getPreAuthById(tenantId: string, id: string) {
    return prisma.preAuthorization.findUnique({
      where: { id, tenantId },
      include: {
        member: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
        provider: true,
        claim: true,
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  }

  /**
   * Submit a pre-authorization request
   */
  static async createPreAuth(tenantId: string, data: {
    memberId: string;
    providerId: string;
    serviceType: ServiceType;
    expectedDateOfService?: Date;
    diagnoses: Record<string, unknown>[];
    procedures: Record<string, unknown>[];
    estimatedCost: number;
    clinicalNotes?: string;
    benefitCategory: BenefitCategory;
    submittedBy: string;
  }) {
    // ── Eligibility gate ────────────────────────────────────────────────────
    const member = await prisma.member.findUnique({
      where: { id: data.memberId, tenantId },
      include: { group: { select: { status: true, name: true } } },
    });
    if (!member) throw new Error("Member not found");

    const BLOCKED = ["SUSPENDED", "LAPSED", "TERMINATED"];
    if (BLOCKED.includes(member.status)) {
      throw new Error(
        `Cannot submit pre-authorisation: member ${member.firstName} ${member.lastName} is ${member.status}.`
      );
    }
    if (member.group && BLOCKED.includes(member.group.status)) {
      throw new Error(
        `Cannot submit pre-authorisation: group "${member.group.name}" is ${member.group.status}.`
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Fraud pre-auth screen (CRITICAL rules throw; others return warnings) ─
    const fraudWarnings = await FraudService.evaluatePreAuth({
      memberId: data.memberId,
      providerId: data.providerId,
      serviceType: data.serviceType,
      expectedDateOfService: data.expectedDateOfService,
      estimatedCost: data.estimatedCost,
      procedures: data.procedures as Array<{ description?: string; cptCode?: string }>,
      memberGender: member.gender,
      tenantId,
    });
    // ────────────────────────────────────────────────────────────────────────

    const count = await prisma.preAuthorization.count({ where: { tenantId } });
    const preauthNumber = `PA-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const preauth = await prisma.preAuthorization.create({
      data: {
        tenantId,
        preauthNumber,
        memberId: data.memberId,
        providerId: data.providerId,
        serviceType: data.serviceType,
        expectedDateOfService: data.expectedDateOfService,
        diagnoses: data.diagnoses as Prisma.InputJsonValue,
        procedures: data.procedures as Prisma.InputJsonValue,
        estimatedCost: data.estimatedCost,
        clinicalNotes: data.clinicalNotes,
        benefitCategory: data.benefitCategory,
        submittedBy: data.submittedBy,
        status: "SUBMITTED",
      },
      include: {
        member: { select: { firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { name: true } },
      },
    });

    return { preauth, warnings: fraudWarnings };
  }

  /**
   * Reserve benefit usage for a member atomically within a transaction.
   * Called on PA approval and on non-PA claim approval.
   * Returns the benefit config ID so the caller can store it on the record.
   */
  private static async reserveBenefitUsage(
    tx: Prisma.TransactionClient,
    memberId: string,
    benefitCategory: BenefitCategory,
    amount: number
  ): Promise<{ configId: string | null; remaining: number }> {
    const member = await tx.member.findUnique({
      where: { id: memberId },
      select: { packageVersionId: true, enrollmentDate: true },
    });
    if (!member?.packageVersionId) return { configId: null, remaining: 0 };

    const config = await tx.benefitConfig.findFirst({
      where: { packageVersionId: member.packageVersionId, category: benefitCategory },
      include: {
        sharedLimitGroups: {
          include: {
            sharedLimitGroup: {
              include: { benefitConfigs: true },
            },
          },
        },
      },
    });
    if (!config) return { configId: null, remaining: 0 };

    // Annual benefit period anchored to enrollment anniversary
    const now = new Date();
    const enroll = new Date(member.enrollmentDate);
    let periodStart = new Date(now.getFullYear(), enroll.getMonth(), enroll.getDate());
    if (periodStart > now) periodStart = new Date(now.getFullYear() - 1, enroll.getMonth(), enroll.getDate());
    const periodEnd = new Date(periodStart.getFullYear() + 1, enroll.getMonth(), enroll.getDate());

    const existing = await tx.benefitUsage.findUnique({
      where: { memberId_benefitConfigId_periodStart: { memberId, benefitConfigId: config.id, periodStart } },
    });

    const currentUsed = Number(existing?.amountUsed ?? 0);
    const limit = Number(config.annualSubLimit);
    const newUsed = currentUsed + amount;

    // Evaluate shared limit groups
    let sharedRemaining = Infinity;
    if (config.sharedLimitGroups && config.sharedLimitGroups.length > 0) {
      for (const link of config.sharedLimitGroups) {
        const group = link.sharedLimitGroup;
        const configIds = group.benefitConfigs.map(bc => bc.benefitConfigId);
        
        const groupUsages = await tx.benefitUsage.findMany({
          where: {
            memberId,
            benefitConfigId: { in: configIds },
            periodStart,
          },
        });
        
        const groupUsedSoFar = groupUsages.reduce((sum, u) => sum + Number(u.amountUsed), 0);
        const groupLimit = Number(group.limitAmount);
        const remainingForGroup = Math.max(0, groupLimit - (groupUsedSoFar + amount));
        
        if (remainingForGroup < sharedRemaining) {
          sharedRemaining = remainingForGroup;
        }
      }
    }

    if (existing) {
      await tx.benefitUsage.update({
        where: { id: existing.id },
        data: { amountUsed: newUsed, claimCount: { increment: 1 }, lastUpdated: now },
      });
    } else {
      await tx.benefitUsage.create({
        data: { memberId, benefitConfigId: config.id, periodStart, periodEnd, amountUsed: amount, claimCount: 1 },
      });
    }

    const standardRemaining = Math.max(0, limit - newUsed);
    return { 
      configId: config.id, 
      remaining: sharedRemaining !== Infinity ? Math.min(standardRemaining, sharedRemaining) : standardRemaining 
    };
  }

  /**
   * Stage 1 of two-stage review: move a SUBMITTED inpatient pre-auth to UNDER_REVIEW.
   */
  static async markPreAuthUnderReview(tenantId: string, preauthId: string) {
    const preauth = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
    });
    if (!preauth) throw new Error("Pre-authorization not found");
    if (preauth.status !== "SUBMITTED") {
      throw new Error("Pre-authorization is not in SUBMITTED status");
    }
    return prisma.preAuthorization.update({
      where: { id: preauthId },
      data: { status: "UNDER_REVIEW" },
    });
  }

  /**
   * Approve or decline a pre-authorization.
   * On approval, atomically reserves the approved amount against the member's benefit usage.
   */
  static async adjudicatePreAuth(
    tenantId: string,
    preauthId: string,
    decision: {
      action: "APPROVED" | "DECLINED";
      approvedAmount?: number;
      validDays?: number;
      declineReasonCode?: string;
      declineNotes?: string;
      reviewerId: string;
    }
  ) {
    const preauth = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
    });

    if (!preauth) throw new Error("Pre-authorization not found");
    if (!["SUBMITTED", "UNDER_REVIEW"].includes(preauth.status)) {
      throw new Error("Pre-authorization cannot be adjudicated in current status");
    }

    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + (decision.validDays ?? 30));

    if (decision.action === "APPROVED") {
      const approvedAmount = decision.approvedAmount ?? Number(preauth.estimatedCost);

      return prisma.$transaction(async (tx) => {
        // 1. Reserve benefit usage atomically
        const { remaining } = await ClaimsService.reserveBenefitUsage(
          tx,
          preauth.memberId,
          preauth.benefitCategory,
          approvedAmount
        );

        // 2. Approve the pre-auth, snapshot remaining benefit
        return tx.preAuthorization.update({
          where: { id: preauthId },
          data: {
            status: "APPROVED",
            approvedAmount,
            approvedBy: decision.reviewerId,
            approvedAt: now,
            validFrom: now,
            validUntil,
            benefitRemaining: remaining,
          },
        });
      });
    } else {
      return prisma.preAuthorization.update({
        where: { id: preauthId },
        data: {
          status: "DECLINED",
          declineReasonCode: decision.declineReasonCode,
          declineNotes: decision.declineNotes,
          declinedBy: decision.reviewerId,
          declinedAt: now,
        },
      });
    }
  }

  /**
   * Convert an approved pre-auth into a claim
   */
  static async convertPreAuthToClaim(tenantId: string, preauthId: string) {
    const preauth = await prisma.preAuthorization.findUnique({
      where: { id: preauthId, tenantId },
    });

    if (!preauth) throw new Error("Pre-authorization not found");
    if (preauth.status !== "APPROVED") {
      throw new Error("Only approved pre-authorizations can be converted to claims");
    }

    const claim = await this.createClaim(tenantId, {
      memberId: preauth.memberId,
      providerId: preauth.providerId,
      serviceType: preauth.serviceType,
      dateOfService: preauth.expectedDateOfService ?? new Date(),
      diagnoses: preauth.diagnoses as Record<string, unknown>[],
      procedures: preauth.procedures as Record<string, unknown>[],
      billedAmount: Number(preauth.approvedAmount ?? preauth.estimatedCost),
      benefitCategory: preauth.benefitCategory,
      source: "PREAUTH",
    });

    // Mark the pre-auth as converted
    await prisma.preAuthorization.update({
      where: { id: preauthId },
      data: {
        status: "CONVERTED_TO_CLAIM",
        claimId: claim.id,
        convertedAt: new Date(),
      },
    });

    return claim;
  }
}
