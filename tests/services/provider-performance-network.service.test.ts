/**
 * F8.6 — NetworkPerformanceService (opt-in DB).
 *
 * The explicit network-analytics permission gate; the named-provider comparison with
 * outlier flags; the audited export; and the absence of any clinical detail.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F8.6 NetworkPerformanceService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-performance/network.service").NetworkPerformanceService;
  let CAP: string;
  let world: import("../factories/provider-network").ProviderWorld;
  const extra: string[] = [];

  const tId = () => world.tenants.alpha.id;
  const actor = (perms: string[]) => ({ userId: world.users.a.admin.id, tenantId: tId(), permissions: perms });
  const METRIC = "A1_digital_submission_rate";
  const PERIOD = "2026-07";

  async function mkScore(providerId: string, value: number) {
    return prisma.providerPerformanceScore.create({ data: { tenantId: tId(), providerId, providerBranchId: "", period: PERIOD, periodStart: new Date(`${PERIOD}-01T00:00:00Z`), periodEnd: new Date(`${PERIOD}-28T00:00:00Z`), metricKey: METRIC, definitionVersion: "PNMC-1.0", numerator: value * 100, denominator: 100, value, unit: "RATE", completeness: 1, sampleSize: 40, meetsMinimumSample: true, status: "PUBLISHED", sourceWatermark: `wm-${providerId}` } });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-performance/network.service");
    Svc = mod.NetworkPerformanceService;
    CAP = mod.NETWORK_ANALYTICS_PERMISSION;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    for (let i = 0; i < 3; i++) extra.push((await prisma.provider.create({ data: { tenantId: tId(), name: `Net${world.token}-${i}`, type: "HOSPITAL", servicesOffered: [] } })).id);
    const providers = [world.providers.a.id, world.providers.b.id, ...extra];
    const values = [0.1, 0.5, 0.5, 0.5, 0.9]; // 0.1 + 0.9 are the outliers
    for (let i = 0; i < 5; i++) await mkScore(providers[i], values[i]);
  });
  afterAll(async () => {
    await prisma.providerPerformanceScore.deleteMany({ where: { providerId: { in: extra } } });
    await prisma.provider.deleteMany({ where: { id: { in: extra } } });
    if (world) await world.teardown();
  });

  it("requires the explicit network-analytics permission (role alone is not enough)", async () => {
    await expect(Svc.listComparison(actor([]), { period: PERIOD, metricKey: METRIC })).rejects.toThrow(/network-analytics/i);
    await expect(Svc.exportComparisonCsv(actor([]), { period: PERIOD, metricKey: METRIC })).rejects.toThrow(/network-analytics/i);
  });

  it("compares NAMED providers and flags the top/bottom-decile outliers", async () => {
    const rows = await Svc.listComparison(actor([CAP]), { period: PERIOD, metricKey: METRIC });
    expect(rows.length).toBe(5);
    expect(rows.some((r) => r.providerName.startsWith("Provider A"))).toBe(true); // named
    const outliers = rows.filter((r) => r.isOutlier).map((r) => r.value);
    expect(outliers).toContain("0.1");
    expect(outliers).toContain("0.9");
    expect(rows.find((r) => r.value === "0.5")!.isOutlier).toBe(false);
  });

  it("carries NO clinical detail — only provider name + aggregate score", async () => {
    const rows = await Svc.listComparison(actor([CAP]), { period: PERIOD, metricKey: METRIC });
    const flat = JSON.stringify(rows);
    for (const tok of ["diagnos", "icd", "memberId", "member", "cpt", "clinical", "notes"]) {
      expect(flat.toLowerCase()).not.toContain(tok);
    }
  });

  it("exports an audited CSV (permission-gated)", async () => {
    const { csv, rowCount, filename } = await Svc.exportComparisonCsv(actor([CAP]), { period: PERIOD, metricKey: METRIC });
    expect(rowCount).toBe(5);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Provider");
    expect(filename).toMatch(/^network-performance-/);
  });
});
