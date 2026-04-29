"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { ProvidersService } from "@/server/services/providers.service";

export async function getNearbyProvidersAction(lat: number, lng: number, radiusKm: number) {
  const session = await requireRole(ROLES.MEMBER);
  return ProvidersService.getNearbyProviders(session.user.tenantId, {
    latitude: lat,
    longitude: lng,
    radiusKm,
  });
}
