"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { writeAudit } from "@/lib/audit";
import { safeActionError } from "@/lib/safe-action-error";

/**
 * W1.1: the single pre-auth decision entry point. Delegates to the canonical
 * preauthAdjudicationService so every approval places a BenefitHold (PR-011).
 */
export async function adjudicatePreAuthAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId = session.user.tenantId;
  const preauthId = formData.get("preauthId") as string;
  const decision  = formData.get("decision") as "APPROVE_FULL" | "APPROVE_PARTIAL" | "DECLINE";

  const isApprove = decision === "APPROVE_FULL" || decision === "APPROVE_PARTIAL";

  try {
    if (isApprove) {
      await preauthAdjudicationService.approveByHuman(
        preauthId,
        tenantId,
        session.user.id,
        Number(formData.get("approvedAmount") || 0),
        (formData.get("declineNotes") as string) || undefined,
        Number(formData.get("validDays") || 30),
      );
    } else {
      await preauthAdjudicationService.declineByHuman(
        preauthId,
        tenantId,
        session.user.id,
        (formData.get("declineReasonCode") as string) || "OTHER",
        (formData.get("declineNotes") as string) || "",
      );
    }
  } catch (err) {
    // IP-DEF-01 (leak half): never surface a raw Prisma/DB error — the pre-fix
    // path returned err.message verbatim, dumping the full model schema to the
    // browser when a write failed validation.
    return { error: safeActionError(err, "preauth-decision") };
  }

  await writeAudit({
    userId: session.user.id,
    action: `PREAUTH_${isApprove ? "APPROVED" : "DECLINED"}`,
    module: "PREAUTH",
    description: `Pre-auth ${preauthId.slice(0, 8)} ${isApprove ? "approved" : "declined"} (${decision})`,
    metadata: { preauthId, decision },
  });

  redirect(`/preauth/${preauthId}`);
}

export async function requestMedicalReviewAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId  = session.user.tenantId;
  const preauthId = formData.get("preauthId") as string;

  await ClaimsService.markPreAuthUnderReview(tenantId, preauthId);

  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_UNDER_REVIEW",
    module: "PREAUTH",
    description: `Pre-auth ${preauthId.slice(0, 8)} sent for medical review`,
    metadata: { preauthId },
  });

  redirect(`/preauth/${preauthId}`);
}

/**
 * Start an ordinary claim with this PA attached (WP-C3). The claim can then
 * accrue BAU lines and further PAs — the PA is ATTACHED, not converted.
 */
export async function convertToClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId  = session.user.tenantId;
  const preauthId = formData.get("preauthId") as string;

  const claim = await ClaimsService.createClaimWithPreauth(tenantId, preauthId);

  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_ATTACHED",
    module: "PREAUTH",
    description: `Claim ${claim.claimNumber} started with pre-auth ${preauthId.slice(0, 8)} attached`,
    metadata: { preauthId, claimId: claim.id },
  });

  redirect(`/claims/${claim.id}`);
}
