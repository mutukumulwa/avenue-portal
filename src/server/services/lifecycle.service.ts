/**
 * lifecycle.service.ts — Process 12: Lapse, Cancellation & Reinstatement
 *
 * Manages all terminal and near-terminal membership lifecycle events:
 * - Lapse detection and execution (with catch-up window)
 * - Cooling-off and standard cancellation
 * - Fraud, breach, and death termination
 * - Reinstatement within / beyond catch-up window
 * - Provider network notification (stub)
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { CancellationType, TerminationType } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { blacklistService } from "./blacklist.service";
import { preauthAdjudicationService } from "./preauth-adjudication.service";

// ─── CONFIGURABLE DEFAULTS ────────────────────────────────────────────────────

const DEFAULT_GRACE_PERIOD_DAYS   = 30;  // days from contribution due date before lapse
const DEFAULT_CATCHUP_WINDOW_DAYS = 60;  // days after lapse before catchup window expires
const DEFAULT_COOLING_OFF_DAYS    = 14;  // days after cover start for cooling-off cancellation

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export const lifecycleService = {

  // ── 1. Lapse detection ────────────────────────────────────────────────────

  /**
   * Finds ACTIVE members with unpaid contributions past the grace period.
   * Cross-checks Payment records to avoid false positives from settlement delays.
   * Called by the lapse-detection.job.ts daily at 23:00 EAT.
   */
  async detectLapseCandidates(tenantId: string): Promise<string[]> {
    const graceCutoff = new Date(Date.now() - DEFAULT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Find groups with invoices overdue past grace period and no matching payment
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status:  "OVERDUE",
        dueDate: { lt: graceCutoff },
      },
      select: {
        groupId: true,
        totalAmount: true,
        group: {
          select: {
            members: {
              where: { status: "ACTIVE" },
              select: { id: true },
            },
          },
        },
      },
    });

    // Avoid false positives: exclude groups that have a recent payment
    const candidateMemberIds: string[] = [];
    for (const inv of overdueInvoices) {
      const recentPayment = await prisma.payment.findFirst({
        where: { groupId: inv.groupId, createdAt: { gte: graceCutoff } },
      });
      if (!recentPayment) {
        candidateMemberIds.push(...inv.group.members.map((m) => m.id));
      }
    }

    return [...new Set(candidateMemberIds)];
  },

  // ── 2. Execute lapse ──────────────────────────────────────────────────────

  async lapseMembership(memberId: string, tenantId: string, actorId: string) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { status: true, memberNumber: true, firstName: true, lastName: true, groupId: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    if (member.status !== "ACTIVE") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Member is ${member.status}, not ACTIVE` });
    }

    const lapseDate      = new Date();
    const catchupDeadline = new Date(lapseDate.getTime() + DEFAULT_CATCHUP_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "LAPSED" },
      });

      await tx.membershipLapseRecord.create({
        data: {
          tenantId, memberId,
          lapseDate, unpaidAmount: 0,
          gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS,
          catchupDeadline,
        },
      });

      // Release all active benefit holds
      const activeHolds = await tx.benefitHold.findMany({
        where: { memberId, tenantId, status: "ACTIVE" },
      });
      for (const hold of activeHolds) {
        await preauthAdjudicationService.releaseBenefitHold(hold.preAuthId, tenantId);
      }
    });

    // Notify provider network (stub)
    await lifecycleService.notifyProviderNetworkOfTermination([memberId]);

    await auditChainService.append({
      actorId,
      action:     "MEMBER:LAPSED",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { memberNumber: member.memberNumber, catchupDeadline },
      tenantId,
      description: `Member ${member.memberNumber} (${member.firstName} ${member.lastName}) lapsed — catch-up window until ${catchupDeadline.toDateString()}`,
    });
  },

  // ── 3. Reinstatement within catch-up window ───────────────────────────────

  async reinstateWithinCatchup(memberId: string, tenantId: string, actorId: string) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { status: true, memberNumber: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    if (member.status !== "LAPSED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Member is not in LAPSED status" });
    }

    const lapseRecord = await prisma.membershipLapseRecord.findFirst({
      where: { memberId, tenantId, reinstatedAt: null },
      orderBy: { lapseDate: "desc" },
    });
    if (!lapseRecord) throw new TRPCError({ code: "NOT_FOUND", message: "No active lapse record found" });
    if (lapseRecord.catchupExpired || new Date() > lapseRecord.catchupDeadline) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Catch-up window expired on ${lapseRecord.catchupDeadline.toDateString()} — full re-assessment required`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // Restore to ACTIVE — waiting periods and UW decisions are NOT reset
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "ACTIVE", activationDate: new Date() },
      });

      await tx.membershipLapseRecord.update({
        where: { id: lapseRecord.id },
        data:  { reinstatedAt: new Date() },
      });
    });

    await auditChainService.append({
      actorId,
      action:     "MEMBER:REINSTATED",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { memberNumber: member.memberNumber, withinCatchup: true },
      tenantId,
      description: `Member ${member.memberNumber} reinstated within catch-up window — waiting periods preserved`,
    });
  },

  // ── 4. Reinstatement beyond catch-up (new assessment required) ────────────

  async reinstateAfterCatchup(memberId: string, tenantId: string): Promise<{ redirectToNewQuotation: boolean }> {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { status: true, groupId: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    if (!["LAPSED","EXPIRED"].includes(member.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Member must be LAPSED or EXPIRED for post-catchup reinstatement" });
    }

    // Mark catchup as expired on the lapse record
    await prisma.membershipLapseRecord.updateMany({
      where: { memberId, tenantId, reinstatedAt: null },
      data:  { catchupExpired: true },
    });

    // Caller should redirect to new quotation flow with groupId pre-filled
    return { redirectToNewQuotation: true };
  },

  // ── 5. Cooling-off cancellation ───────────────────────────────────────────

  async initiateCoolingOffCancellation(memberId: string, tenantId: string, requestedById: string) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: { group: { select: { brokerId: true, contributionRate: true } } },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    // Validate within cooling-off window
    const coverStart     = member.coverStartDate ?? member.activationDate ?? member.enrollmentDate;
    const coolingOffEnd  = new Date(coverStart.getTime() + DEFAULT_COOLING_OFF_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > coolingOffEnd) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Cooling-off window expired on ${coolingOffEnd.toDateString()} — use standard cancellation`,
      });
    }

    // Full refund: contributions paid (approximate from contribution rate × days)
    const daysSinceStart = Math.ceil((Date.now() - coverStart.getTime()) / (24 * 60 * 60 * 1000));
    const refundAmount   = (Number(member.group.contributionRate) / 365) * daysSinceStart;

    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "CANCELLED_COOLING_OFF" },
      });

      await tx.membershipCancellationRecord.create({
        data: {
          tenantId, memberId,
          cancellationType: CancellationType.COOLING_OFF,
          requestedById,
          effectiveDate:    new Date(),
          isCoolingOff:     true,
          refundAmount,
          benefitsClawedBack: true,
        },
      });
    });

    // Clawback broker commission for this member
    if (member.group.brokerId) {
      await lifecycleService.createCommissionClawback(member.groupId, memberId, tenantId, "COOLING_OFF_CANCELLATION");
    }

    await auditChainService.append({
      actorId:    requestedById,
      action:     "MEMBER:COOLING_OFF_CANCELLED",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { refundAmount, isCoolingOff: true },
      tenantId,
      description: `Member ${member.memberNumber} cancelled within cooling-off window — full refund KES ${refundAmount.toLocaleString("en-UG")}`,
    });
  },

  // ── 6. Standard cancellation ──────────────────────────────────────────────

  async initiateStandardCancellation(
    memberId: string,
    tenantId: string,
    requestedById: string,
    adminFeeKes = 500,
  ) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: { group: { select: { renewalDate: true, contributionRate: true } } },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    if (member.status !== "ACTIVE") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Member must be ACTIVE for standard cancellation" });
    }

    // Pro-rata refund for remaining period minus admin fee
    const remainingMs     = member.group.renewalDate.getTime() - Date.now();
    const remainingDays   = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    const dailyRate       = Number(member.group.contributionRate) / 365;
    const grossRefund     = dailyRate * remainingDays;
    const refundAmount    = Math.max(0, grossRefund - adminFeeKes);

    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "TERMINATED" },
      });

      await tx.membershipCancellationRecord.create({
        data: {
          tenantId, memberId,
          cancellationType: CancellationType.STANDARD,
          requestedById,
          effectiveDate:   new Date(),
          isCoolingOff:    false,
          refundAmount,
          adminFeeDeducted: adminFeeKes,
        },
      });
    });

    await lifecycleService.notifyProviderNetworkOfTermination([memberId]);

    await auditChainService.append({
      actorId:    requestedById,
      action:     "MEMBER:CANCELLED_STANDARD",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { refundAmount, remainingDays },
      tenantId,
      description: `Member ${member.memberNumber} cancelled — pro-rata refund KES ${refundAmount.toLocaleString("en-UG")} (${remainingDays}d remaining)`,
    });
  },

  // ── 7. Fraud termination ──────────────────────────────────────────────────

  async terminateForFraud(
    memberId: string,
    tenantId: string,
    actorId: string,
    reasonCode: string,
    narrative?: string,
  ) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: { group: { select: { brokerId: true } } },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "TERMINATED_FRAUD" },
      });

      await tx.membershipTerminationRecord.create({
        data: {
          tenantId, memberId,
          terminationType: TerminationType.FRAUD,
          initiatedById:   actorId,
          reasonCode,
          narrative,
          effectiveDate:   new Date(),
          blacklisted:     true,
        },
      });
    });

    // Add to internal blacklist
    if (member.idNumber) {
      await blacklistService.add({
        tenantId,
        nationalId: member.idNumber,
        memberName: `${member.firstName} ${member.lastName}`,
        reason:     "FRAUD_CONFIRMED",
        narrative,
        addedById:  actorId,
        relatedMemberId: memberId,
      });
    }

    // Clawback broker commission
    if (member.group.brokerId) {
      await lifecycleService.createCommissionClawback(member.groupId, memberId, tenantId, "FRAUD_TERMINATION");
    }

    // Release all active benefit holds
    const holds = await prisma.benefitHold.findMany({ where: { memberId, tenantId, status: "ACTIVE" } });
    for (const hold of holds) {
      await preauthAdjudicationService.releaseBenefitHold(hold.preAuthId, tenantId);
    }

    await lifecycleService.notifyProviderNetworkOfTermination([memberId]);

    await auditChainService.append({
      actorId,
      action:     "MEMBER:TERMINATED_FRAUD",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { reasonCode, blacklisted: true },
      tenantId,
      description: `Member ${member.memberNumber} terminated for fraud — blacklisted (${reasonCode})`,
    });
  },

  // ── 8. Breach termination ─────────────────────────────────────────────────

  async terminateForBreach(
    memberId: string,
    tenantId: string,
    actorId: string,
    reasonCode: string,
    narrative?: string,
  ) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { status: true, memberNumber: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "TERMINATED_BREACH" },
      });

      await tx.membershipTerminationRecord.create({
        data: {
          tenantId, memberId,
          terminationType: TerminationType.BREACH,
          initiatedById:   actorId,
          reasonCode,
          narrative,
          effectiveDate:   new Date(),
          blacklisted:     false,
        },
      });
    });

    await lifecycleService.notifyProviderNetworkOfTermination([memberId]);

    await auditChainService.append({
      actorId,
      action:     "MEMBER:TERMINATED_BREACH",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { reasonCode },
      tenantId,
      description: `Member ${member.memberNumber} terminated for breach — ${reasonCode}`,
    });
  },

  // ── 9. Death of principal ─────────────────────────────────────────────────

  async recordPrincipalDeath(
    memberId: string,
    tenantId: string,
    actorId: string,
    proofDocUrl: string,
  ) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: {
        dependents: { where: { status: "ACTIVE" }, select: { id: true, memberNumber: true } },
        group:      { select: { contributionRate: true, renewalDate: true } },
      },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });

    // Pro-rata refund for unutilized period (to estate/beneficiary)
    const remainingDays = Math.max(0, Math.ceil((member.group.renewalDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const proRataRefund = (Number(member.group.contributionRate) / 365) * remainingDays;

    await prisma.$transaction(async (tx) => {
      await tx.member.update({
        where: { id: memberId },
        data:  { status: "TERMINATED_DEATH" },
      });

      await tx.membershipTerminationRecord.create({
        data: {
          tenantId, memberId,
          terminationType: TerminationType.DEATH,
          initiatedById:   actorId,
          reasonCode:      "PRINCIPAL_DEATH",
          narrative:       `Proof of death: ${proofDocUrl}`,
          effectiveDate:   new Date(),
          proRataRefund,
          blacklisted:     false,
        },
      });

      // Suspend active dependants (they need separate continuation or termination)
      if (member.dependents.length > 0) {
        await tx.member.updateMany({
          where: { id: { in: member.dependents.map((d) => d.id) }, tenantId },
          data:  { status: "SUSPENDED" },
        });
      }
    });

    await lifecycleService.notifyProviderNetworkOfTermination([memberId, ...member.dependents.map((d) => d.id)]);

    await auditChainService.append({
      actorId,
      action:     "MEMBER:TERMINATED_DEATH",
      module:     "LIFECYCLE",
      entityType: "Member",
      entityId:   memberId,
      payload:    { proRataRefund, dependantsSuspended: member.dependents.length },
      tenantId,
      description: `Member ${member.memberNumber} deceased — ${member.dependents.length} dependant(s) suspended, pro-rata refund KES ${proRataRefund.toLocaleString("en-UG")}`,
    });
  },

  // ── 10. Provider network notification (stub) ──────────────────────────────

  async notifyProviderNetworkOfTermination(memberIds: string[]): Promise<void> {
    // Stub — real integration pushes eligibility update to SMART/Slade360
    // Members in LAPSED/TERMINATED status will fail eligibility checks
    console.info(`[lifecycle] Provider network notified of termination for ${memberIds.length} member(s) (stub)`);
  },

  // ── 11. Commission clawback helper ────────────────────────────────────────

  async createCommissionClawback(groupId: string, memberId: string, tenantId: string, reason: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { brokerId: true, contributionRate: true, renewalDate: true },
    });
    if (!group?.brokerId) return;

    const daysRemaining  = Math.max(0, Math.ceil((group.renewalDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    const clawbackAmount = (Number(group.contributionRate) / 365) * daysRemaining * 0.10;

    await prisma.commissionLedgerEntry.create({
      data: {
        brokerId:          group.brokerId,
        groupId,
        membershipId:      memberId,
        state:             "CLAWED_BACK",
        stateAsOf:         new Date(),
        grossCommission:   -clawbackAmount,
        withholdingTax:    0,
        vatAmount:         0,
        iraAgentLevy:      0,
        netPayable:        -clawbackAmount,
        earnedPeriodStart: new Date(),
        earnedPeriodEnd:   group.renewalDate,
        clawbackReason:    reason,
      },
    });
  },

  // ── 12. Queries ───────────────────────────────────────────────────────────

  async getLapseRecord(memberId: string, tenantId: string) {
    return prisma.membershipLapseRecord.findFirst({
      where: { memberId, tenantId },
      orderBy: { lapseDate: "desc" },
    });
  },

  async getCancellationRecord(memberId: string, tenantId: string) {
    return prisma.membershipCancellationRecord.findFirst({
      where: { memberId, tenantId },
      orderBy: { createdAt: "desc" },
    });
  },

  async getTerminationRecord(memberId: string, tenantId: string) {
    return prisma.membershipTerminationRecord.findFirst({
      where: { memberId, tenantId },
      orderBy: { processedAt: "desc" },
    });
  },
};
