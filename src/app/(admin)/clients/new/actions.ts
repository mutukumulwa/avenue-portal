"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ClientsService } from "@/server/services/clients.service";
import { writeAudit } from "@/lib/audit";
import type { PayerType } from "@prisma/client";

export async function createClientAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  let errorMsg = "";
  try {
    const name = (formData.get("name") as string)?.trim();
    const type = formData.get("type") as PayerType;
    const currency = (formData.get("currency") as string) || "UGX";
    const slug = (formData.get("slug") as string) || undefined;
    const parentClientId = (formData.get("parentClientId") as string) || null;
    const memberNumberPrefix = (formData.get("memberNumberPrefix") as string) || undefined;

    if (!name) throw new Error("Client name is required.");
    if (!type) throw new Error("Client type is required.");

    const client = await ClientsService.create(session.user.tenantId, {
      name,
      type,
      currency,
      slug,
      parentClientId,
      memberNumberPrefix,
    });

    await writeAudit({
      userId: session.user.id,
      action: "CLIENT_CREATED",
      module: "CLIENTS",
      description: `New client created: ${name} (${type})`,
      metadata: { clientId: client.id, type, currency: client.currency },
    });
  } catch (err: any) {
    if (err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to create client";
  }

  if (errorMsg) {
    redirect(`/clients/new?error=${encodeURIComponent(errorMsg)}`);
  }
  redirect("/clients");
}
