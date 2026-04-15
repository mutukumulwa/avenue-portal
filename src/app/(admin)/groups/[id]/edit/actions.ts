"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { GroupsService } from "@/server/services/groups.service";
import type { GroupStatus, PaymentFrequency } from "@prisma/client";

export async function updateGroupAction(
  groupId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.OPS);

  try {
    await GroupsService.updateGroup(session.user.tenantId, groupId, {
      name:                formData.get("name")                as string,
      industry:            formData.get("industry")            as string,
      registrationNumber:  formData.get("registrationNumber")  as string,
      address:             formData.get("address")             as string,
      county:              formData.get("county")              as string,
      contactPersonName:   formData.get("contactPersonName")   as string,
      contactPersonPhone:  formData.get("contactPersonPhone")  as string,
      contactPersonEmail:  formData.get("contactPersonEmail")  as string,
      paymentFrequency:    formData.get("paymentFrequency")    as PaymentFrequency,
      effectiveDate:       formData.get("effectiveDate")       as string,
      renewalDate:         formData.get("renewalDate")         as string,
      status:              formData.get("status")              as GroupStatus,
      notes:               formData.get("notes")              as string,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  redirect(`/groups/${groupId}`);
}
