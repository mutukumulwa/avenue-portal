import type { CoContributionRule, Provider } from "@prisma/client";
import type { BenefitCategory, NetworkTier } from "@prisma/client";

type PartialProvider = Pick<Provider, "tier">;

const TIER_MAP: Record<string, NetworkTier> = {
  OWN: "TIER_1",
  PARTNER: "TIER_2",
  PANEL: "TIER_3",
};

export function providerToNetworkTier(provider: PartialProvider): NetworkTier {
  return TIER_MAP[provider.tier] ?? "TIER_3";
}

export function resolveRule(
  rules: CoContributionRule[],
  networkTier: NetworkTier,
  benefitCategory: BenefitCategory | null,
  claimDate: Date,
  clientId?: string | null,
): CoContributionRule | null {
  const active = rules.filter((r) => {
    if (!r.isActive) return false;
    if (r.effectiveFrom && claimDate < r.effectiveFrom) return false;
    if (r.effectiveTo && claimDate > r.effectiveTo) return false;
    return true;
  });

  // Most-specific rule wins. A client-specific rule (G3.4/G5.7) outranks the
  // package rule; then category + tier > category > tier > global.
  const score = (r: CoContributionRule) => {
    // A rule scoped to a different client never applies.
    if (r.clientId && r.clientId !== clientId) return -1;
    // Rules with a category that doesn't match the current claim are excluded.
    if (r.benefitCategory !== null && r.benefitCategory !== benefitCategory) return -1;
    let s = 0;
    if (r.clientId && r.clientId === clientId) s += 4; // client override wins
    if (r.benefitCategory !== null && r.benefitCategory === benefitCategory) s += 2;
    if (r.networkTier === networkTier) s += 1;
    return s;
  };

  const candidates = active.filter((r) => score(r) >= 0);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0]!;
}
