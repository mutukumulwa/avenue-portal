import { prisma } from "@/lib/prisma";

// ─── BENEFIT FUNDING MODEL RESOLUTION (WP-F2, TPA_FEEDBACK_WORKPLAN.md §F) ───
// The benefit package decides how each claim line pays the provider (D8):
//   FEE_FOR_SERVICE — normal contract pricing (default; unchanged behaviour)
//   CAPITATION      — covered by the provider's prepaid pool; line payable 0
//   HYBRID          — per-service-tier split via BenefitConfig.fundingOverrides
// This is the BENEFIT-side switch. Contract-side capitation (a CAPITATION
// PricingRule on the provider contract) is handled by the contract engine and
// zero-prices lines with reason PRC-005 — the same reason is reused here.

export interface LineFunding {
  lineId: string;
  tier: string | null;
  capitated: boolean;
}

export interface ClaimFunding {
  model: "FEE_FOR_SERVICE" | "CAPITATION" | "HYBRID";
  capitatedTiers: string[];
  lines: LineFunding[];
  anyCapitated: boolean;
  /** Pool reference recorded on the claim for reconciliation reporting. */
  poolTag: string | null;
}

const FFS: ClaimFunding = {
  model: "FEE_FOR_SERVICE",
  capitatedTiers: [],
  lines: [],
  anyCapitated: false,
  poolTag: null,
};

export class FundingModelService {
  /**
   * Resolve the funding decision for every line on a claim from the member's
   * benefit config. Missing package/benefit/config ⇒ FFS (no behaviour change).
   */
  static async resolveForClaim(tenantId: string, claimId: string): Promise<ClaimFunding> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        benefitCategory: true,
        member: { select: { packageVersionId: true } },
        claimLines: { select: { id: true, serviceCategoryId: true } },
      },
    });
    if (!claim?.member?.packageVersionId) return FFS;

    const benefit = await prisma.benefitConfig.findFirst({
      where: {
        packageVersionId: claim.member.packageVersionId,
        category: claim.benefitCategory,
      },
      select: { fundingModel: true, fundingOverrides: true },
    });
    if (!benefit || benefit.fundingModel === "FEE_FOR_SERVICE") return FFS;

    const overrides = Array.isArray(benefit.fundingOverrides)
      ? (benefit.fundingOverrides as { tier?: string; model?: string }[])
      : [];
    const capitatedTiers =
      benefit.fundingModel === "HYBRID"
        ? overrides.filter((o) => o.model === "CAPITATION" && o.tier).map((o) => o.tier as string)
        : [];

    // Effective tier per line (children inherit nearest ancestor tier, WP-E1).
    const categories = await prisma.serviceCategory.findMany({
      where: { tenantId },
      select: { id: true, parentId: true, tier: true },
    });
    const byId = new Map(categories.map((c) => [c.id, c]));
    const tierOf = (categoryId: string | null): string | null => {
      let current = categoryId ? byId.get(categoryId) : undefined;
      let guard = 0;
      while (current && guard++ < 10) {
        if (current.tier) return current.tier;
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      return null;
    };

    const capitatedTierSet = new Set(capitatedTiers);
    const lines: LineFunding[] = claim.claimLines.map((l) => {
      const tier = tierOf(l.serviceCategoryId);
      const capitated =
        benefit.fundingModel === "CAPITATION" || (tier !== null && capitatedTierSet.has(tier));
      return { lineId: l.id, tier, capitated };
    });

    const anyCapitated = lines.some((l) => l.capitated);
    return {
      model: benefit.fundingModel,
      capitatedTiers,
      lines,
      anyCapitated,
      poolTag: anyCapitated ? "BENEFIT_CAPITATION_POOL" : null,
    };
  }

  /**
   * Apply the funding decision to a decided claim: zero the capitated lines
   * (reason PRC-005 semantics — covered by capitation) and tag the claim's
   * pool reference for reconciliation reporting.
   */
  static async applyToDecidedClaim(tenantId: string, claimId: string, funding: ClaimFunding) {
    if (!funding.anyCapitated) return;
    const capitatedIds = funding.lines.filter((l) => l.capitated).map((l) => l.lineId);
    await prisma.$transaction([
      prisma.claimLine.updateMany({
        where: { id: { in: capitatedIds }, claimId },
        data: {
          approvedAmount: 0,
          adjudicationDecision: "APPROVED_WITH_ADJUSTMENT",
          adjustedAmount: 0,
          adjustmentReason: "COVERED_BY_CAPITATION — prepaid via the provider's capitation pool",
          payableSource: "Benefit capitation — encounter recorded at 0",
        },
      }),
      prisma.claim.update({
        where: { id: claimId, tenantId },
        data: { avgCostPoolId: funding.poolTag },
      }),
    ]);
  }
}
