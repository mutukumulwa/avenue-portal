#!/usr/bin/env node
/**
 * Brand + secret-leak guard (§D / D-10, PR-003, PR-004).
 *
 * Fails the build when shipped code contains:
 *  - the legacy operator brand "avenue" (case-insensitive),
 *  - rendered "AiCare" branding (case-sensitive — infra identifiers stay
 *    lowercase, internal doc refs stay ALL-CAPS),
 *  - the burned pre-2026-07 seed password,
 *  - seeded login emails rendered by UI code under src/app/**.
 *
 * Rules live in scripts/lib/guard-rules.mjs and are unit-tested in
 * tests/lib/brand-guard.test.ts.
 *
 * Wired as `prebuild` so `next build` (local + Vercel) fails on a hit,
 * and run directly in CI via .github/workflows/brand-guard.yml.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { GUARD_RULES, scanText } from "./lib/guard-rules.mjs";

const ROOTS = [...new Set(GUARD_RULES.flatMap((r) => r.roots))];

// Binary/asset extensions we shouldn't grep as text.
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".pdf", ".zip", ".gz", ".mp4", ".webm", ".mp3",
]);

const hits = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // missing root — nothing to scan
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    if (SKIP_EXT.has(extname(entry.name).toLowerCase())) continue;
    // Skip very large files (defensive; nothing legitimate here is huge).
    if (statSync(full).size > 5_000_000) continue;

    const relPath = relative(process.cwd(), full).split("\\").join("/");
    const text = readFileSync(full, "utf8");
    for (const f of scanText(text, relPath)) {
      hits.push(`${relPath}:${f.lineNumber}: [${f.rule}] ${f.text}`);
    }
  }
}

for (const root of ROOTS) walk(root);

if (hits.length > 0) {
  console.error(`\n✗ Brand/secret guard failed — remove these references:\n`);
  for (const h of hits) console.error(`    ${h}`);
  console.error(`\n  ${hits.length} occurrence(s) found. Rule rationale: scripts/lib/guard-rules.mjs\n`);
  process.exit(1);
}

console.log("✓ Brand/secret guard passed (avenue, rendered AiCare, burned password, seeded emails in UI).");
