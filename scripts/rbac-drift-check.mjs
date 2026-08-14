#!/usr/bin/env node
/**
 * UAT-HF DEC-16 — catch a permission nobody can hold, before a user does.
 *
 * This exists because the same defect appeared three times in one day:
 *
 *   `member.sensitive.reveal`, `member.duplicate.review`,
 *   `network.analytics.read`, `support.operation.lookup`
 *        declared as constants beside their call sites, absent from the
 *        catalogue and from every role. `permitted()` is an exact string match,
 *        so only SUPER_ADMIN's `*` satisfied them. The duplicate-review surface
 *        and the support lookup were unreachable by anyone else.
 *
 *   `provider.preauth.cancel`
 *        in the catalogue, in no role at all. Nobody could cancel a
 *        pre-authorisation.
 *
 * Each was invisible to typecheck, lint and the test suite, because a string
 * that matches nothing is valid code. Each was found by hand, late, by someone
 * reading the tables. That is not a repeatable control, so this is.
 *
 * ## What it checks — all statically, no database
 *
 *   A. every `*_PERMISSION` constant in `src/` exists in the seed catalogue
 *   B. every catalogue permission is granted to at least one role
 *   C. every code a role grants exists in the catalogue
 *   D. every code in the runtime `ROLE_GRANTS` exists in the catalogue
 *
 * ## "Granted to no role" means no role BUT SUPER_ADMIN
 *
 * `prisma/seeds/rbac.ts` ends with `ROLE_PERMISSIONS["SUPER_ADMIN"] =
 * ALL_PERMISSION_CODES` — a computed assignment, not a literal, so the parsing
 * below cannot see it. Every catalogued permission is therefore held by
 * SUPER_ADMIN in the database, and an earlier wording of this check said
 * "granted to NO role", which was simply false: production showed both flagged
 * codes granted to SUPER_ADMIN.
 *
 * The signal is still the right one — SUPER_ADMIN holds `*`, so a permission
 * only it can hold is a permission no ordinary role can be given, which is the
 * defect this exists to catch. But the report has to say the true thing, or the
 * first person to check the database concludes the check is broken and stops
 * reading it.
 *
 * B distinguishes two cases, because they are not equally serious:
 *
 *   unheld AND checked in code   a feature nobody can reach. FAILS.
 *   unheld and never checked     dead vocabulary in the catalogue. Reported,
 *                                does not fail — nothing is broken by it, and
 *                                failing a release over an unused string would
 *                                teach people to silence this check.
 *
 * If a permission is deliberately unheld *and* checked — as
 * `support.operation.lookup` is, pending DEC-14 — say so in ALLOWED_UNHELD
 * with the reason. Silence is what this is built to remove.
 *
 * Run:
 *   node scripts/rbac-drift-check.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Permissions that intentionally have no role.
 *
 * An entry is a decision with a name attached, not an exemption to be widened
 * casually — the whole point is that an unheld permission is visible.
 */
const ALLOWED_UNHELD = {
  "support.operation.lookup":
    "DEC-14: shows other users' operations; deliberately SUPER_ADMIN-only until somebody owns support",
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|mjs)$/.test(full)) out.push(full);
  }
  return out;
}

// ── The catalogue and the grants, read as source ────────────────────────────
//
// Parsed rather than imported: importing the seed pulls in Prisma, and a drift
// check that needs a database connection to tell you about a typo is a check
// nobody runs.
const rbacSrc = readFileSync("prisma/seeds/rbac.ts", "utf8");
const providerSrc = readFileSync("prisma/seeds/provider-rbac.ts", "utf8");

