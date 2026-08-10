import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, underwritingProcedure } from "../trpc";
import { PackagesService } from "../../services/packages.service";
import { packageCreateSchema } from "@/lib/validation/package";
import { sharedLimitBaseSchema, sharedLimitRefinement } from "@/lib/validation/shared-limit";
import {
  treatmentExclusionBaseSchema,
  treatmentExclusionRefinement,
  resolveExclusionOwner,
  detectExclusionOverlap,
} from "@/lib/validation/exclusion";
import {
  referralRuleBaseSchema,
  referralRuleRefinement,
  detectReferralOverlap,
} from "@/lib/validation/referral";

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

  // ── Treatment Exclusions (WP-2.3) — same canonical schema as the action ──
  getTreatmentExclusions: protectedProcedure
    .input(z.object({ packageVersionId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.treatmentExclusionRule.findMany({
        where: { packageVersionId: input.packageVersionId, tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
      });
    }),

  createTreatmentExclusion: underwritingProcedure
    .input(
      treatmentExclusionBaseSchema
        .extend({
          packageVersionId: z.string().optional().nullable(),
          providerContractId: z.string().optional().nullable(),
        })
        .superRefine(treatmentExclusionRefinement),
    )
    .mutation(async ({ input, ctx }) => {
      const ownerRes = resolveExclusionOwner(input);
      if (!ownerRes.ok) throw new TRPCError({ code: "BAD_REQUEST", message: ownerRes.message });
      const owner = ownerRes.owner;

      if ("packageVersionId" in owner) {
        const version = await ctx.prisma.packageVersion.findUnique({
          where: { id: owner.packageVersionId },
          select: { package: { select: { tenantId: true } } },
        });
        if (!version || version.package.tenantId !== ctx.tenantId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Package version not found." });
        }
      } else {
        const contract = await ctx.prisma.providerContract.findFirst({
          where: { id: owner.providerContractId, tenantId: ctx.tenantId },
          select: { id: true },
        });
        if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "Provider contract not found." });
      }

      const existing = await ctx.prisma.treatmentExclusionRule.findMany({
        where:
          "packageVersionId" in owner
            ? { packageVersionId: owner.packageVersionId, isActive: true }
            : { providerContractId: owner.providerContractId, isActive: true },
        select: {
          id: true,
          ruleCategory: true,
          benefitCategories: true,
          serviceCodes: true,
          diagnosisCodes: true,
          procedureCodes: true,
          effectiveFrom: true,
          effectiveTo: true,
          isActive: true,
        },
      });
      if (
        detectExclusionOverlap(existing, {
          ruleCategory: input.ruleCategory,
          benefitCategories: input.benefitCategories,
          serviceCodes: input.serviceCodes,
          diagnosisCodes: input.diagnosisCodes,
          procedureCodes: input.procedureCodes,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        })
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This exclusion overlaps an existing rule of the same category and scope for an overlapping period.",
        });
      }

      return ctx.prisma.treatmentExclusionRule.create({
        data: {
          tenantId: ctx.tenantId,
          ...owner,
          ruleCategory: input.ruleCategory,
          exclusionType: input.exclusionType,
          benefitCategories: input.benefitCategories,
          serviceCodes: input.serviceCodes,
          diagnosisCodes: input.diagnosisCodes,
          procedureCodes: input.procedureCodes,
          exceptionLogic: (input.exceptionLogic ?? undefined) as never,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          sourceClause: input.sourceClause ?? null,
          internalNote: input.internalNote ?? null,
          memberSafeExplanation: input.memberSafeExplanation,
        },
      });
    }),

  deleteTreatmentExclusion: underwritingProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rule = await ctx.prisma.treatmentExclusionRule.findUnique({
        where: { id: input.id },
        select: { tenantId: true },
      });
      if (!rule || rule.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Exclusion not found." });
      }
      return ctx.prisma.treatmentExclusionRule.delete({ where: { id: input.id } });
    }),

  // ── Referral Rules (WP-2.4) — same canonical schema as the action ──
  getReferralRules: protectedProcedure
    .input(z.object({ packageVersionId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.prisma.referralRule.findMany({
        where: { packageVersionId: input.packageVersionId, tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
      });
    }),

  createReferralRule: underwritingProcedure
    .input(referralRuleBaseSchema.extend({ packageVersionId: z.string().min(1) }).superRefine(referralRuleRefinement))
    .mutation(async ({ input, ctx }) => {
      const version = await ctx.prisma.packageVersion.findUnique({
        where: { id: input.packageVersionId },
        select: { package: { select: { tenantId: true } } },
      });
      if (!version || version.package.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Package version not found." });
      }

      const existing = await ctx.prisma.referralRule.findMany({
        where: { packageVersionId: input.packageVersionId, isActive: true },
        select: {
          id: true,
          benefitCategories: true,
          serviceCodes: true,
          providerSpecialties: true,
          effectiveFrom: true,
          effectiveTo: true,
          isActive: true,
        },
      });
      if (
        detectReferralOverlap(existing, {
          benefitCategories: input.benefitCategories,
          serviceCodes: input.serviceCodes,
          providerSpecialties: input.providerSpecialties,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        })
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This referral rule overlaps an existing rule with the same scope for an overlapping period.",
        });
      }

      return ctx.prisma.referralRule.create({
        data: {
          tenantId: ctx.tenantId,
          packageVersionId: input.packageVersionId,
          benefitCategories: input.benefitCategories,
          serviceCodes: input.serviceCodes,
          providerSpecialties: input.providerSpecialties,
          requiresReferral: input.requiresReferral,
          emergencyException: input.emergencyException,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
          sourceClause: input.sourceClause ?? null,
          memberSafeExplanation: input.memberSafeExplanation,
        },
      });
    }),

  deleteReferralRule: underwritingProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rule = await ctx.prisma.referralRule.findUnique({
        where: { id: input.id },
        select: { tenantId: true },
      });
      if (!rule || rule.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Referral rule not found." });
      }
      return ctx.prisma.referralRule.delete({ where: { id: input.id } });
    }),
});
