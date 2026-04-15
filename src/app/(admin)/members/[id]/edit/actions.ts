"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { MembersService } from "@/server/services/members.service";
import { writeAudit } from "@/lib/audit";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";

export async function updateMemberAction(
  memberId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.OPS);

  const firstName = formData.get("firstName") as string;
  const lastName  = formData.get("lastName")  as string;

  try {
    await MembersService.updateMember(session.user.tenantId, memberId, {
      firstName,
      lastName,
      otherNames:   formData.get("otherNames")   as string,
      idNumber:     formData.get("idNumber")     as string,
      dateOfBirth:  formData.get("dateOfBirth")  as string,
      gender:       formData.get("gender")       as Gender,
      phone:        formData.get("phone")        as string,
      email:        formData.get("email")        as string,
      relationship: formData.get("relationship") as MemberRelationship,
      status:       formData.get("status")       as MemberStatus,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_UPDATED",
    module: "MEMBERS",
    description: `Member profile updated: ${firstName} ${lastName}`,
    metadata: { memberId },
  });

  redirect(`/members/${memberId}`);
}
