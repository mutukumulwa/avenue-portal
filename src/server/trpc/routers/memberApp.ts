import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { MemberAppService } from "@/server/services/member-app.service";

function assertMemberRole(role?: string | null) {
  if (role !== "MEMBER_USER") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const memberAppRouter = createTRPCRouter({
  dashboard: protectedProcedure.query(async ({ ctx }) => {
    assertMemberRole(ctx.session.user.role);
    const dashboard = await MemberAppService.getDashboardForUser(ctx.session.user.id, ctx.tenantId);
    if (!dashboard) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No member profile is linked to this account." });
    }
    return dashboard;
  }),

  benefitState: protectedProcedure
    .input(z.object({ memberId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      assertMemberRole(ctx.session.user.role);
      const state = await MemberAppService.getBenefitStateForUser(ctx.session.user.id, ctx.tenantId, input?.memberId);
      if (!state) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Benefit state is not available for this member." });
      }
      return state;
    }),

  familyView: protectedProcedure.query(async ({ ctx }) => {
    assertMemberRole(ctx.session.user.role);
    const family = await MemberAppService.getFamilyViewForUser(ctx.session.user.id, ctx.tenantId);
    if (!family) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No member profile is linked to this account." });
    }
    return family;
  }),

  encounterHistory: protectedProcedure
    .input(z.object({
      memberId: z.string().optional(),
      status: z.string().optional(),
      benefitCategory: z.string().optional(),
      period: z.enum(["30d", "90d", "ytd", "all"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      assertMemberRole(ctx.session.user.role);
      const history = await MemberAppService.getEncounterHistoryForUser(ctx.session.user.id, ctx.tenantId, input);
      if (!history) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No member profile is linked to this account." });
      }
      return history;
    }),

  encounterDetail: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      assertMemberRole(ctx.session.user.role);
      const detail = await MemberAppService.getEncounterDetailForUser(ctx.session.user.id, ctx.tenantId, input.claimId);
      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Care event is not available." });
      }
      return detail;
    }),
});
