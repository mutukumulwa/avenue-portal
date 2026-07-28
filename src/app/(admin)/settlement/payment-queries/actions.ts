"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { ProviderPaymentQueryService, isPaymentQueryError, type FinanceActor } from "@/server/services/provider-payment-query/service";

/**
 * F6.11 — finance payment-query server actions. Thin adapters over the F6.10
 * service; each is requireRole(FINANCE)-gated and audits internally. NONE changes
 * a claim decision (D17) — a decision dispute is an explicit reconsideration (F6.12).
 */

async function financeActor(): Promise<FinanceActor> {
  const session = await requireRole(ROLES.FINANCE);
  return { userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string };
}

function fail(e: unknown): { error: string; refresh?: boolean } {
  const stale = isPaymentQueryError(e) && ["STALE", "INVALID_STATE", "NOT_FOUND"].includes(e.code);
  return { error: (e as Error).message || "The action could not be completed.", refresh: stale || undefined };
}

export async function acknowledgePaymentQueryAction(input: { id: string; expectedVersion: number }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const actor = await financeActor();
  try {
    await ProviderPaymentQueryService.acknowledge(actor, input.id, input.expectedVersion);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/settlement/payment-queries/${input.id}`);
  return { ok: true };
}

export async function requestInfoPaymentQueryAction(input: { id: string; expectedVersion: number; prompt: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const actor = await financeActor();
  if (!input.prompt?.trim()) return { error: "Enter what information is needed." };
  try {
    await ProviderPaymentQueryService.requestInformation(actor, input.id, input.expectedVersion, input.prompt);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/settlement/payment-queries/${input.id}`);
  return { ok: true };
}

export async function resolvePaymentQueryAction(input: { id: string; expectedVersion: number; code: string; explanation: string; internalNote?: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const actor = await financeActor();
  if (!input.explanation?.trim()) return { error: "Enter a resolution explanation." };
  try {
    await ProviderPaymentQueryService.resolve(actor, input.id, input.expectedVersion, { code: input.code || "RESOLVED", explanation: input.explanation, internalNote: input.internalNote });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/settlement/payment-queries/${input.id}`);
  return { ok: true };
}

export async function rejectPaymentQueryAction(input: { id: string; expectedVersion: number; code: string; explanation: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const actor = await financeActor();
  if (!input.explanation?.trim()) return { error: "Enter a reason." };
  try {
    await ProviderPaymentQueryService.reject(actor, input.id, input.expectedVersion, { code: input.code || "REJECTED", explanation: input.explanation });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/settlement/payment-queries/${input.id}`);
  return { ok: true };
}
