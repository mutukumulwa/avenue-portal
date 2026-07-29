import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { CapitationError, type CapitationActor } from "./arrangement.service";

/**
 * PNOS F10.4 — calculate + freeze capitation accrual.
 *
 * The accrual uses the FROZEN eligible-life snapshot × the effective rate, plus
 * append-only approved adjustments, with EXACT Decimal conservation:
 *   opening + gross accrual + adjustments − payments = closing.
 * A maker/checker freeze locks it (the checker must differ from the calculator); a
 * correction after freeze is an adjustment or a governed reopen — never a silent
 * rewrite. NO payment (F10.4 stop). Decimal money only (§0.4 — no JS float).
 * GATED behind the F10.1 sign-off.
 */

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "FINANCE_OFFICER"]);
const MONEY_DP = 4; // Decimal(19,4); approved rounding = half-up at the period total
function requireManager(actor: CapitationActor) {
  if (!MANAGER_ROLES.has(actor.role)) throw new CapitationError("FORBIDDEN", "Capitation management requires a finance role.");
}

function round(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);
}

export interface AccrualResult {
  eligibleLifeCount: number;
  rate: string;
  grossAccrual: string;
  adjustmentTotal: string;
  openingBalance: string;
  amountPayable: string;
  closingBalance: string;
  calculationVersion: number;
}

export const CapitationAccrualService = {
  /**
   * Calculate (or recalculate, while CALCULATED) the period accrual from the frozen
   * snapshot + effective rate + approved adjustments. Idempotent in VALUE — a
   * recompute over the same facts yields the same money (the version increments).
   */
  async calculateAccrual(actor: CapitationActor, periodId: string, opts: { countedVisits?: number } = {}): Promise<AccrualResult> {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({
      where: { id: periodId, tenantId: actor.tenantId },
      select: { id: true, arrangementId: true, period: true, status: true, eligibleLifeCount: true, eligibleLifeControlHash: true, rate: true, amountPaid: true, calculationVersion: true, arrangement: { select: { rateBasis: true } } },
    });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "CALCULATED") {
      throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; accrual computes only after the snapshot is frozen (CALCULATED) and before it is FROZEN.`);
    }
    if (!period.eligibleLifeControlHash) throw new CapitationError("INVALID_INPUT", "Freeze the eligible-life snapshot before calculating accrual.");

    const rate = new Prisma.Decimal(period.rate);
    // Gross accrual by rate basis (only what the pilot requires — §F10.4).
    let gross: Prisma.Decimal;
    switch (period.arrangement.rateBasis) {
      case "PMPM": gross = rate.mul(period.eligibleLifeCount); break;
      case "PER_VISIT": gross = rate.mul(opts.countedVisits ?? 0); break; // visits linked in F10.5
      case "FIXED_PERIOD": gross = rate; break;
      default: gross = new Prisma.Decimal(0);
    }
    gross = round(gross);

    // Sum the append-only approved adjustments (signed).
    const adj = await prisma.capitationAdjustment.aggregate({ where: { periodId }, _sum: { amount: true } });
    const adjustmentTotal = round(new Prisma.Decimal(adj._sum.amount ?? 0));

    // Opening = the immediately-prior period's closing for this arrangement (else 0).
    const prior = await prisma.capitationPeriod.findFirst({
      where: { arrangementId: period.arrangementId, period: { lt: period.period } },
      orderBy: { period: "desc" },
      select: { closingBalance: true },
    });
    const openingBalance = round(new Prisma.Decimal(prior?.closingBalance ?? 0));
    const amountPaid = round(new Prisma.Decimal(period.amountPaid));

    const amountPayable = round(gross.add(adjustmentTotal));
    const closingBalance = round(openingBalance.add(gross).add(adjustmentTotal).sub(amountPaid));
    const calculationVersion = period.calculationVersion + 1;

    await prisma.capitationPeriod.update({
      where: { id: periodId },
      data: {
        grossAccrual: gross, adjustmentTotal, openingBalance, amountPayable, closingBalance, calculationVersion,
        controlTotals: { eligibleLifeCount: period.eligibleLifeCount, rate: rate.toFixed(MONEY_DP), grossAccrual: gross.toFixed(MONEY_DP), adjustmentTotal: adjustmentTotal.toFixed(MONEY_DP), calculatedById: actor.userId } as Prisma.InputJsonValue,
      },
    });

    return {
      eligibleLifeCount: period.eligibleLifeCount, rate: rate.toFixed(MONEY_DP), grossAccrual: gross.toFixed(MONEY_DP), adjustmentTotal: adjustmentTotal.toFixed(MONEY_DP),
      openingBalance: openingBalance.toFixed(MONEY_DP), amountPayable: amountPayable.toFixed(MONEY_DP), closingBalance: closingBalance.toFixed(MONEY_DP), calculationVersion,
    };
  },

  /**
   * Maker/checker freeze: CALCULATED → FROZEN. The checker (this actor) MUST differ
   * from the calculator recorded on the period's control totals. A frozen accrual is
   * immutable — later corrections go through an adjustment / governed reopen (F10.4 §6).
   */
  async freezeAccrual(actor: CapitationActor, periodId: string) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true, calculationVersion: true, controlTotals: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "CALCULATED") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; only a CALCULATED period can be frozen.`);
    if (period.calculationVersion < 1) throw new CapitationError("INVALID_INPUT", "Calculate the accrual before freezing.");
    const calculatedById = (period.controlTotals as { calculatedById?: string } | null)?.calculatedById;
    if (calculatedById && calculatedById === actor.userId) {
      throw new CapitationError("FORBIDDEN", "The accrual freeze (checker) must be a different actor from the calculator (maker).");
    }
    return prisma.capitationPeriod.update({ where: { id: periodId }, data: { status: "FROZEN", frozenAt: new Date(), frozenById: actor.userId } });
  },
} as const;
