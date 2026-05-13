import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { auditChainService } from "@/server/services/audit-chain.service";
import { rbacService } from "@/server/services/rbac.service";

export const auditChainRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        actorId: z.string().optional(),
        module: z.string().optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(200).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await rbacService.requirePermission(
        ctx.session.user.id,
        "COMPLIANCE:VIEW_AUDIT_CHAIN",
        ctx.tenantId,
      );
      return auditChainService.list(ctx.tenantId, input);
    }),

  verify: protectedProcedure
    .input(
      z.object({
        fromSequence: z.bigint().optional(),
        toSequence: z.bigint().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await rbacService.requirePermission(
        ctx.session.user.id,
        "COMPLIANCE:VIEW_AUDIT_CHAIN",
        ctx.tenantId,
      );
      return auditChainService.verify(ctx.tenantId, {
        fromSequence: input.fromSequence,
        toSequence: input.toSequence,
      });
    }),
});
