/**
 * F5.15 — reconsideration maximum-delta calculation (opt-in DB).
 *
 * Proves the calculation over an INJECTED canonical repricer (so the engine's tariff fixtures
 * aren't needed to test the math): corrected full entitlement − prior approved/paid, clamped at
 * zero, exact Decimal; prior ACCEPTED supplemental awards are summed so nothing is double-
 * allowed; a tariff below prior ⇒ zero; a pended/unmatched line ⇒ non-deterministic (no delta);
 * deterministic replay; role gate; and the DEFAULT port really calls the contract engine.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F5.15 ReconsiderationCalculationService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/claim-reconsideration/calculation.service").ReconsiderationCalculationService;
  type Repricer = import("@/server/services/claim-reconsideration/calculation.service").ReconsiderationRepricer;
  let ReviewError: typeof import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Actor = import("@/server/services/claim-reconsideration/review.service").ReconsiderationReviewerActor;
  function reviewer(over: Partial<Actor> = {}): Actor {
    return { tenantId: world.tenants.alpha.id, userId: world.users.a.finance.id, role: "CLAIMS_OFFICER", ...over };
  }

  /** A repricer stub: claimLineId → payable (null ⇒ pended). matched defaults true. */
  function stub(byLine: Record<string, number | null>, over: Partial<import("@/server/services/claim-reconsideration/calculation.service").RepriceResult> = {}): Repricer {
    return async () => ({
      matched: true,
      contractId: "contract_x",
      contractVersionId: "cv_1",
      lines: Object.entries(byLine).map(([claimLineId, payableAmount]) => ({ claimLineId, payableAmount, source: "CONTRACT_TARIFF" })),
      ...over,
    });
  }

  let seq = 0;
  async function seedCaseWithLines(
    lines: Array<{ approved: number }>,
    over: { claimStatus?: string; reconStatus?: string } = {},
  ) {
    seq += 1;
    const claim = await world.createClaim({ providerId: world.providers.a.id, memberId: world.members.alpha.id, status: over.claimStatus ?? "PARTIALLY_APPROVED" });
    await prisma.claim.update({ where: { id: claim.id }, data: { claimNumber: `CLM-CALC-${seq}`, decidedAt: new Date(), adjudicatorId: world.users.a.finance.id } });
    const claimLines = [];
    for (let i = 0; i < lines.length; i++) {
      claimLines.push(await prisma.claimLine.create({
        data: {
          claimId: claim.id, lineNumber: i + 1, serviceCategory: "CONSULTATION", description: `Line ${i + 1}`,
          quantity: 1, unitCost: 1000, billedAmount: 1000, approvedAmount: lines[i].approved,
          payerLiability: lines[i].approved, memberLiability: 0, providerWriteOff: 1000 - lines[i].approved,
        },
      }));
    }
    const rc = await prisma.claimReconsideration.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, providerBranchId: world.branches.a1.id,
        claimId: claim.id, chainRootClaimId: claim.id, reasonCode: "UNDERPAID_RATE",
        providerNarrative: "The contracted rate is higher.", requestedAmount: 300, currency: claim.currency,
        filingDeadline: new Date(Date.now() + 30 * 86_400_000), filedAt: new Date(),
        status: (over.reconStatus ?? "UNDER_REVIEW") as never, originalAdjudicatorId: world.users.a.finance.id, version: 1,
        lines: { create: claimLines.map((cl) => ({ claimLineId: cl.id, originalBilled: 1000, originalAllowed: cl.approvedAmount, alreadyApproved: cl.approvedAmount })) },
        events: { create: [{ tenantId: world.tenants.alpha.id, sequence: 1, eventType: "SUBMITTED", newStatus: "SUBMITTED", actorType: "USER", actorId: world.users.a.biller.id }] },
      },
      select: { id: true, claimId: true, lines: { select: { id: true, claimLineId: true } } },
    });
    return { claim, claimLines, rc };
  }

  /** Seed a PRIOR accepted reconsideration on the same claim that already awarded `award` on a line. */
  async function seedPriorAward(claimId: string, claimLineId: string, award: number) {
    await prisma.claimReconsideration.create({
      data: {
        tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, claimId, chainRootClaimId: claimId,
        reasonCode: "UNDERPAID_RATE", providerNarrative: "prior", requestedAmount: award, currency: "UGX",
        status: "ACCEPTED", version: 1,
        lines: { create: [{ claimLineId, originalBilled: 1000, alreadyApproved: 0, awardedIncrement: award }] },
      },
    });
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Svc = (await import("@/server/services/claim-reconsideration/calculation.service")).ReconsiderationCalculationService;
    ReviewError = (await import("@/server/services/claim-reconsideration/review.service")).ReconsiderationReviewError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("computes max(0, corrected − prior) per line and the total ceiling (partial/underpaid)", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 600 }, { approved: 500 }]);
    const r = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 900, [claimLines[1].id]: 500 }) });
    expect(r.deterministic).toBe(true);
    expect(r.contractVersionId).toBe("cv_1");
    const l0 = r.lines.find((l) => l.claimLineId === claimLines[0].id)!;
    expect(l0.correctedEntitlement).toBe("900.00");
    expect(l0.priorApproved).toBe("600.00");
    expect(l0.maxIncrement).toBe("300.00");
    const l1 = r.lines.find((l) => l.claimLineId === claimLines[1].id)!;
    expect(l1.maxIncrement).toBe("0.00"); // 500 corrected == 500 prior
    expect(r.totalMaxIncrement).toBe("300.00");
  });

  it("prices a declined line's corrected entitlement from zero prior", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 0 }], { claimStatus: "DECLINED" });
    const r = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 500 }) });
    expect(r.lines[0].priorApproved).toBe("0.00");
    expect(r.lines[0].maxIncrement).toBe("500.00");
  });

  it("uses max(approved, paid) as prior on a PAID claim", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 600 }], { claimStatus: "PAID" });
    const r = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 800 }) });
    expect(r.lines[0].priorPaid).toBe("600.00");
    expect(r.lines[0].maxIncrement).toBe("200.00");
  });

  it("sums prior accepted supplemental awards so nothing is double-allowed", async () => {
    const { rc, claim, claimLines } = await seedCaseWithLines([{ approved: 600 }]);
    await seedPriorAward(claim.id, claimLines[0].id, 200); // a prior reconsideration already awarded +200
    const r = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 900 }) });
    expect(r.lines[0].priorApproved).toBe("800.00"); // 600 original + 200 prior award
    expect(r.lines[0].maxIncrement).toBe("100.00"); // 900 − 800, NOT 300
  });

  it("clamps to zero when the corrected tariff is below the prior amount", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 600 }]);
    const r = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 500 }) });
    expect(r.lines[0].maxIncrement).toBe("0.00");
    expect(r.lines[0].explanation).toMatch(/no additional amount/i);
  });

  it("is exact under fractional currency/rounding", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 600.05 }]);
    const r = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 700.1 }) });
    expect(r.lines[0].correctedEntitlement).toBe("700.10");
    expect(r.lines[0].priorApproved).toBe("600.05");
    expect(r.lines[0].maxIncrement).toBe("100.05"); // exact, no float drift
  });

  it("marks a pended line (and an unmatched claim) non-deterministic with no delta", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 600 }]);
    const pended = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: null }) });
    expect(pended.deterministic).toBe(false);
    expect(pended.lines[0].deterministic).toBe(false);
    expect(pended.lines[0].maxIncrement).toBe("0.00");
    expect(pended.lines[0].correctedEntitlement).toBeNull();
    expect(pended.lines[0].explanation).toMatch(/reviewer judgment/i);

    const unmatched = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: async () => ({ matched: false, contractId: null, contractVersionId: null, lines: [] }) });
    expect(unmatched.deterministic).toBe(false);
    expect(unmatched.lines[0].maxIncrement).toBe("0.00");
    expect(unmatched.lines[0].explanation).toMatch(/no contract/i);
  });

  it("is a deterministic replay — identical inputs yield an identical result", async () => {
    const { rc, claimLines } = await seedCaseWithLines([{ approved: 600 }]);
    const reprice = stub({ [claimLines[0].id]: 933.33 });
    const a = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice });
    const b = await Svc.computeMaxDelta(reviewer(), rc.id, { reprice });
    expect(a).toEqual(b);
  });

  it("is reviewer-gated and does not mutate the claim (D13)", async () => {
    const { rc, claim, claimLines } = await seedCaseWithLines([{ approved: 600 }]);
    const before = await prisma.claim.findUnique({ where: { id: claim.id } });
    const forbidden = await Svc.computeMaxDelta(reviewer({ role: "CUSTOMER_SERVICE" }), rc.id, { reprice: stub({ [claimLines[0].id]: 900 }) }).catch((e) => e);
    expect(forbidden).toBeInstanceOf(ReviewError);
    expect(forbidden.code).toBe("FORBIDDEN");
    await Svc.computeMaxDelta(reviewer(), rc.id, { reprice: stub({ [claimLines[0].id]: 900 }) });
    const after = await prisma.claim.findUnique({ where: { id: claim.id } });
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    expect(Number(after!.approvedAmount)).toBe(Number(before!.approvedAmount));
  });

  it("DEFAULT port calls the real contract engine (no injected repricer)", async () => {
    const { rc } = await seedCaseWithLines([{ approved: 600 }]);
    // No tariff fixture ⇒ the engine returns unmatched; the calc must handle it gracefully
    // (structured result, non-deterministic, no throw) — proving the default wiring.
    const r = await Svc.computeMaxDelta(reviewer(), rc.id);
    expect(r.reconsiderationId).toBe(rc.id);
    expect(r.lines.length).toBe(1);
    expect(r.deterministic).toBe(false);
    expect(r.totalMaxIncrement).toBe("0.00");
  });
});
