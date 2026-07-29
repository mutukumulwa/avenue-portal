/**
 * F3.6 — fragmented PA persistence retired.
 *
 * With every rail converged on PreauthIntakeService (F3.4/F3.5), the legacy
 * ClaimsService.createPreAuth is dead and removed. This guard locks the
 * "single canonical creator" invariant so a fragmented PA-creation path cannot
 * silently reappear: `preAuthorization.create(` may exist ONLY in the canonical
 * intake and the adjudication AMENDMENT lifecycle.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ClaimsService } from "@/server/services/claims.service";

const SRC = join(__dirname, "..", "..", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("F3.6 — fragmented PA persistence retired (single canonical creator)", () => {
  it("ClaimsService no longer exposes createPreAuth", () => {
    expect((ClaimsService as unknown as Record<string, unknown>).createPreAuth).toBeUndefined();
  });

  it("claims.service.ts has no PA-creation path", () => {
    const src = readFileSync(join(SRC, "server", "services", "claims.service.ts"), "utf8");
    expect(src).not.toMatch(/createPreAuth/);
    expect(src).not.toMatch(/preAuthorization\.create\(/);
  });

  it("`preAuthorization.create(` appears ONLY in the canonical intake and the amendment lifecycle", () => {
    const allowed = new Set([
      join(SRC, "server", "services", "preauth-intake", "service.ts"),
      join(SRC, "server", "services", "preauth-adjudication.service.ts"),
    ]);
    const offenders = walk(SRC)
      .filter((f) => /preAuthorization\.create\(/.test(readFileSync(f, "utf8")))
      .filter((f) => !allowed.has(f));
    expect(offenders).toEqual([]);
  });
});
