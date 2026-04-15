import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

export const settingsRouter = createTRPCRouter({
  // ─── TENANT ──────────────────────────────────────────────
  getTenant: protectedProcedure.query(async ({ ctx }) => {
    return prisma.tenant.findUnique({ where: { id: ctx.tenantId } });
  }),

  updateTenant: protectedProcedure
    .input(
      z.object({
        name: z.string().optional(),
        logoUrl: z.string().optional(),
        primaryColor: z.string().optional(),
        accentColor: z.string().optional(),
        warmColor: z.string().optional(),
        fontHeading: z.string().optional(),
        fontBody: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.tenant.update({ where: { id: ctx.tenantId }, data: input });
    }),

  // ─── USERS ───────────────────────────────────────────────
  getUsers: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }),

  updateUserRole: protectedProcedure
    .input(
      z.object({
        userId: z.string(),
        role: z.enum([
          "SUPER_ADMIN",
          "CLAIMS_OFFICER",
          "FINANCE_OFFICER",
          "UNDERWRITER",
          "CUSTOMER_SERVICE",
          "MEDICAL_OFFICER",
          "REPORTS_VIEWER",
          "BROKER_USER",
          "MEMBER_USER",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.user.update({
        where: { id: input.userId, tenantId: ctx.tenantId },
        data: { role: input.role },
      });
    }),

  toggleUserActive: protectedProcedure
    .input(z.object({ userId: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return prisma.user.update({
        where: { id: input.userId, tenantId: ctx.tenantId },
        data: { isActive: input.isActive },
      });
    }),

  // ─── NOTIFICATION TEMPLATES ──────────────────────────────
  getNotificationTemplates: protectedProcedure.query(async ({ ctx }) => {
    return prisma.notificationTemplate.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { name: "asc" },
    });
  }),

  upsertNotificationTemplate: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        type: z.string().min(1),
        channel: z.enum(["EMAIL", "SMS", "BOTH"]),
        subject: z.string().optional(),
        bodyTemplate: z.string().min(1),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        return prisma.notificationTemplate.update({
          where: { id: input.id },
          data: input,
        });
      }
      return prisma.notificationTemplate.create({
        data: { ...input, tenantId: ctx.tenantId },
      });
    }),

  // ─── INTEGRATIONS ────────────────────────────────────────
  getIntegrations: protectedProcedure.query(async ({ ctx }) => {
    return prisma.integrationConfig.findMany({
      where: { tenantId: ctx.tenantId },
    });
  }),

  upsertIntegration: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["SMART", "SLADE360", "HMS", "SHA", "ERP"]),
        isEnabled: z.boolean(),
        apiBaseUrl: z.string().optional(),
        apiKey: z.string().optional(),
        apiSecret: z.string().optional(),
        config: z.any().default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return prisma.integrationConfig.upsert({
        where: { tenantId_provider: { tenantId: ctx.tenantId, provider: input.provider } },
        update: input,
        create: { ...input, tenantId: ctx.tenantId },
      });
    }),
});
