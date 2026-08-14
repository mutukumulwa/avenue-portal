import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * `scripts/db-sync.mjs` must not guess which schema-deploy mode production wants.
 *
 * It used to default to `push` when `SCHEMA_DEPLOY_MODE` was absent. That
 * fallback is how **five consecutive production deploys** ran `prisma db push`
 * while everyone believed the migrate cutover was live: each applied schema
 * changes without recording a migration row, and the row then had to be written
 * into `_prisma_migrations` by hand before `migrate deploy` could ever run.
 *
 * The variable had been set on a *sibling project* in the same Vercel team —
 * which reads as configured in the dashboard and reaches nothing. A default
 * that is silently wrong is the defect class this branch exists to remove, so
 * production now has to say what it wants. `push` is still perfectly valid; it
 * just has to be chosen rather than inherited.
 *
 * These run the real script, because the thing being asserted is its exit code.
 */

function runDbSync(env: Record<string, string>): { code: number; out: string } {
  try {
    const out = execFileSync("node", ["scripts/db-sync.mjs"], {
      env: { ...process.env, SCHEMA_DEPLOY_MODE: "", ...env, FORCE_COLOR: "0" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

/** `env -u` semantics: vitest's own env may define the variable. */
function withoutMode(env: Record<string, string>) {
  // NodeJS.ProcessEnv, not Record<string, string> — execFileSync's `env` requires
  // the fuller shape, and spreading process.env into a narrower type loses it.
  const copy: NodeJS.ProcessEnv = { ...process.env, ...env };
  delete copy.SCHEMA_DEPLOY_MODE;
  try {
    const out = execFileSync("node", ["scripts/db-sync.mjs"], {
      env: copy,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("db-sync refuses to guess on production", () => {
  it("fails the build when the mode is not set", () => {
    const { code, out } = withoutMode({ VERCEL_ENV: "production", DIRECT_URL: "postgres://x" });
    expect(code).toBe(1);
    expect(out).toMatch(/is not set on this production deployment/i);
  });

  it("says what to set, and both valid values", () => {
    // An error that does not say how to fix it just relocates the confusion.
    const { out } = withoutMode({ VERCEL_ENV: "production", DIRECT_URL: "postgres://x" });
    expect(out).toMatch(/SCHEMA_DEPLOY_MODE=migrate/);
    expect(out).toMatch(/SCHEMA_DEPLOY_MODE=push/);
    expect(out).toMatch(/PRODUCTION environment/);
  });

  it("names the failure mode that actually happened", () => {
    // It was set on a sibling project in the same team. Anyone hitting this
    // error should check the project, not just the value.
    const { out } = withoutMode({ VERCEL_ENV: "production", DIRECT_URL: "postgres://x" });
    // `\s+` because the message is hard-wrapped and the phrase straddles a
    // line break — a literal space here would pass or fail on formatting.
    expect(out).toMatch(/sibling\s+project/i);
  });

  it("prints the raw value before deciding anything", () => {
    const { out } = withoutMode({ VERCEL_ENV: "production", DIRECT_URL: "postgres://x" });
    expect(out).toMatch(/SCHEMA_DEPLOY_MODE=<undefined>/);
  });
});

describe("db-sync stays out of the way everywhere else", () => {
  it("a local build is untouched", () => {
    // No VERCEL_ENV. Developers run `npm run build` constantly and must never
    // be asked to configure a production deploy variable.
    const { code, out } = withoutMode({ VERCEL_ENV: "" });
    expect(code).toBe(0);
    expect(out).toMatch(/Skipping schema sync/);
  });

  it("a preview deploy is untouched", () => {
    const { code, out } = withoutMode({ VERCEL_ENV: "preview" });
    expect(code).toBe(0);
    expect(out).toMatch(/Skipping schema sync/);
  });

  it("the guard sits AFTER the DIRECT_URL check, so it cannot mask that one", () => {
    // A missing DIRECT_URL is its own diagnosis; reporting the mode instead
    // would send someone to the wrong setting.
    const { code, out } = runDbSync({ VERCEL_ENV: "production", SCHEMA_DEPLOY_MODE: "migrate", DIRECT_URL: "" });
    expect(code).toBe(0);
    expect(out).toMatch(/DIRECT_URL not set/);
  });
});
