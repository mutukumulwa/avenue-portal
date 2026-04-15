"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { writeAudit } from "@/lib/audit";

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
    await ClaimsService.adjudicatePreAuth(tenantId, preauthId, {
      action:            isApprove ? "APPROVED" : "DECLINED",
      approvedAmount:    isApprove ? Number(formData.get("approvedAmount") || 0) : undefined,
      validDays:         isApprove ? Number(formData.get("validDays") || 30)     : undefined,
      declineReasonCode: !isApprove ? (formData.get("declineReasonCode") as string) : undefined,
      declineNotes:      formData.get("declineNotes") as string || undefined,
      reviewerId:        session.user.id,
    });
  } catch (err) {
    return { error: (err as Error).message };
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

export async function convertToClaimAction(formData: FormData) {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId  = session.user.tenantId;
  const preauthId = formData.get("preauthId") as string;

  await ClaimsService.convertPreAuthToClaim(tenantId, preauthId);

  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_CONVERTED",
    module: "PREAUTH",
    description: `Pre-auth ${preauthId.slice(0, 8)} converted to claim`,
    metadata: { preauthId },
  });

  redirect("/claims");
}
