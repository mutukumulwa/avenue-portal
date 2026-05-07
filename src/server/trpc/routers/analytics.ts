import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AnalyticsAlertSeverity, AnalyticsAlertStatus, AnalyticsAlertType } from "@prisma/client";
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

const alertFiltersInput = z.object({
  status: z.nativeEnum(AnalyticsAlertStatus).optional(),
  severity: z.nativeEnum(AnalyticsAlertSeverity).optional(),
  type: z.nativeEnum(AnalyticsAlertType).optional(),
  groupId: z.string().optional(),
  providerId: z.string().optional(),
  memberId: z.string().optional(),
  intermediaryId: z.string().optional(),
  includeResolved: z.boolean().optional(),
  limit: z.number().int().min(1).max(250).optional(),
}).optional();

const alertActionInput = z.object({
  alertId: z.string().min(1),
});

const resolveAlertInput = alertActionInput.extend({
  resolutionNote: z.string().max(1000).optional(),
});

const renewalSimulationInput = z.object({
  targetMlr: z.number().min(0.45).max(0.95).optional(),
  inflationAssumption: z.number().min(-0.2).max(0.6).optional(),
  membershipChangePct: z.number().min(-0.5).max(1).optional(),
  contributionAdjustmentPct: z.number().min(-0.5).max(1.5).optional(),
});

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

  schemeDetail: protectedProcedure
    .input(scopeShape.extend({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getSchemeDetail({
        tenantId: requireTenantId(ctx.tenantId),
        groupId: input.groupId,
        intermediaryId: input.intermediaryId,
      });
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

  renewalWorkspace: protectedProcedure
    .input(scopeShape.extend({
      groupId: z.string().min(1),
      simulation: renewalSimulationInput.optional(),
    }))
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getRenewalWorkspace({
        tenantId: requireTenantId(ctx.tenantId),
        groupId: input.groupId,
        intermediaryId: input.intermediaryId,
      }, input.simulation);
    }),

  simulateRenewal: protectedProcedure
    .input(z.object({
      currentContribution: z.number().min(0),
      projectedClaims: z.number().min(0),
      activeMembers: z.number().int().min(1),
      targetMlr: z.number().min(0.45).max(0.95),
      inflationAssumption: z.number().min(-0.2).max(0.6),
      simulation: renewalSimulationInput.optional(),
    }))
    .query(async ({ input }) => {
      return AnalyticsService.simulateRenewalFromBase(input, input.simulation);
    }),

  alerts: protectedProcedure
    .input(alertFiltersInput)
    .query(async ({ ctx, input }) => {
      return AnalyticsService.getAlerts({ tenantId: requireTenantId(ctx.tenantId) }, input);
    }),

  acknowledgeAlert: protectedProcedure
    .input(alertActionInput)
    .mutation(async ({ ctx, input }) => {
      return AnalyticsService.acknowledgeAlert(
        { tenantId: requireTenantId(ctx.tenantId) },
        input.alertId,
        ctx.session.user.id,
      );
    }),

  resolveAlert: protectedProcedure
    .input(resolveAlertInput)
    .mutation(async ({ ctx, input }) => {
      return AnalyticsService.resolveAlert(
        { tenantId: requireTenantId(ctx.tenantId) },
        input.alertId,
        ctx.session.user.id,
        input.resolutionNote,
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
