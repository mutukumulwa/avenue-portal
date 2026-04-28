"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { BenefitCategory } from "@prisma/client";

async function verifyFundAccess(groupId: string, userId: string, tenantId: string, role: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId },
    select: {
      id: true, fundingMode: true,
      fundAdministrators: { select: { id: true } },
      selfFundedAccount: true,
    },
  });
  if (!group || group.fundingMode !== "SELF_FUNDED") throw new Error("Group not found or not self-funded.");
  if (role !== "SUPER_ADMIN" && !group.fundAdministrators.some(a => a.id === userId)) {
    throw new Error("Access denied — you are not assigned to this scheme.");
  }
  return group;
}

export async function recordDepositAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.FUND);
  const groupId = formData.get("groupId") as string;
  const amount  = Number(formData.get("amount"));
  const type    = (formData.get("type") as "DEPOSIT" | "TOP_UP") || "DEPOSIT";
  const ref     = (formData.get("referenceNumber") as string) || null;
  const note    = (formData.get("description") as string) || (type === "TOP_UP" ? "Fund top-up" : "Fund deposit");

  if (!amount || amount <= 0) return { error: "Amount must be greater than zero." };

  const group = await verifyFundAccess(groupId, session.user.id, session.user.tenantId, session.user.role as string);
  const acc   = group.selfFundedAccount!;

  await prisma.$transaction(async (tx) => {
    const newBalance = Number(acc.balance) + amount;
    await tx.selfFundedAccount.update({
      where: { id: acc.id },
      data: { balance: newBalance, totalDeposited: { increment: amount } },
    });
    await tx.fundTransaction.create({
      data: {
        tenantId: session.user.tenantId, selfFundedAccountId: acc.id,
        type, amount, balanceAfter: newBalance, description: note, referenceNumber: ref,
        postedById: session.user.id,
      },
    });
  });

  revalidatePath(`/fund/${groupId}`);
  revalidatePath("/fund/dashboard");
  return {};
}

export async function toggleCategoryHoldAction(formData: FormData): Promise<{ error?: string }> {
  const session  = await requireRole(ROLES.FUND);
  const groupId  = formData.get("groupId") as string;
  const category = formData.get("category") as BenefitCategory;

  const group = await verifyFundAccess(groupId, session.user.id, session.user.tenantId, session.user.role as string);
  const acc   = group.selfFundedAccount!;

  const held = acc.heldCategories as BenefitCategory[];
  const updated = held.includes(category)
    ? held.filter(c => c !== category)
    : [...held, category];

  await prisma.selfFundedAccount.update({
    where: { id: acc.id },
    data: { heldCategories: updated },
  });

  revalidatePath(`/fund/${groupId}`);
  return {};
}

export async function generateAdminFeeInvoiceAction(formData: FormData): Promise<{ error?: string; invoiceId?: string }> {
  const session = await requireRole(ROLES.FUND);
  const groupId = formData.get("groupId") as string;

  const group = await verifyFundAccess(groupId, session.user.id, session.user.tenantId, session.user.role as string);
  const acc   = group.selfFundedAccount!;

  if (acc.adminFeeInvoiceId) return { error: "Admin fee invoice already generated for this period." };

  const fullGroup = await prisma.group.findUnique({
    where: { id: groupId },
    select: { adminFeeMethod: true, adminFeeRate: true, members: { where: { status: "ACTIVE" }, select: { id: true } } },
  });
  if (!fullGroup?.adminFeeMethod || !fullGroup.adminFeeRate) {
    return { error: "Admin fee method not configured on this group." };
  }

  let feeAmount: number;
  if (fullGroup.adminFeeMethod === "FLAT_PER_INSURED") {
    feeAmount = Number(fullGroup.adminFeeRate) * fullGroup.members.length;
  } else {
    // PCT_OF_CLAIMS — percentage of total claims paid this period
    feeAmount = Math.round(Number(acc.totalClaims) * (Number(fullGroup.adminFeeRate) / 100));
  }

  if (feeAmount <= 0) return { error: "Calculated admin fee is zero — check configuration." };

  const tenantId = session.user.tenantId;
  const count    = await prisma.invoice.count({ where: { tenantId } });
  const invoiceNumber = `INV-ADMIN-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        tenantId, groupId,
        invoiceNumber, period: new Date().toISOString().slice(0, 7),
        memberCount: fullGroup.members.length,
        ratePerMember: fullGroup.adminFeeMethod === "FLAT_PER_INSURED" ? Number(fullGroup.adminFeeRate) : 0,
        totalAmount: feeAmount, balance: feeAmount, paidAmount: 0,
        stampDuty: 0, trainingLevy: 0, phcf: 0, taxTotal: 0,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        notes: `Admin fee — ${fullGroup.adminFeeMethod === "FLAT_PER_INSURED"
          ? `KES ${Number(fullGroup.adminFeeRate).toLocaleString()} × ${fullGroup.members.length} insured`
          : `${fullGroup.adminFeeRate}% of KES ${Number(acc.totalClaims).toLocaleString()} claims paid`}`,
      },
    });

    // Record as fund transaction
    const newBalance = Number(acc.balance) - feeAmount;
    await tx.selfFundedAccount.update({
      where: { id: acc.id },
      data: { balance: newBalance, totalAdminFees: { increment: feeAmount }, adminFeeInvoiceId: inv.id },
    });
    await tx.fundTransaction.create({
      data: {
        tenantId, selfFundedAccountId: acc.id, invoiceId: inv.id,
        type: "ADMIN_FEE", amount: feeAmount, balanceAfter: newBalance,
        description: `Admin fee — ${invoiceNumber}`, postedById: session.user.id,
      },
    });

    return inv;
  });

  revalidatePath(`/fund/${groupId}`);
  revalidatePath("/fund/dashboard");
  return { invoiceId: invoice.id };
}
