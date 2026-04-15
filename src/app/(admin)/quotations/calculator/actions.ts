"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function generateQuotationAction(data: {
  prospectName: string;
  prospectIndustry: string;
  prospectEmail: string;
  memberCount: number;
  dependentCount: number;
  packageId: string | null;
  ratePerMember: number;
  annualPremium: number;
  finalPremium: number;
  loadings: Record<string, number>;
  discounts: Record<string, number>;
  pricingNotes: string;
}) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const tenantId = session.user.tenantId;

  const count = await prisma.quotation.count({ where: { tenantId } });
  const quoteNumber = `QUO-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30); // 30-day validity

  const q = await prisma.quotation.create({
    data: {
      tenantId,
      quoteNumber,
      prospectName:     data.prospectName,
      prospectIndustry: data.prospectIndustry || null,
      prospectEmail:    data.prospectEmail || null,
      packageId:        data.packageId || null,
      memberCount:      data.memberCount,
      dependentCount:   data.dependentCount,
      ratePerMember:    data.ratePerMember,
      annualPremium:    data.annualPremium,
      finalPremium:     data.finalPremium,
      loadings:         data.loadings as never,
      discounts:        data.discounts as never,
      pricingNotes:     data.pricingNotes || null,
      validUntil,
      status:           "DRAFT",
      createdBy:        session.user.id,
    },
  });

  redirect(`/quotations/${q.id}`);
}
