/**
 * Eligibility reason-code catalog (SP-6's closed enum).
 *
 * These are the eligibility EVALUATOR's reason codes — distinct from the
 * DB-seeded adjudication catalog (`AdjudicationReasonCode` /
 * reason-codes.service.ts), which prices claim lines. This enum is the closed
 * set the point-in-time eligibility evaluator (SP-6, next) and every channel
 * report against, matching the published `06 Eligibility Oracle` (EO-001..024)
 * exactly.
 *
 * Kept as a TS const (not a Prisma enum) so it needs no migration and SP-6 can
 * import + extend it. Wave 2 (WP-2.3) adds the two exclusion codes; the rest are
 * the oracle base that SP-6 will populate.
 */

/**
 * The oracle base codes (plan §SP-6). These are EXACTLY the distinct
 * "Expected reason/status" values in `06 Eligibility Oracle` EO-001..024 — no
 * strays (asserted by tests/services/eligibility/reason-codes.test.ts). Note
 * `ACTIVE_DEPENDANT` (EO-023): the oracle distinguishes an active dependant from
 * an active principal in the reason column, so the evaluator returns it as a
 * distinct code rather than folding it into `ACTIVE`.
 */
export const ELIGIBILITY_ORACLE_REASON_CODES = [
  "ACTIVE",
  "ACTIVE_DEPENDANT",
  "POLICY_NOT_STARTED",
  "NOT_YET_ENROLLED",
  "WAITING_PERIOD",
  "SUSPENDED",
  "ACTIVE_AS_OF_SERVICE_DATE",
  "TERMINATED",
  "LAPSED",
  "COVERAGE_GAP",
  "REINSTATED",
  "AGE_BOUNDARY",
  "OVER_AGE_DEPENDANT",
  "LIMIT_EXHAUSTED",
  "PROVIDER_EXCLUDED",
  "MISSING_REFERRAL",
  "EMERGENCY_REFERRAL_EXCEPTION",
  "RENEWAL_VERSION",
  "NOT_FOUND",
] as const;

/** WP-2.3 additions — structured treatment/experimental exclusions (DEF-023). */
export const ELIGIBILITY_EXCLUSION_REASON_CODES = [
  "TREATMENT_EXCLUDED",
  "EXPERIMENTAL_EXCLUDED",
] as const;

/** The full closed enum: oracle base ∪ Wave 2 exclusion codes. No strays. */
export const ELIGIBILITY_REASON_CODES = [
  ...ELIGIBILITY_ORACLE_REASON_CODES,
  ...ELIGIBILITY_EXCLUSION_REASON_CODES,
] as const;

export type EligibilityReasonCode = (typeof ELIGIBILITY_REASON_CODES)[number];

const REASON_CODE_SET: ReadonlySet<string> = new Set(ELIGIBILITY_REASON_CODES);

/** Type-guard: is `code` a member of the closed enum? */
export function isEligibilityReasonCode(code: string): code is EligibilityReasonCode {
  return REASON_CODE_SET.has(code);
}
