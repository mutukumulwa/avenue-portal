"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { validatePassword, PASSWORD_BCRYPT_COST } from "@/lib/password-policy";
import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ALL_USER_ROLES, isPortalRole } from "@/lib/constants";
import { AccountInvitationService } from "@/server/services/account-invitation.service";

/**
 * Family Hospital UAT plan P05.04 — "Send invitation" (was "Create User" with an
 * administrator-typed temporary password, FH-01). A thin adapter over the ONE
 * canonical AccountInvitationService, which the facility's own Users page calls
 * too: the account, its binding, a one-time setup link and the audit record are
 * created together; the link is emailed to that person alone; a failed delivery
 * is reported as exactly that ("User created; invitation delivery failed —
 * resend"), never as success.
 */
export async function inviteUserAction(
  _prev: { error?: string; ok?: boolean; message?: string; deliveryFailed?: boolean; resendUserId?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean; message?: string; deliveryFailed?: boolean; resendUserId?: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const text = (name: string) => ((formData.get(name) as string | null) ?? "").toString();
  const result = await AccountInvitationService.invite(
    { kind: "PLATFORM", tenantId: session.user.tenantId, actorId: session.user.id, clientId: session.user.clientId ?? null },
    {
      email: text("email"),
      firstName: text("firstName"),
      lastName: text("lastName"),
      role: text("role") as UserRole,
      groupId: text("groupId") || null,
      brokerId: text("brokerId") || null,
      memberId: text("memberId") || null,
      fundGroupIds: formData.getAll("fundGroupIds").map(String).filter(Boolean),
      providerId: text("providerId") || null,
      // ELIG-GAP-005: a provider user needs a persona duty role and a branch from birth.
      providerRoleCode: text("providerRoleCode") || null,
      providerBranchIds: formData.getAll("providerBranchIds").map(String).filter(Boolean),
    },
  );
  revalidatePath("/settings");
  if (!result.ok) return { error: result.message, ...(result.existing?.canResend ? { resendUserId: result.existing.userId } : {}) };
  return { ok: true, message: result.message, deliveryFailed: result.delivery === "FAILED" };
}

/** P05.04 step 2 — send a new setup link (older unused links stop working). */
export async function resendInvitationAction(
  _prev: { error?: string; ok?: boolean; message?: string } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean; message?: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const userId = ((formData.get("userId") as string | null) ?? "").trim();
  if (!userId) return { error: "Select the user." };
  const result = await AccountInvitationService.resend(
    { kind: "PLATFORM", tenantId: session.user.tenantId, actorId: session.user.id, clientId: session.user.clientId ?? null },
    userId,
  );
  revalidatePath("/settings");
  return result.ok ? { ok: true, message: result.message } : { error: result.message };
}

export async function updateUserAccessAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as UserRole;
  const isActive = formData.get("isActive") === "true";

  if (!userId || !role) return;

  // BD-01: the inline control is a status/staff-role toggle — never a path to
  // mint or strip a scoped portal role. Load the target's current binding and
  // validate the posted role against it (defence in depth; the UI already locks
  // portal rows, but a hand-crafted POST must not escalate a facility user).
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
    select: { role: true, isActive: true, providerId: true, memberId: true, brokerId: true, groupId: true },
  });
  if (!target) return;

  const roleUnchanged = role === target.role;

  // 1. Reject unknown roles outright.
  if (!ALL_USER_ROLES.includes(role)) {
    throw new Error("Invalid role.");
  }
  // 2. Cannot change a scoped portal user's role here (would drop/rewire their
  //    facility/member/group binding silently). Active toggle stays allowed.
  if (isPortalRole(target.role) && !roleUnchanged) {
    throw new Error(
      `${target.role.replace(/_/g, " ")} is a scoped portal role — change it through Invite User so the facility/member/group binding is set correctly.`,
    );
  }
  // 3. Cannot convert a staff user INTO a portal role here (no binding captured).
  if (isPortalRole(role) && !roleUnchanged) {
    throw new Error(
      `${role.replace(/_/g, " ")} must be assigned through Invite User so its facility/member/group scope is bound.`,
    );
  }

  // DEF-002 test 8: a role or status change must land on any LIVE session, not
  // wait for the user to log out. The sessionVersion bump rides the existing
  // single-session rail (R25), so the old session is invalidated within the
  // enforcement cache TTL. Only bump when something actually changed — a
  // no-op save should not sign the user out.
  const changed = !roleUnchanged || isActive !== target.isActive;

  await prisma.user.update({
    where: { id: userId, tenantId: session.user.tenantId },
    // Never rewrite role to something the checks above didn't clear: when the
    // row is a locked portal user, `role` equals the preserved current role.
    data: { role, isActive, ...(changed ? { sessionVersion: { increment: 1 } } : {}) },
  });

  await writeAudit({
    userId: session.user.id,
    action: "USER_ACCESS_UPDATED",
    module: "SETTINGS",
    description: `Updated user access for ${userId}`,
    metadata: { targetUserId: userId, role, isActive, roleChanged: !roleUnchanged },
  });

  revalidatePath("/settings");
}

