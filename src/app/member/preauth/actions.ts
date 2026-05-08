"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPreAuthService } from "@/server/services/member-preauth.service";
import { redirect } from "next/navigation";

export async function submitMemberPreAuthAction(
  _prev: { error?: string; warnings?: string[] } | null,
  formData: FormData,
): Promise<{ error?: string; warnings?: string[] }> {
  const session = await requireRole(ROLES.MEMBER);
  let redirectTo: string;

  try {
    const result = await MemberPreAuthService.request(session.user.id, session.user.tenantId, {
      memberId: (formData.get("memberId") as string) || undefined,
      providerId: formData.get("providerId") as string,
      procedureCode: formData.get("procedureCode") as string,
      expectedDateOfService: formData.get("expectedDateOfService")
        ? new Date(formData.get("expectedDateOfService") as string)
        : undefined,
      diagnosis: formData.get("diagnosis") as string,
      clinicalNotes: (formData.get("clinicalNotes") as string) || undefined,
    });

    redirectTo = `/member/preauth/${result.preauthId}?decision=${result.decision}`;
  } catch (error) {
    return { error: (error as Error).message };
  }

  redirect(redirectTo);
}
