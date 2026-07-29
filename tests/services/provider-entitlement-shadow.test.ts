/**
 * F1.10 — entitlement shadow comparison.
 *
 * Pure block: the classifier. Failure-injection block: a broken db makes the
 * shadow return ERROR and NEVER throw. DB block (opt-in): real divergence over
 * the factory world (AGREE_ALLOW for an entitled member, TARGET_DENY_CURRENT_
 * ALLOW for an EXCLUDEd member), deterministic at a fixed service date, and the
 * persisted sample carries no member PII.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProviderEntitlementShadowService as Shadow, classifyShadow } from "@/server/services/provider-entitlement-shadow.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F1.10 classifyShadow (pure)", () => {
  it("maps every (current,target,error) triple", () => {
    expect(classifyShadow(true, true, false)).toBe("AGREE_ALLOW");
    expect(classifyShadow(false, false, false)).toBe("AGREE_DENY");
    expect(classifyShadow(true, false, false)).toBe("TARGET_DENY_CURRENT_ALLOW");
    expect(classifyShadow(false, true, false)).toBe("TARGET_ALLOW_CURRENT_DENY");
    expect(classifyShadow(true, true, true)).toBe("ERROR"); // error dominates
  });
});

describe("F1.10 shadow failure never fails the live request", () => {
  it("a throwing db yields ERROR, not an exception", async () => {
    const brokenDb = {
      member: { findFirst: async () => { throw new Error("db down"); } },
      providerEntitlementShadowSample: { create: async () => { throw new Error("also down"); } },
    } as never;
    // must resolve (not reject) even though both the query AND the record throw
    await expect(
      Shadow.shadowCompareMemberLookup({ tenantId: "t", providerId: "p", memberId: "m" }, brokenDb),
    ).resolves.toBe("ERROR");
  });
});

describe.skipIf(!URL_SET)("F1.10 shadowCompareMemberLookup (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });

  afterAll(async () => {
    if (world) {
      await prisma.providerEntitlementShadowSample.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
      await world.teardown();
    }
  });

  it("entitled member ⇒ AGREE_ALLOW; EXCLUDEd member ⇒ TARGET_DENY_CURRENT_ALLOW", async () => {
    const t = world.tenants.alpha.id;
    const p = world.providers.a.id;
    // memberAlpha is in groupAlpha, INCLUDEd by provider A's active contract
    expect(await Shadow.shadowCompareMemberLookup({ tenantId: t, providerId: p, memberId: world.members.alpha.id })).toBe("AGREE_ALLOW");
    // memberAlpha2 is in groupAlpha2, which A's contract EXCLUDEs → tenant-visible today, target-denied
    expect(await Shadow.shadowCompareMemberLookup({ tenantId: t, providerId: p, memberId: world.members.alpha2.id })).toBe("TARGET_DENY_CURRENT_ALLOW");
  });

  it("is deterministic at a fixed service date and records a PHI-free sample", async () => {
    const t = world.tenants.alpha.id;
    const p = world.providers.a.id;
    const serviceDate = new Date("2026-07-01T00:00:00Z");
    const c1 = await Shadow.shadowCompareMemberLookup({ tenantId: t, providerId: p, memberId: world.members.alpha.id, serviceDate, requestId: "r-det" });
    const c2 = await Shadow.shadowCompareMemberLookup({ tenantId: t, providerId: p, memberId: world.members.alpha.id, serviceDate, requestId: "r-det", record: false });
    expect(c1).toBe(c2); // deterministic

    const sample = await prisma.providerEntitlementShadowSample.findFirst({ where: { tenantId: t, providerId: p, requestId: "r-det" } });
    expect(sample).not.toBeNull();
    // safe identifiers only — the row schema has no member id/number column
    expect(Object.keys(sample!)).not.toContain("memberId");
    expect(Object.keys(sample!)).not.toContain("memberNumber");
    expect(sample!.clientId).toBe(world.clients.alpha.id); // client is a safe identifier

    const metrics = await Shadow.metrics({ tenantId: t, providerId: p });
    expect(Object.values(metrics).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});
