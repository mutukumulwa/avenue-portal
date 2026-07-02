import { prisma } from "@/lib/prisma";

/**
 * Drug-level exclusion control (Medvex spec §H.2 / gap G9.5). An excluded-drug
 * list per client and/or package, enforced at adjudication against
 * ClaimLine.drugCode. Complements service-level + ICD-10 diagnosis exclusions.
 */
export class DrugExclusionService {
  /** Active, in-force exclusions applicable to a (client, package) context. */
  static async getExcludedCodes(
    tenantId: string,
    opts: { clientId?: string | null; packageId?: string | null; date?: Date } = {},
  ): Promise<Set<string>> {
    const date = opts.date ?? new Date();
    const rows = await prisma.drugExclusion.findMany({
      where: {
        tenantId,
        isActive: true,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
        AND: [
          { OR: [{ clientId: opts.clientId ?? null }, { clientId: null }] },
          { OR: [{ packageId: opts.packageId ?? null }, { packageId: null }] },
        ],
      },
      select: { drugCode: true },
    });
    return new Set(rows.map((r) => r.drugCode.trim().toUpperCase()));
  }

  /** True when a drug code is in the excluded set (case-insensitive). */
  static isExcluded(drugCode: string | null | undefined, excluded: Set<string>): boolean {
    if (!drugCode) return false;
    return excluded.has(drugCode.trim().toUpperCase());
  }

  /**
   * Partition claim lines into excluded (drug on the list) and payable, for the
   * adjudicator to zero the excluded lines with a reason.
   */
  static partitionLines<T extends { drugCode?: string | null }>(
    lines: T[],
    excluded: Set<string>,
  ): { excluded: T[]; payable: T[] } {
    const ex: T[] = [];
    const ok: T[] = [];
    for (const l of lines) (this.isExcluded(l.drugCode, excluded) ? ex : ok).push(l);
    return { excluded: ex, payable: ok };
  }
}
