"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ContractLifecycleService } from "@/server/services/contract-lifecycle.service";
import { ProviderContractsService } from "@/server/services/provider-contracts.service";
import type {
  ContractType,
  ContractBranchScope,
  ContractExecutionStatus,
  PaymentTermType,
  SubmissionWindowBasis,
  BalanceBillingPolicy,
  TaxInclusivity,
  ReconciliationCadence,
  UnlistedServiceRule,
} from "@prisma/client";

function str(fd: FormData, key: string): string | undefined {
  const v = fd.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

// ── Create draft (spec §4.1 Path A — manual) ─────────────────────────────
export async function createContractAction(formData: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const tenantId = session.user.tenantId;

  const providerId = str(formData, "providerId");
  const title = str(formData, "title");
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate");
  if (!providerId || !title || !startDate || !endDate) {
    redirect("/contracts/new?error=" + encodeURIComponent("Provider, title, start and end date are required."));
  }
  const provider = await prisma.provider.findUnique({ where: { id: providerId, tenantId } });
  if (!provider) redirect("/contracts/new?error=Provider+not+found");

  const contractNumber = await ProviderContractsService.nextContractNumber(tenantId);
  const contract = await prisma.providerContract.create({
    data: {
      tenantId,
      providerId: providerId!,
      contractNumber,
      title: title!,
      contractType: (str(formData, "contractType") as ContractType) ?? "RATE_SCHEDULE",
      status: "DRAFT",
      startDate: new Date(startDate!),
      endDate: new Date(endDate!),
      reviewDueDate: str(formData, "reviewDueDate") ? new Date(str(formData, "reviewDueDate")!) : null,
      branchScope: (str(formData, "branchScope") as ContractBranchScope) ?? "ALL_BRANCHES",
      externalContractRef: str(formData, "externalContractRef"),
      currency: str(formData, "currency") ?? "KES",
      executionStatus: (str(formData, "executionStatus") as ContractExecutionStatus) ?? "UNSIGNED",
      paymentTermDays: num(formData, "paymentTermDays") ?? 30,
      paymentTermType: (str(formData, "paymentTermType") as PaymentTermType) ?? "CALENDAR",
      submissionWindowDays: num(formData, "submissionWindowDays"),
      submissionWindowBasis: str(formData, "submissionWindowBasis") as SubmissionWindowBasis | undefined,
      balanceBillingPolicy: str(formData, "balanceBillingPolicy") as BalanceBillingPolicy | undefined,
      taxInclusive: (str(formData, "taxInclusive") as TaxInclusivity) ?? "UNKNOWN",
      reconciliationCadence: (str(formData, "reconciliationCadence") as ReconciliationCadence) ?? "NONE",
      unlistedServiceRule: (str(formData, "unlistedServiceRule") as UnlistedServiceRule) ?? "REFER_FOR_REVIEW",
      unlistedDiscountPct: num(formData, "unlistedDiscountPct"),
      notes: str(formData, "notes"),
      createdById: session.user.id,
      contractOwnerId: session.user.id,
    },
  });

  revalidatePath("/contracts");
  redirect(`/contracts/${contract.id}`);
}

// ── Lifecycle transitions (spec §4.2) ────────────────────────────────────
async function withContract(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const id = str(fd, "id");
  if (!id) throw new Error("Contract id required");
  return { session, tenantId: session.user.tenantId, userId: session.user.id, id };
}

export async function submitForReviewAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.submitForReview(tenantId, id, userId));
}
export async function approveContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.approve(tenantId, id, userId));
}
export async function requestClarificationAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  const comment = str(fd, "comment") ?? "Please clarify.";
  await guarded(id, () => ContractLifecycleService.requestClarification(tenantId, id, userId, comment));
}
export async function returnToDraftAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.returnToDraft(tenantId, id, userId, str(fd, "reason")));
}
export async function activateContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  const allowUnsigned = str(fd, "allowUnsigned") === "on";
  await guarded(id, () => ContractLifecycleService.activate(tenantId, id, userId, { allowUnsigned }));
}
export async function suspendContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.suspend(tenantId, id, userId, str(fd, "reason")));
}
export async function reinstateContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.reinstate(tenantId, id, userId, str(fd, "reason")));
}
export async function terminateContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.terminate(tenantId, id, userId, str(fd, "reason")));
}

/** Run a transition; on failure redirect back to detail with the error surfaced. */
async function guarded(id: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Action failed";
    revalidatePath(`/contracts/${id}`);
    redirect(`/contracts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/contracts/${id}`);
  revalidatePath("/contracts");
  redirect(`/contracts/${id}`);
}
