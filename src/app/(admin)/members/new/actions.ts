"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { MembersService } from "@/server/services/members.service";
import { writeAudit } from "@/lib/audit";

export async function addMemberAction(
  _prev: { error?: string; warnings?: string[] } | null,
  formData: FormData
): Promise<{ error?: string; warnings?: string[] }> {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;

  const data = {
    groupId:      formData.get("groupId")      as string,
    firstName:    formData.get("firstName")    as string,
    lastName:     formData.get("lastName")     as string,
    idNumber:     formData.get("idNumber")     as string,
    dateOfBirth:  formData.get("dateOfBirth")  as string,
    gender:       formData.get("gender")       as "MALE" | "FEMALE" | "OTHER",
    phone:        formData.get("phone")        as string,
    email:        formData.get("email")        as string,
    relationship: formData.get("relationship") as "PRINCIPAL" | "SPOUSE" | "CHILD" | "PARENT",
  };

  let memberNumber: string | undefined;
  let warnings: string[] = [];
  try {
    const result = await MembersService.createMember(tenantId, data);
    memberNumber = result.member.memberNumber;
    warnings = result.warnings;
  } catch (err) {
    return { error: (err as Error).message };
  }

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_CREATED",
    module: "MEMBERS",
    description: `New member enrolled: ${data.firstName} ${data.lastName} (${memberNumber})`,
    metadata: { groupId: data.groupId, relationship: data.relationship },
  });

  if (warnings.length > 0) return { warnings };

  redirect("/members");
}
