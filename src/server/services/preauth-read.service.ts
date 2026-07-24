import { prisma } from "@/lib/prisma";
import type { PreauthStatus, Prisma } from "@prisma/client";

/**
 * PNOS F3.7 — canonical PA list read model.
 *
 * The ONE scoped list that every PA surface (admin, provider, tRPC) reads through,
 * replacing the tenant-only ClaimsService.getPreAuthorizations. Scoping is layered:
 *   - tenant isolation (always);
 *   - client confinement (G2.1) — a confined operator sees only their client's PAs
 *     via member.group.clientId; null/undefined ⇒ operator, all clients in tenant
 *     (mirrors ClaimsService.getClaims exactly);
 *   - provider scoping — a provider surface sees only its own facility's PAs (F3.8);
 *   - optional status filter.
 *
 * NOTE: PreAuthorization rows carry no branch column, so provider scoping is
 * provider-level only — F1.2 branch assignments cannot narrow a PA list (PAs are
 * not branch-stamped). Flagged for F3.8/F3.9.
 */
export interface PreauthListScope {
  tenantId: string;
  /** Client confinement (G2.1): string ⇒ confined to one client; null/undefined ⇒ operator (all clients in tenant). */
  clientId?: string | null;
  /** Provider scoping: a provider surface passes its own providerId; omitted ⇒ all providers in scope. */
  providerId?: string;
  status?: PreauthStatus;
}

export const PreauthReadService = {
  async list(scope: PreauthListScope) {
    const where: Prisma.PreAuthorizationWhereInput = {
      tenantId: scope.tenantId,
      ...(scope.status ? { status: scope.status } : {}),
      ...(scope.providerId ? { providerId: scope.providerId } : {}),
      ...(scope.clientId ? { member: { group: { clientId: scope.clientId } } } : {}),
    };
    return prisma.preAuthorization.findMany({
      where,
      include: {
        member: { select: { id: true, firstName: true, lastName: true, memberNumber: true } },
        provider: { select: { id: true, name: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  },
} as const;
