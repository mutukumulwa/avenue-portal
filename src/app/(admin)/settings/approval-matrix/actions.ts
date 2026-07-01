"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createApprovalMatrixRuleAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const actionType    = (formData.get("actionType") as string) || "CLAIM_PAYMENT";
  const clientId      = (formData.get("clientId") as string) || null;
  const currency      = ((formData.get("currency") as string) || "UGX").toUpperCase();
  const claimValueMin = formData.get("claimValueMin") ? Number(formData.get("claimValueMin")) : null;
  const claimValueMax = formData.get("claimValueMax") ? Number(formData.get("claimValueMax")) : null;
  const serviceType   = (formData.get("serviceType") as string) || null;
  const benefitCat    = (formData.get("benefitCategory") as string) || null;
  const requiredRole  = formData.get("requiredRole") as string;
  const requiresDual  = formData.get("requiresDual") === "true";
  const slaMinutes    = formData.get("slaMinutes") ? Number(formData.get("slaMinutes")) : null;
  const escalationTargetRole = (formData.get("escalationTargetRole") as string) || null;

  if (!requiredRole) return { error: "Required role is mandatory." };

  // A client-scoped rule must belong to this operator (cross-operator blocked).
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, operatorTenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!client) return { error: "Selected client not found." };
  }

  // Optional multi-level sequence: comma-separated roles, level 1..n. When set,
  // the engine walks these ApprovalSteps (requiredRole above stays the level-1
  // fallback). e.g. "CLAIMS_OFFICER, FINANCE_OFFICER".
  const stepRoles = ((formData.get("stepRoles") as string) || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const created = await prisma.approvalMatrix.create({
    data: {
      tenantId: session.user.tenantId,
      clientId,
      actionType: actionType as never,
      currency,
      claimValueMin,
      claimValueMax,
      serviceType: serviceType as never,
      benefitCategory: benefitCat as never,
      requiredRole,
      requiresDual,
      slaMinutes,
      escalationTargetRole,
      effectiveFrom: new Date(),
    },
  });

  if (stepRoles.length > 0) {
    await prisma.approvalStep.createMany({
      data: stepRoles.map((role, i) => ({
        matrixId: created.id,
        level: i + 1,
        requiredRole: role,
        slaMinutes: i === 0 ? slaMinutes : null,
        escalationTargetRole: i === 0 ? escalationTargetRole : null,
      })),
    });
  }

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
