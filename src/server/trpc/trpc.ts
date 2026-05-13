import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { type Context } from "./context";
import { ZodError } from "zod";

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

const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: { ...ctx.session, user: ctx.session.user },
      tenantId: ctx.tenantId as string,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

// Legacy role-based guard — kept for backward compat during RBAC transition.
// New code should use requirePermission() from rbac.service inside procedure handlers.
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  const role = ctx.session.user.role;
  if (!role || !["SUPER_ADMIN", "CLAIMS_OFFICER", "FINANCE_OFFICER", "UNDERWRITER", "CUSTOMER_SERVICE"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Permission-based guard factory.
// Usage: permissionProcedure("QUOTATION:ISSUE").query(...)
// Falls back to session-cached permissions for zero DB overhead per request.
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
