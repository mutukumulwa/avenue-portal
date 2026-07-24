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

export interface PreauthDetailScope {
  tenantId: string;
  /** Client confinement (G2.1): out-of-client PAs resolve to null (non-enumerating). */
  clientId?: string | null;
  /** Provider scoping: a provider surface passes its own providerId; out-of-provider ⇒ null. */
  providerId?: string;
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

  /**
   * Canonical scoped detail read. Non-enumerating: an id outside the caller's
   * scope (wrong tenant / client / provider) resolves to null rather than a 403,
   * so a caller cannot probe for the existence of out-of-scope PAs. Same include
   * shape as the retired ClaimsService.getPreAuthById so consumers are unchanged.
   */
  async getById(scope: PreauthDetailScope, id: string) {
    return prisma.preAuthorization.findFirst({
      where: {
        id,
        tenantId: scope.tenantId,
        ...(scope.providerId ? { providerId: scope.providerId } : {}),
        ...(scope.clientId ? { member: { group: { clientId: scope.clientId } } } : {}),
      },
      include: {
        member: { include: { group: { select: { id: true, name: true } } } },
        provider: true,
        claim: true,
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  },
} as const;
