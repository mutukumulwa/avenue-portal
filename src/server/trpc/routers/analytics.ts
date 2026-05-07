import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AnalyticsAlertSeverity, AnalyticsAlertStatus, AnalyticsAlertType, RiskTier } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { AnalyticsRefreshService } from "@/server/services/analytics-refresh.service";
import { AnalyticsService } from "@/server/services/analytics.service";
import { getAnalyticsAccessScope } from "@/lib/analytics-access";
import { ROLES, type UserRole } from "@/lib/rbac";

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

const memberRiskFiltersInput = z.object({
  riskTier: z.nativeEnum(RiskTier).optional(),
  groupId: z.string().optional(),
  chronicTag: z.string().optional(),
  minUtilizationToCap: z.number().min(0).max(2).optional(),
  projectedWithinDays: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(25).max(250).optional(),
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

function requireTenantId(tenantId?: string) {
  if (!tenantId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing tenant context" });
  }
  return tenantId;
}

function mergeScope(base: Awaited<ReturnType<typeof getAnalyticsAccessScope>>, tenantId: string, input?: z.infer<typeof scopeInput>) {
  const requestedIntermediaryId = base.intermediaryId ?? input?.intermediaryId;

  return {
    ...base,
    tenantId,
    groupId: input?.groupId ?? base.groupId,
    intermediaryId: requestedIntermediaryId,
  };
}

export const analyticsRouter = createTRPCRouter({
  portfolioSummary: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getPortfolioSummary(mergeScope(scope, requireTenantId(ctx.tenantId), input));
    }),

  schemeGrid: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getSchemeGrid(mergeScope(scope, requireTenantId(ctx.tenantId), input));
    }),

  schemeDetail: protectedProcedure
    .input(scopeShape.extend({ groupId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getSchemeDetail({
        ...scope,
        tenantId: requireTenantId(ctx.tenantId),
        groupId: input.groupId,
        intermediaryId: scope.intermediaryId ?? input.intermediaryId,
      });
    }),

  providerDetail: protectedProcedure
    .input(z.object({ providerId: z.string().min(1), groupId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getProviderDetail({
        ...scope,
        tenantId: requireTenantId(ctx.tenantId),
        providerId: input.providerId,
        groupId: input.groupId,
      });
    }),

  providerScorecard: protectedProcedure
    .input(scopeShape.extend({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getProviderScorecard(mergeScope(scope, requireTenantId(ctx.tenantId), input), input?.limit);
    }),

  riskComposition: protectedProcedure
    .input(scopeInput)
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getRiskComposition(mergeScope(scope, requireTenantId(ctx.tenantId), input));
    }),

  memberRiskProfiles: protectedProcedure
    .input(memberRiskFiltersInput)
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getMemberRiskProfiles(
        { ...scope, tenantId: requireTenantId(ctx.tenantId) },
        input,
      );
    }),

  renewalPipeline: protectedProcedure
    .input(scopeShape.extend({ daysAhead: z.number().int().min(1).max(365).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getRenewalPipeline(
        mergeScope(scope, requireTenantId(ctx.tenantId), input),
        input?.daysAhead,
      );
    }),

  renewalWorkspace: protectedProcedure
    .input(scopeShape.extend({
      groupId: z.string().min(1),
      simulation: renewalSimulationInput.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getRenewalWorkspace({
        ...scope,
        tenantId: requireTenantId(ctx.tenantId),
        groupId: input.groupId,
        intermediaryId: scope.intermediaryId ?? input.intermediaryId,
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
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.getAlerts({ ...scope, tenantId: requireTenantId(ctx.tenantId) }, input);
    }),

  acknowledgeAlert: protectedProcedure
    .input(alertActionInput)
    .mutation(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.acknowledgeAlert(
        { ...scope, tenantId: requireTenantId(ctx.tenantId) },
        input.alertId,
        ctx.session.user.id,
      );
    }),

  resolveAlert: protectedProcedure
    .input(resolveAlertInput)
    .mutation(async ({ ctx, input }) => {
      const scope = await getAnalyticsAccessScope(ctx.session);
      return AnalyticsService.resolveAlert(
        { ...scope, tenantId: requireTenantId(ctx.tenantId) },
        input.alertId,
        ctx.session.user.id,
        input.resolutionNote,
      );
    }),

  refreshFoundation: protectedProcedure
    .input(refreshInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.user.role || !ROLES.ADMIN_ONLY.includes(ctx.session.user.role as UserRole)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Analytics refresh requires administrator access" });
      }

      return AnalyticsRefreshService.refreshFoundation({
        tenantId: input?.tenantId ?? requireTenantId(ctx.tenantId),
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
      });
    }),
});
