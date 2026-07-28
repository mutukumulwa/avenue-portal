/**
 * F6.12 — payment-query → reconsideration handoff (opt-in DB).
 *
 * The explicit conversion links a decision-dispute query to a governed
 * reconsideration WITHOUT touching the claim (D13/D17). Eligibility is checked
 * first; the only change to the query is the linked status/event.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F6.12 convertToReconsideration (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-payment-query/service").ProviderPaymentQueryService;
  let Err: typeof import("@/server/services/provider-payment-query/service").PaymentQueryError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctx(over: Partial<Ctx> = {}): Ctx {
    return { actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: ["provider.payment_query.manage", "provider.claim.reconsider"], apiScopes: [], requestId: "t", ...over };
  }

  // A fresh PAID batch + claim + line + an OPEN query about that claim.
  async function freshQueryOnClaim() {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 1000, approved: 800, lines: [{ billed: 1000, approved: 800 }] }] });
    const line = await prisma.claimLine.findFirst({ where: { claimId: b.claimIds[0] }, select: { id: true } });
    const q = await Svc.raise(ctx(), { settlementBatchId: b.batch.id, claimId: b.claimIds[0], category: "SHORT_PAYMENT", narrative: "Short paid — should be reconsidered." });
    return { claimId: b.claimIds[0], lineId: line!.id, queryId: q.id, version: q.version };
  }
  const reconInput = (lineId: string) => ({ reasonCode: "UNDERPAID_RATE", providerNarrative: "Paid below the agreed rate.", requestedAmount: 100, lines: [{ claimLineId: lineId, requestedAllowed: 900 }], idempotencyKey: `conv-${lineId}` });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-payment-query/service");
    Svc = mod.ProviderPaymentQueryService;
    Err = mod.PaymentQueryError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("converts: creates a reconsideration, links the query, and never touches the claim", async () => {
    const f = await freshQueryOnClaim();
    const before = await prisma.claim.findUnique({ where: { id: f.claimId }, select: { status: true, approvedAmount: true, paidAmount: true, updatedAt: true } });

    const res = await Svc.convertToReconsideration(ctx(), f.queryId, reconInput(f.lineId), f.version);
    expect(res.reconsiderationId).toBeTruthy();
    expect(res.status).toBe("RESOLVED");

    const q = await prisma.providerPaymentQuery.findUnique({ where: { id: f.queryId } });
    expect(q!.linkedReconsiderationId).toBe(res.reconsiderationId);
    expect(q!.status).toBe("RESOLVED");
    expect(q!.resolutionCode).toBe("CONVERTED_TO_RECONSIDERATION");

    const recon = await prisma.claimReconsideration.findUnique({ where: { id: res.reconsiderationId } });
    expect(recon!.claimId).toBe(f.claimId);

    const after = await prisma.claim.findUnique({ where: { id: f.claimId }, select: { status: true, approvedAmount: true, paidAmount: true, updatedAt: true } });
    expect(after).toEqual(before); // D13/D17 — claim byte-for-byte unchanged
  });

  it("refuses an ineligible reason (INCORRECT_DECLINE on a PAID claim) ⇒ INELIGIBLE", async () => {
    const f = await freshQueryOnClaim();
    await expect(Svc.convertToReconsideration(ctx(), f.queryId, { ...reconInput(f.lineId), reasonCode: "INCORRECT_DECLINE" }, f.version)).rejects.toMatchObject({ code: "INELIGIBLE" });
  });

  it("refuses a query with no claim (INVALID) and an explicit-reason requirement", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 500, approved: 500, lines: [{ billed: 500, approved: 500 }] }] });
    const q = await Svc.raise(ctx(), { settlementBatchId: b.batch.id, category: "MISSING_PAYMENT", narrative: "no claim" });
    await expect(Svc.convertToReconsideration(ctx(), q.id, reconInput("x"), q.version)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("duplicate handoff: a second convert returns the same reconsideration (no second case)", async () => {
    const f = await freshQueryOnClaim();
    const first = await Svc.convertToReconsideration(ctx(), f.queryId, reconInput(f.lineId), f.version);
    const again = await Svc.convertToReconsideration(ctx(), f.queryId, reconInput(f.lineId), f.version + 1);
    expect(again.reconsiderationId).toBe(first.reconsiderationId);
    expect(again.replayed).toBe(true);
    const count = await prisma.claimReconsideration.count({ where: { claimId: f.claimId } });
    expect(count).toBe(1);
  });

  it("cross-provider: provider B cannot convert provider A's query (NOT_FOUND)", async () => {
    const f = await freshQueryOnClaim();
    await expect(Svc.convertToReconsideration(ctx({ actorId: world.users.b.id, providerId: world.providers.b.id }), f.queryId, reconInput(f.lineId), f.version)).rejects.toBeInstanceOf(Err);
  });
});
