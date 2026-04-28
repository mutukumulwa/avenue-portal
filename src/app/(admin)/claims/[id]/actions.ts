"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClaimsService } from "@/server/services/claims.service";
import { CoContributionService } from "@/server/services/coContribution/coContribution.service";
import { GLService } from "@/server/services/gl.service";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

export async function adjudicateClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;
  const claimId = formData.get("claimId") as string;
  const action = formData.get("action") as "CAPTURED" | "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";

  // CAPTURED is a state transition only — mark claim as data-entry complete
  if (action === "CAPTURED") {
    await prisma.claim.update({
      where: { id: claimId, tenantId },
      data: { status: "CAPTURED" },
    });
    await prisma.adjudicationLog.create({
      data: { claimId, action: "CAPTURED", toStatus: "CAPTURED", notes: "Claim data entry complete — forwarded for review.", userId: session.user.id },
    });
    revalidatePath(`/claims/${claimId}`);
    revalidatePath("/claims");
    return;
  }

  const approvedAmount = action !== "DECLINED" ? Number(formData.get("approvedAmount") || 0) : 0;

  // ── Approval matrix check ─────────────────────────────────────────────────
  if (action === "APPROVED" || action === "PARTIALLY_APPROVED") {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: { billedAmount: true, serviceType: true, benefitCategory: true },
    });
    if (claim) {
      const matrix = await prisma.approvalMatrix.findFirst({
        where: {
          tenantId,
          isActive: true,
          OR: [{ serviceType: claim.serviceType }, { serviceType: null }],
          AND: [
            { OR: [{ benefitCategory: claim.benefitCategory }, { benefitCategory: null }] },
            { OR: [{ claimValueMin: null }, { claimValueMin: { lte: approvedAmount } }] },
            { OR: [{ claimValueMax: null }, { claimValueMax: { gte: approvedAmount } }] },
          ],
        },
        orderBy: { claimValueMin: "desc" }, // most specific rule wins
      });
      if (matrix) {
        const roleHierarchy = ["SUPER_ADMIN", "UNDERWRITER", "MEDICAL_OFFICER", "CLAIMS_OFFICER", "FINANCE_OFFICER", "CUSTOMER_SERVICE"];
        const userIdx   = roleHierarchy.indexOf(session.user.role as string);
        const reqIdx    = roleHierarchy.indexOf(matrix.requiredRole);
        if (userIdx > reqIdx) {
          throw new Error(`Approval matrix: this claim (KES ${approvedAmount.toLocaleString()}) requires a ${matrix.requiredRole.replace(/_/g, " ")} or above. Your role (${session.user.role}) is not authorised to approve it.`);
        }
      }
    }
  }

  // Tariff Validation Block
  if (action === "APPROVED" || action === "PARTIALLY_APPROVED") {
    const variances = await ClaimsService.getClaimTariffVariances(tenantId, claimId);
    if (variances.length > 0) {
      let contractedMax = 0;
      let hasContractRates = false;
      
      for (const v of variances) {
        if (v.agreedRate !== null) {
          hasContractRates = true;
          contractedMax += v.agreedRate;
        } else {
          contractedMax += v.unitCost; // Untariffed lines fallback to billed
        }
      }

      if (hasContractRates && approvedAmount > contractedMax) {
        throw new Error(`Tariff Validation Failed: Approved amount (${approvedAmount}) exceeds the contracted maximum allowed for this provider (${contractedMax}). Reduce amount or reject and query.`);
      }
    }
  }

  const claim = await ClaimsService.adjudicateClaim(tenantId, claimId, {
    action,
    approvedAmount,
    declineReasonCode: formData.get("declineReasonCode") as string || undefined,
    declineNotes: formData.get("declineNotes") as string || undefined,
    notes: formData.get("notes") as string || undefined,
    reviewerId: session.user.id,
  });

  // Auto-post GL entry when claim is approved or partially approved
  if ((action === "APPROVED" || action === "PARTIALLY_APPROVED") && approvedAmount > 0) {
    try {
      // Fetch co-contribution transaction so GL correctly splits plan share vs member share
      const coTx = await prisma.coContributionTransaction.findUnique({
        where: { claimId },
        select: { finalAmount: true },
      });
      const coContribAmount = coTx ? Number(coTx.finalAmount) : 0;

      await GLService.postClaimApproved(tenantId, {
        sourceId:  claim.id,
        reference: claim.claimNumber,
        amount:    approvedAmount,
        coContributionAmount: coContribAmount,
        postedById: session.user.id,
      });
    } catch {
      // GL not yet set up — swallow silently so adjudication still completes
    }
  }

  // ── Self-funded deduction ──────────────────────────────────────────────────
  // If the member's group is SELF_FUNDED, deduct the approved amount from the
  // fund and record a CLAIM_DEDUCTION transaction. Soft warning only — never
  // blocks adjudication.
  if ((action === "APPROVED" || action === "PARTIALLY_APPROVED") && approvedAmount > 0) {
    try {
      const memberGroup = await prisma.member.findUnique({
        where: { id: claim.memberId },
        select: { group: { select: { fundingMode: true, selfFundedAccount: { select: { id: true, balance: true } } } } },
      });
      const account = memberGroup?.group?.selfFundedAccount;
      if (memberGroup?.group?.fundingMode === "SELF_FUNDED" && account) {
        const newBalance = Number(account.balance) - approvedAmount;
        await prisma.$transaction([
          prisma.selfFundedAccount.update({
            where: { id: account.id },
            data: { balance: newBalance, totalClaims: { increment: approvedAmount } },
          }),
          prisma.fundTransaction.create({
            data: {
              tenantId,
              selfFundedAccountId: account.id,
              claimId: claim.id,
              type: "CLAIM_DEDUCTION",
              amount: approvedAmount,
              balanceAfter: newBalance,
              description: `Claim ${claim.claimNumber} — ${action.replace(/_/g, " ").toLowerCase()}`,
              postedById: session.user.id,
            },
          }),
        ]);
      }
    } catch {
      // Fund deduction failed — log silently, adjudication already committed
    }
  }

  await writeAudit({
    userId: session.user.id,
    action: `CLAIM_${action}`,
    module: "CLAIMS",
    description: `Claim ${claim.claimNumber} ${action.toLowerCase().replace(/_/g, " ")} — KES ${approvedAmount.toLocaleString()}`,
    metadata: { claimId, action, approvedAmount },
  });

  redirect(`/claims`);
}

