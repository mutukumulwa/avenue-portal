"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { ProvidersService } from "@/server/services/providers.service";
import { MemberAppService } from "@/server/services/member-app.service";

export async function getNearbyProvidersAction(
  lat: number,
  lng: number,
  radiusKm: number,
  procedureCode = "99213",
  providerTier: "ALL" | "OWN" | "PARTNER" | "PANEL" = "ALL",
  serviceHint?: string,
) {
  const session = await requireRole(ROLES.MEMBER);
  const member = await MemberAppService.resolveMemberContext(session.user.id, session.user.tenantId);
  if (!member) return [];

  return ProvidersService.getNearbyProvidersWithMemberEstimates(session.user.tenantId, member.id, {
    latitude: lat,
    longitude: lng,
    radiusKm,
    procedureCode,
    providerTier,
    serviceHint,
  });
}

export async function getProcedureCatalogAction() {
  await requireRole(ROLES.MEMBER);
  return ProvidersService.getMemberProcedureCatalog();
}
