"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ClaimsService } from "@/server/services/claims.service";
import { writeAudit } from "@/lib/audit";
import type { ServiceType, BenefitCategory } from "@prisma/client";

export async function submitPreAuthAction(
  _prev: { error?: string; warnings?: string[] } | null,
  formData: FormData
): Promise<{ error?: string; warnings?: string[] }> {
  const session = await requireRole(ROLES.CLINICAL);

  const tenantId = session.user.tenantId;
  const estimatedCost = Number(formData.get("estimatedCost"));
  const diagnosis = formData.get("diagnosis") as string;

  const memberId        = formData.get("memberId")        as string;
  const benefitCategory = formData.get("benefitCategory") as BenefitCategory;

  let warnings: string[] = [];
  try {
    const result = await ClaimsService.createPreAuth(tenantId, {
      memberId,
      providerId: formData.get("providerId") as string,
      serviceType: formData.get("serviceType") as ServiceType,
      expectedDateOfService: formData.get("expectedDateOfService")
        ? new Date(formData.get("expectedDateOfService") as string)
        : undefined,
      diagnoses: [{ description: diagnosis, isPrimary: true }],
      procedures: [{ description: formData.get("procedure") as string || "Medical services", unitCost: estimatedCost, total: estimatedCost }],
      estimatedCost,
      clinicalNotes: formData.get("clinicalNotes") as string || undefined,
      benefitCategory,
      submittedBy: "ADMIN",
    });
    warnings = result.warnings;
  } catch (err) {
    return { error: (err as Error).message };
  }

  await writeAudit({
    userId: session.user.id,
    action: "PREAUTH_SUBMITTED",
    module: "PREAUTH",
    description: `Pre-auth submitted for member ${memberId.slice(0, 8)} — ${benefitCategory}, KES ${estimatedCost.toLocaleString()}`,
    metadata: { memberId, benefitCategory, estimatedCost },
  });

  // If fraud warnings exist, return them so the form can display them
  // before the user is redirected (they see warnings but submission succeeded)
  if (warnings.length > 0) return { warnings };

  redirect("/preauth");
}
