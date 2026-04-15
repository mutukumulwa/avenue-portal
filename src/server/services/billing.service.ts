import { prisma } from "@/lib/prisma";

export class BillingService {
  /**
   * Generate monthly invoices for all active groups in a tenant.
   * Called by the billing-run background job.
   */
  static async runMonthlyBillingCycle(tenantId: string, period: string) {
    const activeGroups = await prisma.group.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: {
        _count: { select: { members: { where: { status: "ACTIVE" } } } },
        package: true,
      },
    });

    const invoices = [];
    for (const group of activeGroups) {
      const memberCount = group._count.members;
      if (memberCount === 0) continue;

      const ratePerMember = Number(group.contributionRate);
      const totalAmount = memberCount * ratePerMember;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      const count = await prisma.invoice.count({ where: { tenantId } });
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

      const invoice = await prisma.invoice.create({
        data: {
          tenantId,
          invoiceNumber,
          groupId: group.id,
          period,
          memberCount,
          ratePerMember,
          totalAmount,
          paidAmount: 0,
          balance: totalAmount,
          dueDate,
          status: "DRAFT",
        },
      });

      invoices.push(invoice);
    }

    return invoices;
  }

  /**
   * Mark overdue invoices (SENT/PARTIALLY_PAID past their due date).
   * Called nightly by the suspension-check job.
   */
  static async markOverdueInvoices(tenantId: string) {
    return prisma.invoice.updateMany({
      where: {
        tenantId,
        status: { in: ["SENT", "PARTIALLY_PAID"] },
        dueDate: { lt: new Date() },
      },
      data: { status: "OVERDUE" },
    });
  }

  /**
   * Get an aging report — outstanding invoices grouped by days overdue.
   */
  static async getAgingReport(tenantId: string) {
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      },
      include: { group: { select: { name: true } } },
    });

    const now = new Date();
    const buckets = { current: 0, days30: 0, days60: 0, days90plus: 0 };

    for (const inv of invoices) {
      const daysOverdue = Math.max(
        0,
        Math.ceil((now.getTime() - inv.dueDate.getTime()) / (1000 * 3600 * 24))
      );
      const balance = Number(inv.balance);
      if (daysOverdue === 0) buckets.current += balance;
      else if (daysOverdue <= 30) buckets.days30 += balance;
      else if (daysOverdue <= 60) buckets.days60 += balance;
      else buckets.days90plus += balance;
    }

    return { invoices, buckets };
  }

  /**
   * Calculate the pro-rata adjustment amount for an endorsement.
   * @param dailyRate  - contribution rate per member per day
   * @param effectiveDate - endorsement effective date
   * @param periodEndDate - end of the current billing period (group renewal date)
   */
  static calculateProRata(
    dailyRate: number,
    effectiveDate: Date,
    periodEndDate: Date
  ): number {
    const msPerDay = 1000 * 3600 * 24;
    const remainingDays = Math.max(
      0,
      Math.ceil((periodEndDate.getTime() - effectiveDate.getTime()) / msPerDay)
    );
    return parseFloat((dailyRate * remainingDays).toFixed(2));
  }
}
