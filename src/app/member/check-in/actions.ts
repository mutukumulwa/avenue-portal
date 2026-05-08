"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";
import { SecureCheckInService } from "@/server/services/secure-checkin/secure-checkin.service";
import { MemberHealthVaultService } from "@/server/services/member-health-vault.service";
import { revalidatePath } from "next/cache";

export type MemberCheckInActionState = {
  error?: string;
  visitCode?: string;
  providerName?: string;
  expiresAt?: string;
};

function optionalString(value: FormDataEntryValue | null) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function expiryFromForm(value: FormDataEntryValue | null, fallbackHours: number) {
  const text = optionalString(value);
  const hours = text ? Number(text) : fallbackHours;
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + (Number.isFinite(hours) && hours > 0 ? hours : fallbackHours));
  return expiresAt;
}

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

export async function shareHealthRecordWithCheckInAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const checkInChallengeId = optionalString(formData.get("checkInChallengeId"));
  const healthRecord = optionalString(formData.get("healthRecord"));
  const [recordKind, recordId] = healthRecord?.split(":") ?? [];
  const expiresAt = expiryFromForm(formData.get("shareExpiry"), 24);

  if (!checkInChallengeId) throw new Error("Choose an active check-in request.");
  if (!recordKind || !recordId) throw new Error("Choose a health record to share.");
  if (!["file", "journal"].includes(recordKind)) throw new Error("Choose a valid health record to share.");

  const share = await MemberHealthVaultService.shareWithCheckIn({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    checkInChallengeId,
    healthFileId: recordKind === "file" ? recordId : null,
    journalEntryId: recordKind === "journal" ? recordId : null,
    expiresAt,
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_RECORD_SHARED_WITH_CHECKIN",
    module: "MEMBER_PORTAL",
    description: "Member shared a health-vault record with an active check-in.",
    metadata: {
      shareId: share.id,
      checkInChallengeId,
      healthFileId: recordKind === "file" ? recordId : null,
      journalEntryId: recordKind === "journal" ? recordId : null,
      expiresAt: expiresAt.toISOString(),
    },
  });

  revalidatePath("/member/check-in");
  revalidatePath(`/check-ins/${checkInChallengeId}`);
}

export async function revokeCheckInHealthShareAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER);
  const shareId = optionalString(formData.get("shareId"));
  const checkInChallengeId = optionalString(formData.get("checkInChallengeId"));

  if (!shareId) throw new Error("Choose a share to revoke.");

  await MemberHealthVaultService.revokeShare({
    userId: session.user.id,
    tenantId: session.user.tenantId,
    shareId,
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_HEALTH_RECORD_CHECKIN_SHARE_REVOKED",
    module: "MEMBER_PORTAL",
    description: "Member revoked a health-vault share from an active check-in.",
    metadata: { shareId, checkInChallengeId },
  });

  revalidatePath("/member/check-in");
  if (checkInChallengeId) revalidatePath(`/check-ins/${checkInChallengeId}`);
}
