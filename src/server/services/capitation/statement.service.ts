import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { CapitationError, type CapitationActor } from "./arrangement.service";

/**
 * PNOS F10.6 — capitation statement, approval, and payment.
 *
 * A canonical statement reconciles lives/rate/accrual/adjustments/encounters/
 * carve-outs/payment/balance from the frozen period (provider + finance see the
 * same numbers). A maker/checker approves the payable; payment records the
 * disbursement, advancing amountPaid with EXACT conservation
 * (opening + accrual + adjustments − payments = closing); a failed/reversed payment
 * restores the balance. NO second arrangement type until pilot sign-off (F10.6
 * stop). The voucher/GL/disbursement OWNERS are the F6 rails (referenced by id);
 * wiring their creation into the live finance path is the gated activation.
 * Decimal money only. GATED behind F10.1.
 */

const MANAGER_ROLES = new Set(["SUPER_ADMIN", "FINANCE_OFFICER"]);
const MONEY_DP = 4;
function requireManager(actor: CapitationActor) {
  if (!MANAGER_ROLES.has(actor.role)) throw new CapitationError("FORBIDDEN", "Capitation management requires a finance role.");
}
const D = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v);
const round = (d: Prisma.Decimal) => d.toDecimalPlaces(MONEY_DP, Prisma.Decimal.ROUND_HALF_UP);

export interface CapitationStatement {
  periodId: string;
  arrangementId: string;
  period: string;
  status: string;
  currency: string;
  lives: number;
  rate: string;
  grossAccrual: string;
  adjustmentTotal: string;
  adjustments: Array<{ category: string; amount: string; reason: string | null }>;
  encounters: { included: number; carveOut: number };
  openingBalance: string;
  amountPayable: string;
  amountPaid: string;
  closingBalance: string;
  conserves: boolean; // opening + gross + adj − paid == closing
}

