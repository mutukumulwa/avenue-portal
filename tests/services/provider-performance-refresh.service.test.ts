/**
 * F8.3 — deterministic submission-quality refresh (opt-in DB).
 *
 * Covers the package acceptance: inclusion/exclusion/period boundaries; the A7
 * confirmed-duplicate derivation; a late-arrival re-run that changes num/den + mints
 * a new watermark; a zero denominator that never divides; current-vs-prior definition
 * versions as distinct rows; and an idempotent re-run over identical facts. Each test
 * uses its own period so the claim sets are isolated.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F8.3 refreshSubmissionQuality (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-performance/refresh.service").ProviderPerformanceRefreshService;
  let world: import("../factories/provider-network").ProviderWorld;
  let dupReasonId: string;
  let otherReasonId: string;
  let seq = 0;

  const tId = () => world.tenants.alpha.id;
  const pA = () => world.providers.a.id;

  async function mkClaim(period: string, over: Record<string, unknown> = {}) {
    seq += 1;
    const day10 = new Date(`${period}-10T00:00:00Z`);
    return prisma.claim.create({
      data: {
        tenantId: tId(), claimNumber: `PERF-${world.token}-${seq}`, memberId: world.members.alpha.id, providerId: pA(),
        serviceType: "OUTPATIENT", benefitCategory: "OUTPATIENT", dateOfService: day10, diagnoses: [], procedures: [], billedAmount: 1000,
        source: "MANUAL", submissionType: "ORIGINAL", status: "RECEIVED", receivedAt: day10,
        ...over,
      },
    });
  }
  const addLine = (claimId: string, reasonCodeId: string | null = null) =>
    prisma.claimLine.create({ data: { claimId, lineNumber: 1, description: "svc", unitCost: 1000, billedAmount: 1000, approvedAmount: 0, reasonCodeId } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/provider-performance/refresh.service")).ProviderPerformanceRefreshService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    const rc = (code: string, category: string) => prisma.adjudicationReasonCode.create({ data: { tenantId: tId(), code, category, internalDescription: `INTERNAL ${code}`, providerDescription: code, memberDescription: code, defaultSeverity: "REJECT" } });
    dupReasonId = (await rc(`DUP01-${world.token}`, "Duplicate")).id;
    otherReasonId = (await rc(`SVC01-${world.token}`, "Service")).id;
  });
  afterAll(async () => {
    // Unlink our directly-created reason codes from any lines, then delete them, so
    // world.teardown can drop the tenant without an FK block.
    await prisma.claimLine.updateMany({ where: { reasonCodeId: { in: [dupReasonId, otherReasonId] } }, data: { reasonCodeId: null } });
    await prisma.adjudicationReasonCode.deleteMany({ where: { id: { in: [dupReasonId, otherReasonId] } } });
    if (world) await world.teardown();
  });

  it("A1/E1: digital + correction rates with period + exclusion boundaries", async () => {
    const p = "2026-07";
    await mkClaim(p, { source: "SLADE360" });
    await mkClaim(p, { source: "SMART" });
    await mkClaim(p, { source: "HMS" });
    await mkClaim(p, { source: "MANUAL" });
    await mkClaim(p, { source: "MANUAL" });
    await mkClaim(p, { source: "SMART", status: "SUPERSEDED" }); // excluded (not a real original)
    await mkClaim(p, { source: "SMART", submissionType: "CORRECTION", receivedAt: new Date("2026-07-12T00:00:00Z") }); // E1 num
    await mkClaim(p, { source: "MANUAL", receivedAt: new Date("2026-07-31T12:00:00Z") }); // boundary IN
    await mkClaim(p, { source: "SLADE360", receivedAt: new Date("2026-08-01T12:00:00Z") }); // boundary OUT (not in period)

    const res = await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    const a1 = res.scores.find((s) => s.metricKey === "A1_digital_submission_rate")!;
    const e1 = res.scores.find((s) => s.metricKey === "E1_correction_resubmission_rate")!;
    expect(a1.denominator).toBe(6); // 3 digital + 2 manual + 1 boundary-in
    expect(a1.numerator).toBe(3); // the 3 digital
    expect(e1.numerator).toBe(1); // the correction
    expect(e1.denominator).toBe(6);

    const row = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { tenantId: tId(), providerId: pA(), period: p, metricKey: "A1_digital_submission_rate", definitionVersion: "PNMC-1.0" } });
    expect(row.status).toBe("DRAFT");
    expect(row.excludedCount).toBe(2); // superseded + correction
    expect(Number(row.value)).toBeCloseTo(0.5, 6);
    expect(row.sampleSize).toBe(6);
    expect(row.meetsMinimumSample).toBe(false); // < 20
  });

  it("A7: confirmed duplicate = terminal DECLINED/VOID with a Duplicate-category reason", async () => {
    const p = "2026-08";
    const decidedAt = new Date("2026-08-15T00:00:00Z");
    const c1 = await mkClaim(p, { status: "DECLINED", decidedAt }); await addLine(c1.id, dupReasonId); // dup
    const c2 = await mkClaim(p, { status: "DECLINED", decidedAt }); await addLine(c2.id, otherReasonId); // decline, not dup
    const c3 = await mkClaim(p, { status: "APPROVED", decidedAt }); await addLine(c3.id, null); // decided, not dup
    const c4 = await mkClaim(p, { status: "VOID", decidedAt }); await addLine(c4.id, dupReasonId); // terminal VOID + dup

    const res = await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    const a7 = res.scores.find((s) => s.metricKey === "A7_confirmed_duplicate_rate")!;
    expect(a7.denominator).toBe(4); // all decided in period (VOID counts; SUPERSEDED/WITHDRAWN would not)
    expect(a7.numerator).toBe(2); // the DECLINED-dup + the VOID-dup
  });

  it("late arrival: a new in-period claim re-runs and changes num/den + mints a new watermark", async () => {
    const p = "2026-09";
    await mkClaim(p, { source: "SMART" });
    await mkClaim(p, { source: "SLADE360" });
    await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    const before = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { tenantId: tId(), providerId: pA(), period: p, metricKey: "A1_digital_submission_rate" } });
    expect(before.denominator.toString()).toBe("2");

    await mkClaim(p, { source: "MANUAL" }); // late arrival
    const res2 = await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    expect(res2.scores.find((s) => s.metricKey === "A1_digital_submission_rate")!.changed).toBe(true);
    const after = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { id: before.id } });
    expect(after.denominator.toString()).toBe("3");
    expect(after.numerator.toString()).toBe("2");
    expect(after.sourceWatermark).not.toBe(before.sourceWatermark);
  });

  it("zero denominator: never divides — value null, sample not met, no throw", async () => {
    const p = "2026-10"; // no claims seeded
    const res = await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    const a1 = res.scores.find((s) => s.metricKey === "A1_digital_submission_rate")!;
    expect(a1.denominator).toBe(0);
    expect(a1.value).toBeNull();
    const row = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { tenantId: tId(), providerId: pA(), period: p, metricKey: "A1_digital_submission_rate" } });
    expect(row.value).toBeNull();
    expect(row.meetsMinimumSample).toBe(false);
  });

  it("current vs prior definition versions are distinct rows", async () => {
    const p = "2026-11";
    await mkClaim(p, { source: "SMART" });
    await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p, definitionVersion: "PNMC-1.0" });
    await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p, definitionVersion: "PNMC-1.1" });
    const versions = await prisma.providerPerformanceScore.findMany({ where: { tenantId: tId(), providerId: pA(), period: p, metricKey: "A1_digital_submission_rate" }, select: { definitionVersion: true } });
    expect(versions.map((v) => v.definitionVersion).sort()).toEqual(["PNMC-1.0", "PNMC-1.1"]);
  });

  it("idempotent: an identical re-run is a no-op (unchanged + computedAt preserved)", async () => {
    const p = "2026-12";
    await mkClaim(p, { source: "SMART" });
    await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    const first = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { tenantId: tId(), providerId: pA(), period: p, metricKey: "A1_digital_submission_rate" }, select: { computedAt: true, sourceWatermark: true } });
    const res2 = await Svc.refreshSubmissionQuality({ tenantId: tId(), providerId: pA(), period: p });
    expect(res2.scores.every((s) => s.changed === false)).toBe(true);
    const second = await prisma.providerPerformanceScore.findFirstOrThrow({ where: { tenantId: tId(), providerId: pA(), period: p, metricKey: "A1_digital_submission_rate" }, select: { computedAt: true, sourceWatermark: true } });
    expect(second.computedAt.toISOString()).toBe(first.computedAt.toISOString());
    expect(second.sourceWatermark).toBe(first.sourceWatermark);
  });
});
