import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, clinicalProcedure } from "../trpc";
import { ClaimsService } from "@/server/services/claims.service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";
import { PreauthReadService } from "@/server/services/preauth-read.service";
import { getSystemActorId } from "@/server/services/system-actor.service";

export const preauthRouter = createTRPCRouter({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // F3.7: canonical scoped read model + client confinement (G2.1). The PA list
      // was previously tenant-only — a confined operator saw every client's PAs.
      return PreauthReadService.list({ tenantId: ctx.tenantId, clientId: ctx.clientId ?? null });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // F3.10: canonical scoped detail read + client confinement (G2.1). A confined
      // operator opening another client's PA gets a non-enumerating NOT_FOUND (was a
      // gap — the old getById was tenant-only, unlike the claims router's getById).
      const pa = await PreauthReadService.getById({ tenantId: ctx.tenantId, clientId: ctx.clientId ?? null }, input.id);
      if (!pa) throw new TRPCError({ code: "NOT_FOUND" });
      return pa;
    }),

  create: clinicalProcedure
    .input(
      z.object({
        memberId: z.string(),
        providerId: z.string(),
        serviceType: z.enum(["OUTPATIENT", "INPATIENT", "DAY_CASE", "EMERGENCY"]),
        expectedDateOfService: z.string().optional(),
        diagnoses: z.array(z.object({
          icdCode: z.string().optional(),
          description: z.string(),
          isPrimary: z.boolean().optional(),
        })),
        procedures: z.array(z.object({
          cptCode: z.string().optional(),
          description: z.string(),
          quantity: z.number().optional(),
          unitCost: z.number(),
          total: z.number(),
        })),
        estimatedCost: z.number(),
        clinicalNotes: z.string().optional(),
        benefitCategory: z.enum([
          "INPATIENT", "OUTPATIENT", "MATERNITY", "DENTAL", "OPTICAL",
          "MENTAL_HEALTH", "CHRONIC_DISEASE", "SURGICAL", "AMBULANCE_EMERGENCY",
          "LAST_EXPENSE", "WELLNESS_PREVENTIVE", "REHABILITATION", "CUSTOM",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // F3.5c: converge on the canonical intake + pipeline (channel ADMIN_TRPC) —
      // the SAME path the B2B (F3.4), member (F3.5a) and admin-UI (F3.5b) rails use.
      // No direct createPreAuth; the 10-gate pipeline is the single decision owner.
      const result = await PreauthIntakeService.submit(
        { channel: "ADMIN_TRPC", tenantId: ctx.tenantId, providerId: input.providerId, actorType: "USER", actorId: ctx.session.user.id },
        { ...input },
        {
          adjudicate: async (preauthId, tid) => {
            await preauthAdjudicationService.executeAutoDecision(preauthId, tid, await getSystemActorId(tid));
          },
        },
      );
      if (result.status === "REJECTED" || !result.preauthId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.errors?.[0]?.message ?? "Pre-authorization could not be submitted." });
      }
      // Read back the freshly-created PA (unscoped by client — return exactly what was just created).
      return PreauthReadService.getById({ tenantId: ctx.tenantId }, result.preauthId);
    }),

  adjudicate: clinicalProcedure
    .input(
      z.object({
        preauthId: z.string(),
        action: z.enum(["APPROVED", "DECLINED"]),
        approvedAmount: z.number().optional(),
        validDays: z.number().optional(),
        declineReasonCode: z.string().optional(),
        declineNotes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // W1.1: canonical PA decision stack — approvals always place a hold (PR-011).
      if (input.action === "APPROVED") {
        return preauthAdjudicationService.approveByHuman(
          input.preauthId,
          ctx.tenantId,
          ctx.session.user.id,
          input.approvedAmount ?? 0,
          input.declineNotes,
          input.validDays,
        );
      }
      return preauthAdjudicationService.declineByHuman(
        input.preauthId,
        ctx.tenantId,
        ctx.session.user.id,
        input.declineReasonCode ?? "OTHER",
        input.declineNotes ?? "",
      );
    }),

  convertToClaim: clinicalProcedure
    .input(z.object({ preauthId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ClaimsService.createClaimWithPreauth(ctx.tenantId, input.preauthId);
    }),
});
