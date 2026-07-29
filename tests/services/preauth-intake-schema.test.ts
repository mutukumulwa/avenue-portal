/**
 * F3.2 — PA intake receipt + event schema.
 *
 * Pure block: safe-metadata validation (no clinical/raw content in events).
 * DB block (opt-in): the idempotency scope is unique, events append in a
 * deterministic order, and a receipt is fully expressible with ids + codes only
 * (no clinical body anywhere).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { assertSafeEventMetadata, UnsafeEventMetadataError } from "@/server/services/preauth-intake/events";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe("F3.2 assertSafeEventMetadata (pure)", () => {
  it("allows ids, codes, counts and short labels", () => {
    expect(() => assertSafeEventMetadata({ preauthId: "pa_1", reasonCode: "DOCS_REQUIRED", count: 2, held: true, ref: null })).not.toThrow();
    expect(() => assertSafeEventMetadata(null)).not.toThrow();
  });

  it("rejects keys that would carry clinical or raw content", () => {
    for (const key of ["notes", "clinicalNotes", "body", "payload", "document", "diagnosisText", "description"]) {
      expect(() => assertSafeEventMetadata({ [key]: "x" }), key).toThrow(UnsafeEventMetadataError);
    }
  });

  it("rejects long free text and nested structures", () => {
    expect(() => assertSafeEventMetadata({ label: "x".repeat(201) })).toThrow(/too long/i);
    expect(() => assertSafeEventMetadata({ nested: { a: 1 } as never })).toThrow(UnsafeEventMetadataError);
    expect(() => assertSafeEventMetadata([1, 2] as never)).toThrow(/flat object/i);
  });
});

describe.skipIf(!URL_SET)("F3.2 receipt + event schema (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let events: typeof import("@/server/services/preauth-intake/events");
  let world: import("../factories/provider-network").ProviderWorld;
  let pa: { id: string };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    events = await import("@/server/services/preauth-intake/events");
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    pa = await world.createPreauth({ providerId: world.providers.a.id });
  });

  afterAll(async () => { if (world) await world.teardown(); });

  it("enforces the idempotency scope (tenant+provider+channel+key) exactly once", async () => {
    const base = {
      tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, channel: "PROVIDER_API",
      idempotencyKey: "idem-1", requestHash: "hash-a", status: "ACCEPTED" as const,
      actorType: "API_KEY", actorId: "key-1",
    };
    await prisma.preauthIntakeReceipt.create({ data: base });
    // same tenant+provider+channel+key → rejected (the caller must get a replay/conflict, never a 2nd row)
    await expect(prisma.preauthIntakeReceipt.create({ data: { ...base, requestHash: "hash-b" } })).rejects.toThrow();
    // a different provider may reuse the same key value
    await expect(prisma.preauthIntakeReceipt.create({ data: { ...base, providerId: world.providers.b.id } })).resolves.toBeTruthy();
    // a different channel is a different command
    await expect(prisma.preauthIntakeReceipt.create({ data: { ...base, channel: "PROVIDER_PORTAL" } })).resolves.toBeTruthy();
  });

  it("a receipt needs no clinical body — ids, codes and status only", async () => {
    const r = await prisma.preauthIntakeReceipt.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, channel: "ADMIN_TRPC",
        idempotencyKey: "idem-no-body", requestHash: "h", status: "REJECTED", failureCode: "MISSING_DIAGNOSES",
        actorType: "USER", actorId: world.users.a.admin.id,
      },
    });
    expect(r.preAuthorizationId).toBeNull(); // a rejected submission creates no PA
    expect(Object.keys(r)).not.toContain("clinicalNotes");
    expect(Object.keys(r)).not.toContain("payload");
  });

  it("events append in order and a duplicate sequence is impossible", async () => {
    await events.appendPreauthEvent({ tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, eventType: "SUBMITTED", newStatus: "SUBMITTED", actorType: "USER", actorId: world.users.a.biller.id });
    await events.appendPreauthEvent({ tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, eventType: "ASSIGNED", actorType: "SYSTEM", metadata: { queue: "clinical" } });
    await events.appendPreauthEvent({ tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, eventType: "APPROVED", priorStatus: "SUBMITTED", newStatus: "APPROVED", safeReasonCode: "AUTO_APPROVED", actorType: "SYSTEM" });

    const timeline = await events.listPreauthEvents(pa.id);
    expect(timeline.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(timeline.map((e) => e.eventType)).toEqual(["SUBMITTED", "ASSIGNED", "APPROVED"]);

    // history cannot be silently reordered/overwritten at an existing sequence
    await expect(prisma.preAuthorizationEvent.create({
      data: { tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, sequence: 2, eventType: "DECLINED", actorType: "SYSTEM" },
    })).rejects.toThrow();
  });

  it("unsafe event metadata is refused before it can be written", async () => {
    await expect(events.appendPreauthEvent({
      tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, eventType: "INFO_REQUESTED",
      actorType: "USER", metadata: { clinicalNotes: "patient history" } as never,
    })).rejects.toThrow(UnsafeEventMetadataError);
  });
});
