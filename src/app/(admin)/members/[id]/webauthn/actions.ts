"use server";

import { revalidatePath } from "next/cache";
import { requireRole, ROLES } from "@/lib/rbac";
import { WebAuthnEnrollmentService } from "@/server/services/secure-checkin/webauthn";

export async function createBranchEnrollmentApprovalAction(
  memberId: string,
  _prev: { error?: string; link?: string } | null,
  formData: FormData
): Promise<{ error?: string; link?: string }> {
  const session = await requireRole(ROLES.OPS);
  const reason = String(formData.get("reason") ?? "");

  try {
    const { token } = await WebAuthnEnrollmentService.createBranchEnrollmentApproval({
      tenantId: session.user.tenantId,
      memberId,
      approvedById: session.user.id,
      reason,
    });

    const memberPath = `/member/security?approval=${encodeURIComponent(token)}`;
    const link = `/login?callbackUrl=${encodeURIComponent(memberPath)}`;
    revalidatePath(`/members/${memberId}`);
    return { link };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create branch enrollment approval." };
  }
}
