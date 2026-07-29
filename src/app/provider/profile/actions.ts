"use server";

import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ProviderMasterDataChangeService, isMasterDataChangeError, MASTER_DATA_CHANGE_PERMISSION } from "@/server/services/provider-master-data-change/service";
import type { MasterDataChangeCategory } from "@prisma/client";

/**
 * PNOS F7.6 — provider profile change-request server actions. Thin adapters over
 * the F7.4 ProviderMasterDataChangeService (which validates the category allow-list,
 * masks sensitive values, scopes to the provider, audits, and NEVER mutates active
 * master data directly). Gated on the provider.profile.change_request permission.
 */

async function providerCtxOrError(perm = MASTER_DATA_CHANGE_PERMISSION) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!providerPermits(ctx.permissions, perm)) return { error: "You do not have permission to request profile changes." as const };
  return { ctx };
}

function fail(e: unknown): { error: string; refresh?: boolean } {
  const stale = isMasterDataChangeError(e) && ["STALE", "INVALID_STATE", "NOT_FOUND"].includes(e.code);
  return { error: (e as Error).message || "The action could not be completed.", refresh: stale || undefined };
}

export interface SubmitChangeInput {
  category: MasterDataChangeCategory;
  proposed: Record<string, unknown>;
  providerBranchId?: string;
  narrative?: string;
  evidenceDocumentIds?: string[];
  idempotencyKey: string;
}

export async function submitChangeAction(input: SubmitChangeInput): Promise<{ error?: string } | void> {
  const g = await providerCtxOrError();
  if ("error" in g) return { error: g.error };
  let id: string;
  try {
    const r = await ProviderMasterDataChangeService.submit(g.ctx, {
      category: input.category,
      proposed: input.proposed ?? {},
      providerBranchId: input.providerBranchId || undefined,
      narrative: input.narrative,
      evidenceDocumentIds: input.evidenceDocumentIds,
      idempotencyKey: input.idempotencyKey,
    });
    id = r.id;
  } catch (e) {
    return { error: (e as Error).message || "The change request could not be submitted." };
  }
  redirect(`/provider/profile/${id}`);
}

export async function respondChangeAction(input: { id: string; expectedVersion: number; body: string }): Promise<{ error?: string; refresh?: boolean } | void> {
  const g = await providerCtxOrError();
  if ("error" in g) return { error: g.error };
  if (!input.body?.trim()) return { error: "Enter a response." };
  try {
    await ProviderMasterDataChangeService.respondToInformation(g.ctx, input.id, input.expectedVersion, input.body);
  } catch (e) {
    return fail(e);
  }
  redirect(`/provider/profile/${input.id}`);
}

export async function withdrawChangeAction(input: { id: string; expectedVersion: number }): Promise<{ error?: string; refresh?: boolean } | void> {
  const g = await providerCtxOrError();
  if ("error" in g) return { error: g.error };
  try {
    await ProviderMasterDataChangeService.withdraw(g.ctx, input.id, input.expectedVersion);
  } catch (e) {
    return fail(e);
  }
  redirect(`/provider/profile/${input.id}`);
}
