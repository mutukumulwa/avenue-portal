/**
 * F1.12 — provider claim-submission entitlement gate.
 *
 * OPT-IN DB. Proves: with the flag OFF (default) the documented bypass is
 * preserved (any tenant member resolves); with the flag ON an out-of-entitlement
 * member is unresolvable (structural reject), entitlement is evaluated at the
 * claim's SERVICE DATE, and an in-scope member resolves.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!URL_SET)("F1.12 ProviderClaimEntitlementGate (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let gate: typeof import("@/server/services/provider-claim-entitlement-gate.service").ProviderClaimEntitlementGate;
  let world: import("../factories/provider-network").ProviderWorld;
  let tenantId: string, providerA: string;

  async function setEnforcement(on: boolean) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { config: { providerAccess: { entitlementEnforcement: on, enforcedProviderIds: [] } } } });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    gate = (await import("@/server/services/provider-claim-entitlement-gate.service")).ProviderClaimEntitlementGate;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
    providerA = world.providers.a.id;
  });

  afterAll(async () => { if (world) await world.teardown(); });

  it("flag OFF (default): the bypass is preserved — an EXCLUDEd member still resolves", async () => {
    await setEnforcement(false);
    const now = new Date();
    // memberAlpha2 is in groupAlpha2, which provider A's contract EXCLUDEs
    const r = await gate.resolveSubmittableMember({ tenantId, providerId: providerA, memberNumber: world.members.alpha2.memberNumber, serviceDate: now });
    expect(r.enforced).toBe(false);
    expect(r.member).not.toBeNull(); // bypass: tenant-only resolution
  });

  it("flag ON: an out-of-entitlement member is unresolvable (structural reject)", async () => {
    await setEnforcement(true);
    const now = new Date();
    const excluded = await gate.resolveSubmittableMember({ tenantId, providerId: providerA, memberNumber: world.members.alpha2.memberNumber, serviceDate: now });
    expect(excluded.enforced).toBe(true);
    expect(excluded.member).toBeNull(); // EXCLUDEd → no claim can be filed

    const inScope = await gate.resolveSubmittableMember({ tenantId, providerId: providerA, memberNumber: world.members.alpha.memberNumber, serviceDate: now });
    expect(inScope.member).not.toBeNull(); // INCLUDEd → resolvable
  });

  it("flag ON: entitlement is evaluated at the claim's service date", async () => {
    await setEnforcement(true);
    // provider A's INCLUDE applicability begins ~90 days ago; a service date 200
    // days ago predates it ⇒ even the in-group member is not yet entitled.
    const beforeApplicability = new Date(Date.now() - 200 * DAY);
    const r = await gate.resolveSubmittableMember({ tenantId, providerId: providerA, memberNumber: world.members.alpha.memberNumber, serviceDate: beforeApplicability });
    expect(r.member).toBeNull();
  });
});
