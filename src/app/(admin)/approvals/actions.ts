"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApprovalRequestService } from "@/server/services/approval-request.service";
import { writeAudit } from "@/lib/audit";
import { safeActionError } from "@/lib/safe-action-error";

export async function decideApprovalAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const requestId = formData.get("requestId") as string;
  const decision = formData.get("decision") as "APPROVED" | "REJECTED";
  const notes = (formData.get("notes") as string) || undefined;

  let errorMsg = "";
  try {
    const result = await ApprovalRequestService.decide(
      session.user.tenantId,
      requestId,
      { id: session.user.id, role: session.user.role ?? null },
      decision,
      notes,
    );
    await writeAudit({
      userId: session.user.id,
      action: `APPROVAL_${decision}`,
      module: "APPROVALS",
      description: `${decision} approval request ${requestId} (now ${result?.status})`,
      metadata: { requestId, status: result?.status ?? null },
    });
  } catch (err) {
    errorMsg = safeActionError(err, "approvals");
  }

  if (errorMsg) redirect(`/approvals?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath("/approvals");
}
