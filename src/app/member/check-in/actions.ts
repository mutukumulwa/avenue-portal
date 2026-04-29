"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";

export type MemberCheckInActionState = {
  error?: string;
  visitCode?: string;
  providerName?: string;
  expiresAt?: string;
};

export async function acknowledgeMemberCheckInAction(
  _prevState: MemberCheckInActionState,
  formData: FormData
): Promise<MemberCheckInActionState> {
  const session = await requireRole(ROLES.MEMBER);
  if (!session.user.memberId) return { error: "No member profile is linked to this account." };

  try {
    const result = await SecureCheckInService.acknowledgeInAppChallenge({
      tenantId: session.user.tenantId,
      memberId: session.user.memberId,
      challengeId: String(formData.get("challengeId") ?? ""),
    });

    return {
      visitCode: result.visitCode,
      providerName: result.providerName,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to confirm check-in." };
  }
}
