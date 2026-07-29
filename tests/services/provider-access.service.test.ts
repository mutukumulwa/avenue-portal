/**
 * F1.3 — ProviderAccessService.
 *
 * Pure block: the context helpers (permission/branch/provider/narrow) with
 * hand-built contexts — covers "permission denied independent of branch",
 * "empty branch set denies", "cannot use a forged branch", and "narrows never
 * widens" without a DB.
 *
 * DB block (opt-in): buildUserContext validation + assembly — denies inactive /
 * provider-mismatch / cross-tenant, and correctly wires F1.1 permissions +
 * F1.2 branch scope into one context.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  ProviderAccessService as S,
  ProviderAccessError,
  type ProviderAccessContext,
} from "@/server/services/provider-access.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

function ctx(over: Partial<ProviderAccessContext> = {}): ProviderAccessContext {
  return {
    actorType: "USER", actorId: "u1", tenantId: "t1", providerId: "pA",
    allowedProviderBranchIds: [], permissions: [], apiScopes: [], requestId: "r1",
    ...over,
  };
}

describe("F1.3 ProviderAccessService helpers (pure)", () => {
  it("permission check is independent of branch scope", () => {
    const c = ctx({ permissions: ["provider.claim.read"], allowedProviderBranchIds: [] });
    expect(S.hasPermission(c, "provider.claim.read")).toBe(true);
    expect(() => S.requirePermission(c, "provider.claim.read")).not.toThrow();
    expect(() => S.requirePermission(c, "provider.settlement.read")).toThrow(ProviderAccessError);
    // ...yet a branch-scoped resource is still denied because no branch is assigned
    expect(() => S.requireBranch(c, "b1")).toThrow(ProviderAccessError);
  });

  it("empty branch set denies every branch, and a forged branch id is denied", () => {
    const c = ctx({ allowedProviderBranchIds: [] });
    expect(S.hasBranch(c, "b1")).toBe(false);
    const c2 = ctx({ allowedProviderBranchIds: ["b1"] });
    expect(S.hasBranch(c2, "b1")).toBe(true);
    expect(S.hasBranch(c2, "b2-forged")).toBe(false);
    expect(() => S.requireBranch(c2, "b2-forged")).toThrow(/Branch not in access context/);
  });

  it("assertProviderOwned rejects another provider's resource", () => {
    const c = ctx({ providerId: "pA" });
    expect(() => S.assertProviderOwned(c, "pA")).not.toThrow();
    expect(() => S.assertProviderOwned(c, "pB")).toThrow(ProviderAccessError);
  });

  it("narrowToBranches can only shrink, never widen", () => {
    const c = ctx({ allowedProviderBranchIds: ["b1", "b2"] });
    expect(S.narrowToBranches(c, ["b1"]).allowedProviderBranchIds).toEqual(["b1"]);
    // asking for a branch not already allowed cannot add it
    expect(S.narrowToBranches(c, ["b1", "b3"]).allowedProviderBranchIds).toEqual(["b1"]);
    expect(S.narrowToBranches(c, []).allowedProviderBranchIds).toEqual([]);
    // original context is unchanged
    expect(c.allowedProviderBranchIds).toEqual(["b1", "b2"]);
  });

  it("credential context is deny-by-default (empty scopes/branches until F1.6)", () => {
    const c = S.buildCredentialContext({ tenantId: "t1", providerId: "pA", keyId: "k1" });
    expect(c.actorType).toBe("API_KEY");
    expect(c.credentialId).toBe("k1");
    expect(c.apiScopes).toEqual([]);
    expect(c.allowedProviderBranchIds).toEqual([]);
    expect(c.requestId).toBeTruthy();
  });
});

describe.skipIf(!URL_SET)("F1.3 buildUserContext (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;
  let tenantId: string, providerA: string, billerId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("../factories/provider-network");
    const { seedRbac } = await import("@/../prisma/seeds/rbac");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
    providerA = world.providers.a.id;
    billerId = world.users.a.biller.id;
    // seed provider roles into the tenant, assign PROVIDER_BILLER + branch a1 to the biller
    await seedRbac(prisma, tenantId);
    const billerRole = await prisma.role.findFirstOrThrow({ where: { tenantId, code: "PROVIDER_BILLER" } });
    await prisma.userRoleAssignment.create({
      data: { userId: billerId, roleId: billerRole.id, tenantId, isActive: true, status: "ACTIVE", makerId: billerId, checkerId: billerId },
    });
    const { ProviderBranchAssignmentService } = await import("@/server/services/provider-branch-assignment.service");
    await ProviderBranchAssignmentService.assign({ tenantId, providerId: providerA, userId: billerId, providerBranchId: world.branches.a1.id, createdBy: world.users.a.admin.id });
  });

  afterAll(async () => {
    if (!world) return;
    const tenantIds = [world.tenants.alpha.id, world.tenants.beta.id];
    await prisma.userRoleAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.rolePermission.deleteMany({ where: { role: { tenantId: { in: tenantIds } } } });
    await prisma.role.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await world.teardown();
  });

  it("assembles permissions (F1.1) and branch scope (F1.2) into one context", async () => {
    const c = await S.buildUserContext({ userId: billerId, tenantId, providerId: providerA });
    expect(c.actorType).toBe("USER");
    expect(c.providerId).toBe(providerA);
    expect(c.permissions).toContain("provider.claim.read");
    expect(c.permissions.every((p) => p.startsWith("provider."))).toBe(true); // biller has only provider.* perms
    expect(c.allowedProviderBranchIds).toContain(world.branches.a1.id);
    expect(c.allowedProviderBranchIds).not.toContain(world.branches.a2.id); // only a1 assigned
    expect(c.requestId).toBeTruthy();
  });

  it("denies an inactive user", async () => {
    await expect(
      S.buildUserContext({ userId: world.users.aSuspended.id, tenantId, providerId: providerA }),
    ).rejects.toMatchObject({ code: "USER_INACTIVE" });
  });

  it("denies a user not bound to the claimed provider (no forge)", async () => {
    // userB is bound to provider B; claiming provider A must fail
    await expect(
      S.buildUserContext({ userId: world.users.b.id, tenantId, providerId: providerA }),
    ).rejects.toMatchObject({ code: "FORBIDDEN_PROVIDER" });
  });

  it("returns safe NOT_FOUND for a user outside the tenant boundary", async () => {
    // userC lives in the beta tenant; resolving under alpha must be indistinguishable not-found
    await expect(
      S.buildUserContext({ userId: world.users.c.id, tenantId, providerId: providerA }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a user with no branch assignment gets an empty branch set (deny-by-default)", async () => {
    const c = await S.buildUserContext({ userId: world.users.a.clinician.id, tenantId, providerId: providerA });
    expect(c.allowedProviderBranchIds).toEqual([]);
    expect(S.hasBranch(c, world.branches.a1.id)).toBe(false);
  });
});
