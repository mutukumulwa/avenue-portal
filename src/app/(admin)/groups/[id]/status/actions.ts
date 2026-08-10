"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import type { GroupStatus } from "@prisma/client";
import { GroupsService, InvalidGroupTransitionError } from "@/server/services/groups.service";
import { writeAudit } from "@/lib/audit";
import { fail, ok } from "@/lib/action-result";
import { groupStatusChangeSchema, type GroupActionState } from "@/lib/validation/group";

/**
 * WP-S2 — the ONLY door for a scheme lifecycle transition (S-005/S-006).
 *
 * The general edit form no longer carries status; every suspend / reactivate /
 * terminate / lapse / governed-reinstate flows through here with a required
 * reason and an optional effective date. `GroupsService.changeGroupStatus`
 * enforces the transition table, cascades to member eligibility inside one
 * transaction, and returns before/after snapshots which this action writes to a
 * per-transition audit event (the transition emitted none before).
 */
function auditActionFor(from: GroupStatus, to: GroupStatus, override: boolean): string {
  if (to === "SUSPENDED") return "GROUP_SUSPENDED";
  if (to === "TERMINATED") return "GROUP_TERMINATED";
  if (to === "LAPSED") return "GROUP_LAPSED";
  if (to === "ACTIVE") {
    if (override) return "GROUP_REINSTATED";
    if (from === "SUSPENDED") return "GROUP_REACTIVATED";
    return "GROUP_ACTIVATED";
  }
  if (to === "PENDING") return "GROUP_MOVED_TO_PENDING";
  return "GROUP_STATUS_CHANGED";
}

export async function changeGroupStatusAction(
  groupId: string,
  _prev: GroupActionState | null,
  formData: FormData,
): Promise<GroupActionState> {
  const session = await requireRole(ROLES.MEMBER_OPS);

  const values: Record<string, string> = {
    targetStatus: (formData.get("targetStatus") as string) ?? "",
    reason: (formData.get("reason") as string) ?? "",
    effectiveDate: (formData.get("effectiveDate") as string) ?? "",
  };

  const parsed = groupStatusChangeSchema.safeParse({
    targetStatus: formData.get("targetStatus"),
    reason: formData.get("reason"),
    effectiveDate: formData.get("effectiveDate"),
    override: formData.get("override") === "true",
  });
  if (!parsed.success) {
    return { ...fail(parsed.error.flatten().fieldErrors), values };
  }

  let result: Awaited<ReturnType<typeof GroupsService.changeGroupStatus>>;
  try {
    result = await GroupsService.changeGroupStatus(
      session.user.tenantId,
      groupId,
      {
        targetStatus: parsed.data.targetStatus as GroupStatus,
        reason: parsed.data.reason,
        effectiveDate: parsed.data.effectiveDate,
        override: parsed.data.override,
      },
      session.user.clientId,
    );
  } catch (err) {
    if (err instanceof InvalidGroupTransitionError) {
      return { ...fail({ targetStatus: [err.message] }), values };
    }
    return { ...fail(undefined, err instanceof Error ? err.message : "Failed to change scheme status"), values };
  }

  await writeAudit({
    userId: session.user.id,
    action: auditActionFor(
      result.before.status,
      parsed.data.targetStatus as GroupStatus,
      !!parsed.data.override,
    ),
    module: "GROUPS",
    description:
      `Scheme "${result.groupName}" ${result.before.status} → ${result.after.status}` +
      (result.affectedMembers > 0 ? ` (${result.affectedMembers} member(s) cascaded)` : "") +
      (parsed.data.reason ? ` — ${parsed.data.reason}` : ""),
    metadata: {
      groupId,
      reason: parsed.data.reason ?? null,
      affectedMembers: result.affectedMembers,
      override: !!parsed.data.override,
      before: JSON.stringify(result.before),
      after: JSON.stringify(result.after),
    },
  });

  revalidatePath(`/groups/${groupId}`);
  return ok();
}
