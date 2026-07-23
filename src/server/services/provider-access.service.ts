import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";
import { rbacService } from "./rbac.service";
import { ProviderBranchAssignmentService } from "./provider-branch-assignment.service";

// NOTE: `requireProvider` (@/lib/provider-portal → @/lib/rbac → next-auth) is
// imported dynamically inside resolveUserContext ONLY. Keeping it out of the
// module's static graph lets the testable core (buildUserContext + the pure
// helpers) import without dragging next-auth's `next/server` entrypoint, which
// does not resolve under the jsdom test environment.

/**
 * PNOS F1.3 — canonical ProviderAccessContext resolver.
 *
 * ONE place that turns an authenticated actor into the §6.5 access context:
 * tenant + provider + allowed branch ids + action permissions (+ API scopes,
 * F1.6). It is the single authority every provider command/query begins from
 * (spec §6.4). It composes existing owners — requireProvider (session/role/
 * provider binding, D1), the dynamic RBAC (F1.1 permissions), and
 * ProviderBranchAssignmentService (F1.2 branch scope) — and owns NO eligibility,
 * PA, claim, or clinical decision (spec §6.2).
 *
 * Invariants enforced here (§6.5):
 *  - scope is server-derived; a request body/form/query never establishes it;
 *  - an empty branch set denies branch-scoped resources;
 *  - provider-wide permissions never cross another provider's boundary;
 *  - downstream may narrow the context, never widen it.
 */

export type ProviderActorType = "USER" | "API_KEY" | "CONNECTOR";

export interface ProviderAccessContext {
  actorType: ProviderActorType;
  actorId: string;
  tenantId: string;
  providerId: string;
  allowedProviderBranchIds: string[];
  permissions: string[];
  apiScopes: string[];
  credentialId?: string;
  sessionId?: string;
  requestId: string;
}

export type ProviderAccessErrorCode =
  | "NOT_FOUND" // safe not-found: absent OR out-of-boundary look identical (§9.1)
  | "USER_INACTIVE"
  | "FORBIDDEN_PROVIDER"
  | "FORBIDDEN_PERMISSION"
  | "FORBIDDEN_BRANCH";

export class ProviderAccessError extends Error {
  constructor(public code: ProviderAccessErrorCode, message: string) {
    super(message);
    this.name = "ProviderAccessError";
  }
}

export function isProviderAccessError(e: unknown): e is ProviderAccessError {
  return e instanceof ProviderAccessError;
}

type Db = PrismaClient | Prisma.TransactionClient;

export const ProviderAccessService = {
  /**
   * Testable core: build a USER context from server-trusted identity. All three
   * inputs come from the authenticated session, never from the request payload.
   * Throws a SAFE ProviderAccessError (NOT_FOUND) when the user/provider is
   * absent or out of the tenant boundary so existence is not revealed.
   */
  async buildUserContext(
    input: { userId: string; tenantId: string; providerId: string; sessionId?: string; requestId?: string; at?: Date },
    db: Db = prisma,
  ): Promise<ProviderAccessContext> {
    const at = input.at ?? new Date();

    const user = await db.user.findFirst({
      where: { id: input.userId, tenantId: input.tenantId },
      select: { id: true, isActive: true, providerId: true },
    });
    // Absent user, or user in another tenant → indistinguishable not-found.
    if (!user) throw new ProviderAccessError("NOT_FOUND", "No such provider user");
    if (!user.isActive) throw new ProviderAccessError("USER_INACTIVE", "User is not active");
    // The user must be bound to exactly the provider the session claims.
    if (user.providerId !== input.providerId) {
      throw new ProviderAccessError("FORBIDDEN_PROVIDER", "User is not bound to this provider");
    }
    const provider = await db.provider.findFirst({
      where: { id: input.providerId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!provider) throw new ProviderAccessError("NOT_FOUND", "No such provider");

    const [permissions, allowedProviderBranchIds] = await Promise.all([
      // Loaded fresh from the RBAC owner — the session's serialized permission
      // array is a convenience cache, never the authority (§6.5).
      rbacService.getUserPermissions(input.userId, input.tenantId),
      ProviderBranchAssignmentService.activeBranchIdsForUser(input.userId, input.tenantId, at, db),
    ]);

    return {
      actorType: "USER",
      actorId: input.userId,
      tenantId: input.tenantId,
      providerId: input.providerId,
      allowedProviderBranchIds,
      permissions,
      apiScopes: [],
      sessionId: input.sessionId,
      requestId: input.requestId ?? randomUUID(),
    };
  },

  /**
   * RSC / server-action entry. Preserves the existing login/role/provider
   * redirects via requireProvider, then enriches into the full context.
   * Returns the provider row too (callers still render it).
   */
  async resolveUserContext(opts?: { requestId?: string }) {
    const { requireProvider } = await import("@/lib/provider-portal");
    const { session, provider, providerId, tenantId } = await requireProvider();
    const ctx = await ProviderAccessService.buildUserContext({
      userId: session.user.id,
      tenantId,
      providerId,
      sessionId: session.user.id, // no distinct session id is exposed; actor id stands in
      requestId: opts?.requestId,
    });
    return { ctx, provider, session };
  },

  /**
   * Minimal credential (API key) context. Provider/tenant come from the verified
   * credential (never the body). Scopes and branch restriction are intentionally
   * empty here and are populated in F1.6/F1.7 (API-key scopes + allowed
   * branches); until then no API route reads this context to enforce, so an
   * empty scope/branch set is safe (deny-by-default) rather than permissive.
   */
  buildCredentialContext(
    credential: { tenantId: string; providerId: string; keyId: string },
    opts?: { requestId?: string },
  ): ProviderAccessContext {
    return {
      actorType: "API_KEY",
      actorId: credential.keyId,
      tenantId: credential.tenantId,
      providerId: credential.providerId,
      allowedProviderBranchIds: [],
      permissions: [],
      apiScopes: [],
      credentialId: credential.keyId,
      requestId: opts?.requestId ?? randomUUID(),
    };
  },

  // ── pure helpers (no I/O) ──────────────────────────────────────────────────

  hasPermission(ctx: ProviderAccessContext, code: string): boolean {
    return ctx.permissions.includes(code);
  },
  requirePermission(ctx: ProviderAccessContext, code: string): void {
    if (!ProviderAccessService.hasPermission(ctx, code)) {
      throw new ProviderAccessError("FORBIDDEN_PERMISSION", `Missing permission: ${code}`);
    }
  },

  /** Empty branch set denies every branch-scoped resource (§6.5). */
  hasBranch(ctx: ProviderAccessContext, branchId: string): boolean {
    return ctx.allowedProviderBranchIds.includes(branchId);
  },
  requireBranch(ctx: ProviderAccessContext, branchId: string): void {
    if (!ProviderAccessService.hasBranch(ctx, branchId)) {
      throw new ProviderAccessError("FORBIDDEN_BRANCH", "Branch not in access context");
    }
  },

  /** A provider-owned resource must belong to exactly this context's provider. */
  assertProviderOwned(ctx: ProviderAccessContext, resourceProviderId: string): void {
    if (resourceProviderId !== ctx.providerId) {
      throw new ProviderAccessError("FORBIDDEN_PROVIDER", "Resource belongs to another provider");
    }
  },

  /** Narrow branch scope to an intersection — can only shrink, never widen (§6.5). */
  narrowToBranches(ctx: ProviderAccessContext, branchIds: string[]): ProviderAccessContext {
    const allow = new Set(ctx.allowedProviderBranchIds);
    return { ...ctx, allowedProviderBranchIds: branchIds.filter((b) => allow.has(b)) };
  },
} as const;
