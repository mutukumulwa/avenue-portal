import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ClaimsService } from "@/server/services/claims.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";

export const preauthRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ClaimsService.getPreAuthorizations(ctx.tenantId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ClaimsService.getPreAuthById(ctx.tenantId, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        memberId: z.string(),
        providerId: z.string(),
        serviceType: z.enum(["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"]),
        expectedDateOfService: z.string().optional(),
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
        estimatedCost: z.number(),
        clinicalNotes: z.string().optional(),
        benefitCategory: z.enum([
          "INPATIENT", "OUTPATIENT", "MATERNITY", "DENTAL", "OPTICAL",
          "MENTAL_HEALTH", "CHRONIC_DISEASE", "SURGICAL", "AMBULANCE_EMERGENCY",
          "LAST_EXPENSE", "WELLNESS_PREVENTIVE", "REHABILITATION", "CUSTOM",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { preauth } = await ClaimsService.createPreAuth(ctx.tenantId, {
        ...input,
        expectedDateOfService: input.expectedDateOfService ? new Date(input.expectedDateOfService) : undefined,
        submittedBy: "ADMIN",
      });
      return preauth;
    }),

  adjudicate: protectedProcedure
    .input(
      z.object({
        preauthId: z.string(),
        action: z.enum(["APPROVED", "DECLINED"]),
        approvedAmount: z.number().optional(),
        validDays: z.number().optional(),
        declineReasonCode: z.string().optional(),
        declineNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // W1.1: canonical PA decision stack — approvals always place a hold (PR-011).
      if (input.action === "APPROVED") {
        return preauthAdjudicationService.approveByHuman(
          input.preauthId,
          ctx.tenantId,
          ctx.session.user.id,
          input.approvedAmount ?? 0,
          input.declineNotes,
          input.validDays,
        );
      }
      return preauthAdjudicationService.declineByHuman(
        input.preauthId,
        ctx.tenantId,
        ctx.session.user.id,
        input.declineReasonCode ?? "OTHER",
        input.declineNotes ?? "",
      );
    }),

  convertToClaim: protectedProcedure
    .input(z.object({ preauthId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ClaimsService.convertPreAuthToClaim(ctx.tenantId, input.preauthId);
    }),
});
