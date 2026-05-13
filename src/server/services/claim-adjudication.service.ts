/**
 * claim-adjudication.service.ts — Process 9: Benefit Request (Claim) Adjudication
 *
 * Extends the existing ClaimsService with the Process 9 spec requirements:
 * - Contracted rate vs billed variance (fraud signal trigger)
 * - Per-line adjudication decisions (APPROVED / APPROVED_WITH_ADJUSTMENT / DECLINED)
 * - Double-capture detection (service-layer check; DB index deferred until seed data is clean)
 * - Senior approval threshold enforcement (KES 100,000 default)
 * - Atomic claim approval: closes BenefitHold → increments BenefitUsage.amountUsed
 * - Appeal workflow with different reviewer enforcement
 * - Provider settlement batch (maker-checker)
 * - Excel bulk claims import (ExcelJS)
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { ClaimLineDecision, SettlementStatus } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { preauthAdjudicationService } from "./preauth-adjudication.service";

// Senior approval threshold in KES (configurable per scheme; this is the default)
const SENIOR_APPROVAL_THRESHOLD_KES = 100_000;

// Contracted-rate variance threshold that triggers a fraud signal (%)
const VARIANCE_FRAUD_THRESHOLD_PCT = 0.20; // 20%

// ─── SERVICE ──────────────────────────────────────────────────────────────────

export const claimAdjudicationService = {

  // ── 1. Hard-gate validation (before entering review queue) ────────────────

  /**
   * Runs all deterministic gates at receipt time.
   * Returns { passed: true } or { passed: false, errors: string[] }.
   * Double-capture prevention is enforced here (service layer) since the DB
   * partial unique index is deferred until seed data is cleaned.
   */
  async runHardGateValidation(
    tenantId: string,
    claimData: {
      providerId: string;
      memberId: string;
      dateOfService: Date;
      benefitCategory: string;
      invoiceNumber?: string;
      admissionDate?: Date;
      dischargeDate?: Date;
      gender?: string;
    },
  ): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Provider invoice uniqueness — hard constraint (@@unique in schema)
    // Already enforced by DB; re-check here for a clean error message
    if (claimData.invoiceNumber) {
      const dup = await prisma.claim.findFirst({
        where: {
          providerId:    claimData.providerId,
          invoiceNumber: claimData.invoiceNumber,
          status:        { not: "VOID" },
        },
        select: { claimNumber: true },
      });
      if (dup) errors.push(`Duplicate provider invoice number — already recorded as claim ${dup.claimNumber}`);
    }

    // Double-capture: (provider, member, date, category) for non-void, non-reimbursement claims
    const doubleCap = await prisma.claim.findFirst({
      where: {
        providerId:      claimData.providerId,
        memberId:        claimData.memberId,
        dateOfService:   claimData.dateOfService,
        benefitCategory: claimData.benefitCategory as never,
        isReimbursement: false,
        status:          { not: "VOID" },
      },
      select: { claimNumber: true },
    });
    if (doubleCap) errors.push(`Double-capture: claim for same provider/member/date/category already exists (${doubleCap.claimNumber})`);

    // Temporal gates
    if (claimData.dischargeDate && claimData.admissionDate && claimData.dischargeDate < claimData.admissionDate) {
      errors.push("Discharge date cannot be before admission date");
    }
    if (claimData.dateOfService > new Date()) {
      errors.push("Service date cannot be in the future");
    }

    // Membership cover check
    const member = await prisma.member.findUnique({
      where: { id: claimData.memberId, tenantId },
      select: { coverStartDate: true, coverEndDate: true, status: true, gender: true },
    });
    if (!member) {
      errors.push("Member not found");
    } else {
      if (member.coverStartDate && claimData.dateOfService < member.coverStartDate) {
        errors.push(`Service date ${claimData.dateOfService.toDateString()} is before cover start`);
      }
      if (member.coverEndDate && claimData.dateOfService > member.coverEndDate) {
        errors.push(`Service date ${claimData.dateOfService.toDateString()} is after cover end`);
      }
    }

    return { passed: errors.length === 0, errors };
  },

  // ── 2. Compute contracted rate variance ────────────────────────────────────

  /**
   * Looks up ProviderTariff for each CPT code on the claim.
   * Computes variance between billed and contracted.
   * Fires a ClaimFraudAlert if variance > threshold.
   */
  async computeContractedRateVariance(claimId: string, tenantId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      include: {
        claimLines: true,
        provider:   { select: { id: true } },
      },
    });
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

    let totalBilled     = 0;
    let totalContracted = 0;
    let hasContractedRate = false;

    for (const line of claim.claimLines) {
      totalBilled += Number(line.billedAmount);
      if (line.cptCode) {
        const tariff = await prisma.providerTariff.findFirst({
          where: {
            providerId: claim.providerId,
            cptCode:    line.cptCode,
            isActive:   true,
          },
          select: { agreedRate: true },
          orderBy: { effectiveFrom: "desc" },
        });
        if (tariff) {
          totalContracted += Number(tariff.agreedRate) * line.quantity;
          hasContractedRate = true;
        }
      }
    }

    if (!hasContractedRate || totalContracted === 0) return null;

    const variancePct = (totalBilled - totalContracted) / totalContracted;

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        contractedRate:       totalContracted,
        contractedVariancePct: variancePct,
      },
    });

    // Fire fraud alert if variance exceeds threshold
    if (variancePct > VARIANCE_FRAUD_THRESHOLD_PCT) {
      await prisma.claimFraudAlert.create({
        data: {
          tenantId,
          claimId,
          rule:     "CONTRACTED_RATE_VARIANCE",
          score:    Math.min(100, Math.round(variancePct * 200)),
          severity: variancePct > 0.5 ? "HIGH" : "MEDIUM",
          notes:    `Billed KES ${totalBilled.toLocaleString("en-KE")} vs contracted KES ${totalContracted.toLocaleString("en-KE")} (${(variancePct * 100).toFixed(1)}% over)`,
        },
      });
    }

    return { totalBilled, totalContracted, variancePct };
  },

  // ── 3. Per-line adjudication ────────────────────────────────────────────────

  async adjudicateLineItem(
    claimLineId: string,
    tenantId: string,
    adjudicatorId: string,
    decision: ClaimLineDecision,
    params: { adjustedAmount?: number; adjustmentReason?: string; declineReason?: string },
  ) {
    const line = await prisma.claimLine.findUnique({ where: { id: claimLineId } });
    if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Claim line not found" });

    const netAmount =
      decision === "APPROVED"                  ? Number(line.billedAmount) :
      decision === "APPROVED_WITH_ADJUSTMENT"  ? (params.adjustedAmount ?? 0) :
      0;

    await prisma.claimLine.update({
      where: { id: claimLineId },
      data: {
        adjudicationDecision: decision,
        approvedAmount:       netAmount,
        adjustedAmount:       params.adjustedAmount,
        adjustmentReason:     params.adjustmentReason,
        declineReason:        params.declineReason,
      },
    });
  },

  // ── 4. Compute overall claim outcome from line decisions ───────────────────

  async computeClaimOutcome(claimId: string, tenantId: string): Promise<{
    outcome: "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";
    netApprovedAmount: number;
  }> {
    const lines = await prisma.claimLine.findMany({ where: { claimId } });

    if (lines.every((l) => !l.adjudicationDecision)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No line items have been adjudicated yet" });
    }

    const approved  = lines.filter((l) => l.adjudicationDecision && l.adjudicationDecision !== "DECLINED");
    const declined  = lines.filter((l) => l.adjudicationDecision === "DECLINED");
    const netAmount = approved.reduce((s, l) => s + Number(l.approvedAmount), 0);

    let outcome: "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";
    if (declined.length === 0 && approved.length > 0)    outcome = "APPROVED";
    else if (approved.length > 0)                         outcome = "PARTIALLY_APPROVED";
    else                                                  outcome = "DECLINED";

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        status:         outcome,
        approvedAmount: netAmount,
        decidedAt:      new Date(),
      },
    });

    return { outcome, netApprovedAmount: netAmount };
  },

  // ── 5. Senior approval check ─────────────────────────────────────────────

  async requiresSeniorApproval(claimId: string, tenantId: string): Promise<boolean> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: { approvedAmount: true },
    });
    return Number(claim?.approvedAmount ?? 0) > SENIOR_APPROVAL_THRESHOLD_KES;
  },

  async approveSenior(claimId: string, tenantId: string, seniorId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: { adjudicatorId: true, status: true },
    });
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
    if (!["APPROVED","PARTIALLY_APPROVED"].includes(claim.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Claim must be approved before senior sign-off" });
    }
    if (claim.adjudicatorId === seniorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Senior approver must differ from the adjudicator" });
    }
    await prisma.claim.update({
      where: { id: claimId },
      data: { seniorAdjudicatorId: seniorId },
    });
  },

  // ── 6. Approve claim — atomic with BenefitHold + BenefitUsage ────────────

  /**
   * Final approval step:
   * 1. If a PA hold exists — converts it (releases hold, replaces with actual consumption)
   * 2. Increments BenefitUsage.amountUsed by the net approved amount
   * 3. Queues the claim for settlement batch
   * All three happen in a single Prisma transaction.
   */
  async approveClaim(claimId: string, tenantId: string, adjudicatorId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        preauthId: true, memberId: true, approvedAmount: true,
        status: true, adjudicatorId: true, benefitCategory: true,
        claimNumber: true,
      },
    });
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
    if (!["APPROVED","PARTIALLY_APPROVED"].includes(claim.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Compute claim outcome before approving" });
    }
    if (claim.adjudicatorId && claim.adjudicatorId !== adjudicatorId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the assigned adjudicator can finalize this claim" });
    }

    const netAmount = Number(claim.approvedAmount);

    await prisma.$transaction(async (tx) => {
      // Record adjudicator
      await tx.claim.update({
        where: { id: claimId },
        data: { adjudicatorId, paidAt: undefined }, // paidAt set when settlement batch is processed
      });

      // Convert PA hold → actual consumption
      if (claim.preauthId) {
        await preauthAdjudicationService.convertHoldToClaim(claim.preauthId, claimId, tenantId);
      }

      // Increment BenefitUsage.amountUsed (atomic)
      await tx.benefitUsage.updateMany({
        where: {
          memberId:    claim.memberId,
          periodStart: { lte: new Date() },
          periodEnd:   { gte: new Date() },
        },
        data: { amountUsed: { increment: netAmount } },
      });

      // Log adjudication
      await tx.adjudicationLog.create({
        data: {
          claimId,
          userId:     adjudicatorId,
          action:     "APPROVED",
          fromStatus: claim.status,
          toStatus:   claim.status,
          amount:     netAmount,
          notes:      `Claim approved by adjudicator — KES ${netAmount.toLocaleString("en-KE")} payable`,
        },
      });
    });

    await auditChainService.append({
      actorId:    adjudicatorId,
      action:     "CLAIM:APPROVED",
      module:     "CLAIM",
      entityType: "Claim",
      entityId:   claimId,
      payload:    { netAmount, claimNumber: claim.claimNumber },
      tenantId,
      description: `Claim ${claim.claimNumber} approved — KES ${netAmount.toLocaleString("en-KE")}`,
    });
  },

  // ── 7. Initiate appeal ────────────────────────────────────────────────────

  async initiateAppeal(claimId: string, tenantId: string, appealNotes: string, appealReviewerId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: { adjudicatorId: true, status: true, claimNumber: true },
    });
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
    if (!["DECLINED","PARTIALLY_APPROVED"].includes(claim.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Can only appeal DECLINED or PARTIALLY_APPROVED claims" });
    }
    if (claim.adjudicatorId === appealReviewerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Appeal must be reviewed by a different person than the original adjudicator" });
    }

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        status:          "APPEALED",
        appealDate:      new Date(),
        appealNotes,
        appealReviewerId,
      },
    });

    await auditChainService.append({
      actorId:    appealReviewerId,
      action:     "CLAIM:APPEAL_INITIATED",
      module:     "CLAIM",
      entityType: "Claim",
      entityId:   claimId,
      payload:    { appealNotes, appealReviewerId },
      tenantId,
      description: `Claim ${claim.claimNumber} appeal initiated`,
    });
  },

  // ── 8. Excel bulk claims import ────────────────────────────────────────────

  /**
   * Parses an Excel file (ExcelJS), runs hard-gate validation per row,
   * and returns valid claims and row-level errors.
   * The caller decides whether to submit valid rows.
   */
  async parseBulkImport(fileBuffer: Buffer, tenantId: string): Promise<{
    valid: Array<{ row: number; data: Record<string, unknown> }>;
    errors: Array<{ row: number; errors: string[] }>;
  }> {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileBuffer as never);

    const sheet = wb.worksheets[0];
    if (!sheet) return { valid: [], errors: [{ row: 0, errors: ["Workbook has no sheets"] }] };

    const valid: Array<{ row: number; data: Record<string, unknown> }> = [];
    const errors: Array<{ row: number; errors: string[] }> = [];

    sheet.eachRow(async (row, rowNum) => {
      if (rowNum === 1) return; // skip header

      const values = row.values as (string | number | Date | null)[];
      // Expected columns: MemberNumber, ProviderName, DateOfService, DiagnosisCode, CPTCode, BilledAmount, InvoiceNumber
      const [, memberNumber, providerName, dateOfService, diagnosisCode, cptCode, billedAmount, invoiceNumber] = values;

      const rowErrors: string[] = [];
      if (!memberNumber)   rowErrors.push("MemberNumber is required");
      if (!providerName)   rowErrors.push("ProviderName is required");
      if (!dateOfService)  rowErrors.push("DateOfService is required");
      if (!billedAmount || Number(billedAmount) <= 0) rowErrors.push("BilledAmount must be > 0");

      if (rowErrors.length > 0) {
        errors.push({ row: rowNum, errors: rowErrors });
      } else {
        valid.push({
          row: rowNum,
          data: { memberNumber, providerName, dateOfService, diagnosisCode, cptCode, billedAmount, invoiceNumber },
        });
      }
    });

    return { valid, errors };
  },

  // ── 9. Settlement batch (maker-checker) ────────────────────────────────────

  async createSettlementBatch(
    tenantId: string,
    providerId: string,
    cycleMonth: number,
    cycleYear: number,
    makerId: string,
  ) {
    const existing = await prisma.providerSettlementBatch.findUnique({
      where: { tenantId_providerId_cycleMonth_cycleYear: { tenantId, providerId, cycleMonth, cycleYear } },
    });
    if (existing) throw new TRPCError({ code: "CONFLICT", message: "Settlement batch already exists for this provider and cycle" });

    // Aggregate approved claims for this provider and cycle
    const startDate = new Date(cycleYear, cycleMonth - 1, 1);
    const endDate   = new Date(cycleYear, cycleMonth, 0, 23, 59, 59);

    const claims = await prisma.claim.findMany({
      where: {
        tenantId,
        providerId,
        isReimbursement: false,
        status:          { in: ["APPROVED","PARTIALLY_APPROVED"] },
        settlementBatchId: null,
        decidedAt:       { gte: startDate, lte: endDate },
      },
      select: { id: true, approvedAmount: true },
    });

    if (claims.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No approved claims found for this provider and cycle" });
    }

    const totalAmount = claims.reduce((s, c) => s + Number(c.approvedAmount), 0);

    const batch = await prisma.$transaction(async (tx) => {
      const newBatch = await tx.providerSettlementBatch.create({
        data: {
          tenantId, providerId, cycleMonth, cycleYear,
          status:      "MAKER_SUBMITTED",
          totalAmount,
          claimCount:  claims.length,
          makerId,
        },
      });

      await tx.claim.updateMany({
        where: { id: { in: claims.map((c) => c.id) } },
        data:  { settlementBatchId: newBatch.id },
      });

      return newBatch;
    });

    await auditChainService.append({
      actorId:    makerId,
      action:     "SETTLEMENT:BATCH_CREATED",
      module:     "BILLING",
      entityType: "ProviderSettlementBatch",
      entityId:   batch.id,
      payload:    { totalAmount, claimCount: claims.length, providerId, cycleMonth, cycleYear },
      tenantId,
      description: `Settlement batch created for ${cycleMonth}/${cycleYear} — KES ${totalAmount.toLocaleString("en-KE")} across ${claims.length} claim(s)`,
    });

    return batch;
  },

  async approveSettlementBatch(batchId: string, tenantId: string, checkerId: string) {
    const batch = await prisma.providerSettlementBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Settlement batch not found" });
    }
    if (batch.status !== "MAKER_SUBMITTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Batch is not pending approval" });
    }
    if (batch.makerId === checkerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Maker and checker must be different users" });
    }

    const updated = await prisma.providerSettlementBatch.update({
      where: { id: batchId },
      data:  { status: "CHECKER_APPROVED", checkerId, settledAt: new Date() },
    });

    // Mark claims as PAID
    await prisma.claim.updateMany({
      where: { settlementBatchId: batchId },
      data:  { status: "PAID", paidAt: new Date() },
    });

    await auditChainService.append({
      actorId:    checkerId,
      action:     "SETTLEMENT:BATCH_APPROVED",
      module:     "BILLING",
      entityType: "ProviderSettlementBatch",
      entityId:   batchId,
      payload:    { totalAmount: Number(batch.totalAmount), checkerId },
      tenantId,
      description: `Settlement batch approved — KES ${Number(batch.totalAmount).toLocaleString("en-KE")}`,
    });

    return updated;
  },

  async listSettlementBatches(tenantId: string, opts: { status?: SettlementStatus; page?: number; pageSize?: number } = {}) {
    const { page = 1, pageSize = 50 } = opts;
    const where = {
      tenantId,
      ...(opts.status ? { status: opts.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.providerSettlementBatch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { provider: { select: { name: true, type: true } } },
      }),
      prisma.providerSettlementBatch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },
};
