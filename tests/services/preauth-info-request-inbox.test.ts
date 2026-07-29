/**
 * F4.6 — canonical provider inbox projection (opt-in DB).
 *
 * Default view = requests AWAITING THE PROVIDER (OPEN/REOPENED), joined with PA +
 * member context, ordered by SLA urgency (dueAt asc), with an overdue flag; scoped
 * to the provider's own facility; RESPONDED excluded by default but reachable via a
 * widened status set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.6 providerInboxProjection (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/preauth-info-request/service").PreauthInfoRequestService;
  let projection: typeof import("@/server/services/preauth-info-request/inbox").providerInboxProjection;
  let world: import("../factories/provider-network").ProviderWorld;
  const reviewer = { type: "USER", id: "reviewer-1" };
  const provUser = { type: "USER", id: "prov-user" };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/preauth-info-request/service")).PreauthInfoRequestService;
    projection = (await import("@/server/services/preauth-info-request/inbox")).providerInboxProjection;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => { await world.teardown(); });

  it("projects awaiting-provider items with PA/member context, SLA order + overdue; scoped; RESPONDED excluded by default", async () => {
    const t = world.tenants.alpha.id;
    const openFor = async (dueInHours: number) => {
      const pa = await world.createPreauth({ providerId: world.providers.a.id });
      const ir = await Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["LAB_RESULTS"], prompt: "labs", actor: reviewer, dueInHours });
      return { pa, ir };
    };

    const soon = await openFor(48);
    const overdue = await openFor(-1); // dueAt in the past
    // a REOPENED item (awaiting provider again)
    const rp = await openFor(72);
    await Svc.submitResponse({ tenantId: t, id: rp.ir.id, providerId: world.providers.a.id, responseNote: "v1", actor: provUser });
    await Svc.reopen({ tenantId: t, id: rp.ir.id, actor: reviewer });
    // a RESPONDED item (NOT awaiting the provider → excluded by default)
    const responded = await openFor(60);
    await Svc.submitResponse({ tenantId: t, id: responded.ir.id, providerId: world.providers.a.id, responseNote: "done", actor: provUser });

    const inbox = await projection({ tenantId: t, providerId: world.providers.a.id });
    const ids = inbox.map((i) => i.infoRequestId);
    expect(ids).toEqual(expect.arrayContaining([soon.ir.id, overdue.ir.id, rp.ir.id]));
    expect(ids).not.toContain(responded.ir.id);

    // SLA order: the overdue (past dueAt) sorts before the 48h one
    expect(ids.indexOf(overdue.ir.id)).toBeLessThan(ids.indexOf(soon.ir.id));
    // overdue flag + PA/member context populated
    const overdueItem = inbox.find((i) => i.infoRequestId === overdue.ir.id)!;
    expect(overdueItem.overdue).toBe(true);
    expect(overdueItem.preauthNumber).toBe(overdue.pa.preauthNumber);
    expect(overdueItem.memberNumber.length).toBeGreaterThan(0);
    expect(inbox.find((i) => i.infoRequestId === soon.ir.id)!.overdue).toBe(false);

    // another facility sees none of provider A's inbox
    const otherInbox = await projection({ tenantId: t, providerId: world.providers.b.id });
    expect(otherInbox.map((i) => i.infoRequestId)).not.toContain(soon.ir.id);

    // widening the status set surfaces RESPONDED
    const respondedView = await projection({ tenantId: t, providerId: world.providers.a.id, statuses: ["RESPONDED"] });
    expect(respondedView.map((i) => i.infoRequestId)).toContain(responded.ir.id);
  });
});
