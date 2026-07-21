import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { CommissionService } from "@/server/services/commission.service";

const staffRoles = ["SUPER_ADMIN", "FINANCE_OFFICER", "UNDERWRITER", "CUSTOMER_SERVICE"] as const;
const brokerTypes = ["MASTER_BROKER", "SUB_AGENT", "TIED_AGENT", "INDIVIDUAL_PRODUCER", "BANCASSURANCE"] as const;
const intermediaryCategories = ["REGULATED_BROKER", "REGULATED_AGENT", "INTRODUCER", "REFERRAL_PARTNER", "INTERNAL_SALES", "CORPORATE_AFFINITY", "BANCASSURANCE", "OTHER"] as const;
const commissionBases = ["COMMISSION", "REFERRAL_FEE", "ATTRIBUTION_ONLY", "NONE"] as const;
const kycDocumentTypes = ["IRA_LICENSE", "KRA_PIN_CERTIFICATE", "CR12", "PROFESSIONAL_INDEMNITY", "BANK_CONFIRMATION", "DIRECTORS_ID", "TAX_COMPLIANCE_CERTIFICATE", "ENGAGEMENT_LETTER", "REFERRAL_AGREEMENT", "OTHER"] as const;

function requireStaff(role?: string | null) {
  if (!role || !staffRoles.includes(role as (typeof staffRoles)[number])) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function requireSuperAdmin(role?: string | null) {
  if (role !== "SUPER_ADMIN") throw new TRPCError({ code: "FORBIDDEN" });
}

export const brokersRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      brokerType: z.enum(brokerTypes).optional(),
      intermediaryCategory: z.enum(intermediaryCategories).optional(),
      search: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      const q = input?.search?.trim();
      return prisma.broker.findMany({
        where: {
          tenantId: ctx.tenantId,
          ...(input?.status ? { status: input.status } : {}),
          ...(input?.brokerType ? { brokerType: input.brokerType } : {}),
          ...(input?.intermediaryCategory ? { intermediaryCategory: input.intermediaryCategory } : {}),
          ...(q ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { legalName: { contains: q, mode: "insensitive" } },
              { brokerCode: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { licenseNumber: { contains: q, mode: "insensitive" } },
            ],
          } : {}),
        },
        include: {
          parent: { select: { id: true, name: true, brokerCode: true } },
          _count: { select: { groups: true, commissions: true, producers: true, commissionLedger: true } },
        },
        orderBy: { name: "asc" },
        take: input?.limit ?? 50,
        ...(input?.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      return prisma.broker.findUnique({
        where: { id: input.id, tenantId: ctx.tenantId },
        include: {
          parent: { select: { id: true, name: true, brokerCode: true } },
          children: { select: { id: true, name: true, brokerCode: true, status: true } },
          groups: { include: { package: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
          producers: { orderBy: { producerName: "asc" } },
          commissionSchedules: { orderBy: { effectiveFrom: "desc" }, include: { tiers: true } },
          commissionLedger: { orderBy: { createdAt: "desc" }, take: 24 },
          commissions: { orderBy: { period: "desc" }, take: 24 },
          kycDocuments: { orderBy: { uploadedAt: "desc" } },
          _count: { select: { groups: true, producers: true, commissionLedger: true } },
        },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      legalName: z.string().optional(),
      tradingName: z.string().optional(),
      brokerType: z.enum(brokerTypes).default("MASTER_BROKER"),
      intermediaryCategory: z.enum(intermediaryCategories).default("REGULATED_BROKER"),
      requiresIraRegistration: z.boolean().default(true),
      canReceiveCommission: z.boolean().default(true),
      commissionBasis: z.enum(commissionBases).default("COMMISSION"),
      referralFeeAmount: z.number().nonnegative().optional(),
      sourceDescription: z.string().optional(),
      parentBrokerId: z.string().optional(),
      contactPerson: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().email(),
      address: z.string().optional(),
      licenseNumber: z.string().optional(),
      iraExpiryDate: z.date().optional(),
      kraPin: z.string().optional(),
      vatRegistered: z.boolean().default(false),
      vatNumber: z.string().optional(),
      firstYearCommissionPct: z.number().min(0).max(100).default(0),
      renewalCommissionPct: z.number().min(0).max(100).default(0),
      flatFeePerMember: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      // B4-WIDE: seed from max+1 (not count()+1) so a purge/gap can't collide.
      // Inline (not the shared helper) because BRK codes carry no year segment.
      const latestBroker = await prisma.broker.findFirst({
        where: { tenantId: ctx.tenantId, brokerCode: { startsWith: "BRK-" } },
        orderBy: { brokerCode: "desc" },
        select: { brokerCode: true },
      });
      const parsedBrk = latestBroker?.brokerCode
        ? Number.parseInt(latestBroker.brokerCode.slice(latestBroker.brokerCode.lastIndexOf("-") + 1), 10)
        : 0;
      return prisma.broker.create({
        data: {
          ...input,
          tenantId: ctx.tenantId,
          brokerCode: `BRK-${String((Number.isFinite(parsedBrk) ? parsedBrk : 0) + 1).padStart(5, "0")}`,
          legalName: input.legalName ?? input.name,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().optional(),
      legalName: z.string().optional(),
      tradingName: z.string().optional(),
      brokerType: z.enum(brokerTypes).optional(),
      intermediaryCategory: z.enum(intermediaryCategories).optional(),
      requiresIraRegistration: z.boolean().optional(),
      canReceiveCommission: z.boolean().optional(),
      commissionBasis: z.enum(commissionBases).optional(),
      referralFeeAmount: z.number().nonnegative().optional(),
      sourceDescription: z.string().optional(),
      parentBrokerId: z.string().optional(),
      contactPerson: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      address: z.string().optional(),
      licenseNumber: z.string().optional(),
      iraExpiryDate: z.date().optional(),
      kraPin: z.string().optional(),
      vatRegistered: z.boolean().optional(),
      vatNumber: z.string().optional(),
      status: z.string().optional(),
      firstYearCommissionPct: z.number().min(0).max(100).optional(),
      renewalCommissionPct: z.number().min(0).max(100).optional(),
      flatFeePerMember: z.number().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      const { id, ...data } = input;
      return prisma.broker.update({ where: { id, tenantId: ctx.tenantId }, data });
    }),

  deactivate: protectedProcedure
    .input(z.object({ id: z.string(), effectiveTo: z.date(), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      return prisma.broker.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { status: "TERMINATED", effectiveTo: input.effectiveTo, commissionStructure: { reason: input.reason } },
      });
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx.session.user.role);
      return prisma.broker.update({
        where: { id: input.id, tenantId: ctx.tenantId },
        data: { status: "ACTIVE", approvedById: ctx.session.user.id, approvedAt: new Date() },
      });
    }),

  createProducer: protectedProcedure
    .input(z.object({
      brokerId: z.string(),
      producerName: z.string().min(1),
      producerCode: z.string().min(1),
      iraIndividualNumber: z.string().optional(),
      email: z.string().email(),
      phone: z.string().min(1),
      effectiveFrom: z.date().default(() => new Date()),
    }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      await prisma.broker.findUniqueOrThrow({ where: { id: input.brokerId, tenantId: ctx.tenantId }, select: { id: true } });
      return prisma.brokerProducer.create({ data: input });
    }),

  listProducers: protectedProcedure
    .input(z.object({ brokerId: z.string(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      return prisma.brokerProducer.findMany({
        where: { broker: { tenantId: ctx.tenantId }, brokerId: input.brokerId, ...(input.status ? { status: input.status } : {}) },
        orderBy: { producerName: "asc" },
      });
    }),

  recordKycDocument: protectedProcedure
    .input(z.object({
      brokerId: z.string(),
      documentType: z.enum(kycDocumentTypes),
      fileUri: z.string().min(1),
      fileName: z.string().min(1),
      expiresAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      await prisma.broker.findUniqueOrThrow({ where: { id: input.brokerId, tenantId: ctx.tenantId }, select: { id: true } });
      return prisma.brokerKycDocument.create({ data: { ...input, uploadedById: ctx.session.user.id } });
    }),

  verifyKycDocument: protectedProcedure
    .input(z.object({ documentId: z.string(), verified: z.boolean(), notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      return prisma.brokerKycDocument.update({
        where: { id: input.documentId },
        data: {
          status: input.verified ? "VERIFIED" : "REJECTED",
          verifiedAt: new Date(),
          verifiedById: ctx.session.user.id,
          notes: input.notes,
        },
      });
    }),

  createScheduleDraft: protectedProcedure
    .input(z.object({
      brokerId: z.string(),
      scheduleName: z.string().min(1),
      scheduleType: z.enum(["FLAT_PERCENTAGE", "TIERED_VOLUME", "TIERED_LOSS_RATIO", "HYBRID_FLAT_PLUS_OVERRIDE", "PERFORMANCE_LINKED"]),
      packageId: z.string().optional(),
      groupId: z.string().optional(),
      clientType: z.enum(["CORPORATE", "INDIVIDUAL"]).optional(),
      newBusinessRate: z.number().min(0).max(1),
      renewalRate: z.number().min(0).max(1),
      overrideRate: z.number().min(0).max(1).optional(),
      grossCommissionCeiling: z.number().min(0).max(1).optional(),
      effectiveFrom: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      await prisma.broker.findUniqueOrThrow({ where: { id: input.brokerId, tenantId: ctx.tenantId }, select: { id: true } });
      return prisma.brokerCommissionSchedule.create({
        data: { ...input, createdById: ctx.session.user.id, status: "DRAFT" },
      });
    }),

  submitScheduleForApproval: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      return CommissionService.submitScheduleForApproval(input.id, ctx.session.user.id);
    }),

  approveSchedule: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx.session.user.role);
      return CommissionService.approveSchedule(input.id, ctx.session.user.id);
    }),

  rejectSchedule: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx.session.user.role);
      return prisma.brokerCommissionSchedule.update({
        where: { id: input.id },
        data: { status: "REJECTED", updatedAt: new Date() },
      });
    }),

  simulateSchedule: protectedProcedure
    .input(z.object({
      scheduleId: z.string(),
      contributionAmount: z.number().nonnegative(),
      memberCount: z.number().int().nonnegative().default(0),
      isFirstPeriod: z.boolean().default(true),
    }))
    .query(async ({ input }) => {
      const schedule = await prisma.brokerCommissionSchedule.findUnique({
        where: { id: input.scheduleId },
        include: { tiers: { orderBy: { tierOrder: "asc" } }, broker: { select: { vatRegistered: true } } },
      });
      if (!schedule) throw new TRPCError({ code: "NOT_FOUND" });
      const rate = CommissionService.determineRate({
        schedule,
        contributionAmount: input.contributionAmount,
        memberCount: input.memberCount,
        isFirstPeriod: input.isFirstPeriod,
      });
      return { rate, ...CommissionService.calculateAmounts({ contributionAmount: input.contributionAmount, rate, vatRegistered: schedule.broker.vatRegistered }) };
    }),

  ledger: protectedProcedure
    .input(z.object({
      brokerId: z.string().optional(),
      state: z.enum(["PENDING_RECONCILIATION", "EARNED", "ACCRUED", "PAYABLE", "PAID", "CLAWED_BACK", "ON_HOLD"]).optional(),
      periodFrom: z.date().optional(),
      periodTo: z.date().optional(),
      limit: z.number().min(1).max(200).default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      return prisma.commissionLedgerEntry.findMany({
        where: {
          broker: { tenantId: ctx.tenantId },
          ...(input?.brokerId ? { brokerId: input.brokerId } : {}),
          ...(input?.state ? { state: input.state } : {}),
          ...((input?.periodFrom || input?.periodTo) ? {
            earnedPeriodStart: {
              ...(input.periodFrom ? { gte: input.periodFrom } : {}),
              ...(input.periodTo ? { lte: input.periodTo } : {}),
            },
          } : {}),
        },
        include: { broker: { select: { id: true, name: true, brokerCode: true } }, payoutBatch: true },
        orderBy: { createdAt: "desc" },
        take: input?.limit ?? 100,
      });
    }),

  generatePayoutBatch: protectedProcedure
    .input(z.object({ asOfDate: z.date(), brokerIds: z.array(z.string()).optional() }))
    .mutation(async ({ ctx, input }) => {
      requireStaff(ctx.session.user.role);
      return CommissionService.generatePayoutBatch({ ...input, generatedById: ctx.session.user.id });
    }),

  approvePayoutBatch: protectedProcedure
    .input(z.object({ batchId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireSuperAdmin(ctx.session.user.role);
      return prisma.commissionPayoutBatch.update({
        where: { id: input.batchId },
        data: { status: "APPROVED", approvedById: ctx.session.user.id, approvedAt: new Date() },
      });
    }),

  // ─── LEGACY COMMISSIONS ─────────────────────────────────────────
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
      return prisma.commission.update({ where: { id: input.id }, data: { paymentStatus: "APPROVED" } });
    }),

  markCommissionPaid: protectedProcedure
    .input(z.object({ id: z.string(), paymentReference: z.string().optional() }))
    .mutation(async ({ input }) => {
      return prisma.commission.update({
        where: { id: input.id },
        data: { paymentStatus: "PAID", paidAt: new Date(), paymentReference: input.paymentReference },
      });
    }),
});
