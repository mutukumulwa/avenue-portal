import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { type Context } from "./context";
import { ZodError } from "zod";
import { INTERNAL_STAFF_MUTATION_ROLES } from "@/lib/authz/catalog";
import { ROLES } from "@/lib/authz/roles";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
/** Server-side caller factory (tests + server-to-server invocation). */
export const createCallerFactory = t.createCallerFactory;

const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
      tenantId: ctx.tenantId as string,
      // Client confinement (G2.1): string => confined to one client;
      // undefined => operator-level user spanning all clients in the tenant.
      clientId: ctx.clientId as string | undefined,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

// ── Authorization gates (PROD-BLOCKER-2 / L-13) ──────────────────────────────
// The tRPC layer is a parallel door to the SAME services as the server actions.
// `protectedProcedure` only proves a session exists, so every MUTATION must carry
// the authority its server-action twin enforces (grep `requireRole` in src/app).
// These gates are ROLE-based (never dynamic-permission-only) so they hold in prod,
// where there are zero Role/Permission/UserRoleAssignment rows (L-6): the enum
// `ctx.session.user.role` is always present, and the login session's permission
// array is the enum baseline ∪ dynamic overlay (WP-3.5A), so permissionProcedure
// is baseline-backed too. Each gate derives from protectedProcedure, preserving
// the tenant/client scoping already set on ctx.

/**
 * Role-scoped procedure factory. Confines a procedure to an explicit enum-role
 * set. Prefer the named gates below (pinned to the canonical ROLES sets) over
 * ad-hoc lists so authority stays single-sourced.
 */
export const roleProcedure = (...roles: readonly string[]) =>
  protectedProcedure.use(({ ctx, next }) => {
    const role = ctx.session.user.role;
    if (!role || !roles.includes(role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({ ctx });
  });

/**
 * Default internal-staff mutation gate. Derived from the canonical catalog
 * (INTERNAL_STAFF_MUTATION_ROLES), which EXCLUDES REPORTS_VIEWER (read-only).
 * This corrects the old adminProcedure, which admitted REPORTS_VIEWER via
 * INTERNAL_STAFF_ROLES.
 */
export const adminProcedure = roleProcedure(...INTERNAL_STAFF_MUTATION_ROLES);

/** SUPER_ADMIN only — providers, provider branches, settings, terminology. */
export const superAdminProcedure = roleProcedure(...ROLES.ADMIN_ONLY);
/** Underwriting surface — packages, contracts, pricing, quotations, intake, binding. */
export const underwritingProcedure = roleProcedure(...ROLES.UNDERWRITING);
/** Membership operations — groups, members, endorsements, cross-border, wellness. */
export const memberOpsProcedure = roleProcedure(...ROLES.MEMBER_OPS);
/** Clinical decisioning — claims / pre-auth adjudication and intake. */
export const clinicalProcedure = roleProcedure(...ROLES.CLINICAL);
/** Finance surface — invoices, payments, commission settlement. */
export const financeProcedure = roleProcedure(...ROLES.FINANCE);
/**
 * Reporting-read gate — tenant-wide report registers. Matches the HTTP export
 * routes' authority (ROLES.ANY_STAFF: internal + reporting staff, incl.
 * REPORTS_VIEWER), so member/provider/HR/broker/fund roles cannot pull
 * tenant-wide claim/membership/billing data through the tRPC door either.
 */
export const reportsProcedure = roleProcedure(...ROLES.ANY_STAFF);

// Permission-based guard factory.
// Usage: permissionProcedure("QUOTATION:ISSUE").mutation(...)
// Baseline-backed (WP-3.5A): the session permission array is the enum baseline ∪
// dynamic overlay, and SUPER_ADMIN carries the "*" wildcard — so this holds in
// prod without any UserRoleAssignment rows (L-6).
export const permissionProcedure = (permission: string) =>
  protectedProcedure.use(({ ctx, next }) => {
    const permissions = ctx.session.user.permissions ?? [];
    if (!permissions.includes(permission) && !permissions.includes("*")) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Permission required: ${permission}`,
      });
    }
    return next({ ctx });
  });
