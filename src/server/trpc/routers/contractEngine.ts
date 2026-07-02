import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { ContractEngine } from "@/server/services/contract-engine/engine";
import { ReasonCodeService } from "@/server/services/reason-codes.service";

// Read-only contract-engine evaluation (spec §14 `contractEngine.evaluate`).
// Powers the claims Contract panel and the rule-builder sandbox. Never writes.
export const contractEngineRouter = createTRPCRouter({
  evaluateClaim: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ContractEngine.evaluateClaimById(ctx.tenantId, input.claimId);
      if (!result) return null;
      // Attach provider-facing reason wording for display.
      const codes = new Set<string>();
      if (result.reasonCode) codes.add(result.reasonCode);
      for (const l of result.lines) if (l.reasonCode) codes.add(l.reasonCode);
      const rows = codes.size
        ? await prisma.adjudicationReasonCode.findMany({ where: { tenantId: ctx.tenantId, code: { in: [...codes] } } })
        : [];
      const reasons = Object.fromEntries(rows.map(r => [r.code, { provider: r.providerDescription, member: r.memberDescription, internal: r.internalDescription, severity: r.defaultSeverity }]));
      return { ...result, reasons };
    }),

  // Hypothetical single-line sandbox (spec §11.5 live preview) — evaluate an
  // ad-hoc line against a contract without persisting.
  evaluateLine: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        providerBranchId: z.string().optional(),
        clientId: z.string().optional(),
        dateOfService: z.string(),
        cptCode: z.string().optional(),
        description: z.string(),
        quantity: z.number().int().positive().default(1),
        unitCost: z.number().nonnegative(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const result = await ContractEngine.evaluateClaim({
        tenantId: ctx.tenantId,
        providerId: input.providerId,
        providerBranchId: input.providerBranchId,
        clientId: input.clientId,
        dateOfService: new Date(input.dateOfService),
        lines: [
          {
            id: "sandbox-1",
            cptCode: input.cptCode ?? null,
            providerServiceCode: null,
            description: input.description,
            quantity: input.quantity,
            unitCost: input.unitCost,
            billedAmount: input.unitCost * input.quantity,
          },
        ],
      });
      return result;
    }),

  // Idempotent per-tenant reason-code catalog seed (admin utility).
  seedReasonCodes: protectedProcedure.mutation(async ({ ctx }) => {
    const n = await ReasonCodeService.seedForTenant(ctx.tenantId);
    return { seeded: n };
  }),
});
