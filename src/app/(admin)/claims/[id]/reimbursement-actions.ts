"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { reimbursementService } from "@/server/services/reimbursement.service";
import { revalidatePath } from "next/cache";

export async function disburseReimbursementAction(formData: FormData) {
  const session = await requireRole(ROLES.FINANCE);
  const claimId        = formData.get("claimId") as string;
  const disbursementRef = formData.get("disbursementRef") as string;

  await reimbursementService.disburse({
    tenantId:         session.user.tenantId,
    claimId,
    financeOfficerId: session.user.id,
    disbursementRef,
  });

  revalidatePath(`/claims/${claimId}`);
}
