"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";

export async function sendQuotationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const id = formData.get("quotationId") as string;
  await prisma.quotation.update({
    where: { id, tenantId: session.user.tenantId },
    data: { status: "SENT" },
  });
  redirect(`/quotations/${id}`);
}

export async function declineQuotationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const id = formData.get("quotationId") as string;
  await prisma.quotation.update({
    where: { id, tenantId: session.user.tenantId },
    data: { status: "DECLINED" },
  });
  redirect(`/quotations/${id}`);
}

export async function acceptQuotationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const tenantId = session.user.tenantId;
  const id = formData.get("quotationId") as string;

  const q = await prisma.quotation.findUnique({
    where: { id, tenantId },
  });
  if (!q) notFound();

  // Mark accepted
  await prisma.quotation.update({
    where: { id },
    data: { status: "ACCEPTED" },
  });

  // If this is a prospect quote (no existing group) and we have enough info, create a Group
  if (!q.groupId && q.prospectName && q.packageId) {
    const effectiveDate = new Date();
    const renewalDate = new Date(effectiveDate);
    renewalDate.setFullYear(renewalDate.getFullYear() + 1);

    const count = await prisma.group.count({ where: { tenantId } });
    const groupNumber = `GRP-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const group = await prisma.group.create({
      data: {
        tenantId,
        name: q.prospectName,
        industry: q.prospectIndustry ?? undefined,
        contactPersonName: q.prospectContact ?? q.prospectName,
        contactPersonPhone: "",
        contactPersonEmail: q.prospectEmail ?? "",
        packageId: q.packageId,
        contributionRate: q.ratePerMember,
        effectiveDate,
        renewalDate,
        status: "PENDING",
        brokerId: q.brokerId ?? undefined,
        notes: `Created from quotation ${q.quoteNumber}. ${groupNumber}`,
      },
    });

    // Link the quotation to the new group
    await prisma.quotation.update({
      where: { id },
      data: { groupId: group.id },
    });

    redirect(`/groups/${group.id}`);
  }

  // Renewal: existing group — just redirect to quotation detail
  redirect(`/quotations/${id}`);
}

export async function expireQuotationAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);

  const id = formData.get("quotationId") as string;
  await prisma.quotation.update({
    where: { id, tenantId: session.user.tenantId },
    data: { status: "EXPIRED" },
  });
  redirect(`/quotations/${id}`);
}
