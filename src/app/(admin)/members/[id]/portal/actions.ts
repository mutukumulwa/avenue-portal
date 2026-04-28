"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function createMemberPortalUserAction(
  memberId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.OPS);
  const email = ((formData.get("email") as string | null) || "").trim().toLowerCase();
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "Email and temporary password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const member = await prisma.member.findUnique({
    where: { id: memberId, tenantId: session.user.tenantId },
    select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } },
  });
  if (!member) return { error: "Member not found." };
  if (member.user) return { error: "This member already has a portal user." };

  const existingEmail = await prisma.user.findFirst({ where: { tenantId: session.user.tenantId, email } });
  if (existingEmail) return { error: "A user with this email already exists." };

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      tenantId: session.user.tenantId,
      email,
      firstName: member.firstName,
      lastName: member.lastName,
      role: "MEMBER_USER",
      passwordHash,
      isActive: true,
      memberId: member.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_PORTAL_USER_CREATED",
    module: "MEMBERS",
    description: `Member portal user created for ${member.firstName} ${member.lastName}`,
    metadata: { memberId: member.id, newUserId: user.id },
  });

  revalidatePath(`/members/${memberId}`);
  return {};
}

export async function resetMemberPortalPasswordAction(
  memberId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.OPS);
  const password = formData.get("password") as string;
  if (!password || password.length < 8) return { error: "Password must be at least 8 characters." };

  const user = await prisma.user.findFirst({
    where: { tenantId: session.user.tenantId, memberId, role: "MEMBER_USER" },
    select: { id: true },
  });
  if (!user) return { error: "Member portal user not found." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(password, 12), isActive: true },
  });

  await writeAudit({
    userId: session.user.id,
    action: "MEMBER_PORTAL_PASSWORD_RESET",
    module: "MEMBERS",
    description: "Member portal password reset",
    metadata: { memberId, targetUserId: user.id },
  });

  revalidatePath(`/members/${memberId}`);
  return {};
}
