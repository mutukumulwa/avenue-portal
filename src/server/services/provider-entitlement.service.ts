import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Resolves which members a provider facility is entitled to look up over the
 * B2B API (eligibility / benefits). E2E-D02: a per-facility key must not be
 * able to read the PII of members outside the clients its contracts cover.
 *
 * The entitlement chain is Provider → active ProviderContract →
 * ContractApplicability (clientId, optional groupId) and a Member is reachable
 * via Member → Group → Group.clientId. A provider may therefore resolve a
 * member iff the member's client (or specific group) is covered by an active,
 * currently-effective INCLUDE applicability row on one of the provider's active
 * contracts — and is not carved out by an EXCLUDE row.
 *
 * NOTE (production data caveat, 2026-07): several employers (e.g. Safaricom,
 * KCB) are currently modelled as Groups under one shared "Medvex — Default
 * Client", so client-level scoping isolates properly-separated clients (e.g.
 * NWSC) but does not separate those co-tenant groups from one another. Finer
 * isolation there is a data-modelling change (promote each employer to its own
 * Client, or attach group-level applicability), not a code change.
 */
export class ProviderEntitlementService {
  /**
   * Prisma `where` fragment confining a Member query to the given provider's
   * contracted clients/groups. Deny-by-default: a provider with no active,
   * effective INCLUDE applicability resolves no members (impossible filter).
   */
  static async entitledMemberWhere(
    providerId: string,
    now: Date = new Date(),
  ): Promise<Prisma.MemberWhereInput> {
    const rows = await prisma.contractApplicability.findMany({
      where: {
        isActive: true,
        contract: { providerId, status: "ACTIVE" },
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      select: { clientId: true, groupId: true, inclusionType: true },
    });

    const includeClientIds = new Set<string>(); // groupId == null → all groups of the client
    const includeGroupIds = new Set<string>(); // groupId set → that group only
    const excludeClientIds = new Set<string>();
    const excludeGroupIds = new Set<string>();

    for (const r of rows) {
      const [clientBucket, groupBucket] =
        r.inclusionType === "EXCLUDE"
          ? [excludeClientIds, excludeGroupIds]
          : [includeClientIds, includeGroupIds];
      if (r.groupId) groupBucket.add(r.groupId);
      else clientBucket.add(r.clientId);
    }

    // Nothing included → the facility is entitled to no members.
    if (includeClientIds.size === 0 && includeGroupIds.size === 0) {
      return { id: "__no_provider_entitlement__" };
    }

    const allow: Prisma.MemberWhereInput[] = [];
    if (includeClientIds.size) allow.push({ group: { clientId: { in: [...includeClientIds] } } });
    if (includeGroupIds.size) allow.push({ groupId: { in: [...includeGroupIds] } });

    const deny: Prisma.MemberWhereInput[] = [];
    if (excludeClientIds.size) deny.push({ group: { clientId: { in: [...excludeClientIds] } } });
    if (excludeGroupIds.size) deny.push({ groupId: { in: [...excludeGroupIds] } });

    const allowClause: Prisma.MemberWhereInput = allow.length === 1 ? allow[0] : { OR: allow };
    return deny.length ? { AND: [allowClause, { NOT: { OR: deny } }] } : allowClause;
  }
}
