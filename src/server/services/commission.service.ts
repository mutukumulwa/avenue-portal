import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const WHT_RATE = 0.10;
const VAT_RATE = 0.16;
const DEFAULT_IRA_LEVY_RATE = 0.002;

type Moneyish = Prisma.Decimal | number | string;

function toNumber(value: Moneyish | null | undefined): number {
  return value == null ? 0 : Number(value);
}

function money(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}

function firstDayOfPeriod(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, (month || 1) - 1, 1);
}

function lastDayOfPeriod(period: string): Date {
  const [year, month] = period.split("-").map(Number);
  return new Date(year, month || 1, 0, 23, 59, 59, 999);
}

function periodFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function isFirstContributionPeriod(group: { createdAt: Date }, periodStart: Date): boolean {
  const groupStart = new Date(group.createdAt.getFullYear(), group.createdAt.getMonth(), 1);
  return groupStart.getTime() === periodStart.getTime();
}

type ScheduleResolutionInput = {
  brokerId: string;
  groupId: string;
  packageId: string;
  clientType: string;
  asOfDate: Date;
};

type CommissionSource = {
  tenantId: string;
  brokerId: string;
  groupId: string;
  packageId: string;
  clientType: string;
  contributionReceiptId?: string;
  contributionAmount: number;
  period: string;
  groupCreatedAt: Date;
};

