import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedSession } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
import { memberSearchClause } from "@/lib/member-search";
import type { UserRole } from "@/lib/rbac";

/**
 * GET /api/admin/members/search?q=...
 *
 * E2E-OBS-MEMSEL: scoped, searchable member lookup for the Invite-User
 * "Member User" picker so any member across the full roster can be linked to a
 * portal login (the old modal preloaded only ~250). Admin-session only, applies
 * the same tenant/client scope as the member registry, and only returns members
 * that do not already have a linked user. Capped to keep the payload small.
 */
export async function GET(req: Request) {
  const session = await getCachedSession();
  const role = session?.user?.role as UserRole | undefined;
  if (!session?.user || !role || !ROLES.ADMIN_ONLY.includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const members = await prisma.member.findMany({
    where: {
      tenantId: session.user.tenantId,
      // Only members not yet linked to a portal login are invitable.
      user: null,
      // Client isolation: a confined admin only sees their client's members.
      ...(session.user.clientId ? { group: { clientId: session.user.clientId } } : {}),
      ...memberSearchClause(q),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      memberNumber: true,
      group: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 25,
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      name: `${m.firstName} ${m.lastName}`,
      memberNumber: m.memberNumber,
      groupName: m.group.name,
    })),
  });
}
