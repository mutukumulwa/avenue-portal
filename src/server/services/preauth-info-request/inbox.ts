import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * PNOS F4.6 — canonical provider inbox projection.
 *
 * The provider's actionable information requests, joined with just enough PA +
 * member context to render a list, ordered by SLA urgency. Default view = items
 * AWAITING THE PROVIDER (OPEN/REOPENED); callers may widen the status set (e.g. to
 * show recently RESPONDED items). Relation-less two-step join (the F4.1 satellite
 * has no PA relation), scoped to the provider's own facility. Pure read — surfaces
 * work, never mutates. (For now the inbox projects info requests only; other
 * provider actionable families can be unioned in later without changing callers.)
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Awaiting-the-provider states — the default inbox view. */
export const PROVIDER_INBOX_DEFAULT_STATUSES = ["OPEN", "REOPENED"];

export interface ProviderInboxItem {
  infoRequestId: string;
  preAuthorizationId: string;
  preauthNumber: string;
  memberName: string;
  memberNumber: string;
  status: string;
  requestedItems: string[];
  prompt: string;
  dueAt: Date | null;
  openedAt: Date;
  overdue: boolean;
}

export async function providerInboxProjection(
  scope: { tenantId: string; providerId: string; statuses?: string[] },
  db: Db = prisma,
  now: Date = new Date(),
): Promise<ProviderInboxItem[]> {
  const statuses = scope.statuses ?? PROVIDER_INBOX_DEFAULT_STATUSES;
  const requests = await db.preauthInfoRequest.findMany({
    where: { tenantId: scope.tenantId, providerId: scope.providerId, status: { in: statuses as never } },
    orderBy: [{ dueAt: "asc" }, { openedAt: "asc" }],
  });
  if (requests.length === 0) return [];

  const paIds = [...new Set(requests.map((r) => r.preAuthorizationId))];
  const pas = await db.preAuthorization.findMany({
    where: { id: { in: paIds }, tenantId: scope.tenantId },
    select: { id: true, preauthNumber: true, member: { select: { firstName: true, lastName: true, memberNumber: true } } },
  });
  const paMap = new Map(pas.map((p) => [p.id, p]));
  const nowMs = now.getTime();

  return requests.map((r) => {
    const pa = paMap.get(r.preAuthorizationId);
    return {
      infoRequestId: r.id,
      preAuthorizationId: r.preAuthorizationId,
      preauthNumber: pa?.preauthNumber ?? "—",
      memberName: pa ? `${pa.member.firstName} ${pa.member.lastName}`.trim() : "—",
      memberNumber: pa?.member.memberNumber ?? "—",
      status: r.status,
      requestedItems: r.requestedItems,
      prompt: r.prompt,
      dueAt: r.dueAt,
      openedAt: r.openedAt,
      overdue: !!r.dueAt && r.dueAt.getTime() < nowMs,
    };
  });
}
