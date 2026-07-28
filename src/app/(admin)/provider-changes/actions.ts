"use server";

import { requireRole, ROLES } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { ProviderMasterDataChangeService, isMasterDataChangeError, type MasterDataReviewer, type BankChangeActor } from "@/server/services/provider-master-data-change/service";

/**
 * PNOS F7.6 — TPA operator actions on a provider master-data change request. Each
 * is requireRole(ADMIN_ONLY)-gated and delegates to the F7.4/F7.5 service (which
 * audits internally, enforces maker≠checker, the independent bank verification,
 * and the payment-window freeze). The service is the authority — these are thin
 * adapters that never bypass a control.
 */

async function reviewer(): Promise<MasterDataReviewer> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  return { userId: session.user.id, tenantId: session.user.tenantId, role: session.user.role as string };
}
// Bank verify/activate need the operator's capability set (provider.bank_change.*).
async function bankActor(): Promise<BankChangeActor> {
  const session = await requireRole(ROLES.ADMIN_ONLY);
  return { userId: session.user.id, tenantId: session.user.tenantId, permissions: (session.user.permissions ?? []) as string[] };
}

function fail(e: unknown): { error: string; refresh?: boolean } {
  const stale = isMasterDataChangeError(e) && ["STALE", "INVALID_STATE", "NOT_FOUND"].includes(e.code);
  return { error: (e as Error).message || "The action could not be completed.", refresh: stale || undefined };
}
const ok = (id: string) => { revalidatePath(`/provider-changes/${id}`); return { ok: true as const }; };

export async function startReviewAction(input: { id: string; expectedVersion: number }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const r = await reviewer();
  try { await ProviderMasterDataChangeService.startReview(r, input.id, input.expectedVersion); } catch (e) { return fail(e); }
  return ok(input.id);
}

export async function requestInfoAction(input: { id: string; expectedVersion: number; prompt: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const r = await reviewer();
  if (!input.prompt?.trim()) return { error: "Enter what information is needed." };
  try { await ProviderMasterDataChangeService.requestInformation(r, input.id, input.expectedVersion, input.prompt); } catch (e) { return fail(e); }
  return ok(input.id);
}

export async function approveAction(input: { id: string; expectedVersion: number; explanation?: string; internalNote?: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const r = await reviewer();
  try { await ProviderMasterDataChangeService.approve(r, input.id, input.expectedVersion, { explanation: input.explanation, internalNote: input.internalNote }); } catch (e) { return fail(e); }
  return ok(input.id);
}

export async function rejectAction(input: { id: string; expectedVersion: number; explanation: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const r = await reviewer();
  if (!input.explanation?.trim()) return { error: "Enter a reason." };
  try { await ProviderMasterDataChangeService.reject(r, input.id, input.expectedVersion, { explanation: input.explanation }); } catch (e) { return fail(e); }
  return ok(input.id);
}

export async function verifyBankAction(input: { id: string; expectedVersion: number; method: string; reference: string }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const a = await bankActor();
  if (!input.method?.trim() || !input.reference?.trim()) return { error: "Enter the verification method and reference." };
  try { await ProviderMasterDataChangeService.verifyBankChange(a, input.id, input.expectedVersion, { method: input.method, reference: input.reference }); } catch (e) { return fail(e); }
  return ok(input.id);
}

export async function activateBankAction(input: { id: string; expectedVersion: number }): Promise<{ ok?: true; error?: string; refresh?: boolean }> {
  const a = await bankActor();
  try { await ProviderMasterDataChangeService.activateBankChange(a, input.id, input.expectedVersion); } catch (e) { return fail(e); }
  return ok(input.id);
}
