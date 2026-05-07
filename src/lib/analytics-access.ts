import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/rbac";

type AnalyticsSession = {
  user: {
    id: string;
    role?: string | null;
    tenantId: string;
    groupId?: string | null;
  };
};

export type AnalyticsAccessScope = {
  tenantId: string;
  userId: string;
  role: UserRole;
  groupId?: string;
  intermediaryId?: string;
  allowedGroupIds?: string[];
  noAccess?: boolean;
};

export async function getAnalyticsAccessScope(session: AnalyticsSession): Promise<AnalyticsAccessScope> {
  if (!session.user.role) {
    return {
      tenantId: session.user.tenantId,
      userId: session.user.id,
      role: "MEMBER_USER",
      noAccess: true,
    };
  }

  const role = session.user.role as UserRole;
  const base = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    role,
  };

  if (role === "HR_MANAGER") {
    return session.user.groupId
      ? { ...base, groupId: session.user.groupId, allowedGroupIds: [session.user.groupId] }
      : { ...base, noAccess: true };
  }

  if (role === "BROKER_USER") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { brokerId: true },
    });
    return user?.brokerId
      ? { ...base, intermediaryId: user.brokerId }
      : { ...base, noAccess: true };
  }

  if (role === "FUND_ADMINISTRATOR") {
    const groups = await prisma.group.findMany({
      where: {
        tenantId: session.user.tenantId,
        fundingMode: "SELF_FUNDED",
        fundAdministrators: { some: { id: session.user.id } },
      },
      select: { id: true },
      orderBy: { name: "asc" },
    });

    return groups.length > 0
      ? { ...base, allowedGroupIds: groups.map((group) => group.id) }
      : { ...base, allowedGroupIds: [], noAccess: true };
  }

  return base;
}