// ── Exception logging ──────────────────────────────────────────────────────

export async function raiseExceptionAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const claimId     = formData.get("claimId")       as string;
  const entityRef   = formData.get("entityRef")     as string;
  const exceptionCode = formData.get("exceptionCode") as string;
  const reason      = formData.get("reason")        as string;
  const notes       = (formData.get("notes") as string) || null;

  // Verify claim belongs to this tenant
  const claim = await prisma.claim.findUnique({
    where: { id: claimId, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!claim) throw new Error("Claim not found");

  await prisma.$transaction([
    prisma.exceptionLog.create({
      data: {
        tenantId:      session.user.tenantId,
        entityType:    "CLAIM",
        entityId:      claimId,
        entityRef,
        claimId,
        exceptionCode,
        reason,
        notes,
        raisedById:    session.user.id,
      },
    }),
    prisma.claim.update({
      where: { id: claimId },
      data:  { hasException: true },
    }),
  ]);

  await writeAudit({
    userId: session.user.id,
    action: "EXCEPTION_RAISED",
    module: "CLAIMS",
    description: `Exception raised on claim ${entityRef}: ${exceptionCode} — ${reason}`,
    metadata: { claimId, exceptionCode },
  });

  revalidatePath(`/claims/${claimId}`);
}

export async function resolveExceptionAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const exceptionId    = formData.get("exceptionId")    as string;
  const claimId        = formData.get("claimId")        as string;
  const status         = formData.get("status")         as "APPROVED" | "REJECTED";
  const resolutionNote = (formData.get("resolutionNote") as string) || null;

  const log = await prisma.exceptionLog.findUnique({
    where:   { id: exceptionId },
    include: { tenant: { select: { id: true } } },
  });
  if (!log || log.tenantId !== session.user.tenantId) throw new Error("Not found");

  await prisma.exceptionLog.update({
    where: { id: exceptionId },
    data: {
      status,
      resolvedById:   session.user.id,
      resolvedAt:     new Date(),
      resolutionNote,
    },
  });

  // If all exceptions for this claim are resolved, clear the flag
  const pending = await prisma.exceptionLog.count({
    where: { claimId, status: "PENDING" },
  });
  if (pending === 0) {
    await prisma.claim.update({ where: { id: claimId }, data: { hasException: false } });
  }

  await writeAudit({
    userId: session.user.id,
    action: `EXCEPTION_${status}`,
    module: "CLAIMS",
    description: `Exception ${status.toLowerCase()} for claim — ${resolutionNote ?? "no note"}`,
    metadata: { exceptionId, claimId, status },
  });

  revalidatePath(`/claims/${claimId}`);
  revalidatePath(`/settings/exceptions`);
}

