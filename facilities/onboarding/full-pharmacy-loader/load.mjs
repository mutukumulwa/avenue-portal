// Full pharmacy-master loader — run this from the repo root on YOUR machine
// (the Supabase pooler is reachable from there, but not from the assistant's sandbox).
//
//   DATABASE_URL='postgresql://postgres.<ref>:<pwd>@aws-1-eu-central-1.pooler.supabase.com:6543/postgres' \
//     node facilities/onboarding/full-pharmacy-loader/load.mjs
//
// Options:
//   DRUGS_ONLY=1   exclude surgical consumables/implants/sutures (~drugs only)
//   DRY_RUN=1      report what it would do, change nothing
//
// It targets every Provider of type PHARMACY with an ACTIVE contract, deactivates
// their current tariff lines, and loads the full ~9,807-product formulary
// (reference UGX prices). Idempotent: re-running deactivates + reloads cleanly.
import pg from "pg";
import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = process.env.DATABASE_URL;
if (!raw) { console.error("✗ Set DATABASE_URL to your Supabase pooler connection string."); process.exit(1); }
const u = new URL(raw); u.search = ""; // drop ?pgbouncer=true etc. — node-pg doesn't need it
const connectionString = u.toString();

const DRUGS_ONLY = process.env.DRUGS_ONLY === "1";
const DRY_RUN = process.env.DRY_RUN === "1";
const NON_DRUG = /surgical item|implant|suture|ot equip/i;

let items = JSON.parse(fs.readFileSync(join(__dir, "pharmacy-catalogue.json"), "utf8"));
if (DRUGS_ONLY) items = items.filter((i) => !NON_DRUG.test(i.category));
console.log(`Catalogue: ${items.length} items${DRUGS_ONLY ? " (drugs only)" : " (full master)"}${DRY_RUN ? " · DRY RUN" : ""}`);

const cuid = (s) => "c" + Buffer.from(Math.random().toString(36) + Date.now() + s).toString("hex").slice(0, 24);
const pool = new pg.Pool({ connectionString, max: 3, ssl: { rejectUnauthorized: false } });
const COLS = `(id,"providerId","contractId","cptCode","serviceName","agreedRate",currency,"tariffType","rateType","unitOfMeasure","requiresPreauth","rateMissing","effectiveFrom","isActive","createdAt","providerServiceCode",notes)`;
const PER = 7;

const c = await pool.connect();
try {
  const { rows: contracts } = await c.query(
    `select p.id as pid, k.id as cid, p.name
       from "Provider" p
       join "ProviderContract" k on k."providerId"=p.id and k.status='ACTIVE'
      where p.type='PHARMACY' order by p.name`);
  console.log(`Pharmacy contracts: ${contracts.length}`);
  if (!contracts.length) { console.log("Nothing to do."); process.exit(0); }
  if (DRY_RUN) {
    console.log(`Would load ${items.length} lines into each → ${(contracts.length * items.length).toLocaleString()} rows total.`);
    contracts.forEach((x) => console.log("  •", x.name));
    process.exit(0);
  }

  const cids = contracts.map((x) => x.cid);
  const del = await c.query(`update "ProviderTariff" set "isActive"=false where "contractId" = any($1::text[]) and "isActive"`, [cids]);
  console.log(`Deactivated ${del.rowCount} existing lines.`);

  let inserted = 0;
  const BATCH = 400;
  for (const ct of contracts) {
    for (let i = 0; i < items.length; i += BATCH) {
      const slice = items.slice(i, i + BATCH);
      const params = [];
      const rows = slice.map((it, j) => {
        const o = j * PER;
        params.push(cuid(ct.cid + it.code + i + j), ct.pid, ct.cid, it.code, it.name, it.price, "[full pharmacy master] reference UGX price");
        return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},'UGX','NEGOTIATED'::"TariffType",'FIXED'::"TariffRateType",'PER_ITEM'::"UnitOfMeasure",false,false,'2026-07-01'::timestamp,true,now(),$${o+4},$${o+7})`;
      });
      await c.query(`insert into "ProviderTariff" ${COLS} values ${rows.join(",")}`, params);
      inserted += slice.length;
    }
    console.log(`  ✓ ${ct.name}  (+${items.length})`);
  }
  console.log(`\nDone. Inserted ${inserted.toLocaleString()} lines across ${contracts.length} pharmacies.`);
} catch (e) {
  console.error("✗ Error:", e.message);
  process.exit(1);
} finally {
  c.release();
  await pool.end();
}
