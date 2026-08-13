import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCachedSession } from "@/lib/auth";
import { ROLES } from "@/lib/rbac";
import { memberSearchClause, memberSearchTake } from "@/lib/member-search";
import type { UserRole } from "@/lib/rbac";

/**
 * POST /api/admin/members/search   body: { q }
 *
 * E2E-OBS-MEMSEL: scoped, searchable member lookup for the Invite-User
 * "Member User" picker so any member across the full roster can be linked to a
 * portal login (the old modal preloaded only ~250). Admin-session only, applies
 * the same tenant/client scope as the member registry, and only returns members
 * that do not already have a linked user. Capped to keep the payload small.
 *
 * ## Why POST for a read (UAT-HF P03.05 — DEF-057 / DEF-079)
 *
 * This was `GET ?q=...`, and what an operator types into it is very often a
 * member number — that is the whole point of the picker. A member number in a
 * query string is written to the server access log on every keystroke of a
 * debounced search, and P03.05's acceptance is explicit: "browser history, URL,
 * server access log, analytics event, and referrer contain no member/card
 * number."
 *
 * The search term therefore travels in the body. Nothing is cached or
 * bookmarked here — it is a type-ahead behind an admin session — so the usual
 * argument for GET does not apply, and the identifier stops appearing in
 * infrastructure that nobody thinks of as a data store.
 */
export async function POST(req: Request) {
  const session = await getCachedSession();
  const role = session?.user?.role as UserRole | undefined;
  if (!session?.user || !role || !ROLES.ADMIN_ONLY.includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const q = typeof body?.q === "string" ? body.q.trim() : "";

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
    // P05.07: one enumeration cap, applied by every search route.
    take: memberSearchTake(25),
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
