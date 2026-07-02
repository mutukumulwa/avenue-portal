import { prisma } from "@/lib/prisma";
import { FxService } from "./fx.service";

/**
 * Consolidated parent + per-subsidiary reporting (Medvex spec §3.5). Rolls a
 * regional parent client and its subsidiaries — each potentially a different
 * currency — up to the base currency (UGX) at in-force FX, for a consolidated
 * claims-experience view.
 */
export class ClientConsolidationService {
  /**
   * Consolidated claims for a parent client + its subsidiaries. Each client's
   * claims are summed in its own currency, then normalised to base and totalled.
   */
  static async consolidateClaims(tenantId: string, parentClientId: string) {
    const clients = await prisma.client.findMany({
      where: { operatorTenantId: tenantId, OR: [{ id: parentClientId }, { parentClientId }] },
      select: { id: true, name: true, currency: true, parentClientId: true },
    });

    const perClient: Array<{ clientId: string; name: string; currency: string; amount: number; isParent: boolean }> = [];
    for (const c of clients) {
      const agg = await prisma.claim.aggregate({
        where: {
          tenantId,
          member: { group: { clientId: c.id } },
          status: { in: ["APPROVED", "PARTIALLY_APPROVED", "PAID"] },
        },
        _sum: { billedAmount: true },
      });
      perClient.push({
        clientId: c.id,
        name: c.name,
        currency: c.currency,
        amount: Number(agg._sum.billedAmount ?? 0),
        isParent: c.id === parentClientId,
      });
    }

    const consolidated = await FxService.consolidate(
      tenantId,
      perClient.map((p) => ({ amount: p.amount, currency: p.currency })),
    );

    return {
      parentClientId,
      base: consolidated.base,
      baseTotal: consolidated.baseTotal,
      byCurrency: consolidated.byCurrency,
      perClient,
    };
  }
}
