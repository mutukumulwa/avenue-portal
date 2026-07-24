/**
 * F5.2 — claim submission-chain schema + read (opt-in DB).
 *
 * The lineage fields persist; getChain resolves the chain from ANY member (root or a
 * superseding version), returns all versions oldest-first, treats an unlinked claim as
 * a singleton chain, and is scoped (an out-of-scope claim ⇒ empty chain).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.2 ClaimSubmissionChainService.getChain (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-submission-chain/service").ClaimSubmissionChainService;
  let world: import("../factories/provider-network").ProviderWorld;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/claim-submission-chain/service")).ClaimSubmissionChainService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => { await world.teardown(); });

  it("resolves the full chain from either end, ordered oldest-first, and scopes by provider", async () => {
    const t = world.tenants.alpha.id;
    const providerId = world.providers.a.id;

    const original = await world.createClaim({ providerId });
    const correction = await world.createClaim({ providerId });
    // link the lineage the way F5.7 will (manual here — F5.2 only ships the shape)
    await prisma.claim.update({ where: { id: original.id }, data: { chainRootClaimId: original.id, supersededByClaimId: correction.id, supersededAt: new Date() } });
    await prisma.claim.update({ where: { id: correction.id }, data: { submissionType: "CORRECTION", chainRootClaimId: original.id, supersedesClaimId: original.id } });

    const fromRoot = await Svc.getChain({ tenantId: t, providerId }, original.id);
    expect(fromRoot.map((c) => c.id)).toEqual([original.id, correction.id]); // createdAt asc
    expect(fromRoot.find((c) => c.id === original.id)!.supersededByClaimId).toBe(correction.id);
    expect(fromRoot.find((c) => c.id === correction.id)!.submissionType).toBe("CORRECTION");

    const fromVersion = await Svc.getChain({ tenantId: t, providerId }, correction.id);
    expect(fromVersion.map((c) => c.id).sort()).toEqual([original.id, correction.id].sort());

    // out-of-scope provider ⇒ empty (non-enumerating)
    expect(await Svc.getChain({ tenantId: t, providerId: world.providers.b.id }, original.id)).toEqual([]);
  });

  it("treats an unlinked claim as a singleton chain (default submissionType ORIGINAL)", async () => {
    const t = world.tenants.alpha.id;
    const solo = await world.createClaim({ providerId: world.providers.a.id });
    const chain = await Svc.getChain({ tenantId: t }, solo.id);
    expect(chain.map((c) => c.id)).toEqual([solo.id]);
    expect(chain[0].submissionType).toBe("ORIGINAL");
    expect(chain[0].supersededByClaimId).toBeNull();
  });
});
