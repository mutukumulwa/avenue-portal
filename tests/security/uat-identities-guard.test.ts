/**
 * WP-7 (DEF-005) — the disposable UAT identities must be impossible to seed by
 * accident. They exist to be locked out, reset and rotated, so creating them in
 * a live tenant would be a real incident.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { seedUatIdentities, UAT_IDENTITIES, UAT_IDENTITY_PREFIX } from "../../prisma/seeds/uat-identities";

const prismaStub = { user: { upsert: async () => ({}) } } as never;

const ENV_KEYS = ["UAT_TEST_IDENTITIES", "UAT_TEST_PASSWORD", "UAT_ALLOW_PROD"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  // NODE_ENV is readonly on the process.env type; vitest's stub handles it.
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.unstubAllEnvs();
});

describe("UAT identity seeding is opt-in and fail-closed", () => {
  it("refuses to run without the explicit opt-in flag", async () => {
    process.env.UAT_TEST_PASSWORD = "irrelevant";
    await expect(seedUatIdentities(prismaStub, "t1")).rejects.toThrow(/UAT_TEST_IDENTITIES=1/);
  });

  it("refuses to run without a supplied password", async () => {
    process.env.UAT_TEST_IDENTITIES = "1";
    await expect(seedUatIdentities(prismaStub, "t1")).rejects.toThrow(/UAT_TEST_PASSWORD/);
  });

  it("refuses to seed into production even when opted in", async () => {
    process.env.UAT_TEST_IDENTITIES = "1";
    process.env.UAT_TEST_PASSWORD = "irrelevant";
    vi.stubEnv("NODE_ENV", "production");
    await expect(seedUatIdentities(prismaStub, "t1")).rejects.toThrow(/production/i);
  });

  it("runs when explicitly opted in outside production", async () => {
    process.env.UAT_TEST_IDENTITIES = "1";
    process.env.UAT_TEST_PASSWORD = "irrelevant";
    await expect(seedUatIdentities(prismaStub, "t1")).resolves.toHaveLength(UAT_IDENTITIES.length);
  });
});

describe("UAT identities are recognisable and disposable", () => {
  it("every identity carries the retirement prefix", () => {
    for (const identity of UAT_IDENTITIES) {
      expect(identity.email.startsWith(UAT_IDENTITY_PREFIX)).toBe(true);
    }
  });

  it("no password is committed in the module source", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../../prisma/seeds/uat-identities.ts"), "utf8");
    // A default password would be a credential in the repository.
    expect(src).not.toMatch(/UAT_TEST_PASSWORD\s*\|\|/);
    expect(src).not.toMatch(/UAT_TEST_PASSWORD\s*\?\?/);
  });

  it("covers the authentication scenarios the UAT could not run", () => {
    const purposes = UAT_IDENTITIES.map((i) => i.purpose).join(" ");
    for (const scenario of ["A-003", "A-005", "A-006", "A-007", "A-008", "A-009"]) {
      expect(purposes).toContain(scenario);
    }
  });
});
