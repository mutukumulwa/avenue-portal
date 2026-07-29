/**
 * F10.6 — capitation statement, approval, and payment (opt-in DB). Statement parity
 * + conservation; maker/checker payable approval; payment advances amountPaid with
 * conservation + PAID; a reversal restores the balance; a fully-paid period closes.
 * No second arrangement type (F10.6 stop).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F10.6 capitation statement + payment (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Stmt: typeof import("@/server/services/capitation/statement.service").CapitationStatementService;
  let world: import("../factories/provider-network").ProviderWorld;

  let seq = 0;
  const maker = { get userId() { return "maker-1"; }, get tenantId() { return world.tenants.alpha.id; }, role: "SUPER_ADMIN" };
  const checker = { get userId() { return "checker-1"; }, get tenantId() { return world.tenants.alpha.id; }, role: "FINANCE_OFFICER" };

  /** A FROZEN period with accrual set (lives 2 × 12000 = 24000 payable, opening 0). */
  async function mkFrozenPeriod() {
    const year = 2040 + seq++;
    const a = await Arr.createArrangement(maker, {
      providerId: world.providers.a.id, label: `stmt-${seq}`, rate: "12000.00", currency: "UGX", eligibilityDefinitionVersion: "CAP-1.0",
      effectiveFrom: new Date(`${year}-01-01T00:00:00Z`), effectiveTo: new Date(`${year}-12-31T00:00:00Z`),
    });
    const p = await Arr.openPeriod(maker, a.id, `${year}-01`, { periodStart: new Date(`${year}-01-01T00:00:00Z`), periodEnd: new Date(`${year}-01-28T00:00:00Z`) });
    await prisma.capitationPeriod.update({
      where: { id: p.id },
      data: { eligibleLifeCount: 2, grossAccrual: "24000.00", adjustmentTotal: "0.00", openingBalance: "0.00", amountPayable: "24000.00", closingBalance: "24000.00", status: "FROZEN", frozenById: "maker-1", calculationVersion: 1 },
    });
    return { arrangementId: a.id, periodId: p.id };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Stmt = (await import("@/server/services/capitation/statement.service")).CapitationStatementService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("reconciles a provider-safe statement that conserves + counts encounters", async () => {
    const { arrangementId, periodId } = await mkFrozenPeriod();
    await prisma.capitationEncounterLink.createMany({
      data: [
        { tenantId: maker.tenantId, arrangementId, periodId, memberId: world.members.alpha.id, providerId: world.providers.a.id, serviceDate: new Date("2040-01-05Z"), entityType: "CASE_SERVICE_ENTRY", entityId: `i1-${seq}`, funding: "INCLUDED" },
        { tenantId: maker.tenantId, arrangementId, periodId, memberId: world.members.alpha.id, providerId: world.providers.a.id, serviceDate: new Date("2040-01-06Z"), entityType: "CASE_SERVICE_ENTRY", entityId: `c1-${seq}`, funding: "CARVE_OUT" },
      ],
    });
    const s = await Stmt.getStatement(maker, periodId);
    expect(s).toMatchObject({ lives: 2, rate: "12000.0000", grossAccrual: "24000.0000", amountPayable: "24000.0000", amountPaid: "0.0000", closingBalance: "24000.0000", conserves: true });
    expect(s.encounters).toEqual({ included: 1, carveOut: 1 });
    // provider-safe: no internal finance ids leak
    for (const k of ["voucherId", "journalEntryId", "disbursementId"]) expect(s).not.toHaveProperty(k);
  });

  it("enforces maker/checker on the payable and requires approval before payment", async () => {
    const { periodId } = await mkFrozenPeriod();
    await expect(Stmt.approvePayable(maker, periodId)).rejects.toMatchObject({ code: "FORBIDDEN" }); // maker == freezer
    // payment blocked before approval
    await expect(Stmt.recordPayment(checker, periodId, { amount: "24000.00" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const approved = await Stmt.approvePayable(checker, periodId);
    expect(approved.approvedById).toBe("checker-1");
  });

  it("records payment with conservation, rejects overpay, then closes", async () => {
    const { periodId } = await mkFrozenPeriod();
    await Stmt.approvePayable(checker, periodId);
    await expect(Stmt.recordPayment(checker, periodId, { amount: "25000.00" })).rejects.toMatchObject({ code: "INVALID_INPUT" }); // exceeds payable
    const paid = await Stmt.recordPayment(checker, periodId, { amount: "24000.00", disbursementId: "disb-1" });
    expect(paid.status).toBe("PAID");
    const s = await Stmt.getStatement(maker, periodId);
    expect(s).toMatchObject({ amountPaid: "24000.0000", closingBalance: "0.0000", conserves: true }); // opening 0 + 24000 − 24000 = 0
    const closed = await Stmt.closePeriod(checker, periodId);
    expect(closed.status).toBe("CLOSED");
  });

  it("restores the balance on a reversed payment (failed disbursement)", async () => {
    const { periodId } = await mkFrozenPeriod();
    await Stmt.approvePayable(checker, periodId);
    await Stmt.recordPayment(checker, periodId, { amount: "24000.00" }); // PAID, closing 0
    const reversed = await Stmt.reversePayment(checker, periodId, { amount: "24000.00", reason: "bank rejected" });
    expect(reversed.status).toBe("FROZEN");
    const s = await Stmt.getStatement(maker, periodId);
    expect(s).toMatchObject({ amountPaid: "0.0000", closingBalance: "24000.0000", conserves: true }); // balance restored
  });
});
