"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export async function createBrokerQuotationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { brokerId: true },
  });
  if (!user?.brokerId) redirect("/broker/quotations");

  const memberCount = Number(formData.get("memberCount") || 0);
  const dependentCount = Number(formData.get("dependentCount") || 0);
  const ratePerMember = Number(formData.get("ratePerMember") || 0);
  const totalLives = memberCount + dependentCount;
  const annualPremium = totalLives * ratePerMember;
  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);

  const count = await prisma.quotation.count({ where: { tenantId: session.user.tenantId } });
  const quoteNumber = `QUO-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  await prisma.quotation.create({
    data: {
      tenantId: session.user.tenantId,
      brokerId: user.brokerId,
      createdBy: session.user.id,
      quoteNumber,
      prospectName: (formData.get("prospectName") as string) || null,
      prospectIndustry: (formData.get("prospectIndustry") as string) || null,
      prospectEmail: (formData.get("prospectEmail") as string) || null,
      memberCount,
      dependentCount,
      ratePerMember,
      annualPremium,
      finalPremium: annualPremium,
      loadings: {},
      discounts: {},
      pricingNotes: (formData.get("pricingNotes") as string) || null,
      validUntil,
      status: "DRAFT",
    },
  });

  redirect("/broker/quotations");
}
