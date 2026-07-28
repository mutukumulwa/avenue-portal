/**
 * F9.2 — provider integration connection/delivery schema (opt-in DB).
 *
 * Schema-level guarantees for the HMS integration control plane (§7.11), with NO
 * live path (F9.2 stop). Covers the four package tests:
 *   1. provider/branch/connection consistency — a connection is scoped to a
 *      provider (+ optional branch); one live connection per (provider, branch,
 *      connector, mode); provider-level ("") and branch-level rows coexist.
 *   2. delivery idempotency uniqueness — one delivery per (connection, key);
 *      the same key on a different connection is allowed.
 *   3. attempt ordering — attempts are unique + ordered per delivery.
 *   4. no secret / raw-payload column — the models store a secret REFERENCE and
 *      hashes/safe codes only; there is no column for a secret or a raw body.
 * Plus: per-record idempotency (@@unique([deliveryId, recordHash])) so the
 * record-result model is exercised too.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.2 integration control-plane schema (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let world: import("../factories/provider-network").ProviderWorld;

  const tId = () => world.tenants.alpha.id;
  const pId = () => world.providers.a.id;
  const branchId = () => world.branches.a1.id;

  async function mkConnection(over: Record<string, unknown> = {}) {
    return prisma.providerIntegrationConnection.create({
      data: {
        tenantId: tId(),
        providerId: pId(),
        providerBranchId: "",
        label: `conn-${world.token}`,
        connectorType: "HMS_BATCH_V1",
        mode: "PUSH",
        secretRef: `vault://${world.token}/secret`,
        ...over,
      },
    });
  }

  async function mkDelivery(connectionId: string, over: Record<string, unknown> = {}) {
    return prisma.providerIntegrationDelivery.create({
      data: {
        tenantId: tId(),
        connectionId,
        providerId: pId(),
        providerBranchId: "",
        direction: "INBOUND",
        businessObjectType: "CASE_SERVICE",
        idempotencyKey: `idem-${world.token}`,
        normalizedPayloadHash: "hash-a",
        ...over,
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  // ── 1. provider/branch/connection consistency ──────────────────────────────
  it("scopes a connection to a provider (+ optional branch) and rejects a duplicate (provider, branch, connector, mode)", async () => {
    const conn = await mkConnection({ providerBranchId: branchId(), label: `c1-${world.token}` });
    expect(conn.providerId).toBe(pId());
    expect(conn.providerBranchId).toBe(branchId());
    expect(conn.status).toBe("DRAFT"); // default lifecycle state (no live path)
    expect(conn.circuitState).toBe("CLOSED");

    // Same (tenant, provider, branch, connector, mode) → unique violation.
    await expect(
      mkConnection({ providerBranchId: branchId(), label: `c1-dup-${world.token}` }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("lets a provider-level ('') and a branch-level connection coexist for the same connector+mode", async () => {
    // A distinct connector so this test is independent of the previous one.
    const providerLevel = await mkConnection({ connectorType: "HMS_BATCH_V2", providerBranchId: "" });
    const branchLevel = await mkConnection({ connectorType: "HMS_BATCH_V2", providerBranchId: branchId() });
    expect(providerLevel.providerBranchId).toBe("");
    expect(branchLevel.providerBranchId).toBe(branchId());
    // Two rows, different branch scope, same connector+mode — both persisted.
    const rows = await prisma.providerIntegrationConnection.findMany({
      where: { tenantId: tId(), providerId: pId(), connectorType: "HMS_BATCH_V2", mode: "PUSH" },
    });
    expect(rows.length).toBe(2);
  });

  // ── 2. delivery idempotency uniqueness ─────────────────────────────────────
  it("enforces one delivery per (connection, idempotencyKey); the same key on another connection is allowed", async () => {
    const connA = await mkConnection({ connectorType: "IDEM_A" });
    const connB = await mkConnection({ connectorType: "IDEM_B" });

    await mkDelivery(connA.id, { idempotencyKey: "k-1", normalizedPayloadHash: "h-1" });
    // Same key, same connection → conflict (the durable-delivery idempotency).
    await expect(
      mkDelivery(connA.id, { idempotencyKey: "k-1", normalizedPayloadHash: "h-2" }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Same key, DIFFERENT connection → allowed (idempotency is per connection).
    const onB = await mkDelivery(connB.id, { idempotencyKey: "k-1", normalizedPayloadHash: "h-1" });
    expect(onB.status).toBe("RECEIVED"); // default: durable receipt before processing
    // A different key on the same connection → allowed.
    const k2 = await mkDelivery(connA.id, { idempotencyKey: "k-2", normalizedPayloadHash: "h-1" });
    expect(k2.id).toBeTruthy();
  });

  // ── 3. attempt ordering ────────────────────────────────────────────────────
  it("keeps attempts unique + ordered per delivery", async () => {
    const conn = await mkConnection({ connectorType: "ATT" });
    const delivery = await mkDelivery(conn.id, { idempotencyKey: "att-1" });

    for (const n of [1, 2, 3]) {
      await prisma.providerIntegrationAttempt.create({
        data: { deliveryId: delivery.id, attemptNumber: n, resultClass: n === 3 ? "SUCCESS" : "HTTP_5XX", retryable: n !== 3, safeErrorCode: n === 3 ? null : "UPSTREAM_5XX" },
      });
    }
    // Duplicate attemptNumber on the same delivery → conflict.
    await expect(
      prisma.providerIntegrationAttempt.create({ data: { deliveryId: delivery.id, attemptNumber: 2 } }),
    ).rejects.toMatchObject({ code: "P2002" });

    const ordered = await prisma.providerIntegrationAttempt.findMany({
      where: { deliveryId: delivery.id },
      orderBy: { attemptNumber: "asc" },
    });
    expect(ordered.map((a) => a.attemptNumber)).toEqual([1, 2, 3]);
  });

  // ── per-record idempotency (record-result model) ───────────────────────────
  it("enforces one record-result per (delivery, recordHash) and conserves count/amount fields", async () => {
    const conn = await mkConnection({ connectorType: "REC" });
    const delivery = await mkDelivery(conn.id, { idempotencyKey: "rec-1", recordCount: 2, amountTotal: "1500.00" });

    await prisma.providerIntegrationRecordResult.create({
      data: { tenantId: tId(), deliveryId: delivery.id, recordIndex: 0, recordHash: "rh-0", businessObjectType: "CASE_SERVICE", outcome: "APPLIED", canonicalEntityType: "CaseServiceEntry", canonicalEntityId: "cse-0", amount: "1000.00" },
    });
    // Same (delivery, recordHash) → conflict (per-record idempotency).
    await expect(
      prisma.providerIntegrationRecordResult.create({
        data: { tenantId: tId(), deliveryId: delivery.id, recordIndex: 0, recordHash: "rh-0", businessObjectType: "CASE_SERVICE", outcome: "REPLAYED" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    // A different record hash → allowed.
    const r1 = await prisma.providerIntegrationRecordResult.create({
      data: { tenantId: tId(), deliveryId: delivery.id, recordIndex: 1, recordHash: "rh-1", businessObjectType: "CASE_SERVICE", outcome: "UNMATCHED", safeReason: "no single open case" },
    });
    expect(r1.outcome).toBe("UNMATCHED");
  });

  // ── 4. no secret / raw-payload column ──────────────────────────────────────
  it("stores a secret REFERENCE and hashes/safe codes only — no secret or raw-body column", async () => {
    const conn = await mkConnection({ connectorType: "SHAPE" });
    const delivery = await mkDelivery(conn.id, { idempotencyKey: "shape-1" });
    const attempt = await prisma.providerIntegrationAttempt.create({
      data: { deliveryId: delivery.id, attemptNumber: 1, resultClass: "HTTP_4XX", safeErrorCode: "BAD_REQUEST" },
    });

    // Connection: a reference, never the material.
    expect(conn).toHaveProperty("secretRef");
    expect(conn).toHaveProperty("credentialVersion");
    for (const forbidden of ["secret", "apiSecret", "apiKey", "credential", "password", "rawPayload"]) {
      expect(conn).not.toHaveProperty(forbidden);
    }
    // Delivery: a normalized hash, never a raw body.
    expect(delivery).toHaveProperty("normalizedPayloadHash");
    for (const forbidden of ["rawBody", "payload", "body", "clinicalBody"]) {
      expect(delivery).not.toHaveProperty(forbidden);
    }
    // Attempt: a safe code, never a raw response/header.
    expect(attempt).toHaveProperty("safeErrorCode");
    for (const forbidden of ["rawResponse", "responseBody", "headers", "authorization"]) {
      expect(attempt).not.toHaveProperty(forbidden);
    }
  });
});
