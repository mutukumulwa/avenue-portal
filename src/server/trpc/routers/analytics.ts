import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { AnalyticsRefreshService } from "@/server/services/analytics-refresh.service";
import { AnalyticsService } from "@/server/services/analytics.service";

const scopeShape = z.object({
  groupId: z.string().optional(),
  intermediaryId: z.string().optional(),
});

const scopeInput = scopeShape.optional();

const refreshInput = z.object({
  tenantId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
}).optional();

function scopeFromInput(tenantId: string, input?: z.infer<typeof scopeInput>) {
  return {
    tenantId,
    groupId: input?.groupId,
    intermediaryId: input?.intermediaryId,
  };
}

function requireTenantId(tenantId?: string) {
  if (!tenantId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing tenant context" });
  }
  return tenantId;
}

export const analyticsRouter = createTRPCRouter({
  portfolioSummary: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getPortfolioSummary(scopeFromInput(requireTenantId(ctx.tenantId), input));
    }),

  schemeGrid: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getSchemeGrid(scopeFromInput(requireTenantId(ctx.tenantId), input));
    }),

  providerScorecard: protectedProcedure
    .input(scopeShape.extend({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getProviderScorecard(scopeFromInput(requireTenantId(ctx.tenantId), input), input?.limit);
    }),

  riskComposition: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getRiskComposition(scopeFromInput(requireTenantId(ctx.tenantId), input));
    }),

  renewalPipeline: protectedProcedure
    .input(scopeShape.extend({ daysAhead: z.number().int().min(1).max(365).optional() }).optional())
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getRenewalPipeline(
        scopeFromInput(requireTenantId(ctx.tenantId), input),
        input?.daysAhead,
      );
    }),

  refreshFoundation: protectedProcedure
    .input(refreshInput)
    .mutation(async ({ ctx, input }) => {
      return AnalyticsRefreshService.refreshFoundation({
        tenantId: input?.tenantId ?? requireTenantId(ctx.tenantId),
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
      });
    }),
});
