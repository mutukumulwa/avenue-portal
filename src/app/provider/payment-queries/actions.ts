"use server";

import { redirect } from "next/navigation";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderAccessSettingsService } from "@/server/services/provider-access-settings.service";
import { providerPermits } from "@/components/layouts/provider-nav-model";
import { ProviderPaymentQueryService, isPaymentQueryError, PAYMENT_QUERY_PERMISSION } from "@/server/services/provider-payment-query/service";
import type { PaymentQueryCategory } from "@prisma/client";

/**
 * F6.11 — provider payment-query server actions. Thin adapters over the F6.10
 * ProviderPaymentQueryService (which scopes + audits + never touches a claim, D17).
 * Gated behind providerRemittanceV2 (like the remittance surface) + the
 * provider.payment_query.manage permission.
 */

async function providerCtxOrError() {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!(await ProviderAccessSettingsService.isRemittanceV2Enabled(ctx.tenantId, ctx.providerId))) return { error: "This feature is not available." as const };
  if (!providerPermits(ctx.permissions, PAYMENT_QUERY_PERMISSION)) return { error: "You do not have permission to manage payment queries." as const };
  return { ctx };
}

export interface RaisePaymentQueryInput {
  settlementBatchId: string;
  claimId?: string;
  disbursementId?: string;
  category: PaymentQueryCategory;
  discrepancyAmount?: number;
  discrepancyCurrency?: string;
  narrative: string;
  idempotencyKey: string;
}

export async function raisePaymentQueryAction(input: RaisePaymentQueryInput): Promise<{ error?: string } | void> {
  const g = await providerCtxOrError();
  if ("error" in g) return { error: g.error };
  if (!input.narrative?.trim()) return { error: "Describe the discrepancy." };
  if (!input.category) return { error: "Choose a category." };

  let id: string;
  try {
    const r = await ProviderPaymentQueryService.raise(g.ctx, {
      settlementBatchId: input.settlementBatchId,
      claimId: input.claimId || undefined,
      disbursementId: input.disbursementId || undefined,
      category: input.category,
      discrepancyAmount: input.discrepancyAmount,
      discrepancyCurrency: input.discrepancyCurrency,
      narrative: input.narrative,
      idempotencyKey: input.idempotencyKey,
    });
    id = r.id;
  } catch (e) {
    return { error: (e as Error).message || "The payment query could not be raised." };
  }
  redirect(`/provider/payment-queries/${id}`);
}

export async function respondPaymentQueryAction(input: { id: string; expectedVersion: number; body: string }): Promise<{ error?: string; refresh?: boolean } | void> {
  const g = await providerCtxOrError();
  if ("error" in g) return { error: g.error };
  if (!input.body?.trim()) return { error: "Enter a response." };
  try {
    await ProviderPaymentQueryService.respondToInformation(g.ctx, input.id, input.expectedVersion, input.body);
  } catch (e) {
    const stale = isPaymentQueryError(e) && ["STALE", "INVALID_STATE", "NOT_FOUND"].includes(e.code);
    return { error: (e as Error).message, refresh: stale || undefined };
  }
  redirect(`/provider/payment-queries/${input.id}`);
}

export async function withdrawPaymentQueryAction(input: { id: string; expectedVersion: number }): Promise<{ error?: string; refresh?: boolean } | void> {
  const g = await providerCtxOrError();
  if ("error" in g) return { error: g.error };
  try {
    await ProviderPaymentQueryService.withdraw(g.ctx, input.id, input.expectedVersion);
  } catch (e) {
    const stale = isPaymentQueryError(e) && ["STALE", "INVALID_STATE", "NOT_FOUND"].includes(e.code);
    return { error: (e as Error).message, refresh: stale || undefined };
  }
  redirect(`/provider/payment-queries/${input.id}`);
}
