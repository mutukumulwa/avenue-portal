/**
 * UAT-HF P03.04 — the manual location source that replaces the Nairobi fallback.
 *
 * DEF-007/DEF-033: "Find Care" fell back to Nairobi's coordinates
 * (-1.2921, 36.8219) whenever geolocation was denied or unsupported, silently
 * moving a Ugandan member to another country. The search then returned no
 * covered facility at any radius from a register of 195 providers, and the
 * member was shown an empty result with no reason.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  UGANDA_DISTRICTS,
  allDistrictsAreInCountry,
  districtsByRegion,
  findDistrict,
} from "@/lib/uganda-districts";
import { isWithinCountryBounds } from "@/lib/locale-config";

describe("P03.04 every offered location is actually in Uganda", () => {
  it("no district sits outside the country bounds", () => {
    // Not a formality: DEF-007's entire failure was a coordinate pair that looked
    // plausible and was in the wrong country. A typo here reintroduces it.
    expect(allDistrictsAreInCountry()).toBe(true);
    for (const d of UGANDA_DISTRICTS) {
      expect(isWithinCountryBounds(d.latitude, d.longitude), d.name).toBe(true);
    }
  });

  it("rejects Nairobi, the coordinate the product used to fall back to", () => {
    expect(isWithinCountryBounds(-1.2921, 36.8219)).toBe(false);
    expect(UGANDA_DISTRICTS.some((d) => d.latitude === -1.2921 && d.longitude === 36.8219)).toBe(false);
  });

  it("includes Kampala, the control the acceptance names", () => {
    const kampala = findDistrict("Kampala");
    expect(kampala).not.toBeNull();
    expect(isWithinCountryBounds(kampala!.latitude, kampala!.longitude)).toBe(true);
  });

  it("looks up case- and whitespace-insensitively, and returns null for a miss", () => {
    expect(findDistrict("  kampala ")?.name).toBe("Kampala");
    expect(findDistrict("Nairobi")).toBeNull();
    expect(findDistrict("")).toBeNull();
  });

  it("groups every district into a region, with none orphaned", () => {
    const grouped = districtsByRegion();
    const total = Object.values(grouped).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(UGANDA_DISTRICTS.length);
    for (const region of ["Central", "Eastern", "Northern", "Western"] as const) {
      expect(grouped[region].length, region).toBeGreaterThan(0);
    }
  });

  it("has no duplicate names, which would make the picker ambiguous", () => {
    const names = UGANDA_DISTRICTS.map((d) => d.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("P03.04 the Nairobi fallback is gone from Find Care", () => {
  const source = readFileSync("src/app/member/facilities/FacilitiesMap.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

  it("no longer contains the Nairobi coordinates", () => {
    expect(source).not.toContain("-1.2921");
    expect(source).not.toContain("36.8219");
  });

  it("validates a device position against the country bounds before using it", () => {
    // A coordinate outside Uganda is not usable here, and quietly searching from
    // it is precisely the defect.
    expect(source).toContain("isWithinCountryBounds");
  });

  it("distinguishes denied, unavailable, unsupported and out-of-country", () => {
    // DEF-007's screen could not tell "no facility near you" from "we don't know
    // where you are" from "none of these are in your network".
    for (const state of ["denied", "unavailable", "unsupported", "outside-country"]) {
      expect(source, state).toContain(state);
    }
  });

  it("offers the district picker as the recovery, using Uganda's own unit", () => {
    expect(source).toContain("DistrictPicker");
    expect(source).toContain("ADMIN_UNIT_LABEL");
    // DEF-049: the product used "County", the Kenyan unit.
    expect(source).not.toMatch(/>\s*County\s*</);
  });
});
