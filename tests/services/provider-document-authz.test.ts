/**
 * F2.2 — resource-level document authorization.
 *
 * OPT-IN DB. Matrix across provider / branch / permission / target-state:
 * own-provider target authorizes; another provider's target and a guessed id
 * are indistinguishable NOT_FOUND; missing permission denied; branch not in
 * context denied; not-yet-supported target types are refused.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F2.2 ProviderDocumentService.authorizeTarget (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Doc: typeof import("@/server/services/provider-document.service").ProviderDocumentService;
  let Access: typeof import("@/server/services/provider-access.service").ProviderAccessService;
  let world: import("../factories/provider-network").ProviderWorld;
  let claimA: { id: string }, claimAbranch: { id: string }, claimB: { id: string }, paA: { id: string };

  // a ctx that HAS the needed permissions + branch a1, built by hand (no RBAC seed needed):
  function ctx(perms: string[], branches: string[]) {
    return { actorType: "USER" as const, actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: branches, permissions: perms, apiScopes: [], requestId: "r" };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Doc = (await import("@/server/services/provider-document.service")).ProviderDocumentService;
    Access = (await import("@/server/services/provider-access.service")).ProviderAccessService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    claimA = await world.createClaim({ providerId: world.providers.a.id });
    claimAbranch = await world.createClaim({ providerId: world.providers.a.id, branchId: world.branches.a1.id });
    claimB = await world.createClaim({ providerId: world.providers.b.id });
    paA = await world.createPreauth({ providerId: world.providers.a.id });
  });

  afterAll(async () => { if (world) await world.teardown(); });

  it("authorizes an own-provider claim with the right permission", async () => {
    const t = await Doc.authorizeTarget(ctx(["provider.claim.read"], []), { targetType: "CLAIM", targetId: claimA.id, action: "VIEW" });
    expect(t.providerId).toBe(world.providers.a.id);
    expect(t.providerBranchId).toBeNull();
  });

  it("denies without the required permission (before any resource load)", async () => {
    await expect(Doc.authorizeTarget(ctx([], []), { targetType: "CLAIM", targetId: claimA.id, action: "VIEW" })).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
    // UPLOAD needs the respond permission, not just read
    await expect(Doc.authorizeTarget(ctx(["provider.claim.read"], []), { targetType: "CLAIM", targetId: claimA.id, action: "UPLOAD" })).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
  });

  it("another provider's claim and a guessed id are the same safe NOT_FOUND", async () => {
    const c = ctx(["provider.claim.read"], []);
    await expect(Doc.authorizeTarget(c, { targetType: "CLAIM", targetId: claimB.id, action: "VIEW" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(Doc.authorizeTarget(c, { targetType: "CLAIM", targetId: "cl-guessed-nonexistent", action: "VIEW" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("branch-scoped target: denied when the branch is not in context, allowed when it is", async () => {
    await expect(Doc.authorizeTarget(ctx(["provider.claim.read"], []), { targetType: "CLAIM", targetId: claimAbranch.id, action: "VIEW" })).rejects.toMatchObject({ code: "FORBIDDEN_BRANCH" });
    const ok = await Doc.authorizeTarget(ctx(["provider.claim.read"], [world.branches.a1.id]), { targetType: "CLAIM", targetId: claimAbranch.id, action: "VIEW" });
    expect(ok.providerBranchId).toBe(world.branches.a1.id);
  });

  it("PREAUTH target authorizes with the PA permission (no branch on PA)", async () => {
    const t = await Doc.authorizeTarget(ctx(["provider.preauth.read"], []), { targetType: "PREAUTH", targetId: paA.id, action: "VIEW" });
    expect(t.providerBranchId).toBeNull();
  });

  it("a not-yet-built target type is refused with TARGET_TYPE_NOT_SUPPORTED", async () => {
    await expect(Doc.authorizeTarget(ctx(["provider.claim.read"], []), { targetType: "PAYMENT_QUERY", targetId: "x", action: "VIEW" })).rejects.toMatchObject({ code: "TARGET_TYPE_NOT_SUPPORTED" });
  });
});
