"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/settings/drug-exclusions";

/** Add a drug exclusion (G9.5). Never-delete: deactivation ends it. */
export async function createDrugExclusionAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const drugCode = ((formData.get("drugCode") as string) || "").trim().toUpperCase();
  const drugName = ((formData.get("drugName") as string) || "").trim() || null;
  const reason = ((formData.get("reason") as string) || "").trim() || null;
  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  const packageId = ((formData.get("packageId") as string) || "").trim() || null;

  let errorMsg = "";
  try {
    if (!drugCode) throw new Error("Drug code is required (ATC/NDC or local register code).");
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, operatorTenantId: tenantId }, select: { id: true } });
      if (!client) throw new Error("Client not found.");
    }

    const dup = await prisma.drugExclusion.findFirst({
      where: { tenantId, drugCode, clientId, packageId, isActive: true },
      select: { id: true },
    });
    if (dup) throw new Error(`An active exclusion for ${drugCode} already exists in this scope.`);

    await prisma.drugExclusion.create({
      data: { tenantId, clientId, packageId, drugCode, drugName, reason },
    });
    await writeAudit({
      userId: session.user.id,
      action: "DRUG_EXCLUSION_ADDED",
      module: "CLAIMS",
      description: `Drug exclusion added: ${drugCode}${drugName ? ` (${drugName})` : ""} — ${clientId ? `client-scoped` : "all clients"}`,
      metadata: { drugCode, drugName, clientId, packageId, reason },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to add exclusion";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function deactivateDrugExclusionAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const exclusion = await prisma.drugExclusion.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, drugCode: true },
  });
  if (!exclusion) return;
  await prisma.drugExclusion.update({
    where: { id },
    data: { isActive: false, effectiveTo: new Date() },
  });
  await writeAudit({
    userId: session.user.id,
    action: "DRUG_EXCLUSION_ENDED",
    module: "CLAIMS",
    description: `Drug exclusion ended: ${exclusion.drugCode}`,
    metadata: { exclusionId: id },
  });
  revalidatePath(PATH);
}
