/**
 * F4.10 — info-request SLA sweeper + operational queue (opt-in DB).
 *
 * sweepOverdueInfoRequests reminds (via the outbox) every awaiting-provider request
 * past due, deduped per request per day; it skips not-yet-due and RESPONDED (not
 * awaiting the provider) requests. overdueInfoRequests is the matching scoped queue.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.10 PreauthInfoRequestSweeper (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Sweeper: typeof import("@/server/services/preauth-info-request/sweeper").PreauthInfoRequestSweeper;
  let Svc: typeof import("@/server/services/preauth-info-request/service").PreauthInfoRequestService;
  let world: import("../factories/provider-network").ProviderWorld;
  const reviewer = { type: "USER", id: "reviewer-1" };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Sweeper = (await import("@/server/services/preauth-info-request/sweeper")).PreauthInfoRequestSweeper;
    Svc = (await import("@/server/services/preauth-info-request/service")).PreauthInfoRequestService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => { await world.teardown(); });

  it("reminds overdue awaiting-provider requests (deduped), skips not-due + responded; queue matches", async () => {
    const t = world.tenants.alpha.id;
    const providerId = world.providers.a.id;
    const open = async (dueInHours: number) => {
      const pa = await world.createPreauth({ providerId });
      return Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["LAB_RESULTS"], prompt: "labs", actor: reviewer, dueInHours });
    };
    const overdue = await open(-1);
    const notDue = await open(48);
    const respondedOverdue = await open(-1);
    await Svc.submitResponse({ tenantId: t, id: respondedOverdue.id, providerId, responseNote: "done", actor: { type: "USER", id: "prov-user" } });

    const res = await Sweeper.sweepOverdueInfoRequests({ tenantId: t });
    expect(res.overdue).toBeGreaterThanOrEqual(1);

    const reminder = (irId: string) =>
      prisma.notificationOutbox.findFirst({ where: { tenantId: t, providerId, eventType: "INFO_REQUEST_OVERDUE", metadata: { path: ["infoRequestId"], equals: irId } } });
    expect(await reminder(overdue.id)).toBeTruthy();
    expect(await reminder(notDue.id)).toBeNull(); // not due yet
    expect(await reminder(respondedOverdue.id)).toBeNull(); // RESPONDED ⇒ not awaiting provider

    // idempotent within the day — re-sweep does not duplicate the reminder
    await Sweeper.sweepOverdueInfoRequests({ tenantId: t });
    const count = await prisma.notificationOutbox.count({ where: { tenantId: t, eventType: "INFO_REQUEST_OVERDUE", metadata: { path: ["infoRequestId"], equals: overdue.id } } });
    expect(count).toBe(1);

    // operational queue read
    const queue = await Sweeper.overdueInfoRequests({ tenantId: t, providerId });
    const qids = queue.map((q) => q.id);
    expect(qids).toContain(overdue.id);
    expect(qids).not.toContain(notDue.id);
    expect(qids).not.toContain(respondedOverdue.id);
  });
});
