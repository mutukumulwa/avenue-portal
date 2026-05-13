import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { bindingService } from "@/server/services/binding.service";
import { rbacService } from "@/server/services/rbac.service";
import { AcceptanceMethod } from "@prisma/client";

export const bindingRouter = createTRPCRouter({
  // Accept a quotation (method + optional document URL)
  acceptQuotation: protectedProcedure
    .input(z.object({
      quotationId:  z.string(),
      method:       z.nativeEnum(AcceptanceMethod),
      documentUrl:  z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bindingService.captureAcceptance(
        input.quotationId, ctx.tenantId,
        input.method, ctx.session.user.id, input.documentUrl,
      );
    }),

  // Run pre-bind validation gates
  validatePreBind: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bindingService.runPreBindValidation(input.quotationId, ctx.tenantId);
    }),

  // Create membership records (maker step)
  createMemberships: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "MEMBER:CREATE", ctx.tenantId);
      return bindingService.createMemberships(input.quotationId, ctx.tenantId, ctx.session.user.id);
    }),

  // Approve the binder (checker step — must differ from maker)
  approveBinder: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "QUOTATION:APPROVE_BINDER", ctx.tenantId);
      return bindingService.approveBinder(input.quotationId, ctx.tenantId, ctx.session.user.id);
    }),

  // Post the debit note / fund deposit request
  postDebitNote: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "BILLING:POST_DEBIT_NOTE", ctx.tenantId);
      return bindingService.postDebitNote(input.quotationId, ctx.tenantId, ctx.session.user.id);
    }),

  // Fetch binding status (acceptance, validation, members, approval)
  getStatus: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bindingService.getBindingStatus(input.quotationId, ctx.tenantId);
    }),

  // Fetch members created from this quotation
  getMembers: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bindingService.getMembershipsForQuotation(input.quotationId, ctx.tenantId);
    }),
});
