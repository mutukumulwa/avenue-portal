"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { Prisma, type UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";

const PORTAL_ROLES = new Set<UserRole>([
  "BROKER_USER",
  "MEMBER_USER",
  "HR_MANAGER",
  "FUND_ADMINISTRATOR",
]);

export async function inviteUserAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const email     = (formData.get("email")     as string).trim().toLowerCase();
  const firstName = formData.get("firstName")  as string;
  const lastName  = formData.get("lastName")   as string;
  const role      = formData.get("role")        as UserRole;
  const password  = formData.get("password")   as string;
  const groupId   = (formData.get("groupId")   as string | null) || null;
  const brokerId  = (formData.get("brokerId")  as string | null) || null;
  const memberId  = (formData.get("memberId")  as string | null) || null;
  const fundGroupIds = formData.getAll("fundGroupIds").map(String).filter(Boolean);

  if (!email || !firstName || !lastName || !role || !password) {
    return { error: "All fields are required." };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
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

  if (role === "BROKER_USER" && brokerId) {
    const broker = await prisma.broker.findUnique({ where: { id: brokerId, tenantId: session.user.tenantId }, select: { id: true } });
    if (!broker) return { error: "Broker profile not found." };
    const linked = await prisma.user.findFirst({ where: { tenantId: session.user.tenantId, brokerId } });
    if (linked) return { error: "This broker already has a portal user." };
  }

  if (role === "MEMBER_USER" && memberId) {
    const member = await prisma.member.findUnique({ where: { id: memberId, tenantId: session.user.tenantId }, select: { id: true } });
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

  const user = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      email,
      firstName,
      lastName,
      role,
      passwordHash,
      isActive: true,
      ...(role === "HR_MANAGER" && groupId ? { groupId } : {}),
      ...(role === "BROKER_USER" && brokerId ? { brokerId } : {}),
      ...(role === "MEMBER_USER" && memberId ? { memberId } : {}),
      ...(role === "FUND_ADMINISTRATOR"
        ? { managedFundGroups: { connect: fundGroupIds.map(id => ({ id })) } }
        : {}),
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "USER_INVITED",
    module: "SETTINGS",
    description: `User invited: ${firstName} ${lastName} (${email}) as ${role}`,
    metadata: { newUserId: user.id, role, linkedPortal: PORTAL_ROLES.has(role), fundSchemeCount: fundGroupIds.length },
  });

  redirect("/settings");
}

export async function updateUserAccessAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as UserRole;
  const isActive = formData.get("isActive") === "true";

  if (!userId || !role) return;

  await prisma.user.update({
    where: { id: userId, tenantId: session.user.tenantId },
    data: { role, isActive },
  });

  await writeAudit({
    userId: session.user.id,
    action: "USER_ACCESS_UPDATED",
    module: "SETTINGS",
    description: `Updated user access for ${userId}`,
    metadata: { targetUserId: userId, role, isActive },
  });

  revalidatePath("/settings");
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

  revalidatePath("/settings");
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

  revalidatePath("/settings");
}
