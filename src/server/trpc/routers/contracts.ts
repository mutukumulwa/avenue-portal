import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";
import { ProviderContractsService } from "@/server/services/provider-contracts.service";
import type { Prisma } from "@prisma/client";

// Zod mirrors of the Prisma enums (kept local to avoid importing enum values at
// the router boundary; validated against the DB type on write).
const contractTypeEnum = z.enum([
  "MASTER_SERVICE_AGREEMENT",
  "RATE_SCHEDULE",
  "PACKAGE_AGREEMENT",
  "CASE_RATE_AGREEMENT",
  "RECONCILIATION_AGREEMENT",
  "ADDENDUM",
  "GOVERNMENT_SCHEME_CONTRACT",
]);
const statusEnum = z.enum([
  "DRAFT", "UNDER_REVIEW", "PENDING_CLARIFICATION", "APPROVED", "ACTIVE",
  "SUSPENDED", "EXPIRED", "TERMINATED", "SUPERSEDED", "ARCHIVED",
]);
const branchScopeEnum = z.enum(["ALL_BRANCHES", "LISTED"]);
const executionStatusEnum = z.enum(["FULLY_EXECUTED", "PROVIDER_ONLY", "UNSIGNED"]);
const paymentTermTypeEnum = z.enum(["CALENDAR", "BUSINESS"]);
const submissionBasisEnum = z.enum(["SERVICE_DATE", "DISCHARGE_DATE", "INVOICE_DATE", "MONTHLY_BATCH"]);
const balanceBillingEnum = z.enum(["PROHIBITED", "ALLOWED_NONCOVERED_WITH_CONSENT", "ALLOWED"]);
const taxInclusivityEnum = z.enum(["INCLUSIVE", "EXCLUSIVE", "UNKNOWN"]);
const reconciliationEnum = z.enum(["NONE", "MONTHLY", "QUARTERLY", "BIANNUAL"]);
const unlistedRuleEnum = z.enum(["PAY_AS_BILLED", "DISCOUNT_OFF_BILLED", "REFER_FOR_REVIEW", "REJECT"]);

