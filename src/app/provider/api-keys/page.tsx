import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { permissionsAllowKeyAdmin, PROVIDER_API_SCOPES, PROVIDER_API_SCOPE_LABELS } from "@/lib/provider-api-scopes";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { ApiKeysClient } from "./ApiKeysClient";

export default async function ProviderApiKeys() {
  // ELIG-GAP-009 / Phase 2: the API-key page previously ran on requireProvider()
  // alone. Minting/revoking a facility credential requires provider.api_keys.manage
  // (fail-closed after Phase 2).
  const { ctx, provider } = await ProviderAccessService.resolveUserContext();
  if (!permissionsAllowKeyAdmin(ctx.permissions)) redirect("/unauthorized");

  const [keys, branches] = await Promise.all([
    ProviderApiKeyService.list(ctx.tenantId, provider.id),
    prisma.providerBranch.findMany({
      where: { tenantId: ctx.tenantId, providerId: provider.id, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <ApiKeysClient
      providerName={provider.name}
      branches={branches}
      // ELIG-GAP-017: the creator may delegate any of the defined API scopes.
      scopeOptions={PROVIDER_API_SCOPES.map((s) => ({ value: s, label: PROVIDER_API_SCOPE_LABELS[s] }))}
      keys={keys.map((k) => ({
        id: k.id,
        label: k.label,
        keyPrefix: k.keyPrefix,
        isActive: k.isActive,
        scopeLabels: (k.scopes ?? []).map((s) => PROVIDER_API_SCOPE_LABELS[s as keyof typeof PROVIDER_API_SCOPE_LABELS] ?? s),
        branchNames: (k.allowedBranchIds ?? []).map((id) => branchNameById.get(id) ?? id),
        expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
        lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        createdAt: k.createdAt.toISOString(),
        revokedAt: k.revokedAt ? k.revokedAt.toISOString() : null,
        revokeReason: k.revokeReason ?? null,
      }))}
    />
  );
}
