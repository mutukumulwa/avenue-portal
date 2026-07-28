/**
 * F6.9 — SettlementReconciliationService (opt-in DB).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F6.9 SettlementReconciliationService (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Svc: typeof import("@/server/services/settlement-reconciliation/service").SettlementReconciliationService;
  let Err: typeof import("@/server/services/settlement-reconciliation/service").ReconInvestigationError;
  let world: import("../factories/provider-network").ProviderWorld;
  let tenantId: string;
  const finance = () => ({ userId: world.users.a.finance.id, tenantId, role: "FINANCE_OFFICER" });

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    const mod = await import("@/server/services/settlement-reconciliation/service");
    Svc = mod.SettlementReconciliationService;
    Err = mod.ReconInvestigationError;
    const { buildProviderWorld } = await import("../factories/provider-network");
    world = await buildProviderWorld(prisma);
    tenantId = world.tenants.alpha.id;
  });
  afterAll(async () => { if (world) await world.teardown(); });

  it("reconciles a fully-disbursed batch with no exceptions", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 1000, approved: 1000, lines: [{ billed: 1000, approved: 1000 }] }] });
    await world.createDisbursement({ batchId: b.batch.id, status: "SUCCEEDED", amount: 1000 });
    const r = (await Svc.reconcileBatch(tenantId, b.batch.id))!;
    expect(r.reconciled).toBe(true);
    expect(r.disbursement.fullyDisbursed).toBe(true);
  });

  it("flags OVER_DISBURSED when successful disbursement exceeds the batch total", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 1000, approved: 1000, lines: [{ billed: 1000, approved: 1000 }] }] });
    await world.createDisbursement({ batchId: b.batch.id, status: "SUCCEEDED", amount: 1500 }); // direct insert bypasses the F6.8 guard
    const r = (await Svc.reconcileBatch(tenantId, b.batch.id))!;
    expect(r.exceptions.map((e) => e.type)).toContain("OVER_DISBURSED");
  });

  it("flags MISSING_VOUCHER for a settled batch with no voucher", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, withVoucher: false, claims: [{ billed: 500, approved: 500, lines: [{ billed: 500, approved: 500 }] }] });
    const r = (await Svc.reconcileBatch(tenantId, b.batch.id))!;
    expect(r.exceptions.map((e) => e.type)).toContain("MISSING_VOUCHER");
  });

  it("flags CLAIM_BATCH_MISMATCH when the stored batch total drifts from Σ claim", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, overrideBatchTotal: 9999, claims: [{ billed: 1000, approved: 1000, lines: [{ billed: 1000, approved: 1000 }] }] });
    const r = (await Svc.reconcileBatch(tenantId, b.batch.id))!;
    expect(r.exceptions.map((e) => e.type)).toContain("CLAIM_BATCH_MISMATCH");
  });

  it("runReconciliation stores a run + exceptions and repeats deterministically", async () => {
    const run1 = await Svc.runReconciliation(tenantId);
    expect(run1.batchesChecked).toBeGreaterThanOrEqual(1);
    expect(run1.exceptionsFound).toBeGreaterThanOrEqual(1); // the mismatch batches above
    const runRow = await prisma.settlementReconciliationRun.findUnique({ where: { id: run1.runId } });
    expect(runRow!.status).toBe("COMPLETED");
    const stored = await prisma.settlementReconciliationException.count({ where: { runId: run1.runId } });
    expect(stored).toBe(run1.exceptionsFound);

    const run2 = await Svc.runReconciliation(tenantId);
    expect(run2.exceptionsFound).toBe(run1.exceptionsFound); // deterministic (no new batches)
  });

  it("investigation status: finance updates it; a provider is refused", async () => {
    const run = await Svc.runReconciliation(tenantId);
    const ex = await prisma.settlementReconciliationException.findFirst({ where: { runId: run.runId } });
    expect(ex).not.toBeNull();

    const upd = await Svc.updateInvestigation(finance(), ex!.id, { status: "INVESTIGATING", note: "checking" });
    expect(upd.investigationStatus).toBe("INVESTIGATING");
    const resolved = await Svc.updateInvestigation(finance(), ex!.id, { status: "RESOLVED" });
    expect(resolved.investigationStatus).toBe("RESOLVED");
    const row = await prisma.settlementReconciliationException.findUnique({ where: { id: ex!.id } });
    expect(row!.resolvedById).toBe(world.users.a.finance.id);

    await expect(Svc.updateInvestigation({ userId: "x", tenantId, role: "PROVIDER_USER" }, ex!.id, { status: "ACCEPTED" })).rejects.toBeInstanceOf(Err);
  });

  it("never mutates a financial fact (batch + voucher unchanged)", async () => {
    const b = await world.createSettlementBatch({ providerId: world.providers.a.id, claims: [{ billed: 700, approved: 700, lines: [{ billed: 700, approved: 700 }] }] });
    const before = await prisma.providerSettlementBatch.findUnique({ where: { id: b.batch.id }, select: { status: true, totalAmount: true } });
    const vbefore = await prisma.paymentVoucher.findFirst({ where: { settlementBatchId: b.batch.id }, select: { status: true, totalAmount: true } });
    await Svc.reconcileBatch(tenantId, b.batch.id);
    await Svc.runReconciliation(tenantId);
    const after = await prisma.providerSettlementBatch.findUnique({ where: { id: b.batch.id }, select: { status: true, totalAmount: true } });
    const vafter = await prisma.paymentVoucher.findFirst({ where: { settlementBatchId: b.batch.id }, select: { status: true, totalAmount: true } });
    expect(after).toEqual(before);
    expect(vafter).toEqual(vbefore);
  });
});
