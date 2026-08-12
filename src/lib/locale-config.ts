/**
 * UAT-HF P01.05 — one place for every locale, currency, country and timezone
 * constant, per DEC-01.
 *
 * The run found Kenyan defaults scattered through a Uganda deployment:
 *
 *   DEF-006  member forms show a Kenyan "+254 700 000000" phone example
 *   DEF-049  every provider/branch example is Kenyan ("e.g. Nairobi Hospital",
 *            "P.O. Box 30026, Nairobi", "Dr. Jane Mwangi"), and the address field
 *            is labelled "County" — the Kenyan unit; Uganda uses Districts
 *   DEF-052  contract creation defaults the currency to KES
 *   DEF-063  UGX/KES used inconsistently across surfaces
 *   DEF-017  dates rendered three different ways, including an unlabelled
 *            DD/MM/YYYY and a month-first M/D/YYYY — the same endorsement showed
 *            "7/1/2026" in HR and "01/07/2026" in admin, six months apart
 *
 * These are not typos. They are the absence of a single source of truth, so each
 * new surface re-invents a default and half of them inherit the wrong country.
 *
 * `scripts/check-currency-labels.mjs` enforces this file at build time.
 */

/** Operational timezone (DEC-01). UTC+03:00, no DST — Uganda observes EAT. */
export const OPERATIONAL_TIMEZONE = "Africa/Nairobi";

/**
 * Display locale. Note this is deliberately NOT `en-KE`: number grouping is the
 * same, but the currency and country defaults that follow from it are not.
 */
export const OPERATIONAL_LOCALE = "en-UG";

/** Base/reporting currency (DEC-01). Money of unknown denomination is this. */
export const CURRENCY_CODE = "UGX";

/** ISO 3166-1 alpha-2. */
export const COUNTRY_CODE = "UG";
export const COUNTRY_NAME = "Uganda";

/** E.164 calling code, and the national trunk prefix users actually type. */
export const CALLING_CODE = "+256";
export const NATIONAL_TRUNK_PREFIX = "0";

/**
 * The first-level administrative unit. Uganda has **districts**; Kenya has
 * counties. DEF-049 found the address field labelled "County" on a Uganda
 * deployment, which is not a translation choice — it is the wrong taxonomy.
 */
export const ADMIN_UNIT_LABEL = "District";
export const ADMIN_UNIT_LABEL_PLURAL = "Districts";
export const SUB_ADMIN_UNIT_LABEL = "Sub-county";
export const LOCALITY_LABEL = "Parish";

/**
 * Worked examples for form placeholders. Every one of these replaces a Kenyan
 * example the run actually found on screen.
 */
export const EXAMPLES = {
  /** DEF-006: was "+254 700 000000". */
  phone: "+256 772 123456",
  phoneLocal: "0772 123456",
  /** DEF-049: was "e.g. Nairobi Hospital". */
  providerName: "Mulago Specialised Hospital",
  /** DEF-049: was "e.g. Kikuyu". */
  branchName: "Nakawa",
  /** DEF-049: was "e.g. P.O. Box 30026, Nairobi". */
  postalAddress: "P.O. Box 7051, Kampala",
  /** DEF-049: was "e.g. Dr. Jane Mwangi". */
  practitionerName: "Dr. Sarah Nakiwala",
  district: "Wakiso",
  city: "Kampala",
  /**
   * DEF-057: the provider eligibility form used a REAL member number
   * ("e.g. NWSC-2026-00001") as its example. A worked example must never be a
   * live identifier — tenants override this from configuration.
   */
  memberNumber: "ABC-2026-00001",
} as const;

/**
 * Map centre when a member has not granted geolocation.
 *
 * DEF-007/DEF-033: "Find Care" fell back to Nairobi coordinates, silently moving
 * a Ugandan member to another country and returning no covered facility at any
 * radius. P03.04 removes the silent fallback entirely — a denied permission must
 * be handled explicitly, not papered over — and this constant exists only for a
 * deliberate, labelled "showing Uganda" default view.
 */
export const COUNTRY_MAP_CENTRE = { latitude: 1.3733, longitude: 32.2903, zoom: 7 } as const;

/** Rough bounding box for Uganda, to reject obviously-wrong stored coordinates. */
export const COUNTRY_BOUNDS = {
  minLatitude: -1.5,
  maxLatitude: 4.3,
  minLongitude: 29.5,
  maxLongitude: 35.1,
} as const;

/** True when a coordinate pair plausibly sits inside Uganda. */
export function isWithinCountryBounds(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= COUNTRY_BOUNDS.minLatitude &&
    latitude <= COUNTRY_BOUNDS.maxLatitude &&
    longitude >= COUNTRY_BOUNDS.minLongitude &&
    longitude <= COUNTRY_BOUNDS.maxLongitude
  );
}
