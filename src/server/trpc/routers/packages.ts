import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { PackagesService } from "../../services/packages.service";

const BenefitSchema = z.object({
  category: z.enum([
    "INPATIENT",
    "OUTPATIENT",
    "MATERNITY",
    "DENTAL",
    "OPTICAL",
    "MENTAL_HEALTH",
    "CHRONIC_DISEASE",
    "SURGICAL",
    "AMBULANCE_EMERGENCY",
    "LAST_EXPENSE",
    "WELLNESS_PREVENTIVE",
    "REHABILITATION",
    "CUSTOM",
  ]),
  annualSubLimit: z.number().min(0),
  copayPercentage: z.number().min(0).max(100).optional(),
  waitingPeriodDays: z.number().min(0).optional(),
});

export const packagesRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return PackagesService.getPackages(ctx.tenantId);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return PackagesService.getPackageById(ctx.tenantId, input.id);
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        type: z.enum(["INDIVIDUAL", "FAMILY", "GROUP", "CORPORATE"]),
        annualLimit: z.number().min(0),
        contributionAmount: z.number().min(0),
        minAge: z.number().optional(),
        maxAge: z.number().optional(),
        dependentMaxAge: z.number().optional(),
        exclusions: z.array(z.string()).optional(),
        status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
        benefits: z.array(BenefitSchema).min(1, "At least one benefit is required"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return PackagesService.createPackage(ctx.tenantId, input);
    }),
});
