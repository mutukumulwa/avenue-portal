"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ProvidersService, DuplicateProviderNameError } from "@/server/services/providers.service";
import { writeAudit } from "@/lib/audit";
import type { ProviderType, ProviderTier } from "@prisma/client";

export interface AddProviderState {
  error?: string;
  /** PR-005 #3: duplicate-name warning — offer "open it / create anyway". */
  duplicateOf?: { id: string; name: string };
}

export async function addProviderAction(
  _prev: AddProviderState | null,
  formData: FormData
): Promise<AddProviderState> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const servicesRaw = formData.getAll("servicesOffered") as string[];
  const createAnyway = formData.get("createAnyway") === "on";

  let providerId: string;
  try {
    const provider = await ProvidersService.createProvider(session.user.tenantId, {
      name:              formData.get("name")              as string,
      type:              formData.get("type")              as ProviderType,
      tier:              formData.get("tier")              as ProviderTier,
      address:           formData.get("address")           as string,
      county:            formData.get("county")            as string,
      phone:             formData.get("phone")             as string,
      email:             formData.get("email")             as string,
      contactPerson:     formData.get("contactPerson")     as string,
      servicesOffered:   servicesRaw.filter(Boolean),
      paymentTermDays:   Number(formData.get("paymentTermDays") || 30),
      // Contract data now lives in the ProviderContract register — providers
      // start as PENDING until explicitly activated (PR-006 lifecycle).
      contractStatus:    "PENDING",
      geoLatitude:       formData.get("geoLatitude") ? Number(formData.get("geoLatitude")) : undefined,
      geoLongitude:      formData.get("geoLongitude") ? Number(formData.get("geoLongitude")) : undefined,
      allowDuplicateName: createAnyway,
    });
    providerId = provider.id;

    // PR-020: provider creation is an auditable business mutation.
    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_CREATED",
      module: "PROVIDERS",
      description: `Provider "${provider.name}" registered (${provider.type}, ${provider.tier}) — status PENDING${createAnyway ? "; duplicate name accepted explicitly" : ""}`,
      metadata: { providerId: provider.id, createAnyway },
    });
  } catch (err) {
    if (err instanceof DuplicateProviderNameError) {
      return {
        error: err.message,
        duplicateOf: { id: err.existingId, name: err.existingName },
      };
    }
    return { error: (err as Error).message };
  }

  // PR-005 #1: success lands on the new provider's detail page with a
  // confirmation. (The pre-fix code called redirect() INSIDE the try block, so
  // Next's control-flow NEXT_REDIRECT was swallowed by the catch and the form
  // just sat there — the silent-create defect.)
  redirect(`/providers/${providerId}?notice=${encodeURIComponent("Provider registered — status PENDING until activated.")}`);
}
