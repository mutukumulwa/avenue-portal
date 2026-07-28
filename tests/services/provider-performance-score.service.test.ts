/**
 * F8.2 — ProviderPerformanceScore schema + read model (opt-in DB).
 *
 * Covers the package acceptance: the unique period/provider/branch/metric/version
 * key; the provider view excludes unpublished + incomplete + under-sample +
 * suppressed + out-of-branch + cross-provider scores; and the legacy cost
 * ProviderScorecard remains readable (the new model is additive).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F8.2 ProviderPerformanceScore (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-performance/score.service").ProviderPerformanceScoreService;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctxA = (over: Partial<Ctx> = {}): Ctx => ({
    actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id], permissions: ["provider.performance.read"], apiScopes: [], requestId: "t", ...over,
  });

  const period = "2026-07";
  const base = () => ({ periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-31"), definitionVersion: "PNMC-1.0", numerator: 90, denominator: 100, sourceWatermark: "wm-1" });
  async function mkScore(over: Record<string, unknown> = {}) {
    return prisma.providerPerformanceScore.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, providerBranchId: "", period, metricKey: "m",
        status: "PUBLISHED", completeness: 1, sampleSize: 40, meetsMinimumSample: true, suppressedForAnonymity: false, value: 0.9, unit: "RATE",
        ...base(), ...over,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/provider-performance/score.service")).ProviderPerformanceScoreService;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("is unique on [tenant, period, provider, branch, metric, version]; a new version or branch is a distinct row", async () => {
    await mkScore({ metricKey: "uniq" });
    await expect(mkScore({ metricKey: "uniq" })).rejects.toMatchObject({ code: "P2002" });
    await expect(mkScore({ metricKey: "uniq", definitionVersion: "PNMC-1.1" })).resolves.toBeTruthy(); // new version ok
    await expect(mkScore({ metricKey: "uniq", providerBranchId: world.branches.a1.id })).resolves.toBeTruthy(); // branch-level ok
  });

  it("provider view excludes unpublished / incomplete / under-sample / suppressed scores", async () => {
    await mkScore({ metricKey: "vis_ok" }); // published + complete + sampled → visible
    await mkScore({ metricKey: "vis_draft", status: "DRAFT" });
    await mkScore({ metricKey: "vis_incomplete", completeness: 0.3 });
    await mkScore({ metricKey: "vis_undersample", meetsMinimumSample: false });
    await mkScore({ metricKey: "vis_suppressed", suppressedForAnonymity: true });

    const keys = (await Svc.listForProvider(ctxA(), { period })).map((s) => s.metricKey);
    expect(keys).toContain("vis_ok");
    for (const hidden of ["vis_draft", "vis_incomplete", "vis_undersample", "vis_suppressed"]) {
      expect(keys).not.toContain(hidden);
    }
  });

  it("branch scope: a published branch-level score shows only for an authorized branch", async () => {
    await mkScore({ metricKey: "branch_ok", providerBranchId: world.branches.a1.id }); // a1 is in ctx
    await mkScore({ metricKey: "branch_off", providerBranchId: world.branches.a2.id }); // a2 NOT in ctx
    const keys = (await Svc.listForProvider(ctxA(), { period })).map((s) => s.metricKey);
    expect(keys).toContain("branch_ok");
    expect(keys).not.toContain("branch_off");
  });

  it("does not leak another provider's score, and requires the permission", async () => {
    await prisma.providerPerformanceScore.create({ data: { tenantId: world.tenants.alpha.id, providerId: world.providers.b.id, providerBranchId: "", period, metricKey: "prov_b", status: "PUBLISHED", completeness: 1, sampleSize: 40, meetsMinimumSample: true, value: 0.9, unit: "RATE", ...base() } });
    const keys = (await Svc.listForProvider(ctxA(), { period })).map((s) => s.metricKey);
    expect(keys).not.toContain("prov_b");
    await expect(Svc.listForProvider(ctxA({ permissions: [] }), { period })).rejects.toBeInstanceOf(ProviderAccessError);
  });

  it("the projection never carries internal provenance", async () => {
    await mkScore({ metricKey: "leak_check", cohortKey: "t|HOSPITAL|PARTNER", controlTotals: { includedFacts: 100 }, sourceWatermark: "wm-secret-xyz" });
    const rows = await Svc.listForProvider(ctxA(), { period, metricKey: "leak_check" });
    const flat = JSON.stringify(rows);
    for (const s of ["cohortKey", "controlTotals", "sourceWatermark", "wm-secret", "HOSPITAL|PARTNER"]) {
      expect(flat).not.toContain(s);
    }
  });

  it("the legacy cost ProviderScorecard remains readable (additive change)", async () => {
    const sc = await prisma.providerScorecard.create({
      data: { tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, period, periodStart: new Date("2026-07-01"), providerName: "Provider A", claimCount: 10, memberCount: 5, grossCost: 1000, adjustedCost: 900 },
    });
    const back = await prisma.providerScorecard.findUniqueOrThrow({ where: { id: sc.id } });
    expect(back.claimCount).toBe(10);
    expect(Number(back.grossCost)).toBe(1000);
    await prisma.providerScorecard.delete({ where: { id: sc.id } });
  });

  it("the network read is role-gated and returns full rows incl. DRAFT", async () => {
    await expect(Svc.listForNetwork({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role: "PROVIDER_USER" })).rejects.toThrow();
    const all = await Svc.listForNetwork({ userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN" }, { period });
    expect(all.some((s) => s.status === "DRAFT")).toBe(true); // sees vis_draft
  });
});
