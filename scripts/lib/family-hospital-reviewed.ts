/**
 * Family Hospital UAT — the reviewed, exact production identifiers every Family
 * data script uses (plan P01.01: "resolve IDs from configuration or exact
 * reviewed database values, never by taking the first fuzzy name match").
 *
 * Reviewed 2026-09-11 against Supabase project otivyuroqraiijayvkze
 * (docs/provider-onboarding/FAMILY_HOSPITAL_UAT_IMPLEMENTATION_LOG.md §1,
 * evidence/P00.03-suspect-trial-records.md). Change a value only after
 * re-reviewing it against the database, and record why in the log.
 */
export const FAMILY_REVIEWED = {
  tenantId: "cmr3ae8v30000nlvqxrqlfn38",
  providerId: "cmssrwr31000033vqpue454ou",
  branchId: "cmssrwr92000133vqi0blzcay",
  contractId: "cmtclkbiy00005kvqphfr7xiz",
  contractNumber: "PC-2026-202",
  /** Rows the 2026-08-28 load wrote from the facility's price list. */
  expectedSourceRows: 4451,
  currency: "UGX",
  /** Facility answers (FAMILY_HOSPITAL_UAT_DECISIONS.md §1). */
  taxInclusive: "INCLUSIVE",
  paymentTermDays: 30,
} as const;

export type FamilyScope = {
  tenantId: string;
  providerId: string;
  branchId: string;
  contractId: string;
};
