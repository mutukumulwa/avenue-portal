/**
 * Family Hospital UAT plan P01.02 step 3 / P03.03 — which claim-line category a
 * tariff row belongs under.
 *
 * The claim line carries a six-value enum (`ClaimLineCategory`); tariffs carry a
 * tenant taxonomy (`ServiceCategory`, with a fee-schedule `tier`). The provider
 * form filters the tariff search by line category, so this mapping decides what
 * appears under which filter. It does NOT decide what is paid: no pricing or
 * decision code reads a line's category (checked 2026-09-11).
 *
 * The plan asks for an EXPLICIT mapping, reviewed, rather than free-text
 * inference, and forbids silently forcing a clinical category whose meaning is
 * unclear. So:
 *
 *   1. explicit code overrides (reviewed — FAMILY_HOSPITAL_UAT_DECISIONS.md
 *      DEC-FH-X1), matched against the category and then its ancestors;
 *   2. otherwise the effective tier, using the plan's table;
 *   3. otherwise OTHER, reported as UNMAPPED so it can be reviewed.
 *
 * Pure: no database, safe on client and server.
 */
import type { ClaimLineCategory, ServiceTier } from "@prisma/client";

/** Line categories, in the order the form offers them. */
export const CLAIM_LINE_CATEGORIES: readonly ClaimLineCategory[] = [
  "CONSULTATION",
  "LABORATORY",
  "PHARMACY",
  "IMAGING",
  "PROCEDURE",
  "OTHER",
] as const;

export const CLAIM_LINE_CATEGORY_LABELS: Record<ClaimLineCategory, string> = {
  CONSULTATION: "Consultation",
  LABORATORY: "Laboratory",
  PHARMACY: "Pharmacy (drugs & consumables)",
  IMAGING: "Imaging",
  PROCEDURE: "Procedure",
  OTHER: "Other",
};

/**
 * Reviewed code overrides (DEC-FH-X1). Each one departs from, or adds to, the
 * tier rule for a stated reason.
 */
export const EXPLICIT_CATEGORY_OVERRIDES: Readonly<Record<string, { category: ClaimLineCategory; reason: string }>> = {
  PROCEDURE: {
    category: "PROCEDURE",
    reason: 'The category is literally "Procedure"; its OTHER tier is a fee band, not a clinical meaning.',
  },
  IP_SERVICES: {
    category: "OTHER",
    reason: "Per-day inpatient accommodation, meals and nursing are not consultations, although their fee tier is HEADLINE.",
  },
};

/** The plan's tier table (P01.02 step 3). */
export const TIER_TO_LINE_CATEGORY: Readonly<Record<ServiceTier, ClaimLineCategory>> = {
  HEADLINE: "CONSULTATION",
  LABORATORY: "LABORATORY",
  PHARMACY: "PHARMACY",
  IMAGING: "IMAGING",
  THEATRE: "PROCEDURE",
  PROFESSIONAL_FEES: "PROCEDURE",
  OTHER: "OTHER",
};

export interface TaxonomyNode {
  code: string;
  tier: ServiceTier | null;
}

export type LineCategoryBasis = "EXPLICIT" | "TIER" | "UNMAPPED";

/**
 * Resolve a taxonomy chain — `[category, parent, grandparent, …]` — to a line
 * category. An explicit override anywhere on the chain wins over any tier, so an
 * override on a parent (IP_SERVICES) also governs its children (ICU, IP_REVIEW).
 */
export function lineCategoryForTaxonomy(chain: readonly TaxonomyNode[]): {
  category: ClaimLineCategory;
  basis: LineCategoryBasis;
} {
  for (const node of chain) {
    const override = EXPLICIT_CATEGORY_OVERRIDES[node.code];
    if (override) return { category: override.category, basis: "EXPLICIT" };
  }
  for (const node of chain) {
    if (node.tier) return { category: TIER_TO_LINE_CATEGORY[node.tier], basis: "TIER" };
  }
  return { category: "OTHER", basis: "UNMAPPED" };
}

/**
 * Build `[node, parent, …]` from a flat list keyed by id. Cycles and unknown
 * parents terminate the walk rather than looping.
 */
export function taxonomyChain<T extends TaxonomyNode & { id: string; parentId: string | null }>(
  byId: ReadonlyMap<string, T>,
  categoryId: string | null | undefined,
): T[] {
  const chain: T[] = [];
  const seen = new Set<string>();
  let current = categoryId ? byId.get(categoryId) : undefined;
  while (current && !seen.has(current.id)) {
    chain.push(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

export function isClaimLineCategory(value: unknown): value is ClaimLineCategory {
  return typeof value === "string" && (CLAIM_LINE_CATEGORIES as readonly string[]).includes(value);
}
