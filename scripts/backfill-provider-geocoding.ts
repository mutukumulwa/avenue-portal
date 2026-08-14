/**
 * UAT-HF DEF-007 — give the provider network coordinates.
 *
 * The run reported Find Care returning "No facilities found within 100 km"
 * against a 195-provider network. The cause was not the search: the distance
 * query requires `geoLatitude IS NOT NULL`, and **no provider had coordinates**,
 * so no radius could ever have matched. The code half of that defect is fixed
 * (the empty state now distinguishes "none nearby" from "none mappable"). This
 * is the data half.
 *
 * ## Accuracy — read this before trusting a distance
 *
 * Provider addresses are ward/town level: "Bombo Road, Kampala", "Pader West,
 * Pader, Uganda". There is no street-level source, so this resolves each
 * provider to its **district or town centroid**. Every Kampala provider
 * therefore lands on the same point.
 *
 * That is honest at the scale Find Care offers (a 20–100 km radius) and is
 * enough for the feature to work at all. It is NOT a facility location: "2.3 km
 * away" would be fiction. The network in this database is demo data, which is
 * why centroids are acceptable here — a real contracted network deserves real
 * coordinates from provider contracting records, and this script should not be
 * used to manufacture them.
 *
 * ## Why the coordinates live here and not in `uganda-districts.ts`
 *
 * That module is the member-facing location picker — a curated list of 23 major
 * districts a member chooses from. Growing it to fifty-odd entries to serve a
 * backfill would change a UI for a reason that has nothing to do with the UI.
 * This table exists for geocoding only.
 *
 * Run:
 *   npx tsx scripts/backfill-provider-geocoding.ts            # dry run (default)
 *   npx tsx scripts/backfill-provider-geocoding.ts --apply    # write
 *   npx tsx scripts/backfill-provider-geocoding.ts --sql      # emit SQL, write nothing
 *
 * `--sql` exists because the production database is not always reachable from a
 * shell — it may only be available through an admin SQL console. Emitting the
 * statement keeps this table the single source of truth for the mapping instead
 * of someone hand-writing coordinates into a console, and the statement can be
 * read before it is run.
 *
 * **Check which database you are pointed at.** A dry run against the local
 * `.env` returned ten Kenyan providers; production has 195 Ugandan ones. The
 * dry-run default is what caught that, and it is why `--apply` is never the
 * default.
 */

import { prisma } from "../src/lib/prisma";
import { isWithinCountryBounds } from "../src/lib/locale-config";

/**
 * District and town centroids, approximate to a few km.
 *
 * Keys are matched case-insensitively against the locality parsed out of the
 * address. Kampala suburbs and known spelling variants resolve to their parent
 * so a provider is placed rather than skipped.
 */
