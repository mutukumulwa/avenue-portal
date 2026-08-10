import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, superAdminProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { ServiceCategoryService } from "@/server/services/service-category.service";
import { addTariffSchema, detectTariffOverlap } from "@/lib/validation/tariff";

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

  create: superAdminProcedure
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

  update: superAdminProcedure
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

  // WP-N1 (N-009): the tariff rate + effective window run through the SAME
  // canonical schema the server action uses (positive/finite/≤2dp rate,
  // effectiveTo > effectiveFrom), and the providerId is tenant-verified — the
  // tRPC door no longer trusts a client-supplied provider id or an unbounded
  // rate. WP-N2 (N-010): an overlapping active rate for the same code+scope is
  // blocked here too.
  addTariff: superAdminProcedure
    .input(addTariffSchema)
    .mutation(async ({ ctx, input }) => {
      const provider = await prisma.provider.findFirst({
        where: { id: input.providerId, tenantId: ctx.tenantId },
        select: { id: true },
      });
      if (!provider) throw new TRPCError({ code: "NOT_FOUND", message: "Provider not found" });

      if (input.clientId) {
        const client = await prisma.client.findFirst({
          where: { id: input.clientId, operatorTenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "Client not found" });
      }

      const existing = await prisma.providerTariff.findMany({
        where: { providerId: input.providerId, contractId: null, isActive: true, clientId: input.clientId ?? null },
        select: { id: true, cptCode: true, serviceName: true, clientId: true, contractId: true, effectiveFrom: true, effectiveTo: true, isActive: true },
      });
      const conflict = detectTariffOverlap(existing, {
        cptCode: input.cptCode ?? null,
        serviceName: input.serviceName,
        clientId: input.clientId ?? null,
        contractId: null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      });
      if (conflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Another active rate for this code and scope already covers an overlapping period.",
        });
      }

      const serviceCategoryId = await ServiceCategoryService.resolveCategoryId(ctx.tenantId, {
        cptCode: input.cptCode ?? undefined,
        serviceName: input.serviceName,
      });
      return prisma.providerTariff.create({
        data: {
          providerId: input.providerId,
          cptCode: input.cptCode ?? null,
          serviceName: input.serviceName,
          agreedRate: input.agreedRate,
          currency: input.currency,
          clientId: input.clientId ?? null,
          serviceCategoryId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? undefined,
        },
      });
    }),
});
