/**
 * F7.7 — ProviderImprovementPlanService (opt-in DB). CLOSES phase F7.
 *
 * Covers the package acceptance: scope/role (network vs provider; cross-provider
 * hidden), provider-safe notes (INTERNAL notes are never visible to the provider,
 * and a provider can only post SHARED), and — critically — NO automated side
 * effect: the whole plan lifecycle never mutates the provider's tier/contract
 * status or any contract (advisory only, no sanctions).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F7.7 ProviderImprovementPlanService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-improvement-plan/service").ProviderImprovementPlanService;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  type Net = import("@/server/services/provider-improvement-plan/service").NetworkPlanActor;

  const ctxA = (over: Partial<Ctx> = {}): Ctx => ({
    actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id], permissions: ["provider.performance.read"], apiScopes: [], requestId: "t", ...over,
  });
  const ctxB = (): Ctx => ctxA({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
  const net = (over: Partial<Net> = {}): Net => ({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN", ...over });
  const future = new Date(Date.now() + 30 * 86400000);

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/provider-improvement-plan/service")).ProviderImprovementPlanService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  async function newPlan(title = "Cut PA turnaround"): Promise<{ id: string; version: number }> {
    const p = await Svc.create(net(), { providerId: world.providers.a.id, title, objective: "Reduce PA response time to < 24h", baselineMetricRef: "PA_TAT_HOURS", providerOwnerId: world.users.a.admin.id, targetDate: future });
    return { id: p.id, version: p.version };
  }

  it("create requires a network role, an objective, and a target date", async () => {
    await expect(Svc.create(net({ role: "PROVIDER_USER" }), { providerId: world.providers.a.id, title: "x", objective: "y", targetDate: future })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(Svc.create(net(), { providerId: world.providers.a.id, title: "x", objective: "  ", targetDate: future })).rejects.toMatchObject({ code: "INVALID" });
    await expect(Svc.create(net(), { providerId: world.providers.a.id, title: "x", objective: "y" } as never)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("scope: a provider sees its own plan; another provider's is a non-enumerating not-found", async () => {
    const { id } = await newPlan();
    expect(await Svc.getForProvider(ctxA(), id)).not.toBeNull();
    expect(await Svc.getForProvider(ctxB(), id)).toBeNull();
    await expect(Svc.getForProvider(ctxA({ permissions: [] }), id)).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
  });

  it("provider-safe notes: INTERNAL is hidden from the provider; SHARED is visible; the provider posts SHARED only", async () => {
    const { id } = await newPlan();
    await Svc.postNetworkUpdate(net(), id, { audience: "INTERNAL", body: "internal-only escalation note" });
    await Svc.postNetworkUpdate(net(), id, { audience: "SHARED", body: "shared progress note" });
    await Svc.postProviderUpdate(ctxA(), id, "provider commitment note");

    const provView = (await Svc.getForProvider(ctxA(), id))!;
    const provBodies = provView.updates.map((u) => u.body);
    expect(provBodies).toContain("shared progress note");
    expect(provBodies).toContain("provider commitment note");
    expect(provBodies).not.toContain("internal-only escalation note");
    expect(JSON.stringify(provView)).not.toContain("internal-only escalation");
    expect(provView.updates.every((u) => u.audience === "SHARED")).toBe(true);

    const netView = (await Svc.getForNetwork(net(), id))!;
    expect(netView.updates.length).toBe(3); // network sees INTERNAL + SHARED + the provider's
  });

  it("actions: the provider may update an action they own, not a network-owned one", async () => {
    const { id } = await newPlan();
    const pa = await Svc.addAction(net(), id, { description: "Provider: staff a PA desk", ownerRole: "PROVIDER", dueDate: future });
    const na = await Svc.addAction(net(), id, { description: "Network: share the SLA guide", ownerRole: "NETWORK" });
    await Svc.providerUpdateActionStatus(ctxA(), id, pa.id, "DONE");
    await expect(Svc.providerUpdateActionStatus(ctxA(), id, na.id, "DONE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await Svc.updateActionStatus(net(), id, na.id, "IN_PROGRESS"); // network can
    const view = (await Svc.getForNetwork(net(), id))!;
    expect(view.actions.find((a) => a.id === pa.id)!.status).toBe("DONE");
    expect(view.actions.find((a) => a.id === na.id)!.status).toBe("IN_PROGRESS");
  });

  it("status is advisory: legal transitions + version CAS, illegal blocked", async () => {
    const { id, version } = await newPlan();
    const a = await Svc.setStatus(net(), id, version, "ACTIVE");
    expect(a.status).toBe("ACTIVE");
    await expect(Svc.setStatus(net(), id, version, "ACHIEVED")).rejects.toMatchObject({ code: "STALE" }); // stale version
    const b = await Svc.setStatus(net(), id, a.version, "ACHIEVED");
    expect(b.status).toBe("ACHIEVED");
    // illegal jump on a fresh DRAFT plan
    const fresh = await newPlan("Another");
    await expect(Svc.setStatus(net(), fresh.id, fresh.version, "CLOSED")).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("NO automated side effect: the full plan lifecycle never changes the provider tier/status or any contract", async () => {
    const providerBefore = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { tier: true, contractStatus: true } });
    const contractBefore = await prisma.providerContract.findUniqueOrThrow({ where: { id: world.contracts.aActive.id }, select: { status: true } });

    const { id, version } = await newPlan("Sanction-free plan");
    await Svc.addAction(net(), id, { description: "do the thing", ownerRole: "PROVIDER" });
    await Svc.postNetworkUpdate(net(), id, { audience: "SHARED", body: "progressing" });
    const a = await Svc.setStatus(net(), id, version, "ACTIVE");
    await Svc.setStatus(net(), id, a.version, "CANCELLED");

    const providerAfter = await prisma.provider.findUniqueOrThrow({ where: { id: world.providers.a.id }, select: { tier: true, contractStatus: true } });
    const contractAfter = await prisma.providerContract.findUniqueOrThrow({ where: { id: world.contracts.aActive.id }, select: { status: true } });
    expect(providerAfter).toEqual(providerBefore); // tier + contractStatus untouched
    expect(contractAfter.status).toBe(contractBefore.status); // no contract mutation
  });
});
