import { z } from "zod";
import { createTRPCRouter, protectedProcedure, memberOpsProcedure } from "../trpc";
import { GroupsService } from "../../services/groups.service";
import { groupCreateSchema } from "@/lib/validation/group";

export const groupsRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return GroupsService.getGroups(ctx.tenantId, ctx.clientId);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return GroupsService.getGroupById(ctx.tenantId, input.id, ctx.clientId);
    }),

  // WP-S1 — the tRPC door shares the SAME canonical schema as the server action,
  // so a raw `POST /api/trpc/groups.create` gets the trimmed name, the date
  // horizon guard and the registration/paymentFrequency rules for free (the old
  // `effectiveDate: z.string()` accepted anything). Client-scoped duplicate
  // enforcement + version pinning live in `GroupsService.createGroup`.
  create: memberOpsProcedure
    .input(groupCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return GroupsService.createGroup(ctx.tenantId, input, ctx.clientId);
    }),
});
