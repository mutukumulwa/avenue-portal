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

/**
 * Plan P00.03's restricted report (evidence/P00.03-suspect-trial-records.md):
 * every Family claim and pre-authorisation, all priced from the global CPT
 * reference table (KES reference costs stored as UGX). Reviewed 2026-09-11 and
 * reconciled again for P07.01 the same day — unchanged. P07.01 acts on exactly
 * these ids and refuses if the database holds any other Family record.
 */
export const FAMILY_P0003_SUSPECT = {
  claims: [
    { id: "cmtvq6mk4000104jq28uwpa1y", number: "CLM-2026-00308" },
    { id: "cmtvqiaia000n04jqy8r3kdk2", number: "CLM-2026-00309" },
    { id: "cmtvr409l000104l558ysm0rk", number: "CLM-2026-00310" },
    { id: "cmtvriwim000n04l5zopta221", number: "CLM-2026-00311" },
  ],
  preauths: [{ id: "cmtvsylrm000004jtq5g4d4uo", number: "PA-2026-00007" }],
} as const;

export type SuspectRecordSet = {
  claims: ReadonlyArray<{ id: string; number: string }>;
  preauths: ReadonlyArray<{ id: string; number: string }>;
};

/**
 * Plan P07.02 — the fixtures the Family rerun starts from. Services are exact
 * Family tariff rows (reviewed 2026-09-11 against the production price list),
 * one or more per area the plan names; the expected values are recomputed from
 * the database by scripts/reports/family-hospital-uat-fixtures.ts, never typed
 * here. Members are the three the plan names, by exact member number.
 */
export const FAMILY_P0702_FIXTURES = {
  members: ["MTC-2026-00001", "MTC-2026-00005", "MTC-2026-00007"],
  services: [
    { area: "Consultation", tariffId: "cmtcjm9qi00004yvq0bhl38o9" },
    { area: "Laboratory", tariffId: "cmtcjmh67025s4yvqwb49g6yn" },
    { area: "Imaging", tariffId: "cmtcjm9ql00434yvq967r1yv8" },
    { area: "Pharmacy", tariffId: "cmtcjm9qo00b74yvqvfzswz8y" },
    { area: "Procedure", tariffId: "cmtwmk8510003xavq5da22kb6" },
    { area: "Inpatient bed", tariffId: "cmtcjm9qj00064yvqmqqkefo5" },
    { area: "Maternity package", tariffId: "cmtcjmi5g02j24yvqfqpemiat" },
  ],
  /** DEC-FH-01 (default applied): an unlisted service, where the contract allows one. */
  unlistedDescription: "Physiotherapy session",
} as const;
