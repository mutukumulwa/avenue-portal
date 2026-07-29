/**
 * F4.8 — notification outbox + dispatcher (opt-in DB).
 *
 * enqueue writes PENDING (idempotent on dedupeKey). dispatch drains: IN_APP → SENT
 * immediately; EMAIL with NO port → SKIPPED ("email delivery not provisioned");
 * EMAIL WITH a delivering port → SENT. listProviderNotifications surfaces the
 * provider's SENT in-app rows; markRead is provider-scoped.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.8 NotificationOutboxService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/notifications/outbox").NotificationOutboxService;
  const tenantId = "t-f48";
  const providerId = "prov-f48";

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/notifications/outbox")).NotificationOutboxService;
  });
  beforeEach(async () => { await prisma.notificationOutbox.deleteMany({ where: { tenantId } }); });
  afterAll(async () => { await prisma.notificationOutbox.deleteMany({ where: { tenantId } }); });

  const base = { tenantId, providerId, eventType: "INFO_REQUESTED", title: "Info requested", body: "Please respond." };

  it("enqueue writes PENDING and is idempotent on dedupeKey", async () => {
    const a = await Svc.enqueue({ ...base, channel: "IN_APP", dedupeKey: "dk-1" });
    expect(a.status).toBe("PENDING");
    const b = await Svc.enqueue({ ...base, channel: "IN_APP", dedupeKey: "dk-1" });
    expect(b.id).toBe(a.id); // same row — no duplicate
    const count = await prisma.notificationOutbox.count({ where: { tenantId, dedupeKey: "dk-1" } });
    expect(count).toBe(1);
  });

  it("dispatch: IN_APP → SENT; EMAIL without a port → SKIPPED (not provisioned)", async () => {
    const inApp = await Svc.enqueue({ ...base, channel: "IN_APP" });
    const email = await Svc.enqueue({ ...base, channel: "EMAIL" });
    const summary = await Svc.dispatch({ tenantId });
    expect(summary.processed).toBeGreaterThanOrEqual(2);
    const a = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: inApp.id } });
    const e = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: email.id } });
    expect(a.status).toBe("SENT");
    expect(a.dispatchedAt).not.toBeNull();
    expect(e.status).toBe("SKIPPED");
    expect(e.failureReason).toMatch(/not provisioned/i);
  });

  it("dispatch: EMAIL with a delivering port → SENT", async () => {
    const email = await Svc.enqueue({ ...base, channel: "EMAIL" });
    await Svc.dispatch({ tenantId }, { deliverEmail: async () => ({ delivered: true }) });
    const e = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: email.id } });
    expect(e.status).toBe("SENT");
  });

  it("listProviderNotifications surfaces SENT in-app rows; unreadOnly + markRead are provider-scoped", async () => {
    const n = await Svc.enqueue({ ...base, channel: "IN_APP" });
    await Svc.dispatch({ tenantId });

    const unread = await Svc.listProviderNotifications({ tenantId, providerId, unreadOnly: true });
    expect(unread.map((r) => r.id)).toContain(n.id);

    // a different facility sees none
    const other = await Svc.listProviderNotifications({ tenantId, providerId: "prov-other" });
    expect(other.map((r) => r.id)).not.toContain(n.id);

    // cross-provider markRead does nothing; own markRead succeeds and clears it from unread
    expect(await Svc.markRead({ tenantId, providerId: "prov-other", id: n.id })).toBe(false);
    expect(await Svc.markRead({ tenantId, providerId, id: n.id })).toBe(true);
    const unreadAfter = await Svc.listProviderNotifications({ tenantId, providerId, unreadOnly: true });
    expect(unreadAfter.map((r) => r.id)).not.toContain(n.id);
  });
});