export const contractsRouter = createTRPCRouter({
  // ── List (spec §11.1) ──────────────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: statusEnum.optional(),
        contractType: contractTypeEnum.optional(),
        providerId: z.string().optional(),
        clientId: z.string().optional(),
        expiringWithinDays: z.number().int().positive().optional(),
        reviewDue: z.boolean().optional(),
        search: z.string().optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.ProviderContractWhereInput = { tenantId: ctx.tenantId };
      if (input?.status) where.status = input.status;
      if (input?.contractType) where.contractType = input.contractType;
      if (input?.providerId) where.providerId = input.providerId;
      if (input?.clientId) where.applicability = { some: { clientId: input.clientId } };
      if (input?.expiringWithinDays) {
        const horizon = new Date();
        horizon.setDate(horizon.getDate() + input.expiringWithinDays);
        where.endDate = { gte: new Date(), lte: horizon };
      }
      if (input?.reviewDue) where.reviewDueDate = { lte: new Date() };
      if (input?.search) {
        where.OR = [
          { contractNumber: { contains: input.search, mode: "insensitive" } },
          { title: { contains: input.search, mode: "insensitive" } },
          { externalContractRef: { contains: input.search, mode: "insensitive" } },
        ];
      }
      return prisma.providerContract.findMany({
        where,
        include: {
          provider: { select: { id: true, name: true } },
          _count: { select: { tariffLines: true, applicability: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
    }),

  // ── Detail (spec §11.2) ─────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.providerContract.findUnique({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          provider: { select: { id: true, name: true, legalName: true } },
          parentContract: { select: { id: true, contractNumber: true, title: true } },
          children: { select: { id: true, contractNumber: true, title: true, contractType: true, status: true } },
          applicability: { where: { isActive: true }, include: { client: { select: { id: true, name: true } } } },
          contractBranches: { include: { branch: { select: { id: true, name: true } } } },
          sourceDocuments: true,
          versions: { orderBy: { versionNumber: "desc" } },
          tariffLines: { where: { isActive: true }, orderBy: { effectiveFrom: "desc" } },
          _count: { select: { tariffLines: true, claims: true } },
        },
      });
    }),

  // ── Create draft (spec §4.1 / §20 minimum viable) ───────────────────────
  create: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        title: z.string().min(1),
        contractType: contractTypeEnum.default("RATE_SCHEDULE"),
        startDate: z.string(),
        endDate: z.string(),
        reviewDueDate: z.string().optional(),
        branchScope: branchScopeEnum.default("ALL_BRANCHES"),
        parentContractId: z.string().optional(),
        parentDigitised: z.boolean().default(true),
        externalContractRef: z.string().optional(),
        currency: z.string().default("KES"),
        executionStatus: executionStatusEnum.default("UNSIGNED"),
        paymentTermDays: z.number().int().nonnegative().default(30),
        paymentTermType: paymentTermTypeEnum.default("CALENDAR"),
        submissionWindowDays: z.number().int().positive().optional(),
        submissionWindowBasis: submissionBasisEnum.optional(),
        balanceBillingPolicy: balanceBillingEnum.optional(),
        taxInclusive: taxInclusivityEnum.default("UNKNOWN"),
        reconciliationCadence: reconciliationEnum.default("NONE"),
        unlistedServiceRule: unlistedRuleEnum.default("REFER_FOR_REVIEW"),
        unlistedDiscountPct: z.number().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contractNumber = await ProviderContractsService.nextContractNumber(ctx.tenantId);
      return prisma.providerContract.create({
        data: {
          tenantId: ctx.tenantId,
          providerId: input.providerId,
          contractNumber,
          title: input.title,
          contractType: input.contractType,
          status: "DRAFT",
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          reviewDueDate: input.reviewDueDate ? new Date(input.reviewDueDate) : null,
          branchScope: input.branchScope,
          parentContractId: input.parentContractId,
          parentDigitised: input.parentDigitised,
          externalContractRef: input.externalContractRef,
          currency: input.currency,
          executionStatus: input.executionStatus,
          paymentTermDays: input.paymentTermDays,
          paymentTermType: input.paymentTermType,
          submissionWindowDays: input.submissionWindowDays,
          submissionWindowBasis: input.submissionWindowBasis,
          balanceBillingPolicy: input.balanceBillingPolicy,
          taxInclusive: input.taxInclusive,
          reconciliationCadence: input.reconciliationCadence,
          unlistedServiceRule: input.unlistedServiceRule,
          unlistedDiscountPct: input.unlistedDiscountPct,
          notes: input.notes,
          createdById: ctx.session.user.id,
          contractOwnerId: ctx.session.user.id,
        },
      });
    }),

  // ── Update draft metadata ───────────────────────────────────────────────
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        contractType: contractTypeEnum.optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        reviewDueDate: z.string().nullable().optional(),
        branchScope: branchScopeEnum.optional(),
        externalContractRef: z.string().optional(),
        currency: z.string().optional(),
        executionStatus: executionStatusEnum.optional(),
        signatories: z.array(z.object({ party: z.string(), name: z.string(), designation: z.string().optional(), date: z.string().optional() })).optional(),
        paymentTermDays: z.number().int().nonnegative().optional(),
        paymentTermType: paymentTermTypeEnum.optional(),
        submissionWindowDays: z.number().int().positive().nullable().optional(),
        submissionWindowBasis: submissionBasisEnum.optional(),
        balanceBillingPolicy: balanceBillingEnum.optional(),
        taxInclusive: taxInclusivityEnum.optional(),
        reconciliationCadence: reconciliationEnum.optional(),
        unlistedServiceRule: unlistedRuleEnum.optional(),
        unlistedDiscountPct: z.number().nullable().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, startDate, endDate, reviewDueDate, signatories, ...rest } = input;
      const existing = await prisma.providerContract.findUnique({ where: { id, tenantId: ctx.tenantId } });
      if (!existing) throw new Error("Contract not found");
      if (!["DRAFT", "PENDING_CLARIFICATION"].includes(existing.status)) {
        throw new Error("Only DRAFT or PENDING_CLARIFICATION contracts can be edited directly. Amend an active contract to create a new version.");
      }
      return prisma.providerContract.update({
        where: { id },
        data: {
          ...rest,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          reviewDueDate: reviewDueDate === undefined ? undefined : reviewDueDate ? new Date(reviewDueDate) : null,
          signatories: signatories ? (signatories as never) : undefined,
        },
      });
    }),

  // ── Validation report (spec §13) ────────────────────────────────────────
  validate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => ContractLifecycleService.validate(ctx.tenantId, input.id)),

  // ── Lifecycle transitions (spec §4.2) ───────────────────────────────────
  submitForReview: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.submitForReview(ctx.tenantId, input.id, ctx.session.user.id)),

  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.approve(ctx.tenantId, input.id, ctx.session.user.id)),

  requestClarification: protectedProcedure
    .input(z.object({ id: z.string(), comment: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.requestClarification(ctx.tenantId, input.id, ctx.session.user.id, input.comment)),

  returnToDraft: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.returnToDraft(ctx.tenantId, input.id, ctx.session.user.id, input.reason)),

  activate: protectedProcedure
    .input(z.object({ id: z.string(), allowUnsigned: z.boolean().optional(), backdateOverrideId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.activate(ctx.tenantId, input.id, ctx.session.user.id, { allowUnsigned: input.allowUnsigned, backdateOverrideId: input.backdateOverrideId })),

  suspend: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.suspend(ctx.tenantId, input.id, ctx.session.user.id, input.reason)),

  reinstate: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.reinstate(ctx.tenantId, input.id, ctx.session.user.id, input.reason)),

  terminate: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.terminate(ctx.tenantId, input.id, ctx.session.user.id, input.reason)),

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => ContractLifecycleService.archive(ctx.tenantId, input.id, ctx.session.user.id)),

  // ── Applicability (spec §5.4) ───────────────────────────────────────────
  addApplicability: protectedProcedure
    .input(
      z.object({
        contractId: z.string(),
        clientId: z.string(),
        groupId: z.string().optional(),
        packageId: z.string().optional(),
        packageVersionId: z.string().optional(),
        benefitCategory: z.string().optional(),
        memberCategory: z.string().optional(),
        inclusionType: z.enum(["INCLUDE", "EXCLUDE"]).default("INCLUDE"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const contract = await prisma.providerContract.findUnique({ where: { id: input.contractId, tenantId: ctx.tenantId } });
      if (!contract) throw new Error("Contract not found");
      return prisma.contractApplicability.create({
        data: {
          contractId: input.contractId,
          clientId: input.clientId,
          groupId: input.groupId,
          packageId: input.packageId,
          packageVersionId: input.packageVersionId,
          benefitCategory: input.benefitCategory as never,
          memberCategory: input.memberCategory,
          inclusionType: input.inclusionType,
        },
      });
    }),

  removeApplicability: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.contractApplicability.update({ where: { id: input.id }, data: { isActive: false } })),

  // ── Branch coverage for LISTED contracts (spec §5.1) ────────────────────
  addContractBranch: protectedProcedure
    .input(z.object({ contractId: z.string(), branchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await prisma.providerContract.findUnique({ where: { id: input.contractId, tenantId: ctx.tenantId } });
      if (!contract) throw new Error("Contract not found");
      return prisma.contractBranch.create({ data: { contractId: input.contractId, branchId: input.branchId } });
    }),

  removeContractBranch: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => prisma.contractBranch.delete({ where: { id: input.id } })),

  // ── Source documents (spec §3.2) ────────────────────────────────────────
  addSourceDocument: protectedProcedure
    .input(z.object({ contractId: z.string(), fileUrl: z.string().optional(), fileName: z.string().optional(), documentId: z.string().optional(), sourceRole: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const contract = await prisma.providerContract.findUnique({ where: { id: input.contractId, tenantId: ctx.tenantId } });
      if (!contract) throw new Error("Contract not found");
      return prisma.contractSourceDocument.create({
        data: {
          tenantId: ctx.tenantId,
          contractId: input.contractId,
          fileUrl: input.fileUrl,
          fileName: input.fileName,
          documentId: input.documentId,
          sourceRole: input.sourceRole,
          uploadedById: ctx.session.user.id,
        },
      });
    }),

  // ── Intake pre-check (engine stages 1–2, spec §8.1) ─────────────────────
  precheck: protectedProcedure
    .input(z.object({ providerId: z.string(), providerBranchId: z.string().optional(), clientId: z.string().optional(), pricingDate: z.string() }))
    .query(async ({ ctx, input }) =>
      ContractLifecycleService.precheck({
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        providerBranchId: input.providerBranchId,
        clientId: input.clientId,
        pricingDate: new Date(input.pricingDate),
      }),
    ),
});
