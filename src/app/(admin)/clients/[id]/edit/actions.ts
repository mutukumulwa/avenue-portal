"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ClientsService } from "@/server/services/clients.service";
import { writeAudit } from "@/lib/audit";
import { fail } from "@/lib/action-result";
import { clientEditSchema, type ClientActionState } from "@/lib/validation/client";
import { mapClientP2002 } from "../../p2002";

/**
 * DEF-013/014 + D8 — edit a client. Currency is REQUIRED here (omitting it can no
 * longer silently rewrite the client to UGX); a rename re-checks normalized-name
 * uniqueness (DB unique → SP-2 field error with a link to the existing client);
 * and per D8/C-005 the currency is IMMUTABLE once the client has any scheme,
 * member, invoice, claim or ledger activity. slug + member prefix are not
 * accepted (immutable post-creation, DEF-012). Redirect only on success.
 */
export async function updateClientAction(
  clientId: string,
  _prev: ClientActionState | null,
  formData: FormData,
): Promise<ClientActionState> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const values: Record<string, string> = {
    name: (formData.get("name") as string) ?? "",
    type: (formData.get("type") as string) ?? "",
    currency: (formData.get("currency") as string) ?? "",
    status: (formData.get("status") as string) ?? "",
    parentClientId: (formData.get("parentClientId") as string) ?? "",
  };

  const parsed = clientEditSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    currency: formData.get("currency"),
    status: formData.get("status"),
    parentClientId: formData.get("parentClientId"),
  });
  if (!parsed.success) {
    return { ...fail(parsed.error.flatten().fieldErrors), values };
  }

  const current = await ClientsService.getById(session.user.tenantId, clientId);
  if (!current) return { ...fail(undefined, "Client not found."), values };

  // D8 / C-005 — currency is frozen once the client has downstream activity.
  if (parsed.data.currency !== current.currency) {
    const locked = await ClientsService.hasFinancialActivity(session.user.tenantId, clientId);
    if (locked) {
      return {
        ...fail({
          currency: [
            "Currency cannot be changed after the client has schemes, members, invoices, claims or ledger activity.",
          ],
        }),
        values,
      };
    }
  }

  try {
    await ClientsService.update(session.user.tenantId, clientId, {
      name: parsed.data.name,
      type: parsed.data.type,
      currency: parsed.data.currency,
      status: parsed.data.status,
      parentClientId: parsed.data.parentClientId,
    });
  } catch (err) {
    const mapped = await mapClientP2002(err, {
      operatorTenantId: session.user.tenantId,
      name: parsed.data.name,
      values,
    });
    if (mapped) return mapped;
    return {
      ...fail(undefined, err instanceof Error ? err.message : "Failed to update client"),
      values,
    };
  }

  await writeAudit({
    userId: session.user.id,
    action: "CLIENT_UPDATED",
    module: "CLIENTS",
    description: `Client updated: ${parsed.data.name} (${parsed.data.type}, ${parsed.data.status})`,
    metadata: {
      clientId,
      before: JSON.stringify({
        name: current.name,
        type: current.type,
        currency: current.currency,
        slug: current.slug,
        memberNumberPrefix: current.memberNumberPrefix,
        status: current.status,
        parentClientId: current.parentClientId,
      }),
      after: JSON.stringify({
        name: parsed.data.name,
        type: parsed.data.type,
        currency: parsed.data.currency,
        // slug + prefix are immutable — echoed so the diff is explicit.
        slug: current.slug,
        memberNumberPrefix: current.memberNumberPrefix,
        status: parsed.data.status,
        parentClientId: parsed.data.parentClientId,
      }),
    },
  });

  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}`);
}
