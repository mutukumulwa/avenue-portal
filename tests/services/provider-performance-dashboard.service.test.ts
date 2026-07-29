/**
 * F8.5 — provider dashboard reads (opt-in DB).
 *
 * The provider's own cohort benchmark (distribution + peer-group size, NO named
 * peer), the metric drilldown that reconciles to the score denominator (own records
 * only), and the permission/scope gates.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F8.5 provider dashboard reads (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-performance/score.service").ProviderPerformanceScoreService;
  let Refresh: typeof import("@/server/services/provider-performance/refresh.service").ProviderPerformanceRefreshService;
  let Publish: typeof import("@/server/services/provider-performance/publication.service").ProviderPerformancePublicationService;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let world: import("../factories/provider-network").ProviderWorld;
  const extra: string[] = [];
  let seq = 0;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const tId = () => world.tenants.alpha.id;
  const ctxA = (over: Partial<Ctx> = {}): Ctx => ({ actorType: "USER", actorId: world.users.a.biller.id, tenantId: tId(), providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: ["provider.performance.read"], apiScopes: [], requestId: "t", ...over });
  const METRIC = "A1_digital_submission_rate";

  async function mkScore(providerId: string, period: string, value: number) {
    return prisma.providerPerformanceScore.create({ data: { tenantId: tId(), providerId, providerBranchId: "", period, periodStart: new Date(`${period}-01T00:00:00Z`), periodEnd: new Date(`${period}-28T00:00:00Z`), metricKey: METRIC, definitionVersion: "PNMC-1.0", numerator: value * 100, denominator: 100, value, unit: "RATE", completeness: 1, sampleSize: 40, meetsMinimumSample: true, status: "DRAFT", sourceWatermark: `wm-${providerId}-${period}` } });
  }
  async function mkClaim(period: string, over: Record<string, unknown> = {}) {
    seq += 1;
    const day = new Date(`${period}-10T00:00:00Z`);
    return prisma.claim.create({ data: { tenantId: tId(), claimNumber: `PERF5-${world.token}-${seq}`, memberId: world.members.alpha.id, providerId: world.providers.a.id, serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: day, diagnoses: [], procedures: [], billedAmount: 1000, source: "MANUAL", submissionType: "ORIGINAL", status: "RECEIVED", receivedAt: day, ...over } });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/provider-performance/score.service")).ProviderPerformanceScoreService;
    Refresh = (await import("@/server/services/provider-performance/refresh.service")).ProviderPerformanceRefreshService;
    Publish = (await import("@/server/services/provider-performance/publication.service")).ProviderPerformancePublicationService;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    for (let i = 0; i < 3; i++) extra.push((await prisma.provider.create({ data: { tenantId: tId(), name: `X${world.token}-${i}`, type: "HOSPITAL", servicesOffered: [] } })).id);
  });
  afterAll(async () => {
    await prisma.providerPerformanceScore.deleteMany({ where: { providerId: { in: extra } } });
    await prisma.provider.deleteMany({ where: { id: { in: extra } } });
    if (world) await world.teardown();
  });

  it("getCohortBenchmarkForProvider returns the own-cohort distribution + peer-group size, and NO named peer", async () => {
    const p = "2026-07";
    const providers = [world.providers.a.id, world.providers.b.id, ...extra];
    const vals = [0.5, 0.6, 0.7, 0.8, 0.9];
    for (let i = 0; i < 5; i++) await mkScore(providers[i], p, vals[i]);
    await Publish.publishPeriod({ userId: world.users.a.admin.id, tenantId: tId(), role: "SUPER_ADMIN" }, { period: p });

    const b = (await Svc.getCohortBenchmarkForProvider(ctxA(), { metricKey: METRIC, period: p }))!;
    expect(b).not.toBeNull();
    expect(b.peerGroupSize).toBe(5);
    expect(Number(b.median)).toBeCloseTo(0.7, 6);
    const flat = JSON.stringify(b);
    expect(flat).not.toContain("cohortKey");
    for (const id of providers) expect(flat).not.toContain(id); // no peer identity
  });

  it("getCohortBenchmarkForProvider ⇒ null when nothing is published / permission required", async () => {
    expect(await Svc.getCohortBenchmarkForProvider(ctxA(), { metricKey: METRIC, period: "2099-01" })).toBeNull();
    await expect(Svc.getCohortBenchmarkForProvider(ctxA({ permissions: [] }), { metricKey: METRIC, period: "2026-07" })).rejects.toBeInstanceOf(ProviderAccessError);
  });

  it("getSubmissionDrilldown reconciles to the score denominator (own records only)", async () => {
    const p = "2026-09";
    await mkClaim(p, { source: "SMART" });
    await mkClaim(p, { source: "MANUAL" });
    await mkClaim(p, { source: "SLADE360" });
    await mkClaim(p, { status: "SUPERSEDED" }); // excluded from A1 den
    await mkClaim(p, { submissionType: "CORRECTION" }); // not an A1 original
    // a provider-B claim in the same period must NOT appear in A's drilldown
    await prisma.claim.create({ data: { tenantId: tId(), claimNumber: `PERF5B-${world.token}`, memberId: world.members.alpha.id, providerId: world.providers.b.id, serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: new Date(`${p}-10T00:00:00Z`), diagnoses: [], procedures: [], billedAmount: 1000, source: "SMART", submissionType: "ORIGINAL", status: "RECEIVED", receivedAt: new Date(`${p}-10T00:00:00Z`) } });

    const refresh = await Refresh.refreshSubmissionQuality({ tenantId: tId(), providerId: world.providers.a.id, period: p });
    const a1Den = refresh.scores.find((s) => s.metricKey === METRIC)!.denominator; // 3 originals

    const drill = await Svc.getSubmissionDrilldown(ctxA(), { metricKey: METRIC, period: p });
    expect(drill.count).toBe(a1Den); // reconciles to the metric denominator
    expect(drill.count).toBe(3);
    expect(drill.records.every((r) => r.claimNumber.startsWith("PERF5-"))).toBe(true); // own records only (no provider-B claim)
  });
});
