/**
 * F5.16 — execute the reconsideration outcome (opt-in DB). The case's first money path.
 *
 * Proves: UPHELD/zero closes with NO child; ACCEPTED/PARTIALLY_ACCEPTED create ONE linked
 * canonical child (submissionType RECONSIDERATION) billing ONLY the awarded positive deltas —
 * Σ child lines = the award, hard-capped to the F5.15 maximum; the ORIGINAL claim is untouched
 * (D13); a concurrent double-outcome yields exactly one child; a re-execution replays; a build
 * failure leaves the case recoverable; role-gated. Repricer injected so the accepted paths run
 * without a tariff fixture (the canonical intake still creates a real RECEIVED child).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.16 ReconsiderationOutcomeService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-reconsideration/outcome.service").ReconsiderationOutcomeService;
  type Repricer = import("@/server/services/claim-reconsideration/calculation.service").ReconsiderationRepricer;
  let ReviewError: typeof import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Actor = import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewerActor;
  const reviewer = (over: Partial<Actor> = {}): Actor => ({ tenantId: world.tenants.alpha.id, userId: world.users.a.finance.id, role: "CLAIMS_OFFICER", ...over });

  const stub = (byLine: Record<string, number | null>): Repricer => async () => ({
    matched: true, contractId: "c_x", contractVersionId: "cv_1",
    lines: Object.entries(byLine).map(([claimLineId, payableAmount]) => ({ claimLineId, payableAmount, source: "CONTRACT_TARIFF" })),
  });

  let seq = 0;
  async function seedCase(lines: Array<{ approved: number }>, over: { claimStatus?: string; diagnoses?: unknown } = {}) {
    seq += 1;
    const claim = await world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status: over.claimStatus ?? "PARTIALLY_APPROVED" });
    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        claimNumber: `CLM-OUT-${seq}`, decidedAt: new Date(), adjudicatorId: world.users.a.finance.id,
        diagnoses: over.diagnoses ?? [{ icdCode: "E11.9", description: "Type 2 diabetes", isPrimary: true }],
      },
    });
    const claimLines = [];
    for (let i = 0; i < lines.length; i++) {
      claimLines.push(await prisma.claimLine.create({
        data: {
          claimId: claim.id, lineNumber: i + 1, serviceCategory: "CONSULTATION", description: `Line ${i + 1}`, cptCode: "99213",
          quantity: 1, unitCost: 1000, billedAmount: 1000, approvedAmount: lines[i].approved,
          payerLiability: lines[i].approved, memberLiability: 0, providerWriteOff: 1000 - lines[i].approved,
        },
      }));
    }
    const rc = await prisma.claimReconsideration.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, providerBranchId: world.branches.a1.id,
        claimId: claim.id, chainRootClaimId: claim.id, reasonCode: "UNDERPAID_RATE", providerNarrative: "higher rate",
        requestedAmount: 300, currency: claim.currency, status: "UNDER_REVIEW", originalAdjudicatorId: world.users.a.finance.id, version: 3,
        lines: { create: claimLines.map((cl) => ({ claimLineId: cl.id, originalBilled: 1000, originalAllowed: cl.approvedAmount, alreadyApproved: cl.approvedAmount })) },
        events: { create: [{ tenantId: world.tenants.alpha.id, sequence: 1, eventType: "SUBMITTED", newStatus: "SUBMITTED", actorType: "USER", actorId: world.users.a.biller.id }] },
      },
      select: { id: true, claimId: true, version: true, lines: { select: { id: true, claimLineId: true } } },
    });
    return { claim, claimLines, rc };
  }
  const priceMap = (claimLines: Array<{ id: string }>, prices: number[]) => Object.fromEntries(claimLines.map((c, i) => [c.id, prices[i]]));

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/claim-reconsideration/outcome.service")).ReconsiderationOutcomeService;
    ReviewError = (await import("@/server/services/claim-reconsideration/review.service")).ReconsiderationReviewError;
    world = await buildWorld();
  });
  async function buildWorld() { const { buildProviderWorld } = await import("../factories/provider-network"); return buildProviderWorld(prisma); }
  afterAll(async () => { if (world) await world.teardown(); });

  type Decision = import("@/server/services/claim-reconsideration/outcome.service").ReconsiderationOutcomeDecision;
  const accept = (_rcId: string, awards: Array<{ reconsiderationLineId: string; awardedIncrement: number }>, disposition: Decision["disposition"] = "ACCEPTED"): Decision =>
    ({ disposition, expectedVersion: 3, reasonCode: "RATE_CORRECTED", safeExplanation: "The contracted rate applies.", lineAwards: awards });

  it("ACCEPTS: creates ONE linked child billing the award, capped to max, original untouched (D13)", async () => {
    const { claim, claimLines, rc } = await seedCase([{ approved: 600 }]);
    const claimBefore = await prisma.claim.findUnique({ where: { id: claim.id } });
    const lineBefore = await prisma.claimLine.findUnique({ where: { id: claimLines[0].id } });

    const r = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) });
    expect(r.disposition).toBe("ACCEPTED");
    expect(r.totalAward).toBe("300.00");
    expect(r.supplementalClaimId).toBeTruthy();

    const child = await prisma.claim.findUnique({ where: { id: r.supplementalClaimId! }, include: { claimLines: true } });
    expect(child!.submissionType).toBe("RECONSIDERATION");
    expect(child!.chainRootClaimId).toBe(claim.id);
    expect(child!.claimLines.length).toBe(1);
    expect(Number(child!.claimLines[0].billedAmount)).toBe(300); // Σ child lines = award
    const rcAfter = await prisma.claimReconsideration.findUnique({ where: { id: rc.id }, include: { lines: true } });
    expect(rcAfter!.status).toBe("ACCEPTED");
    expect(rcAfter!.supplementalClaimId).toBe(r.supplementalClaimId);
    expect(Number(rcAfter!.lines[0].awardedIncrement)).toBe(300);

    // D13: the original claim + its line are byte-for-byte untouched.
    const claimAfter = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(claimAfter!.status).toBe(claimBefore!.status);
    expect(claimAfter!.updatedAt.getTime()).toBe(claimBefore!.updatedAt.getTime());
    const lineAfter = await prisma.claimLine.findUnique({ where: { id: claimLines[0].id } });
    expect(Number(lineAfter!.approvedAmount)).toBe(Number(lineBefore!.approvedAmount));
  });

  it("UPHOLDS with a zero award: closes with NO financial child", async () => {
    const { claim, rc } = await seedCase([{ approved: 600 }]);
    const r = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 0 }], "UPHELD"), { reprice: stub(priceMap([{ id: rc.lines[0].claimLineId }], [900])) });
    expect(r.disposition).toBe("UPHELD");
    expect(r.supplementalClaimId).toBeNull();
    expect((await prisma.claimReconsideration.findUnique({ where: { id: rc.id } }))!.status).toBe("UPHELD");
    expect(await prisma.claim.count({ where: { chainRootClaimId: claim.id, submissionType: "RECONSIDERATION" } })).toBe(0);
  });

  it("sums multiple awarded lines into the child and never exceeds the maximum", async () => {
    const { claimLines, rc } = await seedCase([{ approved: 600 }, { approved: 500 }]);
    // caps: line0 900−600=300, line1 800−500=300
    const r = await Svc.execute(reviewer(), rc.id,
      accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }, { reconsiderationLineId: rc.lines[1].id, awardedIncrement: 100 }], "PARTIALLY_ACCEPTED"),
      { reprice: stub(priceMap(claimLines, [900, 800])) });
    expect(r.disposition).toBe("PARTIALLY_ACCEPTED");
    expect(r.totalAward).toBe("400.00");
    const child = await prisma.claim.findUnique({ where: { id: r.supplementalClaimId! }, include: { claimLines: true } });
    const sum = child!.claimLines.reduce((s, l) => s + Number(l.billedAmount), 0);
    expect(sum).toBe(400); // exactly the award
  });

  it("refuses an award above the F5.15 maximum (hard cap)", async () => {
    const { claimLines, rc } = await seedCase([{ approved: 600 }]);
    const err = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 400 }]), { reprice: stub(priceMap(claimLines, [900])) }).catch((e) => e);
    expect(err).toBeInstanceOf(ReviewError);
    expect(err.code).toBe("INVALID");
    expect((await prisma.claimReconsideration.findUnique({ where: { id: rc.id } }))!.status).toBe("UNDER_REVIEW"); // untouched
  });

  it("subtracts a prior accepted supplemental award from the cap", async () => {
    const { claim, claimLines, rc } = await seedCase([{ approved: 600 }]);
    await prisma.claimReconsideration.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, claimId: claim.id, chainRootClaimId: claim.id,
        reasonCode: "UNDERPAID_RATE", providerNarrative: "prior", requestedAmount: 200, currency: "UGX", status: "ACCEPTED", version: 1,
        lines: { create: [{ claimLineId: claimLines[0].id, originalBilled: 1000, alreadyApproved: 0, awardedIncrement: 200 }] },
      },
    });
    // corrected 900 − (600 + 200 prior) = 100 max; 300 now exceeds it
    const err = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) }).catch((e) => e);
    expect(err.code).toBe("INVALID");
    const ok = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 100 }]), { reprice: stub(priceMap(claimLines, [900])) });
    expect(ok.totalAward).toBe("100.00");
  });

  it("resolves a concurrent double-outcome to exactly ONE child", async () => {
    const { claim, claimLines, rc } = await seedCase([{ approved: 600 }]);
    const both = await Promise.allSettled([
      Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) }),
      Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) }),
    ]);
    const ok = both.filter((b) => b.status === "fulfilled");
    expect(ok.length).toBe(1); // one wins, one is refused
    expect(await prisma.claim.count({ where: { chainRootClaimId: claim.id, submissionType: "RECONSIDERATION" } })).toBe(1);
  });

  it("replays an already-decided case idempotently (no second child)", async () => {
    const { claim, claimLines, rc } = await seedCase([{ approved: 600 }]);
    const first = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) });
    const replay = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) });
    expect(replay.replayed).toBe(true);
    expect(replay.supplementalClaimId).toBe(first.supplementalClaimId);
    expect(await prisma.claim.count({ where: { chainRootClaimId: claim.id, submissionType: "RECONSIDERATION" } })).toBe(1);
  });

  it("leaves the case recoverable when the child cannot be built (no orphan)", async () => {
    const { claim, claimLines, rc } = await seedCase([{ approved: 600 }], { diagnoses: [] }); // no diagnosis ⇒ build fails
    const err = await Svc.execute(reviewer(), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) }).catch((e) => e);
    expect(err).toBeInstanceOf(ReviewError);
    const rcAfter = await prisma.claimReconsideration.findUnique({ where: { id: rc.id } });
    expect(rcAfter!.status).toBe("UNDER_REVIEW"); // reusable — nothing half-committed
    expect(rcAfter!.version).toBe(3);
    expect(await prisma.claim.count({ where: { chainRootClaimId: claim.id, submissionType: "RECONSIDERATION" } })).toBe(0);
  });

  it("is reviewer-gated and version-guarded", async () => {
    const { claimLines, rc } = await seedCase([{ approved: 600 }]);
    const forbidden = await Svc.execute(reviewer({ role: "CUSTOMER_SERVICE" }), rc.id, accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), { reprice: stub(priceMap(claimLines, [900])) }).catch((e) => e);
    expect(forbidden.code).toBe("FORBIDDEN");
    const stale = await Svc.execute(reviewer(), rc.id, { ...accept(rc.id, [{ reconsiderationLineId: rc.lines[0].id, awardedIncrement: 300 }]), expectedVersion: 99 }, { reprice: stub(priceMap(claimLines, [900])) }).catch((e) => e);
    expect(stale.code).toBe("STALE");
  });
});
