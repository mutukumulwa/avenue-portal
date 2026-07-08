#!/usr/bin/env node
/**
 * Static currency-label guard (Outstanding-Conditions Ticket 3 / OBS-2 /
 * E2E-OBS-CUR).
 *
 * Base currency is UGX. Operational money surfaces must render the row's actual
 * currency (or base UGX) via the shared helpers in src/lib/utils.ts — never a
 * hardcoded KES denomination. This guard recursively scans the application and
 * fails the build if any surface reintroduces a hardcoded operational "KES"
 * label. It targets only the real antipatterns:
 *
 *   1. money template literals:      `KES ${amount.toLocaleString()}`
 *   2. JSX money labels:             KES {amount}
 *   3. column/field labels:          (KES)
 *   4. hardcoded formatter currency: currency: "KES"  /  currency="KES"
 *
 * Legitimate uses are intentionally NOT flagged: passing an explicit currency
 * argument (formatMoney(x, "KES")), a currency-selector <option value="KES">, a
 * "KES" entry in a currency list, comments, and Kenya-specific seed/demo/test
 * modules (skipped by path).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/app", "src/components", "src/server", "src/lib"];
const SKIP_DIR = /(^|\/)(node_modules|\.next|__tests__)(\/|$)/;
const SKIP_FILE = /\.(test|spec)\.(t|j)sx?$/;
const SKIP_PATH = /(seed|demo|fixture|mock)/i;

const PATTERNS = [
  { re: /KES \$\{/, why: 'money template literal `KES ${...}` — use formatMoney(amount, currency) or base UGX' },
  { re: /KES \{/, why: 'hardcoded JSX money label `KES {...}` — use {row.currency} or base UGX' },
  { re: /\(KES\)/, why: 'hardcoded "(KES)" column/field label — use the row currency or base UGX' },
  { re: /currency:\s*"KES"/, why: 'hardcoded currency: "KES" — default to base (UGX) or pass the row currency' },
  { re: /currency="KES"/, why: 'hardcoded currency="KES" — default to base (UGX) or pass the row currency' },
];

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (SKIP_DIR.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(t|j)sx?$/.test(p) && !SKIP_FILE.test(p) && !SKIP_PATH.test(p)) out.push(p);
  }
  return out;
}

let failures = 0;
let scanned = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    scanned++;
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      for (const { re, why } of PATTERNS) {
        if (re.test(line)) {
          console.error(`[currency-guard] ${file}:${i + 1} — ${why}\n    ${trimmed}`);
          failures++;
        }
      }
    });
  }
}

if (failures > 0) {
  console.error(`\n[currency-guard] FAILED — ${failures} hardcoded KES label(s) on operational money surfaces.`);
  process.exit(1);
}
console.log(`[currency-guard] OK — ${scanned} source files scanned, no hardcoded KES operational labels.`);
