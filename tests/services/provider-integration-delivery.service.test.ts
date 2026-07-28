/**
 * F9.4 — durable inbound delivery receipt (opt-in DB).
 *
 * Covers: fresh accept persists a durable ACCEPTED delivery ready for processing;
 * replay is idempotent; same key + different body conflicts; a bad credential,
 * off-window timestamp, oversized/non-JSON/wrong-media body, inactive connection,
 * and out-of-scope object are all rejected with NO row written; provider/branch are
 * server-derived from the connection; an accepted receipt survives a queue outage;
 * and getReceipt is a scoped, secret-free read.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.4 inbound delivery receipt (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let Svc: typeof import("@/server/services/provider-integration/inbound-delivery.service").InboundDeliveryService;
  let world: import("../factories/provider-network").ProviderWorld;

  const NOW = new Date("2026-07-28T12:00:00.000Z");
  const BODY = JSON.stringify({ formatVersion: 1, entries: [{ description: "x", amount: 100 }] });

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER",
      actorId: world.users.a.admin.id,
      tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id,
      allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.integrations.manage"],
      apiScopes: [],
      requestId: "req-test",
      ...over,
    };
  }

  let connSeq = 0;
  /** Create an ACTIVE connection with a known secret. */
  async function activeConnection(over: Record<string, unknown> = {}) {
    connSeq += 1;
    const c = await Admin.create(ctx(), { label: `dlv-${connSeq}`, connectorType: `DLV_${connSeq}`, mode: "PUSH", ...over });
    const { plaintext } = await Admin.rotateSecret(ctx(), c.id);
    await Admin.test(ctx(), c.id);
    const active = await Admin.activate(ctx(), c.id);
    return { connectionId: active.id, secret: plaintext, branchId: active.providerBranchId };
  }

  function input(connectionId: string, secret: string, over: Partial<import("@/server/services/provider-integration/inbound-delivery.service").ReceiveDeliveryInput> = {}) {
    return {
      connectionId,
      presentedSecret: secret,
      timestamp: NOW.toISOString(),
      idempotencyKey: "k1",
      businessObjectType: "CASE_SERVICE",
      rawBody: BODY,
      contentType: "application/json",
      ...over,
    };
  }

  const countDeliveries = (connectionId: string, idempotencyKey: string) =>
    prisma.providerIntegrationDelivery.count({ where: { connectionId, idempotencyKey } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Admin = (await import("@/server/services/provider-integration/connection-admin.service")).ProviderIntegrationConnectionAdmin;
    Svc = (await import("@/server/services/provider-integration/inbound-delivery.service")).InboundDeliveryService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("durably records a fresh delivery as ACCEPTED, ready for processing, with server-derived scope", async () => {
    const { connectionId, secret } = await activeConnection();
    const receipt = await Svc.receive(input(connectionId, secret, { recordCount: 1, amountTotal: "100.00" }), { now: NOW });
    expect(receipt.replayed).toBe(false);
    expect(receipt.status).toBe("ACCEPTED");
    expect(receipt.statusUrl).toContain(receipt.deliveryId);

    const row = await prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id: receipt.deliveryId } });
    expect(row.status).toBe("ACCEPTED");
    expect(row.nextAttemptAt).toBeTruthy(); // ready for the F9.5/F9.6 processor from DB state
    expect(row.providerId).toBe(world.providers.a.id); // derived from the connection, not the input
    expect(row.recordCount).toBe(1);
    // the raw body is never stored — only its hash
    expect(row.normalizedPayloadHash).toHaveLength(64);
    expect(JSON.stringify(row)).not.toContain("description");
  });

  it("replays idempotently on the same key + same body (no second row)", async () => {
    const { connectionId, secret } = await activeConnection();
    const r1 = await Svc.receive(input(connectionId, secret), { now: NOW });
    const r2 = await Svc.receive(input(connectionId, secret), { now: NOW });
    expect(r2.replayed).toBe(true);
    expect(r2.deliveryId).toBe(r1.deliveryId);
    expect(await countDeliveries(connectionId, "k1")).toBe(1);
  });

  it("conflicts on the same key + different body, mutating nothing", async () => {
    const { connectionId, secret } = await activeConnection();
    const r1 = await Svc.receive(input(connectionId, secret), { now: NOW });
    const hashBefore = (await prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id: r1.deliveryId } })).normalizedPayloadHash;
    await expect(Svc.receive(input(connectionId, secret, { rawBody: JSON.stringify({ different: true }) }), { now: NOW }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(await countDeliveries(connectionId, "k1")).toBe(1);
    // The original delivery is untouched — the conflicting body never overwrote it.
    const hashAfter = (await prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id: r1.deliveryId } })).normalizedPayloadHash;
    expect(hashAfter).toBe(hashBefore);
  });

  it("rejects a bad credential (signature) with no row written", async () => {
    const { connectionId } = await activeConnection();
    await expect(Svc.receive(input(connectionId, "mvxi_wrongsecret"), { now: NOW })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await countDeliveries(connectionId, "k1")).toBe(0);
  });

  it("rejects an out-of-window timestamp (clock skew)", async () => {
    const { connectionId, secret } = await activeConnection();
    const stale = new Date(NOW.getTime() - 10 * 60 * 1000).toISOString(); // 10 min old, window 5 min
    await expect(Svc.receive(input(connectionId, secret, { timestamp: stale }), { now: NOW })).rejects.toMatchObject({ code: "CLOCK_SKEW" });
    expect(await countDeliveries(connectionId, "k1")).toBe(0);
  });

  it("rejects oversize, non-JSON, and wrong-media bodies before processing", async () => {
    const { connectionId, secret } = await activeConnection();
    await expect(Svc.receive(input(connectionId, secret), { now: NOW, maxBodyBytes: 10 })).rejects.toMatchObject({ code: "OVERSIZE" });
    await expect(Svc.receive(input(connectionId, secret, { rawBody: "{not json" }), { now: NOW })).rejects.toMatchObject({ code: "SCHEMA" });
    await expect(Svc.receive(input(connectionId, secret, { contentType: "text/plain" }), { now: NOW })).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA" });
    expect(await countDeliveries(connectionId, "k1")).toBe(0);
  });

  it("rejects a delivery to an inactive connection", async () => {
    // DRAFT connection (created but never activated) + a secret to isolate the INACTIVE cause.
    const c = await Admin.create(ctx(), { label: "inactive", connectorType: "INACT" });
    const { plaintext } = await Admin.rotateSecret(ctx(), c.id);
    await expect(Svc.receive(input(c.id, plaintext), { now: NOW })).rejects.toMatchObject({ code: "INACTIVE" });
  });

  it("rejects an out-of-scope business object type", async () => {
    const { connectionId, secret } = await activeConnection({ scopes: ["CLAIM"] });
    await expect(Svc.receive(input(connectionId, secret, { businessObjectType: "CASE_SERVICE" }), { now: NOW })).rejects.toMatchObject({ code: "FORBIDDEN_SCOPE" });
  });

  it("derives providerBranchId from a branch-scoped connection", async () => {
    const { connectionId, secret, branchId } = await activeConnection({ providerBranchId: world.branches.a2.id });
    expect(branchId).toBe(world.branches.a2.id);
    const receipt = await Svc.receive(input(connectionId, secret), { now: NOW });
    const row = await prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id: receipt.deliveryId } });
    expect(row.providerBranchId).toBe(world.branches.a2.id);
  });

  it("keeps an accepted receipt durable even when the fast-path enqueue fails (queue outage)", async () => {
    const { connectionId, secret } = await activeConnection();
    const receipt = await Svc.receive(input(connectionId, secret), {
      now: NOW,
      onAccepted: () => {
        throw new Error("queue down");
      },
    });
    expect(receipt.status).toBe("ACCEPTED"); // returned despite the enqueue throw
    const row = await prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id: receipt.deliveryId } });
    expect(row.status).toBe("ACCEPTED"); // durable in DB — the sweeper (F9.6) will drain it
    expect(row.nextAttemptAt).toBeTruthy();
  });

  it("serves a scoped, secret-free receipt via getReceipt", async () => {
    const { connectionId, secret } = await activeConnection();
    const receipt = await Svc.receive(input(connectionId, secret), { now: NOW });
    const read = await Svc.getReceipt(connectionId, receipt.deliveryId);
    expect(read?.status).toBe("ACCEPTED");
    for (const forbidden of ["rawBody", "payload", "presentedSecret", "secret", "normalizedPayloadHash"]) {
      expect(read).not.toHaveProperty(forbidden);
    }
    // Wrong connection → non-enumerating null.
    const other = await activeConnection();
    expect(await Svc.getReceipt(other.connectionId, receipt.deliveryId)).toBeNull();
  });
});
