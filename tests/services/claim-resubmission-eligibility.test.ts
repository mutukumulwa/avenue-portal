/**
 * F5.9 — provider-correctable resubmission eligibility (opt-in DB).
 *
 * Proves: reason allowed/forbidden (sourced safely); an internal fraud reason is never
 * disclosed; the contract submission-window deadline is timezone-safe (boundary day
 * inclusive); an already-resubmitted claim is denied; a non-declined claim is denied;
 * cross-provider is a non-enumerating NOT_FOUND; missing permission/branch is FORBIDDEN.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.9 ClaimResubmissionEligibilityService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-resubmission/eligibility.service").ClaimResubmissionEligibilityService;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER",
      actorId: world.users.a.biller.id,
      tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.claim.correct"],
      apiScopes: [],
      requestId: "test-req",
      ...over,
    };
  }

  async function declined(declineReasonCode: string | null, over: Record<string, unknown> = {}) {
    const c = await world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status: "DECLINED" });
    await prisma.claim.update({ where: { id: c.id }, data: { declineReasonCode, ...over } });
    return c;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/claim-resubmission/eligibility.service")).ClaimResubmissionEligibilityService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("a correctable reason (INVALID_DOCS) ⇒ ELIGIBLE with a safe remedy", async () => {
    const c = await declined("INVALID_DOCS");
    const r = await Svc.check(ctx(), c.id);
    expect(r.eligible).toBe(true);
    expect(r.code).toBe("ELIGIBLE");
    expect(r.reason).toMatch(/document/i);
  });

  it("a substantive reason (EXCLUSION) ⇒ REASON_NOT_RESUBMITTABLE", async () => {
    const c = await declined("EXCLUSION");
    const r = await Svc.check(ctx(), c.id);
    expect(r.eligible).toBe(false);
    expect(r.code).toBe("REASON_NOT_RESUBMITTABLE");
  });

  it("an internal fraud reason is never disclosed", async () => {
    const c = await declined("FRAUD_SUSPECTED");
    const r = await Svc.check(ctx(), c.id);
    expect(r.eligible).toBe(false);
    expect(r.reason).not.toMatch(/fraud|fwa|abuse|suspect|investigat/i);
  });

  it("a non-declined claim ⇒ NOT_DECLINED", async () => {
    const c = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
    expect((await Svc.check(ctx(), c.id)).code).toBe("NOT_DECLINED");
  });

  it("an already-resubmitted claim (a successor exists) ⇒ ALREADY_RESUBMITTED", async () => {
    const c = await declined("INVALID_DOCS");
    const resub = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
    await prisma.claim.update({ where: { id: resub.id }, data: { supersedesClaimId: c.id, submissionType: "RESUBMISSION" } });
    expect((await Svc.check(ctx(), c.id)).code).toBe("ALREADY_RESUBMITTED");
  });

  it("cross-provider ⇒ non-enumerating NOT_FOUND", async () => {
    const c = await declined("INVALID_DOCS");
    const bCtx = ctx({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
    expect((await Svc.check(bCtx, c.id)).code).toBe("NOT_FOUND");
  });

  it("missing permission ⇒ FORBIDDEN; branch outside access ⇒ FORBIDDEN", async () => {
    const c = await declined("INVALID_DOCS");
    expect((await Svc.check(ctx({ permissions: ["provider.claim.read"] }), c.id)).code).toBe("FORBIDDEN");
    const branched = await declined("INVALID_DOCS", { providerBranchId: world.branches.a1.id });
    expect((await Svc.check(ctx({ allowedProviderBranchIds: [world.branches.a2.id] }), branched.id)).code).toBe("FORBIDDEN");
  });

  it("boundary timezone: the deadline day is inclusive; the next day is expired", async () => {
    await prisma.providerContract.update({ where: { id: world.contracts.aActive.id }, data: { submissionWindowDays: 30, submissionWindowBasis: "SERVICE_DATE" } });
    const c = await declined("INVALID_DOCS", { contractId: world.contracts.aActive.id, dateOfService: new Date("2026-07-01T00:00:00Z") });
    // deadline = 2026-07-31T23:59:59.999Z
    const within = await Svc.check(ctx(), c.id, new Date("2026-07-31T23:59:59.000Z"));
    expect(within.eligible).toBe(true);
    expect(within.deadline?.toISOString()).toBe("2026-07-31T23:59:59.999Z");
    const past = await Svc.check(ctx(), c.id, new Date("2026-08-01T00:00:00.000Z"));
    expect(past.eligible).toBe(false);
    expect(past.code).toBe("DEADLINE_PASSED");
  });
});
