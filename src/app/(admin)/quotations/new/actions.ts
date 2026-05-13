"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { intakeService } from "@/server/services/intake.service";
import { redirect } from "next/navigation";
import { ClientType, FundingMode } from "@prisma/client";

export async function createIntakeAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  const clientType = formData.get("clientType") as ClientType;
  const rawCoverStart = formData.get("requestedCoverStart") as string | null;

  const quotation = await intakeService.createQuotation(tenantId, userId, {
    clientType,
    fundingMode: (formData.get("fundingMode") as FundingMode) || FundingMode.INSURED,
    brokerId: (formData.get("brokerId") as string) || undefined,
    packageId: (formData.get("packageId") as string) || undefined,
    legalName: (formData.get("legalName") as string) || undefined,
    kraPinCorporate: (formData.get("kraPinCorporate") as string) || undefined,
    billingContactEmail: (formData.get("billingContactEmail") as string) || undefined,
    headcount: formData.get("headcount") ? Number(formData.get("headcount")) : undefined,
    requestedCoverStart: rawCoverStart ? new Date(rawCoverStart) : undefined,
    prospectName: (formData.get("prospectName") as string) || undefined,
    prospectContact: (formData.get("prospectContact") as string) || undefined,
    prospectEmail: (formData.get("prospectEmail") as string) || undefined,
    prospectIndustry: (formData.get("prospectIndustry") as string) || undefined,
  });

  redirect(`/quotations/${quotation.id}/assess`);
}
