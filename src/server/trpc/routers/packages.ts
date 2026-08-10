import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, underwritingProcedure } from "../trpc";
import { PackagesService } from "../../services/packages.service";
import { packageCreateSchema } from "@/lib/validation/package";
import { sharedLimitBaseSchema, sharedLimitRefinement } from "@/lib/validation/shared-limit";

export const packagesRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return PackagesService.getPackages(ctx.tenantId);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return PackagesService.getPackageById(ctx.tenantId, input.id);
    }),

  // Routed through the SAME canonical schema as the builder server action
  // (SP-1): money finite/≥0/≤2dp, percent 0–100, ages int 0–120 + minAge<maxAge,
  // and each benefit sub-limit ≤ the package annual limit.
  create: underwritingProcedure
    .input(packageCreateSchema)
    .mutation(async ({ ctx, input }) => {
      return PackagesService.createPackage(ctx.tenantId, {
        ...input,
        description: input.description ?? undefined,
      });
    }),

  // Shared Limit Groups
  getSharedLimits: protectedProcedure
    .input(z.object({ packageVersionId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.sharedLimitGroup.findMany({
        where: { packageVersionId: input.packageVersionId },
        include: { benefitConfigs: { include: { benefitConfig: true } } },
      });
    }),

  // Same canonical shared-limit rules as the server action (SP-1): limit > 0,
  // D1 min-category rule, no duplicate membership. Tenant-ownership on the
  // client-supplied version id, and every benefit id must belong to that
  // version — written atomically.
  createSharedLimit: underwritingProcedure
    .input(sharedLimitBaseSchema.extend({ packageVersionId: z.string().min(1) }).superRefine(sharedLimitRefinement))
    .mutation(async ({ input, ctx }) => {
      const version = await ctx.prisma.packageVersion.findUnique({
        where: { id: input.packageVersionId },
        select: { package: { select: { tenantId: true } } },
      });
      if (!version || version.package.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Package version not found." });
      }

      const owned = await ctx.prisma.benefitConfig.findMany({
        where: { id: { in: input.benefitConfigIds }, packageVersionId: input.packageVersionId },
        select: { id: true },
      });
      if (owned.length !== input.benefitConfigIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more selected benefits are not part of this package version.",
        });
      }

      return ctx.prisma.$transaction(async (tx) => {
        const group = await tx.sharedLimitGroup.create({
          data: {
            packageVersionId: input.packageVersionId,
            name: input.name,
            limitAmount: input.limitAmount,
            appliesTo: input.appliesTo,
          },
        });
        await tx.benefitConfigSharedLimit.createMany({
          data: input.benefitConfigIds.map((id) => ({
            sharedLimitGroupId: group.id,
            benefitConfigId: id,
          })),
        });
        return group;
      });
    }),

  deleteSharedLimit: underwritingProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Tenant-ownership on the client-supplied group id (was an unscoped
      // delete-by-id — cross-tenant delete door).
      const grp = await ctx.prisma.sharedLimitGroup.findUnique({
        where: { id: input.id },
        select: { packageVersion: { select: { package: { select: { tenantId: true } } } } },
      });
      if (!grp || grp.packageVersion.package.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Shared limit not found." });
      }
      return ctx.prisma.$transaction(async (tx) => {
        await tx.benefitConfigSharedLimit.deleteMany({ where: { sharedLimitGroupId: input.id } });
        return tx.sharedLimitGroup.delete({ where: { id: input.id } });
      });
    }),
});
