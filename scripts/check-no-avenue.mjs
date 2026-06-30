#!/usr/bin/env node
/**
 * Brand guard (§D / D-10).
 *
 * Fails the build if the legacy operator brand name "avenue" reappears
 * anywhere in shipped code, assets, or seeds. The Avenue→Medvex rebrand
 * removed every trace; this guard keeps it that way.
 *
 * Scans: src/, public/, prisma/  (recursively).
 * Match: case-insensitive substring "avenue".
 * Exit:  0 if clean, 1 (with a file:line report) if any match is found.
 *
 * Wired as `prebuild` so `next build` (local + Vercel) fails on a hit,
 * and run directly in CI via .github/workflows/brand-guard.yml.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const ROOTS = ["src", "public", "prisma"];
const NEEDLE = /avenue/i;

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

    const text = readFileSync(full, "utf8");
    if (!NEEDLE.test(text)) continue;
    text.split(/\r?\n/).forEach((line, i) => {
      if (NEEDLE.test(line)) hits.push(`${full}:${i + 1}: ${line.trim()}`);
    });
  }
}

for (const root of ROOTS) walk(root);

if (hits.length > 0) {
  console.error(
    `\n✗ Brand guard failed: "avenue" must not appear in shipped code/assets/seeds.\n` +
      `  The Avenue→Medvex rebrand is complete (§D); remove these references:\n`
  );
  for (const h of hits) console.error(`    ${h}`);
  console.error(`\n  ${hits.length} occurrence(s) found.\n`);
  process.exit(1);
}

console.log("✓ Brand guard passed: no \"avenue\" references in src/, public/, prisma/.");
