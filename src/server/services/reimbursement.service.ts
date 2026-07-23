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

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { TRPCError } from "@trpc/server";
import { ProofType, ReimbursementPaymentMethod, type BenefitCategory, type ClaimLineCategory } from "@prisma/client";
import { auditChainService } from "./audit-chain.service";
import { MobileMoneyService } from "./integrations/mobile-money.service";
import { ClaimIntakeService } from "./claim-intake/intake.service";
import { assertClaimTransition } from "./claim-lifecycle";
import { processAcceptedRunInline } from "./claim-intake";

// Default reimbursement window: 90 days from service date
const DEFAULT_REIMBURSEMENT_WINDOW_DAYS = 90;

export const reimbursementService = {

  // ── 1. Submit a reimbursement claim ────────────────────────────────────────

  /**
   * The ONE reimbursement intake path (F5.6) — both the admin action and any
   * service caller converge here, and the claim itself is created by the
   * canonical ClaimIntakeService (channel REIMBURSEMENT, source REIMBURSEMENT).
   * Proof / window / payment-destination / mobile-money metadata are preserved
   * on the linked ReimbursementRequest; the staged evaluator ALWAYS routes
   * reimbursements to REIMBURSEMENT_PROOF_REVIEW (D13) — no automatic money
   * decision. Disbursement stays on the existing guarded `disburse`.
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
    lineItems,
    benefitCategory,
    disbursementMethod,
    windowDays = DEFAULT_REIMBURSEMENT_WINDOW_DAYS,
    idempotencyKey,
    attendingDoctor,
    invoiceNumber,
    bankName,
    accountNo,
    mpesaPhone,
  }: {
    tenantId: string;
    submittedById: string;
    memberId: string;
    providerId: string;
    serviceDate: Date;
    totalPaidByMember: number;
    proofType?: ProofType;
    proofFileUrl?: string;
    mpesaConfirmationCode?: string;
    providerName?: string;
    diagnoses: Array<{ code: string; description?: string; isPrimary?: boolean }>;
    lineItems: Array<{ serviceCategory: ClaimLineCategory; cptCode?: string; icdCode?: string; description: string; quantity: number; unitCost: number }>;
    benefitCategory: BenefitCategory;
    disbursementMethod?: ReimbursementPaymentMethod;
    windowDays?: number;
    /** Client draft UUID (§8.5) — replays across retry. Defaults to a one-shot key. */
    idempotencyKey?: string;
    attendingDoctor?: string;
    invoiceNumber?: string;
    bankName?: string;
    accountNo?: string;
    mpesaPhone?: string;
  }) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      select: { status: true, firstName: true, lastName: true, phone: true },
    });
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
    // NOTE (D6/F5.6): an inactive membership no longer blocks submission — the
    // claim is recorded and lands in proof review where the reviewer decides.

    // Submission window (metadata for the reviewer, not a gate).
    const windowCutoff = new Date(serviceDate.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const submittedWithinWindow = new Date() <= windowCutoff;

    // Mobile-money verification (G5.10): provider-agnostic facade; never trust
    // the confirmation SMS itself. (mpesa* names are the legacy DB columns.)
    let mpesaNote: string | undefined;
    let mpesaVerified = false;
    if (proofType === "MPESA_SMS" && mpesaConfirmationCode) {
      const result = await MobileMoneyService.verify(
        "AUTO", mpesaConfirmationCode, totalPaidByMember, member.phone ?? "",
      );
      mpesaVerified = result.verified;
      mpesaNote     = result.note;
    }

    // Exactly-one-primary normalization (first flagged wins; none => first).
    const flagged = diagnoses.findIndex((d) => d.isPrimary);
    const primaryIdx = flagged === -1 ? 0 : flagged;

    const result = await ClaimIntakeService.submit(
      { kind: "reimbursement", tenantId, userId: submittedById },
      {
        schemaVersion: "1" as const,
        idempotencyKey: idempotencyKey ?? `reimb-${randomUUID()}`,
        ...(invoiceNumber ? { invoiceNumber } : {}),
        member: { memberId },
        provider: { providerId },
        encounter: {
          serviceType: "OUTPATIENT" as const,
          benefitCategory,
          serviceFrom: serviceDate.toISOString().slice(0, 10),
          ...(attendingDoctor?.trim() ? { attendingDoctor: attendingDoctor.trim() } : {}),
        },
        diagnoses: diagnoses.map((d, i) => ({
          code: d.code,
          ...(d.description?.trim() ? { description: d.description.trim() } : {}),
          isPrimary: i === primaryIdx,
        })),
        lines: lineItems.map((l) => ({
          serviceCategory: l.serviceCategory,
          ...(l.cptCode?.trim() ? { cptCode: l.cptCode.trim() } : {}),
          ...(l.icdCode?.trim() ? { icdCode: l.icdCode.trim() } : {}),
          description: l.description,
          quantity: l.quantity,
          unitCost: l.unitCost,
          billedAmount: Math.round(l.quantity * l.unitCost * 100) / 100,
        })),
      },
      {
        origin: {
          isReimbursement: true,
          reimbursement: { bankName: bankName ?? null, accountNo: accountNo ?? null, mpesaPhone: mpesaPhone ?? null },
        },
      },
    );

    // Proof metadata rides on the linked request row (adapter concern — the
    // canonical persist owns only the claim). Best-effort AFTER acceptance:
    // the claim is already routed to proof review either way.
    if (result.claimId && result.outcome === "ACCEPTED" && proofFileUrl) {
      const facilityName = providerName
        ?? (await prisma.provider.findUnique({ where: { id: providerId }, select: { name: true } }))?.name
        ?? "Unknown Provider";
      await prisma.reimbursementRequest.create({
        data: {
          tenantId,
          claimId:              result.claimId,
          memberId,
          providerName:         facilityName,
          serviceDate,
          totalPaidByMember,
          proofType:            proofType ?? "RECEIPT_PHOTO",
          proofFileUrl,
          mpesaConfirmationCode,
          mpesaVerified,
          mpesaNote,
          submittedWithinWindow,
          reimbursementWindowDays: windowDays,
          disbursementMethod,
        },
      }).catch((err) => console.warn("[reimbursement] request-row write failed (claim still routed to proof review):", err));
    }

    await auditChainService.append({
      actorId:    submittedById,
      action:     "REIMBURSEMENT:SUBMITTED",
      module:     "REIMBURSEMENT",
      entityType: "Claim",
      entityId:   result.claimId ?? result.receiptId,
      payload: {
        claimNumber: result.claimNumber, totalPaidByMember, proofType: proofType ?? null,
        submittedWithinWindow, mpesaVerified: mpesaVerified ?? false, receiptId: result.receiptId,
      },
      tenantId,
      description: `Reimbursement claim ${result.claimNumber} submitted — UGX ${totalPaidByMember.toLocaleString()} — proof: ${proofType ?? "none"}`,
    });

    if (!submittedWithinWindow) {
      console.warn(`[reimbursement] Claim ${result.claimNumber} submitted outside ${windowDays}-day window — flagged for reviewer`);
    }

    // D9: route it to the reimbursement review queue in-request when possible.
    if (result.outcome === "ACCEPTED" && result.claimId) {
      await processAcceptedRunInline(result.claimId);
    }

    return { claimId: result.claimId, claimNumber: result.claimNumber, receiptId: result.receiptId, replayed: result.replayed };
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

    assertClaimTransition(claim.status, "PAID", "reimbursement disburse"); // F7.1
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
