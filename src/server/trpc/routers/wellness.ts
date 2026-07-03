import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { WellnessService } from "../../services/wellness.service";

const programType = z.enum(["SCREENING", "CHRONIC_DISEASE_MGMT", "INCENTIVE"]);
const activityType = z.enum([
  "SCREENING_COMPLETED", "HEALTH_CHECK", "VITALS_LOGGED", "IMMUNIZATION",
  "COACHING_SESSION", "PHYSICAL_ACTIVITY", "OTHER",
]);

export const wellnessRouter = createTRPCRouter({
  listPrograms: protectedProcedure
    .input(z.object({ type: programType.optional(), clientId: z.string().nullable().optional(), includeInactive: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => WellnessService.listPrograms(ctx.tenantId, input ?? {})),

  upsertProgram: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        type: programType,
        description: z.string().optional(),
        clientId: z.string().nullable().optional(),
        cadenceMonths: z.number().int().positive().nullable().optional(),
        fundedAmount: z.number().nonnegative().nullable().optional(),
        currency: z.string().optional(),
        targetConditions: z.array(z.string()).optional(),
        pointsReward: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(({ ctx, input }) => WellnessService.upsertProgram(ctx.tenantId, input)),

  retireProgram: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => WellnessService.retireProgram(ctx.tenantId, input.id)),

  enroll: protectedProcedure
    .input(z.object({ programId: z.string(), memberId: z.string() }))
    .mutation(({ ctx, input }) => WellnessService.enroll(ctx.tenantId, input.programId, input.memberId)),

  withdraw: protectedProcedure
    .input(z.object({ enrollmentId: z.string() }))
    .mutation(({ ctx, input }) => WellnessService.withdraw(ctx.tenantId, input.enrollmentId)),

  logActivity: protectedProcedure
    .input(
      z.object({
        enrollmentId: z.string(),
        type: activityType,
        description: z.string().optional(),
        activityDate: z.coerce.date().optional(),
        points: z.number().int().nonnegative().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      WellnessService.logActivity(ctx.tenantId, input.enrollmentId, {
        type: input.type, description: input.description, activityDate: input.activityDate, points: input.points,
      }),
    ),

  memberSummary: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .query(({ ctx, input }) => WellnessService.memberSummary(ctx.tenantId, input.memberId)),

  dueScreenings: protectedProcedure
    .input(z.object({ asOf: z.coerce.date().optional() }).optional())
    .query(({ ctx, input }) => WellnessService.dueScreenings(ctx.tenantId, input?.asOf)),

  programAnalytics: protectedProcedure.query(({ ctx }) => WellnessService.programAnalytics(ctx.tenantId)),
});
