/**
 * UAT-HF P05.06 — one address grammar for every member-enrolment rail.
 *
 * Uganda's administrative hierarchy does not fit a foreign ZIP/state form.
 * These fields deliberately preserve the words operators use: district;
 * city/municipality/county; subcounty/division; parish/ward; village/zone.
 */

export const MEMBER_ADDRESS_COUNTRY = "Uganda";

export const MEMBER_ADDRESS_FIELDS = [
  "addressCountry",
  "addressDistrict",
  "addressLocality",
  "addressSubcounty",
  "addressParish",
  "addressVillage",
  "addressLine",
  "addressLatitude",
  "addressLongitude",
  "addressCoordinateConsent",
] as const;

export type MemberAddressField = (typeof MEMBER_ADDRESS_FIELDS)[number];

export interface MemberAddressInput {
  addressCountry?: string | null;
  addressDistrict?: string | null;
  addressLocality?: string | null;
  addressSubcounty?: string | null;
  addressParish?: string | null;
  addressVillage?: string | null;
  addressLine?: string | null;
  addressLatitude?: string | number | null;
  addressLongitude?: string | number | null;
  addressCoordinateConsent?: string | boolean | null;
}

export interface ValidMemberAddress {
  addressCountry: string;
  addressDistrict: string | null;
  addressLocality: string | null;
  addressSubcounty: string | null;
  addressParish: string | null;
  addressVillage: string | null;
  addressLine: string | null;
  addressLatitude: string | null;
  addressLongitude: string | null;
  hasCoordinateConsent: boolean;
}

export type MemberAddressResult =
  | { ok: true; value: ValidMemberAddress }
  | { ok: false; fieldErrors: Record<string, string[]> };

const DECIMAL_RE = /^-?(?:\d+|\d*\.\d+)$/;

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/g, " ")
    : value == null
      ? ""
      : String(value).trim();
}

function consented(value: unknown): boolean {
  return value === true || value === "true" || value === "on" || value === "1";
}

function parseCoordinate(
  raw: unknown,
  field: "addressLatitude" | "addressLongitude",
  min: number,
  max: number,
  errors: Record<string, string[]>,
): string | null {
  const text = clean(raw);
  if (!text) return null;
  if (!DECIMAL_RE.test(text)) {
    errors[field] = ["Enter a decimal coordinate, for example 0.347596."];
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) {
    errors[field] = [`Enter a value from ${min} to ${max}.`];
    return null;
  }
  // The database stores six decimal places. Reject extra precision rather than
  // silently changing the location the member consented to store.
  const fraction = text.split(".")[1] ?? "";
  if (fraction.length > 6) {
    errors[field] = ["Use no more than 6 decimal places."];
    return null;
  }
  return text;
}

export function validateMemberAddress(input: MemberAddressInput): MemberAddressResult {
  const errors: Record<string, string[]> = {};
  const textFields = {
    addressDistrict: clean(input.addressDistrict),
    addressLocality: clean(input.addressLocality),
    addressSubcounty: clean(input.addressSubcounty),
    addressParish: clean(input.addressParish),
    addressVillage: clean(input.addressVillage),
    addressLine: clean(input.addressLine),
  };

  for (const [field, value] of Object.entries(textFields)) {
    const max = field === "addressLine" ? 200 : 100;
    if (value.length > max) errors[field] = [`Use ${max} characters or fewer.`];
  }

  const country = clean(input.addressCountry) || MEMBER_ADDRESS_COUNTRY;
  if (country.toLocaleLowerCase("en") !== MEMBER_ADDRESS_COUNTRY.toLocaleLowerCase("en")) {
    errors.addressCountry = ["This Uganda deployment currently supports member addresses in Uganda."];
  }

  const latitude = parseCoordinate(input.addressLatitude, "addressLatitude", -90, 90, errors);
  const longitude = parseCoordinate(input.addressLongitude, "addressLongitude", -180, 180, errors);
  const hasConsent = consented(input.addressCoordinateConsent);
  const oneCoordinate = (latitude === null) !== (longitude === null);

  if (oneCoordinate) {
    const missing = latitude === null ? "addressLatitude" : "addressLongitude";
    errors[missing] = errors[missing] ?? ["Latitude and longitude must be supplied together."];
  }
  if ((latitude !== null || longitude !== null) && !hasConsent) {
    errors.addressCoordinateConsent = ["Confirm the member's consent before storing precise coordinates."];
  }
  if (hasConsent && latitude === null && longitude === null) {
    errors.addressLatitude = errors.addressLatitude ?? ["Enter latitude after confirming coordinate consent."];
    errors.addressLongitude = errors.addressLongitude ?? ["Enter longitude after confirming coordinate consent."];
  }

  const hasAdministrativeDetail = Object.values(textFields).some(Boolean);
  if ((hasAdministrativeDetail || latitude !== null || longitude !== null) && !textFields.addressDistrict) {
    errors.addressDistrict = ["Enter the district for this address."];
  }

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      addressCountry: MEMBER_ADDRESS_COUNTRY,
      addressDistrict: textFields.addressDistrict || null,
      addressLocality: textFields.addressLocality || null,
      addressSubcounty: textFields.addressSubcounty || null,
      addressParish: textFields.addressParish || null,
      addressVillage: textFields.addressVillage || null,
      addressLine: textFields.addressLine || null,
      addressLatitude: latitude,
      addressLongitude: longitude,
      hasCoordinateConsent: latitude !== null && longitude !== null && hasConsent,
    },
  };
}

export function memberAddressLines(input: Omit<ValidMemberAddress, "hasCoordinateConsent" | "addressLatitude" | "addressLongitude">): string[] {
  const hierarchy = [
    input.addressVillage,
    input.addressParish,
    input.addressSubcounty,
    input.addressLocality,
    input.addressDistrict,
    input.addressCountry,
  ].filter((part): part is string => !!part);
  return [input.addressLine, hierarchy.join(", ")].filter((line): line is string => !!line);
}
