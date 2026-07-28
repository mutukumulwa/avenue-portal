/**
 * F8.4 — publish anonymized cohort benchmarks (opt-in DB).
 *
 * Covers: a large cohort publishes a benchmark with percentile/median/range and NO
 * peer identifier; a small cohort is suppressed (no benchmark row); the provider
 * scores transition to PUBLISHED; a corrected republish is a new publication version;
 * and the publish is role-gated. Each scenario uses its own period.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F8.4 publishPeriod (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-performance/publication.service").ProviderPerformancePublicationService;
  let world: import("../factories/provider-network").ProviderWorld;
  const extraProviderIds: string[] = [];
  let cohortProviders: string[] = []; // 5 alpha HOSPITAL/PARTNER providers

  const tId = () => world.tenants.alpha.id;
  const actor = (role = "SUPER_ADMIN") => ({ userId: world.users.a.admin.id, tenantId: tId(), role });
  const METRIC = "A1_digital_submission_rate";

  async function mkScore(providerId: string, period: string, value: number, over: Record<string, unknown> = {}) {
    return prisma.providerPerformanceScore.create({
      data: {
        tenantId: tId(), providerId, providerBranchId: "", period, periodStart: new Date(`${period}-01T00:00:00Z`), periodEnd: new Date(`${period}-28T00:00:00Z`),
        metricKey: METRIC, definitionVersion: "PNMC-1.0", numerator: value * 100, denominator: 100, value, unit: "RATE",
        completeness: 1, sampleSize: 40, meetsMinimumSample: true, status: "DRAFT", sourceWatermark: `wm-${providerId}-${period}`, ...over,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/provider-performance/publication.service")).ProviderPerformancePublicationService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    // 5 same-cohort providers = A + B (HOSPITAL/PARTNER) + 3 extras.
    for (let i = 0; i < 3; i++) {
      const p = await prisma.provider.create({ data: { tenantId: tId(), name: `Extra ${world.token}-${i}`, type: "HOSPITAL", servicesOffered: [] } });
      extraProviderIds.push(p.id);
    }
    cohortProviders = [world.providers.a.id, world.providers.b.id, ...extraProviderIds];
  });
  afterAll(async () => {
    // extra providers must go before world.teardown drops the tenant (Provider.tenantId FK).
    await prisma.providerPerformanceScore.deleteMany({ where: { providerId: { in: extraProviderIds } } });
    await prisma.provider.deleteMany({ where: { id: { in: extraProviderIds } } });
    if (world) await world.teardown();
  });

  it("a large cohort publishes a benchmark (percentile/median/range) with NO peer identifier; scores become PUBLISHED", async () => {
    const p = "2026-07";
    const values = [0.5, 0.6, 0.7, 0.8, 0.9];
    for (let i = 0; i < 5; i++) await mkScore(cohortProviders[i], p, values[i]);

    const res = await Svc.publishPeriod(actor(), { period: p });
    expect(res.benchmarks).toBeGreaterThanOrEqual(1);
    expect(res.published).toBe(5);

    const bench = (await Svc.getBenchmark(actor(), { period: p, metricKey: METRIC, cohortKey: `${tId()}|HOSPITAL|PARTNER` }))!;
    expect(bench).not.toBeNull();
    expect(bench.providerCount).toBe(5);
    expect(Number(bench.median)).toBeCloseTo(0.7, 6);
    expect(Number(bench.minValue)).toBeCloseTo(0.5, 6);
    expect(Number(bench.maxValue)).toBeCloseTo(0.9, 6);
    // no peer identity derivable — the row has no providerId/name field
    expect(JSON.stringify(bench)).not.toContain("providerId");
    for (const id of cohortProviders) expect(JSON.stringify(bench)).not.toContain(id);

    const scores = await prisma.providerPerformanceScore.findMany({ where: { tenantId: tId(), period: p, metricKey: METRIC } });
    expect(scores.every((s) => s.status === "PUBLISHED")).toBe(true);
    expect(scores.every((s) => s.cohortKey === `${tId()}|HOSPITAL|PARTNER`)).toBe(true);
  });

  it("a small cohort (< 5 providers) is suppressed — no benchmark row is written", async () => {
    const p = "2026-08";
    for (let i = 0; i < 4; i++) await mkScore(cohortProviders[i], p, 0.7); // only 4
    const res = await Svc.publishPeriod(actor(), { period: p });
    expect(res.benchmarks).toBe(0);
    expect(res.suppressedCohorts).toBeGreaterThanOrEqual(1);
    expect(await Svc.getBenchmark(actor(), { period: p, metricKey: METRIC, cohortKey: `${tId()}|HOSPITAL|PARTNER` })).toBeNull();
    // the providers' own scores are still published (their own value is visible; only the peer benchmark is withheld)
    const scores = await prisma.providerPerformanceScore.findMany({ where: { tenantId: tId(), period: p, metricKey: METRIC } });
    expect(scores.every((s) => s.status === "PUBLISHED")).toBe(true);
  });

  it("an under-sample provider is excluded from the benchmark cohort", async () => {
    const p = "2026-09";
    for (let i = 0; i < 4; i++) await mkScore(cohortProviders[i], p, 0.7); // 4 sampled
    await mkScore(cohortProviders[4], p, 0.99, { meetsMinimumSample: false, sampleSize: 3 }); // under-sample → excluded
    const res = await Svc.publishPeriod(actor(), { period: p });
    expect(res.benchmarks).toBe(0); // only 4 contributing ⇒ suppressed
  });

  it("a corrected republish is a NEW publication version (prior kept as history)", async () => {
    const p = "2026-10";
    for (let i = 0; i < 5; i++) await mkScore(cohortProviders[i], p, 0.6);
    await Svc.publishPeriod(actor(), { period: p });
    await Svc.publishPeriod(actor(), { period: p }); // corrected republish
    const versions = await prisma.performanceCohortBenchmark.findMany({ where: { tenantId: tId(), period: p, metricKey: METRIC }, select: { publicationVersion: true }, orderBy: { publicationVersion: "asc" } });
    expect(versions.map((v) => v.publicationVersion)).toEqual([1, 2]);
    // the provider score's publicationVersion advanced on republish
    const score = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { tenantId: tId(), period: p, providerId: cohortProviders[0], metricKey: METRIC } });
    expect(score.publicationVersion).toBe(2);
  });

  it("publish is role-gated", async () => {
    await expect(Svc.publishPeriod(actor("PROVIDER_USER"), { period: "2026-07" })).rejects.toThrow();
  });
});
