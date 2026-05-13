import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { rbacService } from "@/server/services/rbac.service";

export const rolesRouter = createTRPCRouter({
  listRoles: protectedProcedure.query(async ({ ctx }) => {
    return rbacService.listRoles(ctx.tenantId);
  }),

  listPermissions: protectedProcedure.query(async ({ ctx }) => {
    await rbacService.requirePermission(ctx.session.user.id, "ROLE:VIEW", ctx.tenantId);
    return rbacService.listPermissions();
  }),

  listAssignments: protectedProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "ROLE:VIEW", ctx.tenantId);
      return rbacService.listAssignments(ctx.tenantId, input.userId);
    }),

  listPendingAssignments: protectedProcedure.query(async ({ ctx }) => {
    await rbacService.requirePermission(ctx.session.user.id, "ROLE:APPROVE_ASSIGNMENT", ctx.tenantId);
    return rbacService.listPendingAssignments(ctx.tenantId);
  }),

  getUserRoles: protectedProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const targetId = input.userId ?? ctx.session.user.id;
      // Users can see their own roles; others need ROLE:VIEW
      if (targetId !== ctx.session.user.id) {
        await rbacService.requirePermission(ctx.session.user.id, "ROLE:VIEW", ctx.tenantId);
      }
      return rbacService.getUserRoles(targetId, ctx.tenantId);
    }),

  getUserPermissions: protectedProcedure.query(async ({ ctx }) => {
    return rbacService.getUserPermissions(ctx.session.user.id, ctx.tenantId);
  }),

  assignRole: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        roleCode: z.string(),
        expiresAt: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return rbacService.assignRole(
        input.userId,
        input.roleCode,
        ctx.tenantId,
        ctx.session.user.id,
        input.expiresAt,
      );
    }),

  approveAssignment: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return rbacService.approveRoleAssignment(
        input.assignmentId,
        ctx.session.user.id,
        ctx.tenantId,
      );
    }),

  revokeRole: protectedProcedure
    .input(z.object({ assignmentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return rbacService.revokeRole(input.assignmentId, ctx.session.user.id, ctx.tenantId);
    }),
});
