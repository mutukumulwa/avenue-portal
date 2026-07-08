import type { Prisma } from "@prisma/client";

/**
 * E2E-D01: build the member-registry search clause for a free-text query.
 *
 * A single token matches any one field (name, member number, email, phone, ID,
 * or group name). Multiple tokens require EVERY token to match some field — an
 * AND of per-token ORs — so a full-name query like "Mark Kato" matches
 * firstName + lastName in either order without a DB full-text index. Returns an
 * empty clause when the query is blank so it composes cleanly with the caller's
 * tenant/client/status filters.
 */
export function memberSearchClause(q: string | null | undefined): Prisma.MemberWhereInput {
  const tokens = (q ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return {};

  const tokenFields = (t: string): Prisma.MemberWhereInput[] => [
    { firstName:    { contains: t, mode: "insensitive" } },
    { lastName:     { contains: t, mode: "insensitive" } },
    { memberNumber: { contains: t, mode: "insensitive" } },
    { email:        { contains: t, mode: "insensitive" } },
    { phone:        { contains: t, mode: "insensitive" } },
    { idNumber:     { contains: t, mode: "insensitive" } },
    { group: { name: { contains: t, mode: "insensitive" } } },
  ];

  if (tokens.length === 1) return { OR: tokenFields(tokens[0]) };
  return { AND: tokens.map((t) => ({ OR: tokenFields(t) })) };
}
