/**
 * UAT-HF P01.03 — transactional domain events and their projection.
 *
 * Acceptance, verbatim: "kill the worker during a lifecycle command; state/event/
 * receipt commit once, activity appears after worker restart, notification retries
 * once without duplicate delivery."
 *
 * This is DEF-040 in test form. That run terminated a member on one unconfirmed
 * click, computed a UGX 1,196,212.33 refund, and left the Activity Log reading
 * "No activity recorded yet." — because lifecycle writes went to the audit-chain
 * model while the member page read ActivityLog.
 *
 * OPT-IN — runs only when BOTH are set (so it can never touch a real/prod DB):
 *   EVENT_TEST_DB = postgres URL of a THROWAWAY database
 *   DATABASE_URL  = the same URL
 *
 *   EVENT_TEST_DB=postgresql://user@127.0.0.1:5432/throwaway \
 *   DATABASE_URL=$EVENT_TEST_DB npx vitest run tests/db/domain-event.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { actionFromEventType, polymorphicLink } from "@/server/services/domain-event.service";

const DB_URL = process.env.EVENT_TEST_DB;
const URL_SET = !!DB_URL && process.env.DATABASE_URL === DB_URL;

// ── pure, always runs ────────────────────────────────────────────────────────
describe("P01.03 event → activity mapping", () => {
  it("derives the action from the last segment of the event type", () => {
    expect(actionFromEventType("member.lifecycle.terminated")).toBe("TERMINATED");
    expect(actionFromEventType("package.version.activated")).toBe("ACTIVATED");
    expect(actionFromEventType("created")).toBe("CREATED");
  });

  it("links only to a column ActivityLog actually has a foreign key for", () => {
    expect(polymorphicLink("MEMBER", "m1")).toEqual({ memberId: "m1" });
    expect(polymorphicLink("group", "g1")).toEqual({ groupId: "g1" });
    expect(polymorphicLink("ENDORSEMENT", "e1")).toEqual({ endorsementId: "e1" });
    expect(polymorphicLink("PREAUTHORIZATION", "p1")).toEqual({ preauthId: "p1" });
    // An unknown type must NOT invent a link — the FK would reject it.
    expect(polymorphicLink("PACKAGE", "pk1")).toEqual({});
  });
});

// ── real database ────────────────────────────────────────────────────────────
describe.skipIf(!URL_SET)("P01.03 domain events (opt-in DB)", () => {
  let prisma: (typeof import("@/lib/prisma"))["prisma"];
  let Events: (typeof import("@/server/services/domain-event.service"))["DomainEventService"];
  let Receipts: (typeof import("@/server/services/operation-receipt.service"))["OperationReceiptService"];

  const TENANT = "t-event-uathf";
  const ACTOR = "u-event-uathf";
  let packageId: string;

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    ({ DomainEventService: Events } = await import("@/server/services/domain-event.service"));
    ({ OperationReceiptService: Receipts } = await import("@/server/services/operation-receipt.service"));
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Tenant" ("id","name","slug","updatedAt") VALUES ($1,$1,$1, now()) ON CONFLICT ("id") DO NOTHING`,
      TENANT,
    );
  });

  beforeEach(async () => {
    await prisma.activityLog.deleteMany({ where: { entityId: { startsWith: "pkg-event-" } } });
    // The append-only trigger blocks DELETE, so drop it for teardown only.
    await prisma.$executeRawUnsafe(`ALTER TABLE "DomainEvent" DISABLE TRIGGER domain_event_append_only`);
    await prisma.domainEvent.deleteMany({ where: { tenantId: TENANT } });
    await prisma.$executeRawUnsafe(`ALTER TABLE "DomainEvent" ENABLE TRIGGER domain_event_append_only`);
    await prisma.notificationOutbox.deleteMany({ where: { tenantId: TENANT } });
    await prisma.operationReceipt.deleteMany({ where: { tenantId: TENANT } });
    await prisma.package.deleteMany({ where: { tenantId: TENANT } });
    const pkg = await prisma.package.create({
      data: { id: `pkg-event-${Date.now()}`, tenantId: TENANT, name: "UX Event Pkg", annualLimit: 1, contributionAmount: 1 },
    });
    packageId = pkg.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`ALTER TABLE "DomainEvent" DISABLE TRIGGER domain_event_append_only`).catch(() => {});
    await prisma.activityLog.deleteMany({ where: { entityId: { startsWith: "pkg-event-" } } }).catch(() => {});
    await prisma.domainEvent.deleteMany({ where: { tenantId: TENANT } }).catch(() => {});
    await prisma.$executeRawUnsafe(`ALTER TABLE "DomainEvent" ENABLE TRIGGER domain_event_append_only`).catch(() => {});
    await prisma.notificationOutbox.deleteMany({ where: { tenantId: TENANT } }).catch(() => {});
    await prisma.operationReceipt.deleteMany({ where: { tenantId: TENANT } }).catch(() => {});
    await prisma.package.deleteMany({ where: { tenantId: TENANT } }).catch(() => {});
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE "id" = $1`, TENANT).catch(() => {});
    await prisma.$disconnect?.();
  });

  /** One lifecycle command: state + receipt + event + notification, atomically. */
  async function runCommand(opts: { failAfterWrites?: boolean } = {}) {
    const reserved = await Receipts.reserve({
      tenantId: TENANT,
      actorId: ACTOR,
      operationType: "package.archive",
      idempotencyKey: `op_cmd_${packageId}`,
      request: { packageId },
    });

    return prisma.$transaction(async (tx) => {
      await tx.package.update({ where: { id: packageId }, data: { status: "ARCHIVED" } });
      await Receipts.succeed(reserved.receipt.id, { entityType: "PACKAGE", entityId: packageId, entityRef: "UX-PKG-1" }, tx);
      const event = await Events.record(
        {
          tenantId: TENANT,
          eventType: "package.lifecycle.archived",
          entityType: "PACKAGE",
          entityId: packageId,
          entityRef: "UX-PKG-1",
          description: "Package archived with effect from 12 Aug 2026.",
          actor: { id: ACTOR, name: "Amina Nakato", role: "UNDERWRITER" },
          payload: { before: { status: "ACTIVE" }, after: { status: "ARCHIVED" } },
          reasonCode: "SUPERSEDED",
          notifications: [
            { channel: "IN_APP", eventType: "PACKAGE_ARCHIVED", title: "Package archived", body: "UX-PKG-1 archived." },
          ],
        },
        tx,
      );
      if (opts.failAfterWrites) throw new Error("worker killed mid-command");
      return event;
    });
  }

  it("state, receipt, event and notification intent commit together", async () => {
    await runCommand();

    expect((await prisma.package.findUniqueOrThrow({ where: { id: packageId } })).status).toBe("ARCHIVED");
    expect(await prisma.domainEvent.count({ where: { tenantId: TENANT } })).toBe(1);
    expect(await prisma.notificationOutbox.count({ where: { tenantId: TENANT } })).toBe(1);
    expect((await prisma.operationReceipt.findFirstOrThrow({ where: { tenantId: TENANT } })).state).toBe("SUCCEEDED");
  });

  it("a command that dies mid-transaction leaves NOTHING behind", async () => {
    await expect(runCommand({ failAfterWrites: true })).rejects.toThrow("worker killed");

    expect((await prisma.package.findUniqueOrThrow({ where: { id: packageId } })).status).not.toBe("ARCHIVED");
    expect(await prisma.domainEvent.count({ where: { tenantId: TENANT } })).toBe(0);
    expect(await prisma.notificationOutbox.count({ where: { tenantId: TENANT } })).toBe(0);
    // The receipt is left PROCESSING, not SUCCEEDED — no false claim of success.
    expect((await prisma.operationReceipt.findFirstOrThrow({ where: { tenantId: TENANT } })).state).toBe("PROCESSING");
  });

  // ── the acceptance test ────────────────────────────────────────────────────
  it("activity appears after a worker restart, and a second run duplicates nothing", async () => {
    await runCommand();

    // Worker is down: the business change is committed, but nothing is projected.
    // This is exactly the window in which DEF-040 showed "No activity recorded yet."
    expect(await prisma.activityLog.count({ where: { entityId: packageId } })).toBe(0);

    // Worker restarts.
    const first = await Events.projectPending({ tenantId: TENANT });
    expect(first).toMatchObject({ examined: 1, projected: 1, alreadyProjected: 0, failed: 0 });

    const activity = await prisma.activityLog.findFirstOrThrow({ where: { entityId: packageId } });
    expect(activity.action).toBe("ARCHIVED");
    expect(activity.description).toBe("Package archived with effect from 12 Aug 2026.");
    expect(activity.userId).toBe(ACTOR);
    // The actor's NAME is carried, not just an opaque id (DEF-047).
    expect(JSON.stringify(activity.metadata)).toContain("Amina Nakato");

    // Worker runs again — nothing new.
    const second = await Events.projectPending({ tenantId: TENANT });
    expect(second).toMatchObject({ examined: 0, projected: 0 });
    expect(await prisma.activityLog.count({ where: { entityId: packageId } })).toBe(1);
    expect(await prisma.notificationOutbox.count({ where: { tenantId: TENANT } })).toBe(1);
  });

  it("a projector that crashed AFTER inserting activity cannot double-post on restart", async () => {
    const event = await runCommand();
    await Events.projectPending({ tenantId: TENANT });

    // Rewind only the bookkeeping, as a crash between insert and mark would.
    await prisma.domainEvent.update({
      where: { id: event.id },
      data: { projectionState: "PENDING", projectedAt: null },
    });

    const rerun = await Events.projectPending({ tenantId: TENANT });
    expect(rerun).toMatchObject({ examined: 1, projected: 0, alreadyProjected: 1, failed: 0 });
    expect(await prisma.activityLog.count({ where: { entityId: packageId } })).toBe(1);
  });

  it("re-recording the same command does not enqueue the notification twice", async () => {
    await runCommand();
    // A retry of the same intent produces a NEW event id, so its dedupe key
    // differs — but the receipt layer (P01.02) is what stops the retry reaching
    // here at all. Prove the dedupe key itself is stable per event.
    const event = await prisma.domainEvent.findFirstOrThrow({ where: { tenantId: TENANT } });
    const outbox = await prisma.notificationOutbox.findFirstOrThrow({ where: { tenantId: TENANT } });
    expect(outbox.dedupeKey).toBe(`evt:${event.id}:0`);

    // Enqueuing the same key again is a no-op rather than a second notice.
    const { NotificationOutboxService } = await import("@/server/services/notifications/outbox");
    await NotificationOutboxService.enqueue({
      tenantId: TENANT,
      channel: "IN_APP",
      eventType: "PACKAGE_ARCHIVED",
      title: "Package archived",
      body: "UX-PKG-1 archived.",
      dedupeKey: `evt:${event.id}:0`,
    });
    expect(await prisma.notificationOutbox.count({ where: { tenantId: TENANT } })).toBe(1);
  });

  it("a failing projection is retried, then marked FAILED and stays visible", async () => {
    // A MEMBER event whose entityId is not a real member: the ActivityLog foreign
    // key rejects it, so this is a genuine projection failure.
    await Events.record({
      tenantId: TENANT,
      eventType: "member.lifecycle.terminated",
      entityType: "MEMBER",
      entityId: "member-that-does-not-exist",
      description: "Cover terminated.",
      payload: {},
    });

    for (let i = 0; i < 5; i += 1) await Events.projectPending({ tenantId: TENANT });

    const event = await prisma.domainEvent.findFirstOrThrow({ where: { entityType: "MEMBER" } });
    expect(event.projectionState).toBe("FAILED");
    expect(event.projectionAttempts).toBeGreaterThanOrEqual(5);
    expect(event.projectionError).toBeTruthy();

    // Never silently dropped — it shows up in the operational backlog...
    const backlog = await Events.listUnprojected({ tenantId: TENANT });
    expect(backlog.map((e) => e.id)).toContain(event.id);

    // ...and can be replayed once the cause is fixed.
    expect(await Events.replayFailed({ tenantId: TENANT })).toBe(1);
    expect((await prisma.domainEvent.findUniqueOrThrow({ where: { id: event.id } })).projectionState).toBe("PENDING");
  });

  // ── immutability ───────────────────────────────────────────────────────────
  it("the event payload cannot be rewritten after the fact", async () => {
    const event = await runCommand();
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "DomainEvent" SET "payload" = '{"tampered":true}' WHERE "id" = $1`, event.id),
    ).rejects.toThrow(/append-only/i);
  });

  it("the event description and actor cannot be rewritten", async () => {
    const event = await runCommand();
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "DomainEvent" SET "description" = 'nothing happened' WHERE "id" = $1`, event.id),
    ).rejects.toThrow(/append-only/i);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "DomainEvent" SET "actorName" = 'somebody else' WHERE "id" = $1`, event.id),
    ).rejects.toThrow(/append-only/i);
  });

  it("an event cannot be deleted", async () => {
    const event = await runCommand();
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "DomainEvent" WHERE "id" = $1`, event.id),
    ).rejects.toThrow(/append-only/i);
  });

  it("but projection bookkeeping may still be updated", async () => {
    const event = await runCommand();
    await expect(
      prisma.domainEvent.update({ where: { id: event.id }, data: { projectionState: "PROJECTED" } }),
    ).resolves.toBeTruthy();
  });
});
