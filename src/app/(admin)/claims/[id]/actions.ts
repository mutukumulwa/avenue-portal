"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertClaimTransition } from "@/server/services/claim-lifecycle";
import { safeActionError } from "@/lib/safe-action-error";
import { ClaimsService } from "@/server/services/claims.service";
import { ClaimDecisionService } from "@/server/services/claim-decision.service";
import { overrideService } from "@/server/services/override.service";
import { CoContributionService } from "@/server/services/coContribution/coContribution.service";
import { GLService } from "@/server/services/gl.service";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

/**
 * Canonical decision entry point (W1.1): parse the form, delegate every
 * control to ClaimDecisionService.decide, surface its message verbatim.
 */
export async function adjudicateClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;
  const claimId = formData.get("claimId") as string;
  const action = formData.get("action") as "CAPTURED" | "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";

  let errorMsg = "";
  try {
    // CAPTURED is a state transition only — mark claim as data-entry complete
    if (action === "CAPTURED") {
      const current = await prisma.claim.findFirst({ where: { id: claimId, tenantId }, select: { status: true } });
      if (!current) throw new Error("Claim not found");
      assertClaimTransition(current.status, "CAPTURED", "capture"); // F7.1
      const captured = await prisma.claim.update({
        where: { id: claimId, tenantId },
        data: { status: "CAPTURED" },
        select: { claimNumber: true },
      });
      await prisma.adjudicationLog.create({
        data: { claimId, action: "CAPTURED", toStatus: "CAPTURED", notes: "Claim data entry complete — forwarded for review.", userId: session.user.id },
      });
      // PR-020: the CAPTURED transition is an auditable business mutation.
      await writeAudit({
        userId: session.user.id,
        action: "CLAIM_CAPTURED",
        module: "CLAIMS",
        description: `Claim ${captured.claimNumber} marked captured — forwarded for adjudication`,
        metadata: { claimId },
      });
      revalidatePath(`/claims/${claimId}`);
      revalidatePath("/claims");
      return;
    }

    const approvedAmount = action !== "DECLINED" ? Number(formData.get("approvedAmount") || 0) : 0;
    const overCover = formData.get("overCoverConfirmed") === "on"
      ? ((formData.get("overCoverNote") as string)?.trim() || "confirmed by adjudicator")
      : null;

    // CU-OBS-11: no writeAudit here — ClaimDecisionService.decide appends the
    // hash-chained audit row for the decision (now module "CLAIMS", with the
    // actor IP captured in request contexts). A second plain row double-logged
    // every decision with an inconsistent module label.
    await ClaimDecisionService.decide(tenantId, claimId, {
      action,
      approvedAmount,
      declineReasonCode: (formData.get("declineReasonCode") as string) || undefined,
      declineNotes: (formData.get("declineNotes") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
      reviewerId: session.user.id,
      reviewerRole: session.user.role,
      overCoverConfirmation: overCover,
    });
  } catch (err) {
    errorMsg = safeActionError(err, "claim-decision");
  }

  if (errorMsg) {
    redirect(`/claims/${claimId}?error=${encodeURIComponent(errorMsg)}`);
  }

  redirect(`/claims`);
}

/**
 * PR-014 D1: raise a PAY_ABOVE_CONTRACT_RATE override for this claim. Once a
 * senior approver actions it on /overrides, the decision may exceed the
 * contract ceiling.
 */
export async function requestPriceOverrideAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;
  const claimId = formData.get("claimId") as string;
  const justification = ((formData.get("justification") as string) || "").trim();
  const requestedAmount = Number(formData.get("requestedAmount") || 0);

  let errorMsg = "";
  let okMsg = "";
  try {
    const assessment = await ClaimDecisionService.assessCeiling(tenantId, claimId);
    const impact = assessment.ceiling != null ? Math.max(0, requestedAmount - assessment.ceiling) : requestedAmount;
    await overrideService.request({
      tenantId,
      makerId: session.user.id,
      overrideType: "PAY_ABOVE_CONTRACT_RATE",
      entityType: "Claim",
      entityId: claimId,
      reasonCode: "OTHER",
      justification,
      preState: { requestedAmount, ceiling: assessment.ceiling, source: assessment.source },
      financialImpact: impact,
    });
    okMsg = "Override request raised — it must be approved on the Overrides console before the amount can be approved.";
  } catch (err) {
    errorMsg = safeActionError(err, "claim-decision");
  }

  redirect(`/claims/${claimId}?${errorMsg ? `error=${encodeURIComponent(errorMsg)}` : `notice=${encodeURIComponent(okMsg)}`}`);
}

/**
 * PR-016 #6 / PR-018 #4: void an approved-not-settled claim with compensating
 * usage + GL reversals.
 */
export async function voidClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const claimId = formData.get("claimId") as string;
  const reason = ((formData.get("reason") as string) || "").trim();

  let errorMsg = "";
  try {
    if (reason.length < 5) throw new Error("A void reason is required (min 5 characters).");
    const claim = await ClaimDecisionService.voidClaim(session.user.tenantId, claimId, {
      actorId: session.user.id,
      reason,
    });
    await writeAudit({
      userId: session.user.id,
      action: "CLAIM_VOID",
      module: "CLAIMS",
      description: `Claim ${claim.claimNumber} voided — ${reason}`,
      metadata: { claimId, reason },
    });
  } catch (err) {
    errorMsg = safeActionError(err, "claim-decision");
  }

  if (errorMsg) redirect(`/claims/${claimId}?error=${encodeURIComponent(errorMsg)}`);
  redirect(`/claims/${claimId}`);
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

// ─── PRE-AUTH ATTACHMENT (WP-C3) ─────────────────────────────────────────────

export async function attachPreauthAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const claimId = formData.get("claimId") as string;
  const preauthId = formData.get("preauthId") as string;

  const pa = await ClaimsService.attachPreauth(session.user.tenantId, claimId, preauthId);
  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_ATTACHED",
    module: "CLAIMS",
    description: `Pre-auth ${pa.preauthNumber} attached to claim ${claimId.slice(0, 8)}`,
    metadata: { claimId, preauthId },
  });
  revalidatePath(`/claims/${claimId}`);
}

export async function detachPreauthAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const claimId = formData.get("claimId") as string;
  const preauthId = formData.get("preauthId") as string;

  await ClaimsService.detachPreauth(session.user.tenantId, claimId, preauthId);
  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_DETACHED",
    module: "CLAIMS",
    description: `Pre-auth ${preauthId.slice(0, 8)} detached from claim ${claimId.slice(0, 8)}`,
    metadata: { claimId, preauthId },
  });
  revalidatePath(`/claims/${claimId}`);
}
