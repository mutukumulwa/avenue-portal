"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProviderContractsService } from "@/server/services/provider-contracts.service";
import { writeAudit } from "@/lib/audit";
import type { UnlistedServiceRule } from "@prisma/client";

async function assertContract(contractId: string, tenantId: string) {
  const contract = await prisma.providerContract.findUnique({ where: { id: contractId, tenantId } });
  if (!contract) throw new Error("Contract not found");
  return contract;
}

function contractPaths(providerId: string, contractId?: string) {
  revalidatePath(`/providers/${providerId}`);
  if (contractId) revalidatePath(`/providers/${providerId}/contracts/${contractId}`);
}

// ── Create ──────────────────────────────────────────────────────────────────

export async function createContractAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const providerId = formData.get("providerId") as string;
  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId } });
  if (!provider) throw new Error("Provider not found");

  const title = (formData.get("title") as string)?.trim();
  const startDate = new Date(formData.get("startDate") as string);
  const endDate = new Date(formData.get("endDate") as string);
  if (!title || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new Error("Title, start and end dates are required");
  if (endDate <= startDate) throw new Error("End date must be after the start date");

  const unlistedServiceRule = (formData.get("unlistedServiceRule") as UnlistedServiceRule) || "REFER_FOR_REVIEW";
  const unlistedDiscountPct = formData.get("unlistedDiscountPct") ? Number(formData.get("unlistedDiscountPct")) : null;
  if (unlistedServiceRule === "DISCOUNT_OFF_BILLED" && (unlistedDiscountPct == null || unlistedDiscountPct <= 0 || unlistedDiscountPct >= 100)) {
    throw new Error("A discount percentage between 0 and 100 is required for the discount-off-billed rule");
  }

  const contractNumber = await ProviderContractsService.nextContractNumber(tenantId);
  const contract = await prisma.providerContract.create({
    data: {
      tenantId,
      providerId,
      contractNumber,
      title,
      startDate,
      endDate,
      signedDate: formData.get("signedDate") ? new Date(formData.get("signedDate") as string) : null,
      paymentTermDays: Number(formData.get("paymentTermDays") || 30),
      creditLimit: formData.get("creditLimit") ? Number(formData.get("creditLimit")) : null,
      invoiceDiscountPct: formData.get("invoiceDiscountPct") ? Number(formData.get("invoiceDiscountPct")) : null,
      unlistedServiceRule,
      unlistedDiscountPct,
      documentUrl: (formData.get("documentUrl") as string) || null,
      notes: (formData.get("notes") as string) || null,
      createdById: session.user.id,
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "PROVIDER_CONTRACT_CREATED",
    module: "PROVIDERS",
    description: `Contract ${contractNumber} "${title}" created for ${provider.name} (DRAFT)`,
    metadata: { providerId, contractId: contract.id },
  });

  contractPaths(providerId);
  redirect(`/providers/${providerId}/contracts/${contract.id}`);
}

// ── Terms ───────────────────────────────────────────────────────────────────

export async function updateContractTermsAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);

  const startDate = new Date(formData.get("startDate") as string);
  const endDate = new Date(formData.get("endDate") as string);
  if (endDate <= startDate) throw new Error("End date must be after the start date");

  const unlistedServiceRule = (formData.get("unlistedServiceRule") as UnlistedServiceRule) || "REFER_FOR_REVIEW";
  const unlistedDiscountPct = formData.get("unlistedDiscountPct") ? Number(formData.get("unlistedDiscountPct")) : null;
  if (unlistedServiceRule === "DISCOUNT_OFF_BILLED" && (unlistedDiscountPct == null || unlistedDiscountPct <= 0 || unlistedDiscountPct >= 100)) {
    throw new Error("A discount percentage between 0 and 100 is required for the discount-off-billed rule");
  }

  await prisma.providerContract.update({
    where: { id: contractId },
    data: {
      title: (formData.get("title") as string)?.trim() || contract.title,
      startDate,
      endDate,
      signedDate: formData.get("signedDate") ? new Date(formData.get("signedDate") as string) : null,
      autoRenew: formData.get("autoRenew") === "on",
      paymentTermDays: Number(formData.get("paymentTermDays") || 30),
      creditLimit: formData.get("creditLimit") ? Number(formData.get("creditLimit")) : null,
      invoiceDiscountPct: formData.get("invoiceDiscountPct") ? Number(formData.get("invoiceDiscountPct")) : null,
      unlistedServiceRule,
      unlistedDiscountPct,
      documentUrl: (formData.get("documentUrl") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  if (contract.status === "ACTIVE") {
    await prisma.$transaction(async tx => ProviderContractsService.syncProviderSummary(tx, contract.providerId));
  }

  await writeAudit({
    userId: session.user.id,
    action: "PROVIDER_CONTRACT_UPDATED",
    module: "PROVIDERS",
    description: `Contract ${contract.contractNumber} terms updated`,
    metadata: { contractId },
  });

  contractPaths(contract.providerId, contractId);
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export async function contractLifecycleAction(formData: FormData): Promise<void> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const transition = formData.get("transition") as "ACTIVATE" | "SUSPEND" | "TERMINATE" | "REOPEN";
  const contract = await assertContract(contractId, session.user.tenantId);

  let errorMsg = "";
  try {
    if (transition === "ACTIVATE") {
      await ProviderContractsService.activateContract(session.user.tenantId, contractId);
    } else if (transition === "SUSPEND") {
      await ProviderContractsService.setContractStatus(session.user.tenantId, contractId, "SUSPENDED");
    } else if (transition === "TERMINATE") {
      await ProviderContractsService.setContractStatus(session.user.tenantId, contractId, "TERMINATED");
    } else if (transition === "REOPEN") {
      await ProviderContractsService.setContractStatus(session.user.tenantId, contractId, "DRAFT");
    }

    await writeAudit({
      userId: session.user.id,
      action: `PROVIDER_CONTRACT_${transition}`,
      module: "PROVIDERS",
      description: `Contract ${contract.contractNumber} → ${transition.toLowerCase()}`,
      metadata: { contractId },
    });
  } catch (err) {
    if ((err as Error).message === "NEXT_REDIRECT") throw err;
    errorMsg = (err as Error).message;
  }

  contractPaths(contract.providerId, contractId);
  if (errorMsg) {
    redirect(`/providers/${contract.providerId}/contracts/${contractId}?error=${encodeURIComponent(errorMsg)}`);
  }
}

export async function renewContractAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);

  let renewedId = "";
  let errorMsg = "";
  try {
    const renewed = await ProviderContractsService.renewContract(session.user.tenantId, contractId, {
      startDate: new Date(formData.get("startDate") as string),
      endDate: new Date(formData.get("endDate") as string),
      upliftPct: Number(formData.get("upliftPct") || 0),
      userId: session.user.id,
    });
    renewedId = renewed.id;

    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_CONTRACT_RENEWED",
      module: "PROVIDERS",
      description: `Contract ${contract.contractNumber} renewed as ${renewed.contractNumber} (uplift ${formData.get("upliftPct") || 0}%)`,
      metadata: { contractId, renewedId: renewed.id },
    });
  } catch (err) {
    if ((err as Error).message === "NEXT_REDIRECT") throw err;
    errorMsg = (err as Error).message;
  }

  contractPaths(contract.providerId, contractId);
  if (errorMsg) {
    redirect(`/providers/${contract.providerId}/contracts/${contractId}?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/providers/${contract.providerId}/contracts/${renewedId}`);
}

