"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { lifecycleService } from "@/server/services/lifecycle.service";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";

/**
 * UAT-HF P07.03 — the reason a cover-changing action was taken (DEF-040/059).
 *
 * The run: "Lapse Manually moved a member ACTIVE to LAPSED immediately on click:
 * no browser dialog fired, no in-product confirmation appeared, **no reason was
 * captured**." The confirmation now collects one; this records it, because a
 * dialog that asks for a reason and then discards it is worse than not asking.
 *
 * Refuses rather than defaulting: a lifecycle change with a placeholder reason
 * is an audit trail that reads as complete and is not.
 */
async function auditLifecycleReason(
  formData: FormData,
  input: { memberId: string; userId: string; action: string; description: string },
): Promise<void> {
  const reason = ((formData.get("reason") as string | null) ?? "").trim();
  await writeAudit({
    userId: input.userId,
    action: input.action,
    module: "MEMBERS",
    description: input.description,
    metadata: { memberId: input.memberId, reason },
  });
}

/** UAT-HF P07.03: a cover-changing action must arrive with a reason. */
function requireReason(formData: FormData): string {
  const reason = ((formData.get("reason") as string | null) ?? "").trim();
  if (reason.length < 5) {
    throw new Error(
      "A reason is required for any change to a member's cover. It is recorded in the audit trail.",
    );
  }
  return reason;
}

/** WP-3.5E: optional operator-supplied effective (last covered) day. */
function parseEffectiveDate(formData: FormData): Date | undefined {
  const raw = (formData.get("effectiveDate") as string | null)?.trim();
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function lapseManuallyAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId = formData.get("memberId") as string;
  const reason = requireReason(formData);
  await lifecycleService.lapseMembership(memberId, session.user.tenantId, session.user.id);
  await auditLifecycleReason(formData, {
    memberId,
    userId: session.user.id,
    action: "MEMBER_LAPSED",
    description: `Member lapsed manually. Reason: ${reason}`,
  });
  revalidatePath(`/members/${memberId}`);
}

export async function reinstateWithinCatchupAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId = formData.get("memberId") as string;
  const reason = requireReason(formData);
  await lifecycleService.reinstateWithinCatchup(memberId, session.user.tenantId, session.user.id);
  await auditLifecycleReason(formData, {
    memberId,
    userId: session.user.id,
    action: "MEMBER_REINSTATED",
    description: `Member reinstated within the catch-up window. Reason: ${reason}`,
  });
  revalidatePath(`/members/${memberId}`);
}

export async function initiateCoolingOffCancellationAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId = formData.get("memberId") as string;
  const reason = requireReason(formData);
  await lifecycleService.initiateCoolingOffCancellation(memberId, session.user.tenantId, session.user.id, parseEffectiveDate(formData));
  await auditLifecycleReason(formData, {
    memberId,
    userId: session.user.id,
    action: "MEMBER_CANCELLED_COOLING_OFF",
    description: `Cooling-off cancellation initiated. Reason: ${reason}`,
  });
  revalidatePath(`/members/${memberId}`);
}

export async function initiateStandardCancellationAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId = formData.get("memberId") as string;
  // DEF-040: this one "terminates a member on a single click — no confirmation,
  // no date, no reason, a computed refund, and no audit entry".
  const reason = requireReason(formData);
  await lifecycleService.initiateStandardCancellation(memberId, session.user.tenantId, session.user.id, 500, parseEffectiveDate(formData));
  await auditLifecycleReason(formData, {
    memberId,
    userId: session.user.id,
    action: "MEMBER_CANCELLED",
    description: `Standard cancellation initiated. Reason: ${reason}`,
  });
  revalidatePath(`/members/${memberId}`);
}

export async function terminateForFraudAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const memberId   = formData.get("memberId") as string;
  const reasonCode = formData.get("reasonCode") as string;
  const narrative  = (formData.get("narrative") as string) || undefined;
  await lifecycleService.terminateForFraud(memberId, session.user.tenantId, session.user.id, reasonCode, narrative, parseEffectiveDate(formData));
  revalidatePath(`/members/${memberId}`);
}

export async function terminateForBreachAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId   = formData.get("memberId") as string;
  const reasonCode = formData.get("reasonCode") as string;
  const narrative  = (formData.get("narrative") as string) || undefined;
  await lifecycleService.terminateForBreach(memberId, session.user.tenantId, session.user.id, reasonCode, narrative, parseEffectiveDate(formData));
  revalidatePath(`/members/${memberId}`);
}

export async function recordDeathAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId    = formData.get("memberId") as string;
  const proofDocUrl = formData.get("proofDocUrl") as string;
  await lifecycleService.recordPrincipalDeath(memberId, session.user.tenantId, session.user.id, proofDocUrl, parseEffectiveDate(formData));
  revalidatePath(`/members/${memberId}`);
}
