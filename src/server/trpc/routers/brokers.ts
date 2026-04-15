import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const brokersRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return prisma.broker.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        _count: { select: { groups: true, commissions: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.broker.findUnique({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          groups: {
            include: { package: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
          },
          commissions: { orderBy: { period: "desc" }, take: 24 },
          _count: { select: { groups: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        contactPerson: z.string().min(1),
        phone: z.string().min(1),
        email: z.string().email(),
        address: z.string().optional(),
        licenseNumber: z.string().optional(),
        firstYearCommissionPct: z.number().min(0).max(100).default(0),
        renewalCommissionPct: z.number().min(0).max(100).default(0),
        flatFeePerMember: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.broker.create({
        data: { ...input, tenantId: ctx.tenantId },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        contactPerson: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email().optional(),
        address: z.string().optional(),
        licenseNumber: z.string().optional(),
        status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
        firstYearCommissionPct: z.number().min(0).max(100).optional(),
        renewalCommissionPct: z.number().min(0).max(100).optional(),
        flatFeePerMember: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return prisma.broker.update({ where: { id, tenantId: ctx.tenantId }, data });
    }),

  // ─── COMMISSIONS ─────────────────────────────────────────
  getCommissions: protectedProcedure
    .input(z.object({ brokerId: z.string().optional(), period: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return prisma.commission.findMany({
        where: {
          broker: { tenantId: ctx.tenantId },
          ...(input.brokerId ? { brokerId: input.brokerId } : {}),
          ...(input.period ? { period: input.period } : {}),
        },
        include: { broker: { select: { id: true, name: true } } },
        orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      });
    }),

  approveCommission: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      return prisma.commission.update({
        where: { id: input.id },
        data: { paymentStatus: "APPROVED" },
      });
    }),

  markCommissionPaid: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        paymentReference: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return prisma.commission.update({
        where: { id: input.id },
        data: { paymentStatus: "PAID", paidAt: new Date(), paymentReference: input.paymentReference },
      });
    }),
});