const catalogue = new Set([
  ...[...rbacSrc.matchAll(/\{\s*code:\s*"([^"]+)"/g)].map((m) => m[1]),
  ...[...providerSrc.matchAll(/\{\s*code:\s*"([^"]+)",\s*description/g)].map((m) => m[1]),
]);

/** Every permission string that appears inside a role bundle. */
function grantedCodes(src, startMarkers) {
  const codes = new Set();
  for (const marker of startMarkers) {
    let i = src.indexOf(marker);
    while (i !== -1) {
      const end = src.indexOf("\n];", i);
      const body = src.slice(i, end === -1 ? undefined : end);
      for (const m of body.matchAll(/"([a-z]+\.[a-z_]+\.[a-z_]+|[A-Z_]+:[A-Z_]+)"/g)) codes.add(m[1]);
      i = src.indexOf(marker, i + 1);
    }
  }
  return codes;
}

const granted = new Set([
  ...grantedCodes(rbacSrc, ["const UNDERWRITER_PERMS = [", "export const ROLE_PERMISSIONS"]),
  ...grantedCodes(providerSrc, [
    "const FRONT_DESK = [", "const CLINICIAN = [", "const BILLER = [", "const FINANCE = [",
    "const PROVIDER_ADMIN = [", "const INTEGRATION_ADMIN = [", "const FACILITY_ADMIN = [",
    "const LEGACY = [",
  ]),
]);

// ── Findings ────────────────────────────────────────────────────────────────
const findings = [];

// A. constants in src/ that the catalogue does not define
for (const file of walk("src")) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/const\s+([A-Z_]*PERMISSION)\s*=\s*"([^"]+)"/g)) {
    const [, name, code] = m;
    if (!catalogue.has(code)) {
      findings.push(
        `${file}\n      ${name} = "${code}" is checked in code but is NOT in the seed catalogue.\n` +
          `      No role can be granted it, so only SUPER_ADMIN's wildcard satisfies it.`,
      );
    }
  }
}

// B. catalogue entries no role holds
//
// Split by whether anything actually checks the code. An unreachable feature is
// a defect; an unused string is untidiness, and conflating them would make this
// check something people learn to ignore.
const srcBlob = walk("src").map((f) => readFileSync(f, "utf8")).join("\n");
const unusedButDefined = [];
for (const code of catalogue) {
  if (granted.has(code)) continue;
  if (code in ALLOWED_UNHELD) continue;
  if (srcBlob.includes(`"${code}"`)) {
    findings.push(
      `prisma/seeds\n      "${code}" is CHECKED in src/ but granted to no role except SUPER_ADMIN.\n` +
        `      SUPER_ADMIN holds "*", so nobody else can be given it — whoever needs\n` +
        `      that surface cannot reach it. Grant it to a real role, or record why\n` +
        `      not in ALLOWED_UNHELD in this script.`,
    );
  } else {
    unusedButDefined.push(code);
  }
}

// C. grants referring to codes the catalogue does not define
for (const code of granted) {
  if (!catalogue.has(code)) {
    findings.push(
      `prisma/seeds\n      a role grants "${code}", which the catalogue does not define.\n` +
        `      seedRbac skips unknown codes silently, so this grant would never exist.`,
    );
  }
}

// D. runtime baseline referring to codes the catalogue does not define
const catalogSrc = readFileSync("src/lib/authz/catalog.ts", "utf8");
const grantsBody = catalogSrc.slice(
  catalogSrc.indexOf("export const ROLE_GRANTS"),
  catalogSrc.indexOf("export function effectivePermissions"),
);
for (const m of grantsBody.matchAll(/"([a-z]+\.[a-z_]+\.[a-z_]+|[A-Z_]+:[A-Z_]+)"/g)) {
  if (!catalogue.has(m[1])) {
    findings.push(
      `src/lib/authz/catalog.ts\n      ROLE_GRANTS references "${m[1]}", absent from the seed catalogue.\n` +
        `      The runtime would grant a permission the database never creates.`,
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
console.log("\nRBAC drift check\n");
console.log(`  catalogue permissions   ${catalogue.size}`);
console.log(`  held by a real role     ${[...catalogue].filter((c) => granted.has(c)).length}`);
console.log(`  deliberately unheld     ${Object.keys(ALLOWED_UNHELD).length}`);

if (unusedButDefined.length > 0) {
  console.log(`\n  ${unusedButDefined.length} defined, checked nowhere, held by nobody but SUPER_ADMIN (not a failure):`);
  for (const c of unusedButDefined) console.log(`    · ${c}`);
  console.log("    Dead vocabulary — remove them, or a surface is missing that should use them.");
  console.log("    Removing one also needs its Permission and RolePermission rows deleted in");
  console.log("    each environment: dropping it from the catalogue stops the seed RECREATING");
  console.log("    it, but seeds are additive and never delete.");
}

if (findings.length === 0) {
  console.log("\n  No drift. Every permission that code checks is grantable and held.\n");
  process.exit(0);
}

console.log(`\n  ${findings.length} finding(s):\n`);
for (const f of findings) console.log(`    • ${f}\n`);
console.log(
  "  Each of these is invisible to typecheck, lint and the tests, because a\n" +
    "  permission string that matches nothing is valid code.\n",
);
process.exit(1);
