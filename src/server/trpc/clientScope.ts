import { TRPCError } from "@trpc/server";

/**
 * Client-isolation primitives for multi-client TPA tenancy (Medvex spec §2.1 /
 * gap G2.1). Cross-client access is a hard security boundary.
 *
 * Model:
 *  - `tenantId` always scopes to the Medvex operator (unchanged).
 *  - `clientId` on the context is the caller's CONFINEMENT:
 *      • string    => user belongs to exactly one client; every read/write is
 *                     pinned to it.
 *      • undefined => operator-level Medvex ops user who spans all clients in
 *                     the tenant (and selects a client via the switcher for
 *                     writes — see resolveWriteClientId).
 *
 * Adoption is incremental: a router/service becomes client-isolated by
 * combining `clientFilter` into its `where` (reads) and calling
 * `assertClientAccess` / `resolveWriteClientId` on the write path. Apply these
 * ONLY to client-scoped models (those that carry a `clientId` column).
 */

/** Minimal shape needed from a protected tRPC context for client scoping. */
export interface ClientScopedContext {
  tenantId: string;
  clientId?: string;
}

/**
 * Prisma `where` fragment confining a query to the caller's client when the
 * caller is confined; empty (spans all clients) for operator-level users.
 *
 * Always combine with the tenant filter:
 *   where: { tenantId: ctx.tenantId, ...clientFilter(ctx) }
 */
export function clientFilter(ctx: ClientScopedContext): { clientId?: string } {
  return ctx.clientId ? { clientId: ctx.clientId } : {};
}

/**
 * Row-level guard. Throws FORBIDDEN when a confined user touches a resource
 * belonging to a different client. Operator-level users always pass.
 *
 * `resourceClientId` may be null/undefined for rows not yet backfilled during
 * the rollout — those are treated as accessible (the column is still filling).
 */
export function assertClientAccess(
  ctx: ClientScopedContext,
  resourceClientId: string | null | undefined,
): void {
  if (ctx.clientId && resourceClientId && ctx.clientId !== resourceClientId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Cross-client access denied.",
    });
  }
}

/**
 * Resolve the client a write should be attributed to.
 *  - Confined user: always their own client; an explicit mismatch is rejected.
 *  - Operator user: must pass an explicit client selection (from the client
 *    switcher); an ambiguous write without one is rejected.
 */
export function resolveWriteClientId(
  ctx: ClientScopedContext,
  explicit?: string | null,
): string {
  if (ctx.clientId) {
    if (explicit && explicit !== ctx.clientId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot write to a different client.",
      });
    }
    return ctx.clientId;
  }
  if (!explicit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "An operator-level user must select a client for this action.",
    });
  }
  return explicit;
}
