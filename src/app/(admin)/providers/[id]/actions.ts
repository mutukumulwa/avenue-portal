"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ── Contract details ───────────────────────────────────────────────────────

export async function updateContractAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const providerId = formData.get("providerId") as string;

  await prisma.provider.update({
    where: { id: providerId, tenantId: session.user.tenantId },
    data: {
      contractStatus:    formData.get("contractStatus") as string,
      contractStartDate: formData.get("contractStartDate") ? new Date(formData.get("contractStartDate") as string) : null,
      contractEndDate:   formData.get("contractEndDate")   ? new Date(formData.get("contractEndDate")   as string) : null,
      paymentTermDays:   Number(formData.get("paymentTermDays") ?? 30),
      creditLimit:       formData.get("creditLimit") ? Number(formData.get("creditLimit")) : null,
      contractNotes:     (formData.get("contractNotes") as string) || null,
    },
  });

  revalidatePath(`/providers/${providerId}`);
}

// ── CPT Tariffs ────────────────────────────────────────────────────────────

export async function upsertCptTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const providerId  = formData.get("providerId")  as string;
  const tariffId    = formData.get("tariffId")    as string | null;
  const cptCode     = (formData.get("cptCode")    as string) || null;
  const serviceName = formData.get("serviceName") as string;
  const agreedRate  = Number(formData.get("agreedRate"));
  const effectiveFrom = new Date(formData.get("effectiveFrom") as string);
  const effectiveTo   = formData.get("effectiveTo") ? new Date(formData.get("effectiveTo") as string) : null;

  // Verify provider belongs to tenant
  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
  if (!provider) throw new Error("Provider not found");

  if (tariffId) {
    await prisma.providerTariff.update({
      where: { id: tariffId },
      data: { cptCode, serviceName, agreedRate, effectiveFrom, effectiveTo },
    });
  } else {
    await prisma.providerTariff.create({
      data: { providerId, cptCode, serviceName, agreedRate, effectiveFrom, effectiveTo },
    });
  }

  revalidatePath(`/providers/${providerId}`);
}

export async function deleteCptTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const tariffId   = formData.get("tariffId")   as string;
  const providerId = formData.get("providerId") as string;

  const tariff = await prisma.providerTariff.findUnique({
    where: { id: tariffId },
    include: { provider: { select: { tenantId: true } } },
  });
  if (!tariff || tariff.provider.tenantId !== session.user.tenantId) throw new Error("Not found");

  await prisma.providerTariff.delete({ where: { id: tariffId } });
  revalidatePath(`/providers/${providerId}`);
}

// ── Diagnosis Tariffs ──────────────────────────────────────────────────────

export async function upsertDiagnosisTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const providerId     = formData.get("providerId")     as string;
  const tariffId       = formData.get("diagTariffId")   as string | null;
  const icdCode        = formData.get("icdCode")        as string;
  const diagnosisLabel = formData.get("diagnosisLabel") as string;
  const bundledRate    = formData.get("bundledRate") ? Number(formData.get("bundledRate")) : null;
  const perDayRate     = formData.get("perDayRate")  ? Number(formData.get("perDayRate"))  : null;
  const notes          = (formData.get("notes") as string) || null;
  const effectiveFrom  = new Date(formData.get("effectiveFrom") as string);
  const effectiveTo    = formData.get("effectiveTo") ? new Date(formData.get("effectiveTo") as string) : null;

  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
  if (!provider) throw new Error("Provider not found");

  if (tariffId) {
    await prisma.providerDiagnosisTariff.update({
      where: { id: tariffId },
      data: { icdCode, diagnosisLabel, bundledRate, perDayRate, notes, effectiveFrom, effectiveTo },
    });
  } else {
    await prisma.providerDiagnosisTariff.create({
      data: { providerId, icdCode, diagnosisLabel, bundledRate, perDayRate, notes, effectiveFrom, effectiveTo },
    });
  }

  revalidatePath(`/providers/${providerId}`);
}

export async function deleteDiagnosisTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const tariffId   = formData.get("tariffId")   as string;
  const providerId = formData.get("providerId") as string;

  const tariff = await prisma.providerDiagnosisTariff.findUnique({
    where: { id: tariffId },
    include: { provider: { select: { tenantId: true } } },
  });
  if (!tariff || tariff.provider.tenantId !== session.user.tenantId) throw new Error("Not found");

  await prisma.providerDiagnosisTariff.delete({ where: { id: tariffId } });
  revalidatePath(`/providers/${providerId}`);
}
