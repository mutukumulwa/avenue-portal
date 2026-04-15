import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const providersRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return prisma.provider.findMany({
      where: { tenantId: ctx.tenantId },
      include: { _count: { select: { claims: true, preauths: true } } },
      orderBy: { name: "asc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.provider.findUnique({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          tariffs: { orderBy: { effectiveFrom: "desc" } },
          _count: { select: { claims: true, preauths: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        type: z.enum(["HOSPITAL", "CLINIC", "PHARMACY", "LABORATORY", "DENTAL", "OPTICAL", "REHABILITATION"]),
        tier: z.enum(["OWN", "PARTNER", "PANEL"]).default("PARTNER"),
        address: z.string().optional(),
        county: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        contactPerson: z.string().optional(),
        servicesOffered: z.array(z.string()).default([]),
        contractStatus: z.string().default("ACTIVE"),
        contractStartDate: z.string().optional(),
        contractEndDate: z.string().optional(),
        smartProviderId: z.string().optional(),
        slade360ProviderId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.provider.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
          contractStartDate: input.contractStartDate ? new Date(input.contractStartDate) : undefined,
          contractEndDate: input.contractEndDate ? new Date(input.contractEndDate) : undefined,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        type: z.enum(["HOSPITAL", "CLINIC", "PHARMACY", "LABORATORY", "DENTAL", "OPTICAL", "REHABILITATION"]).optional(),
        tier: z.enum(["OWN", "PARTNER", "PANEL"]).optional(),
        address: z.string().optional(),
        county: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        contactPerson: z.string().optional(),
        servicesOffered: z.array(z.string()).optional(),
        contractStatus: z.string().optional(),
        contractStartDate: z.string().optional(),
        contractEndDate: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, contractStartDate, contractEndDate, ...rest } = input;
      return prisma.provider.update({
        where: { id, tenantId: ctx.tenantId },
        data: {
          ...rest,
          contractStartDate: contractStartDate ? new Date(contractStartDate) : undefined,
          contractEndDate: contractEndDate ? new Date(contractEndDate) : undefined,
        },
      });
    }),

  addTariff: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        cptCode: z.string().optional(),
        serviceName: z.string().min(1),
        agreedRate: z.number().positive(),
        effectiveFrom: z.string(),
        effectiveTo: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.providerTariff.create({
        data: {
          ...input,
          agreedRate: input.agreedRate,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
        },
      });
    }),
});
