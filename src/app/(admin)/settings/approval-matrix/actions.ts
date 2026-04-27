"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createApprovalMatrixRuleAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const claimValueMin = formData.get("claimValueMin") ? Number(formData.get("claimValueMin")) : null;
  const claimValueMax = formData.get("claimValueMax") ? Number(formData.get("claimValueMax")) : null;
  const serviceType   = (formData.get("serviceType") as string) || null;
  const benefitCat    = (formData.get("benefitCategory") as string) || null;
  const requiredRole  = formData.get("requiredRole") as string;
  const requiresDual  = formData.get("requiresDual") === "true";

  if (!requiredRole) return { error: "Required role is mandatory." };

  await prisma.approvalMatrix.create({
    data: {
      tenantId: session.user.tenantId,
      claimValueMin,
      claimValueMax,
      serviceType: serviceType as never,
      benefitCategory: benefitCat as never,
      requiredRole,
      requiresDual,
      effectiveFrom: new Date(),
    },
  });

  revalidatePath("/settings/approval-matrix");
  return {};
}

export async function toggleApprovalMatrixRuleAction(
  formData: FormData,
): Promise<void> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;

  const rule = await prisma.approvalMatrix.findUnique({ where: { id }, select: { tenantId: true, isActive: true } });
  if (!rule || rule.tenantId !== session.user.tenantId) return;

  await prisma.approvalMatrix.update({ where: { id }, data: { isActive: !rule.isActive } });
  revalidatePath("/settings/approval-matrix");
}

export async function deleteApprovalMatrixRuleAction(
  formData: FormData,
): Promise<void> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;

  const rule = await prisma.approvalMatrix.findUnique({ where: { id }, select: { tenantId: true } });
  if (!rule || rule.tenantId !== session.user.tenantId) return;

  await prisma.approvalMatrix.delete({ where: { id } });
  revalidatePath("/settings/approval-matrix");
}
