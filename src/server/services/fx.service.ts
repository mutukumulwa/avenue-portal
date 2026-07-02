import { prisma } from "@/lib/prisma";

/**
 * Minimal FX service (Medvex spec §3.5 / gap G3.5). Base currency is UGX (AD-2).
 * Full FX gain/loss + consolidation come later; this provides the normalisation
 * the approval-matrix engine needs to compare amounts across currencies.
 *
 * `normalise(amount, currency)` converts an amount in `currency` to the base.
 * If currency === base, or no active FxRate is found, it returns the amount
 * unchanged (identity) — safe for the all-UGX common case until rates are
 * seeded.
 */

export const BASE_CURRENCY = "UGX";

export class FxService {
  /** Latest in-force rate where 1 `quote` = rate × base, or null. */
  static async rateAt(
    tenantId: string,
    quoteCurrency: string,
    date: Date = new Date(),
    base: string = BASE_CURRENCY,
  ): Promise<number | null> {
    if (quoteCurrency === base) return 1;
    const row = await prisma.fxRate.findFirst({
      where: {
        tenantId,
        baseCurrency: base,
        quoteCurrency,
        isActive: true,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      },
      orderBy: { effectiveFrom: "desc" },
    });
    return row ? Number(row.rate) : null;
  }

  /**
   * Convert `amount` in `currency` to the base currency. Returns
   * `{ baseAmount, rate, identity }`; `identity` is true when no conversion was
   * applied (same currency or missing rate).
   */
  static async normalise(
    tenantId: string,
    amount: number,
    currency: string,
    date: Date = new Date(),
  ): Promise<{ baseAmount: number; rate: number; identity: boolean }> {
    if (currency === BASE_CURRENCY) return { baseAmount: amount, rate: 1, identity: false };
    const rate = await this.rateAt(tenantId, currency, date);
    if (rate === null) return { baseAmount: amount, rate: 1, identity: true };
    return { baseAmount: amount * rate, rate, identity: false };
  }

  /**
   * FX gain/loss on a foreign-currency amount between the rate it was booked at
   * and a current/settlement rate (spec §3.5). Positive = gain (base value rose).
   * gainLoss = amount × (currentRate − bookedRate).
   */
  static gainLoss(amount: number, bookedRate: number, currentRate: number): {
    baseAtBooked: number;
    baseAtCurrent: number;
    gainLoss: number;
  } {
    const baseAtBooked = round2(amount * bookedRate);
    const baseAtCurrent = round2(amount * currentRate);
    return { baseAtBooked, baseAtCurrent, gainLoss: round2(baseAtCurrent - baseAtBooked) };
  }

  /**
   * Consolidate multi-currency amounts (e.g. a parent client + its subsidiaries)
   * to the base currency. Returns the base total plus a per-currency breakdown
   * (original + base-converted), for consolidated reporting (spec §3.5).
   */
  static async consolidate(
    tenantId: string,
    items: Array<{ amount: number; currency: string }>,
    date: Date = new Date(),
  ): Promise<{
    base: string;
    baseTotal: number;
    byCurrency: Array<{ currency: string; amount: number; baseAmount: number }>;
  }> {
    const grouped = new Map<string, number>();
    for (const it of items) {
      grouped.set(it.currency, (grouped.get(it.currency) ?? 0) + it.amount);
    }
    const byCurrency: Array<{ currency: string; amount: number; baseAmount: number }> = [];
    let baseTotal = 0;
    for (const [currency, amount] of grouped) {
      const { baseAmount } = await this.normalise(tenantId, amount, currency, date);
      byCurrency.push({ currency, amount, baseAmount });
      baseTotal += baseAmount;
    }
    byCurrency.sort((a, b) => b.baseAmount - a.baseAmount);
    return { base: BASE_CURRENCY, baseTotal, byCurrency };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
