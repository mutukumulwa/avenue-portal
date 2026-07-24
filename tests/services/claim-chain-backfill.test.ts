/**
 * F5.4 — backfill claims into self-rooted submission chains (opt-in DB).
 *
 * dry-run counts without writing; apply self-roots every null-root claim (batched);
 * a re-run is a no-op (idempotent). Tenant-scoped.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.4 backfillOriginalChains (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let backfill: typeof import("@/server/services/claim-submission-chain/backfill").backfillOriginalChains;
  let world: import("../factories/provider-network").ProviderWorld;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    backfill = (await import("@/server/services/claim-submission-chain/backfill")).backfillOriginalChains;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => { await world.teardown(); });

  it("dry-run counts, apply self-roots (batched), re-run is idempotent", async () => {
    const t = world.tenants.alpha.id;
    // factory claims are created directly (pre-F5.4 wiring) ⇒ null chainRootClaimId
    const claims = [await world.createClaim({ providerId: world.providers.a.id }), await world.createClaim({ providerId: world.providers.a.id }), await world.createClaim({ providerId: world.providers.a.id })];
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claims[0].id } })).chainRootClaimId).toBeNull();

    // dry-run: reports scale, writes nothing
    const dry = await backfill({ tenantId: t, dryRun: true }, prisma);
    expect(dry.scanned).toBeGreaterThanOrEqual(3);
    expect(dry.updated).toBe(0);
    expect((await prisma.claim.findUniqueOrThrow({ where: { id: claims[0].id } })).chainRootClaimId).toBeNull();

    // apply (small batch to exercise the loop)
    const applied = await backfill({ tenantId: t, batchSize: 2 }, prisma);
    expect(applied.updated).toBeGreaterThanOrEqual(3);
    expect(applied.batches).toBeGreaterThanOrEqual(2);
    for (const c of claims) {
      expect((await prisma.claim.findUniqueOrThrow({ where: { id: c.id } })).chainRootClaimId).toBe(c.id); // self-rooted
    }

    // idempotent: nothing left null
    const again = await backfill({ tenantId: t }, prisma);
    expect(again.updated).toBe(0);
  });
});
