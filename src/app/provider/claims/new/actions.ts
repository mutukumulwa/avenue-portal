"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProvider } from "@/lib/provider-portal";
import { runClaimIntake } from "@/server/services/claim-intake";
import type { ServiceType, BenefitCategory, ClaimLineCategory } from "@prisma/client";

export interface ProviderClaimInput {
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

  try {
    await runClaimIntake(tenantId, session.user.id, {
      memberId: member.id,
      // Provider is forced to the logged-in facility — a facility can never file
      // a claim against another provider.
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
    });
  } catch (err) {
    return { error: (err as Error).message };
  }

  redirect("/provider/claims");
}
