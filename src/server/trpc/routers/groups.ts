import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { GroupsService } from "../../services/groups.service";

export const groupsRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return GroupsService.getGroups(ctx.tenantId);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return GroupsService.getGroupById(ctx.tenantId, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        industry: z.string().optional(),
        registrationNumber: z.string().optional(),
        contactPersonName: z.string().min(1),
        contactPersonPhone: z.string().min(1),
        contactPersonEmail: z.string().email(),
        packageId: z.string().min(1),
        effectiveDate: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return GroupsService.createGroup(ctx.tenantId, input);
    }),
});
