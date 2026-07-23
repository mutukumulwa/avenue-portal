/**
 * F1.9 — reviewed applicability backfill (GATED mechanism; tested on throwaway).
 *
 * OPT-IN DB. Proves: dry-run classifies every row (row conservation), no
 * "all clients" default (missing clientId rejected), apply is idempotent, and
 * rollback RETIRES (isActive=false) rather than deleting.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F1.9 ProviderApplicabilityBackfillService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let svc: typeof import("@/server/services/provider-applicability-backfill.service").ProviderApplicabilityBackfillService;
  let world: import("../factories/provider-network").ProviderWorld;
  let actorId: string;
  let validRow: import("@/server/services/provider-applicability-backfill.service").ReviewedApplicabilityRow;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    svc = (await import("@/server/services/provider-applicability-backfill.service")).ProviderApplicabilityBackfillService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    actorId = world.users.a.admin.id;
    // Provider B's active contract has only a group-level INCLUDE — a client-level
    // INCLUDE row is genuinely new (VALID).
    validRow = { tenantId: world.tenants.alpha.id, providerId: world.providers.b.id, contractId: world.contracts.bActive.id, clientId: world.clients.alpha.id, groupId: null, inclusionType: "INCLUDE", effectiveFrom: new Date() };
  });

  afterAll(async () => {
    if (world) {
      await prisma.auditLog.deleteMany({ where: { userId: actorId } }).catch(() => {});
      await world.teardown();
    }
  });

  it("dry-run classifies every row and conserves the input count; writes nothing", async () => {
    const before = await prisma.contractApplicability.count();
    const rows = [
      validRow,
      { ...validRow, clientId: "" }, // MISSING_CLIENT — no all-clients default
      { ...validRow, providerId: "no-such-provider" }, // INVALID_PROVIDER
      { ...validRow, providerId: world.providers.a.id, contractId: world.contracts.aExpired.id }, // INVALID_CONTRACT (EXPIRED)
      { tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, contractId: world.contracts.aActive.id, clientId: world.clients.alpha.id, groupId: null, inclusionType: "INCLUDE" as const, effectiveFrom: new Date() }, // ALREADY_EXISTS
    ];
    const report = await svc.dryRun(rows);
    expect(report.total).toBe(5);
    const sum = Object.values(report.counts).reduce((a, b) => a + b, 0);
    expect(sum).toBe(5); // row conservation
    expect(report.counts.VALID).toBe(1);
    expect(report.counts.MISSING_CLIENT).toBe(1);
    expect(report.counts.INVALID_PROVIDER).toBe(1);
    expect(report.counts.INVALID_CONTRACT).toBe(1);
    expect(report.counts.ALREADY_EXISTS).toBe(1);
    expect(report.applied).toBe(0);
    expect(await prisma.contractApplicability.count()).toBe(before); // nothing written
  });

  it("apply writes only VALID rows and is idempotent on rerun", async () => {
    const first = await svc.apply([validRow], actorId);
    expect(first.applied).toBe(1);
    const created = await prisma.contractApplicability.findFirst({ where: { contractId: world.contracts.bActive.id, clientId: world.clients.alpha.id, groupId: null, inclusionType: "INCLUDE", isActive: true } });
    expect(created).not.toBeNull();

    const second = await svc.apply([validRow], actorId);
    expect(second.applied).toBe(0); // idempotent
    expect(second.counts.ALREADY_EXISTS).toBe(1);
  });

  it("rollback retires (isActive=false), never deletes", async () => {
    const { retired } = await svc.retire([validRow], actorId);
    expect(retired).toBeGreaterThanOrEqual(1);
    // the row still EXISTS, just inactive
    const active = await prisma.contractApplicability.findFirst({ where: { contractId: world.contracts.bActive.id, clientId: world.clients.alpha.id, groupId: null, inclusionType: "INCLUDE", isActive: true } });
    expect(active).toBeNull();
    const retiredRow = await prisma.contractApplicability.findFirst({ where: { contractId: world.contracts.bActive.id, clientId: world.clients.alpha.id, groupId: null, inclusionType: "INCLUDE", isActive: false } });
    expect(retiredRow).not.toBeNull(); // retained, not deleted
  });
});
