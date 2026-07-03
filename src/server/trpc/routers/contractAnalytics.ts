import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ContractAnalyticsService } from "@/server/services/contract-analytics.service";
import { ContractReconciliationService } from "@/server/services/contract-reconciliation.service";

// Contract analytics + average-cost reconciliation (spec §15, Phase 5).
export const contractAnalyticsRouter = createTRPCRouter({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [claimsByContract, shortPaid, backlog, expiring, rateVariance, turnaround, queueLoad] = await Promise.all([
      ContractAnalyticsService.claimsByContract(ctx.tenantId),
      ContractAnalyticsService.shortPaidSummary(ctx.tenantId),
      ContractAnalyticsService.amendmentBacklog(ctx.tenantId),
      ContractAnalyticsService.expiringContracts(ctx.tenantId),
      ContractAnalyticsService.rateVariance(ctx.tenantId),
      ContractAnalyticsService.turnaround(ctx.tenantId),
      ContractAnalyticsService.queueLoad(ctx.tenantId),
    ]);
    return { claimsByContract, shortPaid, backlog, expiring, rateVariance, turnaround, queueLoad };
  }),

  reconciliations: protectedProcedure.query(async ({ ctx }) => ContractReconciliationService.list(ctx.tenantId)),

  computeReconciliation: protectedProcedure
    .input(
      z.object({
        poolId: z.string(),
        contractId: z.string().optional(),
        periodStart: z.string(),
        periodEnd: z.string(),
        agreedAverage: z.number().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ContractReconciliationService.compute(ctx.tenantId, {
        poolId: input.poolId,
        contractId: input.contractId,
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        agreedAverage: input.agreedAverage,
        computedById: ctx.session.user.id,
      }),
    ),

  approveReconciliation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => ContractReconciliationService.approve(ctx.tenantId, input.id, ctx.session.user.id)),
});
