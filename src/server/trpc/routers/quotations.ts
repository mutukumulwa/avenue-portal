import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

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
      const count = await prisma.quotation.count({ where: { tenantId: ctx.tenantId } });
      const quoteNumber = `QUO-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

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
