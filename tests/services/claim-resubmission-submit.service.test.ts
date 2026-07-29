/**
 * F5.10 — submit linked post-decline resubmission (opt-in DB).
 *
 * Proves the spec §13 F5.10 invariants against a real Postgres:
 *  - the original DECLINED decision + money are immutable (only the chain pointer advances);
 *  - the resubmission is a FULL new claim (fresh RECEIVED + processing run) — no inheritance
 *    of pricing/approval/decline;
 *  - concurrency yields exactly ONE current child; a same-key replay returns the same child;
 *  - an ineligible decline is denied (eligibility is enforced).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!URL_SET)("F5.10 ClaimResubmissionService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-resubmission/submit.service").ClaimResubmissionService;
  let ClaimResubmissionError: typeof import("@/server/services/claim-resubmission/submit.service").ClaimResubmissionError;
  let ChainSvc: typeof import("@/server/services/claim-submission-chain/service").ClaimSubmissionChainService;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return {
      actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id,
      providerId: world.providers.a.id, allowedProviderBranchIds: [world.branches.a1.id, world.branches.a2.id],
      permissions: ["provider.claim.correct"], apiScopes: [], requestId: "test-req", ...over,
    };
  }

  let keySeq = 0;
  function cmd(predecessorClaimId: string, over: Partial<import("@/server/services/claim-resubmission/submit.service").ResubmitClaimCommand> = {}) {
    keySeq += 1;
    return {
      tenantId: world.tenants.alpha.id, predecessorClaimId, idempotencyKey: `resub-${keySeq}-${predecessorClaimId.slice(0, 8)}`,
      reason: "Attached the missing invoice", serviceType: "OUTPATIENT" as const, benefitCategory: "OUTPATIENT" as const,
      dateOfService: isoDaysAgo(3),
      diagnoses: [{ code: "E11.9", description: "Type 2 diabetes", standardCharge: null, isPrimary: true }],
      lineItems: [{ serviceCategory: "CONSULTATION" as const, cptCode: "99213", icdCode: "E11.9", description: "Office visit (resubmitted)", quantity: 1, unitCost: 2000, billedAmount: 2000 }],
      ...over,
    };
  }

  async function declined(over: Record<string, unknown> = {}) {
    const c = await world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status: "DECLINED" });
    await prisma.claim.update({ where: { id: c.id }, data: { declineReasonCode: "INVALID_DOCS", ...over } });
    return c;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/claim-resubmission/submit.service");
    Svc = mod.ClaimResubmissionService;
    ClaimResubmissionError = mod.ClaimResubmissionError;
    ChainSvc = (await import("@/server/services/claim-submission-chain/service")).ClaimSubmissionChainService;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("links a resubmission, leaves the DECLINED decision/money immutable, and inherits nothing", async () => {
    const orig = await declined();
    const res = await Svc.submit(ctx(), cmd(orig.id));

    expect(res.replayed).toBe(false);
    expect(res.claimId).not.toBe(orig.id);
    expect(res.chainRootClaimId).toBe(orig.id);

    // original: the decision + money are immutable; only the chain pointer advanced
    const o = await prisma.claim.findUnique({ where: { id: orig.id } });
    expect(o!.status).toBe("DECLINED");
    expect(o!.declineReasonCode).toBe("INVALID_DOCS");
    expect(o!.supersededByClaimId).toBe(res.claimId);
    expect(Number(o!.approvedAmount)).toBe(0);
    expect(Number(o!.paidAmount)).toBe(0);
    expect(Number(o!.billedAmount)).toBe(1000); // original content untouched

    // resubmission: a FULL new claim — no inheritance of pricing/approval/decline
    const child = await prisma.claim.findUnique({ where: { id: res.claimId }, include: { claimLines: true } });
    expect(child!.status).toBe("RECEIVED");
    expect(child!.submissionType).toBe("RESUBMISSION");
    expect(child!.supersedesClaimId).toBe(orig.id);
    expect(child!.chainRootClaimId).toBe(orig.id);
    expect(Number(child!.approvedAmount)).toBe(0);
    expect(child!.declineReasonCode).toBeNull();
    expect(Number(child!.billedAmount)).toBe(2000);
    expect(child!.claimLines.length).toBe(1);
    // full new rules will execute — a PENDING processing run exists
    expect(await prisma.claimProcessingRun.count({ where: { claimId: res.claimId, state: "PENDING" } })).toBeGreaterThan(0);

    // chain resolves both, oldest first
    const chain = await ChainSvc.getChain({ tenantId: world.tenants.alpha.id, providerId: world.providers.a.id }, res.claimId);
    expect(chain.map((c) => c.id)).toEqual([orig.id, res.claimId]);
  });

  it("denies an ineligible decline (reason not resubmittable) — nothing written", async () => {
    const orig = await declined({ declineReasonCode: "EXCLUSION" });
    const err = await Svc.submit(ctx(), cmd(orig.id)).catch((e) => e);
    expect(err).toBeInstanceOf(ClaimResubmissionError);
    expect(err.code).toBe("REASON_NOT_RESUBMITTABLE");
    expect(await prisma.claim.count({ where: { supersedesClaimId: orig.id } })).toBe(0);
    const o = await prisma.claim.findUnique({ where: { id: orig.id }, select: { status: true, supersededByClaimId: true } });
    expect(o!.status).toBe("DECLINED");
    expect(o!.supersededByClaimId).toBeNull();
  });

  it("respects eligibility — a non-declined claim is denied (NOT_DECLINED)", async () => {
    const c = await world.createClaim({ providerId: world.providers.a.id, status: "RECEIVED" });
    const err = await Svc.submit(ctx(), cmd(c.id)).catch((e) => e);
    expect(err).toBeInstanceOf(ClaimResubmissionError);
    expect(err.code).toBe("NOT_DECLINED");
  });

  it("a same-key replay returns the same resubmission (idempotent)", async () => {
    const orig = await declined();
    const key = `replay-${keySeq}-${orig.id.slice(0, 6)}`;
    const first = await Svc.submit(ctx(), cmd(orig.id, { idempotencyKey: key }));
    const replay = await Svc.submit(ctx(), cmd(orig.id, { idempotencyKey: key }));
    expect(replay.replayed).toBe(true);
    expect(replay.claimId).toBe(first.claimId);
    expect(await prisma.claim.count({ where: { supersedesClaimId: orig.id } })).toBe(1);
  });

  it("two concurrent resubmissions produce exactly one current child; the original stays DECLINED", async () => {
    const orig = await declined();
    const results = await Promise.allSettled([Svc.submit(ctx(), cmd(orig.id)), Svc.submit(ctx(), cmd(orig.id))]);
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ claimId: string }>[];
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].reason).toBeInstanceOf(ClaimResubmissionError);
    expect(failed[0].reason.code).toBe("ALREADY_RESUBMITTED");

    expect(await prisma.claim.count({ where: { supersedesClaimId: orig.id } })).toBe(1);
    const o = await prisma.claim.findUnique({ where: { id: orig.id }, select: { status: true, supersededByClaimId: true } });
    expect(o!.status).toBe("DECLINED");
    expect(o!.supersededByClaimId).toBe(ok[0].value.claimId);
  });
});
