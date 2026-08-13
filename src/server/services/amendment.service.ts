/**
 * amendment.service.ts — Process 7: Mid-term Membership Amendments
 *
 * This service extends the existing EndorsementsService with the Process 7
 * spec requirements: proper day-count pro-rata, before/after snapshots,
 * maker-checker enforcement, back-date override validation, and full
 * amendment taxonomy with approver routing.
 */

import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { TRPCError } from "@trpc/server";
import { EndorsementType, ProRataType } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { overrideService } from "./override.service";
import { rbacService } from "./rbac.service";
import { readEvidence, validateEvidence } from "@/lib/endorsement-evidence";

/**
 * F-PIN-3: whenever an amendment changes a member's/group's `packageId`, the
 * `packageVersionId` pin must move with it — otherwise the member stays pinned to
 * a version of a DIFFERENT package (cost-share / usage price on the wrong terms).
 * Resolves the target package's current version.
 */
async function resolvePackageVersionId(packageId: string): Promise<string | null> {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    select: { currentVersionId: true },
  });
  return pkg?.currentVersionId ?? null;
}

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

// ─── SHARED GOVERNANCE GUARDS (WP-E1 convergence) ──────────────────────────────
//
// One approver-role matrix and one material-evidence control, enforced by BOTH
// endorsement engines. The legacy EndorsementsService (ADD/DELETE) and this
// Process-7 amendmentService both call these so `MEMBER_ADDITION`/`MEMBER_DELETION`
// stop being second-class citizens that skip the controls the other types get.

/**
 * A material change is one that moves money or eligibility (has pro-rata or needs
 * re-assessment). Contact/beneficiary/group-data edits are non-material.
 */
export function isMaterialAmendment(type: EndorsementType): boolean {
  const rules = AMENDMENT_RULES[type];
  return !!rules && (rules.hasProRata || rules.requiresAssessment);
}

/**
 * E-004: the checker must hold a role authorised to approve THIS amendment type
 * (from AMENDMENT_RULES), not merely be a different user from the maker. A
 * SUPER_ADMIN escape hatch mirrors overrideService.approve. `rbacService.hasRole`
 * resolves the enum-role baseline ∪ dynamic overlay, so this is correct even in a
 * prod tenant with zero UserRoleAssignment rows (PROD-BLOCKER-1 landmine L-6).
 *
 * Types whose matrix lists no approver role (self-approve: contact/group-data)
 * are exempt by design.
 */
export async function assertApproverAuthorized(
  type: EndorsementType,
  approverId: string,
  tenantId: string,
): Promise<void> {
  const roles = AMENDMENT_RULES[type]?.approverRoles ?? [];
  if (roles.length === 0) return;
  for (const role of roles) {
    if (await rbacService.hasRole(approverId, role, tenantId)) return;
  }
  if (await rbacService.hasRole(approverId, "SUPER_ADMIN", tenantId)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `Approver must hold one of: ${roles.join(", ")} to approve a ${type.replace(/_/g, " ")}.`,
  });
}

/**
 * E-015: a material change may not be APPROVED without evidence — either a source
 * reference recorded on the change (sourceReference / documentReference / docRef)
 * or a supporting Document linked to the endorsement. Non-material changes are
 * exempt. The changeDetails check short-circuits the DB read when a reference is
 * present.
 */
