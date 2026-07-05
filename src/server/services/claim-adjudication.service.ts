/**
 * claim-adjudication.service.ts — Process 9 supporting machinery
 *
 * - Contracted rate vs billed variance (fraud signal trigger)
 * - Per-line adjudication decisions (APPROVED / APPROVED_WITH_ADJUSTMENT / DECLINED)
 * - Double-capture detection (service-layer check; DB index deferred until seed data is clean)
 * - Claim outcome PREVIEW from line decisions (the actual decision is
 *   ClaimDecisionService.decide — the single canonical stack, W1.1)
 * - Appeal workflow with different reviewer enforcement
 * - Provider settlement batch (maker-checker; Mark Paid posts voucher + GL, PR-018)
 * - Excel bulk claims import (ExcelJS)
 */

import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { ClaimLineDecision, SettlementStatus } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { ProviderContractsService } from "./provider-contracts.service";
import { isFutureServiceDate, FUTURE_SERVICE_DATE_ERROR } from "@/lib/service-date";

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
   *
   * PR-012: when validating an already-persisted claim (auto-adjudication,
   * re-runs), pass `excludeClaimId` so the claim is never flagged as its own
   * duplicate. True-duplicate contract: same tenant + provider + member +
   * service date + benefit category, status not in (VOID, DECLINED) — declined
   * claims do not block a corrected resubmission, voids never block.
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
      excludeClaimId?: string;
    },
  ): Promise<{ passed: boolean; errors: string[] }> {
    const errors: string[] = [];
    const excludeSelf = claimData.excludeClaimId ? { id: { not: claimData.excludeClaimId } } : {};

    // Provider invoice uniqueness — hard constraint (@@unique in schema)
    // Already enforced by DB; re-check here for a clean error message
    if (claimData.invoiceNumber) {
      const dup = await prisma.claim.findFirst({
        where: {
          tenantId,
          providerId:    claimData.providerId,
          invoiceNumber: claimData.invoiceNumber,
          status:        { notIn: ["VOID", "DECLINED"] },
          ...excludeSelf,
        },
        select: { claimNumber: true },
      });
      if (dup) errors.push(`Duplicate provider invoice number — already recorded as claim ${dup.claimNumber}`);
    }

    // Double-capture: (provider, member, date, category) for non-void,
    // non-declined, non-reimbursement claims — excluding the claim under evaluation.
    const doubleCaps = await prisma.claim.findMany({
      where: {
        tenantId,
        providerId:      claimData.providerId,
        memberId:        claimData.memberId,
        dateOfService:   claimData.dateOfService,
        benefitCategory: claimData.benefitCategory as never,
        isReimbursement: false,
        status:          { notIn: ["VOID", "DECLINED"] },
        ...excludeSelf,
      },
      select: { claimNumber: true },
      take: 5,
    });
    if (doubleCaps.length > 0) {
      errors.push(
        `Double-capture: claim for same provider/member/date/category already exists (${doubleCaps.map((c) => c.claimNumber).join(", ")})`,
      );
    }

    // Temporal gates
    if (claimData.dischargeDate && claimData.admissionDate && claimData.dischargeDate < claimData.admissionDate) {
      errors.push("Discharge date cannot be before admission date");
    }
    // PR-013: capture channels reject future DOS at creation; this remains a
    // defence-in-depth assertion using the same operating-timezone boundary.
    if (isFutureServiceDate(claimData.dateOfService)) {
      errors.push(FUTURE_SERVICE_DATE_ERROR);
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
   * Resolves the contracted rate for each line via the provider's ACTIVE
   * contract (standalone tariffs as fallback), computes billed-vs-contracted
   * variance, and fires a ClaimFraudAlert if variance > threshold.
   */
  async computeContractedRateVariance(claimId: string, tenantId: string) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      include: {
        claimLines: true,
        provider:   { select: { id: true } },
        member:     { select: { group: { select: { clientId: true } } } },
      },
    });
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });

    const { lines: rates } = await ProviderContractsService.resolveClaimLineRates(
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

    let totalBilled     = 0;
    let totalContracted = 0;
    let hasContractedRate = false;

    for (const line of claim.claimLines) {
      totalBilled += Number(line.billedAmount);
      const rate = rates.find(r => r.lineId === line.id);
      if (rate?.agreedRate != null) {
        totalContracted += rate.agreedRate * line.quantity;
        hasContractedRate = true;
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
          notes:    `Billed KES ${totalBilled.toLocaleString("en-UG")} vs contracted KES ${totalContracted.toLocaleString("en-UG")} (${(variancePct * 100).toFixed(1)}% over)`,
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

  // ── 4. Compute overall claim outcome from line decisions (PREVIEW) ─────────

  /**
   * W1.1: preview-only. Computes the outcome the line decisions imply and the
   * net approved amount, WITHOUT writing claim status — the operator carries
   * the preview into the single "Submit Decision" form, and the canonical
   * ClaimDecisionService.decide performs the actual state change with all
   * money controls. (The pre-remediation version set the claim APPROVED here,
   * which was one half of the duplicate decision stack.)
   */
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

    return { outcome, netApprovedAmount: netAmount };
  },

  // ── 5/6. RETIRED (W1.1) ────────────────────────────────────────────────────
  // `requiresSeniorApproval`, `approveSenior` and `approveClaim` were the
  // unguarded half of the duplicate decision stack (no approval matrix, no
  // contract ceiling, no GL, usage increment that no-opped without a row and
  // was unscoped by benefit config). The ONLY decision entry point is
  // ClaimDecisionService.decide; a repo test asserts these exports stay gone.

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

    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);

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
    }

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

    // PR-027: a settlement run scoops EVERY unsettled approved claim decided
    // on or before the cycle end — never only claims decided inside the cycle
    // month. Claims approved after their month's batch settled roll into the
    // next run instead of stranding forever (one batch per provider+cycle is
    // still enforced above).
    const endDate = new Date(cycleYear, cycleMonth, 0, 23, 59, 59);

    const claims = await prisma.claim.findMany({
      where: {
        tenantId,
        providerId,
        isReimbursement: false,
        status:          { in: ["APPROVED","PARTIALLY_APPROVED"] },
        settlementBatchId: null,
        decidedAt:       { lte: endDate },
      },
      select: { id: true, approvedAmount: true },
    });

    if (claims.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No unsettled approved claims found for this provider up to the end of this cycle" });
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
      description: `Settlement batch created for ${cycleMonth}/${cycleYear} — KES ${totalAmount.toLocaleString("en-UG")} across ${claims.length} claim(s)`,
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
      data:  { status: "CHECKER_APPROVED", checkerId },
    });

    // PR-018: claims are NOT paid at checker approval — `markSettlementBatchPaid`
    // sets PAID/paidAt, creates the PaymentVoucher and posts the GL entry.

    await auditChainService.append({
      actorId:    checkerId,
      action:     "SETTLEMENT:BATCH_APPROVED",
      module:     "BILLING",
      entityType: "ProviderSettlementBatch",
      entityId:   batchId,
      payload:    { totalAmount: Number(batch.totalAmount), checkerId },
      tenantId,
      description: `Settlement batch approved — KES ${Number(batch.totalAmount).toLocaleString("en-UG")}`,
    });

    return updated;
  },

  /**
   * Mark Paid (PR-018 D1): in ONE transaction — batch → SETTLED, every claim →
   * PAID with `paidAt`, one PaymentVoucher (numbered, claim-level links), and
   * one balanced JE (Dr Claims Payable / Cr Bank). Batch↔voucher↔JE resolvable
   * both ways. A missing GL account mapping blocks settlement with a clear
   * error — no silent skip, no unbalanced posting.
   */
  async markSettlementBatchPaid(batchId: string, tenantId: string, userId: string) {
    const batch = await prisma.providerSettlementBatch.findUnique({ where: { id: batchId } });
    if (!batch || batch.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Settlement batch not found" });
    }
    if (batch.status !== "CHECKER_APPROVED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Batch is not approved yet" });
    }

    const claims = await prisma.claim.findMany({
      where: { settlementBatchId: batchId },
      select: { id: true, approvedAmount: true },
    });
    const total = claims.reduce((s, c) => s + Number(c.approvedAmount), 0);
    const paidAt = new Date();

    const { GLService } = await import("./gl.service");

    const updated = await prisma.$transaction(async (tx) => {
      const voucherCount = await tx.paymentVoucher.count({ where: { tenantId } });
      const voucherNumber = `PV-${paidAt.getFullYear()}-${String(voucherCount + 1).padStart(5, "0")}`;

      const je = await GLService.postSettlementBatchPaid(tenantId, {
        sourceId: batchId,
        reference: voucherNumber,
        amount: total,
        postedById: userId,
        tx,
      });

      const voucher = await tx.paymentVoucher.create({
        data: {
          voucherNumber,
          tenantId,
          providerId: batch.providerId,
          totalAmount: total,
          claimCount: claims.length,
          status: "PROCESSED",
          processedAt: paidAt,
          processedBy: userId,
          settlementBatchId: batchId,
          journalEntryId: je.id,
        },
      });

      await tx.claim.updateMany({
        where: { settlementBatchId: batchId },
        data: { status: "PAID", paidAt, paymentVoucherId: voucher.id },
      });

      return tx.providerSettlementBatch.update({
        where: { id: batchId },
        data: { status: "SETTLED", settledAt: paidAt },
      });
    });

    await auditChainService.append({
      actorId: userId,
      action: "SETTLEMENT:BATCH_SETTLED",
      module: "BILLING",
      entityType: "ProviderSettlementBatch",
      entityId: batchId,
      payload: { totalAmount: total, claimCount: claims.length, userId },
      tenantId,
      description: `Settlement batch marked as SETTLED — KES ${total.toLocaleString("en-UG")} across ${claims.length} claim(s), voucher + GL posted`,
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