const LOCALITY_COORDINATES: Record<string, { lat: number; lng: number; note?: string }> = {
  // ── Central ──────────────────────────────────────────────────────────────
  Kampala: { lat: 0.3476, lng: 32.5825 },
  Wakiso: { lat: 0.4044, lng: 32.4594 },
  Mukono: { lat: 0.3533, lng: 32.7553 },
  Entebbe: { lat: 0.0512, lng: 32.4633 },
  Masaka: { lat: -0.3333, lng: 31.7333 },
  Mityana: { lat: 0.4175, lng: 32.0225 },
  Luweero: { lat: 0.8492, lng: 32.4736 },
  Buikwe: { lat: 0.3333, lng: 32.9833 },
  Mubende: { lat: 0.5573, lng: 31.395 },
  Nakaseke: { lat: 0.7167, lng: 32.4167 },
  Kayunga: { lat: 0.7025, lng: 32.8881 },
  Nakasongola: { lat: 1.3089, lng: 32.4553 },
  Kyankwanzi: { lat: 1.0, lng: 31.75 },
  Mpigi: { lat: 0.2258, lng: 32.3136 },

  // ── Eastern ──────────────────────────────────────────────────────────────
  Jinja: { lat: 0.4244, lng: 33.2042 },
  Mbale: { lat: 1.0819, lng: 34.1753 },
  Soroti: { lat: 1.7147, lng: 33.6111 },
  Tororo: { lat: 0.6929, lng: 34.1808 },
  Iganga: { lat: 0.6094, lng: 33.4686 },
  Mayuge: { lat: 0.4581, lng: 33.4794 },
  Pallisa: { lat: 1.145, lng: 33.7092 },
  Busia: { lat: 0.4644, lng: 34.0917 },
  Sironko: { lat: 1.2306, lng: 34.2494 },
  Bugiri: { lat: 0.5317, lng: 33.7417 },
  Bukedea: { lat: 1.355, lng: 34.1069 },
  Kamuli: { lat: 0.9472, lng: 33.1197 },
  Kapchorwa: { lat: 1.3958, lng: 34.45 },
  Kumi: { lat: 1.46, lng: 33.9361 },

  // ── Northern ─────────────────────────────────────────────────────────────
  Gulu: { lat: 2.7746, lng: 32.299 },
  Lira: { lat: 2.235, lng: 32.9097 },
  Arua: { lat: 3.0201, lng: 30.9111 },
  Kitgum: { lat: 3.2783, lng: 32.8867 },
  Moroto: { lat: 2.5217, lng: 34.6667 },
  Yumbe: { lat: 3.4667, lng: 31.25 },
  Apac: { lat: 1.9767, lng: 32.5375 },
  Pader: { lat: 2.8, lng: 33.1333 },
  Amuru: { lat: 2.8333, lng: 32.05 },
  Kotido: { lat: 2.9806, lng: 34.1331 },
  Nebbi: { lat: 2.4783, lng: 31.0894 },
  Oyam: { lat: 2.2333, lng: 32.3833 },

  // ── Western ──────────────────────────────────────────────────────────────
  Mbarara: { lat: -0.6072, lng: 30.6545 },
  "Fort Portal": { lat: 0.671, lng: 30.275 },
  Kasese: { lat: 0.1833, lng: 30.0833 },
  Hoima: { lat: 1.4356, lng: 31.3522 },
  Kabale: { lat: -1.2489, lng: 29.9897 },
  Bushenyi: { lat: -0.5857, lng: 30.2101 },
  Kamwenge: { lat: 0.1892, lng: 30.455 },
  Isingiro: { lat: -0.8433, lng: 30.8 },
  Kanungu: { lat: -0.9569, lng: 29.79 },
  Kisoro: { lat: -1.2853, lng: 29.6847 },

  // ── Aliases: suburbs, landmarks and spelling variants ────────────────────
  // Each resolves to its parent so a provider is PLACED rather than skipped.
  // A skipped provider is invisible in Find Care, which is the defect.
  Luwero: { lat: 0.8492, lng: 32.4736, note: "spelling variant of Luweero" },
  Kabarole: { lat: 0.671, lng: 30.275, note: "district whose town is Fort Portal" },
  Kololo: { lat: 0.3476, lng: 32.5825, note: "Kampala suburb" },
  Mengo: { lat: 0.3476, lng: 32.5825, note: "Kampala suburb" },
  Ntinda: { lat: 0.3476, lng: 32.5825, note: "Kampala suburb" },
  "Garden City": { lat: 0.3476, lng: 32.5825, note: "Kampala landmark" },
  Nansana: { lat: 0.3656, lng: 32.5286, note: "Wakiso municipality" },
};

/**
 * Pull the locality out of an address.
 *
 * Two observed shapes: "Ward, District, Uganda" and "Street, City". Compound
 * values like "Entebbe / Luzira" and "Ntinda / Kyaliwajala" take the first
 * side, which is the one that names a place we know.
 */
function localityOf(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];
  const candidate = /uganda/i.test(last) ? parts[parts.length - 2] : last;
  return candidate ? candidate.split("/")[0].trim() : null;
}

function lookup(locality: string | null): { lat: number; lng: number; note?: string } | null {
  if (!locality) return null;
  const key = Object.keys(LOCALITY_COORDINATES).find(
    (k) => k.toLowerCase() === locality.toLowerCase(),
  );
  return key ? LOCALITY_COORDINATES[key] : null;
}

