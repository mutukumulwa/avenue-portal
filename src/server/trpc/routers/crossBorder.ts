import { z } from "zod";
import { createTRPCRouter, protectedProcedure, memberOpsProcedure } from "../trpc";
import { CrossBorderService } from "../../services/cross-border.service";

const caseStatusEnum = z.enum([
  "SOURCING",
  "ESTIMATED",
  "GOP_ISSUED",
  "IN_TREATMENT",
  "INVOICED",
  "SETTLED",
  "CANCELLED",
]);

const lineInput = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().min(1),
  serviceDate: z.coerce.date().optional(),
});

export const crossBorderRouter = createTRPCRouter({
  // ── Facilities ──
  listFacilities: protectedProcedure
    .input(z.object({ country: z.string().optional(), onlyVetted: z.boolean().optional(), includeInactive: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => CrossBorderService.listFacilities(ctx.tenantId, input ?? {})),

  upsertFacility: memberOpsProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        country: z.string().min(1),
        city: z.string().optional(),
        currency: z.string().optional(),
        specialties: z.array(z.string()).optional(),
        accreditation: z.string().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        notes: z.string().optional(),
        isVetted: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => CrossBorderService.upsertFacility(ctx.tenantId, input)),

  retireFacility: memberOpsProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => CrossBorderService.retireFacility(ctx.tenantId, input.id)),

  // ── Cases ──
  listCases: protectedProcedure
    .input(z.object({ clientId: z.string().optional(), status: caseStatusEnum.optional() }).optional())
    .query(({ ctx, input }) => CrossBorderService.listCases(ctx.tenantId, input ?? {})),

  getCase: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => CrossBorderService.getCase(ctx.tenantId, input.id)),

  openCase: memberOpsProcedure
    .input(
      z.object({
        clientId: z.string().min(1),
        memberId: z.string().min(1),
        diagnosis: z.string().min(1),
        facilityId: z.string().optional(),
        preauthId: z.string().optional(),
        treatmentSummary: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      CrossBorderService.openCase(ctx.tenantId, { ...input, createdById: ctx.session.user.id }),
    ),

  assignFacility: memberOpsProcedure
    .input(z.object({ caseId: z.string(), facilityId: z.string() }))
    .mutation(({ ctx, input }) => CrossBorderService.assignFacility(ctx.tenantId, input.caseId, input.facilityId)),

  captureEstimate: memberOpsProcedure
    .input(z.object({ caseId: z.string(), lines: z.array(lineInput).min(1) }))
    .mutation(({ ctx, input }) => CrossBorderService.captureEstimate(ctx.tenantId, input.caseId, input.lines)),

  issueGop: memberOpsProcedure
    .input(
      z.object({
        caseId: z.string(),
        amount: z.number().positive(),
        currency: z.string().min(1),
        approvedLimitUgx: z.number().nonnegative(),
      }),
    )
    .mutation(({ ctx, input }) =>
      CrossBorderService.issueGop(ctx.tenantId, input.caseId, {
        amount: input.amount,
        currency: input.currency,
        approvedLimitUgx: input.approvedLimitUgx,
      }),
    ),

  startTreatment: memberOpsProcedure
    .input(z.object({ caseId: z.string() }))
    .mutation(({ ctx, input }) => CrossBorderService.startTreatment(ctx.tenantId, input.caseId)),

  addInvoiceLine: memberOpsProcedure
    .input(z.object({ caseId: z.string(), line: lineInput }))
    .mutation(({ ctx, input }) => CrossBorderService.addInvoiceLine(ctx.tenantId, input.caseId, input.line)),

  consolidateInvoice: memberOpsProcedure
    .input(z.object({ caseId: z.string() }))
    .mutation(({ ctx, input }) => CrossBorderService.consolidateInvoice(ctx.tenantId, input.caseId)),

  settle: memberOpsProcedure
    .input(z.object({ caseId: z.string(), period: z.string().optional() }))
    .mutation(({ ctx, input }) => CrossBorderService.settle(ctx.tenantId, input.caseId, { period: input.period })),

  cancelCase: memberOpsProcedure
    .input(z.object({ caseId: z.string() }))
    .mutation(({ ctx, input }) => CrossBorderService.cancelCase(ctx.tenantId, input.caseId)),
});