// ── Tariff schedule ─────────────────────────────────────────────────────────

export async function upsertContractTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);

  const tariffId = (formData.get("tariffId") as string) || null;
  const data = {
    cptCode: ((formData.get("cptCode") as string) || "").trim() || null,
    serviceName: (formData.get("serviceName") as string).trim(),
    agreedRate: Number(formData.get("agreedRate")),
    requiresPreauth: formData.get("requiresPreauth") === "on",
    maxQuantityPerVisit: formData.get("maxQuantityPerVisit") ? Number(formData.get("maxQuantityPerVisit")) : null,
    effectiveFrom: formData.get("effectiveFrom") ? new Date(formData.get("effectiveFrom") as string) : contract.startDate,
    effectiveTo: formData.get("effectiveTo") ? new Date(formData.get("effectiveTo") as string) : null,
  };
  if (!data.serviceName || Number.isNaN(data.agreedRate) || data.agreedRate <= 0) throw new Error("Service name and a positive rate are required");

  if (tariffId) {
    await prisma.providerTariff.update({ where: { id: tariffId, contractId }, data });
  } else {
    await prisma.providerTariff.create({ data: { ...data, providerId: contract.providerId, contractId } });
  }

  contractPaths(contract.providerId, contractId);
}

export async function deleteContractTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);
  const tariffId = formData.get("tariffId") as string;

  // Rates referenced by adjudicated claims should survive as audit trail —
  // deactivate instead of delete once the contract has been live.
  if (contract.status === "DRAFT") {
    await prisma.providerTariff.delete({ where: { id: tariffId, contractId } });
  } else {
    await prisma.providerTariff.update({ where: { id: tariffId, contractId }, data: { isActive: false, effectiveTo: new Date() } });
  }
  contractPaths(contract.providerId, contractId);
}

