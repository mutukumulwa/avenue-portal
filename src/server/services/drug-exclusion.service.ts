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

  /**
   * Intake enforcement: DECLINE every claim line whose drugCode is on the
   * effective (client, package) exclusion list, with the reason recorded on the
   * line. Returns the excluded count/amount and the remaining payable amount so
   * the intake pipeline can adjudicate on the net.
   */
  static async applyToClaim(
    tenantId: string,
    claimId: string,
  ): Promise<{ excludedCount: number; excludedAmount: number; payableAmount: number }> {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId, tenantId },
      select: {
        dateOfService: true,
        claimLines: { select: { id: true, drugCode: true, billedAmount: true, adjudicationDecision: true } },
        member: { select: { packageId: true, group: { select: { clientId: true } } } },
      },
    });
    if (!claim) return { excludedCount: 0, excludedAmount: 0, payableAmount: 0 };

    const excluded = await this.getExcludedCodes(tenantId, {
      clientId: claim.member?.group?.clientId ?? null,
      packageId: claim.member?.packageId ?? null,
      date: claim.dateOfService,
    });

    let excludedCount = 0;
    let excludedAmount = 0;
    let payableAmount = 0;

    for (const line of claim.claimLines) {
      if (this.isExcluded(line.drugCode, excluded)) {
        excludedCount += 1;
        excludedAmount += Number(line.billedAmount);
        if (line.adjudicationDecision !== "DECLINED") {
          await prisma.claimLine.update({
            where: { id: line.id },
            data: {
              adjudicationDecision: "DECLINED",
              approvedAmount: 0,
              declineReason: `Drug ${line.drugCode?.trim().toUpperCase()} is excluded for this client/package (G9.5)`,
            },
          });
        }
      } else {
        payableAmount += Number(line.billedAmount);
      }
    }

    return { excludedCount, excludedAmount, payableAmount };
  }
}
