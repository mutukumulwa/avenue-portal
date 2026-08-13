"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
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

  return ProvidersService.getNearbyProvidersWithMemberEstimates(
    session.user.tenantId,
    member.id,
    { latitude: lat, longitude: lng, radiusKm, procedureCode, providerTier, serviceHint },
  );
}

/**
 * UAT-HF P03.03 — why Find Care found nothing (DEF-007).
 *
 * The run set the radius to its 100 km maximum and Facility type to "All active
 * facilities" and still saw "No facilities found", against a network of 195
 * contracted providers. Its own note is that the mechanism was "not diagnosed
 * from the front end".
 *
 * It is a data gap, not a search bug: the distance query requires
 * `geoLatitude IS NOT NULL`, and **no provider in production carries
 * coordinates**. No radius could ever have returned a result.
 *
 * Geocoding the network is an operations task. What the product must not do
 * meanwhile is what the register objects to — "the confident empty state tells
 * the member there is no covered care near them rather than admitting it could
 * not answer". This distinguishes the two, so the member is told the truth and
 * still gets a list they can act on.
 */
export async function explainEmptyFacilityResultAction(): Promise<{
  reason: "NO_MAPPED_FACILITIES" | "NONE_IN_RADIUS";
  mappableCount: number;
  directory: { id: string; name: string; tier: string; type: string; address: string | null }[];
}> {
  const session = await requireRole(ROLES.MEMBER);

  const mappableCount = await prisma.provider.count({
    where: {
      tenantId: session.user.tenantId,
      contractStatus: "ACTIVE",
      geoLatitude: { not: null },
      geoLongitude: { not: null },
    },
  });

  if (mappableCount > 0) {
    return { reason: "NONE_IN_RADIUS", mappableCount, directory: [] };
  }

  // Nothing can be mapped, so distance is not the question. Give the member the
  // contracted network as a plain list — a name and a district they can ring is
  // more use than a correct-sounding "none found".
  const directory = await prisma.provider.findMany({
    where: { tenantId: session.user.tenantId, contractStatus: "ACTIVE" },
    select: { id: true, name: true, tier: true, type: true, address: true },
    orderBy: { name: "asc" },
    take: 100,
  });

  return {
    reason: "NO_MAPPED_FACILITIES",
    mappableCount,
    directory: directory.map((d) => ({ ...d, tier: String(d.tier), type: String(d.type) })),
  };
}

export async function getProcedureCatalogAction() {
  await requireRole(ROLES.MEMBER);
  return ProvidersService.getMemberProcedureCatalog();
}
