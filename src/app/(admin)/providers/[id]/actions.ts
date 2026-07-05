"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { ProvidersService } from "@/server/services/providers.service";

// ── Provider master data + status lifecycle (PR-006) ───────────────────────

const MASTER_FIELDS = ["name", "phone", "email", "contactPerson", "address", "county"] as const;

/** Edit provider master data with an audited field-level diff (PR-006 #1 / PR-020). */
export async function updateProviderMasterAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const providerId = formData.get("providerId") as string;

  let errorMsg = "";
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: providerId, tenantId: session.user.tenantId },
    });
    if (!provider) throw new Error("Provider not found");

    const data: Record<string, string | null> = {};
    const diff: Record<string, { before: unknown; after: unknown }> = {};
    for (const key of MASTER_FIELDS) {
      const raw = formData.get(key);
      if (raw === null) continue;
      const after = String(raw).trim() || null;
      const before = (provider as Record<string, unknown>)[key] ?? null;
      if (after === before) continue;
      if (key === "name" && !after) throw new Error("Provider name cannot be empty.");
      data[key] = after;
      diff[key] = { before, after };
    }
    const services = formData.getAll("servicesOffered").map(String).filter(Boolean);
    if (formData.has("servicesPresent") && JSON.stringify(services) !== JSON.stringify(provider.servicesOffered)) {
      (data as Record<string, unknown>)["servicesOffered"] = services;
      diff["servicesOffered"] = { before: provider.servicesOffered, after: services };
    }

    if (Object.keys(diff).length > 0) {
      await ProvidersService.updateProvider(session.user.tenantId, providerId, data as never);
      await writeAudit({
        userId: session.user.id,
        action: "PROVIDER_UPDATED",
        module: "PROVIDERS",
        description: `Provider "${provider.name}" master data edited: ${Object.keys(diff).join(", ")}`,
        metadata: { providerId, diff: JSON.stringify(diff) },
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Update failed";
  }

  revalidatePath(`/providers/${providerId}`);
  redirect(
    `/providers/${providerId}?${errorMsg ? `error=${encodeURIComponent(errorMsg)}` : `notice=${encodeURIComponent("Provider details updated.")}`}`,
  );
}

/** Activate / suspend / reactivate with confirmation reason (PR-006 #2). */
export async function setProviderStatusAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const providerId = formData.get("providerId") as string;
  const status = formData.get("status") as "ACTIVE" | "SUSPENDED" | "PENDING";
  const reason = ((formData.get("reason") as string) || "").trim();

  let errorMsg = "";
  let noticeMsg = "";
  try {
    if (!["ACTIVE", "SUSPENDED", "PENDING"].includes(status)) throw new Error("Unknown provider status.");
    // Defense in depth behind the form's native `required minLength={5}`.
    if (reason.length < 5) throw new Error("A status-change reason (min 5 characters) is required.");
    const { previousStatus, name } = await ProvidersService.setProviderStatus(
      session.user.tenantId, providerId, status, reason,
    );
    await writeAudit({
      userId: session.user.id,
      action: `PROVIDER_STATUS_${status}`,
      module: "PROVIDERS",
      description: `Provider "${name}" ${previousStatus} → ${status}: ${reason}`,
      metadata: { providerId, previousStatus, status, reason },
    });
    noticeMsg =
      status === "ACTIVE"
        ? "Provider activated — now selectable for claims, pre-auths and check-ins."
        : status === "SUSPENDED"
          ? "Provider suspended — new encounters blocked; existing claims remain settleable."
          : "Provider set back to PENDING.";
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Status change failed";
  }

  revalidatePath(`/providers/${providerId}`);
  revalidatePath("/providers");
  redirect(
    `/providers/${providerId}?${errorMsg ? `error=${encodeURIComponent(errorMsg)}` : `notice=${encodeURIComponent(noticeMsg)}`}`,
  );
}

// ── Branches + aliases (PR-007) ─────────────────────────────────────────────

async function guardedProvider(formData: FormData, fn: (providerId: string) => Promise<string>) {
  const providerId = formData.get("providerId") as string;
  let errorMsg = "";
  let notice = "";
  try {
    notice = await fn(providerId);
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Action failed";
  }
  revalidatePath(`/providers/${providerId}`);
  redirect(
    `/providers/${providerId}?${errorMsg ? `error=${encodeURIComponent(errorMsg)}` : `notice=${encodeURIComponent(notice)}`}`,
  );
}

