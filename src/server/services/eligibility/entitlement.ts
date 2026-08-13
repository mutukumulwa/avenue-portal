/**
 * entitlement.ts — the shared, reusable entitlement checks the SP-6 evaluator
 * consumes (factored so preauth Gates 1–4 can converge on them rather than each
 * surface re-implementing the provider-network / waiting-period logic inline).
 *
 * These are PURE where possible; the DB reads live in the loader (`evaluator.ts`)
 * so the decision logic stays unit-testable. The structured exclusion/referral
 * evaluators already live in `./rules` and are the single home for those.
 */

import { resolveProviderRule, type ProviderRuleInput } from "@/lib/provider-precedence";

/**
 * Minimal projection of a PackageProviderEligibility row.
 *
 * UAT-HF P09.05 widened this to carry precedence: `id` so a verdict can name the
 * rule that decided it, and priority/window/active so DEC-04's ladder can be
 * applied. All four are optional so existing callers and fixtures still compile;
 * a row without them behaves exactly as before.
 */
export interface ProviderEligibilityRuleView {
  id?: string;
  providerId: string | null;
  providerTier: string | null; // ProviderTier
  inclusionType: "INCLUDE" | "EXCLUDE";
  priority?: number | null;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
  isActive?: boolean | null;
}

/**
 * Is the servicing provider excluded under the member's pinned package version?
 *
 * The precedence itself moved to `./provider-precedence` under UAT-HF P09.05
 * (DEF-054). It was implemented three times — here, in preauth Gate 2 and in the
 * offline pack — which is why the product could not state which rule wins: there
 * were three answers and no name for any of them. This is now a thin adapter
 * that keeps the two checks the shared resolver has no business knowing about
 * (a provider we cannot identify, and one whose contract is not active).
 */
export function isProviderExcluded(
  rules: ProviderEligibilityRuleView[],
  provider: { id: string; tier: string; contractStatus: string } | null,
  at: Date = new Date(),
): boolean {
  // Unknown provider or an inactive contract cannot be confirmed in-network.
  // Neither is a rule question, so neither belongs in the precedence ladder.
  if (!provider) return true;
  if (provider.contractStatus !== "ACTIVE") return true;

  // A caller that selected no `id` (older projections, fixtures) still gets a
  // correct verdict; only the trace loses the rule name, and this adapter
  // discards the trace anyway.
  const withIds: ProviderRuleInput[] = rules.map((r, i) => ({ ...r, id: r.id ?? `rule-${i}` }));

  return !resolveProviderRule(withIds, { id: provider.id, tier: provider.tier }, at).payable;
}

/** Emergency-context detection from a benefit/context code (drives referral bypass). */
export function isEmergencyBenefit(benefitCode: string | null | undefined): boolean {
  if (!benefitCode) return false;
  const c = benefitCode.trim().toUpperCase();
  return c === "EMERGENCY" || c === "AMBULANCE_EMERGENCY";
}
