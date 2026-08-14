import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * UAT-HF DEC-16 — the drift check has to actually fire.
 *
 * Five permissions reached this branch that nobody but SUPER_ADMIN could hold,
 * and every one of them passed typecheck, ESLint and the full suite, because a
 * permission string that matches nothing is syntactically perfect code. The
 * check added to the gate is only worth its runtime if it fails on each of
 * those shapes — so each is reconstructed here and asserted to fail.
 *
 * The fixtures are a minimal repository rather than the real one: the point is
 * to introduce drift deliberately, which cannot be done to `prisma/seeds`
 * without breaking everything else. The final test runs the check against the
 * real tree, so the fixtures never drift into testing only themselves.
 */

const SCRIPT = resolve("scripts/rbac-drift-check.mjs");
let dir: string;

/** A consistent tiny repo: two permissions, both catalogued, both granted. */
function fixture(over: Partial<Record<"rbac" | "provider" | "catalog" | "srcFile", string>> = {}) {
  mkdirSync(join(dir, "prisma/seeds"), { recursive: true });
  mkdirSync(join(dir, "src/lib/authz"), { recursive: true });

  writeFileSync(
    join(dir, "prisma/seeds/rbac.ts"),
    over.rbac ??
      `export const PERMISSIONS = [
  { code: "member.read.basic", description: "d" },
];
export const ROLE_PERMISSIONS = {
  CLAIMS_OFFICER: ["member.read.basic"],
};
`,
  );

  writeFileSync(
    join(dir, "prisma/seeds/provider-rbac.ts"),
    over.provider ??
      `export const PROVIDER_PERMISSIONS = [
  { code: "provider.claim.submit", description: "d" },
];
const FRONT_DESK = [
  "provider.claim.submit",
];
export const PROVIDER_ROLE_PERMISSIONS = { PROVIDER_FRONT_DESK: FRONT_DESK };
`,
  );

  writeFileSync(
    join(dir, "src/lib/authz/catalog.ts"),
    over.catalog ??
      `export const ROLE_GRANTS = {
  CLAIMS_OFFICER: ["member.read.basic"],
};
export function effectivePermissions() {}
`,
  );

  writeFileSync(join(dir, "src/some-service.ts"), over.srcFile ?? "export const NOTHING = 1;\n");
}

function runCheck(): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("node", [SCRIPT], { cwd: dir, encoding: "utf8" }) };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "rbac-drift-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("a consistent catalogue passes", () => {
  it("exits zero when every code is defined and held", () => {
    fixture();
    const { code, out } = runCheck();
    expect(code).toBe(0);
    expect(out).toMatch(/No drift/);
  });
});

describe("A — a permission checked in code that no catalogue defines", () => {
  // The exact shape of the four this branch had to rescue: a constant declared
  // beside its call site, never added to the seed.
  const OFFENDING = `const SENSITIVE_REVEAL_PERMISSION = "member.sensitive.reveal";
export function guard() { return SENSITIVE_REVEAL_PERMISSION; }
`;

  it("fails the gate", () => {
    fixture({ srcFile: OFFENDING });
    expect(runCheck().code).toBe(1);
  });

  it("names the file, the constant and the code", () => {
    // A gate failure that does not say which string is wrong sends someone
    // reading 86 permissions by hand — which is how this took a day.
    fixture({ srcFile: OFFENDING });
    const { out } = runCheck();
    expect(out).toMatch(/some-service\.ts/);
    expect(out).toMatch(/SENSITIVE_REVEAL_PERMISSION/);
    expect(out).toMatch(/member\.sensitive\.reveal/);
  });

  it("explains why the tests did not catch it", () => {
    fixture({ srcFile: OFFENDING });
    expect(runCheck().out).toMatch(/only SUPER_ADMIN's wildcard/i);
  });
});

describe("B — a catalogued permission that no role holds", () => {
  const UNGRANTED = `export const PERMISSIONS = [
  { code: "member.read.basic", description: "d" },
  { code: "provider.preauth.cancel", description: "d" },
];
export const ROLE_PERMISSIONS = {
  CLAIMS_OFFICER: ["member.read.basic"],
};
`;

  it("fails when something in src/ actually checks it", () => {
    // `provider.preauth.cancel` exactly: catalogued, checked, held by nobody,
    // so the cancel path was unreachable.
    fixture({ rbac: UNGRANTED, srcFile: `const P = "provider.preauth.cancel";\n` });
    const { code, out } = runCheck();
    expect(code).toBe(1);
    expect(out).toMatch(/CHECKED in src\/ but granted to NO role/);
  });

  it("reports but does NOT fail when nothing checks it", () => {
    // BROKER:MANAGE and ANALYTICS:EXPORT are this case in the real repository.
    // Failing a release over an unused string is how a check gets silenced.
    fixture({ rbac: UNGRANTED });
    const { code, out } = runCheck();
    expect(code).toBe(0);
    expect(out).toMatch(/defined but never checked or granted \(not a failure\)/);
    expect(out).toMatch(/provider\.preauth\.cancel/);
  });

  it("honours an ALLOWED_UNHELD entry", () => {
    // support.operation.lookup is checked in code and deliberately unheld. It
    // must not fail the gate, and the real script's allow-list is what proves
    // the mechanism works.
    const realRbac = resolve("prisma/seeds/rbac.ts");
    mkdirSync(join(dir, "prisma/seeds"), { recursive: true });
    mkdirSync(join(dir, "src/lib/authz"), { recursive: true });
    copyFileSync(realRbac, join(dir, "prisma/seeds/rbac.ts"));
    copyFileSync(resolve("prisma/seeds/provider-rbac.ts"), join(dir, "prisma/seeds/provider-rbac.ts"));
    copyFileSync(resolve("src/lib/authz/catalog.ts"), join(dir, "src/lib/authz/catalog.ts"));
    writeFileSync(join(dir, "src/x.ts"), `const P = "support.operation.lookup";\n`);
    expect(runCheck().code).toBe(0);
  });
});

describe("C — a role granting a code the catalogue does not define", () => {
  it("fails, because seedRbac would skip that grant in silence", () => {
    fixture({
      rbac: `export const PERMISSIONS = [
  { code: "member.read.basic", description: "d" },
];
export const ROLE_PERMISSIONS = {
  CLAIMS_OFFICER: ["member.read.basic", "member.read.typo"],
};
`,
    });
    const { code, out } = runCheck();
    expect(code).toBe(1);
    expect(out).toMatch(/member\.read\.typo/);
    expect(out).toMatch(/skips unknown codes silently/);
  });
});

describe("D — the runtime baseline referring to a code the catalogue lacks", () => {
  it("fails, because the runtime would grant what the database never creates", () => {
    fixture({
      catalog: `export const ROLE_GRANTS = {
  CLAIMS_OFFICER: ["member.read.basic", "member.ghost.permission"],
};
export function effectivePermissions() {}
`,
    });
    const { code, out } = runCheck();
    expect(code).toBe(1);
    expect(out).toMatch(/member\.ghost\.permission/);
    expect(out).toMatch(/ROLE_GRANTS references/);
  });
});

describe("the real repository", () => {
  it("passes its own check", () => {
    // Without this the fixtures could drift into testing only themselves.
    const out = execFileSync("node", [SCRIPT], { cwd: resolve("."), encoding: "utf8" });
    expect(out).toMatch(/No drift/);
  });
});
