import { z } from "zod";
import Decimal from "decimal.js";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, underwritingProcedure, adminProcedure } from "../trpc";
import { CoContributionService } from "@/server/services/coContribution/coContribution.service";
import {
  capsBaseSchema,
  capsRefinement,
  coContributionRuleBaseSchema,
  coContributionRuleRefinement,
  CO_CONTRIBUTION_TYPES,
} from "@/lib/validation/co-contribution";
import { money, percent } from "@/lib/validation/money";
import { prisma } from "@/lib/prisma";

export const coContributionRouter = createTRPCRouter({
  // ─── Rules management ───────────────────────────────────────────────────────

  listRules: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(({ input }) => {
      return prisma.coContributionRule.findMany({
        where: { packageId: input.packageId },
        orderBy: [{ benefitCategory: "asc" }, { networkTier: "asc" }],
      });
    }),

  // Same canonical rule validation as the server action (SP-1): percent 0–100,
  // money finite/≥0/≤2dp, and the type↔amount cross-field rule.
  createRule: underwritingProcedure
    .input(
      coContributionRuleBaseSchema
        .extend({
          packageId: z.string().min(1),
          perEncounterCap: money.positive().nullable().optional(),
          effectiveFrom: z.string().optional(),
          effectiveTo: z.string().optional(),
        })
        .superRefine(coContributionRuleRefinement),
    )
    .mutation(async ({ ctx, input }) => {
      const { effectiveFrom, effectiveTo, benefitCategory, ...rest } = input;
      return prisma.coContributionRule.create({
        data: {
          ...rest,
          tenantId: ctx.tenantId,
          benefitCategory: (benefitCategory as never) ?? null,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
          effectiveTo: effectiveTo ? new Date(effectiveTo) : null,
        },
      });
    }),

  updateRule: underwritingProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(CO_CONTRIBUTION_TYPES).optional(),
        fixedAmount: money.nullable().optional(),
        percentage: percent.nullable().optional(),
        perVisitCap: money.positive().nullable().optional(),
        perEncounterCap: money.positive().nullable().optional(),
        isActive: z.boolean().optional(),
        effectiveTo: z.string().optional().nullable(),
      }),
    )
    .mutation(({ input: { id, effectiveTo, ...rest } }) => {
      return prisma.coContributionRule.update({
        where: { id },
        data: {
          ...rest,
          effectiveTo: effectiveTo ? new Date(effectiveTo) : undefined,
        },
      });
    }),

  // ─── Annual cap configuration ────────────────────────────────────────────────

  getCap: protectedProcedure
    .input(z.object({ packageId: z.string() }))
    .query(({ input }) => {
      return prisma.annualCoContributionCap.findUnique({
        where: { packageId: input.packageId },
      });
    }),

  // Uses the SAME canonical caps validation as the server action (SP-1): the
  // base object extended with packageId, then the shared cross-field refinement
  // re-attached (a superRefined schema is a ZodEffects with no `.extend()`).
  // This closes the second, independently-reachable write path from DEF-027.
  upsertCap: underwritingProcedure
    .input(
      capsBaseSchema
        .extend({ packageId: z.string().min(1) })
        .superRefine(capsRefinement),
    )
    .mutation(async ({ ctx, input }) => {
      // Tenant-ownership: never upsert against a packageId the caller's tenant
      // does not own (input ids are client-supplied). Non-enumerating NOT_FOUND.
      const pkg = await prisma.package.findFirst({
        where: { id: input.packageId, tenantId: ctx.session.user.tenantId },
        select: { id: true },
      });
      if (!pkg) throw new TRPCError({ code: "NOT_FOUND", message: "Package not found." });

      return prisma.annualCoContributionCap.upsert({
        where: { packageId: input.packageId },
        update: { individualCap: input.individualCap, familyCap: input.familyCap },
        create: {
          packageId: input.packageId,
          tenantId: ctx.session.user.tenantId,
          individualCap: input.individualCap,
          familyCap: input.familyCap,
        },
      });
    }),

  // ─── Claim co-contribution processing ───────────────────────────────────────

  processForClaim: adminProcedure
    .input(z.object({ claimId: z.string() }))
    .mutation(({ input }) => {
      return CoContributionService.processClaimCoContribution(input.claimId);
    }),

  getForClaim: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(({ input }) => {
      return prisma.coContributionTransaction.findUnique({
        where: { claimId: input.claimId },
        include: { coContributionRule: true },
      });
    }),

  recordCollection: adminProcedure
    .input(
      z.object({
        transactionId: z.string(),
        amountCollected: z.number(),
        paymentMethod: z.enum(["CASH", "MPESA", "CARD", "BANK_TRANSFER", "OFFSET"]),
        mpesaRef: z.string().optional(),
      }),
    )
    .mutation(({ input }) => {
      return CoContributionService.recordCollection(
        input.transactionId,
        new Decimal(input.amountCollected),
        input.paymentMethod,
        input.mpesaRef,
      );
    }),

  waive: adminProcedure
    .input(
      z.object({
        transactionId: z.string(),
        reason: z.string().min(10),
        approvedBy: z.string(),
      }),
    )
    .mutation(({ input }) => {
      return CoContributionService.waiveCoContribution(
        input.transactionId,
        input.reason,
        input.approvedBy,
      );
    }),

  // ─── Member / family annual summary ─────────────────────────────────────────

  getMemberAnnualSummary: protectedProcedure
    .input(z.object({ memberId: z.string(), year: z.number().int() }))
    .query(({ input }) => {
      return prisma.memberAnnualCoContribution.findUnique({
        where: { memberId_membershipYear: { memberId: input.memberId, membershipYear: input.year } },
      });
    }),

  getFamilyAnnualSummary: protectedProcedure
    .input(z.object({ principalMemberId: z.string(), year: z.number().int() }))
    .query(({ input }) => {
      return prisma.familyAnnualCoContribution.findUnique({
        where: {
          principalMemberId_membershipYear: {
            principalMemberId: input.principalMemberId,
            membershipYear: input.year,
          },
        },
      });
    }),

  getMemberTransactions: protectedProcedure
    .input(z.object({ memberId: z.string() }))
    .query(({ input }) => {
      return prisma.coContributionTransaction.findMany({
        where: { memberId: input.memberId },
        include: { claim: { select: { claimNumber: true, dateOfService: true } } },
        orderBy: { createdAt: "desc" },
      });
    }),
});
