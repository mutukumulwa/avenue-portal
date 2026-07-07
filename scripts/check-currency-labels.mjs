#!/usr/bin/env node
/**
 * Static currency-label guard (Outstanding-Conditions Ticket 3 / OBS-2).
 *
 * Fails the build if a CORE outpatient money surface hardcodes the KES
 * denomination for an operational label. It targets the two real antipatterns:
 *
 *   1. money template literals:      `KES ${amount.toLocaleString()}`
 *   2. hardcoded formatter currency: currency: "KES"  /  currency="KES"
 *
 * Legitimate uses are intentionally NOT flagged: passing an explicit currency
 * argument (formatMoney(x, "KES")), a currency-selector <option value="KES">,
 * comments, and Kenya-specific seed/demo modules (not in the core list).
 *
 * Base currency is UGX; core financial surfaces must render the row's actual
 * currency (or base) via the shared helpers in src/lib/utils.ts.
 */
import { readFileSync } from "node:fs";

// Curated list of core money surfaces kept clean. Grow this as surfaces are
// migrated to the shared formatter; do NOT add Kenya-specific seed modules.
const CORE_SURFACES = [
  "src/lib/utils.ts",
  "src/server/services/gl.service.ts",
  "src/server/services/claim-decision.service.ts",
  "src/server/services/claim-adjudication.service.ts",
];

const PATTERNS = [
  { re: /KES\s*\$\{/, why: 'money template literal `KES ${...}` — use formatMoney(amount, currency)' },
  { re: /currency\s*[:=]\s*["']KES["']/, why: 'hardcoded currency: "KES" — default to base (UGX) or pass the row currency' },
];

let failures = 0;
for (const file of CORE_SURFACES) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    console.warn(`[currency-guard] skip (not found): ${file}`);
    continue;
  }
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    // Skip comment-only lines.
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    for (const { re, why } of PATTERNS) {
      if (re.test(line)) {
        console.error(`[currency-guard] ${file}:${i + 1} — ${why}\n    ${trimmed}`);
        failures++;
      }
    }
  });
}

if (failures > 0) {
  console.error(`\n[currency-guard] FAILED — ${failures} hardcoded KES label(s) on core money surfaces.`);
  process.exit(1);
}
console.log(`[currency-guard] OK — ${CORE_SURFACES.length} core money surfaces clean.`);
