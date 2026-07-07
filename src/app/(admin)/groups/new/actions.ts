"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { GroupsService } from "@/server/services/groups.service";
import { writeAudit } from "@/lib/audit";

export async function enrollGroupAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);

  const tenantId = session.user.tenantId;

  let errorMsg = "";

  try {
    const data = {
      name: formData.get("name") as string,
      industry: formData.get("industry") as string,
      registrationNumber: formData.get("registrationNumber") as string,
      contactPersonName: formData.get("contactPersonName") as string,
      contactPersonPhone: formData.get("contactPersonPhone") as string,
      contactPersonEmail: formData.get("contactPersonEmail") as string,
      packageId: formData.get("packageId") as string,
      effectiveDate: formData.get("effectiveDate") as string,
    };

    // NW-D01: a scheme is bound to the Client picked on the form. A client-confined
    // operator can only ever use their own client; an operator-level user chooses,
    // and resolveSchemeClientId() still falls back to the tenant default if blank.
    const selectedClientId =
      session.user.clientId || ((formData.get("clientId") as string | null)?.trim() || undefined);

    const group = await GroupsService.createGroup(tenantId, data, selectedClientId);

    await writeAudit({
      userId: session.user.id,
      action: "GROUP_CREATED",
      module: "GROUPS",
      description: `New group enrolled: ${data.name} (${data.industry})`,
      metadata: { groupId: group.id, packageId: data.packageId },
    });
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to enroll group";
  }

  if (errorMsg) {
    redirect(`/groups/new?error=${encodeURIComponent(errorMsg)}`);
  }

  redirect("/groups");
}
