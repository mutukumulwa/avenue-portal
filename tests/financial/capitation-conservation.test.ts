/**
 * F11.3 — money-conservation suite (opt-in DB).
 *
 * Exact-Decimal control over the capitation ledger: the conservation law
 *   opening + gross accrual + adjustments − payments = closing
 * holds at EVERY state transition of a full lifecycle (accrue → adjust → recalc →
 * freeze → approve → pay → reverse → repay → close), and a zero-pay capitated line
 * can never enter FFS settlement (no double pay). Every mismatch fails loudly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F11.3 capitation money conservation (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Accr: typeof import("@/server/services/capitation/accrual.service").CapitationAccrualService;
  let Stmt: typeof import("@/server/services/capitation/statement.service").CapitationStatementService;
  let Link: typeof import("@/server/services/capitation/encounter-link.service").CapitationEncounterLinkService;
  let world: import("../factories/provider-network").ProviderWorld;

  let seq = 0;
  const maker = { get userId() { return "maker-1"; }, get tenantId() { return world.tenants.alpha.id; }, role: "SUPER_ADMIN" };
  const checker = { get userId() { return "checker-1"; }, get tenantId() { return world.tenants.alpha.id; }, role: "FINANCE_OFFICER" };

  /** Reload a period and assert opening + gross + adj − paid == closing (Decimal). */
  async function assertConserves(periodId: string) {
    const p = await prisma.capitationPeriod.findUniqueOrThrow({ where: { id: periodId } });
    const lhs = new Prisma.Decimal(p.openingBalance).add(p.grossAccrual).add(p.adjustmentTotal).sub(p.amountPaid);
    expect(lhs.toFixed(4)).toBe(new Prisma.Decimal(p.closingBalance).toFixed(4));
    const s = await Stmt.getStatement(maker, periodId);
    expect(s.conserves).toBe(true); // the statement's own reconciliation agrees
    return p;
  }

  async function calculatedPeriod(rate: string, lives: number) {
    const y = 2050 + seq++;
    const a = await Arr.createArrangement(maker, { providerId: world.providers.a.id, label: `cons-${seq}`, rate, eligibilityDefinitionVersion: "CAP-1.0", effectiveFrom: new Date(`${y}-01-01Z`), effectiveTo: new Date(`${y}-12-31Z`) });
    const p = await Arr.openPeriod(maker, a.id, `${y}-01`, { periodStart: new Date(`${y}-01-01Z`), periodEnd: new Date(`${y}-01-28Z`) });
    await prisma.capitationPeriod.update({ where: { id: p.id }, data: { eligibleLifeCount: lives, eligibleLifeControlHash: "h", status: "CALCULATED" } });
    return { arrangementId: a.id, periodId: p.id };
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Accr = (await import("@/server/services/capitation/accrual.service")).CapitationAccrualService;
    Stmt = (await import("@/server/services/capitation/statement.service")).CapitationStatementService;
    Link = (await import("@/server/services/capitation/encounter-link.service")).CapitationEncounterLinkService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("conserves at every transition of a full accrue→adjust→pay→reverse→repay→close lifecycle", async () => {
    const { periodId } = await calculatedPeriod("12000.00", 10); // gross 120000

    await Accr.calculateAccrual(maker, periodId);
    await assertConserves(periodId);

    await Arr.recordAdjustment(maker, periodId, { category: "RETRO_ELIGIBILITY", amount: "6000.00" });
    await Arr.recordAdjustment(maker, periodId, { category: "CLAWBACK", amount: "-2000.00" });
    await Accr.calculateAccrual(maker, periodId); // fold the adjustments in
    let p = await assertConserves(periodId);
    expect(new Prisma.Decimal(p.amountPayable).toFixed(2)).toBe("124000.00"); // 120000 + 6000 − 2000

    await Accr.freezeAccrual(checker, periodId);
    await Stmt.approvePayable(maker, periodId);

    // partial payment then the rest — conservation holds throughout
    await Stmt.recordPayment(checker, periodId, { amount: "100000.00" });
    p = await assertConserves(periodId);
    expect(new Prisma.Decimal(p.amountPaid).toFixed(2)).toBe("100000.00");

    // a failed/reversed payment restores the balance (does not silently vanish)
    await Stmt.reversePayment(checker, periodId, { amount: "100000.00", reason: "bank reject" });
    p = await assertConserves(periodId);
    expect(new Prisma.Decimal(p.amountPaid).toFixed(2)).toBe("0.00");

    // repay in full → PAID → CLOSED, still conserving
    await Stmt.recordPayment(checker, periodId, { amount: "124000.00" });
    p = await assertConserves(periodId);
    expect(p.status).toBe("PAID");
    expect(new Prisma.Decimal(p.closingBalance).toFixed(2)).toBe("0.00"); // opening 0 + 124000 − 124000
    const closed = await Stmt.closePeriod(checker, periodId);
    expect(closed.status).toBe("CLOSED");
  });

  it("never lets a zero-pay capitated line settle as FFS (no double pay)", async () => {
    const { arrangementId, periodId } = await calculatedPeriod("12000.00", 1);
    // activate the arrangement so it can host a live encounter link
    await Arr.activate(maker, arrangementId);
    await Link.linkEncounter(maker, { arrangementId, periodId, memberId: world.members.alpha.id, providerId: world.providers.a.id, serviceDate: new Date("2050-01-05Z"), entityType: "CLAIM_LINE", entityId: `cap-line-${seq}`, funding: "INCLUDED" });
    await expect(Link.assertFfsSettlementAllowed(world.tenants.alpha.id, "CLAIM_LINE", `cap-line-${seq}`)).rejects.toMatchObject({ code: "PERIOD_IMMUTABLE" });
  });

  it("rejects overpayment beyond the approved payable", async () => {
    const { periodId } = await calculatedPeriod("12000.00", 1); // gross 12000
    await Accr.calculateAccrual(maker, periodId);
    await Accr.freezeAccrual(checker, periodId);
    await Stmt.approvePayable(maker, periodId);
    await expect(Stmt.recordPayment(checker, periodId, { amount: "12000.01" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
