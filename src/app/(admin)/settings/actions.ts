"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";

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
  const groupId   = formData.get("groupId")    as string | null;

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
      ...((role as string) === "HR_MANAGER" && groupId ? { groupId } : {}),
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "USER_INVITED",
    module: "SETTINGS",
    description: `User invited: ${firstName} ${lastName} (${email}) as ${role}`,
    metadata: { newUserId: user.id, role },
  });

  redirect("/settings");
}


