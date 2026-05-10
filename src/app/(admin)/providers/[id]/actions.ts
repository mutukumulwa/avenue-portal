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

// ── Practitioners ──────────────────────────────────────────────────────────

export async function createPractitionerAndLinkAction(_prev: unknown, formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const providerId    = formData.get("providerId")    as string;
  const firstName     = (formData.get("firstName")    as string).trim();
  const lastName      = (formData.get("lastName")     as string).trim();
  const licenseType   = (formData.get("licenseType")  as string).trim();
  const licenseNumber = (formData.get("licenseNumber") as string).trim();

  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
  if (!provider) return { error: "Provider not found" };

  const existing = await prisma.practitioner.findUnique({
    where: { tenantId_licenseNumber: { tenantId: session.user.tenantId, licenseNumber } },
  });
  if (existing) return { error: `A practitioner with license number ${licenseNumber} already exists. Use "Link Existing" instead.` };

  const practitioner = await prisma.practitioner.create({
    data: { tenantId: session.user.tenantId, firstName, lastName, licenseType, licenseNumber },
  });
  await prisma.providerPractitioner.create({
    data: { providerId, practitionerId: practitioner.id },
  });

  revalidatePath(`/providers/${providerId}`);
  return { success: true };
}

export async function linkExistingPractitionerAction(_prev: unknown, formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const providerId    = formData.get("providerId")    as string;
  const licenseNumber = (formData.get("licenseNumber") as string).trim();

  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
  if (!provider) return { error: "Provider not found" };

  const practitioner = await prisma.practitioner.findUnique({
    where: { tenantId_licenseNumber: { tenantId: session.user.tenantId, licenseNumber } },
  });
  if (!practitioner) return { error: `No practitioner found with license number ${licenseNumber}` };

  const alreadyLinked = await prisma.providerPractitioner.findUnique({
    where: { providerId_practitionerId: { providerId, practitionerId: practitioner.id } },
  });
  if (alreadyLinked) return { error: "This practitioner is already linked to this provider" };

  await prisma.providerPractitioner.create({ data: { providerId, practitionerId: practitioner.id } });
  revalidatePath(`/providers/${providerId}`);
  return { success: true };
}

export async function unlinkPractitionerAction(providerId: string, practitionerId: string) {
  await requireRole(ROLES.ADMIN_ONLY);
  await prisma.providerPractitioner.delete({
    where: { providerId_practitionerId: { providerId, practitionerId } },
  });
  revalidatePath(`/providers/${providerId}`);
}

export async function addCredentialAction(_prev: unknown, formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const practitionerId = formData.get("practitionerId") as string;
  const providerId     = formData.get("providerId")     as string;
  const documentType   = (formData.get("documentType") as string).trim();
  const expiryDate     = formData.get("expiryDate")     as string;
  const notes          = (formData.get("notes") as string) || null;

  if (!documentType || !expiryDate) return { error: "Document type and expiry date are required" };

  // Verify practitioner belongs to tenant
  const practitioner = await prisma.practitioner.findUnique({ where: { id: practitionerId, tenantId: session.user.tenantId } });
  if (!practitioner) return { error: "Practitioner not found" };

  const expiry = new Date(expiryDate);
  const isExpired = expiry < new Date();

  await prisma.practitionerCredential.create({
    data: {
      practitionerId,
      documentType,
      expiryDate: expiry,
      status: isExpired ? "EXPIRED" : "ACTIVE",
      notes,
    },
  });

  revalidatePath(`/providers/${providerId}`);
  return { success: true };
}