export async function assertMaterialEvidence(
  endorsement: { id: string; type: EndorsementType; changeDetails: unknown },
  tenantId: string,
): Promise<void> {
  if (!isMaterialAmendment(endorsement.type)) return;
  // UAT-HF P08.03: the accepted keys now live in `@/lib/endorsement-evidence`
  // beside the creation-time validator, so the gate and the form that has to
  // satisfy it read the same list. They were inlined here, which is how the form
  // came to write `notes` — a key this gate has never accepted (DEF-046).
  if (readEvidence(endorsement.changeDetails)) return;
  const linkedDocuments = await prisma.document.count({
    where: { endorsementId: endorsement.id, tenantId },
  });
  if (linkedDocuments > 0) return;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Material change control (E-015): a source reference or supporting document is required before this endorsement can be approved. The maker can add one on this endorsement without raising it again.",
  });
}

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

    const endorsementNumber = await peekNextDocumentNumber("END", (yp) =>
      prisma.endorsement
        .findFirst({ where: { tenantId, endorsementNumber: { startsWith: yp } }, orderBy: { endorsementNumber: "desc" }, select: { endorsementNumber: true } })
        .then((r) => r?.endorsementNumber ?? null),
    );

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

    // SYS-1: atomically claim the DRAFT→SUBMITTED transition; a concurrent submit
    // matches 0 rows → CONFLICT (one submission per amendment).
    const claimed = await prisma.endorsement.updateMany({
      where: { id: endorsementId, tenantId, status: "DRAFT" },
      data: { status: newStatus, makerId },
    });
    if (claimed.count !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This amendment was just actioned by another user — refresh to see its current status.",
      });
    }

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

    // E-004: the checker must hold a role authorised for THIS amendment type, not
    // merely be a different user. (AMENDMENT_RULES was defined but never enforced.)
    await assertApproverAuthorized(endorsement.type as EndorsementType, approverId, tenantId);
    // E-015: a material (money/eligibility) change needs a source reference or a
    // linked document before it can be approved.
    await assertMaterialEvidence(endorsement, tenantId);

    // SYS-1: the status transition is the atomic decision gate — a concurrent
    // approval matches 0 rows → CONFLICT, so the amendment carries exactly one
    // approval (SoD is pre-checked above for a clearer message).
    const claimed = await prisma.endorsement.updateMany({
      where: { id: endorsementId, tenantId, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      data: {
        status: "APPROVED",
        approverId,
        reviewedBy: approverId,
        reviewedAt: new Date(),
        reviewNotes: notes,
      },
    });
    if (claimed.count !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This amendment was just actioned by another reviewer — refresh to see the current decision.",
      });
    }

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

    // SYS-1: atomically claim APPROVED→APPLIED as the gate BEFORE any side effect
    // (member mutation / pro-rata invoice / commission clawback), so two concurrent
    // applies can't double-post. The loser matches 0 rows → CONFLICT. On a later
    // failure we revert to APPROVED so the amendment stays pending and retryable.
    const claimed = await prisma.endorsement.updateMany({
      where: { id: endorsementId, tenantId, status: "APPROVED" },
      data: { status: "APPLIED", appliedAt: new Date(), appliedBy: appliedById },
    });
    if (claimed.count !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This amendment was just actioned by another user — refresh to see its current status.",
      });
    }

    let afterSnapshot: Record<string, unknown> | null = null;
    try {
    // Apply the change based on type
    switch (type) {
      case "TIER_CHANGE":
        if (endorsement.memberId && endorsement.toBenefitTierId) {
          const tier = await prisma.groupBenefitTier.findUnique({ where: { id: endorsement.toBenefitTierId } });
          // F-PIN-3: when the tier moves the member onto a (possibly different)
          // package, re-pin packageVersionId to that package's current version.
          const newVersionId = tier?.packageId ? await resolvePackageVersionId(tier.packageId) : undefined;
          await prisma.member.update({
            where: { id: endorsement.memberId },
            data: {
              benefitTierId: endorsement.toBenefitTierId,
              packageId: tier?.packageId ?? undefined,
              ...(tier?.packageId ? { packageVersionId: newVersionId } : {}),
            },
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
        if (newPkgId) {
          // F-PIN-3: re-pin packageVersionId to the new package's current version
          // alongside packageId (member- or group-level), never leaving a stale pin.
          const newVersionId = await resolvePackageVersionId(newPkgId);
          if (endorsement.memberId) {
            await prisma.member.update({
              where: { id: endorsement.memberId },
              data: { packageId: newPkgId, packageVersionId: newVersionId },
            });
          } else {
            // Group-level package change
            await prisma.group.update({
              where: { id: endorsement.groupId },
              data: { packageId: newPkgId, packageVersionId: newVersionId },
            });
          }
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

      case "BENEFICIARY_UPDATE":
        // E-phase: there is NO beneficiary-designation model on the member record
        // (schema gap — flagged, not added here). The former `default: break`
        // silently marked the amendment APPLIED while mutating nothing. Reject
        // explicitly so a beneficiary change can never masquerade as applied; the
        // outer catch reverts APPLIED→APPROVED so it stays pending, not lost.
        throw new TRPCError({
          code: "METHOD_NOT_SUPPORTED",
          message:
            "BENEFICIARY_UPDATE cannot be applied: no beneficiary-designation model exists on the member record. " +
            "This control blocks a silent no-op (E-phase P0 — requires a Beneficiary schema).",
        });

      // MEMBER_ADDITION / DEPENDENT_ADDITION handled by existing EndorsementsService
      // MEMBER_DELETION / DEPENDENT_DELETION handled by existing EndorsementsService
      default:
        break;
    }

    // Capture after-snapshot
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

    // Status/appliedAt/appliedBy were set by the atomic claim above; persist the
    // after-snapshot now that the change has been applied.
    await prisma.endorsement.update({
      where: { id: endorsementId },
      data: { afterSnapshot: afterSnapshot as never },
    });
    } catch (err) {
      // A side effect failed after the claim — revert to APPROVED so the amendment
      // stays pending and retryable (never applied without its pro-rata/clawback).
      await prisma.endorsement
        .updateMany({
          where: { id: endorsementId },
          data: { status: "APPROVED", appliedAt: null, appliedBy: null },
        })
        .catch(() => undefined);
      throw err;
    }

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

    const invoiceNumber = await peekNextDocumentNumber("INV-ADJ", (yp) =>
      prisma.invoice
        .findFirst({ where: { tenantId, invoiceNumber: { startsWith: yp } }, orderBy: { invoiceNumber: "desc" }, select: { invoiceNumber: true } })
        .then((r) => r?.invoiceNumber ?? null),
    );
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

    // SYS-1: only a non-terminal amendment can be rejected, and only once — an
    // atomic guard stops a reject from racing an apply/approve (or double-reject).
    const claimed = await prisma.endorsement.updateMany({
      where: { id: endorsementId, tenantId, status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] } },
      data: { status: "REJECTED", reviewedBy: rejectedById, reviewedAt: new Date(), rejectionReason: reason },
    });
    if (claimed.count !== 1) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "This amendment can no longer be rejected — it was just actioned by another user.",
      });
    }

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

  // ── 8b. Supply missing E-015 evidence (UAT-HF P08.03 / DEF-046) ───────────

  /**
   * Record the source reference on an endorsement that was raised before the
   * creation form asked for one.
   *
   * The run left seven endorsements permanently stuck: they could not be
   * approved (no evidence) and rejecting them would have discarded correct work.
   * This is the governed way out.
   *
   * Three rules, all enforced here rather than in the UI:
   *
   * 1. **Maker only.** A checker who supplies the evidence and then approves on
   *    it has approved their own paperwork — precisely the separation E-015
   *    exists to enforce. This is the reason the method takes an actor at all.
   * 2. **Not on a decided endorsement.** Once APPROVED, REJECTED or APPLIED, the
   *    evidence is part of the record a decision was made against.
   * 3. **Never overwrites.** If evidence is already present the call is refused,
   *    so this cannot be used to quietly restate the justification for a change
   *    after the fact.
   */
  async supplyMaterialEvidence(
    endorsementId: string,
    tenantId: string,
    actorId: string,
    sourceReference: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const endorsement = await prisma.endorsement.findUnique({
      where: { id: endorsementId, tenantId },
      select: {
        id: true,
        type: true,
        status: true,
        requestedBy: true,
        endorsementNumber: true,
        changeDetails: true,
      },
    });
    if (!endorsement) return { ok: false, error: "Endorsement not found." };

    if (!["DRAFT", "SUBMITTED", "UNDER_REVIEW"].includes(endorsement.status)) {
      return {
        ok: false,
        error: `This endorsement is ${endorsement.status.replace(/_/g, " ").toLowerCase()}. A source reference can only be added while it is still awaiting a decision.`,
      };
    }

    if (endorsement.requestedBy !== actorId) {
      return {
        ok: false,
        error:
          "Only the person who raised this endorsement can add its source reference. A checker who supplies the evidence and then approves on it has approved their own paperwork.",
      };
    }

    if (readEvidence(endorsement.changeDetails)) {
      return {
        ok: false,
        error:
          "This endorsement already carries a source reference. Reject it and raise a corrected one rather than restating the justification.",
      };
    }

    const check = validateEvidence({ type: endorsement.type, sourceReference });
    if (!check.ok) return { ok: false, error: check.message };
    if (!check.value) {
      return { ok: false, error: "Enter the document or instruction that authorises this change." };
    }

    const details = (endorsement.changeDetails ?? {}) as Record<string, unknown>;
    await prisma.endorsement.update({
      where: { id: endorsementId, tenantId },
      data: { changeDetails: { ...details, sourceReference: check.value } as never },
    });

    await auditChainService.append({
      actorId,
      action: "AMENDMENT:EVIDENCE_SUPPLIED",
      module: "AMENDMENT",
      entityType: "Endorsement",
      entityId: endorsementId,
      payload: { sourceReference: check.value },
      tenantId,
      description: `Source reference recorded on ${endorsement.endorsementNumber} by its maker: ${check.value}`,
    });

    return { ok: true };
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
