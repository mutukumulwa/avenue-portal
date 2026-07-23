/**
 * F0.6 — smoke test for the provider-network factory.
 *
 * OPT-IN: runs only when AUTOPILOT_TEST_DB === DATABASE_URL (throwaway DB;
 * see docs/provider-network-os/TEST_DB_HARNESS.md). Otherwise self-skips so CI
 * without a database stays green — the same convention as the claim-intake
 * integration suites.
 *
 * Proves: the graph builds, the mandatory §20 dimensions are present, entitlement
 * resolves through the real service against real applicability rows, and
 * teardown is idempotent and complete.
 */
import { describe, it, expect, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F0.6 provider-network factory smoke", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("./provider-network").ProviderWorld | null = null;

  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("builds a coherent two-tenant provider graph with all mandatory dimensions", async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const { buildProviderWorld } = await import("./provider-network");
    world = await buildProviderWorld(prisma);

    // two tenants, cross-tenant provider
    expect(world.providers.a.tenantId).toBe(world.tenants.alpha.id);
    expect(world.providers.c.tenantId).toBe(world.tenants.beta.id);
    // branches belong to their provider/tenant
    expect(world.branches.a1.providerId).toBe(world.providers.a.id);
    expect(world.branches.c1.tenantId).toBe(world.tenants.beta.id);
    // currencies differ
    expect(world.clients.alpha.currency).toBe("UGX");
    expect(world.clients.beta.currency).toBe("KES");
    // effective-dating trio present
    expect(world.contracts.aActive.status).toBe("ACTIVE");
    expect(world.contracts.aExpired.status).toBe("EXPIRED");
    expect(world.contracts.aFuture.status).toBe("APPROVED");
    // suspended + persona users
    expect(world.users.aSuspended.isActive).toBe(false);
    expect(Object.keys(world.users.a)).toContain("biller");
  });

  it("entitlement resolves through the real service: A sees Alpha client, denies Beta and the EXCLUDEd group", async () => {
    const { ProviderEntitlementService } = await import("@/server/services/provider-entitlement.service");

    const whereA = await ProviderEntitlementService.entitledMemberWhere(world!.providers.a.id);
    const memberInScope = await prisma.member.findFirst({ where: { memberNumber: world!.members.alpha.memberNumber, ...whereA } });
    expect(memberInScope).not.toBeNull(); // groupAlpha is INCLUDEd (client-level)

    // groupAlpha2 is EXCLUDEd on A's active contract → its member is denied
    const excluded = await prisma.member.findFirst({ where: { memberNumber: world!.members.alpha2.memberNumber, ...whereA } });
    expect(excluded).toBeNull();

    // Beta member is another tenant/client entirely → denied
    const crossTenant = await prisma.member.findFirst({ where: { memberNumber: world!.members.beta.memberNumber, ...whereA } });
    expect(crossTenant).toBeNull();

    // Provider B: group-level INCLUDE of groupAlpha only
    const whereB = await ProviderEntitlementService.entitledMemberWhere(world!.providers.b.id);
    const bSeesAlpha = await prisma.member.findFirst({ where: { memberNumber: world!.members.alpha.memberNumber, ...whereB } });
    expect(bSeesAlpha).not.toBeNull();
  });

  it("teardown removes the whole graph and is idempotent", async () => {
    const w = world!;
    await w.teardown();
    world = null; // prevent double-teardown in afterAll
    expect(await prisma.tenant.findUnique({ where: { id: w.tenants.alpha.id } })).toBeNull();
    expect(await prisma.provider.findUnique({ where: { id: w.providers.a.id } })).toBeNull();
    // second teardown must not throw
    await expect(w.teardown()).resolves.toBeUndefined();
  });
});
