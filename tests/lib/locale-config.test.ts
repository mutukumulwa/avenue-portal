/**
 * UAT-HF P01.05 — the locale constants must actually describe Uganda.
 *
 * DEF-006 / DEF-049 / DEF-052 / DEF-063 are all one failure repeated: no single
 * source of truth, so each surface invented a default and many inherited Kenya.
 * These tests pin the source of truth itself; `scripts/check-locale-defaults.mjs`
 * then stops call sites drifting away from it.
 */
import { describe, it, expect } from "vitest";
import {
  ADMIN_UNIT_LABEL,
  CALLING_CODE,
  COUNTRY_CODE,
  COUNTRY_MAP_CENTRE,
  CURRENCY_CODE,
  EXAMPLES,
  OPERATIONAL_LOCALE,
  OPERATIONAL_TIMEZONE,
  isWithinCountryBounds,
} from "@/lib/locale-config";
import { normalizePhone } from "@/lib/normalize";

describe("P01.05 locale constants (DEC-01)", () => {
  it("matches the signed decision exactly", () => {
    expect(OPERATIONAL_TIMEZONE).toBe("Africa/Nairobi");
    expect(OPERATIONAL_LOCALE).toBe("en-UG");
    expect(CURRENCY_CODE).toBe("UGX");
    expect(COUNTRY_CODE).toBe("UG");
    expect(CALLING_CODE).toBe("+256");
  });

  it("uses the Ugandan administrative unit, not the Kenyan one (DEF-049)", () => {
    expect(ADMIN_UNIT_LABEL).toBe("District");
    expect(ADMIN_UNIT_LABEL).not.toMatch(/county/i);
  });

  it("carries no Kenyan worked example anywhere (DEF-006, DEF-049)", () => {
    const all = Object.values(EXAMPLES).join(" | ");
    expect(all).not.toContain("+254");
    expect(all).not.toMatch(/nairobi|kikuyu|mwangi/i);
  });

  it("every phone example is a real, parseable Uganda number", () => {
    // A placeholder a user copies must not itself be invalid.
    expect(normalizePhone(EXAMPLES.phone)).toBe("+256772123456");
    expect(normalizePhone(EXAMPLES.phoneLocal)).toBe("+256772123456");
  });

  it("the member-number example is not a live identifier (DEF-057)", () => {
    // The provider eligibility form used "e.g. NWSC-2026-00001" — a real member.
    expect(EXAMPLES.memberNumber).not.toMatch(/NWSC|UX26/);
  });

  it("the country map centre is inside Uganda, not Nairobi (DEF-007, DEF-033)", () => {
    expect(isWithinCountryBounds(COUNTRY_MAP_CENTRE.latitude, COUNTRY_MAP_CENTRE.longitude)).toBe(true);
    // Nairobi, the value the product actually fell back to.
    expect(isWithinCountryBounds(-1.2921, 36.8219)).toBe(false);
  });

  it("bounds-checking rejects rubbish coordinates rather than trusting them", () => {
    expect(isWithinCountryBounds(0.3476, 32.5825)).toBe(true); // Kampala
    expect(isWithinCountryBounds(NaN, 32)).toBe(false);
    expect(isWithinCountryBounds(51.5, -0.12)).toBe(false); // London
  });
});
