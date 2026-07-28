/**
 * F9.6 — retry, poison quarantine, sweeper (opt-in DB + a pure backoff block).
 *
 * Covers: exponential backoff; durable lease with crash-expiry (a stale lease is
 * reclaimed); an attempt records + backs off, exhausts to QUARANTINED at the
 * ceiling; a fatal/poison attempt quarantines immediately; the sweeper quarantines
 * exhausted deliveries and surfaces the rest as retry-due; and an authorized manual
 * retry re-drives idempotently (no duplicate canonical effect).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { IntegrationDeliveryStatus } from "@prisma/client";
import { backoffMs } from "@/server/services/provider-integration/delivery-retry.service";

describe("F9.6 backoff (pure)", () => {
  it("is deterministic exponential, capped at 1h", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(100)).toBe(3_600_000); // cap
  });
});

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F9.6 retry/quarantine/sweeper (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Retry: typeof import("@/server/services/provider-integration/delivery-retry.service").DeliveryRetryService;
  let Admin: typeof import("@/server/services/provider-integration/connection-admin.service").ProviderIntegrationConnectionAdmin;
  let Inbound: typeof import("@/server/services/provider-integration/inbound-delivery.service").InboundDeliveryService;
  let Processor: typeof import("@/server/services/provider-integration/delivery-processor.service").CaseServiceDeliveryProcessor;
  let world: import("../factories/provider-network").ProviderWorld;

  const NOW = new Date("2026-07-28T12:00:00.000Z");
  const CASE_NO = "CASE-F96-1";
  const testCaseIds: string[] = [];
  let bareConnId = "";
  let seq = 0;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  const ctx = (over: Partial<Ctx> = {}): Ctx => ({
    actorType: "USER", actorId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id,
    allowedProviderBranchIds: [world.branches.a1.id], permissions: ["provider.integrations.manage"], apiScopes: [], requestId: "req", ...over,
  });

  const get = (id: string) => prisma.providerIntegrationDelivery.findUniqueOrThrow({ where: { id } });

  async function mkDelivery(over: Partial<{ status: IntegrationDeliveryStatus; attemptCount: number; maxAttempts: number; nextAttemptAt: Date | null }> = {}) {
    return prisma.providerIntegrationDelivery.create({
      data: {
        tenantId: world.tenants.alpha.id, connectionId: bareConnId, providerId: world.providers.a.id, providerBranchId: "",
        direction: "INBOUND", businessObjectType: "CASE_SERVICE", idempotencyKey: `retry-${++seq}`, normalizedPayloadHash: `h-${seq}`,
        status: over.status ?? "ACCEPTED", attemptCount: over.attemptCount ?? 0, maxAttempts: over.maxAttempts ?? 5,
        nextAttemptAt: over.nextAttemptAt === undefined ? NOW : over.nextAttemptAt,
      },
    });
  }

  async function activeConnection() {
    const c = await Admin.create(ctx(), { label: `r${++seq}`, connectorType: `RTY_${seq}`, mode: "PUSH", scopes: ["CASE_SERVICE"] });
    const { plaintext } = await Admin.rotateSecret(ctx(), c.id);
    await Admin.test(ctx(), c.id);
    await Admin.activate(ctx(), c.id);
    return { connectionId: c.id, secret: plaintext };
  }

  const entriesForDelivery = (deliveryId: string) => prisma.caseServiceEntry.count({ where: { hmsBatchRef: { startsWith: `${deliveryId}#` } } });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Retry = (await import("@/server/services/provider-integration/delivery-retry.service")).DeliveryRetryService;
    Admin = (await import("@/server/services/provider-integration/connection-admin.service")).ProviderIntegrationConnectionAdmin;
    Inbound = (await import("@/server/services/provider-integration/inbound-delivery.service")).InboundDeliveryService;
    Processor = (await import("@/server/services/provider-integration/delivery-processor.service")).CaseServiceDeliveryProcessor;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
    const conn = await prisma.providerIntegrationConnection.create({
      data: { tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, providerBranchId: "", label: "bare", connectorType: "BARE", status: "ACTIVE" },
    });
    bareConnId = conn.id;
    const c = await prisma.clinicalCase.create({
      data: {
        tenantId: world.tenants.alpha.id, caseNumber: CASE_NO, memberId: world.members.alpha.id, providerId: world.providers.a.id,
        caseType: "INPATIENT_ADMISSION", benefitCategory: "INPATIENT", status: "OPEN", admissionDate: new Date("2026-07-01T00:00:00Z"),
        openedById: world.users.a.admin.id, currency: "UGX",
      },
    });
    testCaseIds.push(c.id);
  });
  afterAll(async () => {
    await prisma.caseServiceEntry.deleteMany({ where: { caseId: { in: testCaseIds } } });
    await prisma.clinicalCase.deleteMany({ where: { id: { in: testCaseIds } } });
    if (world) await world.teardown();
  });

  it("leases durably and reclaims a crashed worker's expired lease", async () => {
    const d = await mkDelivery();
    expect(await Retry.acquireLease(d.id, "w1", 60_000, NOW)).toBe(true);
    expect(await Retry.acquireLease(d.id, "w2", 60_000, NOW)).toBe(false); // held by a live worker
    const later = new Date(NOW.getTime() + 120_000); // w1 "crashed" — lease expired
    expect(await Retry.acquireLease(d.id, "w2", 60_000, later)).toBe(true);
    await Retry.releaseLease(d.id, "w2");
  });

  it("skips when another live worker holds the lease", async () => {
    const d = await mkDelivery();
    await Retry.acquireLease(d.id, "other", 300_000, NOW);
    const r = await Retry.runAttempt(d.id, async () => ({ kind: "done" }), { now: NOW });
    expect(r.status).toBe("skipped");
  });

  it("records a retryable attempt and backs off", async () => {
    const d = await mkDelivery({ maxAttempts: 5 });
    const r = await Retry.runAttempt(d.id, async () => ({ kind: "retry", resultClass: "HTTP_5XX" }), { now: NOW });
    expect(r.status).toBe("retrying");
    const row = await get(d.id);
    expect(row.status).toBe("RETRYING");
    expect(row.attemptCount).toBe(1);
    expect(row.nextAttemptAt).toEqual(new Date(NOW.getTime() + 30_000));
    expect(row.leaseOwner).toBeNull(); // lease released
    const attempts = await prisma.providerIntegrationAttempt.findMany({ where: { deliveryId: d.id } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attemptNumber: 1, retryable: true, resultClass: "HTTP_5XX" });
  });

  it("quarantines when retry attempts are exhausted", async () => {
    const d = await mkDelivery({ maxAttempts: 3 });
    for (let i = 0; i < 3; i++) {
      await Retry.runAttempt(d.id, async () => ({ kind: "retry" }), { now: new Date(NOW.getTime() + i * 1000) });
    }
    const row = await get(d.id);
    expect(row.status).toBe("QUARANTINED");
    expect(row.attemptCount).toBe(3);
    expect(row.quarantineReason).toContain("exhausted");
    expect(await prisma.providerIntegrationAttempt.count({ where: { deliveryId: d.id } })).toBe(3);
  });

  it("quarantines a fatal/poison attempt immediately", async () => {
    const d = await mkDelivery({ maxAttempts: 5 });
    const r = await Retry.runAttempt(d.id, async () => ({ kind: "fatal", resultClass: "SCHEMA", reason: "bad schema" }), { now: NOW });
    expect(r.status).toBe("quarantined");
    const row = await get(d.id);
    expect(row.status).toBe("QUARANTINED");
    expect(row.attemptCount).toBe(1);
  });

  it("sweeps: quarantines exhausted deliveries, surfaces the rest as retry-due", async () => {
    const exhausted = await mkDelivery({ status: "RETRYING", attemptCount: 5, maxAttempts: 5, nextAttemptAt: new Date(NOW.getTime() - 1000) });
    const retryDue = await mkDelivery({ status: "RETRYING", attemptCount: 1, maxAttempts: 5, nextAttemptAt: new Date(NOW.getTime() - 1000) });
    const notDue = await mkDelivery({ status: "RETRYING", attemptCount: 1, maxAttempts: 5, nextAttemptAt: new Date(NOW.getTime() + 100_000) });

    const res = await Retry.sweep({ now: NOW });
    expect(res.quarantined).toBeGreaterThanOrEqual(1);
    expect((await get(exhausted.id)).status).toBe("QUARANTINED");
    expect((await get(retryDue.id)).status).toBe("RETRYING"); // surfaced, not mutated (needs a re-supplied body)
    expect((await get(notDue.id)).status).toBe("RETRYING");
  });

  it("manual retry re-drives idempotently — no duplicate canonical effect", async () => {
    const { connectionId, secret } = await activeConnection();
    const rawBody = JSON.stringify({ entries: [{ caseNumber: CASE_NO, entryDate: "2026-07-03", description: "Retry svc", unitAmount: 2000 }] });
    const receipt = await Inbound.receive(
      { connectionId, presentedSecret: secret, timestamp: NOW.toISOString(), idempotencyKey: "mr-1", businessObjectType: "CASE_SERVICE", rawBody, contentType: "application/json" },
      { now: NOW },
    );
    await Processor.process(receipt.deliveryId, rawBody);
    expect(await entriesForDelivery(receipt.deliveryId)).toBe(1);

    // Simulate a stuck delivery that ops remediates and retries.
    await prisma.providerIntegrationDelivery.update({ where: { id: receipt.deliveryId }, data: { status: "QUARANTINED", quarantineReason: "manual test" } });
    const out = await Retry.manualRetry(ctx(), receipt.deliveryId, rawBody, { now: NOW });
    expect(out.status).toBe("done");
    expect(await entriesForDelivery(receipt.deliveryId)).toBe(1); // replayed — not duplicated

    // A foreign provider cannot retry it.
    await expect(Retry.manualRetry(ctx({ providerId: world.providers.b.id }), receipt.deliveryId, rawBody, { now: NOW })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
