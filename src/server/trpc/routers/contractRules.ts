import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

// CRUD for the Phase-3 rule entities (spec §5.7–5.11) — the backend the rule
// builder (§11.5) drives. Rules are typed rows, never free-form code. All are
// scoped to a contract the caller's tenant owns.

const scopeEnum = z.enum(["CONTRACT", "CATEGORY", "LINE", "PACKAGE"]);

async function assertContract(tenantId: string, contractId: string) {
  const c = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
  if (!c) throw new Error("Contract not found");
  return c;
}

export const contractRulesRouter = createTRPCRouter({
  // ── Aggregate read for the detail page Rules tab ──
  listForContract: protectedProcedure
    .input(z.object({ contractId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertContract(ctx.tenantId, input.contractId);
      const [pricing, packages, preauth, documentation, exclusions] = await Promise.all([
        prisma.pricingRule.findMany({ where: { contractId: input.contractId, isActive: true }, orderBy: { priority: "asc" } }),
        prisma.contractPackage.findMany({ where: { contractId: input.contractId, isActive: true }, include: { components: true } }),
        prisma.preauthRule.findMany({ where: { contractId: input.contractId, isActive: true } }),
        prisma.documentationRule.findMany({ where: { contractId: input.contractId, isActive: true } }),
        prisma.providerContractExclusion.findMany({ where: { contractId: input.contractId } }),
      ]);
      return { pricing, packages, preauth, documentation, exclusions };
    }),

  // ── Pricing rules (§5.7) ──
  createPricingRule: protectedProcedure
    .input(
      z.object({
        contractId: z.string(),
        scope: scopeEnum.default("CONTRACT"),
        serviceCategoryId: z.string().optional(),
        tariffLineId: z.string().optional(),
        ruleKind: z.enum([
          "FIXED", "DISCOUNT_OFF_BILLED", "MARKUP_OVER_COST", "MAX_CAP", "MIN_FLOOR", "PER_DIEM",
          "PER_VISIT_CASE_RATE", "PER_ADMISSION", "PER_PROCEDURE", "PER_CONSULTATION", "PER_ITEM",
          "PER_SESSION", "PACKAGE", "CAPITATION", "NET_OF_EXTERNAL", "EXTERNAL_TARIFF_REF",
          "AVERAGE_COST_POOL", "LOWER_OF", "HIGHER_OF",
        ]),
        params: z.record(z.string(), z.unknown()).default({}),
        priority: z.number().int().default(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertContract(ctx.tenantId, input.contractId);
      return prisma.pricingRule.create({ data: { tenantId: ctx.tenantId, ...input, params: input.params as never } });
    }),

  deactivatePricingRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.pricingRule.update({ where: { id: input.id }, data: { isActive: false } })),

  // ── Packages (§5.8) ──
  createPackage: protectedProcedure
    .input(
      z.object({
        contractId: z.string(),
        name: z.string().min(1),
        code: z.string().optional(),
        packagePrice: z.number().nonnegative(),
        currency: z.string().default("KES"),
        triggerType: z.enum(["PROCEDURE_CODE", "DIAGNOSIS_CODE", "SERVICE_DESCRIPTION"]).default("PROCEDURE_CODE"),
        triggerCodes: z.array(z.string()).default([]),
        complicationRule: z.enum(["EXCLUDED_BILL_SEPARATELY", "INCLUDED", "ESCALATE"]).default("EXCLUDED_BILL_SEPARATELY"),
        unbundlingAllowed: z.boolean().default(false),
        packageOverridesLineItems: z.boolean().default(true),
        losAssumptionDays: z.number().int().optional(),
        losCapDays: z.number().int().optional(),
        components: z.array(z.object({ type: z.enum(["INCLUDED", "EXCLUDED"]), description: z.string(), code: z.string().optional(), qtyCap: z.number().int().optional() })).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertContract(ctx.tenantId, input.contractId);
      const { components, packagePrice, ...rest } = input;
      return prisma.contractPackage.create({
        data: {
          tenantId: ctx.tenantId,
          ...rest,
          packagePrice,
          components: { create: components },
        },
        include: { components: true },
      });
    }),

  deactivatePackage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.contractPackage.update({ where: { id: input.id }, data: { isActive: false } })),

  // ── Pre-auth rules (§5.10) ──
  createPreauthRule: protectedProcedure
    .input(
      z.object({
        contractId: z.string(),
        scope: scopeEnum.default("CONTRACT"),
        serviceCategoryId: z.string().optional(),
        tariffLineId: z.string().optional(),
        packageId: z.string().optional(),
        triggerType: z.enum(["SERVICE_LIST", "AMOUNT_THRESHOLD", "ADMISSION", "LOS_BEYOND", "ALWAYS"]).default("ALWAYS"),
        thresholdAmount: z.number().optional(),
        serviceRefs: z.array(z.string()).default([]),
        admissionRequired: z.boolean().default(false),
        emergencyExempt: z.boolean().default(false),
        retrospectiveAllowed: z.boolean().default(false),
        retrospectiveWindowHours: z.number().int().optional(),
        approvalSlaHours: z.number().int().optional(),
        validityDays: z.number().int().optional(),
        requiredDocumentTypes: z.array(z.string()).default([]),
        consequenceIfMissing: z.enum(["REJECT", "ROUTE_MANUAL", "PAY_WITH_PENALTY"]).default("ROUTE_MANUAL"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertContract(ctx.tenantId, input.contractId);
      return prisma.preauthRule.create({ data: { tenantId: ctx.tenantId, ...input } });
    }),

  deactivatePreauthRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.preauthRule.update({ where: { id: input.id }, data: { isActive: false } })),

  // ── Documentation rules (§5.11) ──
  createDocumentationRule: protectedProcedure
    .input(
      z.object({
        contractId: z.string(),
        scope: scopeEnum.default("CONTRACT"),
        serviceCategoryId: z.string().optional(),
        documentType: z.enum([
          "INVOICE", "ITEMISED_BILL", "CLAIM_FORM", "PRESCRIPTION", "LAB_REQUEST", "LAB_RESULT",
          "DOCTOR_NOTES", "DISCHARGE_SUMMARY", "CARE_PLAN", "MEDICAL_REPORT", "REFERRAL_LETTER",
          "PREAUTH_APPROVAL", "THEATRE_NOTES", "DELIVERY_NOTES", "IMAGING_REPORT", "RADIOLOGY_REPORT_STRUCTURED", "OTHER",
        ]),
        mandatory: z.boolean().default(true),
        appliesWhen: z.record(z.string(), z.unknown()).optional(),
        consequenceIfMissing: z.enum(["REJECT", "ROUTE", "PEND_PROVIDER"]).default("ROUTE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertContract(ctx.tenantId, input.contractId);
      return prisma.documentationRule.create({ data: { tenantId: ctx.tenantId, ...input, appliesWhen: input.appliesWhen as never } });
    }),

  deactivateDocumentationRule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.documentationRule.update({ where: { id: input.id }, data: { isActive: false } })),

  // ── Exclusions (§5.9, generalised) ──
  createExclusion: protectedProcedure
    .input(
      z.object({
        contractId: z.string(),
        serviceName: z.string().min(1),
        cptCode: z.string().optional(),
        reason: z.string().optional(),
        level: z.enum(["CONTRACT", "CATEGORY", "TARIFF_LINE", "DIAGNOSIS", "PLAN", "MEMBER_CATEGORY", "DATE_RANGE"]).default("TARIFF_LINE"),
        serviceCategoryId: z.string().optional(),
        icdCodes: z.array(z.string()).default([]),
        memberCategory: z.string().optional(),
        dateFrom: z.string().optional(),
        dateTo: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertContract(ctx.tenantId, input.contractId);
      const { dateFrom, dateTo, ...rest } = input;
      return prisma.providerContractExclusion.create({
        data: { ...rest, dateFrom: dateFrom ? new Date(dateFrom) : null, dateTo: dateTo ? new Date(dateTo) : null },
      });
    }),

  deleteExclusion: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.providerContractExclusion.delete({ where: { id: input.id } })),
});
