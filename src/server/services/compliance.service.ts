import { prisma } from "@/lib/prisma";

/**
 * TPA compliance register (Medvex spec §1.1 / gap G1.1). The operator's own
 * regulatory standing for IRA-UG: the annual compliance-levy return (computed
 * from the admin-fee ledger — the fees-received system of record), director
 * residency-majority validation, and obligation status.
 */
export class ComplianceService {
  /**
   * Compute (and persist) the annual compliance levy for a period (e.g. "2026").
   * Basis = admin fees recorded in the ledger for that year; amount = basis × rate%.
   * Idempotent per tenant+period.
   */
  static async computeLevy(tenantId: string, period: string, ratePercent: number) {
    const agg = await prisma.adminFeeLedgerEntry.aggregate({
      where: { tenantId, period: { startsWith: period } },
      _sum: { amount: true },
    });
    const feesReceived = Number(agg._sum.amount ?? 0);
    const amount = round2((feesReceived * ratePercent) / 100);

    return prisma.complianceLevyComputation.upsert({
      where: { tenantId_period: { tenantId, period } },
      update: { feesReceivedBasis: feesReceived, ratePercent, amount },
      create: { tenantId, period, feesReceivedBasis: feesReceived, ratePercent, amount },
    });
  }

  /**
   * Director residency check (IRA-UG): at least 3 directors and a resident
   * majority (>50% Uganda-resident).
   */
  static async directorResidencyStatus(tenantId: string) {
    const directors = await prisma.directorRegister.findMany({
      where: { tenantId, isActive: true },
      select: { isResident: true },
    });
    const total = directors.length;
    const resident = directors.filter((d) => d.isResident).length;
    return { total, resident, ok: total >= 3 && resident > total / 2 };
  }

  /**
   * Obligation status (traffic-light) for the compliance dashboard: which of the
   * licence / security deposit / indemnity cover are missing or expiring soon.
   */
  static async obligationStatus(tenantId: string, withinDays = 60) {
    const now = new Date();
    const soon = new Date(now.getTime() + withinDays * 24 * 3600 * 1000);
    const [licence, deposit, indemnity] = await Promise.all([
      prisma.regulatoryLicence.findFirst({ where: { tenantId, status: "ACTIVE" }, orderBy: { expiresAt: "desc" } }),
      prisma.securityDeposit.findFirst({ where: { tenantId, verifiedAt: { not: null } } }),
      prisma.indemnityCover.findFirst({ where: { tenantId, periodEnd: { gte: now } }, orderBy: { periodEnd: "desc" } }),
    ]);
    return {
      licence: state(licence?.expiresAt, now, soon, !!licence),
      securityDeposit: deposit ? "OK" : "MISSING",
      indemnity: state(indemnity?.periodEnd, now, soon, !!indemnity),
    };
  }
}

function state(expiry: Date | undefined | null, now: Date, soon: Date, exists: boolean): "OK" | "EXPIRING" | "EXPIRED" | "MISSING" {
  if (!exists || !expiry) return "MISSING";
  if (expiry < now) return "EXPIRED";
  if (expiry < soon) return "EXPIRING";
  return "OK";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
