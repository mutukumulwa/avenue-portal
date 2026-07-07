import { requireProvider } from "@/lib/provider-portal";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { ApiKeysClient } from "./ApiKeysClient";

export default async function ProviderApiKeys() {
  const { provider, tenantId } = await requireProvider();
  const keys = await ProviderApiKeyService.list(tenantId, provider.id);

  return (
    <ApiKeysClient
      providerName={provider.name}
      keys={keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyPrefix: k.keyPrefix,
        isActive: k.isActive,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        createdAt: k.createdAt.toISOString(),
      }))}
    />
  );
}
