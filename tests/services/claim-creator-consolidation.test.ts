/**
 * Claims Autopilot F0.2 — production claim-creator consolidation guard.
 *
 * Walks every TypeScript file under src/ and finds real `*.claim.create(` /
 * `*.claim.createMany(` calls (comment lines excluded). A create site that lives
 * in a file NOT on the allowlist below fails this test — that is how a NEW,
 * un-inventoried production claim creator is caught the moment it lands.
 *
 * The allowlist is TEMPORARY and must SHRINK as M5 (rail convergence) migrates
 * each rail to the canonical persist owner. To force that shrinkage honestly,
 * this test ALSO fails if an allowlisted file no longer creates claims — a
 * migration that removes a `Claim.create` must remove its allowlist entry (and
 * the matching row in docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md).
 *
 * Doc <-> guard parity is the F0.2 "Done when" condition. Keep this list and the
 * inventory table identical.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..", "src");

/**
 * Files permitted to call Claim.create today. `path -> reason`. Paths are
 * repo-relative with forward slashes. Shrinks per F5 migration; at F5.10 only
 * the canonical persist owner (plus documented case adapters) should remain.
 */
const ALLOWLIST: Record<string, string> = {
  // F5.1 DONE: claim-intake.ts (runClaimIntake) now delegates to ClaimIntakeService
  // — it no longer calls Claim.create, so it is removed from the allowlist.
  "src/server/services/claims.service.ts":
    "Legacy ClaimsService.createClaim (tRPC + PA conversion) pending deprecation (F5.3/F5.7).",
  "src/app/api/v1/claims/route.ts":
    "B2B API rail pre-migration (F5.2).",
  "src/app/api/claims/import/route.ts":
    "CSV import rail pre-migration (F5.4).",
  "src/app/(admin)/claims/new/actions.ts":
    "Admin reimbursement action pre-migration (F5.6).",
  "src/server/services/reimbursement.service.ts":
    "Reimbursement service rail pre-migration (F5.6).",
  "src/server/services/sync.service.ts":
    "Offline sync rail pre-migration (F5.5).",
  "src/server/services/case.service.ts":
    "Inpatient interim + final; becomes DERIVED_TRANSACTIONAL calling the canonical persist owner (F5.8/F5.9).",
  "src/server/services/claim-intake/persist.ts":
    "THE canonical production Claim.create owner (F3.3). The last entry standing after F5.10; every rail routes through it.",
};

/** Matches a genuine Prisma claim-create call, not `.claimLine.create` etc. */
const CREATE_RE = /\.claim\.create(Many)?\(/;

function isCommentLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** repo-relative path with forward slashes, e.g. "src/server/services/x.ts". */
function relPath(full: string): string {
  return relative(join(__dirname, "..", ".."), full).split(sep).join("/");
}

interface CreateSite {
  file: string;
  line: number;
  text: string;
}

function findCreateSites(): CreateSite[] {
  const sites: CreateSite[] = [];
  for (const full of walk(SRC_ROOT)) {
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (CREATE_RE.test(line) && !isCommentLine(line)) {
        sites.push({ file: relPath(full), line: i + 1, text: line.trim() });
      }
    });
  }
  return sites;
}

describe("Claims Autopilot — claim-creator consolidation guard (F0.2)", () => {
  const sites = findCreateSites();
  const filesWithCreates = [...new Set(sites.map((s) => s.file))].sort();

  it("finds the inventoried set of creators (guard is actually scanning)", () => {
    // Sanity: the scan must locate creators. A zero result means the regex or
    // the src root broke, which would silently disable the guard.
    expect(sites.length).toBeGreaterThanOrEqual(9);
  });

  it("has no production Claim.create outside the allowlist", () => {
    const offenders = sites.filter((s) => !(s.file in ALLOWLIST));
    const message =
      offenders.length === 0
        ? ""
        : "New un-inventoried claim creator(s) found. Route them through " +
          "ClaimIntakeService (the canonical persist owner), or — only with a " +
          "documented reason — add the file to ALLOWLIST here AND to " +
          "docs/claims-autopilot/CLAIM_CREATOR_INVENTORY.md:\n" +
          offenders.map((o) => `  - ${o.file}:${o.line}  ${o.text}`).join("\n");
    expect(offenders, message).toEqual([]);
  });

  it("has no stale allowlist entries (allowlist shrinks as rails migrate)", () => {
    const allowed = Object.keys(ALLOWLIST).sort();
    const stale = allowed.filter((f) => !filesWithCreates.includes(f));
    const message =
      stale.length === 0
        ? ""
        : "Allowlisted file(s) no longer call Claim.create. A migration removed " +
          "the creator — remove the ALLOWLIST entry and the inventory row too:\n" +
          stale.map((f) => `  - ${f}`).join("\n");
    expect(stale, message).toEqual([]);
  });
});
