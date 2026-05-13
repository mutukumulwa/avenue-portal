import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { intakeService } from "@/server/services/intake.service";
import { rbacService } from "@/server/services/rbac.service";
import { ClientType, FundingMode, Gender, LifeRole, UWDecisionType } from "@prisma/client";

const lifeInputSchema = z.object({
  role: z.nativeEnum(LifeRole),
  principalLifeId: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  nationalId: z.string().optional(),
  dateOfBirth: z.date(),
  gender: z.nativeEnum(Gender),
  medicalHistory: z.array(z.object({
    icd10Code: z.string(),
    description: z.string().default(""),
    isCurrentCondition: z.boolean().default(true),
  })).optional(),
});

export const intakeRouter = createTRPCRouter({
  // ── Create a new intake quotation ──────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      clientType: z.nativeEnum(ClientType),
      fundingMode: z.nativeEnum(FundingMode).optional(),
      brokerId: z.string().optional(),
      groupId: z.string().optional(),
      packageId: z.string().optional(),
      legalName: z.string().optional(),
      registrationNumber: z.string().optional(),
      kraPinCorporate: z.string().optional(),
      billingContactEmail: z.string().email().optional(),
      headcount: z.number().int().positive().optional(),
      requestedCoverStart: z.date().optional(),
      prospectName: z.string().optional(),
      prospectContact: z.string().optional(),
      prospectEmail: z.string().email().optional(),
      prospectIndustry: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return intakeService.createQuotation(ctx.tenantId, ctx.session.user.id, input);
    }),

  // ── Add lives manually ────────────────────────────────────────────────────
  addLives: protectedProcedure
    .input(z.object({
      quotationId: z.string(),
      lives: z.array(lifeInputSchema).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return intakeService.addLives(input.quotationId, ctx.tenantId, input.lives);
    }),

  // ── Parse a census file (returns structured lives + row errors) ────────────
  parseCensus: protectedProcedure
    .input(z.object({ fileUrl: z.string().url() }))
    .mutation(async ({ input }) => {
      return intakeService.parseCensusFile(input.fileUrl);
    }),

  // ── Submit for validation (runs all gates) ────────────────────────────────
  submitForValidation: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return intakeService.submitForValidation(input.quotationId, ctx.tenantId, ctx.session.user.id);
    }),

  // ── Assemble the risk profile for display ─────────────────────────────────
  assembleRiskProfile: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return intakeService.assembleRiskProfile(input.quotationId, ctx.tenantId);
    }),

  // ── Record a per-life underwriting decision ───────────────────────────────
  recordDecision: protectedProcedure
    .input(z.object({
      quotationId: z.string(),
      quotationLifeId: z.string(),
      decision: z.nativeEnum(UWDecisionType),
      loadingMultiplier: z.number().min(1.01).max(5.0).optional(),
      excludedIcd10Codes: z.array(z.string()).optional(),
      waitingPeriodDays: z.number().int().positive().optional(),
      waitingPeriodCategories: z.array(z.string()).optional(),
      reasonCode: z.string().min(1),
      narrative: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "UNDERWRITING:RECORD_DECISION", ctx.tenantId);
      return intakeService.recordDecision(ctx.tenantId, ctx.session.user.id, input);
    }),

  // ── Submit for pricing ────────────────────────────────────────────────────
  submitForPricing: protectedProcedure
    .input(z.object({
      quotationId: z.string(),
      projectedGrossKes: z.number().optional(),
      schemeDiscountPct: z.number().min(0).max(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "UNDERWRITING:ASSESS", ctx.tenantId);
      return intakeService.submitForPricing(input.quotationId, ctx.tenantId, ctx.session.user.id, {
        projectedGrossKes: input.projectedGrossKes,
        schemeDiscountPct: input.schemeDiscountPct,
      });
    }),

  // ── Senior approval ───────────────────────────────────────────────────────
  approveSenior: protectedProcedure
    .input(z.object({ quotationId: z.string(), note: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "UNDERWRITING:APPROVE_SENIOR", ctx.tenantId);
      return intakeService.approveSeniorAssessment(input.quotationId, ctx.tenantId, ctx.session.user.id, input.note);
    }),

  // ── Decline / withdraw / return ───────────────────────────────────────────
  decline: protectedProcedure
    .input(z.object({ quotationId: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "UNDERWRITING:DECLINE", ctx.tenantId);
      return intakeService.decline(input.quotationId, ctx.tenantId, ctx.session.user.id, input.reason);
    }),

  withdraw: protectedProcedure
    .input(z.object({ quotationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return intakeService.withdraw(input.quotationId, ctx.tenantId, ctx.session.user.id);
    }),

  returnToSubmitter: protectedProcedure
    .input(z.object({ quotationId: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ ctx, input }) => {
      await rbacService.requirePermission(ctx.session.user.id, "UNDERWRITING:ASSESS", ctx.tenantId);
      return intakeService.returnToSubmitter(input.quotationId, ctx.tenantId, ctx.session.user.id, input.reason);
    }),

  // ── Queries ───────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return intakeService.getWithDetail(input.id, ctx.tenantId);
    }),

  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      assignedAssessorId: z.string().optional(),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return intakeService.list(ctx.tenantId, input);
    }),

  getWorkQueue: protectedProcedure
    .input(z.object({
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return intakeService.getWorkQueue(ctx.tenantId, ctx.session.user.id, input.page, input.pageSize);
    }),
});
