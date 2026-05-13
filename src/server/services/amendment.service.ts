/**
 * amendment.service.ts — Process 7: Mid-term Membership Amendments
 *
 * This service extends the existing EndorsementsService with the Process 7
 * spec requirements: proper day-count pro-rata, before/after snapshots,
 * maker-checker enforcement, back-date override validation, and full
 * amendment taxonomy with approver routing.
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { EndorsementType, ProRataType } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { overrideService } from "./override.service";

// ─── AMENDMENT TAXONOMY ───────────────────────────────────────────────────────

/**
 * Per spec §7 taxonomy table.
 * Maps each amendment type to: approver role(s), whether pro-rata applies,
 * and whether re-assessment is required.
 */
export const AMENDMENT_RULES: Record<EndorsementType, {
  approverRoles: string[];          // roles that can approve; empty = no approval needed
  hasProRata: boolean;
  requiresAssessment: boolean;
  selfApprove: boolean;             // true = no approval needed (e.g. contact update)
}> = {
  DEPENDENT_ADDITION:    { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: true,  requiresAssessment: false, selfApprove: false },
  DEPENDENT_DELETION:    { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: true,  requiresAssessment: false, selfApprove: false },
  MEMBER_ADDITION:       { approverRoles: ["UNDERWRITER"],                                   hasProRata: true,  requiresAssessment: true,  selfApprove: false },
  MEMBER_DELETION:       { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: true,  requiresAssessment: false, selfApprove: false },
  PACKAGE_UPGRADE:       { approverRoles: ["UNDERWRITER","SENIOR_MEMBERSHIP_ASSESSOR"],      hasProRata: true,  requiresAssessment: true,  selfApprove: false },
  PACKAGE_DOWNGRADE:     { approverRoles: ["UNDERWRITER","SENIOR_MEMBERSHIP_ASSESSOR"],      hasProRata: true,  requiresAssessment: false, selfApprove: false },
  TIER_CHANGE:           { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: true,  requiresAssessment: false, selfApprove: false },
  SCHEME_TRANSFER:       { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: true,  requiresAssessment: false, selfApprove: false },
  BENEFICIARY_UPDATE:    { approverRoles: [],                                                hasProRata: false, requiresAssessment: false, selfApprove: true  },
  GROUP_DATA_CHANGE:     { approverRoles: [],                                                hasProRata: false, requiresAssessment: false, selfApprove: true  },
  BANKING_DETAILS_UPDATE:{ approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: false, requiresAssessment: false, selfApprove: false },
  CORRECTION:            { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: false, requiresAssessment: false, selfApprove: false },
  MID_TERM_RATE_CHANGE:  { approverRoles: ["UNDERWRITER","SENIOR_MEMBERSHIP_ASSESSOR"],      hasProRata: true,  requiresAssessment: false, selfApprove: false },
  AGE_BAND_CHANGE:       { approverRoles: ["CUSTOMER_SERVICE"],                              hasProRata: true,  requiresAssessment: false, selfApprove: false },
  BENEFIT_MODIFICATION:  { approverRoles: ["UNDERWRITER"],                                   hasProRata: false, requiresAssessment: false, selfApprove: false },
  SALARY_CHANGE:         { approverRoles: ["CUSTOMER_SERVICE","SENIOR_MEMBERSHIP_ASSESSOR"], hasProRata: true,  requiresAssessment: false, selfApprove: false },
};

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export const amendmentService = {

  // ── 1. Initiate amendment ────────────────────────────────────────────────

  async initiateAmendment(tenantId: string, makerId: string, data: {
    groupId: string;
    type: EndorsementType;
    effectiveDate: Date;
    memberId?: string;
    changeDetails: Record<string, unknown>;
    toGroupId?: string;
    toBenefitTierId?: string;
    previousContributionKes?: number;
    newContributionKes?: number;
  }) {
    const rules = AMENDMENT_RULES[data.type];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const backDated = data.effectiveDate < today;
    if (backDated) {
      // Back-dated amendments require an OverrideRecord — created by the caller
      // We just flag it; the override is validated before apply (see applyAmendment)
    }

    const count = await prisma.endorsement.count({ where: { tenantId } });
    const endorsementNumber = `END-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    // Capture before-snapshot of the affected member if applicable
    let beforeSnapshot: Record<string, unknown> | null = null;
    if (data.memberId) {
      const member = await prisma.member.findUnique({
        where: { id: data.memberId, tenantId },
        include: {
          benefitUsages: { take: 10, orderBy: { periodStart: "desc" } },
        },
      });
      if (member) {
        beforeSnapshot = {
          memberId: member.id,
          memberNumber: member.memberNumber,
          packageId: member.packageId,
          status: member.status,
          benefitTierId: member.benefitTierId,
          coverStartDate: member.coverStartDate,
          coverEndDate: member.coverEndDate,
          snapshotAt: new Date().toISOString(),
        };
      }
    }

    const endorsement = await prisma.endorsement.create({
      data: {
        tenantId,
        endorsementNumber,
        groupId: data.groupId,
        memberId: data.memberId,
        type: data.type,
        status: rules.selfApprove ? "SUBMITTED" : "DRAFT",
        effectiveDate: data.effectiveDate,
        requestedBy: makerId,
        makerId,
        changeDetails: data.changeDetails as never,
        toGroupId: data.toGroupId,
        toBenefitTierId: data.toBenefitTierId,
        backDated,
        requiresAssessment: rules.requiresAssessment,
        beforeSnapshot: beforeSnapshot as never,
        previousPremium: data.previousContributionKes,
        newPremium: data.newContributionKes,
        premiumDelta: data.newContributionKes && data.previousContributionKes
          ? data.newContributionKes - data.previousContributionKes
          : null,
      },
    });

    await auditChainService.append({
      actorId: makerId,
      action: "AMENDMENT:INITIATED",
      module: "AMENDMENT",
      entityType: "Endorsement",
      entityId: endorsement.id,
      payload: { type: data.type, effectiveDate: data.effectiveDate, backDated },
      tenantId,
      description: `Amendment ${endorsementNumber} initiated: ${data.type}`,
    });

    return endorsement;
  },

  // ── 2. Compute pro-rata (day-count basis) ────────────────────────────────

  async computeProRata(endorsementId: string, tenantId: string): Promise<{
    adjustmentAmount: number;
    adjustmentType: ProRataType;
    daysRemaining: number;
    totalDaysInPeriod: number;
    prorataFactor: number;
  }> {
    const endorsement = await prisma.endorsement.findUnique({
      where: { id: endorsementId, tenantId },
      include: { group: { select: { renewalDate: true, effectiveDate: true, contributionRate: true } } },
    });
    if (!endorsement) throw new TRPCError({ code: "NOT_FOUND", message: "Endorsement not found" });

    const rules = AMENDMENT_RULES[endorsement.type];
    if (!rules.hasProRata) {
      return { adjustmentAmount: 0, adjustmentType: "ZERO", daysRemaining: 0, totalDaysInPeriod: 0, prorataFactor: 0 };
    }

    const effectiveDate  = new Date(endorsement.effectiveDate);
    const periodStart    = new Date(endorsement.group.effectiveDate);
    const periodEnd      = new Date(endorsement.group.renewalDate);

    const totalDaysInPeriod = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)));
    const daysRemaining     = Math.max(0, Math.ceil((periodEnd.getTime() - effectiveDate.getTime()) / (24 * 60 * 60 * 1000)));
    const prorataFactor     = daysRemaining / totalDaysInPeriod;

    const prevContrib = Number(endorsement.previousPremium ?? endorsement.group.contributionRate);
    const newContrib  = Number(endorsement.newPremium  ?? endorsement.group.contributionRate);
    const delta = newContrib - prevContrib;

    const adjustmentAmount = Math.abs(delta * prorataFactor);
    let adjustmentType: ProRataType = "ZERO";
    if (delta > 0)      adjustmentType = "CHARGE";
    else if (delta < 0) adjustmentType = "CREDIT";

    // Save ProRataCalculation
    await prisma.proRataCalculation.upsert({
      where: { endorsementId },
      update: {
        previousContribution: prevContrib,
        newContribution: newContrib,
        periodStartDate: periodStart,
        periodEndDate: periodEnd,
        effectiveDate,
        daysRemaining,
        totalDaysInPeriod,
        prorataFactor,
        adjustmentAmount: delta > 0 ? adjustmentAmount : -adjustmentAmount,
        adjustmentType,
        computedAt: new Date(),
      },
      create: {
        tenantId,
        endorsementId,
        previousContribution: prevContrib,
        newContribution: newContrib,
        periodStartDate: periodStart,
        periodEndDate: periodEnd,
        effectiveDate,
        daysRemaining,
        totalDaysInPeriod,
        prorataFactor,
        adjustmentAmount: delta > 0 ? adjustmentAmount : -adjustmentAmount,
        adjustmentType,
      },
    });

    // Link proRataCalculationId back to endorsement
    await prisma.endorsement.update({
      where: { id: endorsementId },
      data: { proratedAmount: delta > 0 ? adjustmentAmount : -adjustmentAmount },
    });

    return { adjustmentAmount, adjustmentType, daysRemaining, totalDaysInPeriod, prorataFactor };
  },

  // ── 3. Submit for approval ───────────────────────────────────────────────

  async submitForApproval(endorsementId: string, tenantId: string, makerId: string) {
    const endorsement = await prisma.endorsement.findUnique({ where: { id: endorsementId, tenantId } });
    if (!endorsement) throw new TRPCError({ code: "NOT_FOUND", message: "Endorsement not found" });
    if (endorsement.status !== "DRAFT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Only DRAFT amendments can be submitted" });
    }

    // Validate back-date has override
    if (endorsement.backDated) {
      if (!endorsement.overrideRecordId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Back-dated amendments require an approved BACK_DATED_AMENDMENT override record",
        });
      }
      const override = await prisma.overrideRecord.findUnique({ where: { id: endorsement.overrideRecordId } });
      if (!override || override.status !== "APPROVED") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Back-date override must be APPROVED before submission" });
      }
    }

    const rules = AMENDMENT_RULES[endorsement.type as EndorsementType];
    const newStatus = rules.selfApprove ? "SUBMITTED" : "SUBMITTED";

    await prisma.endorsement.update({
      where: { id: endorsementId },
      data: { status: newStatus, makerId },
    });

    await auditChainService.append({
      actorId: makerId,
      action: "AMENDMENT:SUBMITTED",
      module: "AMENDMENT",
      entityType: "Endorsement",
      entityId: endorsementId,
      payload: { type: endorsement.type, backDated: endorsement.backDated },
      tenantId,
      description: `Amendment ${endorsement.endorsementNumber} submitted for approval`,
    });
  },

  // ── 4. Approve amendment (checker step) ─────────────────────────────────

  async approveAmendment(endorsementId: string, tenantId: string, approverId: string, notes?: string) {
    const endorsement = await prisma.endorsement.findUnique({ where: { id: endorsementId, tenantId } });
    if (!endorsement) throw new TRPCError({ code: "NOT_FOUND", message: "Endorsement not found" });
    if (!["SUBMITTED","UNDER_REVIEW"].includes(endorsement.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Amendment is not pending approval" });
    }
    if (endorsement.makerId === approverId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Maker and checker must be different users" });
    }

    await prisma.endorsement.update({
      where: { id: endorsementId },
      data: {
        status: "APPROVED",
        approverId,
        reviewedBy: approverId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });

    await auditChainService.append({
      actorId: approverId,
      action: "AMENDMENT:APPROVED",
      module: "AMENDMENT",
      entityType: "Endorsement",
      entityId: endorsementId,
      payload: { type: endorsement.type, makerId: endorsement.makerId, approverId },
      tenantId,
      description: `Amendment ${endorsement.endorsementNumber} approved`,
    });
  },

  // ── 5. Apply amendment ────────────────────────────────────────────────────

  /**
   * Applies the approved amendment to the actual member/group records.
   * Captures the after-snapshot and posts the pro-rata to the next debit note.
   */
  async applyAmendment(endorsementId: string, tenantId: string, appliedById: string) {
    const endorsement = await prisma.endorsement.findUnique({
      where: { id: endorsementId, tenantId },
      include: { proRataCalculation: true, member: true },
    });
    if (!endorsement) throw new TRPCError({ code: "NOT_FOUND", message: "Endorsement not found" });
    if (endorsement.status !== "APPROVED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Amendment must be APPROVED before it can be applied" });
    }

    const type = endorsement.type as EndorsementType;
    const details = endorsement.changeDetails as Record<string, unknown>;

    // Apply the change based on type
    switch (type) {
      case "TIER_CHANGE":
        if (endorsement.memberId && endorsement.toBenefitTierId) {
          const tier = await prisma.groupBenefitTier.findUnique({ where: { id: endorsement.toBenefitTierId } });
          await prisma.member.update({
            where: { id: endorsement.memberId },
            data: { benefitTierId: endorsement.toBenefitTierId, packageId: tier?.packageId ?? undefined },
          });
        }
        break;

      case "SCHEME_TRANSFER":
        if (endorsement.memberId && endorsement.toGroupId) {
          await prisma.member.update({
            where: { id: endorsement.memberId },
            data: { groupId: endorsement.toGroupId },
          });
        }
        break;

      case "PACKAGE_UPGRADE":
      case "PACKAGE_DOWNGRADE": {
        const newPkgId = String(details.toPackageId ?? "");
        if (endorsement.memberId && newPkgId) {
          await prisma.member.update({ where: { id: endorsement.memberId }, data: { packageId: newPkgId } });
        } else if (!endorsement.memberId && newPkgId) {
          // Group-level package change
          await prisma.group.update({ where: { id: endorsement.groupId }, data: { packageId: newPkgId } });
        }
        break;
      }

      case "GROUP_DATA_CHANGE": {
        const updates: Record<string, string> = {};
        if (details.contactPersonName)  updates.contactPersonName  = String(details.contactPersonName);
        if (details.contactPersonEmail) updates.contactPersonEmail = String(details.contactPersonEmail);
        if (details.contactPersonPhone) updates.contactPersonPhone = String(details.contactPersonPhone);
        if (details.address)            updates.address            = String(details.address);
        if (Object.keys(updates).length > 0) {
          await prisma.group.update({ where: { id: endorsement.groupId }, data: updates });
        }
        break;
      }

      case "CORRECTION": {
        if (endorsement.memberId && details.fieldName) {
          const field = String(details.fieldName);
          const value = details.newValue;
          const updateData: Record<string, unknown> = {};
          if (["firstName","lastName","phone","email","idNumber"].includes(field)) {
            updateData[field] = value;
          }
          if (field === "dateOfBirth" && value) {
            updateData.dateOfBirth = new Date(String(value));
          }
          if (Object.keys(updateData).length > 0) {
            await prisma.member.update({ where: { id: endorsement.memberId }, data: updateData });
          }
        }
        break;
      }

      // MEMBER_ADDITION / DEPENDENT_ADDITION handled by existing EndorsementsService
      // MEMBER_DELETION / DEPENDENT_DELETION handled by existing EndorsementsService
      default:
        break;
    }

    // Capture after-snapshot
    let afterSnapshot: Record<string, unknown> | null = null;
    if (endorsement.memberId) {
      const updatedMember = await prisma.member.findUnique({
        where: { id: endorsement.memberId },
        select: { id: true, packageId: true, status: true, benefitTierId: true, groupId: true },
      });
      if (updatedMember) {
        afterSnapshot = { ...updatedMember, snapshotAt: new Date().toISOString() };
      }
    }

    // Post pro-rata adjustment to next debit note if applicable
    if (endorsement.proRataCalculation && Number(endorsement.proRataCalculation.adjustmentAmount) !== 0) {
      await amendmentService.postProRataAdjustment(endorsement, tenantId, appliedById);
    }

    // Handle commission impact for removals
    if (["MEMBER_DELETION","DEPENDENT_DELETION"].includes(type) && endorsement.memberId) {
      await amendmentService.processClawback(endorsement.groupId, endorsement.memberId, tenantId);
    }

    await prisma.endorsement.update({
      where: { id: endorsementId },
      data: {
        status: "APPLIED",
        appliedAt: new Date(),
        appliedBy: appliedById,
        afterSnapshot: afterSnapshot as never,
      },
    });

    await auditChainService.append({
      actorId: appliedById,
      action: "AMENDMENT:APPLIED",
      module: "AMENDMENT",
      entityType: "Endorsement",
      entityId: endorsementId,
      payload: { type, afterSnapshot },
      tenantId,
      description: `Amendment ${endorsement.endorsementNumber} applied`,
    });
  },

  // ── 6. Post pro-rata adjustment invoice ─────────────────────────────────

  async postProRataAdjustment(
    endorsement: Awaited<ReturnType<typeof prisma.endorsement.findUnique>> & { proRataCalculation?: { adjustmentAmount: unknown } | null },
    tenantId: string,
    postedById: string,
  ) {
    if (!endorsement?.proRataCalculation) return;
    const amount = Number(endorsement.proRataCalculation.adjustmentAmount);
    if (amount === 0) return;

    const invCount = await prisma.invoice.count({ where: { tenantId } });
    const invoiceNumber = `INV-ADJ-${new Date().getFullYear()}-${String(invCount + 1).padStart(5, "0")}`;
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.invoice.create({
      data: {
        tenantId,
        invoiceNumber,
        groupId: endorsement.groupId,
        period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
        memberCount: 1,
        ratePerMember: Math.abs(amount),
        totalAmount: amount,
        paidAmount: 0,
        balance: amount,
        dueDate,
        status: "SENT",
        notes: `Pro-rata adjustment: ${endorsement.endorsementNumber}`,
      },
    });
  },

  // ── 7. Commission clawback for removals ───────────────────────────────────

  async processClawback(groupId: string, memberId: string, tenantId: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { brokerId: true, renewalDate: true, contributionRate: true },
    });
    if (!group?.brokerId) return;

    const daysRemaining = Math.max(0,
      Math.ceil((new Date(group.renewalDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
    );
    const clawbackAmount = (Number(group.contributionRate) / 365) * daysRemaining * 0.10; // WHT rate

    await prisma.commissionLedgerEntry.create({
      data: {
        brokerId: group.brokerId,
        groupId,
        membershipId: memberId,
        state: "CLAWED_BACK",
        stateAsOf: new Date(),
        grossCommission: -clawbackAmount,
        withholdingTax: 0,
        vatAmount: 0,
        iraAgentLevy: 0,
        netPayable: -clawbackAmount,
        earnedPeriodStart: new Date(),
        earnedPeriodEnd: new Date(group.renewalDate),
        notes: `Clawback for member removal — ${daysRemaining} days remaining`,
      },
    });
  },

  // ── 8. Reject amendment ───────────────────────────────────────────────────

  async rejectAmendment(endorsementId: string, tenantId: string, rejectedById: string, reason: string) {
    const endorsement = await prisma.endorsement.findUnique({ where: { id: endorsementId, tenantId } });
    if (!endorsement) throw new TRPCError({ code: "NOT_FOUND", message: "Endorsement not found" });

    await prisma.endorsement.update({
      where: { id: endorsementId },
      data: { status: "REJECTED", reviewedBy: rejectedById, reviewedAt: new Date(), rejectionReason: reason },
    });

    await auditChainService.append({
      actorId: rejectedById,
      action: "AMENDMENT:REJECTED",
      module: "AMENDMENT",
      entityType: "Endorsement",
      entityId: endorsementId,
      payload: { reason },
      tenantId,
      description: `Amendment ${endorsement.endorsementNumber} rejected: ${reason}`,
    });
  },

  // ── 9. Link back-date override ────────────────────────────────────────────

  async linkBackDateOverride(endorsementId: string, overrideRecordId: string, tenantId: string) {
    const override = await prisma.overrideRecord.findUnique({ where: { id: overrideRecordId } });
    if (!override || override.tenantId !== tenantId || override.overrideType !== "BACK_DATED_AMENDMENT") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or wrong-type override record" });
    }
    await prisma.endorsement.update({
      where: { id: endorsementId, tenantId },
      data: { overrideRecordId },
    });
  },

  // ── 10. Queries ───────────────────────────────────────────────────────────

  async getWithProRata(endorsementId: string, tenantId: string) {
    return prisma.endorsement.findUnique({
      where: { id: endorsementId, tenantId },
      include: {
        proRataCalculation: true,
        maker:    { select: { id: true, firstName: true, lastName: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
        member:   { select: { id: true, memberNumber: true, firstName: true, lastName: true } },
        group:    { select: { id: true, name: true, renewalDate: true, effectiveDate: true, contributionRate: true } },
      },
    });
  },
};
