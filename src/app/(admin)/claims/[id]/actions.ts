"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClaimsService } from "@/server/services/claims.service";
import { revalidatePath } from "next/cache";
import { GLService } from "@/server/services/gl.service";
import { writeAudit } from "@/lib/audit";

export async function adjudicateClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;
  const claimId = formData.get("claimId") as string;
  const action = formData.get("action") as "APPROVED" | "PARTIALLY_APPROVED" | "DECLINED";

  const approvedAmount = action !== "DECLINED" ? Number(formData.get("approvedAmount") || 0) : 0;

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
      await GLService.postClaimApproved(tenantId, {
        sourceId:  claim.id,
        reference: claim.claimNumber,
        amount:    approvedAmount,
        postedById: session.user.id,
      });
    } catch {
      // GL not yet set up — swallow silently so adjudication still completes
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
