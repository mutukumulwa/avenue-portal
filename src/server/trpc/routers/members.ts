import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { MembersService } from "../../services/members.service";

export const membersRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return MembersService.getMembers(ctx.tenantId);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return MembersService.getMemberById(ctx.tenantId, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string().min(1),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        idNumber: z.string().optional(),
        dateOfBirth: z.string(),
        gender: z.enum(["MALE", "FEMALE", "OTHER"]),
        phone: z.string().optional(),
        email: z.string().email().optional().or(z.literal("")),
        relationship: z.enum(["PRINCIPAL", "SPOUSE", "CHILD", "PARENT"]).optional(),
        principalId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const parsedInput = {
        ...input,
        email: input.email === "" ? undefined : input.email,
      };
      const { member } = await MembersService.createMember(ctx.tenantId, parsedInput);
      return member;
    }),
});
