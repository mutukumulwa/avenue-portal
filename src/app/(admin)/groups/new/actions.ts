"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { GroupsService } from "@/server/services/groups.service";
import { writeAudit } from "@/lib/audit";
import { groupCreateSchema } from "@/lib/validation/group";

export async function enrollGroupAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const tenantId = session.user.tenantId;

  let errorMsg = "";
  let newGroupId = "";

  // WP-S1: validate through the canonical schema before any write (trim/collapse
  // name, real-date + horizon guard, registration/contact format). On failure we
  // keep the existing ?error= UX rather than reaching Prisma with bad input.
  const parsed = groupCreateSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry"),
    registrationNumber: formData.get("registrationNumber"),
    contactPersonName: formData.get("contactPersonName"),
    contactPersonPhone: formData.get("contactPersonPhone"),
    contactPersonEmail: formData.get("contactPersonEmail"),
    packageId: formData.get("packageId"),
    effectiveDate: formData.get("effectiveDate"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Please correct the highlighted fields.";
    redirect(`/groups/new?error=${encodeURIComponent(first)}`);
  } else {
    try {
      // NW-D01: a scheme is bound to the Client picked on the form. A client-confined
      // operator can only ever use their own client; an operator-level user chooses,
      // and resolveSchemeClientId() still falls back to the tenant default if blank.
      const selectedClientId =
        session.user.clientId || ((formData.get("clientId") as string | null)?.trim() || undefined);

      const group = await GroupsService.createGroup(tenantId, parsed.data, selectedClientId);
      newGroupId = group.id;

      await writeAudit({
        userId: session.user.id,
        action: "GROUP_CREATED",
        module: "GROUPS",
        description: `New scheme enrolled: ${parsed.data.name}${parsed.data.industry ? ` (${parsed.data.industry})` : ""}`,
        metadata: {
          groupId: group.id,
          packageId: parsed.data.packageId,
          before: JSON.stringify(null),
          after: JSON.stringify({ name: parsed.data.name, status: "ACTIVE" }),
        },
      });
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : "Failed to enroll group";
    }
  }

  if (errorMsg) {
    redirect(`/groups/new?error=${encodeURIComponent(errorMsg)}`);
  }

  redirect(newGroupId ? `/groups/${newGroupId}` : "/groups");
}
