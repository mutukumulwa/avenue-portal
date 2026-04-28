"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function recordFundDepositAction(
  formData: FormData,
): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.FINANCE);

  const groupId    = formData.get("groupId") as string;
  const amount     = Number(formData.get("amount"));
  const ref        = (formData.get("referenceNumber") as string) || null;
  const type       = (formData.get("type") as "DEPOSIT" | "TOP_UP") || "DEPOSIT";
  const note       = (formData.get("description") as string) || (type === "TOP_UP" ? "Fund top-up" : "Initial fund deposit");

  if (!groupId || isNaN(amount) || amount <= 0) return { error: "Invalid amount." };

  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId: session.user.tenantId },
    select: { fundingMode: true, selfFundedAccount: true },
  });
  if (!group || group.fundingMode !== "SELF_FUNDED") return { error: "Not a self-funded scheme." };

  await prisma.$transaction(async (tx) => {
    let account = group.selfFundedAccount;
    if (!account) {
      account = await tx.selfFundedAccount.create({
        data: {
          tenantId:       session.user.tenantId,
          groupId,
          balance:        0,
          totalDeposited: 0,
          totalClaims:    0,
          totalAdminFees: 0,
          periodStartDate: new Date(),
          periodEndDate:   new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        },
      });
    }

    const newBalance = Number(account.balance) + amount;

    await tx.selfFundedAccount.update({
      where: { id: account.id },
      data: {
        balance:        newBalance,
        totalDeposited: { increment: amount },
      },
    });

    await tx.fundTransaction.create({
      data: {
        tenantId:           session.user.tenantId,
        selfFundedAccountId: account.id,
        type,
        amount,
        balanceAfter:       newBalance,
        description:        note,
        referenceNumber:    ref,
        postedById:         session.user.id,
      },
    });
  });

  revalidatePath(`/groups/${groupId}`);
  return {};
}

export async function configureSelfFundedSchemeAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const groupId = formData.get("groupId") as string;
  const minimumBalance = Number(formData.get("minimumBalance") || 0);
  const adminFeeMethod = (formData.get("adminFeeMethod") as "FLAT_PER_INSURED" | "PCT_OF_CLAIMS") || "FLAT_PER_INSURED";
  const adminFeeRate = Number(formData.get("adminFeeRate") || 0);
  const adminIds = formData.getAll("fundAdminIds").map(String).filter(Boolean);

  if (!groupId) return { error: "Group is required." };

  const group = await prisma.group.findUnique({
    where: { id: groupId, tenantId: session.user.tenantId },
    select: { id: true, selfFundedAccount: true },
  });
  if (!group) return { error: "Group not found." };

  await prisma.$transaction(async tx => {
    await tx.group.update({
      where: { id: groupId },
      data: {
        fundingMode: "SELF_FUNDED",
        adminFeeMethod,
        adminFeeRate,
        fundAdministrators: { set: adminIds.map(id => ({ id })) },
      },
    });

    if (!group.selfFundedAccount) {
      const now = new Date();
      const end = new Date(now);
      end.setFullYear(end.getFullYear() + 1);
      await tx.selfFundedAccount.create({
        data: {
          tenantId: session.user.tenantId,
          groupId,
          minimumBalance,
          periodStartDate: now,
          periodEndDate: end,
        },
      });
    } else {
      await tx.selfFundedAccount.update({
        where: { id: group.selfFundedAccount.id },
        data: { minimumBalance },
      });
    }
  });

  revalidatePath(`/groups/${groupId}`);
  revalidatePath("/fund/dashboard");
  return {};
}
