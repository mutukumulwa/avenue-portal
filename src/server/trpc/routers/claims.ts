import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { ClaimsService } from "@/server/services/claims.service";
import { TRPCError } from "@trpc/server";
import { prisma } from "@/lib/prisma";

/**
 * Claims router (F5.3).
 *
 * The legacy `create` mutation is REMOVED — it had no callers (no tRPC client
 * is mounted anywhere in the app; the only import of this router is the HTTP
 * handler), ran no fraud/eligibility/idempotency, and was the last path into
 * `ClaimsService.createClaim` besides the PA conversion (F5.7). Claim intake
 * happens ONLY through the canonical `ClaimIntakeService` rails. Adjudication
 * stays on the one canonical decision stack (D10).
 *
 * `list`/`getById` enforce client confinement (G2.1): a client-confined session
 * sees only its own client's claims.
 */
export const claimsRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      return ClaimsService.getClaims(ctx.tenantId, undefined, ctx.clientId ?? null);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Client confinement: a confined user may only open a claim whose member
      // belongs to their client — anything else is NOT_FOUND (non-enumerating).
      if (ctx.clientId) {
        const inScope = await prisma.claim.findFirst({
          where: { id: input.id, tenantId: ctx.tenantId, member: { group: { clientId: ctx.clientId } } },
          select: { id: true },
        });
        if (!inScope) throw new TRPCError({ code: "NOT_FOUND" });
      }
      return ClaimsService.getClaimById(ctx.tenantId, input.id);
    }),

  adjudicate: protectedProcedure
    .input(
      z.object({
        claimId: z.string(),
        action: z.enum(["APPROVED", "PARTIALLY_APPROVED", "DECLINED"]),
        approvedAmount: z.number().optional(),
        declineReasonCode: z.string().optional(),
        declineNotes: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // W1.1: canonical decision stack — matrix, ceiling, usage, holds, GL.
      const { ClaimDecisionService } = await import("@/server/services/claim-decision.service");
      return ClaimDecisionService.decide(ctx.tenantId, input.claimId, {
        ...input,
        reviewerId: ctx.session.user.id,
        reviewerRole: ctx.session.user.role,
      });
    }),
});
