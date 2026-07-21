import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";

/**
 * Client-configurable member/policy numbering (gap G9.6). Replaces the legacy
 * hard-coded operator prefix. Format: {prefix}-{YYYY}-{NNNNN}, where the
 * prefix comes from the owning client (Client.memberNumberPrefix) and falls
 * back to the Medvex default when no client context is available.
 */
export const DEFAULT_MEMBER_PREFIX = "MVX";

export async function resolveMemberPrefix(
  tenantId: string,
  clientId?: string | null,
): Promise<string> {
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, operatorTenantId: tenantId },
      select: { memberNumberPrefix: true },
    });
    if (client?.memberNumberPrefix) return client.memberNumberPrefix;
  }
  return DEFAULT_MEMBER_PREFIX;
}

/** Next member number for a tenant (optionally scoped to a client's prefix). */
export async function nextMemberNumber(
  tenantId: string,
  clientId?: string | null,
): Promise<string> {
  const prefix = await resolveMemberPrefix(tenantId, clientId);
  // Sequence is per-prefix so each client/payer gets its own clean series
  // (e.g. NWSC-2026-00001), independent of other clients' member counts.
  // B4-WIDE: seed from max+1 (not count()+1) so a purge/gap can't collide.
  return peekNextDocumentNumber(prefix, (yp) =>
    prisma.member
      .findFirst({ where: { tenantId, memberNumber: { startsWith: yp } }, orderBy: { memberNumber: "desc" }, select: { memberNumber: true } })
      .then((r) => r?.memberNumber ?? null),
  );
}
