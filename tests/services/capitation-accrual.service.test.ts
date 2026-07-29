/**
 * F10.4 — calculate/freeze capitation accrual (opt-in DB). PMPM/fixed math with
 * Decimal rounding; append-only adjustments; opening carried from the prior period;
 * exact conservation; idempotent duplicate calculate; maker/checker freeze. No payment.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const URL_SET = !!process.env.AUTOPILOT_TEST_DB && process.env.DATABASE_URL === process.env.AUTOPILOT_TEST_DB;

describe.skipIf(!URL_SET)("F10.4 capitation accrual (opt-in DB)", () => {
  let prisma: typeof import("@/lib/prisma").prisma;
  let Arr: typeof import("@/server/services/capitation/arrangement.service").CapitationArrangementService;
  let Accr: typeof import("@/server/services/capitation/accrual.service").CapitationAccrualService;
  let world: import("../factories/provider-network").ProviderWorld;

  let seq = 0;
  const tid = () => world.tenants.alpha.id;
  const maker = { get userId() { return "maker-1"; }, get tenantId() { return world.tenants.alpha.id; }, role: "SUPER_ADMIN" };
  const checker = { get userId() { return "checker-1"; }, get tenantId() { return world.tenants.alpha.id; }, role: "FINANCE_OFFICER" };

  async function mkArrangement(rate: string, rateBasis: "PMPM" | "FIXED_PERIOD" = "PMPM") {
    const year = 2030 + seq++;
    const a = await Arr.createArrangement(maker, {
      providerId: world.providers.a.id, label: `acc-${seq}`, rate, rateBasis, currency: "UGX", eligibilityDefinitionVersion: "CAP-1.0",
      effectiveFrom: new Date(`${year}-01-01T00:00:00Z`), effectiveTo: new Date(`${year}-12-31T00:00:00Z`),
    });
    return { id: a.id, year };
  }
  /** A CALCULATED period (snapshot frozen) with a set eligible-life count. */
  async function mkCalcPeriod(arrId: string, period: string, count: number, rateOverride?: string) {
    const p = await Arr.openPeriod(maker, arrId, period, { periodStart: new Date(`${period}-01T00:00:00Z`), periodEnd: new Date(`${period}-28T00:00:00Z`) });
    await prisma.capitationPeriod.update({ where: { id: p.id }, data: { eligibleLifeCount: count, eligibleLifeControlHash: `h-${p.id}`, status: "CALCULATED", ...(rateOverride ? { rate: rateOverride } : {}) } });
    return p.id;
  }

  beforeAll(async () => {
    prisma = (await import("@/lib/prisma")).prisma;
    Arr = (await import("@/server/services/capitation/arrangement.service")).CapitationArrangementService;
    Accr = (await import("@/server/services/capitation/accrual.service")).CapitationAccrualService;
    world = await (await import("../factories/provider-network")).buildProviderWorld(prisma);
  });
  afterAll(async () => {
    if (world) await world.teardown();
  });

  it("computes PMPM accrual = frozen lives × rate with exact conservation", async () => {
    const a = await mkArrangement("12000.00");
    const pid = await mkCalcPeriod(a.id, `${a.year}-01`, 2);
    const r = await Accr.calculateAccrual(maker, pid);
    expect(r.grossAccrual).toBe("24000.0000"); // 2 × 12000
    expect(r.openingBalance).toBe("0.0000");
    expect(r.amountPayable).toBe("24000.0000");
    expect(r.closingBalance).toBe("24000.0000"); // opening + gross + adj − paid
    expect(r.calculationVersion).toBe(1);
  });

  it("rounds Decimal accrual half-up at the period total (no JS float)", async () => {
    const a = await mkArrangement("12000.3333");
    const pid = await mkCalcPeriod(a.id, `${a.year}-01`, 3);
    const r = await Accr.calculateAccrual(maker, pid);
    expect(r.grossAccrual).toBe("36000.9999"); // 3 × 12000.3333, 4dp
  });

  it("adds append-only adjustments into payable + closing, and is idempotent in value", async () => {
    const a = await mkArrangement("10000.00");
    const pid = await mkCalcPeriod(a.id, `${a.year}-01`, 5); // gross 50000
    await Arr.recordAdjustment(maker, pid, { category: "RETRO_ELIGIBILITY", amount: "3000.00" });
    await Arr.recordAdjustment(maker, pid, { category: "CLAWBACK", amount: "-1000.00" });
    const r = await Accr.calculateAccrual(maker, pid);
    expect(r.grossAccrual).toBe("50000.0000");
    expect(r.adjustmentTotal).toBe("2000.0000"); // 3000 − 1000
    expect(r.amountPayable).toBe("52000.0000");
    expect(r.closingBalance).toBe("52000.0000");
    // duplicate calculate: same money, version bumps
    const r2 = await Accr.calculateAccrual(maker, pid);
    expect(r2.grossAccrual).toBe(r.grossAccrual);
    expect(r2.closingBalance).toBe(r.closingBalance);
    expect(r2.calculationVersion).toBe(2);
  });

  it("carries the opening balance from the prior period's closing", async () => {
    const a = await mkArrangement("12000.00");
    const jan = await mkCalcPeriod(a.id, `${a.year}-01`, 2); // closing 24000
    await Accr.calculateAccrual(maker, jan);
    const feb = await mkCalcPeriod(a.id, `${a.year}-02`, 2);
    const r = await Accr.calculateAccrual(maker, feb);
    expect(r.openingBalance).toBe("24000.0000"); // from January's closing
    expect(r.closingBalance).toBe("48000.0000"); // 24000 + 24000
  });

  it("enforces maker/checker on freeze and immutability after", async () => {
    const a = await mkArrangement("12000.00");
    const pid = await mkCalcPeriod(a.id, `${a.year}-01`, 1);
    await Accr.calculateAccrual(maker, pid);
    // the maker cannot also be the checker
    await expect(Accr.freezeAccrual(maker, pid)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const frozen = await Accr.freezeAccrual(checker, pid);
    expect(frozen.status).toBe("FROZEN");
    expect(frozen.frozenById).toBe("checker-1");
    // a frozen accrual cannot recompute (correction → adjustment/reopen, never rewrite)
    await expect(Accr.calculateAccrual(maker, pid)).rejects.toMatchObject({ code: "PERIOD_IMMUTABLE" });
  });
});
