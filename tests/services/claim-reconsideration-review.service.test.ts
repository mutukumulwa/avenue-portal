/**
 * F5.14 — TPA reconsideration triage + information flow (opt-in DB).
 *
 * Proves: role gating; the triage → assign lifecycle with the separation-of-duty RULE (the
 * original adjudicator can only be assigned with explicit acknowledgment); optimistic
 * version + status guards refuse a stale/out-of-state action; the structured info exchange
 * (request → provider responds → resume) with safe messages + ordered events; and that internal
 * reviewer activity never reaches the provider-safe timeline. NO claim/money write (D13).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.14 ReconsiderationReviewService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewService;
  let ReviewError: typeof import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewError;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let toTimeline: typeof import("@/server/services/claim-reconsideration/policy").toProviderReconsiderationTimeline;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id, allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.claim.reconsider"], apiScopes: [], requestId: "test-req", ...over,
    };
  }
  type Actor = import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewerActor;
  function reviewer(over: Partial<Actor> = {}): Actor {
    return { tenantId: world.tenants.alpha.id, userId: world.users.a.finance.id, role: "CLAIMS_OFFICER", ...over };
  }

  let seq = 0;
  async function seedCase(over: Record<string, unknown> = {}) {
    seq += 1;
    const claim = await world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status: "PARTIALLY_APPROVED" });
    await prisma.claim.update({ where: { id: claim.id }, data: { claimNumber: `CLM-REC-${seq}`, decidedAt: new Date(), adjudicatorId: world.users.a.finance.id } });
    const rc = await prisma.claimReconsideration.create({
      data: {
        tenantId: world.tenants.alpha.id,
        providerId: world.providers.a.id,
        providerBranchId: world.branches.a1.id,
        claimId: claim.id,
        chainRootClaimId: claim.id,
        reasonCode: "UNDERPAID_RATE",
        providerNarrative: "The contracted rate is higher than the allowed amount.",
        requestedAmount: 300,
        currency: claim.currency,
        filingDeadline: new Date(Date.now() + 30 * 86_400_000),
        filedAt: new Date(),
        status: "SUBMITTED",
        // Original adjudicator = finance ⇒ assigning finance triggers the SoD rule.
        originalAdjudicatorId: world.users.a.finance.id,
        dueAt: new Date(Date.now() + 3 * 86_400_000),
        version: 1,
        events: { create: [{ tenantId: world.tenants.alpha.id, sequence: 1, eventType: "SUBMITTED", newStatus: "SUBMITTED", actorType: "USER", actorId: world.users.a.biller.id }] },
        ...over,
      },
      select: { id: true, version: true, claimId: true },
    });
    return { rc, claim };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/claim-reconsideration/review.service");
    Svc = mod.ReconsiderationReviewService;
    ReviewError = mod.ReconsiderationReviewError;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    toTimeline = (await import("@/server/services/claim-reconsideration/policy")).toProviderReconsiderationTimeline;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("gates on the reviewer role and runs triage → assign", async () => {
    const { rc } = await seedCase();
    const forbidden = await Svc.triage(reviewer({ role: "HR_MANAGER" }), rc.id, { expectedVersion: 1 }).catch((e) => e);
    expect(forbidden).toBeInstanceOf(ReviewError);
    expect(forbidden.code).toBe("FORBIDDEN");

    const t = await Svc.triage(reviewer(), rc.id, { expectedVersion: 1 });
    expect(t.status).toBe("TRIAGE");
    expect(t.version).toBe(2);

    // Assign a NON-adjudicator ⇒ no SoD warning, case moves to UNDER_REVIEW.
    const a = await Svc.assign(reviewer(), rc.id, { expectedVersion: 2, reviewerId: world.users.a.biller.id });
    expect(a.status).toBe("UNDER_REVIEW");
    expect(a.sodWarning).toBe(false);
    const row = await prisma.claimReconsideration.findUnique({ where: { id: rc.id } });
    expect(row!.assignedReviewerId).toBe(world.users.a.biller.id);
  });

  it("enforces the separation-of-duty rule on assigning the original adjudicator", async () => {
    const { rc } = await seedCase();
    await Svc.triage(reviewer(), rc.id, { expectedVersion: 1 });
    // Assigning the original adjudicator (finance) without acknowledgment is refused.
    const blocked = await Svc.assign(reviewer(), rc.id, { expectedVersion: 2, reviewerId: world.users.a.finance.id }).catch((e) => e);
    expect(blocked).toBeInstanceOf(ReviewError);
    expect(blocked.code).toBe("INVALID");
    // The case is untouched by the refusal (still TRIAGE @ v2).
    expect((await prisma.claimReconsideration.findUnique({ where: { id: rc.id } }))!.status).toBe("TRIAGE");
    // With explicit acknowledgment it proceeds and flags the warning.
    const ok = await Svc.assign(reviewer(), rc.id, { expectedVersion: 2, reviewerId: world.users.a.finance.id, acknowledgeSelfReview: true });
    expect(ok.sodWarning).toBe(true);
    expect(ok.status).toBe("UNDER_REVIEW");
  });

  it("refuses a stale action (wrong version) and an out-of-state action", async () => {
    const { rc } = await seedCase();
    const stale = await Svc.triage(reviewer(), rc.id, { expectedVersion: 99 }).catch((e) => e);
    expect(stale.code).toBe("STALE");
    // Still SUBMITTED @ v1 — the stale attempt changed nothing.
    expect((await prisma.claimReconsideration.findUnique({ where: { id: rc.id } }))!.version).toBe(1);

    await Svc.triage(reviewer(), rc.id, { expectedVersion: 1 }); // → TRIAGE @ v2
    const invalid = await Svc.triage(reviewer(), rc.id, { expectedVersion: 2 }).catch((e) => e); // triage from TRIAGE
    expect(invalid.code).toBe("INVALID_STATE");
  });

  it("runs the info-request lifecycle: request → provider responds → resume, with ordered safe events", async () => {
    const { rc } = await seedCase();
    await Svc.triage(reviewer(), rc.id, { expectedVersion: 1 });
    const ask = await Svc.requestInformation(reviewer(), rc.id, { expectedVersion: 2, prompt: "Please attach the itemized invoice." });
    expect(ask.status).toBe("INFORMATION_REQUIRED");

    const resp = await Svc.respondToInformation(ctx(), rc.id, { response: "Invoice attached: INV-42." });
    expect(resp.status).toBe("PROVIDER_RESPONDED");

    const resume = await Svc.resumeReview(reviewer(), rc.id, { expectedVersion: resp.version });
    expect(resume.status).toBe("UNDER_REVIEW");

    const events = await prisma.claimReconsiderationEvent.findMany({ where: { reconsiderationId: rc.id }, orderBy: { sequence: "asc" } });
    expect(events.map((e) => e.eventType)).toEqual(["SUBMITTED", "TRIAGED", "INFO_REQUESTED", "PROVIDER_RESPONDED", "UNDER_REVIEW"]);
    expect(events.find((e) => e.eventType === "INFO_REQUESTED")!.message).toBe("Please attach the itemized invoice.");
    const respEv = events.find((e) => e.eventType === "PROVIDER_RESPONDED")!;
    expect(respEv.message).toBe("Invoice attached: INV-42.");
    expect(respEv.actorType).toBe("PROVIDER");
  });

  it("only the owning provider may respond, and only when info is pending", async () => {
    const { rc } = await seedCase();
    // Nothing pending yet (SUBMITTED).
    const notPending = await Svc.respondToInformation(ctx(), rc.id, { response: "here you go" }).catch((e) => e);
    expect(notPending.code).toBe("INVALID_STATE");

    await Svc.triage(reviewer(), rc.id, { expectedVersion: 1 });
    await Svc.requestInformation(reviewer(), rc.id, { expectedVersion: 2, prompt: "Details?" });
    // A different provider is non-enumerating (NOT_FOUND, not FORBIDDEN).
    const bCtx = ctx({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
    const cross = await Svc.respondToInformation(bCtx, rc.id, { response: "..." }).catch((e) => e);
    expect(cross.code).toBe("NOT_FOUND");
    // The reconsider permission is required.
    const noPerm = await Svc.respondToInformation(ctx({ permissions: ["provider.claim.read"] }), rc.id, { response: "..." }).catch((e) => e);
    expect(noPerm).toBeInstanceOf(ProviderAccessError);
  });

  it("keeps internal reviewer activity out of the provider-safe timeline (D13, §9)", async () => {
    const { rc, claim } = await seedCase();
    const claimBefore = await prisma.claim.findUnique({ where: { id: claim.id } });

    await Svc.triage(reviewer(), rc.id, { expectedVersion: 1 });
    await Svc.assign(reviewer(), rc.id, { expectedVersion: 2, reviewerId: world.users.a.biller.id });
    await Svc.requestInformation(reviewer(), rc.id, { expectedVersion: 3, prompt: "Attach the invoice." });
    await Svc.addInternalNote(reviewer(), rc.id, { note: "Suspect upcoding — verify against the fee schedule." });

    const events = await prisma.claimReconsiderationEvent.findMany({ where: { reconsiderationId: rc.id }, orderBy: { sequence: "asc" } });
    const timeline = toTimeline(events);
    const types = timeline.map((t) => t.type);
    expect(types).toContain("SUBMITTED");
    expect(types).toContain("INFO_REQUESTED");
    expect(types).not.toContain("TRIAGED");
    expect(types).not.toContain("ASSIGNED");
    expect(types).not.toContain("INTERNAL_NOTE");
    expect(timeline.find((t) => t.type === "INFO_REQUESTED")!.message).toBe("Attach the invoice.");
    expect(JSON.stringify(timeline)).not.toMatch(/upcoding|fee schedule/i);

    // D13: the disputed claim is untouched by any reviewer step.
    const claimAfter = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(claimAfter!.status).toBe(claimBefore!.status);
    expect(claimAfter!.updatedAt.getTime()).toBe(claimBefore!.updatedAt.getTime());
  });

  it("lists the reviewer queue by SLA urgency and honours filters", async () => {
    const { rc } = await seedCase();
    const all = await Svc.queue(reviewer());
    expect(all.some((r) => r.id === rc.id)).toBe(true);
    // The row carries the internal refs (staff-facing) + a stringified amount.
    const mine = await Svc.queue(reviewer(), { status: "SUBMITTED" });
    const row = mine.find((r) => r.id === rc.id)!;
    expect(row.originalAdjudicatorId).toBe(world.users.a.finance.id);
    expect(row.requestedAmount).toBe("300");
    // Queue is reviewer-gated too.
    const forbidden = await Svc.queue(reviewer({ role: "CUSTOMER_SERVICE" })).catch((e) => e);
    expect(forbidden.code).toBe("FORBIDDEN");
  });
});
