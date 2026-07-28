/**
 * F9.8 — integration ops read models (opt-in DB).
 * Permission + provider + branch scope; safe projections (no secret/raw body);
 * bounded pagination; delivery detail with attempts + records + reconciliation.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { IntegrationDeliveryStatus } from "@prisma/client";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.8 integration ops read (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Ops: typeof import("@/server/services/provider-integration/ops-read.service").ProviderIntegrationOpsRead;
  let world: import("../factories/provider-network").ProviderWorld;

  let connA = "";
  let connB = "";
  let seq = 0;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctx = (over: Partial<Ctx> = {}): Ctx => ({
    actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "req", ...over,
  });

  async function mkConn(providerId: string) {
    const c = await prisma.providerIntegrationConnection.create({
      data: { tenantId: world.tenants.alpha.id, providerId, providerBranchId: "", label: `c${++seq}`, connectorType: `OPS_${seq}`, status: "ACTIVE" },
    });
    return c.id;
  }
  async function mkDelivery(connectionId: string, providerId: string, providerBranchId: string, status: IntegrationDeliveryStatus, over: Record<string, unknown> = {}) {
    return prisma.providerIntegrationDelivery.create({
      data: {
        tenantId: world.tenants.alpha.id, connectionId, providerId, providerBranchId, direction: "INBOUND", businessObjectType: "CASE_SERVICE",
        idempotencyKey: `ops-${++seq}`, normalizedPayloadHash: `hash-${seq}`, status, recordCount: 3, appliedCount: 2, rejectedCount: 1,
        receivedAt: new Date(Date.UTC(2026, 6, 20, 0, 0, seq)), ...over,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Ops = (await import("@/server/services/provider-integration/ops-read.service")).ProviderIntegrationOpsRead;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    connA = await mkConn(world.providers.a.id);
    connB = await mkConn(world.providers.b.id);
    await mkDelivery(connA, world.providers.a.id, "", "ACCEPTED");
    await mkDelivery(connA, world.providers.a.id, "", "RETRYING", { nextAttemptAt: new Date("2026-07-01T00:00:00Z"), attemptCount: 1 });
    await mkDelivery(connA, world.providers.a.id, "", "QUARANTINED", { quarantineReason: "poison" });
    await mkDelivery(connA, world.providers.a.id, world.branches.a2.id, "COMPLETED");
    await mkDelivery(connB, world.providers.b.id, "", "ACCEPTED");
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("requires the permission", async () => {
    await expect(Ops.listDeliveries(ctx({ permissions: [] }))).rejects.toMatchObject({ code: "FORBIDDEN_PERMISSION" });
  });

  it("scopes deliveries to the actor's provider (never another provider's)", async () => {
    const { items } = await Ops.listDeliveries(ctx(), { take: 100 });
    expect(items.length).toBe(4); // A's four; B's is not visible
    expect(items.every((i) => i.status !== undefined)).toBe(true);
    // B's delivery detail is a non-enumerating null for A.
    const bDelivery = await prisma.providerIntegrationDelivery.findFirstOrThrow({ where: { connectionId: connB } });
    expect(await Ops.getDeliveryDetail(ctx(), bDelivery.id)).toBeNull();
  });

  it("honors branch restriction — a branch-a1 actor does not see the branch-a2 delivery", async () => {
    const restricted = ctx({ allowedProviderBranchIds: [world.branches.a1.id] });
    const { items } = await Ops.listDeliveries(restricted, { take: 100 });
    // sees the three provider-level ("") deliveries, not the a2-scoped one.
    expect(items.length).toBe(3);
    expect(items.some((i) => i.status === "COMPLETED")).toBe(false);
  });

  it("never leaks a secret, raw body, or internal handle in a projection", async () => {
    const { items } = await Ops.listDeliveries(ctx(), { take: 100 });
    const detail = await Ops.getDeliveryDetail(ctx(), items[0].id);
    const forbidden = ["normalizedPayloadHash", "idempotencyKey", "leaseOwner", "leaseExpiresAt", "rawBody", "payload", "secret", "secretRef"];
    for (const item of items) for (const f of forbidden) expect(item).not.toHaveProperty(f);
    for (const f of forbidden) expect(detail).not.toHaveProperty(f);
  });

  it("paginates with a bounded page + a stable cursor", async () => {
    const first = await Ops.listDeliveries(ctx(), { take: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await Ops.listDeliveries(ctx(), { take: 2, cursor: first.nextCursor! });
    expect(second.items.length).toBeGreaterThanOrEqual(1);
    // no overlap between pages
    const ids = new Set(first.items.map((i) => i.id));
    expect(second.items.every((i) => !ids.has(i.id))).toBe(true);
  });

  it("rolls up connection health with per-status counts + retry-due", async () => {
    const health = await Ops.listConnectionHealth(ctx());
    const a = health.find((h) => h.id === connA);
    expect(a).toBeTruthy();
    expect(a!.deliveries.total).toBe(4);
    expect(a!.deliveries.quarantined).toBe(1);
    expect(a!.deliveries.retryDue).toBe(1); // the RETRYING one whose nextAttemptAt is past
  });

  it("serves delivery detail with attempts, records, and reconciliation", async () => {
    const d = await prisma.providerIntegrationDelivery.findFirstOrThrow({ where: { connectionId: connA, status: "QUARANTINED" } });
    await prisma.providerIntegrationAttempt.create({ data: { deliveryId: d.id, attemptNumber: 1, resultClass: "POISON", retryable: false, safeErrorCode: "bad" } });
    await prisma.providerIntegrationRecordResult.create({ data: { tenantId: world.tenants.alpha.id, deliveryId: d.id, recordIndex: 0, recordHash: "rh", businessObjectType: "CASE_SERVICE", outcome: "QUARANTINED", safeReason: "future date" } });
    const detail = await Ops.getDeliveryDetail(ctx(), d.id);
    expect(detail!.attempts).toHaveLength(1);
    expect(detail!.attempts[0].resultClass).toBe("POISON");
    expect(detail!.records[0].outcome).toBe("QUARANTINED");
    expect(detail!.quarantineReason).toBe("poison");
    expect(detail!.reconciliation).toMatchObject({ records: 3, applied: 2, rejected: 1 });
  });
});
