"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ClientsService } from "@/server/services/clients.service";
import { writeAudit } from "@/lib/audit";
import type { PayerType, ClientStatus } from "@prisma/client";

export async function updateClientAction(clientId: string, formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  let errorMsg = "";
  try {
    const name = (formData.get("name") as string)?.trim();
    const type = formData.get("type") as PayerType;
    const currency = (formData.get("currency") as string) || "UGX";
    const status = formData.get("status") as ClientStatus;
    const parentClientId = (formData.get("parentClientId") as string) || null;

    if (!name) throw new Error("Client name is required.");

    await ClientsService.update(session.user.tenantId, clientId, {
      name,
      type,
      currency,
      status,
      parentClientId,
    });

    await writeAudit({
      userId: session.user.id,
      action: "CLIENT_UPDATED",
      module: "CLIENTS",
      description: `Client updated: ${name} (${type}, ${status})`,
      metadata: { clientId, status },
    });
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to update client";
  }

  if (errorMsg) {
    redirect(`/clients/${clientId}/edit?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/clients/${clientId}`);
}
