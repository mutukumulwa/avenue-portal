import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ClaimsService } from "@/server/services/claims.service";

export const claimsRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ClaimsService.getClaims(ctx.tenantId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ClaimsService.getClaimById(ctx.tenantId, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        providerId: z.string(),
        serviceType: z.enum(["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"]),
        dateOfService: z.string(),
        admissionDate: z.string().optional(),
        dischargeDate: z.string().optional(),
        attendingDoctor: z.string().optional(),
        diagnoses: z.array(z.object({
          icdCode: z.string().optional(),
          description: z.string(),
          isPrimary: z.boolean().optional(),
        })),
        procedures: z.array(z.object({
          cptCode: z.string().optional(),
          description: z.string(),
          quantity: z.number().optional(),
          unitCost: z.number(),
          total: z.number(),
        })),
        billedAmount: z.number(),
        benefitCategory: z.enum([
          "INPATIENT", "OUTPATIENT", "MATERNITY", "DENTAL", "OPTICAL",
          "MENTAL_HEALTH", "CHRONIC_DISEASE", "SURGICAL", "AMBULANCE_EMERGENCY",
          "LAST_EXPENSE", "WELLNESS_PREVENTIVE", "REHABILITATION", "CUSTOM",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ClaimsService.createClaim(ctx.tenantId, {
        ...input,
        dateOfService: new Date(input.dateOfService),
        admissionDate: input.admissionDate ? new Date(input.admissionDate) : undefined,
        dischargeDate: input.dischargeDate ? new Date(input.dischargeDate) : undefined,
      });
    }),

  adjudicate: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        action: z.enum(["APPROVED", "PARTIALLY_APPROVED", "DECLINED"]),
        approvedAmount: z.number().optional(),
        declineReasonCode: z.string().optional(),
        declineNotes: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ClaimsService.adjudicateClaim(ctx.tenantId, input.claimId, {
        ...input,
        reviewerId: ctx.session.user.id,
      });
    }),
});
