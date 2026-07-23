"use server";

import { revalidatePath } from "next/cache";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { permissionsAllowKeyAdmin } from "@/lib/provider-api-scopes";
import { writeAudit } from "@/lib/audit";

export async function generateApiKeyAction(
  _prev: { plaintext?: string; label?: string; error?: string } | null,
  formData: FormData,
): Promise<{ plaintext?: string; label?: string; error?: string }> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!permissionsAllowKeyAdmin(ctx.permissions)) return { error: "You do not have permission to manage API keys." };
  const label = ((formData.get("label") as string) || "").trim() || "HMS integration";

  try {
    const key = await ProviderApiKeyService.generate(ctx.tenantId, ctx.providerId, label, ctx.actorId);
    await writeAudit({
      userId: ctx.actorId,
      action: "PROVIDER_API_KEY_CREATED",
      module: "PROVIDERS",
      description: `Provider API key "${label}" generated`,
      metadata: { providerId: ctx.providerId, keyId: key.id, keyPrefix: key.keyPrefix },
    });
    revalidatePath("/provider/api-keys");
    return { plaintext: key.plaintext, label };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!permissionsAllowKeyAdmin(ctx.permissions)) return;
  const id = formData.get("id") as string;
  const reason = ((formData.get("reason") as string) || "").trim() || undefined;
  try {
    await ProviderApiKeyService.revoke(ctx.tenantId, ctx.providerId, id, { revokedById: ctx.actorId, reason });
    await writeAudit({
      userId: ctx.actorId,
      action: "PROVIDER_API_KEY_REVOKED",
      module: "PROVIDERS",
      description: `Provider API key revoked`,
      metadata: { providerId: ctx.providerId, keyId: id },
    });
  } catch {
    // ignore — revalidate below reflects current state
  }
  revalidatePath("/provider/api-keys");
}
