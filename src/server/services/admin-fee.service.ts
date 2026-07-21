import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";
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

  /**
   * Accrue ALL recurring-method fees for a period ("YYYY-MM"): PMPM and
   * FLAT_PER_INSURED from the active-member count, PCT_OF_CLAIMS from claims
   * PAID within the period. Idempotent per agreement+period (re-runs refresh
   * the non-invoiced entry, so a daily job keeps the current month current).
   * Event-driven methods accrue via recordEventFee at their call-sites.
   */
  static async accrueRecurringForPeriod(tenantId: string, period: string) {
    const agreements = await prisma.adminFeeAgreement.findMany({
      where: {
        tenantId,
        isActive: true,
        method: { in: ["PMPM", "FLAT_PER_INSURED", "PCT_OF_CLAIMS"] },
      },
    });

    const [y, m] = period.split("-").map(Number);
    const periodStart = new Date(y, m - 1, 1);
    const periodEnd = new Date(y, m, 1);

    const written: Array<{ agreementId: string; method: AdminFeeMethod; amount: number; basis: number }> = [];
    for (const a of agreements) {
      const scope = a.groupId
        ? { groupId: a.groupId }
        : a.clientId
          ? { group: { clientId: a.clientId } }
          : {};

      let driver: number;
      if (a.method === "PCT_OF_CLAIMS") {
        const paid = await prisma.claim.aggregate({
          _sum: { approvedAmount: true },
          where: {
            tenantId,
            status: "PAID",
            paidAt: { gte: periodStart, lt: periodEnd },
            ...(a.groupId || a.clientId ? { member: scope } : {}),
          },
        });
        driver = Number(paid._sum.approvedAmount ?? 0);
      } else {
        driver = await prisma.member.count({
          where: { tenantId, status: "ACTIVE", ...scope },
        });
      }

      const { amount, basis } = this.computeAccrual(a.method, Number(a.rate), driver);

      const existing = await prisma.adminFeeLedgerEntry.findFirst({
        where: { tenantId, agreementId: a.id, period, status: { not: "INVOICED" } },
        select: { id: true },
      });
      if (existing) {
        await prisma.adminFeeLedgerEntry.update({ where: { id: existing.id }, data: { amount, basis } });
      } else {
        await prisma.adminFeeLedgerEntry.create({
          data: {
            tenantId, clientId: a.clientId, agreementId: a.id, method: a.method,
            period, basis, amount, currency: a.currency, status: "ACCRUED",
          },
        });
      }
      written.push({ agreementId: a.id, method: a.method, amount, basis });
    }
    return written;
  }

  /**
   * Invoice a client's accrued admin fees (Medvex spec §5.8 / G5.8). Rolls all
   * ACCRUED ledger entries for the client (optionally a period) into a single
   * admin-fee invoice reference and marks them INVOICED. Returns the invoice
   * summary, or null when nothing is accrued. Amounts stay in the ledger currency
   * (multi-currency, G3.5). This is the ledger → invoicing bridge; GL posting +
   * receipting build on it.
   */
  static async invoiceAccrued(tenantId: string, clientId: string, period?: string) {
    const entries = await prisma.adminFeeLedgerEntry.findMany({
      where: { tenantId, clientId, status: "ACCRUED", ...(period ? { period } : {}) },
      select: { id: true, amount: true, currency: true },
    });
    if (entries.length === 0) return null;

    const total = round2(entries.reduce((s, e) => s + Number(e.amount), 0));
    const currency = entries[0].currency;
    const reference = await peekNextDocumentNumber("AFI", (yp) =>
      prisma.adminFeeLedgerEntry
        .findFirst({ where: { tenantId, invoiceId: { startsWith: yp } }, orderBy: { invoiceId: "desc" }, select: { invoiceId: true } })
        .then((r) => r?.invoiceId ?? null),
    );

    await prisma.adminFeeLedgerEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { status: "INVOICED", invoiceId: reference },
    });
    return { reference, total, currency, entryCount: entries.length };
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
