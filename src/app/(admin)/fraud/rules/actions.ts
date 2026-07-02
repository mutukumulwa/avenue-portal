"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/fraud/rules";

/**
 * Create or replace a fraud rule (G5.11). One active rule per
 * (tenant, client, code) — an existing one is superseded (effectiveTo=now).
 */
export async function upsertFraudRuleAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const code = ((formData.get("code") as string) || "").trim().toUpperCase().replace(/\s+/g, "_");
  const name = ((formData.get("name") as string) || "").trim();
  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  const weight = Number(formData.get("weight") || 1);
  const enabled = formData.get("enabled") === "on";
  const configRaw = ((formData.get("config") as string) || "").trim();

  let errorMsg = "";
  try {
    if (!code) throw new Error("Rule code is required (e.g. UPCODING).");
    if (!name) throw new Error("Rule name is required.");
    if (!Number.isInteger(weight) || weight < 1 || weight > 10) throw new Error("Weight must be an integer 1–10.");

    let config: Record<string, unknown> = {};
    if (configRaw) {
      try {
        config = JSON.parse(configRaw);
        if (typeof config !== "object" || config === null || Array.isArray(config)) throw new Error();
      } catch {
        throw new Error('Config must be a JSON object, e.g. {"variancePct": 20}.');
      }
    }
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, operatorTenantId: tenantId }, select: { id: true } });
      if (!client) throw new Error("Client not found.");
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      // Supersede the current version for this scope+code. findFirst rather
      // than the compound unique: clientId=null never matches via findUnique
      // (Postgres treats NULLs as distinct in unique constraints).
      const existing = await tx.fraudRule.findFirst({
        where: { tenantId, clientId, code },
      });
      if (existing) {
        await tx.fraudRule.update({
          where: { id: existing.id },
          data: { name, weight, enabled, config: config as never, effectiveTo: null, effectiveFrom: now },
        });
      } else {
        await tx.fraudRule.create({
          data: { tenantId, clientId, code, name, weight, enabled, config: config as never },
        });
      }
    });

    await writeAudit({
      userId: session.user.id,
      action: "FRAUD_RULE_SET",
      module: "FRAUD",
      description: `Fraud rule ${code} ${enabled ? "enabled" : "disabled"} (${clientId ? "client-scoped" : "operator default"}, weight ${weight})`,
      metadata: { code, clientId, weight, enabled, config: JSON.stringify(config) },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to save rule";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function toggleFraudRuleAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const rule = await prisma.fraudRule.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, code: true, enabled: true },
  });
  if (!rule) return;
  await prisma.fraudRule.update({ where: { id }, data: { enabled: !rule.enabled } });
  await writeAudit({
    userId: session.user.id,
    action: rule.enabled ? "FRAUD_RULE_DISABLED" : "FRAUD_RULE_ENABLED",
    module: "FRAUD",
    description: `Fraud rule ${rule.code} ${rule.enabled ? "disabled" : "enabled"}`,
    metadata: { ruleId: id },
  });
  revalidatePath(PATH);
}
