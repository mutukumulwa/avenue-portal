import { prisma } from "@/lib/prisma";
import type { ClaimStatus, PreauthStatus, BenefitCategory, ServiceType, Prisma } from "@prisma/client";
import { FraudService } from "./fraud.service";

export class ClaimsService {
  // ─── CLAIMS ─────────────────────────────────────────────

  /**
   * List all claims for a tenant with related member/provider data
   */
  static async getClaims(tenantId: string, status?: ClaimStatus) {
    return prisma.claim.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
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
        preauth: true,
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
   * Fetch contracted tariff rates for every CPT-coded line on a claim and
   * return per-line variance data.  Does NOT write to the DB.
   */
  static async getClaimTariffVariances(tenantId: string, claimId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        dateOfService: true,
        providerId: true,
        claimLines: {
          orderBy: { lineNumber: "asc" },
          select: { id: true, cptCode: true, unitCost: true, quantity: true, billedAmount: true },
        },
      },
    });
    if (!claim) return [];

    const cptCodes = claim.claimLines.map(l => l.cptCode).filter(Boolean) as string[];
    if (cptCodes.length === 0) return claim.claimLines.map(l => ({ lineId: l.id, cptCode: null, agreedRate: null, unitCost: Number(l.unitCost), variance: null, variancePct: null }));

    const tariffs = await prisma.providerTariff.findMany({
      where: {
        providerId: claim.providerId,
        cptCode:    { in: cptCodes },
        effectiveFrom: { lte: claim.dateOfService },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: claim.dateOfService } }],
      },
    });

    const tariffMap = new Map(tariffs.map(t => [t.cptCode!, Number(t.agreedRate)]));

    return claim.claimLines.map(l => {
      const agreedRate = l.cptCode ? (tariffMap.get(l.cptCode) ?? null) : null;
      const unitCost   = Number(l.unitCost);
      const variance   = agreedRate !== null ? unitCost - agreedRate : null;
      return {
        lineId:      l.id,
        cptCode:     l.cptCode,
        agreedRate,
        unitCost,
        variance,
        variancePct: agreedRate && agreedRate > 0 && variance !== null
          ? Math.round((variance / agreedRate) * 100)
          : null,
      };
    });
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
      select: { contractStatus: true, name: true },
    });
    if (provider && ["EXPIRED", "SUSPENDED"].includes(provider.contractStatus)) {
      throw new Error(
        `Provider "${provider.name}" contract is ${provider.contractStatus}. Claims cannot be submitted against this provider.`
      );
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
        preauthId: true, receivedAt: true,
      },
    });

    if (!claim) throw new Error("Claim not found");
    if (!["RECEIVED", "UNDER_REVIEW"].includes(claim.status)) {
      throw new Error("Claim cannot be adjudicated in current status");
    }

    const approvedAmount = decision.approvedAmount ?? 0;
    const copay = approvedAmount * 0.1; // Default 10% copay — will come from benefit config in 1.10
    const memberLiability = copay;
    const isApproved = decision.action !== "DECLINED";

    return prisma.$transaction(async (tx) => {
      // 1. Stamp tariff rates onto claim lines (audit trail)
      const lines = await tx.claimLine.findMany({
        where: { claimId },
        select: { id: true, cptCode: true, unitCost: true },
      });
      const cptCodes = lines.map(l => l.cptCode).filter(Boolean) as string[];
      if (cptCodes.length > 0) {
        const tariffs = await tx.providerTariff.findMany({
          where: {
            providerId: (await tx.claim.findUnique({ where: { id: claimId }, select: { providerId: true, dateOfService: true } }))!.providerId,
            cptCode: { in: cptCodes },
          },
          select: { cptCode: true, agreedRate: true },
        });
        const tariffMap = new Map(tariffs.map(t => [t.cptCode!, Number(t.agreedRate)]));
        for (const line of lines) {
          const rate = line.cptCode ? tariffMap.get(line.cptCode) : undefined;
          if (rate !== undefined) {
            await tx.claimLine.update({ where: { id: line.id }, data: { tariffRate: rate } });
          }
        }
      }

      // 2. Reserve benefit usage only for direct (non-PA) claims that are approved.
      // PA-originated claims were already reserved at PA approval time.
      if (isApproved && approvedAmount > 0 && !claim.preauthId) {
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

    return { configId: config.id, remaining: Math.max(0, limit - newUsed) };
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
