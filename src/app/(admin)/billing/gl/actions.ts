"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { GLService } from "@/server/services/gl.service";
import { revalidatePath } from "next/cache";

export async function seedChartOfAccountsAction() {
  const session = await requireRole(ROLES.FINANCE);
  await GLService.seedChartOfAccounts(session.user.tenantId);
  revalidatePath("/billing/gl");
}

export async function postManualEntryAction(formData: FormData) {
  const session = await requireRole(ROLES.FINANCE);
  // placeholder for manual journal entry — to be expanded
  void formData;
  revalidatePath("/billing/gl");
}
