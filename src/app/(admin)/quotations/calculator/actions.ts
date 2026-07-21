"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { peekNextDocumentNumber } from "@/lib/document-number";

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

  const quoteNumber = await peekNextDocumentNumber("QUO", (yp) =>
    prisma.quotation
      .findFirst({ where: { tenantId, quoteNumber: { startsWith: yp } }, orderBy: { quoteNumber: "desc" }, select: { quoteNumber: true } })
      .then((r) => r?.quoteNumber ?? null),
  );

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
