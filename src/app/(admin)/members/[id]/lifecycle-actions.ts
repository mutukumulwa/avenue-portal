"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { lifecycleService } from "@/server/services/lifecycle.service";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/lib/audit";
import { MembersService } from "@/server/services/members.service";
import { prisma } from "@/lib/prisma";
import { evaluateTransition, type MemberStatusValue } from "@/lib/member-lifecycle-policy";
import { newCorrelationId } from "@/lib/correlation";

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

/**
 * UAT-HF P07.03 — suspend and un-suspend, as governed form actions.
 *
 * P05.05 removed `status` from the generic profile edit form (DEF-041/DEF-043:
 * suspending a member had the ceremony and audit weight of fixing a typo) and
 * recorded a deliberate trade: `lifecycleService` has governed flows for lapse,
 * reinstate, cancel and terminate but **none for suspend**, so deleting the
 * dropdown left no route to suspend at all until a confirmation surface existed.
 *
 * This is that surface's server half. It reuses `MembersService.changeStatus`,
 * which carries the coverage effects — suspending closes the open period so the
 * suspension is an uncovered gap; un-suspending opens a fresh one — and the same
 * `requireReason` guard as every other cover-changing action here.
 */

/**
 * UAT-HF P07.02/P07.01 — decide a suspend/unsuspend against the policy table.
 *
 * These two are the lifecycle transitions that go through
 * `MembersService.changeStatus` rather than `lifecycleService`, and they are the
 * ones the member page actually calls. The policy table was wired into
 * `changeMemberStatusAction` first — which has **no callers** — so until now the
 * live path enforced neither the role rules nor staleness, and wrote no domain
 * event inside the transaction.
 *
 * Returns the member's current status and version so the caller can pass the
 * version on as an optimistic precondition rather than re-reading it.
 */
async function decideLifecycle(
  tenantId: string,
  memberId: string,
  toStatus: MemberStatusValue,
  input: { reason: string; makerId: string; makerRole: string; lastCoveredDay?: string; correlationId: string },
): Promise<{ status: MemberStatusValue; version: number }> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, tenantId },
    select: { status: true, version: true },
  });
  if (!member) throw new Error("Member not found");

  const decision = evaluateTransition(
    {
      memberId,
      fromStatus: member.status as MemberStatusValue,
      fromVersion: member.version,
      toStatus,
      reasonNote: input.reason,
      lastCoveredDay: input.lastCoveredDay,
      requestedAt: new Date(),
      makerId: input.makerId,
      makerRole: input.makerRole,
      idempotencyKey: input.correlationId,
    },
    {
      // This IS the governed surface — a confirmation dialog that states the
      // consequence, not the profile form.
      channel: "GOVERNED_FLOW",
      currentStatus: member.status as MemberStatusValue,
      currentVersion: member.version,
    },
  );

  if (!decision.allowed) throw new Error(decision.message);
  return { status: member.status as MemberStatusValue, version: member.version };
}

export async function suspendMemberAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId = formData.get("memberId") as string;
  const reason = requireReason(formData);
  const effectiveAt = parseEffectiveDate(formData);
  const correlationId = newCorrelationId();

  const current = await decideLifecycle(session.user.tenantId, memberId, "SUSPENDED", {
    reason,
    makerId: session.user.id,
    makerRole: session.user.role ?? "",
    lastCoveredDay: effectiveAt?.toISOString().slice(0, 10),
    correlationId,
  });

  const { previousStatus } = await MembersService.changeStatus(
    session.user.tenantId,
    memberId,
    "SUSPENDED",
    {
      // DEC-12: an operator who back-dated the suspension had that date ignored —
      // the coverage period closed at the click instead.
      effectiveAt,
      expectedVersion: current.version,
      // The event commits WITH the change. The audit row below still runs, but
      // it runs after the transaction, so on its own it loses the record of a
      // suspension that did happen.
      event: {
        actor: { id: session.user.id, role: session.user.role ?? undefined },
        reasonNote: reason,
        correlationId,
      },
    },
  );

  await auditLifecycleReason(formData, {
    memberId,
    userId: session.user.id,
    action: "MEMBER_SUSPENDED",
    description: `Member suspended from ${previousStatus}. Reason: ${reason}`,
  });
  revalidatePath(`/members/${memberId}`);
}

/** Lift a suspension. Cover resumes from now; the suspended window stays a gap. */
export async function unsuspendMemberAction(formData: FormData) {
  const session = await requireRole(ROLES.MEMBER_OPS);
  const memberId = formData.get("memberId") as string;
  const reason = requireReason(formData);
  const effectiveAt = parseEffectiveDate(formData);
  const correlationId = newCorrelationId();

  const current = await decideLifecycle(session.user.tenantId, memberId, "ACTIVE", {
    reason,
    makerId: session.user.id,
    makerRole: session.user.role ?? "",
    correlationId,
  });

  await MembersService.changeStatus(session.user.tenantId, memberId, "ACTIVE", {
    effectiveAt,
    expectedVersion: current.version,
    event: {
      actor: { id: session.user.id, role: session.user.role ?? undefined },
      reasonNote: reason,
      correlationId,
    },
  });

  await auditLifecycleReason(formData, {
    memberId,
    userId: session.user.id,
    action: "MEMBER_REINSTATED",
    description: `Suspension lifted. Reason: ${reason}`,
  });
  revalidatePath(`/members/${memberId}`);
}