/**
 * Admin password reset for an existing user (Settings → Users & Access).
 *
 * Sets the new password DIRECTLY: the User model has no mustChangePassword
 * column and adding one is a prod DDL in the db-push-only pipeline, so no
 * change-on-next-login is enforced — the admin hands the password over and the
 * user should change it themselves (self-service /reset stays available where
 * the email worker runs). Compensating control: the sessionVersion bump rides
 * the single-session rail (R25), so any live session on the old credential —
 * including the admin's own when self-resetting — is invalidated within the
 * enforcement cache TTL.
 *
 * BD-01: only the credential changes. Role, portal bindings and isActive are
 * never touched, so locked portal rows (provider/member/broker/HR/fund) can be
 * reset without any path to re-binding or escalation.
 */
export async function resetUserPasswordAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const userId = ((formData.get("userId") as string | null) || "").trim();
  const password = (formData.get("password") as string | null) || "";

  if (!userId || !password) return { error: "User and new password are required." };

  const pwError = validatePassword(password);
  if (pwError) return { error: pwError };

  // Tenant-scoped target load (defence in depth: a hand-crafted POST cannot
  // reach a user outside the actor's tenant). WP-3.1 (DEF-005): also read the
  // lockout state so the reset can clear it and record whether a live lock was
  // released.
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
    select: {
      id: true, email: true, role: true, firstName: true, lastName: true,
      lockedUntil: true, failedLoginCount: true, lastFailedLoginAt: true,
    },
  });
  if (!target) return { error: "User not found." };

  const passwordHash = await bcrypt.hash(password, PASSWORD_BCRYPT_COST);

  // WP-3.1 (DEF-005): an admin password reset must ALSO release the throttle —
  // previously the reset wrote only the hash + session bump, so a locked user
  // stayed locked even after the operator handed them a fresh password (they
  // could still not sign in until the 15-minute window elapsed). Clearing the
  // counter and the lock is the documented recovery path (D6). The lock state
  // travels with the SAME write as the credential.
  const lockCleared =
    (!!target.lockedUntil && target.lockedUntil > new Date()) || target.failedLoginCount > 0;

  await prisma.user.update({
    where: { id: userId, tenantId: session.user.tenantId },
    data: {
      passwordHash,
      // ELIG-GAP-006: an admin-issued reset is temporary — force the user to set
      // their own password at next login before any portal/data access.
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
      failedLoginCount: 0,
      lockedUntil: null,
      lastFailedLoginAt: null,
    },
  });

  // Audit the reset (never the password itself).
  await writeAudit({
    userId: session.user.id,
    action: "USER_PASSWORD_RESET",
    module: "SETTINGS",
    description: `Password reset for ${target.firstName} ${target.lastName} (${target.email})`,
    metadata: {
      targetUserId: target.id,
      targetEmail: target.email,
      targetRole: target.role,
      sessionsRevoked: true,
      lockCleared,
      // UAT-HF P10.05. The write below sets failedLoginCount, lockedUntil and
      // lastFailedLoginAt to zero — correctly, they are live throttle state and
      // a reset must release the throttle. But they were also the only record
      // that the failures happened, and an operator resets the password as the
      // FIRST response to "somebody may be trying to get into my account". The
      // evidence was being destroyed by the reaction to it.
      //
      // Failed sign-ins now write their own audit rows (see auth-audit.ts), so
      // the history no longer depends on these columns. This preserves them
      // anyway: it costs nothing, and it covers failures that accumulated
      // before that rail existed, which is precisely the backlog an early
      // investigation would reach for.
      failedLoginCountAtReset: target.failedLoginCount,
      lastFailedLoginAtReset: target.lastFailedLoginAt?.toISOString() ?? null,
    },
  });

  // A distinct unlock event — only when there was actually a lock/streak to
  // release — so "who cleared this lock, and when" is answerable independently
  // of the password-reset record. Written directly (not via writeAudit) so the
  // row can carry tenantId and stay inside the tenant hash chain.
  if (lockCleared) {
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        action: "AUTH_ACCOUNT_UNLOCKED",
        module: "AUTH",
        description: `Account lock cleared by admin password reset for ${target.firstName} ${target.lastName} (${target.email})`,
        metadata: { targetUserId: target.id, reason: "ADMIN_PASSWORD_RESET" },
      },
    });
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function upsertNotificationTemplateAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = (formData.get("templateId") as string | null) || undefined;
  const name = (formData.get("name") as string).trim();
  const type = (formData.get("type") as string).trim();
  const channel = formData.get("channel") as string;
  const subject = ((formData.get("subject") as string | null) || "").trim() || null;
  const bodyTemplate = (formData.get("bodyTemplate") as string).trim();
  const isActive = formData.get("isActive") === "true";

  if (!name || !type || !channel || !bodyTemplate) return;

  if (id) {
    await prisma.notificationTemplate.update({
      where: { id, tenantId: session.user.tenantId },
      data: { name, type, channel, subject, bodyTemplate, isActive },
    });
  } else {
    await prisma.notificationTemplate.create({
      data: { tenantId: session.user.tenantId, name, type, channel, subject, bodyTemplate, isActive },
    });
  }

  revalidatePath("/settings/notifications");
}

