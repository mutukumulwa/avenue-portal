"use server";

import { revalidatePath } from "next/cache";
import { ProviderAccessService, isProviderAccessError } from "@/server/services/provider-access.service";
import { ProviderIntegrationConnectionAdmin } from "@/server/services/provider-integration/connection-admin.service";
import { DeliveryRetryService } from "@/server/services/provider-integration/delivery-retry.service";

/**
 * PNOS F9.8 — integration ops actions. Connection lifecycle (pause/resume/disable)
 * reuses the F9.3 admin service; each action re-derives the provider context
 * server-side and the underlying service enforces provider.integrations.manage +
 * ownership. No domain data is edited (F9.8 stop). A delivery re-drive
 * (manualRetry) needs a re-supplied body and is invoked from the caller with that
 * body — it is exposed here as a thin wrapper for the ops UI.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

async function withConnection(fn: (ctx: Awaited<ReturnType<typeof ProviderAccessService.resolveUserContext>>["ctx"]) => Promise<void>): Promise<ActionResult> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  try {
    await fn(ctx);
    revalidatePath("/provider/integrations");
    return { ok: true };
  } catch (e) {
    if (isProviderAccessError(e)) return { ok: false, error: "You are not authorized for this action." };
    return { ok: false, error: e instanceof Error ? e.message : "Action failed." };
  }
}

export async function pauseConnectionAction(connectionId: string): Promise<ActionResult> {
  return withConnection((ctx) => ProviderIntegrationConnectionAdmin.pause(ctx, connectionId).then(() => undefined));
}

export async function resumeConnectionAction(connectionId: string): Promise<ActionResult> {
  return withConnection((ctx) => ProviderIntegrationConnectionAdmin.resume(ctx, connectionId).then(() => undefined));
}

export async function disableConnectionAction(connectionId: string): Promise<ActionResult> {
  return withConnection((ctx) => ProviderIntegrationConnectionAdmin.disable(ctx, connectionId).then(() => undefined));
}

/** Re-drive a stuck delivery with a re-supplied body (push re-POST / pull re-fetch). */
export async function manualRetryDeliveryAction(deliveryId: string, rawBody: string): Promise<ActionResult> {
  return withConnection((ctx) => DeliveryRetryService.manualRetry(ctx, deliveryId, rawBody).then(() => undefined));
}
