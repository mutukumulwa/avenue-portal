import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const pricingRouter = createTRPCRouter({
  // Get all pricing models
  listModels: protectedProcedure.query(async ({ ctx }) => {
    return prisma.pricingModel.findMany({
      where: { tenantId: ctx.session.user.tenantId },
      orderBy: { createdAt: "desc" },
    });
  }),

  // Get a specific pricing model with its rate tables
  getModel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return prisma.pricingModel.findUnique({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        include: {
          rateTables: {
            orderBy: [{ minAge: "asc" }, { gender: "asc" }, { familySize: "asc" }],
          },
        },
      });
    }),

  // Create a new pricing model
  createModel: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        type: z.enum(["FLAT_RATE", "AGE_BANDED", "EXPERIENCE_RATED", "CUSTOM"]),
        parameters: z.any().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prisma.pricingModel.create({
        data: {
          ...input,
          tenantId: ctx.session.user.tenantId,
          parameters: input.parameters || {},
        },
      });
    }),

  // Update a rate table entry
  upsertRateTableEntry: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        pricingModelId: z.string(),
        minAge: z.number().int().min(0),
        maxAge: z.number().int().min(0),
        gender: z.string(),
        familySize: z.string(),
        location: z.string().optional(),
        baseRate: z.number().min(0),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Security: ensure pricing model belongs to tenant
      const model = await prisma.pricingModel.findUnique({
        where: { id: input.pricingModelId, tenantId: ctx.session.user.tenantId },
      });
      if (!model) throw new Error("Pricing model not found");

      if (input.id) {
        return prisma.contributionRateTable.update({
          where: { id: input.id },
          data: {
            minAge: input.minAge,
            maxAge: input.maxAge,
            gender: input.gender,
            familySize: input.familySize,
            location: input.location,
            baseRate: input.baseRate,
          },
        });
      } else {
        return prisma.contributionRateTable.create({
          data: {
            pricingModelId: input.pricingModelId,
            minAge: input.minAge,
            maxAge: input.maxAge,
            gender: input.gender,
            familySize: input.familySize,
            location: input.location,
            baseRate: input.baseRate,
          },
        });
      }
    }),

  // Delete a rate table entry
  deleteRateTableEntry: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const entry = await prisma.contributionRateTable.findUnique({
        where: { id: input.id },
        include: { pricingModel: true },
      });
      if (!entry || entry.pricingModel.tenantId !== ctx.session.user.tenantId) {
        throw new Error("Entry not found");
      }

      return prisma.contributionRateTable.delete({ where: { id: input.id } });
    }),
});
