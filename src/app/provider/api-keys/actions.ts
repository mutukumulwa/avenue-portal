"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ProviderAccessService } from "@/server/services/provider-access.service";
import { ProviderApiKeyService } from "@/server/services/provider-api-key.service";
import { permissionsAllowKeyAdmin, isKnownProviderApiScope } from "@/lib/provider-api-scopes";
import { writeAudit } from "@/lib/audit";

export async function generateApiKeyAction(
  _prev: { plaintext?: string; label?: string; error?: string } | null,
  formData: FormData,
): Promise<{ plaintext?: string; label?: string; error?: string }> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!permissionsAllowKeyAdmin(ctx.permissions)) return { error: "You do not have permission to manage API keys." };

  const label = ((formData.get("label") as string) || "").trim() || "HMS integration";
  const scopes = formData.getAll("scopes").map(String).filter(Boolean);
  const allowedBranchIds = formData.getAll("allowedBranchIds").map(String).filter(Boolean);
  const expiresAtRaw = ((formData.get("expiresAt") as string) || "").trim();

  // ELIG-GAP-017/009: a facility credential must be SCOPED, BRANCHED and EXPIRING.
  // No more label-only keys that mint unscoped, unbranched, non-expiring full access.
  if (scopes.length === 0) return { error: "Select at least one scope for this key." };
  const unknown = scopes.filter((s) => !isKnownProviderApiScope(s));
  if (unknown.length) return { error: `Unknown scope: ${unknown.join(", ")}` };
  if (allowedBranchIds.length === 0) return { error: "Assign at least one branch to this key." };
  if (!expiresAtRaw) return { error: "Set an expiry date for this key." };
  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) return { error: "Enter a valid future expiry date." };

  // Branches must belong to this facility within the tenant (defence in depth).
  const branchCount = await prisma.providerBranch.count({
    where: { id: { in: allowedBranchIds }, providerId: ctx.providerId, tenantId: ctx.tenantId },
  });
  if (branchCount !== allowedBranchIds.length) return { error: "One or more selected branches are not part of this facility." };

  try {
    const key = await ProviderApiKeyService.generate(ctx.tenantId, ctx.providerId, label, ctx.actorId, { scopes, allowedBranchIds, expiresAt });
    await writeAudit({
      userId: ctx.actorId,
      action: "PROVIDER_API_KEY_CREATED",
      module: "PROVIDERS",
      description: `Provider API key "${label}" generated`,
      metadata: { providerId: ctx.providerId, keyId: key.id, keyPrefix: key.keyPrefix, scopes: scopes.join(","), branchCount: allowedBranchIds.length, expiresAt: expiresAt.toISOString() },
    });
    revalidatePath("/provider/api-keys");
    return { plaintext: key.plaintext, label };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function revokeApiKeyAction(
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const { ctx } = await ProviderAccessService.resolveUserContext();
  if (!permissionsAllowKeyAdmin(ctx.permissions)) return { error: "You do not have permission to manage API keys." };

  const id = ((formData.get("id") as string) || "").trim();
  const reason = ((formData.get("reason") as string) || "").trim();
  // ELIG-GAP-018: revocation is an irreversible outage for the integration — it
  // requires a confirmed reason (recorded on the key + in the audit trail).
  if (!id) return { error: "Missing key." };
  if (!reason) return { error: "A revocation reason is required." };

  try {
    await ProviderApiKeyService.revoke(ctx.tenantId, ctx.providerId, id, { revokedById: ctx.actorId, reason });
    await writeAudit({
      userId: ctx.actorId,
      action: "PROVIDER_API_KEY_REVOKED",
      module: "PROVIDERS",
      description: `Provider API key revoked`,
      metadata: { providerId: ctx.providerId, keyId: id, reason },
    });
    revalidatePath("/provider/api-keys");
    return { ok: true };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
