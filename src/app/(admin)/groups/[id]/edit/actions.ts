"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { GroupsService, DuplicateSchemeNameError } from "@/server/services/groups.service";
import { writeAudit } from "@/lib/audit";
import { fail } from "@/lib/action-result";
import { groupEditSchema, type GroupActionState } from "@/lib/validation/group";

/**
 * WP-S1/S2 — edit a scheme's PROFILE fields.
 *
 * Previously this action wrote a free-text status straight to the DB with NO
 * validation and NO audit. Now: (1) status is removed from the edit surface —
 * lifecycle transitions are governed (`changeGroupStatusAction`); (2) the input
 * is validated through the canonical schema (SP-2 field errors, input
 * preserved); (3) a rename re-checks the client-scoped duplicate rule; (4) a
 * before→after `GROUP_UPDATED` audit event is emitted (the edit emitted none).
 */
export async function updateGroupAction(
  groupId: string,
  _prev: GroupActionState | null,
  formData: FormData,
): Promise<GroupActionState> {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const values: Record<string, string> = {
    name: (formData.get("name") as string) ?? "",
    industry: (formData.get("industry") as string) ?? "",
    registrationNumber: (formData.get("registrationNumber") as string) ?? "",
    address: (formData.get("address") as string) ?? "",
    county: (formData.get("county") as string) ?? "",
    contactPersonName: (formData.get("contactPersonName") as string) ?? "",
    contactPersonPhone: (formData.get("contactPersonPhone") as string) ?? "",
    contactPersonEmail: (formData.get("contactPersonEmail") as string) ?? "",
    paymentFrequency: (formData.get("paymentFrequency") as string) ?? "",
    effectiveDate: (formData.get("effectiveDate") as string) ?? "",
    renewalDate: (formData.get("renewalDate") as string) ?? "",
    notes: (formData.get("notes") as string) ?? "",
  };

  const parsed = groupEditSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry"),
    registrationNumber: formData.get("registrationNumber"),
    address: formData.get("address"),
    county: formData.get("county"),
    contactPersonName: formData.get("contactPersonName"),
    contactPersonPhone: formData.get("contactPersonPhone"),
    contactPersonEmail: formData.get("contactPersonEmail"),
    paymentFrequency: formData.get("paymentFrequency"),
    effectiveDate: formData.get("effectiveDate"),
    renewalDate: formData.get("renewalDate"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) {
    return { ...fail(parsed.error.flatten().fieldErrors), values };
  }

  let result: Awaited<ReturnType<typeof GroupsService.updateGroup>>;
  try {
    result = await GroupsService.updateGroup(
      session.user.tenantId,
      groupId,
      parsed.data,
      session.user.clientId,
    );
  } catch (err) {
    if (err instanceof DuplicateSchemeNameError) {
      return { ...fail({ name: [err.message] }), values };
    }
    return { ...fail(undefined, err instanceof Error ? err.message : "Failed to update scheme"), values };
  }

  await writeAudit({
    userId: session.user.id,
    action: "GROUP_UPDATED",
    module: "GROUPS",
    description: `Scheme updated: ${result.groupName}`,
    metadata: {
      groupId,
      before: JSON.stringify(result.before),
      after: JSON.stringify(result.after),
    },
  });

  revalidatePath(`/groups/${groupId}`);
  redirect(`/groups/${groupId}`);
}
