/**
 * UAT-HF P03.04 — Ugandan districts, for members who cannot or will not share
 * device location.
 *
 * DEF-007/DEF-033: "Find Care" fell back to Nairobi's coordinates
 * (`-1.2921, 36.8219`) whenever geolocation was denied or unsupported, silently
 * moving a Ugandan member to another country — after which no covered facility
 * was found at any radius, from a register of 195 providers. The member was
 * shown an empty result and no reason.
 *
 * Removing the fallback is only half the fix: a member who declines location
 * still needs to search. This is the manual alternative — Uganda's own
 * administrative unit (DEF-049: the product used "County", the Kenyan unit),
 * with a representative centroid per district.
 *
 * Centroids are approximate district centres, adequate for a radius search and
 * deliberately not presented as the member's exact position.
 */
import { isWithinCountryBounds } from "@/lib/locale-config";

export interface UgandaDistrict {
  name: string;
  latitude: number;
  longitude: number;
  /** The broad region, used to group a long list in a picker. */
  region: "Central" | "Eastern" | "Northern" | "Western";
}

/**
 * A working set covering the major population and referral centres. Uganda has
 * well over a hundred districts; this is not the full gazetteer, and a tenant
 * with facilities elsewhere should extend it rather than fall back to a guess.
 */
export const UGANDA_DISTRICTS: readonly UgandaDistrict[] = [
  { name: "Kampala", latitude: 0.3476, longitude: 32.5825, region: "Central" },
  { name: "Wakiso", latitude: 0.4044, longitude: 32.4594, region: "Central" },
  { name: "Mukono", latitude: 0.3533, longitude: 32.7553, region: "Central" },
  { name: "Entebbe (Wakiso)", latitude: 0.0512, longitude: 32.4633, region: "Central" },
  { name: "Masaka", latitude: -0.3339, longitude: 31.7344, region: "Central" },
  { name: "Mityana", latitude: 0.4175, longitude: 32.0225, region: "Central" },
  { name: "Luweero", latitude: 0.8492, longitude: 32.4731, region: "Central" },
  { name: "Jinja", latitude: 0.4244, longitude: 33.2042, region: "Eastern" },
  { name: "Mbale", latitude: 1.0821, longitude: 34.1753, region: "Eastern" },
  { name: "Soroti", latitude: 1.7146, longitude: 33.6111, region: "Eastern" },
  { name: "Tororo", latitude: 0.6928, longitude: 34.1808, region: "Eastern" },
  { name: "Iganga", latitude: 0.6094, longitude: 33.4686, region: "Eastern" },
  { name: "Gulu", latitude: 2.7746, longitude: 32.2989, region: "Northern" },
  { name: "Lira", latitude: 2.2350, longitude: 32.9097, region: "Northern" },
  { name: "Arua", latitude: 3.0201, longitude: 30.9111, region: "Northern" },
  { name: "Kitgum", latitude: 3.2783, longitude: 32.8867, region: "Northern" },
  { name: "Moroto", latitude: 2.5350, longitude: 34.6667, region: "Northern" },
  { name: "Mbarara", latitude: -0.6072, longitude: 30.6545, region: "Western" },
  { name: "Fort Portal (Kabarole)", latitude: 0.6710, longitude: 30.2748, region: "Western" },
  { name: "Kasese", latitude: 0.1833, longitude: 30.0833, region: "Western" },
  { name: "Hoima", latitude: 1.4356, longitude: 31.3522, region: "Western" },
  { name: "Kabale", latitude: -1.2411, longitude: 29.9897, region: "Western" },
  { name: "Bushenyi", latitude: -0.5857, longitude: 30.2126, region: "Western" },
];

/** Look a district up by name. Case- and whitespace-insensitive. */
export function findDistrict(name: string): UgandaDistrict | null {
  const key = name.trim().toLowerCase();
  return UGANDA_DISTRICTS.find((d) => d.name.toLowerCase() === key) ?? null;
}

/** Districts grouped by region, for a picker that stays readable as it grows. */
export function districtsByRegion(): Record<UgandaDistrict["region"], UgandaDistrict[]> {
  const grouped: Record<UgandaDistrict["region"], UgandaDistrict[]> = {
    Central: [],
    Eastern: [],
    Northern: [],
    Western: [],
  };
  for (const d of UGANDA_DISTRICTS) grouped[d.region].push(d);
  return grouped;
}

/**
 * Every district must actually be inside Uganda.
 *
 * This is not a formality: DEF-007's whole failure was a coordinate pair that
 * looked plausible and was in the wrong country. A typo here would reintroduce
 * exactly that, silently.
 */
export function allDistrictsAreInCountry(): boolean {
  return UGANDA_DISTRICTS.every((d) => isWithinCountryBounds(d.latitude, d.longitude));
}
