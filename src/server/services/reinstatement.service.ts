import { prisma } from "@/lib/prisma";

export class ReinstatementService {
  static async requestReinstatement(tenantId: string, memberId: string) {
    const member = await prisma.member.findUnique({
      where: { id: memberId, tenantId },
      include: { group: { select: { contributionRate: true } } },
    });
    if (!member) throw new Error("Member not found");
    if (member.status !== "LAPSED") throw new Error("Member is not lapsed");

    const existing = await prisma.membershipReinstatementRequest.findFirst({
      where: { memberId, status: "PENDING" },
    });
    if (existing) throw new Error("A reinstatement request is already pending");

    // Determine when the member lapsed — use activationDate as reference if available
    const reference = member.activationDate ?? member.enrollmentDate;
    const now = new Date();
    const monthsLapsed = Math.max(1, Math.ceil(
      (now.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    ));
    const catchUpAmount = monthsLapsed * Number(member.group.contributionRate);

    return prisma.membershipReinstatementRequest.create({
      data: {
        tenantId,
        memberId,
        lapsedDate: reference,
        catchUpAmount,
        periodsCovered: monthsLapsed,
      },
    });
  }

  static async approveReinstatement(
    tenantId: string,
    requestId: string,
    approvedById: string,
    resetWaitingPeriod: boolean,
  ) {
    const req = await prisma.membershipReinstatementRequest.findUnique({
      where: { id: requestId },
      include: {
        member: {
          include: {
            group: { select: { contributionRate: true, id: true, tenantId: true } },
            package: {
              include: { currentVersion: { include: { benefits: true } } },
            },
          },
        },
      },
    });
    if (!req || req.tenantId !== tenantId) throw new Error("Request not found");
    if (req.status !== "PENDING") throw new Error("Request is no longer pending");

    const now = new Date();

    return prisma.$transaction(async (tx) => {
      // 1. Mark request approved
      await tx.membershipReinstatementRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", approvedById, decidedAt: now, resetWaitingPeriod },
      });

      // 2. Reactivate member
      let waitingPeriodEnd: Date | undefined;
      if (resetWaitingPeriod) {
        const maxWait = Math.max(
          ...(req.member.package.currentVersion?.benefits.map(b => b.waitingPeriodDays) ?? [0])
        );
        waitingPeriodEnd = new Date(now.getTime() + maxWait * 24 * 60 * 60 * 1000);
      }
      await tx.member.update({
        where: { id: req.memberId },
        data: {
          status: "ACTIVE",
          activationDate: now,
          ...(waitingPeriodEnd ? { waitingPeriodEnd } : {}),
        },
      });

      // 3. Generate catch-up invoice
      const invoiceCount = await tx.invoice.count({ where: { tenantId } });
      const invoiceNumber = `INV-REINSTATE-${now.getFullYear()}-${String(invoiceCount + 1).padStart(5, "0")}`;
      const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // due in 7 days
      const amount = Number(req.catchUpAmount);

      await tx.invoice.create({
        data: {
          tenantId,
          invoiceNumber,
          groupId: req.member.group.id,
          period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
          memberCount: req.periodsCovered,
          ratePerMember: Number(req.member.group.contributionRate),
          totalAmount: amount,
          paidAmount: 0,
          balance: amount,
          dueDate,
          status: "SENT",
          notes: `Reinstatement catch-up: ${req.periodsCovered} month(s) for member ${req.member.firstName} ${req.member.lastName}`,
        },
      });
    });
  }

  static async declineReinstatement(
    tenantId: string,
    requestId: string,
    approvedById: string,
    declineReason: string,
  ) {
    const req = await prisma.membershipReinstatementRequest.findUnique({ where: { id: requestId } });
    if (!req || req.tenantId !== tenantId) throw new Error("Request not found");
    if (req.status !== "PENDING") throw new Error("Request is no longer pending");

    await prisma.membershipReinstatementRequest.update({
      where: { id: requestId },
      data: { status: "DECLINED", approvedById, declineReason, decidedAt: new Date() },
    });
  }

  static async getPendingRequests(tenantId: string) {
    return prisma.membershipReinstatementRequest.findMany({
      where: { tenantId, status: "PENDING" },
      include: {
        member: {
          select: {
            id: true, firstName: true, lastName: true, memberNumber: true,
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { requestDate: "asc" },
    });
  }

  static async getMemberRequests(tenantId: string, memberId: string) {
    return prisma.membershipReinstatementRequest.findMany({
      where: { tenantId, memberId },
      orderBy: { requestDate: "desc" },
    });
  }
}