export const CapitationStatementService = {
  /**
   * Reconcile a period into a statement. Provider-safe: counts + money only, NO
   * member-level clinical detail and NO internal GL/voucher ids. The numbers ARE
   * the persisted period numbers (provider/finance parity).
   */
  async getStatement(actor: CapitationActor, periodId: string): Promise<CapitationStatement> {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({
      where: { id: periodId, tenantId: actor.tenantId },
      select: {
        id: true, arrangementId: true, period: true, status: true, eligibleLifeCount: true, rate: true,
        grossAccrual: true, adjustmentTotal: true, openingBalance: true, amountPayable: true, amountPaid: true, closingBalance: true,
        adjustments: { select: { category: true, amount: true, reason: true }, orderBy: { createdAt: "asc" } },
        arrangement: { select: { currency: true } },
      },
    });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    const [included, carveOut] = await Promise.all([
      prisma.capitationEncounterLink.count({ where: { tenantId: actor.tenantId, periodId, funding: "INCLUDED" } }),
      prisma.capitationEncounterLink.count({ where: { tenantId: actor.tenantId, periodId, funding: "CARVE_OUT" } }),
    ]);

    const conserves = round(D(period.openingBalance).add(period.grossAccrual).add(period.adjustmentTotal).sub(period.amountPaid)).equals(round(D(period.closingBalance)));

    return {
      periodId: period.id, arrangementId: period.arrangementId, period: period.period, status: period.status, currency: period.arrangement.currency,
      lives: period.eligibleLifeCount, rate: D(period.rate).toFixed(MONEY_DP), grossAccrual: D(period.grossAccrual).toFixed(MONEY_DP),
      adjustmentTotal: D(period.adjustmentTotal).toFixed(MONEY_DP), adjustments: period.adjustments.map((a) => ({ category: a.category, amount: D(a.amount).toFixed(MONEY_DP), reason: a.reason })),
      encounters: { included, carveOut }, openingBalance: D(period.openingBalance).toFixed(MONEY_DP), amountPayable: D(period.amountPayable).toFixed(MONEY_DP),
      amountPaid: D(period.amountPaid).toFixed(MONEY_DP), closingBalance: D(period.closingBalance).toFixed(MONEY_DP), conserves,
    };
  },

  /** Maker/checker: approve the payable of a FROZEN period. The approver must differ from the accrual freezer. */
  async approvePayable(actor: CapitationActor, periodId: string) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true, frozenById: true, approvedById: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "FROZEN") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; only a FROZEN period's payable can be approved.`);
    if (period.frozenById && period.frozenById === actor.userId) throw new CapitationError("FORBIDDEN", "The payable approver must differ from the accrual freezer (maker/checker).");
    return prisma.capitationPeriod.update({ where: { id: periodId }, data: { approvedById: actor.userId, approvedAt: new Date() } });
  },

  /**
   * Record a (confirmed) provider disbursement against an approved period. Advances
   * amountPaid, recomputes closing under conservation, and marks PAID when fully
   * settled. disbursementId references the F6 ProviderDisbursement (its creation in
   * the live finance path is the gated activation).
   */
  async recordPayment(actor: CapitationActor, periodId: string, input: { amount: string | number; disbursementId?: string; voucherId?: string }) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true, approvedAt: true, openingBalance: true, grossAccrual: true, adjustmentTotal: true, amountPayable: true, amountPaid: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "FROZEN") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; payment records only against a FROZEN, approved period.`);
    if (!period.approvedAt) throw new CapitationError("INVALID_INPUT", "The payable must be approved before payment.");

    const newPaid = round(D(period.amountPaid).add(input.amount));
    if (newPaid.greaterThan(D(period.amountPayable))) throw new CapitationError("INVALID_INPUT", "Payment exceeds the approved payable.");
    const closing = round(D(period.openingBalance).add(period.grossAccrual).add(period.adjustmentTotal).sub(newPaid));
    const fullyPaid = newPaid.equals(round(D(period.amountPayable)));

    return prisma.capitationPeriod.update({
      where: { id: periodId },
      data: { amountPaid: newPaid, closingBalance: closing, ...(fullyPaid ? { status: "PAID" } : {}), ...(input.disbursementId ? { disbursementId: input.disbursementId } : {}), ...(input.voucherId ? { voucherId: input.voucherId } : {}) },
    });
  },

  /**
   * Reverse a payment (failed/reversed disbursement). Restores amountPaid + closing
   * and returns the period to FROZEN — a failed payment does not reduce the balance
   * until a real reversal is recorded (PNO-CAP-006/007).
   */
  async reversePayment(actor: CapitationActor, periodId: string, input: { amount: string | number; reason: string }) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true, openingBalance: true, grossAccrual: true, adjustmentTotal: true, amountPaid: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "PAID" && period.status !== "FROZEN") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; only a FROZEN/PAID period's payment can be reversed.`);
    const newPaid = round(D(period.amountPaid).sub(input.amount));
    if (newPaid.isNegative()) throw new CapitationError("INVALID_INPUT", "Reversal exceeds the amount paid.");
    const closing = round(D(period.openingBalance).add(period.grossAccrual).add(period.adjustmentTotal).sub(newPaid));
    return prisma.capitationPeriod.update({ where: { id: periodId }, data: { amountPaid: newPaid, closingBalance: closing, status: "FROZEN" } });
  },

  /** Sign off a fully-paid period. PAID → CLOSED (immutable thereafter). */
  async closePeriod(actor: CapitationActor, periodId: string) {
    requireManager(actor);
    const period = await prisma.capitationPeriod.findFirst({ where: { id: periodId, tenantId: actor.tenantId }, select: { id: true, status: true } });
    if (!period) throw new CapitationError("NOT_FOUND", "No such period.");
    if (period.status !== "PAID") throw new CapitationError("PERIOD_IMMUTABLE", `Period is ${period.status}; only a PAID period can be closed.`);
    return prisma.capitationPeriod.update({ where: { id: periodId }, data: { status: "CLOSED" } });
  },
} as const;
