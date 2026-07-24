/**
 * F4.2 — information-request open/cancel service (opt-in DB).
 *
 * open: normalizes items against the catalog, derives the per-PA sequence, creates
 * an OPEN request scoped to the PA's provider/member/client, and appends an
 * INFO_REQUESTED PA event (safe metadata). It rejects empty items, an empty prompt,
 * an unknown PA, and a PA past the pre-decision window. cancel: withdraws a live
 * request → CANCELLED + INFO_REQUEST_CANCELLED event, guarding terminal states.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F4.2 PreauthInfoRequestService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/preauth-info-request/service").PreauthInfoRequestService;
  let InfoRequestError: typeof import("@/server/services/preauth-info-request/service").InfoRequestError;
  let events: typeof import("@/server/services/preauth-intake/events");
  let world: import("../factories/provider-network").ProviderWorld;

  const reviewer = { type: "USER", id: "reviewer-1" };

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/preauth-info-request/service");
    Svc = mod.PreauthInfoRequestService;
    InfoRequestError = mod.InfoRequestError;
    events = await import("@/server/services/preauth-intake/events");
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { await world.teardown(); });

  it("opens a request (seq 1), persists provider/member scope + SLA, and appends INFO_REQUESTED", async () => {
    const pa = await world.createPreauth({ providerId: world.providers.a.id });
    const ir = await Svc.open({
      tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id,
      requestedItems: [" lab_results ", "CLINICAL_NOTES", "lab_results", "bogus"], // normalized
      prompt: "Please attach recent labs and consultation notes.", actor: reviewer,
    });
    expect(ir.status).toBe("OPEN");
    expect(ir.sequence).toBe(1);
    expect(ir.requestedItems).toEqual(["LAB_RESULTS", "CLINICAL_NOTES"]); // de-duped, unknown dropped
    expect(ir.providerId).toBe(world.providers.a.id);
    expect(ir.dueAt).not.toBeNull();

    const evs = await events.listPreauthEvents(pa.id);
    const opened = evs.find((e) => e.eventType === "INFO_REQUESTED");
    expect(opened).toBeTruthy();
    expect((opened!.metadata as { infoRequestId?: string }).infoRequestId).toBe(ir.id);
    // safe metadata only — no prompt text leaked into the event
    expect(JSON.stringify(opened!.metadata)).not.toMatch(/labs|notes/i);
  });

  it("assigns the next sequence per PA", async () => {
    const pa = await world.createPreauth({ providerId: world.providers.a.id });
    const first = await Svc.open({ tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, requestedItems: ["IMAGING_REPORTS"], prompt: "imaging", actor: reviewer });
    const second = await Svc.open({ tenantId: world.tenants.alpha.id, preAuthorizationId: pa.id, requestedItems: ["TREATMENT_PLAN"], prompt: "plan", actor: reviewer });
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
  });

  it("rejects empty items, empty prompt, unknown PA, and a non-pre-decision PA", async () => {
    const pa = await world.createPreauth({ providerId: world.providers.a.id });
    const t = world.tenants.alpha.id;

    const noItems = await Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["nonsense"], prompt: "x", actor: reviewer }).catch((e) => e);
    expect(noItems).toBeInstanceOf(InfoRequestError);
    expect(noItems.code).toBe("NO_ITEMS");

    const noPrompt = await Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["LAB_RESULTS"], prompt: "   ", actor: reviewer }).catch((e) => e);
    expect(noPrompt.code).toBe("NO_PROMPT");

    const noPa = await Svc.open({ tenantId: t, preAuthorizationId: "does-not-exist", requestedItems: ["LAB_RESULTS"], prompt: "x", actor: reviewer }).catch((e) => e);
    expect(noPa.code).toBe("PA_NOT_FOUND");

    await prisma.preAuthorization.update({ where: { id: pa.id }, data: { status: "APPROVED" } });
    const notOpenable = await Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["LAB_RESULTS"], prompt: "x", actor: reviewer }).catch((e) => e);
    expect(notOpenable.code).toBe("PA_NOT_OPENABLE");
  });

  it("cancels a live request → CANCELLED + INFO_REQUEST_CANCELLED, and guards terminal states", async () => {
    const pa = await world.createPreauth({ providerId: world.providers.a.id });
    const t = world.tenants.alpha.id;
    const ir = await Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["LAB_RESULTS"], prompt: "labs", actor: reviewer });

    const cancelled = await Svc.cancel({ tenantId: t, id: ir.id, actor: reviewer, reason: "No longer needed" });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.decidedAt).not.toBeNull();

    const evs = await events.listPreauthEvents(pa.id);
    expect(evs.some((e) => e.eventType === "INFO_REQUEST_CANCELLED")).toBe(true);

    const again = await Svc.cancel({ tenantId: t, id: ir.id, actor: reviewer }).catch((e) => e);
    expect(again).toBeInstanceOf(InfoRequestError);
    expect(again.code).toBe("NOT_CANCELLABLE");

    const missing = await Svc.cancel({ tenantId: t, id: "nope", actor: reviewer }).catch((e) => e);
    expect(missing.code).toBe("NOT_FOUND");
  });

  it("submitResponse: OPEN → RESPONDED + RESPONSE_SUBMITTED, guarding note/provider/state (F4.3)", async () => {
    const pa = await world.createPreauth({ providerId: world.providers.a.id });
    const t = world.tenants.alpha.id;
    const provUser = { type: "USER", id: "prov-user" };
    const ir = await Svc.open({ tenantId: t, preAuthorizationId: pa.id, requestedItems: ["LAB_RESULTS"], prompt: "labs", actor: reviewer });

    const noNote = await Svc.submitResponse({ tenantId: t, id: ir.id, responseNote: "  ", actor: provUser }).catch((e) => e);
    expect(noNote.code).toBe("NO_RESPONSE");

    // another facility (same tenant) cannot respond → non-enumerating NOT_FOUND
    const wrongProv = await Svc.submitResponse({ tenantId: t, id: ir.id, providerId: world.providers.b.id, responseNote: "x", actor: provUser }).catch((e) => e);
    expect(wrongProv.code).toBe("NOT_FOUND");

    const responded = await Svc.submitResponse({ tenantId: t, id: ir.id, providerId: world.providers.a.id, responseNote: "Labs attached in the portal.", actor: provUser });
    expect(responded.status).toBe("RESPONDED");
    expect(responded.responseNote).toBe("Labs attached in the portal.");
    expect(responded.respondedAt).not.toBeNull();

    const evs = await events.listPreauthEvents(pa.id);
    expect(evs.some((e) => e.eventType === "RESPONSE_SUBMITTED")).toBe(true);

    const again = await Svc.submitResponse({ tenantId: t, id: ir.id, providerId: world.providers.a.id, responseNote: "y", actor: provUser }).catch((e) => e);
    expect(again.code).toBe("NOT_RESPONDABLE");
  });

  it("reviewer accept / reopen / close transitions + guards (F4.4)", async () => {
    const t = world.tenants.alpha.id;
    const provUser = { type: "USER", id: "prov-user" };

    // accept: RESPONDED → ACCEPTED (+ RESPONSE_ACCEPTED); accepting before a response is blocked
    const pa1 = await world.createPreauth({ providerId: world.providers.a.id });
    const ir1 = await Svc.open({ tenantId: t, preAuthorizationId: pa1.id, requestedItems: ["LAB_RESULTS"], prompt: "labs", actor: reviewer });
    const early = await Svc.accept({ tenantId: t, id: ir1.id, actor: reviewer }).catch((e) => e);
    expect(early.code).toBe("NOT_ACCEPTABLE");
    await Svc.submitResponse({ tenantId: t, id: ir1.id, providerId: world.providers.a.id, responseNote: "done", actor: provUser });
    const accepted = await Svc.accept({ tenantId: t, id: ir1.id, actor: reviewer, note: "sufficient" });
    expect(accepted.status).toBe("ACCEPTED");
    expect((await events.listPreauthEvents(pa1.id)).some((e) => e.eventType === "RESPONSE_ACCEPTED")).toBe(true);

    // reopen: RESPONDED → REOPENED, then the provider can respond again (REOPENED is respondable)
    const pa2 = await world.createPreauth({ providerId: world.providers.a.id });
    const ir2 = await Svc.open({ tenantId: t, preAuthorizationId: pa2.id, requestedItems: ["IMAGING_REPORTS"], prompt: "imaging", actor: reviewer });
    await Svc.submitResponse({ tenantId: t, id: ir2.id, providerId: world.providers.a.id, responseNote: "v1", actor: provUser });
    const reopened = await Svc.reopen({ tenantId: t, id: ir2.id, actor: reviewer, note: "need more" });
    expect(reopened.status).toBe("REOPENED");
    const resubmitted = await Svc.submitResponse({ tenantId: t, id: ir2.id, providerId: world.providers.a.id, responseNote: "v2", actor: provUser });
    expect(resubmitted.status).toBe("RESPONDED");

    // close: from a live state → CLOSED; re-close blocked
    const pa3 = await world.createPreauth({ providerId: world.providers.a.id });
    const ir3 = await Svc.open({ tenantId: t, preAuthorizationId: pa3.id, requestedItems: ["OTHER"], prompt: "x", actor: reviewer });
    const closed = await Svc.close({ tenantId: t, id: ir3.id, actor: reviewer });
    expect(closed.status).toBe("CLOSED");
    expect((await events.listPreauthEvents(pa3.id)).some((e) => e.eventType === "INFO_REQUEST_CLOSED")).toBe(true);
    const reclose = await Svc.close({ tenantId: t, id: ir3.id, actor: reviewer }).catch((e) => e);
    expect(reclose.code).toBe("NOT_CLOSABLE");
  });
});
