"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { GLService } from "@/server/services/gl.service";
import { writeAudit } from "@/lib/audit";

// ── Create a draft invoice ────────────────────────────────────────────────────

export async function createInvoiceAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error: string }> {
  const session = await requireRole(ROLES.FINANCE);

  const groupId      = formData.get("groupId")      as string;
  const period       = formData.get("period")       as string;  // "YYYY-MM"
  const memberCount  = Number(formData.get("memberCount"));
  const ratePerMember = Number(formData.get("ratePerMember"));
  const dueDate      = new Date(formData.get("dueDate") as string);
  const notes        = (formData.get("notes") as string) || null;
  const tenantId     = session.user.tenantId;

  if (!groupId || !period || !memberCount || !ratePerMember) {
    return { error: "All required fields must be filled." };
  }

  const totalAmount = memberCount * ratePerMember;
  const count = await prisma.invoice.count({ where: { tenantId } });
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      tenantId,
      groupId,
      invoiceNumber,
      period,
      memberCount,
      ratePerMember,
      totalAmount,
      balance: totalAmount,
      dueDate,
      notes,
      status: "DRAFT",
    },
  });

  await writeAudit({
    userId: session.user.id,
    action: "INVOICE_CREATED",
    module: "BILLING",
    description: `Invoice ${invoiceNumber} created — KES ${totalAmount.toLocaleString()} for ${period}`,
    metadata: { invoiceId: invoice.id, groupId, period },
  });

  redirect("/billing");
}

// ── Send (issue) an invoice → posts GL entry ─────────────────────────────────

export async function sendInvoiceAction(formData: FormData) {
  const session = await requireRole(ROLES.FINANCE);

  const invoiceId = formData.get("invoiceId") as string;
  const tenantId  = session.user.tenantId;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "DRAFT") throw new Error("Only DRAFT invoices can be sent");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data:  { status: "SENT", sentAt: new Date() },
  });

  // GL: DR Premium Receivables / CR Unearned Premium Reserve
  try {
    await GLService.postInvoiceIssued(tenantId, {
      sourceId:  invoiceId,
      reference: invoice.invoiceNumber,
      amount:    Number(invoice.totalAmount),
      postedById: session.user.id,
    });
  } catch { /* GL not seeded — skip */ }

  revalidatePath("/billing");
}

// ── Record a payment → posts GL entry ────────────────────────────────────────

export async function recordPaymentAction(formData: FormData) {
  const session = await requireRole(ROLES.FINANCE);

  const invoiceId      = formData.get("invoiceId")      as string;
  const amount         = Number(formData.get("amount"));
  const paymentMethod  = formData.get("paymentMethod")  as string;
  const referenceNumber = (formData.get("referenceNumber") as string) || null;
  const paymentDate    = new Date(formData.get("paymentDate") as string);
  const tenantId       = session.user.tenantId;

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId, tenantId },
  });
  if (!invoice) throw new Error("Invoice not found");

  const newPaid    = Number(invoice.paidAmount) + amount;
  const newBalance = Number(invoice.totalAmount) - newPaid;
  const newStatus  = newBalance <= 0 ? "PAID"
    : newPaid > 0 ? "PARTIALLY_PAID"
    : invoice.status;

  const payment = await prisma.payment.create({
    data: {
      groupId:         invoice.groupId,
      invoiceId,
      amount,
      paymentDate,
      paymentMethod,
      referenceNumber,
    },
  });

  await prisma.invoice.update({
    where: { id: invoiceId },
    data:  { paidAmount: newPaid, balance: newBalance, status: newStatus },
  });

  // GL: DR Cash / CR Premium Receivables + DR Unearned Premium / CR Gross Written Premium
  try {
    await GLService.postPremiumReceived(tenantId, {
      sourceId:  payment.id,
      reference: invoice.invoiceNumber,
      amount,
      method:    paymentMethod,
      postedById: session.user.id,
    });
  } catch { /* GL not seeded — skip */ }

  revalidatePath("/billing");
}
