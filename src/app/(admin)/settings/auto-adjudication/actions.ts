"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/settings/auto-adjudication";

/**
 * Create an auto-adjudication policy (G3.7). Never-delete: an existing active
 * policy for the same scope (client or operator default) is superseded
 * (effectiveTo=now) before the new version takes effect.
 */
export async function createAutoAdjPolicyAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  const enabled = formData.get("enabled") === "on";
  const ceilingRaw = ((formData.get("maxAutoApproveAmount") as string) || "").trim();
  const maxAutoApproveAmount = ceilingRaw ? Number(ceilingRaw) : null;
  const currency = ((formData.get("currency") as string) || "UGX").trim().toUpperCase();
  const requireCleanFraud = formData.get("requireCleanFraud") === "on";

  let errorMsg = "";
  try {
    if (maxAutoApproveAmount != null && (!Number.isFinite(maxAutoApproveAmount) || maxAutoApproveAmount < 0)) {
      throw new Error("Auto-approve ceiling must be a non-negative number (or empty for no ceiling).");
    }
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, operatorTenantId: tenantId }, select: { id: true } });
      if (!client) throw new Error("Client not found.");
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.autoAdjudicationPolicy.updateMany({
        where: { tenantId, clientId, isActive: true },
        data: { isActive: false, effectiveTo: now },
      }),
      prisma.autoAdjudicationPolicy.create({
        data: { tenantId, clientId, enabled, maxAutoApproveAmount, currency, requireCleanFraud, effectiveFrom: now },
      }),
    ]);
    await writeAudit({
      userId: session.user.id,
      action: "AUTO_ADJ_POLICY_SET",
      module: "CLAIMS",
      description: `Auto-adjudication policy set (${clientId ? `client ${clientId}` : "operator default"}): ${enabled ? "enabled" : "disabled"}, ceiling ${maxAutoApproveAmount ?? "none"} ${currency}`,
      metadata: { clientId, enabled, maxAutoApproveAmount, currency, requireCleanFraud },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to save policy";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function deactivateAutoAdjPolicyAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const policy = await prisma.autoAdjudicationPolicy.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, clientId: true },
  });
  if (!policy) return;
  await prisma.autoAdjudicationPolicy.update({
    where: { id },
    data: { isActive: false, effectiveTo: new Date() },
  });
  await writeAudit({
    userId: session.user.id,
    action: "AUTO_ADJ_POLICY_DEACTIVATED",
    module: "CLAIMS",
    description: `Auto-adjudication policy ${id} deactivated`,
    metadata: { policyId: id, clientId: policy.clientId },
  });
  revalidatePath(PATH);
}
