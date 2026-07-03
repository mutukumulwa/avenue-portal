"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { CaseService } from "@/server/services/case.service";
import { writeAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import type { BenefitCategory, CaseType } from "@prisma/client";

export async function openCaseAction(formData: FormData) {
  const session = await requireRole(ROLES.OPS);
  const tenantId = session.user.tenantId;

  const memberNumber = (formData.get("memberNumber") as string)?.trim();
  const member = await prisma.member.findFirst({
    where: { tenantId, memberNumber },
    select: { id: true },
  });
  if (!member) throw new Error(`No member found with number "${memberNumber}"`);

  const c = await CaseService.openCase({
    tenantId,
    memberId: member.id,
    providerId: formData.get("providerId") as string,
    caseType: formData.get("caseType") as CaseType,
    benefitCategory: formData.get("benefitCategory") as BenefitCategory,
    admissionDate: formData.get("admissionDate") ? new Date(formData.get("admissionDate") as string) : null,
    expectedDischargeDate: formData.get("expectedDischargeDate")
      ? new Date(formData.get("expectedDischargeDate") as string)
      : null,
    attendingDoctor: (formData.get("attendingDoctor") as string) || undefined,
    estimatedCost: formData.get("estimatedCost") ? Number(formData.get("estimatedCost")) : null,
    openedById: session.user.id,
  });

  await writeAudit({
    userId: session.user.id,
    action: "CASE_OPENED",
    module: "CASES",
    description: `Case ${c.caseNumber} opened for ${c.member.firstName} ${c.member.lastName}`,
    metadata: { caseId: c.id },
  });

  redirect(`/cases/${c.id}`);
}
