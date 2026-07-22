"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProvider } from "@/lib/provider-portal";
import { runClaimIntake } from "@/server/services/claim-intake";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

export interface ProviderClaimInput {
  idempotencyKey: string; // F5.1: the form's draft UUID — replays across retry/refresh
  memberNumber: string;
  serviceType: ServiceType;
  benefitCategory: BenefitCategory;
  dateOfService: string;
  attendingDoctor?: string;
  primaryDiagnosis: { code: string; description: string };
  lineItems: { serviceCategory: ClaimLineCategory; cptCode: string; description: string; quantity: number; unitCost: number }[];
}

export async function submitProviderClaimAction(
  input: ProviderClaimInput,
): Promise<{ error?: string } | void> {
  const { session, providerId, tenantId } = await requireProvider();

  const memberNumber = (input.memberNumber ?? "").trim();
  if (!memberNumber) return { error: "Enter the member/card number." };
  if (!input.primaryDiagnosis?.code) return { error: "Add a primary diagnosis." };
  const lines = (input.lineItems ?? []).filter((l) => l.description?.trim() && Number(l.unitCost) > 0);
  if (lines.length === 0) return { error: "Add at least one service line with an amount." };

  const member = await prisma.member.findFirst({
    where: { tenantId, memberNumber: { equals: memberNumber, mode: "insensitive" } },
    select: { id: true },
  });
  if (!member) return { error: `No member found for “${memberNumber}”.` };

  // BD-02 / OBS-5: a provider claim POST that 503'd after creating the claim (RSC
  // instability, now fixed in Workstream A) could be re-submitted and duplicate
  // the claim. Soft-block an identical claim (same facility/member/date/total)
  // captured in the last 2 minutes: surface the existing claim number instead of
  // silently creating a second one. This does NOT block a legitimate repeat visit
  // later in the day — only a rapid re-submit of the same encounter. Adjudication-
  // time double-capture routing (the existing control) still applies beyond it.
  const billedTotal = lines.reduce(
    (s, l) => s + Math.max(1, Number(l.quantity) || 1) * (Number(l.unitCost) || 0),
    0,
  );
  const recentDuplicate = await prisma.claim.findFirst({
    where: {
      tenantId,
      providerId,
      memberId: member.id,
      dateOfService: new Date(input.dateOfService),
      billedAmount: billedTotal,
      createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
    },
    select: { claimNumber: true },
    orderBy: { createdAt: "desc" },
  });
  if (recentDuplicate) {
    return {
      error:
        `An identical claim (${recentDuplicate.claimNumber}) for this member, date and amount was just submitted from this facility. ` +
        `It is already in the queue — refresh your claims list rather than submitting again. If this is a genuine second encounter, adjust a line and resubmit.`,
    };
  }

  const result = await runClaimIntake(
    // Provider is forced to the logged-in facility — a facility can never file a
    // claim against another provider (derived from the session, D12).
    { kind: "providerUser", tenantId, userId: session.user.id, providerId },
    {
      memberId: member.id,
      providerId,
      serviceType: input.serviceType,
      benefitCategory: input.benefitCategory,
      dateOfService: input.dateOfService,
      attendingDoctor: input.attendingDoctor,
      diagnoses: [
        {
          code: input.primaryDiagnosis.code,
          description: input.primaryDiagnosis.description,
          standardCharge: null,
          isPrimary: true,
        },
      ],
      lineItems: lines.map((l) => {
        const qty = Math.max(1, Number(l.quantity) || 1);
        const unit = Number(l.unitCost) || 0;
        return {
          serviceCategory: l.serviceCategory,
          cptCode: l.cptCode ?? "",
          description: l.description,
          icdCode: input.primaryDiagnosis.code,
          quantity: qty,
          unitCost: unit,
          billedAmount: qty * unit,
        };
      }),
    },
    { idempotencyKey: input.idempotencyKey },
  );
  if (!result.ok) return { error: result.error };

  redirect("/provider/claims");
}
