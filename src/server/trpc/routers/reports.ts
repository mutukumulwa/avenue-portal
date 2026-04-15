import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

const dateRangeInput = z.object({
  from: z.string(),
  to: z.string(),
});

export const reportsRouter = createTRPCRouter({
  // 1. Claims Summary
  claimsSummary: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const claims = await prisma.claim.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: new Date(input.from), lte: new Date(input.to) },
        },
        select: {
          status: true,
          billedAmount: true,
          approvedAmount: true,
          paidAmount: true,
          serviceType: true,
          benefitCategory: true,
          createdAt: true,
        },
      });

      const totalBilled = claims.reduce((s, c) => s + Number(c.billedAmount), 0);
      const totalApproved = claims.reduce((s, c) => s + Number(c.approvedAmount), 0);
      const totalPaid = claims.reduce((s, c) => s + Number(c.paidAmount), 0);
      const lossRatio = totalBilled > 0 ? (totalApproved / totalBilled) * 100 : 0;

      const byStatus = claims.reduce<Record<string, number>>((acc, c) => {
        acc[c.status] = (acc[c.status] ?? 0) + 1;
        return acc;
      }, {});

      const byCategory = claims.reduce<Record<string, number>>((acc, c) => {
        acc[c.benefitCategory] = (acc[c.benefitCategory] ?? 0) + Number(c.billedAmount);
        return acc;
      }, {});

      return { totalClaims: claims.length, totalBilled, totalApproved, totalPaid, lossRatio, byStatus, byCategory, claims };
    }),

  // 2. Membership Report
  membershipReport: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const [members, groups] = await Promise.all([
        prisma.member.findMany({
          where: { tenantId: ctx.tenantId },
          select: { status: true, relationship: true, enrollmentDate: true, group: { select: { name: true } } },
        }),
        prisma.group.findMany({
          where: { tenantId: ctx.tenantId },
          include: { _count: { select: { members: true } } },
        }),
      ]);

      const _ = input; // date range for future filtering
      const byStatus = members.reduce<Record<string, number>>((acc, m) => {
        acc[m.status] = (acc[m.status] ?? 0) + 1;
        return acc;
      }, {});

      return {
        totalMembers: members.length,
        activeMembers: members.filter((m) => m.status === "ACTIVE").length,
        byStatus,
        groupBreakdown: groups.map((g) => ({ name: g.name, memberCount: g._count.members, status: g.status })),
      };
    }),

  // 3. Pre-Auth Report
  preauthReport: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const preauths = await prisma.preAuthorization.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: new Date(input.from), lte: new Date(input.to) },
        },
        include: { provider: { select: { name: true, type: true } } },
      });

      const byStatus = preauths.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] ?? 0) + 1;
        return acc;
      }, {});

      const totalEstimated = preauths.reduce((s, p) => s + Number(p.estimatedCost), 0);
      const totalApproved = preauths.reduce((s, p) => s + Number(p.approvedAmount ?? 0), 0);
      const approvalRate = preauths.length > 0 ? (byStatus["APPROVED"] ?? 0) / preauths.length * 100 : 0;

      return { total: preauths.length, byStatus, totalEstimated, totalApproved, approvalRate, preauths };
    }),

  // 4. Billing / Collections Report
  billingReport: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const invoices = await prisma.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: new Date(input.from), lte: new Date(input.to) },
        },
        include: { group: { select: { name: true } } },
      });

      const byStatus = invoices.reduce<Record<string, number>>((acc, i) => {
        acc[i.status] = (acc[i.status] ?? 0) + 1;
        return acc;
      }, {});

      const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
      const totalCollected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
      const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

      return { total: invoices.length, totalBilled, totalCollected, collectionRate, byStatus, invoices };
    }),

  // 5. Utilization Report
  utilizationReport: protectedProcedure
    .input(dateRangeInput.extend({ groupId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const usages = await prisma.benefitUsage.findMany({
        where: {
          member: { tenantId: ctx.tenantId, ...(input.groupId ? { groupId: input.groupId } : {}) },
        },
        include: {
          member: { select: { firstName: true, lastName: true, memberNumber: true } },
          benefitConfig: { select: { category: true, annualSubLimit: true } },
        },
      });

      const byCategory = usages.reduce<Record<string, { used: number; limit: number }>>((acc, u) => {
        const cat = u.benefitConfig.category;
        if (!acc[cat]) acc[cat] = { used: 0, limit: 0 };
        acc[cat].used += Number(u.amountUsed);
        acc[cat].limit += Number(u.benefitConfig.annualSubLimit);
        return acc;
      }, {});

      return { byCategory, usages };
    }),

  // 6. Endorsement Report
  endorsementReport: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const endorsements = await prisma.endorsement.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: new Date(input.from), lte: new Date(input.to) },
        },
        include: { group: { select: { name: true } } },
      });

      const byType = endorsements.reduce<Record<string, number>>((acc, e) => {
        acc[e.type] = (acc[e.type] ?? 0) + 1;
        return acc;
      }, {});

      const totalFinancialImpact = endorsements.reduce((s, e) => s + Number(e.premiumDelta ?? 0), 0);

      return { total: endorsements.length, byType, totalFinancialImpact, endorsements };
    }),

  // 7. Quotation Pipeline Report
  quotationReport: protectedProcedure
    .input(dateRangeInput)
    .query(async ({ ctx, input }) => {
      const quotations = await prisma.quotation.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: new Date(input.from), lte: new Date(input.to) },
        },
        include: { broker: { select: { name: true } } },
      });

      const byStatus = quotations.reduce<Record<string, number>>((acc, q) => {
        acc[q.status] = (acc[q.status] ?? 0) + 1;
        return acc;
      }, {});

      const conversionRate = quotations.length > 0 ? ((byStatus["ACCEPTED"] ?? 0) / quotations.length) * 100 : 0;
      const avgPremium = quotations.length > 0 ? quotations.reduce((s, q) => s + Number(q.finalPremium), 0) / quotations.length : 0;

      return { total: quotations.length, byStatus, conversionRate, avgPremium, quotations };
    }),
});
