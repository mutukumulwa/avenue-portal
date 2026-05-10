"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { ReinstatementService } from "@/server/services/reinstatement.service";
import { revalidatePath } from "next/cache";

export async function approveReinstatementAction(_prev: unknown, formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const requestId = formData.get("requestId") as string;
  const resetWaitingPeriod = formData.get("resetWaitingPeriod") === "on";

  try {
    await ReinstatementService.approveReinstatement(
      session.user.tenantId, requestId, session.user.id, resetWaitingPeriod,
    );
    revalidatePath("/members/reinstatement");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Approval failed" };
  }
}

export async function declineReinstatementAction(_prev: unknown, formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const requestId = formData.get("requestId") as string;
  const declineReason = (formData.get("declineReason") as string)?.trim();

  if (!declineReason) return { error: "Decline reason is required" };

  try {
    await ReinstatementService.declineReinstatement(
      session.user.tenantId, requestId, session.user.id, declineReason,
    );
    revalidatePath("/members/reinstatement");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Decline failed" };
  }
}
