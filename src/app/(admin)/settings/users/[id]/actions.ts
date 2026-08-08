"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ROLES } from "@/lib/rbac";
import { writeAudit } from "@/lib/audit";

/**
 * DEF-002 — revoke a dynamic role assignment from the front end.
 *
 * Three properties the acceptance tests require:
 *
 *  1. TENANT SCOPE. The assignment is matched by id AND tenantId, so a crafted
 *     id from another tenant resolves to nothing rather than being revoked.
 *  2. AUDIT PRESERVED. The row is marked revoked, never deleted — an expired or
 *     revoked right must disappear from effective access without erasing the
 *     record that it was once held.
 *  3. ENFORCEMENT LANDS. The target's sessionVersion is bumped so any live
 *     session loses the permission within the single-session enforcement window
 *     (R25), rather than keeping it until they happen to log out.
 */
export async function revokeAssignmentAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const assignmentId = ((formData.get("assignmentId") as string | null) ?? "").trim();
  const userId = ((formData.get("userId") as string | null) ?? "").trim();
  if (!assignmentId || !userId) return;

  const tenantId = session.user.tenantId;

  const assignment = await prisma.userRoleAssignment.findFirst({
    where: { id: assignmentId, tenantId, userId },
    include: { role: { select: { code: true } } },
  });
  // Non-enumerating: a foreign or unknown id is indistinguishable from a no-op.
  if (!assignment || !assignment.isActive) return;

  await prisma.$transaction([
    prisma.userRoleAssignment.update({
      where: { id: assignment.id },
      data: {
        isActive: false,
        status: "REVOKED",
        revokedAt: new Date(),
        revokedById: session.user.id,
      },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    }),
  ]);

  await writeAudit({
    userId: session.user.id,
    action: "ROLE_ASSIGNMENT_REVOKED",
    module: "SETTINGS",
    description: `Revoked role ${assignment.role.code} from user ${userId}`,
    metadata: {
      targetUserId: userId,
      assignmentId: assignment.id,
      roleCode: assignment.role.code,
      revokedBy: session.user.id,
    },
  });

  revalidatePath(`/settings/users/${userId}`);
  revalidatePath("/settings");
}
