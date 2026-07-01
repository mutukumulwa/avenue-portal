"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Live count of freshly-landed claims (incoming-claim alert, G3.3). Any channel
 * (manual, offline sync, EDI, USSD/SMS) lands a claim in RECEIVED — polling this
 * surfaces "N new" without new infra. Client-scoped.
 */
export async function getIncomingClaimCountAction(): Promise<number> {
  const session = await requireRole(ROLES.OPS);
  return prisma.claim.count({
    where: {
      tenantId: session.user.tenantId,
      status: "RECEIVED",
      ...(session.user.clientId ? { member: { group: { clientId: session.user.clientId } } } : {}),
    },
  });
}
