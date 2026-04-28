"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

export async function createBrokerAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const name = (formData.get("name") as string).trim();
  const contactPerson = (formData.get("contactPerson") as string).trim();
  const phone = (formData.get("phone") as string).trim();
  const email = (formData.get("email") as string).trim().toLowerCase();

  if (!name || !contactPerson || !phone || !email) {
    return { error: "Name, contact person, phone, and email are required." };
  }

  const broker = await prisma.broker.create({
    data: {
      tenantId: session.user.tenantId,
      name,
      contactPerson,
      phone,
      email,
      address: ((formData.get("address") as string | null) || "").trim() || null,
      licenseNumber: ((formData.get("licenseNumber") as string | null) || "").trim() || null,
      firstYearCommissionPct: Number(formData.get("firstYearCommissionPct") || 0),
      renewalCommissionPct: Number(formData.get("renewalCommissionPct") || 0),
      flatFeePerMember: formData.get("flatFeePerMember") ? Number(formData.get("flatFeePerMember")) : null,
      status: (formData.get("status") as string) || "ACTIVE",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "BROKER_CREATED",
    module: "BROKERS",
    description: `Broker created: ${broker.name}`,
    metadata: { brokerId: broker.id },
  });

  redirect(`/brokers/${broker.id}`);
}

export async function updateBrokerAction(
  brokerId: string,
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  await prisma.broker.update({
    where: { id: brokerId, tenantId: session.user.tenantId },
    data: {
      name: (formData.get("name") as string).trim(),
      contactPerson: (formData.get("contactPerson") as string).trim(),
      phone: (formData.get("phone") as string).trim(),
      email: (formData.get("email") as string).trim().toLowerCase(),
      address: ((formData.get("address") as string | null) || "").trim() || null,
      licenseNumber: ((formData.get("licenseNumber") as string | null) || "").trim() || null,
      firstYearCommissionPct: Number(formData.get("firstYearCommissionPct") || 0),
      renewalCommissionPct: Number(formData.get("renewalCommissionPct") || 0),
      flatFeePerMember: formData.get("flatFeePerMember") ? Number(formData.get("flatFeePerMember")) : null,
      status: (formData.get("status") as string) || "ACTIVE",
    },
  });

  redirect(`/brokers/${brokerId}`);
}
