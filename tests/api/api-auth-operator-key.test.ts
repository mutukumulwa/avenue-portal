/**
 * BD-06 regression: the operator/global API key must be environment-only and
 * fail closed.
 *
 *  - There is NO in-source default. When API_KEY is unset or empty the operator
 *    channel is disabled, so the previously-shipped default "av-slade360-dev-key"
 *    (and any other value) authenticates as nothing.
 *  - When API_KEY is configured, ONLY that exact value resolves to an operator
 *    credential (constant-time match); the burned default no longer does.
 *  - OPERATOR_TENANT_ID binds the operator credential to a single tenant so it
 *    cannot silently span additional tenants.
 *  - Per-facility ProviderApiKeys keep working through their own channel.
 *
 * A second assertion scans the source so the fail-open pattern and the burned
 * default literal can never re-enter apiAuth.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const verify = vi.hoisted(() => vi.fn(async (_key: string) => null as
  | { tenantId: string; providerId: string; keyId: string }
  | null));

vi.mock("@/server/services/provider-api-key.service", () => ({
  ProviderApiKeyService: { verify },
}));

import { getApiCredential } from "@/lib/apiAuth";

const BURNED_DEFAULT = ["av", "slade360", "dev", "key"].join("-");
const STRONG_KEY = "k_9f3a2c7e51b04d8e9a6f0c1d2e3b4a56";

const reqWith = (headers: Record<string, string>) =>
  new Request("https://x/api/v1/eligibility?memberNumber=X", { headers });

let ORIGINAL_API_KEY: string | undefined;
let ORIGINAL_TENANT: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  verify.mockResolvedValue(null);
  ORIGINAL_API_KEY = process.env.API_KEY;
  ORIGINAL_TENANT = process.env.OPERATOR_TENANT_ID;
  delete process.env.API_KEY;
  delete process.env.OPERATOR_TENANT_ID;
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.API_KEY;
  else process.env.API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_TENANT === undefined) delete process.env.OPERATOR_TENANT_ID;
  else process.env.OPERATOR_TENANT_ID = ORIGINAL_TENANT;
});

describe("getApiCredential — operator key fails closed (BD-06)", () => {
  it("returns null when no key header is present", async () => {
    expect(await getApiCredential(reqWith({}))).toBeNull();
  });

  it("does NOT authenticate the burned in-source default when API_KEY is unset", async () => {
    expect(await getApiCredential(reqWith({ "x-api-key": BURNED_DEFAULT }))).toBeNull();
    expect(await getApiCredential(reqWith({ authorization: `Bearer ${BURNED_DEFAULT}` }))).toBeNull();
  });

  it("authenticates nothing at all when API_KEY is unset (operator channel disabled)", async () => {
    expect(await getApiCredential(reqWith({ "x-api-key": STRONG_KEY }))).toBeNull();
    expect(await getApiCredential(reqWith({ "x-api-key": "anything" }))).toBeNull();
  });

  it("treats an empty / whitespace API_KEY as unset (still fails closed)", async () => {
    process.env.API_KEY = "   ";
    expect(await getApiCredential(reqWith({ "x-api-key": "   " }))).toBeNull();
    expect(await getApiCredential(reqWith({ "x-api-key": "" }))).toBeNull();
  });

  it("accepts ONLY the exact configured key as operator (x-api-key and Bearer)", async () => {
    process.env.API_KEY = STRONG_KEY;
    expect(await getApiCredential(reqWith({ "x-api-key": STRONG_KEY }))).toEqual({ kind: "operator" });
    expect(await getApiCredential(reqWith({ authorization: `Bearer ${STRONG_KEY}` }))).toEqual({ kind: "operator" });
  });

  it("rejects the burned default (and near-misses) even once a real key is configured", async () => {
    process.env.API_KEY = STRONG_KEY;
    expect(await getApiCredential(reqWith({ "x-api-key": BURNED_DEFAULT }))).toBeNull();
    expect(await getApiCredential(reqWith({ "x-api-key": STRONG_KEY + "x" }))).toBeNull();
    expect(await getApiCredential(reqWith({ "x-api-key": STRONG_KEY.slice(0, -1) }))).toBeNull();
  });

  it("binds the operator credential to OPERATOR_TENANT_ID when set", async () => {
    process.env.API_KEY = STRONG_KEY;
    process.env.OPERATOR_TENANT_ID = "tenant-1";
    expect(await getApiCredential(reqWith({ "x-api-key": STRONG_KEY }))).toEqual({
      kind: "operator",
      tenantId: "tenant-1",
    });
  });

  it("still resolves a valid per-facility ProviderApiKey through its own channel", async () => {
    process.env.API_KEY = STRONG_KEY;
    verify.mockResolvedValueOnce({ tenantId: "tenant-1", providerId: "provider-A", keyId: "k1" });
    expect(await getApiCredential(reqWith({ "x-api-key": "mvxk_deadbeef" }))).toEqual({
      kind: "provider",
      tenantId: "tenant-1",
      providerId: "provider-A",
      keyId: "k1",
    });
  });
});

describe("apiAuth.ts source — no default secret can ship (BD-06)", () => {
  const source = readFileSync(resolve(process.cwd(), "src/lib/apiAuth.ts"), "utf8");

  it("contains no in-source default for API_KEY (`process.env.API_KEY || \"…\"`)", () => {
    expect(source).not.toMatch(/process\.env\.API_KEY\s*\|\|\s*['"`]/);
  });

  it("does not contain the burned default credential literal", () => {
    expect(source).not.toContain(BURNED_DEFAULT);
  });
});
