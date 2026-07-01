"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { BASE_CURRENCY } from "@/server/services/fx.service";

const PATH = "/settings/fx-rates";

/**
 * Add an FX rate for base→quote (base is UGX). Never-delete: supersede the
 * current active rate for the pair (effectiveTo=now), then create the new one.
 */
export async function createFxRateAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const quoteCurrency = ((formData.get("quoteCurrency") as string) || "").trim().toUpperCase();
  const rate = Number(formData.get("rate"));
  const source = ((formData.get("source") as string) || "manual").trim();

  let errorMsg = "";
  try {
    if (!quoteCurrency || quoteCurrency === BASE_CURRENCY) {
      throw new Error(`Quote currency must differ from the base (${BASE_CURRENCY}).`);
    }
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Rate must be a positive number.");

    const now = new Date();
    await prisma.$transaction([
      prisma.fxRate.updateMany({
        where: { tenantId, baseCurrency: BASE_CURRENCY, quoteCurrency, isActive: true },
        data: { isActive: false, effectiveTo: now },
      }),
      prisma.fxRate.create({
        data: { tenantId, baseCurrency: BASE_CURRENCY, quoteCurrency, rate, source, effectiveFrom: now },
      }),
    ]);
    await writeAudit({
      userId: session.user.id,
      action: "FX_RATE_SET",
      module: "FINANCE",
      description: `FX rate set: 1 ${quoteCurrency} = ${rate} ${BASE_CURRENCY}`,
      metadata: { quoteCurrency, rate },
    });
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to set rate";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function deactivateFxRateAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const rate = await prisma.fxRate.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true },
  });
  if (!rate) return;
  await prisma.fxRate.update({ where: { id }, data: { isActive: false, effectiveTo: new Date() } });
  revalidatePath(PATH);
}
