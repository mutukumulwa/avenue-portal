"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { PreauthIntakeService } from "@/server/services/preauth-intake/service";
import { preauthAdjudicationService } from "@/server/services/preauth-adjudication.service";
import { getSystemActorId } from "@/server/services/system-actor.service";
import type { ServiceType, BenefitCategory } from "@prisma/client";

export interface ProviderPreauthInput {
  idempotencyKey: string; // the form's draft UUID — replays across retry/refresh (D26)
  memberNumber: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  expectedDateOfService?: string;
  diagnosisCode?: string;
  diagnosisDescription: string;
  procedureCode?: string;
  procedureDescription: string;
  estimatedCost: number;
  clinicalNotes?: string;
}

export async function submitProviderPreauthAction(
  input: ProviderPreauthInput,
): Promise<{ error?: string } | void> {
  // Server-authorize (nav is convenience, §10.1). Legacy-compatible posture.
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, "provider.preauth.create")) {
    return { error: "You do not have permission to submit pre-authorizations." };
  }

  const memberNumber = (input.memberNumber ?? "").trim();
  if (!memberNumber) return { error: "Enter the member/card number." };
  if (!input.diagnosisDescription?.trim() && !input.diagnosisCode?.trim()) return { error: "Add a diagnosis." };
  const estimatedCost = Number(input.estimatedCost);
  if (!(estimatedCost > 0)) return { error: "Enter a valid estimated cost." };

  // Canonical intake on the PROVIDER_PORTAL channel. This is a provider-bound
  // channel: the facility identity is taken from the session context, never the
  // body (D1 anti-forgery), and the member is resolved + entitlement-gated inside
  // the intake per the D3 flag (default OFF ⇒ today's tenant-only lookup). The
  // post-commit auto-decision runs the same 10-gate pipeline as every other rail.
  const result = await PreauthIntakeService.submit(
    { channel: "PROVIDER_PORTAL", tenantId: ctx.tenantId, providerId: ctx.providerId, actorType: "USER", actorId: ctx.actorId },
    {
      memberNumber,
      serviceType: input.serviceType,
      benefitCategory: input.benefitCategory,
      expectedDateOfService: input.expectedDateOfService,
      diagnoses: [{ icdCode: input.diagnosisCode || undefined, description: input.diagnosisDescription || undefined, isPrimary: true }],
      procedures: [{ cptCode: input.procedureCode || undefined, description: input.procedureDescription || "Requested service", quantity: 1, unitCost: estimatedCost, total: estimatedCost }],
      estimatedCost,
      clinicalNotes: input.clinicalNotes,
      idempotencyKey: input.idempotencyKey,
    },
    {
      adjudicate: async (preauthId, tid) => {
        await preauthAdjudicationService.executeAutoDecision(preauthId, tid, await getSystemActorId(tid));
      },
    },
  );

  if (result.status === "REJECTED" || !result.preauthId) {
    const first = result.errors?.[0];
    // The intake's own messages are provider-appropriate ("No eligible member
    // found", "Member is not active", "This benefit is not in the member's
    // package", "Provider is not active"). Add the entered number for context on
    // the member-identity path (code MISSING_MEMBER_IDENTIFIER on this channel
    // means not-found/not-active, since the empty-input case is guarded above).
    if (first?.code === "MISSING_MEMBER_IDENTIFIER") {
      return { error: `No eligible member found for “${memberNumber}” at this facility.` };
    }
    return { error: first?.message ?? "The pre-authorization could not be submitted." };
  }

  const pa = await prisma.preAuthorization.findUnique({ where: { id: result.preauthId }, select: { preauthNumber: true } });
  const ref = pa?.preauthNumber ?? result.preauthId;
  redirect(`/provider/preauth?submitted=${encodeURIComponent(ref)}${result.replayed ? "&replayed=1" : ""}`);
}
