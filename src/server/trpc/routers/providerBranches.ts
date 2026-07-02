import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

// Provider branches + name aliases (digital-contract spec §5.2). Branches make
// branch-scoped contracts and rates matchable; aliases resolve the legal/trading
// name variance (O1) during extraction and EDI intake.
export const providerBranchesRouter = createTRPCRouter({
  listBranches: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ ctx, input }) =>
      prisma.providerBranch.findMany({
        where: { tenantId: ctx.tenantId, providerId: input.providerId },
        orderBy: { name: "asc" },
      }),
    ),

  createBranch: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        name: z.string().min(1),
        code: z.string().optional(),
        address: z.string().optional(),
        county: z.string().optional(),
        licenceNumber: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const provider = await prisma.provider.findUnique({ where: { id: input.providerId, tenantId: ctx.tenantId } });
      if (!provider) throw new Error("Provider not found");
      return prisma.providerBranch.create({ data: { tenantId: ctx.tenantId, ...input } });
    }),

  updateBranch: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        code: z.string().optional(),
        address: z.string().optional(),
        county: z.string().optional(),
        licenceNumber: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      const branch = await prisma.providerBranch.findUnique({ where: { id } });
      if (!branch || branch.tenantId !== ctx.tenantId) throw new Error("Branch not found");
      return prisma.providerBranch.update({ where: { id }, data: rest });
    }),

  listAliases: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ ctx, input }) =>
      prisma.providerAlias.findMany({ where: { tenantId: ctx.tenantId, providerId: input.providerId }, orderBy: { aliasName: "asc" } }),
    ),

  createAlias: protectedProcedure
    .input(z.object({ providerId: z.string(), aliasName: z.string().min(1), source: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const provider = await prisma.provider.findUnique({ where: { id: input.providerId, tenantId: ctx.tenantId } });
      if (!provider) throw new Error("Provider not found");
      return prisma.providerAlias.create({ data: { tenantId: ctx.tenantId, ...input } });
    }),

  deleteAlias: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const alias = await prisma.providerAlias.findUnique({ where: { id: input.id } });
      if (!alias || alias.tenantId !== ctx.tenantId) throw new Error("Alias not found");
      return prisma.providerAlias.delete({ where: { id: input.id } });
    }),
});
