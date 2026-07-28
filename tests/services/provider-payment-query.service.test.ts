/**
 * F6.10 — ProviderPaymentQueryService (opt-in DB).
 *
 * Provider raises + collaborates; finance resolves — and D17: the claim decision
 * is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F6.10 ProviderPaymentQueryService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-payment-query/service").ProviderPaymentQueryService;
  let Err: typeof import("@/server/services/provider-payment-query/service").PaymentQueryError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Ctx = import("@/server/services/provider-access.service").ProviderAccessContext;
  function ctxA(over: Partial<Ctx> = {}): Ctx {
    return { actorType: "USER", actorId: world.users.a.biller.id, tenantId: world.tenants.alpha.id, providerId: world.providers.a.id, allowedProviderBranchIds: [], permissions: ["provider.payment_query.manage"], apiScopes: [], requestId: "t", ...over };
  }
  const finance = () => ({ userId: world.users.a.finance.id, tenantId: world.tenants.alpha.id, role: "FINANCE_OFFICER" });

  let batchId: string;
  let claimId: string;

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-payment-query/service");
    Svc = mod.ProviderPaymentQueryService;
    Err = mod.PaymentQueryError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 1000, approved: 800, lines: [{ billed: 1000, approved: 800 }] }] });
    batchId = b.batch.id;
    claimId = b.claimIds[0];
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("raises a query with prefilled targets + a SHARED RAISED message", async () => {
    const r = await Svc.raise(ctxA(), { settlementBatchId: batchId, claimId, category: "SHORT_PAYMENT", discrepancyAmount: 200, discrepancyCurrency: "UGX", narrative: "Short paid by 200." });
    expect(r.status).toBe("OPEN");
    const view = (await Svc.getForProvider(ctxA(), r.id))!;
    expect(view.query.claimId).toBe(claimId);
    expect(view.query.category).toBe("SHORT_PAYMENT");
    expect(view.timeline.map((t) => t.eventType)).toContain("RAISED");
    expect((view.query as unknown as Record<string, unknown>).resolutionInternalNote).toBeUndefined();
  });

  it("refuses a claim not in the batch, and a cross-provider batch (non-enumerating)", async () => {
    await expect(Svc.raise(ctxA(), { settlementBatchId: batchId, claimId: "not-in-batch", category: "OTHER", narrative: "x" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(Svc.raise(ctxA({ actorId: world.users.b.id, providerId: world.providers.b.id }), { settlementBatchId: batchId, category: "OTHER", narrative: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is idempotent on idempotencyKey", async () => {
    const a = await Svc.raise(ctxA(), { settlementBatchId: batchId, category: "MISSING_PAYMENT", narrative: "n", idempotencyKey: "pq-1" });
    const b = await Svc.raise(ctxA(), { settlementBatchId: batchId, category: "MISSING_PAYMENT", narrative: "n", idempotencyKey: "pq-1" });
    expect(b.id).toBe(a.id);
    expect(b.replayed).toBe(true);
  });

  it("full finance/provider lifecycle; D17: the claim is never touched", async () => {
    const before = await prisma.claim.findUnique({ where: { id: claimId }, select: { status: true, approvedAmount: true, paidAmount: true, updatedAt: true } });

    const q = await Svc.raise(ctxA(), { settlementBatchId: batchId, claimId, category: "SHORT_PAYMENT", narrative: "Short paid." });
    const ack = await Svc.acknowledge(finance(), q.id, q.version);
    expect(ack.status).toBe("ACKNOWLEDGED");
    const info = await Svc.requestInformation(finance(), q.id, ack.version, "Please send the deposit slip.");
    expect(info.status).toBe("INFORMATION_REQUIRED");
    const resp = await Svc.respondToInformation(ctxA(), q.id, info.version, "Attached.");
    expect(resp.status).toBe("PROVIDER_RESPONDED");
    const res = await Svc.resolve(finance(), q.id, resp.version, { code: "ADJUSTED", explanation: "Corrected on the next cycle.", internalNote: "manual GL note" });
    expect(res.status).toBe("RESOLVED");

    const view = (await Svc.getForProvider(ctxA(), q.id))!;
    expect(view.query.resolutionExplanation).toBe("Corrected on the next cycle.");
    expect(view.timeline.map((t) => t.eventType)).toEqual(["RAISED", "ACKNOWLEDGED", "INFO_REQUESTED", "PROVIDER_RESPONDED", "RESOLVED"]);

    const after = await prisma.claim.findUnique({ where: { id: claimId }, select: { status: true, approvedAmount: true, paidAmount: true, updatedAt: true } });
    expect(after).toEqual(before); // D17 — claim byte-for-byte unchanged
  });

  it("provider can withdraw before resolution; stale version + finance role guarded", async () => {
    const q = await Svc.raise(ctxA(), { settlementBatchId: batchId, category: "OTHER", narrative: "mistake" });
    const w = await Svc.withdraw(ctxA(), q.id, q.version);
    expect(w.status).toBe("WITHDRAWN");

    const q2 = await Svc.raise(ctxA(), { settlementBatchId: batchId, category: "OTHER", narrative: "another" });
    await expect(Svc.acknowledge(finance(), q2.id, q2.version + 9)).rejects.toMatchObject({ code: "STALE" });
    await expect(Svc.acknowledge({ userId: "u", tenantId: world.tenants.alpha.id, role: "PROVIDER_USER" }, q2.id, q2.version)).rejects.toBeInstanceOf(Err);
  });

  it("F6.11 finance reads: listForFinance/getForFinance are role-gated and carry the full row", async () => {
    const q = await Svc.raise(ctxA(), { settlementBatchId: batchId, category: "OTHER", narrative: "for finance queue" });
    const list = await Svc.listForFinance(finance());
    expect(list.some((x) => x.id === q.id)).toBe(true);
    const full = await Svc.getForFinance(finance(), q.id);
    expect(full!.messages.length).toBeGreaterThanOrEqual(1); // finance sees all messages incl. internal
    expect(full!.version).toBeGreaterThanOrEqual(1);
    await expect(Svc.listForFinance({ userId: "u", tenantId: world.tenants.alpha.id, role: "PROVIDER_USER" })).rejects.toBeInstanceOf(Err);
  });
});