export async function upsertIntegrationAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const provider = formData.get("provider") as string;
  const isEnabled = formData.get("isEnabled") === "true";
  const apiBaseUrl = ((formData.get("apiBaseUrl") as string | null) || "").trim() || null;
  const apiKey = ((formData.get("apiKey") as string | null) || "").trim() || null;
  const apiSecret = ((formData.get("apiSecret") as string | null) || "").trim() || null;
  const configText = ((formData.get("config") as string | null) || "").trim();

  let config: Prisma.InputJsonValue = {};
  if (configText) {
    try {
      config = JSON.parse(configText) as Prisma.InputJsonValue;
    } catch {
      config = { notes: configText };
    }
  }

  await prisma.integrationConfig.upsert({
    where: { tenantId_provider: { tenantId: session.user.tenantId, provider } },
    update: {
      isEnabled,
      apiBaseUrl,
      apiKey,
      apiSecret,
      config,
      status: isEnabled ? "CONNECTED" : "DISCONNECTED",
    },
    create: {
      tenantId: session.user.tenantId,
      provider,
      isEnabled,
      apiBaseUrl,
      apiKey,
      apiSecret,
      config,
      status: isEnabled ? "CONNECTED" : "DISCONNECTED",
    },
  });

  revalidatePath("/settings/integrations");
}

/**
 * UAT-HF P10.02 / DEC-11 — release an account lock, without reissuing credentials.
 *
 * DEF-010's collateral: "lockout_test, password_reset_test, medical_officer and
 * finance_officer were locked, and **no operator-facing unlock path was found in
 * the product**."
 *
 * A path did exist, but only through `resetUserPasswordAction`, which also sets
 * a temporary password and forces a change at next login. That is the right
 * recovery when credentials are suspect and the wrong one when a user simply
 * mistyped five times: it hands out a new password nobody asked for, revokes
 * their sessions, and adds a change-password step to a problem that was a typo.
 *
 * So this releases the throttle and nothing else. It does NOT touch the password
 * hash or `sessionVersion` — an unlock is not a credential event, and conflating
 * the two is what made the existing path unusable for the common case.
 *
 * DEC-11 requires it to be audited, and it requires a reason: "who cleared this
 * lock, when, and why" is the whole point of a documented path back.
 */
export async function unlockUserAccountAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const userId = ((formData.get("userId") as string | null) || "").trim();
  const reason = ((formData.get("reason") as string | null) || "").trim();

  if (!userId) return { error: "Select the user to unlock." };
  if (reason.length < 5) {
    return { error: "Give a reason for the unlock — it is recorded in the audit trail." };
  }

  // Tenant-scoped, so a hand-crafted POST cannot reach a user in another tenant.
  const target = await prisma.user.findFirst({
    where: { id: userId, tenantId: session.user.tenantId },
    select: {
      id: true, email: true, role: true, firstName: true, lastName: true,
      lockedUntil: true, failedLoginCount: true, lastFailedLoginAt: true,
    },
  });
  if (!target) return { error: "User not found." };

  const wasLocked =
    (!!target.lockedUntil && target.lockedUntil > new Date()) || target.failedLoginCount > 0;
  if (!wasLocked) {
    // Idempotent and honest: nothing to release, and no audit noise claiming a
    // lock was cleared when there was none.
    return { ok: true };
  }

  await prisma.user.update({
    where: { id: userId, tenantId: session.user.tenantId },
    data: { failedLoginCount: 0, lockedUntil: null, lastFailedLoginAt: null },
  });

  // Written directly rather than via writeAudit so the row carries tenantId and
  // stays inside the tenant hash chain (WP-3.1 / DEF-005).
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      tenantId: session.user.tenantId,
      action: "AUTH_ACCOUNT_UNLOCKED",
      module: "AUTH",
      description: `Account lock cleared for ${target.firstName} ${target.lastName} (${target.email})`,
      metadata: {
        targetUserId: target.id,
        targetEmail: target.email,
        reason,
        credentialsUnchanged: true,
        // UAT-HF P10.05 — same reasoning as the password reset: the update
        // above clears the only columns saying how many failures preceded this
        // unlock and when the last one was. Preserved here before they go.
        failedLoginCountAtUnlock: target.failedLoginCount,
        lastFailedLoginAtUnlock: target.lastFailedLoginAt?.toISOString() ?? null,
      },
    },
  });

  revalidatePath(`/settings/users/${userId}`);
  revalidatePath("/settings");
  return { ok: true };
}