export async function createBranchAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  await guardedProvider(formData, async (providerId) => {
    const name = ((formData.get("name") as string) || "").trim();
    if (!name) throw new Error("Branch name is required.");
    const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
    if (!provider) throw new Error("Provider not found");
    const branch = await prisma.providerBranch.create({
      data: {
        tenantId: session.user.tenantId,
        providerId,
        name,
        code: ((formData.get("code") as string) || "").trim() || null,
        county: ((formData.get("county") as string) || "").trim() || null,
        address: ((formData.get("address") as string) || "").trim() || null,
      },
    });
    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_BRANCH_CREATED",
      module: "PROVIDERS",
      description: `Branch "${branch.name}" added to provider "${provider.name}"`,
      metadata: { providerId, branchId: branch.id },
    });
    return `Branch "${branch.name}" added.`;
  });
}

export async function setBranchActiveAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  await guardedProvider(formData, async (providerId) => {
    const branchId = formData.get("branchId") as string;
    const isActive = formData.get("isActive") === "true";
    const branch = await prisma.providerBranch.findUnique({ where: { id: branchId } });
    if (!branch || branch.tenantId !== session.user.tenantId || branch.providerId !== providerId) {
      throw new Error("Branch not found");
    }
    await prisma.providerBranch.update({ where: { id: branchId }, data: { isActive } });
    await writeAudit({
      userId: session.user.id,
      action: isActive ? "PROVIDER_BRANCH_REACTIVATED" : "PROVIDER_BRANCH_DEACTIVATED",
      module: "PROVIDERS",
      description: `Branch "${branch.name}" ${isActive ? "reactivated" : "deactivated"}`,
      metadata: { providerId, branchId },
    });
    return `Branch "${branch.name}" ${isActive ? "reactivated" : "deactivated"} — ${isActive ? "selectable again" : "no longer selectable on new encounters; historical claims unaffected"}.`;
  });
}

export async function createAliasAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  await guardedProvider(formData, async (providerId) => {
    const aliasName = ((formData.get("aliasName") as string) || "").trim();
    if (!aliasName) throw new Error("Alias name is required.");
    const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
    if (!provider) throw new Error("Provider not found");
    await prisma.providerAlias.create({
      data: {
        tenantId: session.user.tenantId,
        providerId,
        aliasName,
        source: ((formData.get("source") as string) || "").trim() || "MANUAL",
      },
    });
    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_ALIAS_CREATED",
      module: "PROVIDERS",
      description: `Alias "${aliasName}" added to provider "${provider.name}"`,
      metadata: { providerId, aliasName },
    });
    return `Alias "${aliasName}" added.`;
  });
}

export async function deleteAliasAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  await guardedProvider(formData, async (providerId) => {
    const aliasId = formData.get("aliasId") as string;
    const alias = await prisma.providerAlias.findUnique({ where: { id: aliasId } });
    if (!alias || alias.tenantId !== session.user.tenantId) throw new Error("Alias not found");
    await prisma.providerAlias.delete({ where: { id: aliasId } });
    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_ALIAS_DELETED",
      module: "PROVIDERS",
      description: `Alias "${alias.aliasName}" removed`,
      metadata: { providerId, aliasId },
    });
    return `Alias "${alias.aliasName}" removed.`;
  });
}

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
  const currency    = ((formData.get("currency") as string) || "UGX").trim().toUpperCase();
  // Per-client override (G5.4): empty = network master rate; set = this client's
  // negotiated rate, which wins at claim-line resolution.
  const clientId    = ((formData.get("clientId") as string) || "").trim() || null;
  const effectiveFrom = new Date(formData.get("effectiveFrom") as string);
  const effectiveTo   = formData.get("effectiveTo") ? new Date(formData.get("effectiveTo") as string) : null;

  // Verify provider belongs to tenant
  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId: session.user.tenantId } });
  if (!provider) throw new Error("Provider not found");

  // Verify the client (if any) belongs to this operator
  if (clientId) {
    const client = await prisma.client.findFirst({
      where: { id: clientId, operatorTenantId: session.user.tenantId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found");
  }

  if (tariffId) {
    await prisma.providerTariff.update({
      where: { id: tariffId },
      data: { cptCode, serviceName, agreedRate, currency, clientId, effectiveFrom, effectiveTo },
    });
  } else {
    await prisma.providerTariff.create({
      data: { providerId, cptCode, serviceName, agreedRate, currency, clientId, effectiveFrom, effectiveTo },
    });
  }

  await writeAudit({
    userId: session.user.id,
    action: tariffId ? "PROVIDER_TARIFF_UPDATED" : "PROVIDER_TARIFF_CREATED",
    module: "PROVIDERS",
    description: `Provider tariff ${serviceName} @ ${agreedRate} ${currency}${clientId ? " (client override)" : " (network master)"}`,
    metadata: { providerId, tariffId, clientId, cptCode, agreedRate, currency },
  });

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
