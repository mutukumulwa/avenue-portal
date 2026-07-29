/**
 * F2.3 — upload intent creation.
 *
 * OPT-IN DB. Authorized caller gets a single-target intent bound to
 * target+actor; a forbidden target / missing permission is denied; a disallowed
 * MIME is rejected; an expired (or finalized) intent no longer resolves; the
 * created binding matches the request (and finalize re-checks it, F2.4).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F2.3 createUploadIntent (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Doc: typeof import("@/server/services/provider-document.service").ProviderDocumentService;
  let world: import("../factories/provider-network").ProviderWorld;
  let claimA: { id: string }, claimB: { id: string };

  function ctx(perms: string[]) {
    return { actorType: "USER" as const, actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: perms, apiScopes: [], requestId: "r" };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Doc = (await import("@/server/services/provider-document.service")).ProviderDocumentService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    claimA = await world.createClaim({ providerId: world.providers.a.id });
    claimB = await world.createClaim({ providerId: world.providers.b.id });
  });

  afterAll(async () => {
    if (world) {
      await prisma.documentUploadIntent.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
      await world.teardown();
    }
  });

  it("creates a single-target intent bound to target + actor, with a token and expiry, no public URL", async () => {
    const res = await Doc.createUploadIntent(ctx(["provider.claim.respond"]), { targetType: "CLAIM", targetId: claimA.id });
    expect(res.token).toMatch(/^[0-9a-f]{48}$/);
    expect(res.targetId).toBe(claimA.id);
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.stringify(res)).not.toMatch(/http|aicare-documents|url/i); // no public-read access issued
    const row = await prisma.documentUploadIntent.findUnique({ where: { token: res.token } });
    expect(row!.sourceActorId).toBe(world.users.a.biller.id);
    expect(row!.expectedProviderId).toBe(world.providers.a.id);
  });

  it("denies a forbidden target (another provider) and a missing permission", async () => {
    await expect(Doc.createUploadIntent(ctx(["provider.claim.respond"]), { targetType: "CLAIM", targetId: claimB.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(Doc.createUploadIntent(ctx([]), { targetType: "CLAIM", targetId: claimA.id })).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
  });

  it("rejects a disallowed MIME type by policy", async () => {
    await expect(Doc.createUploadIntent(ctx(["provider.claim.respond"]), { targetType: "CLAIM", targetId: claimA.id, expectedMimeTypes: ["application/x-msdownload"] })).rejects.toMatchObject({ code: "POLICY_MIME" });
  });

  it("an expired intent no longer resolves as open", async () => {
    const res = await Doc.createUploadIntent(ctx(["provider.claim.respond"]), { targetType: "CLAIM", targetId: claimA.id });
    // resolves now
    expect(await Doc.resolveOpenIntent(res.token)).not.toBeNull();
    // does not resolve after its expiry
    expect(await Doc.resolveOpenIntent(res.token, new Date(res.expiresAt.getTime() + 1000))).toBeNull();
    // unknown token → null (same as expired)
    expect(await Doc.resolveOpenIntent("nope")).toBeNull();
  });

  it("caps declared max size at the policy ceiling", async () => {
    const res = await Doc.createUploadIntent(ctx(["provider.claim.respond"]), { targetType: "CLAIM", targetId: claimA.id, maxSizeBytes: 999_000_000 });
    expect(res.maxSizeBytes).toBe(10 * 1024 * 1024);
  });
});
