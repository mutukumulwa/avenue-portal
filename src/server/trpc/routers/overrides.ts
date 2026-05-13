import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { overrideService } from "@/server/services/override.service";
import { rbacService } from "@/server/services/rbac.service";
import { OverrideType, OverrideReasonCode } from "@prisma/client";

const overrideTypeEnum = z.enum([
  "BACK_DATED_AMENDMENT",
  "BACK_DATED_COVER_START",
  "RATE_DEVIATION_EXCEED",
  "PRE_AUTH_OVER_BENEFIT_CAP",
  "CLAIM_EXCLUDED_DIAGNOSIS",
  "FORCE_APPROVE_FRAUD_CLAIM",
  "WAIVE_CO_CONTRIBUTION",
  "EXTEND_GRACE_PERIOD",
  "MID_TERM_RATE_CHANGE",
  "FRAUD_RULE_THRESHOLD_ADJUSTMENT",
  "RESTORE_TERMINATED_MEMBERSHIP",
  "PRIVILEGE_ESCALATION",
  "CUSTOM",
] as const);

const reasonCodeEnum = z.enum([
  "ADMINISTRATIVE_CORRECTION",
  "EXCEPTIONAL_BUSINESS_CASE",
  "REGULATORY_REQUIREMENT",
  "CLIENT_RETENTION",
  "CLINICAL_NECESSITY",
  "SYSTEM_ERROR_CORRECTION",
  "MANAGEMENT_INSTRUCTION",
  "OTHER",
] as const);

export const overridesRouter = createTRPCRouter({
  request: protectedProcedure
    .input(
      z.object({
        overrideType: overrideTypeEnum,
        entityType: z.string(),
        entityId: z.string(),
        reasonCode: reasonCodeEnum,
        justification: z.string().min(10),
        preState: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return overrideService.request({
        tenantId: ctx.tenantId,
        makerId: ctx.session.user.id,
        overrideType: input.overrideType as OverrideType,
        entityType: input.entityType,
        entityId: input.entityId,
        reasonCode: input.reasonCode as OverrideReasonCode,
        justification: input.justification,
        preState: input.preState,
      });
    }),

  approve: protectedProcedure
    .input(
      z.object({
        overrideId: z.string(),
        postState: z.record(z.unknown()).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return overrideService.approve({
        overrideId: input.overrideId,
        checkerId: ctx.session.user.id,
        tenantId: ctx.tenantId,
        postState: input.postState,
        notes: input.notes,
      });
    }),

  reject: protectedProcedure
    .input(z.object({ overrideId: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      return overrideService.reject({
        overrideId: input.overrideId,
        checkerId: ctx.session.user.id,
        tenantId: ctx.tenantId,
        reason: input.reason,
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]).optional(),
        overrideType: overrideTypeEnum.optional(),
        makerId: z.string().optional(),
        page: z.number().int().positive().default(1),
        pageSize: z.number().int().positive().max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "OVERRIDE:REQUEST", ctx.tenantId);
      return overrideService.list(ctx.tenantId, input);
    }),

  getPatterns: protectedProcedure
    .input(
      z.object({
        fromDate: z.date().optional(),
        toDate: z.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "COMPLIANCE:VIEW_OVERRIDES", ctx.tenantId);
      return overrideService.getPatterns(ctx.tenantId, input);
    }),
});
