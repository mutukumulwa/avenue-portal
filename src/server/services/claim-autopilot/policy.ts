/**
 * Claims Autopilot — policy mode validation and fail-closed resolution (F2.4).
 *
 * Enforces D1/D2/D15 at the type/logic level, independent of the DB defaults:
 *   - A policy is validly LIVE only when it is APPROVED, has a finite positive
 *     ceiling, has every required gate enabled, and names explicit inclusions.
 *   - `effectivePolicyMode` is FAIL-CLOSED: a row that claims LIVE but fails
 *     validation resolves to OFF, so a malformed/unapproved policy can never move
 *     money. SHADOW requires an APPROVED status; everything else is OFF.
 *   - Historical/legacy rows classify to OFF (or SHADOW if explicitly opted in),
 *     never LIVE (§9.6, F2.4 step 3).
 *
 * Pure module: no DB, no clock.
 */
import Decimal from "decimal.js";

export type PolicyMode = "OFF" | "SHADOW" | "LIVE";

/** The subset of AutoAdjudicationPolicy fields these helpers reason about. */
export interface PolicyLike {
  mode: string;
  status: string;
  maxAutoApproveAmount: Decimal | number | string | null;
  requireAllLinesPriced: boolean;
  requireDocumentsComplete: boolean;
  requireEligibilityClear: boolean;
  requireCleanFraud: boolean;
  requirePreauthWhenNeeded: boolean;
  allowedSources: string[];
  allowedServiceTypes: string[];
  allowedBenefitCategories: string[];
}

const REQUIRED_GATES: Array<keyof PolicyLike> = [
  "requireAllLinesPriced",
  "requireDocumentsComplete",
  "requireEligibilityClear",
  "requireCleanFraud",
  "requirePreauthWhenNeeded",
];

function toDecimalOrNull(v: Decimal | number | string | null): Decimal | null {
  if (v == null) return null;
  try {
    const d = new Decimal(v.toString());
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/**
 * Validate that a policy meets EVERY requirement to run LIVE. Returns the list of
 * blocking issues (empty ⇒ valid). Does not itself check `mode === "LIVE"`; it
 * answers "could this policy be LIVE?".
 */
export function validateLivePolicy(p: PolicyLike): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (p.status !== "APPROVED") issues.push("policy must be APPROVED to run LIVE");

  const ceiling = toDecimalOrNull(p.maxAutoApproveAmount);
  if (ceiling === null) issues.push("LIVE requires a finite ceiling");
  else if (ceiling.lte(0)) issues.push("LIVE ceiling must be positive");

  for (const gate of REQUIRED_GATES) {
    if (!p[gate]) issues.push(`required gate ${String(gate)} must be enabled for LIVE`);
  }

  if (p.allowedSources.length === 0) issues.push("LIVE requires explicit allowedSources");
  if (p.allowedServiceTypes.length === 0) issues.push("LIVE requires explicit allowedServiceTypes");
  if (p.allowedBenefitCategories.length === 0) issues.push("LIVE requires explicit allowedBenefitCategories");

  return { valid: issues.length === 0, issues };
}

/**
 * The SAFE effective mode. Fail-closed: an invalid "LIVE" row resolves to OFF; a
 * SHADOW row is honoured only when APPROVED; anything else is OFF.
 */
export function effectivePolicyMode(p: PolicyLike): PolicyMode {
  if (p.mode === "LIVE") return validateLivePolicy(p).valid ? "LIVE" : "OFF";
  if (p.mode === "SHADOW" && p.status === "APPROVED") return "SHADOW";
  return "OFF";
}

/** True iff this policy may execute automatic money decisions. */
export function canExecuteLive(p: PolicyLike): boolean {
  return effectivePolicyMode(p) === "LIVE";
}

/**
 * Backfill classifier for pre-existing/legacy policies. Never returns LIVE.
 * Default OFF; a previously-`enabled` policy may be mapped to SHADOW when the
 * operator explicitly opts in (to accumulate comparison data safely).
 */
export function classifyHistoricalPolicyMode(
  legacy: { enabled?: boolean | null },
  opts: { enabledToShadow?: boolean } = {},
): PolicyMode {
  return opts.enabledToShadow && !!legacy.enabled ? "SHADOW" : "OFF";
}
