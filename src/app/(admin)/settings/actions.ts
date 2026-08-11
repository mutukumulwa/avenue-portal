"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password-policy";
import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ALL_USER_ROLES, PORTAL_ROLES as PORTAL_ROLE_LIST, isPortalRole } from "@/lib/constants";
import { PROVIDER_PERSONA_ROLE_CODES } from "@/../prisma/seeds/provider-rbac";

const PORTAL_ROLES = new Set<UserRole>(PORTAL_ROLE_LIST as readonly UserRole[]);

export async function inviteUserAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData
): Promise<{ error?: string; ok?: boolean }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const email     = (formData.get("email")     as string).trim().toLowerCase();
  const firstName = formData.get("firstName")  as string;
  const lastName  = formData.get("lastName")   as string;
  const role      = formData.get("role")        as UserRole;
  const password  = formData.get("password")   as string;
  const groupId   = (formData.get("groupId")   as string | null) || null;
  const brokerId  = (formData.get("brokerId")  as string | null) || null;
  const memberId  = (formData.get("memberId")  as string | null) || null;
  const providerId = (formData.get("providerId") as string | null) || null;
  const fundGroupIds = formData.getAll("fundGroupIds").map(String).filter(Boolean);
  // ELIG-GAP-005: a provider user is not usable without a persona duty role and a
  // branch. Collect both so the invite provisions a COMPLETE provider user (role
  // + branch scope), not a zero-permission account that then relies on a fail-open
  // fallback for access.
  const providerRoleCode = (formData.get("providerRoleCode") as string | null) || null;
  const providerBranchIds = formData.getAll("providerBranchIds").map(String).filter(Boolean);

  if (!email || !firstName || !lastName || !role || !password) {
    return { error: "All fields are required." };
  }
  const pwError = validatePassword(password);
  if (pwError) {
    return { error: pwError };
  }

  const existing = await prisma.user.findFirst({
    where: { email, tenantId: session.user.tenantId },
  });
  if (existing) {
    return { error: `A user with email ${email} already exists.` };
  }

  if (role === "HR_MANAGER" && !groupId) return { error: "Select the HR manager's group." };
  if (role === "BROKER_USER" && !brokerId) return { error: "Select the broker profile for this user." };
  if (role === "MEMBER_USER" && !memberId) return { error: "Select the member profile for this user." };
  if (role === "FUND_ADMINISTRATOR" && fundGroupIds.length === 0) {
    return { error: "Select at least one self-funded scheme for this fund administrator." };
  }
  if (role === "PROVIDER_USER" && !providerId) return { error: "Select the facility for this provider user." };
  if (role === "PROVIDER_USER" && !providerRoleCode) return { error: "Select the provider role for this user." };
  if (role === "PROVIDER_USER" && providerBranchIds.length === 0) return { error: "Assign at least one branch to this provider user." };

  // Resolved during validation, consumed in the atomic create below.
  let providerRoleId: string | null = null;
  if (role === "PROVIDER_USER" && providerId) {
    const provider = await prisma.provider.findFirst({ where: { id: providerId, tenantId: session.user.tenantId }, select: { id: true } });
    if (!provider) return { error: "Facility not found." };
    // The persona must be a grantable provider role — never a TPA role or the deprecated PROVIDER_LEGACY.
    if (!PROVIDER_PERSONA_ROLE_CODES.includes(providerRoleCode as string)) return { error: "Invalid provider role." };
    const providerRole = await prisma.role.findUnique({
      where: { tenantId_code: { tenantId: session.user.tenantId, code: providerRoleCode as string } },
      select: { id: true, isActive: true },
    });
    if (!providerRole || !providerRole.isActive) return { error: "Provider role is not available; run the RBAC seed for this tenant." };
    providerRoleId = providerRole.id;
    // Every selected branch must belong to this facility within the tenant (defence in depth against a posted foreign id).
    const branchCount = await prisma.providerBranch.count({ where: { id: { in: providerBranchIds }, providerId, tenantId: session.user.tenantId } });
    if (branchCount !== providerBranchIds.length) return { error: "One or more selected branches are not part of this facility." };
  }

  if (role === "BROKER_USER" && brokerId) {
    const broker = await prisma.broker.findUnique({ where: { id: brokerId, tenantId: session.user.tenantId }, select: { id: true } });
    if (!broker) return { error: "Broker profile not found." };
    const linked = await prisma.user.findFirst({ where: { tenantId: session.user.tenantId, brokerId } });
    if (linked) return { error: "This broker already has a portal user." };
  }

  if (role === "MEMBER_USER" && memberId) {
    // Scope-check the posted memberId server-side (defence in depth): it must
    // belong to the actor's tenant and — for a client-confined admin — their
    // client, so a manually-posted out-of-scope id cannot be linked.
    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        tenantId: session.user.tenantId,
        ...(session.user.clientId ? { group: { clientId: session.user.clientId } } : {}),
      },
      select: { id: true },
    });
    if (!member) return { error: "Member profile not found." };
    const linked = await prisma.user.findFirst({ where: { tenantId: session.user.tenantId, memberId } });
    if (linked) return { error: "This member already has a portal user." };
  }

  if (role === "FUND_ADMINISTRATOR") {
    const count = await prisma.group.count({
      where: { tenantId: session.user.tenantId, id: { in: fundGroupIds }, fundingMode: "SELF_FUNDED" },
    });
    if (count !== fundGroupIds.length) return { error: "One or more selected schemes are not self-funded." };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // ELIG-GAP-005: create the user AND (for a provider user) its persona role +
  // branch scope atomically, so an invite never yields a half-provisioned
  // provider account. requirePermission/entitlement are fail-closed after Phase
  // 2/3, so a provider user MUST carry a real duty role and branch from birth.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId: session.user.tenantId,
        email,
        firstName,
        lastName,
        role,
        passwordHash,
        isActive: true,
        // ELIG-GAP-006: the admin-entered password is temporary — force a
        // replacement at first login before any portal/data access.
        mustChangePassword: true,
        ...(role === "HR_MANAGER" && groupId ? { groupId } : {}),
        ...(role === "BROKER_USER" && brokerId ? { brokerId } : {}),
        ...(role === "MEMBER_USER" && memberId ? { memberId } : {}),
        ...(role === "PROVIDER_USER" && providerId ? { providerId } : {}),
        ...(role === "FUND_ADMINISTRATOR"
          ? { managedFundGroups: { connect: fundGroupIds.map(id => ({ id })) } }
          : {}),
      },
    });

    if (role === "PROVIDER_USER" && providerId && providerRoleId) {
      // Persona duty role — status MUST be ACTIVE (default PENDING_APPROVAL grants nothing).
      await tx.userRoleAssignment.create({
        data: {
          userId: created.id, roleId: providerRoleId, tenantId: session.user.tenantId,
          makerId: session.user.id, checkerId: session.user.id, isActive: true, status: "ACTIVE",
        },
      });
      // Branch scope — an empty scope denies branch-scoped resources (F1.3).
      for (const providerBranchId of providerBranchIds) {
        await tx.providerUserBranchAssignment.create({
          data: { tenantId: session.user.tenantId, providerId, userId: created.id, providerBranchId, createdBy: session.user.id },
        });
      }
    }

    return created;
  });

  await writeAudit({
    userId: session.user.id,
    action: "USER_INVITED",
    module: "SETTINGS",
    description: `User invited: ${firstName} ${lastName} (${email}) as ${role}`,
    metadata: {
      newUserId: user.id, role, linkedPortal: PORTAL_ROLES.has(role), fundSchemeCount: fundGroupIds.length,
      ...(role === "PROVIDER_USER" ? { providerId, providerRoleCode, providerBranchCount: providerBranchIds.length } : {}),
    },
  });

  // OBS-1: return a success flag instead of navigating. A server redirect inside
  // a useActionState action left the Users & Access pane blank until a manual
  // reload; the modal now closes + router.refresh()es on `ok`.
  revalidatePath("/settings");
  return { ok: true };
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
      lockedUntil: true, failedLoginCount: true,
    },
  });
  if (!target) return { error: "User not found." };

  const passwordHash = await bcrypt.hash(password, 12);

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
