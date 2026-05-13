"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { quotationBuilderService } from "@/server/services/quotation-builder.service";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function buildQuoteAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;
  const tenantId = session.user.tenantId;

  await quotationBuilderService.buildQuote(quotationId, tenantId, session.user.id, {
    groupSizeDiscountOverridePct: formData.get("groupSizeDiscountPct")
      ? Number(formData.get("groupSizeDiscountPct")) / 100 : undefined,
    loyaltyDiscountPct: formData.get("loyaltyDiscountPct")
      ? Number(formData.get("loyaltyDiscountPct")) / 100 : undefined,
    customDiscountPct: formData.get("customDiscountPct")
      ? Number(formData.get("customDiscountPct")) / 100 : undefined,
    customDiscountDescription: (formData.get("customDiscountDescription") as string) || undefined,
    cardIssuanceFeePerLife: formData.get("cardIssuanceFeePerLife")
      ? Number(formData.get("cardIssuanceFeePerLife")) : undefined,
    welcomePackFeePerLife: formData.get("welcomePackFeePerLife")
      ? Number(formData.get("welcomePackFeePerLife")) : undefined,
    validityDays: formData.get("validityDays")
      ? Number(formData.get("validityDays")) : 30,
  });

  revalidatePath(`/quotations/${quotationId}/build`);
}

export async function issueQuoteAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const quotationId = formData.get("quotationId") as string;

  await quotationBuilderService.issueQuote(quotationId, session.user.tenantId, session.user.id);
  redirect(`/quotations/${quotationId}`);
}
