/**
 * F1.8 — applicability readiness (read-only).
 *
 * Pure block: the classifier priority order across every classification. DB
 * block (opt-in): the report over the F0.6 world classifies A/B/C COMPLETE
 * (active contract + INCLUDE), control totals reconcile, and the report is
 * read-only (row counts unchanged after running it).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { classifyApplicability, type ProviderReadinessSummary } from "@/server/services/provider-applicability-readiness.service";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

const base: ProviderReadinessSummary = {
  providerContractStatus: "ACTIVE", activeContracts: 1, expiredContracts: 0, futureContracts: 0,
  effectiveIncludeRules: 1, effectiveExcludeRules: 0, contradictions: 0, orphanRules: 0,
};

describe("F1.8 classifyApplicability (pure)", () => {
  it("COMPLETE when active contract + include rule", () => {
    expect(classifyApplicability(base)).toBe("COMPLETE");
  });
  it("INACTIVE_PROVIDER short-circuits regardless of contracts", () => {
    expect(classifyApplicability({ ...base, providerContractStatus: "PENDING" })).toBe("INACTIVE_PROVIDER");
  });
  it("ORPHANED_RULES outranks contradiction and missing", () => {
    expect(classifyApplicability({ ...base, orphanRules: 1, contradictions: 2, effectiveIncludeRules: 0 })).toBe("ORPHANED_RULES");
  });
  it("CONTRADICTORY when include+exclude collide", () => {
    expect(classifyApplicability({ ...base, contradictions: 1 })).toBe("CONTRADICTORY");
  });
  it("NO_ACTIVE_CONTRACT when active provider has only expired/future", () => {
    expect(classifyApplicability({ ...base, activeContracts: 0, expiredContracts: 2 })).toBe("NO_ACTIVE_CONTRACT");
    expect(classifyApplicability({ ...base, activeContracts: 0, futureContracts: 1 })).toBe("NO_ACTIVE_CONTRACT");
  });
  it("MISSING_APPLICABILITY when active contract but no include rule (the D3 gap)", () => {
    expect(classifyApplicability({ ...base, effectiveIncludeRules: 0 })).toBe("MISSING_APPLICABILITY");
  });
});

describe.skipIf(!URL_SET)("F1.8 readiness report (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/server/services/provider-applicability-readiness.service").ProviderApplicabilityReadinessService;
  let world: import("../factories/provider-network").ProviderWorld;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = (await import("@/server/services/provider-applicability-readiness.service")).ProviderApplicabilityReadinessService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });

  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("classifies the factory providers COMPLETE and totals reconcile; report is read-only", async () => {
    const before = await prisma.contractApplicability.count();
    const report = await svc.report({ tenantId: world.tenants.alpha.id });

    const a = report.rows.find((r) => r.providerId === world.providers.a.id)!;
    const b = report.rows.find((r) => r.providerId === world.providers.b.id)!;
    expect(a.classification).toBe("COMPLETE"); // active contract + client-level INCLUDE
    expect(a.effectiveExcludeRules).toBeGreaterThanOrEqual(1); // groupAlpha2 EXCLUDE surfaced
    expect(a.expiredContracts).toBeGreaterThanOrEqual(1); // the EXPIRED contract counted
    expect(a.futureContracts).toBeGreaterThanOrEqual(1); // the future APPROVED contract counted
    expect(b.classification).toBe("COMPLETE");

    // totals sum to the number of alpha-tenant providers reported
    const sum = Object.values(report.totals).reduce((x, y) => x + y, 0);
    expect(sum).toBe(report.rows.length);

    // read-only: no applicability rows created/removed
    expect(await prisma.contractApplicability.count()).toBe(before);
  });

  it("a provider with an active contract but no include rule is MISSING_APPLICABILITY", async () => {
    // retire provider B's only INCLUDE rule → B should flip to MISSING_APPLICABILITY
    await prisma.contractApplicability.updateMany({ where: { contractId: world.contracts.bActive.id, inclusionType: "INCLUDE" }, data: { isActive: false } });
    const report = await svc.report({ tenantId: world.tenants.alpha.id });
    const b = report.rows.find((r) => r.providerId === world.providers.b.id)!;
    expect(b.classification).toBe("MISSING_APPLICABILITY");
    expect(report.gateReady).toBe(false);
    // restore for teardown determinism
    await prisma.contractApplicability.updateMany({ where: { contractId: world.contracts.bActive.id, inclusionType: "INCLUDE" }, data: { isActive: true } });
  });
});
