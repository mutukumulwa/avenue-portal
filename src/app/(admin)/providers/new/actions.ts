"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { ProvidersService } from "@/server/services/providers.service";
import type { ProviderType, ProviderTier } from "@prisma/client";

export async function addProviderAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);

  const servicesRaw = formData.getAll("servicesOffered") as string[];

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
      contractStatus:    formData.get("contractStatus")    as string,
      contractStartDate: formData.get("contractStartDate") as string,
      contractEndDate:   formData.get("contractEndDate")   as string,
      contractNotes:     formData.get("contractNotes")     as string,
      geoLatitude:       formData.get("geoLatitude") ? Number(formData.get("geoLatitude")) : undefined,
      geoLongitude:      formData.get("geoLongitude") ? Number(formData.get("geoLongitude")) : undefined,
    });
    redirect(`/providers/${provider.id}`);
  } catch (err) {
    return { error: (err as Error).message };
  }
}