// ── Co-contribution collection ─────────────────────────────────────────────

export async function collectCoContributionAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.OPS);

  const transactionId    = formData.get("transactionId") as string;
  const amountCollected  = Number(formData.get("amountCollected"));
  const paymentMethod    = formData.get("paymentMethod") as string;
  const mpesaRef         = (formData.get("mpesaRef") as string) || undefined;

  if (!transactionId || isNaN(amountCollected) || amountCollected <= 0) {
    return { error: "Invalid collection details." };
  }

  const tx = await prisma.coContributionTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, claimId: true, tenantId: true },
  });
  if (!tx || tx.tenantId !== session.user.tenantId) return { error: "Transaction not found." };

  await CoContributionService.recordCollection(
    transactionId,
    new Decimal(amountCollected),
    paymentMethod,
    mpesaRef,
  );

  // GL: DR Cash/M-Pesa  CR 1150 Co-Contribution Receivable
  const claim = await prisma.claim.findUnique({ where: { id: tx.claimId }, select: { claimNumber: true } });
  try {
    await GLService.postCoContributionCollected(tx.tenantId, {
      sourceId:      transactionId,
      reference:     claim?.claimNumber ?? transactionId,
      amount:        amountCollected,
      paymentMethod,
      postedById:    session.user.id,
    });
  } catch { /* GL accounts not yet set up — swallow */ }

  revalidatePath(`/claims/${tx.claimId}`);
  return {};
}

export async function waiveCoContributionAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.OPS);

  const transactionId = formData.get("transactionId") as string;
  const reason        = (formData.get("reason") as string)?.trim();
  const approvedBy    = (formData.get("approvedBy") as string)?.trim();

  if (!transactionId || !reason || reason.length < 10 || !approvedBy) {
    return { error: "Provide a reason (min 10 chars) and the approver name." };
  }

  const tx = await prisma.coContributionTransaction.findUnique({
    where: { id: transactionId },
    select: { id: true, claimId: true, tenantId: true, finalAmount: true },
  });
  if (!tx || tx.tenantId !== session.user.tenantId) return { error: "Transaction not found." };

  await CoContributionService.waiveCoContribution(transactionId, reason, approvedBy);

  // GL: DR 5010 Net Claims Incurred  CR 1150 Co-Contribution Receivable
  const claim = await prisma.claim.findUnique({ where: { id: tx.claimId }, select: { claimNumber: true } });
  try {
    await GLService.postCoContributionWaived(tx.tenantId, {
      sourceId:   transactionId,
      reference:  claim?.claimNumber ?? transactionId,
      amount:     Number(tx.finalAmount),
      postedById: session.user.id,
    });
  } catch { /* GL accounts not yet set up — swallow */ }

  revalidatePath(`/claims/${tx.claimId}`);
  return {};
}
