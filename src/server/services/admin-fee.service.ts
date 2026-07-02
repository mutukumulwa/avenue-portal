import { prisma } from "@/lib/prisma";
import type { AdminFeeMethod } from "@prisma/client";

/**
 * TPA admin-fee accrual (Medvex spec §2.3 / gap G2.3). The TPA's primary revenue
 * line. Computes fees per method and writes the AdminFeeLedger — the system of
 * record that feeds invoicing (G5.8) and the IRA compliance levy (G1.1).
 */
export class AdminFeeService {
  /**
   * Pure accrual: given a method, its rate, and the period driver (member count,
   * claims paid, event count), return the fee amount + the basis (for audit).
   *  - PMPM / FLAT_PER_INSURED: rate × member count.
   *  - PCT_OF_CLAIMS: rate% × claims paid.
   *  - CASE_MGMT / PREAUTH / CROSS_BORDER / CARD_*: rate × event count.
   */
  static computeAccrual(method: AdminFeeMethod, rate: number, driver: number): { amount: number; basis: number } {
    switch (method) {
      case "PCT_OF_CLAIMS":
        return { amount: round2((rate / 100) * driver), basis: driver };
      case "PMPM":
      case "FLAT_PER_INSURED":
      case "CASE_MGMT":
      case "PREAUTH":
      case "CROSS_BORDER":
      case "CARD_ISSUANCE":
      case "CARD_REPLACEMENT":
      default:
        return { amount: round2(rate * driver), basis: driver };
    }
  }

  /**
   * Accrue PMPM fees for a period (e.g. "2026-07"): for each active PMPM
   * agreement, count active members in scope and write/refresh the ledger entry
   * (idempotent per agreement+period). Returns the entries written.
   */
  static async accruePmpmForPeriod(tenantId: string, period: string) {
    const agreements = await prisma.adminFeeAgreement.findMany({
      where: { tenantId, method: "PMPM", isActive: true },
    });

    const written: Array<{ agreementId: string; amount: number; members: number }> = [];
    for (const a of agreements) {
      const members = await prisma.member.count({
        where: {
          tenantId,
          status: "ACTIVE",
          ...(a.groupId ? { groupId: a.groupId } : a.clientId ? { group: { clientId: a.clientId } } : {}),
        },
      });
      const { amount, basis } = this.computeAccrual("PMPM", Number(a.rate), members);

      const existing = await prisma.adminFeeLedgerEntry.findFirst({
        where: { tenantId, agreementId: a.id, period, status: { not: "INVOICED" } },
        select: { id: true },
      });
      if (existing) {
        await prisma.adminFeeLedgerEntry.update({ where: { id: existing.id }, data: { amount, basis } });
      } else {
        await prisma.adminFeeLedgerEntry.create({
          data: {
            tenantId, clientId: a.clientId, agreementId: a.id, method: "PMPM",
            period, basis, amount, currency: a.currency, status: "ACCRUED",
          },
        });
      }
      written.push({ agreementId: a.id, amount, members });
    }
    return written;
  }

  /** Record an event-driven fee (case-mgmt / pre-auth / card) against an agreement. */
  static async recordEventFee(
    tenantId: string,
    agreementId: string,
    opts: { count?: number; period?: string } = {},
  ) {
    const a = await prisma.adminFeeAgreement.findFirst({ where: { id: agreementId, tenantId, isActive: true } });
    if (!a) throw new Error("Admin-fee agreement not found");
    const count = opts.count ?? 1;
    const { amount, basis } = this.computeAccrual(a.method, Number(a.rate), count);
    return prisma.adminFeeLedgerEntry.create({
      data: {
        tenantId, clientId: a.clientId, agreementId: a.id, method: a.method,
        period: opts.period ?? "", basis, amount, currency: a.currency, status: "ACCRUED",
      },
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
