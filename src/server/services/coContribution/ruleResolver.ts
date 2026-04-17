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
): CoContributionRule | null {
  const active = rules.filter((r) => {
    if (!r.isActive) return false;
    if (r.effectiveFrom && claimDate < r.effectiveFrom) return false;
    if (r.effectiveTo && claimDate > r.effectiveTo) return false;
    return true;
  });

  // Most-specific rule wins: category + tier > category only > tier only > global (no category, no tier)
  const score = (r: CoContributionRule) => {
    let s = 0;
    if (r.benefitCategory !== null && r.benefitCategory === benefitCategory) s += 2;
    if (r.networkTier === networkTier) s += 1;
    // Rules with category that doesn't match current claim are excluded
    if (r.benefitCategory !== null && r.benefitCategory !== benefitCategory) return -1;
    return s;
  };

  const candidates = active.filter((r) => score(r) >= 0);
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => score(b) - score(a));
  return candidates[0]!;
}