export class CommissionService {
  static async resolveSchedule(input: ScheduleResolutionInput) {
    const candidates = await prisma.brokerCommissionSchedule.findMany({
      where: {
        brokerId: input.brokerId,
        status: "ACTIVE",
        effectiveFrom: { lte: input.asOfDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.asOfDate } }],
      },
      include: { tiers: { orderBy: { tierOrder: "asc" } } },
      orderBy: [{ groupId: "desc" }, { packageId: "desc" }, { clientType: "desc" }, { effectiveFrom: "desc" }],
    });

    return candidates.find(schedule =>
      (!schedule.groupId || schedule.groupId === input.groupId) &&
      (!schedule.packageId || schedule.packageId === input.packageId) &&
      (!schedule.clientType || schedule.clientType === input.clientType)
    ) ?? null;
  }

  static determineRate(params: {
    schedule: NonNullable<Awaited<ReturnType<typeof CommissionService.resolveSchedule>>>;
    contributionAmount: number;
    memberCount: number;
    isFirstPeriod: boolean;
  }): number {
    const { schedule, contributionAmount, memberCount, isFirstPeriod } = params;
    const baseRate = isFirstPeriod ? toNumber(schedule.newBusinessRate) : toNumber(schedule.renewalRate);

    if (schedule.scheduleType === "FLAT_PERCENTAGE" || schedule.tiers.length === 0) {
      return baseRate;
    }

    const metricValueByTier = (metric: string) => {
      if (metric === "GROSS_CONTRIBUTION_BAND") return contributionAmount;
      if (metric === "MEMBER_COUNT_BAND") return memberCount;
      return contributionAmount;
    };

    const matchedTier = schedule.tiers.find(tier => {
      const value = metricValueByTier(tier.thresholdMetric);
      const min = toNumber(tier.thresholdMin);
      const max = tier.thresholdMax == null ? Number.POSITIVE_INFINITY : toNumber(tier.thresholdMax);
      return value >= min && value <= max;
    });

    return matchedTier ? toNumber(matchedTier.rate) : baseRate;
  }

  static calculateAmounts(params: {
    contributionAmount: number;
    rate: number;
    vatRegistered: boolean;
    iraLevyRate?: number;
  }) {
    const grossCommission = params.contributionAmount * params.rate;
    return this.calculateAmountsFromGross({
      grossCommission,
      vatRegistered: params.vatRegistered,
      iraLevyRate: params.iraLevyRate,
    });
  }

  static calculateAmountsFromGross(params: {
    grossCommission: number;
    vatRegistered: boolean;
    iraLevyRate?: number;
  }) {
    const grossCommission = params.grossCommission;
    const withholdingTax = grossCommission * WHT_RATE;
    const iraAgentLevy = grossCommission * (params.iraLevyRate ?? DEFAULT_IRA_LEVY_RATE);
    const vatAmount = params.vatRegistered ? grossCommission * VAT_RATE : 0;
    const netPayable = grossCommission - withholdingTax - iraAgentLevy + vatAmount;

    return {
      grossCommission: money(grossCommission),
      withholdingTax: money(withholdingTax),
      iraAgentLevy: money(iraAgentLevy),
      vatAmount: money(vatAmount),
      netPayable: money(netPayable),
    };
  }

  static async createLedgerEntryForSource(source: CommissionSource) {
    const broker = await prisma.broker.findUnique({
      where: { id: source.brokerId },
      select: {
        id: true,
        parentBrokerId: true,
        vatRegistered: true,
        firstYearCommissionPct: true,
        renewalCommissionPct: true,
        flatFeePerMember: true,
        canReceiveCommission: true,
        commissionBasis: true,
        referralFeeAmount: true,
      },
    });
    if (!broker) throw new Error("Broker not found.");
    if (!broker.canReceiveCommission || ["ATTRIBUTION_ONLY", "NONE"].includes(broker.commissionBasis)) return [];

    const periodStart = firstDayOfPeriod(source.period);
    const periodEnd = lastDayOfPeriod(source.period);
    const memberCount = await prisma.member.count({
      where: { groupId: source.groupId, status: "ACTIVE" },
    });
    const isFirstPeriod = isFirstContributionPeriod({ createdAt: source.groupCreatedAt }, periodStart);

    const schedule = await this.resolveSchedule({
      brokerId: source.brokerId,
      groupId: source.groupId,
      packageId: source.packageId,
      clientType: source.clientType,
      asOfDate: periodEnd,
    });

    const existing = await prisma.commissionLedgerEntry.findFirst({
      where: {
        brokerId: source.brokerId,
        groupId: source.groupId,
        contributionReceiptId: source.contributionReceiptId ?? null,
        earnedPeriodStart: periodStart,
      },
    });
    if (existing) return [existing];

    if (!schedule) {
      const pending = await prisma.commissionLedgerEntry.create({
        data: {
          brokerId: source.brokerId,
          groupId: source.groupId,
          contributionReceiptId: source.contributionReceiptId,
          state: "PENDING_RECONCILIATION",
          grossCommission: money(0),
          withholdingTax: money(0),
          vatAmount: money(0),
          iraAgentLevy: money(0),
          netPayable: money(0),
          earnedPeriodStart: periodStart,
          earnedPeriodEnd: periodEnd,
          notes: "No active commission schedule matched this contribution receipt.",
        },
      });
      return [pending];
    }

    const isReferralFee = broker.commissionBasis === "REFERRAL_FEE" && broker.referralFeeAmount !== null;
    const rate = isReferralFee
      ? 0
      : this.determineRate({
          schedule,
          contributionAmount: source.contributionAmount,
          memberCount,
          isFirstPeriod,
        });
    const amounts = isReferralFee
      ? this.calculateAmountsFromGross({
          grossCommission: toNumber(broker.referralFeeAmount),
          vatRegistered: broker.vatRegistered,
          iraLevyRate: 0,
        })
      : this.calculateAmounts({
          contributionAmount: source.contributionAmount,
          rate,
          vatRegistered: broker.vatRegistered,
        });

    const created = [];
    const producerEntry = await prisma.commissionLedgerEntry.create({
      data: {
        brokerId: source.brokerId,
        scheduleId: schedule.id,
        groupId: source.groupId,
        contributionReceiptId: source.contributionReceiptId,
        state: "EARNED",
        ...amounts,
        earnedPeriodStart: periodStart,
        earnedPeriodEnd: periodEnd,
        notes: isReferralFee ? "Fixed referral fee generated for this business source." : undefined,
      },
    });
    created.push(producerEntry);

    if (broker.parentBrokerId && schedule.overrideRate) {
      const ceiling = schedule.grossCommissionCeiling ? toNumber(schedule.grossCommissionCeiling) : Number.POSITIVE_INFINITY;
      const overrideRate = Math.max(0, Math.min(toNumber(schedule.overrideRate), ceiling - rate));
      if (overrideRate > 0) {
        const parent = await prisma.broker.findUnique({
          where: { id: broker.parentBrokerId },
          select: { vatRegistered: true, canReceiveCommission: true, commissionBasis: true },
        });
        if (!parent?.canReceiveCommission || ["ATTRIBUTION_ONLY", "NONE"].includes(parent.commissionBasis)) return created;
        const parentAmounts = this.calculateAmounts({
          contributionAmount: source.contributionAmount,
          rate: overrideRate,
          vatRegistered: parent?.vatRegistered ?? false,
        });
        created.push(await prisma.commissionLedgerEntry.create({
          data: {
            brokerId: broker.parentBrokerId,
            scheduleId: schedule.id,
            groupId: source.groupId,
            contributionReceiptId: source.contributionReceiptId,
            state: "EARNED",
            ...parentAmounts,
            earnedPeriodStart: periodStart,
            earnedPeriodEnd: periodEnd,
            notes: `Override commission generated from child broker ${source.brokerId}.`,
          },
        }));
      }
    }

    return created;
  }

  static async calculateFromPayment(paymentId: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: true,
        group: { select: { id: true, tenantId: true, brokerId: true, packageId: true, clientType: true, createdAt: true } },
      },
    });
    if (!payment?.group.brokerId) return [];

    return this.createLedgerEntryForSource({
      tenantId: payment.group.tenantId,
      brokerId: payment.group.brokerId,
      groupId: payment.group.id,
      packageId: payment.group.packageId,
      clientType: payment.group.clientType,
      contributionReceiptId: payment.id,
      contributionAmount: toNumber(payment.amount),
      period: payment.invoice?.period ?? periodFromDate(payment.paymentDate),
      groupCreatedAt: payment.group.createdAt,
    });
  }

  /**
   * Compatibility wrapper for the legacy monthly commission job.
   * It now writes both the legacy Commission records and richer ledger entries.
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
        const isFirstYear = Math.floor((Date.now() - group.createdAt.getTime()) / (1000 * 3600 * 24 * 365)) < 1;
        const commissionRate = isFirstYear
          ? Number(broker.firstYearCommissionPct)
          : Number(broker.renewalCommissionPct);
        const commissionAmount = broker.flatFeePerMember
          ? memberCount * Number(broker.flatFeePerMember)
          : (contributionReceived * commissionRate) / 100;

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

        await this.createLedgerEntryForSource({
          tenantId,
          brokerId: broker.id,
          groupId: group.id,
          packageId: group.packageId,
          clientType: group.clientType,
          contributionAmount: contributionReceived,
          period,
          groupCreatedAt: group.createdAt,
        });
      }
    }

    return commissions;
  }

  static async submitScheduleForApproval(scheduleId: string, userId: string) {
    void userId;
    const schedule = await prisma.brokerCommissionSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new Error("Commission schedule not found.");

    return prisma.brokerCommissionSchedule.update({
      where: { id: scheduleId },
      data: { status: "PENDING_APPROVAL" },
    });
  }

  static async approveSchedule(scheduleId: string, approverId: string) {
    const schedule = await prisma.brokerCommissionSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule) throw new Error("Commission schedule not found.");
    if (schedule.createdById === approverId) {
      throw new Error("Maker-checker violation: the schedule creator cannot approve it.");
    }

    return prisma.$transaction(async tx => {
      await tx.brokerCommissionSchedule.updateMany({
        where: {
          id: { not: schedule.id },
          brokerId: schedule.brokerId,
          status: "ACTIVE",
          packageId: schedule.packageId,
          groupId: schedule.groupId,
          clientType: schedule.clientType,
        },
        data: { status: "SUPERSEDED", effectiveTo: new Date(schedule.effectiveFrom.getTime() - 24 * 60 * 60 * 1000) },
      });

      return tx.brokerCommissionSchedule.update({
        where: { id: schedule.id },
        data: { status: "ACTIVE", approvedById: approverId, approvedAt: new Date() },
      });
    });
  }

  static async generatePayoutBatch(params: { asOfDate: Date; brokerIds?: string[]; generatedById: string }) {
    const entries = await prisma.commissionLedgerEntry.findMany({
      where: {
        state: { in: ["EARNED", "ACCRUED", "PAYABLE"] },
        payoutBatchId: null,
        earnedPeriodEnd: { lte: params.asOfDate },
        netPayable: { gt: 0 },
        broker: { canReceiveCommission: true, commissionBasis: { notIn: ["ATTRIBUTION_ONLY", "NONE"] } },
        ...(params.brokerIds?.length ? { brokerId: { in: params.brokerIds } } : {}),
      },
    });

    const totals = entries.reduce((acc, entry) => {
      acc.totalGross += toNumber(entry.grossCommission);
      acc.totalWHT += toNumber(entry.withholdingTax);
      acc.totalVAT += toNumber(entry.vatAmount);
      acc.totalLevy += toNumber(entry.iraAgentLevy);
      acc.totalNet += toNumber(entry.netPayable);
      return acc;
    }, { totalGross: 0, totalWHT: 0, totalVAT: 0, totalLevy: 0, totalNet: 0 });

    return prisma.$transaction(async tx => {
      const batch = await tx.commissionPayoutBatch.create({
        data: {
          batchReference: `CPB-${params.asOfDate.getFullYear()}-${Date.now()}`,
          batchDate: params.asOfDate,
          totalGross: money(totals.totalGross),
          totalWHT: money(totals.totalWHT),
          totalVAT: money(totals.totalVAT),
          totalLevy: money(totals.totalLevy),
          totalNet: money(totals.totalNet),
          status: "DRAFT",
          generatedById: params.generatedById,
        },
      });

      if (entries.length > 0) {
        await tx.commissionLedgerEntry.updateMany({
          where: { id: { in: entries.map(e => e.id) } },
          data: { payoutBatchId: batch.id, state: "PAYABLE", stateAsOf: new Date() },
        });
      }

      return batch;
    });
  }

  static async reconcilePayments(params: { period?: string; limit?: number } = {}) {
    const period = params.period ?? periodFromDate(new Date());
    const periodStart = firstDayOfPeriod(period);
    const periodEnd = lastDayOfPeriod(period);
    const limit = params.limit ?? 500;

    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: { gte: periodStart, lte: periodEnd },
        group: { brokerId: { not: null } },
      },
      include: { group: true },
      orderBy: { paymentDate: "asc" },
      take: limit,
    });

    let createdOrExisting = 0;
    for (const payment of payments) {
      if (!payment.group.brokerId) continue;

      await this.createLedgerEntryForSource({
        tenantId: payment.group.tenantId,
        brokerId: payment.group.brokerId,
        groupId: payment.groupId,
        packageId: payment.group.packageId,
        clientType: payment.group.clientType,
        contributionReceiptId: payment.id,
        contributionAmount: toNumber(payment.amount),
        period: periodFromDate(payment.paymentDate),
        groupCreatedAt: payment.group.createdAt,
      });
      createdOrExisting += 1;
    }

    const pendingEntries = await prisma.commissionLedgerEntry.findMany({
      where: {
        state: "PENDING_RECONCILIATION",
        earnedPeriodStart: { gte: periodStart, lte: periodEnd },
      },
      take: limit,
    });

    let reconciledPending = 0;
    for (const entry of pendingEntries) {
      if (!entry.contributionReceiptId) continue;

      const payment = await prisma.payment.findUnique({
        where: { id: entry.contributionReceiptId },
        select: { amount: true },
      });
      if (!payment) continue;

      const [group, broker] = await Promise.all([
        prisma.group.findUnique({ where: { id: entry.groupId } }),
        prisma.broker.findUnique({ where: { id: entry.brokerId } }),
      ]);
      if (!group || !broker) continue;

      const schedule = await this.resolveSchedule({
        brokerId: entry.brokerId,
        groupId: entry.groupId,
        packageId: group.packageId,
        clientType: group.clientType,
        asOfDate: entry.earnedPeriodStart,
      });

      if (!schedule) continue;

      const activeMemberCount = await prisma.member.count({
        where: { groupId: entry.groupId, status: "ACTIVE" },
      });
      const contributionAmount = toNumber(payment.amount);
      const rate = this.determineRate({
        schedule,
        contributionAmount,
        memberCount: activeMemberCount,
        isFirstPeriod: isFirstContributionPeriod(group, entry.earnedPeriodStart),
      });
      const amounts = this.calculateAmounts({
        contributionAmount,
        rate,
        vatRegistered: broker.vatRegistered,
      });

      await prisma.commissionLedgerEntry.update({
        where: { id: entry.id },
        data: {
          scheduleId: schedule.id,
          state: "EARNED",
          stateAsOf: new Date(),
          grossCommission: amounts.grossCommission,
          withholdingTax: amounts.withholdingTax,
          vatAmount: amounts.vatAmount,
          iraAgentLevy: amounts.iraAgentLevy,
          netPayable: amounts.netPayable,
          notes: "Reconciled after active commission schedule was found.",
        },
      });
      reconciledPending += 1;
    }

    return { period, paymentsProcessed: createdOrExisting, pendingReconciled: reconciledPending };
  }

  static async getBrokerStatement(brokerId: string, fromPeriod: string, toPeriod: string) {
    return prisma.commission.findMany({
      where: { brokerId, period: { gte: fromPeriod, lte: toPeriod } },
      orderBy: { period: "asc" },
    });
  }
}
