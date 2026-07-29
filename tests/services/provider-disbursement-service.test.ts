/**
 * F6.8 — ProviderDisbursementService (opt-in DB).
 *
 * Maker/checker, version+status CAS, idempotency, over-disbursement guard, and
 * the FG-C7 invariant: disbursement operations NEVER mutate batch/voucher state.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F6.8 ProviderDisbursementService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/provider-disbursement/service").ProviderDisbursementService;
  let Err: typeof import("@/server/services/provider-disbursement/service").DisbursementServiceError;
  let world: import("../factories/provider-network").ProviderWorld;

  type Actor = import("@/server/services/provider-disbursement/service").DisbursementActor;
  let maker: Actor;
  let checker: Actor;
  const valueDate = new Date("2026-07-31T00:00:00Z");

  // Build a fresh SETTLED batch (voucher total = 1000) for a test that mutates it.
  async function settledBatch(total = 1000) {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: total, approved: total, lines: [{ billed: total, approved: total }] }] });
    return b.batch.id;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/provider-disbursement/service");
    Svc = mod.ProviderDisbursementService;
    Err = mod.DisbursementServiceError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    maker = { userId: world.users.a.finance.id, tenantId: world.tenants.alpha.id, role: "FINANCE_OFFICER" };
    checker = { userId: world.users.a.admin.id, tenantId: world.tenants.alpha.id, role: "FINANCE_OFFICER" };
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("records a PENDING disbursement on a SETTLED batch", async () => {
    const batchId = await settledBatch();
    const r = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER", maskedDestination: "***4321" });
    expect(r.status).toBe("PENDING");
    expect(r.version).toBe(1);
    const row = await prisma.providerDisbursement.findUnique({ where: { id: r.id } });
    expect(row!.initiatedById).toBe(maker.userId);
    expect(row!.maskedDestination).toBe("***4321");
  });

  it("refuses to record on a non-settled batch", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, status: "CHECKER_APPROVED", withVoucher: false, claims: [{ billed: 500, approved: 500, lines: [{ billed: 500, approved: 500 }] }] });
    await expect(Svc.record(maker, { settlementBatchId: b.batch.id, amount: 500, currency: "UGX", method: "BANK_TRANSFER" }))
      .rejects.toMatchObject({ code: "BATCH_NOT_SETTLED" });
  });

  it("refuses a currency mismatch and over-disbursement", async () => {
    const batchId = await settledBatch(1000);
    await expect(Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "KES", method: "BANK_TRANSFER" })).rejects.toMatchObject({ code: "INVALID" });
    await expect(Svc.record(maker, { settlementBatchId: batchId, amount: 1500, currency: "UGX", method: "BANK_TRANSFER" })).rejects.toMatchObject({ code: "OVER_DISBURSEMENT" });
    // a valid 600 + a further 600 exceeds 1000 ⇒ second refused
    await Svc.record(maker, { settlementBatchId: batchId, amount: 600, currency: "UGX", method: "BANK_TRANSFER" });
    await expect(Svc.record(maker, { settlementBatchId: batchId, amount: 600, currency: "UGX", method: "BANK_TRANSFER" })).rejects.toMatchObject({ code: "OVER_DISBURSEMENT" });
  });

  it("is idempotent on idempotencyKey", async () => {
    const batchId = await settledBatch();
    const a = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER", idempotencyKey: "k-1" });
    const b = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER", idempotencyKey: "k-1" });
    expect(b.id).toBe(a.id);
    expect(b.replayed).toBe(true);
  });

  it("drives the full lifecycle with maker ≠ checker, and confirm needs reference + value date", async () => {
    const batchId = await settledBatch();
    const rec = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" });
    const rel = await Svc.release(maker, rec.id, rec.version);
    const proc = await Svc.markProcessing(maker, rel.id, rel.version);

    // missing reference / value date ⇒ INVALID
    await expect(Svc.confirm(checker, proc.id, proc.version, { externalReference: "", valueDate })).rejects.toMatchObject({ code: "INVALID" });
    // same actor as the maker ⇒ separation of duty
    await expect(Svc.confirm(maker, proc.id, proc.version, { externalReference: "FT-1", valueDate })).rejects.toMatchObject({ code: "SEPARATION_OF_DUTY" });

    const done = await Svc.confirm(checker, proc.id, proc.version, { externalReference: "FT-1", valueDate });
    expect(done.status).toBe("SUCCEEDED");
    const row = await prisma.providerDisbursement.findUnique({ where: { id: done.id } });
    expect(row!.confirmedById).toBe(checker.userId);
    expect(row!.externalReference).toBe("FT-1");
    expect(row!.valueDate?.toISOString()).toBe(valueDate.toISOString());
  });

  it("rejects illegal transitions and stale versions", async () => {
    const batchId = await settledBatch();
    const rec = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" });
    // confirm straight from PENDING (from-set is [PROCESSING]) ⇒ INVALID_STATE
    await expect(Svc.confirm(checker, rec.id, rec.version, { externalReference: "FT-x", valueDate })).rejects.toMatchObject({ code: "INVALID_STATE" });
    // stale version ⇒ STALE
    await expect(Svc.release(maker, rec.id, rec.version + 5)).rejects.toMatchObject({ code: "STALE" });
  });

  it("concurrent confirmation ⇒ exactly one SUCCEEDED", async () => {
    const batchId = await settledBatch();
    const rec = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" });
    const rel = await Svc.release(maker, rec.id, rec.version);
    const proc = await Svc.markProcessing(maker, rel.id, rel.version);
    const results = await Promise.allSettled([
      Svc.confirm(checker, proc.id, proc.version, { externalReference: "FT-A", valueDate }),
      Svc.confirm(checker, proc.id, proc.version, { externalReference: "FT-B", valueDate }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.providerDisbursement.findUnique({ where: { id: rec.id } });
    expect(row!.status).toBe("SUCCEEDED");
  });

  it("fail separates safe vs internal reasons; reverse compensates a succeeded payment", async () => {
    const batchId = await settledBatch();
    const rec = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" });
    const failed = await Svc.fail(maker, rec.id, rec.version, { safe: "Payment could not be completed.", internal: "Account frozen — hold #9" });
    expect(failed.status).toBe("FAILED");
    const frow = await prisma.providerDisbursement.findUnique({ where: { id: rec.id } });
    expect(frow!.failureReasonSafe).not.toContain("hold");

    // fresh success then reverse (checker)
    const b2 = await settledBatch();
    const r2 = await Svc.record(maker, { settlementBatchId: b2, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" });
    const rel2 = await Svc.release(maker, r2.id, r2.version);
    const proc2 = await Svc.markProcessing(maker, rel2.id, rel2.version);
    const done2 = await Svc.confirm(checker, proc2.id, proc2.version, { externalReference: "FT-2", valueDate });
    const rev = await Svc.reverse(checker, done2.id, done2.version, { safe: "Payment reversed." });
    expect(rev.status).toBe("REVERSED");
  });

  it("requires a finance role", async () => {
    const batchId = await settledBatch();
    await expect(Svc.record({ userId: "u", tenantId: world.tenants.alpha.id, role: "PROVIDER_USER" }, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("FG-C7: disbursement operations never mutate the batch or voucher", async () => {
    const batchId = await settledBatch();
    const before = await prisma.providerSettlementBatch.findUnique({ where: { id: batchId }, select: { status: true, totalAmount: true, settledAt: true } });
    const vbefore = await prisma.paymentVoucher.findFirst({ where: { settlementBatchId: batchId }, select: { status: true, totalAmount: true } });

    const rec = await Svc.record(maker, { settlementBatchId: batchId, amount: 1000, currency: "UGX", method: "BANK_TRANSFER" });
    const rel = await Svc.release(maker, rec.id, rec.version);
    const proc = await Svc.markProcessing(maker, rel.id, rel.version);
    await Svc.confirm(checker, proc.id, proc.version, { externalReference: "FT-Z", valueDate });

    const after = await prisma.providerSettlementBatch.findUnique({ where: { id: batchId }, select: { status: true, totalAmount: true, settledAt: true } });
    const vafter = await prisma.paymentVoucher.findFirst({ where: { settlementBatchId: batchId }, select: { status: true, totalAmount: true } });
    expect(after).toEqual(before); // batch byte-for-byte unchanged
    expect(vafter).toEqual(vbefore); // voucher byte-for-byte unchanged
  });
});
