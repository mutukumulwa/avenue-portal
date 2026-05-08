import { prisma } from "@/lib/prisma";
import { MemberAppService } from "@/server/services/member-app.service";
import { MemberNotificationService } from "@/server/services/member-notification.service";
import crypto from "crypto";

const PAYMENT_WINDOW_MINUTES = 5;
const ACTIVE_PAYMENT_STATUSES = ["INITIATED", "PENDING_CALLBACK"] as const;

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function normalisePhone(phone: string) {
  const compact = phone.replace(/[^\d+]/g, "");
  if (compact.startsWith("+254")) return compact;
  if (compact.startsWith("254")) return `+${compact}`;
  if (compact.startsWith("0")) return `+254${compact.slice(1)}`;
  return compact;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function memberName(member: { firstName: string; lastName: string }) {
  return `${member.firstName} ${member.lastName}`;
}

export type MpesaCallbackPayload = {
  checkoutRequestId: string;
  merchantRequestId?: string;
  resultCode: string | number;
  resultDescription: string;
  mpesaReceipt?: string;
  amount?: number;
  phoneNumber?: string;
};

export class MemberPaymentService {
  static async getWalletForUser(userId: string, tenantId: string) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) return null;

    const now = new Date();
    await prisma.memberCoContributionPayment.updateMany({
      where: {
        tenantId,
        status: { in: ["INITIATED", "PENDING_CALLBACK"] },
        expiresAt: { lt: now },
      },
      data: {
        status: "TIMED_OUT",
        failedAt: now,
        resultCode: "TIMEOUT",
        resultDescription: "No M-Pesa confirmation was received before the sandbox checkout expired.",
      },
    });

    const principalId = context.principal?.id ?? context.id;
    const isPrincipalViewer = principalId === context.id;
    const allowedMemberIds = isPrincipalViewer ? [context.id, ...context.dependents.map((dependent) => dependent.id)] : [context.id];

    const [transactions, payments] = await Promise.all([
      prisma.coContributionTransaction.findMany({
        where: {
          tenantId,
          memberId: { in: allowedMemberIds },
          collectionStatus: { in: ["PENDING", "PARTIAL", "DEFERRED"] },
        },
        include: {
          member: { select: { id: true, firstName: true, lastName: true, relationship: true, phone: true } },
          claim: {
            select: {
              id: true,
              claimNumber: true,
              dateOfService: true,
              serviceType: true,
              provider: { select: { name: true } },
            },
          },
          paymentAttempts: { orderBy: { createdAt: "desc" }, take: 3 },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.memberCoContributionPayment.findMany({
        where: { tenantId, memberId: { in: allowedMemberIds } },
        include: {
          member: { select: { id: true, firstName: true, lastName: true } },
          coContributionTransaction: {
            include: {
              claim: {
                select: {
                  id: true,
                  claimNumber: true,
                  dateOfService: true,
                  provider: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
    ]);

    const outstanding = transactions
      .map((transaction) => {
        const amountDue = Math.max(0, toMoney(transaction.finalAmount) - toMoney(transaction.amountCollected));
        const latestPayment = transaction.paymentAttempts[0] ?? null;
        return {
          id: transaction.id,
          memberName: transaction.memberId === context.id ? "You" : memberName(transaction.member),
          memberPhone: transaction.member.phone,
          claimId: transaction.claim.id,
          claimNumber: transaction.claim.claimNumber,
          providerName: transaction.claim.provider.name,
          serviceType: transaction.claim.serviceType,
          dateOfService: transaction.claim.dateOfService,
          finalAmount: toMoney(transaction.finalAmount),
          amountCollected: toMoney(transaction.amountCollected),
          amountDue,
          collectionStatus: transaction.collectionStatus,
          latestPayment: latestPayment
            ? {
                id: latestPayment.id,
                status: latestPayment.status,
                checkoutRequestId: latestPayment.checkoutRequestId,
                requestedAt: latestPayment.requestedAt,
                expiresAt: latestPayment.expiresAt,
                resultDescription: latestPayment.resultDescription,
              }
            : null,
        };
      })
      .filter((transaction) => transaction.amountDue > 0);

    const totalOutstanding = outstanding.reduce((sum, transaction) => sum + transaction.amountDue, 0);
    const totalPaid = payments
      .filter((payment) => payment.status === "CONFIRMED")
      .reduce((sum, payment) => sum + toMoney(payment.amount), 0);

    return {
      viewer: {
        id: context.id,
        preferredPhone: context.phone,
        isPrincipalViewer,
      },
      summary: {
        totalOutstanding,
        totalPaid,
        openItemCount: outstanding.length,
      },
      outstanding,
      payments: payments.map((payment) => ({
        id: payment.id,
        memberName: payment.memberId === context.id ? "You" : memberName(payment.member),
        amount: toMoney(payment.amount),
        phoneNumber: payment.phoneNumber,
        status: payment.status,
        checkoutRequestId: payment.checkoutRequestId,
        mpesaReceipt: payment.mpesaReceipt,
        resultDescription: payment.resultDescription,
        requestedAt: payment.requestedAt,
        confirmedAt: payment.confirmedAt,
        failedAt: payment.failedAt,
        claimId: payment.coContributionTransaction.claim.id,
        claimNumber: payment.coContributionTransaction.claim.claimNumber,
        providerName: payment.coContributionTransaction.claim.provider.name,
        dateOfService: payment.coContributionTransaction.claim.dateOfService,
      })),
    };
  }

  static async initiate(userId: string, tenantId: string, input: {
    transactionId: string;
    phoneNumber: string;
  }) {
    const context = await MemberAppService.resolveMemberContext(userId, tenantId);
    if (!context) throw new Error("No member profile is linked to this account.");

    const principalId = context.principal?.id ?? context.id;
    const isPrincipalViewer = principalId === context.id;
    const allowedMemberIds = isPrincipalViewer ? [context.id, ...context.dependents.map((dependent) => dependent.id)] : [context.id];

    const transaction = await prisma.coContributionTransaction.findFirst({
      where: { id: input.transactionId, tenantId, memberId: { in: allowedMemberIds } },
      include: { member: { select: { phone: true } } },
    });
    if (!transaction) throw new Error("This payment item was not found in your wallet.");

    const amountDue = Math.max(0, toMoney(transaction.finalAmount) - toMoney(transaction.amountCollected));
    if (amountDue <= 0 || ["COLLECTED", "WAIVED", "REFUNDED", "WRITTEN_OFF"].includes(transaction.collectionStatus)) {
      throw new Error("This member-share item is no longer payable.");
    }

    const phoneNumber = normalisePhone(input.phoneNumber || transaction.member.phone || context.phone || "");
    if (!/^\+254\d{9}$/.test(phoneNumber)) {
      throw new Error("Enter a valid Kenyan M-Pesa phone number, for example +254712345678.");
    }

    const existing = await prisma.memberCoContributionPayment.findFirst({
      where: {
        tenantId,
        coContributionTransactionId: transaction.id,
        status: { in: [...ACTIVE_PAYMENT_STATUSES] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;

    const checkoutRequestId = `AICARE-${crypto.randomUUID()}`;
    const merchantRequestId = `MR-${crypto.randomUUID()}`;

    const payment = await prisma.memberCoContributionPayment.create({
      data: {
        tenantId,
        memberId: transaction.memberId,
        coContributionTransactionId: transaction.id,
        amount: amountDue.toFixed(2),
        phoneNumber,
        status: "PENDING_CALLBACK",
        idempotencyKey: crypto.randomUUID(),
        checkoutRequestId,
        merchantRequestId,
        expiresAt: addMinutes(new Date(), PAYMENT_WINDOW_MINUTES),
      },
    });
    await MemberNotificationService.create({
      tenantId,
      memberId: transaction.memberId,
      type: "PAYMENT_STATUS",
      title: "M-Pesa checkout requested",
      body: `Confirm the M-Pesa prompt for KES ${Math.round(amountDue).toLocaleString("en-KE")}.`,
      href: "/member/wallet",
      metadata: { paymentId: payment.id, checkoutRequestId: payment.checkoutRequestId },
    });
    return payment;
  }

  static signCallbackBody(bodyText: string, secret = process.env.MPESA_CALLBACK_SECRET ?? "aicare-demo-secret") {
    return crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  }

  static verifyCallbackSignature(bodyText: string, signature: string | null) {
    if (process.env.NODE_ENV === "production" && !process.env.MPESA_CALLBACK_SECRET) return false;
    const expected = this.signCallbackBody(bodyText);
    if (!signature) return false;
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signature);
    return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }

  static async applyMpesaCallback(payload: MpesaCallbackPayload) {
    const payment = await prisma.memberCoContributionPayment.findUnique({
      where: { checkoutRequestId: payload.checkoutRequestId },
      include: { coContributionTransaction: true },
    });
    if (!payment) throw new Error("Payment request not found.");

    const resultCode = String(payload.resultCode);
    const success = resultCode === "0";
    const now = new Date();

    if (!success) {
      const failedPayment = await prisma.memberCoContributionPayment.update({
        where: { id: payment.id },
        data: {
          status: resultCode === "1032" ? "CANCELLED" : "FAILED",
          resultCode,
          resultDescription: payload.resultDescription,
          merchantRequestId: payload.merchantRequestId ?? payment.merchantRequestId,
          failedAt: now,
        },
      });
      await MemberNotificationService.create({
        tenantId: payment.tenantId,
        memberId: payment.memberId,
        type: "PAYMENT_STATUS",
        priority: "HIGH",
        title: "M-Pesa payment not completed",
        body: payload.resultDescription,
        href: "/member/wallet",
        metadata: { paymentId: payment.id, checkoutRequestId: payload.checkoutRequestId, resultCode },
      });
      return failedPayment;
    }

    const amount = payload.amount ? Math.min(payload.amount, toMoney(payment.amount)) : toMoney(payment.amount);
    const newCollected = toMoney(payment.coContributionTransaction.amountCollected) + amount;
    const finalAmount = toMoney(payment.coContributionTransaction.finalAmount);
    const collectionStatus = newCollected >= finalAmount ? "COLLECTED" : "PARTIAL";

    const confirmedPayment = await prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.memberCoContributionPayment.update({
        where: { id: payment.id },
        data: {
          status: "CONFIRMED",
          resultCode,
          resultDescription: payload.resultDescription,
          merchantRequestId: payload.merchantRequestId ?? payment.merchantRequestId,
          mpesaReceipt: payload.mpesaReceipt,
          confirmedAt: now,
        },
      });

      await tx.coContributionTransaction.update({
        where: { id: payment.coContributionTransactionId },
        data: {
          amountCollected: newCollected.toFixed(2),
          collectionStatus,
          paymentMethod: "MPESA",
          mpesaTransactionRef: payload.mpesaReceipt,
          mpesaPhoneNumber: payload.phoneNumber ? normalisePhone(payload.phoneNumber) : payment.phoneNumber,
          receiptNumber: payload.mpesaReceipt,
          collectedAt: collectionStatus === "COLLECTED" ? now : null,
        },
      });

      return updatedPayment;
    });

    await MemberNotificationService.create({
      tenantId: payment.tenantId,
      memberId: payment.memberId,
      type: "PAYMENT_STATUS",
      priority: "HIGH",
      title: "M-Pesa payment confirmed",
      body: `Your payment of KES ${Math.round(amount).toLocaleString("en-KE")} has been confirmed.`,
      href: "/member/wallet",
      metadata: { paymentId: payment.id, checkoutRequestId: payload.checkoutRequestId, mpesaReceipt: payload.mpesaReceipt },
    });
    return confirmedPayment;
  }
}
