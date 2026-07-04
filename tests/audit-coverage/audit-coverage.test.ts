/**
 * PR-020 #2: the audit-coverage harness.
 *
 * Walks every server-action file under src/app, extracts exported async
 * functions, and asserts each one either
 *  (a) calls an audit facility (directly or via a known-auditing service), or
 *  (b) appears in tests/audit-coverage/catalogue.ts with a justification.
 *
 * A new mutation landing without audit — and without a conscious catalogue
 * entry — fails CI here. Removing an audit call from a covered action also
 * fails (the meta-test the plan requires was verified by deleting one call
 * locally during development).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { AUDIT_EXCLUSIONS, KNOWN_AUDITING_TOKENS } from "./catalogue";

const APP_ROOT = join(__dirname, "..", "..", "src", "app");

function findActionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findActionFiles(full, out);
    else if (entry.isFile() && /(^|-)actions\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

interface ActionFn {
  key: string; // "<relative path under (admin)/ or app>/<file>:<fn>"
  name: string;
  body: string;
  file: string;
}

function extractActions(file: string): ActionFn[] {
  const src = readFileSync(file, "utf8");
  const rel = relative(APP_ROOT, file).split("\\").join("/").replace(/^\(admin\)\//, "");
  const out: ActionFn[] = [];
  const pat = /export async function (\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(src))) {
    // Skip the parameter list first (params may carry object-typed annotations
    // full of braces), THEN brace-count the function body.
    let p = pat.lastIndex - 1; // at the opening paren
    let parenDepth = 0;
    while (p < src.length) {
      const ch = src[p];
      if (ch === "(") parenDepth++;
      else if (ch === ")") {
        parenDepth--;
        if (parenDepth === 0) break;
      }
      p++;
    }
    // Skip a return-type annotation (may itself contain <> and {}) to find the
    // real body brace: track <>/{}/() depth after a ':' until a '{' at depth 0.
    let q = p + 1;
    while (q < src.length && /\s/.test(src[q])) q++;
    if (src[q] === ":") {
      q++;
      let tDepth = 0;
      while (q < src.length) {
        const ch = src[q];
        if (ch === "<" || ch === "(") tDepth++;
        else if (ch === ">" || ch === ")") tDepth--;
        else if (ch === "{") {
          if (tDepth === 0) break; // the body brace
          tDepth++;
        } else if (ch === "}") tDepth--;
        q++;
      }
    } else {
      q = src.indexOf("{", p);
    }
    const i = q;
    if (i === -1 || i >= src.length) continue;
    let depth = 1;
    let j = i + 1;
    while (depth > 0 && j < src.length) {
      const ch = src[j];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      j++;
    }
    out.push({ key: `${rel}:${m[1]}`, name: m[1], body: src.slice(i, j), file: rel });
  }
  return out;
}

describe("audit coverage harness (PR-020)", () => {
  const files = findActionFiles(APP_ROOT);
  const actions = files.flatMap(extractActions);

  it("found a meaningful action surface", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(actions.length).toBeGreaterThan(100);
  });

  it("every server action is audited or consciously excluded", () => {
    const offenders: string[] = [];
    for (const a of actions) {
      const audited = KNOWN_AUDITING_TOKENS.some((t) => a.body.includes(t));
      const excluded = a.key in AUDIT_EXCLUSIONS;
      if (!audited && !excluded) offenders.push(a.key);
    }
    expect(
      offenders,
      `Unaudited server actions without a catalogue entry:\n  ${offenders.join("\n  ")}\n` +
        "Either add an audit call (writeAudit / auditChainService.append) or add a justified entry to tests/audit-coverage/catalogue.ts.",
    ).toEqual([]);
  });

  it("the catalogue carries no stale entries (excluded actions must still exist)", () => {
    const keys = new Set(actions.map((a) => a.key));
    const stale = Object.keys(AUDIT_EXCLUSIONS).filter((k) => !keys.has(k));
    expect(
      stale,
      `Catalogue entries with no matching action (delete them):\n  ${stale.join("\n  ")}`,
    ).toEqual([]);
  });

  it("the three UAT-proven gaps are now audited (not excluded)", () => {
    // provider create / update / activate, claim CAPTURED, contract child mutations
    const mustBeAudited = [
      "providers/new/actions.ts:addProviderAction",
      "providers/[id]/actions.ts:updateProviderMasterAction",
      "providers/[id]/actions.ts:setProviderStatusAction",
      "claims/[id]/actions.ts:adjudicateClaimAction",
      "contracts/[id]/manage-actions.ts:addPricingRuleAction",
      "contracts/[id]/manage-actions.ts:deactivatePricingRuleAction",
      "contracts/[id]/manage-actions.ts:addTariffLineAction",
      "contracts/[id]/manage-actions.ts:addApplicabilityAction",
      "contracts/[id]/manage-actions.ts:addContractPackageAction",
    ];
    for (const key of mustBeAudited) {
      const a = actions.find((x) => x.key === key);
      expect(a, `action ${key} not found`).toBeTruthy();
      expect(key in AUDIT_EXCLUSIONS, `${key} must not be excluded`).toBe(false);
      expect(
        KNOWN_AUDITING_TOKENS.some((t) => a!.body.includes(t)),
        `${key} must contain an audit call`,
      ).toBe(true);
    }
  });
});
