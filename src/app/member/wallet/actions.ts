"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { MemberPaymentService } from "@/server/services/member-payment.service";
import { revalidatePath } from "next/cache";

export type WalletPaymentActionState = {
  error?: string;
  checkoutRequestId?: string;
};

export async function initiateMpesaPaymentAction(
  _prev: WalletPaymentActionState | null,
  formData: FormData,
): Promise<WalletPaymentActionState> {
  const session = await requireRole(ROLES.MEMBER);

  try {
    const payment = await MemberPaymentService.initiate(session.user.id, session.user.tenantId, {
      transactionId: formData.get("transactionId") as string,
      phoneNumber: formData.get("phoneNumber") as string,
    });
    revalidatePath("/member/wallet");
    return { checkoutRequestId: payment.checkoutRequestId };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
