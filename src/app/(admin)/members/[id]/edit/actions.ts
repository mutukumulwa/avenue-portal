"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { MembersService } from "@/server/services/members.service";
import { writeAudit } from "@/lib/audit";
import { memberTransitionAuditAction } from "@/lib/member-status";
import type { MemberStatus, MemberRelationship, Gender } from "@prisma/client";

export async function updateMemberAction(
  memberId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const firstName = formData.get("firstName") as string;
  const lastName  = formData.get("lastName")  as string;
  const newStatus = formData.get("status") as MemberStatus;

  let previousStatus: MemberStatus;
  try {
    const result = await MembersService.updateMember(session.user.tenantId, memberId, {
      firstName,
      lastName,
      otherNames:   formData.get("otherNames")   as string,
      idNumber:     formData.get("idNumber")     as string,
      dateOfBirth:  formData.get("dateOfBirth")  as string,
      gender:       formData.get("gender")       as Gender,
      phone:        formData.get("phone")        as string,
      email:        formData.get("email")        as string,
      relationship: formData.get("relationship") as MemberRelationship,
      status:       newStatus,
    });
    previousStatus = result.previousStatus as MemberStatus;
  } catch (err) {
    return { error: (err as Error).message };
  }

  // WP-3.5G: a DISTINCT audit action per lifecycle transition (MEMBER_SUSPENDED /
  // MEMBER_REINSTATED / MEMBER_TERMINATED / …); a pure profile edit stays
  // MEMBER_UPDATED.
  const auditAction = memberTransitionAuditAction(previousStatus, newStatus);
  await writeAudit({
    userId: session.user.id,
    action: auditAction,
    module: "MEMBERS",
    description:
      auditAction === "MEMBER_UPDATED"
        ? `Member profile updated: ${firstName} ${lastName}`
        : `Member ${firstName} ${lastName}: status ${previousStatus} → ${newStatus}`,
    metadata: { memberId, previousStatus, newStatus },
  });

  redirect(`/members/${memberId}`);
}
