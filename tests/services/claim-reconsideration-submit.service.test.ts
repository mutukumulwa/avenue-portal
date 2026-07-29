/**
 * F5.12 — reconsideration eligibility + submit (opt-in DB).
 *
 * Proves: a provider files ONE governed reconsideration on a decided claim (full/partial/
 * declined/paid) with an eligible reason, an exact frozen line snapshot, a first event, and
 * a filing deadline — leaving the original claim row/benefit/fund UNTOUCHED (D13); wrong
 * state/reason/line/expired are refused; the submit is idempotent on the key and refuses a
 * second active case; checkEligibility gates the F5.13 form safely.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.12 ClaimReconsiderationService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-reconsideration/submit.service").ClaimReconsiderationService;
  let ReconsiderationSubmitError: typeof import("@/server/services/claim-reconsideration/submit.service").ReconsiderationSubmitError;
  let ProviderAccessError: typeof import("@/server/services/provider-access.service").ProviderAccessError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id, allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.claim.reconsider"], apiScopes: [], requestId: "test-req", ...over,
    };
  }

  let keySeq = 0;
  function cmd(claimId: string, over: Partial<import("@/server/services/claim-reconsideration/submit.service").SubmitReconsiderationCommand> = {}) {
    keySeq += 1;
    return {
      tenantId: world.tenants.alpha.id, claimId, idempotencyKey: `rec-${keySeq}-${claimId.slice(0, 8)}`,
      reasonCode: "OTHER", providerNarrative: "This decision should be reconsidered.", requestedAmount: 300,
      lines: [] as Array<{ claimLineId: string; requestedAllowed?: number }>,
      ...over,
    };
  }

  async function decidedClaimWithLine(
    status: string,
    over: Record<string, unknown> = {},
    amt: { billed?: number; approved?: number; payable?: number; member?: number; writeoff?: number } = {},
  ) {
    const c = await world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status });
    await prisma.claim.update({ where: { id: c.id }, data: { decidedAt: new Date(), adjudicatorId: world.users.a.finance.id, ...over } });
    const line = await prisma.claimLine.create({
      data: {
        claimId: c.id, lineNumber: 1, serviceCategory: "CONSULTATION", description: "Office visit",
        quantity: 1, unitCost: amt.billed ?? 1000, billedAmount: amt.billed ?? 1000,
        approvedAmount: amt.approved ?? 0, payerLiability: amt.payable ?? 0, memberLiability: amt.member ?? 0, providerWriteOff: amt.writeoff ?? 0,
      },
    });
    return { claim: c, line };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/claim-reconsideration/submit.service");
    Svc = mod.ClaimReconsiderationService;
    ReconsiderationSubmitError = mod.ReconsiderationSubmitError;
    ProviderAccessError = (await import("@/server/services/provider-access.service")).ProviderAccessError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("files a case, snapshots line facts exactly, and leaves the claim/benefit/fund untouched (D13)", async () => {
    const { claim, line } = await decidedClaimWithLine("PARTIALLY_APPROVED", {}, { billed: 1000, approved: 600, payable: 600, member: 0, writeoff: 400 });
    const before = await prisma.claim.findUnique({ where: { id: claim.id } });
    const usageBefore = await prisma.benefitUsage.count({ where: { memberId: world.members.alpha.id } });

    const res = await Svc.submit(ctx(), cmd(claim.id, { reasonCode: "UNDERPAID_RATE", requestedAmount: 300, lines: [{ claimLineId: line.id, requestedAllowed: 900 }] }));
    expect(res.replayed).toBe(false);
    expect(res.status).toBe("SUBMITTED");
    expect(res.filingDeadline).toBeInstanceOf(Date);

    const rec = await prisma.claimReconsideration.findUnique({ where: { id: res.reconsiderationId }, include: { lines: true, events: true } });
    expect(rec!.status).toBe("SUBMITTED");
    expect(rec!.claimId).toBe(claim.id);
    expect(rec!.reasonCode).toBe("UNDERPAID_RATE");
    expect(Number(rec!.requestedAmount)).toBe(300);
    expect(rec!.currency).toBe(claim.currency); // provider/currency consistency (derived from the claim)
    expect(rec!.originalAdjudicatorId).toBe(world.users.a.finance.id); // SoD reference frozen
    // exact snapshot
    expect(rec!.lines.length).toBe(1);
    expect(Number(rec!.lines[0].originalBilled)).toBe(1000);
    expect(Number(rec!.lines[0].originalAllowed)).toBe(600);
    expect(Number(rec!.lines[0].originalPayable)).toBe(600);
    expect(Number(rec!.lines[0].originalWriteoff)).toBe(400);
    expect(Number(rec!.lines[0].requestedAllowed)).toBe(900);
    expect(Number(rec!.lines[0].alreadyApproved)).toBe(600);
    expect(Number(rec!.lines[0].maxIncrement)).toBe(0); // reviewer sets it later (F5.15)
    // first event
    expect(rec!.events.length).toBe(1);
    expect(rec!.events[0].eventType).toBe("SUBMITTED");
    expect(rec!.events[0].sequence).toBe(1);

    // D13: the claim + benefit + fund are UNTOUCHED (no claim write anywhere)
    const after = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(after!.status).toBe(before!.status);
    expect(Number(after!.approvedAmount)).toBe(Number(before!.approvedAmount));
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    expect(await prisma.benefitUsage.count({ where: { memberId: world.members.alpha.id } })).toBe(usageBefore);
    expect(await prisma.fundTransaction.count({ where: { claimId: claim.id } })).toBe(0);
  });

  it("allows a reconsideration on every decided state (full/partial/declined/paid)", async () => {
    for (const status of ["DECLINED", "PARTIALLY_APPROVED", "APPROVED", "PAID"]) {
      const { claim, line } = await decidedClaimWithLine(status);
      const res = await Svc.submit(ctx(), cmd(claim.id, { reasonCode: "OTHER", lines: [{ claimLineId: line.id }] }));
      expect(res.status, status).toBe("SUBMITTED");
    }
  });

  it("refuses a pre-decision claim (NOT_RECONSIDERABLE)", async () => {
    const { claim, line } = await decidedClaimWithLine("RECEIVED");
    const err = await Svc.submit(ctx(), cmd(claim.id, { lines: [{ claimLineId: line.id }] })).catch((e) => e);
    expect(err).toBeInstanceOf(ReconsiderationSubmitError);
    expect(err.code).toBe("NOT_RECONSIDERABLE");
  });

  it("refuses a reason that does not apply, a line not in the claim, and an expired window", async () => {
    const paid = await decidedClaimWithLine("PAID");
    expect((await Svc.submit(ctx(), cmd(paid.claim.id, { reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: paid.line.id }] })).catch((e) => e)).code).toBe("REASON_NOT_ELIGIBLE");

    const declined = await decidedClaimWithLine("DECLINED");
    expect((await Svc.submit(ctx(), cmd(declined.claim.id, { reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: "not-a-line" }] })).catch((e) => e)).code).toBe("LINE_NOT_IN_CLAIM");

    const expired = await decidedClaimWithLine("DECLINED", { decidedAt: new Date(Date.now() - 100 * 86_400_000) });
    expect((await Svc.submit(ctx(), cmd(expired.claim.id, { reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: expired.line.id }] })).catch((e) => e)).code).toBe("DEADLINE_PASSED");
  });

  it("is idempotent on the key and refuses a second active reconsideration", async () => {
    const { claim, line } = await decidedClaimWithLine("DECLINED");
    const key = `dup-${keySeq}-${claim.id.slice(0, 6)}`;
    const first = await Svc.submit(ctx(), cmd(claim.id, { idempotencyKey: key, reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: line.id }] }));
    const replay = await Svc.submit(ctx(), cmd(claim.id, { idempotencyKey: key, reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: line.id }] }));
    expect(replay.replayed).toBe(true);
    expect(replay.reconsiderationId).toBe(first.reconsiderationId);
    expect(await prisma.claimReconsideration.count({ where: { claimId: claim.id } })).toBe(1);

    const dup = await Svc.submit(ctx(), cmd(claim.id, { idempotencyKey: "brand-new-key", reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: line.id }] })).catch((e) => e);
    expect(dup).toBeInstanceOf(ReconsiderationSubmitError);
    expect(dup.code).toBe("ALREADY_ACTIVE");
    expect(await prisma.claimReconsideration.count({ where: { claimId: claim.id } })).toBe(1);
  });

  it("submit requires the reconsider permission", async () => {
    const { claim, line } = await decidedClaimWithLine("DECLINED");
    const err = await Svc.submit(ctx({ permissions: ["provider.claim.read"] }), cmd(claim.id, { reasonCode: "INCORRECT_DECLINE", lines: [{ claimLineId: line.id }] })).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderAccessError);
    expect(err.code).toBe("FORBIDDEN_PERMISSION");
  });

  it("checkEligibility gates the form (eligible / wrong-reason / cross-provider / no-permission)", async () => {
    const { claim } = await decidedClaimWithLine("DECLINED", { decidedAt: new Date() });
    const e = await Svc.checkEligibility(ctx(), claim.id, { reasonCode: "INCORRECT_DECLINE" });
    expect(e.eligible).toBe(true);
    expect(e.code).toBe("ELIGIBLE");
    expect(e.deadline).toBeInstanceOf(Date);
    expect((await Svc.checkEligibility(ctx(), claim.id, { reasonCode: "UNDERPAID_RATE" })).code).toBe("REASON_NOT_ELIGIBLE");
    const bCtx = ctx({ actorId: world.users.b.id, providerId: world.providers.b.id, allowedProviderBranchIds: [world.branches.b1.id] });
    expect((await Svc.checkEligibility(bCtx, claim.id)).code).toBe("NOT_FOUND");
    expect((await Svc.checkEligibility(ctx({ permissions: ["provider.claim.read"] }), claim.id)).code).toBe("FORBIDDEN");
  });
});
