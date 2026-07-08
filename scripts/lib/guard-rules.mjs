/**
 * Shared brand + secret-leak guard rules (PR-003 / PR-004).
 *
 * Consumed by scripts/check-no-avenue.mjs (prebuild + CI) and unit-tested via
 * tests/lib/brand-guard.test.ts so a regression in the rules themselves fails
 * the suite.
 *
 * Each rule: { name, pattern, roots, pathFilter?, why }.
 *  - pattern applies per line (case sensitivity is the rule's own choice).
 *  - roots limits which top-level directories are scanned.
 *  - pathFilter (optional) further restricts by relative file path.
 */

// Seeded login identities — these are working accounts in every seeded
// environment, so they must never be rendered by application UI code.
export const SEEDED_ACCOUNT_EMAILS = [
  "admin@medvex.co.ug",
  "claims@medvex.co.ug",
  "finance@medvex.co.ug",
  "underwriter@medvex.co.ug",
  "cs@medvex.co.ug",
  "medical@medvex.co.ug",
  "fund@medvex.co.ug",
  "member@medvex.co.ug",
  "broker@kaib.co.ke",
  "emily.wambui@safaricom.co.ke",
];

// The burned password published on /login pre-2026-07 (PR-003). Written as a
// split concatenation so this rules file never fails its own guard.
const BURNED_PASSWORD = ["Medvex", "Admin", "2024"].join("");

export const GUARD_RULES = [
  {
    name: "legacy-brand-avenue",
    pattern: /avenue/i,
    roots: ["src", "public", "prisma"],
    why: 'The Avenue→Medvex rebrand is complete (§D); "avenue" must not reappear in shipped code/assets/seeds.',
  },
  {
    name: "legacy-brand-aicare-rendered",
    // Case-sensitive: the rendered brand lockup is always written "AiCare".
    // Lowercase infra identifiers (bucket names, headers, storage keys) and
    // ALL-CAPS internal doc references (AICARE_TODO) are intentionally allowed.
    pattern: /AiCare/,
    roots: ["src", "public", "prisma"],
    why: 'Rendered "AiCare" branding must be Medvex (PR-004). Infra identifiers stay lowercase; doc refs stay ALL-CAPS.',
  },
  {
    name: "burned-seed-password",
    pattern: new RegExp(BURNED_PASSWORD),
    roots: ["src", "public", "prisma", "scripts"],
    why: "The pre-2026-07 seed password was published on the login page and is burned (PR-003). It must not appear anywhere in shipped code.",
  },
  {
    name: "in-source-default-api-secret",
    // BD-06: an operator/API auth key must come from the environment and fail
    // closed when unset — it must never fall back to an in-source default, or
    // that default ships as a live, guessable credential. Catches both the
    // `process.env.API_KEY || "…"` fail-open pattern and the two burned defaults
    // (av-slade360-dev-key, av-local-secret). Assigning API_KEY *to* a fallback
    // (`process.env.X || process.env.API_KEY`) is fine — only a string literal
    // default trips the first alternative.
    pattern: /process\.env\.API_KEY\s*\|\|\s*['"`]|av-slade360-dev-key|av-local-secret/,
    roots: ["src"],
    why: "A guessable in-source default auth secret ships as a live credential whenever the env var is unset (BD-06). API auth keys must be environment-only and fail closed.",
  },
  {
    name: "seeded-account-email-in-ui",
    pattern: new RegExp(SEEDED_ACCOUNT_EMAILS.map((e) => e.replace(/[.@]/g, "\\$&")).join("|"), "i"),
    roots: ["src"],
    // Only rendered application code — seeds/docs may legitimately reference them.
    pathFilter: (relPath) => relPath.startsWith("src/app/") && !relPath.includes("__fixtures__"),
    why: "Seeded login emails must not be rendered by UI code (PR-003) — they are working credentials in demo environments.",
  },
];

/**
 * Scan one file's text against every applicable rule.
 * Returns [{ rule, line, lineNumber, text }] — empty when clean.
 */
export function scanText(text, relPath) {
  const findings = [];
  const applicable = GUARD_RULES.filter((r) => {
    const inRoot = r.roots.some((root) => relPath === root || relPath.startsWith(root + "/"));
    if (!inRoot) return false;
    if (r.pathFilter && !r.pathFilter(relPath)) return false;
    return true;
  });
  if (applicable.length === 0) return findings;

  const lines = text.split(/\r?\n/);
  for (const rule of applicable) {
    lines.forEach((line, i) => {
      if (rule.pattern.test(line)) {
        findings.push({ rule: rule.name, lineNumber: i + 1, text: line.trim() });
      }
    });
  }
  return findings;
}
