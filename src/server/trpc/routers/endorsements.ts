import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { EndorsementsService } from "../../services/endorsement.service";

export const endorsementsRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return EndorsementsService.getEndorsements(ctx.tenantId);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return EndorsementsService.getEndorsementById(ctx.tenantId, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        type: z.enum(["MEMBER_ADDITION", "MEMBER_DELETION"]),
        effectiveDate: z.string(),
        changeDetails: z.any(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parsedInput = {
         ...input,
         effectiveDate: new Date(input.effectiveDate),
         changeDetails: input.changeDetails || {},
         requestedBy: ctx.user?.id
      };
      
      return EndorsementsService.createEndorsement(ctx.tenantId, parsedInput);
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return EndorsementsService.approveEndorsement(ctx.tenantId, input.id, ctx.user?.id || "SYSTEM");
    }),
});
