/**
 * UAT-HF P09.06 — what archiving a package would actually affect.
 *
 * DEF-025 (S2): "A package is archived by changing a Status dropdown ... styled
 * like every other form field and committed by the same generic 'Save Changes'
 * button used for harmless edits ... Critically, repeating the selection on a
 * package that an ACTIVE scheme is bound to produced **no dependency warning of
 * any kind** — nothing indicates the package is in use or which scheme would be
 * affected."
 *
 * The dependency data existed all along; nothing asked for it. This asks.
 *
 * It reports and does not decide: whether an in-use package may be archived is a
 * business call, and the caller (P09.06's guard) applies the policy. Keeping the
 * two apart means the same numbers can be shown on screen *before* the operator
 * commits, which is the half of DEF-025 a server-side refusal alone would miss.
 */

import type { PrismaClient } from "@prisma/client";

export interface DependentScheme {
  id: string;
  name: string;
  /** How the package is reached: directly, or through a named benefit tier. */
  via: "SCHEME" | "TIER";
  tierName?: string;
}

export interface PackageArchiveImpact {
  /** Schemes that would be left pointing at an archived package. */
  schemes: DependentScheme[];
  /** Members currently enrolled on it. */
  memberCount: number;
  /** True when archiving would affect live cover. */
  inUse: boolean;
}

type Db = Pick<PrismaClient, "group" | "groupBenefitTier" | "member">;

/**
 * Everything that would be affected by archiving `packageId`.
 *
 * Tenant-scoped, and it counts MEMBERS rather than only schemes: a scheme with
 * no members is a configuration problem, a scheme with two thousand is an
 * incident. The operator should be able to tell those apart before clicking.
 */
export async function getPackageArchiveImpact(
  db: Db,
  tenantId: string,
  packageId: string,
): Promise<PackageArchiveImpact> {
  const [directGroups, tiers, memberCount] = await Promise.all([
    db.group.findMany({
      where: { tenantId, packageId },
      select: { id: true, name: true },
    }),
    db.groupBenefitTier.findMany({
      where: { packageId, group: { tenantId } },
      select: { name: true, group: { select: { id: true, name: true } } },
    }),
    db.member.count({ where: { tenantId, packageId } }),
  ]);

  const schemes: DependentScheme[] = [
    ...directGroups.map((g) => ({ id: g.id, name: g.name, via: "SCHEME" as const })),
    ...tiers
      .filter((t) => t.group)
      .map((t) => ({
        id: t.group!.id,
        name: t.group!.name,
        via: "TIER" as const,
        tierName: t.name,
      })),
  ];

  // A scheme reached both directly and through a tier is one scheme.
  const seen = new Set<string>();
  const deduped = schemes.filter((s) => {
    const key = `${s.id}:${s.via}:${s.tierName ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    schemes: deduped,
    memberCount,
    inUse: deduped.length > 0 || memberCount > 0,
  };
}

/** One sentence naming the consequence, for the confirmation. */
export function describeArchiveImpact(impact: PackageArchiveImpact, packageName: string): string {
  if (!impact.inUse) {
    return `"${packageName}" is not used by any scheme and has no enrolled members. Archiving it hides it from new configuration.`;
  }
  const schemePart =
    impact.schemes.length === 1
      ? `1 scheme (${impact.schemes[0].name})`
      : `${impact.schemes.length} schemes`;
  const memberPart =
    impact.memberCount === 1 ? "1 enrolled member" : `${impact.memberCount} enrolled members`;
  return `"${packageName}" is currently used by ${schemePart} and has ${memberPart}. Archiving it does NOT move or end their cover — it leaves those schemes pointing at an archived package.`;
}

/** Hidden field the archive confirmation posts back. */
export const ARCHIVE_ACKNOWLEDGEMENT_FIELD = "__confirmArchiveInUse";
