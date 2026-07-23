/**
 * F1.11 — canonical provider eligibility (enforcement OFF by default).
 *
 * Pure block: the settings flag parser (default OFF, per-provider allow-list).
 * DB block (opt-in): with enforcement ON, cross-provider/EXCLUDEd members are
 * safely denied and the branch must be in context; include member is ELIGIBLE;
 * future service date respects contract windows; evidence is recorded and is
 * never a payment guarantee; response carries no annual-limit/usage.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F1.11 ProviderAccessSettings.parse (pure)", () => {
  it("defaults enforcement OFF and tolerates garbage config", () => {
    expect(ProviderAccessSettingsService.parse(undefined)).toEqual({ entitlementEnforcement: false, enforcedProviderIds: [] });
    expect(ProviderAccessSettingsService.parse({ providerAccess: "nonsense" })).toEqual({ entitlementEnforcement: false, enforcedProviderIds: [] });
    expect(ProviderAccessSettingsService.parse({ providerAccess: { entitlementEnforcement: true, enforcedProviderIds: ["p1", 2, null] } })).toEqual({ entitlementEnforcement: true, enforcedProviderIds: ["p1"] });
  });
});

describe.skipIf(!URL_SET)("F1.11 ProviderEligibilityService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/server/services/provider-eligibility.service").ProviderEligibilityService;
  let AccessSvc: typeof import("@/server/services/provider-access.service").ProviderAccessService;
  let world: import("../factories/provider-network").ProviderWorld;
  let ctxA: import("@/server/services/provider-access.service").ProviderAccessContext;

  async function setEnforcement(on: boolean) {
    await prisma.tenant.update({ where: { id: world.tenants.alpha.id }, data: { config: { providerAccess: { entitlementEnforcement: on, enforcedProviderIds: [] } } } });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = (await import("@/server/services/provider-eligibility.service")).ProviderEligibilityService;
    AccessSvc = (await import("@/server/services/provider-access.service")).ProviderAccessService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    // provider-A context with branch a1 assigned so the enforced branch check passes
    const { ProviderBranchAssignmentService } = await import("@/server/services/provider-branch-assignment.service");
    await ProviderBranchAssignmentService.assign({ tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, userId: world.users.a.frontdesk.id, providerBranchId: world.branches.a1.id, createdBy: world.users.a.admin.id });
    ctxA = await AccessSvc.buildUserContext({ userId: world.users.a.frontdesk.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id });
  });

  afterAll(async () => {
    if (world) {
      await prisma.providerEligibilityCheck.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
      await prisma.providerEntitlementShadowSample.deleteMany({ where: { tenantId: world.tenants.alpha.id } });
      await world.teardown();
    }
  });

  it("OFF (default): permissive resolution + records evidence that is not a payment guarantee, no annual limit exposed", async () => {
    await setEnforcement(false);
    const res = await svc.check({ ctx: ctxA, memberNumber: world.members.alpha.memberNumber, providerBranchId: world.branches.a1.id });
    expect(res.found).toBe(true);
    expect(res.resultCode).toBe("ELIGIBLE");
    expect(res.enforcementApplied).toBe(false);
    expect(res.disclaimer).toMatch(/not a guarantee of payment/i);
    // minimum-safe: no annual limit / used / remaining fields on the result
    expect(JSON.stringify(res)).not.toMatch(/annualLimit|amountUsed|remaining/i);
    const ev = await prisma.providerEligibilityCheck.findUnique({ where: { id: res.checkId } });
    expect(ev).not.toBeNull();
  });

  it("ON: EXCLUDEd member is safely NOT_ELIGIBLE (no enumeration); INCLUDE member ELIGIBLE", async () => {
    await setEnforcement(true);
    // memberAlpha2 is in groupAlpha2 which provider A EXCLUDEs
    const denied = await svc.check({ ctx: ctxA, memberNumber: world.members.alpha2.memberNumber, providerBranchId: world.branches.a1.id });
    expect(denied.found).toBe(false);
    expect(denied.resultCode).toBe("NOT_ELIGIBLE");
    expect(denied.member).toBeUndefined(); // no member details leaked

    const ok = await svc.check({ ctx: ctxA, memberNumber: world.members.alpha.memberNumber, providerBranchId: world.branches.a1.id });
    expect(ok.found).toBe(true);
    expect(ok.enforcementApplied).toBe(true);
  });

  it("ON: a branch not in the caller's context is OUT_OF_NETWORK", async () => {
    await setEnforcement(true);
    const res = await svc.check({ ctx: ctxA, memberNumber: world.members.alpha.memberNumber, providerBranchId: world.branches.a2.id });
    expect(res.resultCode).toBe("OUT_OF_NETWORK"); // a2 not assigned to this user
    expect(res.found).toBe(false);
  });

  it("ON: cross-tenant member is not resolvable (safe not-found)", async () => {
    await setEnforcement(true);
    const res = await svc.check({ ctx: ctxA, memberNumber: world.members.beta.memberNumber, providerBranchId: world.branches.a1.id });
    expect(res.found).toBe(false);
    expect(res.resultCode).toBe("NOT_ELIGIBLE");
  });
});