export async function importTariffCsvAction(
  _prev: { imported?: number; errors?: string[] } | null,
  formData: FormData,
): Promise<{ imported?: number; errors?: string[] }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);

  const raw = (formData.get("csv") as string) || "";
  const { rows, errors } = ProviderContractsService.parseTariffCsv(raw);
  if (rows.length === 0) return { imported: 0, errors: errors.length ? errors : ["No valid rows found."] };

  await prisma.providerTariff.createMany({
    data: rows.map(r => ({
      providerId: contract.providerId,
      contractId,
      cptCode: r.cptCode,
      serviceName: r.serviceName,
      agreedRate: r.agreedRate,
      requiresPreauth: r.requiresPreauth,
      maxQuantityPerVisit: r.maxQuantityPerVisit,
      effectiveFrom: contract.startDate,
    })),
  });

  await writeAudit({
    userId: session.user.id,
    action: "PROVIDER_CONTRACT_TARIFF_IMPORT",
    module: "PROVIDERS",
    description: `Imported ${rows.length} tariff lines into contract ${contract.contractNumber}`,
    metadata: { contractId, imported: rows.length, rejected: errors.length },
  });

  contractPaths(contract.providerId, contractId);
  return { imported: rows.length, errors };
}

export async function bulkUpliftAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);
  const upliftPct = Number(formData.get("upliftPct"));
  if (Number.isNaN(upliftPct) || upliftPct <= -100 || upliftPct === 0) throw new Error("Provide a non-zero uplift percentage");

  const lines = await prisma.providerTariff.findMany({ where: { contractId, isActive: true } });
  const factor = 1 + upliftPct / 100;
  await prisma.$transaction(
    lines.map(l =>
      prisma.providerTariff.update({
        where: { id: l.id },
        data: { agreedRate: Math.round(Number(l.agreedRate) * factor * 100) / 100 },
      }),
    ),
  );

  await writeAudit({
    userId: session.user.id,
    action: "PROVIDER_CONTRACT_TARIFF_UPLIFT",
    module: "PROVIDERS",
    description: `Applied ${upliftPct}% uplift to ${lines.length} tariff lines on contract ${contract.contractNumber}`,
    metadata: { contractId, upliftPct, lines: lines.length },
  });

  contractPaths(contract.providerId, contractId);
}

// ── Diagnosis (bundled / per-diem) rates ───────────────────────────────────

export async function upsertContractDiagnosisTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);

  const tariffId = (formData.get("diagTariffId") as string) || null;
  const data = {
    icdCode: (formData.get("icdCode") as string).trim(),
    diagnosisLabel: (formData.get("diagnosisLabel") as string).trim(),
    bundledRate: formData.get("bundledRate") ? Number(formData.get("bundledRate")) : null,
    perDayRate: formData.get("perDayRate") ? Number(formData.get("perDayRate")) : null,
    notes: (formData.get("notes") as string) || null,
    effectiveFrom: formData.get("effectiveFrom") ? new Date(formData.get("effectiveFrom") as string) : contract.startDate,
  };
  if (!data.icdCode || !data.diagnosisLabel) throw new Error("ICD code and label are required");
  if (data.bundledRate == null && data.perDayRate == null) throw new Error("Provide a bundled rate, a per-day rate, or both");

  if (tariffId) {
    await prisma.providerDiagnosisTariff.update({ where: { id: tariffId, contractId }, data });
  } else {
    await prisma.providerDiagnosisTariff.create({ data: { ...data, providerId: contract.providerId, contractId } });
  }
  contractPaths(contract.providerId, contractId);
}

export async function deleteContractDiagnosisTariffAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);
  const tariffId = formData.get("tariffId") as string;

  if (contract.status === "DRAFT") {
    await prisma.providerDiagnosisTariff.delete({ where: { id: tariffId, contractId } });
  } else {
    await prisma.providerDiagnosisTariff.update({ where: { id: tariffId, contractId }, data: { isActive: false, effectiveTo: new Date() } });
  }
  contractPaths(contract.providerId, contractId);
}

// ── Exclusions ──────────────────────────────────────────────────────────────

export async function upsertExclusionAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);

  const exclusionId = (formData.get("exclusionId") as string) || null;
  const data = {
    cptCode: ((formData.get("cptCode") as string) || "").trim() || null,
    serviceName: (formData.get("serviceName") as string).trim(),
    reason: (formData.get("reason") as string) || null,
  };
  if (!data.serviceName) throw new Error("Service name is required");

  if (exclusionId) {
    await prisma.providerContractExclusion.update({ where: { id: exclusionId, contractId }, data });
  } else {
    await prisma.providerContractExclusion.create({ data: { ...data, contractId } });
  }
  contractPaths(contract.providerId, contractId);
}

export async function deleteExclusionAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const contractId = formData.get("contractId") as string;
  const contract = await assertContract(contractId, session.user.tenantId);
  await prisma.providerContractExclusion.delete({ where: { id: formData.get("exclusionId") as string, contractId } });
  contractPaths(contract.providerId, contractId);
}
