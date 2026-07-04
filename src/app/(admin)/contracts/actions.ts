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
  await guarded(id, () => ContractLifecycleService.submitForReview(tenantId, id, userId), "Contract submitted for review.");
}
export async function approveContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.approve(tenantId, id, userId), "Contract approved.");
}
export async function requestClarificationAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  const comment = str(fd, "comment") ?? "Please clarify.";
  await guarded(id, () => ContractLifecycleService.requestClarification(tenantId, id, userId, comment), "Clarification requested.");
}
export async function returnToDraftAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.returnToDraft(tenantId, id, userId, str(fd, "reason")), "Contract returned to draft.");
}
export async function activateContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  const allowUnsigned = str(fd, "allowUnsigned") === "on";
  // PR-009 #2: an APPROVED CONTRACT_BACKDATE override on this contract unblocks
  // activation past the backdating horizon.
  const backdateOverride = await prisma.overrideRecord.findFirst({
    where: { tenantId, entityType: "ProviderContract", entityId: id, overrideType: "CONTRACT_BACKDATE", status: "APPROVED" },
    select: { id: true },
  });
  await guarded(
    id,
    () => ContractLifecycleService.activate(tenantId, id, userId, { allowUnsigned, backdateOverrideId: backdateOverride?.id }),
    "Contract activated.",
  );
}
export async function suspendContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.suspend(tenantId, id, userId, str(fd, "reason")), "Contract suspended.");
}
export async function reinstateContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.reinstate(tenantId, id, userId, str(fd, "reason")), "Contract reinstated.");
}
export async function terminateContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  await guarded(id, () => ContractLifecycleService.terminate(tenantId, id, userId, str(fd, "reason")), "Contract terminated.");
}

// ── PR-010: DRAFT header edit + void ─────────────────────────────────────
export async function editContractHeaderAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  const date = (k: string) => (str(fd, k) ? new Date(str(fd, k)!) : undefined);
  await guarded(
    id,
    () =>
      ContractLifecycleService.editDraftHeader(tenantId, id, userId, {
        title: str(fd, "title"),
        contractType: str(fd, "contractType"),
        startDate: date("startDate"),
        endDate: date("endDate"),
        reviewDueDate: date("reviewDueDate"),
        branchScope: str(fd, "branchScope"),
        externalContractRef: str(fd, "externalContractRef"),
        currency: str(fd, "currency"),
        executionStatus: str(fd, "executionStatus"),
        paymentTermDays: num(fd, "paymentTermDays"),
        paymentTermType: str(fd, "paymentTermType"),
        submissionWindowDays: num(fd, "submissionWindowDays"),
        submissionWindowBasis: str(fd, "submissionWindowBasis"),
        balanceBillingPolicy: str(fd, "balanceBillingPolicy"),
        taxInclusive: str(fd, "taxInclusive"),
        reconciliationCadence: str(fd, "reconciliationCadence"),
        unlistedServiceRule: str(fd, "unlistedServiceRule"),
        unlistedDiscountPct: num(fd, "unlistedDiscountPct"),
        notes: str(fd, "notes"),
      }),
    "Contract header updated — validation re-run below.",
  );
}

export async function voidContractAction(fd: FormData) {
  const { tenantId, userId, id } = await withContract(fd);
  const reason = str(fd, "reason") ?? "";
  await guarded(id, () => ContractLifecycleService.voidContract(tenantId, id, userId, reason), "Contract voided.");
}

// ── PR-009 #3: raise the CONTRACT_BACKDATE override from the contract ────
export async function requestBackdateOverrideAction(fd: FormData) {
  const { session, tenantId, userId, id } = await withContract(fd);
  void session;
  const justification = (str(fd, "justification") ?? "").trim();
  const { overrideService } = await import("@/server/services/override.service");
  try {
    await overrideService.request({
      tenantId,
      makerId: userId,
      overrideType: "CONTRACT_BACKDATE",
      entityType: "ProviderContract",
      entityId: id,
      reasonCode: "OTHER",
      justification,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Override request failed";
    redirect(`/contracts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/contracts/${id}`);
  redirect(`/contracts/${id}?notice=${encodeURIComponent("CONTRACT_BACKDATE override requested — once approved on the Overrides console, Activate will succeed.")}`);
}

export async function renewContractAction(fd: FormData) {
  const session = await requireRole(ROLES.UNDERWRITING);
  const id = str(fd, "id");
  const startDate = str(fd, "startDate");
  const endDate = str(fd, "endDate");
  if (!id || !startDate || !endDate) {
    redirect(`/contracts/${id}?error=${encodeURIComponent("Renewal needs a start and end date.")}`);
  }
  const upliftPct = num(fd, "upliftPct") ?? 0;
  let renewed: { id: string };
  try {
    renewed = await ContractLifecycleService.renew(session.user.tenantId, id!, {
      startDate: new Date(startDate!),
      endDate: new Date(endDate!),
      upliftPct,
      userId: session.user.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Renewal failed";
    revalidatePath(`/contracts/${id}`);
    redirect(`/contracts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath("/contracts");
  redirect(`/contracts/${renewed!.id}`);
}

/**
 * PR-009: the standard server-action result pattern for this module — run the
 * transition; on failure redirect back with the service's message verbatim
 * (?error=), on success confirm (?notice=). NEXT_REDIRECT must always
 * re-throw, never be treated as a failure.
 */
async function guarded(id: string, fn: () => Promise<unknown>, successMsg?: string) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    const msg = e instanceof Error ? e.message : "Action failed";
    revalidatePath(`/contracts/${id}`);
    redirect(`/contracts/${id}?error=${encodeURIComponent(msg)}`);
  }
  revalidatePath(`/contracts/${id}`);
  revalidatePath("/contracts");
  redirect(`/contracts/${id}${successMsg ? `?notice=${encodeURIComponent(successMsg)}` : ""}`);
}
