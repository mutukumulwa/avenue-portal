"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export type ProfileUpdateResult = { success: boolean; error?: string };

export async function updateProfileAction(
  _prev: ProfileUpdateResult | null,
  formData: FormData
): Promise<ProfileUpdateResult> {
  const session = await requireRole(ROLES.MEMBER);

  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;

  if (!session.user.memberId) {
    return { success: false, error: "No member profile linked to this account." };
  }

  await prisma.member.update({
    where: { id: session.user.memberId },
    data: { phone, email },
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_PROFILE_UPDATED",
    module: "MEMBER_PORTAL",
    description: "Member updated contact details via self-service.",
    metadata: { memberId: session.user.memberId },
  });

  revalidatePath("/member/profile");
  return { success: true };
}
