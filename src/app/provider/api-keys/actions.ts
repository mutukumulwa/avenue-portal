"use server";

import { revalidatePath } from "next/cache";
import { requireProvider } from "@/lib/provider-portal";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { writeAudit } from "@/lib/audit";

export async function generateApiKeyAction(
  _prev: { plaintext?: string; label?: string; error?: string } | null,
  formData: FormData,
): Promise<{ plaintext?: string; label?: string; error?: string }> {
  const { session, providerId, tenantId } = await requireProvider();
  const label = ((formData.get("label") as string) || "").trim() || "HMS integration";

  try {
    const key = await ProviderApiKeyService.generate(tenantId, providerId, label, session.user.id);
    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_API_KEY_CREATED",
      module: "PROVIDERS",
      description: `Provider API key "${label}" generated`,
      metadata: { providerId, keyId: key.id, keyPrefix: key.keyPrefix },
    });
    revalidatePath("/provider/api-keys");
    return { plaintext: key.plaintext, label };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const { session, providerId, tenantId } = await requireProvider();
  const id = formData.get("id") as string;
  try {
    await ProviderApiKeyService.revoke(tenantId, providerId, id);
    await writeAudit({
      userId: session.user.id,
      action: "PROVIDER_API_KEY_REVOKED",
      module: "PROVIDERS",
      description: `Provider API key revoked`,
      metadata: { providerId, keyId: id },
    });
  } catch {
    // ignore — revalidate below reflects current state
  }
  revalidatePath("/provider/api-keys");
}
