/**
 * F9.9 — legacy HMS cutover safety (opt-in DB + a pure flag block).
 *
 * The rollback-safe cutover-mode decision defaults to LEGACY; the shadow projection
 * computes what the NEW rail would do WITHOUT any mutation and its WOULD_APPLY count
 * matches the legacy apply's applied count (parity before flip); and a reviewed
 * IntegrationConfig maps to a DRAFT connection. GATED: no live route flip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolveCutoverMode } from "@/server/services/provider-integration/legacy-cutover.service";

describe("F9.9 cutover-mode decision (pure, rollback-safe)", () => {
  it("defaults to LEGACY for an unset/false/unknown flag", () => {
    expect(resolveCutoverMode(undefined)).toBe("LEGACY");
    expect(resolveCutoverMode(false)).toBe("LEGACY");
    expect(resolveCutoverMode("nonsense")).toBe("LEGACY");
    expect(resolveCutoverMode("SHADOW")).toBe("SHADOW");
    expect(resolveCutoverMode("CONNECTION")).toBe("CONNECTION");
    expect(resolveCutoverMode(true)).toBe("CONNECTION");
  });
});

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.9 legacy cutover (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Cutover: typeof import("@/server/services/provider-integration/legacy-cutover.service").LegacyHmsCutoverService;
  let HmsBatch: typeof import("@/server/services/hms-batch.service").HmsBatchService;
  let world: import("../factories/provider-network").ProviderWorld;

  const testCaseIds: string[] = [];
  let seq = 0;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctx = (): Ctx => ({
    actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "req",
  });
  const tid = () => world.tenants.alpha.id;
  const pid = () => world.providers.a.id;

  async function mkCase() {
    const caseNo = `CASE-F99-${++seq}`;
    const c = await prisma.clinicalCase.create({
      data: {
        tenantId: tid(), caseNumber: caseNo, memberId: world.members.alpha.id, providerId: pid(),
        caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT", status: "OPEN", admissionDate: new Date("2026-07-01T00:00:00Z"),
        openedById: world.users.a.admin.id, currency: "UGX",
      },
    });
    testCaseIds.push(c.id);
    return { caseId: c.id, caseNo };
  }
  const entriesForCase = (caseId: string) => prisma.caseServiceEntry.count({ where: { caseId } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Cutover = (await import("@/server/services/provider-integration/legacy-cutover.service")).LegacyHmsCutoverService;
    HmsBatch = (await import("@/server/services/hms-batch.service")).HmsBatchService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: { in: testCaseIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: testCaseIds } } });
    await prisma.integrationConfig.deleteMany({ where: { tenantId: tid() } });
    // The legacy apply raises ExceptionLog rows (raisedById → system-actor user) for
    // unmatched lines — clear them before world.teardown deletes the users.
    await prisma.exceptionLog.deleteMany({ where: { tenantId: tid() } });
    if (world) await world.teardown();
  });

  it("shadow projects the new rail WITHOUT mutating, and matches the legacy apply (parity)", async () => {
    const { caseId, caseNo } = await mkCase();
    const entries = [
      { caseNumber: caseNo, entryDate: "2026-07-03", description: "Svc", unitAmount: 5000 },
      { caseNumber: "NOPE-1", entryDate: "2026-07-03", description: "Ghost", unitAmount: 100 },
    ];
    // Shadow first — NO mutation.
    const shadow = await Cutover.shadowCompare(tid(), pid(), "", entries);
    expect(shadow).toMatchObject({ total: 2, wouldApply: 1, unmatched: 1, rejected: 0 });
    expect(await entriesForCase(caseId)).toBe(0); // the shadow created nothing

    // Now the legacy apply on the SAME batch — its applied count matches the shadow.
    const legacy = await HmsBatch.apply(tid(), { formatVersion: 1, facilityCode: pid(), batchRef: `B-${seq}`, entries }, pid());
    expect(legacy.applied).toBe(shadow.wouldApply); // parity before any flip
    expect(legacy.unmatched).toBe(shadow.unmatched);
    expect(await entriesForCase(caseId)).toBe(1); // legacy is still the one that applies
  });

  it("shadow surfaces a record the legacy validate would reject — without mutation", async () => {
    const { caseId, caseNo } = await mkCase();
    const shadow = await Cutover.shadowCompare(tid(), pid(), "", [
      { caseNumber: caseNo, entryDate: "2026-07-03", description: "Good", unitAmount: 100 },
      { caseNumber: caseNo, entryDate: "2026-07-03", description: "", unitAmount: 100 }, // bad → REJECTED
    ]);
    expect(shadow).toMatchObject({ wouldApply: 1, rejected: 1 });
    expect(await entriesForCase(caseId)).toBe(0);
  });

  it("maps a reviewed legacy IntegrationConfig to a DRAFT connection", async () => {
    await prisma.integrationConfig.upsert({
      where: { tenantId_provider: { tenantId: tid(), provider: "HMS" } },
      update: { apiBaseUrl: "https://hms.example.com/api" },
      create: { tenantId: tid(), provider: "HMS", apiBaseUrl: "https://hms.example.com/api", isEnabled: true },
    });
    const conn = await Cutover.mapConfigToConnection(ctx(), { configProvider: "HMS", connectorType: "HMS_BATCH_V1" });
    expect(conn.status).toBe("DRAFT");
    expect(conn.providerId).toBe(pid());
    expect(conn.connectorType).toBe("HMS_BATCH_V1");
    expect(conn.apiBaseUrl).toBe("https://hms.example.com/api");
    expect(conn.mode).toBe("BIDIRECTIONAL"); // has an endpoint
  });
});
