#!/usr/bin/env node
/**
 * UAT-HF P01.05 — static guard against Kenyan and ambiguous locale defaults.
 *
 * This is a Uganda deployment. The run found the wrong country baked into worked
 * examples, address taxonomy, map fallbacks and date rendering:
 *
 *   DEF-006  member forms show a Kenyan "+254 700 000000" phone example
 *   DEF-049  provider/branch examples are all Kenyan, and the address field is
 *            labelled "County" — the Kenyan unit; Uganda uses Districts
 *   DEF-007  "Find Care" fell back to NAIROBI COORDINATES on denied geolocation,
 *   DEF-033  silently moving a Ugandan member to another country
 *   DEF-017  dates rendered three ways, including browser-locale-dependent
 *            output — the same endorsement read "7/1/2026" in one portal and
 *            "01/07/2026" in another, six months apart
 *
 * ── RATCHET ────────────────────────────────────────────────────────────────
 * These violations already exist in ~30 files, and fixing the call sites is
 * owned by P03.04 (the map fallback) and P11.03 (labels, examples, dates) — not
 * by P01.05, which builds the primitives they will use.
 *
 * So this guard is a ratchet, not a big-bang gate: every violation present when
 * it was introduced is recorded in `locale-guard-baseline.json`, and only NEW
 * ones fail the build. As P03.04 and P11.03 land, the baseline shrinks; a file
 * that drops below its recorded count is reported so the baseline can be tightened.
 *
 * Refresh the baseline deliberately, never casually:
 *   node scripts/check-locale-defaults.mjs --update-baseline
 *
 * Per-line exemption for a legitimate case (a Kenyan cross-border provider, a
 * genuine multi-currency row):
 *   // locale-guard-ok: <reason>
 * on the offending line or the line immediately above.
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/app", "src/components", "src/server", "src/lib"];
const SKIP_DIR = /(^|\/)(node_modules|\.next|__tests__)(\/|$)/;
const SKIP_FILE = /\.(test|spec)\.(t|j)sx?$/;
/** Seeds/demos/fixtures legitimately carry other countries' sample data. */
const SKIP_PATH = /(seed|demo|fixture|mock)/i;
const BASELINE_PATH = "scripts/locale-guard-baseline.json";
const EXEMPTION = /locale-guard-ok/;

const RULES = [
  {
    id: "kenyan-calling-code",
    re: /\+254/,
    why: 'Kenyan calling code "+254" — Uganda is +256. Use EXAMPLES.phone from src/lib/locale-config.ts',
  },
  {
    id: "nairobi-coordinates",
    // -1.2921, 36.8219 and near neighbours: the literal Nairobi city centre.
    re: /-1\.2[89]\d*\s*,\s*36\.8[12]\d*|36\.8[12]\d*\s*,\s*-1\.2[89]\d*|lat:\s*-1\.2[89]|latitude:\s*-1\.2[89]/,
    why: "Nairobi fallback coordinates — DEF-007/DEF-033. Handle denied geolocation explicitly; see COUNTRY_MAP_CENTRE",
  },
  {
    id: "kenyan-admin-unit",
    // Label-ish contexts only, so a `county` database column is not flagged.
    re: />\s*County\s*<|placeholder="County"|placeholder='County'|>County not set<|"County"\s*[,}]/,
    why: 'Kenyan admin unit "County" as a user-facing label — Uganda uses Districts. Use ADMIN_UNIT_LABEL',
  },
  {
    id: "ambiguous-date-format",
    // No-argument toLocaleDateString/toLocaleString renders by BROWSER locale.
    re: /\.toLocaleDateString\(\s*\)|\.toLocaleTimeString\(\s*\)/,
    why: "browser-locale date output is ambiguous (DEF-017) — use formatCalendarDate/formatInstant from src/lib/calendar-date.ts",
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (SKIP_DIR.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(t|j)sx?$/.test(p) && !SKIP_FILE.test(p) && !SKIP_PATH.test(p)) out.push(p);
  }
  return out;
}

/** { "path": { ruleId: count } } */
function scan() {
  const found = {};
  let scanned = 0;
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      scanned += 1;
      const rel = relative(process.cwd(), file);
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        // Comments describe the problem; they are not the problem.
        if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
        if (EXEMPTION.test(line) || (i > 0 && EXEMPTION.test(lines[i - 1]))) return;
        for (const rule of RULES) {
          if (rule.re.test(line)) {
            found[rel] ??= {};
            found[rel][rule.id] = (found[rel][rule.id] ?? 0) + 1;
            found[rel][`${rule.id}:lines`] = [...(found[rel][`${rule.id}:lines`] ?? []), i + 1];
          }
        }
      });
    }
  }
  return { found, scanned };
}

const { found, scanned } = scan();

// Counts only — line numbers move for unrelated reasons and would churn the file.
const counts = Object.fromEntries(
  Object.entries(found).map(([file, hits]) => [
    file,
    Object.fromEntries(Object.entries(hits).filter(([k]) => !k.endsWith(":lines"))),
  ]),
);

if (process.argv.includes("--update-baseline")) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
  const total = Object.values(counts).reduce((n, r) => n + Object.values(r).reduce((a, b) => a + b, 0), 0);
  console.log(`[locale-guard] baseline written: ${Object.keys(counts).length} files, ${total} known violations.`);
  process.exit(0);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : {};

let newViolations = 0;
let improved = 0;

for (const [file, hits] of Object.entries(found)) {
  for (const rule of RULES) {
    const now = hits[rule.id] ?? 0;
    if (!now) continue;
    const allowed = baseline[file]?.[rule.id] ?? 0;
    if (now > allowed) {
      newViolations += now - allowed;
      const lines = hits[`${rule.id}:lines`] ?? [];
      console.error(`✗ ${file}:${lines.join(",")}  [${rule.id}] ${rule.why}`);
      if (allowed > 0) console.error(`   (${allowed} known, ${now} now — this change added ${now - allowed})`);
    }
  }
}

// A file that improved should tighten the baseline, or the ratchet slips back.
for (const [file, rules] of Object.entries(baseline)) {
  for (const [ruleId, allowed] of Object.entries(rules)) {
    const now = found[file]?.[ruleId] ?? 0;
    if (now < allowed) improved += allowed - now;
  }
}

if (newViolations > 0) {
  console.error(
    `\n[locale-guard] ${newViolations} NEW locale violation(s) in ${scanned} files.\n` +
      `Use src/lib/locale-config.ts (EXAMPLES, ADMIN_UNIT_LABEL, CALLING_CODE) and\n` +
      `src/lib/calendar-date.ts (formatCalendarDate/formatInstant). If the value is\n` +
      `genuinely correct — a Kenyan cross-border provider, say — annotate the line\n` +
      `with "// locale-guard-ok: <reason>".`,
  );
  process.exit(1);
}

const knownTotal = Object.values(baseline).reduce((n, r) => n + Object.values(r).reduce((a, b) => a + b, 0), 0);
console.log(
  `[locale-guard] OK — ${scanned} files scanned, no new violations. ` +
    `${knownTotal} known violation(s) remain, owned by P03.04 and P11.03.`,
);
if (improved > 0) {
  console.log(
    `[locale-guard] ${improved} baselined violation(s) have been FIXED. ` +
      `Run "node scripts/check-locale-defaults.mjs --update-baseline" to tighten the ratchet.`,
  );
}
