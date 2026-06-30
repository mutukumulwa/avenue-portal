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
}
