/**
 * F1.6 — governable provider API keys.
 *
 * Pure block: scope/branch/key-admin helpers. DB block (opt-in): plaintext
 * returned once and never stored, expired + revoked keys denied at verify,
 * wrong-branch surfaced, and overlap-safe rotation (both valid before cutoff,
 * only the successor after).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { permissionsAllowKeyAdmin } from "@/lib/provider-api-scopes";
import { PROVIDER_ROLE_PERMISSIONS } from "@/../prisma/seeds/provider-rbac";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F1.6 scope/branch/admin helpers (pure)", () => {
  it("hasScope: unscoped key is permissive; scoped key must list the scope", () => {
    expect(ProviderApiKeyService.hasScope({ scopes: [] }, "api.claim.write")).toBe(true);
    expect(ProviderApiKeyService.hasScope({ scopes: ["api.claim.write"] }, "api.claim.write")).toBe(true);
    expect(ProviderApiKeyService.hasScope({ scopes: ["api.eligibility.read"] }, "api.claim.write")).toBe(false);
  });

  it("allowsBranch: empty ⇒ unrestricted; listed ⇒ only those branches", () => {
    expect(ProviderApiKeyService.allowsBranch({ allowedBranchIds: [] }, "b1")).toBe(true);
    expect(ProviderApiKeyService.allowsBranch({ allowedBranchIds: ["b1"] }, "b1")).toBe(true);
    expect(ProviderApiKeyService.allowsBranch({ allowedBranchIds: ["b1"] }, "b2")).toBe(false);
  });

  it("permissionsAllowKeyAdmin: legacy allowed, migrated needs manage perm", () => {
    expect(permissionsAllowKeyAdmin([])).toBe(true); // un-migrated legacy
    expect(permissionsAllowKeyAdmin(["CLAIM:VIEW"])).toBe(true); // only TPA perms = still legacy for provider
    expect(permissionsAllowKeyAdmin(PROVIDER_ROLE_PERMISSIONS.PROVIDER_BILLER)).toBe(false); // migrated, no key-admin
    expect(permissionsAllowKeyAdmin(PROVIDER_ROLE_PERMISSIONS.PROVIDER_ADMIN)).toBe(true); // has provider.api_keys.manage
    expect(permissionsAllowKeyAdmin(PROVIDER_ROLE_PERMISSIONS.PROVIDER_INTEGRATION_ADMIN)).toBe(true);
  });
});

describe.skipIf(!URL_SET)("F1.6 ProviderApiKeyService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;
  let tenantId: string, providerA: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
    providerA = world.providers.a.id;
  });

  afterAll(async () => {
    if (world) {
      await prisma.providerApiKey.deleteMany({ where: { tenantId } });
      await world.teardown();
    }
  });

  it("returns plaintext once and never stores or re-exposes it", async () => {
    const k = await ProviderApiKeyService.generate(tenantId, providerA, "prod", world.users.a.admin.id, { scopes: ["api.claim.write"] });
    expect(k.plaintext).toMatch(/^mvxk_/);
    // stored row has only a hash; list() never returns plaintext or hash
    const row = await prisma.providerApiKey.findUniqueOrThrow({ where: { id: k.id } });
    expect(row.keyHash).not.toContain(k.plaintext);
    const listed = await ProviderApiKeyService.list(tenantId, providerA);
    const view = listed.find((x) => x.id === k.id)!;
    expect(Object.keys(view)).not.toContain("keyHash");
    expect(JSON.stringify(view)).not.toContain(k.plaintext);
    // the key verifies and carries its scopes
    const v = await ProviderApiKeyService.verify(k.plaintext);
    expect(v).toMatchObject({ providerId: providerA, scopes: ["api.claim.write"] });
  });

  it("denies an expired key", async () => {
    const past = new Date(Date.now() - 60_000);
    const k = await ProviderApiKeyService.generate(tenantId, providerA, "expired", world.users.a.admin.id, { expiresAt: past });
    expect(await ProviderApiKeyService.verify(k.plaintext)).toBeNull();
  });

  it("denies a revoked key", async () => {
    const k = await ProviderApiKeyService.generate(tenantId, providerA, "revoke-me", world.users.a.admin.id);
    expect(await ProviderApiKeyService.verify(k.plaintext)).not.toBeNull();
    await ProviderApiKeyService.revoke(tenantId, providerA, k.id, { revokedById: world.users.a.admin.id, reason: "compromised" });
    expect(await ProviderApiKeyService.verify(k.plaintext)).toBeNull();
    const row = await prisma.providerApiKey.findUniqueOrThrow({ where: { id: k.id } });
    expect(row.revokeReason).toBe("compromised");
  });

  it("overlap-safe rotation: both valid before cutoff, only the successor after", async () => {
    const old = await ProviderApiKeyService.generate(tenantId, providerA, "rot", world.users.a.admin.id, { scopes: ["api.claim.write"], allowedBranchIds: [world.branches.a1.id] });
    const cutoff = new Date(Date.now() + 60_000); // 1 min overlap window
    const fresh = await ProviderApiKeyService.rotate(tenantId, providerA, old.id, { overlapUntil: cutoff, createdById: world.users.a.admin.id });

    // successor inherits scopes + branch restriction + family
    expect(fresh.scopes).toEqual(["api.claim.write"]);
    expect(fresh.allowedBranchIds).toEqual([world.branches.a1.id]);
    expect(fresh.rotationFamilyId).toBe(old.rotationFamilyId);

    // during overlap (now): BOTH verify
    const now = new Date();
    expect(await ProviderApiKeyService.verify(old.plaintext, now)).not.toBeNull();
    expect(await ProviderApiKeyService.verify(fresh.plaintext, now)).not.toBeNull();

    // after cutoff: only the successor verifies
    const after = new Date(cutoff.getTime() + 1000);
    expect(await ProviderApiKeyService.verify(old.plaintext, after)).toBeNull();
    expect(await ProviderApiKeyService.verify(fresh.plaintext, after)).not.toBeNull();
  });
});
