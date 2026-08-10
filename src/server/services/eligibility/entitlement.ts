/**
 * entitlement.ts — the shared, reusable entitlement checks the SP-6 evaluator
 * consumes (factored so preauth Gates 1–4 can converge on them rather than each
 * surface re-implementing the provider-network / waiting-period logic inline).
 *
 * These are PURE where possible; the DB reads live in the loader (`evaluator.ts`)
 * so the decision logic stays unit-testable. The structured exclusion/referral
 * evaluators already live in `./rules` and are the single home for those.
 */

/** Minimal projection of a PackageProviderEligibility row. */
export interface ProviderEligibilityRuleView {
  providerId: string | null;
  providerTier: string | null; // ProviderTier
  inclusionType: "INCLUDE" | "EXCLUDE";
}

/**
 * Is the servicing provider excluded under the member's pinned package version?
 * Mirrors preauth Gate 2 (D-02): an explicit EXCLUDE by provider id or tier wins;
 * when INCLUDE (whitelist) rules exist, a provider not on the whitelist is out of
 * network. No rules → open network. An inactive contract is out of network too.
 */
export function isProviderExcluded(
  rules: ProviderEligibilityRuleView[],
  provider: { id: string; tier: string; contractStatus: string } | null,
): boolean {
  // Unknown provider or an inactive contract cannot be confirmed in-network.
  if (!provider) return true;
  if (provider.contractStatus !== "ACTIVE") return true;

  if (rules.length === 0) return false;

  const excluded = rules.some(
    (r) =>
      r.inclusionType === "EXCLUDE" &&
      (r.providerId === provider.id || (!!r.providerTier && r.providerTier === provider.tier)),
  );
  if (excluded) return true;

  const includeRules = rules.filter((r) => r.inclusionType === "INCLUDE");
  if (includeRules.length > 0) {
    const included = includeRules.some(
      (r) => r.providerId === provider.id || (!!r.providerTier && r.providerTier === provider.tier),
    );
    if (!included) return true; // whitelist mode — not listed = out of network
  }
  return false;
}

/** Emergency-context detection from a benefit/context code (drives referral bypass). */
export function isEmergencyBenefit(benefitCode: string | null | undefined): boolean {
  if (!benefitCode) return false;
  const c = benefitCode.trim().toUpperCase();
  return c === "EMERGENCY" || c === "AMBULANCE_EMERGENCY";
}