/** Emit the whole backfill as one reviewable statement. */
function emitSql(): string {
  const rows = Object.entries(LOCALITY_COORDINATES)
    .map(([name, c]) => `    ('${name.replace(/'/g, "''")}', ${c.lat}, ${c.lng})`)
    .join(",\n");
  return `-- Provider geocoding backfill, generated by scripts/backfill-provider-geocoding.ts
-- District/town CENTROIDS, approximate to a few km. Not facility locations.
-- Only fills rows where BOTH coordinates are NULL, so a real geocode is never
-- overwritten by this approximation.
WITH locality(name, lat, lng) AS (VALUES
${rows}
),
parsed AS (
  SELECT p.id,
         split_part(
           trim(CASE
             WHEN p.address ILIKE '%, Uganda'
               THEN split_part(p.address, ',', array_length(string_to_array(p.address, ','), 1) - 1)
             ELSE split_part(p.address, ',', array_length(string_to_array(p.address, ','), 1))
           END), '/', 1) AS locality
  FROM "Provider" p
  WHERE p."geoLatitude" IS NULL AND p."geoLongitude" IS NULL
    AND NULLIF(trim(p.address), '') IS NOT NULL
)
UPDATE "Provider" p
   SET "geoLatitude" = l.lat, "geoLongitude" = l.lng
  FROM parsed x
  JOIN locality l ON lower(l.name) = lower(trim(x.locality))
 WHERE p.id = x.id
   AND p."geoLatitude" IS NULL AND p."geoLongitude" IS NULL;`;
}

async function main() {
  if (process.argv.includes("--sql")) {
    console.log(emitSql());
    return;
  }
  const apply = process.argv.includes("--apply");

  const providers = await prisma.provider.findMany({
    select: { id: true, name: true, address: true, geoLatitude: true, geoLongitude: true },
    orderBy: { name: "asc" },
  });

  const resolved: { id: string; name: string; locality: string; lat: number; lng: number }[] = [];
  const skipped: { name: string; reason: string }[] = [];

  for (const p of providers) {
    if (p.geoLatitude !== null && p.geoLongitude !== null) {
      skipped.push({ name: p.name, reason: "already has coordinates — never overwritten" });
      continue;
    }
    if (!p.address?.trim()) {
      skipped.push({ name: p.name, reason: "no address to resolve" });
      continue;
    }
    const locality = localityOf(p.address);
    const hit = lookup(locality);
    if (!hit) {
      skipped.push({ name: p.name, reason: `locality "${locality ?? "?"}" is not in the table` });
      continue;
    }
    // Guard against a typo in the table putting a facility in the sea. The
    // member surface already refuses to plot out-of-country points.
    if (!isWithinCountryBounds(hit.lat, hit.lng)) {
      skipped.push({ name: p.name, reason: `"${locality}" resolved outside Uganda — table error` });
      continue;
    }
    resolved.push({ id: p.id, name: p.name, locality: locality!, lat: hit.lat, lng: hit.lng });
  }

  console.log(`\nProvider geocoding — ${apply ? "APPLY" : "DRY RUN"}\n`);
  console.log(`  providers            ${providers.length}`);
  console.log(`  would geocode        ${resolved.length}`);
  console.log(`  skipped              ${skipped.length}\n`);

  const byLocality = new Map<string, number>();
  for (const r of resolved) byLocality.set(r.locality, (byLocality.get(r.locality) ?? 0) + 1);
  console.log("  by locality:");
  for (const [loc, n] of [...byLocality.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}  ${loc}`);
  }

  if (skipped.length) {
    console.log("\n  skipped:");
    for (const s of skipped) console.log(`    ${s.name} — ${s.reason}`);
  }

  if (!apply) {
    console.log("\n  Dry run. Re-run with --apply to write.\n");
    return;
  }

  let written = 0;
  for (const r of resolved) {
    // Conditional on the coordinates still being null, so a concurrent real
    // geocode is never clobbered by this approximation.
    const res = await prisma.provider.updateMany({
      where: { id: r.id, geoLatitude: null, geoLongitude: null },
      data: { geoLatitude: r.lat, geoLongitude: r.lng },
    });
    written += res.count;
  }
  console.log(`\n  Wrote ${written} of ${resolved.length}.\n`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
