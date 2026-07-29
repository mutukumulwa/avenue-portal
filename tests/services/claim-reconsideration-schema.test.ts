/**
 * F5.11 — reconsideration schema shape (opt-in DB). Proves the additive models are usable:
 * the case ← line ← event relations, the Decimal(14,2) money fields, and the per-case
 * event sequence uniqueness. (The rules are unit-tested in claim-reconsideration-policy.test.ts.)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.11 reconsideration schema (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("creates a case with lines + events (relations, decimals, sequence uniqueness)", async () => {
    const claim = await world.createClaim({ providerId: world.providers.a.id, status: "DECLINED" });
    const r = await prisma.claimReconsideration.create({
      data: {
        tenantId: world.tenants.alpha.id,
        providerId: world.providers.a.id,
        claimId: claim.id,
        chainRootClaimId: claim.id,
        reasonCode: "INCORRECT_DECLINE",
        providerNarrative: "The exclusion applied does not apply to this service.",
        currency: "UGX",
        requestedAmount: "500.00",
        status: "SUBMITTED",
        filedAt: new Date(),
        originalAdjudicatorId: "adj-1",
        outcomeInternalNotes: "internal only",
        lines: {
          create: [{ claimLineId: "line-x", originalBilled: "1000.00", originalAllowed: "0", maxIncrement: "600.00", awardedIncrement: "0" }],
        },
        events: {
          create: [{ tenantId: world.tenants.alpha.id, sequence: 1, eventType: "SUBMITTED", actorType: "USER", actorId: world.users.a.biller.id }],
        },
      },
      include: { lines: true, events: true },
    });

    expect(r.status).toBe("SUBMITTED");
    expect(r.version).toBe(1);
    expect(Number(r.requestedAmount)).toBe(500);
    expect(r.lines.length).toBe(1);
    expect(Number(r.lines[0].maxIncrement)).toBe(600);
    expect(Number(r.lines[0].originalBilled)).toBe(1000);
    expect(r.events.length).toBe(1);
    expect(r.events[0].sequence).toBe(1);

    // the event sequence is unique per reconsideration
    const dup = await prisma.claimReconsiderationEvent
      .create({ data: { tenantId: world.tenants.alpha.id, reconsiderationId: r.id, sequence: 1, eventType: "TRIAGED", actorType: "USER" } })
      .catch((e: { code?: string }) => e);
    expect((dup as { code?: string }).code).toBe("P2002");

    // read back via the case's claim scope (indexed lookup)
    const found = await prisma.claimReconsideration.findFirst({ where: { tenantId: world.tenants.alpha.id, claimId: claim.id } });
    expect(found?.id).toBe(r.id);
  });
});
