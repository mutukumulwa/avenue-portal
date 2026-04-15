import { prisma } from "@/lib/prisma";

export class CommissionService {
  /**
   * Calculate and record commissions for all brokers in a given period.
   * Called by the commission-calc background job after billing runs.
   */
  static async calculateCommissions(tenantId: string, period: string) {
    const brokers = await prisma.broker.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: {
        groups: {
          where: { status: "ACTIVE" },
          include: {
            _count: { select: { members: { where: { status: "ACTIVE" } } } },
          },
        },
      },
    });

    const commissions = [];
    for (const broker of brokers) {
      for (const group of broker.groups) {
        const memberCount = group._count.members;
        if (memberCount === 0) continue;

        const contributionReceived = memberCount * Number(group.contributionRate);

        // Determine if this is a first-year or renewal group
        const groupAge = Math.floor(
          (new Date().getTime() - group.createdAt.getTime()) / (1000 * 3600 * 24 * 365)
        );
        const isFirstYear = groupAge < 1;

        const commissionRate = isFirstYear
          ? Number(broker.firstYearCommissionPct)
          : Number(broker.renewalCommissionPct);

        const commissionAmount = broker.flatFeePerMember
          ? memberCount * Number(broker.flatFeePerMember)
          : (contributionReceived * commissionRate) / 100;

        // Upsert to avoid duplicates if re-run
        const existing = await prisma.commission.findFirst({
          where: { brokerId: broker.id, period, groupId: group.id },
        });

        if (!existing) {
          const commission = await prisma.commission.create({
            data: {
              brokerId: broker.id,
              period,
              groupId: group.id,
              contributionReceived,
              commissionRate,
              commissionAmount,
              paymentStatus: "PENDING",
            },
          });
          commissions.push(commission);
        }
      }
    }

    return commissions;
  }

  /**
   * Get a commission statement for a broker over a date range.
   */
  static async getBrokerStatement(brokerId: string, fromPeriod: string, toPeriod: string) {
    return prisma.commission.findMany({
      where: {
        brokerId,
        period: { gte: fromPeriod, lte: toPeriod },
      },
      orderBy: { period: "asc" },
    });
  }
}
