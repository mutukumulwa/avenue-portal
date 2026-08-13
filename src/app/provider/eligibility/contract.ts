/**
 * The eligibility form's shared shape and constants.
 *
 * Deliberately NOT a `"use server"` module. Next allows a `"use server"` file to
 * export **async functions only** — a single `export const` fails the build
 * with:
 *
 *   Only async functions are allowed to be exported in a "use server" file.
 *
 * These lived in `actions.ts` beside `checkEligibilityAction` and broke the
 * production build. `tsc`, ESLint and Vitest all pass on that arrangement,
 * because it is a Next/SWC rule rather than a type or lint rule — which is
 * exactly why `next build` has to be part of the gate.
 *
 * Values, not types, are what matter here: type-only exports are erased and are
 * permitted. `EligibilityCheckState` moves anyway so the whole contract reads
 * in one place.
 */

import type { EligibilitySafeResult } from "@/server/services/provider-eligibility.service";

export const MAX_MEMBER_LEN = 64;

/** The allow-list the UI offers AND accepts (ELIG-GAP-008). */
export const BENEFIT_OPTIONS = [
  "OUTPATIENT",
  "INPATIENT",
  "MATERNITY",
  "DENTAL",
  "OPTICAL",
  "MENTAL_HEALTH",
  "LAST_EXPENSE",
  "WELLNESS_PREVENTIVE",
] as const;

export interface EligibilityCheckState {
  /** Field-level input problem; the lookup did not run. */
  inputError: string | null;
  /** Present when the lookup ran. */
  result: EligibilitySafeResult | null;
  /** What the operator asked, echoed back so the form can be re-rendered. */
  submitted: { serviceDate: string; benefit: string } | null;
  /** Set when the service itself failed — NOT an ineligibility (P03.02). */
  unavailable: boolean;
}

export const EMPTY_ELIGIBILITY_STATE: EligibilityCheckState = {
  inputError: null,
  result: null,
  submitted: null,
  unavailable: false,
};
