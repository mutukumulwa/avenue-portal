"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { EndorsementsService } from "@/server/services/endorsement.service";

export async function approveEndorsementAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const endorsementId = formData.get("endorsementId") as string;
  try {
    await EndorsementsService.approveEndorsement(session.user.tenantId, endorsementId, session.user.id);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof Error ? err.message : "Approval failed";
    // PR-033/PR-009: control violations (maker-checker, GL posting) surface as
    // a banner on the endorsement, never as a raw application error.
    redirect(`/endorsements/${endorsementId}?error=${encodeURIComponent(msg)}`);
  }
  redirect("/endorsements");
}

export async function rejectEndorsementAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const endorsementId = formData.get("endorsementId") as string;
  const reason = (formData.get("rejectionReason") as string | null)?.trim() || undefined;
  try {
    // WP-3.5G: route through the service so the rejection is status-guarded + audited.
    await EndorsementsService.rejectEndorsement(session.user.tenantId, endorsementId, session.user.id, reason);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    const msg = err instanceof Error ? err.message : "Rejection failed";
    redirect(`/endorsements/${endorsementId}?error=${encodeURIComponent(msg)}`);
  }
  redirect("/endorsements");
}
