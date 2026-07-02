"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { AdminFeeService } from "@/server/services/admin-fee.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";

const PATH = "/billing/admin-fees";
const METHODS = ["PMPM", "FLAT_PER_INSURED", "PCT_OF_CLAIMS", "CASE_MGMT", "PREAUTH", "CROSS_BORDER", "CARD_ISSUANCE", "CARD_REPLACEMENT"] as const;

/** Create an admin-fee agreement (G2.3). Never-delete: end-dating deactivates. */
export async function createAdminFeeAgreementAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const tenantId = session.user.tenantId;

  const clientId = ((formData.get("clientId") as string) || "").trim() || null;
  const method = (formData.get("method") as string) || "";
  const rate = Number(formData.get("rate"));
  const currency = ((formData.get("currency") as string) || "UGX").trim().toUpperCase();

  let errorMsg = "";
  try {
    if (!METHODS.includes(method as never)) throw new Error("Choose a fee method.");
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("Rate must be a positive number.");
    if (clientId) {
      const client = await prisma.client.findFirst({ where: { id: clientId, operatorTenantId: tenantId }, select: { id: true } });
      if (!client) throw new Error("Client not found.");
    }

    await prisma.adminFeeAgreement.create({
      data: { tenantId, clientId, method: method as never, rate, currency },
    });
    await writeAudit({
      userId: session.user.id,
      action: "ADMIN_FEE_AGREEMENT_CREATED",
      module: "FINANCE",
      description: `Admin-fee agreement created: ${method} @ ${rate} ${method === "PCT_OF_CLAIMS" ? "%" : currency}${clientId ? " (client-scoped)" : " (all clients)"}`,
      metadata: { clientId, method, rate, currency },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to create agreement";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}

export async function endAdminFeeAgreementAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const id = formData.get("id") as string;
  const agreement = await prisma.adminFeeAgreement.findFirst({
    where: { id, tenantId: session.user.tenantId },
    select: { id: true, method: true },
  });
  if (!agreement) return;
  await prisma.adminFeeAgreement.update({
    where: { id },
    data: { isActive: false, effectiveTo: new Date() },
  });
  await writeAudit({
    userId: session.user.id,
    action: "ADMIN_FEE_AGREEMENT_ENDED",
    module: "FINANCE",
    description: `Admin-fee agreement ${id} (${agreement.method}) ended`,
    metadata: { agreementId: id },
  });
  revalidatePath(PATH);
}

/** Run the recurring accrual for the current period on demand. */
export async function runAccrualNowAction() {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const written = await AdminFeeService.accrueRecurringForPeriod(session.user.tenantId, period);
  await writeAudit({
    userId: session.user.id,
    action: "ADMIN_FEE_ACCRUAL_RUN",
    module: "FINANCE",
    description: `Admin-fee accrual run for ${period} — ${written.length} entr(ies)`,
    metadata: { period, entries: written.length },
  });
  revalidatePath(PATH);
}

/** Roll a client's ACCRUED entries into an invoice reference (G5.8). */
export async function invoiceAccruedAction(formData: FormData) {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  const clientId = ((formData.get("clientId") as string) || "").trim();

  let errorMsg = "";
  try {
    if (!clientId) throw new Error("Choose a client to invoice.");
    const result = await AdminFeeService.invoiceAccrued(session.user.tenantId, clientId);
    if (!result) throw new Error("Nothing accrued for this client.");
    await writeAudit({
      userId: session.user.id,
      action: "ADMIN_FEE_INVOICED",
      module: "FINANCE",
      description: `Admin fees invoiced: ${result.reference} — ${result.total.toLocaleString()} ${result.currency} (${result.entryCount} entr(ies))`,
      metadata: { clientId, reference: result.reference, total: result.total, currency: result.currency },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    errorMsg = err instanceof Error ? err.message : "Failed to invoice";
  }

  if (errorMsg) redirect(`${PATH}?error=${encodeURIComponent(errorMsg)}`);
  revalidatePath(PATH);
}
