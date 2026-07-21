import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
import { quotationBuilderService } from "@/server/services/quotation-builder.service";
import { rbacService } from "@/server/services/rbac.service";

export const quotationsRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return prisma.quotation.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        group: { select: { id: true, name: true } },
        broker: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.quotation.findUnique({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          group: true,
          broker: { select: { id: true, name: true, email: true } },
          pricingModel: true,
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string().optional(),
        brokerId: z.string().optional(),
        prospectName: z.string().optional(),
        prospectContact: z.string().optional(),
        prospectEmail: z.string().email().optional(),
        prospectIndustry: z.string().optional(),
        packageId: z.string().optional(),
        memberCount: z.number().int().positive(),
        dependentCount: z.number().int().min(0).default(0),
        ageBands: z.any().optional(),
        ratePerMember: z.number().positive(),
        annualPremium: z.number().positive(),
        loadings: z.any().optional(),
        discounts: z.any().optional(),
        finalPremium: z.number().positive(),
        pricingNotes: z.string().optional(),
        validUntil: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const quoteNumber = await peekNextDocumentNumber("QUO", (yp) =>
        prisma.quotation
          .findFirst({ where: { tenantId: ctx.tenantId, quoteNumber: { startsWith: yp } }, orderBy: { quoteNumber: "desc" }, select: { quoteNumber: true } })
          .then((r) => r?.quoteNumber ?? null),
      );

      return prisma.quotation.create({
        data: {
          tenantId: ctx.tenantId,
          quoteNumber,
          createdBy: ctx.session.user.id,
          validUntil: new Date(input.validUntil),
          status: "DRAFT",
          groupId: input.groupId,
          brokerId: input.brokerId,
          prospectName: input.prospectName,
          prospectContact: input.prospectContact,
          prospectEmail: input.prospectEmail,
          prospectIndustry: input.prospectIndustry,
          packageId: input.packageId,
          memberCount: input.memberCount,
          dependentCount: input.dependentCount,
          ageBands: input.ageBands,
          ratePerMember: input.ratePerMember,
          annualPremium: input.annualPremium,
          loadings: input.loadings,
          discounts: input.discounts,
          finalPremium: input.finalPremium,
          pricingNotes: input.pricingNotes,
        },
      });
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.quotation.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { status: input.status },
      });
    }),

  // ─── QUOTATION BUILDER (Process 4) ───────────────────────

  buildQuote: protectedProcedure
    .input(z.object({
      quotationId: z.string(),
      groupSizeDiscountOverridePct: z.number().min(0).max(0.5).optional(),
      loyaltyDiscountPct:           z.number().min(0).max(0.5).optional(),
      customDiscountPct:            z.number().min(0).max(0.5).optional(),
      customDiscountDescription:    z.string().optional(),
      cardIssuanceFeePerLife:       z.number().min(0).optional(),
      smartCardFeePerLife:          z.number().min(0).optional(),
      welcomePackFeePerLife:        z.number().min(0).optional(),
      validityDays:                 z.number().int().min(1).max(180).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "QUOTATION:ISSUE", ctx.tenantId);
      return quotationBuilderService.buildQuote(input.quotationId, ctx.tenantId, ctx.session.user.id, input);
    }),

  getLineItems: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return quotationBuilderService.getLineItems(input.quotationId, ctx.tenantId);
    }),

  getVersionHistory: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return quotationBuilderService.getVersionHistory(input.quotationId, ctx.tenantId);
    }),

  issueQuote: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "QUOTATION:ISSUE", ctx.tenantId);
      const { quoteNumber } = await quotationBuilderService.issueQuote(
        input.quotationId, ctx.tenantId, ctx.session.user.id,
      );
      return { success: true, quoteNumber };
    }),

  // Custom pricing model management
  listCustomModels: protectedProcedure.query(async ({ ctx }) => {
    return prisma.customPricingModelFile.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { uploadedAt: "desc" },
    });
  }),

  createCustomModel: protectedProcedure
    .input(z.object({
      fileType: z.enum(["EXCEL", "PYTHON"]),
      fileUrl:  z.string().url(),
      packageId: z.string().optional(),
      groupId:   z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "QUOTATION:ISSUE", ctx.tenantId);
      return prisma.customPricingModelFile.create({
        data: { tenantId: ctx.tenantId, uploadedById: ctx.session.user.id, ...input },
      });
    }),

  runCustomModel: protectedProcedure
    .input(z.object({
      quotationId: z.string(),
      modelFileId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "QUOTATION:ISSUE", ctx.tenantId);
      const model = await prisma.customPricingModelFile.findUnique({ where: { id: input.modelFileId } });
      if (!model) throw new Error("Model file not found");
      if (model.fileType === "PYTHON") {
        return quotationBuilderService.runPythonModel(input.quotationId, input.modelFileId, ctx.tenantId);
      }
      return quotationBuilderService.runExcelModel(input.quotationId, input.modelFileId, ctx.tenantId);
    }),

  getCustomModelRunLogs: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.customPricingRunLog.findMany({
        where: { tenantId: ctx.tenantId, quotationId: input.quotationId },
        orderBy: { ranAt: "desc" },
        take: 20,
      });
    }),

  // ─── PRICING MODELS ──────────────────────────────────────
  getPricingModels: protectedProcedure.query(async ({ ctx }) => {
    return prisma.pricingModel.findMany({
      where: { tenantId: ctx.tenantId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }),

  // ─── CALCULATOR ──────────────────────────────────────────
  calculatePremium: protectedProcedure
    .input(
      z.object({
        memberCount: z.number().int().positive(),
        dependentCount: z.number().int().min(0).default(0),
        packageId: z.string(),
        loadings: z.record(z.number()).default({}),
        discounts: z.record(z.number()).default({}),
        ageBands: z
          .array(
            z.object({
              minAge: z.number(),
              maxAge: z.number(),
              count: z.number(),
              rate: z.number(),
            })
          )
          .optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const pkg = await prisma.package.findUnique({
        where: { id: input.packageId, tenantId: ctx.tenantId },
      });
      if (!pkg) throw new Error("Package not found");

      const baseRatePerMember = Number(pkg.contributionAmount);
      let annualPremium: number;

      if (input.ageBands && input.ageBands.length > 0) {
        annualPremium = input.ageBands.reduce((sum, b) => sum + b.count * b.rate, 0);
      } else {
        annualPremium =
          (input.memberCount + input.dependentCount) * baseRatePerMember;
      }

      const totalLoadingPct = Object.values(input.loadings).reduce((s, v) => s + v, 0);
      const totalDiscountPct = Object.values(input.discounts).reduce((s, v) => s + v, 0);
      const finalPremium = annualPremium * (1 + totalLoadingPct / 100) * (1 - totalDiscountPct / 100);

      return {
        baseRatePerMember,
        annualPremium,
        totalLoadingPct,
        totalDiscountPct,
        finalPremium,
        ratePerMember: finalPremium / (input.memberCount + input.dependentCount),
      };
    }),
});
