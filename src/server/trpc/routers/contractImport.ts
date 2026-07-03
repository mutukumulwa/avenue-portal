import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { ContractExtractionService } from "@/server/services/contract-extraction.service";

// Contract import / markdown extraction pipeline (spec §12, §14 contractImport.*).
// Extraction is assistive: it produces candidates + mandatory review questions
// and commits only to a DRAFT contract — never activates.
export const contractImportRouter = createTRPCRouter({
  // Stateless preview — parse markdown and return candidates without persisting.
  preview: protectedProcedure
    .input(z.object({ markdown: z.string().min(1) }))
    .query(({ input }) => ContractExtractionService.parse(input.markdown)),

  // Persist an extraction run (status PARSED) for the review wizard.
  create: protectedProcedure
    .input(z.object({ markdown: z.string().min(1), fileName: z.string().optional(), sourceDocumentId: z.string().optional() }))
    .mutation(async ({ ctx, input }) =>
      ContractExtractionService.createExtraction(ctx.tenantId, { ...input, createdById: ctx.session.user.id }),
    ),

  list: protectedProcedure.query(async ({ ctx }) =>
    prisma.contractExtraction.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => prisma.contractExtraction.findUnique({ where: { id: input.id, tenantId: ctx.tenantId } })),

  submitReviewAnswers: protectedProcedure
    .input(z.object({ id: z.string(), answers: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const ext = await prisma.contractExtraction.findUnique({ where: { id: input.id, tenantId: ctx.tenantId } });
      if (!ext) throw new Error("Extraction not found");
      return prisma.contractExtraction.update({ where: { id: input.id }, data: { reviewAnswers: input.answers as never, status: "REVIEWED" } });
    }),

  commit: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        providerId: z.string(),
        title: z.string().min(1),
        startDate: z.string(),
        endDate: z.string(),
        currency: z.string().default("KES"),
        keepCandidateIndexes: z.array(z.number().int()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      ContractExtractionService.commit(ctx.tenantId, input.id, {
        providerId: input.providerId,
        title: input.title,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        currency: input.currency,
        keepCandidateIndexes: input.keepCandidateIndexes,
        createdById: ctx.session.user.id,
      }),
    ),
});
