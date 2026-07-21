/**
 * reimbursement.service.ts — Process 10: Reimbursement Processing
 *
 * Handles benefit requests where the member paid the provider directly and
 * seeks reimbursement. Operationally similar to provider claims but:
 *   - Submission comes from the member (not the provider)
 *   - Payout goes to the member's bank account / M-Pesa (not the provider)
 *   - Requires proof of payment (receipt photo or M-Pesa SMS)
 *   - M-Pesa verification is a stub (Decision #7)
 */

import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { TRPCError } from "@trpc/server";
import { ProofType, ReimbursementPaymentMethod } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { MobileMoneyService } from "./integrations/mobile-money.service";

// Default reimbursement window: 90 days from service date
const DEFAULT_REIMBURSEMENT_WINDOW_DAYS = 90;

export const reimbursementService = {

  // ── 1. Submit a reimbursement claim ────────────────────────────────────────

  /**
   * Creates a Claim with isReimbursement=true and a linked ReimbursementRequest.
   * Validates the submission is within the reimbursement window.
   */
  async submit({
    tenantId,
    submittedById,
    memberId,
    providerId,
    serviceDate,
    totalPaidByMember,
    proofType,
    proofFileUrl,
    mpesaConfirmationCode,
    providerName,
    diagnoses,
    procedures,
    benefitCategory,
    disbursementMethod,
    windowDays = DEFAULT_REIMBURSEMENT_WINDOW_DAYS,
  }: {
    tenantId: string;
    submittedById: string;
    memberId: string;
    providerId: string;
    serviceDate: Date;
    totalPaidByMember: number;
    proofType: ProofType;
    proofFileUrl: string;
    mpesaConfirmationCode?: string;
    providerName: string;
    diagnoses: unknown;
    procedures: unknown;
    benefitCategory: string;
    disbursementMethod?: ReimbursementPaymentMethod;
    windowDays?: number;
  }) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { status: true, firstName: true, lastName: true, phone: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    if (!["ACTIVE"].includes(member.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Member ${member.firstName} ${member.lastName} is ${member.status} — reimbursement not available`,
      });
    }

    // Check submission window
    const windowCutoff = new Date(serviceDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const submittedWithinWindow = new Date() <= windowCutoff;

    // Mobile-money verification (G5.10): MTN MoMo / Airtel Money via the
    // provider-agnostic facade, inferred from the member's MSISDN. Never trust
    // the confirmation SMS itself — verify against the provider API.
    // (mpesa* field names are the legacy DB columns; rename deferred.)
    let mpesaNote: string | undefined;
    let mpesaVerified = false;
    if (proofType === "MPESA_SMS" && mpesaConfirmationCode) {
      const result = await MobileMoneyService.verify(
        "AUTO", mpesaConfirmationCode, totalPaidByMember, member.phone ?? "",
      );
      mpesaVerified = result.verified;
      mpesaNote     = result.note;
    }

    // Generate claim number
    const claimNumber = await peekNextDocumentNumber("CLM-REIMB", (yp) =>
      prisma.claim
        .findFirst({ where: { tenantId, claimNumber: { startsWith: yp } }, orderBy: { claimNumber: "desc" }, select: { claimNumber: true } })
        .then((r) => r?.claimNumber ?? null),
    );

    const claim = await prisma.$transaction(async (tx) => {
      const newClaim = await tx.claim.create({
        data: {
          tenantId,
          claimNumber,
          memberId,
          providerId,
          serviceType:    "OUTPATIENT",
          dateOfService:  serviceDate,
          diagnoses:      diagnoses as never,
          procedures:     procedures as never,
          billedAmount:   totalPaidByMember,
          benefitCategory: benefitCategory as never,
          isReimbursement: true,
          status:          "RECEIVED",
          source:          "MANUAL",
          reimbursementBankName:   disbursementMethod === "BANK_TRANSFER" ? undefined : undefined,
          reimbursementMpesaPhone: disbursementMethod === "MPESA" ? undefined : undefined,
        },
      });

      await tx.reimbursementRequest.create({
        data: {
          tenantId,
          claimId:              newClaim.id,
          memberId,
          providerName,
          serviceDate,
          totalPaidByMember,
          proofType,
          proofFileUrl,
          mpesaConfirmationCode,
          mpesaVerified,
          mpesaNote,
          submittedWithinWindow,
          reimbursementWindowDays: windowDays,
          disbursementMethod,
        },
      });

      return newClaim;
    });

    await auditChainService.append({
      actorId:    submittedById,
      action:     "REIMBURSEMENT:SUBMITTED",
      module:     "REIMBURSEMENT",
      entityType: "Claim",
      entityId:   claim.id,
      payload: {
        claimNumber, totalPaidByMember, proofType,
        submittedWithinWindow, mpesaVerified: mpesaVerified ?? false,
      },
      tenantId,
      description: `Reimbursement claim ${claimNumber} submitted — UGX ${totalPaidByMember.toLocaleString()} — proof: ${proofType}`,
    });

    if (!submittedWithinWindow) {
      console.warn(`[reimbursement] Claim ${claimNumber} submitted outside ${windowDays}-day window — flagged for reviewer`);
    }

    return claim;
  },

  // ── 2. Disburse reimbursement to member ────────────────────────────────────

  /**
   * Posts the disbursement after the claim is approved.
   * Creates a PaymentVoucher with the member as the payee.
   */
  async disburse({
    tenantId,
    claimId,
    financeOfficerId,
    disbursementRef,
  }: {
    tenantId: string;
    claimId: string;
    financeOfficerId: string;
    disbursementRef: string;
  }) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      include: { reimbursementRequest: true },
    });
    if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found" });
    if (!claim.isReimbursement) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a reimbursement claim" });
    }
    if (!["APPROVED", "PARTIALLY_APPROVED"].includes(claim.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Claim must be approved before disbursement" });
    }
    if (claim.reimbursedAt) {
      throw new TRPCError({ code: "CONFLICT", message: "Claim has already been reimbursed" });
    }

    const disbursedAmount = Number(claim.approvedAmount ?? claim.billedAmount);

    await prisma.$transaction(async (tx) => {
      // Mark the claim as reimbursed
      await tx.claim.update({
        where: { id: claimId },
        data: {
          reimbursedAt: new Date(),
          paidAmount:   disbursedAmount,
          status:       "PAID",
        },
      });

      // Update the ReimbursementRequest with disbursement details
      if (claim.reimbursementRequest) {
        await tx.reimbursementRequest.update({
          where: { claimId },
          data: { disbursedAt: new Date(), disbursementRef },
        });
      }
    });

    await auditChainService.append({
      actorId:    financeOfficerId,
      action:     "REIMBURSEMENT:DISBURSED",
      module:     "REIMBURSEMENT",
      entityType: "Claim",
      entityId:   claimId,
      payload:    { disbursedAmount, disbursementRef, claimNumber: claim.claimNumber },
      tenantId,
      description: `Reimbursement disbursed for ${claim.claimNumber}: UGX ${disbursedAmount.toLocaleString()} ref ${disbursementRef}`,
    });

    return { disbursedAmount, disbursementRef };
  },

  // ── 3. Get reimbursement detail ────────────────────────────────────────────

  async getDetail(claimId: string, tenantId: string) {
    return prisma.claim.findUnique({
      where: { id: claimId, tenantId, isReimbursement: true },
      include: {
        reimbursementRequest: true,
        member: {
          select: { id: true, firstName: true, lastName: true, memberNumber: true },
        },
        provider: { select: { name: true, type: true } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  },

  // ── 4. List reimbursement claims ───────────────────────────────────────────

  async list(tenantId: string, opts: {
    memberId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    const { page = 1, pageSize = 50 } = opts;
    const where = {
      tenantId,
      isReimbursement: true,
      ...(opts.memberId ? { memberId: opts.memberId } : {}),
      ...(opts.status   ? { status: opts.status as never } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reimbursementRequest: true,
          member: { select: { firstName: true, lastName: true, memberNumber: true } },
          provider: { select: { name: true } },
        },
      }),
      prisma.claim.count({ where }),
    ]);
    return { items, total, page, pageSize };
  },
};
