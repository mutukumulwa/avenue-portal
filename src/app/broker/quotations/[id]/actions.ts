"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function requireBrokerQuotation(quotationId: string, userId: string, tenantId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { brokerId: true },
  });
  if (!user?.brokerId) redirect("/broker/quotations");

  const quotation = await prisma.quotation.findFirst({
    where: { id: quotationId, tenantId, brokerId: user.brokerId },
    select: { id: true, status: true },
  });
  if (!quotation) redirect("/broker/quotations");

  return quotation;
}

export async function sendBrokerQuotationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const quotationId = formData.get("quotationId") as string;
  const quotation = await requireBrokerQuotation(quotationId, session.user.id, session.user.tenantId);
  if (quotation.status !== "DRAFT") redirect(`/broker/quotations/${quotationId}`);

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "SENT" },
  });

  revalidatePath("/broker/quotations");
  redirect(`/broker/quotations/${quotationId}`);
}

export async function withdrawBrokerQuotationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "BROKER_USER") redirect("/unauthorized");

  const quotationId = formData.get("quotationId") as string;
  const quotation = await requireBrokerQuotation(quotationId, session.user.id, session.user.tenantId);
  if (!["DRAFT", "SENT"].includes(quotation.status)) redirect(`/broker/quotations/${quotationId}`);

  await prisma.quotation.update({
    where: { id: quotationId },
    data: { status: "WITHDRAWN_BY_SUBMITTER" },
  });

  revalidatePath("/broker/quotations");
  redirect(`/broker/quotations/${quotationId}`);
}
