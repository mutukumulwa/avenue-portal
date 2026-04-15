import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const billingRouter = createTRPCRouter({
  // ─── INVOICES ────────────────────────────────────────────
  getInvoices: protectedProcedure
    .input(z.object({ status: z.string().optional(), groupId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return prisma.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input.status ? { status: input.status as never } : {}),
          ...(input.groupId ? { groupId: input.groupId } : {}),
        },
        include: {
          group: { select: { id: true, name: true, contactPersonEmail: true } },
          _count: { select: { payments: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  getInvoiceById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return prisma.invoice.findUnique({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          group: { include: { package: true } },
          payments: { orderBy: { paymentDate: "desc" } },
        },
      });
    }),

  createInvoice: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        period: z.string(), // "2025-03"
        memberCount: z.number().int().positive(),
        ratePerMember: z.number().positive(),
        dueDate: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const count = await prisma.invoice.count({ where: { tenantId: ctx.tenantId } });
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;
      const totalAmount = input.memberCount * input.ratePerMember;

      return prisma.invoice.create({
        data: {
          tenantId: ctx.tenantId,
          invoiceNumber,
          groupId: input.groupId,
          period: input.period,
          memberCount: input.memberCount,
          ratePerMember: input.ratePerMember,
          totalAmount,
          paidAmount: 0,
          balance: totalAmount,
          dueDate: new Date(input.dueDate),
          notes: input.notes,
          status: "DRAFT",
        },
      });
    }),

  sendInvoice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.invoice.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { status: "SENT", sentAt: new Date() },
      });
    }),

  voidInvoice: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.invoice.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { status: "VOID" },
      });
    }),

  // ─── PAYMENTS ────────────────────────────────────────────
  recordPayment: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        invoiceId: z.string().optional(),
        amount: z.number().positive(),
        paymentDate: z.string(),
        paymentMethod: z.enum(["BANK_TRANSFER", "CHEQUE", "MPESA", "CARD"]),
        referenceNumber: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const payment = await prisma.payment.create({
        data: {
          groupId: input.groupId,
          invoiceId: input.invoiceId,
          amount: input.amount,
          paymentDate: new Date(input.paymentDate),
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber,
          notes: input.notes,
        },
      });

      // Update invoice balance if linked
      if (input.invoiceId) {
        const invoice = await prisma.invoice.findUnique({ where: { id: input.invoiceId } });
        if (invoice) {
          const newPaid = Number(invoice.paidAmount) + input.amount;
          const newBalance = Number(invoice.totalAmount) - newPaid;
          const newStatus =
            newBalance <= 0
              ? "PAID"
              : newPaid > 0
              ? "PARTIALLY_PAID"
              : invoice.status;

          await prisma.invoice.update({
            where: { id: input.invoiceId },
            data: { paidAmount: newPaid, balance: Math.max(0, newBalance), status: newStatus as never },
          });
        }
      }

      return payment;
    }),

  getPaymentVouchers: protectedProcedure.query(async () => {
    return prisma.paymentVoucher.findMany({
      orderBy: { createdAt: "desc" },
    });
  }),

  // ─── SUMMARY STATS ───────────────────────────────────────
  getSummary: protectedProcedure.query(async ({ ctx }) => {
    const [invoices, overdueInvoices] = await Promise.all([
      prisma.invoice.findMany({
        where: { tenantId: ctx.tenantId },
        select: { status: true, totalAmount: true, paidAmount: true, balance: true, dueDate: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["SENT", "PARTIALLY_PAID"] },
          dueDate: { lt: new Date() },
        },
        select: { balance: true },
      }),
    ]);

    const totalBilled = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
    const totalCollected = invoices.reduce((s, i) => s + Number(i.paidAmount), 0);
    const totalOutstanding = invoices
      .filter((i) => ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(i.status))
      .reduce((s, i) => s + Number(i.balance), 0);
    const totalOverdue = overdueInvoices.reduce((s, i) => s + Number(i.balance), 0);

    return { totalBilled, totalCollected, totalOutstanding, totalOverdue };
  }),
});
