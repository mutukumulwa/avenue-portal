/**
 * Claims Autopilot F5.10 — claim STATUS mutation source guard.
 *
 * With intake consolidated (every creator routes through the canonical
 * persist), the remaining way to corrupt the money path is a stray direct
 * `claim.update(...{ status })` outside the sanctioned lifecycle owners. This
 * guard walks src/** and fails when a claim-status write appears in a file not
 * on the documented allowlist — a new unsanctioned decision/settlement path
 * turns the build red instead of surfacing in a UAT.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(__dirname, "..", "..", "src");

/** Files sanctioned to write Claim.status. `path -> why`. */
const ALLOWLIST: Record<string, string> = {
  "src/server/services/claim-decision.service.ts":
    "THE canonical decision owner (D10) — decide/void set decision statuses atomically with money effects.",
  "src/server/services/claim-adjudication.service.ts":
    "Settlement lifecycle owner — batch settle/paid transitions under maker/checker.",
  "src/server/services/reimbursement.service.ts":
    "Guarded disburse — marks the reimbursement claim paid after voucher posting.",
  "src/app/(admin)/claims/[id]/actions.ts":
    "Pre-decision lifecycle steps (RECEIVED→CAPTURED/UNDER_REVIEW) — no money effect.",
  "src/app/(admin)/fraud/[id]/actions.ts":
    "Fraud hold — locks a claim to UNDER_REVIEW pending investigation (no money effect).",
  "src/app/(admin)/fraud/actions.ts":
    "Fraud escalation hold — locks a claim to UNDER_REVIEW (no money effect).",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function relPath(full: string): string {
  return relative(join(__dirname, "..", ".."), full).split(sep).join("/");
}

interface StatusWrite {
  file: string;
  line: number;
  snippet: string;
}

/**
 * Find `*.claim.update(...)` / `*.claim.updateMany(...)` calls whose data block
 * (the following ~12 lines) writes `status:`. Line-comment occurrences ignored.
 */
function findStatusWrites(): StatusWrite[] {
  const writes: StatusWrite[] = [];
  const CALL_RE = /\.claim\.update(Many)?\(/;
  for (const full of walk(SRC_ROOT)) {
    const lines = readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*")) return;
      if (!CALL_RE.test(line)) return;
      const windowText = lines.slice(i, i + 12).join("\n");
      if (/\bstatus\s*:/.test(windowText)) {
        writes.push({ file: relPath(full), line: i + 1, snippet: t.slice(0, 120) });
      }
    });
  }
  return writes;
}

describe("Claims Autopilot — claim status mutation guard (F5.10)", () => {
  const writes = findStatusWrites();

  it("finds the sanctioned set of status writers (guard is actually scanning)", () => {
    expect(writes.length).toBeGreaterThanOrEqual(Object.keys(ALLOWLIST).length - 2);
  });

  it("has no claim STATUS write outside the sanctioned lifecycle owners", () => {
    const offenders = writes.filter((w) => !(w.file in ALLOWLIST));
    const message =
      offenders.length === 0
        ? ""
        : "Unsanctioned claim-status mutation(s). Route decisions through " +
          "ClaimDecisionService and settlement through claimAdjudicationService, " +
          "or — with a documented reason — add the file here:\n" +
          offenders.map((o) => `  - ${o.file}:${o.line}  ${o.snippet}`).join("\n");
    expect(offenders, message).toEqual([]);
  });

  it("has no stale allowlist entries", () => {
    const files = new Set(writes.map((w) => w.file));
    const stale = Object.keys(ALLOWLIST).filter((f) => !files.has(f));
    expect(stale, `Allowlisted file(s) no longer write claim status — remove them:\n  ${stale.join("\n  ")}`).toEqual([]);
  });
});
