/**
 * F11.2 — concurrency/idempotency suite (opt-in DB).
 *
 * REAL parallel execution (Promise.all against one database) proves each externally
 * repeatable command yields exactly ONE logical outcome: a duplicate inbound
 * delivery collapses to one row; a delivery lease has exactly one winner; a period
 * opens once; and accrual is value-stable under a concurrent recompute. Not mocked
 * sequential calls — the DB's real transaction/locking behavior.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F11.2 concurrency / idempotency (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let Inbound: typeof import("@/server/services/provider-integration/inbound-delivery.service").InboundDeliveryService;
  let Retry: typeof import("@/server/services/provider-integration/delivery-retry.service").DeliveryRetryService;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Accr: typeof import("@/server/services/capitation/accrual.service").CapitationAccrualService;
  let world: import("../factories/provider-network").ProviderWorld;

  const NOW = new Date("2026-07-28T12:00:00.000Z");
  let seq = 0;
  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctx = (): Ctx => ({ actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "r" });
  const capActor = () => ({ userId: "fin", tenantId: world.tenants.alpha.id, role: "SUPER_ADMIN" });

  async function activeConnection() {
    const c = await Admin.create(ctx(), { label: `cx-${++seq}`, connectorType: `CX_${seq}`, mode: "PUSH", scopes: ["CASE_SERVICE"] });
    const { plaintext } = await Admin.rotateSecret(ctx(), c.id);
    await Admin.test(ctx(), c.id);
    await Admin.activate(ctx(), c.id);
    return { connectionId: c.id, secret: plaintext };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Admin = (await import("@/server/services/provider-integration/connection-admin.service")).ProviderIntegrationConnectionAdmin;
    Inbound = (await import("@/server/services/provider-integration/inbound-delivery.service")).InboundDeliveryService;
    Retry = (await import("@/server/services/provider-integration/delivery-retry.service")).DeliveryRetryService;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Accr = (await import("@/server/services/capitation/accrual.service")).CapitationAccrualService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("a duplicate inbound delivery (same key, parallel) collapses to exactly one row", async () => {
    const { connectionId, secret } = await activeConnection();
    const rawBody = JSON.stringify({ entries: [{ caseNumber: "X", entryDate: "2026-07-03", description: "d", unitAmount: 1 }] });
    const input = { connectionId, presentedSecret: secret, timestamp: NOW.toISOString(), idempotencyKey: "race-1", businessObjectType: "CASE_SERVICE", rawBody, contentType: "application/json" };
    const [r1, r2] = await Promise.all([Inbound.receive(input, { now: NOW }), Inbound.receive(input, { now: NOW })]);
    expect(r1.deliveryId).toBe(r2.deliveryId); // one delivery, one of them replayed
    expect(await prisma.providerIntegrationDelivery.count({ where: { connectionId, idempotencyKey: "race-1" } })).toBe(1);
  });

  it("a delivery lease has exactly one concurrent winner", async () => {
    const { connectionId } = await activeConnection();
    const d = await prisma.providerIntegrationDelivery.create({ data: { tenantId: world.tenants.alpha.id, connectionId, providerId: world.providers.a.id, providerBranchId: "", direction: "INBOUND", businessObjectType: "CASE_SERVICE", idempotencyKey: `lease-${++seq}`, normalizedPayloadHash: "h", status: "RETRYING" } });
    const results = await Promise.all([Retry.acquireLease(d.id, "w1", 60_000, NOW), Retry.acquireLease(d.id, "w2", 60_000, NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1); // exactly one worker holds the lease
  });

  it("a capitation period opens exactly once under a parallel open", async () => {
    const a = await Arr.createArrangement(capActor(), { providerId: world.providers.a.id, label: `pc-${++seq}`, rate: "1000.00", eligibilityDefinitionVersion: "CAP-1.0", effectiveFrom: new Date("2036-01-01Z"), effectiveTo: new Date("2036-12-31Z") });
    const bounds = { periodStart: new Date("2036-01-01Z"), periodEnd: new Date("2036-01-28Z") };
    const [p1, p2] = await Promise.all([Arr.openPeriod(capActor(), a.id, "2036-01", bounds), Arr.openPeriod(capActor(), a.id, "2036-01", bounds)]);
    expect(p1.id).toBe(p2.id);
    expect(await prisma.capitationPeriod.count({ where: { arrangementId: a.id, period: "2036-01" } })).toBe(1);
  });

  it("accrual is value-stable under a concurrent recompute", async () => {
    const a = await Arr.createArrangement(capActor(), { providerId: world.providers.a.id, label: `ac-${++seq}`, rate: "12000.00", eligibilityDefinitionVersion: "CAP-1.0", effectiveFrom: new Date("2037-01-01Z"), effectiveTo: new Date("2037-12-31Z") });
    const p = await Arr.openPeriod(capActor(), a.id, "2037-01", { periodStart: new Date("2037-01-01Z"), periodEnd: new Date("2037-01-28Z") });
    await prisma.capitationPeriod.update({ where: { id: p.id }, data: { eligibleLifeCount: 3, eligibleLifeControlHash: "h", status: "CALCULATED" } });
    const [c1, c2] = await Promise.all([Accr.calculateAccrual(capActor(), p.id), Accr.calculateAccrual(capActor(), p.id)]);
    expect(c1.grossAccrual).toBe("36000.0000");
    expect(c2.grossAccrual).toBe("36000.0000"); // same money regardless of interleaving
  });
});
