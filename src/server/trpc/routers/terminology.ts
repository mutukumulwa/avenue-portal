import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { TerminologyService } from "../../services/terminology.service";

const scopeEnum = z.enum(["SYSTEM", "HOUSE", "CLIENT", "LOCALE"]);
const statusEnum = z.enum(["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"]);

export const terminologyRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          scope: scopeEnum.optional(),
          clientId: z.string().nullable().optional(),
          status: statusEnum.optional(),
          key: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      return TerminologyService.list(ctx.tenantId, input);
    }),

  createDraft: protectedProcedure
    .input(
      z.object({
        scope: scopeEnum,
        clientId: z.string().nullable().optional(),
        locale: z.string().nullable().optional(),
        key: z.string().min(1),
        displayText: z.string().min(1),
        context: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return TerminologyService.createDraft(ctx.tenantId, input, ctx.session.user.id);
    }),

  submit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return TerminologyService.submit(ctx.tenantId, input.id, ctx.session.user.id);
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return TerminologyService.approve(ctx.tenantId, input.id, ctx.session.user.id, input.notes);
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return TerminologyService.reject(ctx.tenantId, input.id, ctx.session.user.id, input.notes);
    }),

  /** Live preview of how a key resolves in a (client, locale) context. */
  preview: protectedProcedure
    .input(
      z.object({
        key: z.string().min(1),
        clientId: z.string().nullable().optional(),
        locale: z.string().nullable().optional(),
        fallback: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return {
        resolved: await TerminologyService.resolve({ tenantId: ctx.tenantId, ...input }),
      };
    }),
});
